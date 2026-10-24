// Pequenas etiquetas da lista e do painel: estado, origem, gravidade e prazo. Nenhuma depende só da cor: levam
// sempre texto e ícone.
import type { LucideIcon } from "lucide-react";
import { Archive, CircleCheck, Clock, EyeOff, Inbox, MessageCircleQuestion, Search, TriangleAlert, UserRound } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { dataCurta } from "../lib/datas";
import type { PrazoAtual } from "../lib/prazos";
import type { EstadoDenuncia, Gravidade } from "../lib/tipos";

const CHIP = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground";

const ICONE_ESTADO: Record<EstadoDenuncia, LucideIcon> = {
  recebida: Inbox,
  em_analise: Search,
  mais_info: MessageCircleQuestion,
  concluida: CircleCheck,
  arquivada: Archive,
};

export function EstadoChip({ estado }: { estado: EstadoDenuncia }) {
  const { t } = useTranslation();
  const Icone = ICONE_ESTADO[estado];
  return (
    <span className={CHIP}>
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {t(`cd.estado.${estado}`)}
    </span>
  );
}

export function OrigemChip({ anonima }: { anonima: boolean }) {
  const { t } = useTranslation();
  const Icone = anonima ? EyeOff : UserRound;
  return (
    <span className={CHIP}>
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {anonima ? t("cd.origem.anonima") : t("cd.origem.identificada")}
    </span>
  );
}

export function GravidadeChip({ gravidade }: { gravidade: Gravidade }) {
  const { t } = useTranslation();
  return <span className={CHIP}>{t(`cd.gravidade.${gravidade}`)}</span>;
}

/** «Confirmar até 18/10», «Responder até 15/01»; atrasado fica a vermelho com ícone e a palavra «Atrasado». */
export function PrazoTexto({ prazo }: { prazo: PrazoAtual }) {
  const { t } = useTranslation();
  if (prazo.tipo === "nenhum" || !prazo.data) return <span className="text-muted-foreground">{t("cd.prazo.nenhum")}</span>;
  const texto = t(prazo.tipo === "confirmar" ? "cd.prazo.confirmarAte" : "cd.prazo.responderAte", { data: dataCurta(prazo.data) });
  if (prazo.situacao === "atrasado") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-destructive">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {texto} · {t("cd.prazo.atrasado")}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1", prazo.situacao === "a_vencer" && "font-medium text-foreground")}>
      {prazo.situacao === "a_vencer" && <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {texto}
      {prazo.situacao === "a_vencer" && <span className="sr-only"> · {t("cd.prazo.aVencer")}</span>}
    </span>
  );
}
