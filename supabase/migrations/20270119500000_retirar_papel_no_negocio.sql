-- Retirar o «Papel no Negócio» da BD: as permissões passam a vir só do perfil (17/11/2026, decisão do utilizador).
--
-- - Os 6 papéis do cartão (comercial, direcao, financeiro, armazem, operacoes, juridico) em pessoas_papeis_negocio deixam
--   de dar qualquer permissão ou acesso: fn_neg_papeis já não lê a tabela, logo fn_neg_papel_permite (inalterada) só
--   pode devolver true pelo papel 'tecnico'. fn_cat_pode, fn_cat_exigir, fn_quote_custos_pode, fn_audit_orgs_com_custo,
--   fn_orgs_com_alguma_permissao, fn_po_crm_load, rpc_client_order_list_readiness, rpc_get_client_order_document,
--   fn_neg_papel_conta e os atalhos «via papel» ficam com o perfil + o técnico, sem os papéis do cartão.
-- - O TÉCNICO FICA IGUAL: o técnico pelo cargo do RH ou pelo perfil negocios.obra.tecnico continua a receber o que a linha
--   'tecnico' de neg_papeis_permissoes dá (negocios.obra.executar / negocios.obra.materiais), e a ver a Agenda como antes.
-- - Comercial = perfil com negocios.visita.preencher na organização; gestor de obra = perfil com negocios.obra.planear
--   (pessoa ativa com conta ativa).
-- - rh_guardar_papeis_pessoa recusa (não grava nem apaga). rh_ler_papeis_pessoa fica (só leitura para o ecrã do RH).
-- - Não mexe em perfis, dados, políticas RLS, na tabela pessoas_papeis_negocio nem no mapa neg_papeis_permissoes.
--   fn_permissoes_que_nao_posso_dar / fn_motivo_papel_nao_atribuivel ficam como estão.
-- - Só CREATE OR REPLACE: assinaturas, LANGUAGE, volatilidade, SECURITY DEFINER, search_path e grants iguais aos vivos.
--   As versões anteriores estão em comentário no fim do ficheiro.

CREATE OR REPLACE FUNCTION public.fn_neg_papeis(p_org uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270119000000: já não lê pessoas_papeis_negocio (os 6 papéis do cartão deixam de contar). Fica só o 'tecnico', igual ao
  --   de antes: cargo técnico de obra no RH ou perfil negocios.obra.tecnico (continua a dar o que a linha 'tecnico' do mapa dá).
  WITH eu AS (SELECT public.fn_neg_pessoa_da_conta(p_org) AS pessoa)
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM (
    -- 20270110600000: técnico pelo cargo do RH ou pelo perfil (negocios.obra.tecnico) de quem está ligado a uma pessoa do RH
    SELECT 'tecnico'::text AS x FROM eu WHERE eu.pessoa IS NOT NULL
      AND (public.fn_rh_pessoa_tecnica(p_org, eu.pessoa) OR public.has_anew_permission_in_org(auth.uid(), 'negocios.obra.tecnico', p_org))
  ) s
$function$;

CREATE OR REPLACE FUNCTION public.fn_neg_ambito_tudo(p_org uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_org IS NOT NULL AND auth.uid() IS NOT NULL AND (
    public.fn_ambito_admin(auth.uid(), p_org)
    OR NOT public.has_anew_permission_in_org(auth.uid(), p_perm, p_org)
    -- 20270119000000: retirado o ramo do Papel no Negócio (pessoas_papeis_negocio); o âmbito vem do perfil
    -- 20270110910000: o back-office do Negócio no PERFIL (o que o Financeiro, as Operações e Compras/armazém fazem a todos os
    -- negócios) vê/grava todos, como o Papel no Negócio equivalente. negocios.margem.aprovar não entra: o perfil comercial tem-na.
    OR EXISTS (SELECT 1
               FROM unnest(ARRAY['negocios.validar_pagamento', 'negocios.registar_fatura', 'negocios.obra.planear', 'negocios.obra.fechar',
                                 'negocios.obra.imprevistos', 'purchase_orders.approve']) AS c(codigo)
               WHERE public.has_anew_permission_in_org(auth.uid(), c.codigo, p_org)))
$function$;

CREATE OR REPLACE FUNCTION public.fn_neg_e_comercial(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public, pg_temp'
AS $function$
  -- 20270119000000: comercial = pessoa ativa com conta ativa na organização cujo PERFIL lá tem negocios.visita.preencher
  --   (como neg_papeis_dos_recursos desde 20270115300000); já não lê pessoas_papeis_negocio. p_user é anew_users.id.
  SELECT p_org IS NOT NULL AND p_user IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.pessoas_contas pc
    JOIN public.pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
    JOIN public.anew_users u ON u.id = pc.anew_user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
    WHERE pc.anew_user_id = p_user AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
      AND public.has_anew_permission_in_org(u.auth_user_id, 'negocios.visita.preencher', p_org));
$function$;

CREATE OR REPLACE FUNCTION public.neg_gestores_obra(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 20270111100000: o técnico (negocios.obra.executar, sem pessoas.view) também: é o responsável que o Hoje do técnico mostra
  IF NOT public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
    PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome_completo, 'telefone', p.telefone_trabalho) ORDER BY p.nome_completo)
    FROM pessoas p
    -- 20270119000000: gestor de obra = pessoa ativa com conta ativa cujo PERFIL na organização tem negocios.obra.planear
    --   (antes: papel 'operacoes' em pessoas_papeis_negocio)
    WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
      AND EXISTS (SELECT 1 FROM pessoas_contas pc
                  JOIN anew_users u ON u.id = pc.anew_user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
                  WHERE pc.pessoa_id = p.id AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
                    AND public.has_anew_permission_in_org(u.auth_user_id, 'negocios.obra.planear', p_org))), '[]');
