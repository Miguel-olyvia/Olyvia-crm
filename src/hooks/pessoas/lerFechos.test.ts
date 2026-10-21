// O tipo de fecho de cada negócio da ficha, lido da tabela `negocios` (a RLS decide o que se vê) enquanto `neg_ficha_pessoa` não o traz: preso aos
// ids da ficha e à organização, tolerante (uma leitura que falha deixa a ficha como estava e fica observável), e sem ler nada quando não há negócios
// ou quando a ficha já traz o tipo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fichaDb, negocioDb } from "./fichaFabrica";

const { captureMock, resposta, cadeia, deTabela } = vi.hoisted(() => {
  const resposta = vi.fn();
  const cadeia: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq"]) cadeia[m] = vi.fn(() => cadeia);
  cadeia.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve().then(() => resposta()).then(ok, ko);
  return { captureMock: vi.fn(), resposta, cadeia, deTabela: vi.fn(() => cadeia) };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: deTabela } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: captureMock }));

import { comFechos, lerFechos } from "./lerFechos";

beforeEach(() => {
  resposta.mockReset();
  captureMock.mockReset();
  deTabela.mockClear();
  for (const m of ["select", "in", "eq"]) (cadeia[m] as ReturnType<typeof vi.fn>).mockClear();
});

describe("lerFechos", () => {
  it("lê id e fecho da tabela negocios, preso aos ids pedidos e à organização", async () => {
    resposta.mockReturnValue({ data: [{ id: "n1", fecho: "proposta" }, { id: "n2", fecho: "contrato" }], error: null });
    const mapa = await lerFechos("org-1", ["n1", "n2"]);
    expect(deTabela).toHaveBeenCalledWith("negocios");
    expect(cadeia.select).toHaveBeenCalledWith("id, fecho");
    expect(cadeia.in).toHaveBeenCalledWith("id", ["n1", "n2"]);
    expect(cadeia.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(mapa).toEqual(new Map([["n1", "proposta"], ["n2", "contrato"]]));
  });

  it("ignora linhas malformadas e valores de fecho desconhecidos", async () => {
    resposta.mockReturnValue({ data: [{ id: "n1", fecho: "xpto" }, { id: 7, fecho: "proposta" }, null, { id: "n3", fecho: "proposta" }], error: null });
    expect(await lerFechos("org-1", ["n1", "n3"])).toEqual(new Map([["n3", "proposta"]]));
  });

  it("sem ids não lê nada", async () => {
    expect(await lerFechos("org-1", [])).toBeNull();
    expect(deTabela).not.toHaveBeenCalled();
  });

  it("um erro da base devolve nulo e vai para a observabilidade", async () => {
    resposta.mockReturnValue({ data: null, error: { code: "42501", message: "x" } });
    expect(await lerFechos("org-1", ["n1"])).toBeNull();
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("uma leitura que lança devolve nulo e vai para a observabilidade", async () => {
    resposta.mockImplementation(() => { throw new Error("rede"); });
    expect(await lerFechos("org-1", ["n1"])).toBeNull();
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("dados que não são uma lista dão um mapa vazio", async () => {
    resposta.mockReturnValue({ data: null, error: null });
    expect(await lerFechos("org-1", ["n1"])).toEqual(new Map());
  });
});

describe("comFechos", () => {
  it("junta o tipo a cada negócio da ficha, sem mutar a original", async () => {
    resposta.mockReturnValue({ data: [{ id: "n1", fecho: "proposta" }], error: null });
    const original = fichaDb({ negocios: { total: 2, itens: [negocioDb({ id: "n1" }), negocioDb({ id: "n2" })] } });
    const nova = await comFechos(original, "org-1");
    expect(nova.negocios?.itens.map((n) => n.fecho)).toEqual(["proposta", undefined]);
    expect(original.negocios?.itens[0].fecho).toBeUndefined();
  });

  it("se a leitura falha devolve a mesma ficha", async () => {
    resposta.mockReturnValue({ data: null, error: { code: "x", message: "x" } });
    const original = fichaDb({ negocios: { total: 1, itens: [negocioDb({ id: "n1" })] } });
    expect(await comFechos(original, "org-1")).toBe(original);
  });

  it("sem negócios, ou com negócios que já trazem o tipo, não lê nada", async () => {
    const vazia = fichaDb();
    expect(await comFechos(vazia, "org-1")).toBe(vazia);
    const completa = fichaDb({ negocios: { total: 1, itens: [negocioDb({ id: "n1", fecho: "contrato" })] } });
    expect(await comFechos(completa, "org-1")).toBe(completa);
    expect(deTabela).not.toHaveBeenCalled();
  });

  it("só pede os ids que ainda não trazem o tipo", async () => {
    resposta.mockReturnValue({ data: [{ id: "n2", fecho: "proposta" }], error: null });
    const ficha = fichaDb({ negocios: { total: 2, itens: [negocioDb({ id: "n1", fecho: "contrato" }), negocioDb({ id: "n2" })] } });
    const nova = await comFechos(ficha, "org-1");
    expect(cadeia.in).toHaveBeenCalledWith("id", ["n2"]);
    expect(nova.negocios?.itens.map((n) => n.fecho)).toEqual(["contrato", "proposta"]);
  });
});
