// 5/11 (Rúben: «nessas peças em planta base, crias as necessidades, e ele automaticamente dá a planta com a nova necessidade; ele sugere,
// o comercial pode ajustar»). As necessidades do cliente saem da diferença entre a planta do antes e a do depois:
//  - o que sai do antes: retirar a peça (e o entulho);
//  - o que se troca ou é novo: o produto escolhido no catálogo e a instalação (o que é novo sem produto fica «por escolher»);
//  - o que muda de sítio: a canalização no sítio novo;
//  - o revestimento e o pavimento por m² (as paredes até ao teto falso, quando há), o teto falso, as proteções e os pontos elétricos.
// O comercial ajusta a quantidade ou tira uma linha; o ajuste fica marcado. Os preços do Estúdio são de teste (catalogoFake.ts).
import { PASSO, PECAS, areaChaoM2, areaParedesM2, encaixar, juntarPeca, type PecaPlanta, type Planta, type Ponto, type TipoPeca } from "@/emylia/planta";
import { sitioDeQuemSai } from "./posicoesDepois";
import { linhasDaCozinha, type Cozinha } from "./cozinha/modelo";
import { TIPOS_COZINHA } from "@/emylia/planta";
import { ACOMPANHA, NOME_CATEGORIA, SERVICOS, produto, servico, type Categoria, type Estilo, type Servico } from "./catalogoFake";

export interface Alturas { /** Pé-direito atual, em cm. */ peDireito: number; /** Altura do teto falso, em cm; null sem teto falso. */ tetoFalso: number | null }

export interface Projeto {
  /** O nome do projeto (ex.: o negócio da Visita que o abriu). */
  nome?: string;
  /** 5/11: o negócio da Visita que o abriu (para «Voltar ao negócio» levar a planta) e a página de onde veio. */
  negocio?: number;
  origem?: string;
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
  /** 5/11 (Rúben: «no passo 3 aparece todos os novos produtos por colocar»): escolhidos no estilo, ainda sem sítio na planta. */
  porColocar?: PorColocar[];
  /** 5/11 (Rúben: «e incluir também os serviços»): os serviços escolhidos, com a quantidade. */
  servicos?: { id: string; q: number }[];
  /** 6/11: os serviços sugeridos pelos produtos a que se disse «agora não» (não voltam a ser sugeridos). */
  servicosRecusados?: string[];
  /** 6/11: quando o Estúdio gravou pela última vez (ms); a Visita guarda no negócio a versão mais recente. */
  gravadoEm?: number;
  /** 6/11: a divisão do projeto (a cozinha tem as suas peças e o seu catálogo). Sem ela, casa de banho. */
  divisao?: "Casa de banho" | "Cozinha";
  /** 6/11: os móveis e os eletrodomésticos do planeador da cozinha (cozinha/PlaneadorCozinha.tsx). */
  cozinha?: Cozinha;
  /** 6/11: as peças mudadas de sítio no próprio depois (deixam de seguir o antes). Sem o campo: projeto de antes da regra. */
  movidasNoDepois?: string[];
  /** 9/11: a ligação ao Catálogo verdadeiro (servicosDoCatalogo.ts): as trocas, os serviços juntados à mão e o dia de início da obra. */
  catalogo?: import("./servicosDoCatalogo").EscolhasCatalogo;
  /** 11/11 (perguntasDaVisita.ts): as perguntas da visita respondidas no Estúdio (chave no negócio → resposta) e o prefixo das chaves da
   *  área (vazio na divisão principal). */
  perguntas?: Record<string, string>;
  prefixoPerguntas?: string;
  /** 12/11 (estiloDaConversa.ts): as cores ditas na chamada e na visita já gravadas no negócio quando o Estúdio abriu. */
  ditosAntes?: import("./estiloDaConversa").DitoEstilo[];
  /** 12/11: o comercial mexeu nas cores à mão; o que o cliente disser a seguir já não as muda sozinho (fica como sugestão). */
  estiloManual?: boolean;
}
export interface PorColocar { id: string; tipo: TipoPeca; produto?: string; acompanha?: Partial<Record<Categoria, string>> }

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
  retirar: { base: 90, banheira: 180, sanita: 60, bide: 60, movel: 50, coluna: 40, espelho: 20, toalheiro: 30, porta: 0, janela: 0,
    bancada: 80, lava: 40, placa: 30, forno: 30, frigorifico: 20, maquina: 30, exaustor: 40, armario: 50 } as Record<TipoPeca, number>,
  instalar: { base: 180, banheira: 260, sanita: 140, bide: 120, movel: 150, coluna: 90, espelho: 60, toalheiro: 80, porta: 0, janela: 0,
    bancada: 200, lava: 120, placa: 90, forno: 80, frigorifico: 40, maquina: 90, exaustor: 120, armario: 150 } as Record<TipoPeca, number>,
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

