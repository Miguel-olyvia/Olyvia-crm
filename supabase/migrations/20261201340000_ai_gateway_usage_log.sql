-- Registo do custo REAL (tokens da Google) por chamada de IA, separado do
-- sistema de créditos.
-- ============================================================
-- _shared/aiCreditsCosts.ts cobra um preço fixo por ação (1/2/3 créditos)
-- ao cliente -- isso é uma decisão de negócio, não uma medição. Mas
-- _shared/aiGateway.ts já extrai o uso real de tokens de cada resposta da
-- Google (usageMetadata.promptTokenCount/candidatesTokenCount/
-- totalTokenCount) num campo `usage` -- e NENHUMA das 7 funções que
-- chamam isto (ai-assistant, generate-proposal-ai, etc.) alguma vez lê
-- esse campo. É calculado e deitado fora. Sem isto, não há como saber se
-- o preço fixo cobrado ao cliente cobre o custo real que a Olyvia paga à
-- Google.
--
-- Esta tabela não tem NADA a ver com plan_limits/organization_usage_counters
-- (aquilo é "quanto o cliente pode consumir"); isto é "quanto custou de
-- facto", para análise de margem do lado do negócio -- não é lido por
-- nenhuma RPC de limite, não bloqueia nada.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_gateway_usage_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  operation         text NOT NULL,
  credits_charged   integer NOT NULL,
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_gateway_usage_log IS
  'Uma linha por chamada real à API da Google através de callAiGateway -- operation identifica qual das 7 funções de IA (ai-assistant, chat-widget-ai, quote-ai-assistant, suggest-schedule-assignee, generate-proposal-ai, import-contract-pdf, leads-dashboard-ai-report), credits_charged é o preço fixo já cobrado via fn_check_and_consume_ai_credits, e os três campos de tokens são o custo real devolvido pela Google nessa chamada. organization_id NÃO é resolvido para a organização de faturação -- fica na organização onde a chamada aconteceu, porque isto é para análise de custo/operação, não para faturação (usar resolve_billing_organization_id só se precisares de agregar por conta). tokens podem ser NULL quando a Google não devolveu usageMetadata (ex: resposta em streaming interrompida) -- não bloqueia o registo da chamada, só fica sem essa métrica.';

CREATE INDEX IF NOT EXISTS idx_ai_gateway_usage_log_org_operation
  ON public.ai_gateway_usage_log (organization_id, operation);
CREATE INDEX IF NOT EXISTS idx_ai_gateway_usage_log_created_at
  ON public.ai_gateway_usage_log (created_at);

ALTER TABLE public.ai_gateway_usage_log ENABLE ROW LEVEL SECURITY;

-- Sem policy nenhuma para authenticated/anon -- isto é dado interno de
-- custo/margem do negócio, não algo que uma organização cliente deva ver
-- sobre si própria (ao contrário de organization_usage_counters, que é o
-- consumo dela face ao PRÓPRIO plano). Só service_role escreve e lê.
REVOKE ALL ON public.ai_gateway_usage_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_gateway_usage_log TO service_role;
