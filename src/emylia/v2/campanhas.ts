// Marketing da V2: as campanhas de exemplo e as contas de cada uma. Funções puras: nada aqui muda o Estado.
// Três conceitos distintos (decisão 8 do levantamento de 13/10): o CANAL é a categoria fixa da empresa (toquesDocs.ts),
// a CAMPANHA é o que se cria e mede, e o ANÚNCIO é a colocação paga dentro da campanha, com o seu investimento.
// As leads de cada campanha vêm dos negócios de exemplo (seed + pessoas de exemplo), pelo primeiro toque de cada pessoa:
// a campanha do toque, ou (sem campanha) a origem. A receita só vem dos negócios ganhos (o valor do orçamento); nunca se escreve.
import { tot, type Estado, type Negocio } from "../motor";
import { ehGanho } from "../negociosApp";
import { dealsTodos } from "../dealsPessoas";
import { toquesDe, type Canal, type Toque } from "../toquesDocs";

export const CANAIS: readonly Canal[] = ["Redes sociais pagas", "Pesquisa", "Offline", "Parcerias", "Outros"];

/** Onde se pode pôr um anúncio (as origens pagas da empresa). */
export const ONDE_ANUNCIAR: readonly string[] = ["Meta Ads", "Google Ads", "TikTok Ads", "Outdoor", "Panfleto", "Feira", "Influencer"];

export type TipoCampo = "texto" | "texto_longo" | "telefone" | "email" | "numero" | "escolha" | "data";
export const TIPOS_CAMPO: readonly { id: TipoCampo; nome: string }[] = [
  { id: "texto", nome: "Texto curto" }, { id: "texto_longo", nome: "Texto longo" }, { id: "telefone", nome: "Telefone" },
  { id: "email", nome: "Email" }, { id: "numero", nome: "Número" }, { id: "escolha", nome: "Escolha de uma lista" }, { id: "data", nome: "Data" },
];

export interface CampoForm { id: string; rotulo: string; tipo: TipoCampo; obrigatorio: boolean; opcoes?: string[] }

/** Os campos que se podem juntar ao formulário (escolher em vez de escrever). */
export const CAMPOS_DISPONIVEIS: readonly Omit<CampoForm, "id">[] = [
  { rotulo: "Nome", tipo: "texto", obrigatorio: true },
  { rotulo: "Telefone", tipo: "telefone", obrigatorio: true },
  { rotulo: "Email", tipo: "email", obrigatorio: false },
  { rotulo: "Localidade", tipo: "texto", obrigatorio: false },
  { rotulo: "Morada", tipo: "texto", obrigatorio: false },
  { rotulo: "Serviço", tipo: "escolha", obrigatorio: false, opcoes: ["Casa de banho", "Cozinha", "Outro"] },
  { rotulo: "Tipologia", tipo: "escolha", obrigatorio: false, opcoes: ["T1", "T2", "T3", "T4 ou maior"] },
  { rotulo: "Área (m²)", tipo: "numero", obrigatorio: false },
  { rotulo: "Prazo desejado", tipo: "escolha", obrigatorio: false, opcoes: ["O mais depressa possível", "1 a 3 meses", "3 a 6 meses"] },
  { rotulo: "Orçamento estimado", tipo: "escolha", obrigatorio: false, opcoes: ["Até 3.000 €", "3.000 a 6.000 €", "6.000 a 10.000 €", "Mais de 10.000 €"] },
  { rotulo: "Dia preferido", tipo: "data", obrigatorio: false },
  { rotulo: "Período", tipo: "escolha", obrigatorio: false, opcoes: ["Manhã", "Tarde", "Fim do dia"] },
  { rotulo: "Mensagem", tipo: "texto_longo", obrigatorio: false },
];

export type ModeloForm = "orcamento" | "visita" | "contacto";
export const MODELOS_FORM: readonly { id: ModeloForm; nome: string; campos: readonly string[] }[] = [
  { id: "orcamento", nome: "Pedido de orçamento", campos: ["Nome", "Telefone", "Email", "Localidade", "Serviço", "Orçamento estimado", "Mensagem"] },
  { id: "visita", nome: "Marcar visita", campos: ["Nome", "Telefone", "Morada", "Dia preferido", "Período"] },
  { id: "contacto", nome: "Contacto simples", campos: ["Nome", "Telefone", "Mensagem"] },
];

