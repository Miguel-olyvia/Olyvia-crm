// 17/11 (A-Z na Mudelar: «Sem par no Catálogo» para tudo o que se escolheu no Estúdio): os produtos do Estúdio que o Catálogo leve não tem leem-se do servidor.
import { afterEach, describe, expect, it, vi } from "vitest";

const escolher = vi.fn(async (_org: string, id: string) => {
  const { mudarCatalogo } = await import("../v2/catalogoStore");
  if (id.endsWith("ff")) return { ok: false as const, erro: "não existe" };
  mudarCatalogo((k) => { k.produtos.push({ id, n: "lido " + id, custo: 1, un: "un", marca: "", fornecedor: "", data: "", no: null }); });
  return { ok: true as const, v: { id } };
});
vi.mock("./pesquisaProdutos", () => ({ escolherProdutoDoServidor: (org: string, id: string) => escolher(org, id) }));

import { garantirProdutos, produtosEmFalta } from "./garantirProdutos";
import { lerCatalogo, mudarCatalogo } from "../v2/catalogoStore";

const A = "0b1c2d3e-0000-4000-8000-000000000001", B = "0b1c2d3e-0000-4000-8000-000000000002", MAU = "0b1c2d3e-0000-4000-8000-0000000000ff";
afterEach(() => { escolher.mockClear(); mudarCatalogo((k) => { k.produtos = k.produtos.filter((p) => ![A, B].includes(p.id)); }); });

describe("garantir os produtos do Estúdio no Catálogo", () => {
  it("só os ids do Catálogo verdadeiro que faltam; os de teste e os repetidos não", () => {
    expect(produtosEmFalta([A, A, "san-nexo-c", undefined, B])).toEqual([A, B]);
  });
  it("lê os que faltam (uma vez cada) e devolve os que não se leram", async () => {
    const falhou = await garantirProdutos([A, B, MAU, A], "org");
    expect(escolher).toHaveBeenCalledTimes(3);
    expect(falhou).toEqual([MAU]);
    expect(lerCatalogo().produtos.some((p) => p.id === A)).toBe(true);
    // já lá estão: não volta à base
    escolher.mockClear();
    expect(await garantirProdutos([A, B], "org")).toEqual([]);
    expect(escolher).not.toHaveBeenCalled();
  });
  it("sem organização lida, não vai à base", async () => {
    expect(await garantirProdutos([A], null)).toEqual([A]);
    expect(escolher).not.toHaveBeenCalled();
  });
});
