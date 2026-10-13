// Botão que fica VISÍVEL mas desativado quando a ação não está disponível,
// com o motivo num tooltip (o protótipo usa disabled + title). Um <button>
// desativado não recebe hover/foco, por isso o tooltip vai num <span> com
// tabIndex=0 à volta — dá também para ler o motivo com o teclado.
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ReasonButtonProps = ComponentPropsWithoutRef<typeof Button> & {
  /** Motivo pelo qual a ação não está disponível. Com motivo, o botão fica desativado. */
  reason?: string | null;
};

export const ReasonButton = forwardRef<HTMLButtonElement, ReasonButtonProps>(function ReasonButton(
  { reason, disabled, ...props },
  ref,
) {
  if (!reason) return <Button ref={ref} disabled={disabled} {...props} />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Button ref={ref} disabled {...props} aria-disabled="true" className={`${props.className ?? ""} pointer-events-none`} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
});
