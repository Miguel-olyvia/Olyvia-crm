// O que se pede para marcar ou alterar uma visita e a sua validação, em funções puras (o dia de hoje chega por parâmetro). A visita
// em si é do pedido (ver `acoesPedido.ts`).
import { validarDestino, type DestinoVisita, type ErroMoradaVisita } from "./moradaVisita";

export const MAX_NOTA_VISITA = 140;

export interface DadosVisita {
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM; vazio = sem hora. */
  hora: string;
  nota: string;
  /** O serviço do pedido (para o registo). */
  servico: string;
  /** O texto do registo, quando quem marca já o tem escrito (a chamada: "16/10 · 09:30 · morada"); senão compõe-se aqui. */
  detalhe?: string;
  /** Onde é a visita; sem isto, vale a morada da lead (se a tiver). */
  destino?: DestinoVisita;
}

export type ErroVisita = "dataVazia" | "dataPassada" | "horaInvalida" | "notaComprida" | ErroMoradaVisita;

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * O primeiro erro do formulário da visita; `null` = válido. A data não pode ser anterior a hoje. Com `destino`, valida também
 * a morada (`moradaLead` diz se "na morada da lead" é possível).
 */
export function validarVisita(
  dados: Pick<DadosVisita, "data" | "hora" | "nota"> & { destino?: DestinoVisita }, hoje: string, moradaLead: Parameters<typeof validarDestino>[1] = null,
): ErroVisita | null {
  if (!FORMATO_DATA.test(dados.data)) return "dataVazia";
  if (dados.data < hoje) return "dataPassada";
  if (dados.hora !== "" && !FORMATO_HORA.test(dados.hora)) return "horaInvalida";
  if (dados.nota.trim().length > MAX_NOTA_VISITA) return "notaComprida";
  return dados.destino ? validarDestino(dados.destino, moradaLead) : null;
}

/** O que fica escrito na atividade: "2026-10-20 10:30 · Cozinha · nota · Rua A 1, 1000-001 Lisboa". */
export const detalheDaVisita = (d: DadosVisita, morada: string): string =>
  [d.hora ? `${d.data} ${d.hora}` : d.data, d.servico, d.nota.trim(), morada].filter(Boolean).join(" · ");

export interface DadosAlterarVisita {
  data: string;
  hora: string;
  destino: DestinoVisita;
}
