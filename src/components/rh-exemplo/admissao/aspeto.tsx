// O aspeto de cada estado da admissão (ícone + texto + tom, nunca só a cor) e os textos do prazo do login temporário.
import {
  AlarmClock, BadgeCheck, CheckCircle2, ClipboardCheck, FileSignature, KeyRound, Mail, PenLine, Undo2, UserCheck, XCircle,
  type LucideIcon,
} from "lucide-react";
import type { EstadoVisivel } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const NEUTRO = "border-border text-muted-foreground";
const ASPETO: Record<EstadoVisivel, { Icone: LucideIcon; classe: string }> = {
  convite_enviado: { Icone: Mail, classe: NEUTRO },
  a_preencher: { Icone: PenLine, classe: "border-sky-500/50 text-sky-800 dark:text-sky-300" },
  submetida: { Icone: ClipboardCheck, classe: "border-amber-500/70 bg-amber-500/10 font-medium text-amber-900 dark:text-amber-300" },
  devolvida: { Icone: Undo2, classe: "border-orange-500/60 text-orange-800 dark:text-orange-300" },
  rejeitada: { Icone: XCircle, classe: "border-destructive/50 text-destructive" },
  aprovada: { Icone: CheckCircle2, classe: "border-emerald-600/50 text-emerald-800 dark:text-emerald-300" },
  contrato_por_assinar: { Icone: FileSignature, classe: "border-violet-500/50 text-violet-800 dark:text-violet-300" },
  contrato_assinado: { Icone: BadgeCheck, classe: "border-emerald-600/50 text-emerald-800 dark:text-emerald-300" },
  acesso_enviado: { Icone: KeyRound, classe: "border-indigo-500/50 text-indigo-800 dark:text-indigo-300" },
  acesso_ativo: { Icone: UserCheck, classe: "border-emerald-600/60 bg-emerald-600/10 text-emerald-900 dark:text-emerald-300" },
  expirado: { Icone: AlarmClock, classe: "border-destructive/50 bg-destructive/5 text-destructive" },
};

export function EstadoAdmissaoChip({ estado, className }: { estado: EstadoVisivel; className?: string }) {
  const { Icone, classe } = ASPETO[estado];
  return (
    <span className={cn("inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs", classe, className)}>
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <RotuloEstado estado={estado} />
    </span>
  );
}

function RotuloEstado({ estado }: { estado: EstadoVisivel }) {
  const { t } = useTranslation();
  return <>{t(`rhAdm.estado.${estado}`)}</>;
}
