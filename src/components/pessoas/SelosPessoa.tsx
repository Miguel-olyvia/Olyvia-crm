import { BellRing, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EtapaPessoa, PapelPessoa, QualificacaoPessoa } from "./pessoasTipos";

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

/** "Perdida": ícone e texto. */
export function SeloPerdida() {
  const { t } = useTranslation();
  return (
    <span className={cn(SELO, "border-destructive bg-destructive/15")}>
      <XCircle className="h-3 w-3" aria-hidden="true" />
      {t("pessoasPagina.badge.lost")}
    </span>
  );
}

/** MQL ou SQL, em texto. */
export function SeloQualificacao({ qualificacao }: { qualificacao: QualificacaoPessoa }) {
  const { t } = useTranslation();
  const significado = t(`pessoasPagina.head.qual${qualificacao}`);
  return (
    <span title={significado} className={cn(SELO, "border-border bg-card")}>
      <span aria-hidden="true">{qualificacao}</span>
      <span className="sr-only">{`${qualificacao}, ${significado}`}</span>
    </span>
  );
}

/** A marca "exemplo": os dados desta secção são de exemplo (uma por secção, não por campo). */
export function MarcaExemplo() {
  const { t } = useTranslation();
  return <span className="rounded-sm border border-dashed border-border px-1.5 text-xs text-muted-foreground">{t("pessoasPagina.head.example")}</span>;
}
