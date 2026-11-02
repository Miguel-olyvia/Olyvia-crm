-- Negócio (2/11/2026): o portal do cliente mostra o negócio todo, como a pré-visualização «Ver como o cliente» da V1.
--
-- Até aqui o portal real (/client-portal/negocios) só tinha a proposta, o contrato, a barra dos 5 passos e a conversa. O plano da obra,
-- o progresso, os trabalhos com as fotografias, o diário dos técnicos, as faturas, a nota de encomenda, o auto e o relatório ficavam só
-- na pré-visualização do CRM: o cliente não tinha nenhuma forma de os ler (neg_ler_negocios e obra_ler_negocios exigem o CRM).
--
-- O que muda (a base só cresce; nada se apaga):
--   1. Tabela negocio_vista_cliente: uma linha por negócio com a «vista do cliente», o que o ecrã da V1 precisa para desenhar o portal.
--      É o CRM que a monta (src/emylia/real/vistaCliente.ts), já sem custos, margens, horas, €/h, fornecedores, pedidos de correção
--      internos nem o real da obra. RLS activa e SEM políticas, sem privilégios para anon nem authenticated.
--   2. neg_vista_cliente_guardar(org, negocio, vista): do CRM. Entra quem grava o negócio ou a obra (pessoas.edit,
--      negocios.obra.planear ou negocios.obra.executar). Só reescreve se a vista mudou (marca md5). Até 6 MB.
--   3. portal_neg_vista(negocio): do portal. Só a conta de portal cuja pessoa e organização são as do negócio
--      (fn_portal_msg_negocio, da 20270101430000). Devolve a vista, quando foi atualizada e a receção da obra (se já a assinou),
--      ou null se o CRM ainda não gravou a vista.
--   4. A receção da obra pelo cliente (o auto de receção): tabela negocio_rececao_cliente (uma por negócio, sem políticas) e
--      portal_neg_receber_obra(negocio, auto, reservas). Exige o código por SMS verificado há menos de 10 minutos pela mesma conta
--      (sms-otp com reference_type 'negocio_auto' e purpose 'auto_rececao'; o código fica gasto) e o auto por assinar na vista.
--      Avisa o comercial do negócio. O CRM lê-a por neg_rececoes_ler(org) e passa o auto a assinado na obra (o relatório final).
--
-- O que muda para a Mudelar: nada (tabela e funções novas). Só se aplica à RH.
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_portal_msg_negocio(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta fn_portal_msg_negocio (20270101430000).';
  END IF;
  IF to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta fn_cat_pode (20270101340000).';
  END IF;
  IF to_regclass('public.sms_otp_codes') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta a tabela sms_otp_codes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'negocios_id_org_key') THEN
    RAISE EXCEPTION 'Guarda: falta a chave única negocios (id, organization_id).';
  END IF;
END
$guarda$;

-- 1. A tabela ------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.negocio_vista_cliente (
  negocio_id      uuid        PRIMARY KEY,
  organization_id uuid        NOT NULL,
  vista           jsonb       NOT NULL,
  marca           text        NOT NULL,
  atualizada_em   timestamptz NOT NULL DEFAULT now(),
  atualizada_por  uuid,
  CONSTRAINT negocio_vista_cliente_negocio_fkey FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios (id, organization_id) ON DELETE CASCADE
);
ALTER TABLE public.negocio_vista_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.negocio_vista_cliente FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.negocio_vista_cliente IS 'Negócio: o que o cliente vê no portal (a vista da V1, sem custos). Sem políticas: só neg_vista_cliente_guardar e portal_neg_vista. 20270103800000.';

