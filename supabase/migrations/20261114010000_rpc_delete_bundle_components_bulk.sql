-- Bundles — eliminação em lote de opções de um Grupo de Escolha
-- Forward-only. Não editar migrações já aplicadas (20261022010000 continua intacta).
--
-- Problema
-- --------
-- BundleChoiceGroupsEditor só permitia eliminar opções uma a uma
-- (rpc_delete_bundle_component). Um grupo com 150 opções obrigava a 150 cliques e,
-- se o UI fizesse o loop por si, a 150 round trips + 150 linhas de auditoria — exatamente
-- o defeito que 20261022010000 corrigiu para as outras ações dos editores-filho.
--
-- Solução
-- -------
-- Um RPC em lote com a MESMA fundação: _bundle_children_authorize (mesmo predicado de
-- autorização que rpc_delete_bundle_component), app.audit_bypass e UMA só chamada a
-- fn_manual_audit_log por ação. Os ids viajam no corpo do POST do PostgREST, portanto
-- não há o limite prático de ~300 ids/~12 kB de URL que um DELETE ... in.(...) teria.
--
-- Devolve o número de linhas efetivamente eliminadas (ids inexistentes ou de outro bundle
-- são simplesmente ignorados — a operação é idempotente e nunca toca noutro bundle).

CREATE OR REPLACE FUNCTION public.rpc_delete_bundle_components(
  p_ids       uuid[],
  p_bundle_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bundle        public.bundles;
  v_actor         uuid;
  v_before        jsonb;
  v_deleted_count integer;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_bundle := public._bundle_children_authorize(p_bundle_id);

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
    INTO v_before
  FROM public.bundle_components c
  WHERE c.id = ANY(p_ids) AND c.bundle_id = p_bundle_id;

  PERFORM set_config('app.audit_bypass', 'on', true);

  WITH deleted AS (
    DELETE FROM public.bundle_components
    WHERE id = ANY(p_ids) AND bundle_id = p_bundle_id
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_count FROM deleted;

  IF v_deleted_count > 0 AND v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundle_components', p_bundle_id, v_bundle.organization_id, 'DELETE',
      jsonb_build_object(
        'bundle_components', jsonb_build_object('old', v_before, 'new', NULL),
        'deleted_count', to_jsonb(v_deleted_count)
      ),
      'web_app'
    );
  END IF;

  RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_bundle_components(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_bundle_components(uuid[], uuid) TO authenticated;
