import { obterIdioma } from "@/lib/idiomaDocumento/registo";

/** Alvo tátil mínimo dos seletores de idioma: 44px. */
export const ALVO_DO_SELETOR = "min-h-11";

/** O nome do idioma na sua própria língua («Português», «English»); um código desconhecido sai como está. */
export function nomeNativoDoIdioma(codigo: string): string {
  return obterIdioma(codigo)?.nomeNativo ?? codigo;
}
