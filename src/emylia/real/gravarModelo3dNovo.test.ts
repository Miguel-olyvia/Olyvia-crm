// Ao CRIAR um produto com «Modelo 3D» escolhido, o plano de gravação acrescenta cat_definir_modelo_3d('produto', <id do produto novo>, modelo) depois de o produto
// existir (o id vem do `tmp`), e é tolerante: se a função ainda não existir na base, o produto fica criado e avisa-se. Sem escolha, o plano é o de hoje.
import { describe, expect, it } from "vitest";
import { catalogo0, type Catalogo } from "../v2/catalogoModelo";
import { custos0 } from "../v2/custosModelo";
import { criarProdutoCompleto } from "../criarCatalogo";
import { diferencasProdutoNovo } from "./gravarCatalogo";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const MARGENS = { min: 28, alvo: 35 };
const leve = (): Catalogo => ({ ...catalogo0(), produtos: [] });
const comProduto = (K: Catalogo, o: Partial<Parameters<typeof criarProdutoCompleto>[1]> = {}) => {
  const r = criarProdutoCompleto(K, { n: "Peça misteriosa X1", custo: 120, un: "un", ...o });
  if (!r.ok) throw new Error(r.erro);
  return { K: r.K, id: r.id };
};

describe("criar produto com modelo 3D", () => {
  it("criarProdutoCompleto leva o modelo3d para o produto novo", () => {
    const { K, id } = comProduto(leve(), { modelo3d: "sanita" });
    expect(K.produtos.find((p) => p.id === id)?.modelo3d).toBe("sanita");
  });
  it("o plano tem o passo cat_definir_modelo_3d, depois de guardar o produto, tolerante, com o id temporário do produto", () => {
    const antes = leve(), { K, id } = comProduto(antes, { modelo3d: "sanita" });
    const out = diferencasProdutoNovo(ORG, antes, K, custos0(), MARGENS);
    const i = out.findIndex((c) => c.rpc === "cat_definir_modelo_3d");
    expect(i).toBeGreaterThan(out.findIndex((c) => c.rpc === "cat_guardar_produto"));
    expect(out[i]).toMatchObject({ tolerante: true, args: { p_org: ORG, p_alvo: "produto", p_id: { tmp: "prod:" + id }, p_modelo: "sanita" } });
    expect(out[i].aviso).toMatch(/modelo 3D/);
  });
  it("sem modelo escolhido, o plano não tem o passo (é o de hoje)", () => {
    const antes = leve(), { K } = comProduto(antes);
    const out = diferencasProdutoNovo(ORG, antes, K, custos0(), MARGENS);
    expect(out.some((c) => c.rpc === "cat_definir_modelo_3d")).toBe(false);
  });
  it("um modelo fora do formato nunca vai à base", () => {
    const antes = leve(), { K } = comProduto(antes, { modelo3d: "Sanita Bonita" });
    expect(diferencasProdutoNovo(ORG, antes, K, custos0(), MARGENS).some((c) => c.rpc === "cat_definir_modelo_3d")).toBe(false);
  });
});
