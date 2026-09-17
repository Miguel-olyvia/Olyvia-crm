-- ==============================================================================
-- Dados de teste para 1-9 de Agosto de 2026, na organizacao nike -- um
-- exemplo por cada coisa que o relatorio mensal de assiduidade hoje detecta,
-- para o utilizador poder ver cada caso a funcionar na app real.
--
-- Janela livre confirmada ao vivo: 1-9 de Agosto nao tem NENHUMA picagem nem
-- realizado para nenhuma pessoa da nike (10-31 ja tem dados reais/anteriores).
-- Nenhum feriado existia em Agosto para a nike -- esta migracao cria um, de
-- proposito, so para o exemplo de "feriado trabalhado".
--
-- INSERT DIRECTO, DE PROPOSITO -- mesmo padrao ja usado em 20261201110000
-- (picagens de Setembro): pessoas_picagens e pessoas_faltas tem RESTRICTIVE
-- USING(false) para authenticated (confirmado nas duas migracoes de origem),
-- mas uma migracao corre como o dono da base via `supabase db push`, nao
-- como authenticated -- por isso o INSERT directo passa, sem RPC nem
-- simulacao de identidade. E dado de demonstracao, nao um pedido de
-- utilizador real.
--
--
-- -- OS OITO EXEMPLOS -------------------------------------------------------------
--
-- 2026-08-01 sab -- feriado de teste (novo) + Tiago Ferreira pica -> "feriado trabalhado"
-- 2026-08-02 dom -- Sofia Antunes pica sem ter horario esse dia -> "descanso trabalhado"
-- 2026-08-03 seg -- Dulce Ramos so pica o 1o dos 2 blocos planeados -> "sem_registo" parcial
-- 2026-08-04 ter -- Helena Marques nao pica nada, dia planeado -> "sem_registo" completo
-- 2026-08-05 qua -- Sofia Antunes pica 8h num turno de 4h -> "horas extra" (dia)
-- 2026-08-06 qui -- Tiago Ferreira pica ate as 23h num turno das 6-14h -> "horas extra" + "horas extra noturnas"
-- 2026-08-06 qui -- Carla Pinheiro tem falta COMPLETA registada, zero picagem -> "faltas completas"
-- 2026-08-08 sab -- Carla Pinheiro pica so parte do dia + falta INCOMPLETA registada a cobrir o resto -> "faltas incompletas"
--
--
-- Prerequisitos:
--   20261120150000  pessoas_horario_planeado
--   20261121160000  pessoas_picagens
--   20261121190000  hr_picagens_consolidar
--   20261121200000  pessoas_faltas
--   20260615130000  schedule_holidays
-- ==============================================================================

DO $$
DECLARE
  v_org_nike CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';

  v_helena  CONSTANT uuid := 'cbb69ed6-b6c2-41d3-960a-03fc8d5abb79'; -- NK-0001
  v_carla   CONSTANT uuid := 'cc4372f9-0314-4260-a0fa-22e8acbec5b0'; -- NK-0003
  v_tiago   CONSTANT uuid := '900ee436-9a7d-4a72-9d55-4ffac4ae8f83'; -- NK-0004
  v_sofia   CONSTANT uuid := 'd3f51823-6b9c-4f7a-83e4-fd6c983468e4'; -- NK-0005
  v_dulce   CONSTANT uuid := '34bf2fd7-c60c-4ea9-9ccd-2b3c519ee994'; -- NK-0006

  v_criado_por uuid;
  v_n integer;
  v_picagens_count integer := 0;

  -- Resolvidos por pessoa+dia a partir do proprio horario planeado, para nao
  -- inventar local_id/vinculo_id -- mesma tecnica da migracao de Setembro.
  v_local_id uuid;
  v_vinculo_id uuid;
  v_planeado_id uuid;
  v_mom_in timestamptz;
  v_mom_out timestamptz;

  -- Lista de picagens a criar: pessoa, dia, entrada, saida. Um DO block nao
  -- pode declarar uma PROCEDURE/FUNCTION propria -- por isso a logica de
  -- picar+consolidar corre uma vez por linha desta tabela, num loop, em vez
  -- de numa sub-rotina chamavel.
  v_picagem RECORD;
