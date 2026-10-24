// As regras MQL/SQL de Pessoas (tabela lead_qualification_rules, uma linha por organização), em forma pura.
// O catálogo de condições é o de Leads (conditionCatalog.ts, as 12 do separador «Qualificação», 11 tipos): reutiliza-se e não se copia.
// Aqui só se garante que o que se mostra e o que se envia à função da base é o que ela aceita (migration 20261226030000): objetos
// {type} (ou {type, value} em qualification_is), até duas listas, sem chaves a mais. O que o editor não sabe mostrar não se envia.
import {
  CONDITION_CATALOG,
  QUALIFICATION_LEGACY_KEYS,
  type CatalogRow,
  type RuleCondition,
  type RuleGroup,
} from "@/components/leads/workflow/conditionCatalog";

export type { RuleGroup };

/** As linhas do catálogo que o separador «Qualificação» oferece (as 12 de Leads, por ordem). */
export const LINHAS_QUALIFICACAO: readonly CatalogRow[] = CONDITION_CATALOG.filter((r) => QUALIFICATION_LEGACY_KEYS.includes(r.key));

/** Os tipos de condição que a função da base aceita (os das linhas acima: qualification_is conta uma vez). */
export const TIPOS_ACEITES: readonly string[] = [...new Set(LINHAS_QUALIFICACAO.map((r) => r.build().type))];

export interface RegrasQualificacao {
  mql: RuleGroup | null;
  sql: RuleGroup | null;
}

/** As regras lidas da base, mais quantas condições gravadas o editor não mostra (e que saem ao guardar). */
export interface RegrasLidas extends RegrasQualificacao {
  descartadas: number;
}

/** O que a função devolve. `depois` é null quando a resposta não se reconhece: quem chama relê da base. */
export interface ResultadoGuardar {
  mudou: boolean;
  depois: RegrasQualificacao | null;
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

function limparLista(lista: unknown): { condicoes: RuleCondition[]; descartadas: number } {
  if (!Array.isArray(lista)) return { condicoes: [], descartadas: 0 };
  const vistas = new Set<string>();
  const condicoes: RuleCondition[] = [];
  let descartadas = 0;
  for (const item of lista) {
    const linha = ehObjeto(item) ? LINHAS_QUALIFICACAO.find((r) => r.matches(item as unknown as RuleCondition)) : undefined;
    if (!linha) {
      descartadas += 1;
      continue;
    }
    // Duplicados exatos saem sem se contarem: a base também os remove.
    if (vistas.has(linha.key)) continue;
    vistas.add(linha.key);
    condicoes.push(linha.build());
  }
  return { condicoes, descartadas };
}

/**
 * Uma regra na forma que a função aceita: só condições do catálogo, na forma canónica, sem duplicados, sempre com `all` e `any`.
 * Sem condições devolve null (a base não guarda regras vazias). `descartadas` conta o que não se reconhece (tipos de fora, texto solto).
 */
export function limparRegra(regra: unknown): { regra: RuleGroup | null; descartadas: number } {
  if (!ehObjeto(regra)) return { regra: null, descartadas: 0 };
  const todas = limparLista(regra.all);
  const qualquer = limparLista(regra.any);
  const descartadas = todas.descartadas + qualquer.descartadas;
  if (todas.condicoes.length === 0 && qualquer.condicoes.length === 0) return { regra: null, descartadas };
  return { regra: { all: todas.condicoes, any: qualquer.condicoes }, descartadas };
}

/** A regra pronta para enviar à função: limpa, ou null. */
export function paraEnvio(regra: RuleGroup | null): RuleGroup | null {
  return limparRegra(regra).regra;
}

/** Lê a linha da tabela (`mql_when`, `sql_when`); sem linha, a organização ainda não tem regras. */
export function lerRegras(linha: unknown): RegrasLidas {
  const d = ehObjeto(linha) ? linha : {};
  const mql = limparRegra(d.mql_when);
  const sql = limparRegra(d.sql_when);
  return { mql: mql.regra, sql: sql.regra, descartadas: mql.descartadas + sql.descartadas };
}

/** Lê o `{antes, depois, mudou}` da função. Só `mudou === true` conta como alteração. */
export function lerResultadoGuardar(dados: unknown): ResultadoGuardar {
  const d = ehObjeto(dados) ? dados : {};
  const depois = ehObjeto(d.depois)
    ? { mql: limparRegra(d.depois.mql_when).regra, sql: limparRegra(d.depois.sql_when).regra }
    : null;
  return { mudou: d.mudou === true, depois };
}
