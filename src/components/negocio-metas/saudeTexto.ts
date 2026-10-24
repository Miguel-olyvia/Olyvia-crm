// Os textos da saúde, do prazo e da cadeia de um negócio, para o cartão, a lista, o
// painel e a comparação dizerem sempre o mesmo. Os cálculos estão em `saudeNegocio.ts`.
// Com `longo`, "dias" por extenso e no singular quando é 1 (para leitores de ecrã).
import type { NegocioMes } from "./negocioMetas";
import { diasParaPrazo, type SaudeNegocio, type Traduzir } from "./saudeNegocio";

export type { Traduzir };

/** "3 d" (visual) ou "3 dias" / "1 dia" (por extenso). */
export function textoDias(t: Traduzir, count: number, longo = false): string {
  if (!longo) return t("businessGoals.days.short", { count });
  return t(count === 1 ? "businessGoals.days.longOne" : "businessGoals.days.long", { count });
}

function comDias(t: Traduzir, chave: string, count: number, longo: boolean): string {
  if (!longo) return t(`businessGoals.health.${chave}`, { count });
  return t(`businessGoals.health.${chave}${count === 1 ? "LongOne" : "Long"}`, { count });
}

/** "Atrasado há 3 d", "Parado há 9 d", "Sem orçamento escolhido", "Prazo hoje", "Em dia", "Ganho". */
export function textoSaude(saude: SaudeNegocio, n: NegocioMes, hoje: string, t: Traduzir, longo = false): string {
  const dias = diasParaPrazo(n.proximoPrazo, hoje) ?? 0;
  switch (saude) {
    case "atraso": return comDias(t, "atraso", -dias, longo);
    case "parado": return comDias(t, "parado", n.parado ?? 0, longo);
    case "urgente": return t(dias === 0 ? "businessGoals.health.urgenteHoje" : "businessGoals.health.urgenteAmanha");
    default: return t(`businessGoals.health.${saude}`);
  }
}

/** "2 orçamentos (1 escolhido)", "1 orçamento (nenhum escolhido)": por extenso e com o singular certo. */
export function textoOrcamentos(n: NegocioMes, t: Traduzir): string {
  const escolhidos = n.orcamentos.filter((o) => o.escolhido).length;
  return t(n.orcamentos.length === 1 ? "businessGoals.mini.quotesOne" : "businessGoals.mini.quotes", {
    count: n.orcamentos.length,
    chosen: t(escolhidos > 0 ? "businessGoals.mini.chosenOne" : "businessGoals.mini.chosenNone"),
  });
}

/** A cadeia em frases curtas: "2 orçamentos (1 escolhido)", "Proposta: enviada", "Contrato: pendente". */
export function textoCadeia(n: NegocioMes, t: Traduzir): string[] {
  const partes = [
    textoOrcamentos(n, t),
    n.proposta && t("businessGoals.mini.proposal", { state: t(`businessGoals.proposal.${n.proposta.estado}`).toLowerCase() }),
    n.contrato && t("businessGoals.mini.contract", { state: t(`businessGoals.contract.${n.contrato.estado}`).toLowerCase() }),
  ];
  return partes.filter((p): p is string => Boolean(p));
}
