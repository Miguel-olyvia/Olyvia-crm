-- ============================================================
-- 20270106020000_levantamento_ligar_exige_visita_gerir
-- ============================================================
-- O que faz (Lote A, item 4): as políticas de levantamentos/levantamento_linhas/levantamento_respostas deixam escrever com pessoas.edit.
--   Um levantamento SEM negócio é da pessoa (neg_guardar_levantamento, INVOKER, grava-o só com pessoas.*): não muda.
--   Um levantamento LIGADO a um negócio já está congelado (fn_levantamentos_guardar_alteracao passo 3; os filhos por
--   fn_levantamento_filhos_pai), e o INSERT direto exige negocio_id NULL (política levantamentos_insert).
--   O único buraco era a LIGAÇÃO: UPDATE levantamentos SET negocio_id direto (ou neg_ligar_registo('levantamento')) só pedia
--   pessoas.edit sobre o negócio, sem negocios.visita.gerir. fn_levantamentos_validar_ligacoes (chamada pelo gatilho em toda a
--   ligação, direta ou por RPC) passa a pedir negocios.visita.gerir na organização com sessão.
--   Sem sessão (auth.uid() NULL: serviço) fica como estava.
-- Construída a partir do texto VIVO (pg_get_functiondef na base RH, 4/11/2026); só se acrescenta o bloco 20270106020000.
-- Nenhum ecrã escreve nestas tabelas diretamente (grep src/: só RPCs neg_*).
-- Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_levantamentos_validar_ligacoes(p_organization_id uuid, p_entity_id uuid, p_feito_por uuid, p_visita_id uuid, p_negocio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_visita record;
BEGIN
  -- Guarda de organização antes de qualquer leitura (mensagem genérica).
  PERFORM public.fn_levantamentos_exigir_organizacao(p_organization_id);

  IF p_feito_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.user_id = p_feito_por
      AND m.organization_id = p_organization_id
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Quem fez o levantamento tem de ser membro activo da organização.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_visita_id IS NOT NULL THEN
    SELECT s.organization_id, s.entity_id, s.contact_id, s.deal_id,
           s.time_off_type, s.vacation_id
      INTO v_visita
    FROM public.schedule_items s
    WHERE s.id = p_visita_id;

    IF NOT FOUND OR v_visita.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'A visita indicada não existe nesta organização.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_visita.entity_id IS NOT NULL THEN
      -- A visita liga à entidade (20261228200000): tem de ser a pessoa do
      -- levantamento, e nunca uma ausência ou umas férias.
      IF v_visita.entity_id IS DISTINCT FROM p_entity_id
         OR v_visita.time_off_type IS NOT NULL
         OR v_visita.vacation_id IS NOT NULL THEN
        RAISE EXCEPTION 'A visita indicada é de outra pessoa.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_visita.contact_id IS NOT NULL
       OR v_visita.deal_id IS NOT NULL
       OR v_visita.time_off_type IS NOT NULL
       OR v_visita.vacation_id IS NOT NULL THEN
      -- D5: sem pessoa só se aceita uma visita "solta" (sem contacto, negócio,
      -- ausência nem férias): nunca uma folga, umas férias ou uma reunião de
      -- outra pessoa.
      RAISE EXCEPTION 'A visita indicada é de outra pessoa ou não é uma visita.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_negocio_id IS NOT NULL THEN
    -- Negócio vivo, da mesma organização e pessoa e, com sessão, com
    -- pessoas.edit de quem liga sobre esse negócio (espelha negocios_update:
    -- chave org:*, org:assigned_to ou org:created_by). Uma só mensagem para
    -- "não existe", "é de outra pessoa", "está no lixo" e "sem acesso".
    IF NOT EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = p_negocio_id
        AND n.organization_id = p_organization_id
        AND n.entity_id = p_entity_id
        AND n.deleted_at IS NULL
        AND (
          v_uid IS NULL
          -- 20270105700000: ou o Papel no Negócio, num negócio onde conta (fn_neg_papel_conta)
          OR public.fn_neg_papel_conta(n.id)
          OR (
            public.has_anew_permission(v_uid, 'pessoas.edit')
            AND EXISTS (
              SELECT 1
              FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
              WHERE k.scope_key = n.organization_id::text || ':*'
                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'O negócio indicado não está disponível para ligar a este levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- 20270106020000: ligar um levantamento a um negócio é o diagnóstico no local desse negócio: com sessão, pede também
    -- negocios.visita.gerir na organização (fn_cat_pode: permissão do papel na organização, Papel no Negócio ou system admin),
    -- como neg_guardar_levantamento já pede. Fecha o UPDATE direto (pessoas.edit) e neg_ligar_registo('levantamento').
    IF v_uid IS NOT NULL AND NOT public.fn_cat_pode(p_organization_id, 'negocios.visita.gerir') THEN
      RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir): não pode ligar o levantamento ao negócio.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Serializa as ligações ao mesmo negócio: a segunda espera pelo fim da
    -- primeira e, com um snapshot novo, vê-a. Assim "já tem levantamento"
    -- dá esta mensagem e não o erro 23505 do UNIQUE (que mostraria o uuid).
    PERFORM pg_advisory_xact_lock(
      hashtextextended('levantamentos.negocio_id:' || p_negocio_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.negocio_id = p_negocio_id
    ) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$function$;
