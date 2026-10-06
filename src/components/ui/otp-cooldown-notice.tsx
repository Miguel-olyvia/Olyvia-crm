import { cn } from "@/lib/utils";

interface OtpCooldownNoticeProps {
  activo: boolean;
  className?: string;
}

/** Aviso visível enquanto a contagem está activa; o botão já mostra os segundos. */
export function OtpCooldownNotice({ activo, className }: OtpCooldownNoticeProps) {
  if (!activo) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Aguarde 1 minuto antes de pedir um novo código.
    </p>
  );
}
