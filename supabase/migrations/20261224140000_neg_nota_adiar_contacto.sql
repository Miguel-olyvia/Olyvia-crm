-- ============================================================
-- 20261224140000_neg_nota_adiar_contacto (M8)
-- ============================================================
-- O que faz: duas funções NOVAS da ficha da pessoa, ambas INVOKER e
--   idempotentes pelo id gerado na UI (ON CONFLICT (id) DO NOTHING):
--   - neg_registar_nota: grava uma nota (entity_interactions, 'note',
--     assunto 'Nota'); texto de 1 a 2000 caracteres.
--   - neg_adiar_contacto: grava uma nota 'Contacto adiado' com a próxima
--     acção (callback) na data indicada; a ficha conta-a como o próximo
--     contacto.
--   As validações vivem em fn_neg_gravar_nota (chamável directamente): só
--   os assuntos 'Nota' e 'Contacto adiado', texto aparado de 1 a 2000,
--   janela de datas de neg_registar_contacto.
--   Guardas por ordem: valores (NG009), configuração (NG008), pessoas.create
--   ou pessoas.edit na organização (42501), pessoa visível (NG003). A
--   política de INSERT de entity_interactions só pede a organização: a
--   guarda real da pessoa é fn_neg_exigir_pessoa, antes do INSERT.
-- SÓ ACRESCENTA: nenhuma função, tabela ou política existente é alterada.
--   Não bloqueia tabelas. Nada da Mudelar.
-- Efeito de trigger existente: a nota dispara fn_mark_lead_pipeline_dirty
--   (na nike só muda pipeline_dirty_at), como as notas de abordagem.
-- A UI precisa de: gerar o id (crypto.randomUUID()); regenerar os tipos.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regprocedure('public.fn_neg_exigir_pessoa(uuid,uuid)') IS NULL
     OR to_regprocedure('public.neg_registar_nota(uuid,uuid,uuid,text)') IS NOT NULL
     OR to_regprocedure('public.neg_adiar_contacto(uuid,uuid,uuid,timestamp with time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam as auxiliares neg ou as funções já existem; nada feito.';
  END IF;
END;
$$;

-- Valida, guarda e grava uma nota (INSERT idempotente). É chamável
-- directamente, por isso valida tudo aqui: só os dois assuntos da ficha;
-- 'Nota' exige texto de 1 a 2000 caracteres (aparado de espaços e quebras
-- de linha) e não leva data; 'Contacto adiado' exige a data na janela de
-- neg_registar_contacto e não leva texto. Devolve true se gravou, false se
-- o id já existia nesta pessoa e organização com o mesmo assunto (senão NG004);
-- o reenvio é reconhecido antes da janela de datas.
CREATE FUNCTION public.fn_neg_gravar_nota(
  p_id uuid, p_organization_id uuid, p_entity_id uuid,
  p_assunto text, p_texto text, p_proxima_acao_em timestamptz)
  RETURNS boolean
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_texto text := NULLIF(btrim(p_texto, E' \t\r\n'), '');
  v_ex    public.entity_interactions;
  v_n     int;
BEGIN
  IF p_id IS NULL OR p_assunto IS NULL OR p_assunto NOT IN ('Nota', 'Contacto adiado') THEN
    RAISE EXCEPTION 'Valor inválido: identificador ou assunto da nota.' USING ERRCODE = 'NG009';
  END IF;
  IF p_assunto = 'Nota'
     AND (v_texto IS NULL OR char_length(v_texto) > 2000 OR p_proxima_acao_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Valor inválido: texto da nota (1 a 2000 caracteres).' USING ERRCODE = 'NG009';
  END IF;
  IF p_assunto = 'Contacto adiado' AND (v_texto IS NOT NULL OR p_proxima_acao_em IS NULL) THEN
    RAISE EXCEPTION 'Valor inválido: data da próxima acção.' USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);

  IF NOT (public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.create')
          OR public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para registar notas nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- Reenvio de um pedido já gravado: devolve-o antes da janela de datas (um
  -- adiamento reenviado mais tarde não dá um "data inválida" enganador).
  SELECT i.* INTO v_ex FROM public.entity_interactions i WHERE i.id = p_id;
  IF FOUND THEN
    IF v_ex.organization_id IS DISTINCT FROM p_organization_id
       OR v_ex.entity_id <> p_entity_id OR v_ex.interaction_type <> 'note'
       OR v_ex.subject IS DISTINCT FROM p_assunto THEN
      RAISE EXCEPTION 'Registo indisponível.' USING ERRCODE = 'NG004';
    END IF;
    RETURN false;
  END IF;

  IF p_assunto = 'Contacto adiado'
     AND (p_proxima_acao_em < now() - interval '1 day'
          OR p_proxima_acao_em > now() + interval '5 years') THEN
    RAISE EXCEPTION 'Valor inválido: data da próxima acção.' USING ERRCODE = 'NG009';
  END IF;

  INSERT INTO public.entity_interactions
    (id, entity_id, organization_id, root_organization_id, interaction_type, subject,
     notes, interaction_at, next_action_type, next_action_date, created_by)
  VALUES
    (p_id, p_entity_id, p_organization_id, public.resolve_root_organization_id(p_organization_id),
     'note', p_assunto, v_texto, now(),
     CASE WHEN p_proxima_acao_em IS NOT NULL THEN 'callback' END, p_proxima_acao_em,
     public.fn_neg_actor()::text)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    -- Corrida com outro envio do mesmo id: só vale se for desta pessoa e
    -- organização com o mesmo assunto.
    SELECT i.* INTO v_ex FROM public.entity_interactions i WHERE i.id = p_id;
    IF NOT FOUND OR v_ex.organization_id IS DISTINCT FROM p_organization_id
       OR v_ex.entity_id <> p_entity_id OR v_ex.interaction_type <> 'note'
       OR v_ex.subject IS DISTINCT FROM p_assunto THEN
      RAISE EXCEPTION 'Registo indisponível.' USING ERRCODE = 'NG004';
    END IF;
    RETURN false;
  END IF;
  RETURN true;
END;
$function$;

CREATE FUNCTION public.neg_registar_nota(
  p_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_texto text)
  RETURNS jsonb
  LANGUAGE sql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'nota_id', p_id,
    'mudou', public.fn_neg_gravar_nota(p_id, p_organization_id, p_entity_id, 'Nota', p_texto, NULL));
$function$;

CREATE FUNCTION public.neg_adiar_contacto(
  p_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_proxima_acao_em timestamptz)
  RETURNS jsonb
  LANGUAGE sql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'nota_id', p_id,
    'mudou', public.fn_neg_gravar_nota(
      p_id, p_organization_id, p_entity_id, 'Contacto adiado', NULL, p_proxima_acao_em));
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_gravar_nota(uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_registar_nota(uuid, uuid, uuid, text)                    FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_adiar_contacto(uuid, uuid, uuid, timestamptz)            FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_gravar_nota(uuid, uuid, uuid, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_registar_nota(uuid, uuid, uuid, text)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_adiar_contacto(uuid, uuid, uuid, timestamptz)            TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. funções novas: assinatura, INVOKER, search_path fixo, sem anon, com authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_gravar_nota(uuid,uuid,uuid,text,text,timestamp with time zone)'),
              ('public.neg_registar_nota(uuid,uuid,uuid,text)'),
              ('public.neg_adiar_contacto(uuid,uuid,uuid,timestamp with time zone)')
            ) AS e(sig)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp'
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR has_function_privilege('service_role', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. funções novas): falha em %', v_txt;
  END IF;

  -- 2. funções existentes de que dependem, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_exigir_config(uuid)',            '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',       '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_tem_permissao_org(uuid,text)',   '05943a6cfb0382a07322870262170c8d'),
              ('public.fn_neg_actor()',                        '01c906dd40875e72a5e63bdc10200359'),
              ('public.resolve_root_organization_id(uuid)',    '0fd01d82d04202e94fecbc638af746a0')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções existentes mudaram): %', v_txt;
  END IF;

  -- 3. colunas escritas, com o tipo esperado
  IF (SELECT count(*)
      FROM (VALUES ('id', 'uuid'), ('interaction_type', 'text'), ('subject', 'text'),
                   ('notes', 'text'), ('next_action_type', 'text'),
                   ('next_action_date', 'timestamp with time zone'), ('created_by', 'text')) AS e(c, ty)
      JOIN pg_attribute a ON a.attrelid = to_regclass('public.entity_interactions')
                         AND a.attname::text = e.c AND NOT a.attisdropped
                         AND format_type(a.atttypid, a.atttypmod) = e.ty) <> 7 THEN
    RAISE EXCEPTION 'CONFERIR (3. colunas de entity_interactions)';
  END IF;
END;
$$;

COMMIT;
