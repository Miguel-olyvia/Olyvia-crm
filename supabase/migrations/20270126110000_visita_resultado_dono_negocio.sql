-- 20270126110000 — A5 (permissões, 23/11/2026): o comercial dono do negócio dá como feita a visita marcada pela assistente.
-- Antes: neg_resultado_visita só aceitava pessoas.edit com âmbito sobre o created_by/user_id da visita; as visitas que a assistente marca têm
-- created_by = assistente e user_id nulo, e o comercial dono do negócio (âmbito OWNED) era recusado («Sem permissão para alterar a visita»),
-- apesar de ter negocios.visita.preencher («dar resultado à visita») e de o ecrã lhe mostrar o botão.
-- Agora: numa visita de um negócio, quem tem negocios.visita.preencher, pessoas.edit e o NEGÓCIO no âmbito (fn_neg_negocio_no_ambito, o
-- critério de neg_ler_negocios) também dá o resultado. Entra por um invólucro DEFINER (como o do Papel no Negócio, 20270105700000), porque a
-- RLS de UPDATE de schedule_items olha só para created_by/user_id/atribuídos e a visita pode estar atribuída a outro recurso.
-- Não muda: quem marca/cancela/remarca (fn_neg_visita_editavel, negocios.visita.gerir), as outras regras do resultado (cancelada, futuro,
-- valores), nem quem já passava.
-- Versão viva de partida: pg_get_functiondef na base RH (uetjghdkwbywbftedtth) a 23/11/2026.

CREATE OR REPLACE FUNCTION public.fn_neg_visita_via_negocio(p_visita uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270126110000: a visita é de um negócio no âmbito de quem chama (pessoas.edit), que tem negocios.visita.preencher e pessoas.edit, e
  -- que NÃO passa já pela regra da visita (pessoas.edit com âmbito sobre o criador/utilizador da visita).
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM schedule_items s
    WHERE s.id = p_visita AND s.negocio_id IS NOT NULL AND s.time_off_type IS NULL AND s.vacation_id IS NULL
      AND coalesce(public.fn_cat_pode(s.organization_id, 'negocios.visita.preencher'), false)
      AND coalesce(public.fn_cat_pode(s.organization_id, 'pessoas.edit'), false)
      AND public.fn_neg_negocio_no_ambito(s.organization_id, s.negocio_id, 'pessoas.edit')
      AND NOT (public.has_anew_permission(auth.uid(), 'pessoas.edit')
               AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                           WHERE k.scope_key = s.organization_id::text || ':*'
                              OR k.scope_key = s.organization_id::text || ':' || s.created_by::text
                              OR k.scope_key = s.organization_id::text || ':' || s.user_id::text)))
$function$;

