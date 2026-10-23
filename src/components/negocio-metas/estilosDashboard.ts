import type { EstadoMeta } from "./estadoMeta";

/** Superfície de bloco: um só raio e uma só borda para todo o Dashboard. */
export const CARTAO = "rounded-lg border border-border/70 bg-card";

/** Transições só de cor, opacidade e transform, curtas e desligadas com movimento reduzido. */
export const TRANSICAO = "transition-colors duration-200 motion-reduce:transition-none";

/** Alturas mínimas partilhadas pelos blocos e pelos seus skeletons, para nada saltar. */
export const ALTURA = {
  numeros: "min-h-20",
  metas: "min-h-44",
  comerciais: "min-h-72",
} as const;

/** Cor (só tokens) do preenchimento por estado; o estado diz-se sempre também por texto. */
export const COR_PREENCHE: Record<EstadoMeta, string> = {
  atingida: "bg-success",
  noRitmo: "bg-primary",
  emRisco: "bg-warning",
  atrasada: "bg-destructive",
};

/** O mesmo, para o indicador interno da `Progress` (classes escritas por extenso para o Tailwind as ver). */
export const COR_BARRA: Record<EstadoMeta, string> = {
  atingida: "[&>div]:bg-success",
  noRitmo: "[&>div]:bg-primary",
  emRisco: "[&>div]:bg-warning",
  atrasada: "[&>div]:bg-destructive",
};
