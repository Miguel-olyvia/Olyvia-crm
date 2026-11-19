import { cn } from "@/lib/utils";

interface OtpCooldownNoticeProps {
  activo: boolean;
  className?: string;
  /** Texto do aviso noutro idioma (portal). Sem ele, ou vazio, fica o português de sempre. */
  texto?: string;
}

const TEXTO_OMISSAO = "Aguarde 1 minuto antes de pedir um novo código.";

/** Aviso visível enquanto a contagem está activa; o botão já mostra os segundos. */
export function OtpCooldownNotice({ activo, className, texto }: OtpCooldownNoticeProps) {
  if (!activo) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {texto || TEXTO_OMISSAO}
    </p>
  );
}
