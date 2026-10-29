-- RASCUNHO (não aplicado). Negócio: a gravação do negócio deixa de repor na agenda as visitas que já são do CRM. Só muda uma função.
-- Problema: o passo Visitas novo marca a visita real na agenda por neg_guardar_visita (origin 'manual', visita_numero NULL) e escreve no negócio da Emylia
-- um espelho (v<n>_data, v<n>_hora, ..., e a marca v<n>_crm = id da linha real de schedule_items). Ao gravar o negócio, a fn_neg_sincronizar_visitas lia
-- esse espelho como se fosse uma visita só da Emylia, não encontrava nenhuma linha com visita_numero = n e INSERIA uma cópia 'auto': a visita ficava a dobrar.
-- Correção (a menor possível sobre a versão viva, 20270101000000, que mantém a duração pelo end_datetime):
--   1. Se v<n>_crm é um uuid válido e esse id existe em schedule_items deste negócio e desta organização, a visita n é do CRM: a função não lhe toca (CONTINUE).
--      Marca inválida ou id que não existe: segue o caminho de sempre, para não perder a visita.
--   2. Nesse caso, uma cópia automática antiga (origin 'auto', visita_numero = n), criada antes de a marca existir, fica cancelada e larga o número.
--   3. O cancelamento final («uma visita que já não existe na Emylia») só atinge linhas origin 'auto' desta organização; nunca as do CRM.
--   Tudo o resto igual: assinatura, SECURITY DEFINER, search_path, permissões, avisos.
-- Sem a marca v<n>_crm nada muda (visitas antigas só da Emylia; a Mudelar nunca escreve a marca).
-- Guarda: só substitui se a função na base for exatamente a da 20270101000000 (md5 medido a 29/10/2026 na base RH) e ainda não tiver a regra nova.

SET lock_timeout = '5s';

DO $guarda$
DECLARE
  v_n int; v_h text; v_def text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_neg_sincronizar_visitas';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Guarda: public.fn_neg_sincronizar_visitas tem % assinaturas (esperava 1).', v_n;
  END IF;
  SELECT md5(pg_get_functiondef(p.oid)), pg_get_functiondef(p.oid)::text INTO v_h, v_def FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_neg_sincronizar_visitas';
  IF position('_crm' IN v_def) > 0 THEN
    RAISE EXCEPTION 'Guarda: fn_neg_sincronizar_visitas já lê a marca v<n>_crm; esta migration não é precisa.';
  END IF;
  IF v_h <> '8c3191681ad746971c97a6f86886e1d4' THEN
    RAISE EXCEPTION 'Guarda: fn_neg_sincronizar_visitas no remoto já não é a da 20270101000000 (md5 %): rever antes de aplicar.', v_h;
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.fn_neg_sincronizar_visitas(p_org uuid, p_negocio uuid, p_respostas jsonb, p_visitas jsonb) RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_neg negocios; v_nome text; f jsonb; v_board uuid; n int; v_data text; v_hora text; v_ini timestamptz; v_min int;
  v_status schedule_item_status; v_kind text; v_id uuid; v_titulo text; v_avisos text[] := '{}'; v_user uuid := public.current_business_user_id();
  v_nums int[]; v_marca text; v_crm uuid;
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
    -- visita do CRM (marca v<n>_crm com o id de uma linha deste negócio): a agenda já a tem; não se procura, não se insere, não se atualiza
    v_marca := coalesce(f->>('v' || n || '_crm'), ''); v_crm := NULL;
    IF v_marca ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_crm := v_marca::uuid; END IF;
    IF v_crm IS NOT NULL AND EXISTS (SELECT 1 FROM schedule_items WHERE id = v_crm AND negocio_id = p_negocio AND organization_id = p_org) THEN
      BEGIN
        -- a cópia automática criada antes de existir a marca fica cancelada (mantém o número: a lista do passo Visitas esconde-a por ele), para não ficar a visita repetida
        UPDATE schedule_items SET status = 'cancelled', updated_at = now()
        WHERE negocio_id = p_negocio AND organization_id = p_org AND visita_numero = n AND origin = 'auto' AND status <> 'cancelled';
      EXCEPTION WHEN OTHERS THEN
        v_avisos := v_avisos || ('A cópia antiga da visita ' || n || ' não foi cancelada na agenda: ' || SQLERRM);
      END;
      CONTINUE;
    END IF;
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
  -- uma visita que já não existe na Emylia fica cancelada na agenda (só as cópias automáticas desta organização; nunca as do CRM)
  UPDATE schedule_items SET status = 'cancelled', updated_at = now()
  WHERE negocio_id = p_negocio AND organization_id = p_org AND origin = 'auto'
    AND visita_numero IS NOT NULL AND status <> 'cancelled' AND NOT (visita_numero = ANY (v_nums));
  RETURN v_avisos;
END $$;
REVOKE ALL ON FUNCTION public.fn_neg_sincronizar_visitas(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- conferir: uma só função, SECURITY DEFINER, search_path=public, EXECUTE só postgres/service_role, corpo com a regra nova
DO $conferir$
DECLARE
  v_n int; v_def text; v_sec boolean; v_cfg text; v_estranhos text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_neg_sincronizar_visitas';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: public.fn_neg_sincronizar_visitas tem % assinaturas (esperava 1).', v_n;
  END IF;
  SELECT pg_get_functiondef(p.oid)::text, p.prosecdef, p.proconfig::text,
         (SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ', ')
            FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           WHERE a.privilege_type = 'EXECUTE' AND (a.grantee = 0 OR a.grantee::regrole::text NOT IN ('postgres', 'service_role')))
    INTO v_def, v_sec, v_cfg, v_estranhos
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_neg_sincronizar_visitas';
  IF NOT v_sec THEN
    RAISE EXCEPTION 'Conferir: fn_neg_sincronizar_visitas deixou de ser SECURITY DEFINER.';
  END IF;
  IF v_cfg IS DISTINCT FROM '{search_path=public}' THEN
    RAISE EXCEPTION 'Conferir: search_path inesperado (%).', v_cfg;
  END IF;
  IF v_estranhos IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: EXECUTE concedido a mais do que postgres/service_role (%).', v_estranhos;
  END IF;
  IF position('_crm' IN v_def) = 0
     OR position('visita_numero = n AND origin = ''auto'' AND status <> ''cancelled''' IN v_def) = 0
     OR position('organization_id = p_org AND origin = ''auto''' IN v_def) = 0
     OR position('v_ini + make_interval(mins => v_min), v_user, p_org' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Conferir: o corpo de fn_neg_sincronizar_visitas não tem a regra nova (ou perdeu a correção da duração).';
  END IF;
END $conferir$;
