// A V2 funcional de Negócios, sem React: as listas do Hoje (um negócio numa só lista), o tempo parado em palavras e as vistas rápidas do Quadro.
// Funções puras sobre as linhas que os filtros já escolheram (filtrosNegocios.ts): nada aqui muda o Estado nem o seed.
import { idade } from "./leadsDocs";
import type { LinhaN } from "./filtrosNegocios";
import { ordenarPor, type Direcao } from "./funcOrdenar";

export type IdGrupoN = "orcamento" | "proposta" | "contrato" | "faturar";
export const GRUPOS_N: readonly { id: IdGrupoN; nome: string; vazio: string }[] = [
  { id: "orcamento", nome: "Orçamentos por enviar", vazio: "Nenhum orçamento por enviar." },
  { id: "proposta", nome: "Propostas à espera do cliente", vazio: "Nenhuma proposta à espera." },
  { id: "contrato", nome: "Contratos por assinar", vazio: "Nenhum contrato por assinar." },
  { id: "faturar", nome: "A faturar", vazio: "Nada por faturar." },
];

/** Os dias que contam como "parado" nas vistas rápidas. */
export const DIAS_PARADO = 7;

/** A lista do Hoje de um negócio: a coluna dele, e no Financeiro só enquanto a fatura não foi emitida. `null`: não entra no Hoje. */
export function grupoN(l: LinhaN): IdGrupoN | null {
  if (l.doc === "orcamento" || l.doc === "proposta" || l.doc === "contrato") return l.doc;
  return l.doc === "financeiro" && !l.negocio.deal.fin.fatura ? "faturar" : null;
}

/** Há quantos dias o negócio está parado na fase: em Orçamento desde que entrou, em Proposta desde o envio, em Contrato e Financeiro desde a aceitação. */
export function paradoN(l: LinhaN): number {
  if (l.parado !== null) return l.parado;
  const o = l.negocio.deal.orc;
  return Math.max(0, idade(o?.aceite ?? o?.enviada ?? l.negocio.deal.quando));
}

const DESDE: Record<IdGrupoN, string> = { orcamento: "Em orçamento", proposta: "Enviada", contrato: "À espera de assinatura", faturar: "Ganho" };

/** O tempo parado em palavras: "Enviada há 5 dias", "Em orçamento desde hoje", "Ganho ontem, por faturar". */
export function paradoTexto(l: LinhaN): string {
  const g = grupoN(l) ?? "orcamento", d = paradoN(l);
  const quando = d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
  const desde = d <= 0 && g !== "faturar" ? `desde ${quando}` : quando;
  return `${DESDE[g]} ${desde}${g === "faturar" ? ", por faturar" : ""}`;
}

export type OrdemHojeN = "parado" | "valor";

/** Dentro de cada lista: os mais parados primeiro (e, em empate, o maior valor), ou o maior valor primeiro (e, em empate, o mais parado). */
export function ordenarHojeN(ls: readonly LinhaN[], ordem: OrdemHojeN): LinhaN[] {
  const porValor = ordenarPor(ls, (l) => l.valor, "desc");
  const porParado = ordenarPor(ls, (l) => paradoN(l), "desc");
  return ordem === "valor" ? ordenarPor(porParado, (l) => l.valor, "desc") : ordenarPor(porValor, (l) => paradoN(l), "desc");
}

export interface GrupoHojeN { id: IdGrupoN; nome: string; vazio: string; linhas: LinhaN[] }

/** As quatro listas do Hoje de Negócios. Cada negócio entra numa só (a coluna dele é única). */
export function hojeNegocios(linhas: readonly LinhaN[], ordem: OrdemHojeN = "parado"): GrupoHojeN[] {
  return GRUPOS_N.map((g) => ({ ...g, linhas: ordenarHojeN(linhas.filter((l) => grupoN(l) === g.id), ordem) }));
}

/* ---------------------------------------------------------------- vistas rápidas do Quadro */

export type VistaN = "enviar" | "espera" | "assinar" | "faturar" | "parados" | "varios";
export const VISTAS_N: readonly { id: VistaN; nome: string }[] = [
  { id: "enviar", nome: "Para enviar" }, { id: "espera", nome: "À espera do cliente" }, { id: "assinar", nome: "Por assinar" },
  { id: "faturar", nome: "A faturar" }, { id: "parados", nome: `Parados há ${DIAS_PARADO}+ dias` }, { id: "varios", nome: "Com 2+ orçamentos" },
];

const REGRA_VISTA: Record<VistaN, (l: LinhaN) => boolean> = {
  enviar: (l) => grupoN(l) === "orcamento", espera: (l) => grupoN(l) === "proposta", assinar: (l) => grupoN(l) === "contrato",
  faturar: (l) => grupoN(l) === "faturar", parados: (l) => paradoN(l) >= DIAS_PARADO, varios: (l) => l.nOrc >= 2,
};

/** As linhas que a vista deixa passar (sem vista, todas). */
export const aplicarVistaN = (ls: readonly LinhaN[], v: VistaN | null): LinhaN[] => (v ? ls.filter(REGRA_VISTA[v]) : [...ls]);

/* ---------------------------------------------------------------- ordenar o Quadro */

export type ChaveN = "valor" | "parado" | "nome";
export const CHAVES_N: readonly { id: ChaveN; nome: string; dir: Direcao }[] = [
  { id: "valor", nome: "Valor", dir: "desc" }, { id: "parado", nome: "Tempo parado", dir: "desc" }, { id: "nome", nome: "Nome", dir: "asc" },
];

const CHAVE: Record<ChaveN, (l: LinhaN) => string | number | null> = { valor: (l) => l.valor, parado: (l) => paradoN(l), nome: (l) => l.negocio.nome };

/** Ordena as linhas de uma coluna (estável: em empate fica a ordem de sempre). `null`: a ordem de sempre. */
export function ordenarN(ls: readonly LinhaN[], chave: ChaveN | null, dir?: Direcao): LinhaN[] {
  if (!chave) return [...ls];
  return ordenarPor(ls, CHAVE[chave], dir ?? CHAVES_N.find((c) => c.id === chave)!.dir);
}
