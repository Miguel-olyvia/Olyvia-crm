-- ============================================================
-- 20261223120000_neg_registos
-- ============================================================
-- O que faz: funções NOVAS da página Pessoas para os registos da pessoa:
--     neg_registar_contacto, neg_guardar_levantamento,
--     neg_encerrar_abordagem, neg_reabrir_abordagem, neg_resultado_visita;
--   e as auxiliares fn_neg_lead_aberta (o predicado único de lead aberta),
--   fn_neg_escolher_lead, fn_neg_mudar_abordagem (usadas também pela
--   migration 20261223140000) e fn_neg_tem_negocio_aberto.
--   Todas SECURITY INVOKER (a RLS existente decide), excepto
--   fn_neg_tem_negocio_aberto: DEFINER mínimo (search_path fixo, só devolve
--   um boolean; exige organização do chamador, pessoas.edit com chave dessa
--   organização e a linha de configuração, senão NG008) para que o teste
--   "a pessoa tem negócios abertos" veja também os negócios de colegas, que
--   um âmbito OWNED não vê pela RLS.
--   Organização sem linha em negocio_workflow_config: recusa (NG008).
-- SÓ ACRESCENTA: nenhuma tabela, trigger, política, configuração ou função
--   existente é alterada. Não bloqueia tabelas.
-- Decisão D4: os contactos vivem em entity_interactions (interaction_type
--   'call', resultado com as chaves do protótipo), o encerramento em
--   anew_leads.closure_result mais uma nota em entity_interactions. NÃO se
--   tocam last_contact_result, contact_attempts, scheduled_visit_id nem
--   status da lead.
-- Efeitos de triggers existentes: gravar um contacto ou uma nota dispara
--   fn_mark_lead_pipeline_dirty (marca as leads da pessoa para recalcular a
--   etapa; na nike as etapas têm auto_advance = false, por isso só muda
--   pipeline_dirty_at). Os resultados novos (chaves do protótipo) nunca dão
--   o sinal 'answered' do motor de etapas antigo.
-- Permissões: encerrar/reabrir a abordagem exige pessoas.edit na
--   organização (também ao reabrir dentro de neg_criar_negocio); registar
--   contacto exige pessoas.create ou pessoas.edit na
--   organização (a política de entity_interactions só pede a organização);
--   o resultado de uma visita exige pessoas.edit com âmbito sobre a visita
--   (org:*, criador ou utilizador da visita) além de scheduling.items.edit
--   (RLS).
-- Levantamento: CRIAR, PREENCHER, LIGAR numa só chamada; um levantamento
--   ligado não se altera (NG005); negócio com levantamento já ligado: NG013.
--   Lacuna conhecida: quem só tem pessoas.create cria o levantamento mas não
--   lhe grava linhas (precisa de pessoas.edit); a função não contorna isto.
-- LIMITAÇÃO ASSUMIDA: o D1 vive só nas funções (ver 20261223110000).
-- Erros novos: NG011 a pessoa tem negócios abertos; NG013 o negócio já tem
--   levantamento; 42501 sem permissão (linha visível mas não editável, ou
--   sem pessoas.* na organização).
-- PRECISA DE CÓDIGO: a UI gera o id (crypto.randomUUID()) do contacto e do
--   levantamento novos (idempotência), troca registosPessoa.ts por estas RPC
--   e regenera os tipos do Supabase.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, extensions;

