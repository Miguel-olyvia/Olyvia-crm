// 5/11 (Rúben: «nessas peças em planta base, crias as necessidades, e ele automaticamente dá a planta com a nova necessidade; ele sugere,
// o comercial pode ajustar»). As necessidades do cliente saem da diferença entre a planta do antes e a do depois:
//  - o que sai do antes: retirar a peça (e o entulho);
//  - o que se troca ou é novo: o produto escolhido no catálogo e a instalação (o que é novo sem produto fica «por escolher»);
//  - o que muda de sítio: a canalização no sítio novo;
//  - o revestimento e o pavimento por m² (as paredes até ao teto falso, quando há), o teto falso, as proteções e os pontos elétricos.
// O comercial ajusta a quantidade ou tira uma linha; o ajuste fica marcado. Os preços do Estúdio são de teste (catalogoFake.ts).
import { PECAS, areaChaoM2, areaParedesM2, type PecaPlanta, type Planta, type TipoPeca } from "@/emylia/planta";
import { ACOMPANHA, NOME_CATEGORIA, produto, type Categoria, type Estilo } from "./catalogoFake";

export interface Alturas { /** Pé-direito atual, em cm. */ peDireito: number; /** Altura do teto falso, em cm; null sem teto falso. */ tetoFalso: number | null }

export interface Projeto {
  /** O nome do projeto (ex.: o negócio da Visita que o abriu). */
  nome?: string;
  antes: Planta;
  depois: Planta;
  /** Peça do depois → produto do catálogo. Sem produto, a peça fica como está (se já era do antes). */
  escolhas: Record<string, string>;
  /** Peça do depois → o que vai com ela (coluna e resguardo da base, torneira do móvel). */
  acompanha: Record<string, Partial<Record<Categoria, string>>>;
  revestimento?: string;
  pavimento?: string;
  alturas: Alturas;
  estilo: Estilo;
  ajustes: Record<string, { q?: number; fora?: boolean }>;
}

export type Grupo = "Peças" | "Materiais" | "Trabalhos";
export interface Linha {
  id: string;
  grupo: Grupo;
  n: string;
  q: number;
  un: string;
  unit: number;
  total: number;
  /** Porque é que a linha existe, em palavras (o que mudou na planta). */
  porque: string;
  porEscolher?: boolean;
  ajustada?: boolean;
  fora?: boolean;
}

/** Mão de obra e trabalhos de teste (€ sem IVA). */
export const TABELA = {
  retirar: { base: 90, banheira: 180, sanita: 60, bide: 60, movel: 50, coluna: 40, espelho: 20, toalheiro: 30, porta: 0, janela: 0 } as Record<TipoPeca, number>,
  instalar: { base: 180, banheira: 260, sanita: 140, bide: 120, movel: 150, coluna: 90, espelho: 60, toalheiro: 80, porta: 0, janela: 0 } as Record<TipoPeca, number>,
  demolicaoM2: 25,
  entulhoPecas: 120,
  pontoAgua: 150,
  pontoEletrico: 65,
  canalizacaoNova: 650,
  tetoFalsoM2: 38,
  pinturaTetoM2: 9,
  protecoes: 95,
  quebras: 1.1,
};
export const IVA = 0.23;

const AGUA: TipoPeca[] = ["base", "banheira", "sanita", "bide", "movel"];
/** Para os textos: a base, a banheira, a sanita, a porta e a janela são femininas; o resto é masculino. */
const FEMININO: TipoPeca[] = ["base", "banheira", "sanita", "porta", "janela"];
const SINGULAR: Partial<Record<Categoria, string>> = { coluna_duche: "Coluna de duche", resguardo: "Resguardo", torneira: "Torneira" };
const ELETRICO: TipoPeca[] = ["espelho", "toalheiro"];
const MUDOU_SITIO = 20; // cm: mais do que isto, a peça mudou de sítio
const r2 = (n: number) => Math.round(n * 100) / 100;

export const alturaFinalCm = (a: Alturas) => a.tetoFalso ?? a.peDireito;

/** As peças do antes que não estão no depois (saem). */
export const sairam = (p: Pick<Projeto, "antes" | "depois">): PecaPlanta[] => p.antes.pecas.filter((x) => !p.depois.pecas.some((y) => y.id === x.id));
/** As peças do depois que não estavam no antes (novas). */
export const entraram = (p: Pick<Projeto, "antes" | "depois">): PecaPlanta[] => p.depois.pecas.filter((x) => !p.antes.pecas.some((y) => y.id === x.id));
/** As que ficam mas mudaram de sítio (só as de água contam para a canalização). */
export function mudaramDeSitio(p: Pick<Projeto, "antes" | "depois">): PecaPlanta[] {
  return p.depois.pecas.filter((x) => {
    const a = p.antes.pecas.find((y) => y.id === x.id);
    return !!a && Math.hypot(a.x + a.w / 2 - (x.x + x.w / 2), a.y + a.h / 2 - (x.y + x.h / 2)) > MUDOU_SITIO;
  });
}

