import { describe, expect, it } from "vitest";
import type { Planta } from "../planta";
import { catalogo0 } from "../v2/catalogoModelo";
import { comDemonstracao, produtosParaEspaco } from "./catalogo3d";
import { GAP_CM, juntarParte, linhasDaComposicaoLivre, parteDeFamilia, parteDeProduto, pecasDaComposicao, posicoesDaComposicao, removerParte, totalDaComposicao, descreverParte } from "./composicaoLivre";
import { ID_COMPOSICAO_LIVRE, linhasVendaveis, reposicionarConjunto, retirarComponente, totalDasLinhas } from "./conjuntos";
import { FAMILIAS, resolverVariante } from "./familias";

const lava = FAMILIAS.find((f) => f.categoria === "lavaloicas")!;
const torn = FAMILIAS.find((f) => f.categoria === "torneiras")!;
const placa = FAMILIAS.find((f) => f.categoria === "placas")!;
const K = catalogo0();
const catalogo = produtosParaEspaco(comDemonstracao(K.produtos, K.arvore), K.arvore, "cozinha", { max: 100000 });
const semPrecoProd = catalogo.find((m) => !m.fam && m.tipo !== "porta" && m.tipo !== "janela")!;
const preco = (f: typeof lava) => resolverVariante(f).preco;
const vazia = (): Planta => ({ o: { x: 0, y: 0 }, paredes: [], pecas: [] });

describe("montar partes", () => {
  it("uma parte de família leva a variante, o SKU e o preço de resolverVariante", () => {
    const p = parteDeFamilia("a", lava.id)!;
    const v = resolverVariante(lava);
    expect(descreverParte(p)).toMatchObject({ nome: v.nome, sku: v.sku, preco: v.preco, semPreco: false });
    expect(descreverParte(p).variante).toContain(v.acabamento.nome);
  });
  it("família desconhecida ou vazia dá null", () => {
    expect(parteDeFamilia("a", "nao_existe")).toBeNull();
    expect(parteDeFamilia("a", "")).toBeNull();
  });
  it("respeita a medida e o acabamento escolhidos", () => {
    const m = lava.medidas[lava.medidas.length - 1], ac = lava.acabamentos[lava.acabamentos.length - 1];
    const p = parteDeFamilia("a", lava.id, m.id, ac.id)!;
    expect(descreverParte(p).preco).toBe(resolverVariante(lava, m.id, ac.id).preco);
  });
  it("um produto do catálogo sem família fica «sem preço»", () => {
    const d = descreverParte(parteDeProduto("b", semPrecoProd)!);
    expect(d).toMatchObject({ nome: semPrecoProd.nome, semPreco: true });
    expect(d.preco).toBeUndefined();
  });
  it("portas e janelas não entram numa composição", () => {
    const porta = catalogo.find((m) => m.tipo === "porta");
    if (porta) expect(parteDeProduto("c", porta)).toBeNull();
    expect(parteDeProduto("c", { ...semPrecoProd, tipo: "janela" })).toBeNull();
  });
  it("juntar e remover não alteram a lista original", () => {
    const a = parteDeFamilia("a", lava.id)!, b = parteDeFamilia("b", torn.id)!;
    const l0 = [a], l1 = juntarParte(l0, b);
    expect(l0).toHaveLength(1);
    expect(l1.map((x) => x.uid)).toEqual(["a", "b"]);
    const l2 = removerParte(l1, "a");
    expect(l1).toHaveLength(2);
    expect(l2.map((x) => x.uid)).toEqual(["b"]);
    expect(removerParte(l2, "zzz")).toEqual(l2);
  });
});

describe("total e linhas", () => {
  it("lista vazia: total 0", () => expect(totalDaComposicao([])).toEqual({ total: 0, semPreco: 0 }));
  it("soma os preços e conta as partes sem preço, que continuam visíveis", () => {
    const partes = [parteDeFamilia("a", lava.id)!, parteDeFamilia("b", torn.id)!, parteDeProduto("c", semPrecoProd)!];
    expect(totalDaComposicao(partes)).toEqual({ total: Math.round((preco(lava) + preco(torn)) * 100) / 100, semPreco: 1 });
    const linhas = linhasDaComposicaoLivre(partes);
    expect(linhas).toHaveLength(3);
    expect(linhas[2]).toMatchObject({ uid: "c", semPreco: true });
    expect(linhas[0].sku).toBeTruthy();
  });
});

