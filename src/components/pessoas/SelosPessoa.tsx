import { CircleHelp, Repeat, XCircle } from "lucide-react";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ICONE_RESULTADO } from "./iconesPessoa";
import type { QualificacaoPessoa, ResultadoOuNenhum } from "./pessoasTipos";

const SELO = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground";

/** "Voltou a contactar": texto simples, sem fundo, com o ícone de repetir em cor de aviso (legível, com variante escura). */
export function SeloVoltou() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
      <Repeat className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
      {t("pessoasPagina.badge.returned")}
    </span>
  );
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

/** "Abordagem encerrada": sem interesse, ou obra inviável (ícone e texto). */
export function SeloEncerrada() {
  const { t } = useTranslation();
  return (
    <span className={cn(SELO, "border-border bg-muted")}>
      <XCircle className="h-3 w-3" aria-hidden="true" />
      {t("pessoasPagina.close.badge")}
    </span>
  );
}

/** "Empresa": a pessoa tem uma empresa. */
export function SeloEmpresa() {
  const { t } = useTranslation();
  return <span className={cn(SELO, "border-border bg-muted")}>{t("pessoasPagina.head.company")}</span>;
}

/** O resultado do último contacto, sempre com ícone e texto ("Atendeu · interessado", "Sem contacto"). */
export function SeloResultado({ resultado, className }: { resultado: ResultadoOuNenhum | "outro"; className?: string }) {
  const { t } = useTranslation();
  // «Outro»: um resultado que as Leads guardam e não é dos cinco da chamada (só na Lista real).
  const Icone = resultado === "outro" ? CircleHelp : ICONE_RESULTADO[resultado];
  return (
    <span className={cn(SELO, "border-border bg-muted", className)}>
      <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
      {resultado === "outro" ? t("pessoasPagina.real.resultOther") : t(`pessoasPagina.result.${resultado}`)}
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

/** A marca "exemplo": os dados desta secção são de exemplo (uma por secção, não por campo). Em modo real (dados da base) não há marca. */
export function MarcaExemplo() {
  const { t } = useTranslation();
  const real = useFontePessoas().modo === "real";
  if (real) return null;
  return <span className="rounded-sm border border-dashed border-border px-1.5 text-xs text-muted-foreground">{t("pessoasPagina.head.example")}</span>;
}
