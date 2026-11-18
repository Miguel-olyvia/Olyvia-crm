// 17/11 (revisão M4): uma leitura LEVE que acaba depois de uma INTEIRA mais nova não se pode aplicar por cima dela (carregarCatalogo aplica o Catálogo às stores).
import { afterEach, describe, expect, it } from "vitest";
import { LINHAS, seed } from "../motor";
import { reporCustos } from "../v2/custosStore";
import { lerCatalogo, reporCatalogo } from "../v2/catalogoStore";
import { LeituraAtrasada, carregarCatalogo } from "./carregarCatalogo";
import { limparCatalogoLido } from "./catalogoLeve";

const ORG = "11111111-1111-4111-a111-111111111111";
const produto = (id: string, name: string) => ({ id, name, sku: null, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null });
const base = { parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 } };
const INTEIRO = { ...base, produtos: [produto("a", "A"), produto("b", "B")] };
const LEVE = { ...base, produtos: [produto("a", "A")] };

function cliente(resp: Record<string, () => Promise<{ data: unknown; error: unknown }>>) {
  return { rpc: (fn: string) => (resp[fn] ?? (async () => ({ data: null, error: { message: "sem função" } })))() } as never;
}
afterEach(() => { reporCustos(); reporCatalogo(); limparCatalogoLido(); });

describe("carregarCatalogo: leituras atrasadas", () => {
  it("a leve que chega depois da inteira mais nova é descartada: o Catálogo fica o da inteira", async () => {
    let soltar!: (v: { data: unknown; error: null }) => void;
    const lenta = cliente({ cat_ler_catalogo_servicos: () => new Promise((r) => { soltar = r; }) });
    let velha = false;
    const p1 = carregarCatalogo(lenta, ORG, seed(), { leve: true, descartar: () => velha });
    const rejeitada = expect(p1).rejects.toBeInstanceOf(LeituraAtrasada);
    velha = true; // a página já pediu outra leitura
    await carregarCatalogo(cliente({ cat_ler_catalogo: async () => ({ data: INTEIRO, error: null }) }), ORG, seed());
    expect(lerCatalogo().produtos.map((p) => p.id).sort()).toEqual(["a", "b"]);
    soltar({ data: LEVE, error: null });
    await rejeitada;
    expect(lerCatalogo().produtos.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });
  it("sem `descartar`, ou com ele falso, aplica-se como sempre", async () => {
    await carregarCatalogo(cliente({ cat_ler_catalogo: async () => ({ data: INTEIRO, error: null }) }), ORG, seed(), { descartar: () => false });
    expect(lerCatalogo().produtos).toHaveLength(2);
  });
});

describe("carregarCatalogo: as linhas de negócio só se aplicam se a leitura não foi descartada", () => {
  const OUTRA = [{ chave: "wc", nome: "Linhas de OUTRA organização", modelo: "x" }];
  const sbLinhas = () => cliente({
    cat_ler_catalogo: async () => ({ data: INTEIRO, error: null }),
    neg_ler_linhas_modelo: async () => ({ data: OUTRA, error: null }),
  });
  const original = LINHAS.wc;
  afterEach(() => { LINHAS.wc = original; });
  it("uma leitura descartada (outra mais nova) deixa o LINHAS global como estava", async () => {
    await expect(carregarCatalogo(sbLinhas(), ORG, seed(), { descartar: () => true })).rejects.toBeInstanceOf(LeituraAtrasada);
    expect(LINHAS.wc).toBe(original);
  });
  it("uma leitura válida aplica-as", async () => {
    await carregarCatalogo(sbLinhas(), ORG, seed(), { descartar: () => false });
    expect(LINHAS.wc.n).toBe("Linhas de OUTRA organização");
  });
});