/** Os campos de um modelo de formulário, com ids estáveis (prefixo + posição). */
export function camposDoModelo(m: ModeloForm, prefixo: string): CampoForm[] {
  const modelo = MODELOS_FORM.find((x) => x.id === m)!;
  return modelo.campos.map((rot, i) => {
    const c = CAMPOS_DISPONIVEIS.find((x) => x.rotulo === rot)!;
    return { ...c, opcoes: c.opcoes ? [...c.opcoes] : undefined, id: `${prefixo}-f${i + 1}` };
  });
}

export interface Anuncio { id: string; onde: string; nome: string; investimento: number }

/** Uma submissão do formulário que ainda não virou lead: alguém tem de a aceitar ou rejeitar. */
export interface Submissao { id: string; nome: string; tel: string; quando: string; resumo: string }

export interface Campanha {
  id: string;
  nome: string;
  canal: Canal;
  /** Como se reconhece uma lead desta campanha: pela campanha do primeiro toque, ou (sem campanha) pela origem. */
  regra: { campanha?: string; origem?: string };
  modelo: ModeloForm;
  campos: CampoForm[];
  anuncios: Anuncio[];
  pendentes: Submissao[];
  /** Submissões aceites nesta sessão: contam como leads novas (na fase Lead, sem valor). */
  aceites: Submissao[];
  /** Criada nesta sessão (não tem leads da seed). */
  nova?: boolean;
}

const campanha = (o: Omit<Campanha, "campos" | "pendentes" | "aceites"> & { pendentes?: Submissao[] }): Campanha =>
  ({ ...o, campos: camposDoModelo(o.modelo, o.id), pendentes: o.pendentes ?? [], aceites: [] });

/** As campanhas de exemplo. Os nomes batem com as campanhas dos toques (toquesDocs.ts e pessoasExemplo.ts). */
export function campanhasExemplo(): Campanha[] {
  return [
    campanha({ id: "cmp-site", nome: "Site · pedido de orçamento", canal: "Outros", regra: { origem: "Site" }, modelo: "orcamento", anuncios: [],
      pendentes: [{ id: "sub-site-1", nome: "Vasco Rebelo", tel: "931 204 588", quando: "12/10 22:41", resumo: "Casa de banho · Odivelas · Até 3.000 €" }] }),
    campanha({ id: "cmp-coz-out", nome: "Cozinhas outubro", canal: "Redes sociais pagas", regra: { campanha: "Cozinhas outubro" }, modelo: "orcamento",
      anuncios: [{ id: "an-coz-out-1", onde: "Meta Ads", nome: "Vídeo cozinha A", investimento: 650 }, { id: "an-coz-out-2", onde: "Google Ads", nome: "Anúncio de texto", investimento: 480 }],
      pendentes: [
        { id: "sub-coz-1", nome: "Sofia Barata", tel: "917 330 120", quando: "13/10 08:05", resumo: "Cozinha · Loures · 6.000 a 10.000 €" },
        { id: "sub-coz-2", nome: "teste teste", tel: "000 000 000", quando: "12/10 03:12", resumo: "Sem localidade · mensagem vazia" },
      ] }),
    campanha({ id: "cmp-coz-set", nome: "Cozinhas setembro", canal: "Redes sociais pagas", regra: { campanha: "Cozinhas setembro" }, modelo: "orcamento",
      anuncios: [{ id: "an-coz-set-1", onde: "Meta Ads", nome: "Carrossel de cozinhas", investimento: 520 }] }),
    campanha({ id: "cmp-wc-out", nome: "Casa de banho outubro", canal: "Redes sociais pagas", regra: { campanha: "Casa de banho outubro" }, modelo: "orcamento",
      anuncios: [{ id: "an-wc-out-1", onde: "Meta Ads", nome: "Antes e depois", investimento: 400 }] }),
    campanha({ id: "cmp-outdoor", nome: "Outdoor A1", canal: "Offline", regra: { campanha: "Outdoor A1" }, modelo: "contacto",
      anuncios: [{ id: "an-outdoor-1", onde: "Outdoor", nome: "A1, saída de Setúbal", investimento: 900 }] }),
    campanha({ id: "cmp-feira", nome: "Feira Casa e Obra", canal: "Offline", regra: { origem: "Feira" }, modelo: "visita",
      anuncios: [{ id: "an-feira-1", onde: "Feira", nome: "Stand 14", investimento: 1200 }] }),
    campanha({ id: "cmp-recom", nome: "Recomendações", canal: "Parcerias", regra: { origem: "Indicação" }, modelo: "contacto", anuncios: [] }),
    campanha({ id: "cmp-chamadas", nome: "Chamadas diretas", canal: "Outros", regra: { origem: "Chamada" }, modelo: "contacto", anuncios: [] }),
  ];
}

