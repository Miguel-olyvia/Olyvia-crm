/**
 * O texto de cada chip do calendario: serve o chip e a descricao falada da celula.
 */
import type { ChipDia } from "./diferenca";
import { duracao, type Traduzir } from "./formatos";

export function textoDoChip(chip: ChipDia, t: Traduzir): string {
  const tempo = duracao(chip.minutos);
  switch (chip.tipo) {
    case "atraso":
      return t("rhCal.chip.atraso", { t: tempo });
    case "falta_marcada":
      return t(`rhCal.chip.falta.${chip.justificacao ?? "sem_justificacao"}`, { t: tempo });
    case "falta_sugerida":
      return t("rhCal.chip.faltaSugerida", { t: tempo });
    case "extra": {
      const estado = t(`rhFluxosC.he.estado.${chip.estado ?? "pendente"}`).toLowerCase();
      const base = t("rhCal.chip.extra", { t: tempo, estado });
      return chip.acima && chip.estado !== "acima_limite" ? `${base} ${t("rhCal.chip.extraAcima")}` : base;
    }
    case "tempo_a_mais":
      return t(chip.motivo === "sem_marca" ? "rhCal.chip.semMarca" : chip.motivo === "abaixo_minimo" ? "rhCal.chip.abaixoMinimo" : "rhCal.chip.porRegistar", { t: tempo });
    case "banco_credito":
      return t("rhCal.chip.bancoCredito", { t: tempo });
    case "banco_debito":
      return t("rhCal.chip.bancoDebito", { t: tempo });
    case "fora_local":
      return t("rhCal.chip.foraLocal");
    case "trabalho_em_folga":
      return t("rhCal.chip.trabalhoEmFolga", { t: tempo });
  }
}
