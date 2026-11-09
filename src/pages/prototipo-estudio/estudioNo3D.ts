// 9/11 (Rúben: «meter os modelos 3D do Miguel no Estúdio»). A planta do Estúdio (o antes ou o depois) no visualizador do Miguel
// (emylia/planta3d): a ponte dele (deLegado) passa a planta para o espaço 3D; aqui cada peça com produto escolhido leva um modelo do tipo
// dela com a medida e a cor do produto, e o revestimento e o pavimento escolhidos dão o das paredes e do chão (o mais parecido da lista
// dele). Os modelos detalhados (torneiras, lava-loiças, placas) entram quando os produtos do Estúdio forem os do Catálogo verdadeiro.
import type { Planta } from "@/emylia/planta";
import { deLegado, modeloGenerico, type ResLegado } from "@/emylia/planta3d/ligacao";
import { ESPEC, type ProdutoModelo3D } from "@/emylia/planta3d/catalogo3d";
import type { Revestimentos } from "@/emylia/planta3d/modelo";
import { produto, type Produto } from "./catalogoFake";
import { alturaFinalCm, type Projeto } from "./necessidadesEstudio";

/** O pavimento e a parede do visualizador mais parecidos com os produtos escolhidos. */
export function revestimentosDe(p: Pick<Projeto, "revestimento" | "pavimento">): Revestimentos {
  const pav = produto(p.pavimento), rev = produto(p.revestimento);
  const corPav = pav?.cores[0], corRev = rev?.cores[0];
  const pavimento = !pav ? "ceramico_claro" : corPav === "madeira" ? "madeira_carvalho" : corPav === "preto" || /antracite/i.test(pav.n) ? "ceramico_escuro" : "ceramico_claro";
  const parede = !rev ? "tinta_branca" : corRev === "madeira" ? "madeira_parede" : corRev === "cinza" || corRev === "preto" ? "tinta_cinza" : "azulejo_branco";
  return { pavimento, parede };
}

/** O modelo de uma peça com produto: o genérico do tipo, com a medida, o nome e a cor do produto. */
function modeloDoProduto(tipo: Planta["pecas"][number]["tipo"], prod: Produto, wCm: number, hCm: number): ProdutoModelo3D {
  const g = modeloGenerico(tipo, prod.w ?? wCm, prod.h ?? hCm), e = ESPEC[g.tipo];
  const alto = prod.z1 !== undefined && prod.z0 !== undefined ? (prod.z1 - prod.z0) / 100 : g.mockup3d.altura;
  return {
    ...g, produtoId: `estudio:${prod.id}`, nome: prod.n, categoria: "Estúdio", montagem: e.mont, alturaOmissao: (prod.z0 ?? 0) / 100 || e.alt, demo: true,
    mockup3d: { ...g.mockup3d, altura: alto, cor: prod.hex },
  } as ProdutoModelo3D;
}

/** O espaço 3D do Estúdio: `depois` com os produtos escolhidos; o antes, como está. */
export function espacoDoEstudio(p: Projeto, qual: "antes" | "depois"): ResLegado {
  const planta = qual === "antes" ? p.antes : p.depois;
  const produtos: Record<string, ProdutoModelo3D> = {};
  const pecas = planta.pecas.map((pc) => {
    if (qual === "antes") return pc;
    const prod = produto(p.escolhas[pc.id]);
    if (!prod) return pc;
    const m = modeloDoProduto(pc.tipo, prod, pc.w, pc.h);
    produtos[m.produtoId] = m;
    return { ...pc, produto: m.produtoId };
  });
  const pe = alturaFinalCm(qual === "antes" ? { peDireito: p.alturas.peDireito, tetoFalso: null } : p.alturas) / 100;
  const res = deLegado({ ...planta, pecas }, {
    tipo: p.divisao === "Cozinha" ? "cozinha" : "casa_banho", nome: p.nome ?? "Estúdio", peDireito: pe, produtos,
    revestimentos: qual === "depois" ? revestimentosDe(p) : undefined,
  });
  if ("erro" in res || !res.ok) return res;
  // as peças de parede (o espelho, o toalheiro, o exaustor) ficam na parede, à altura do produto (ou à de sempre), não no chão
  // e os móveis suspensos (o móvel e a coluna com o produto acima do chão) à altura do produto
  const naParede = new Map(planta.pecas.flatMap((pc) => {
    const prod = qual === "depois" ? produto(p.escolhas[pc.id]) : undefined;
    if (pc.tipo in ALTURA_PAREDE) return [[pc.id, (prod?.z0 ?? ALTURA_PAREDE[pc.tipo]!) / 100] as const];
    if ((pc.tipo === "movel" || pc.tipo === "coluna") && (prod?.z0 ?? 0) > 5) return [[pc.id, prod!.z0! / 100] as const];
    return [];
  }));
  return { ...res, espaco: { ...res.espaco, pecas: res.espaco.pecas.map((x) => (naParede.has(x.id) ? { ...x, montagem: "parede", altura: naParede.get(x.id)! } : x)) } };
}

/** A altura ao chão (cm) das peças de parede sem produto escolhido. */
const ALTURA_PAREDE: Partial<Record<Planta["pecas"][number]["tipo"], number>> = { espelho: 110, toalheiro: 90, exaustor: 150 };
