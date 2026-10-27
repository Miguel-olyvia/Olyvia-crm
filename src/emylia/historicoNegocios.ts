// O histórico de Negócios (27/10/2026): todos os negócios de sempre (abertos, ganhos, com a obra feita e perdidos), numa linha cada, com os
// filtros da Lista e os números do Painel. Funções puras sobre o Estado: nada aqui o muda. Servem NegociosHistorico.tsx (versão simples).
// As datas do protótipo vêm sem ano ("30/09 21:40", "hoje 09:12"): o ano é o de hoje, ou o anterior se o dia ainda não chegou.
import { FASES, PAPEIS, nomeLinha, tot, type Estado, type Evento, type Negocio } from "./motor";

export type EstadoH = "aberto" | "ganho" | "concluido" | "perdido";
export const NOME_ESTADO: Record<EstadoH, string> = { aberto: "Em aberto", ganho: "Ganho", concluido: "Obra feita", perdido: "Perdido" };
export const ESTADOS: readonly EstadoH[] = ["aberto", "ganho", "concluido", "perdido"];

const DIA = 86_400_000;
const meiaNoite = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "30/09 21:40", "02/10", "15/10/2026 10:00" ou "hoje 09:12" numa data; null se não se perceber. */
export function dataDe(q: string | undefined, hoje: Date = new Date()): Date | null {
  if (!q) return null;
  const t = q.trim().toLowerCase();
  if (t.startsWith("hoje") || t === "agora") return meiaNoite(hoje);
  if (t.startsWith("ontem")) return new Date(meiaNoite(hoje).getTime() - DIA);
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(t);
  if (!m) return null;
  const dia = +m[1], mes = +m[2] - 1;
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
  if (m[3]) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], mes, dia);
  const d = new Date(hoje.getFullYear(), mes, dia);
  return d.getTime() > meiaNoite(hoje).getTime() ? new Date(hoje.getFullYear() - 1, mes, dia) : d;
}

export const diasEntre = (de: Date, ate: Date): number => Math.max(0, Math.round((meiaNoite(ate).getTime() - meiaNoite(de).getTime()) / DIA));

/** Em que pé está o negócio: perdido, com a obra feita, ganho (contrato assinado ou venda aceite) ou ainda em aberto. */
export function estadoDe(d: Negocio): EstadoH {
  if (d.perdido) return "perdido";
  if (d.obra.auto?.estado === "assinado" || d.obra.plano?.estado === "concluída") return "concluido";
  if (d.orc?.contrato === "assinado" || (d.orc?.vendaDireta && d.orc.aceite) || d.fase >= 4) return "ganho";
  return "aberto";
}

export interface LinhaH {
  id: number;
  d: Negocio;
  nome: string;
  servico: string;
  linha: string;
  local: string;
  origem: string;
  comercial: string;
  fase: number;
  estado: EstadoH;
  /** O total da proposta sem IVA; null sem orçamento. */
  valor: number | null;
  entrada: Date | null;
  /** O último acontecimento do histórico (ou a entrada, se não houver). */
  ultima: Date | null;
  ultimoTexto: string;
  /** Dias desde o último acontecimento (só nos abertos; nos outros é null). */
  parado: number | null;
  eventos: number;
  motivo: string;
  /** O texto onde a procura vai buscar (minúsculas). */
  procura: string;
}

const maiuscula = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const localidade = (d: Negocio): string => d.f.localidade || d.local.split(",").pop()!.trim();

