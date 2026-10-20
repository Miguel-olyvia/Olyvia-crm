-- ============================================================
-- 20261226040000_nike_apagar_entidade_duplicada
-- ============================================================
-- Apaga da nike a pessoa duplicada 1cc0c467-fb33-4c02-8180-fb31fa6977ca ("TESTE E2E EmailConfirm", criada a
-- 30/07 por um teste E2E do formulário público). A lead dessa submissão (8a4de2b8-1010-455d-aa49-b53c2ef82c2a,
-- com visita agendada) já pertence à pessoa boa 6328142e-410f-4421-a544-5558ab754cfb; a duplicada ficou só com
-- um papel de lead sem lead, a ligação à nike, o email (o mesmo da boa) e um telefone. É ela que impede ligar a
-- pessoa boa à nike (trg_check_email_unique_on_org_link; ver 20261225180000).
--
-- Decisão do utilizador (repetida a 20/10): ELIMINAR. Perde-se o telefone 938471256, que a pessoa boa não tem
-- (aceite: a nike é só de teste). A pessoa boa NÃO é tocada por esta migration.
--
-- Lido na nike a 20/10 (só leitura, pelo CLI ligado), varrendo TODAS as colunas uuid e uuid[] das tabelas do
-- schema public (1588 + 2 colunas), e as colunas de texto com "id" no nome de todos os schemas:
--   anew_entities.id 1 | anew_entity_org_links 1 (nike, principal) | anew_entity_roles 1 (799e28e7..., lead,
--   activo, nike; não há lead viva desta pessoa) | anew_entity_emails 1 (0603a645...) | anew_entity_phones 1
--   (8962a0e5..., 938471256) | anew_entity_history 1 (02b00298..., "created") | entity_audit_log 4 (o rasto da
--   lead 8a4de2b8, tabela anew_leads). Nada mais: nenhuma lead, cliente, contacto, negócio, deal, visita,
--   levantamento, proposta, orçamento, contrato, venda, interacção, submissão, portal, etiqueta, notificação,
--   email ou SMS. Nenhuma ligação a outra organização (a Mudelar não é tocada).
--
-- Ordem (filhos antes do pai; só anew_entity_org_links tem chave estrangeira para anew_entities, em CASCADE,
-- e é apagada explicitamente na mesma):
--   1. anew_entity_emails  2. anew_entity_phones  3. anew_entity_history  4. anew_entity_org_links
--   5. anew_entity_roles   6. anew_entities
-- Triggers que correm (lidos a 20/10):
--   - trg_audit_anew_entity_emails / trg_audit_anew_entity_phones (fn_generic_entity_audit, AFTER DELETE):
--     escrevem UMA linha DELETE cada em entity_audit_log, com a linha apagada inteira em full_record (o
--     telefone perdido fica registado aí). A organização vem do papel ainda vivo, por isso apagam-se antes do
--     papel. O trigger engole os próprios erros: nunca faz falhar a migration.
--   - *_sync_entities_search_text (emails e telefones, AFTER DELETE): recalculam o search_text da própria
--     entidade duplicada (ainda existe); search_text é coluna ignorada pela auditoria, não escreve linha.
--     O AFTER UPDATE OF search_text de anew_entities actualiza quotes desta entidade: há 0.
--   - *_sync_clients_search_text: actualiza anew_clients desta entidade: há 0.
--   - trg_audit_anew_entities (AFTER DELETE): sem papel, lead, contacto nem cliente vivos já não resolve a
--     organização e sai sem escrever (comportamento da própria função). anew_entity_history,
--     anew_entity_org_links e anew_entity_roles não têm trigger de DELETE.
--   Esperado: +2 linhas em entity_audit_log (DELETE de email e de telefone).
-- O que NÃO se apaga: as 4 linhas de entity_audit_log com entity_id da duplicada. São o histórico da lead
--   8a4de2b8, que continua viva na pessoa boa; entity_audit_log não tem chave estrangeira, por isso ficam a
--   apontar para um id que deixa de existir (tal como as 2 novas linhas de DELETE).
--
-- Guarda: só apaga se, no momento da migration, tudo o que referencia a entidade for EXACTAMENTE o lido acima
--   (os mesmos ids, a mesma organização, sem lead viva), e se a mesma varredura de todas as colunas uuid e
--   uuid[] de public não encontrar mais nada. A linha da entidade fica trancada (FOR UPDATE) desde a guarda:
--   uma lead, cliente ou negócio novo para esta pessoa espera ou falha. Qualquer diferença: RAISE EXCEPTION e a
--   transacção inteira volta atrás, sem nada apagado.
-- Conferir no fim: a entidade e as 5 linhas filhas deixaram de existir; a varredura só encontra linhas de
--   entity_audit_log; a contagem de pessoas da nike desceu exactamente 1 (medido a 20/10: 491 pessoas da nike
--   com linha em anew_entities -> 490); a pessoa boa e todas as outras pessoas da nike (com emails, telefones,
--   papéis e ligações) ficam byte a byte iguais (md5 antes e depois, na mesma transacção). Uma escrita
--   concorrente noutra pessoa da nike entre a guarda e o fim faria abortar (limpo); basta voltar a correr.
--
-- Reversão: NÃO EXISTE. Apagar não se desfaz e esta migration não tem reversão que reponha dados. O que se
--   perde fica descrito em ../reversoes/R_20261226040000_nike_apagar_entidade_duplicada.sql (sem SQL).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $apagar$
DECLARE
  c_nike   CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_dup    CONSTANT uuid := '1cc0c467-fb33-4c02-8180-fb31fa6977ca';
  c_boa    CONSTANT uuid := '6328142e-410f-4421-a544-5558ab754cfb';
  c_lead   CONSTANT uuid := '8a4de2b8-1010-455d-aa49-b53c2ef82c2a';
  v_col    record;
  v_n      bigint;
  v_extra  text := '';
  v_rows   bigint;
  v_pessoas_nike bigint;
  v_md5_boa      text;
  v_md5_outras   text;
  v_txt          text;
