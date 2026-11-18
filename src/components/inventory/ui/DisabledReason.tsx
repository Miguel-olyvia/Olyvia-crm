// 18/11/2026: o porquê de um controlo bloqueado («Sem permissão: …»), legível também por toque.
// Antes o motivo só vivia em title= ou num Tooltip de hover — no telemóvel não se via. Agora:
//   - toque/clique no controlo bloqueado abre um Popover com o motivo (e fecha ao tocar fora / Esc);
//   - no desktop o Tooltip de hover continua (esconde-se enquanto o Popover está aberto);
//   - leitores de ecrã: aria-describedby para um sr-only com o motivo.
// A ação NUNCA corre quando bloqueada: o BlockedButton não chama o onClick e pára a propagação (linhas clicáveis).
//
// API:
//   <BlockedButton blockedReason={motivo /* null = livre */} onClick={…} disabled={aCorrer} variant="outline">Passar para stock</BlockedButton>
//     Com motivo: aria-disabled (focável), esbatido, toque mostra o motivo. Sem motivo: <Button> normal (disabled continua a valer).
//   <DisabledReason reason={motivo}>{<button aria-disabled …/>}</DisabledReason>
//     Para gatilhos próprios (um único elemento focável que aceite ref e props — button/Button). O filho trata de não correr a ação.
//   <DisabledReasonInfo reason={motivo} label="Ativo" />
//     Ícone «i» ao lado de controlos que ficam mesmo disabled (Switch, Checkbox): toque abre o motivo.
import { forwardRef, useId, useState, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DisabledReasonProps {
  reason: ReactNode;
  /** Gatilho: um só elemento focável (button). Recebe aria-describedby e os handlers do Popover/Tooltip. */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

export function DisabledReason({ reason, children, side = "top", align = "center" }: DisabledReasonProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const descId = useId();
  // TooltipProvider próprio: funciona também fora do da App (testes, portais) — sem props, os mesmos atrasos por omissão.
  return (
    <TooltipProvider>
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip open={hover && !open} onOpenChange={setHover}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild aria-describedby={descId}>
            {children}
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          {reason}
        </TooltipContent>
      </Tooltip>
      <span id={descId} className="sr-only">
        {reason}
      </span>
      <PopoverContent
        side={side}
        align={align}
        role="note"
        // O foco fica no gatilho (o leitor de ecrã já tem o motivo pelo aria-describedby).
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        className="w-auto max-w-[min(20rem,calc(100vw-1.5rem))] px-3 py-2 text-[13px] leading-snug"
      >
        {reason}
      </PopoverContent>
    </Popover>
    </TooltipProvider>
  );
}

export interface BlockedButtonProps extends ButtonProps {
  /** Motivo do bloqueio (permissão em falta, estado). null/undefined/"" = o botão funciona normalmente. */
  blockedReason?: string | null;
  side?: "top" | "bottom" | "left" | "right";
}

// Bloqueado não reage ao hover (no telemóvel o hover «cola» depois do toque e parecia ativo).
const BLOCKED_HOVER: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "hover:bg-primary",
  destructive: "hover:bg-destructive",
  outline: "hover:border-input hover:bg-background hover:text-foreground",
  secondary: "hover:bg-secondary",
  ghost: "hover:bg-transparent hover:text-current",
  link: "hover:no-underline",
};

/** <Button> que, bloqueado, fica focável (aria-disabled), não corre a ação e mostra o motivo ao toque/clique e no hover. */
export const BlockedButton = forwardRef<HTMLButtonElement, BlockedButtonProps>(function BlockedButton(
  { blockedReason, side, onClick, className, disabled, ...props },
  ref,
) {
  if (!blockedReason) {
    return <Button ref={ref} onClick={onClick} disabled={disabled} className={className} {...props} />;
  }
  return (
    <DisabledReason reason={blockedReason} side={side}>
      <Button
        ref={ref}
        {...props}
        // Depois do spread: um bloqueado nunca submete um form, mesmo que lhe passem type="submit".
        type="button"
        aria-disabled="true"
        className={cn(className, "cursor-not-allowed opacity-50 hover:shadow-none", BLOCKED_HOVER[props.variant ?? "default"])}
        // Bloqueado: nunca chama onClick. Não faz preventDefault (o Popover ignoraria o clique), só pára a propagação.
        onClick={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
      />
    </DisabledReason>
  );
});

/**
 * Ícone «i» (16px, área de toque 40px em mobile / 24px em desktop) que abre o motivo. Para controlos que ficam
 * disabled de verdade (Switch/Checkbox) — esses não recebem toques, por isso o motivo vive ao lado.
 */
export function DisabledReasonInfo({ reason, label, className }: { reason: ReactNode; label: string; className?: string }) {
  return (
    <DisabledReason reason={reason}>
      <button
        type="button"
        aria-label={`Porque está bloqueado: ${label}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "-my-2.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:my-0 md:h-6 md:w-6",
          className,
        )}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
    </DisabledReason>
  );
}