/** Uma linha por negócio, de sempre (incluindo os perdidos). */
export function linhasHistorico(S: Estado, hoje: Date = new Date()): LinhaH[] {
  return S.deals.map((d) => {
    const estado = estadoDe(d), entrada = dataDe(d.quando, hoje) ?? dataDe(d.hist[d.hist.length - 1]?.q, hoje);
    // o histórico guarda o mais recente primeiro; procura-se a data mais recente que se perceba
    const datadas = d.hist.map((e) => ({ e, q: dataDe(e.q, hoje) })).filter((x) => x.q) as { e: Evento; q: Date }[];
    const ult = datadas.reduce<{ e: Evento; q: Date } | null>((a, x) => (!a || x.q.getTime() > a.q.getTime() ? x : a), null);
    const ultima = ult?.q ?? entrada;
    let valor: number | null = null;
    if (d.orc) { try { valor = tot(d, S).pf; } catch { valor = null; } }
    const l: LinhaH = {
      id: d.id, d, nome: d.nome, servico: d.servico || nomeLinha(d), linha: nomeLinha(d), local: localidade(d),
      origem: maiuscula(d.origem || "Sem origem"), comercial: PAPEIS[d.dono]?.nome ?? d.dono, fase: d.fase, estado, valor, entrada, ultima,
      ultimoTexto: ult?.e.t ?? d.hist[0]?.t ?? "Sem registos", parado: estado === "aberto" && ultima ? diasEntre(ultima, hoje) : null,
      eventos: d.hist.length, motivo: d.motivoPerda ?? "", procura: "",
    };
    l.procura = [d.id, d.nome, d.tel, l.servico, d.local, l.origem, l.comercial, l.motivo, ...d.hist.map((e) => e.t)].join(" ").toLowerCase();
    return l;
  });
}

/* ------------------------------------------------------------------ filtros */
export type Periodo = "tudo" | "7" | "30" | "90" | "365";
export type FaixaValor = "todos" | "sem" | "ate5" | "5a15" | "mais15";
export const NOME_PERIODO: Record<Periodo, string> = { tudo: "Desde sempre", "7": "Últimos 7 dias", "30": "Últimos 30 dias", "90": "Últimos 90 dias", "365": "Último ano" };
export const NOME_VALOR: Record<FaixaValor, string> = { todos: "Qualquer valor", sem: "Sem orçamento", ate5: "Até 5.000 €", "5a15": "5.000 a 15.000 €", mais15: "Mais de 15.000 €" };

export interface FiltrosH {
  estado: EstadoH | "todos";
  /** A fase (índice em FASES) ou "" para todas. */
  fase: string;
  linha: string;
  origem: string;
  comercial: string;
  periodo: Periodo;
  valor: FaixaValor;
  /** Só os abertos parados há 7 dias ou mais. */
  parados: boolean;
}
export const SEM_FILTROS_H: FiltrosH = { estado: "todos", fase: "", linha: "", origem: "", comercial: "", periodo: "tudo", valor: "todos", parados: false };

const naFaixa = (v: number | null, f: FaixaValor): boolean =>
  f === "todos" ? true : f === "sem" ? v === null : v === null ? false : f === "ate5" ? v < 5000 : f === "5a15" ? v >= 5000 && v <= 15000 : v > 15000;

/** As linhas que passam os filtros e a procura. `sem` deixa de fora um filtro (para as contagens de cada opção). */
export function filtrarH(ls: readonly LinhaH[], f: FiltrosH, q: string, hoje: Date = new Date(), sem?: keyof FiltrosH): LinhaH[] {
  const ql = q.trim().toLowerCase(), desde = f.periodo === "tudo" ? null : meiaNoite(hoje).getTime() - +f.periodo * DIA;
  return ls.filter((l) =>
    (!ql || l.procura.includes(ql)) &&
    (sem === "estado" || f.estado === "todos" || l.estado === f.estado) &&
    (sem === "fase" || f.fase === "" || l.fase === +f.fase) &&
    (sem === "linha" || !f.linha || l.linha === f.linha) &&
    (sem === "origem" || !f.origem || l.origem === f.origem) &&
    (sem === "comercial" || !f.comercial || l.comercial === f.comercial) &&
    (sem === "periodo" || desde === null || (l.entrada !== null && l.entrada.getTime() >= desde)) &&
    (sem === "valor" || naFaixa(l.valor, f.valor)) &&
    (sem === "parados" || !f.parados || (l.parado ?? 0) >= 7));
}

/** Quantos filtros estão ligados (para o botão "Limpar"). */
export const filtrosLigados = (f: FiltrosH): number =>
  (Object.keys(SEM_FILTROS_H) as (keyof FiltrosH)[]).filter((k) => f[k] !== SEM_FILTROS_H[k]).length;