END $function$;

CREATE OR REPLACE FUNCTION public.fn_portal_neg_msg_gravar(p_negocio_id uuid, p_texto text, p_fotos integer)
 RETURNS negocio_mensagens
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v        public.negocios;
  v_texto  text := btrim(p_texto);
  v_nome   text;
  v_titulo text;
  v_quem   uuid[];
  v_u      uuid;
  v_m      public.negocio_mensagens;
BEGIN
  v := public.fn_portal_msg_negocio(p_negocio_id);
  IF v_texto IS NULL OR char_length(v_texto) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Dados inválidos: a mensagem tem de 1 a 2000 caracteres.' USING ERRCODE = 'NE006';
  END IF;
  IF (SELECT count(*) FROM public.negocio_mensagens
       WHERE negocio_id = v.id AND autor_tipo = 'cliente' AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Demasiadas mensagens: tente daqui a pouco.' USING ERRCODE = 'NE010';
  END IF;
  SELECT COALESCE(NULLIF(btrim(e.display_name), ''), 'Cliente') INTO v_nome FROM public.anew_entities e WHERE e.id = v.entity_id;
  v_nome := COALESCE(v_nome, 'Cliente');
  INSERT INTO public.negocio_mensagens (organization_id, negocio_id, autor_tipo, autor_nome, autor_auth_id, texto)
  VALUES (v.organization_id, v.id, 'cliente', v_nome, auth.uid(), v_texto)
  RETURNING * INTO v_m;

  -- 3/11: avisa os gestores de obra da organização (pessoa activa, conta activa); sem nenhum, o comercial
  -- 20270119000000: gestor de obra = PERFIL com negocios.obra.planear na organização (como neg_gestores_obra), já não o papel «operacoes»
  SELECT array_agg(DISTINCT u.auth_user_id) INTO v_quem
    FROM public.pessoas p
    JOIN public.pessoas_contas pc ON pc.pessoa_id = p.id AND pc.organization_id = v.organization_id AND pc.estado = 'activa' AND pc.revogada_em IS NULL
    JOIN public.anew_users u ON u.id = pc.anew_user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
   WHERE p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
     AND public.has_anew_permission_in_org(u.auth_user_id, 'negocios.obra.planear', v.organization_id);
  IF v_quem IS NULL OR cardinality(v_quem) = 0 THEN
    SELECT array_agg(u.auth_user_id) INTO v_quem FROM public.anew_users u WHERE u.id = v.assigned_to AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL;
  END IF;
  v_titulo := CASE WHEN COALESCE(p_fotos, 0) > 0 THEN v_nome || ' mostrou um problema (' || p_fotos || CASE WHEN p_fotos = 1 THEN ' fotografia)' ELSE ' fotografias)' END
                   ELSE 'Mensagem de ' || v_nome END;
  FOREACH v_u IN ARRAY COALESCE(v_quem, '{}'::uuid[]) LOOP
    INSERT INTO public.notifications (user_id, organization_id, type, kind, title, message, priority, link, entity_type, entity_id)
    VALUES (v_u, v.organization_id, 'client_message', 'notification', v_titulo, left(v_texto, 200), 'high',
            '/negocios?vista=operacoes&obra=' || v.numero, 'negocio', v.id)
    ON CONFLICT (type, entity_id, user_id) WHERE (is_resolved = false)
    DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, priority = EXCLUDED.priority, link = EXCLUDED.link,
                  is_read = false, read_at = NULL, is_dismissed = false, created_at = now();
  END LOOP;
  RETURN v_m;
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_papeis_dos_recursos(p_org uuid)
 RETURNS TABLE(resource_id uuid, papeis text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  RETURN QUERY
    WITH contas AS (
      SELECT DISTINCT ON (r.id) r.id AS recurso, r.user_id AS utilizador, pc.pessoa_id AS pessoa
        FROM schedule_resources r
        JOIN pessoas_contas pc ON pc.anew_user_id = r.user_id AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
        JOIN pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
       WHERE r.organization_id = p_org AND r.resource_type = 'user' AND r.user_id IS NOT NULL AND r.is_active IS NOT FALSE
       ORDER BY r.id, pc.ligada_em DESC NULLS LAST
    )
    SELECT c.recurso, coalesce((
      SELECT array_agg(DISTINCT x ORDER BY x) FROM (
        -- 20270119000000: já não lê pessoas_papeis_negocio; só 'comercial' (perfil) e 'tecnico' (cargo/perfil, como antes)
        SELECT 'comercial'::text AS x FROM anew_users u
         WHERE u.id = c.utilizador AND public.has_anew_permission_in_org(u.auth_user_id, 'negocios.visita.preencher', p_org)
        UNION
        SELECT 'tecnico' WHERE public.fn_rh_pessoa_tecnico_obra(p_org, c.pessoa) -- 20270110600000: cargo ou perfil
      ) s), '{}')
      FROM contas c;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rh_agenda_tecnicos(p_org uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_eu uuid; v_so_eu boolean := false;
BEGIN
  -- 20270110600000: a porta de antes fica igual (o papel do Negócio conta como antes: o do RH ou o do cargo técnico); quem entra
  --   só pelo perfil de técnico de obra (negocios.obra.tecnico) vê apenas a própria linha
  v_eu := CASE WHEN p_org IS NOT NULL THEN public.fn_neg_pessoa_da_conta(p_org) END;
  IF p_org IS NULL OR NOT (public.is_system_admin_user(auth.uid())
      OR public.has_anew_permission_in_org(auth.uid(), 'pessoas.view', p_org)
      OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.laborais.view', p_org)
      -- 20270119000000: retirada a porta pelo Papel no Negócio (pessoas_papeis_negocio); o ramo do técnico fica igual
      OR EXISTS (SELECT 1 FROM neg_papeis_permissoes m WHERE m.permission_code = 'pessoas.view'  -- 20270101370000
                   AND m.papel = 'tecnico' AND v_eu IS NOT NULL AND public.fn_rh_pessoa_tecnica(p_org, v_eu))) THEN
    IF p_org IS NOT NULL AND v_eu IS NOT NULL AND 'tecnico' = ANY (public.fn_neg_papeis(p_org)) THEN
      v_so_eu := true;
    ELSE
      RAISE EXCEPTION 'Sem permissão (pessoas.view ou hr.pessoas.laborais.view).' USING ERRCODE = 'CT001';
    END IF;
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_ate - p_de > 400 THEN
    RAISE EXCEPTION 'Intervalo inválido (até 400 dias).' USING ERRCODE = 'CT002';
  END IF;

  RETURN coalesce((
    WITH tar AS (
      SELECT r.pessoa_id, t.id, t.nome, t.inicio_planeado AS inicio, coalesce(t.fim_planeado, t.inicio_planeado) AS fim,
             t.minutos_previstos, t.pessoas_previstas, t.estado, k.nome AS oficio, o.id AS obra_id, o.codigo, o.titulo, o.morada, o.estado AS obra_estado,
             n.numero AS negocio_numero
      FROM ops_obra_tarefa_rh r
      JOIN ops_obra_tarefa t ON t.id = r.tarefa_id
      JOIN ops_obra o ON o.id = r.obra_id AND o.organization_id = p_org
      LEFT JOIN negocios n ON n.id = o.negocio_id
      LEFT JOIN ops_skill k ON k.id = t.skill_id
      WHERE r.organization_id = p_org AND o.estado <> 'cancelada' AND (NOT v_so_eu OR r.pessoa_id = v_eu)
        AND t.inicio_planeado IS NOT NULL AND t.inicio_planeado <= p_ate AND coalesce(t.fim_planeado, t.inicio_planeado) >= p_de
    ),
    tec AS (
      SELECT p.id, p.nome_completo FROM pessoas p
      WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND public.fn_rh_pessoa_tecnico_obra(p_org, p.id)
        AND (NOT v_so_eu OR p.id = v_eu)
      UNION
      SELECT p.id, p.nome_completo FROM pessoas p WHERE p.id IN (SELECT pessoa_id FROM tar)
    )
    SELECT jsonb_agg(jsonb_build_object(
      'pessoa_id', tec.id,
      'nome', tec.nome_completo,
      'oficios', coalesce((SELECT jsonb_agg(k.nome ORDER BY k.nome) FROM public.fn_rh_oficios_efetivos(p_org, tec.id) e
                           JOIN ops_skill k ON k.id = e.skill_id), '[]'::jsonb),
      'tarefas', coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'tarefa_id', x.id, 'nome', x.nome, 'oficio', x.oficio, 'inicio', x.inicio, 'fim', x.fim, 'estado', x.estado,
                    'minutos', x.minutos_previstos, 'pessoas', x.pessoas_previstas,
                    'horas_dia', round(x.minutos_previstos / 60.0 / greatest(1, x.pessoas_previstas) / greatest(1, (SELECT count(*) FROM generate_series(x.inicio, x.fim, interval '1 day') d
                                                                                  WHERE extract(isodow FROM d) < 6)), 2),
                    'obra_id', x.obra_id, 'obra_codigo', x.codigo, 'obra_titulo', x.titulo, 'morada', x.morada, 'obra_estado', x.obra_estado,
                    'negocio_numero', x.negocio_numero) ORDER BY x.inicio, x.nome)
                   FROM tar x WHERE x.pessoa_id = tec.id), '[]'::jsonb),
      'indisponivel', coalesce((SELECT jsonb_agg(jsonb_build_object('data', a.data, 'fraccao', a.fraccao_dia) ORDER BY a.data)
                                FROM pessoas_ausencias_dias a
                                WHERE a.organization_id = p_org AND a.pessoa_id = tec.id AND a.estado = 'aprovado'
                                  AND a.data BETWEEN p_de AND p_ate), '[]'::jsonb)
    ) ORDER BY tec.nome_completo)
    FROM tec), '[]'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.rh_guardar_papeis_pessoa(p_org uuid, p_pessoa uuid, p_papeis text[])
 RETURNS void
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 20270119000000: descontinuado. Não grava nem apaga nada (os dados de pessoas_papeis_negocio ficam como estão).
  RAISE EXCEPTION 'O Papel no Negócio foi descontinuado: as permissões vêm do perfil.' USING ERRCODE = 'CT001';
