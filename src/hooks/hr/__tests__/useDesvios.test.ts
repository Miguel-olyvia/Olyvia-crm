/**
 * A preparacao do fecho da folha (`prepararFechoComDesvios`): so deteta se ha margem, a base decide quando falta permissao, e
 * nunca deixa fechar com um calculo mais antigo do que os desvios. RPCs simuladas; nada toca em base nenhuma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  lerMargem: vi.fn(),
  detetarDesvios: vi.fn(),
  listarDesvios: vi.fn(),
  lerAssinaturasDeDesvios: vi.fn(),
}));

vi.mock("@/lib/hr/desviosRpc", async (importOriginal) => ({ ...(await importOriginal<object>()), ...rpc }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));

import { prepararFechoComDesvios } from "@/hooks/hr/useDesvios";

const ARGS = { organizationId: "org-1", periodoId: "per-1", de: "2026-10-01", ate: "2026-10-31" };
const margem = (valor: number | null = 10) => ({
  emVigor: null,
  versoes: [{ id: "v", margem_min: valor, valido_de: "2026-01-01", valido_ate: null, substituida_em: null }],
});
const linha = (pessoa: string, extra: Record<string, unknown> = {}) => ({
  id: `d-${pessoa}`, pessoa_id: pessoa, data: "2026-10-05", estado: "a_validar", decisao: null, ...extra,
});
const SEM_PERMISSAO = { code: "42501", message: "desvios_sem_permissao: detetar desvios exige hr.assiduidade.gerir" };

beforeEach(() => {
  for (const f of Object.values(rpc)) f.mockReset();
  rpc.lerMargem.mockResolvedValue(margem());
  rpc.detetarDesvios.mockResolvedValue({ diasVistos: 20, comDesvio: 0, substituidos: 0, criados: 0 });
  rpc.listarDesvios.mockResolvedValue([]);
  rpc.lerAssinaturasDeDesvios.mockResolvedValue(new Map([["p1", "abc"]]));
});

describe("prepararFechoComDesvios", () => {
  it("SEM margem ligada no periodo nao deteta nem le assinaturas (quem fecha so com periodo.gerir nao e bloqueado)", async () => {
    rpc.lerMargem.mockResolvedValue({ emVigor: null, versoes: [] });
    const r = await prepararFechoComDesvios(ARGS);
    expect(r).toEqual({ ok: true, assinaturas: new Map() });
    expect(rpc.detetarDesvios).not.toHaveBeenCalled();
    expect(rpc.lerAssinaturasDeDesvios).not.toHaveBeenCalled();
    rpc.lerMargem.mockResolvedValue(margem(null));
    await prepararFechoComDesvios(ARGS);
    expect(rpc.detetarDesvios).not.toHaveBeenCalled();
  });

  it("com margem deteta o periodo, compara os desvios e devolve as assinaturas", async () => {
    const r = await prepararFechoComDesvios({ ...ARGS, calculadas: new Map([["p1", ""]]) });
    expect(rpc.detetarDesvios).toHaveBeenCalledWith("org-1", "2026-10-01", "2026-10-31");
    expect(r).toEqual({ ok: true, assinaturas: new Map([["p1", "abc"]]) });
  });

  it("a deteccao recusada por permissao (42501): a base decide e o fecho segue", async () => {
    rpc.detetarDesvios.mockRejectedValue(SEM_PERMISSAO);
    const r = await prepararFechoComDesvios(ARGS);
    expect(r.ok).toBe(true);
  });

  it("a margem por ler por permissao: nao se sabe se ha margem, a base decide (nao deteta)", async () => {
    rpc.lerMargem.mockRejectedValue({ code: "42501", message: "desvios_config_sem_permissao" });
    const r = await prepararFechoComDesvios(ARGS);
    expect(r.ok).toBe(true);
    expect(rpc.detetarDesvios).not.toHaveBeenCalled();
  });

  it("a deteccao que mudou dias: nao fecha, diz quantos", async () => {
    rpc.detetarDesvios.mockResolvedValue({ diasVistos: 20, comDesvio: 3, substituidos: 1, criados: 2 });
    expect(await prepararFechoComDesvios(ARGS)).toEqual({ ok: false, motivo: "mudaram", mudou: 3 });
  });

  it("uma decisao tomada DEPOIS de o ecra calcular (chave diferente da usada no calculo) impede o fecho", async () => {
    rpc.listarDesvios.mockResolvedValue([linha("p1", { estado: "validado", decisao: "normal" })]);
    // O calculo usou a versao ainda a_validar.
    const usada = "2026-10-05|d-p1|a_validar|";
    expect(await prepararFechoComDesvios({ ...ARGS, calculadas: new Map([["p1", usada]]) })).toEqual({ ok: false, motivo: "mudaram", mudou: 1 });
    expect(rpc.lerAssinaturasDeDesvios).not.toHaveBeenCalled();
  });

  it("uma pessoa que passou a ter desvios (calculo sem eles) tambem conta", async () => {
    rpc.listarDesvios.mockResolvedValue([linha("p2")]);
    expect(await prepararFechoComDesvios({ ...ARGS, calculadas: new Map([["p1", ""], ["p2", ""]]) })).toEqual({ ok: false, motivo: "mudaram", mudou: 1 });
  });

  it("chaves iguais as da base: segue; so se comparam as pessoas do calculo", async () => {
    rpc.listarDesvios.mockResolvedValue([linha("p1"), linha("arquivada")]);
    const r = await prepararFechoComDesvios({ ...ARGS, calculadas: new Map([["p1", "2026-10-05|d-p1|a_validar|"]]) });
    expect(r.ok).toBe(true);
  });

  it("um erro que nao e permissao ao detetar ou ao ler assinaturas impede o fecho, com texto", async () => {
    rpc.detetarDesvios.mockRejectedValue({ message: "desvios_detecao_em_curso: ja ha uma", code: "55P03" });
    const a = await prepararFechoComDesvios(ARGS);
    expect(a).toMatchObject({ ok: false, motivo: "erro" });
    rpc.detetarDesvios.mockResolvedValue({ diasVistos: 0, comDesvio: 0, substituidos: 0, criados: 0 });
    rpc.lerAssinaturasDeDesvios.mockRejectedValue({ message: "falha de rede", code: "XX000" });
    expect(await prepararFechoComDesvios(ARGS)).toMatchObject({ ok: false, motivo: "erro" });
  });

  it("base sem as RPCs (a funcao em falta e a chamada): segue sem desvios; outra funcao em falta e um erro", async () => {
    rpc.lerMargem.mockRejectedValue({ code: "PGRST202", message: "Could not find the function public.rpc_hr_desvios_config_ler" });
    expect(await prepararFechoComDesvios(ARGS)).toEqual({ ok: true, assinaturas: new Map() });
    rpc.lerMargem.mockRejectedValue({ code: "PGRST202", message: "Could not find the function public.outra" });
    expect(await prepararFechoComDesvios(ARGS)).toMatchObject({ ok: false, motivo: "erro" });
  });
});
