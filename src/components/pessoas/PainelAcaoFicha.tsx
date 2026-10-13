// Escolhe o painel da ação aberta.
import { useTranslation } from "@/hooks/useTranslation";
import { PainelAdiar, PainelPerder } from "./PaineisAdiarPerder";
import { PainelChamada, PainelNota } from "./PaineisChamadaNota";
import type { AcaoFicha, PropsPainel } from "./PainelBase";

export function PainelAcaoFicha({ acao, ...p }: PropsPainel & { acao: AcaoFicha }) {
  const { t } = useTranslation();
  switch (acao) {
    case "chamada": return <PainelChamada {...p} titulo={t("pessoasPagina.panel.callTitle")} />;
    case "nota": return <PainelNota {...p} titulo={t("pessoasPagina.panel.noteTitle")} />;
    case "adiar": return <PainelAdiar {...p} titulo={t("pessoasPagina.panel.snoozeTitle")} />;
    case "perder": return <PainelPerder {...p} titulo={t("pessoasPagina.panel.lostTitle")} />;
  }
}
