import { BellRing } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EtapaPessoa, PapelPessoa } from "./pessoasTipos";

const SELO = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground";

/** Lead ou Cliente, sempre em texto (a cor só reforça). */
export function SeloPapel({ papel }: { papel: PapelPessoa }) {
  const { t } = useTranslation();
  const cor = papel === "cliente" ? "border-primary/50 bg-primary/10" : "border-border bg-muted";
  return <span className={cn(SELO, cor)}>{t(`pessoasPagina.role.${papel}`)}</span>;
}

/** "Voltou a contactar": ícone e texto. */
export function SeloVoltou() {
  const { t } = useTranslation();
  return (
    <span className={cn(SELO, "border-warning bg-warning/20")}>
      <BellRing className="h-3 w-3" aria-hidden="true" />
      {t("pessoasPagina.badge.returned")}
    </span>
  );
}

export function SeloEtapa({ etapa }: { etapa: EtapaPessoa }) {
  const { t } = useTranslation();
  return <span className={cn(SELO, "border-border bg-card")}>{t(`pessoasPagina.stage.${etapa}`)}</span>;
}
