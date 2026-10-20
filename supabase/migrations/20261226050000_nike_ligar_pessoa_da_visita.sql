-- ============================================================
-- 20261226050000_nike_ligar_pessoa_da_visita
-- ============================================================
-- Liga à nike a pessoa 6328142e-410f-4421-a544-5558ab754cfb, dona da lead 8a4de2b8-1010-455d-aa49-b53c2ef82c2a
-- (viva, com a visita 38454e27-af1d-40c9-aaf2-8442df2b7573 agendada). Foi a única pessoa com lead viva que a
-- 20261225180000 deixou de fora de propósito: o email dela era o mesmo da duplicada
-- 1cc0c467-fb33-4c02-8180-fb31fa6977ca, ligada à nike, e o trigger trg_check_email_unique_on_org_link recusaria.
--
-- ORDEM OBRIGATÓRIA: a 20261226040000_nike_apagar_entidade_duplicada (que apaga a 1cc0c467) tem de estar
--   aplicada ANTES desta. Se a 1cc0c467 ainda existir, esta migration aborta sem escrever nada.
--
-- Lido na nike a 20/10 (só leitura, pelo CLI ligado), depois de aplicada a 20261226040000:
--   - 6328142e existe, type person; lead 8a4de2b8 viva na nike; visita 38454e27 com status scheduled;
--   - 0 ligações em anew_entity_org_links (nenhuma organização), 0 papéis, não é ficha de anew_users nem de
--     anew_organizations;
--   - 1 email (5252a6ff...); 2 outras entidades têm o mesmo email, nenhuma ligada à nike nem com lead ou papel
--     na nike (o trigger compara só nas organizações a que a pessoa fica ligada: só a nike);
--   - 0 linhas noutra organização nas tabelas da guarda alargada (as de 20261225160000/170000/180000);
--   - 1cc0c467 já não existe; 0 ligações com created_at 2026-12-26 05:00:00+00.
--
-- O que faz: UMA linha em anew_entity_org_links (6328142e, nike), is_primary = true se a pessoa não tiver outra
--   ligação principal, created_at e updated_at fixos em 2026-12-26 05:00:00+00 (o updated_at é reposto a now()
--   pelo trigger trg_anew_entity_org_links_single_primary). Não altera tabelas nem funções. A Mudelar não é tocada.
--
-- Guardas (qualquer uma falha: RAISE EXCEPTION e a transacção inteira volta atrás, sem nada escrito). A linha da
--   pessoa em anew_entities fica trancada (FOR UPDATE) desde a primeira guarda.
--   1. A pessoa existe e é type person, com lead ou cliente vivo na nike.
--   2. A duplicada 1cc0c467 já não existe (a 20261226040000 foi aplicada).
--   3. A pessoa não tem ligação à nike. Excepção, para ser idempotente: se a ligação existente for a desta
--      migration (created_at 2026-12-26 05:00:00+00), não faz nada e termina limpo.
--   4. Nenhuma outra linha de anew_entity_org_links tem o created_at desta migration (a reversão apaga por ele).
--   5. Nada noutra organização: ligação, lead, cliente ou papel vivos, nem linha (viva, nas que têm deleted_at)
--      em anew_contacts, client_contracts, client_portal_users, contact_tags, data_erasure_requests, deals,
--      direct_sales, entity_interactions, form_submissions (entity_id e conflicting_entity_id), levantamentos,
--      negocios, organization_counted_entities, proposals e quotes (a lista de 20261225160000/170000/180000).
--   6. Não é ficha de anew_users (não apagado) nem de anew_organizations.
--   7. Nenhum email não vazio da pessoa pertence (lower(btrim)) a outra entidade ligada à nike: é a mesma
--      comparação de fn_check_email_unique_within_org, feita antes para abortar com mensagem clara.
--
-- CONFERIR no fim: exactamente 1 linha inserida, e as linhas com o created_at desta migration são exactamente
--   essa (nike, 6328142e); a pessoa fica com 1 ligação no total e nenhuma a outra organização.
--
-- Reversão: fora da pasta das migrations (../reversoes/R_20261226050000_nike_ligar_pessoa_da_visita.sql; não
--   aplicar sem decisão). Apaga só a linha (nike, 6328142e, created_at 2026-12-26 05:00:00+00).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $ligar$
DECLARE
  c_nike   CONSTANT uuid        := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_boa    CONSTANT uuid        := '6328142e-410f-4421-a544-5558ab754cfb';
  c_dup    CONSTANT uuid        := '1cc0c467-fb33-4c02-8180-fb31fa6977ca';
  c_marca  CONSTANT timestamptz := TIMESTAMPTZ '2026-12-26 05:00:00+00';
  v_n      bigint;
  v_rows   bigint;
