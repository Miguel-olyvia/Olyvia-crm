import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Clock, FileWarning, PauseCircle, Trophy } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { NegocioMes } from "./negocioMetas";
import { saudeDoNegocio, type SaudeNegocio } from "./saudeNegocio";
import { textoSaude } from "./saudeTexto";
import { TextoDual } from "./TextoDual";

/** Ícone de cada estado: o traço é sempre `text-foreground` (contraste) sobre um fundo com a cor do estado. */
const ICONE: Record<SaudeNegocio, { Icone: LucideIcon; fundo: string }> = {
  atraso: { Icone: AlertTriangle, fundo: "bg-destructive/20" },
  parado: { Icone: PauseCircle, fundo: "bg-warning/30" },
  semOrcamento: { Icone: FileWarning, fundo: "bg-destructive/20" },
  urgente: { Icone: Clock, fundo: "bg-warning/30" },
  emDia: { Icone: CheckCircle2, fundo: "bg-success/25" },
  ganho: { Icone: Trophy, fundo: "bg-success/25" },
};

interface SaudeTagProps {
  negocio: NegocioMes;
  hoje: string;
  className?: string;
}

/** A saúde do negócio: ícone com cor + texto em `text-foreground` (a cor nunca é o único sinal). */
export function SaudeTag({ negocio, hoje, className }: SaudeTagProps) {
  const { t } = useTranslation();
  const saude = saudeDoNegocio(negocio, hoje);
  const { Icone, fundo } = ICONE[saude];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-foreground", className)}>
      <span className={cn("rounded-full p-0.5", fundo)}>
        <Icone className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
      </span>
      <span>
        <TextoDual curto={textoSaude(saude, negocio, hoje, t)} longo={textoSaude(saude, negocio, hoje, t, true)} />
      </span>
    </span>
  );
}
