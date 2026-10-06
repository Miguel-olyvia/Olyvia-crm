-- =============================================================================
-- Operações — Obras: dados de TESTE (mais volume do que demo-obras.sql)
--
-- Cria dois modelos a mais e cinco obras, uma em cada situação, para se poder
-- testar todos os ecrãs com histórico verdadeiro:
--
--   OB-DEMO-002  Cozinha T3 Benfica           concluída, tudo validado
--   OB-DEMO-003  Pintura escritório Alvalade  concluída — as demãos derrapam
--                                             sempre (o default está errado)
--   OB-DEMO-004  Cozinha moradia Cascais      em curso: tarefas por validar,
--                                             uma rejeitada, extras pendentes
--   OB-DEMO-005  WC suite Oeiras              planeada, começa daqui a 5 dias
--   OB-DEMO-006  Pintura fachada Almada       suspensa, extra recusado
--
-- As pessoas são as que JÁ têm perfil em Operações na organização — não se
-- inventa ninguém. Cada pessoa tem o seu ritmo (uma mais rápida, outra mais
-- lenta), para as Métricas mostrarem diferenças. Quanto mais perfis houver,
-- mais rico fica.
--
-- Organização: a de `ops.demo_org` (ver dados-de-teste.sql, que a escolhe),
-- ou, sem isso, a do primeiro cliente — como os outros ficheiros de demo.
--
-- Escreve EXCLUSIVAMENTE em tabelas `ops_*`. Idempotente: se OB-DEMO-002 já
-- existir na organização, não faz nada. Remove-se com demo-obras-remover.sql.
--
-- Correr DEPOIS de: obras.sql e demo-obras.sql.
-- =============================================================================

BEGIN;

-- ── Peças só desta sessão ────────────────────────────────────────────────

-- Um modelo a partir de JSON: [{"nome": fase, "tarefas": [[nome, minutos,
-- procedimento, materiais, ferramentas], …]}, …]. Se já existe, devolve-o.
CREATE OR REPLACE FUNCTION pg_temp.demo_modelo(_org uuid, _nome text, _descricao text, _fases jsonb)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_modelo uuid;
  v_fase   uuid;
  f        record;
  t        record;
BEGIN
  SELECT id INTO v_modelo FROM public.ops_obra_modelo WHERE organization_id = _org AND nome = _nome;
  IF v_modelo IS NOT NULL THEN RETURN v_modelo; END IF;

  INSERT INTO public.ops_obra_modelo (organization_id, nome, descricao, tipo_servico)
  VALUES (_org, _nome, _descricao, 'remodelacao') RETURNING id INTO v_modelo;

  FOR f IN SELECT value AS fase, ordinality AS ordem FROM jsonb_array_elements(_fases) WITH ORDINALITY LOOP
    INSERT INTO public.ops_obra_modelo_fase (organization_id, modelo_id, ordem, nome)
    VALUES (_org, v_modelo, f.ordem, f.fase ->> 'nome') RETURNING id INTO v_fase;

    FOR t IN SELECT value AS x, ordinality AS ordem FROM jsonb_array_elements(f.fase -> 'tarefas') WITH ORDINALITY LOOP
      INSERT INTO public.ops_obra_modelo_tarefa
        (organization_id, modelo_id, modelo_fase_id, ordem, nome, minutos_previstos, procedimento, materiais, ferramentas)
      VALUES (_org, v_modelo, v_fase, t.ordem, t.x ->> 0, (t.x ->> 1)::integer, t.x ->> 2, t.x ->> 3, t.x ->> 4);
    END LOOP;
  END LOOP;
  RETURN v_modelo;
END
$$;

