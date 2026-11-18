// 18/11: as páginas de Serviços leem só o que é de Serviços (soServicos): sem atributos nem modelos, que são dos Produtos. As linhas de negócio (neg_ler_linhas_modelo) ficam:
// o LINHAS do motor diz a que pacotes e medidas pertence cada serviço (fichaServico, custosModelo).
import { afterEach, describe, expect, it } from "vitest";
import { seed } from "../motor";
import { reporCustos } from "../v2/custosStore";
import { reporCatalogo } from "../v2/catalogoStore";
import { carregarCatalogo } from "./carregarCatalogo";
import { limparCatalogoLido } from "./catalogoLeve";

const ORG = "11111111-1111-4111-a111-111111111111";
afterEach(() => { reporCustos(); reporCatalogo(); limparCatalogoLido(); });

function cliente() {
  const rpcs: string[] = [];
  const sb = { rpc: async (fn: string) => { rpcs.push(fn); return fn === "cat_ler_catalogo_servicos" ? { data: {}, error: null } : { data: null, error: { message: "sem função" } }; } } as never;
  return { sb, rpcs };
}
describe("carregarCatalogo com soServicos", () => {
  it("não lê atributos nem modelos, e mantém as tabelas dos serviços e as linhas de negócio", async () => {
    const c = cliente();
    await carregarCatalogo(c.sb, ORG, seed(), { leve: true, soServicos: true });
    expect(c.rpcs).not.toContain("cat_ler_atributos_definicoes");
    expect(c.rpcs).not.toContain("cat_ler_modelos_gestao");
    expect(c.rpcs).toContain("cat_ler_produtos_tabelas_servicos");
    expect(c.rpcs).toContain("neg_ler_linhas_modelo");
  });
  it("sem a opção (Negócios, Estúdio): lê tudo como antes", async () => {
    const c = cliente();
    await carregarCatalogo(c.sb, ORG, seed(), { leve: true });
    expect(c.rpcs).toContain("cat_ler_atributos_definicoes");
    expect(c.rpcs).toContain("cat_ler_modelos_gestao");
  });
});