describe("posições", () => {
  const partes = () => [parteDeFamilia("a", lava.id)!, parteDeFamilia("b", torn.id)!, parteDeFamilia("c", placa.id)!];
  it("lado a lado, da esquerda para a direita, com folga fixa e sem sobreposição", () => {
    const pos = posicoesDaComposicao(partes());
    expect(pos[0].lx).toBeCloseTo(pos[0].w / 2);
    for (let i = 1; i < pos.length; i++) {
      const antes = pos[i - 1].lx + pos[i - 1].w / 2, agora = pos[i].lx - pos[i].w / 2;
      expect(agora - antes).toBeCloseTo(GAP_CM);
    }
  });
  it("as costas ficam alinhadas (ly = metade da profundidade)", () => {
    for (const p of posicoesDaComposicao(partes())) expect(p.ly).toBeCloseTo(p.h / 2);
  });
  it("lista vazia: sem posições", () => expect(posicoesDaComposicao([])).toEqual([]));
});

describe("peças para a planta", () => {
  const partes = () => [parteDeFamilia("a", lava.id)!, parteDeFamilia("b", torn.id)!, parteDeProduto("c", semPrecoProd)!];
  it("uma peça por parte, todas do mesmo conjunto, a primeira é a âncora, ids únicos", () => {
    const ps = pecasDaComposicao(partes(), "cl1", { x: 300, y: 200 });
    expect(ps).toHaveLength(3);
    expect(new Set(ps.map((p) => p.id)).size).toBe(3);
    expect(ps.every((p) => p.conj === "cl1" && p.conjId === ID_COMPOSICAO_LIVRE)).toBe(true);
    expect(ps.filter((p) => p.ancora).map((p) => p.id)).toEqual([ps[0].id]);
    expect(ps[0]).toMatchObject({ fam: lava.id, rot: 0 });
    expect(ps[2].produto).toBe(semPrecoProd.produtoId);
  });
  it("a fila fica centrada no ponto dado", () => {
    const ps = pecasDaComposicao(partes(), "cl1", { x: 300, y: 200 });
    const x0 = Math.min(...ps.map((p) => p.x)), x1 = Math.max(...ps.map((p) => p.x + p.w));
    expect((x0 + x1) / 2).toBeCloseTo(300, 0);
  });
  it("lista vazia: nenhuma peça", () => expect(pecasDaComposicao([], "cl1", { x: 0, y: 0 })).toEqual([]));
  it("as linhas de venda e o total da planta batem com o painel (sem desconto)", () => {
    const pt = partes(), planta: Planta = { ...vazia(), pecas: pecasDaComposicao(pt, "cl1", { x: 300, y: 200 }) };
    const linhas = linhasVendaveis(planta);
    expect(linhas).toHaveLength(3);
    expect(linhas.map((l) => l.conjId)).toEqual(["cl1", "cl1", "cl1"]);
    expect(linhas[0].sku).toBe(resolverVariante(lava).sku);
    expect(linhas[2].preco).toBeUndefined();
    expect(totalDasLinhas(planta)).toBe(totalDaComposicao(pt).total);
  });
  it("move-se como uma peça: depois de mexer na âncora, reposicionar leva as outras", () => {
    const planta: Planta = { ...vazia(), pecas: pecasDaComposicao(partes(), "cl1", { x: 300, y: 200 }) };
    const mexida = { ...planta, pecas: planta.pecas.map((p) => (p.ancora ? { ...p, x: p.x + 100, y: p.y + 50 } : p)) };
    const depois = reposicionarConjunto(mexida, "cl1");
    expect(depois.pecas[1].x).toBeCloseTo(planta.pecas[1].x + 100, 0);
    expect(depois.pecas[1].y).toBeCloseTo(planta.pecas[1].y + 50, 0);
  });
  it("retirar uma parte tira-a do total mas não das outras", () => {
    const planta: Planta = { ...vazia(), pecas: pecasDaComposicao(partes(), "cl1", { x: 300, y: 200 }) };
    const sem = retirarComponente(planta, planta.pecas[1].id);
    expect(totalDasLinhas(sem)).toBe(Math.round(preco(lava) * 100) / 100);
  });
});
