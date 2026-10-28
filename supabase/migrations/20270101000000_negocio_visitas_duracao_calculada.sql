-- Negócio: as visitas da Emylia voltam a ir para a agenda (schedule_items). Só corrige uma função.
-- Defeito (visto a 28 de outubro de 2026 na base RH): a fn_neg_sincronizar_visitas (20261231970000) escrevia em
-- schedule_items.duration_minutes, que é uma coluna GENERATED ALWAYS (calculada pela base a partir de start_datetime e end_datetime).
-- O Postgres recusa ("cannot insert a non-DEFAULT value into column duration_minutes"): cada gravação do negócio devolvia o aviso
-- "A visita N não foi para a agenda" e nenhuma visita da Emylia chegava à agenda. A prova em PGlite não o apanhou porque a tabela de
-- teste não tinha a coluna calculada.
-- Correção: a duração vai só pelo end_datetime (a base calcula a duration_minutes); a comparação usa o end_datetime. O resto é igual.
-- As visitas que falharam entram na agenda na próxima gravação de cada negócio (a função corre em todas).
-- Guarda: só substitui se a função na base for a da 20261231970000 (com a linha do defeito); se alguém a mudou, pára sem mexer.

SET lock_timeout = '5s';

DO $guarda$
BEGIN
  -- o texto da 20261231970000 com o defeito (o md5 do texto muda entre versões do Postgres; esta linha não)
  IF position('make_interval(mins => v_min), v_min, v_user, p_org' IN pg_get_functiondef('public.fn_neg_sincronizar_visitas(uuid,uuid,jsonb,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_neg_sincronizar_visitas mudou desde a 20261231970000: rever esta migration antes de a aplicar.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.fn_neg_sincronizar_visitas(p_org uuid, p_negocio uuid, p_respostas jsonb, p_visitas jsonb) RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_neg negocios; v_nome text; f jsonb; v_board uuid; n int; v_data text; v_hora text; v_ini timestamptz; v_min int;
  v_status schedule_item_status; v_kind text; v_id uuid; v_titulo text; v_avisos text[] := '{}'; v_user uuid := public.current_business_user_id();
  v_nums int[];
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND organization_id = p_org;
  IF NOT FOUND THEN RETURN v_avisos; END IF;
  SELECT coalesce(display_name, '') INTO v_nome FROM anew_entities WHERE id = v_neg.entity_id;
  SELECT coalesce(jsonb_object_agg(x->>'campo_chave', x->>'valor'), '{}') INTO f FROM jsonb_array_elements(public.fn_neg_lista(p_respostas)) x;
  v_nums := ARRAY(SELECT (x #>> '{}')::int FROM jsonb_array_elements(public.fn_neg_lista(p_visitas)) x);
  SELECT id INTO v_board FROM schedule_boards
   WHERE organization_id = p_org AND coalesce(is_active, true) AND coalesce(board_type, '') <> 'time_off'
   ORDER BY (lower(name) LIKE '%visita%') DESC, created_at LIMIT 1;
  FOREACH n IN ARRAY v_nums LOOP
    v_data := f->>('v' || n || '_data'); v_hora := f->>('v' || n || '_hora');
    IF coalesce(v_data, '') = '' OR coalesce(v_hora, '') = '' THEN CONTINUE; END IF;
    IF v_board IS NULL THEN
      v_avisos := v_avisos || ('A organização não tem agenda de visitas: a visita ' || n || ' não foi para a agenda.');
      CONTINUE;
    END IF;
    BEGIN
      v_ini := (v_data || ' ' || v_hora)::timestamp AT TIME ZONE 'Europe/Lisbon';
      v_min := CASE f->>('v' || n || '_duracao') WHEN '30 min' THEN 30 WHEN '1 h' THEN 60 WHEN '2 h' THEN 120 ELSE 90 END;
      v_status := CASE f->>('v' || n || '_estado') WHEN 'Feita' THEN 'completed' WHEN 'Cancelada' THEN 'cancelled' ELSE 'scheduled' END;
      v_kind := CASE f->>('v' || n || '_tipo') WHEN 'Medição técnica' THEN 'medicao' WHEN 'Escolha de materiais' THEN 'materiais' WHEN 'Revisita' THEN 'revisita' ELSE 'levantamento' END;
      v_titulo := 'Visita ' || n || ' · ' || v_nome;
      SELECT id INTO v_id FROM schedule_items WHERE negocio_id = p_negocio AND visita_numero = n;
      IF v_id IS NULL THEN
        INSERT INTO schedule_items (board_id, title, status, origin, start_datetime, end_datetime, created_by, organization_id,
          negocio_id, entity_id, visit_kind, visita_numero, notes)
        VALUES (v_board, v_titulo, v_status, 'auto', v_ini, v_ini + make_interval(mins => v_min), v_user, p_org,
          p_negocio, v_neg.entity_id, v_kind, n, NULLIF(f->>('v' || n || '_combinado'), ''));
      ELSE
        UPDATE schedule_items SET title = v_titulo, status = v_status, start_datetime = v_ini, end_datetime = v_ini + make_interval(mins => v_min),
          visit_kind = v_kind, notes = NULLIF(f->>('v' || n || '_combinado'), ''), updated_at = now()
        WHERE id = v_id AND (title IS DISTINCT FROM v_titulo OR status IS DISTINCT FROM v_status OR start_datetime IS DISTINCT FROM v_ini
          OR end_datetime IS DISTINCT FROM v_ini + make_interval(mins => v_min) OR visit_kind IS DISTINCT FROM v_kind OR notes IS DISTINCT FROM NULLIF(f->>('v' || n || '_combinado'), ''));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_avisos := v_avisos || ('A visita ' || n || ' não foi para a agenda: ' || SQLERRM);
    END;
  END LOOP;
  -- uma visita que já não existe na Emylia fica cancelada na agenda
  UPDATE schedule_items SET status = 'cancelled', updated_at = now()
  WHERE negocio_id = p_negocio AND visita_numero IS NOT NULL AND status <> 'cancelled' AND NOT (visita_numero = ANY (v_nums));
  RETURN v_avisos;
END $$;
REVOKE ALL ON FUNCTION public.fn_neg_sincronizar_visitas(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
