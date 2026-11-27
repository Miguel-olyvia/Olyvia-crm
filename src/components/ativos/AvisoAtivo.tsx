/**
 * Um aviso (âmbar) ou um erro (vermelho) do ecrã de ativos: sempre ícone E texto, nunca só cor. O ícone é decorativo (`aria-hidden`):
 * o leitor de ecrã lê só a frase. O papel (`note`, `alert`) e o `data-testid` passam-se de fora.
 */
import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOM_AVISO } from "./lib/ativosUi";

interface Props {
  tom: keyof typeof TOM_AVISO;
  role?: "note" | "alert" | "status";
  id?: string;
  "data-testid"?: string;
  /** O tamanho do texto (`text-sm` por omissão). */
  className?: string;
  children: ReactNode;
}

export function AvisoAtivo({ tom, className, children, ...resto }: Props) {
  return (
    <p {...resto} className={cn("flex items-start gap-2.5 text-sm", TOM_AVISO[tom], className)}>
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
