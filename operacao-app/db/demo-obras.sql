-- =============================================================================
-- Operações — Obras: dados de demonstração (para a apresentação de 7/10)
--
-- Cria UMA obra "OB-DEMO-001 — Remodelação WC", a partir do modelo de exemplo
-- "Remodelação casa de banho" (semeado aqui, se ainda não existir), com:
--   · a fase 1 feita (3 tarefas validadas, 1 à espera de validação, uma delas
--     com desvio justificado);
--   · a canalização em curso, com o relógio a correr e já a 80 % do previsto
--     (aparece o alerta);
--   · uma precedência ("regularização" só depois do ensaio de pressão);
--   · um trabalho extra registado ("tubagem podre").
--
-- Escreve EXCLUSIVAMENTE em tabelas `ops_*`. Usa um cliente e as pessoas que
-- já têm perfil em Operações nessa organização — não inventa ninguém.
-- Idempotente: se OB-DEMO-001 já existir, não faz nada.
-- Remove-se com db/demo-obras-remover.sql (o modelo fica, para se usar).
--
-- Correr DEPOIS de: obras.sql e pos-instalacao.sql (precisa de um perfil).
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _ctx_obra ON COMMIT DROP AS
SELECT c.organization_id AS org_id, c.id AS cliente_id
  FROM public.anew_clients c
 WHERE c.deleted_at IS NULL
   -- Se dados-de-teste.sql escolheu a organização (ops.demo_org), é essa.
   AND (nullif(current_setting('ops.demo_org', true), '') IS NULL
        OR c.organization_id = nullif(current_setting('ops.demo_org', true), '')::uuid)
 ORDER BY c.created_at NULLS LAST, c.id
 LIMIT 1;

DO $demo$
DECLARE
  v_org    uuid;
  v_cli    uuid;
  v_gestor uuid;
  v_exec   uuid;
  v_sup    uuid;
  v_modelo uuid;
  v_obra   uuid;
  v_inicio date;
  v_cursor timestamptz;
  v_fim    timestamptz;
  v_fator  numeric;
  t        record;
