/**
 * Resumo em linguagem de negocio de um codigo de processamento, para a linha
 * da lista em `ConfiguracaoVencimento.tsx` -- ex.: "Ao valor da regra
 * salarial · horas extra", "12,50 € por dia de feriado trabalhado", "50,00 € por mes",
 * "aplicado a mao". Funcao pura: recebe so os campos de calculo e a funcao
 * `t` de traducao, para ser reutilizavel e testavel sem montar o componente.
 */
import type { HrCodigoProcessamento } from "@/components/rh-exemplo/tipos";

export type CodigoParaResumo = Pick<
  HrCodigoProcessamento,
  "modo_calculo" | "percentagem" | "valor_fixo" | "origem_automatica"
>;

type FuncaoTraducao = (key: string, params?: Record<string, string | number>) => string;

/** "12,50 €" -- sempre com as duas casas decimais do euro. */
function formatarEuro(valor: number | null): string {
  if (valor === null) return "";
  return `${valor.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

export function resumoCodigoProcessamento(codigo: CodigoParaResumo, t: FuncaoTraducao): string {
  switch (codigo.modo_calculo) {
    case "manual":
      return t("hr.vencimento.codigos.resumo.manual");

    case "percentagem_hora_normal": {
      // A percentagem guardada ja nao conta: o calculo paga ao valor da regra salarial da origem.
      const base = t("hr.vencimento.codigos.resumo.regraOrigem");
      if (!codigo.origem_automatica) return base;
      return `${base} · ${t(`hr.vencimento.codigos.origem.${codigo.origem_automatica}`)}`;
    }

    case "valor_fixo_ocorrencia": {
      const valor = formatarEuro(codigo.valor_fixo);
      if (codigo.origem_automatica === "feriado_trabalhado") {
        return t("hr.vencimento.codigos.resumo.valorFixoFeriado", { valor });
      }
      if (codigo.origem_automatica === "descanso_trabalhado") {
        return t("hr.vencimento.codigos.resumo.valorFixoDescanso", { valor });
      }
      return t("hr.vencimento.codigos.resumo.valorFixoOcorrencia", { valor });
    }

    case "valor_fixo_mensal":
      return t("hr.vencimento.codigos.resumo.valorFixoMensal", { valor: formatarEuro(codigo.valor_fixo) });

    default:
      return t("hr.vencimento.codigos.resumo.manual");
  }
}
