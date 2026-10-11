// Os filtros da V2 de Negócios, partilhados pelo Quadro e pelo dashboard. Funções puras: nada aqui muda o Estado.
// Cada negócio é "enriquecido" uma vez (LinhaN). O Quadro e o dashboard trabalham sobre as mesmas linhas e os mesmos filtros,
// por isso os cartões do dashboard batem com os do Quadro. Os filtros rápidos (Os meus, Todos, Com atraso, Casa de banho, Cozinha)
// continuam a viver no Estado (S.filtro); a pesquisa é a da página; os outros são os de FiltrosN.
import { PAPEIS, type Estado, type LinhaId } from "./motor";
import { idade } from "./leadsDocs";
import { cartoesV2, COLUNAS_V2, type CartaoV2 } from "./negociosDocs";
import { dealsTodos } from "./dealsPessoas";
import { docFase, ehGanho, negociosDe, textoOrcamentos, valorNegocio, type DocFase, type NegocioApp } from "./negociosApp";
import { distritoDe } from "./distritos";
import { probabilidadeDe } from "./perfilDocs";

export type FaixaValor = "ate3" | "3a6" | "mais6";
export type ParadoFaixa = "mais7" | "ate7" | "8a14" | "mais14";
export type ServicoN = "wc" | "coz" | "outros";

/** Os filtros do popover. Texto vazio quer dizer "sem este filtro". */
export interface FiltrosN {
  comercial: string;
  fase: "" | DocFase;
  tipo: "" | "contrato" | "direta";
  orcamentos: "" | "1" | "2+";
  faixa: "" | FaixaValor;
  distrito: string;
  periodo: "" | "7" | "30" | "90";
  /** Parado em Orçamento ou Proposta (só estas duas fases têm um "parado desde"). */
  parado: "" | ParadoFaixa;
  servico: "" | ServicoN;
}

export const SEM_FILTROS_N: FiltrosN = { comercial: "", fase: "", tipo: "", orcamentos: "", faixa: "", distrito: "", periodo: "", parado: "", servico: "" };

/** Tudo o que filtra o Quadro: o filtro rápido (do Estado), a pesquisa e os filtros do popover. */
export interface ContextoN { rapido: string; q: string; f: FiltrosN }

/** O que acontece ao carregar num cartão ou numa barra: junta filtros e muda para o Quadro. */
export interface AcaoN { f?: Partial<FiltrosN> }

export const SEM_DISTRITO_N = "Por indicar";

/** Um negócio com o que os filtros e os gráficos usam, calculado uma vez. */
export interface LinhaN {
  id: string;
  negocio: NegocioApp;
  /** O cartão do Quadro: só os negócios a decorrer (orçamento, proposta, contrato, financeiro) o têm. */
  cartao: CartaoV2 | null;
  doc: DocFase | null;
  comercial: string;
  texto: string;
  atraso: boolean;
  vendaDireta: boolean;
  nOrc: number;
  valor: number | null;
  distrito: string;
  /** Dias desde que o negócio entrou. */
  dias: number;
  /** Dias parado em Orçamento (desde que entrou) ou em Proposta (desde que foi enviada); `null` nas outras fases. */
  parado: number | null;
  linhas: LinhaId[];
  /** O negócio está ganho (contrato assinado, ou proposta aceite sem contrato, ou já em Financeiro ou Obra) e não foi perdido. */
  ganho: boolean;
  /** O motivo da perda, com a primeira letra maiúscula; `null` se não está perdido. */
  perdido: string | null;
  prob: number;
}

const localDe = (n: NegocioApp): string => n.deal.f.localidade || n.deal.local.split(",").pop()!.trim();
const maiuscula = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

function paradoDe(n: NegocioApp, doc: DocFase | null): number | null {
  if (doc === "orcamento") return idade(n.deal.quando);
  return doc === "proposta" ? idade(n.deal.orc?.enviada ?? n.deal.quando) : null;
}

