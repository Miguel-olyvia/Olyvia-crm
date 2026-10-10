// Os toques de cada pessoa: cada vez que ela entrou em contacto (um formulário online ou um registo à mão).
// Funções puras e determinísticas: nada aqui muda o Estado nem existe no Estado. Os toques são de exemplo,
// calculados a partir do nome, da linha, da origem, dos campos e da data de cada negócio.
import { PAPEIS, type Estado, type Negocio } from "./motor";
import { idade, localDe, somarDias, tempoDesde, type CampoRotulado } from "./leadsDocs";

export type Via = "online" | "mao";
export type Canal = "Redes sociais pagas" | "Pesquisa" | "Offline" | "Parcerias" | "Outros";
export type EstadoToque = "por_rever" | "associada" | "gerou_lead" | "revista";

/** As origens da empresa, pela ordem em que aparecem nos formulários. */
export const ORIGENS: string[] = ["Site", "Chamada", "Meta Ads", "TikTok Ads", "Google Ads", "Outdoor", "Panfleto", "Feira", "Influencer", "Indicação"];

/** O mapa fixo da empresa: a que canal pertence cada origem. O que não está aqui é "Outros". */
export const CANAL_DE_ORIGEM: Record<string, Canal> = {
  "Meta Ads": "Redes sociais pagas", "TikTok Ads": "Redes sociais pagas",
  "Google Ads": "Pesquisa",
  Outdoor: "Offline", Panfleto: "Offline", Feira: "Offline",
  Influencer: "Parcerias", "Indicação": "Parcerias",
  Site: "Outros", Chamada: "Outros",
};

export function canalDe(origem: string): Canal {
  return CANAL_DE_ORIGEM[origem] ?? "Outros";
}

export const ESTADO_TOQUE: Record<EstadoToque, string> = {
  por_rever: "Por rever", associada: "Associada à ficha", gerou_lead: "Gerou lead nova", revista: "Revista",
};

/** A UTM em bruto, como veio no endereço. Só os toques online com UTM têm. */
export interface Utm {
  source: string;
  medium: string;
  campaign: string | null;
  content: string | null;
  term: string | null;
  /** Por exemplo "gclid=Cj0K…" ou "fbclid=IwAR…". */
  clickId: string | null;
}

export interface Toque {
  id: string;
  /** Sempre verdadeiro: estes dados não existem no protótipo. */
  exemplo: true;
  via: Via;
  formulario: string | null;
  origem: string;
  canal: Canal;
  campanha: string | null;
  utm: Utm | null;
  /** Tem UTM que ninguém registou na empresa: não se sabe a que campanha pertence. */
  porMapear: boolean;
  data: string;
  campos: CampoRotulado[];
  estado: EstadoToque;
  /** Porque não gerou lead nova (só quando não gerou). */
  motivo: string | null;
  conflito: string | null;
}

export interface AvisoOrigem {
  tipo: "conflito" | "duplicado";
  texto: string;
}

export interface InfoOrigem {
  origem: CampoRotulado[];
  aviso: AvisoOrigem | null;
}

/* ---------------------------------------------------------------- o que cada pessoa fez */

type FormKind = "site" | "campanha" | "outdoor";

interface Esboco {
  /** Dias depois da chegada da pessoa. */
  dias: number;
  via: Via;
  origem: string;
  campanha: string | null;
  formulario: FormKind | null;
  utm: Utm | null;
  porMapear?: boolean;
  estado?: EstadoToque;
  motivo?: string;
  /** Nome da outra pessoa cujo telefone veio com o email desta. */
  conflitoCom?: string;
}

const utm = (source: string, medium: string, campaign: string | null, content: string | null, term: string | null, clickId: string | null): Utm =>
  ({ source, medium, campaign, content, term, clickId });

const SITE: Esboco = { dias: 0, via: "online", origem: "Site", campanha: null, formulario: "site", utm: null };
const CHAMADA: Esboco = { dias: 0, via: "mao", origem: "Chamada", campanha: null, formulario: null, utm: null };
const INDICACAO: Esboco = { dias: 0, via: "mao", origem: "Indicação", campanha: null, formulario: null, utm: null };
const COZINHAS_OUTUBRO = "Cozinhas outubro";

