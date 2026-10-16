/**
 * Os dois selos do portal: o estado do processo e o prazo do link. O prazo fica ambar com
 * menos de 2 dias, e o aviso diz-se tambem em texto com um icone (nunca so pela cor).
 */
import { AlertTriangle, CircleDot, Clock3 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { estadoAdmissaoDe } from "@/lib/hr/estadoAdmissao";
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";
import { prazoEmAviso, restoDoPrazo } from "@/lib/hr/portalAdmissao";

export function SeloEstadoProcesso({ estado }: { estado: string | null }) {
  const { t } = useTranslation();
  return (
    <p
      data-testid="portal-selo-estado"
      className="inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground"
    >
      <CircleDot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t("portal.selo.estado", { estado: t(`hr.convite.estadoAdmissao.${estadoAdmissaoDe(estado)}`) })}</span>
    </p>
  );
}

export function SeloPrazo({ validUntil }: { validUntil: string | null }) {
  const { t } = useTranslation();
  const agora = new Date();
  const aviso = prazoEmAviso(validUntil, agora);
  const resto = restoDoPrazo(validUntil, agora);
  const resta =
    resto.tipo === "dias"
      ? t(resto.n === 1 ? "portal.resta.umDia" : "portal.resta.dias", { n: resto.n })
      : resto.tipo === "horas"
        ? t("portal.resta.horas", { n: resto.n })
        : resto.tipo === "minutos"
          ? t("portal.resta.minutos", { n: resto.n })
          : t("portal.resta.terminado");
  const Icone = aviso ? AlertTriangle : Clock3;
  return (
    <p
      data-testid="portal-selo-prazo"
      data-aviso={aviso ? "sim" : "nao"}
      className={cn(
        "inline-flex w-fit flex-wrap items-center gap-x-1.5 rounded-full border px-3 py-1 text-xs",
        aviso ? "border-amber-500/70 bg-amber-500/10 font-medium text-amber-900 dark:text-amber-300" : "text-muted-foreground",
      )}
    >
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t("portal.selo.prazo", { data: formatarDataHora(validUntil), resta })}</span>
      {aviso && <span>· {t("portal.selo.aviso")}</span>}
    </p>
  );
}