/* ---------------------------------------------------------------- as contas */

/** O toque que dá a origem à pessoa (o primeiro). */
export type PrimeiroToque = Pick<Toque, "origem" | "campanha" | "porMapear">;

/** A lead pertence à campanha? Pela campanha do toque; sem campanha, pela origem (e nunca uma UTM por mapear). */
export function pertence(c: Pick<Campanha, "regra">, t: PrimeiroToque | undefined): boolean {
  if (!t) return false;
  if (c.regra.campanha) return t.campanha === c.regra.campanha;
  return !!c.regra.origem && !t.campanha && !t.porMapear && t.origem === c.regra.origem;
}

/** Os negócios de exemplo com o primeiro toque da pessoa (calculado uma vez por pessoa). */
export function negociosComToque(S: Estado): { deal: Negocio; toque: PrimeiroToque | undefined }[] {
  const cache = new Map<string, PrimeiroToque | undefined>();
  return dealsTodos(S).map((deal) => {
    if (!cache.has(deal.nome)) cache.set(deal.nome, toquesDe(S, deal.nome)[0]);
    return { deal, toque: cache.get(deal.nome) };
  });
}

/** O valor do negócio: o total do orçamento (com desconto); 0 sem orçamento. */
export function valorDeal(d: Negocio, S: Estado): number {
  return d.orc && d.orc.linhas.length ? tot(d, S).pf : 0;
}

/** Os cinco passos do funil da campanha. */
export const PASSOS_FUNIL = ["Lead", "Contacto", "Visita", "Negócio", "Ganho"] as const;

/** Uma lead da campanha, como aparece na secção Leads. */
export interface LeadCampanha { id: string; nome: string; fase: string; valor: number | null; ganho: boolean; perdido: boolean }

export interface Metricas {
  leads: number;
  ganhos: number;
  receita: number;
  investimento: number;
  /** null quando não há investimento ou não há leads (não se divide por zero). */
  custoLead: number | null;
  custoGanho: number | null;
  /** Quantas leads chegaram a cada passo do funil (um perdido conta até à fase onde ficou). */
  funil: number[];
}

export const investimentoDe = (c: Pick<Campanha, "anuncios">): number => c.anuncios.reduce((a, x) => a + x.investimento, 0);

/** Em que passo do funil está um negócio (0 Lead … 4 Ganho). */
export function passoFunil(d: Negocio): number {
  if (ehGanho(d)) return 4;
  return Math.min(d.fase, 3);
}

/** As contas de uma campanha a partir dos negócios (com o toque) e das submissões aceites. */
export function metricas(c: Campanha, negocios: readonly { deal: Negocio; toque: PrimeiroToque | undefined }[], S: Estado): Metricas {
  const seus = negocios.filter((n) => pertence(c, n.toque)).map((n) => n.deal);
  const funil = PASSOS_FUNIL.map(() => 0);
  for (const d of seus) for (let i = 0; i <= passoFunil(d); i++) funil[i]++;
  funil[0] += c.aceites.length;
  const ganhos = seus.filter(ehGanho);
  const receita = ganhos.reduce((a, d) => a + valorDeal(d, S), 0);
  const leads = seus.length + c.aceites.length, investimento = investimentoDe(c);
  return {
    leads, ganhos: ganhos.length, receita, investimento, funil,
    custoLead: investimento > 0 && leads > 0 ? investimento / leads : null,
    custoGanho: investimento > 0 && ganhos.length > 0 ? investimento / ganhos.length : null,
  };
}

/** As leads da campanha: as aceites agora primeiro, depois os negócios pela ordem da seed. */
export function leadsDaCampanha(c: Campanha, negocios: readonly { deal: Negocio; toque: PrimeiroToque | undefined }[], S: Estado): LeadCampanha[] {
  const FASE = ["Lead", "Contacto", "Visita", "Negócio", "Financeiro", "Obra"];
  return [
    ...c.aceites.map((s): LeadCampanha => ({ id: s.id, nome: s.nome, fase: "Lead (aceite agora)", valor: null, ganho: false, perdido: false })),
    ...negocios.filter((n) => pertence(c, n.toque)).map(({ deal: d }): LeadCampanha => {
      const v = valorDeal(d, S), ganho = ehGanho(d);
      return { id: `neg-${d.id}`, nome: d.nome, fase: d.perdido ? `Perdido em ${FASE[d.fase]}` : ganho ? `Ganho · ${FASE[d.fase]}` : FASE[d.fase], valor: v > 0 ? v : null, ganho, perdido: d.perdido };
    }),
  ];
}

