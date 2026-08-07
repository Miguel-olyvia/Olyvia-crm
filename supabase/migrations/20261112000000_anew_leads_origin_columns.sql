-- anew_leads: repor as colunas de proveniencia que a base antiga tinha.
--
-- A base nova foi construida a partir do baseline sem estas 7 colunas, mas a
-- migracao de dados do Grupo BMLar traz valores reais para elas em 5.471 leads
-- (origin e entity_is_client preenchidas em todas, raw_status em 5.468). Sem
-- as colunas, esses dados nao teriam onde entrar e perder-se-iam.
--
-- Tipos derivados dos valores reais no ficheiro de migracao:
--   became_contact_at  timestamptz  ex.: 2026-03-30 10:04:23.25696+00
--   entity_is_client   boolean      'false' (5.452) / 'true' (19)
--   origin             text         'lead' (3.916) / 'contact' (1.555)
--   origin_lead_id     uuid         aponta para outra anew_leads
--   previous_status    text         'new' (5)
--   raw_status         text         'contacted', 'no_answer', 'active', ...
--   source_note        text         'migrated_from_contact' (1.605)
--
-- Todas nullable e sem default: aditivo puro, nao altera nenhuma linha
-- existente nem qualquer comportamento actual. IF NOT EXISTS torna a
-- migracao repetivel sem erro.
--
-- origin_lead_id NAO leva foreign key: aponta para leads da base antiga que
-- podem nao ter sido migradas, e uma FK faria falhar a importacao dessas
-- linhas em vez de as deixar entrar com a referencia orfa.

ALTER TABLE public.anew_leads
  ADD COLUMN IF NOT EXISTS became_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS entity_is_client  boolean,
  ADD COLUMN IF NOT EXISTS origin            text,
  ADD COLUMN IF NOT EXISTS origin_lead_id    uuid,
  ADD COLUMN IF NOT EXISTS previous_status   text,
  ADD COLUMN IF NOT EXISTS raw_status        text,
  ADD COLUMN IF NOT EXISTS source_note       text;

COMMENT ON COLUMN public.anew_leads.became_contact_at IS
  'Quando a lead passou a contacto na base antiga. Historico migrado.';
COMMENT ON COLUMN public.anew_leads.entity_is_client IS
  'Se a entidade da lead ja era cliente na base antiga. Historico migrado.';
COMMENT ON COLUMN public.anew_leads.origin IS
  'Proveniencia na base antiga: "lead" (criada como lead) ou "contact" (convertida de contacto).';
COMMENT ON COLUMN public.anew_leads.origin_lead_id IS
  'Lead de origem na base antiga, quando esta resultou de outra. Sem FK: a lead referida pode nao ter sido migrada.';
COMMENT ON COLUMN public.anew_leads.previous_status IS
  'Estado anterior na base antiga. Historico migrado.';
COMMENT ON COLUMN public.anew_leads.raw_status IS
  'Estado em bruto da base antiga, antes do mapeamento para o status actual.';
COMMENT ON COLUMN public.anew_leads.source_note IS
  'Nota livre sobre a origem na base antiga, ex.: "migrated_from_contact".';