BEGIN
  -- ---- Guardas ---------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE EXCEPTION 'Organizacao nike (%) nao existe.', v_org_nike;
  END IF;

  SELECT count(*) INTO v_n
    FROM (VALUES (v_helena), (v_carla), (v_tiago), (v_sofia), (v_dulce)) AS pessoas(id)
   WHERE EXISTS (SELECT 1 FROM public.pessoas p WHERE p.id = pessoas.id AND p.organization_id = v_org_nike);
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'Esperavam-se as 5 pessoas de teste na nike, encontraram-se %. Confirmar os ids antes de aplicar.', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_picagens_consolidar' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'hr_picagens_consolidar(uuid,uuid,date) nao existe. Aplicar 20261121190000 primeiro.';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_picagens
   WHERE organization_id = v_org_nike
     AND pessoa_id IN (v_helena, v_carla, v_tiago, v_sofia, v_dulce)
     AND data_local BETWEEN '2026-08-01' AND '2026-08-09';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ja existem % picagens entre 1-9 de Agosto para estas pessoas -- a janela deixou de estar livre, investigar antes de aplicar.', v_n;
  END IF;

  SELECT au.id INTO v_criado_por
    FROM public.anew_memberships am
    JOIN public.anew_users au ON au.id = am.user_id
   WHERE am.organization_id = v_org_nike AND am.status = 'active'
   LIMIT 1;

  -- ---- 1 Ago: feriado de teste + Tiago trabalha nele --------------------------
  INSERT INTO public.schedule_holidays (country_code, organization_id, name, holiday_date, is_recurring, is_custom, created_by)
  VALUES ('PT', v_org_nike, 'Feriado de teste (demo RH)', '2026-08-01', false, true, v_criado_por);

  -- ---- As picagens dos 5 exemplos, num loop -----------------------------------
  -- (2 Ago Sofia sem horario, 3 Ago Dulce so 1 dos 2 blocos, 5 Ago Sofia com
  -- horas extra de dia, 6 Ago Tiago com horas extra a atravessar a noite, e
  -- 8 Ago Carla so parte do dia -- a falta que cobre o resto entra a seguir).
  FOR v_picagem IN
    SELECT * FROM (VALUES
      (v_tiago, '2026-08-01'::date, '09:00'::time, '13:00'::time),
      (v_sofia, '2026-08-02'::date, '09:00'::time, '13:00'::time),
      (v_dulce, '2026-08-03'::date, '06:00'::time, '08:00'::time),
      (v_sofia, '2026-08-05'::date, '09:00'::time, '17:00'::time),
      (v_tiago, '2026-08-06'::date, '06:00'::time, '23:00'::time),
      (v_carla, '2026-08-08'::date, '10:00'::time, '17:00'::time)
    ) AS t(pessoa_id, data, hora_entrada, hora_saida)
  LOOP
    SELECT hp.local_id, hp.vinculo_id, hp.id
      INTO v_local_id, v_vinculo_id, v_planeado_id
      FROM public.pessoas_horario_planeado hp
     WHERE hp.pessoa_id = v_picagem.pessoa_id
       AND hp.organization_id = v_org_nike
       AND hp.dia_semana = EXTRACT(dow FROM v_picagem.data)::smallint
       AND hp.data IS NULL
       AND hp.nao_trabalha = false
     ORDER BY hp.ordem
     LIMIT 1;
    -- Sem horario planeado nesse dia (ex. feriado/descanso a proposito) --
    -- fica sem local/vinculo/planeado associados, tal como uma picagem real
    -- fora do horario ficaria.

    v_mom_in := (v_picagem.data::text || ' ' || v_picagem.hora_entrada::text)::timestamp AT TIME ZONE 'Europe/Lisbon';
    v_mom_out := (v_picagem.data::text || ' ' || v_picagem.hora_saida::text)::timestamp AT TIME ZONE 'Europe/Lisbon';

    INSERT INTO public.pessoas_picagens (
      pessoa_id, organization_id, momento, data_local, hora_local,
      sentido, local_id, vinculo_id, planeado_id, origem, estado
    ) VALUES (
      v_picagem.pessoa_id, v_org_nike, v_mom_in, v_picagem.data, v_picagem.hora_entrada,
      'entrada', v_local_id, v_vinculo_id, v_planeado_id, 'importacao', 'valida'
    )
    ON CONFLICT (pessoa_id, momento, sentido) WHERE estado = 'valida' DO NOTHING;

    INSERT INTO public.pessoas_picagens (
      pessoa_id, organization_id, momento, data_local, hora_local,
      sentido, local_id, vinculo_id, planeado_id, origem, estado
    ) VALUES (
      v_picagem.pessoa_id, v_org_nike, v_mom_out, v_picagem.data, v_picagem.hora_saida,
      'saida', v_local_id, v_vinculo_id, v_planeado_id, 'importacao', 'valida'
    )
    ON CONFLICT (pessoa_id, momento, sentido) WHERE estado = 'valida' DO NOTHING;

    PERFORM public.hr_picagens_consolidar(v_picagem.pessoa_id, v_org_nike, v_picagem.data);

    v_picagens_count := v_picagens_count + 2;
  END LOOP;

  -- 4 Ago Helena: sem INSERT nenhum -- zero picagem num dia planeado e
  -- exactamente o ponto do exemplo "sem_registo completo".

  -- ---- 6 Ago: Carla tem falta COMPLETA registada (10:00-19:00), zero picagem -
  INSERT INTO public.pessoas_faltas (
    pessoa_id, organization_id, data, hora_inicio, hora_fim,
    motivo_codigo, justificacao_estado, remunerada, desconta_saldo, created_by
  ) VALUES (
    v_carla, v_org_nike, '2026-08-06', '10:00', '19:00',
    'ausencia_nao_comunicada', 'sem_justificacao', false, true, v_criado_por
  );

  -- ---- 8 Ago: Carla pica so parte do dia (ja no loop acima) + falta
  -- INCOMPLETA a cobrir o resto ------------------------------------------------
  -- "justificada" exige decisor+data (pessoas_faltas_decisao_coerente).
  INSERT INTO public.pessoas_faltas (
    pessoa_id, organization_id, data, hora_inicio, hora_fim,
    motivo_codigo, justificacao_estado, remunerada, desconta_saldo,
    justificacao_decidida_por, justificacao_decidida_em, created_by
  ) VALUES (
    v_carla, v_org_nike, '2026-08-08', '17:00', '19:00',
    'saida_antecipada', 'justificada', true, false,
    v_criado_por, now(), v_criado_por
  );

  RAISE NOTICE 'Dados de demonstracao gerados na nike, 1-9 de Agosto de 2026: % picagens (entradas+saidas), 1 feriado novo, 2 faltas registadas (1 completa, 1 incompleta).', v_picagens_count;
END $$;