END
$function$;

-- =====================================================================================================================
-- VERSÕES ANTERIORES (vivas na BD do ramo RH antes desta migração), para reverter: descomentar e aplicar.
-- =====================================================================================================================

-- CREATE OR REPLACE FUNCTION public.fn_neg_papeis(p_org uuid)
--  RETURNS text[]
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
--   WITH eu AS (SELECT public.fn_neg_pessoa_da_conta(p_org) AS pessoa)
--   SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') FROM (
--     SELECT pp.papel AS x FROM eu JOIN pessoas_papeis_negocio pp ON pp.pessoa_id = eu.pessoa AND pp.organization_id = p_org
--     UNION
--     -- 20270110600000: técnico pelo cargo do RH ou pelo perfil (negocios.obra.tecnico) de quem está ligado a uma pessoa do RH
--     SELECT 'tecnico' FROM eu WHERE eu.pessoa IS NOT NULL
--       AND (public.fn_rh_pessoa_tecnica(p_org, eu.pessoa) OR public.has_anew_permission_in_org(auth.uid(), 'negocios.obra.tecnico', p_org))
--   ) s
-- $function$;

-- CREATE OR REPLACE FUNCTION public.fn_neg_ambito_tudo(p_org uuid, p_perm text)
--  RETURNS boolean
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
--   SELECT p_org IS NOT NULL AND auth.uid() IS NOT NULL AND (
--     public.fn_ambito_admin(auth.uid(), p_org)
--     OR NOT public.has_anew_permission_in_org(auth.uid(), p_perm, p_org)
--     OR EXISTS (SELECT 1
--                FROM public.pessoas_papeis_negocio pp
--                JOIN public.neg_papeis_permissoes m ON m.papel = pp.papel AND m.permission_code = p_perm
--                WHERE pp.pessoa_id = public.fn_neg_pessoa_da_conta(p_org) AND pp.organization_id = p_org)
--     -- 20270110910000: o back-office do Negócio no PERFIL (o que o Financeiro, as Operações e Compras/armazém fazem a todos os
--     -- negócios) vê/grava todos, como o Papel no Negócio equivalente. negocios.margem.aprovar não entra: o perfil comercial tem-na.
--     OR EXISTS (SELECT 1
--                FROM unnest(ARRAY['negocios.validar_pagamento', 'negocios.registar_fatura', 'negocios.obra.planear', 'negocios.obra.fechar',
--                                  'negocios.obra.imprevistos', 'purchase_orders.approve']) AS c(codigo)
--                WHERE public.has_anew_permission_in_org(auth.uid(), c.codigo, p_org)))
-- $function$;

