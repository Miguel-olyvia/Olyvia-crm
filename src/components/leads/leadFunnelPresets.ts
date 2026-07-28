import type { RuleGroup } from "./workflow/conditionCatalog";

/**
 * Sector presets for the lead funnel "Regras" tab (LeadWorkflowConfig.tsx).
 *
 * Each preset is a static, per-sector set of sensible rule values
 * (matching_statuses / reached_when / auto_advance / qualification_hint /
 * counts_as_*) for the stages a typical org in that sector would have.
 * Presets never touch the database — they only pre-fill the unsaved stage
 * form state; the user still reviews + clicks "Guardar & Recalcular".
 *
 * Matching an org's real stages against a preset:
 *   1. Try to match by stage `name` against `names` (case-insensitive).
 *   2. Fall back to matching by `stageOrder` (1-based position in the
 *      org's own stage_order sequence) when no name matches.
 *   3. If neither matches, the org's stage is left untouched.
 *
 * `reached_when` conditions must stay within the 12-item catalog evaluated
 * by public.stage_reached() — see ./workflow/conditionCatalog.ts.
 */
export interface FunnelPresetStageRule {
  /** Canonical stage-name aliases this rule set applies to (case-insensitive). */
  names: string[];
  /** 1-based fallback position, used when no stage name matches. */
  stageOrder: number;
  matchingStatuses: string[];
  reachedWhen: RuleGroup | null;
  autoAdvance: boolean;
  qualificationHint: "none" | "mql" | "sql";
  countsAsQualified: boolean;
  countsAsNegotiation: boolean;
  countsAsConverted: boolean;
  countsAsLost: boolean;
}

export interface FunnelPreset {
  id: string;
  label: string;
  description: string;
  stages: FunnelPresetStageRule[];
}

/**
 * "B2B Serviços" is the neutral baseline: a generic new → contacted →
 * qualified → negotiation → converted/lost funnel with conservative,
 * broadly-applicable signal rules. No seed data for the global template
 * stages (organization_id IS NULL) was found in the migrations, so this
 * preset is deliberately built from the same neutral fallbacks the app
 * already uses when a stage has no custom rules (matching_statuses
 * defaulting to [name], reached_when null, auto_advance false, counts_as_*
 * false) — selecting it on an org that never customized anything should
 * not change observable behavior.
 */
