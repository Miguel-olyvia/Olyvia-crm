-- Torna explícito, como regra configurável, o que até agora era implícito na
-- flag `is_won`.
--
-- Porquê
-- ------
-- Até 2026-08-31 o motor criava o contrato porque a fase da proposta tinha
-- `is_won = true`. A tabela `proposal_stage_actions` existia, o ecrã "Pipeline
-- Comercial — Automações" mostrava a regra e deixava desligá-la, e o motor
-- criava o contrato na mesma. Confirmado ao vivo na nike a 2026-08-30.
--
-- Corrigiu-se o motor: passa a valer só a acção configurada. Mas "a proposta foi
-- ganha" e "daí nasce um contrato" são duas afirmações diferentes, e só a
-- segunda é uma decisão de automação — logo tem de estar escrita algures, não
-- deduzida de uma flag.
--
-- Esta migration escreve-a. Para cada organização que hoje depende do
-- comportamento implícito, cria a regra correspondente. O comportamento não
-- muda; passa apenas a ser visível no ecrã e desligável por quem o queira
-- desligar.
--
-- Critério
-- --------
-- Só organizações que:
--   a) têm propostas (senão a regra não serve para nada), e
--   b) não têm já uma regra `create_contract` para essa fase (não duplicar).
--
-- A regra fica ligada, porque ligado é o comportamento actual. Quem a quiser
-- desligada desliga-a no ecrã — que é precisamente o que passou a funcionar.

INSERT INTO public.proposal_stage_actions (
  id, organization_id, stage_id, action_type, is_active, execution_order, created_at
)
SELECT
  gen_random_uuid(),
  o.organization_id,
  s.id,
  'create_contract',
  true,
  0,
  now()
FROM (
  -- organizações com propostas
  SELECT DISTINCT p.organization_id
  FROM public.proposals p
  WHERE p.organization_id IS NOT NULL
) o
CROSS JOIN LATERAL (
  -- as fases "ganhas" que essa organização usa: as suas, ou as globais
  SELECT ws.id
  FROM public.proposal_workflow_stages ws
  WHERE ws.is_won = true
    AND (ws.organization_id = o.organization_id OR ws.organization_id IS NULL)
) s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.proposal_stage_actions psa
  WHERE psa.organization_id = o.organization_id
    AND psa.stage_id = s.id
    AND psa.action_type = 'create_contract'
);
