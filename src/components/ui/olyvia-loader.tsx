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

export function OlyviaLoader({ size = 32, text, className, inline = false }: OlyviaLoaderProps) {
  const img = (
    <img
      src={olyviaIcon}
      alt="A carregar..."
      width={size}
      height={size}
      className="animate-olyvia-shake select-none"
      style={{ width: size, height: size }}
    />
  );

  if (inline) {
    return img;
  }

  return (
    <div className={cn("flex flex-col items-center justify-center gap-2", className)}>
      {img}
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}