BEGIN
  -- 1. A entidade existe, é a pessoa lida a 20/10, e fica trancada até ao fim da transacção.
  PERFORM 1 FROM public.anew_entities e
   WHERE e.id = c_dup AND e.type = 'person' AND e.display_name = 'TESTE E2E EmailConfirm'
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guarda: a entidade % não existe ou mudou (esperado: pessoa "TESTE E2E EmailConfirm").', c_dup;
  END IF;

  -- 2. Ligada SÓ à nike.
  SELECT count(*) INTO v_n FROM public.anew_entity_org_links l WHERE l.entity_id = c_dup;
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links l
                              WHERE l.entity_id = c_dup AND l.organization_id = c_nike) THEN
    RAISE EXCEPTION 'Guarda: a entidade % tem % ligações (esperado: 1, só à nike).', c_dup, v_n;
  END IF;

  -- 3. Um só papel: lead, nike, o lido a 20/10; e nenhuma lead (viva ou não) desta pessoa.
  SELECT count(*) INTO v_n FROM public.anew_entity_roles r WHERE r.entity_id = c_dup;
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.anew_entity_roles r
                              WHERE r.entity_id = c_dup AND r.id = '799e28e7-e7e0-49bb-b8c9-0cf447a148ac'
                                AND r.organization_id = c_nike AND r.role = 'lead') THEN
    RAISE EXCEPTION 'Guarda: a entidade % tem % papéis (esperado: 1, lead na nike, 799e28e7...).', c_dup, v_n;
  END IF;

  -- 4. Um email, um telefone e uma linha de histórico, os lidos a 20/10.
  SELECT count(*) INTO v_n FROM public.anew_entity_emails x WHERE x.entity_id = c_dup;
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.anew_entity_emails x
                              WHERE x.entity_id = c_dup AND x.id = '0603a645-4b9a-4697-8335-84a13899b64e') THEN
    RAISE EXCEPTION 'Guarda: a entidade % tem % emails (esperado: 1, 0603a645...).', c_dup, v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_entity_phones x WHERE x.entity_id = c_dup;
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.anew_entity_phones x
                              WHERE x.entity_id = c_dup AND x.id = '8962a0e5-da5f-4feb-8338-425090e4a918') THEN
    RAISE EXCEPTION 'Guarda: a entidade % tem % telefones (esperado: 1, 8962a0e5...).', c_dup, v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_entity_history x WHERE x.entity_id = c_dup;
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.anew_entity_history x
                              WHERE x.entity_id = c_dup AND x.id = '02b00298-81ec-45d6-b528-9fe0048c872e') THEN
    RAISE EXCEPTION 'Guarda: a entidade % tem % linhas de histórico (esperado: 1, 02b00298...).', c_dup, v_n;
  END IF;

  -- 5. Auditoria: só as 4 linhas do rasto da lead 8a4de2b8 (que é da pessoa boa). Não se apagam.
  SELECT count(*) INTO v_n FROM public.entity_audit_log a WHERE a.entity_id = c_dup;
  IF v_n <> 4 OR EXISTS (SELECT 1 FROM public.entity_audit_log a
                          WHERE a.entity_id = c_dup
                            AND (a.table_name IS DISTINCT FROM 'anew_leads' OR a.record_id IS DISTINCT FROM c_lead
                                 OR a.organization_id IS DISTINCT FROM c_nike)) THEN
    RAISE EXCEPTION 'Guarda: a entidade % tem % linhas de auditoria (esperado: 4, todas da lead 8a4de2b8 na nike).', c_dup, v_n;
  END IF;

  -- 6. Varredura: nenhuma outra coluna uuid ou uuid[] de nenhuma tabela de public referencia a entidade.
  FOR v_col IN
    SELECT c.relname::text AS t, a.attname::text AS col, (a.atttypid = 'uuid[]'::regtype) AS is_array
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p') AND NOT c.relispartition
       AND a.attnum > 0 AND NOT a.attisdropped
       AND a.atttypid IN ('uuid'::regtype, 'uuid[]'::regtype)
     ORDER BY 1, 2
  LOOP
    IF v_col.is_array THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE $1 = ANY(%I)', v_col.t, v_col.col) INTO v_n USING c_dup;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_col.t, v_col.col) INTO v_n USING c_dup;
    END IF;
    IF v_n > 0 AND (v_col.t, v_col.col, v_n) NOT IN (
         ('anew_entities', 'id', 1::bigint),
         ('anew_entity_org_links', 'entity_id', 1::bigint),
         ('anew_entity_roles', 'entity_id', 1::bigint),
         ('anew_entity_emails', 'entity_id', 1::bigint),
         ('anew_entity_phones', 'entity_id', 1::bigint),
         ('anew_entity_history', 'entity_id', 1::bigint),
         ('entity_audit_log', 'entity_id', 4::bigint)) THEN
      v_extra := v_extra || format(' %s.%s=%s', v_col.t, v_col.col, v_n);
    END IF;
  END LOOP;
  IF v_extra <> '' THEN
    RAISE EXCEPTION 'Guarda: a entidade % tem referências não esperadas:%', c_dup, v_extra;
  END IF;

  -- 7. Fotografia antes: pessoas da nike, a pessoa boa, e todas as outras pessoas da nike.
  SELECT count(*) INTO v_pessoas_nike
    FROM (SELECT entity_id FROM public.anew_entity_org_links WHERE organization_id = c_nike
          UNION SELECT entity_id FROM public.anew_entity_roles WHERE organization_id = c_nike
          UNION SELECT entity_id FROM public.anew_leads WHERE organization_id = c_nike AND entity_id IS NOT NULL
          UNION SELECT entity_id FROM public.anew_clients WHERE organization_id = c_nike AND entity_id IS NOT NULL) p
    JOIN public.anew_entities e ON e.id = p.entity_id;

  SELECT md5(coalesce((SELECT e::text FROM public.anew_entities e WHERE e.id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.id) FROM public.anew_entity_emails x WHERE x.entity_id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.id) FROM public.anew_entity_phones x WHERE x.entity_id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.id) FROM public.anew_entity_roles x WHERE x.entity_id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.organization_id) FROM public.anew_entity_org_links x WHERE x.entity_id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.id) FROM public.anew_leads x WHERE x.entity_id = c_boa), '-'))
    INTO v_md5_boa;

  WITH p AS (
    SELECT entity_id FROM public.anew_entity_org_links WHERE organization_id = c_nike
    UNION SELECT entity_id FROM public.anew_entity_roles WHERE organization_id = c_nike
    UNION SELECT entity_id FROM public.anew_leads WHERE organization_id = c_nike AND entity_id IS NOT NULL
    UNION SELECT entity_id FROM public.anew_clients WHERE organization_id = c_nike AND entity_id IS NOT NULL
  ), s AS (
    SELECT 'e' || e.id::text AS k, e::text AS t FROM public.anew_entities e
     WHERE e.id <> c_dup AND e.id IN (SELECT p.entity_id FROM p)
    UNION ALL SELECT 'm' || x.id::text, x::text FROM public.anew_entity_emails x
     WHERE x.entity_id <> c_dup AND x.entity_id IN (SELECT p.entity_id FROM p)
    UNION ALL SELECT 't' || x.id::text, x::text FROM public.anew_entity_phones x
     WHERE x.entity_id <> c_dup AND x.entity_id IN (SELECT p.entity_id FROM p)
    UNION ALL SELECT 'r' || x.id::text, x::text FROM public.anew_entity_roles x
     WHERE x.entity_id <> c_dup AND x.entity_id IN (SELECT p.entity_id FROM p)
    UNION ALL SELECT 'l' || x.entity_id::text || x.organization_id::text, x::text FROM public.anew_entity_org_links x
     WHERE x.entity_id <> c_dup AND x.entity_id IN (SELECT p.entity_id FROM p)
  )
  SELECT md5(coalesce(string_agg(s.t, '|' ORDER BY s.k), '-')) FROM s
    INTO v_md5_outras;

  -- 8. Apagar, filhos antes do pai; cada DELETE tem de apagar exactamente 1 linha.
  DELETE FROM public.anew_entity_emails WHERE entity_id = c_dup AND id = '0603a645-4b9a-4697-8335-84a13899b64e';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Apagar: % emails apagados (esperado 1).', v_rows; END IF;

  DELETE FROM public.anew_entity_phones WHERE entity_id = c_dup AND id = '8962a0e5-da5f-4feb-8338-425090e4a918';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Apagar: % telefones apagados (esperado 1).', v_rows; END IF;

  DELETE FROM public.anew_entity_history WHERE entity_id = c_dup AND id = '02b00298-81ec-45d6-b528-9fe0048c872e';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Apagar: % linhas de histórico apagadas (esperado 1).', v_rows; END IF;

  DELETE FROM public.anew_entity_org_links WHERE entity_id = c_dup AND organization_id = c_nike;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Apagar: % ligações apagadas (esperado 1).', v_rows; END IF;

  DELETE FROM public.anew_entity_roles WHERE entity_id = c_dup AND id = '799e28e7-e7e0-49bb-b8c9-0cf447a148ac';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Apagar: % papéis apagados (esperado 1).', v_rows; END IF;

  DELETE FROM public.anew_entities WHERE id = c_dup;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Apagar: % entidades apagadas (esperado 1).', v_rows; END IF;

  -- 9. CONFERIR.
  -- 9a. Varredura depois: só entity_audit_log pode ainda ter o id (as 4 do rasto da lead e até 2 DELETE novas,
  --     de email e de telefone; o trigger de auditoria pode não escrever se algo o desligar, nunca escreve mais).
  v_extra := '';
  FOR v_col IN
    SELECT c.relname::text AS t, a.attname::text AS col, (a.atttypid = 'uuid[]'::regtype) AS is_array
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p') AND NOT c.relispartition
       AND a.attnum > 0 AND NOT a.attisdropped
       AND a.atttypid IN ('uuid'::regtype, 'uuid[]'::regtype)
     ORDER BY 1, 2
  LOOP
    IF v_col.is_array THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE $1 = ANY(%I)', v_col.t, v_col.col) INTO v_n USING c_dup;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_col.t, v_col.col) INTO v_n USING c_dup;
    END IF;
    IF v_n > 0 AND NOT (v_col.t = 'entity_audit_log' AND v_col.col = 'entity_id') THEN
      v_extra := v_extra || format(' %s.%s=%s', v_col.t, v_col.col, v_n);
    END IF;
  END LOOP;
  IF v_extra <> '' THEN
    RAISE EXCEPTION 'Conferir: ficaram referências à entidade apagada:%', v_extra;
  END IF;

  IF EXISTS (SELECT 1 FROM public.entity_audit_log a
              WHERE a.entity_id = c_dup
                AND NOT (a.table_name = 'anew_leads' AND a.record_id = c_lead)
                AND NOT (a.operation = 'DELETE'
                         AND ((a.table_name = 'anew_entity_emails' AND a.record_id = '0603a645-4b9a-4697-8335-84a13899b64e')
                           OR (a.table_name = 'anew_entity_phones' AND a.record_id = '8962a0e5-da5f-4feb-8338-425090e4a918')))) THEN
    RAISE EXCEPTION 'Conferir: há linhas de auditoria inesperadas para a entidade apagada.';
  END IF;
  SELECT count(*) INTO v_n FROM public.entity_audit_log a WHERE a.entity_id = c_dup;
  IF v_n NOT BETWEEN 4 AND 6 THEN
    RAISE EXCEPTION 'Conferir: % linhas de auditoria para a entidade apagada (esperado 4 a 6).', v_n;
  END IF;
  RAISE NOTICE 'Linhas de auditoria escritas pelos DELETE: % (esperado 2).', v_n - 4;

  -- 9b. Pessoas da nike: menos exactamente 1.
  SELECT count(*) INTO v_n
    FROM (SELECT entity_id FROM public.anew_entity_org_links WHERE organization_id = c_nike
          UNION SELECT entity_id FROM public.anew_entity_roles WHERE organization_id = c_nike
          UNION SELECT entity_id FROM public.anew_leads WHERE organization_id = c_nike AND entity_id IS NOT NULL
          UNION SELECT entity_id FROM public.anew_clients WHERE organization_id = c_nike AND entity_id IS NOT NULL) p
    JOIN public.anew_entities e ON e.id = p.entity_id;
  IF v_n <> v_pessoas_nike - 1 THEN
    RAISE EXCEPTION 'Conferir: pessoas da nike passaram de % para % (esperado %).', v_pessoas_nike, v_n, v_pessoas_nike - 1;
  END IF;

  -- 9c. A pessoa boa e todas as outras pessoas da nike ficam iguais.
  IF md5(coalesce((SELECT e::text FROM public.anew_entities e WHERE e.id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.id) FROM public.anew_entity_emails x WHERE x.entity_id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.id) FROM public.anew_entity_phones x WHERE x.entity_id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.id) FROM public.anew_entity_roles x WHERE x.entity_id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.organization_id) FROM public.anew_entity_org_links x WHERE x.entity_id = c_boa), '-')
          || coalesce((SELECT string_agg(x::text, '|' ORDER BY x.id) FROM public.anew_leads x WHERE x.entity_id = c_boa), '-'))
     IS DISTINCT FROM v_md5_boa THEN
    RAISE EXCEPTION 'Conferir: a pessoa boa % mudou.', c_boa;
  END IF;
  WITH p AS (
    SELECT entity_id FROM public.anew_entity_org_links WHERE organization_id = c_nike
    UNION SELECT entity_id FROM public.anew_entity_roles WHERE organization_id = c_nike
    UNION SELECT entity_id FROM public.anew_leads WHERE organization_id = c_nike AND entity_id IS NOT NULL
    UNION SELECT entity_id FROM public.anew_clients WHERE organization_id = c_nike AND entity_id IS NOT NULL
  ), s AS (
    SELECT 'e' || e.id::text AS k, e::text AS t FROM public.anew_entities e
     WHERE e.id <> c_dup AND e.id IN (SELECT p.entity_id FROM p)
    UNION ALL SELECT 'm' || x.id::text, x::text FROM public.anew_entity_emails x
     WHERE x.entity_id <> c_dup AND x.entity_id IN (SELECT p.entity_id FROM p)
    UNION ALL SELECT 't' || x.id::text, x::text FROM public.anew_entity_phones x
     WHERE x.entity_id <> c_dup AND x.entity_id IN (SELECT p.entity_id FROM p)
    UNION ALL SELECT 'r' || x.id::text, x::text FROM public.anew_entity_roles x
     WHERE x.entity_id <> c_dup AND x.entity_id IN (SELECT p.entity_id FROM p)
    UNION ALL SELECT 'l' || x.entity_id::text || x.organization_id::text, x::text FROM public.anew_entity_org_links x
     WHERE x.entity_id <> c_dup AND x.entity_id IN (SELECT p.entity_id FROM p)
  )
  SELECT md5(coalesce(string_agg(s.t, '|' ORDER BY s.k), '-')) FROM s
    INTO v_txt;
  IF v_txt IS DISTINCT FROM v_md5_outras THEN
    RAISE EXCEPTION 'Conferir: outras pessoas da nike mudaram durante a migration.';
  END IF;

  RAISE NOTICE 'Entidade % apagada. Pessoas da nike: % -> %.', c_dup, v_pessoas_nike, v_n;
END
$apagar$;

COMMIT;
