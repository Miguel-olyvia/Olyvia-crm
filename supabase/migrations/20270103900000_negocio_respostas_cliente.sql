-- Negócio (2/11/2026): as respostas do cliente no portal que ainda não tinham caminho na base.
--
-- A 20270103800000 levou o negócio inteiro ao portal (a vista do cliente) e a receção da obra. Faltavam:
--   · avisar que pagou uma fatura (a do contrato, de uma prestação ou de uma adenda), com a referência;
--   · responder a uma adenda: aceitar (com código por SMS), não aceitar, pedir alterações, pedir alterações ao contrato da adenda,
--     assinar o contrato da adenda (com código por SMS).
--
-- O que muda (a base só cresce; nada se apaga):
--   1. Tabela negocio_respostas_cliente: uma linha por resposta. Sem políticas: só as funções lêem e escrevem.
--   2. portal_neg_responder(negocio, tipo, ref, dados): do portal (a conta da pessoa e da organização do negócio). Confere com a
--      vista do cliente que a fatura ou a adenda estão no estado certo. Aceitar e assinar a adenda exigem o código da sms-otp
--      (reference_type 'negocio_adenda', purpose igual ao tipo) verificado há menos de 10 minutos, e gastam-no. Uma só resposta por
--      aplicar de cada tipo e referência. Até 20 por hora e negócio. Avisa o comercial.
--   3. neg_respostas_ler(org): do CRM, as respostas por aplicar. O ecrã aplica-as com as ações da V1 e grava o negócio.
--   4. neg_respostas_marcar(org, ids): do CRM, marca as aplicadas (depois de gravar).
--   5. portal_neg_vista passa a trazer as respostas por aplicar (o portal mostra-as logo, antes de a equipa abrir o negócio).
-- O que muda para a Mudelar: nada. Só se aplica à RH.
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF to_regclass('public.negocio_vista_cliente') IS NULL OR to_regprocedure('public.fn_neg_rececao_json(public.negocio_rececao_cliente)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta a 20270103800000 (vista do cliente).';
  END IF;
END
$guarda$;

CREATE TABLE IF NOT EXISTS public.negocio_respostas_cliente (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id      uuid        NOT NULL,
  organization_id uuid        NOT NULL,
  tipo            text        NOT NULL CHECK (tipo IN ('pagamento', 'adenda_aceitar', 'adenda_recusar', 'adenda_alterar', 'adenda_contrato_alterar', 'adenda_assinar')),
  ref             text        NOT NULL CHECK (char_length(btrim(ref)) BETWEEN 1 AND 60),
  dados           jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object' AND octet_length(dados::text) <= 8000),
  nome            text        NOT NULL,
  telemovel       text,
  otp_id          uuid,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  auth_user_id    uuid        NOT NULL,
  aplicada_em     timestamptz,
  CONSTRAINT negocio_respostas_cliente_negocio_fkey FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios (id, organization_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS negocio_respostas_cliente_pendente_uk ON public.negocio_respostas_cliente (negocio_id, tipo, ref) WHERE aplicada_em IS NULL;
CREATE INDEX IF NOT EXISTS negocio_respostas_cliente_org_idx ON public.negocio_respostas_cliente (organization_id) WHERE aplicada_em IS NULL;
ALTER TABLE public.negocio_respostas_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.negocio_respostas_cliente FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.negocio_respostas_cliente IS 'Negócio: o que o cliente respondeu no portal (aviso de pagamento, respostas às adendas), à espera de o CRM aplicar. Só as funções escrevem. 20270103900000.';

CREATE OR REPLACE FUNCTION public.fn_neg_resposta_json(r public.negocio_respostas_cliente)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('id', r.id, 'negocio', r.negocio_id, 'tipo', r.tipo, 'ref', r.ref, 'dados', r.dados, 'nome', r.nome,
                            'telemovel', r.telemovel, 'em', r.criada_em,
                            'assinatura', CASE WHEN r.otp_id IS NULL THEN NULL ELSE 'SMS-' || left(replace(r.otp_id::text, '-', ''), 10) END);
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_resposta_json(public.negocio_respostas_cliente) FROM PUBLIC, anon, authenticated, service_role;

-- O portal ----------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_neg_responder(p_negocio_id uuid, p_tipo text, p_ref text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v        public.negocios;
  v_d      jsonb;
  v_ref    text := btrim(p_ref);
  v_dados  jsonb := COALESCE(p_dados, '{}'::jsonb);
  v_ad     jsonb;
  v_ok     boolean := false;
  v_otp    public.sms_otp_codes;
  v_nome   text;
  v_r      public.negocio_respostas_cliente;
  v_notif  uuid;
  v_titulo text;
BEGIN
  v := public.fn_portal_msg_negocio(p_negocio_id);
  IF p_tipo IS NULL OR p_tipo NOT IN ('pagamento', 'adenda_aceitar', 'adenda_recusar', 'adenda_alterar', 'adenda_contrato_alterar', 'adenda_assinar')
     OR v_ref IS NULL OR v_ref = '' OR jsonb_typeof(v_dados) IS DISTINCT FROM 'object' OR octet_length(v_dados::text) > 8000 THEN
    RAISE EXCEPTION 'Dados inválidos.' USING ERRCODE = 'NE006';
  END IF;
  SELECT x.vista -> 'd' INTO v_d FROM public.negocio_vista_cliente x WHERE x.negocio_id = v.id;
  IF v_d IS NULL THEN
    RAISE EXCEPTION 'O negócio ainda não está disponível no portal.' USING ERRCODE = 'NE011';
  END IF;

  IF p_tipo = 'pagamento' THEN
    -- a fatura do contrato, de uma prestação ou de uma adenda, emitida e ainda sem pagamento validado
    v_ok := (v_d #>> '{fin,fatura,n}' = v_ref AND COALESCE((v_d #>> '{fin,pago}')::boolean, false) = false)
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_d #> '{fin,tranches}', '[]')) t
                     WHERE t ->> 'numero' = v_ref AND t -> 'pagamento' IS NULL)
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_d -> 'adendas', '[]')) a, jsonb_array_elements(COALESCE(a -> 'faturas', '[]')) f
                     WHERE f ->> 'n' = v_ref AND f -> 'recibo' IS NULL)
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_d -> 'adendas', '[]')) a
                     WHERE a #>> '{fatura,n}' = v_ref AND a -> 'recibo' IS NULL);
  ELSE
    SELECT a INTO v_ad FROM jsonb_array_elements(COALESCE(v_d -> 'adendas', '[]')) a WHERE a ->> 'n' = v_ref LIMIT 1;
    v_ok := v_ad IS NOT NULL AND CASE p_tipo
      WHEN 'adenda_aceitar' THEN v_ad ->> 'estado' = 'enviada'
      WHEN 'adenda_recusar' THEN v_ad ->> 'estado' = 'enviada'
      WHEN 'adenda_alterar' THEN v_ad ->> 'estado' = 'enviada'
      WHEN 'adenda_contrato_alterar' THEN v_ad ->> 'estado' = 'aceite' AND v_ad ->> 'contrato' = 'enviado'
      WHEN 'adenda_assinar' THEN v_ad ->> 'estado' = 'aceite' AND v_ad ->> 'contrato' = 'enviado'
      ELSE false END;
  END IF;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Isto já não está à espera da sua resposta.' USING ERRCODE = 'NE011';
  END IF;
  IF EXISTS (SELECT 1 FROM public.negocio_respostas_cliente r WHERE r.negocio_id = v.id AND r.tipo = p_tipo AND r.ref = v_ref AND r.aplicada_em IS NULL) THEN
    RAISE EXCEPTION 'Já recebemos esta resposta. Estamos a tratar dela.' USING ERRCODE = 'NE011';
  END IF;
  IF (SELECT count(*) FROM public.negocio_respostas_cliente r WHERE r.negocio_id = v.id AND r.criada_em > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Demasiadas respostas: tente daqui a pouco.' USING ERRCODE = 'NE010';
  END IF;

  IF p_tipo IN ('adenda_aceitar', 'adenda_assinar') THEN
    SELECT o.* INTO v_otp FROM public.sms_otp_codes o
     WHERE o.auth_user_id = auth.uid() AND o.reference_id = v.id AND o.reference_type = 'negocio_adenda' AND o.purpose = p_tipo
       AND o.verified_at IS NOT NULL AND o.verified_at > now() - interval '10 minutes' AND o.consumed_at IS NULL
     ORDER BY o.verified_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Confirme primeiro com o código que lhe enviámos por SMS.' USING ERRCODE = 'NE012';
    END IF;
    UPDATE public.sms_otp_codes SET consumed_at = now() WHERE id = v_otp.id;
  END IF;

  SELECT COALESCE(NULLIF(btrim(e.display_name), ''), 'Cliente') INTO v_nome FROM public.anew_entities e WHERE e.id = v.entity_id;
  INSERT INTO public.negocio_respostas_cliente (negocio_id, organization_id, tipo, ref, dados, nome, telemovel, otp_id, auth_user_id)
  VALUES (v.id, v.organization_id, p_tipo, v_ref, v_dados, COALESCE(v_nome, 'Cliente'),
          CASE WHEN char_length(v_otp.phone_number) > 6 THEN left(v_otp.phone_number, 4) || ' ••• ' || right(v_otp.phone_number, 3) END,
          v_otp.id, auth.uid())
  RETURNING * INTO v_r;

  v_titulo := COALESCE(v_nome, 'Cliente') || CASE p_tipo
    WHEN 'pagamento' THEN ' avisou que pagou a fatura ' || v_ref
    WHEN 'adenda_aceitar' THEN ' aceitou a adenda ' || v_ref
    WHEN 'adenda_recusar' THEN ' não aceitou a adenda ' || v_ref
    WHEN 'adenda_alterar' THEN ' pediu alterações à adenda ' || v_ref
    WHEN 'adenda_contrato_alterar' THEN ' pediu alterações ao contrato da adenda ' || v_ref
    ELSE ' assinou a adenda ' || v_ref END;
  SELECT u.auth_user_id INTO v_notif FROM public.anew_users u WHERE u.id = v.assigned_to AND u.deleted_at IS NULL;
  IF v_notif IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, organization_id, type, kind, title, message, priority, link, entity_type, entity_id)
    VALUES (v_notif, v.organization_id, 'client_resposta_' || p_tipo, 'notification', v_titulo,
            'Abra o negócio em Negócios para a equipa ver a resposta.', 'high', '/negocios', 'negocio', v.id)
    ON CONFLICT (type, entity_id, user_id) WHERE (is_resolved = false)
    DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, priority = EXCLUDED.priority,
                  is_read = false, read_at = NULL, is_dismissed = false, created_at = now();
  END IF;
  RETURN public.fn_neg_resposta_json(v_r);
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_neg_responder(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_neg_responder(uuid, text, text, jsonb) TO authenticated;

-- A vista do portal leva as respostas por aplicar
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
           'rececao', (SELECT public.fn_neg_rececao_json(r) FROM public.negocio_rececao_cliente r WHERE r.negocio_id = x.negocio_id),
           'respostas', COALESCE((SELECT jsonb_agg(public.fn_neg_resposta_json(r) ORDER BY r.criada_em)
                                    FROM public.negocio_respostas_cliente r WHERE r.negocio_id = x.negocio_id AND r.aplicada_em IS NULL), '[]'::jsonb))
    INTO v_r
    FROM public.negocio_vista_cliente x
   WHERE x.negocio_id = v_neg.id AND x.organization_id = v_neg.organization_id;
  RETURN v_r;
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_neg_vista(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_neg_vista(uuid) TO authenticated;

-- O CRM ------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_respostas_ler(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_org IS NULL OR NOT public.fn_cat_pode(p_org, 'pessoas.view') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(public.fn_neg_resposta_json(r) ORDER BY r.criada_em)
                     FROM public.negocio_respostas_cliente r WHERE r.organization_id = p_org AND r.aplicada_em IS NULL), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_respostas_ler(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_respostas_ler(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.neg_respostas_marcar(p_org uuid, p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_n integer;
BEGIN
  IF p_org IS NULL OR NOT public.fn_cat_pode(p_org, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  UPDATE public.negocio_respostas_cliente SET aplicada_em = now()
   WHERE organization_id = p_org AND id = ANY (COALESCE(p_ids, '{}')) AND aplicada_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_respostas_marcar(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_respostas_marcar(uuid, uuid[]) TO authenticated;

DO $conferir$
BEGIN
  IF has_function_privilege('anon', 'public.portal_neg_responder(uuid,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_respostas_ler(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_respostas_marcar(uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.portal_neg_vista(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: anon não pode executar as funções das respostas do cliente.';
  END IF;
END $conferir$;