/** O estado de cada peça do depois: fica (como estava), troca (outro produto), nova (não estava no antes). */
export function estadoDaPeca(p: Projeto, pc: PecaPlanta): "fica" | "troca" | "nova" {
  if (!p.antes.pecas.some((y) => y.id === pc.id)) return "nova";
  return p.escolhas[pc.id] ? "troca" : "fica";
}

export function necessidades(p: Projeto): Linha[] {
  const out: Linha[] = [];
  const linha = (l: Omit<Linha, "total">) => out.push({ ...l, total: r2(l.q * l.unit) });
  const nome = (t: TipoPeca) => PECAS[t].n.toLowerCase();
  const fem = (t: TipoPeca) => FEMININO.includes(t);

  // o que sai
  const fora = sairam(p).filter((x) => !PECAS[x.tipo].abertura);
  for (const x of fora) linha({ id: `ret-${x.id}`, grupo: "Trabalhos", n: `Retirar ${nome(x.tipo)}`, q: 1, un: "un", unit: TABELA.retirar[x.tipo], porque: "Sai na planta do depois." });

  // o que se troca, o que é novo, e o que vai com cada peça
  for (const x of p.depois.pecas.filter((y) => !PECAS[y.tipo].abertura)) {
    const estado = estadoDaPeca(p, x), prod = produto(p.escolhas[x.id]);
    if (estado === "fica") continue;
    const porque = estado === "nova" ? "Peça nova na planta do depois." : "Trocada no catálogo.";
    if (estado === "troca") linha({ id: `ret-${x.id}`, grupo: "Trabalhos", n: `Retirar ${nome(x.tipo)} ${fem(x.tipo) ? "antiga" : "antigo"}`, q: 1, un: "un", unit: TABELA.retirar[x.tipo], porque: fem(x.tipo) ? "Sai para entrar a nova." : "Sai para entrar o novo." });
    if (prod) linha({ id: `prod-${x.id}`, grupo: "Peças", n: prod.n, q: 1, un: "un", unit: prod.preco, porque });
    else linha({ id: `prod-${x.id}`, grupo: "Peças", n: `${PECAS[x.tipo].n}: por escolher`, q: 1, un: "un", unit: 0, porque: "Toque na peça para a escolher no catálogo.", porEscolher: true });
    linha({ id: `inst-${x.id}`, grupo: "Trabalhos", n: `Instalação: ${nome(x.tipo)}`, q: 1, un: "un", unit: prod?.inst ?? TABELA.instalar[x.tipo], porque });
    for (const cat of ACOMPANHA[x.tipo] ?? []) {
      const a = produto(p.acompanha[x.id]?.[cat]);
      if (a) linha({ id: `acomp-${x.id}-${cat}`, grupo: "Peças", n: a.n, q: 1, un: "un", unit: a.preco + a.inst, porque: `${SINGULAR[cat] ?? NOME_CATEGORIA[cat]} ${fem(x.tipo) ? "da" : "do"} ${nome(x.tipo)}, com instalação.` });
    }
    if (ELETRICO.includes(x.tipo)) linha({ id: `ele-${x.id}`, grupo: "Trabalhos", n: `Ponto elétrico: ${nome(x.tipo)}`, q: 1, un: "un", unit: TABELA.pontoEletrico, porque: "Precisa de corrente." });
    if (estado === "nova" && AGUA.includes(x.tipo)) linha({ id: `agua-${x.id}`, grupo: "Trabalhos", n: `Ponto de água e esgoto: ${nome(x.tipo)}`, q: 1, un: "un", unit: TABELA.pontoAgua, porque: "Peça de água num sítio novo." });
  }
  for (const x of mudaramDeSitio(p).filter((y) => AGUA.includes(y.tipo))) {
    linha({ id: `agua-${x.id}`, grupo: "Trabalhos", n: `Mudar de sítio: ${nome(x.tipo)}`, q: 1, un: "un", unit: TABELA.pontoAgua, porque: "Mudou de sítio na planta: a canalização vai atrás." });
  }

  // as paredes, o chão e o teto
  const chao = areaChaoM2(p.depois.paredes);
  const altura = alturaFinalCm(p.alturas) / 100;
  const paredes = areaParedesM2(p.depois, altura);
  const rev = produto(p.revestimento), pav = produto(p.pavimento);
  if (rev && paredes !== null) {
    linha({ id: "rev", grupo: "Materiais", n: rev.n, q: r2(paredes * TABELA.quebras), un: "m²", unit: rev.preco, porque: `${paredes.toLocaleString("pt-PT")} m² de paredes até ${p.alturas.tetoFalso ? "ao teto falso" : "ao teto"}, mais 10% de quebras.` });
    linha({ id: "rev-inst", grupo: "Trabalhos", n: "Assentamento do revestimento", q: paredes, un: "m²", unit: rev.inst, porque: "As paredes da planta." });
  }
  if (pav && chao !== null) {
    linha({ id: "pav", grupo: "Materiais", n: pav.n, q: r2(chao * TABELA.quebras), un: "m²", unit: pav.preco, porque: `${chao.toLocaleString("pt-PT")} m² de chão, mais 10% de quebras.` });
    linha({ id: "pav-inst", grupo: "Trabalhos", n: "Assentamento do pavimento", q: chao, un: "m²", unit: pav.inst, porque: "O chão da planta." });
  }
  if ((rev || pav) && chao !== null && paredes !== null) {
    linha({ id: "dem", grupo: "Trabalhos", n: "Demolição e entulho", q: r2((rev ? paredes : 0) + (pav ? chao : 0)), un: "m²", unit: TABELA.demolicaoM2, porque: "Tirar o revestimento e o pavimento antigos." });
    linha({ id: "canal", grupo: "Trabalhos", n: "Canalização nova da casa de banho", q: 1, un: "un", unit: TABELA.canalizacaoNova, porque: "Com as paredes abertas, refaz-se até à entrada da casa de banho." });
  } else if (fora.length) {
    linha({ id: "dem", grupo: "Trabalhos", n: "Entulho das peças retiradas", q: 1, un: "un", unit: TABELA.entulhoPecas, porque: "Levar o que sai." });
  }
  if (p.alturas.tetoFalso && chao !== null) {
    linha({ id: "teto", grupo: "Trabalhos", n: `Teto falso a ${(p.alturas.tetoFalso / 100).toLocaleString("pt-PT")} m`, q: chao, un: "m²", unit: TABELA.tetoFalsoM2 + TABELA.pinturaTetoM2, porque: `Baixa de ${(p.alturas.peDireito / 100).toLocaleString("pt-PT")} m para ${(p.alturas.tetoFalso / 100).toLocaleString("pt-PT")} m, pintado.` });
  }
  if (out.length) linha({ id: "prot", grupo: "Trabalhos", n: "Proteções do caminho e da obra", q: 1, un: "un", unit: TABELA.protecoes, porque: "Da entrada da casa até à casa de banho." });

  // os ajustes do comercial
  return out.map((l) => {
    const a = p.ajustes[l.id];
    if (!a) return l;
    const q = a.q ?? l.q;
    return { ...l, q, total: r2(q * l.unit), ajustada: a.q !== undefined && a.q !== l.q, fora: !!a.fora };
  });
}

