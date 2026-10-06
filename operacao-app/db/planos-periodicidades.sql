-- =============================================================================
-- Olyvia · Operações — periodicidades dos planos (06/10/2026)
--
-- Quinzenal, bimestral, trimestral, quadrimestral, semestral, bienal, trienal,
-- quinquenal. Na base são só frequência + INTERVAL da RRULE, que o expansor já
-- lia. O que este ficheiro corrige é a ÂNCORA: o job expandia a partir do
-- início da janela (`materializado_ate + 1`), e com INTERVAL > 1 ou FREQ=YEARLY
-- o passo perdia-se — um trimestral passava a mensal, um anual gerava uma
-- ordem a cada corrida. Agora conta-se a partir do início do plano.
--
-- Não toca em dados nem em CHECKs: as regras já gravadas continuam válidas.
-- Aditivo e idempotente. Correr DEPOIS de correcoes-modelo.sql e planos-crud.sql.
--
-- É a ENTREGA para a produção. As mesmas funções vivem em correcoes-modelo.sql
-- (expansor e job) e planos-crud.sql (experimentar); tools/validar-atualizacao.mjs
-- exige que fiquem iguais.
-- =============================================================================

BEGIN;

DO $guarda$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'ops_plano'
                    AND column_name = 'tipo_recorrencia')
     OR to_regprocedure('public.rpc_ops_experimentar_regra(text,date,integer)') IS NULL THEN
    RAISE EXCEPTION 'Faltam db/correcoes-modelo.sql e db/planos-crud.sql. Corre-os primeiro.';
  END IF;
END
$guarda$;