-- CREATE OR REPLACE FUNCTION public.fn_neg_e_comercial(p_org uuid, p_user uuid)
--  RETURNS boolean
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public, pg_temp'
-- AS $function$
--   SELECT p_org IS NOT NULL AND p_user IS NOT NULL AND EXISTS (
--     SELECT 1
--     FROM public.pessoas_contas pc
--     JOIN public.pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
--     JOIN public.pessoas_papeis_negocio pp ON pp.pessoa_id = pc.pessoa_id AND pp.organization_id = p_org AND pp.papel = 'comercial'
--     WHERE pc.anew_user_id = p_user AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL);
-- $function$;

-- CREATE OR REPLACE FUNCTION public.neg_gestores_obra(p_org uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   -- 20270111100000: o técnico (negocios.obra.executar, sem pessoas.view) também: é o responsável que o Hoje do técnico mostra
--   IF NOT public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
--     PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
--   END IF;
--   RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome_completo, 'telefone', p.telefone_trabalho) ORDER BY p.nome_completo)
--     FROM pessoas p JOIN pessoas_papeis_negocio pp ON pp.pessoa_id = p.id AND pp.organization_id = p_org AND pp.papel = 'operacoes'
--     WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)), '[]');
-- END $function$;

-- CREATE OR REPLACE FUNCTION public.fn_portal_neg_msg_gravar(p_negocio_id uuid, p_texto text, p_fotos integer)
--  RETURNS negocio_mensagens
--  LANGUAGE plpgsql
--  VOLATILE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v        public.negocios;
--   v_texto  text := btrim(p_texto);
--   v_nome   text;
--   v_titulo text;
--   v_quem   uuid[];
--   v_u      uuid;
--   v_m      public.negocio_mensagens;
-- BEGIN
--   v := public.fn_portal_msg_negocio(p_negocio_id);
--   IF v_texto IS NULL OR char_length(v_texto) NOT BETWEEN 1 AND 2000 THEN
--     RAISE EXCEPTION 'Dados inválidos: a mensagem tem de 1 a 2000 caracteres.' USING ERRCODE = 'NE006';
--   END IF;
--   IF (SELECT count(*) FROM public.negocio_mensagens
--        WHERE negocio_id = v.id AND autor_tipo = 'cliente' AND created_at > now() - interval '1 hour') >= 30 THEN
--     RAISE EXCEPTION 'Demasiadas mensagens: tente daqui a pouco.' USING ERRCODE = 'NE010';
--   END IF;
--   SELECT COALESCE(NULLIF(btrim(e.display_name), ''), 'Cliente') INTO v_nome FROM public.anew_entities e WHERE e.id = v.entity_id;
--   v_nome := COALESCE(v_nome, 'Cliente');
--   INSERT INTO public.negocio_mensagens (organization_id, negocio_id, autor_tipo, autor_nome, autor_auth_id, texto)
--   VALUES (v.organization_id, v.id, 'cliente', v_nome, auth.uid(), v_texto)
--   RETURNING * INTO v_m;
--
--   -- 3/11: avisa os gestores de obra da organização (papel «operacoes» no Negócio, pessoa activa, conta activa); sem nenhum, o comercial
--   SELECT array_agg(DISTINCT u.auth_user_id) INTO v_quem
--     FROM public.pessoas_papeis_negocio pp
--     JOIN public.pessoas p ON p.id = pp.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
--     JOIN public.pessoas_contas pc ON pc.pessoa_id = pp.pessoa_id AND pc.organization_id = v.organization_id AND pc.estado = 'activa' AND pc.revogada_em IS NULL
--     JOIN public.anew_users u ON u.id = pc.anew_user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
--    WHERE pp.organization_id = v.organization_id AND pp.papel = 'operacoes';
--   IF v_quem IS NULL OR cardinality(v_quem) = 0 THEN
--     SELECT array_agg(u.auth_user_id) INTO v_quem FROM public.anew_users u WHERE u.id = v.assigned_to AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL;
--   END IF;
--   v_titulo := CASE WHEN COALESCE(p_fotos, 0) > 0 THEN v_nome || ' mostrou um problema (' || p_fotos || CASE WHEN p_fotos = 1 THEN ' fotografia)' ELSE ' fotografias)' END
--                    ELSE 'Mensagem de ' || v_nome END;
--   FOREACH v_u IN ARRAY COALESCE(v_quem, '{}'::uuid[]) LOOP
--     INSERT INTO public.notifications (user_id, organization_id, type, kind, title, message, priority, link, entity_type, entity_id)
--     VALUES (v_u, v.organization_id, 'client_message', 'notification', v_titulo, left(v_texto, 200), 'high',
--             '/negocios?vista=operacoes&obra=' || v.numero, 'negocio', v.id)
--     ON CONFLICT (type, entity_id, user_id) WHERE (is_resolved = false)
--     DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, priority = EXCLUDED.priority, link = EXCLUDED.link,
--                   is_read = false, read_at = NULL, is_dismissed = false, created_at = now();
--   END LOOP;
--   RETURN v_m;
-- END;
-- $function$;

