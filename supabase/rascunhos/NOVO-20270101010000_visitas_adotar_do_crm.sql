-- RASCUNHO. NAO ESTA APLICADO NEM NA PASTA DAS MIGRATIONS. Aplicar so com autorizacao, depois de testado na nike.
-- Negocio: a visita do CRM e a visita da Emylia passam a ser UMA so linha da agenda (sem duplicados).
--
-- PORQUE E PRECISO: o passo Visitas (pagina de Negocios e ficha do Pipeline) marca a visita no CRM (neg_guardar_visita com p_negocio_id: schedule_item com quadro,
-- recursos e horas livres reais) e deixa no negocio da Emylia um ESPELHO (campos v<n>_*, com a marca v<n>_crm = id do schedule_item). Ao gravar o negocio,
-- fn_neg_sincronizar_visitas (20270101000000) copia cada visita da Emylia para a agenda: como a visita do CRM nao tem visita_numero, ela criaria uma SEGUNDA
-- linha (sem recursos) para a mesma visita. Sem esta migration, cada visita marcada por este passo aparece duas vezes na agenda.
--
-- O QUE FAZ: so muda fn_neg_sincronizar_visitas. Quando o espelho tem a marca v<n>_crm:
--   1. a linha do CRM fica com visita_numero = n (adotada) e a sincronizacao NAO lhe escreve mais nada (a fonte e o CRM: titulo, hora, duracao, notas, recursos);
--   2. uma copia anterior da Emylia com o mesmo numero (a "sombra" criada antes desta migration) e APAGADA se for da sincronizacao (origin 'auto') e sem recursos;
--      senao larga o numero e fica cancelada. Largar o numero e obrigatorio: o indice unico schedule_items_negocio_visita_key (negocio_id, visita_numero)
--      WHERE visita_numero IS NOT NULL AND negocio_id IS NOT NULL conta tambem as linhas canceladas (CONFIRMADO no catalogo da RH).
--   3. o cancelamento final («visita que ja nao existe na Emylia») NUNCA toca numa visita adotada (id com marca v<n>_crm em qualquer chave do espelho) nem numa
--      que tenha recursos: uma gravacao com d.vis desatualizado (separador antigo, outra sessao) nao pode cancelar uma visita real do CRM. So se cancela no CRM, por acao explicita.
-- ORDEM DE ENTRADA: esta migration e o codigo (VisitasDoCrm, espelhoVisitaEmylia) entram JUNTOS. NAO publicar o codigo antes de a migration estar aplicada na RH
-- e testada na nike: sem ela, cada visita marcada por este passo aparece duas vezes na agenda real (a sombra sem recursos), mesmo que o ecra a esconda.
-- Sem a marca v<n>_crm tudo corre como hoje (visitas antigas so da Emylia, e a Mudelar, que nunca escreve a marca: nada muda para ela).
--
-- A CONFIRMAR ANTES DE APLICAR: (a) indice unico: CONFIRMADO por SELECT ao catalogo da RH (ver acima); (b) que o utilizador que grava o negocio pode fazer UPDATE em schedule_items (a funcao e SECURITY DEFINER: pode);
-- (c) medir o custo na nike antes do push (corre a cada gravacao de negocio).
-- O codigo que a usa ja esta escrito (VisitasDoCrm, espelhoVisitaEmylia): a migration e o codigo entram juntos.

SET lock_timeout = '5s';

DO $guarda$
BEGIN
  -- so substitui a versao da 20270101000000 (a que escreve end_datetime sem duration_minutes); se alguem a mudou, pára sem mexer
  IF position('make_interval(mins => v_min), v_user, p_org' IN pg_get_functiondef('public.fn_neg_sincronizar_visitas(uuid,uuid,jsonb,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_neg_sincronizar_visitas mudou desde a 20270101000000: rever este rascunho antes de o aplicar.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.fn_neg_sincronizar_visitas(p_org uuid, p_negocio uuid, p_respostas jsonb, p_visitas jsonb) RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_neg negocios; v_nome text; f jsonb; v_board uuid; n int; v_data text; v_hora text; v_ini timestamptz; v_min int;
  v_status schedule_item_status; v_kind text; v_id uuid; v_titulo text; v_avisos text[] := '{}'; v_user uuid := public.current_business_user_id();
  v_nums int[]; v_marca text; v_crm uuid; v_adotadas uuid[];
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND organization_id = p_org;
  IF NOT FOUND THEN RETURN v_avisos; END IF;
  SELECT coalesce(display_name, '') INTO v_nome FROM anew_entities WHERE id = v_neg.entity_id;
  SELECT coalesce(jsonb_object_agg(x->>'campo_chave', x->>'valor'), '{}') INTO f FROM jsonb_array_elements(public.fn_neg_lista(p_respostas)) x;
  -- todas as visitas do CRM que o espelho aponta (mesmo de numeros que d.vis ja nao lista): nunca se cancelam por aqui
  v_adotadas := ARRAY(SELECT x.value::uuid FROM jsonb_each_text(f) x
                       WHERE x.key ~ '^v[0-9]+_crm$' AND x.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  v_nums := ARRAY(SELECT (x #>> '{}')::int FROM jsonb_array_elements(public.fn_neg_lista(p_visitas)) x);
  SELECT id INTO v_board FROM schedule_boards
   WHERE organization_id = p_org AND coalesce(is_active, true) AND coalesce(board_type, '') <> 'time_off'
   ORDER BY (lower(name) LIKE '%visita%') DESC, created_at LIMIT 1;
  FOREACH n IN ARRAY v_nums LOOP
    -- a visita do CRM que o espelho aponta: adota-se e nao se escreve mais nada nela (a fonte e o CRM)
    v_marca := coalesce(f->>('v' || n || '_crm'), '');
    IF v_marca ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      BEGIN
        v_crm := v_marca::uuid;
        -- a sombra: apagada se for da sincronizacao e sem recursos; o que sobrar larga o numero (indice unico) e fica cancelado
        DELETE FROM schedule_items s
         WHERE s.negocio_id = p_negocio AND s.organization_id = p_org AND s.visita_numero = n AND s.id <> v_crm AND s.origin = 'auto'
           AND NOT EXISTS (SELECT 1 FROM schedule_item_assignees a WHERE a.item_id = s.id);
        UPDATE schedule_items SET status = 'cancelled', visita_numero = NULL, updated_at = now()
         WHERE negocio_id = p_negocio AND organization_id = p_org AND visita_numero = n AND id <> v_crm;
        UPDATE schedule_items SET visita_numero = n
         WHERE id = v_crm AND negocio_id = p_negocio AND organization_id = p_org AND visita_numero IS DISTINCT FROM n;
      EXCEPTION WHEN OTHERS THEN
        v_avisos := v_avisos || ('A visita ' || n || ' não ficou ligada à agenda: ' || SQLERRM);
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
  -- uma visita que já não existe na Emylia fica cancelada na agenda; nunca a adotada do CRM nem a que tem recursos (só se cancela no CRM, por ação explícita)
  UPDATE schedule_items s SET status = 'cancelled', updated_at = now()
  WHERE s.negocio_id = p_negocio AND s.visita_numero IS NOT NULL AND s.status <> 'cancelled' AND NOT (s.visita_numero = ANY (v_nums))
    AND NOT (s.id = ANY (v_adotadas))
    AND NOT EXISTS (SELECT 1 FROM schedule_item_assignees a WHERE a.item_id = s.id);
  RETURN v_avisos;
END $$;
REVOKE ALL ON FUNCTION public.fn_neg_sincronizar_visitas(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
