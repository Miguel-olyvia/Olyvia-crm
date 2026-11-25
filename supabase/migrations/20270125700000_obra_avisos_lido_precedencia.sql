-- 23/11 (F2): o técnico de obra volta a gravar a execução das suas tarefas.
-- fn_obra_execucao_permitida (a regra de quem grava a obra sem negocios.obra.planear, chamada por obra_guardar_negocio): no ciclo dos
-- avisos aos técnicos, `a->'plano'->'avisos'->j - 'lido'` lia-se `a->'plano'->'avisos'->(j - 'lido')` (o `-` liga antes do `->`) e dava
-- 22P02 «invalid input syntax for type integer: "lido"» sempre que o plano tinha um aviso dele: recusava toda a gravação do técnico
-- (marcar a tarefa em curso/feita, registos, imprevistos, marcar o aviso como lido). Agora `(a->'plano'->'avisos'->j) - 'lido'`.
-- Mudança mínima, a partir da versão viva (pg_get_functiondef, ramo RH); o resto da função fica igual (as mesmas recusas).
-- Teste: supabase/tests/obra_tecnico_grava_execucao.test.sql
CREATE OR REPLACE FUNCTION public.fn_obra_execucao_permitida(p_antes jsonb, p_depois jsonb, p_eu uuid)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
      IF x->>'tec' = eu AND (a->'plano'->'avisos'->j->>'tec') = eu AND (x - 'lido') = ((a->'plano'->'avisos'->j) - 'lido') THEN
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
END $function$
;
