-- =============================================================================
-- Olyvia · Operações — planos preventivos a gerar ordens
--
-- O Infraspeak materializa ocorrências até 2033. Vi-as nas listas e no
-- calendário: milhares de linhas futuras que ninguém vai executar tão cedo,
-- a afogar o que é para esta semana.
--
-- Aqui guarda-se a REGRA e materializa-se uma JANELA. O trabalho existe até
-- hoje + 120 dias; para lá disso existe a regra, que é o que de facto se
-- conhece. `materializado_ate` diz onde a janela está, e voltar a correr
-- estende-a sem duplicar nada.
--
-- Aditivo e idempotente. Correr DEPOIS de db/rpcs.sql.
--
--
-- SUBCONJUNTO DE RRULE SUPORTADO — e porquê
-- ==========================================
-- Não implementa a norma iCal inteira: implementa o que a interface de planos
-- gera, e recusa em voz alta o resto em vez de o interpretar mal.
--
--   FREQ=DAILY    [;INTERVAL=n]
--   FREQ=WEEKLY   [;INTERVAL=n][;BYDAY=MO,TU,WE,TH,FR,SA,SU]
--   FREQ=MONTHLY  [;INTERVAL=n][;BYMONTHDAY=1..31]
--   FREQ=YEARLY   [;INTERVAL=n]
--   [;COUNT=n] [;UNTIL=AAAAMMDD]
--
-- Uma regra com partes não suportadas (BYSETPOS, BYWEEKNO, RRULE compostas)
-- faz o plano ser ignorado COM AVISO, e nunca gerar ordens erradas em
-- silêncio — que é o modo de falhar que mais custa a detetar.
-- =============================================================================

BEGIN;

