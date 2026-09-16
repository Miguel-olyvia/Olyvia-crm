-- ==============================================================================
-- Mais dados de teste em Agosto de 2026, na organizacao nike, para o "Mapa do
-- mes" (dentro de Assiduidade e Ausencias) mostrar exemplos variados para
-- Dulce Ramos, Helena Marques, Nuno Baptista, Rui Nogueira e Sofia Antunes --
-- de propositos, so parte dos dias fica preenchida, o resto continua vazio.
--
-- O "Mapa do mes" le pessoas_horario_realizado (o mesmo que o resto do
-- modulo de assiduidade) -- nao ha tabela nem logica propria. Por isso este
-- ficheiro so insere picagens (mesmo mecanismo ja usado em 20261201110000 e
-- 20261201140000: INSERT directo + hr_picagens_consolidar) e, para variar,
-- um par de faltas registadas. Nada de novo a inventar.
--
-- Confirmado ao vivo (leitura autenticada, so select): Helena, Nuno e Rui nao
-- tinham NENHUMA picagem em Agosto 2026 -- o mes inteiro estava livre para
-- os tres. Dulce e Sofia ja tinham a maior parte do mes preenchido (dados
-- anteriores a esta sessao); os dias usados aqui sao dos que ainda estavam
-- livres para cada uma.
--
--
-- -- OS EXEMPLOS -------------------------------------------------------------
--
-- Helena Marques  -- 10 Ago (seg, dia com horario) picagem normal
--                 -- 11 Ago (ter, dia com horario) falta registada, zero picagem
--                 -- 15 Ago (sab, sem horario nenhum) picagem fora do horario
-- Nuno Baptista   -- 12 Ago (qua) picagem
--                 -- 16 Ago (dom) picagem fora do horario habitual
-- Rui Nogueira    -- 13 Ago (qui) picagem
--                 -- 14 Ago (sex) falta registada, zero picagem
--                 -- 22 Ago (sab) picagem fora do horario habitual
-- Dulce Ramos     -- 1 Ago (sab, sem horario nesse dia) picagem fora do horario
--                 -- 4 Ago (ter, dia com horario) falta registada, zero picagem
-- Sofia Antunes   -- 1 Ago (sab, sem horario nesse dia) picagem fora do horario
--                 -- 3 Ago (seg, dia com horario) picagem normal
--
--
-- Prerequisitos:
--   20261120150000  pessoas_horario_planeado
--   20261121160000  pessoas_picagens
--   20261121190000  hr_picagens_consolidar
--   20261121200000  pessoas_faltas
-- ==============================================================================

DO $$
DECLARE
  v_org_nike CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';

  v_helena  CONSTANT uuid := 'cbb69ed6-b6c2-41d3-960a-03fc8d5abb79';
  v_nuno    CONSTANT uuid := 'a9b79c79-d0c8-4369-bc9e-11283edac08c';
  v_rui     CONSTANT uuid := '3a37e740-4e44-4d8f-bd43-497f5c130a6d';
  v_dulce   CONSTANT uuid := '34bf2fd7-c60c-4ea9-9ccd-2b3c519ee994';
  v_sofia   CONSTANT uuid := 'd3f51823-6b9c-4f7a-83e4-fd6c983468e4';

  v_criado_por uuid;
  v_n integer;

  v_local_id uuid;
  v_vinculo_id uuid;
  v_planeado_id uuid;
  v_mom_in timestamptz;
  v_mom_out timestamptz;
  v_picagem RECORD;
BEGIN
  -- ---- Guardas ---------------------------------------------------------------
  SELECT count(*) INTO v_n
    FROM (VALUES (v_helena), (v_nuno), (v_rui), (v_dulce), (v_sofia)) AS pessoas(id)
   WHERE EXISTS (SELECT 1 FROM public.pessoas p WHERE p.id = pessoas.id AND p.organization_id = v_org_nike);
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'Esperavam-se as 5 pessoas de teste na nike, encontraram-se %.', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_picagens
   WHERE organization_id = v_org_nike
     AND (
       (pessoa_id = v_helena AND data_local IN ('2026-08-10', '2026-08-11', '2026-08-15'))
       OR (pessoa_id = v_nuno AND data_local IN ('2026-08-12', '2026-08-16'))
       OR (pessoa_id = v_rui AND data_local IN ('2026-08-13', '2026-08-14', '2026-08-22'))
       OR (pessoa_id = v_dulce AND data_local IN ('2026-08-01', '2026-08-04'))
       OR (pessoa_id = v_sofia AND data_local IN ('2026-08-01', '2026-08-03'))
     );
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ja existem % picagens nos dias escolhidos -- deixaram de estar livres, investigar antes de aplicar.', v_n;
  END IF;

  SELECT au.id INTO v_criado_por
    FROM public.anew_memberships am
    JOIN public.anew_users au ON au.id = am.user_id
   WHERE am.organization_id = v_org_nike AND am.status = 'active'
   LIMIT 1;

  -- ---- Picagens, num loop -----------------------------------------------------
  FOR v_picagem IN
    SELECT * FROM (VALUES
      (v_helena, '2026-08-10'::date, '09:00'::time, '18:00'::time),
      (v_helena, '2026-08-15'::date, '10:00'::time, '14:00'::time),
      (v_nuno,   '2026-08-12'::date, '09:00'::time, '13:00'::time),
      (v_nuno,   '2026-08-16'::date, '10:00'::time, '14:00'::time),
      (v_rui,    '2026-08-13'::date, '09:00'::time, '13:00'::time),
      (v_rui,    '2026-08-22'::date, '10:00'::time, '14:00'::time),
      (v_dulce,  '2026-08-01'::date, '10:00'::time, '14:00'::time),
      (v_sofia,  '2026-08-01'::date, '10:00'::time, '14:00'::time),
      (v_sofia,  '2026-08-03'::date, '09:00'::time, '13:00'::time)
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
    -- Sem horario planeado nesse dia (fim-de-semana para a maioria destas
    -- pessoas) -- fica sem local/vinculo/planeado, tal como uma picagem
    -- real fora do horario ficaria.

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
  END LOOP;

  -- ---- Faltas registadas (zero picagem nesses dias) ---------------------------
  INSERT INTO public.pessoas_faltas (
    pessoa_id, organization_id, data, hora_inicio, hora_fim,
    motivo_codigo, justificacao_estado, remunerada, desconta_saldo, created_by
  ) VALUES
    (v_helena, v_org_nike, '2026-08-11', '09:00', '18:00',
     'doenca', 'sem_justificacao', false, true, v_criado_por),
    (v_rui, v_org_nike, '2026-08-14', '09:00', '13:00',
     'assuntos_pessoais', 'sem_justificacao', false, true, v_criado_por),
    (v_dulce, v_org_nike, '2026-08-04', '06:00', '08:00',
     'atraso', 'sem_justificacao', false, true, v_criado_por);

  RAISE NOTICE 'Mapa do mes de Agosto: exemplos variados gerados para Helena, Nuno, Rui, Dulce e Sofia. O resto do mes continua sem alteracao.';
END $$;