const B2B_SERVICOS: FunnelPreset = {
  id: "b2b_servicos",
  label: "B2B Serviços",
  description: "Funil genérico de serviços B2B — comportamento por omissão.",
  stages: [
    {
      names: ["new", "novo"],
      stageOrder: 1,
      matchingStatuses: ["new"],
      reachedWhen: null,
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["contacted", "contactado"],
      stageOrder: 2,
      matchingStatuses: ["contacted", "no_answer", "callback_scheduled"],
      reachedWhen: { all: [{ type: "has_contact_logged" }], any: [] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["qualified", "qualificado"],
      stageOrder: 3,
      matchingStatuses: ["qualified"],
      reachedWhen: {
        all: [{ type: "has_contact_logged" }],
        any: [{ type: "qualification_is", value: "mql" }, { type: "qualification_is", value: "sql" }],
      },
      autoAdvance: true,
      qualificationHint: "mql",
      countsAsQualified: true,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["negotiation", "negociacao", "negociação", "proposal", "proposta"],
      stageOrder: 4,
      matchingStatuses: ["visit_scheduled"],
      reachedWhen: {
        all: [],
        any: [{ type: "has_active_deal" }, { type: "has_active_quote" }, { type: "has_active_proposal" }],
      },
      autoAdvance: true,
      qualificationHint: "sql",
      countsAsQualified: false,
      countsAsNegotiation: true,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["converted", "ganho", "won"],
      stageOrder: 5,
      matchingStatuses: ["converted"],
      reachedWhen: { all: [{ type: "has_signed_contract" }], any: [] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: true,
      countsAsLost: false,
    },
    {
      names: ["lost", "rejected", "perdido"],
      stageOrder: 6,
      matchingStatuses: ["lost", "rejected"],
      reachedWhen: { all: [], any: [{ type: "last_contact_is_negative" }] },
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: true,
    },
  ],
};

/**
 * Retalho: fast cycle, low-touch. Contact and scheduling matter more than
 * formal qualification, and "converted" doesn't require a signed contract
 * (a deal/sale is enough for most retail transactions).
 */
const RETALHO: FunnelPreset = {
  id: "retalho",
  label: "Retalho",
  description: "Ciclo curto, foco em atendimento em loja/online e venda rápida.",
  stages: [
    {
      names: ["new", "novo"],
      stageOrder: 1,
      matchingStatuses: ["new"],
      reachedWhen: null,
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["contacted", "contactado"],
      stageOrder: 2,
      matchingStatuses: ["contacted", "no_answer"],
      reachedWhen: { all: [{ type: "has_contact_logged" }], any: [] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["visit_scheduled", "visita_agendada", "agendado"],
      stageOrder: 3,
      matchingStatuses: ["visit_scheduled"],
      reachedWhen: { all: [{ type: "has_scheduled_visit" }], any: [] },
      autoAdvance: true,
      qualificationHint: "mql",
      countsAsQualified: true,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["negotiation", "negociacao", "proposal", "orcamento", "orçamento"],
      stageOrder: 4,
      matchingStatuses: ["qualified"],
      reachedWhen: { all: [], any: [{ type: "has_active_quote" }, { type: "has_active_proposal" }] },
      autoAdvance: true,
      qualificationHint: "sql",
      countsAsQualified: false,
      countsAsNegotiation: true,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["converted", "vendido", "ganho"],
      stageOrder: 5,
      matchingStatuses: ["converted"],
      reachedWhen: { all: [], any: [{ type: "has_active_deal" }, { type: "has_signed_contract" }] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: true,
      countsAsLost: false,
    },
    {
      names: ["lost", "rejected", "perdido"],
      stageOrder: 6,
      matchingStatuses: ["lost", "rejected"],
      reachedWhen: { all: [], any: [{ type: "last_contact_is_negative" }] },
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: true,
    },
  ],
};

/**
 * Imobiliário: longer cycle, visits are the central qualifying event, and
 * "converted" genuinely requires a signed contract (escritura/contrato).
 */
const IMOBILIARIO: FunnelPreset = {
  id: "imobiliario",
  label: "Imobiliário",
  description: "Ciclo longo com visita como evento central de qualificação.",
  stages: [
    {
      names: ["new", "novo"],
      stageOrder: 1,
      matchingStatuses: ["new"],
      reachedWhen: null,
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["contacted", "contactado"],
      stageOrder: 2,
      matchingStatuses: ["contacted", "no_answer", "callback_scheduled"],
      reachedWhen: { all: [{ type: "has_contact_logged" }], any: [] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["visit_scheduled", "visita_agendada"],
      stageOrder: 3,
      matchingStatuses: ["visit_scheduled"],
      reachedWhen: { all: [{ type: "has_scheduled_visit" }], any: [] },
      autoAdvance: true,
      qualificationHint: "mql",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["qualified", "visitado", "visita_realizada"],
      stageOrder: 4,
      matchingStatuses: ["qualified"],
      reachedWhen: {
        all: [{ type: "has_scheduled_visit" }],
        any: [{ type: "qualification_is", value: "mql" }, { type: "qualification_is", value: "sql" }],
      },
      autoAdvance: true,
      qualificationHint: "sql",
      countsAsQualified: true,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["negotiation", "negociacao", "proposta", "proposal"],
      stageOrder: 5,
      matchingStatuses: [],
      reachedWhen: { all: [], any: [{ type: "has_active_proposal" }, { type: "has_active_deal" }] },
      autoAdvance: true,
      qualificationHint: "sql",
      countsAsQualified: false,
      countsAsNegotiation: true,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["converted", "escritura", "ganho"],
      stageOrder: 6,
      matchingStatuses: ["converted"],
      reachedWhen: { all: [{ type: "has_signed_contract" }], any: [] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: true,
      countsAsLost: false,
    },
    {
      names: ["lost", "rejected", "perdido"],
      stageOrder: 7,
      matchingStatuses: ["lost", "rejected"],
      reachedWhen: { all: [], any: [{ type: "last_contact_is_negative" }] },
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: true,
    },
  ],
};

/**
 * Educação: a scheduled meeting/open-day is the qualifying event, and
 * enrollment ("matriculado") requires a signed contract.
 */
const EDUCACAO: FunnelPreset = {
  id: "educacao",
  label: "Educação",
  description: "Reunião/dia aberto como qualificação, matrícula como conversão.",
  stages: [
    {
      names: ["new", "novo"],
      stageOrder: 1,
      matchingStatuses: ["new"],
      reachedWhen: null,
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["contacted", "contactado"],
      stageOrder: 2,
      matchingStatuses: ["contacted", "no_answer"],
      reachedWhen: { all: [{ type: "has_contact_logged" }], any: [] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["visit_scheduled", "reuniao_agendada", "meeting_scheduled"],
      stageOrder: 3,
      matchingStatuses: ["visit_scheduled"],
      reachedWhen: { all: [{ type: "has_scheduled_visit" }], any: [] },
      autoAdvance: true,
      qualificationHint: "mql",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["qualified", "interessado"],
      stageOrder: 4,
      matchingStatuses: ["qualified"],
      reachedWhen: {
        all: [{ type: "has_contact_logged" }],
        any: [{ type: "qualification_is", value: "mql" }, { type: "qualification_is", value: "sql" }],
      },
      autoAdvance: true,
      qualificationHint: "sql",
      countsAsQualified: true,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["negotiation", "negociacao", "proposta_matricula", "proposal"],
      stageOrder: 5,
      matchingStatuses: [],
      reachedWhen: { all: [], any: [{ type: "has_active_quote" }, { type: "has_active_proposal" }] },
      autoAdvance: true,
      qualificationHint: "sql",
      countsAsQualified: false,
      countsAsNegotiation: true,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["converted", "matriculado", "ganho"],
      stageOrder: 6,
      matchingStatuses: ["converted"],
      reachedWhen: { all: [{ type: "has_signed_contract" }], any: [] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: true,
      countsAsLost: false,
    },
    {
      names: ["lost", "rejected", "perdido"],
      stageOrder: 7,
      matchingStatuses: ["lost", "rejected"],
      reachedWhen: { all: [], any: [{ type: "last_contact_is_negative" }] },
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: true,
    },
  ],
};

/**
 * Saúde: an appointment ("consulta agendada") is the qualifying trigger, and
 * conversion accepts either an active deal or a signed contract since not
 * every clinic formalizes treatment start with a signed document.
 */
const SAUDE: FunnelPreset = {
  id: "saude",
  label: "Saúde",
  description: "Consulta agendada como qualificação, início de tratamento como conversão.",
  stages: [
    {
      names: ["new", "novo"],
      stageOrder: 1,
      matchingStatuses: ["new"],
      reachedWhen: null,
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["contacted", "contactado"],
      stageOrder: 2,
      matchingStatuses: ["contacted", "no_answer"],
      reachedWhen: { all: [{ type: "has_contact_logged" }], any: [] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["visit_scheduled", "consulta_agendada", "appointment_scheduled"],
      stageOrder: 3,
      matchingStatuses: ["visit_scheduled"],
      reachedWhen: { all: [{ type: "has_scheduled_visit" }], any: [] },
      autoAdvance: true,
      qualificationHint: "mql",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["qualified", "triagem"],
      stageOrder: 4,
      matchingStatuses: ["qualified"],
      reachedWhen: {
        all: [{ type: "has_contact_logged" }],
        any: [{ type: "qualification_is", value: "mql" }, { type: "qualification_is", value: "sql" }],
      },
      autoAdvance: true,
      qualificationHint: "sql",
      countsAsQualified: true,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["negotiation", "negociacao", "orcamento", "orçamento", "proposta"],
      stageOrder: 5,
      matchingStatuses: [],
      reachedWhen: { all: [], any: [{ type: "has_active_quote" }, { type: "has_active_proposal" }] },
      autoAdvance: true,
      qualificationHint: "sql",
      countsAsQualified: false,
      countsAsNegotiation: true,
      countsAsConverted: false,
      countsAsLost: false,
    },
    {
      names: ["converted", "tratamento", "tratamento_iniciado", "ganho"],
      stageOrder: 6,
      matchingStatuses: ["converted"],
      reachedWhen: { all: [], any: [{ type: "has_signed_contract" }, { type: "has_active_deal" }] },
      autoAdvance: true,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: true,
      countsAsLost: false,
    },
    {
      names: ["lost", "rejected", "perdido"],
      stageOrder: 7,
      matchingStatuses: ["lost", "rejected"],
      reachedWhen: { all: [], any: [{ type: "last_contact_is_negative" }] },
      autoAdvance: false,
      qualificationHint: "none",
      countsAsQualified: false,
      countsAsNegotiation: false,
      countsAsConverted: false,
      countsAsLost: true,
    },
  ],
};

export const LEAD_FUNNEL_PRESETS: FunnelPreset[] = [
  B2B_SERVICOS,
  RETALHO,
  IMOBILIARIO,
  EDUCACAO,
  SAUDE,
];

/**
 * Finds the preset rule set that applies to a given org stage: first by
 * name (case/diacritics-insensitive, trimmed), then by 1-based stage_order
 * position. Returns undefined when neither matches — callers should skip
 * the stage in that case.
 */
export function findPresetStageRule(
  preset: FunnelPreset,
  stageName: string,
  stageOrder: number
): FunnelPresetStageRule | undefined {
  const normalized = stageName.trim().toLowerCase();
  const byName = preset.stages.find(rule => rule.names.some(n => n.toLowerCase() === normalized));
  if (byName) return byName;
  return preset.stages.find(rule => rule.stageOrder === stageOrder);
}
