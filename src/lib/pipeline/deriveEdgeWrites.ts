/**
 * Reordenar o pipeline reescreve as regras de automação.
 *
 * Porquê assim, e não o motor a ler a ordem: a ordem dos módulos vive em
 * `organization_pipeline_config.modules`, um blob JSON sem UNIQUE em
 * `organization_id` e que hoje mais nada além da UI lê. Se o motor passasse a
 * consultá-lo, ficávamos com duas fontes de verdade que podem discordar — que é
 * exactamente o defeito que estamos a corrigir. Em vez disso, o gesto de
 * arrastar traduz-se em escritas nas tabelas `*_stage_actions`, que continuam a
 * ser a única autoridade sobre o que o motor faz.
 *
 * Invariantes:
 *  - a FASE de disparo mantém-se: o módulo continua a disparar quando disparava,
 *    só muda o que cria;
 *  - o que fica para trás é DESACTIVADO, nunca apagado — reversível;
 *  - acções que não são arestas (`create_task`, `send_email`, …) nunca são tocadas;
 *  - o módulo terminal não emite nada: `convert_to_client` é a aresta que ENTRA
 *    nele, escrita no módulo anterior.
 */
import { isTerminal, type OrderableModule } from "./moduleOrder";

/** A acção que CRIA cada módulo. Espelha STEP_TO_CREATE_ACTION da UI. */
export const ACTION_THAT_CREATES: Record<string, string> = {
  pedido: "create_deal",
  orcamento: "create_quote",
  proposta: "create_proposal",
  contrato: "create_contract",
  cliente: "convert_to_client",
};

const EDGE_ACTIONS = new Set(Object.values(ACTION_THAT_CREATES));

/** Uma linha de `<modulo>_stage_actions`. */
export interface StageActionRule {
  id: string;
  module: string;
  stage_id: string;
  action_type: string;
  is_active: boolean;
}

export interface EdgeWrites {
  /** Regras a desactivar (is_active = false). Nunca apagar. */
  deactivate: StageActionRule[];
  /** Regras novas a inserir. */
  insert: Array<{ module: string; stage_id: string; action_type: string }>;
  /** Regras desactivadas que voltam a ficar activas. */
  reactivate: StageActionRule[];
  /**
   * Módulos que deviam emitir uma aresta mas não têm nenhuma regra de onde se
   * possa herdar a fase de disparo. Não se adivinha a fase — pede-se.
   */
  needsTriggerStage: string[];
}

export function isEdgeAction(actionType: string): boolean {
  return EDGE_ACTIONS.has(actionType);
}

/**
 * O módulo activo que vem a seguir a `moduleId`, ou null se for o último.
 * Os desactivados são saltados: desligar o Orçamento faz o Pedido passar a
 * criar a Proposta directamente.
 */
export function nextEnabledModule<T extends OrderableModule>(
  modules: T[],
  moduleId: string,
): T | null {
  const i = modules.findIndex((m) => m.id === moduleId);
  if (i < 0) return null;
  for (let j = i + 1; j < modules.length; j++) {
    if (modules[j].enabled) return modules[j];
  }
  return null;
}

export function deriveEdgeWrites<T extends OrderableModule>(
  rules: StageActionRule[],
  modules: T[],
): EdgeWrites {
  const out: EdgeWrites = { deactivate: [], insert: [], reactivate: [], needsTriggerStage: [] };
  const activos = modules.filter((m) => m.enabled);

  // Um módulo desligado no ecrã tem de ficar desligado no motor. O motor não lê
  // `organization_pipeline_config` — só estas tabelas — logo, se a aresta ficar
  // activa, ele continua a executá-la e o ecrã passa a mentir. É o mesmo defeito
  // que esta reescrita existe para corrigir, e escapava por esta porta.
  //
  // Desactivar é seguro: quando o módulo voltar a ser activado, a derivação
  // encontra a aresta certa já existente e volta a ligá-la (`reactivate`), com a
  // fase de disparo original intacta.
  for (const m of modules.filter((x) => !x.enabled)) {
    out.deactivate.push(
      ...rules.filter((r) => r.module === m.id && isEdgeAction(r.action_type) && r.is_active),
    );
  }

  for (const m of activos) {
    // O terminal é sumidouro: não emite aresta nenhuma.
    if (isTerminal(m)) continue;

    const seguinte = nextEnabledModule(activos, m.id);
    const esperada = seguinte ? ACTION_THAT_CREATES[seguinte.id] : null;

    const arestasDoModulo = rules.filter((r) => r.module === m.id && isEdgeAction(r.action_type));

    // Sem módulo seguinte (é o último activo): não deve emitir nada.
    if (!esperada) {
      out.deactivate.push(...arestasDoModulo.filter((r) => r.is_active));
      continue;
    }

    const certas = arestasDoModulo.filter((r) => r.action_type === esperada);
    const erradas = arestasDoModulo.filter((r) => r.action_type !== esperada);

    out.deactivate.push(...erradas.filter((r) => r.is_active));

    if (certas.length > 0) {
      // Já existem: só garantir que estão activas. As fases mantêm-se todas —
      // um módulo pode legitimamente disparar a partir de mais do que uma fase.
      out.reactivate.push(...certas.filter((r) => !r.is_active));
      continue;
    }

    // Não existe a aresta certa: herdar a fase de disparo das erradas.
    const fases = [...new Set(erradas.map((r) => r.stage_id))];
    if (fases.length === 0) {
      out.needsTriggerStage.push(m.id);
      continue;
    }
    for (const stage_id of fases) {
      out.insert.push({ module: m.id, stage_id, action_type: esperada });
    }
  }

  return out;
}

/** Verdadeiro quando a derivação não muda nada — o caso que interessa provar. */
export function isNoOp(w: EdgeWrites): boolean {
  return w.deactivate.length === 0 && w.insert.length === 0 && w.reactivate.length === 0;
}
