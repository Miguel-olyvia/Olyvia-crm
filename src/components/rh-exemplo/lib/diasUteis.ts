/**
 * Dias uteis (segunda a sexta) para os prazos de justificacao. Na apresentacao nao ha calendario de
 * feriados da organizacao: so se saltam sabados e domingos. Datas em AAAA-MM-DD, sem fuso.
 */
const MS_DIA = 86_400_000;

function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * MS_DIA).toISOString().slice(0, 10);
}

export function ehDiaUtil(iso: string): boolean {
  const dia = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dia !== 0 && dia !== 6;
}

/** A data que fica `n` dias uteis depois de `iso` (n = 0 devolve o proprio dia). */
export function somarDiasUteis(iso: string, n: number): string {
  let atual = iso;
  let restantes = Math.max(0, Math.floor(n));
  while (restantes > 0) {
    atual = somarDias(atual, 1);
    if (ehDiaUtil(atual)) restantes -= 1;
  }
  return atual;
}

/** Quantos dias uteis ha depois de `de` ate `ate`, inclusive `ate` (0 se `ate` nao for depois de `de`). */
export function diasUteisEntre(de: string, ate: string): number {
  let total = 0;
  for (let atual = somarDias(de, 1); atual <= ate; atual = somarDias(atual, 1)) {
    if (ehDiaUtil(atual)) total += 1;
  }
  return total;
}