/** As pessoas cujas leads não batem com nenhuma campanha (por exemplo uma UTM por mapear): para avisar na lista. */
export function semCampanha(campanhas: readonly Campanha[], negocios: readonly { deal: Negocio; toque: PrimeiroToque | undefined }[]): string[] {
  return [...new Set(negocios.filter((n) => !campanhas.some((c) => pertence(c, n.toque))).map((n) => n.deal.nome))];
}

/* ---------------------------------------------------------------- a lista */

export type ColunaCampanha = "nome" | "leads" | "ganhos" | "receita" | "investimento" | "custoLead" | "custoGanho";
export interface Ordem { col: ColunaCampanha; dir: "asc" | "desc" }
export const ORDEM_INICIAL: Ordem = { col: "ganhos", dir: "desc" };

export interface LinhaCampanha { c: Campanha; m: Metricas }

const semAcentos = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtra pela pesquisa (nome, canal ou onde anuncia) e ordena. Os vazios (custo sem investimento) ficam sempre no fim; o empate decide-se pelo nome. */
export function listaCampanhas(linhas: readonly LinhaCampanha[], q: string, o: Ordem): LinhaCampanha[] {
  const qq = semAcentos(q.trim());
  const visiveis = qq ? linhas.filter(({ c }) => semAcentos([c.nome, c.canal, ...c.anuncios.map((a) => a.onde)].join(" ")).includes(qq)) : [...linhas];
  const val = (l: LinhaCampanha): number | string | null => (o.col === "nome" ? l.c.nome : l.m[o.col]);
  const sinal = o.dir === "asc" ? 1 : -1;
  return visiveis.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null || y === null) return x === y ? a.c.nome.localeCompare(b.c.nome, "pt") : x === null ? 1 : -1;
    const r = typeof x === "string" ? x.localeCompare(y as string, "pt") : x - (y as number);
    return r !== 0 ? r * sinal : a.c.nome.localeCompare(b.c.nome, "pt");
  });
}

/** Clicar num cabeçalho: a mesma coluna troca o sentido; outra coluna começa pela ordem natural (texto A→Z, números do maior para o menor). */
export function proximaOrdem(o: Ordem, col: ColunaCampanha): Ordem {
  if (o.col === col) return { col, dir: o.dir === "asc" ? "desc" : "asc" };
  return { col, dir: col === "nome" ? "asc" : "desc" };
}

/* ---------------------------------------------------------------- partilhar */

export type ModoPartilha = "link" | "iframe" | "pixel";
export const MODOS_PARTILHA: readonly { id: ModoPartilha; nome: string; texto: string }[] = [
  { id: "link", nome: "Link", texto: "Para pôr num anúncio, num QR code ou numa mensagem." },
  { id: "iframe", nome: "No site (iframe)", texto: "O formulário aparece dentro de uma página do seu site." },
  { id: "pixel", nome: "Pixel", texto: "Para medir as visitas e as conversões dos anúncios." },
];

const slug = (s: string): string => semAcentos(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** O código a copiar para cada modo de partilha (de exemplo: o domínio não existe). */
export function codigoPartilha(c: Pick<Campanha, "id" | "nome">, modo: ModoPartilha): string {
  const url = `https://formularios.olyvia.pt/f/${slug(c.nome) || c.id}`;
  if (modo === "link") return url;
  if (modo === "iframe") return `<iframe src="${url}?embed=1" title="${c.nome}" width="100%" height="640" style="border:0"></iframe>`;
  return `<script async src="https://formularios.olyvia.pt/pixel.js" data-campanha="${c.id}"></script>`;
}

/* ---------------------------------------------------------------- o formulário */

/** Move um campo uma posição para cima (-1) ou para baixo (+1). Fora dos limites, fica igual. */
export function moverCampo(campos: readonly CampoForm[], i: number, delta: -1 | 1): CampoForm[] {
  const j = i + delta, r = [...campos];
  if (i < 0 || i >= r.length || j < 0 || j >= r.length) return r;
  [r[i], r[j]] = [r[j], r[i]];
  return r;
}

/** Os campos que ainda se podem juntar (os que o formulário não tem). */
export const camposPorJuntar = (campos: readonly CampoForm[]): Omit<CampoForm, "id">[] =>
  CAMPOS_DISPONIVEIS.filter((d) => !campos.some((c) => c.rotulo === d.rotulo));