/** As opções distintas de um campo, por ordem alfabética. */
export const opcoes = (ls: readonly LinhaH[], campo: "linha" | "origem" | "comercial"): string[] =>
  [...new Set(ls.map((l) => l[campo]))].sort((a, b) => a.localeCompare(b, "pt"));

/* ------------------------------------------------------------------ ordem */
export type ColunaH = "nome" | "fase" | "estado" | "valor" | "origem" | "comercial" | "entrada" | "ultima";
export interface OrdemH { coluna: ColunaH; dir: "asc" | "desc" }
const ORDEM_ESTADO: Record<EstadoH, number> = { aberto: 0, ganho: 1, concluido: 2, perdido: 3 };
const CHAVE: Record<ColunaH, (l: LinhaH) => string | number | null> = {
  nome: (l) => l.nome, fase: (l) => l.fase, estado: (l) => ORDEM_ESTADO[l.estado], valor: (l) => l.valor, origem: (l) => l.origem,
  comercial: (l) => l.comercial, entrada: (l) => l.entrada?.getTime() ?? null, ultima: (l) => l.ultima?.getTime() ?? null,
};

/** Ordena pela coluna; os vazios ficam sempre no fim. Empate: o mais recente primeiro. */
export function ordenarH(ls: readonly LinhaH[], o: OrdemH): LinhaH[] {
  const k = CHAVE[o.coluna], s = o.dir === "asc" ? 1 : -1;
  return [...ls].sort((a, b) => {
    const x = k(a), y = k(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const c = typeof x === "string" ? x.localeCompare(y as string, "pt") : x - (y as number);
    return c !== 0 ? c * s : (b.ultima?.getTime() ?? 0) - (a.ultima?.getTime() ?? 0);
  });
}

/* ------------------------------------------------------------------ painel */
const soma = (ls: readonly LinhaH[]): number => ls.reduce((a, l) => a + (l.valor ?? 0), 0);
export const ganhos = (ls: readonly LinhaH[]): LinhaH[] => ls.filter((l) => l.estado === "ganho" || l.estado === "concluido");

export interface Resumo {
  total: number; abertos: number; valorAberto: number; ganhos: number; valorGanho: number; perdidos: number;
  /** Ganhos sobre os decididos (ganhos e perdidos), em %; null sem nenhum decidido. */
  conversao: number | null;
  ticket: number | null; parados: number;
  /** Dias médios da entrada ao contrato, nos ganhos que têm as duas datas. */
  ciclo: number | null;
}

/** A data do contrato (ou da venda aceite) de um negócio ganho, pelo histórico. */
export function dataGanho(d: Negocio, hoje: Date = new Date()): Date | null {
  const e = d.hist.find((x) => /contrato assinado|venda direta aceite|proposta aceite/i.test(x.t));
  return dataDe(e?.q ?? d.orc?.assinatura?.q ?? d.orc?.aceite ?? undefined, hoje);
}

export function resumoH(ls: readonly LinhaH[], hoje: Date = new Date()): Resumo {
  const ab = ls.filter((l) => l.estado === "aberto"), g = ganhos(ls), p = ls.filter((l) => l.estado === "perdido");
  const comValor = g.filter((l) => l.valor !== null);
  const ciclos = g.map((l) => { const c = dataGanho(l.d, hoje); return c && l.entrada ? diasEntre(l.entrada, c) : null; }).filter((x): x is number => x !== null);
  return {
    total: ls.length, abertos: ab.length, valorAberto: soma(ab), ganhos: g.length, valorGanho: soma(g), perdidos: p.length,
    conversao: g.length + p.length ? Math.round((100 * g.length) / (g.length + p.length)) : null,
    ticket: comValor.length ? soma(comValor) / comValor.length : null,
    parados: ab.filter((l) => (l.parado ?? 0) >= 7).length,
    ciclo: ciclos.length ? Math.round(ciclos.reduce((a, x) => a + x, 0) / ciclos.length) : null,
  };
}

export interface EtapaH { fase: number; rotulo: string; chegaram: number; agora: number; passagem: number | null }

/** O funil: quantos negócios chegaram a cada fase (os perdidos contam até onde foram) e quantos estão nela agora (sem os perdidos). */
export function funilH(ls: readonly LinhaH[]): EtapaH[] {
  return FASES.map((rotulo, fase) => {
    const chegaram = ls.filter((l) => l.fase >= fase).length, antes = fase ? ls.filter((l) => l.fase >= fase - 1).length : 0;
    return { fase, rotulo, chegaram, agora: ls.filter((l) => l.fase === fase && l.estado !== "perdido").length, passagem: fase ? (antes ? Math.round((100 * chegaram) / antes) : 0) : null };
  });
}

export interface GrupoH { id: string; rotulo: string; n: number; euros: number; ganhos: number; perdidos: number; conversao: number | null }

/** Um grupo por valor do campo, com o número, o valor e a conversão; do maior para o menor. */
export function porCampo(ls: readonly LinhaH[], campo: "origem" | "linha" | "comercial", ordem: "n" | "euros" = "n"): GrupoH[] {
  return opcoes(ls, campo).map((v) => {
    const g = ls.filter((l) => l[campo] === v), gh = ganhos(g).length, pe = g.filter((l) => l.estado === "perdido").length;
    return { id: v, rotulo: v, n: g.length, euros: soma(g), ganhos: gh, perdidos: pe, conversao: gh + pe ? Math.round((100 * gh) / (gh + pe)) : null };
  }).sort((a, b) => (ordem === "n" ? b.n - a.n : b.euros - a.euros) || a.rotulo.localeCompare(b.rotulo, "pt"));
}

/** Os motivos de perda, do mais dito para o menos. */
export function motivosPerda(ls: readonly LinhaH[]): { motivo: string; n: number }[] {
  const conta = new Map<string, number>();
  for (const l of ls) if (l.estado === "perdido") { const m = l.motivo.replace(/^(Contrato|Venda) anulad[oa]: /, "") || "Sem motivo"; conta.set(m, (conta.get(m) ?? 0) + 1); }
  return [...conta].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n || a.motivo.localeCompare(b.motivo, "pt"));
}