export function totais(linhas: readonly Linha[]): { semIva: number; iva: number; comIva: number } {
  const semIva = r2(linhas.filter((l) => !l.fora).reduce((s, l) => s + l.total, 0));
  const iva = r2(semIva * IVA);
  return { semIva, iva, comIva: r2(semIva + iva) };
}

/** «Aplicar o estilo»: cada peça trocada ou nova sem produto, e o revestimento e o pavimento, ficam com o que melhor combina. */
export type Escolher = (cat: Categoria) => string | undefined;
export function aplicarEstilo(p: Projeto, escolher: Escolher, todas = false): Projeto {
  const escolhas = { ...p.escolhas }, acompanha = { ...p.acompanha };
  for (const x of p.depois.pecas.filter((y) => !PECAS[y.tipo].abertura)) {
    const novaOuTroca = estadoDaPeca(p, x) !== "fica" || todas;
    if (!novaOuTroca) continue;
    const id = escolher(x.tipo);
    if (id) escolhas[x.id] = id;
    const acomp = { ...(acompanha[x.id] ?? {}) };
    for (const cat of ACOMPANHA[x.tipo] ?? []) { const a = escolher(cat); if (a) acomp[cat] = a; }
    acompanha[x.id] = acomp;
  }
  return { ...p, escolhas, acompanha, revestimento: escolher("revestimento") ?? p.revestimento, pavimento: escolher("pavimento") ?? p.pavimento };
}
