// Escolhe o painel em linha da ação aberta (nota, adiar ou encerrar a abordagem). "Registar chamada" não é um painel: é uma vista de
// detalhe da ficha (ver `FormChamada`).
import { useTranslation } from "@/hooks/useTranslation";
import { PainelAdiar } from "./PainelAdiar";
import { PainelEncerrar } from "./PainelEncerrar";
import { PainelNota } from "./PaineisChamadaNota";
import type { AcaoFicha, PropsPainel } from "./PainelBase";

export type AcaoPainel = Exclude<AcaoFicha, "chamada">;

export function PainelAcaoFicha({ acao, ...p }: PropsPainel & { acao: AcaoPainel }) {
  const { t } = useTranslation();
  switch (acao) {
    case "nota": return <PainelNota {...p} titulo={t("pessoasPagina.panel.noteTitle")} />;
    case "adiar": return <PainelAdiar {...p} titulo={t("pessoasPagina.panel.snoozeTitle")} />;
    case "encerrar": return <PainelEncerrar {...p} titulo={t("pessoasPagina.close.title")} />;
  }
}
