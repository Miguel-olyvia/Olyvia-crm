-- ============================================================
-- 20270102220000_obra_por_permissao
-- ============================================================
-- O que faz: a obra passa das permissões largas (pessoas.edit ou negocios.obra; papéis fixos operacoes/direcao) às finas.
--   1. obra_guardar_negocio: entra quem tem pessoas.edit, negocios.obra.planear ou negocios.obra.executar.
--        · negocios.obra.planear (Gestor de obra, Direção): tudo, como antes (plano, estado da obra, cancelar, atribuir técnicos,
--          validar tarefas, criar e apagar tarefas).
--        · sem ela, compara-se a obra gravada com a nova: só passa o que é de quem executa (negocios.obra.executar), nas tarefas
--          atribuídas ao próprio (ops_obra_tarefa_rh; a conta → pessoa do RH por fn_neg_pessoa_da_conta): marcar em curso ou feita,
--          os registos, as fotografias, as notas, os avisos dele, o diário (horas, fotos, notas, ocorrências) e os imprevistos novos que
--          param só tarefas dele (fn_obra_execucao_permitida). Grava-se então só o estado da Emylia e o estado dessas tarefas.
--        · gravar sem mudanças passa para todos os que entram; a obra que nasce do orçamento (planeada, nada feito) pode ser criada
--          por quem tem pessoas.edit (é o ecrã que a gera ao assinar ou ao validar o pagamento).
--   2. obra_encomendar_materiais: negocios.obra.materiais (perfil ou Papel no Negócio) ou purchase_orders.create, em vez de
--      purchase_orders.create ou negocios.obra + papel operacoes/direcao.
-- Origem: pg_get_functiondef das versões vivas na base RH a 2/11/2026 (guardas md5 abaixo).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> 'd35dc8649e61d4c2b49274c90a0af442'
     OR md5(pg_get_functiondef('public.obra_encomendar_materiais(uuid,uuid,text,jsonb)'::regprocedure)) <> '865011c947bd09022cf4d055ce8e5679' THEN
    RAISE EXCEPTION 'Guarda: obra_guardar_negocio ou obra_encomendar_materiais mudou desde 2/11. Rever esta migration antes de a aplicar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'negocios.obra.planear') THEN
    RAISE EXCEPTION 'Guarda: falta a 20270102200000 (permissões finas no catálogo).';
  END IF;
END $do$;

-- ------------------------------------------------------------------ 1. o que o técnico pode mudar na obra (o estado da Emylia)
-- Compara a obra gravada (p_antes) com a nova (p_depois) e devolve NULL se só mudou o que é de quem executa (p_eu: a pessoa do RH de
-- quem grava), ou o texto do que mudou fora disso. Pode mudar, nas tarefas atribuídas a ele (tasks[i].tec = p_eu, antes e depois):
--   · exec: o estado (em curso, feita; não validada nem a corrigir, e nunca numa tarefa já validada), as horas, as fotografias, a nota,
--     os passos e os registos novos (envios «registo»/«feita» acrescentados no fim); a validação e o motivo da correção ficam;
--   · bloqueio: parar a tarefa por um imprevisto novo dele;
-- e na obra: os avisos dele (lidos, e os novos dele), o diário (entradas novas de horas, fotografia, nota ou ocorrência, no fim), os
-- imprevistos novos (abertos, «impede», só nas tarefas dele; o «atrasa» mexe no plano e é do Gestor de obra), e o dia de hoje do plano
-- (o relógio do ecrã: só para a frente). Tudo o resto tem de ficar igual.
CREATE OR REPLACE FUNCTION public.fn_obra_execucao_permitida(p_antes jsonb, p_depois jsonb, p_eu uuid) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  a jsonb := p_antes; d jsonb := p_depois; eu text := p_eu::text;
  ta jsonb; td jsonb; ea jsonb; ed jsonb; n int; na int; i int; j int; x jsonb;
  v_minhas text[] := '{}'; v_imp_novos text[] := '{}'; v_avisos jsonb;
