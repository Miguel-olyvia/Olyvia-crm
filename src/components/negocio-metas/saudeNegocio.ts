// Saúde e prazo de um negócio, em funções puras. Nenhuma lê o relógio: o dia de
// hoje (AAAA-MM-DD) chega sempre por parâmetro, para o resultado ser o mesmo
// em qualquer máquina e a qualquer hora.
import { negocioMetasQuadroTranslations } from "@/translations/negocioMetasQuadro";
import { faseDoNegocio, isNegocioGanho, type NegocioMes } from "./negocioMetas";

/** Parado há mais de tantos dias conta como "parado" (só Orçamento e Proposta têm "parado há"). */
export const LIMITE_PARADOS = 7;

export type SaudeNegocio = "atraso" | "parado" | "semOrcamento" | "urgente" | "emDia" | "ganho";

/** Da mais grave para a menos grave: é a ordem em que a saúde se decide e em que se ordena. */
export const ORDEM_SAUDE: readonly SaudeNegocio[] = ["atraso", "parado", "semOrcamento", "urgente", "emDia", "ganho"];

const MS_DIA = 86_400_000;

function diaUtc(dia: string): number {
  const [ano, mes, d] = dia.split("-").map(Number);
  return Date.UTC(ano, mes - 1, d);
}

/** Dias de `hoje` até `prazo`: negativo se já passou, 0 se é hoje; `null` sem prazo. */
export function diasParaPrazo(prazo: string | null, hoje: string): number | null {
  if (prazo === null) return null;
  return Math.round((diaUtc(prazo) - diaUtc(hoje)) / MS_DIA);
}

/** O próximo passo está em atraso: o prazo é anterior a hoje. */
export function emAtraso(n: NegocioMes, hoje: string): boolean {
  return n.proximoPrazo !== null && n.proximoPrazo < hoje;
}

export const estaParado = (n: NegocioMes): boolean => n.parado !== null && n.parado > LIMITE_PARADOS;

const semOrcamentoEscolhido = (n: NegocioMes): boolean =>
  faseDoNegocio(n) === "orcamento" && !n.orcamentos.some((o) => o.escolhido);

/**
 * A primeira que se aplicar: ganho (um negócio ganho mostra só "Ganho"; já não há nada
 * a tratar), atraso, parado, sem orçamento escolhido (fase Orçamento), urgente (prazo
 * hoje ou amanhã) e, por fim, em dia (qualquer negócio aberto sem nada acima).
 */
export function saudeDoNegocio(n: NegocioMes, hoje: string): SaudeNegocio {
  if (isNegocioGanho(n)) return "ganho";
  if (emAtraso(n, hoje)) return "atraso";
  if (estaParado(n)) return "parado";
  if (semOrcamentoEscolhido(n)) return "semOrcamento";
  const dias = diasParaPrazo(n.proximoPrazo, hoje);
  return dias !== null && dias <= 1 ? "urgente" : "emDia";
}

/** "Para tratar": um negócio aberto em atraso OU parado OU com prazo hoje. Os ganhos nunca entram. */
export function precisaTratar(n: NegocioMes, hoje: string): boolean {
  if (isNegocioGanho(n)) return false;
  return emAtraso(n, hoje) || estaParado(n) || diasParaPrazo(n.proximoPrazo, hoje) === 0;
}

export type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

/** Tradutor por defeito: português, a partir dos textos da página (a página passa o `t` da língua ativa). */
const traduzirPt: Traduzir = (chave, params) =>
  Object.entries(params ?? {}).reduce(
    (texto, [k, v]) => texto.replace(`{${k}}`, String(v)),
    negocioMetasQuadroTranslations.pt[chave] ?? chave,
  );

/**
 * "Hoje", "Amanhã", "Em 3 d · sex 16/10", "Atrasado 2 d · dom 11/10"; `null` sem prazo.
 * Com `longo`, "dias" por extenso (para leitores de ecrã). Os textos vêm de `t`.
 */
export function rotuloPrazo(prazo: string | null, hoje: string, t: Traduzir = traduzirPt, longo = false): string | null {
  const dias = diasParaPrazo(prazo, hoje);
  if (prazo === null || dias === null) return null;
  if (dias === 0) return t("businessGoals.due.today");
  if (dias === 1) return t("businessGoals.due.tomorrow");
  const [, mes, dia] = prazo.split("-");
  const when = `${t(`businessGoals.weekday.${new Date(diaUtc(prazo)).getUTCDay()}`)} ${dia}/${mes}`;
  const count = Math.abs(dias);
  const tipo = dias > 0 ? "in" : "overdue";
  const chave = !longo ? tipo : count === 1 ? `${tipo}LongOne` : `${tipo}Long`;
  return t(`businessGoals.due.${chave}`, { count, when });
}
