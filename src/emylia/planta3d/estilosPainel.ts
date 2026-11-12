// Protótipo (visualizador 3D): as classes e o formato de euros partilhados pelo assistente do Configurador de famílias (PainelConfigurador.tsx) e pelos passos de
// «juntar produtos do catálogo» (PassosCatalogo.tsx). Alvos com pelo menos 44 px (min-h-11), tokens de tema, nada de larguras fixas.
export const INP = "h-11 min-w-0 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60";
export const BTN = "inline-flex min-h-11 items-center justify-center rounded-full border border-input bg-background px-4 py-2 text-[15px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_PRIMARIO = "inline-flex min-h-11 items-center justify-center rounded-full border border-primary bg-primary px-4 py-2 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";
export const CAMPO = "grid min-w-0 gap-1 text-sm font-medium";
export const eur = (n: number): string => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
