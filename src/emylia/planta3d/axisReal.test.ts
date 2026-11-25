// 24/11: a Coluna Suspensa AXIS 40x160x25 (Mudelar, base RH) com os dados REAIS (recorte verbatim de cat_ler_produto, cat_ler_atributos_produto,
// cat_ler_atributos_definicoes e cat_ler_referencias_produtos: __fixtures__/axisReal.json). O dono via-a deitada (40 de largura, 160 de profundidade, 25 de
// altura), com as duas portas lado a lado e sem a foto do Artisan. A coluna real é alta e estreita: 0,40 × 1,60 m, 0,25 de fundo, com as portas EMPILHADAS.
import { describe, expect, it } from "vitest";
import real from "./__fixtures__/axisReal.json";
import { catalogo0 } from "../v2/catalogoModelo";
import { juntarAtributos, juntarTabelas, linhasDe } from "../real/lerCatalogo";
import { atributosDeValores, montarCatalogo } from "../real/catalogoReal";
import { produtoDeLeitura } from "../real/produtosLeves";
import { extrairDimensoes, modeloDoProduto, tipoMockupDe } from "./catalogo3d";
import { categoriaPorId, opcoesComOmissao, type ParamsGenerico } from "./categoriasGlb";
import { fotoDosAtributos, medidaDosAtributos, modeloParaPrevia } from "./previaProduto3d";

type Qual = keyof typeof real.produtos;
const QUAIS: Qual[] = ["artisan", "denver", "oak"];
const FOTO: Record<Qual, string> = {
  artisan: "3242e925-da26-459a-8258-be04d904e355/0e8b282e-69bf-454b-bd0b-fb55e7b51b3c.webp",
  denver: "3242e925-da26-459a-8258-be04d904e355/8ae2a8cb-ca75-42ef-b037-1f56d8936ff0.webp",
  oak: "3242e925-da26-459a-8258-be04d904e355/f8799ace-866c-4e1a-ab80-4768969dfba5.webp",
};

/** O Catálogo como a página leve o monta (lerCatalogoLeve): a árvore e as definições dos atributos. */
function catalogo() {
  let L = juntarTabelas(linhasDe(null), { categoriasProduto: real.categoriasProduto, produtos: [] } as never);
  L = juntarAtributos(L, real.definicoes as never);
  return montarCatalogo(L, catalogo0(), {}).K;
}
const K = catalogo();
const ficha = (q: Qual) => {
  const p = produtoDeLeitura(real.produtos[q])!;
  return { p, attrs: atributosDeValores(real.atributos[q].valores as never) };
};

describe("Coluna Suspensa AXIS (dados reais da Mudelar)", () => {
  it("o classificador dá-lhe o tipo «coluna» pela subcategoria real «Colunas»", () => {
    for (const q of QUAIS) {
      const { p } = ficha(q);
      expect(K.arvore.find((n) => n.id === p.no)?.n).toBe("Colunas");
      expect(tipoMockupDe({ id: p.id, n: p.n, no: p.no }, K.arvore)).toBe("coluna");
    }
  });

  it("SÓ PELO NOME (sem a Medida dos atributos: a planta, o catálogo, a ficha antes de os ler): em pé, 40 × 160 de altura × 25 de fundo", () => {
    expect(extrairDimensoes(real.produtos.artisan.name, "coluna")).toEqual({ larguraCm: 40, profundidadeCm: 25, alturaCm: 160, deNome: true });
    for (const q of QUAIS) {
      const { p } = ficha(q);
      const m = modeloDoProduto({ id: p.id, n: p.n, no: p.no }, K.arvore);
      expect(m.mockup3d).toMatchObject({ largura: 0.4, altura: 1.6, profundidade: 0.25 });
    }
  });

  it("com a Medida 3D real ({40, 160, 25} cm) e a foto da opção «Cor do corpo»: em pé e com a textura dessa foto", () => {
    for (const q of QUAIS) {
      const { p, attrs } = ficha(q);
      const foto = fotoDosAtributos(attrs, K.atributos);
      expect(foto).toBe(FOTO[q]);
      const m = modeloParaPrevia({ nome: p.n, no: p.no, arvore: K.arvore, medida: medidaDosAtributos(attrs), textura: { url: foto!, ladoCm: 40 } });
      expect(m.mockup3d).toMatchObject({ tipo: "coluna", largura: 0.4, altura: 1.6, profundidade: 0.25, textura: { url: FOTO[q] }, generico: { id: "armario" } });
    }
  });

  it("o genérico «armario» de uma coluna alta e estreita: as duas portas EMPILHADAS (uma em cima, outra em baixo) e o puxador HORIZONTAL entre elas", () => {
    const c = categoriaPorId("armario")!;
    const o = opcoesComOmissao(c, "coluna", {}, real.produtos.artisan.name);
    const P: ParamsGenerico = { w: 0.4, d: 0.25, h: 1.6, o };
    const parte = (n: string) => { const x = c.partes.find((y) => y.nome === n)!; return { ...x.colocar(P), ver: x.ver ? x.ver(P) : true }; };
    const baixo = parte("porta_esq"), cima = parte("porta_dir"), pux = parte("puxador");
    expect(baixo.ver && cima.ver && pux.ver).toBe(true);
    // a toda a largura, cada uma com metade da altura, uma por cima da outra
    for (const pt of [baixo, cima]) { expect(pt.pos[0]).toBeCloseTo(0); expect(pt.esc[0]).toBeGreaterThan(0.38); expect(pt.esc[1]).toBeLessThan(0.8); }
    expect(baixo.pos[1] + baixo.esc[1] / 2).toBeLessThanOrEqual(cima.pos[1] - cima.esc[1] / 2 + 1e-9);
    // o puxador: mais largo do que alto, ao centro, entre as duas portas
    expect(pux.esc[0]).toBeGreaterThan(pux.esc[1]);
    expect(pux.pos[0]).toBeCloseTo(0);
    expect(pux.pos[1]).toBeGreaterThan(baixo.pos[1]);
    expect(pux.pos[1]).toBeLessThan(cima.pos[1]);
  });

  it("um armário largo e baixo (armário de espelho 60 × 70) continua com as portas lado a lado e o puxador vertical", () => {
    const c = categoriaPorId("armario")!;
    const P: ParamsGenerico = { w: 0.6, d: 0.15, h: 0.7, o: { frente: "lisa", duas: true } };
    const esq = c.partes.find((y) => y.nome === "porta_esq")!.colocar(P), dir = c.partes.find((y) => y.nome === "porta_dir")!.colocar(P);
    const pux = c.partes.find((y) => y.nome === "puxador")!.colocar(P);
    expect(esq.pos[0]).toBeCloseTo(-0.15); expect(dir.pos[0]).toBeCloseTo(0.15);
    expect(esq.pos[1]).toBeCloseTo(dir.pos[1]);
    expect(pux.esc[1]).toBeGreaterThan(pux.esc[0]);
  });
});