-- 2. CRM: gravar a vista -------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_vista_cliente_guardar(p_org uuid, p_negocio_id uuid, p_vista jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marca text;
  v_n     integer;
BEGIN
  IF p_org IS NULL OR p_negocio_id IS NULL
     OR NOT (public.fn_cat_pode(p_org, 'pessoas.edit') OR public.fn_cat_pode(p_org, 'negocios.obra.planear') OR public.fn_cat_pode(p_org, 'negocios.obra.executar')) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.id = p_negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF p_vista IS NULL OR jsonb_typeof(p_vista) IS DISTINCT FROM 'object' OR jsonb_typeof(p_vista -> 'd') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente tem de ter o negócio (d).' USING ERRCODE = 'NE006';
  END IF;
  IF octet_length(p_vista::text) > 6 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente passa de 6 MB.' USING ERRCODE = 'NE006';
  END IF;
  v_marca := md5(p_vista::text);
  INSERT INTO public.negocio_vista_cliente AS x (negocio_id, organization_id, vista, marca, atualizada_em, atualizada_por)
  VALUES (p_negocio_id, p_org, p_vista, v_marca, now(), public.current_business_user_id())
  ON CONFLICT (negocio_id) DO UPDATE
     SET vista = EXCLUDED.vista, marca = EXCLUDED.marca, atualizada_em = now(), atualizada_por = EXCLUDED.atualizada_por
   WHERE x.marca IS DISTINCT FROM EXCLUDED.marca AND x.organization_id = EXCLUDED.organization_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('gravada', v_n > 0, 'marca', v_marca);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_vista_cliente_guardar(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_vista_cliente_guardar(uuid, uuid, jsonb) TO authenticated;

-- 3. Portal: ler a vista -------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_neg_vista(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_neg public.negocios;
  v_r   jsonb;
BEGIN
  v_neg := public.fn_portal_msg_negocio(p_negocio_id);
  SELECT jsonb_build_object('vista', x.vista, 'atualizada_em', x.atualizada_em, 'organization_id', x.organization_id,
           'rececao', (SELECT public.fn_neg_rececao_json(r) FROM public.negocio_rececao_cliente r WHERE r.negocio_id = x.negocio_id))
    INTO v_r
    FROM public.negocio_vista_cliente x
   WHERE x.negocio_id = v_neg.id AND x.organization_id = v_neg.organization_id;
  RETURN v_r;
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_neg_vista(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_neg_vista(uuid) TO authenticated;

-- 4. A receção da obra pelo cliente -------------------------------------------------------------------------------------------------------
-- A portal_neg_vista acima já lê esta tabela: o plpgsql só resolve os nomes quando corre, por isso a ordem no ficheiro não importa.
CREATE TABLE IF NOT EXISTS public.negocio_rececao_cliente (
  negocio_id      uuid        PRIMARY KEY,
  organization_id uuid        NOT NULL,
  auto_n          text        NOT NULL CHECK (char_length(btrim(auto_n)) BETWEEN 1 AND 60),
  reservas        text        CHECK (reservas IS NULL OR char_length(reservas) <= 2000),
  nome            text        NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 200),
  telemovel       text,
  otp_id          uuid        NOT NULL,
  assinado_em     timestamptz NOT NULL DEFAULT now(),
  auth_user_id    uuid        NOT NULL,
  CONSTRAINT negocio_rececao_cliente_negocio_fkey FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios (id, organization_id) ON DELETE CASCADE
);
ALTER TABLE public.negocio_rececao_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.negocio_rececao_cliente FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.negocio_rececao_cliente IS 'Negócio: o cliente recebeu a obra (assinou o auto de receção no portal, com código por SMS). Só portal_neg_receber_obra escreve. 20270103800000.';

CREATE OR REPLACE FUNCTION public.fn_neg_rececao_json(r public.negocio_rececao_cliente)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('auto', r.auto_n, 'reservas', r.reservas, 'nome', r.nome, 'telemovel', r.telemovel,
                            'em', r.assinado_em, 'id', 'SMS-' || left(replace(r.otp_id::text, '-', ''), 10));
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_rececao_json(public.negocio_rececao_cliente) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.portal_neg_receber_obra(p_negocio_id uuid, p_auto text, p_reservas text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v        public.negocios;
  v_auto   jsonb;
  v_otp    public.sms_otp_codes;
  v_nome   text;
  v_res    text := NULLIF(btrim(p_reservas), '');
  v_r      public.negocio_rececao_cliente;
  v_notif  uuid;
BEGIN
  v := public.fn_portal_msg_negocio(p_negocio_id);
  SELECT x.vista -> 'd' -> 'obra' -> 'auto' INTO v_auto FROM public.negocio_vista_cliente x WHERE x.negocio_id = v.id;
  IF v_auto IS NULL OR v_auto ->> 'n' IS DISTINCT FROM btrim(p_auto) OR v_auto ->> 'estado' IS DISTINCT FROM 'por assinar' THEN
    RAISE EXCEPTION 'O auto de receção não está por assinar.' USING ERRCODE = 'NE011';
  END IF;
  IF EXISTS (SELECT 1 FROM public.negocio_rececao_cliente r WHERE r.negocio_id = v.id) THEN
    RAISE EXCEPTION 'O auto de receção já está assinado.' USING ERRCODE = 'NE011';
  END IF;
  IF v_res IS NOT NULL AND char_length(v_res) > 2000 THEN
    RAISE EXCEPTION 'Dados inválidos: as observações têm até 2000 caracteres.' USING ERRCODE = 'NE006';
  END IF;
  -- o código por SMS desta conta, para este negócio, verificado há menos de 10 minutos e ainda por gastar
  SELECT o.* INTO v_otp FROM public.sms_otp_codes o
   WHERE o.auth_user_id = auth.uid() AND o.reference_id = v.id AND o.reference_type = 'negocio_auto' AND o.purpose = 'auto_rececao'
     AND o.verified_at IS NOT NULL AND o.verified_at > now() - interval '10 minutes' AND o.consumed_at IS NULL
   ORDER BY o.verified_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Confirme primeiro com o código que lhe enviámos por SMS.' USING ERRCODE = 'NE012';
  END IF;
  UPDATE public.sms_otp_codes SET consumed_at = now() WHERE id = v_otp.id;
  SELECT COALESCE(NULLIF(btrim(e.display_name), ''), 'Cliente') INTO v_nome FROM public.anew_entities e WHERE e.id = v.entity_id;
  INSERT INTO public.negocio_rececao_cliente (negocio_id, organization_id, auto_n, reservas, nome, telemovel, otp_id, auth_user_id)
  VALUES (v.id, v.organization_id, btrim(p_auto), v_res, COALESCE(v_nome, 'Cliente'),
          CASE WHEN char_length(v_otp.phone_number) > 6 THEN left(v_otp.phone_number, 4) || ' ••• ' || right(v_otp.phone_number, 3) END,
          v_otp.id, auth.uid())
  RETURNING * INTO v_r;
  -- avisa o comercial (uma só notificação por resolver por negócio e tipo: notifications_dedup)
  SELECT u.auth_user_id INTO v_notif FROM public.anew_users u WHERE u.id = v.assigned_to AND u.deleted_at IS NULL;
  IF v_notif IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, organization_id, type, kind, title, message, priority, link, entity_type, entity_id)
    VALUES (v_notif, v.organization_id, 'client_auto_rececao', 'notification', COALESCE(v_nome, 'Cliente') || ' recebeu a obra',
            CASE WHEN v_res IS NULL THEN 'Auto ' || btrim(p_auto) || ' assinado: está tudo bem.'
                 ELSE 'Auto ' || btrim(p_auto) || ' assinado, com observações: ' || left(v_res, 150) END,
            CASE WHEN v_res IS NULL THEN 'normal' ELSE 'high' END, '/negocios', 'negocio', v.id)
    ON CONFLICT (type, entity_id, user_id) WHERE (is_resolved = false)
    DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, priority = EXCLUDED.priority,
                  is_read = false, read_at = NULL, is_dismissed = false, created_at = now();
  END IF;
  RETURN public.fn_neg_rececao_json(v_r);
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_neg_receber_obra(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_neg_receber_obra(uuid, text, text) TO authenticated;

-- CRM: as receções da organização (o ecrã passa o auto a assinado na obra e grava-a)
CREATE OR REPLACE FUNCTION public.neg_rececoes_ler(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_org IS NULL OR NOT (public.fn_cat_pode(p_org, 'pessoas.view') OR public.fn_cat_pode(p_org, 'negocios.obra.planear') OR public.fn_cat_pode(p_org, 'negocios.obra.executar')) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  RETURN COALESCE((SELECT jsonb_object_agg(r.negocio_id::text, public.fn_neg_rececao_json(r))
                     FROM public.negocio_rececao_cliente r WHERE r.organization_id = p_org), '{}'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_rececoes_ler(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_rececoes_ler(uuid) TO authenticated;

-- Conferir: nenhuma das funções novas fica para anon
DO $conferir$
BEGIN
  IF has_function_privilege('anon', 'public.portal_neg_vista(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.portal_neg_receber_obra(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_vista_cliente_guardar(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_rececoes_ler(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: anon não pode executar as funções da vista do cliente.';
  END IF;
END $conferir$;