CREATE OR REPLACE FUNCTION public.fn_neg_negocio_resultado_visita(p_visita_id uuid, p_resultado text, p_feita boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  -- 20270126110000: invólucro do dono do negócio. Verifica o encaminhamento e chama a RPC com os privilégios do dono da função (sem a RLS
  -- de schedule_items); a RPC re-verifica fn_neg_visita_via_negocio e todas as outras regras.
  IF NOT public.fn_neg_visita_via_negocio(p_visita_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.neg_via_negocio', 'on', true);
  v := public.neg_resultado_visita(p_visita_id, p_resultado, p_feita);
  PERFORM set_config('app.neg_via_negocio', 'off', true);
  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION public.fn_neg_visita_via_negocio(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_neg_negocio_resultado_visita(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_visita_via_negocio(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_negocio_resultado_visita(uuid, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.neg_resultado_visita(p_visita_id uuid, p_resultado text, p_feita boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vis      record;
  v_entity   uuid;
  v_cliente  boolean;
  v_feita    boolean := COALESCE(p_feita, false);
  v_concluir boolean;
  v_mudou    boolean := false;
  v_motivo   text;
  v_n        int;
BEGIN
  -- 20270105700000: quem só tem o Papel no Negócio entra pelo invólucro DEFINER
  IF coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_visita_so_papel(p_visita_id) THEN
    RETURN public.fn_neg_papel_resultado_visita(p_visita_id, p_resultado, p_feita);
  END IF;
  -- 20270126110000 (A5): o comercial dono do negócio dá resultado à visita que a assistente marcou (created_by = assistente, user_id nulo):
  --   com negocios.visita.preencher e o negócio no âmbito de pessoas.edit, entra pelo invólucro DEFINER (fn_neg_negocio_resultado_visita).
  IF coalesce(current_setting('app.neg_via_negocio', true), '') <> 'on' AND coalesce(current_setting('app.neg_via_papel', true), '') <> 'on'
     AND public.fn_neg_visita_via_negocio(p_visita_id) THEN
    RETURN public.fn_neg_negocio_resultado_visita(p_visita_id, p_resultado, p_feita);
  END IF;
  IF p_visita_id IS NULL
     OR (p_resultado IS NULL AND NOT v_feita)
     OR p_resultado NOT IN ('interessado', 'aPensar', 'semInteresse', 'obraInviavel') THEN
    RAISE EXCEPTION 'Valor inválido: resultado da visita.' USING ERRCODE = 'NG009';
  END IF;

  SELECT s.organization_id, s.negocio_id, s.entity_id, s.visit_outcome, s.status,
         s.start_datetime, s.created_by, s.user_id
    INTO v_vis
  FROM public.schedule_items s
  WHERE s.id = p_visita_id AND s.time_off_type IS NULL AND s.vacation_id IS NULL;
  -- "Não existe", "não se vê" e "organização sem a página Pessoas": a mesma resposta.
  IF NOT FOUND
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = v_vis.organization_id) THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG004';
  END IF;

  -- pessoas.edit com âmbito sobre a visita (org:*, criador ou utilizador).
  IF NOT ((public.has_anew_permission(auth.uid(), 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_vis.organization_id::text || ':*'
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.created_by::text
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.user_id::text))
          -- 20270105700000: ou o Papel no Negócio (só a entrar pelo invólucro, re-verificado)
          OR (v_vis.negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_papel', true), '') = 'on' AND public.fn_neg_papel_conta(v_vis.negocio_id))
          -- 20270126110000 (A5): ou o dono do negócio (só a entrar pelo invólucro, re-verificado)
          OR (v_vis.negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_negocio', true), '') = 'on' AND public.fn_neg_visita_via_negocio(p_visita_id))) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270105200000: a visita de um negócio pede também uma permissão da visita; 20270114320000: dar resultado é preencher a visita
  IF v_vis.negocio_id IS NOT NULL AND NOT public.fn_cat_pode(v_vis.organization_id, 'negocios.visita.preencher') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.preencher): não pode dar resultado às visitas do negócio.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Uma visita cancelada não se dá como feita nem recebe resultado (com e sem resultado).
  IF v_vis.status = 'cancelled'::public.schedule_item_status THEN
    RAISE EXCEPTION 'A visita foi cancelada: não recebe resultado.' USING ERRCODE = 'NG018';
  END IF;

  IF v_feita AND v_vis.start_datetime > now() THEN
    RAISE EXCEPTION 'Valor inválido: uma visita no futuro não pode ser dada como feita.' USING ERRCODE = 'NG009';
  END IF;

  -- status só entra no UPDATE quando muda (o trigger dos feriados corre em UPDATE OF status).
  v_concluir := v_feita AND v_vis.status <> 'completed'::public.schedule_item_status;

  IF p_resultado IS NULL THEN
    -- Só "feita": não toca no resultado nem na abordagem.
    IF v_concluir THEN
      UPDATE public.schedule_items s
      SET status = 'completed'::public.schedule_item_status
      WHERE s.id = p_visita_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      v_mudou := true;
    END IF;
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', NULL);
  END IF;

  IF v_concluir THEN
    UPDATE public.schedule_items s
    SET visit_outcome = p_resultado, status = 'completed'::public.schedule_item_status
    WHERE s.id = p_visita_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_vis.visit_outcome IS DISTINCT FROM p_resultado THEN
    UPDATE public.schedule_items s
    SET visit_outcome = p_resultado
    WHERE s.id = p_visita_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := -1;
  END IF;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_mudou := v_n = 1;

  IF p_resultado NOT IN ('semInteresse', 'obraInviavel') THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', NULL);
  END IF;

  -- 20261228200000: a pessoa é a entidade viva da visita, na mesma
  -- organização; a abordagem é a dela (anew_entities.closure_result). Só uma
  -- entidade lead (client_since nulo) se encerra: um cliente dá 'sem_lead'.
  SELECT e.id, e.client_since IS NOT NULL INTO v_entity, v_cliente
  FROM public.anew_entities e
  WHERE e.id = v_vis.entity_id AND e.organization_id = v_vis.organization_id
    AND e.deleted_at IS NULL;

  IF v_vis.negocio_id IS NOT NULL THEN
    v_motivo := 'visita_de_negocio';
  ELSIF v_entity IS NULL THEN
    v_motivo := 'sem_pessoa';
  ELSIF public.fn_neg_tem_negocio_aberto(v_vis.organization_id, v_entity) THEN
    v_motivo := 'negocios_abertos';
  ELSIF v_cliente THEN
    v_motivo := 'sem_lead';
  END IF;

  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', v_motivo);
  END IF;

  v_mudou := (public.fn_neg_mudar_abordagem(
    v_vis.organization_id, v_entity, NULL, p_resultado, NULL, 'Resultado da visita')
    ->> 'mudou')::boolean OR v_mudou;

  RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', true,
                            'motivo_nao_encerrada', NULL);
END;
$function$;