function linhaDe(n: NegocioApp, cartao: CartaoV2 | null): LinhaN {
  const d = n.deal, doc = cartao ? cartao.doc : docFase(d), ganho = n.perdido === null && ehGanho(d);
  return {
    id: n.id, negocio: n, cartao, doc, comercial: PAPEIS[d.dono].nome, atraso: !!d.atraso, vendaDireta: n.vendaDireta, nOrc: n.orcamentos.length, valor: valorNegocio(n),
    texto: `${n.nome} ${d.tel} ${[n.titulo, textoOrcamentos(n)].filter(Boolean).join(" · ")} ${localDe(n)}`, distrito: distritoDe(localDe(n)) ?? SEM_DISTRITO_N,
    dias: idade(d.quando), parado: paradoDe(n, doc), linhas: n.linhas, ganho,
    perdido: n.perdido === null ? null : maiuscula(n.perdido), prob: probabilidadeDe(d),
  };
}

/** Todos os negócios de todas as pessoas (os perdidos e os ganhos incluídos), com o cartão do Quadro nos que a ele pertencem. */
export function linhasNegocios(S: Estado): LinhaN[] {
  const cartoes = new Map(cartoesV2(S).map((c) => [c.id, c]));
  const nomes = [...new Set(dealsTodos(S).map((d) => d.nome))];
  return nomes.flatMap((nome) => negociosDe(S, nome).map((n) => linhaDe(n, cartoes.get(n.id) ?? null)));
}

/* ---------------------------------------------------------------- aplicar os filtros */

export const faixaDe = (valor: number | null): FaixaValor | "sem" => (valor === null ? "sem" : valor <= 3000 ? "ate3" : valor <= 6000 ? "3a6" : "mais6");
export const faixaParado = (dias: number): Exclude<ParadoFaixa, "mais7"> => (dias <= 7 ? "ate7" : dias <= 14 ? "8a14" : "mais14");
export const servicoDe = (l: LinhaN): ServicoN => (l.linhas.includes("wc") ? "wc" : l.linhas.includes("coz") ? "coz" : "outros");

function rapidoVale(l: LinhaN, rapido: string): boolean {
  if (rapido === "meus") return l.negocio.deal.dono === "comercial";
  if (rapido === "wc" || rapido === "coz") return l.linhas.includes(rapido);
  return rapido === "atraso" ? l.atraso : true;
}

function paradoVale(l: LinhaN, p: FiltrosN["parado"]): boolean {
  if (p === "") return true;
  if (l.parado === null) return false;
  return p === "mais7" ? l.parado > 7 : faixaParado(l.parado) === p;
}

/** Regras que valem para qualquer negócio (a pesquisa, o filtro rápido de serviço e de dono, e os filtros do popover que falam de dinheiro, pessoa e data). */
const REGRAS_COMUNS: ReadonlyArray<(l: LinhaN, c: ContextoN) => boolean> = [
  (l, c) => c.q.trim() === "" || l.texto.toLowerCase().includes(c.q.trim().toLowerCase()),
  (l, c) => c.rapido === "atraso" || rapidoVale(l, c.rapido),
  (l, c) => !c.f.comercial || l.comercial === c.f.comercial,
  (l, c) => c.f.tipo === "" || (c.f.tipo === "direta") === l.vendaDireta,
  (l, c) => c.f.orcamentos === "" || (c.f.orcamentos === "1" ? l.nOrc === 1 : l.nOrc >= 2),
  (l, c) => c.f.faixa === "" || faixaDe(l.valor) === c.f.faixa,
  (l, c) => !c.f.distrito || l.distrito === c.f.distrito,
  (l, c) => c.f.periodo === "" || l.dias <= Number(c.f.periodo),
  (l, c) => c.f.servico === "" || servicoDe(l) === c.f.servico,
];

/** Regras que só falam de negócios a decorrer: o filtro "Com atraso", a fase e o tempo parado. */
const REGRAS_ABERTOS: ReadonlyArray<(l: LinhaN, c: ContextoN) => boolean> = [
  (l, c) => c.rapido !== "atraso" || l.atraso,
  (l, c) => !c.f.fase || l.doc === c.f.fase,
  (l, c) => paradoVale(l, c.f.parado),
];

