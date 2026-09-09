-- ----------------------------------------------------------------------------
-- client_contracts_list_metrics(): adds `_allowed_user_ids`, applying the
-- SAME client_contracts.view scope restriction the list query in
-- src/pages/ClientContracts.tsx now applies (see
-- src/lib/contracts/scope.ts::resolveContractsScopeUserIds and the
-- `.in("created_by", scopeUserIds)` predicate in the list's queryFn), so the
-- KPI cards stop summing contracts a scope-restricted viewer cannot even see
-- in the list.
--
-- Context: this page's `client_contracts.view` permission supports
-- ORG/TEAM/OWNED/NONE scope, but neither the list query nor this RPC applied
-- it — commit 54d65378 ("feat(contracts): visibilidade por area em vez de
-- por criador", 2026-08-22) removed the list's OWNED/TEAM `created_by`
-- predicate, and this RPC (added 2026-11-15, AFTER that commit) was written
-- without ever having one. The product owner reverted that decision: scope
-- applies again, everywhere in the app. Confirmed against production
-- (Mudelar, org 3242e925-da26-459a-8258-be04d904e355): a sales_technician
-- with OWNED scope and no scope override saw all 66 contracts in the org
-- instead of only the ones they created.
--
-- Ownership rule for `_allowed_user_ids`: `cc.created_by` OR `cc.assigned_to` — the same
-- canActOnEntity/applyScopeFilter (usePermissionScope.ts) already use for
-- this page's edit/delete scope, and the field the proposals-for-contracts
-- picker query in ClientContracts.tsx (and Proposals.tsx / Quotes.tsx)
-- already use for their own OWNED/TEAM view scope. Deliberately NOT
-- COALESCE(assigned_to, created_by) (the "comercial" shown in the COMERCIAL
-- column) — this is a different, narrower rule than that column, matching
-- the predicate the removed code actually used.
--
-- `_allowed_user_ids` semantics (resolved client-side, this function does
-- NOT decide authorization):
--   NULL       -> no restriction (ORG scope, or system_admin).
--   any array  -> only rows whose `created_by` is in the array match. An
--                empty array matches nothing; the TypeScript caller
--                short-circuits before calling this RPC at all when the
--                resolved scope is empty (NONE, or OWNED/TEAM before the
--                viewer's anew_users id is resolved) to avoid the round trip.
--
-- SECURITY INVOKER (default, unchanged): runs with the caller's privileges,
-- so the `client_contracts_select` RLS policy (organization_id IN
-- get_user_crm_org_ids(auth.uid()) AND has_anew_permission(...,
-- 'client_contracts.view')) still applies underneath. This function filters
-- an additional VIEW-SCOPE CONVENTION on top, resolved and passed in by the
-- TypeScript caller — it is not itself a security boundary, exactly like the
-- `_organization_ids` parameter it already received.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.client_contracts_list_metrics(
  uuid[], text, text, timestamptz, timestamptz, uuid, uuid, boolean, timestamptz
);

CREATE FUNCTION public.client_contracts_list_metrics(
  _organization_ids uuid[],
  _status_filter    text,
  _search           text,
  _date_from        timestamptz,
  _date_to          timestamptz,
  _only_mine        uuid,
  _comercial        uuid,
  _comercial_none   boolean,
  _now              timestamptz,
  _allowed_user_ids uuid[]
)
RETURNS TABLE (
  total_count      integer,
  total_value      numeric,
  draft_count      integer,
  draft_value      numeric,
  sent_count       integer,
  sent_value       numeric,
  signed_count     integer,
  signed_value     numeric,
  expired_count    integer,
  expired_value    numeric,
  active_value     numeric,
  avg_value        numeric,
  sign_rate        integer,
  expiring90_count integer,
  avg_sign_days    integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      cc.status,
      cc.created_at,
      cc.updated_at,
      cc.end_date,
      CASE
        WHEN cc.quote_id IS NOT NULL AND q.total IS NOT NULL THEN q.total
        ELSE COALESCE(cc.total_value, 0)
      END AS effective_value
    FROM public.client_contracts cc
    -- O JOIN exige `q.proposal_id = cc.proposal_id` de proposito: no cliente,
    -- getEffectiveContractValue procura a quote SO dentro de
    -- `contract.proposals.quotes`, por isso uma quote_id que aponte para uma
    -- quote de OUTRA proposta nao e encontrada e o valor cai para
    -- total_value. Um JOIN so por `q.id = cc.quote_id` encontraria essa quote
    -- e o cartao passaria a somar um valor diferente do que a linha da lista
    -- mostra. Paridade com a lista manda aqui.
    LEFT JOIN public.quotes q ON q.id = cc.quote_id AND q.proposal_id = cc.proposal_id
    LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
    LEFT JOIN public.proposals p ON p.id = cc.proposal_id
    WHERE cc.organization_id = ANY(_organization_ids)
      AND cc.deleted_at IS NULL
      -- Ambito client_contracts.view (ver comentario da funcao): o MESMO
      -- predicado que a query da lista aplica. Uniao dos dois campos, igual ao predicado da lista e ao das Leads.
      -- So `created_by` escondia contratos ATRIBUIDOS ao utilizador que outra
      -- pessoa criou (medido na Mudelar: 8 criados vs 9 atribuidos), apesar de
      -- a coluna COMERCIAL os mostrar como dele.
      AND (
        _allowed_user_ids IS NULL
        OR cc.created_by = ANY(_allowed_user_ids)
        OR cc.assigned_to = ANY(_allowed_user_ids)
      )
      AND (_only_mine IS NULL OR cc.created_by = _only_mine)
      AND (_comercial_none IS NOT TRUE OR COALESCE(cc.assigned_to, cc.created_by) IS NULL)
      AND (_comercial IS NULL OR COALESCE(cc.assigned_to, cc.created_by) = _comercial)
      AND (
        _status_filter IS NULL
        OR _status_filter = 'all'
        OR (
          _status_filter = 'expiring'
          AND cc.end_date IS NOT NULL
          AND ceil(extract(epoch FROM (cc.end_date::timestamptz - _now)) / 86400) > 0
          AND ceil(extract(epoch FROM (cc.end_date::timestamptz - _now)) / 86400) <= 90
        )
        OR (_status_filter = 'signed' AND cc.status IN ('signed', 'active'))
        OR (_status_filter NOT IN ('expiring', 'signed') AND cc.status = _status_filter)
      )
      AND (
        _search IS NULL OR _search = ''
        OR strpos(lower(COALESCE(cc.contract_number, '')), lower(_search)) > 0
        OR strpos(lower(COALESCE(e.display_name, '')), lower(_search)) > 0
        OR strpos(lower(COALESCE(p.title, '')), lower(_search)) > 0
      )
      AND (_date_from IS NULL OR cc.created_at >= _date_from)
      AND (_date_to IS NULL OR cc.created_at <= _date_to)
  )
  SELECT
    count(*)::int AS total_count,
    COALESCE(sum(effective_value), 0) AS total_value,
    count(*) FILTER (WHERE status = 'draft')::int AS draft_count,
    COALESCE(sum(effective_value) FILTER (WHERE status = 'draft'), 0) AS draft_value,
    count(*) FILTER (WHERE status = 'pending_signature')::int AS sent_count,
    COALESCE(sum(effective_value) FILTER (WHERE status = 'pending_signature'), 0) AS sent_value,
    count(*) FILTER (WHERE status IN ('signed', 'active'))::int AS signed_count,
    COALESCE(sum(effective_value) FILTER (WHERE status IN ('signed', 'active')), 0) AS signed_value,
    count(*) FILTER (
      WHERE status = 'expired' OR (end_date IS NOT NULL AND end_date::timestamptz < _now AND status <> 'cancelled')
    )::int AS expired_count,
    COALESCE(sum(effective_value) FILTER (
      WHERE status = 'expired' OR (end_date IS NOT NULL AND end_date::timestamptz < _now AND status <> 'cancelled')
    ), 0) AS expired_value,
    COALESCE(sum(effective_value) FILTER (
      WHERE status IN ('signed', 'active') AND (end_date IS NULL OR end_date::timestamptz >= _now)
    ), 0) AS active_value,
    CASE WHEN count(*) > 0 THEN COALESCE(sum(effective_value), 0) / count(*) ELSE 0 END AS avg_value,
    CASE
      WHEN (count(*) FILTER (WHERE status = 'pending_signature') + count(*) FILTER (WHERE status IN ('signed', 'active'))) > 0
      THEN round(
        (count(*) FILTER (WHERE status IN ('signed', 'active'))::numeric * 100)
        / (count(*) FILTER (WHERE status = 'pending_signature') + count(*) FILTER (WHERE status IN ('signed', 'active')))
      )
      ELSE 0
    END::int AS sign_rate,
    count(*) FILTER (
      WHERE end_date IS NOT NULL
        AND status NOT IN ('expired', 'cancelled')
        AND ceil(extract(epoch FROM (end_date::timestamptz - _now)) / 86400) > 0
        AND ceil(extract(epoch FROM (end_date::timestamptz - _now)) / 86400) <= 90
    )::int AS expiring90_count,
    COALESCE(
      round(
        avg(GREATEST(1, ceil(extract(epoch FROM (updated_at - created_at)) / 86400)))
          FILTER (WHERE status IN ('signed', 'active') AND updated_at IS NOT NULL AND created_at IS NOT NULL)
      ),
      0
    )::int AS avg_sign_days
  FROM base
$function$;

COMMENT ON FUNCTION public.client_contracts_list_metrics(uuid[], text, text, timestamptz, timestamptz, uuid, uuid, boolean, timestamptz, uuid[]) IS
  'Metricas dos cartoes de KPI de Contratos (src/pages/ClientContracts.tsx). '
  'Ambito JA RESOLVIDO no cliente (_organization_ids, _allowed_user_ids); nao decide autorizacao. '
  '_allowed_user_ids compara contra created_by (repoe o predicado removido pelo commit 54d65378). '
  'SECURITY INVOKER -- a RLS de client_contracts continua a aplicar-se.';

GRANT EXECUTE ON FUNCTION public.client_contracts_list_metrics(uuid[], text, text, timestamptz, timestamptz, uuid, uuid, boolean, timestamptz, uuid[]) TO authenticated;