const AGUA: TipoPeca[] = ["base", "banheira", "sanita", "bide", "movel", "lava", "maquina"];
/** Para os textos: a base, a banheira, a sanita, a porta e a janela são femininas; o resto é masculino. */
const FEMININO: TipoPeca[] = ["base", "banheira", "sanita", "porta", "janela", "bancada", "placa", "maquina"];
const SINGULAR: Partial<Record<Categoria, string>> = { coluna_duche: "Coluna de duche", resguardo: "Resguardo", torneira: "Torneira" };
const ELETRICO: TipoPeca[] = ["espelho", "toalheiro", "placa", "forno", "frigorifico", "maquina", "exaustor"];
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

  // 6/11: com o planeador da cozinha, os móveis e os eletrodomésticos são os dele (as peças de cozinha da planta só dão o sítio)
  const planeada = !!p.cozinha && p.cozinha.baixo.length + p.cozinha.cima.length > 0;
  const daPlanta = (t: TipoPeca) => !(planeada && TIPOS_COZINHA.includes(t));
  // o que se troca, o que é novo, e o que vai com cada peça
  for (const x of p.depois.pecas.filter((y) => !PECAS[y.tipo].abertura && daPlanta(y.tipo))) {
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
  for (const x of (p.porColocar ?? []).filter((y) => daPlanta(y.tipo))) {
    const prod = produto(x.produto), porque = "Escolhido no estilo; falta pô-lo na planta.";
    if (prod) linha({ id: `prod-${x.id}`, grupo: "Peças", n: prod.n, q: 1, un: "un", unit: prod.preco, porque });
    else linha({ id: `prod-${x.id}`, grupo: "Peças", n: `${PECAS[x.tipo].n}: por escolher`, q: 1, un: "un", unit: 0, porque, porEscolher: true });
    linha({ id: `inst-${x.id}`, grupo: "Trabalhos", n: `Instalação: ${nome(x.tipo)}`, q: 1, un: "un", unit: prod?.inst ?? TABELA.instalar[x.tipo], porque });
    for (const cat of ACOMPANHA[x.tipo] ?? []) {
      const a = produto(x.acompanha?.[cat]);
      if (a) linha({ id: `acomp-${x.id}-${cat}`, grupo: "Peças", n: a.n, q: 1, un: "un", unit: a.preco + a.inst, porque: `${SINGULAR[cat] ?? NOME_CATEGORIA[cat]} ${fem(x.tipo) ? "da" : "do"} ${nome(x.tipo)}, com instalação.` });
    }
    if (ELETRICO.includes(x.tipo)) linha({ id: `ele-${x.id}`, grupo: "Trabalhos", n: `Ponto elétrico: ${nome(x.tipo)}`, q: 1, un: "un", unit: TABELA.pontoEletrico, porque: "Precisa de corrente." });
    if (AGUA.includes(x.tipo)) linha({ id: `agua-${x.id}`, grupo: "Trabalhos", n: `Ponto de água e esgoto: ${nome(x.tipo)}`, q: 1, un: "un", unit: TABELA.pontoAgua, porque: "Peça de água num sítio novo." });
  }
  for (const x of mudaramDeSitio(p).filter((y) => AGUA.includes(y.tipo))) {
    linha({ id: `agua-${x.id}`, grupo: "Trabalhos", n: `Mudar de sítio: ${nome(x.tipo)}`, q: 1, un: "un", unit: TABELA.pontoAgua, porque: "Mudou de sítio na planta: a canalização vai atrás." });
  }

  if (planeada && p.cozinha) {
    const GRUPO = { Móveis: "Peças", Eletrodomésticos: "Peças", Tampo: "Materiais", Montagem: "Trabalhos" } as const;
    for (const l of linhasDaCozinha(p.cozinha)) {
      // os serviços do planeador somam-se aos escolhidos no estilo (a mesma linha não entra duas vezes)
      if (l.id.startsWith("serv-") && (p.servicos ?? []).some((s) => `serv-${s.id}` === l.id)) continue;
      linha({ id: l.id, grupo: GRUPO[l.grupo], n: l.n, q: l.q, un: l.un, unit: l.unit, porque: "Do planeador da cozinha." });
    }
    if (p.cozinha.baixo.some((m) => m.modelo === "lava")) linha({ id: "coz-agua", grupo: "Trabalhos", n: "Ponto de água e esgoto: lava-loiça", q: 1, un: "un", unit: TABELA.pontoAgua, porque: "O lava-loiça do planeador." });
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
    linha({ id: "canal", grupo: "Trabalhos", n: `Canalização nova da ${(p.divisao ?? "Casa de banho").toLowerCase()}`, q: 1, un: "un", unit: TABELA.canalizacaoNova, porque: `Com as paredes abertas, refaz-se até à entrada da ${(p.divisao ?? "Casa de banho").toLowerCase()}.` });
  } else if (fora.length) {
    linha({ id: "dem", grupo: "Trabalhos", n: "Entulho das peças retiradas", q: 1, un: "un", unit: TABELA.entulhoPecas, porque: "Levar o que sai." });
  }
  if (p.alturas.tetoFalso && chao !== null) {
    linha({ id: "teto", grupo: "Trabalhos", n: `Teto falso a ${(p.alturas.tetoFalso / 100).toLocaleString("pt-PT")} m`, q: chao, un: "m²", unit: TABELA.tetoFalsoM2 + TABELA.pinturaTetoM2, porque: `Baixa de ${(p.alturas.peDireito / 100).toLocaleString("pt-PT")} m para ${(p.alturas.tetoFalso / 100).toLocaleString("pt-PT")} m, pintado.` });
  }
  // os serviços escolhidos no estilo
  for (const x of p.servicos ?? []) {
    const sv = servico(x.id);
    if (sv) linha({ id: `serv-${sv.id}`, grupo: "Trabalhos", n: sv.n, q: x.q, un: sv.un, unit: sv.preco, porque: sv.desc });
  }
  if (out.length) linha({ id: "prot", grupo: "Trabalhos", n: "Proteções do caminho e da obra", q: 1, un: "un", unit: TABELA.protecoes, porque: `Da entrada da casa até à ${(p.divisao ?? "Casa de banho").toLowerCase()}.` });

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
  return encaixarEscolhas({ ...p, escolhas, acompanha, revestimento: escolher("revestimento") ?? p.revestimento, pavimento: escolher("pavimento") ?? p.pavimento });
}

