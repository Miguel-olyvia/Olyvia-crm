// A seleção guiada das necessidades (14/10/2026, versão Atual): a lógica, sem React.
// O comercial, de pé, com o telemóvel numa mão: um passo de cada vez, cartões que ligam e desligam ao toque,
// a quantidade que vem das medidas (ou 1), escrita no cartão ("12 m² · da visita"), e um "Mudar" discreto no cartão escolhido.
// Passos (14/10, 2.ª volta): O que se faz → uma pergunta por troca ("Mantém / Troca" e os produtos dessa troca) → Mais produtos
// → Escolhas do cliente → O que o cliente fornece, por serviço (só com "fornece materiais = Sim") → Resumo.
import { normal } from "./catalogo";
import { nfmt, servicosVisita, type MedKey, type Negocio, type Servico, type SvcId, type acoes } from "./motor";
import type { Catalogo, No, Produto } from "./v2/catalogoModelo";
import { nosAbaixo, precoProduto, qtdSugerida, textoClienteCompra, type Obrigacao } from "./produtosVisita";
import { categoriaDe, ilustracaoDoCatalogo, medidaDaSugestao, nomeCurto, objetoDaPergunta, palavrasDe, procurarServicos, qtdNaVisita, sugestaoQtd, tituloObrigacao, type TileServico } from "./necessidades";
import type { IlustracaoKey } from "./ilustracoes";

type A = ReturnType<typeof acoes>;

/* ------------------------------------------------------------------ os passos */
export type TipoPasso = "escolhas" | "servicos" | "pergunta" | "outros" | "fornece" | "resumo";
export interface PassoSel { k: string; tipo: TipoPasso; titulo: string; o?: Obrigacao }

/**
 * Os passos da seleção, pela ordem: primeiro o que se faz e os produtos; as Escolhas do cliente depois, porque o "Sim" a
 * "fornece materiais" abre a seguir "O que o cliente fornece" (por serviço, já com os serviços e os produtos escolhidos).
 */
export function passosSelecao(obr: Obrigacao[], clienteFornece: boolean, comEscolhas = true): PassoSel[] {
  return [
    { k: "servicos", tipo: "servicos", titulo: "O que se faz" },
    ...obr.map((o): PassoSel => ({ k: "q:" + o.sid, tipo: "pergunta", titulo: tituloObrigacao(o), o })),
    { k: "outros", tipo: "outros", titulo: "Mais produtos" },
    ...(comEscolhas ? [{ k: "escolhas", tipo: "escolhas" as const, titulo: "Escolhas do cliente" }] : []),
    ...(clienteFornece ? [{ k: "fornece", tipo: "fornece" as const, titulo: "Que produtos o cliente fornece" }] : []),
    { k: "resumo", tipo: "resumo", titulo: "Resumo" },
  ];
}

/** O passo seguinte (ou anterior) a partir de uma chave; se a chave já não existe (a pergunta saiu), fica no mesmo sítio da lista. */
export function vizinho(passos: PassoSel[], k: string, dir: 1 | -1, iAntes = 0): string | null {
  const i = passos.findIndex((p) => p.k === k);
  const j = i < 0 ? (dir === 1 ? Math.min(iAntes, passos.length - 1) : iAntes - 1) : i + dir;
  return j >= 0 && j < passos.length ? passos[j].k : null;
}

/* ------------------------------------------------------------------ nomes curtos para os cartões */
const SEP = /\s+[-–|]\s+|\s*\|\s*/;
const MEDIDA = /\(?\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m)?\s*[x×X]\s*\(?\d+(?:[.,+]\d+)*\)?(?:\s*(?:mm|cm|m)?\s*[x×X]\s*\d+(?:[.,]\d+)?)?\s*(?:mm|cm|m)?\b\)?|\b\d+(?:[.,]\d+)?\s?(?:mm|cm)\b/g;
const REF = /\b(?:ref|réf|cód|cod)\.?\s*:?\s*[A-Z0-9][\w-]*/gi;
const CODIGO = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{5,}\b/g;

