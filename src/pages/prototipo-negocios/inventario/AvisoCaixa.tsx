// O aviso à vista do Inventário (região aria-live), com ícone: nunca só cor.
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCtxInv } from "./ctxInv";

/** O aviso à vista (com ícone, nunca só cor) numa região aria-live. Fica sempre no DOM para o leitor de ecrã o anunciar quando o texto muda. */
export function AvisoCaixa({ className }: { className?: string }) {
  const { aviso } = useCtxInv();
  const I = aviso?.erro ? AlertTriangle : Info;
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className={cn(aviso ? "flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-[15px]" : "sr-only", className)}>
      {aviso && <I className={cn("mt-0.5 h-4 w-4 shrink-0", aviso.erro ? "text-destructive" : "text-sky-700")} aria-hidden="true" />}
      {aviso?.texto}
    </p>
  );
}