/** As entradas por semana, nas últimas `semanas`: cada semana tem o rótulo do último dia, e a última acaba hoje. */
export function entradasPorSemana(ls: readonly LinhaH[], hoje: Date = new Date(), semanas = 12): { rotulo: string; n: number }[] {
  const fim = meiaNoite(hoje).getTime() + DIA;
  return Array.from({ length: semanas }, (_, i) => {
    const ate = fim - (semanas - 1 - i) * 7 * DIA, de = ate - 7 * DIA, ult = new Date(ate - DIA);
    return { rotulo: `${String(ult.getDate()).padStart(2, "0")}/${String(ult.getMonth() + 1).padStart(2, "0")}`, n: ls.filter((l) => l.entrada && l.entrada.getTime() >= de && l.entrada.getTime() < ate).length };
  });
}

export interface AtividadeH { id: number; nome: string; t: string; q: string; k: Evento["k"]; data: Date | null }

/** O que aconteceu por último em todos os negócios, do mais recente para o mais antigo. */
export function atividadeRecente(ls: readonly LinhaH[], hoje: Date = new Date(), n = 12): AtividadeH[] {
  const todos = ls.flatMap((l) => l.d.hist.map((e, i) => ({ id: l.id, nome: l.nome, t: e.t, q: e.q, k: e.k, data: dataDe(e.q, hoje), i })));
  return todos.sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0) || a.i - b.i).slice(0, n).map(({ i: _i, ...r }) => r);
}

/** Abertos que valem a pena olhar: os parados há mais tempo. */
export const paradosH = (ls: readonly LinhaH[], n = 5): LinhaH[] =>
  ls.filter((l) => l.estado === "aberto" && l.parado !== null).sort((a, b) => (b.parado ?? 0) - (a.parado ?? 0)).slice(0, n);

