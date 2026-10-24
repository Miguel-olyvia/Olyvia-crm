// Estado de uma meta do mês: compara a percentagem atingida com o ritmo
// esperado (dia do mês sobre dias do mês). Funções puras; os limiares vivem
// aqui e em mais nenhum sítio.

export type EstadoMeta = "atingida" | "noRitmo" | "emRisco" | "atrasada";

/**
 * Fração do ritmo esperado a partir da qual a meta ainda está "no ritmo" e
 * fração abaixo da qual passa a "atrasada" (entre as duas, "em risco").
 */
export const LIMIARES = { noRitmo: 0.9, emRisco: 0.6 } as const;

/** Ritmo esperado, em %: 0 antes do mês, 100 depois dele, dia/dias dentro dele. */
export function ritmoEsperado(mes: string, hoje: Date): number {
  const [ano, m] = mes.split("-").map(Number);
  const inicio = new Date(ano, m - 1, 1);
  const fim = new Date(ano, m, 1);
  if (hoje < inicio) return 0;
  if (hoje >= fim) return 100;
  const diasDoMes = new Date(ano, m, 0).getDate();
  return (hoje.getDate() / diasDoMes) * 100;
}

/** Atingida a partir de 100%; senão compara a percentagem com o ritmo. */
export function estadoDaMeta(percentagem: number, ritmo: number): EstadoMeta {
  if (percentagem >= 100) return "atingida";
  if (ritmo <= 0) return "noRitmo";
  const razao = percentagem / ritmo;
  if (razao >= LIMIARES.noRitmo) return "noRitmo";
  if (razao >= LIMIARES.emRisco) return "emRisco";
  return "atrasada";
}
