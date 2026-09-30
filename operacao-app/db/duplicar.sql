-- ============================================================
--  Operações — duplicar
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql, rpcs-tarefas.sql,
--  correcoes-modelo.sql, mapa.sql, campos-ordem.sql.
--
--  Um plano de manutenção mensal para doze edifícios iguais escrevia-se doze
--  vezes. Uma checklist parecida com outra começava em folha branca. Trinta
--  apartamentos iguais numa torre eram trinta formulários.
--
--  ⚠ O QUE UMA CÓPIA NÃO LEVA
--
--  Duplicar não é clonar. O que se copia é o **molde**; o que aconteceu fica
--  onde aconteceu:
--
--    · uma ordem duplicada nasce por fazer — sem respostas, sem custos, sem
--      anexos, sem assinatura, sem sessões de trabalho e sem histórico. Levar
--      as respostas seria inventar trabalho que ninguém fez;
--    · uma checklist duplicada nasce em rascunho, mesmo que a original esteja
--      publicada. Publicar é um ato, e não se herda;
--    · um plano duplicado nasce sem nada materializado. As ordens dele são
--      as que ele vier a gerar, não as que a original gerou;
--    · um local duplicado não leva as ordens nem o histórico do original.
--
--  ⚠ CÓDIGOS
--
--  Cada cópia recebe um código novo da sequência da casa. Copiar o código
--  seria criar dois sítios com o mesmo nome ao telefone — e a base recusaria,
--  com uma mensagem que ninguém entenderia.
--
--  Escreve fora de `ops_*`? NÃO.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regprocedure('public.ops_proximo_codigo_interno(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/rpcs-tarefas.sql — é ele que gera os códigos.';
  END IF;
  IF to_regprocedure('public.ops_exige_gestao(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/campos-ordem.sql — é ele que traz ops_exige_gestao.';
  END IF;
  -- A cópia de um local tem de pôr as coordenadas a nulo de propósito, e para
  -- isso as colunas têm de existir.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ops_local' AND column_name = 'latitude'
  ) THEN
    RAISE EXCEPTION 'Falta db/mapa.sql — é ele que traz as coordenadas dos locais.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. Quem pode duplicar
-- ============================================================
-- Duplicar é criar. Quem pode criar uma ordem pode duplicá-la; quem não pode,
-- também não. É a mesma porta, e não uma segunda.

CREATE OR REPLACE FUNCTION public.ops_exige_criacao(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Isso é de outra organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = _org_id AND ativo;

  IF COALESCE(v_funcao, '') NOT IN ('admin', 'gestor', 'operador') THEN
    RAISE EXCEPTION 'Sem permissão para criar.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_user;
END
$$;

REVOKE ALL ON FUNCTION public.ops_exige_criacao(uuid) FROM PUBLIC, anon;


-- ============================================================
-- 2. Duplicar uma checklist
-- ============================================================
-- Leva as tarefas e as medições ligadas a cada uma. Nasce em rascunho.

CREATE OR REPLACE FUNCTION public.rpc_ops_duplicar_checklist(
  p_checklist_id uuid,
  p_nome         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o      record;
  v_user   uuid;
  v_novo   uuid;
  v_codigo text;
  v_nome   text;
  v_n      integer := 0;
BEGIN
  SELECT * INTO v_o FROM public.ops_checklist WHERE id = p_checklist_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Essa checklist não existe.'; END IF;

  v_user   := public.ops_exige_criacao(v_o.organization_id);
  v_codigo := public.ops_proximo_codigo_interno(v_o.organization_id, 'CL');
  v_nome   := COALESCE(nullif(btrim(p_nome), ''), v_o.nome || ' (cópia)');

  INSERT INTO public.ops_checklist (organization_id, codigo, nome, versao, estado)
  VALUES (v_o.organization_id, v_codigo, v_nome, 1, 'rascunho')
  RETURNING id INTO v_novo;

  -- As tarefas, com os ids novos guardados para as medições os apanharem.
  WITH copiadas AS (
    INSERT INTO public.ops_checklist_tarefa
      (checklist_id, posicao, codigo, nome, descricao, tipo, unidade,
       limite_min, limite_max, obrigatoria, foto_obrigatoria, tempo_estimado)
    SELECT v_novo, t.posicao, t.codigo, t.nome, t.descricao, t.tipo, t.unidade,
           t.limite_min, t.limite_max, t.obrigatoria, t.foto_obrigatoria, t.tempo_estimado
      FROM public.ops_checklist_tarefa t
     WHERE t.checklist_id = p_checklist_id
     ORDER BY t.posicao, t.nome
    RETURNING id, posicao, nome
  )
  SELECT count(*) INTO v_n FROM copiadas;

  -- As medições de cada tarefa. Emparelha-se por (posição, nome), que é o que
  -- identifica uma tarefa dentro de uma checklist — os ids são novos.
  IF to_regclass('public.ops_checklist_tarefa_medicao') IS NOT NULL THEN
    INSERT INTO public.ops_checklist_tarefa_medicao
      (checklist_tarefa_id, medicao_def_id, posicao)
    SELECT nova.id, m.medicao_def_id, m.posicao
      FROM public.ops_checklist_tarefa velha
      JOIN public.ops_checklist_tarefa_medicao m ON m.checklist_tarefa_id = velha.id
      JOIN public.ops_checklist_tarefa nova
        ON nova.checklist_id = v_novo
       AND nova.posicao = velha.posicao
       AND nova.nome = velha.nome
     WHERE velha.checklist_id = p_checklist_id;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'checklist', v_novo, 'duplicada',
     'Cópia de ' || v_o.codigo || ' — ' || v_o.nome, v_user,
     jsonb_build_object('de', p_checklist_id, 'codigo', v_o.codigo),
     jsonb_build_object('codigo', v_codigo, 'tarefas', v_n));

  RETURN jsonb_build_object('ok', true, 'id', v_novo, 'codigo', v_codigo, 'tarefas', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_duplicar_checklist(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_checklist(uuid, text) TO authenticated;


-- ============================================================
-- 3. Duplicar um plano
-- ============================================================
-- É o que mais falta: o mesmo plano mensal para doze edifícios iguais.
--
-- `p_cliente_id` permite apontar a cópia a outro cliente. Nesse caso os alvos
-- **não** se copiam: um local do cliente A não faz sentido num plano do
-- cliente B, e copiá-los criaria um plano que gera trabalho no sítio errado.

CREATE OR REPLACE FUNCTION public.rpc_ops_duplicar_plano(
  p_plano_id   uuid,
  p_nome       text DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o       record;
  v_user    uuid;
  v_novo    uuid;
  v_codigo  text;
  v_cliente uuid;
  v_alvos   integer := 0;
BEGIN
  SELECT * INTO v_o FROM public.ops_plano WHERE id = p_plano_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esse plano não existe.'; END IF;

  v_user   := public.ops_exige_criacao(v_o.organization_id);
  v_codigo := public.ops_proximo_codigo_interno(v_o.organization_id, 'PLN');
  v_cliente := COALESCE(p_cliente_id, v_o.cliente_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_clients
     WHERE id = v_cliente AND organization_id = v_o.organization_id
  ) THEN
    RAISE EXCEPTION 'Esse cliente não é desta organização.';
  END IF;

  INSERT INTO public.ops_plano
    (organization_id, codigo, nome, cliente_id, estado, regra_recorrencia,
     hora_prevista, duracao_estimada, responsavel_id, inicio_em, fim_em,
     materializado_ate)
  VALUES
    (v_o.organization_id, v_codigo,
     COALESCE(nullif(btrim(p_nome), ''), v_o.nome || ' (cópia)'),
     v_cliente,
     -- Suspenso, e não ativo. Um plano copiado ainda não tem alvos revistos,
     -- e um plano ativo começa a gerar ordens na próxima passagem do relógio.
     'suspenso',
     v_o.regra_recorrencia, v_o.hora_prevista, v_o.duracao_estimada,
     v_o.responsavel_id, GREATEST(v_o.inicio_em, current_date), v_o.fim_em,
     -- Nada materializado: as ordens desta cópia são as que ela vier a gerar.
     NULL)
  RETURNING id INTO v_novo;

  IF p_cliente_id IS NULL OR p_cliente_id = v_o.cliente_id THEN
    WITH copiados AS (
      INSERT INTO public.ops_plano_alvo (plano_id, local_id, ativo_id, checklist_id)
      SELECT v_novo, a.local_id, a.ativo_id, a.checklist_id
        FROM public.ops_plano_alvo a
       WHERE a.plano_id = p_plano_id
      RETURNING id
    )
    SELECT count(*) INTO v_alvos FROM copiados;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'plano', v_novo, 'duplicado',
     'Cópia de ' || v_o.codigo || ' — ' || v_o.nome, v_user,
     jsonb_build_object('de', p_plano_id, 'codigo', v_o.codigo),
     jsonb_build_object('codigo', v_codigo, 'alvos', v_alvos,
                        'estado', 'suspenso'));

  RETURN jsonb_build_object('ok', true, 'id', v_novo, 'codigo', v_codigo,
                            'alvos', v_alvos, 'estado', 'suspenso');
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_duplicar_plano(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_plano(uuid, text, uuid) TO authenticated;


-- ============================================================
-- 4. Duplicar um local
-- ============================================================
-- Trinta apartamentos iguais numa torre. `p_com_ativos` leva os equipamentos
-- com ele — que é quase sempre o que se quer, porque é o que dá trabalho.

-- Duplicar um local leva **tudo o que está lá dentro**: os espaços, os espaços
-- dos espaços, e os equipamentos de cada um. Antes copiava só o nó e os
-- equipamentos dele, e a cópia de uma torre de sete pisos vinha vazia — que
-- é precisamente o caso em que duplicar valia a pena.
--
-- Duplicar um espaço continua a dar um espaço irmão, dentro do mesmo local:
-- o `parent_id` copia-se. É o que se quer — a box 13 nasce ao lado da box 12,
-- e não como uma morada nova.

CREATE OR REPLACE FUNCTION public.rpc_ops_duplicar_local(
  p_local_id    uuid,
  p_nome        text,
  p_com_ativos  boolean DEFAULT true,
  p_com_espacos boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o        record;
  v_user     uuid;
  v_novo     uuid;
  v_codigo   text;
  v_ativos   integer := 0;
  v_espacos  integer := 0;
  -- id antigo -> id novo. Um espaço só se pode criar depois do pai dele, e
  -- é daqui que se sabe qual é o pai novo.
  v_mapa     jsonb := '{}'::jsonb;
  v_pai      uuid;
  v_id       uuid;
  r          record;
BEGIN
  SELECT * INTO v_o FROM public.ops_local WHERE id = p_local_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esse local não existe.'; END IF;
  IF nullif(btrim(coalesce(p_nome, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A cópia precisa de um nome — senão ficam dois locais iguais na árvore.';
  END IF;

  v_user   := public.ops_exige_criacao(v_o.organization_id);
  v_codigo := public.ops_proximo_codigo_interno(v_o.organization_id, 'LOC');

  -- ── 1. O próprio ────────────────────────────────────────────
  -- O `parent_id` copia-se: a cópia de um espaço nasce dentro do mesmo local,
  -- e a cópia de uma morada nasce como morada.
  INSERT INTO public.ops_local
    (organization_id, parent_id, cliente_id, codigo, nome, tipo, morada,
     cidade, zona, latitude, longitude)
  VALUES
    (v_o.organization_id, v_o.parent_id, v_o.cliente_id, v_codigo, btrim(p_nome),
     v_o.tipo, v_o.morada, v_o.cidade, v_o.zona,
     -- As coordenadas NÃO se copiam. Dois apartamentos na mesma torre não são
     -- o mesmo ponto, e um ponto errado é pior do que ponto nenhum: manda o
     -- técnico com confiança para o sítio errado.
     NULL, NULL)
  RETURNING id INTO v_novo;

  v_mapa := jsonb_build_object(p_local_id::text, v_novo::text);

  -- ── 2. Os espaços, de cima para baixo ─────────────────────────────
  -- Por nível, porque um filho precisa do pai já criado. O limite de 20 níveis
  -- é um travão contra dados em ciclo: uma árvore que qualquer pessoa edita
  -- acaba por ter um nó pendurado em si próprio, e isso não pode pendurar a
  -- base.
  IF p_com_espacos THEN
    FOR r IN
      WITH RECURSIVE descendentes AS (
        SELECT l.*, 1 AS nivel
          FROM public.ops_local l
         WHERE l.parent_id = p_local_id AND l.ativo
        UNION ALL
        SELECT f.*, d.nivel + 1
          FROM public.ops_local f
          JOIN descendentes d ON f.parent_id = d.id
         WHERE f.ativo AND d.nivel < 20
      )
      SELECT * FROM descendentes ORDER BY nivel, nome
    LOOP
      v_pai := (v_mapa ->> r.parent_id::text)::uuid;
      -- Sem pai copiado não há onde pendurar. Não devia acontecer; se
      -- acontecer, salta-se este ramo em vez de rebentar a cópia toda.
      CONTINUE WHEN v_pai IS NULL;

      INSERT INTO public.ops_local
        (organization_id, parent_id, cliente_id, codigo, nome, tipo, morada,
         cidade, zona, latitude, longitude)
      VALUES
        (v_o.organization_id, v_pai, r.cliente_id,
         public.ops_proximo_codigo_interno(v_o.organization_id, 'LOC'),
         r.nome, r.tipo, r.morada, r.cidade, r.zona, NULL, NULL)
      RETURNING id INTO v_id;

      v_mapa   := v_mapa || jsonb_build_object(r.id::text, v_id::text);
      v_espacos := v_espacos + 1;
    END LOOP;
  END IF;

  -- ── 3. Os equipamentos, de todos os locais copiados ─────────────────
  IF p_com_ativos THEN
    FOR r IN
      SELECT a.*
        FROM public.ops_ativo a
       WHERE a.ativo
         -- `->> ... IS NOT NULL` e não o operador `?`: há clientes de SQL
         -- que tratam o ponto de interrogação como marcador de parâmetro.
         AND (v_mapa ->> a.local_id::text) IS NOT NULL
       ORDER BY a.codigo
    LOOP
      INSERT INTO public.ops_ativo
        (organization_id, local_id, categoria_id, codigo, nome, descricao,
         marca, modelo, criticidade, centro_custo_id)
      VALUES
        (v_o.organization_id, (v_mapa ->> r.local_id::text)::uuid, r.categoria_id,
         public.ops_proximo_codigo_interno(v_o.organization_id, 'AT'),
         r.nome, r.descricao, r.marca, r.modelo, r.criticidade, r.centro_custo_id);
      -- O número de série NÃO se copia: é único de cada máquina, e duas com o
      -- mesmo número tornam o histórico inútil.
      v_ativos := v_ativos + 1;
    END LOOP;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'local', v_novo, 'duplicado',
     'Cópia de ' || v_o.codigo || ' — ' || v_o.nome, v_user,
     jsonb_build_object('de', p_local_id, 'codigo', v_o.codigo),
     jsonb_build_object('codigo', v_codigo, 'equipamentos', v_ativos,
                        'espacos', v_espacos));

  RETURN jsonb_build_object('ok', true, 'id', v_novo, 'codigo', v_codigo,
                            'equipamentos', v_ativos, 'espacos', v_espacos);
END
$$;

-- A assinatura mudou (ganhou `p_com_espacos`). Sem largar a antiga ficavam
-- duas funções com o mesmo nome, e a chamada de três argumentos continuava a
-- correr a versão velha — que copia o nó e deixa os espaços para trás.
DROP FUNCTION IF EXISTS public.rpc_ops_duplicar_local(uuid, text, boolean);

REVOKE ALL ON FUNCTION public.rpc_ops_duplicar_local(uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_local(uuid, text, boolean, boolean) TO authenticated;


-- ============================================================
-- 5. Duplicar uma ordem
-- ============================================================
-- Repetir um trabalho igual sem passar por um plano. Nasce POR FAZER: as
-- tarefas vão como perguntas, e não como respostas.

CREATE OR REPLACE FUNCTION public.rpc_ops_duplicar_ordem(
  p_ordem_id uuid,
  p_titulo   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o      record;
  v_user   uuid;
  v_novo   uuid;
  v_codigo text;
  v_n      integer := 0;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Essa ordem não existe.'; END IF;

  v_user   := public.ops_exige_criacao(v_o.organization_id);
  v_codigo := public.ops_proximo_codigo_interno(v_o.organization_id, 'OT');

  INSERT INTO public.ops_ordem
    (organization_id, codigo, origem, estado, prioridade, area, tipo,
     cliente_id, local_id, titulo, descricao,
     contacto_nome, contacto_telefone,
     tipo_trabalho_id, centro_custo_id, fornecedor_id, fecha_automatico)
  VALUES
    (v_o.organization_id, v_codigo, v_o.origem,
     -- Agendada, e não em curso: uma cópia é trabalho por fazer. Sem data:
     -- a data da original é do dia dela, e herdá-la nasceria já atrasada.
     'agendada',
     v_o.prioridade, v_o.area, v_o.tipo,
     v_o.cliente_id, v_o.local_id,
     COALESCE(nullif(btrim(p_titulo), ''), v_o.titulo),
     v_o.descricao, v_o.contacto_nome, v_o.contacto_telefone,
     v_o.tipo_trabalho_id, v_o.centro_custo_id, v_o.fornecedor_id,
     v_o.fecha_automatico)
  RETURNING id INTO v_novo;

  INSERT INTO public.ops_ordem_alvo (ordem_id, local_id, ativo_id, checklist_id)
  SELECT v_novo, a.local_id, a.ativo_id, a.checklist_id
    FROM public.ops_ordem_alvo a
   WHERE a.ordem_id = p_ordem_id;

  -- As tarefas vão como perguntas: sem estado, sem valores, sem quem as fez e
  -- sem os tempos. Levar as respostas seria inventar trabalho que ninguém fez.
  WITH copiadas AS (
    INSERT INTO public.ops_ordem_tarefa
      (ordem_id, ordem_alvo_id, posicao, codigo, nome, tipo, estado,
       unidade, limite_min, limite_max, obrigatoria, tempo_estimado)
    SELECT v_novo, NULL, t.posicao, t.codigo, t.nome, t.tipo, 'pendente',
           t.unidade, t.limite_min, t.limite_max, t.obrigatoria, t.tempo_estimado
      FROM public.ops_ordem_tarefa t
     WHERE t.ordem_id = p_ordem_id
     ORDER BY t.posicao
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM copiadas;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', v_novo, 'criada',
     'Cópia de ' || v_o.codigo, v_user,
     jsonb_build_object('de', p_ordem_id, 'codigo', v_o.codigo),
     jsonb_build_object('codigo', v_codigo, 'tarefas', v_n, 'duplicada', true));

  RETURN jsonb_build_object('ok', true, 'id', v_novo, 'codigo', v_codigo, 'tarefas', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_duplicar_ordem(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_ordem(uuid, text) TO authenticated;


-- ============================================================
-- 6. Verificação
-- ============================================================

DO $verificar$
DECLARE
  v_falta text[] := ARRAY[]::text[];
  v_f     text;
BEGIN
  FOREACH v_f IN ARRAY ARRAY[
    'public.ops_exige_criacao(uuid)',
    'public.rpc_ops_duplicar_checklist(uuid,text)',
    'public.rpc_ops_duplicar_plano(uuid,text,uuid)',
    'public.rpc_ops_duplicar_local(uuid,text,boolean,boolean)',
    'public.rpc_ops_duplicar_ordem(uuid,text)'
  ] LOOP
    IF to_regprocedure(v_f) IS NULL THEN v_falta := v_falta || v_f; END IF;
  END LOOP;

  IF array_length(v_falta, 1) > 0 THEN
    RAISE EXCEPTION 'Não ficaram criadas: %', array_to_string(v_falta, ', ');
  END IF;

  RAISE NOTICE 'Operações: duplicar checklists, planos, locais e ordens.';
END
$verificar$;

COMMIT;