-- CREATE OR REPLACE FUNCTION public.neg_papeis_dos_recursos(p_org uuid)
--  RETURNS TABLE(resource_id uuid, papeis text[])
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
--   RETURN QUERY
--     WITH contas AS (
--       SELECT DISTINCT ON (r.id) r.id AS recurso, r.user_id AS utilizador, pc.pessoa_id AS pessoa
--         FROM schedule_resources r
--         JOIN pessoas_contas pc ON pc.anew_user_id = r.user_id AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
--         JOIN pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
--        WHERE r.organization_id = p_org AND r.resource_type = 'user' AND r.user_id IS NOT NULL AND r.is_active IS NOT FALSE
--        ORDER BY r.id, pc.ligada_em DESC NULLS LAST
--     )
--     SELECT c.recurso, coalesce((
--       SELECT array_agg(DISTINCT x ORDER BY x) FROM (
--         SELECT pp.papel AS x FROM pessoas_papeis_negocio pp
--          WHERE pp.pessoa_id = c.pessoa AND pp.organization_id = p_org AND pp.papel <> 'comercial' -- 20270115300000: comercial vem do perfil
--         UNION
--         SELECT 'comercial' FROM anew_users u
--          WHERE u.id = c.utilizador AND public.has_anew_permission_in_org(u.auth_user_id, 'negocios.visita.preencher', p_org)
--         UNION
--         SELECT 'tecnico' WHERE public.fn_rh_pessoa_tecnico_obra(p_org, c.pessoa) -- 20270110600000: cargo ou perfil
--       ) s), '{}')
--       FROM contas c;
-- END;
-- $function$;