DO $guarda$
BEGIN
  IF to_regprocedure('public.rpc_ops_transitar_ordem(uuid,text,text,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/rpcs.sql. Corre-o primeiro.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. Expandir uma RRULE numa janela
-- ============================================================

CREATE OR REPLACE FUNCTION public.ops_expandir_rrule(
  _regra  text,
  _inicio date,
  _fim    date
)
RETURNS SETOF date
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_partes  text[];
  v_parte   text;
  v_freq    text;
  v_inter   integer := 1;
  v_byday   text[];
  v_bymday  integer[];
  v_count   integer;
  v_until   date;
  v_d       date;
  v_n       integer := 0;
  v_passo   interval;
  v_dow     text[] := ARRAY['SU','MO','TU','WE','TH','FR','SA'];
BEGIN
  IF _regra IS NULL OR btrim(_regra) = '' THEN RETURN; END IF;

  v_partes := string_to_array(upper(replace(btrim(_regra), 'RRULE:', '')), ';');

  FOREACH v_parte IN ARRAY v_partes LOOP
    CASE split_part(v_parte, '=', 1)
      WHEN 'FREQ'       THEN v_freq  := split_part(v_parte, '=', 2);
      WHEN 'INTERVAL'   THEN v_inter := GREATEST(split_part(v_parte, '=', 2)::integer, 1);
      WHEN 'BYDAY'      THEN v_byday := string_to_array(split_part(v_parte, '=', 2), ',');
      WHEN 'BYMONTHDAY' THEN v_bymday := string_to_array(split_part(v_parte, '=', 2), ',')::integer[];
      WHEN 'COUNT'      THEN v_count := split_part(v_parte, '=', 2)::integer;
      WHEN 'UNTIL'      THEN v_until := to_date(left(split_part(v_parte, '=', 2), 8), 'YYYYMMDD');
      WHEN 'WKST'       THEN NULL;  -- irrelevante para as frequências suportadas
      WHEN ''           THEN NULL;
      ELSE
        RAISE EXCEPTION 'Parte de RRULE não suportada: %', v_parte;
    END CASE;
  END LOOP;

  IF v_freq IS NULL THEN RAISE EXCEPTION 'RRULE sem FREQ: %', _regra; END IF;
  IF v_until IS NOT NULL THEN _fim := LEAST(_fim, v_until); END IF;

  CASE v_freq
    WHEN 'DAILY'   THEN v_passo := (v_inter || ' days')::interval;
    WHEN 'WEEKLY'  THEN v_passo := (v_inter || ' weeks')::interval;
    WHEN 'MONTHLY' THEN v_passo := (v_inter || ' months')::interval;
    WHEN 'YEARLY'  THEN v_passo := (v_inter || ' years')::interval;
    ELSE RAISE EXCEPTION 'FREQ não suportada: %', v_freq;
  END CASE;

  v_d := _inicio;

  WHILE v_d <= _fim LOOP
    IF v_freq = 'WEEKLY' AND v_byday IS NOT NULL THEN
      -- A semana que começa em v_d: emite os dias pedidos que caiam na janela.
      FOR i IN 0..6 LOOP
        IF (v_d + i) BETWEEN _inicio AND _fim
           AND v_dow[EXTRACT(DOW FROM (v_d + i))::int + 1] = ANY (v_byday) THEN
          IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
          v_n := v_n + 1;
          RETURN NEXT (v_d + i);
        END IF;
      END LOOP;

    ELSIF v_freq = 'MONTHLY' AND v_bymday IS NOT NULL THEN
      FOR i IN 1..array_length(v_bymday, 1) LOOP
        -- Um dia 31 num mês de 30 não existe; salta-se em vez de escorregar
        -- para o mês seguinte, que seria pior do que não gerar.
        IF v_bymday[i] <= EXTRACT(DAY FROM (date_trunc('month', v_d) + interval '1 month - 1 day'))::int THEN
          DECLARE d2 date := date_trunc('month', v_d)::date + (v_bymday[i] - 1);
          BEGIN
            IF d2 BETWEEN _inicio AND _fim THEN
              IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
              v_n := v_n + 1;
              RETURN NEXT d2;
            END IF;
          END;
        END IF;
      END LOOP;

    ELSE
      IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
      v_n := v_n + 1;
      RETURN NEXT v_d;
    END IF;

    v_d := (v_d + v_passo)::date;
  END LOOP;
END
$$;


-- ============================================================
-- 2. Materializar
-- ============================================================
-- Idempotente por construção: uma ordem preventiva é identificada pelo par
-- (plano, dia agendado). Correr isto dez vezes seguidas gera o mesmo que
-- correr uma.

CREATE OR REPLACE FUNCTION public.rpc_ops_materializar_planos(
  _org_id         uuid DEFAULT NULL,
  _horizonte_dias integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_plano    record;
  v_dia      date;
  v_ate      date := (now() + (_horizonte_dias || ' days')::interval)::date;
  v_criadas  integer := 0;
  v_planos   integer := 0;
  v_ignorados jsonb := '[]'::jsonb;
  v_codigo   text;
  v_ordem_id uuid;
  v_desde    date;
BEGIN
  FOR v_plano IN
    SELECT p.* FROM public.ops_plano p
     WHERE p.estado = 'ativo'
       AND (_org_id IS NULL OR p.organization_id = _org_id)
       AND (p.fim_em IS NULL OR p.fim_em >= current_date)
       -- Quem chama tem de ver a organização. Um job de sistema corre como
       -- service_role e auth.uid() vem NULL, por isso passa.
       AND (v_uid IS NULL
            OR public.is_system_admin_user(v_uid)
            OR p.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid)))
  LOOP
    v_planos := v_planos + 1;

    -- Recomeça onde a janela ficou, nunca no passado: materializar para trás
    -- criaria ordens já nascidas atrasadas.
    v_desde := GREATEST(COALESCE(v_plano.materializado_ate + 1, v_plano.inicio_em), current_date);

    BEGIN
      FOR v_dia IN SELECT public.ops_expandir_rrule(v_plano.regra_recorrencia, v_desde, v_ate)
      LOOP
        CONTINUE WHEN EXISTS (
          SELECT 1 FROM public.ops_ordem o
           WHERE o.plano_id = v_plano.id
             AND o.agendada_para::date = v_dia
        );

        v_codigo := public.ops_proximo_codigo_interno(v_plano.organization_id, 'OT');

        INSERT INTO public.ops_ordem (
          organization_id, codigo, origem, estado, cliente_id, plano_id,
          titulo, responsavel_id, agendada_para
        ) VALUES (
          v_plano.organization_id, v_codigo, 'preventiva', 'agendada',
          v_plano.cliente_id, v_plano.id, v_plano.nome, v_plano.responsavel_id,
          (v_dia + v_plano.hora_prevista)::timestamptz
        ) RETURNING id INTO v_ordem_id;

        -- Os alvos do plano passam a alvos da ordem, com a versão da
        -- checklist congelada no momento da geração: editar a checklist
        -- amanhã não reescreve o que foi executado ontem.
        INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id, local_id, checklist_id, checklist_versao)
        SELECT v_ordem_id, pa.ativo_id, pa.local_id, pa.checklist_id, c.versao
          FROM public.ops_plano_alvo pa
          LEFT JOIN public.ops_checklist c ON c.id = pa.checklist_id
         WHERE pa.plano_id = v_plano.id;

        -- E as tarefas da checklist, copiadas por valor.
        INSERT INTO public.ops_ordem_tarefa (
          ordem_id, ordem_alvo_id, posicao, codigo, nome, tipo, unidade,
          limite_min, limite_max, obrigatoria, tempo_estimado
        )
        SELECT v_ordem_id, oa.id, ct.posicao, ct.codigo, ct.nome, ct.tipo, ct.unidade,
               ct.limite_min, ct.limite_max, ct.obrigatoria, ct.tempo_estimado
          FROM public.ops_ordem_alvo oa
          JOIN public.ops_checklist_tarefa ct ON ct.checklist_id = oa.checklist_id
         WHERE oa.ordem_id = v_ordem_id;

        v_criadas := v_criadas + 1;
      END LOOP;

      UPDATE public.ops_plano SET materializado_ate = v_ate, atualizado_em = now()
       WHERE id = v_plano.id;

    EXCEPTION WHEN OTHERS THEN
      -- Um plano com regra inválida não pode parar os outros. Fica registado
      -- e visível na resposta, em vez de desaparecer.
      v_ignorados := v_ignorados || jsonb_build_object(
        'plano', v_plano.codigo, 'regra', v_plano.regra_recorrencia, 'erro', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'planos_vistos', v_planos,
    'ordens_criadas', v_criadas,
    'materializado_ate', v_ate,
    'ignorados', v_ignorados
  );
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_materializar_planos(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_materializar_planos(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_expandir_rrule(text, date, date) TO authenticated, service_role;


-- ============================================================
-- 3. Verificação
-- ============================================================

DO $verificar$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('ops_expandir_rrule','rpc_ops_materializar_planos');
  IF v <> 2 THEN RAISE EXCEPTION 'Esperadas 2 funções, encontradas %', v; END IF;
  RAISE NOTICE 'Operações: planos preventivos prontos. Correr rpc_ops_materializar_planos() todos os dias.';
END
$verificar$;

COMMIT;
