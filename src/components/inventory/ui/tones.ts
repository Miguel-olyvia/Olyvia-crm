// Tons partilhados pelas peças do Inventário (KPI, estado, fila, contadores),
// mapeados para os tokens do tema (success/warning/destructive/info/muted).
// Equivalente aos tons ok/warn/bad/info/neu do mockup.
//
// Texto: no tema claro, success/warning/info (luminosidade 45–55%) ficam
// abaixo do contraste mínimo sobre branco (WCAG AA) — o texto usa a mesma
// família um tom mais escuro e o token do tema no modo escuro. Barras e fundos
// usam sempre o token.
export type InventoryTone = "ok" | "warn" | "bad" | "info" | "neutral";

/** Cor do número/valor. */
export const toneText: Record<InventoryTone, string> = {
  ok: "text-green-700 dark:text-success",
  warn: "text-amber-700 dark:text-warning",
  bad: "text-destructive",
  info: "text-sky-700 dark:text-info",
  neutral: "text-foreground",
};

/** Barra de cor à esquerda dos cartões. */
export const toneBorder: Record<InventoryTone, string> = {
  ok: "border-l-success",
  warn: "border-l-warning",
  bad: "border-l-destructive",
  info: "border-l-info",
  neutral: "border-l-muted-foreground/40",
};

/** Fundo suave + texto para distintivos. */
export const toneBadge: Record<InventoryTone, string> = {
  ok: "border-success/30 bg-success/10 text-green-700 dark:text-success",
  warn: "border-warning/30 bg-warning/10 text-amber-700 dark:text-warning",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-info/30 bg-info/10 text-sky-700 dark:text-info",
  neutral: "border-border bg-muted text-muted-foreground",
};