-- CREATE OR REPLACE FUNCTION public.rh_agenda_tecnicos(p_org uuid, p_de date, p_ate date)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE v_eu uuid; v_so_eu boolean := false;
-- BEGIN
--   -- 20270110600000: a porta de antes fica igual (o papel do Negócio conta como antes: o do RH ou o do cargo técnico); quem entra
--   --   só pelo perfil de técnico de obra (negocios.obra.tecnico) vê apenas a própria linha
--   v_eu := CASE WHEN p_org IS NOT NULL THEN public.fn_neg_pessoa_da_conta(p_org) END;
--   IF p_org IS NULL OR NOT (public.is_system_admin_user(auth.uid())
--       OR public.has_anew_permission_in_org(auth.uid(), 'pessoas.view', p_org)
--       OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.laborais.view', p_org)
--       OR EXISTS (SELECT 1 FROM neg_papeis_permissoes m WHERE m.permission_code = 'pessoas.view'  -- 20270101370000: ou um papel do Negócio pelo RH
--                    AND (m.papel IN (SELECT pp.papel FROM pessoas_papeis_negocio pp WHERE pp.pessoa_id = v_eu AND pp.organization_id = p_org)
--                         OR (m.papel = 'tecnico' AND v_eu IS NOT NULL AND public.fn_rh_pessoa_tecnica(p_org, v_eu))))) THEN
--     IF p_org IS NOT NULL AND v_eu IS NOT NULL AND 'tecnico' = ANY (public.fn_neg_papeis(p_org)) THEN
--       v_so_eu := true;
--     ELSE
--       RAISE EXCEPTION 'Sem permissão (pessoas.view ou hr.pessoas.laborais.view).' USING ERRCODE = 'CT001';
--     END IF;
--   END IF;
--   IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_ate - p_de > 400 THEN
--     RAISE EXCEPTION 'Intervalo inválido (até 400 dias).' USING ERRCODE = 'CT002';
--   END IF;
--
--   RETURN coalesce((
--     WITH tar AS (
--       SELECT r.pessoa_id, t.id, t.nome, t.inicio_planeado AS inicio, coalesce(t.fim_planeado, t.inicio_planeado) AS fim,
--              t.minutos_previstos, t.pessoas_previstas, t.estado, k.nome AS oficio, o.id AS obra_id, o.codigo, o.titulo, o.morada, o.estado AS obra_estado,
--              n.numero AS negocio_numero
--       FROM ops_obra_tarefa_rh r
--       JOIN ops_obra_tarefa t ON t.id = r.tarefa_id
--       JOIN ops_obra o ON o.id = r.obra_id AND o.organization_id = p_org
--       LEFT JOIN negocios n ON n.id = o.negocio_id
--       LEFT JOIN ops_skill k ON k.id = t.skill_id
--       WHERE r.organization_id = p_org AND o.estado <> 'cancelada' AND (NOT v_so_eu OR r.pessoa_id = v_eu)
--         AND t.inicio_planeado IS NOT NULL AND t.inicio_planeado <= p_ate AND coalesce(t.fim_planeado, t.inicio_planeado) >= p_de
--     ),
--     tec AS (
--       SELECT p.id, p.nome_completo FROM pessoas p
--       WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND public.fn_rh_pessoa_tecnico_obra(p_org, p.id)
--         AND (NOT v_so_eu OR p.id = v_eu)
--       UNION
--       SELECT p.id, p.nome_completo FROM pessoas p WHERE p.id IN (SELECT pessoa_id FROM tar)
--     )
--     SELECT jsonb_agg(jsonb_build_object(
--       'pessoa_id', tec.id,
--       'nome', tec.nome_completo,
--       'oficios', coalesce((SELECT jsonb_agg(k.nome ORDER BY k.nome) FROM public.fn_rh_oficios_efetivos(p_org, tec.id) e
--                            JOIN ops_skill k ON k.id = e.skill_id), '[]'::jsonb),
--       'tarefas', coalesce((SELECT jsonb_agg(jsonb_build_object(
--                     'tarefa_id', x.id, 'nome', x.nome, 'oficio', x.oficio, 'inicio', x.inicio, 'fim', x.fim, 'estado', x.estado,
--                     'minutos', x.minutos_previstos, 'pessoas', x.pessoas_previstas,
--                     'horas_dia', round(x.minutos_previstos / 60.0 / greatest(1, x.pessoas_previstas) / greatest(1, (SELECT count(*) FROM generate_series(x.inicio, x.fim, interval '1 day') d
--                                                                                   WHERE extract(isodow FROM d) < 6)), 2),
--                     'obra_id', x.obra_id, 'obra_codigo', x.codigo, 'obra_titulo', x.titulo, 'morada', x.morada, 'obra_estado', x.obra_estado,
--                     'negocio_numero', x.negocio_numero) ORDER BY x.inicio, x.nome)
--                    FROM tar x WHERE x.pessoa_id = tec.id), '[]'::jsonb),
--       'indisponivel', coalesce((SELECT jsonb_agg(jsonb_build_object('data', a.data, 'fraccao', a.fraccao_dia) ORDER BY a.data)
--                                 FROM pessoas_ausencias_dias a
--                                 WHERE a.organization_id = p_org AND a.pessoa_id = tec.id AND a.estado = 'aprovado'
--                                   AND a.data BETWEEN p_de AND p_ate), '[]'::jsonb)
--     ) ORDER BY tec.nome_completo)
--     FROM tec), '[]'::jsonb);
-- END $function$;

