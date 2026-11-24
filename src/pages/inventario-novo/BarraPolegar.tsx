// A barra do polegar do novo Inventário (como a do Estúdio da obra): só no telemóvel (sm:hidden), fixa em baixo, acima da zona
// segura (env(safe-area-inset-bottom)). Três botões: "Precisa de ti (N)" → Hoje, até ao Comando; "Ler código" → Receção no
// leitor (?vista=leitor); e o botão principal, com a mesma lógica e o mesmo gate do cabeçalho (que no telemóvel se esconde).
// Com o principal, os outros dois ficam só com o ícone (e o número), para o principal caber a 390 px.
import type { LucideIcon } from "lucide-react";
import { ScanLine, Zap } from "lucide-react";
import { BlockedButton } from "@/components/inventory/ui/DisabledReason";
import { cn } from "@/lib/utils";

export interface BarraPolegarProps {
  /** Quantos pedidos tem o "Precisa de ti" (null = sem dados). */
  pedidos: number | null;
  /** Motivo para não abrir o Hoje (sem a permissão do separador); null = pode. */
  bloqueioHoje: string | null;
  /** Motivo para não abrir a Receção; null = pode. */
  bloqueioRececao: string | null;
  irPrecisaDeTi: () => void;
  irLerCodigo: () => void;
  /** O botão principal; null = não se mostra (a carregar, sem separadores). */
  principal: { rotulo: string; Icone: LucideIcon; bloqueio: string | null; carregar: () => void } | null;
}

export function BarraPolegar({ pedidos, bloqueioHoje, bloqueioRececao, irPrecisaDeTi, irLerCodigo, principal }: BarraPolegarProps) {
  const compacto = !!principal;
  const lado = cn("min-h-12 rounded-2xl", compacto ? "min-w-12 shrink-0 px-3" : "min-w-0 flex-1");
  return (
    <nav aria-label="Ações rápidas" className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border bg-card/95 px-3 pt-2 backdrop-blur pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden">
      <BlockedButton type="button" variant="outline" side="top" className={cn("relative", lado)} title="Precisa de ti"
        aria-label={`Precisa de ti${pedidos ? ` (${pedidos})` : ""}`} blockedReason={bloqueioHoje} onClick={irPrecisaDeTi}>
        <Zap className={cn("h-4 w-4 text-amber-700 dark:text-amber-400", !compacto && "mr-1.5")} aria-hidden="true" />{!compacto && "Precisa de ti"}
        {!!pedidos && <span aria-hidden="true" className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{pedidos}</span>}
      </BlockedButton>
      <BlockedButton type="button" variant="outline" side="top" className={lado} title="Ler código" aria-label="Ler código"
        blockedReason={bloqueioRececao} onClick={irLerCodigo}>
        <ScanLine className={cn("h-4 w-4", !compacto && "mr-1.5")} aria-hidden="true" />{!compacto && "Ler código"}
      </BlockedButton>
      {principal && (
        <BlockedButton type="button" side="top" className="min-h-12 min-w-0 flex-1 rounded-2xl" blockedReason={principal.bloqueio} onClick={principal.carregar}>
          <principal.Icone className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{principal.rotulo}</span>
        </BlockedButton>
      )}
    </nav>
  );
}
