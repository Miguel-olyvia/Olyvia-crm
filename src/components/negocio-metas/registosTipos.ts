// Os registos de uma pessoa: contacto (chamada), visita e levantamento pertencem à PESSOA, não a um pedido nem a um negócio. Um
// registo liga-se a um só negócio (`negocioId`) e nada se copia: o negócio lê os registos que tem ligados. O formulário
// que a pessoa preencheu NÃO é um contacto. Só em memória, sem Supabase.
import type { ResultadoContacto, ResultadoEncerramento } from "@/components/pessoas/pessoasTipos";
import type { VisitaNegocio } from "./negocioMetas";
import type { RascunhoLevantamento } from "./novoNegocio";

/** Uma chamada (ou tentativa de chamada) a uma pessoa. `negocioId` é `null` enquanto o contacto não está ligado a nenhum negócio. */
export interface ContactoPessoa {
  id: string;
  pessoaId: string;
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM; falta nos registos sem hora. */
  hora?: string;
  resultado: ResultadoContacto;
  nota: string;
  negocioId: string | null;
}

/**
 * O que a visita deixou dito sobre a pessoa: segue (interessada), fica a pensar, ou sem interesse / obra inviável (os dois últimos
 * encerram a abordagem).
 */
export type ResultadoVisita = "interessado" | "aPensar" | ResultadoEncerramento;

/** Os resultados de uma visita, pela ordem em que se mostram. */
export const RESULTADOS_VISITA: readonly ResultadoVisita[] = ["interessado", "aPensar", "semInteresse", "obraInviavel"];

/** Estes resultados terminam a abordagem da pessoa (não se cria negócio). */
export const resultadoEncerra = (r: ResultadoVisita): r is ResultadoEncerramento => r === "semInteresse" || r === "obraInviavel";

/** Uma visita da pessoa: a mesma forma da visita do negócio, mais a quem pertence e a que negócio está ligada. */
export type VisitaPessoa = VisitaNegocio & {
  pessoaId: string;
  negocioId: string | null;
  resultado?: ResultadoVisita;
};

/** O levantamento feito a uma pessoa (opcionalmente numa visita). Nunca é obrigatório. */
export interface LevantamentoPessoa {
  id: string;
  pessoaId: string;
  /** A visita em que foi feito; `null` se foi feito à parte. */
  visitaId: string | null;
  /** AAAA-MM-DD. */
  data: string;
  feitoPor: string;
  rascunho: RascunhoLevantamento;
  negocioId: string | null;
}

export type TipoRegisto = "contacto" | "visita" | "levantamento";

/** Aponta para um registo: o tipo e o id (os ids só são únicos dentro do tipo). */
export interface RefRegisto {
  tipo: TipoRegisto;
  id: string;
}

/** Tudo o que há registado, de todas as pessoas. */
export interface EstadoRegistos {
  contactos: readonly ContactoPessoa[];
  visitas: readonly VisitaPessoa[];
  levantamentos: readonly LevantamentoPessoa[];
}

export const REGISTOS_VAZIOS: EstadoRegistos = { contactos: [], visitas: [], levantamentos: [] };

/**
 * O que o negócio diz do levantamento: ainda por decidir (o negócio está em Levantamento), ligado a um levantamento da pessoa
 * ou dispensado (segue para Orçamento sem ele). O levantamento é opcional.
 */
export type DecisaoLevantamento = "porDecidir" | "ligado" | "dispensado";

/** Os registos de uma só pessoa. */
export type RegistosDaPessoa = { [K in keyof EstadoRegistos]: EstadoRegistos[K] };
