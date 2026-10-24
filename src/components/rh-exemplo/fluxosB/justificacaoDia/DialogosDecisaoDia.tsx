/**
 * Os diálogos com que o RH decide uma justificação de dia: «Aceitar» pergunta se a falta fica paga ou não paga; «Recusar»
 * pede o motivo (mínimo 3 caracteres, o mesmo diálogo das outras recusas). Fica no ecrã que lista as justificações, e não
 * em cada linha: a linha desaparece quando a decisão é tomada e o diálogo tem de a sobreviver.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MotivoMinimoDialog } from "@/components/rh-exemplo/fluxosB/MotivoMinimoDialog";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import type { DecisaoJustificacaoDia, JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";

export interface PedidoDecisaoDia {
  justificacao: JustificacaoDia;
  tipo: "aceitar" | "recusar";
  pessoaNome: string;
}

interface Props {
  pedido: PedidoDecisaoDia | null;
  aoFechar: () => void;
  /** Devolve a chave do erro, ou `null` quando a decisão ficou registada. */
  aoDecidir: (justificacao: JustificacaoDia, decisao: DecisaoJustificacaoDia, motivo: string) => string | null;
}

export function DialogosDecisaoDia({ pedido, aoFechar, aoDecidir }: Props) {
  const { t } = useTranslation();
  const j = pedido?.justificacao ?? null;
  const dia = j ? formatarData(j.data) : "";
  return (
    <>
      <AlertDialog open={pedido?.tipo === "aceitar"} onOpenChange={(aberto) => !aberto && aoFechar()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rhJust.rh.escolherTitulo", { pessoa: pedido?.pessoaNome ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("rhJust.rh.escolherDescricao", { dia })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="min-h-11">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={() => j && aoDecidir(j, "aceitar_paga", "")}>
              {t("rhJust.rh.aceitarPaga")}
            </AlertDialogAction>
            <AlertDialogAction className="min-h-11" onClick={() => j && aoDecidir(j, "aceitar_nao_paga", "")}>
              {t("rhJust.rh.aceitarNaoPaga")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MotivoMinimoDialog
        aberto={pedido?.tipo === "recusar"}
        titulo={t("rhJust.rh.recusarTitulo")}
        descricao={t("rhJust.rh.recusarDescricao")}
        rotuloConfirmar={t("rhJust.rh.recusar")}
        onConfirmar={(motivo) => (j ? aoDecidir(j, "recusar", motivo) : null)}
        onFechar={aoFechar}
        idPrefixo="rhjd-recusa"
      />
    </>
  );
}
