// A etapa "Necessidades do cliente" (14/10/2026): a lógica, sem React.
// · Serviços em mosaicos: os do pacote, os do Catálogo e os que vêm com os produtos, agrupados por ofício,
//   com os mais pedidos desta linha à frente e o resto por pesquisa ("Ver mais serviços").
// · Produtos: a ordem dentro de um ramo (os que batem com a pergunta primeiro), a pesquisa e as categorias,
//   prontas para os ~2200 produtos do Catálogo da Mudelar (texto de pesquisa guardado por produto).
// · O resumo ("6 serviços · 3 produtos · 1.240 € estimado") e o que falta, em palavras.
import { CATALOGO, normal, type LinhaCat } from "./catalogo";
import { juntarDivisoes } from "./campos";
import { LINHAS, garantirServico, r2, servicosVisita, type Estado, type MedKey, type Negocio, type Servico, type SvcId, type acoes } from "./motor";
import { caminho, oficioDe, oficios, type Catalogo, type No, type Produto } from "./v2/catalogoModelo";
import { ativosDoPacote, precoProduto, qtdSugerida, servicosTrazidos, type Obrigacao } from "./produtosVisita";
import { iconeDoServico, ilustracaoDoProduto, type IconeServicoKey, type IlustracaoKey } from "./ilustracoes";

/* ------------------------------------------------------------------ textos */
/** O nome do serviço sem o ruído da tabela: "Mão de Obra Construção de Nicho (valor por unidade)" → "Construção de nicho";
 *  "Instalação de Sanita Compacta" → "Sanita compacta". */
export function nomeCurto(n: string): string {
  let t = n
    .replace(/^\s*m[ãa]o de obra\s*[-–·]?\s*/i, "")
    .replace(/^(instala[çc][ãa]o|coloca[çc][ãa]o)(\s+de)?\s+/i, "")
    .replace(/\s*\((valor|até|p\/)[^)]*\)\s*/gi, " ")
    .replace(/\s+(m2|m²|ml)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  // "Instalação de Sanita Compacta" → "Instalação de sanita compacta" (só as maiúsculas no meio de palavras comuns)
  t = t.replace(/(?<=\s)([A-ZÁÉÍÓÚÂÊÔÃÕÇ])([a-záéíóúâêôãõç]+)/g, (_m, a: string, b: string) => a.toLowerCase() + b);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : n;
}

/** O que a pergunta pergunta: "O cliente mantém a sanita?" → { comArtigo: "a sanita", nome: "Sanita" }. */
export function objetoDaPergunta(pergunta: string | null | undefined): { comArtigo: string; nome: string } | null {
  const m = pergunta && /mant[ée]m\s+(.+?)\s*\??\s*$/i.exec(pergunta);
  if (!m) return null;
  const comArtigo = m[1].trim();
  const nome = comArtigo.replace(/(^|\s)(o|a|os|as)\s+/gi, "$1").trim();
  return nome ? { comArtigo, nome: nome.charAt(0).toUpperCase() + nome.slice(1) } : null;
}

/** O título de uma obrigação: o objeto da pergunta ("Sanita"), senão a última parte do ramo ("Louças e torneiras"). */
export const tituloObrigacao = (o: Pick<Obrigacao, "pergunta" | "caminho">) => objetoDaPergunta(o.pergunta)?.nome ?? o.caminho.split(" › ").pop() ?? o.caminho;

/** O que falta, em palavras: "dizer se o cliente mantém a sanita", "escolher o pavimento". */
export function faltaEmPalavras(o: Obrigacao): string {
  const obj = objetoDaPergunta(o.pergunta);
  if (o.estado === "pergunta") return `dizer se o cliente mantém ${obj?.comArtigo ?? "o que tem"}`;
  return `escolher ${obj ? obj.comArtigo : "o produto de " + (o.caminho.split(" › ").pop() ?? o.caminho).toLowerCase()}`;
}