// ---------------------------------------------------------------- 5/11: as decisões do passo «Estilo» e pôr na planta

export type Decisao = "fica" | "troca" | "tira";
/** O que se decidiu para uma peça do antes. */
export function decisaoDe(p: Projeto, pecaId: string): Decisao {
  if (!p.depois.pecas.some((x) => x.id === pecaId)) return "tira";
  return p.escolhas[pecaId] ? "troca" : "fica";
}

/** Decidir uma peça do antes: fica (como está), troca (pelo produto dado, ou o recomendado) ou tira (sai do depois). */
export function decidir(p: Projeto, pecaId: string, d: Decisao, recomendado?: string): Projeto {
  const antes = p.antes.pecas.find((x) => x.id === pecaId);
  if (!antes) return p;
  const escolhas = { ...p.escolhas };
  let pecas = p.depois.pecas;
  if (d === "tira") { delete escolhas[pecaId]; pecas = pecas.filter((x) => x.id !== pecaId); }
  else {
    if (!pecas.some((x) => x.id === pecaId)) pecas = [...pecas, { ...antes }];
    if (d === "fica") delete escolhas[pecaId];
    else if (!escolhas[pecaId] && recomendado) return escolherProduto({ ...p, escolhas, depois: { ...p.depois, pecas } }, pecaId, recomendado);
  }
  return { ...p, escolhas, depois: { ...p.depois, pecas } };
}

