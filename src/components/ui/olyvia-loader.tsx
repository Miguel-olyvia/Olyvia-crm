import olyviaIcon from "@/assets/olyvia-icon.png";
import { cn } from "@/lib/utils";

interface OlyviaLoaderProps {
  /** Size in pixels. Default: 32 */
  size?: number;
  /** Optional text below the icon */
  text?: string;
  /** Additional class for the wrapper */
  className?: string;
  /** Use inline mode (no centering wrapper, just the icon) */
  inline?: boolean;
}

const TEXTO_PADRAO = "A carregar...";

/**
 * O carregamento é uma região de estado (`role="status"`): o leitor de ecrã anuncia o texto quando aparece. A imagem é só
 * decorativa (`alt` vazio): o texto, visível ou só para leitores (`sr-only`), é o que se ouve, e não se ouve duas vezes.
 */
export function OlyviaLoader({ size = 32, text, className, inline = false }: OlyviaLoaderProps) {
  const img = (
    <img
      src={olyviaIcon}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="animate-olyvia-shake select-none"
      style={{ width: size, height: size }}
    />
  );

  if (inline) {
    return (
      <span role="status" className="inline-flex">
        {img}
        <span className="sr-only">{text ?? TEXTO_PADRAO}</span>
      </span>
    );
  }

  return (
    <div role="status" className={cn("flex flex-col items-center justify-center gap-2", className)}>
      {img}
      {text ? <p className="text-sm text-muted-foreground">{text}</p> : <span className="sr-only">{TEXTO_PADRAO}</span>}
    </div>
  );
}