-- Executa as tarefas das fases `_de_fase`…`_ate_fase` de uma obra, por ordem
-- de fase e tarefa, a partir de `_desde` (NULL = início previsto da obra).
-- Devolve quando acabou, para a chamada seguinte continuar dali. Cada tarefa leva um registo de tempo da pessoa
-- que lá está; o real é o previsto × ritmo da pessoa × dificuldade da tarefa.
-- Acima da tolerância fica com o motivo do desvio, como a app exige.
CREATE OR REPLACE FUNCTION pg_temp.demo_executar(
  _obra uuid, _de_fase integer, _ate_fase integer, _validar boolean, _validador uuid,
  _pessoas uuid[], _desde timestamptz DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql AS $$
DECLARE
  o        record;
  t        record;
  v_cursor timestamptz;
  v_fim    timestamptz;
  v_quem   uuid;
  v_fator  numeric;
  v_min    integer;
  v_motivo text;
BEGIN
  SELECT * INTO o FROM public.ops_obra WHERE id = _obra;
  v_cursor := COALESCE(_desde + interval '15 minutes', o.data_inicio_prevista + time '08:30');

  FOR t IN
    SELECT tt.*, f.ordem AS fase_ordem
      FROM public.ops_obra_tarefa tt JOIN public.ops_obra_fase f ON f.id = tt.fase_id
     WHERE tt.obra_id = _obra AND f.ordem BETWEEN _de_fase AND _ate_fase
     ORDER BY f.ordem, tt.ordem
  LOOP
    SELECT utilizador_id INTO v_quem FROM public.ops_obra_tarefa_pessoa WHERE tarefa_id = t.id LIMIT 1;

    -- Ritmo da pessoa: a 1.ª é a mais rápida, cada uma a seguir 25 % mais lenta.
    v_fator := 0.8 + 0.25 * (COALESCE(array_position(_pessoas, v_quem), 1) - 1);
    -- Dificuldade: demãos e secagens derrapam sempre — é o default que está errado.
    IF t.nome ILIKE '%demão%' OR t.nome ILIKE '%secagem%' THEN v_fator := v_fator * 1.35;
    ELSE v_fator := v_fator * (ARRAY[0.95, 1.05, 1.0, 1.12, 0.9])[t.ordem % 5 + 1];
    END IF;
    v_min := GREATEST(5, round(t.minutos_previstos * v_fator)::integer);

    -- Dia de trabalho das 08:30 às 17:30; o que não cabe passa para o dia útil seguinte.
    IF v_cursor::time > time '17:30' THEN
      v_cursor := public.ops_obra_somar_dias_uteis(v_cursor::date, 1) + time '08:30';
    END IF;
    v_fim := v_cursor + make_interval(mins => v_min);

    v_motivo := NULL;
    IF v_min > t.minutos_previstos * (1 + o.tolerancia_percent / 100.0) THEN
      v_motivo := CASE
        WHEN t.nome ILIKE '%demão%' OR t.nome ILIKE '%secagem%' THEN 'secagem'
        WHEN t.fase_ordem = 1 THEN 'condicoes_edificio'
        WHEN t.ordem % 2 = 0 THEN 'material_em_falta'
        ELSE 'trabalho_imprevisto' END;
    END IF;

    INSERT INTO public.ops_obra_registo (organization_id, obra_id, tarefa_id, utilizador_id, inicio, fim)
    VALUES (o.organization_id, _obra, t.id, v_quem, v_cursor, v_fim);

    UPDATE public.ops_obra_tarefa
       SET estado = CASE WHEN _validar THEN 'validada' ELSE 'feita' END,
           iniciada_em = v_cursor, terminada_em = v_fim,
           motivo_desvio = v_motivo,
           nota_desvio = CASE v_motivo
             WHEN 'secagem' THEN 'Humidade alta: a demão anterior não secou no tempo previsto.'
             WHEN 'condicoes_edificio' THEN 'Paredes em pior estado do que o levantamento indicava.'
             WHEN 'material_em_falta' THEN 'Material chegou a meio da manhã.'
             WHEN 'trabalho_imprevisto' THEN 'Foi preciso refazer parte do suporte antes de continuar.'
           END,
           validada_por = CASE WHEN _validar THEN _validador END,
           validada_em = CASE WHEN _validar THEN v_fim + interval '2 hours' END
     WHERE id = t.id;

    v_cursor := v_fim + interval '15 minutes';
  END LOOP;
  RETURN v_fim;
END
$$;

-- Cria a obra pelo caminho normal (o mesmo da app), dá-lhe o código DEMO e
-- distribui as tarefas pelas pessoas, à vez.
CREATE OR REPLACE FUNCTION pg_temp.demo_obra(
  _org uuid, _gestor uuid, _sup uuid, _cli uuid, _codigo text, _titulo text,
  _modelo uuid, _inicio date, _morada text, _pessoas uuid[])
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_obra uuid;
BEGIN
  v_obra := (public.ops_obra_criar_impl(
    _org, _gestor, _titulo, _cli, _modelo, _inicio, NULL, NULL, _morada, _gestor, _sup) ->> 'id')::uuid;

  UPDATE public.ops_obra SET codigo = _codigo WHERE id = v_obra;

  INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
  SELECT x.id, _pessoas[(x.n % array_length(_pessoas, 1)) + 1], _org, v_obra
    FROM (SELECT tt.id, (row_number() OVER (ORDER BY f.ordem, tt.ordem) - 1)::integer AS n
            FROM public.ops_obra_tarefa tt JOIN public.ops_obra_fase f ON f.id = tt.fase_id
           WHERE tt.obra_id = v_obra) x
  ON CONFLICT DO NOTHING;
  RETURN v_obra;
END
$$;


-- ── Os dados ─────────────────────────────────────────────────────────────

DO $demo$
DECLARE
  v_org     uuid := nullif(current_setting('ops.demo_org', true), '')::uuid;
  v_cli     uuid;
  v_gestor  uuid;
  v_sup     uuid;
  v_val     uuid;
  v_pessoas uuid[];
  m_wc      uuid;
  m_cozinha uuid;
  m_pintura uuid;
  v_obra    uuid;
  v_fim     timestamptz;
  v_tarefa  uuid;
BEGIN
  SELECT c.organization_id, c.id INTO v_org, v_cli
    FROM public.anew_clients c
   WHERE c.deleted_at IS NULL AND (v_org IS NULL OR c.organization_id = v_org)
   ORDER BY c.created_at NULLS LAST, c.id
   LIMIT 1;
  IF v_cli IS NULL THEN
    RAISE EXCEPTION 'A organização escolhida não tem nenhum cliente no CRM. A demo não inventa clientes.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ops_obra WHERE organization_id = v_org AND codigo = 'OB-DEMO-002') THEN
    RAISE NOTICE 'Os dados de teste (OB-DEMO-002…006) já existem. Nada a fazer.';
    RETURN;
  END IF;

  SELECT utilizador_id INTO v_gestor FROM public.ops_utilizador_perfil
   WHERE organization_id = v_org AND ativo AND funcao IN ('admin','gestor')
   ORDER BY (funcao = 'gestor') DESC, criado_em LIMIT 1;
  IF v_gestor IS NULL THEN
    RAISE EXCEPTION 'Ninguém tem perfil de gestor ou admin em Operações nesta organização. Corre pos-instalacao.sql primeiro.';
  END IF;

  SELECT utilizador_id INTO v_sup FROM public.ops_utilizador_perfil
   WHERE organization_id = v_org AND ativo AND funcao = 'supervisor'
   ORDER BY criado_em LIMIT 1;
  v_val := COALESCE(v_sup, v_gestor);

  -- Quem executa: técnicos e operadores primeiro; se não houver, toda a gente.
  v_pessoas := ARRAY(
    SELECT utilizador_id FROM public.ops_utilizador_perfil
     WHERE organization_id = v_org AND ativo AND funcao IN ('tecnico','operador')
     ORDER BY criado_em, utilizador_id);
  IF cardinality(v_pessoas) = 0 THEN
    v_pessoas := ARRAY(
      SELECT utilizador_id FROM public.ops_utilizador_perfil
       WHERE organization_id = v_org AND ativo ORDER BY criado_em, utilizador_id);
  END IF;

  -- ── Modelos ──
  m_wc := public.ops_obra_semear_exemplo_impl(v_org);

  m_cozinha := pg_temp.demo_modelo(v_org, 'Remodelação cozinha (demo)',
    'Cozinha completa: demolição, redes, móveis e bancada.', $j$[
    {"nome": "Preparação e demolições", "tarefas": [
      ["Proteção de pavimentos e acessos", 60, "Cartão canelado e fita nos acessos até à cozinha.", "Cartão, fita, plástico", "X-ato"],
      ["Desmontagem de móveis antigos", 180, "Desligar água e gás antes de desmontar.", "Sacos de entulho", "Aparafusadora, pé de cabra"],
      ["Remoção de azulejo e reboco", 300, "Picar até ao tijolo onde o reboco estiver solto.", "Sacos de entulho", "Martelo demolidor"],
      ["Remoção de entulho", 120, "Cerca de 25 sacos de 20 kg.", "Sacos de entulho", "Carro de mão"]]},
    {"nome": "Instalações técnicas", "tarefas": [
      ["Rede de águas e esgotos", 360, "Multicamada 16/20; esgoto PVC 40/50.", "Tubo multicamada, PVC, acessórios", "Prensa, serra"],
      ["Circuitos elétricos da cozinha", 300, "Circuito dedicado para forno e placa.", "Cabo 2,5/6 mm², tubo VD", "Roçadeira, berbequim"],
      ["Ensaio de pressão e de isolamento", 60, "Água a 10 bar durante 30 min; megóhmetro.", "", "Bomba de ensaio, megóhmetro"]]},
    {"nome": "Acabamentos", "tarefas": [
      ["Reboco e regularização", 240, "Argamassa de regularização nas zonas picadas.", "Argamassa", "Talocha, régua"],
      ["Aplicação de revestimento cerâmico", 420, "Cola C2TE; juntas de 2 mm.", "Cerâmico, cola, betume", "Rebarbadora, talocha dentada"],
      ["Montagem de móveis e bancada", 480, "Nivelar a base antes da bancada.", "Móveis, bancada, silicone", "Nível laser, aparafusadora"]]},
    {"nome": "Limpeza e entrega", "tarefas": [
      ["Limpeza final", 120, "Pó de obra fora antes de ligar eletrodomésticos.", "Produtos de limpeza", "Aspirador de obra"],
      ["Vistoria com o cliente", 45, "Percorrer a lista de verificação e assinar.", "", ""]]}
  ]$j$::jsonb);

  m_pintura := pg_temp.demo_modelo(v_org, 'Pintura interior (demo)',
    'Pintura de paredes e tetos, com reparação de fissuras.', $j$[
    {"nome": "Preparação e demolições", "tarefas": [
      ["Proteção de móveis e pavimentos", 90, "Tudo coberto antes de lixar.", "Plástico, fita de pintor", ""],
      ["Reparação de fissuras", 150, "Abrir a fissura em V e encher com massa.", "Massa de reparação", "Espátula"]]},
    {"nome": "Instalações técnicas", "tarefas": [
      ["Desmontar tomadas e espelhos", 45, "Fotografar antes para voltar a montar igual.", "", "Chave de fendas"]]},
    {"nome": "Acabamentos", "tarefas": [
      ["Primário", 180, "Uma demão de primário nas zonas reparadas.", "Primário", "Rolo"],
      ["1.ª demão de tinta", 240, "Diluir 10 %.", "Tinta plástica", "Rolo, trincha"],
      ["2.ª demão de tinta", 240, "Só depois da 1.ª seca ao toque.", "Tinta plástica", "Rolo, trincha"]]},
    {"nome": "Limpeza e entrega", "tarefas": [
      ["Remontar tomadas e limpeza", 90, "Retirar fita antes de a tinta curar.", "", "Aspirador"]]}
  ]$j$::jsonb);

  -- ── OB-DEMO-002 · cozinha concluída, tudo validado ──
  v_obra := pg_temp.demo_obra(v_org, v_gestor, v_sup, v_cli, 'OB-DEMO-002', 'DEMO — Cozinha T3 Benfica',
    m_cozinha, current_date - 45, 'Av. Gomes Pereira, 40, 2.º Dto, Lisboa', v_pessoas);
  v_fim := pg_temp.demo_executar(v_obra, 1, 4, true, v_val, v_pessoas);
  UPDATE public.ops_obra
     SET estado = 'concluida', iniciada_em = data_inicio_prevista + time '08:30', concluida_em = v_fim
   WHERE id = v_obra;
  INSERT INTO public.ops_obra_extra
    (organization_id, obra_id, descricao, valor_estimado, estado, registado_por, registado_em, decidido_por, decidido_em, enviado_em)
  VALUES (v_org, v_obra, 'Tomada extra para a ilha, pedida pelo cliente durante a obra.', 85.00, 'enviado',
          v_pessoas[1], v_fim - interval '6 days', v_gestor, v_fim - interval '5 days', v_fim - interval '5 days');

  -- ── OB-DEMO-003 · pintura concluída; as demãos derrapam sempre ──
  v_obra := pg_temp.demo_obra(v_org, v_gestor, v_sup, v_cli, 'OB-DEMO-003', 'DEMO — Pintura escritório Alvalade',
    m_pintura, current_date - 25, 'Rua Marquesa de Alorna, 12, Lisboa', v_pessoas);
  v_fim := pg_temp.demo_executar(v_obra, 1, 4, true, v_val, v_pessoas);
  UPDATE public.ops_obra
     SET estado = 'concluida', iniciada_em = data_inicio_prevista + time '08:30', concluida_em = v_fim
   WHERE id = v_obra;

  -- ── OB-DEMO-004 · cozinha em curso ──
  v_obra := pg_temp.demo_obra(v_org, v_gestor, v_sup, v_cli, 'OB-DEMO-004', 'DEMO — Cozinha moradia Cascais',
    m_cozinha, current_date - 8, 'Rua das Flores, 7, Cascais', v_pessoas);
  v_fim := pg_temp.demo_executar(v_obra, 1, 1, true, v_val, v_pessoas);          -- fase 1 validada
  PERFORM pg_temp.demo_executar(v_obra, 2, 2, false, NULL, v_pessoas, v_fim);     -- fase 2 por validar
  -- O ensaio de pressão foi rejeitado pelo supervisor: volta à equipa.
  SELECT tt.id INTO v_tarefa FROM public.ops_obra_tarefa tt JOIN public.ops_obra_fase f ON f.id = tt.fase_id
   WHERE tt.obra_id = v_obra AND f.ordem = 2 AND tt.ordem = 3;
  UPDATE public.ops_obra_tarefa
     SET estado = 'rejeitada', rejeitada_em = terminada_em + interval '3 hours',
         motivo_rejeicao = 'O manómetro desceu 0,4 bar em 30 min. Procurar a fuga e repetir o ensaio.'
   WHERE id = v_tarefa;
  UPDATE public.ops_obra SET estado = 'em_curso', iniciada_em = data_inicio_prevista + time '08:30' WHERE id = v_obra;
  INSERT INTO public.ops_obra_extra (organization_id, obra_id, tarefa_id, descricao, valor_estimado, estado, registado_por, decidido_por, decidido_em)
  SELECT v_org, v_obra, tt.id, 'Parede da janela com humidade: aplicar membrana antes do cerâmico.', 240.00, 'aprovado',
         v_pessoas[1], v_gestor, now() - interval '1 day'
    FROM public.ops_obra_tarefa tt JOIN public.ops_obra_fase f ON f.id = tt.fase_id
   WHERE tt.obra_id = v_obra AND f.ordem = 1 AND tt.ordem = 3;
  INSERT INTO public.ops_obra_extra (organization_id, obra_id, descricao, valor_estimado, registado_por)
  VALUES (v_org, v_obra, 'Cliente quer mudar a posição do frigorífico: mais 2 m de rede de água.', 120.00,
          v_pessoas[cardinality(v_pessoas)]);

  -- ── OB-DEMO-005 · WC planeada, começa daqui a 5 dias úteis ──
  v_obra := pg_temp.demo_obra(v_org, v_gestor, v_sup, v_cli, 'OB-DEMO-005', 'DEMO — WC suite Oeiras',
    m_wc, public.ops_obra_somar_dias_uteis(current_date, 5), 'Rua Cândido dos Reis, 3, Oeiras', v_pessoas);

  -- ── OB-DEMO-006 · pintura suspensa, à espera do cliente ──
  v_obra := pg_temp.demo_obra(v_org, v_gestor, v_sup, v_cli, 'OB-DEMO-006', 'DEMO — Pintura fachada Almada',
    m_pintura, current_date - 12, 'Rua Capitão Leitão, 50, Almada', v_pessoas);
  PERFORM pg_temp.demo_executar(v_obra, 1, 1, true, v_val, v_pessoas);
  UPDATE public.ops_obra
     SET estado = 'suspensa', iniciada_em = data_inicio_prevista + time '08:30',
         motivo_estado = 'Aguarda a escolha da cor pelo condomínio.'
   WHERE id = v_obra;
  INSERT INTO public.ops_obra_extra
    (organization_id, obra_id, descricao, valor_estimado, estado, motivo_recusa, registado_por, decidido_por, decidido_em)
  VALUES (v_org, v_obra, 'Pintar também as grades das varandas.', 300.00, 'recusado',
          'Fora do âmbito: o condomínio vai pedir orçamento à parte.', v_pessoas[1], v_gestor, now() - interval '2 days');

  RAISE NOTICE 'Dados de teste criados: OB-DEMO-002 a 006, % pessoa(s) a executar.', cardinality(v_pessoas);
END
$demo$;

COMMIT;