/** O que cada pessoa da demonstração fez. Quem não está aqui deriva-se da origem do negócio (ver esbocosDe). */
const REGISTO: Record<string, Esboco[]> = {
  "Ana Martins": [{ dias: 0, via: "online", origem: "TikTok Ads", campanha: null, formulario: "campanha", porMapear: true,
    estado: "por_rever", motivo: "Origem reconhecida pelo UTM; campanha por mapear (o utm_campaign não corresponde a nenhuma campanha da empresa).",
    utm: utm("tiktok", "paid", "tt_wc_out", "video_02", null, "ttclid=E.C.P.5kQ8Z2m1") }],
  "Pedro Lopes": [SITE],
  "Rita Sousa": [{ dias: 0, via: "online", origem: "Meta Ads", campanha: COZINHAS_OUTUBRO, formulario: "campanha",
    utm: utm("facebook", "paid_social", "cozinhas-outubro", "video-cozinha-a", null, "fbclid=IwAR3kX9mQ2vLpT7") }],
  "Manuel Costa": [CHAMADA],
  "Luísa Freitas": [{ dias: 0, via: "online", origem: "Google Ads", campanha: COZINHAS_OUTUBRO, formulario: "campanha",
    utm: utm("google", "cpc", "cozinhas-outubro", "anuncio-texto-1", "cozinhas à medida lisboa", "gclid=Cj0KCQjw7pK2BhDJ") }],
  "Hugo Matos": [INDICACAO, { dias: 10, via: "online", origem: "Site", campanha: null, formulario: "site", utm: null, estado: "por_rever", conflitoCom: "Manuel Costa",
    motivo: "Não criou lead nova: o email e o telefone apontam para fichas diferentes." }],
  "Carla Nunes": [
    { dias: 0, via: "online", origem: "Outdoor", campanha: "Outdoor A1", formulario: "outdoor", utm: utm("qr", "outdoor", "outdoor-a1", "a1-setubal", null, null) },
    { dias: 12, via: "online", origem: "Google Ads", campanha: COZINHAS_OUTUBRO, formulario: "campanha", estado: "associada",
      utm: utm("google", "cpc", "cozinhas-outubro", "anuncio-texto-2", "cozinha moderna setúbal", "gclid=Cj0KCQjw3xN8BhAM"),
      motivo: "O telefone já existia nesta ficha, por isso não criou uma lead nova." },
  ],
  "Sérgio Pinto": [CHAMADA],
  "Tiago Almeida": [SITE],
  "Marta Lima": [{ dias: 0, via: "mao", origem: "Feira", campanha: null, formulario: null, utm: null }],
  "Joana Ribeiro": [INDICACAO],
};

/** Para quem não está no registo (por exemplo uma lead criada no ecrã): deriva-se da origem do negócio. */
function esbocosDe(d: Negocio): Esboco[] {
  const o = d.origem.toLowerCase();
  if (o.startsWith("campanha")) {
    const campanha = (d.f.campanha || d.origem).split(" · ")[0];
    return [{ dias: 0, via: "online", origem: "Meta Ads", campanha: campanha[0].toUpperCase() + campanha.slice(1), formulario: "campanha",
      utm: utm("facebook", "paid_social", "campanha", null, null, "fbclid=IwAR0aB3cD4eF5gH") }];
  }
  if (o === "site") return [SITE];
  if (o.startsWith("recomend")) return [INDICACAO];
  return [CHAMADA];
}

/* ---------------------------------------------------------------- os campos de cada toque */

const semente = (nome: string): number => [...nome].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100003, 7);
const escolher = <T,>(l: readonly T[], n: number): T => l[n % l.length];

const TIPOLOGIAS: readonly string[] = ["T1", "T2", "T3"];
const AREA_DE: Record<string, string> = { T1: "55", T2: "80", T3: "110", T4: "140" };
const PRAZOS: readonly string[] = ["O mais depressa possível", "1 a 3 meses", "3 a 6 meses"];
const ORCAMENTOS: Record<Negocio["linha"], readonly string[]> = {
  wc: ["Até 3.000 €", "3.000 a 6.000 €"],
  coz: ["6.000 a 10.000 €", "Mais de 10.000 €"],
};
const OBS: Record<Negocio["linha"], readonly string[]> = {
  wc: ["Quero trocar a banheira por duche.", "Casa de banho pequena, preciso de aproveitar o espaço."],
  coz: ["Cozinha nova, com bancada em pedra.", "Quero abrir a cozinha para a sala."],
};

function nomeFormulario(k: FormKind, d: Negocio): string {
  if (k === "site") return "Site · pedido de orçamento";
  if (k === "outdoor") return "Outdoor A1 · pedido de contacto";
  return d.linha === "coz" ? "Cozinha nova" : "Casa de banho nova";
}

const preenchido = (c: CampoRotulado): boolean => !!c.valor;

function camposOnline(d: Negocio, telefone: string, completo: boolean): CampoRotulado[] {
  const n = semente(d.nome);
  const tipologia = d.f.tipologia || escolher(TIPOLOGIAS, n);
  const base: CampoRotulado[] = [
    { rotulo: "Nome", valor: d.nome }, { rotulo: "Telefone", valor: telefone }, { rotulo: "Email", valor: d.f.email || "" },
  ];
  const obs = d.f.pedido || escolher(OBS[d.linha], n);
  if (!completo) return [...base, { rotulo: "Observações", valor: obs }].filter(preenchido);
  return [
    ...base,
    { rotulo: "Localidade", valor: localDe(d) },
    { rotulo: "Tipologia", valor: tipologia },
    { rotulo: "Área (m²)", valor: d.f.area_util_m2 || AREA_DE[tipologia] || "" },
    { rotulo: "Prazo desejado", valor: d.f.prazo || escolher(PRAZOS, n + 1) },
    { rotulo: "Orçamento estimado", valor: d.f.orc_cliente || escolher(ORCAMENTOS[d.linha], n) },
    { rotulo: "Observações", valor: obs },
  ].filter(preenchido);
}

