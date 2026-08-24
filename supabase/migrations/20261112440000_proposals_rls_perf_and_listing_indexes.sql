-- ============================================================================
-- Performance da listagem de Propostas (pedido: reduzir tempo de carregamento
-- de ~5-7s), sem alterar quem tem acesso a quê.
--
-- Duas causas identificadas:
--   1. RLS caro: as policies de SELECT em `proposals` e as 4 policies base de
--      `proposal_items` chamam `auth.uid()` sem o envolver em
--      `(SELECT auth.uid())`, pelo que o Postgres pode reavaliar a função uma
--      vez por linha em vez de uma vez por query (o mesmo padrão já corrigido
--      para a policy de UPDATE de `proposals` em
--      20260626110000_rls_performance_and_proposals_check.sql, e para várias
--      policies de anew_leads/anew_clients/quotes/deals/client_contracts em
--      20260927010000_strict_crm_org_isolation.sql).
--   2. Falta de índice que sirva o ORDER BY da listagem
--      (organization_id, deleted_at, created_at DESC) em `proposals` e
--      `quotes`.
--
-- Nenhuma condição lógica de autorização é alterada — apenas a forma como
-- `auth.uid()` é invocado. Confirmado antes desta migração:
--   - A definição ATIVA da policy "Users can view proposals in their scope"
--     é a da migração 20260927010000 (ALTER POLICY, linhas ~263-283), que já
--     substituiu get_user_visible_org_ids por get_user_crm_org_ids nesta
--     tabela. Essa mesma migração já tinha reduzido o fallback pessoal da
--     policy: a baseline (20260615130000) e 20260625130000 incluíam também
--     `OR assigned_to = current_business_user_id()` como ramo final; esse
--     ramo já não está presente na versão activa desde 20260927010000. Esta
--     migração NÃO restaura esse ramo — replica fielmente a lógica hoje
--     activa, para não alargar nem estreitar acesso.
--   - As 4 policies base de `proposal_items` (select/insert/update/delete)
--     já tinham sido trocadas de get_user_visible_org_ids para
--     get_user_crm_org_ids por 20260928010000_fix_missed_crm_org_ids_swap.sql
--     (a policy RESTRICTIVE system_admin_pii_default_deny de proposal_items
--     já usa (SELECT auth.uid()) desde 20260927010000 e não é tocada aqui).
--     Falta apenas nestas 4 o mesmo wrap (SELECT auth.uid()) — é o que esta
--     migração aplica, sem tocar na função já usada.
--   - get_user_crm_org_ids(_auth_uid) (20260927010000) devolve apenas as
--     orgs de membership activa directa do utilizador, sem o alargamento a
--     ascendentes/descendentes/associações que get_user_visible_org_ids faz.
--     Esta troca já foi aplicada e é o padrão estabelecido para as 7 tabelas
--     do contrato CRM (anew_leads, anew_contacts, anew_clients, quotes,
--     deals, proposals, client_contracts) — proposal_items segue o mesmo
--     padrão por ser a tabela filha de proposals. Nada nesta migração troca
--     essa função; apenas envolve auth.uid() com (SELECT ...).
--   - Índices já existentes em `proposals`: idx_proposals_active
--     (organization_id) WHERE deleted_at IS NULL, idx_proposals_organization_id
--     (organization_id) WHERE is_deleted = false, idx_proposals_trash
--     (organization_id) WHERE deleted_at IS NOT NULL — nenhum cobre
--     created_at DESC. Em `quotes`: idx_quotes_active, idx_quotes_trash
--     (mesma forma) e quotes_accepted_at_idx (accepted_at) — também nenhum
--     cobre created_at DESC. Os novos índices abaixo não duplicam nenhum
--     destes.
--
-- NOTA sobre CONCURRENTLY: este ficheiro combina DROP/CREATE POLICY com
-- CREATE INDEX na mesma migração. `CREATE INDEX CONCURRENTLY` não pode
-- correr dentro de um bloco transacional, e quando várias declarações são
-- enviadas juntas (como sucede na aplicação desta migração) o Postgres
-- trata-as como uma única transação implícita — por isso os índices abaixo
-- usam `CREATE INDEX IF NOT EXISTS` (sem CONCURRENTLY), seguindo o fallback
-- previsto no pedido. O padrão CONCURRENTLY já usado no projeto
-- (20261112170000_entity_identity_lookup_indexes.sql) está isolado num
-- ficheiro que só contém índices, precisamente por esta razão.
--
-- Pedido: otimização de performance da página de Propostas (RLS caro +
-- falta de índice de listagem), preservando exatamente a mesma lógica de
-- autorização.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. proposals — SELECT policy: wrap auth.uid() em (SELECT auth.uid())
--    Lógica idêntica à versão activa (20260927010000), incluindo a ordem dos
--    OR e o EXISTS sobre deals. Único ramo removido em 20260927010000 e NÃO
--    restaurado aqui: "OR assigned_to = current_business_user_id()".
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view proposals in their scope" ON public.proposals;