DO $$
BEGIN
  IF to_regprocedure('public.fn_neg_negocio_editavel(uuid,text[])') IS NULL
     OR to_regprocedure('public.fn_neg_tem_permissao_org(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta 20261223110000 (auxiliares neg); nada feito.';
  END IF;
END;
$$;

-- O predicado único de lead aberta (usado aqui e no ganho).
CREATE FUNCTION public.fn_neg_lead_aberta(p_status text)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(p_status, '') NOT IN ('converted', 'rejected', 'lost', 'cancelled');
$function$;

-- Lead viva da pessoa na organização (sob RLS). Com p_lead_id tem de ser
-- dessa pessoa e organização (senão NG009). Sem ela: 'aberta' = a mais
-- recente aberta (sem recurso a outras; NULL se não houver); 'fechada' = a
-- mais recente, preferindo a com closure_result; 'qualquer' = a mais recente.
CREATE FUNCTION public.fn_neg_escolher_lead(
  p_organization_id uuid, p_entity_id uuid, p_lead_id uuid, p_preferir text)
  RETURNS public.anew_leads
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_lead public.anew_leads;
BEGIN
  IF p_lead_id IS NOT NULL THEN
    SELECT l.* INTO v_lead
    FROM public.anew_leads l
    WHERE l.id = p_lead_id AND l.organization_id = p_organization_id
      AND l.entity_id = p_entity_id AND l.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Valor inválido: a lead indicada não é desta pessoa.' USING ERRCODE = 'NG009';
    END IF;
    RETURN v_lead;
  END IF;

  SELECT l.* INTO v_lead
  FROM public.anew_leads l
  WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
    AND l.deleted_at IS NULL
    AND (p_preferir IS DISTINCT FROM 'aberta' OR public.fn_neg_lead_aberta(l.status::text))
  ORDER BY
    CASE WHEN p_preferir = 'fechada' THEN l.closure_result IS NOT NULL ELSE true END DESC,
    l.created_at DESC
  LIMIT 1;

  RETURN v_lead;
END;
$function$;

-- Há negócio aberto desta pessoa na organização (todos, não só os que a RLS
-- mostra). DEFINER: só para a organização do chamador; só devolve boolean.
CREATE FUNCTION public.fn_neg_tem_negocio_aberto(p_organization_id uuid, p_entity_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Não é um oráculo: só para quem tem pessoas.edit nesta organização e só
  -- em organizações com a página Pessoas activa (mesma mensagem para tudo).
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = p_entity_id
      AND n.estado = 'aberto' AND n.deleted_at IS NULL);
END;
$function$;

-- Encerra (p_resultado = semInteresse | obraInviavel) ou reabre
-- (p_resultado NULL) a abordagem: só anew_leads.closure_result e uma nota.
CREATE FUNCTION public.fn_neg_mudar_abordagem(
  p_organization_id uuid, p_entity_id uuid, p_lead_id uuid,
  p_resultado text, p_nota_resultado text, p_nota_texto text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_lead public.anew_leads;
  v_n    int;
BEGIN
  IF p_resultado IS NOT NULL AND p_resultado NOT IN ('semInteresse', 'obraInviavel') THEN
    RAISE EXCEPTION 'Valor inválido: resultado do encerramento.' USING ERRCODE = 'NG009';
  END IF;
  IF char_length(p_nota_resultado) > 300 OR char_length(p_nota_texto) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: motivo até 300 e texto até 1000 caracteres.' USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar a abordagem desta pessoa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  IF p_resultado IS NOT NULL
     AND public.fn_neg_tem_negocio_aberto(p_organization_id, p_entity_id) THEN
    RAISE EXCEPTION 'A pessoa tem negócios abertos.' USING ERRCODE = 'NG011';
  END IF;

  SELECT * INTO v_lead FROM public.fn_neg_escolher_lead(
    p_organization_id, p_entity_id, p_lead_id,
    CASE WHEN p_resultado IS NULL THEN 'fechada' ELSE 'qualquer' END);
  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: só as leads se encerram.' USING ERRCODE = 'NG009';
  END IF;

  IF v_lead.closure_result IS NOT DISTINCT FROM p_resultado THEN
    RETURN jsonb_build_object('mudou', false, 'lead_id', v_lead.id);
  END IF;

  UPDATE public.anew_leads l
  SET closure_result = p_resultado
  WHERE l.id = v_lead.id AND l.closure_result IS DISTINCT FROM p_resultado;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Sem permissão para alterar a lead.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.entity_interactions
    (entity_id, organization_id, root_organization_id, interaction_type, subject,
     result, notes, interaction_at, created_by)
  VALUES
    (p_entity_id, p_organization_id, public.resolve_root_organization_id(p_organization_id),
     'note',
     CASE WHEN p_resultado IS NULL THEN 'Abordagem reaberta' ELSE 'Abordagem encerrada' END,
     p_nota_resultado, p_nota_texto, now(), public.fn_neg_actor()::text);

  RETURN jsonb_build_object('mudou', true, 'lead_id', v_lead.id);
END;
$function$;

CREATE FUNCTION public.neg_registar_contacto(
  p_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_resultado text,
  p_nota text DEFAULT NULL,
  p_quando timestamptz DEFAULT now(),
  p_proxima_acao_em timestamptz DEFAULT NULL,
  p_negocio_id uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg    public.negocios;
  v_quando timestamptz := COALESCE(p_quando, now());
  v_nota   text := NULLIF(btrim(p_nota), '');
  v_ex     public.entity_interactions;
  v_n      int;
BEGIN
  IF p_id IS NULL OR p_resultado IS NULL OR p_resultado NOT IN
     ('atendeuInteressado', 'atendeuMaisTarde', 'naoAtendeu', 'semInteresse', 'numeroErrado') THEN
    RAISE EXCEPTION 'Valor inválido: identificador ou resultado do contacto.' USING ERRCODE = 'NG009';
  END IF;
  IF char_length(v_nota) > 2000 THEN
    RAISE EXCEPTION 'Valor inválido: nota com mais de 2000 caracteres.' USING ERRCODE = 'NG009';
  END IF;
  IF v_quando > now() + interval '5 minutes' OR v_quando < timestamptz '2000-01-01 00:00:00+00' THEN
    RAISE EXCEPTION 'Valor inválido: data do contacto.' USING ERRCODE = 'NG009';
  END IF;
  IF p_proxima_acao_em < v_quando - interval '1 day' OR p_proxima_acao_em > now() + interval '5 years' THEN
    RAISE EXCEPTION 'Valor inválido: data da próxima acção.' USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);

  IF NOT (public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.create')
          OR public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para registar contactos nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ordem de bloqueio: negócio primeiro.
  IF p_negocio_id IS NOT NULL THEN
    SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);
    IF v_neg.organization_id <> p_organization_id OR v_neg.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
  END IF;

  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  INSERT INTO public.entity_interactions
    (id, entity_id, organization_id, root_organization_id, interaction_type, result,
     subject, notes, interaction_at, next_action_type, next_action_date, created_by, negocio_id)
  VALUES
    (p_id, p_entity_id, p_organization_id, public.resolve_root_organization_id(p_organization_id),
     'call', p_resultado, 'Contacto', v_nota, v_quando,
     CASE WHEN p_proxima_acao_em IS NOT NULL THEN 'callback' END, p_proxima_acao_em,
     public.fn_neg_actor()::text, p_negocio_id)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    -- Reenvio: devolve o que existe, se for desta pessoa e organização.
    SELECT i.* INTO v_ex FROM public.entity_interactions i WHERE i.id = p_id;
    IF NOT FOUND OR v_ex.organization_id IS DISTINCT FROM p_organization_id
       OR v_ex.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    RETURN jsonb_build_object('contacto_id', p_id, 'mudou', false, 'ligado_a', v_ex.negocio_id);
  END IF;

  RETURN jsonb_build_object('contacto_id', p_id, 'mudou', true, 'ligado_a', p_negocio_id);
END;
$function$;

CREATE FUNCTION public.neg_guardar_levantamento(
  p_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_dados jsonb,
  p_linhas jsonb,
  p_respostas jsonb,
  p_negocio_id uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg       public.negocios;
  v_lev       public.levantamentos;
  v_dados     jsonb := COALESCE(p_dados, '{}'::jsonb);
  v_linhas    jsonb := COALESCE(p_linhas, '[]'::jsonb);
  v_respostas jsonb := COALESCE(p_respostas, '{}'::jsonb);
  v_data      date;
  v_visita    uuid;
  v_feito_por uuid;
  v_criado    boolean;
  v_ligado    uuid;
  v_n         int;
BEGIN
  IF p_id IS NULL
     OR jsonb_typeof(v_dados) <> 'object'
     OR jsonb_typeof(v_linhas) <> 'array'
     OR jsonb_typeof(v_respostas) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: identificador, dados, linhas ou respostas.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_linhas) > 200
     OR (SELECT count(*) FROM jsonb_object_keys(v_respostas)) > 200 THEN
    RAISE EXCEPTION 'Valor inválido: até 200 linhas e 200 respostas.' USING ERRCODE = 'NG009';
  END IF;
  BEGIN
    v_data      := (v_dados ->> 'data_levantamento')::date;
    v_visita    := (v_dados ->> 'visita_id')::uuid;
    v_feito_por := (v_dados ->> 'feito_por')::uuid;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Valor inválido: data, visita ou autor do levantamento.' USING ERRCODE = 'NG009';
  END;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: falta a data do levantamento.' USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- Ordem de bloqueio: negócio primeiro (ligação feita no fim).
  IF p_negocio_id IS NOT NULL THEN
    SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);
    IF v_neg.organization_id <> p_organization_id OR v_neg.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF EXISTS (SELECT 1 FROM public.levantamentos o
               WHERE o.negocio_id = p_negocio_id AND o.id <> p_id) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.' USING ERRCODE = 'NG013';
    END IF;
  END IF;

  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- 1. CRIAR (sem negocio_id) ou alterar o existente.
  INSERT INTO public.levantamentos
    (id, organization_id, entity_id, visita_id, feito_por, data_levantamento, estado, notas,
     morada_rua, morada_codigo_postal, morada_localidade, morada_andar)
  VALUES
    (p_id, p_organization_id, p_entity_id, v_visita, v_feito_por, v_data,
     COALESCE(NULLIF(v_dados ->> 'estado', ''), 'por_fazer'),
     NULLIF(btrim(v_dados ->> 'notas'), ''),
     NULLIF(btrim(v_dados ->> 'morada_rua'), ''),
     NULLIF(btrim(v_dados ->> 'morada_codigo_postal'), ''),
     NULLIF(btrim(v_dados ->> 'morada_localidade'), ''),
     NULLIF(btrim(v_dados ->> 'morada_andar'), ''))
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_criado := v_n > 0;

  IF NOT v_criado THEN
    SELECT lv.* INTO v_lev FROM public.levantamentos lv WHERE lv.id = p_id;
    IF NOT FOUND OR v_lev.organization_id <> p_organization_id OR v_lev.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF v_lev.negocio_id IS NOT NULL THEN
      IF v_lev.negocio_id = p_negocio_id THEN
        RETURN jsonb_build_object('levantamento_id', p_id, 'criado', false, 'mudou', false,
                                  'ligado_a', v_lev.negocio_id);
      END IF;
      RAISE EXCEPTION 'Este levantamento já está ligado a um negócio e não se altera; registe um novo.'
        USING ERRCODE = 'NG005';
    END IF;

    UPDATE public.levantamentos lv
    SET visita_id            = v_visita,
        feito_por            = COALESCE(v_feito_por, lv.feito_por),
        data_levantamento    = v_data,
        estado               = COALESCE(NULLIF(v_dados ->> 'estado', ''), lv.estado),
        notas                = NULLIF(btrim(v_dados ->> 'notas'), ''),
        morada_rua           = NULLIF(btrim(v_dados ->> 'morada_rua'), ''),
        morada_codigo_postal = NULLIF(btrim(v_dados ->> 'morada_codigo_postal'), ''),
        morada_localidade    = NULLIF(btrim(v_dados ->> 'morada_localidade'), ''),
        morada_andar         = NULLIF(btrim(v_dados ->> 'morada_andar'), '')
    WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Sem permissão para alterar o levantamento.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2. PREENCHER: linhas por substituição completa, na ordem recebida.
  DELETE FROM public.levantamento_linhas ll WHERE ll.levantamento_id = p_id;
  BEGIN
    INSERT INTO public.levantamento_linhas
      (levantamento_id, organization_id, divisao, trabalho, trabalho_outro, medida, unidade,
       observacoes, ordem)
    SELECT p_id, p_organization_id,
           e.valor ->> 'divisao',
           e.valor ->> 'trabalho',
           NULLIF(btrim(e.valor ->> 'trabalho_outro'), ''),
           (e.valor ->> 'medida')::numeric,
           COALESCE(NULLIF(e.valor ->> 'unidade', ''), 'm2'),
           NULLIF(btrim(e.valor ->> 'observacoes'), ''),
           (e.posicao - 1)::int
    FROM jsonb_array_elements(v_linhas) WITH ORDINALITY AS e(valor, posicao);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Valor inválido: medida de uma linha do levantamento.' USING ERRCODE = 'NG009';
  END;

  -- Respostas: as enviadas (upsert, sem id no payload) e apagar as que deixaram de vir.
  INSERT INTO public.levantamento_respostas
    (levantamento_id, organization_id, seccao, pergunta, resposta)
  SELECT p_id, p_organization_id, r.valor ->> 'seccao', r.pergunta, r.valor ->> 'resposta'
  FROM jsonb_each(v_respostas) AS r(pergunta, valor)
  ON CONFLICT (levantamento_id, pergunta)
  DO UPDATE SET seccao = EXCLUDED.seccao, resposta = EXCLUDED.resposta;

  DELETE FROM public.levantamento_respostas lr
  WHERE lr.levantamento_id = p_id
    AND NOT (v_respostas ? lr.pergunta);

  -- 3. LIGAR (o trigger valida um por negócio e a permissão).
  IF p_negocio_id IS NOT NULL THEN
    UPDATE public.levantamentos lv SET negocio_id = p_negocio_id WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 1 THEN
      v_ligado := p_negocio_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('levantamento_id', p_id, 'criado', v_criado, 'mudou', true,
                            'ligado_a', v_ligado);
END;
$function$;

CREATE FUNCTION public.neg_encerrar_abordagem(
  p_organization_id uuid,
  p_entity_id uuid,
  p_resultado text,
  p_motivo text,
  p_motivo_outro text DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_outro text := NULLIF(btrim(p_motivo_outro), '');
BEGIN
  IF p_resultado IS NULL OR p_resultado NOT IN ('semInteresse', 'obraInviavel')
     OR p_motivo IS NULL OR p_motivo NOT IN
        ('preco', 'adiou', 'outraEmpresa', 'semResposta', 'naoProcurava', 'outro') THEN
    RAISE EXCEPTION 'Valor inválido: resultado ou motivo do encerramento.' USING ERRCODE = 'NG009';
  END IF;
  IF (p_motivo = 'outro') <> (v_outro IS NOT NULL) OR char_length(v_outro) > 300 THEN
    RAISE EXCEPTION 'Valor inválido: o motivo "outro" exige um texto até 300 caracteres (e só ele).'
      USING ERRCODE = 'NG009';
  END IF;

  RETURN public.fn_neg_mudar_abordagem(
    p_organization_id, p_entity_id, p_lead_id, p_resultado, p_motivo, v_outro);
END;
$function$;

CREATE FUNCTION public.neg_reabrir_abordagem(
  p_organization_id uuid,
  p_entity_id uuid,
  p_motivo text DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_motivo text := NULLIF(btrim(p_motivo), '');
BEGIN
  IF char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: motivo com mais de 1000 caracteres.' USING ERRCODE = 'NG009';
  END IF;

  RETURN public.fn_neg_mudar_abordagem(
    p_organization_id, p_entity_id, p_lead_id, NULL, NULL, v_motivo);
END;
$function$;

-- Resultado de uma visita existente. Sem interesse / obra inviável encerra a
-- abordagem só se a visita não for de um negócio e a pessoa não tiver
-- negócios abertos (senão devolve o motivo e a UI propõe perder o negócio).
CREATE FUNCTION public.neg_resultado_visita(
  p_visita_id uuid, p_resultado text, p_feita boolean DEFAULT true)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_vis      record;
  v_entity   uuid;
  v_lead     uuid;
  v_feita    boolean := COALESCE(p_feita, false);
  v_concluir boolean;
  v_mudou    boolean := false;
  v_motivo   text;
  v_n        int;
BEGIN
  IF p_visita_id IS NULL OR p_resultado IS NULL
     OR p_resultado NOT IN ('interessado', 'aPensar', 'semInteresse', 'obraInviavel') THEN
    RAISE EXCEPTION 'Valor inválido: resultado da visita.' USING ERRCODE = 'NG009';
  END IF;

  SELECT s.organization_id, s.negocio_id, s.lead_id, s.client_id, s.visit_outcome, s.status,
         s.start_datetime, s.created_by, s.user_id
    INTO v_vis
  FROM public.schedule_items s
  WHERE s.id = p_visita_id AND s.time_off_type IS NULL AND s.vacation_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
  END IF;

  PERFORM public.fn_neg_exigir_config(v_vis.organization_id);

  -- pessoas.edit com âmbito sobre a visita (org:*, criador ou utilizador).
  IF NOT (public.has_anew_permission(auth.uid(), 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_vis.organization_id::text || ':*'
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.created_by::text
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.user_id::text)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_feita AND v_vis.start_datetime > now() THEN
    RAISE EXCEPTION 'Valor inválido: uma visita no futuro não pode ser dada como feita.' USING ERRCODE = 'NG009';
  END IF;

  -- status só entra no UPDATE quando muda (o trigger dos feriados corre em UPDATE OF status).
  v_concluir := v_feita AND v_vis.status <> 'completed'::public.schedule_item_status;
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

  SELECT l.entity_id, l.id INTO v_entity, v_lead
  FROM public.anew_leads l
  WHERE l.id = v_vis.lead_id AND l.organization_id = v_vis.organization_id;
  IF v_entity IS NULL THEN
    SELECT c.entity_id INTO v_entity
    FROM public.anew_clients c
    WHERE c.id = v_vis.client_id AND c.organization_id = v_vis.organization_id;
  END IF;

  IF v_vis.negocio_id IS NOT NULL THEN
    v_motivo := 'visita_de_negocio';
  ELSIF v_entity IS NULL THEN
    v_motivo := 'sem_pessoa';
  ELSIF public.fn_neg_tem_negocio_aberto(v_vis.organization_id, v_entity) THEN
    v_motivo := 'negocios_abertos';
  ELSIF NOT EXISTS (SELECT 1 FROM public.anew_leads l
                    WHERE l.organization_id = v_vis.organization_id AND l.entity_id = v_entity
                      AND l.deleted_at IS NULL) THEN
    v_motivo := 'sem_lead';
  END IF;

  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', v_motivo);
  END IF;

  -- A lead da visita, se ainda viva; senão a mais recente da pessoa.
  IF NOT EXISTS (SELECT 1 FROM public.anew_leads l WHERE l.id = v_lead AND l.deleted_at IS NULL) THEN
    v_lead := NULL;
  END IF;
  v_mudou := (public.fn_neg_mudar_abordagem(
    v_vis.organization_id, v_entity, v_lead, p_resultado, NULL, 'Resultado da visita')
    ->> 'mudou')::boolean OR v_mudou;

  RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', true,
                            'motivo_nao_encerrada', NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_lead_aberta(text)                                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_neg_escolher_lead(uuid, uuid, uuid, text)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_neg_tem_negocio_aberto(uuid, uuid)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_neg_mudar_abordagem(uuid, uuid, uuid, text, text, text)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_registar_contacto(uuid, uuid, uuid, text, text, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_guardar_levantamento(uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_encerrar_abordagem(uuid, uuid, text, text, text, uuid)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_reabrir_abordagem(uuid, uuid, text, uuid)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_resultado_visita(uuid, text, boolean)                             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_lead_aberta(text)                                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_escolher_lead(uuid, uuid, uuid, text)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_tem_negocio_aberto(uuid, uuid)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_mudar_abordagem(uuid, uuid, uuid, text, text, text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_registar_contacto(uuid, uuid, uuid, text, text, timestamptz, timestamptz, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_guardar_levantamento(uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_encerrar_abordagem(uuid, uuid, text, text, text, uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_reabrir_abordagem(uuid, uuid, text, uuid)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_resultado_visita(uuid, text, boolean)                          TO authenticated, service_role;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. funções novas: assinatura, DEFINER só a fn_neg_tem_negocio_aberto,
  --    search_path fixo, sem anon, com authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_lead_aberta(text)', false),
              ('public.fn_neg_escolher_lead(uuid,uuid,uuid,text)', false),
              ('public.fn_neg_tem_negocio_aberto(uuid,uuid)', true),
              ('public.fn_neg_mudar_abordagem(uuid,uuid,uuid,text,text,text)', false),
              ('public.neg_registar_contacto(uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone,uuid)', false),
              ('public.neg_guardar_levantamento(uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid)', false),
              ('public.neg_encerrar_abordagem(uuid,uuid,text,text,text,uuid)', false),
              ('public.neg_reabrir_abordagem(uuid,uuid,text,uuid)', false),
              ('public.neg_resultado_visita(uuid,text,boolean)', false)
            ) AS e(sig, definer)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef <> e.definer
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp'
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. funções novas): falha em %', v_txt;
  END IF;

  -- 2. funções existentes de que dependem, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.current_business_user_id()',           '7e60101f074e4ff526559140be6618bb'),
              ('public.resolve_root_organization_id(uuid)',   '0fd01d82d04202e94fecbc638af746a0'),
              ('public.get_user_crm_org_ids(uuid)',           '29782031244dd3b0842ca43b271e2bf1'),
              ('public.crm_scope_keys(text)',                 '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',       '8f69ed134c7d20e080d8c5a4161a3151')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções existentes mudaram): %', v_txt;
  END IF;

  -- 3. restrições de que os valores dependem: na tabela certa e validadas
  v_txt := (SELECT string_agg(e.t || '.' || e.c, ',')
            FROM (VALUES
              ('anew_leads', 'anew_leads_closure_result_check'),
              ('schedule_items', 'schedule_items_visit_outcome_check'),
              ('levantamento_respostas', 'levantamento_respostas_levantamento_pergunta_key'),
              ('levantamentos', 'levantamentos_negocio_id_key')
            ) AS e(t, c)
            WHERE to_regclass('public.' || e.t) IS NULL
               OR NOT EXISTS (SELECT 1 FROM pg_constraint k
                              WHERE k.conrelid = to_regclass('public.' || e.t)
                                AND k.conname::text = e.c AND k.convalidated));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (3. restrições em falta ou por validar): %', v_txt;
  END IF;

  -- 4. tabelas usadas existem
  v_txt := (SELECT string_agg(t, ',') FROM unnest(ARRAY[
              'negocios', 'negocio_workflow_config', 'entity_interactions', 'schedule_items',
              'levantamentos', 'levantamento_linhas', 'levantamento_respostas', 'anew_leads',
              'anew_clients']) AS t
            WHERE to_regclass('public.' || t) IS NULL);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (4. tabelas em falta): %', v_txt;
  END IF;
END;
$$;

COMMIT;