BEGIN
  IF a IS NOT DISTINCT FROM d THEN RETURN NULL; END IF;
  IF eu IS NULL THEN RETURN 'a obra'; END IF;
  IF jsonb_typeof(a->'plano') IS DISTINCT FROM 'object' OR jsonb_typeof(d->'plano') IS DISTINCT FROM 'object'
     OR jsonb_typeof(a->'plano'->'tasks') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'plano'->'tasks') IS DISTINCT FROM 'array' THEN
    RETURN 'o plano da obra';
  END IF;
  n := jsonb_array_length(a->'plano'->'tasks');
  IF jsonb_array_length(d->'plano'->'tasks') <> n THEN RETURN 'as tarefas do plano'; END IF;

  -- as tarefas dele: o registo da execução
  FOR i IN 0 .. n - 1 LOOP
    ta := a->'plano'->'tasks'->i; td := d->'plano'->'tasks'->i;
    CONTINUE WHEN NOT (ta->>'tec' = eu AND td->>'tec' = eu);
    v_minhas := v_minhas || (ta->>'nome');
    ea := ta->'exec'; ed := td->'exec';
    IF ea IS DISTINCT FROM ed THEN
      IF ea->>'estado' IN ('validada') THEN RETURN format('a tarefa %s, já validada', ta->>'nome'); END IF;
      IF (ed->>'estado') IS DISTINCT FROM (ea->>'estado') AND coalesce(ed->>'estado', '') NOT IN ('em curso', 'feita') THEN
        RETURN format('a validação da tarefa %s', ta->>'nome');
      END IF;
      IF (ed->'validada') IS DISTINCT FROM (ea->'validada') OR (ed->'motivo') IS DISTINCT FROM (ea->'motivo') THEN
        RETURN format('a validação da tarefa %s', ta->>'nome');
      END IF;
      na := jsonb_array_length(public.fn_neg_lista(ea->'envios'));
      IF jsonb_array_length(public.fn_neg_lista(ed->'envios')) < na THEN RETURN format('os registos da tarefa %s', ta->>'nome'); END IF;
      FOR j IN 0 .. jsonb_array_length(public.fn_neg_lista(ed->'envios')) - 1 LOOP
        x := ed->'envios'->j;
        IF j < na AND x IS DISTINCT FROM ea->'envios'->j THEN RETURN format('os registos da tarefa %s', ta->>'nome'); END IF;
        IF j >= na AND coalesce(x->>'k', '') NOT IN ('registo', 'feita') THEN RETURN format('a validação da tarefa %s', ta->>'nome'); END IF;
      END LOOP;
      td := CASE WHEN ea IS NULL THEN td - 'exec' ELSE jsonb_set(td, '{exec}', ea) END;
      d := jsonb_set(d, ARRAY['plano', 'tasks', i::text], td);
    END IF;
  END LOOP;

  -- os imprevistos novos (no fim da lista): abertos, «impede», só nas tarefas dele
  na := jsonb_array_length(public.fn_neg_lista(a->'imprevistos'));
  IF jsonb_array_length(public.fn_neg_lista(d->'imprevistos')) < na THEN RETURN 'os imprevistos'; END IF;
  FOR j IN 0 .. jsonb_array_length(public.fn_neg_lista(d->'imprevistos')) - 1 LOOP
    x := d->'imprevistos'->j;
    IF j < na THEN
      IF x IS DISTINCT FROM a->'imprevistos'->j THEN RETURN 'os imprevistos'; END IF;
    ELSE
      IF x->>'estado' IS DISTINCT FROM 'aberto' OR x->>'grav' IS DISTINCT FROM 'impede' OR jsonb_typeof(x->'tarefas') IS DISTINCT FROM 'array'
         OR jsonb_array_length(x->'tarefas') = 0
         OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(x->'tarefas') t WHERE NOT (t = ANY (v_minhas))) THEN
        RETURN 'um imprevisto que mexe no plano ou em tarefas de outros';
      END IF;
      v_imp_novos := v_imp_novos || (x->>'id');
    END IF;
  END LOOP;
  d := CASE WHEN a ? 'imprevistos' THEN jsonb_set(d, '{imprevistos}', a->'imprevistos') ELSE d - 'imprevistos' END;

  -- a paragem das tarefas dele pelos imprevistos novos
  FOR i IN 0 .. n - 1 LOOP
    ta := a->'plano'->'tasks'->i; td := d->'plano'->'tasks'->i;
    IF ta->>'tec' = eu AND td->>'tec' = eu AND ta->'bloqueio' IS NULL AND td->>'bloqueio' = ANY (v_imp_novos) THEN
      d := jsonb_set(d, ARRAY['plano', 'tasks', i::text], td - 'bloqueio');
    END IF;
  END LOOP;

  -- os avisos aos técnicos: os dele, lidos ou novos (no fim)
  na := jsonb_array_length(public.fn_neg_lista(a->'plano'->'avisos'));
  IF jsonb_array_length(public.fn_neg_lista(d->'plano'->'avisos')) < na THEN RETURN 'os avisos aos técnicos'; END IF;
  v_avisos := '[]'::jsonb;
  FOR j IN 0 .. jsonb_array_length(public.fn_neg_lista(d->'plano'->'avisos')) - 1 LOOP
    x := d->'plano'->'avisos'->j;
    IF j < na THEN
      IF x->>'tec' = eu AND (a->'plano'->'avisos'->j->>'tec') = eu AND (x - 'lido') = (a->'plano'->'avisos'->j - 'lido') THEN
        x := a->'plano'->'avisos'->j;
      END IF;
      v_avisos := v_avisos || jsonb_build_array(x);
    ELSIF x->>'tec' IS DISTINCT FROM eu THEN
      v_avisos := v_avisos || jsonb_build_array(x);
    END IF;
  END LOOP;
  d := CASE WHEN (a->'plano') ? 'avisos' OR jsonb_array_length(v_avisos) > 0 THEN jsonb_set(d, '{plano,avisos}', v_avisos) ELSE d #- '{plano,avisos}' END;

  -- o diário: entradas novas no fim (horas, fotografia, nota, ocorrência)
  na := jsonb_array_length(public.fn_neg_lista(a->'diario'));
  IF jsonb_array_length(public.fn_neg_lista(d->'diario')) < na THEN RETURN 'o diário de obra'; END IF;
  FOR j IN 0 .. jsonb_array_length(public.fn_neg_lista(d->'diario')) - 1 LOOP
    x := d->'diario'->j;
    IF j < na AND x IS DISTINCT FROM a->'diario'->j THEN RETURN 'o diário de obra'; END IF;
    IF j >= na AND coalesce(x->>'k', '') NOT IN ('horas', 'foto', 'nota', 'ocorrencia') THEN RETURN 'o diário de obra (validações e marcos)'; END IF;
  END LOOP;
  d := CASE WHEN a ? 'diario' THEN jsonb_set(d, '{diario}', a->'diario') ELSE d - 'diario' END;

  -- o dia de hoje do plano (o relógio do ecrã), só para a frente
  IF coalesce((d->'plano'->>'dia')::numeric, 0) >= coalesce((a->'plano'->>'dia')::numeric, 0) THEN
    d := CASE WHEN (a->'plano') ? 'dia' THEN jsonb_set(d, '{plano,dia}', a->'plano'->'dia') ELSE d #- '{plano,dia}' END;
  END IF;

  IF a IS DISTINCT FROM d THEN RETURN 'o plano da obra'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.fn_obra_execucao_permitida(jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_obra_execucao_permitida(jsonb, jsonb, uuid) TO service_role;

-- ------------------------------------------------------------------ 2. obra_guardar_negocio
CREATE OR REPLACE FUNCTION public.obra_guardar_negocio(p_org uuid, p_negocio_id uuid, p_obra jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270102220000: o código antigo do papel da obra deu lugar a negocios.obra.planear (o Gestor de obra) e negocios.obra.executar (o técnico)
  v_user uuid := public.fn_cat_exigir_uma(p_org, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  v_existe boolean; v_planear boolean; v_executar boolean; v_eu uuid; v_porque text; s record;
  v_neg negocios; v_obra ops_obra; v_codigo text; v_estado text; v_plano boolean; v_inicio date;
  t jsonb; v_chave text; v_nome text; v_fase uuid; v_tar uuid; v_skill uuid; v_skill_nome text; v_pessoa uuid; v_tarestado text; v_pessoas smallint;
  v_chaves text[] := '{}'; v_avisos text[] := '{}';
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  IF p_obra IS NULL OR jsonb_typeof(p_obra) <> 'object' THEN RAISE EXCEPTION 'A obra tem de ser um objeto.' USING ERRCODE = 'CT002'; END IF;
  v_plano := coalesce(jsonb_typeof(p_obra->'tarefas') = 'array', false);
  v_estado := coalesce(nullif(p_obra->>'estado', ''), 'planeada');
  IF v_estado NOT IN ('planeada', 'em_curso', 'suspensa', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Estado da obra inválido: %.', v_estado USING ERRCODE = 'CT002';
  END IF;
  BEGIN
    v_inicio := nullif(p_obra->>'inicio', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de início inválida: %.', p_obra->>'inicio' USING ERRCODE = 'CT002';
  END;

  SELECT * INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio_id AND organization_id = p_org FOR UPDATE;
  v_existe := FOUND;

  -- 20270102220000: sem negocios.obra.planear, compara-se a obra gravada com a nova e só passa o que é de quem executa: as tarefas
  -- atribuídas a ele (ops_obra_tarefa_rh; no estado da Emylia, tasks[i].tec), marcadas em curso ou feitas, com os registos, as
  -- fotografias, as notas e os imprevistos delas (fn_obra_execucao_permitida). Gravar sem mudanças passa sempre. O plano, o estado da
  -- obra, o cancelamento, a atribuição dos técnicos, a validação e as tarefas novas ou apagadas são do Gestor de obra.
  v_planear := public.fn_cat_pode(p_org, 'negocios.obra.planear');
  IF NOT v_planear AND NOT v_existe THEN
    -- a obra nasce do orçamento (o plano gerado, por aprovar, sem nada feito): quem grava o negócio pode criá-la
    IF v_plano AND (v_estado <> 'planeada' OR NOT public.fn_cat_pode(p_org, 'pessoas.edit')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_obra->'tarefas') x WHERE coalesce(nullif(x->>'estado', ''), 'por_fazer') <> 'por_fazer')) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): só o Gestor de obra cria uma obra que já não está só planeada.' USING ERRCODE = 'CT001';
    END IF;
  ELSIF NOT v_planear THEN
    v_executar := public.fn_cat_pode(p_org, 'negocios.obra.executar');
    v_eu := CASE WHEN v_executar THEN public.fn_neg_pessoa_da_conta(p_org) END;
    IF NOT v_plano OR v_estado IS DISTINCT FROM v_obra.estado THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o estado da obra nem cancelá-la.' USING ERRCODE = 'CT001';
    END IF;
    IF (SELECT coalesce(array_agg(t.chave ORDER BY t.chave), '{}') FROM ops_obra_tarefa t WHERE t.obra_id = v_obra.id)
       IS DISTINCT FROM (SELECT coalesce(array_agg(btrim(x->>'chave') ORDER BY btrim(x->>'chave')), '{}') FROM jsonb_array_elements(p_obra->'tarefas') x) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode juntar nem tirar tarefas do plano.' USING ERRCODE = 'CT001';
    END IF;
    FOR s IN SELECT t.chave, t.nome, t.estado, (SELECT r.pessoa_id FROM ops_obra_tarefa_rh r WHERE r.tarefa_id = t.id LIMIT 1) AS pessoa,
                    CASE WHEN coalesce(nullif(x->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(x->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo,
                    CASE WHEN coalesce(x->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (x->>'pessoa')::uuid END AS nova_pessoa
             FROM ops_obra_tarefa t JOIN jsonb_array_elements(p_obra->'tarefas') x ON btrim(x->>'chave') = t.chave
             WHERE t.obra_id = v_obra.id LOOP
      IF s.nova_pessoa IS DISTINCT FROM s.pessoa THEN
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o técnico da tarefa %.', s.nome USING ERRCODE = 'CT001';
      END IF;
      IF s.novo IS DISTINCT FROM s.estado AND NOT (v_eu IS NOT NULL AND s.pessoa = v_eu AND s.estado <> 'validada' AND s.novo IN ('em_curso', 'feita')) THEN
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): na tarefa % só quem a tem atribuída a marca em curso ou feita; validar e pedir correção é do Gestor de obra.', s.nome
          USING ERRCODE = 'CT001';
      END IF;
    END LOOP;
    v_porque := public.fn_obra_execucao_permitida(v_obra.estado_emylia, p_obra->'emylia', v_eu);
    IF v_porque IS NOT NULL THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar %; só regista a execução das tarefas atribuídas a si.', v_porque USING ERRCODE = 'CT001';
    END IF;
    -- grava só a execução: o estado da Emylia e o estado das tarefas dele; o resto da projeção (datas, nomes, técnicos) fica o da base
    UPDATE ops_obra SET estado_emylia = p_obra->'emylia', atualizada_em = now()
    WHERE id = v_obra.id AND estado_emylia IS DISTINCT FROM p_obra->'emylia';
    UPDATE ops_obra_tarefa t SET estado = x.novo, atualizada_em = now()
    FROM (SELECT btrim(y->>'chave') AS chave, CASE WHEN coalesce(nullif(y->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(y->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo FROM jsonb_array_elements(p_obra->'tarefas') y) x
    WHERE t.obra_id = v_obra.id AND t.chave = x.chave AND t.estado IS DISTINCT FROM x.novo;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  IF NOT v_existe THEN
    IF NOT v_plano THEN RETURN jsonb_build_object('obra_id', NULL, 'codigo', NULL, 'avisos', '[]'::jsonb); END IF;
    v_codigo := 'OB-' || coalesce(v_neg.numero::text, left(p_negocio_id::text, 8));
    IF EXISTS (SELECT 1 FROM ops_obra WHERE organization_id = p_org AND codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
    END IF;
    INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, morada, estado, data_inicio_prevista, criada_por, estado_emylia,
                          iniciada_em, concluida_em)
    VALUES (p_org, v_codigo, p_negocio_id,
            coalesce(nullif(btrim(p_obra->>'titulo'), ''), nullif(btrim(v_neg.titulo), ''), 'Obra ' || v_codigo),
            nullif(btrim(coalesce(p_obra->>'morada', '')), ''), v_estado, v_inicio, v_user, p_obra->'emylia',
            CASE WHEN v_estado IN ('em_curso', 'concluida') THEN now() END, CASE WHEN v_estado = 'concluida' THEN now() END)
    RETURNING * INTO v_obra;
  ELSE
    UPDATE ops_obra SET
      titulo = coalesce(nullif(btrim(p_obra->>'titulo'), ''), titulo),
      morada = coalesce(nullif(btrim(coalesce(p_obra->>'morada', '')), ''), morada),
      estado = CASE WHEN v_plano THEN v_estado ELSE 'cancelada' END,
      data_inicio_prevista = coalesce(v_inicio, data_inicio_prevista),
      iniciada_em = CASE WHEN v_estado IN ('em_curso', 'concluida') THEN coalesce(iniciada_em, now()) ELSE iniciada_em END,
      concluida_em = CASE WHEN v_estado = 'concluida' THEN coalesce(concluida_em, now()) ELSE concluida_em END,
      estado_emylia = p_obra->'emylia',
      atualizada_em = now()
    WHERE id = v_obra.id
    RETURNING * INTO v_obra;
  END IF;

  IF NOT v_plano THEN
    DELETE FROM ops_obra_tarefa_rh WHERE obra_id = v_obra.id;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- as fases: as que o motor manda e as que as tarefas usam
  INSERT INTO ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT p_org, v_obra.id, f.ordem, coalesce(max(f.nome), 'Fase ' || f.ordem)
  FROM (
    SELECT (x->>'ordem')::smallint AS ordem, nullif(btrim(x->>'nome'), '') AS nome
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_obra->'fases') = 'array' THEN p_obra->'fases' ELSE '[]'::jsonb END) x
    UNION ALL
    SELECT coalesce((x->>'fase')::smallint, 0), NULL FROM jsonb_array_elements(p_obra->'tarefas') x
  ) f
  GROUP BY f.ordem
  ON CONFLICT (obra_id, ordem) DO UPDATE SET nome = EXCLUDED.nome WHERE ops_obra_fase.nome IS DISTINCT FROM EXCLUDED.nome;

  FOR t IN SELECT x FROM jsonb_array_elements(p_obra->'tarefas') x LOOP
    v_chave := nullif(btrim(coalesce(t->>'chave', '')), '');
    v_nome := nullif(btrim(coalesce(t->>'nome', '')), '');
    IF v_chave IS NULL OR v_nome IS NULL THEN RAISE EXCEPTION 'Cada tarefa precisa de chave e nome.' USING ERRCODE = 'CT002'; END IF;
    IF v_chave = ANY (v_chaves) THEN RAISE EXCEPTION 'Tarefa repetida: %.', v_chave USING ERRCODE = 'CT002'; END IF;
    v_chaves := v_chaves || v_chave;

    v_skill := NULL; v_skill_nome := NULL;
    IF nullif(t->>'perfil', '') IS NOT NULL THEN
      SELECT k.id, k.nome INTO v_skill, v_skill_nome FROM ops_skill k
      WHERE k.organization_id = p_org AND (k.chave = t->>'perfil' OR k.id::text = t->>'perfil') LIMIT 1;
    END IF;
    SELECT id INTO v_fase FROM ops_obra_fase WHERE obra_id = v_obra.id AND ordem = coalesce((t->>'fase')::smallint, 0);
    v_tarestado := coalesce(nullif(t->>'estado', ''), 'por_fazer');
    IF v_tarestado NOT IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada') THEN v_tarestado := 'por_fazer'; END IF;
    v_pessoas := least(20, greatest(1, coalesce((t->>'pessoas')::int, 1)));

    v_tar := NULL;
    SELECT id INTO v_tar FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND chave = v_chave;
    IF v_tar IS NULL THEN
      INSERT INTO ops_obra_tarefa (organization_id, obra_id, fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado,
                                   estado, skill_id, chave, pessoas_previstas)
      VALUES (p_org, v_obra.id, v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
              nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_chave, v_pessoas)
      RETURNING id INTO v_tar;
    ELSE
      UPDATE ops_obra_tarefa SET fase_id = v_fase, ordem = coalesce((t->>'ordem')::int, 0), nome = v_nome,
        minutos_previstos = greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
        inicio_planeado = nullif(t->>'inicio', '')::date, fim_planeado = nullif(t->>'fim', '')::date,
        estado = v_tarestado, skill_id = v_skill, pessoas_previstas = v_pessoas, atualizada_em = now()
      WHERE id = v_tar
        AND (fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado, estado, skill_id, pessoas_previstas) IS DISTINCT FROM
            (v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
             nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_pessoas);
    END IF;

    -- quem a faz: só uma pessoa do RH desta organização
    v_pessoa := NULL;
    IF coalesce(t->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id INTO v_pessoa FROM pessoas p WHERE p.id = (t->>'pessoa')::uuid AND p.organization_id = p_org AND p.deleted_at IS NULL;
      IF v_pessoa IS NULL THEN
        v_avisos := v_avisos || format('%s: o técnico não é uma pessoa do RH desta organização. Ficou por atribuir.', v_nome);
      ELSIF NOT public.fn_rh_pessoa_tecnica(p_org, v_pessoa) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem um cargo técnico de obra no RH.', v_nome);
      ELSIF v_skill IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, v_pessoa) o WHERE o.skill_id = v_skill) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem o ofício %s no RH.', v_nome, v_skill_nome);
      END IF;
    END IF;
    DELETE FROM ops_obra_tarefa_rh WHERE tarefa_id = v_tar AND pessoa_id IS DISTINCT FROM v_pessoa;
    IF v_pessoa IS NOT NULL THEN
      INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
      VALUES (p_org, v_obra.id, v_tar, v_pessoa, v_user)
      ON CONFLICT (tarefa_id, pessoa_id) DO NOTHING;
    END IF;
  END LOOP;

  -- o que saiu do plano sai da projeção (as fases só se nenhuma tarefa as usar)
  DELETE FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND (chave IS NULL OR NOT (chave = ANY (v_chaves)));
  DELETE FROM ops_obra_fase f WHERE f.obra_id = v_obra.id AND NOT EXISTS (SELECT 1 FROM ops_obra_tarefa x WHERE x.fase_id = f.id);

  RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', to_jsonb(v_avisos));
END $function$
;

-- ------------------------------------------------------------------ 3. obra_encomendar_materiais
CREATE OR REPLACE FUNCTION public.obra_encomendar_materiais(p_org uuid, p_negocio uuid, p_motivo text, p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid; v_neg negocios; v_cc client_contracts; v_quote uuid; v_obra text; v_ordem int;
  l jsonb; v_prod products; v_q numeric; v_ql uuid; v_ids uuid[] := '{}';
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 200); v_r jsonb;
BEGIN
  -- 20270102220000: em vez dos papéis fixos (operacoes, direcao), a permissão negocios.obra.materiais (perfil ou Papel no Negócio);
  -- purchase_orders.create (quem cria encomendas de compra) continua a poder. O técnico (só ele) não encomenda.
  IF NOT (public.fn_cat_pode(p_org, 'negocios.obra.materiais') OR public.fn_cat_pode(p_org, 'purchase_orders.create')) THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.materiais): só o Gestor de obra pede materiais novos ao fornecedor.' USING ERRCODE = 'CT001';
  END IF;
  v_user := public.current_business_user_id();
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'Sem materiais para encomendar.' USING ERRCODE = 'CT002';
  END IF;
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'CT003'; END IF;
  IF v_neg.anulado_em IS NOT NULL THEN RAISE EXCEPTION 'O contrato deste negócio foi anulado.' USING ERRCODE = 'CT002'; END IF;
  SELECT * INTO v_cc FROM client_contracts
  WHERE negocio_id = p_negocio AND organization_id = p_org AND deleted_at IS NULL AND adenda_id IS NULL AND ec_emitida_em IS NOT NULL
  ORDER BY ec_emitida_em DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A encomenda de cliente ainda não foi emitida: os materiais novos encomendam-se depois de validado o pagamento.' USING ERRCODE = 'NE011';
  END IF;
  -- o orçamento da encomenda de cliente (o do contrato; senão o último da proposta, como o rpc_get_client_order_document)
  v_quote := coalesce(v_cc.quote_id, (SELECT q.id FROM quotes q WHERE q.proposal_id = v_cc.proposal_id ORDER BY q.created_at DESC LIMIT 1));
  IF v_quote IS NULL THEN RAISE EXCEPTION 'A encomenda de cliente não tem orçamento.' USING ERRCODE = 'CT003'; END IF;
  SELECT codigo INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio AND organization_id = p_org ORDER BY criada_em DESC LIMIT 1;
  SELECT coalesce(max(ordem), 0) INTO v_ordem FROM quote_lines WHERE quote_id = v_quote;

  FOR l IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    BEGIN
      v_q := (l->>'q')::numeric;
    EXCEPTION WHEN OTHERS THEN v_q := NULL;
    END;
    IF v_q IS NULL OR v_q <= 0 THEN RAISE EXCEPTION 'Quantidade inválida: %.', l->>'q' USING ERRCODE = 'CT002'; END IF;
    SELECT * INTO v_prod FROM products WHERE id = nullif(l->>'produto', '')::uuid AND organization_id = p_org AND NOT coalesce(is_deleted, false);
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto que não é do Catálogo desta organização: %.', coalesce(l->>'n', l->>'produto') USING ERRCODE = 'CT002'; END IF;
    v_ordem := v_ordem + 1;
    INSERT INTO quote_lines (quote_id, product_id, categoria, descricao_snapshot, tipo_emylia, qt, quantidade_exata, unidade, section_name, ordem,
      iva_percent, cost_price, custo_material_unit, retail_price_unit, preco_un_exato, total_sem_iva, total_com_desconto, total_com_iva,
      visible_to_client, item_description)
    VALUES (v_quote, v_prod.id, 'Materiais', v_prod.name, 'material_obra', ceil(v_q), ceil(v_q), coalesce(v_prod.unidade, 'un'), 'Obra', v_ordem,
      23, 0, 0, 0, 0, 0, 0, 0, false,
      left(format('Material novo da obra %s%s%s', coalesce(v_obra, ''), CASE WHEN coalesce(l->>'tarefa', '') <> '' THEN ' · ' || (l->>'tarefa') ELSE '' END,
        CASE WHEN v_motivo <> '' THEN ' (' || v_motivo || ')' ELSE '' END), 500))
    RETURNING id INTO v_ql;
    v_ids := v_ids || v_ql;
  END LOOP;

  -- o que falta destas linhas: reserva do stock e, do resto, a encomenda ao fornecedor preferido (pendente)
  v_r := public.fn_client_order_request_missing(v_cc.id, v_user, v_ids);

  RETURN jsonb_build_object(
    'encomendas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', po.id, 'numero', po.order_number, 'fornecedor', s.name, 'linhas', x.n) ORDER BY po.order_number)
                  FROM (SELECT i.purchase_order_id, count(*) n FROM purchase_order_items i WHERE i.quote_line_id = ANY (v_ids) GROUP BY 1) x
                  JOIN purchase_orders po ON po.id = x.purchase_order_id LEFT JOIN suppliers s ON s.id = po.supplier_id), '[]'),
    -- ainda em falta (sem stock nem encomenda: o produto sem fornecedor preferido): ficam por resolver
    'fora', coalesce((SELECT jsonb_agg(jsonb_build_object('n', ql.descricao_snapshot, 'q', r.qty_missing, 'motivo', 'sem fornecedor preferido'))
                  FROM quote_lines ql JOIN public.fn_client_order_line_reservations(p_org, ARRAY(SELECT product_id FROM quote_lines WHERE id = ANY (v_ids))) r
                    ON r.quote_line_id = ql.id AND r.contract_id = v_cc.id
                  WHERE ql.id = ANY (v_ids) AND r.qty_missing > 0
                    AND NOT EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.quote_line_id = ql.id)), '[]'),
    -- já cobertas pelo stock (reservadas para a obra, sem encomenda ao fornecedor)
    'reservadas', (SELECT count(*) FROM quote_lines ql JOIN public.fn_client_order_line_reservations(p_org, ARRAY(SELECT product_id FROM quote_lines WHERE id = ANY (v_ids))) r
                    ON r.quote_line_id = ql.id AND r.contract_id = v_cc.id
                  WHERE ql.id = ANY (v_ids) AND r.qty_missing <= 0
                    AND NOT EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.quote_line_id = ql.id)),
    'pedido', v_r,
    'encomenda_cliente', coalesce(v_cc.order_number, v_cc.contract_number)
  );
END $function$
;