-- 1. O expansor, com âncora
CREATE OR REPLACE FUNCTION public.ops_expandir_rrule(
  _regra  text,
  _inicio date,
  _fim    date,
  _ancora date
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
  v_k       integer := 0;
  v_unid    text;
  v_dow     text[] := ARRAY['SU','MO','TU','WE','TH','FR','SA'];
  v_tok     text;
  v_ord     integer;
  v_dia     text;
  v_base    date;
  v_cand    date;
  v_periodo date;
  v_cands   date[];
  v_i       integer;
BEGIN
  IF _regra IS NULL OR btrim(_regra) = '' THEN RETURN; END IF;
  _ancora := COALESCE(_ancora, _inicio);

  v_partes := string_to_array(upper(replace(btrim(_regra), 'RRULE:', '')), ';');

  FOREACH v_parte IN ARRAY v_partes LOOP
    CASE split_part(v_parte, '=', 1)
      WHEN 'FREQ'       THEN v_freq  := split_part(v_parte, '=', 2);
      WHEN 'INTERVAL'   THEN v_inter := GREATEST(split_part(v_parte, '=', 2)::integer, 1);
      WHEN 'BYDAY'      THEN v_byday := string_to_array(split_part(v_parte, '=', 2), ',');
      WHEN 'BYMONTHDAY' THEN v_bymday := string_to_array(split_part(v_parte, '=', 2), ',')::integer[];
      WHEN 'COUNT'      THEN v_count := split_part(v_parte, '=', 2)::integer;
      WHEN 'UNTIL'      THEN v_until := to_date(left(split_part(v_parte, '=', 2), 8), 'YYYYMMDD');
      WHEN 'WKST'       THEN NULL;
      WHEN ''           THEN NULL;
      ELSE
        RAISE EXCEPTION 'Parte de RRULE não suportada: %', v_parte;
    END CASE;
  END LOOP;

  IF v_freq IS NULL THEN RAISE EXCEPTION 'RRULE sem FREQ: %', _regra; END IF;
  IF v_until IS NOT NULL THEN _fim := LEAST(_fim, v_until); END IF;

  CASE v_freq
    WHEN 'DAILY'   THEN v_unid := ' days';
    WHEN 'WEEKLY'  THEN v_unid := ' weeks';
    WHEN 'MONTHLY' THEN v_unid := ' months';
    WHEN 'YEARLY'  THEN v_unid := ' years';
    ELSE RAISE EXCEPTION 'FREQ não suportada: %', v_freq;
  END CASE;

  LOOP
    -- Cada passo conta-se a partir da âncora (e não do passo anterior), para
    -- um dia 31 não escorregar para 28 e ficar em 28 para sempre.
    v_d := (_ancora + ((v_k * v_inter) || v_unid)::interval)::date;
    v_k := v_k + 1;
    v_cands := ARRAY[]::date[];

    IF v_freq = 'WEEKLY' AND v_byday IS NOT NULL THEN
      v_periodo := v_d - (EXTRACT(ISODOW FROM v_d)::int - 1);
      FOR v_i IN 0..6 LOOP
        IF v_dow[EXTRACT(DOW FROM (v_periodo + v_i))::int + 1] = ANY (v_byday) THEN
          v_cands := v_cands || (v_periodo + v_i);
        END IF;
      END LOOP;

    ELSIF v_freq IN ('MONTHLY','YEARLY') AND v_byday IS NOT NULL THEN
      -- "Primeira segunda-feira", "última sexta-feira". BYDAY com ordinal.
      v_base := date_trunc('month', v_d)::date;
      v_periodo := v_base;
      FOREACH v_tok IN ARRAY v_byday LOOP
        v_ord := NULLIF(regexp_replace(v_tok, '[A-Z]', '', 'g'), '')::integer;
        v_dia := regexp_replace(v_tok, '[^A-Z]', '', 'g');

        IF v_ord IS NULL THEN
          RAISE EXCEPTION 'BYDAY sem ordinal não é suportado em FREQ=%: %', v_freq, v_tok;
        END IF;

        IF v_ord > 0 THEN
          v_cand := v_base;
          WHILE v_dow[EXTRACT(DOW FROM v_cand)::int + 1] <> v_dia LOOP
            v_cand := v_cand + 1;
          END LOOP;
          v_cand := v_cand + (v_ord - 1) * 7;
        ELSE
          v_cand := (v_base + interval '1 month - 1 day')::date;
          WHILE v_dow[EXTRACT(DOW FROM v_cand)::int + 1] <> v_dia LOOP
            v_cand := v_cand - 1;
          END LOOP;
          v_cand := v_cand + (v_ord + 1) * 7;
        END IF;
        -- Se transbordou para outro mês, esse mês não tem esse ordinal.
        IF date_trunc('month', v_cand)::date = v_base THEN
          v_cands := v_cands || v_cand;
        END IF;
      END LOOP;

    ELSIF v_freq IN ('MONTHLY','YEARLY') AND v_bymday IS NOT NULL THEN
      v_base := date_trunc('month', v_d)::date;
      v_periodo := v_base;
      FOR v_i IN 1..array_length(v_bymday, 1) LOOP
        -- Um dia 31 num mês de 30 não existe; salta-se em vez de escorregar
        -- para o mês seguinte, que seria pior do que não gerar.
        IF v_bymday[v_i] <= EXTRACT(DAY FROM (v_base + interval '1 month - 1 day'))::int THEN
          v_cands := v_cands || (v_base + (v_bymday[v_i] - 1));
        END IF;
      END LOOP;

    ELSE
      v_periodo := v_d;
      v_cands := ARRAY[v_d];
    END IF;

    EXIT WHEN v_periodo > _fim;

    FOR v_cand IN SELECT c FROM unnest(v_cands) c ORDER BY c LOOP
      CONTINUE WHEN v_cand < _ancora OR v_cand > _fim;
      IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
      v_n := v_n + 1;
      IF v_cand >= _inicio THEN
        RETURN NEXT v_cand;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- A versão de três argumentos fica: a âncora é o início da janela.
CREATE OR REPLACE FUNCTION public.ops_expandir_rrule(
  _regra  text,
  _inicio date,
  _fim    date
)
RETURNS SETOF date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT public.ops_expandir_rrule(_regra, _inicio, _fim, _inicio);
$$;

GRANT EXECUTE ON FUNCTION public.ops_expandir_rrule(text, date, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_expandir_rrule(text, date, date) TO authenticated, service_role;


-- 2. O job: expande a partir do início do plano
CREATE OR REPLACE FUNCTION public.rpc_ops_materializar_planos(
  _org_id         uuid DEFAULT NULL,
  _horizonte_dias integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_plano     record;
  v_dia       date;
  v_ate       date := (now() + (_horizonte_dias || ' days')::interval)::date;
  v_criadas   integer := 0;
  v_planos    integer := 0;
  v_ignorados jsonb := '[]'::jsonb;
  v_codigo    text;
  v_ordem_id  uuid;
  v_desde     date;
BEGIN
  FOR v_plano IN
    SELECT p.* FROM public.ops_plano p
     WHERE p.estado = 'ativo'
       AND p.tipo_recorrencia = 'calendario'      -- ← as dinâmicas ficam de fora
       AND (_org_id IS NULL OR p.organization_id = _org_id)
       AND (p.fim_em IS NULL OR p.fim_em >= current_date)
       AND (v_uid IS NULL
            OR public.is_system_admin_user(v_uid)
            OR p.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid)))
  LOOP
    v_planos := v_planos + 1;
    v_desde := GREATEST(COALESCE(v_plano.materializado_ate + 1, v_plano.inicio_em), current_date);

    BEGIN
      -- Ancorada no início do plano: quinzenal, trimestral, anual… contam a
      -- partir daí, e não do início da janela.
      FOR v_dia IN SELECT public.ops_expandir_rrule(v_plano.regra_recorrencia, v_desde, v_ate, v_plano.inicio_em)
      LOOP
        CONTINUE WHEN EXISTS (
          SELECT 1 FROM public.ops_ordem o
           WHERE o.plano_id = v_plano.id AND o.agendada_para::date = v_dia
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

        INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id, local_id, checklist_id, checklist_versao)
        SELECT v_ordem_id, pa.ativo_id, pa.local_id, pa.checklist_id, c.versao
          FROM public.ops_plano_alvo pa
          LEFT JOIN public.ops_checklist c ON c.id = pa.checklist_id
         WHERE pa.plano_id = v_plano.id;

        INSERT INTO public.ops_ordem_tarefa (
          ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome,
          tipo, skill_id, privada, obrigatoria, tempo_estimado
        )
        SELECT v_ordem_id, oa.id, ct.id, ct.posicao, ct.codigo, ct.nome,
               ct.tipo, ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
          FROM public.ops_ordem_alvo oa
          JOIN public.ops_checklist_tarefa ct ON ct.checklist_id = oa.checklist_id
         WHERE oa.ordem_id = v_ordem_id;

        -- As medições nascem com a ordem, vazias. Congeladas aqui, como a versão da
        -- checklist: mudar os limites amanhã não reescreve o veredicto de ontem.
        INSERT INTO public.ops_ordem_tarefa_medicao (
          ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
        SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
          FROM public.ops_ordem_tarefa ot
          JOIN public.ops_checklist_tarefa_medicao ctm
            ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
          JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
         WHERE ot.ordem_id = v_ordem_id
        ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;

        v_criadas := v_criadas + 1;
      END LOOP;

      UPDATE public.ops_plano SET materializado_ate = v_ate, atualizado_em = now()
       WHERE id = v_plano.id;

    EXCEPTION WHEN OTHERS THEN
      v_ignorados := v_ignorados || jsonb_build_object(
        'plano', v_plano.codigo, 'regra', v_plano.regra_recorrencia, 'erro', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'planos_vistos', v_planos, 'ordens_criadas', v_criadas,
    'materializado_ate', v_ate, 'ignorados', v_ignorados
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.rpc_ops_materializar_planos(uuid, integer) TO authenticated, service_role;


-- 3. Experimentar antes de gravar: âncora no início, datas de hoje em diante
CREATE OR REPLACE FUNCTION public.rpc_ops_experimentar_regra(
  p_regra   text,
  p_de      date DEFAULT NULL,
  p_quantas integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_de    date := COALESCE(p_de, CURRENT_DATE);
  v_datas date[];
BEGIN
  BEGIN
    SELECT array_agg(d ORDER BY d) INTO v_datas
      FROM (
        -- Ancorada no início do plano (p_de), mas só mostra de hoje em diante:
        -- num plano que começou há um ano, o que interessa são as próximas.
        SELECT d FROM public.ops_expandir_rrule(
                 p_regra, GREATEST(v_de, CURRENT_DATE), GREATEST(v_de, CURRENT_DATE) + 2200, v_de) d
         ORDER BY d LIMIT GREATEST(1, LEAST(COALESCE(p_quantas, 6), 24))
      ) x;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'datas', COALESCE(to_jsonb(v_datas), '[]'::jsonb)
  );
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_experimentar_regra(text, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_experimentar_regra(text, date, integer)
  TO authenticated, service_role;

COMMIT;


-- Verificação: um trimestral começado a 1/9, visto a partir de 15/10, e um anual.
SELECT
  (SELECT string_agg(d::text, ', ' ORDER BY d) FROM public.ops_expandir_rrule(
     'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1', '2026-10-15', '2027-06-30', '2026-09-01') d)
    AS trimestral_esperado_2026_12_01_e_2027_03_01_e_2027_06_01,
  (SELECT count(*) FROM public.ops_expandir_rrule('FREQ=YEARLY', '2026-09-02', '2027-08-31', '2026-09-01'))
    AS anual_esperado_0;

-- Só leitura: os planos de calendário cujo ritmo depende desta correção
-- (com INTERVAL ou anuais). Os de ritmo simples (semanal, mensal) não mudam.
SELECT codigo, nome, estado, regra_recorrencia, inicio_em, materializado_ate
  FROM public.ops_plano
 WHERE tipo_recorrencia = 'calendario'
   AND (regra_recorrencia ILIKE '%INTERVAL=%' OR regra_recorrencia ILIKE '%FREQ=YEARLY%')
 ORDER BY codigo;