CREATE POLICY "Users can view proposals in their scope" ON public.proposals
FOR SELECT
USING (
  has_anew_permission((SELECT auth.uid()), 'proposals.view'::text)
  AND (
    (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    OR (
      organization_id IS NULL
      AND EXISTS (
        SELECT 1 FROM deals d
        WHERE d.id = proposals.deal_id
          AND d.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
      )
    )
    OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = proposals.deal_id
        AND (d.created_by = current_business_user_id() OR d.assigned_to = current_business_user_id())
    )
    OR created_by = current_business_user_id()
  )
);

-- ----------------------------------------------------------------------------
-- 2. proposal_items — 4 policies base: wrap auth.uid() em (SELECT auth.uid())
--    Função já correcta (get_user_crm_org_ids, desde 20260928010000) — apenas
--    o wrap muda. Fallbacks proposal_id IS NULL (via organization_id IS NULL)
--    e created_by preservados tal como estão hoje.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "proposal_items_select" ON public.proposal_items;

CREATE POLICY "proposal_items_select" ON public.proposal_items
FOR SELECT TO authenticated
USING (
  proposal_id IN (
    SELECT proposals.id FROM proposals
    WHERE proposals.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
       OR proposals.organization_id IS NULL
       OR proposals.created_by = (
            SELECT anew_users.id FROM anew_users
            WHERE anew_users.auth_user_id = (SELECT auth.uid())
            LIMIT 1
          )
  )
);

DROP POLICY IF EXISTS "proposal_items_insert" ON public.proposal_items;

CREATE POLICY "proposal_items_insert" ON public.proposal_items
FOR INSERT TO authenticated
WITH CHECK (
  proposal_id IN (
    SELECT proposals.id FROM proposals
    WHERE proposals.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
       OR proposals.organization_id IS NULL
       OR proposals.created_by = (
            SELECT anew_users.id FROM anew_users
            WHERE anew_users.auth_user_id = (SELECT auth.uid())
            LIMIT 1
          )
  )
);

DROP POLICY IF EXISTS "proposal_items_update" ON public.proposal_items;

CREATE POLICY "proposal_items_update" ON public.proposal_items
FOR UPDATE TO authenticated
USING (
  proposal_id IN (
    SELECT proposals.id FROM proposals
    WHERE proposals.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
       OR proposals.organization_id IS NULL
       OR proposals.created_by = (
            SELECT anew_users.id FROM anew_users
            WHERE anew_users.auth_user_id = (SELECT auth.uid())
            LIMIT 1
          )
  )
);

DROP POLICY IF EXISTS "proposal_items_delete" ON public.proposal_items;

CREATE POLICY "proposal_items_delete" ON public.proposal_items
FOR DELETE TO authenticated
USING (
  proposal_id IN (
    SELECT proposals.id FROM proposals
    WHERE proposals.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
       OR proposals.organization_id IS NULL
       OR proposals.created_by = (
            SELECT anew_users.id FROM anew_users
            WHERE anew_users.auth_user_id = (SELECT auth.uid())
            LIMIT 1
          )
  )
);

-- ----------------------------------------------------------------------------
-- 3. Índices para o ORDER BY da listagem (organization_id, deleted_at,
--    created_at DESC). Não duplicam nenhum índice existente (ver nota acima).
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_proposals_org_deleted_created
  ON public.proposals (organization_id, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_org_deleted_created
  ON public.quotes (organization_id, deleted_at, created_at DESC);
