// Para onde volta o foco quando o botão que abriu um diálogo de visita já não existe (cancelar uma visita tira os botões; dar-lhe um resultado
// tira «Registar o resultado»): a linha da própria visita, que tem um id estável e aceita foco por código.

/** O id da linha de uma visita no Resumo da ficha. */
export const idLinhaVisita = (visitaId: string): string => `visita-${visitaId}`;

/** Põe o foco na linha da visita; devolve `false` se ela já não está na página (quem chama decide o que fazer). */
export function focarLinhaVisita(visitaId: string): boolean {
  const linha = document.getElementById(idLinhaVisita(visitaId));
  if (!linha) return false;
  linha.focus();
  return true;
}