/** "a, b e c". */
export const juntarE = (l: string[]) => (l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`);

/* ------------------------------------------------------------------ serviços */
export type OrigemServico = "pacote" | "catalogo";
export interface TileServico {
  sid: SvcId;
  n: string;
  curto: string;
  oficio: string;
  icone: IconeServicoKey;
  origem: OrigemServico;
  /** Escolhido (do pacote e ativo, posto à mão ou trazido por um produto). */
  on: boolean;
  qt: number;
  un: string;
  /** Preço de tabela por unidade. */
  preco: number;
  /** De onde vem a quantidade: das medidas (a chave) ou escrita (null). */
  medida: MedKey | null;
  /** Do pacote mas sem a medida: não se pode ligar. */
  semMedida?: boolean;
  /** Só está porque um produto o traz: os nomes dos produtos. */
  de?: string[];
  usos: number;
  linhas: LinhaCat[];
}

/** Só para mostrar: um serviço do Catálogo ainda sem ficha em S.svc (não grava nada nem copia o estado). */
export function servicoLeitura(S: Estado, sid: SvcId): Servico | null {
  return S.svc[sid] ?? garantirServico({ svc: {} } as unknown as Estado, sid);
}

/** A quantidade sugerida ao juntar um serviço do Catálogo: das medidas quando faz sentido, senão a habitual nos orçamentos. */
export function sugestaoQtd(c: { id: SvcId; n: string; un: string; qm: number }, d: Negocio, medidaDe?: MedKey | null): number {
  const med = d.visita.med;
  if (medidaDe && med[medidaDe] > 0) return med[medidaDe];
  const n = normal(c.n);
  if (c.id === "eletr") return Number(juntarDivisoes(d.f).diag_pontos_eletricos) || c.qm; // somados em todas as divisões
  if (c.un === "m²" && n.includes("pavimento") && med.pav) return med.pav;
  if (c.un === "m²" && (n.includes("revestimento") || n.includes("pintura")) && med.par) return med.par;
  return c.qm;
}
/** Se a quantidade sugerida vem das medidas (e de qual). */
export function medidaDaSugestao(c: { id: SvcId; n: string; un: string }, d: Negocio, medidaDe?: MedKey | null): MedKey | null {
  const med = d.visita.med, n = normal(c.n);
  if (medidaDe && med[medidaDe] > 0) return medidaDe;
  if (c.un === "m²" && n.includes("pavimento") && med.pav) return "pav";
  if (c.un === "m²" && (n.includes("revestimento") || n.includes("pintura")) && med.par) return "par";
  return null;
}

/** Todos os mosaicos de serviço desta visita: os do pacote, os do Catálogo e os de S.svc que não estão em nenhum. */
export function tilesServicos(S: Estado, K: Catalogo, d: Negocio): TileServico[] {
  const L = LINHAS[d.linha], v = d.visita;
  const tr = servicosTrazidos(v.prod ?? []);
  const ofDe = (sid: SvcId, cat?: string) => oficioDe(K.arvore, K.classe[sid])?.n ?? cat ?? "Outros";
  const icone = (sid: SvcId, n: string, of: string) => iconeDoServico(n, of, K.icone?.[sid]);
  const out: TileServico[] = [];
  const vistos = new Set<SvcId>();
  for (const [sid, k] of L.map) {
    const s = S.svc[sid];
    if (!s) continue;
    const qt = v.med[k] || 0, of = ofDe(sid);
    out.push({ sid, n: s.n, curto: nomeCurto(s.n), oficio: of, icone: icone(sid, s.n, of), origem: "pacote", on: qt > 0 && !v.off.includes(sid), qt, un: s.un,
      preco: s.preco, medida: k, semMedida: !(qt > 0), usos: Number.MAX_SAFE_INTEGER, linhas: [d.linha] });
    vistos.add(sid);
  }
  const doCatalogo = (sid: SvcId, n: string, un: string, cat: string | undefined, usos: number, linhas: LinhaCat[]) => {
    const s = servicoLeitura(S, sid), mao = v.extra[sid] || 0, t = tr[sid];
    const of = ofDe(sid, cat);
    out.push({ sid, n, curto: nomeCurto(n), oficio: of, icone: icone(sid, n, of), origem: "catalogo", on: mao > 0 || !!t, qt: mao > 0 ? mao : t?.q ?? 0, un,
      preco: s?.preco ?? 0, medida: null, de: mao > 0 ? undefined : t?.de, usos, linhas });
    vistos.add(sid);
  };
  for (const c of CATALOGO) if (!vistos.has(c.id)) doCatalogo(c.id, c.n, c.un, c.cat, c.usos, c.linhas);
  // os serviços de S.svc que não são do pacote desta linha nem do Catálogo (ex.: o pacote da outra linha)
  for (const [sid, s] of Object.entries(S.svc)) if (!vistos.has(sid)) doCatalogo(sid, s.n, s.un, s.perfil, 0, []);
  return out;
}

/** A ordem dos ofícios: a da árvore do Catálogo, e os que não estão nela no fim. */
export function ordemOficios(arvore: No[], tiles: TileServico[]): string[] {
  const daArvore = oficios(arvore).map((o) => o.n);
  const resto = [...new Set(tiles.map((t) => t.oficio))].filter((o) => !daArvore.includes(o));
  return [...daArvore, ...resto];
}

export interface GrupoServicos { oficio: string; tiles: TileServico[]; total: number }
/**
 * Os grupos por ofício. Por omissão (todos = false) cada grupo mostra os escolhidos e os do pacote e enche até `max`
 * com os mais pedidos desta linha; com todos = true, mostra o ofício inteiro (pelos mais pedidos).
 * Grupos sem nada para mostrar saem.
 */
export function gruposServicos(tiles: TileServico[], arvore: No[], linha: LinhaCat, o: { todos?: boolean; max?: number } = {}): GrupoServicos[] {
  const max = o.max ?? 4;
  const porUsos = (a: TileServico, b: TileServico) => b.usos - a.usos;
  return ordemOficios(arvore, tiles).flatMap((of) => {
    const doOficio = tiles.filter((t) => t.oficio === of).sort(porUsos);
    if (!doOficio.length) return [];
    if (o.todos) return [{ oficio: of, tiles: doOficio, total: doOficio.length }];
    const fixos = doOficio.filter((t) => t.on || t.origem === "pacote");
    const sugeridos = doOficio.filter((t) => !t.on && t.origem !== "pacote" && t.linhas.includes(linha) && t.usos > 0);
    const mostrar = [...fixos, ...sugeridos.slice(0, Math.max(0, max - fixos.length))];
    const ids = new Set(mostrar.map((t) => t.sid));
    const ordem = doOficio.filter((t) => ids.has(t.sid));
    return ordem.length ? [{ oficio: of, tiles: ordem, total: doOficio.length }] : [];
  });
}

/** A pesquisa nos serviços (nome e ofício, sem acentos): os que começam pela pesquisa primeiro, depois os mais pedidos. */
export function procurarServicos(tiles: TileServico[], q: string): TileServico[] {
  const qq = normal(q.trim());
  if (!qq) return [];
  const pal = qq.split(/\s+/);
  return tiles
    .filter((t) => { const txt = normal(t.n + " " + t.oficio); return pal.every((p) => txt.includes(p)); })
    .sort((a, b) => Number(normal(b.curto).startsWith(qq)) - Number(normal(a.curto).startsWith(qq)) || Number(b.on) - Number(a.on) || b.usos - a.usos);
}

/* ------------------------------------------------------------------ produtos */
const cacheTexto = new WeakMap<Produto, string>();
/** O texto de pesquisa de um produto (nome, marca, subcategoria, referência e ramo), feito uma vez por produto. */
export function textoProdutoPesquisa(p: Produto, arvore: No[]): string {
  let t = cacheTexto.get(p);
  if (t == null) {
    t = normal([p.n, p.marca, p.sub, p.sku, p.desc, caminho(arvore, p.no)].filter(Boolean).join(" "));
    cacheTexto.set(p, t);
  }
  return t;
}

/** A categoria de um produto para a grelha: a subcategoria real, senão o nó da árvore. */
export function categoriaDe(p: Produto, arvore: No[]): string {
  if (p.sub?.trim()) return p.sub.trim();
  const n = p.no ? arvore.find((x) => x.id === p.no) : undefined;
  return n?.n ?? "Sem classificação";
}
/** As categorias com quantos produtos têm, das maiores para as menores. */
export function categorias(produtos: Produto[], arvore: No[]): { n: string; q: number }[] {
  const m = new Map<string, number>();
  for (const p of produtos) { const c = categoriaDe(p, arvore); m.set(c, (m.get(c) ?? 0) + 1); }
  return [...m.entries()].map(([n, q]) => ({ n, q })).sort((a, b) => b.q - a.q || a.n.localeCompare(b.n, "pt"));
}

export interface FiltroProdutos { q?: string; cat?: string | null; marca?: string | null }
/** Filtra por pesquisa (todas as palavras), categoria e marca. */
export function filtrarProdutos(produtos: Produto[], arvore: No[], f: FiltroProdutos): Produto[] {
  const pal = normal((f.q ?? "").trim()).split(/\s+/).filter(Boolean);
  return produtos.filter((p) =>
    (!f.cat || categoriaDe(p, arvore) === f.cat)
    && (!f.marca || p.marca === f.marca)
    && (!pal.length || pal.every((w) => textoProdutoPesquisa(p, arvore).includes(w))));
}

const VAZIAS = new Set(["a", "o", "as", "os", "e", "de", "do", "da", "dos", "das", "com", "em"]);
/** As palavras que contam de um objeto ("a sanita e a base de duche" → sanita, base, duche). */
export const palavrasDe = (t: string) => normal(t).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VAZIAS.has(w));
/** Ordena os produtos de um ramo para uma pergunta: os que têm as palavras do objeto no nome ou na subcategoria primeiro (ordem estável). */
export function ordenarParaObjeto(produtos: Produto[], objeto: string | null | undefined): Produto[] {
  const pal = objeto ? palavrasDe(objeto) : [];
  if (!pal.length) return produtos;
  const nota = (p: Produto) => { const t = normal(p.n + " " + (p.sub ?? "")); return pal.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0); };
  return produtos.map((p, i) => ({ p, i, s: nota(p) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
}

/** As marcas de uma lista, das mais frequentes para as menos. */
export function marcasDe(produtos: Produto[]): string[] {
  const m = new Map<string, number>();
  for (const p of produtos) if (p.marca) m.set(p.marca, (m.get(p.marca) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt")).map(([n]) => n);
}

/** A ilustração de um produto do Catálogo: o img; senão a subcategoria, o nome e o ramo da árvore. */
export const ilustracaoDoCatalogo = (arvore: No[], p: Produto): IlustracaoKey => ilustracaoDoProduto(p, caminho(arvore, p.no));

/* ------------------------------------------------------------------ a escolha guiada */
/**
 * Em que passo está um serviço que pede produto ("Sanita"):
 * perguntar ("O cliente mantém a sanita?") → mantem (Sim) | escolher (Não: os cartões das sanitas) → escolhido;
 * ou cliente (o cliente compra, quando fornece materiais).
 */
export type PassoGuiado = "perguntar" | "mantem" | "escolher" | "escolhido" | "cliente";
export function passoGuiado(o: Pick<Obrigacao, "estado">): PassoGuiado {
  switch (o.estado) {
    case "pergunta": return "perguntar";
    case "mantem": return "mantem";
    case "produto": return "escolhido";
    case "cliente": return "cliente";
    default: return "escolher";
  }
}
/** Se os cartões dos produtos se mostram: só no passo "escolher", ou quando se pediu "Juntar ou trocar". */
export const mostraCartoes = (passo: PassoGuiado, aberto: boolean) => passo === "escolher" || (passo === "escolhido" && aberto);

type AcoesNec = Pick<ReturnType<typeof acoes>, "produto" | "tirarProduto" | "manter">;
/**
 * Tocar num cartão da escolha guiada: junta o produto com a quantidade sugerida (das medidas) ou, se já lá está, tira-o.
 * Escolher com a pergunta por responder é o mesmo que dizer "Não, vai trocar". Devolve o que fez.
 */
export function tocarProdutoGuiado(A: AcoesNec, K: Catalogo, d: Negocio, o: Pick<Obrigacao, "sid" | "pergunta">, p: Produto): "juntou" | "tirou" {
  const v = d.visita;
  if ((v.prod ?? []).some((x) => x.id === p.id)) { A.tirarProduto(d.id, p.id); return "tirou"; }
  A.produto(d.id, p, qtdSugerida(K, p, servicosVisita(d), v.med));
  if (o.pergunta && !v.manter?.[o.sid]) A.manter(d.id, o.sid, "nao");
  return "juntou";
}

/**
 * Os blocos a mostrar: sai o serviço que só está porque um produto escolhido o traz e que esse produto já resolve
 * (escolher a sanita traz a instalação da sanita; perguntar outra vez "O cliente mantém a sanita?" seria repetir).
 */
export function obrigacoesAMostrar(obr: Obrigacao[], d: Negocio): Obrigacao[] {
  const v = d.visita, ativos = ativosDoPacote(LINHAS[d.linha].map, v.med, v.off), tr = servicosTrazidos(v.prod ?? []);
  return obr.filter((o) => !(o.estado === "produto" && tr[o.sid] && !ativos.includes(o.sid) && !((v.extra[o.sid] || 0) > 0)));
}

/* ------------------------------------------------------------------ o resumo */
export interface ResumoNec { servicos: number; produtos: number; total: number }
/** Quantos serviços e produtos, e o valor estimado (serviços a preço de tabela e produtos ao preço de venda; o que o cliente fornece a zero). */
export function resumoNecessidades(S: Estado, d: Negocio, sids: SvcId[]): ResumoNec {
  const L = LINHAS[d.linha], v = d.visita, prod = v.prod ?? [];
  const ativos = ativosDoPacote(L.map, v.med, v.off), tr = servicosTrazidos(prod);
  let total = 0, servicos = 0;
  for (const sid of sids) {
    const s = servicoLeitura(S, sid);
    if (!s) continue;
    servicos++;
    const k = L.map.find(([x]) => x === sid)?.[1];
    const q = ativos.includes(sid) && k ? v.med[k] || 0 : (v.extra[sid] || 0) > 0 ? v.extra[sid]! : tr[sid]?.q ?? 0;
    total += q * s.preco;
  }
  const ps = prod.filter((p) => p.q > 0);
  for (const p of ps) if (!p.cliente) total += precoProduto(p);
  return { servicos, produtos: ps.length, total: r2(total) };
}