function camposMao(d: Negocio, origem: string): CampoRotulado[] {
  const nota = d.f.pedido || (origem === "Indicação" ? "Indicado por um cliente da empresa." : "Ligou a pedir orçamento.");
  return [
    { rotulo: "Nome", valor: d.nome }, { rotulo: "Telefone", valor: d.tel }, { rotulo: "Serviço", valor: d.servico },
    { rotulo: "Localidade", valor: localDe(d) }, { rotulo: "Registada por", valor: PAPEIS[d.dono].n }, { rotulo: "Notas", valor: nota },
  ].filter(preenchido);
}

/* ---------------------------------------------------------------- os toques */

function estadoInicial(d: Negocio, via: Via): EstadoToque {
  if (d.fase >= 3) return "revista";
  return via === "online" && d.fase === 0 ? "por_rever" : "gerou_lead";
}

/**
 * Os toques de uma pessoa, do mais antigo para o mais recente. Quem tem vários negócios usa o mais antigo como base.
 * Vazio se a pessoa não existe.
 */
export function toquesDe(S: Estado, nome: string): Toque[] {
  const seus = S.deals.filter((d) => d.nome === nome);
  if (!seus.length) return [];
  const d = seus.reduce((a, x) => (idade(x.quando) > idade(a.quando) ? x : a), seus[0]);
  return (REGISTO[nome] ?? esbocosDe(d)).map((e, i): Toque => {
    const outro = e.conflitoCom ? S.deals.find((x) => x.nome === e.conflitoCom) : undefined;
    const telefone = outro ? outro.tel : d.tel;
    const primeiro = i === 0;
    return {
      id: `toq-${d.id}-${i + 1}`, exemplo: true, via: e.via, origem: e.origem, canal: canalDe(e.origem),
      formulario: e.formulario ? nomeFormulario(e.formulario, d) : null, campanha: e.campanha, utm: e.utm, porMapear: !!e.porMapear,
      data: (e.dias ? somarDias(d.quando, e.dias) : d.quando) || "hoje",
      campos: e.via === "mao" ? camposMao(d, e.origem) : camposOnline(d, telefone, primeiro),
      estado: e.estado ?? estadoInicial(d, e.via),
      motivo: e.motivo ?? null,
      conflito: outro ? `O email é de ${d.nome}, mas o telefone (${outro.tel}) já pertence a ${outro.nome}.` : null,
    };
  });
}

/** A UTM em bruto numa linha, por exemplo "utm_source=google · utm_medium=cpc · gclid=Cj0K…". Vazio sem UTM. */
export function utmTexto(u: Utm | null): string {
  if (!u) return "";
  const partes: [string, string | null][] = [
    ["utm_source", u.source], ["utm_medium", u.medium], ["utm_campaign", u.campaign], ["utm_content", u.content], ["utm_term", u.term],
  ];
  return [...partes.filter((p): p is [string, string] => !!p[1]).map(([k, v]) => `${k}=${v}`), ...(u.clickId ? [u.clickId] : [])].join(" · ");
}

/** A campanha por palavras: a registada, "por mapear" ou "sem campanha". */
export function campanhaDe(t: Toque): string {
  return t.campanha ?? (t.porMapear ? "Por mapear (o utm_campaign não corresponde a nenhuma campanha da empresa)" : "Sem campanha");
}

function resumo(t: Toque): string {
  const quando = tempoDesde(t.data);
  return [t.origem, t.campanha ?? (t.porMapear ? "campanha por mapear" : null), t.data, quando && quando !== t.data ? `(${quando})` : null].filter(Boolean).join(" · ");
}

/** Origem, canal, campanha, formulário, via e primeiro e último toque (o primeiro toque é a origem da pessoa), com o aviso de duplicado ou conflito. */
export function infoOrigem(toques: Toque[]): InfoOrigem {
  if (!toques.length) return { origem: [], aviso: null };
  const p = toques[0], u = toques[toques.length - 1];
  const conflito = toques.find((t) => t.conflito);
  const aviso: AvisoOrigem | null = conflito
    ? { tipo: "conflito", texto: `${conflito.conflito} Por rever na ficha.` }
    : toques.some((t) => t.estado === "associada")
      ? { tipo: "duplicado", texto: "Voltou a pedir por outro canal. Ficou na mesma ficha, sem criar uma lead duplicada." }
      : null;
  return {
    origem: [
      { rotulo: "Origem", valor: p.origem },
      { rotulo: "Canal", valor: p.canal },
      { rotulo: "Campanha", valor: campanhaDe(p) },
      { rotulo: "Formulário", valor: p.formulario ?? "Sem formulário (registada à mão)" },
      { rotulo: "Via de entrada", valor: p.via === "online" ? "Online, por formulário" : "À mão, registada pela equipa" },
      { rotulo: "Primeiro toque", valor: resumo(p) },
      { rotulo: "Último toque", valor: toques.length > 1 ? resumo(u) : "O mesmo, é o único" },
    ],
    aviso,
  };
}
