import { cn } from "@/lib/utils";
import type { FaseNegocio } from "./negocioMetas";

/** Anel de foco visível, o mesmo em todos os controlos da página. */
export const FOCO =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Chip de filtro: 44 px de altura; o ativo troca de cor e ganha uma marca (✓) que o chip mostra à parte. */
export const chip = (ativo: boolean): string =>
  cn(
    "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm",
    FOCO,
    ativo
      ? "border-primary bg-primary text-primary-foreground"
      : "border-input bg-card text-foreground hover:border-foreground/40",
  );

/** A cor de cada fase (ponto, faixa da coluna). A fase diz-se sempre também por texto. */
export const COR_FASE: Record<FaseNegocio, string> = {
  orcamento: "bg-info",
  proposta: "bg-primary",
  contrato: "bg-warning",
  financeiro: "bg-success",
};

/** Barra à esquerda do cartão, na cor da fase. */
export const BARRA_FASE: Record<FaseNegocio, string> = {
  orcamento: "border-l-info",
  proposta: "border-l-primary",
  contrato: "border-l-warning",
  financeiro: "border-l-success",
};