BEGIN
  -- 1. A pessoa existe, é person, e tem lead ou cliente vivo na nike. Fica trancada até ao fim.
  PERFORM 1 FROM public.anew_entities e WHERE e.id = c_boa AND e.type = 'person' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guarda: a entidade % não existe ou não é uma pessoa.', c_boa;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_leads l
                  WHERE l.entity_id = c_boa AND l.organization_id = c_nike AND l.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.anew_clients l
                      WHERE l.entity_id = c_boa AND l.organization_id = c_nike AND l.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Guarda: a entidade % não tem lead nem cliente vivo na nike.', c_boa;
  END IF;

  -- 2. A duplicada já foi apagada (20261226040000 aplicada antes).
  IF EXISTS (SELECT 1 FROM public.anew_entities e WHERE e.id = c_dup) THEN
    RAISE EXCEPTION 'Guarda: a entidade duplicada % ainda existe. Aplicar primeiro 20261226040000_nike_apagar_entidade_duplicada.', c_dup;
  END IF;

  -- 3. Ainda sem ligação à nike; se a ligação for a desta migration, já correu: termina sem fazer nada.
  IF EXISTS (SELECT 1 FROM public.anew_entity_org_links l
              WHERE l.entity_id = c_boa AND l.organization_id = c_nike AND l.created_at = c_marca) THEN
    RAISE NOTICE 'A entidade % já está ligada à nike por esta migration: nada a fazer.', c_boa;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.anew_entity_org_links l
              WHERE l.entity_id = c_boa AND l.organization_id = c_nike) THEN
    RAISE EXCEPTION 'Guarda: a entidade % já tem ligação à nike (não criada por esta migration).', c_boa;
  END IF;

  -- 4. A marca da reversão está livre.
  SELECT count(*) INTO v_n FROM public.anew_entity_org_links l WHERE l.created_at = c_marca;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: já há % ligações com created_at % (a reversão apagaria linhas que não são desta migration).', v_n, c_marca;
  END IF;

  -- 5. Nada noutra organização.
  IF EXISTS (SELECT 1 FROM public.anew_entity_org_links o WHERE o.entity_id = c_boa AND o.organization_id <> c_nike)
     OR EXISTS (SELECT 1 FROM public.anew_leads o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_clients o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_entity_roles o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_contacts o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_contracts o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_portal_users o WHERE o.entity_id = c_boa AND o.organization_id <> c_nike)
     OR EXISTS (SELECT 1 FROM public.contact_tags o WHERE o.entity_id = c_boa AND o.organization_id <> c_nike)
     OR EXISTS (SELECT 1 FROM public.data_erasure_requests o WHERE o.entity_id = c_boa AND o.organization_id <> c_nike)
     OR EXISTS (SELECT 1 FROM public.deals o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.direct_sales o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.entity_interactions o WHERE o.entity_id = c_boa AND o.organization_id <> c_nike)
     OR EXISTS (SELECT 1 FROM public.form_submissions o
                 WHERE (o.entity_id = c_boa OR o.conflicting_entity_id = c_boa)
                   AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.levantamentos o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.negocios o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.organization_counted_entities o WHERE o.entity_id = c_boa AND o.organization_id <> c_nike)
     OR EXISTS (SELECT 1 FROM public.proposals o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.quotes o
                 WHERE o.entity_id = c_boa AND o.organization_id <> c_nike AND o.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Guarda: a entidade % aparece noutra organização; não se liga à nike.', c_boa;
  END IF;

  -- 6. Não é ficha de utilizador nem de organização.
  IF EXISTS (SELECT 1 FROM public.anew_users u WHERE u.entity_id = c_boa AND u.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_organizations g WHERE g.entity_id = c_boa) THEN
    RAISE EXCEPTION 'Guarda: a entidade % é ficha de um utilizador ou de uma organização.', c_boa;
  END IF;

  -- 7. Nenhum email da pessoa pertence a outra entidade ligada à nike.
  SELECT count(DISTINCT y.entity_id) INTO v_n
    FROM public.anew_entity_emails x
    JOIN public.anew_entity_emails y
      ON lower(btrim(y.email)) = lower(btrim(x.email)) AND y.entity_id <> x.entity_id
    JOIN public.anew_entity_org_links ly
      ON ly.entity_id = y.entity_id AND ly.organization_id = c_nike
   WHERE x.entity_id = c_boa AND btrim(x.email) <> '';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: o email da entidade % pertence a % outra(s) pessoa(s) ligada(s) à nike.', c_boa, v_n;
  END IF;

  -- Ligar.
  INSERT INTO public.anew_entity_org_links (entity_id, organization_id, is_primary, created_at, updated_at)
  SELECT c_boa, c_nike,
         NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links p WHERE p.entity_id = c_boa AND p.is_primary),
         c_marca, c_marca;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Ligar: % linhas inseridas (esperado 1).', v_rows;
  END IF;

  -- CONFERIR.
  SELECT count(*) INTO v_n FROM public.anew_entity_org_links l WHERE l.created_at = c_marca;
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links l
                              WHERE l.created_at = c_marca AND l.entity_id = c_boa AND l.organization_id = c_nike) THEN
    RAISE EXCEPTION 'Conferir: % linhas com created_at % (esperado 1, nike e entidade %).', v_n, c_marca, c_boa;
  END IF;

  SELECT count(*) INTO v_n FROM public.anew_entity_org_links l WHERE l.entity_id = c_boa AND l.organization_id <> c_nike;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: a entidade % ficou ligada a % outra(s) organização(ões).', c_boa, v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.anew_entity_org_links l WHERE l.entity_id = c_boa;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: a entidade % tem % ligações (esperado 1, só à nike).', c_boa, v_n;
  END IF;

  RAISE NOTICE 'Entidade % ligada à nike.', c_boa;
END
$ligar$;

COMMIT;
