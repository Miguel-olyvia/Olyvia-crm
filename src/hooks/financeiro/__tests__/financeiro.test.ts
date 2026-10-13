/**
 * Financeiro: regras puras e o caminho de registar (PDF → quarentena →
 * validate-upload → RPC). As regras da base estão provadas em
 * operacao-app/tools/validar-financeiro.mjs (PGlite).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const chamadas: string[] = [];
const upload = vi.fn(async (caminho: string) => {
  chamadas.push(`upload:${caminho}`);
  return { error: null };
});
const remove = vi.fn(async (caminhos: string[]) => {
  chamadas.push(`remove:${caminhos[0]}`);
  return { error: null };
});
const invoke = vi.fn(async () => {
  chamadas.push("validate-upload");
  return { data: { ok: true }, error: null };
});
const rpc = vi.fn(async (nome: string, _args?: unknown) => {
  chamadas.push(`rpc:${nome}`);
  return { data: null, error: null as null | { message: string } };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => rpc(nome, args as never),
    storage: { from: (bucket: string) => ({ upload: (c: string) => upload(`${bucket}:${c}`), remove: (c: string[]) => remove(c.map((x) => `${bucket}:${x}`)) }) },
    functions: { invoke: (...a: unknown[]) => invoke(...(a as [])) },
  },
}));

import {
  avisoDeValor,
  caminhoDoPdf,
  hojeIso,
  lerValor,
  normalizarFila,
  problemaNaFatura,
  problemaNoPdf,
  registarFatura,
  valorParaInput,
  type DadosFatura,
} from "../financeiro";

const ORG = "11111111-1111-1111-1111-111111111111";
const CTR = "88880000-0000-0000-0000-000000000001";
const ok: DadosFatura = { numero: "FT 2026/1", data: "2026-10-13", valor: "5000,00", origem: "PHC", atcud: "" };
const pdf = (nome = "fatura.pdf", tipo = "application/pdf", tamanho = 10) =>
  new File([new Uint8Array(tamanho)], nome, { type: tipo });

beforeEach(() => {
  chamadas.length = 0;
  vi.clearAllMocks();
});

describe("regras puras", () => {
  it("lerValor aceita vírgula decimal e pontos de milhares", () => {
    expect(lerValor("5000,01")).toBe(5000.01);
    expect(lerValor("1.234,5")).toBe(1234.5);
    expect(lerValor("1234.50")).toBe(1234.5);
    expect(lerValor(" 7 ")).toBe(7);
    expect(lerValor("")).toBeNaN();
    expect(lerValor("abc")).toBeNaN();
  });

  it("valorParaInput escreve com vírgula e 2 casas", () => {
    expect(valorParaInput(5000.01)).toBe("5000,01");
    expect(valorParaInput(2500)).toBe("2500,00");
    expect(valorParaInput(null)).toBe("");
  });

  it("hojeIso devolve a data local em YYYY-MM-DD", () => {
    expect(hojeIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("problemaNaFatura: número, data (não no futuro), valor > 0 e programa", () => {
    expect(problemaNaFatura(ok, "2026-10-13")).toBeNull();
    expect(problemaNaFatura({ ...ok, numero: "  " }, "2026-10-13")).toMatch(/número/);
    expect(problemaNaFatura({ ...ok, data: "" }, "2026-10-13")).toMatch(/data/);
    expect(problemaNaFatura({ ...ok, data: "2026-10-14" }, "2026-10-13")).toMatch(/futuro/);
    expect(problemaNaFatura({ ...ok, valor: "0" }, "2026-10-13")).toMatch(/maior do que zero/);
    expect(problemaNaFatura({ ...ok, origem: "" }, "2026-10-13")).toMatch(/programa/);
  });

  it("problemaNoPdf: só PDF e até 20 MB", () => {
    expect(problemaNoPdf(null)).toBeNull();
    expect(problemaNoPdf(pdf())).toBeNull();
    expect(problemaNoPdf(pdf("f.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toMatch(/PDF/);
    expect(problemaNoPdf(pdf("f.pdf", "application/pdf", 21 * 1024 * 1024))).toMatch(/20 MB/);
  });

  it("avisoDeValor só avisa quando não bate com a tranche", () => {
    expect(avisoDeValor("5000,01", 5000.01)).toBeNull();
    expect(avisoDeValor("5100", 5000)).toMatch(/Acima/);
    expect(avisoDeValor("4900", 5000)).toMatch(/Abaixo/);
    expect(avisoDeValor("", 5000)).toBeNull();
  });

  it("caminhoDoPdf fica na pasta client_invoice da organização (a RPC recusa outra)", () => {
    expect(caminhoDoPdf(ORG, CTR, "x.pdf")).toBe(`${ORG}/client_invoice/${CTR}/x.pdf`);
  });

  it("normalizarFila passa os numeric da base a número", () => {
    const f = normalizarFila({
      por_faturar: [{ valor_sugerido: "5000.01", percentagem: "50", tranche_ordem: 2, n_tranches: "2", contrato_valor: "10000.01" }],
      por_validar: [{ valor: "123.4" }],
      faturar_desde: "2026-09-13",
    });
    expect(f.por_faturar[0].valor_sugerido).toBe(5000.01);
    expect(f.por_faturar[0].n_tranches).toBe(2);
    expect(f.por_validar[0].valor).toBe(123.4);
    expect(normalizarFila(null)).toEqual({ por_faturar: [], por_validar: [], faturar_desde: null });
  });
});

describe("registarFatura", () => {
  const tranche = { contract_id: CTR, tranche_ordem: 1 };

  it("sem PDF: só a RPC, com o valor lido e o ATCUD vazio a null", async () => {
    await registarFatura({ orgId: ORG, tranche, dados: { ...ok, data: hojeIso() }, pdf: null });
    expect(chamadas).toEqual(["rpc:rpc_fin_registar_fatura"]);
    expect(rpc).toHaveBeenCalledWith("rpc_fin_registar_fatura", expect.objectContaining({
      p_contract_id: CTR,
      p_tranche_ordem: 1,
      p_numero: "FT 2026/1",
      p_valor: 5000,
      p_origem: "PHC",
      p_atcud: null,
      p_pdf_path: null,
    }));
  });

  it("com PDF: quarentena → validate-upload → RPC com o caminho final", async () => {
    await registarFatura({ orgId: ORG, tranche, dados: { ...ok, data: hojeIso() }, pdf: pdf() });
    expect(chamadas[0]).toMatch(new RegExp(`^upload:documents-quarantine:${ORG}/client_invoice/${CTR}/[0-9a-f-]+\\.pdf$`));
    expect(chamadas.slice(1)).toEqual(["validate-upload", "rpc:rpc_fin_registar_fatura"]);
    const args = rpc.mock.calls[0][1] as unknown as { p_pdf_path: string };
    expect(args.p_pdf_path).toMatch(new RegExp(`^${ORG}/client_invoice/${CTR}/`));
  });

  it("se a RPC recusar, o PDF é apagado do bucket e o erro sobe", async () => {
    rpc.mockImplementationOnce(async (nome: string, _args?: unknown) => {
      chamadas.push(`rpc:${nome}`);
      return { data: null, error: { message: "A fatura FT 2026/1 já está registada" } };
    });
    await expect(registarFatura({ orgId: ORG, tranche, dados: { ...ok, data: hojeIso() }, pdf: pdf() }))
      .rejects.toMatchObject({ message: "A fatura FT 2026/1 já está registada" });
    expect(chamadas[chamadas.length - 1]).toMatch(/^remove:documents:/);
  });

  it("se o validate-upload recusar, não chama a RPC", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false, error: "Tipo de ficheiro inválido" }, error: null } as never);
    await expect(registarFatura({ orgId: ORG, tranche, dados: { ...ok, data: hojeIso() }, pdf: pdf() }))
      .rejects.toThrow(/PDF foi recusado: Tipo de ficheiro inválido/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("dados inválidos não chegam à base", async () => {
    await expect(registarFatura({ orgId: ORG, tranche, dados: { ...ok, numero: "" }, pdf: null })).rejects.toThrow(/número/);
    expect(chamadas).toEqual([]);
  });
});