-- CREATE OR REPLACE FUNCTION public.rh_guardar_papeis_pessoa(p_org uuid, p_pessoa uuid, p_papeis text[])
--  RETURNS void
--  LANGUAGE plpgsql
--  VOLATILE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE v_user uuid; v_papeis text[] := coalesce(p_papeis, '{}');
--   v_isento boolean; v_mudou boolean; v_falta text;
-- BEGIN
--   v_user := public.fn_cat_exigir(p_org, 'hr.pessoas.laborais.edit');
--   IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = p_pessoa AND organization_id = p_org AND deleted_at IS NULL) THEN
--     RAISE EXCEPTION 'Pessoa não encontrada nesta organização.' USING ERRCODE = 'CT003';
--   END IF;
--   IF EXISTS (SELECT 1 FROM unnest(v_papeis) k WHERE k NOT IN ('comercial', 'direcao', 'financeiro', 'armazem', 'operacoes', 'juridico')) THEN
--     RAISE EXCEPTION 'Papel inválido.' USING ERRCODE = 'CT002';
--   END IF;
--
--   -- 20270112120000: sem escalada pelo Papel no Negócio (ver cabeçalho da migration)
--   v_isento := public.is_system_admin_user(auth.uid()) OR public.fn_sou_admin_global();
--   IF NOT v_isento THEN
--     v_mudou := EXISTS (SELECT 1 FROM pessoas_papeis_negocio pp
--                        WHERE pp.pessoa_id = p_pessoa AND pp.organization_id = p_org AND NOT (pp.papel = ANY (v_papeis)))
--             OR EXISTS (SELECT 1 FROM unnest(v_papeis) k
--                        WHERE NOT EXISTS (SELECT 1 FROM pessoas_papeis_negocio pp
--                                          WHERE pp.pessoa_id = p_pessoa AND pp.organization_id = p_org AND pp.papel = k));
--     IF v_mudou AND EXISTS (
--          SELECT 1 FROM pessoas_contas pc
--          JOIN anew_users u ON u.id = pc.anew_user_id
--          WHERE pc.pessoa_id = p_pessoa AND pc.revogada_em IS NULL AND u.auth_user_id = auth.uid()) THEN
--       RAISE EXCEPTION 'Não pode alterar os seus próprios papéis no Negócio.' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--
--     SELECT string_agg(f.papel || ' (' || f.perms || ')', '; ' ORDER BY f.papel) INTO v_falta
--     FROM (
--       SELECT k AS papel, string_agg(npp.permission_code, ', ' ORDER BY npp.permission_code) AS perms
--       FROM (SELECT DISTINCT k FROM unnest(v_papeis) k) n
--       JOIN neg_papeis_permissoes npp ON npp.papel = n.k
--       WHERE NOT EXISTS (SELECT 1 FROM pessoas_papeis_negocio pp
--                         WHERE pp.pessoa_id = p_pessoa AND pp.organization_id = p_org AND pp.papel = n.k)
--         AND NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), npp.permission_code, p_org)
--       GROUP BY k
--     ) f;
--     IF v_falta IS NOT NULL THEN
--       RAISE EXCEPTION 'Não pode dar um papel no Negócio com permissões que o seu perfil não tem: %.', v_falta
--         USING ERRCODE = 'insufficient_privilege';
--     END IF;
--   END IF;
--
--   DELETE FROM pessoas_papeis_negocio WHERE pessoa_id = p_pessoa AND organization_id = p_org AND NOT (papel = ANY (v_papeis));
--   INSERT INTO pessoas_papeis_negocio (organization_id, pessoa_id, papel, created_by)
--     SELECT DISTINCT p_org, p_pessoa, k, v_user FROM unnest(v_papeis) k
--   ON CONFLICT (pessoa_id, papel) DO NOTHING;
-- END $function$;