BEGIN
  SELECT org_id, cliente_id INTO v_org, v_cli FROM _ctx_obra;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não há nenhum cliente no CRM. A demo não inventa clientes.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ops_obra WHERE organization_id = v_org AND codigo = 'OB-DEMO-001') THEN
    RAISE NOTICE 'OB-DEMO-001 já existe. Nada a fazer.';
    RETURN;
  END IF;

  SELECT utilizador_id INTO v_gestor FROM public.ops_utilizador_perfil
   WHERE organization_id = v_org AND ativo AND funcao IN ('admin','gestor')
   ORDER BY (funcao = 'gestor') DESC, criado_em LIMIT 1;
  IF v_gestor IS NULL THEN
    RAISE EXCEPTION 'Ninguém tem perfil de gestor ou admin em Operações nesta organização. Corre pos-instalacao.sql primeiro.';
  END IF;

  SELECT utilizador_id INTO v_exec FROM public.ops_utilizador_perfil
   WHERE organization_id = v_org AND ativo AND funcao IN ('tecnico','operador')
   ORDER BY criado_em LIMIT 1;
  v_exec := COALESCE(v_exec, v_gestor);

  SELECT utilizador_id INTO v_sup FROM public.ops_utilizador_perfil
   WHERE organization_id = v_org AND ativo AND funcao = 'supervisor'
   ORDER BY criado_em LIMIT 1;

  v_modelo := public.ops_obra_semear_exemplo_impl(v_org);

  -- Começou há uns dias úteis, para o Gantt ter passado, hoje e futuro.
  v_inicio := public.ops_obra_somar_dias_uteis(current_date - 4, 0);

  v_obra := (public.ops_obra_criar_impl(
    v_org, v_gestor, 'DEMO — Remodelação WC (Rua X, 12)', v_cli, v_modelo, v_inicio,
    NULL, NULL, 'Rua X, 12, 3.º E, Sintra', v_gestor, v_sup) ->> 'id')::uuid;

  UPDATE public.ops_obra
     SET codigo = 'OB-DEMO-001', estado = 'em_curso',
         iniciada_em = v_inicio + time '08:30'
   WHERE id = v_obra;

  INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
  SELECT id, v_exec, v_org, v_obra FROM public.ops_obra_tarefa WHERE obra_id = v_obra
  ON CONFLICT DO NOTHING;

  -- Fase 1, feita. O real é o previsto × um fator; a demolição derrapou.
  v_cursor := v_inicio + time '08:30';
  FOR t IN
    SELECT tt.id, tt.ordem, tt.minutos_previstos
      FROM public.ops_obra_tarefa tt JOIN public.ops_obra_fase f ON f.id = tt.fase_id
     WHERE tt.obra_id = v_obra AND f.ordem = 1 ORDER BY tt.ordem
  LOOP
    v_fator := CASE t.ordem WHEN 1 THEN 0.9 WHEN 2 THEN 1.05 WHEN 3 THEN 1.45 ELSE 0.95 END;
    v_fim := v_cursor + make_interval(mins => round(t.minutos_previstos * v_fator)::integer);

    INSERT INTO public.ops_obra_registo (organization_id, obra_id, tarefa_id, utilizador_id, inicio, fim)
    VALUES (v_org, v_obra, t.id, v_exec, v_cursor, v_fim);

    UPDATE public.ops_obra_tarefa
       SET estado = CASE WHEN t.ordem < 4 THEN 'validada' ELSE 'feita' END,
           iniciada_em = v_cursor, terminada_em = v_fim,
           motivo_desvio = CASE WHEN t.ordem = 3 THEN 'trabalho_imprevisto' END,
           nota_desvio = CASE WHEN t.ordem = 3 THEN 'Azulejo antigo assente em argamassa de cimento, muito mais lento de picar.' END,
           validada_por = CASE WHEN t.ordem < 4 THEN COALESCE(v_sup, v_gestor) END,
           validada_em = CASE WHEN t.ordem < 4 THEN v_fim + interval '1 hour' END
     WHERE id = t.id;

    v_cursor := v_fim + interval '10 minutes';
  END LOOP;

  -- Fase 2, tarefa 1 (canalização): a correr há 5 h de 6 previstas → alerta.
  SELECT tt.id INTO t FROM public.ops_obra_tarefa tt JOIN public.ops_obra_fase f ON f.id = tt.fase_id
   WHERE tt.obra_id = v_obra AND f.ordem = 2 AND tt.ordem = 1;
  INSERT INTO public.ops_obra_registo (organization_id, obra_id, tarefa_id, utilizador_id, inicio)
  VALUES (v_org, v_obra, t.id, v_exec, now() - interval '300 minutes')
  ON CONFLICT DO NOTHING;
  UPDATE public.ops_obra_tarefa
     SET estado = 'em_curso', iniciada_em = now() - interval '300 minutes'
   WHERE id = t.id;

  -- Precedência: não se regulariza antes do ensaio de pressão.
  UPDATE public.ops_obra_tarefa x
     SET depende_de = (SELECT tt.id FROM public.ops_obra_tarefa tt
                         JOIN public.ops_obra_fase f ON f.id = tt.fase_id
                        WHERE tt.obra_id = v_obra AND f.ordem = 2 AND tt.ordem = 4)
    FROM public.ops_obra_fase f
   WHERE f.id = x.fase_id AND x.obra_id = v_obra AND f.ordem = 3 AND x.ordem = 1;

  -- O imprevisto descoberto ao picar.
  INSERT INTO public.ops_obra_extra
    (organization_id, obra_id, tarefa_id, descricao, valor_estimado, registado_por)
  SELECT v_org, v_obra, tt.id,
         'Tubagem de ferro galvanizado podre atrás do lavatório — substituir cerca de 3 m até à prumada.',
         180.00, v_exec
    FROM public.ops_obra_tarefa tt JOIN public.ops_obra_fase f ON f.id = tt.fase_id
   WHERE tt.obra_id = v_obra AND f.ordem = 1 AND tt.ordem = 3;

  RAISE NOTICE 'Demo de obras criada: OB-DEMO-001, a começar a %.', v_inicio;
END
$demo$;

COMMIT;