/** Juntar um produto novo aos «por colocar» (fica na bandeja do passo «Depois»). */
export function juntarPorColocar(p: Projeto, item: Omit<PorColocar, "id">, id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`): Projeto {
  return { ...p, porColocar: [...(p.porColocar ?? []), { ...item, id }] };
}

/**
 * Pôr na planta um produto por colocar: entra como peça nova com o tamanho do produto, com o centro no ponto dado (ou ao meio), e o
 * produto e o que vai com ele passam para a peça. As linhas do orçamento ficam iguais (mudam só de «por colocar» para a peça).
 */
export function colocar(p: Projeto, id: string, centro?: Ponto): Projeto {
  const item = (p.porColocar ?? []).find((x) => x.id === id);
  if (!item) return p;
  const prod = produto(item.produto);
  // 6/11: tocada (sem sítio), vai para o sítio de uma do mesmo tipo que sai (a sanita nova onde estava a antiga)
  let depois = juntarPeca(p.depois, item.tipo, id, centro ?? sitioDeQuemSai(p, item.tipo));
  if (prod?.w && prod.h) {
    depois = { ...depois, pecas: depois.pecas.map((x) => {
      if (x.id !== id) return x;
      const cx = x.x + x.w / 2, cy = x.y + x.h / 2, arr = (n: number) => Math.round(n / PASSO) * PASSO;
      // 6/11: perto de uma parede, encosta-se a ela com a frente e o fundo do produto
      return encaixar({ ...x, w: prod.w!, h: prod.h!, x: arr(cx - prod.w! / 2), y: arr(cy - prod.h! / 2) }, prod.w!, prod.h!, depois);
    }) };
  }
  return {
    ...p, depois,
    porColocar: (p.porColocar ?? []).filter((x) => x.id !== id),
    escolhas: item.produto ? { ...p.escolhas, [id]: item.produto } : p.escolhas,
    acompanha: item.acompanha ? { ...p.acompanha, [id]: item.acompanha } : p.acompanha,
  };
}

// ---------------------------------------------------------------- 5/11: os serviços

/** A quantidade sugerida de um serviço, tirada da planta do depois (o chão, as paredes, o perímetro, a zona do duche). */
export function qtdSugerida(sv: Servico, p: Projeto): number {
  const chao = areaChaoM2(p.depois.paredes) ?? 0;
  if (sv.sugestao === "chao") return chao;
  if (sv.sugestao === "paredes") return areaParedesM2(p.depois, alturaFinalCm(p.alturas) / 100) ?? 0;
  if (sv.sugestao === "perimetro") return Math.round(p.depois.paredes.reduce((s, w) => s + w.c, 0)) / 100;
  if (sv.sugestao === "duche") {
    // o chão da base e as paredes do duche até 2 m (dois lados)
    const base = [...p.depois.pecas, ...(p.porColocar ?? []).map((x) => ({ tipo: x.tipo, w: 120, h: 70 }))].find((x) => x.tipo === "base");
    return base ? r2((base.w * base.h) / 10000 + ((base.w + base.h) / 100) * 2) : 0;
  }
  return 1;
}

/** Os serviços recomendados: os que têm a ver com as peças do depois (ou com as que estão por colocar). */
export function servicosRecomendados(p: Projeto): Servico[] {
  const tipos = new Set([...p.depois.pecas.map((x) => x.tipo), ...(p.porColocar ?? []).map((x) => x.tipo)]);
  return SERVICOS.filter((sv) => sv.quando?.some((t) => tipos.has(t)));
}

export function juntarServico(p: Projeto, id: string): Projeto {
  const sv = servico(id);
  if (!sv || (p.servicos ?? []).some((x) => x.id === id)) return p;
  return { ...p, servicos: [...(p.servicos ?? []), { id, q: Math.max(sv.un === "un" ? 1 : 0.5, qtdSugerida(sv, p)) }] };
}
export const tirarServico = (p: Projeto, id: string): Projeto => ({ ...p, servicos: (p.servicos ?? []).filter((x) => x.id !== id) });
export const mudarQtdServico = (p: Projeto, id: string, q: number): Projeto => ({ ...p, servicos: (p.servicos ?? []).map((x) => (x.id === id ? { ...x, q: Math.max(0, q) } : x)) });

/** Escolher o produto de uma peça do depois: a peça fica no mesmo sítio, com o tamanho do produto (encaixar). Sem produto, só a escolha. */
export function escolherProduto(p: Projeto, pecaId: string, produtoId: string): Projeto {
  const prod = produto(produtoId);
  const pecas = p.depois.pecas.map((x) => (x.id === pecaId && prod?.w && prod.h ? encaixar(x, prod.w, prod.h, p.depois) : x));
  return { ...p, escolhas: { ...p.escolhas, [pecaId]: produtoId }, depois: { ...p.depois, pecas } };
}
/** Depois de muitas escolhas de uma vez (aplicar o estilo): cada peça com produto fica com o tamanho dele, no mesmo sítio. */
export const encaixarEscolhas = (p: Projeto): Projeto =>
  Object.entries(p.escolhas).reduce((acc, [id, prod]) => (acc.depois.pecas.some((x) => x.id === id) ? escolherProduto(acc, id, prod) : acc), p);
