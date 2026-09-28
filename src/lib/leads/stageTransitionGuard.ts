/**
 * Guarda de transições de estágio de lead.
 *
 * O diagrama de fluxo (WorkflowFlowchart / `lead_stage_transitions`) desenha
 * as transições permitidas entre estágios. Até agora essas arestas eram
 * puramente decorativas; passam a poder restringir de facto as mudanças de
 * estágio, mas SÓ quando `enforce_stage_transitions` está ativo em
 * `lead_pipeline_settings`.
 *
 * ÂMBITO (deliberadamente estreito): esta guarda aplica-se apenas a
 * transições iniciadas por um utilizador no frontend — arrastar no Kanban,
 * ação em massa, diálogo de edição e diálogo de registo de contacto. O motor
 * automático da base de dados (trigger `trg_sync_lead_workflow_stage_id`,
 * `auto_advance`, edge function `execute-workflow`) NUNCA passa por aqui e
 * mantém-se isento.
 */

export interface LeadStageTransitionEdge {
  from_stage_id: string;
  to_stage_id: string;
}

export interface LeadStageTransitionCheckInput {
  /** `lead_pipeline_settings.enforce_stage_transitions` da organização. */
  enforce: boolean;
  /** Arestas ativas desenhadas no diagrama, para esta organização. */
  transitions: readonly LeadStageTransitionEdge[];
  /** Estágio atual da lead (`anew_leads.workflow_stage_id`). */
  fromStageId: string | null | undefined;
  /** Estágio de destino. */
  toStageId: string | null | undefined;
}

/**
 * Devolve `true` quando a transição pode avançar.
 *
 * Falha SEMPRE para o lado permissivo nos casos ambíguos, para nunca
 * bloquear trabalho legítimo por causa de configuração incompleta:
 *  - restrição desligada → permite tudo (comportamento atual);
 *  - organização sem nenhuma aresta desenhada → permite (senão bloqueava
 *    todas as mudanças de estágio da organização);
 *  - lead sem estágio de origem definido → permite (leads sem estado têm de
 *    poder entrar no fluxo);
 *  - destino por resolver → permite (nada muda de estágio, a validação
 *    pertence a quem resolve o estágio);
 *  - origem igual ao destino → permite (não é uma transição).
 */
export function isLeadStageTransitionAllowed(input: LeadStageTransitionCheckInput): boolean {
  if (!input.enforce) return true;
  if (!input.transitions || input.transitions.length === 0) return true;
  if (!input.fromStageId) return true;
  if (!input.toStageId) return true;
  if (input.fromStageId === input.toStageId) return true;

  return input.transitions.some(
    (transition) =>
      transition.from_stage_id === input.fromStageId && transition.to_stage_id === input.toStageId
  );
}

export const LEAD_STAGE_TRANSITION_BLOCKED_TITLE = "Transição não permitida";

/**
 * Mensagem de erro para o utilizador. Os rótulos são opcionais porque nem
 * todos os pontos de chamada têm os dois estágios carregados em memória.
 */
export function leadStageTransitionBlockedMessage(
  fromLabel?: string | null,
  toLabel?: string | null
): string {
  const path =
    fromLabel && toLabel
      ? `de "${fromLabel}" para "${toLabel}" `
      : toLabel
        ? `para "${toLabel}" `
        : "";
  return `A mudança ${path}não está prevista no fluxo configurado. Desenhe essa ligação no diagrama de transições (Configuração de Workflow → Fluxo) ou desative a restrição de transições.`;
}
