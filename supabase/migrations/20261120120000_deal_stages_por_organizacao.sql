-- `deal_stages` passa a ser por organização, como as tabelas irmãs.
--
-- Problema
-- --------
-- `proposal_workflow_stages` e `quote_workflow_stages` têm `organization_id`,
-- `label` e `is_active`. O `deal_stages` ficou de fora: tem só nove colunas
-- (id, name, order_index, color, created_at, stage_key, is_won, is_lost,
-- is_final), sem nenhuma das três.
--
-- Consequências, ambas observadas ao vivo a 2026-08-31 no ramo de testes:
--
-- 1. O ecrã de fases dos Pedidos (`DealStagesManager.tsx`) foi escrito para a
--    forma das irmãs — filtra por `organization_id` e `is_active`, e insere
--    `label` e `created_by`. Todas as consultas devolvem
--    `42703 column deal_stages.organization_id does not exist`. As duas leituras
--    falham, o `else` engole a segunda sem verificar o erro, e o ecrã diz
--    "Nenhum estágio configurado" numa organização com cinco fases a funcionar.
--    O componente não está errado; faltava-lhe a tabela que ele pressupõe.
--
-- 2. Sem `organization_id`, as fases são partilhadas por todas as organizações,
--    e a RLS não o compensa: o SELECT é `USING (true)` e o INSERT/DELETE só
--    verifica a permissão `deals.manage`, sem olhar à organização. Quem tenha
--    essa permissão numa organização pode apagar as fases de todas.
--
-- O que esta migration faz
-- ------------------------
-- Acrescenta as colunas em falta e alinha a RLS pelo padrão já usado em
-- `proposal_workflow_stages`: cada organização vê as suas fases mais as globais
-- (`organization_id IS NULL`), e só pode escrever nas suas.
--
-- As cinco fases existentes ficam com `organization_id = NULL`, ou seja,
-- passam a ser o modelo global. É de propósito: `deals.stage_id` aponta para
-- elas, e o próprio `DealStagesManager` já as trata assim — procura primeiro as
-- da organização e recorre às globais quando não há nenhuma. Nada se parte, e
-- quem quiser fases próprias cria-as a partir do modelo.

ALTER TABLE public.deal_stages
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- `label` é o nome legível; `name` é a chave. Nas linhas que já existiam os dois
-- coincidem, e o componente já faz `label || name` quando falta.
UPDATE public.deal_stages SET label = name WHERE label IS NULL;

CREATE INDEX IF NOT EXISTS idx_deal_stages_organization ON public.deal_stages USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_deal_stages_order ON public.deal_stages USING btree (organization_id, order_index);

-- ---------------------------------------------------------------------------
-- RLS: pelo mesmo padrão de proposal_workflow_stages
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_select_deal_stages" ON public.deal_stages;
DROP POLICY IF EXISTS "authenticated_insert_deal_stages" ON public.deal_stages;
DROP POLICY IF EXISTS "authenticated_update_deal_stages" ON public.deal_stages;
DROP POLICY IF EXISTS "authenticated_delete_deal_stages" ON public.deal_stages;

-- Ver: as da própria organização, mais o modelo global.
CREATE POLICY "deal_stages_select_scoped" ON public.deal_stages
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  );

-- Escrever: só nas da própria organização, e só com `deals.manage`.
-- O modelo global (organization_id IS NULL) deixa de ser editável pela
-- aplicação — era esse o buraco.
CREATE POLICY "deal_stages_insert_scoped" ON public.deal_stages
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    AND public.has_anew_permission(auth.uid(), 'deals.manage')
  );

CREATE POLICY "deal_stages_update_scoped" ON public.deal_stages
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    AND public.has_anew_permission(auth.uid(), 'deals.manage')
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  );

CREATE POLICY "deal_stages_delete_scoped" ON public.deal_stages
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    AND public.has_anew_permission(auth.uid(), 'deals.manage')
  );

COMMENT ON COLUMN public.deal_stages.organization_id IS
  'NULL = fase do modelo global, visível a todas as organizações e não editável pela aplicação. Preenchido = fase própria da organização.';