/** "SANITA BOHEMIC BTW" → "Sanita bohemic btw" (só quando o nome vem quase todo em maiúsculas). */
export function semGritos(t: string): string {
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const maius = letras.replace(/[^A-ZÀ-Þ]/g, "").length;
  if (letras.length < 6 || maius / letras.length < 0.6) return t;
  const l = t.toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/**
 * O nome para um cartão, em duas partes: o nome curto (cabe em 2 linhas) e o detalhe (medidas, referências e o resto),
 * que vai numa 2.ª linha discreta. Ex.: "Móvel BRAGA c/ lavatório 80x81x36 - 2 Portas c/ Prat…" →
 * { nome: "Móvel BRAGA c/ lavatório", detalhe: "80x81x36 · 2 Portas c/ Prat…" }. O nome completo fica no title e no aria-label.
 */
export function encurtar(n: string, o: { categoria?: string | null; servico?: boolean } = {}): { nome: string; detalhe: string } {
  let t = o.servico ? nomeCurto(n.replace(/^\s*MO\s+/, "")) : n.trim();
  const det: string[] = [];
  // o que vem depois do primeiro separador ("-", "–", "|"), quando antes dele há um nome que se perceba (2 palavras, 14 letras)
  const partes = t.split(SEP).map((x) => x.trim()).filter(Boolean);
  if (partes.length > 1 && partes[0].split(/\s+/).length >= 2 && partes[0].length >= 14) { t = partes[0]; det.push(partes.slice(1).join(" · ")); }
  const tirar = (re: RegExp) => { t = t.replace(re, (m) => { det.unshift(m.trim().replace(/^\(|\)$/g, "")); return " "; }); };
  tirar(REF);
  tirar(MEDIDA);
  tirar(CODIGO);
  t = t.replace(/\s+/g, " ").replace(/[\s,;:/+-]+$/g, "").replace(/^[\s,;:/+-]+/g, "").trim();
  if (!t) return { nome: semGritos(n), detalhe: "" };
  // o prefixo da categoria ("Base de duche Extraplana Stone") sai quando sobram pelo menos duas palavras; a categoria passa ao detalhe
  if (o.categoria) {
    const cat = palavrasDe(o.categoria).map((w) => w.replace(/s$/, ""));
    const ws = t.split(/\s+/);
    let i = 0, c = 0;
    while (i < ws.length && c < cat.length) {
      const w = normal(ws[i]).replace(/s$/, "");
      if (w === cat[c]) { c++; i++; } else if (["de", "do", "da", "para", "p/"].includes(normal(ws[i]))) i++; else break;
    }
    const liga = ["de", "do", "da", "dos", "das", "para", "p/", "c/", "com", "em"].includes(normal(ws[i] ?? ""));
    if (c === cat.length && ws.length - i >= 2 && !liga) { t = ws.slice(i).join(" "); det.unshift(o.categoria); }
  }
  t = semGritos(t);
  return { nome: t.charAt(0).toUpperCase() + t.slice(1), detalhe: det.map((x) => x.replace(/\s+/g, " ")).filter(Boolean).join(" · ") };
}

/* ------------------------------------------------------------------ filtros (uma fila por baixo da pesquisa) */
/** Os ofícios dos serviços, pelos mais usados (os escolhidos e os do pacote primeiro). */
export function oficiosPorUso(tiles: TileServico[], linha: string): string[] {
  const m = new Map<string, number>();
  for (const t of tiles) {
    const peso = (t.on ? 1e7 : 0) + (t.origem === "pacote" ? 1e6 : 0) + (t.linhas.includes(linha as never) ? Math.min(t.usos, 1e5) : 0);
    m.set(t.oficio, (m.get(t.oficio) ?? 0) + peso);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt")).map(([n]) => n);
}

/** Os serviços a mostrar: a pesquisa e o filtro do ofício juntam-se; sem pesquisa, os mais prováveis primeiro. */
export function servicosFiltrados(tiles: TileServico[], f: { q?: string; oficio?: string | null; linha: string }): TileServico[] {
  const base = f.q?.trim()
    ? procurarServicos(tiles, f.q)
    : [...tiles].sort((a, b) => Number(b.on) - Number(a.on) || Number(b.origem === "pacote") - Number(a.origem === "pacote")
      || Number(b.linhas.includes(f.linha as never)) - Number(a.linhas.includes(f.linha as never)) || b.usos - a.usos);
  return f.oficio ? base.filter((t) => t.oficio === f.oficio) : base;
}

const ROTULO_ILUS: Partial<Record<IlustracaoKey, string>> = {
  sanita: "Sanitas", bide: "Bidés", lavatorio: "Lavatórios", "base-duche": "Bases de duche", banheira: "Banheiras", "coluna-duche": "Colunas de duche",
  resguardo: "Resguardos", torneira: "Torneiras", "movel-wc": "Móveis WC", espelho: "Espelhos", toalheiro: "Toalheiros", "acessorio-wc": "Acessórios WC",
  revestimento: "Revestimentos", pavimento: "Pavimentos", cola: "Colas", "armario-cozinha": "Armários de cozinha", bancada: "Bancadas", "lava-loica": "Lava-loiças",
  eletrodomestico: "Eletrodomésticos", exaustor: "Exaustores", janela: "Janelas", porta: "Portas", roupeiro: "Roupeiros", eletrico: "Material elétrico",
  iluminacao: "Iluminação", avac: "AVAC", esquentador: "Águas quentes", quimico: "Químicos", limpeza: "Limpeza", material: "Materiais", ferramenta: "Ferramentas",
};
/** A categoria de um produto para o filtro: a da ilustração (Sanitas, Bases de duche…), senão a subcategoria, senão o nó. */
const cacheCat = new WeakMap<Produto, string>();
export function categoriaFiltro(p: Produto, arvore: No[]): string {
  let c = cacheCat.get(p);
  if (c == null) { c = ROTULO_ILUS[ilustracaoDoCatalogo(arvore, p)] ?? categoriaDe(p, arvore); cacheCat.set(p, c); }
  return c;
}
/** As categorias de uma lista já ordenada, pela ordem em que aparecem (os mais prováveis primeiro). */
export function categoriasDaLista(produtos: Produto[], arvore: No[]): string[] {
  const vistas = new Set<string>();
  for (const p of produtos) vistas.add(categoriaFiltro(p, arvore));
  return [...vistas];
}

/* ------------------------------------------------------------------ os mais prováveis em "Mais produtos" */
const DA_LINHA: Record<string, IlustracaoKey[]> = {
  wc: ["espelho", "toalheiro", "acessorio-wc", "movel-wc", "resguardo", "coluna-duche", "torneira", "iluminacao", "lavatorio", "bide"],
  coz: ["armario-cozinha", "bancada", "lava-loica", "eletrodomestico", "exaustor", "torneira", "iluminacao"],
};
const DE_OBRA: IlustracaoKey[] = ["cola", "material", "quimico", "limpeza", "ferramenta", "revestimento", "pavimento"];
/** A nota de um produto para "Mais produtos" numa linha (WC ou cozinha): os acessórios da linha à frente; os materiais de obra no fim. */
export function notaNaLinha(img: IlustracaoKey, linha: string): number {
  const l = DA_LINHA[linha] ?? [];
  const i = l.indexOf(img);
  return i >= 0 ? 100 - i : DE_OBRA.includes(img) ? -1 : 0;
}

/* ------------------------------------------------------------------ os mais prováveis numa troca */
/**
 * A ordem dos produtos de uma troca: os que respondem a cada parte da pergunta ("a sanita e a base de duche") primeiro,
 * intercalados (uma base, uma sanita, uma base…), para que os primeiros cartões mostrem um pouco de cada; o resto depois (ordem estável).
 */
export function ordenarParaTroca(produtos: Produto[], objeto: string | null | undefined, arvore: No[]): Produto[] {
  if (!objeto) return produtos;
  const partes = objeto.split(/\s+e\s+/).map((x) => palavrasDe(x).map((w) => w.replace(/s$/, ""))).filter((w) => w.length);
  if (!partes.length) return produtos;
  const baldes: Produto[][] = partes.map(() => []), resto: Produto[] = [];
  for (const p of produtos) {
    // palavras inteiras: "sanitários" não responde a "a sanita"
    const t = new Set(normal(`${p.n} ${p.sub ?? ""} ${categoriaFiltro(p, arvore)}`).replace(/s\b/g, "").split(/[^a-z0-9]+/));
    const i = partes.findIndex((ws) => ws.every((w) => t.has(w)));
    (i >= 0 ? baldes[i] : resto).push(p);
  }
  const out: Produto[] = [];
  for (let j = 0; baldes.some((b) => j < b.length); j++) for (const b of baldes) if (j < b.length) out.push(b[j]);
  return [...out, ...resto];
}

/* ------------------------------------------------------------------ mobilidade reduzida */
const BOM_MOB = /bases? de duche|bases? duche|barra|apoio|pega de seguran|banco|rebat|suspens/;
const MAU_MOB = /banheira/;
/** Com mobilidade reduzida: as bases de duche, as barras e os bancos à frente; as banheiras para o fim (ordem estável). */
export function ordenarMobilidade<T extends { n: string; sub?: string }>(ps: T[], mobilidade: boolean): T[] {
  if (!mobilidade) return ps;
  const nota = (p: T) => { const t = normal(p.n + " " + (p.sub ?? "")); return (BOM_MOB.test(t) ? 1 : 0) - (MAU_MOB.test(t) ? 1 : 0); };
  return ps.map((p, i) => ({ p, i, s: nota(p) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
}

/* ------------------------------------------------------------------ quantidades */
/** A quantidade ao escolher um serviço: a da medida da visita, senão 1 (os pontos elétricos vêm do diagnóstico). */
export function qtdServicoAoEscolher(c: { id: SvcId; n: string; un: string; qm: number }, d: Negocio, medidaDe?: MedKey | null): number {
  if (medidaDaSugestao(c, d, medidaDe)) return sugestaoQtd(c, d, medidaDe);
  if (c.id === "eletr") return sugestaoQtd(c, d, medidaDe) || 1;
  return 1;
}

/**
 * Se a quantidade de um produto já vem de uma regra do serviço que obriga ao ramo dele: "por medida" (6 m² de pavimento)
 * ou fixa (1 sanita). Nesse caso não se mostra o ajuste (salvo se for contável e passar de 1).
 */
export function quantidadeDaRegra(K: Catalogo, p: { no: string | null }, sids: SvcId[]): boolean {
  return sids.some((sid) => {
    const no = K.exigeProduto?.[sid], r = K.qtdDe?.[sid];
    return !!no && !!r && !!p.no && nosAbaixo(K.arvore, no).has(p.no);
  });
}

const CONTAVEIS = new Set(["un", "ud", "pç", "pc", "pcs", "conj", "cj", "kit", "par"]);
export const contavel = (un: string) => CONTAVEIS.has(normal(un).replace(/\.$/, ""));
/** A quantidade escrita no cartão (sem fila de números): "12 m² · da visita" quando vem da medida, senão "1 un". */
export const textoQtd = (o: { q: number; un: string; daMedida: boolean }) => `${nfmt(o.q)} ${o.un}${o.daMedida ? " · da visita" : ""}`;

/* ------------------------------------------------------------------ tocar nos cartões */
/** Tocar num cartão de serviço: liga ou desliga. O do pacote sem medida e o que só vem com um produto não se tocam. */
export function tocarServico(A: Pick<A, "servico" | "extra">, d: Negocio, t: TileServico, medidaDe?: MedKey | null): "ligou" | "desligou" | null {
  const manual = (d.visita.extra[t.sid] || 0) > 0;
  if (t.origem === "pacote") { if (t.semMedida) return null; A.servico(d.id, t.sid); return t.on ? "desligou" : "ligou"; }
  if (manual) { A.extra(d.id, t.sid, 0); return "desligou"; }
  if (t.de) return null; // vem com o produto: desliga-se o produto
  A.extra(d.id, t.sid, qtdServicoAoEscolher({ id: t.sid, n: t.n, un: t.un, qm: 1 }, d, medidaDe));
  return "ligou";
}

/** Tocar num cartão de produto (fora das perguntas): liga com a quantidade sugerida, ou desliga. */
export function tocarProduto(A: Pick<A, "produto" | "tirarProduto">, K: Catalogo, d: Negocio, p: Produto): "juntou" | "tirou" {
  if ((d.visita.prod ?? []).some((x) => x.id === p.id)) { A.tirarProduto(d.id, p.id); return "tirou"; }
  A.produto(d.id, p, qtdSugerida(K, p, servicosVisita(d), d.visita.med));
  return "juntou";
}

/** "Mantém" ou "Troca". Mantém tira os produtos que se tinham escolhido para esta troca (e, com eles, a instalação que traziam). */
export function responderTroca(A: Pick<A, "manter" | "tirarProduto">, K: Catalogo, d: Negocio, o: Pick<Obrigacao, "sid" | "no">, r: "sim" | "nao") {
  A.manter(d.id, o.sid, r);
  if (r === "sim") {
    const ramo = nosAbaixo(K.arvore, o.no);
    for (const p of [...(d.visita.prod ?? [])]) if (p.no && ramo.has(p.no)) A.tirarProduto(d.id, p.id);
  }
}

/**
 * A troca está resolvida (avança-se sozinho)? Cada parte da pergunta ("a sanita e a base de duche") precisa de um produto
 * escolhido que lhe corresponda; as partes que nenhum produto do ramo tem não contam. Sem pergunta, basta um produto.
 */
export function trocaResolvida(o: Pick<Obrigacao, "pergunta">, escolhidos: { n: string; sub?: string }[], doRamo: { n: string; sub?: string }[]): boolean {
  if (!escolhidos.length) return false;
  const obj = objetoDaPergunta(o.pergunta);
  if (!obj) return true;
  const txt = (p: { n: string; sub?: string }) => new Set(normal(p.n + " " + (p.sub ?? "")).replace(/s\b/g, "").split(/[^a-z0-9]+/));
  const partes = obj.comArtigo.split(/\s+e\s+/).map((x) => palavrasDe(x).map((w) => w.replace(/s$/, ""))).filter((w) => w.length);
  return partes.every((ws) => {
    const bate = (p: { n: string; sub?: string }) => { const t = txt(p); return ws.every((w) => t.has(w)); };
    return !doRamo.some(bate) || escolhidos.some(bate);
  });
}

/* ------------------------------------------------------------------ o que o cliente fornece */
/**
 * Um cartão de "o cliente fornece": um produto escolhido (fica a zero), o material de uma troca ainda sem produto
 * ("o cliente compra"), ou um consumível ou um equipamento da receita de um serviço (sai do custo dessa linha).
 * `valor`: quanto baixa no total quando está ligado (€); `q` e `un`: a quantidade, para a 2.ª linha.
 */
export interface ItemFornece {
  k: string; tipo: "produto" | "servico"; id: string; n: string; on: boolean; no?: string | null; texto?: string;
  sid?: SvcId; valor?: number; q?: number; un?: string;
}
/** Tudo o que pode ser fornecido pelo cliente fora das receitas: os produtos escolhidos e o material das trocas sem produto escolhido. */
export function itensFornece(d: Negocio, obr: Obrigacao[], nomeSvc: (sid: SvcId) => string): ItemFornece[] {
  const v = d.visita;
  const prods: ItemFornece[] = (v.prod ?? []).filter((p) => p.q > 0).map((p) => ({
    k: "p:" + p.id, tipo: "produto", id: p.id, n: p.n, on: !!p.cliente, no: p.no, valor: precoProduto(p), q: p.q, un: p.un,
  }));
  const svcs: ItemFornece[] = obr.filter((o) => o.estado !== "mantem" && o.estado !== "produto").map((o) => ({
    k: "s:" + o.sid, tipo: "servico", id: o.sid, sid: o.sid, n: tituloObrigacao(o), on: o.estado === "cliente", texto: textoClienteCompra(o, nomeSvc(o.sid)), valor: 0,
  }));
  return [...prods, ...svcs];
}

export interface BlocoFornece { sid: SvcId | null; titulo: string; itens: ItemFornece[] }
const r2 = (x: number) => Math.round(x * 100) / 100;
/**
 * "O que o cliente fornece" por serviço: um bloco por serviço escolhido, com os produtos escolhidos para ele (os do ramo
 * que o serviço exige e os que o trazem), o material da troca ainda sem produto, e os consumíveis e os equipamentos da
 * receita (quantidade por unidade × a quantidade do serviço). Em cada bloco, o que mais baixa o total vem primeiro.
 * Os produtos que não são de nenhum serviço ficam num bloco "Outros produtos", no fim.
 */
export function blocosFornece(d: Negocio, obr: Obrigacao[], sids: SvcId[], o: {
  arvore: No[]; exige: Partial<Record<SvcId, string>>; nomeSvc: (sid: SvcId) => string;
}): BlocoFornece[] {
  const base = itensFornece(d, obr, o.nomeSvc), usados = new Set<string>();
  const prod = new Map((d.visita.prod ?? []).map((p) => [p.id, p]));
  const blocos = sids.map((sid): BlocoFornece => {
    const no = o.exige[sid], ramo = no ? nosAbaixo(o.arvore, no) : null;
    const ps = base.filter((it) => it.tipo === "produto" && !usados.has(it.k) && (prod.get(it.id)?.svc === sid || (!!ramo && !!it.no && ramo.has(it.no))));
    ps.forEach((it) => usados.add(it.k));
    // 15/10: o cliente só fornece produtos (os consumíveis e os equipamentos das receitas são sempre da empresa)
    // 27/10 (Rúben): e só dos produtos escolhidos: sai o "material por escolher" dos serviços sem produto
    return { sid, titulo: o.nomeSvc(sid), itens: ps.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)) };
  }).filter((b) => b.itens.length);
  const resto = base.filter((it) => it.tipo === "produto" && !usados.has(it.k)).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  return resto.length ? [...blocos, { sid: null, titulo: "Outros produtos", itens: resto }] : blocos;
}
/** Quanto baixa no total com o que está ligado (€). */
export const poupanca = (itens: ItemFornece[]) => r2(itens.reduce((a, it) => a + (it.on ? it.valor ?? 0 : 0), 0));

/**
 * Liga ou desliga "o cliente fornece": o produto fica a zero (a instalação mantém-se); o serviço fica com "o cliente compra";
 * o consumível e o equipamento saem do custo da linha do serviço (a mão de obra fica).
 */
export function marcarFornece(A: Pick<A, "produtoCliente" | "clienteCompra">, d: Negocio, it: ItemFornece, on: boolean) {
  if (it.tipo === "produto") A.produtoCliente(d.id, it.id, on);
  else A.clienteCompra(d.id, it.id, on ? it.texto ?? it.n : null);
}
export function fornecerTodos(A: Pick<A, "produtoCliente" | "clienteCompra">, d: Negocio, itens: ItemFornece[], on: boolean) {
  for (const it of itens) if (it.on !== on) marcarFornece(A, d, it, on);
}

/* ------------------------------------------------------------------ cores e estilo */
export const CORES = ["Branco", "Madeira clara", "Cinzento", "Preto", "Bege"] as const;
/** O texto de "Cores e estilo" em escolhas: as conhecidas e o resto (o "Outro"). */
export function lerCores(t: string | undefined): { escolhidas: string[]; outro: string } {
  const partes = (t ?? "").split(/\s*,\s*|\s+e\s+/).map((x) => x.trim()).filter(Boolean);
  const escolhidas: string[] = [], resto: string[] = [];
  for (const p of partes) { const c = CORES.find((x) => normal(x) === normal(p)); if (c) escolhidas.push(c); else resto.push(p); }
  return { escolhidas, outro: resto.join(", ") };
}
export const escreverCores = (escolhidas: string[], outro: string) => [...CORES.filter((c) => escolhidas.includes(c)), ...(outro.trim() ? [outro.trim()] : [])].join(", ");
