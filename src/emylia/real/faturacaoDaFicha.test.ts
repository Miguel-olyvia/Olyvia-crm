import { describe, expect, it, vi } from "vitest";
import { aplicarFaturacao, lerFaturacaoDaFicha, precisaDaFicha } from "./faturacaoDaFicha";
import type { Negocio } from "../motor";

const neg = (f: Record<string, string>, extra: Partial<Negocio> = {}): Negocio =>
  ({ id: 1, nome: "Cozinha da Joana", fase: 4, f, fin: { fatura: null, pago: false, recibo: null }, ...extra }) as unknown as Negocio;

describe("os dados de faturação da ficha do cliente (3/11)", () => {
  it("o nome da ficha troca a sugestão automática (o título do negócio) e o NIF entra se faltar", () => {
    const d = neg({ nome_fiscal: "Cozinha da Joana" });
    expect(precisaDaFicha(d)).toBe(true);
    expect(aplicarFaturacao(d, { nome: "Joana Ribeiro", nif: "123456789" })).toBe(true);
    expect(d.f).toMatchObject({ nome_fiscal: "Joana Ribeiro", nif_fat: "123456789" });
    expect(precisaDaFicha(d)).toBe(false);
  });
  it("o que alguém escreveu não se troca", () => {
    const d = neg({ nome_fiscal: "Ribeiro, Lda.", nif_fat: "509999999" });
    expect(precisaDaFicha(d)).toBe(false);
    expect(aplicarFaturacao(d, { nome: "Joana Ribeiro", nif: "123456789" })).toBe(false);
    expect(d.f).toMatchObject({ nome_fiscal: "Ribeiro, Lda.", nif_fat: "509999999" });
  });
  it("fora do Financeiro, ou já pago, não se pede", () => {
    expect(precisaDaFicha(neg({}, { fase: 3 }))).toBe(false);
    expect(precisaDaFicha(neg({}, { fin: { fatura: null, pago: true, recibo: null } } as Partial<Negocio>))).toBe(false);
  });
  it("lê pela Edge Function nif-faturacao; com erro (sem permissão, por publicar) devolve null", async () => {
    const invoke = vi.fn(async () => ({ data: { nome: "Joana Ribeiro", nif: "123456789" }, error: null }));
    const sb = { functions: { invoke } } as never;
    expect(await lerFaturacaoDaFicha(sb, "org", "neg")).toEqual({ nome: "Joana Ribeiro", nif: "123456789" });
    expect(invoke).toHaveBeenCalledWith("nif-faturacao", { body: { organizacao_id: "org", negocio_id: "neg" } });
    const falha = { functions: { invoke: vi.fn(async () => ({ data: null, error: new Error("403") })) } } as never;
    expect(await lerFaturacaoDaFicha(falha, "org", "neg")).toBeNull();
  });
});
