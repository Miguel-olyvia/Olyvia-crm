// Tons partilhados pelas peças do Inventário (KPI, estado, fila, contadores),
// mapeados para os tokens do tema (success/warning/destructive/info/primary/
// muted). Equivalente aos tons ok/warn/bad/info/violet/neu do mockup.
//
// Texto: no tema claro, success/warning/info/destructive (luminosidade 45–60%)
// ficam abaixo do contraste mínimo sobre branco (WCAG AA) — o texto usa a mesma
// família um tom mais escuro (700; 800 nos distintivos, por causa do fundo
// tingido). No tema escuro usa o token, exceto destructive e primary (50–58%,
// escuros de mais sobre o cartão escuro), que passam a red-400/violet-300 como
// o --bad/--vio do mockup. Barras e fundos usam sempre o token.
export type InventoryTone = "ok" | "warn" | "bad" | "info" | "violet" | "neutral";

/** Cor do número/valor (.k-* .kv do mockup). */
export const toneText: Record<InventoryTone, string> = {
  ok: "text-green-700 dark:text-success",
  warn: "text-amber-700 dark:text-warning",
  bad: "text-red-700 dark:text-red-400",
  info: "text-sky-700 dark:text-info",
  violet: "text-primary dark:text-violet-300",
  neutral: "text-foreground",
};

/** Barra de cor à esquerda dos cartões (.qcard.t-* do mockup). */
export const toneBorder: Record<InventoryTone, string> = {
  ok: "border-l-success",
  warn: "border-l-warning",
  bad: "border-l-destructive",
  info: "border-l-info",
  violet: "border-l-primary",
  neutral: "border-l-muted-foreground",
};

/** Barra à esquerda esbatida, para cartões sem nada pendente (valor 0). */
export const toneBorderMuted: Record<InventoryTone, string> = {
  ok: "border-l-success/40",
  warn: "border-l-warning/40",
  bad: "border-l-destructive/40",
  info: "border-l-info/40",
  violet: "border-l-primary/40",
  neutral: "border-l-muted-foreground/40",
};

/** Fundo suave + texto para distintivos (.b-* do mockup, sem contorno). */
export const toneBadge: Record<InventoryTone, string> = {
  ok: "bg-success/15 text-green-800 dark:text-success",
  warn: "bg-warning/20 text-amber-800 dark:text-warning",
  bad: "bg-destructive/10 text-red-700 dark:bg-destructive/20 dark:text-red-400",
  info: "bg-info/15 text-sky-800 dark:text-info",
  violet: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-violet-300",
  neutral: "bg-muted text-zinc-600 dark:text-muted-foreground",
};
