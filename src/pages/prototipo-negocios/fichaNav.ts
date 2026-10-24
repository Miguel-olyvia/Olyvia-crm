// Abrir a ficha de um serviço a partir de outro ecrã (ex.: a linha do orçamento): guarda o serviço
// numa variável de módulo e o Catálogo abre-o quando monta. Só dura até ser lido.
import type { SvcId } from "./motor";

let pendente: SvcId | null = null;
export const abrirFichaDepois = (sid: SvcId) => { pendente = sid; };
export function tomarFichaPendente(): SvcId | null {
  const s = pendente;
  pendente = null;
  return s;
}
