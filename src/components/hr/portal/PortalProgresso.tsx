/**
 * A faixa de progresso do processo (convite, preenchimento, analise do RH, contrato e
 * activacao). Cada passo diz em texto se esta concluido, e o actual, ou por fazer: o estado
 * nunca se percebe so pela cor.
 */
import { Check, Circle, CircleDot } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { PASSOS_PROGRESSO, passoDoProgresso } from "@/lib/hr/portalAdmissao";

export function PortalProgresso({ estado }: { estado: string | null }) {
  const { t } = useTranslation();
  const atual = passoDoProgresso(estado);
  // Um estado que nao tem lugar na faixa (rejeitada, cancelada...) nao a mostra: nao se inventa um passo.
  if (atual < 0) return null;
  return (
    <ol aria-label={t("portal.progresso.titulo")} className="grid gap-2 sm:grid-cols-4" data-testid="portal-progresso">
      {PASSOS_PROGRESSO.map((passo, i) => {
        const feito = i < atual;
        const corrente = i === atual;
        const Icone = feito ? Check : corrente ? CircleDot : Circle;
        const situacao = feito ? "portal.progresso.feito" : corrente ? "portal.progresso.atual" : "portal.progresso.porFazer";
        return (
          <li
            key={passo}
            aria-current={corrente ? "step" : undefined}
            className={cn(
              "flex items-start gap-2 rounded-lg border bg-background px-3 py-2 text-sm",
              corrente && "border-primary font-medium",
              !feito && !corrente && "text-muted-foreground",
            )}
          >
            <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-col">
              <span>{t(`portal.progresso.passo.${i}`)}</span>
              <span className="text-xs font-normal text-muted-foreground">{t(situacao)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