/** Os negócios do Quadro que passam nos filtros (o que o Quadro mostra e o que o dashboard conta). */
export function selecionarQuadro(linhas: readonly LinhaN[], c: ContextoN): LinhaN[] {
  return linhas.filter((l) => l.cartao !== null && REGRAS_COMUNS.every((r) => r(l, c)) && REGRAS_ABERTOS.every((r) => r(l, c)));
}

/** Os negócios ganhos e perdidos (de sempre: os perdidos não têm data) que passam nos filtros que fazem sentido para eles (não a fase, o atraso nem o tempo parado, que são dos negócios a decorrer). */
export function selecionarResultados(linhas: readonly LinhaN[], c: ContextoN): LinhaN[] {
  return linhas.filter((l) => (l.ganho || l.perdido !== null) && REGRAS_COMUNS.every((r) => r(l, c)));
}

export const aplicarN = (f: FiltrosN, patch: Partial<FiltrosN> | undefined): FiltrosN => ({ ...f, ...patch });

/* ---------------------------------------------------------------- chips dos filtros ativos */

export interface ChipAtivoN { id: string; texto: string; limpar: Partial<FiltrosN> }

const NOME_FASE: Record<DocFase, string> = Object.fromEntries(COLUNAS_V2.map((c) => [c.id, c.nome])) as Record<DocFase, string>;
export const NOME_FAIXA: Record<FaixaValor, string> = { ate3: "Até 3.000 €", "3a6": "3.000 a 6.000 €", mais6: "Mais de 6.000 €" };
export const NOME_PARADO: Record<ParadoFaixa, string> = { mais7: "Há mais de 7 dias", ate7: "Até 7 dias", "8a14": "8 a 14 dias", mais14: "Mais de 14 dias" };
export const NOME_SERVICO: Record<ServicoN, string> = { wc: "Casa de banho", coz: "Cozinha", outros: "Outros serviços" };
const NOME_TIPO: Record<string, string> = { contrato: "Com contrato", direta: "Venda direta" };

const TEXTOS: { chave: keyof FiltrosN; texto: (v: string) => string }[] = [
  { chave: "comercial", texto: (v) => `Comercial: ${v}` },
  { chave: "fase", texto: (v) => `Fase: ${NOME_FASE[v as DocFase]}` },
  { chave: "tipo", texto: (v) => `Tipo: ${NOME_TIPO[v]}` },
  { chave: "orcamentos", texto: (v) => (v === "1" ? "Um orçamento" : "2 ou mais orçamentos") },
  { chave: "faixa", texto: (v) => `Valor: ${NOME_FAIXA[v as FaixaValor]}` },
  { chave: "distrito", texto: (v) => `Distrito: ${v}` },
  { chave: "periodo", texto: (v) => `Criado nos últimos ${v} dias` },
  { chave: "parado", texto: (v) => `Parado: ${NOME_PARADO[v as ParadoFaixa]}` },
  { chave: "servico", texto: (v) => `Serviço: ${NOME_SERVICO[v as ServicoN]}` },
];

/** Cada filtro do popover ligado, em texto, com o que o desliga. */
export function chipsAtivosN(f: FiltrosN): ChipAtivoN[] {
  return TEXTOS.filter((t) => f[t.chave]).map((t) => ({ id: t.chave, texto: t.texto(f[t.chave]), limpar: { [t.chave]: "" } }));
}

/** As opções dos selects que vêm dos dados. */
export function opcoesN(linhas: readonly LinhaN[]): { comercial: string[]; distrito: string[] } {
  const unicos = (l: string[]): string[] => [...new Set(l)].sort((a, b) => a.localeCompare(b, "pt"));
  return { comercial: unicos(linhas.map((l) => l.comercial)), distrito: unicos(linhas.map((l) => l.distrito)) };
}

/** Os filtros que os ganhos e os perdidos ignoram: a fase, o tempo parado e "Com atraso" (só falam de negócios a decorrer). */
export const ignoraResultados = (c: ContextoN): boolean => c.f.fase !== "" || c.f.parado !== "" || c.rapido === "atraso";
export const NOTA_RESULTADOS = "Não depende da fase, do atraso nem do tempo parado.";
