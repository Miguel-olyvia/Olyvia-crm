-- ============================================================
-- 20261222190000_validar_ligacoes_negocio
-- ============================================================
-- O que faz
--   Valida (VALIDATE CONSTRAINT) as nove restrições que as migrations
--   20261222130000 a 20261222180000 criaram NOT VALID:
--     client_contracts_negocio_id_fkey, proposals_negocio_id_fkey,
--     proposals_terms_check, quotes_negocio_id_fkey,
--     schedule_items_negocio_id_fkey, schedule_items_visit_outcome_check,
--     schedule_items_visit_kind_check, entity_interactions_negocio_id_fkey,
--     anew_leads_closure_result_check.
--   Valida SÓ estas: as quatro NOT VALID que já existiam antes desta fase
--   (anew_leads_conversao_coerente, quotes_site_address_id_fkey,
--   schedule_items_created_by_anew_users_fkey,
--   schedule_items_user_id_anew_users_fkey) ficam como estavam (o CONFERIR
--   confirma).
--
-- NÃO ALTERA nenhuma linha, coluna, função, trigger, política nem
--   configuração. Só muda o indicador convalidated destas nove restrições.
--   Nenhuma linha pode falhar: as colunas foram criadas nulas e todas as
--   escritas posteriores já foram verificadas pelas próprias restrições.
--
-- BLOQUEIOS (NÃO bloqueia leituras nem escritas): VALIDATE CONSTRAINT só
--   pede SHARE UPDATE EXCLUSIVE na tabela (convive com SELECT, INSERT,
--   UPDATE e DELETE; só colide com DDL, VACUUM e CREATE INDEX) e ROW SHARE
--   em negocios (para as chaves estrangeiras). Pedidos no início, por ordem
--   fixa, com NOWAIT (10 tentativas de 250 ms): se um autovacuum estiver a
--   correr numa das tabelas, a migration desiste sem nada feito e volta-se
--   a tentar. Seguros até ao COMMIT; durante esse tempo só o autovacuum e
--   DDL nas seis tabelas esperam.
--   Duração: um varrimento de cada tabela (o maior é anew_leads, 16 MB de
--   heap, e entity_interactions, 7,2 MB; varrimentos medidos a 19/10 de
--   5,5 ms e 44,5 ms). Estimativa: bem abaixo de 1 s (não medida).
--
-- EFEITO NA MUDELAR: nenhum (as escritas dela não esperam).
--
-- Aplicar só depois das seis migrations de colunas (a pré-condição aborta
--   se faltar alguma restrição). Numa só transacção: se falhar, nada fica.
--
-- PRECISA DE CÓDIGO: nada.
--
-- Reversão: não há (validar não muda dados; para desfazer a fase, as
--   reversões das tabelas largam as colunas e as restrições).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, extensions;

-- Bloqueios no início, por ordem fixa (negocios primeiro, a tabela depois,
-- igual em todas as migrations desta fase), com NOWAIT: nunca se entra em
-- fila. Se uma tabela estiver ocupada, o sub-bloco desfaz-se (larga o que
-- apanhou), espera 250 ms e repete, até 10 tentativas (cerca de 2,5 s);
-- depois aborta sem ter prendido ninguém e sem nada alterado.
DO $$
DECLARE
  v_tentativa int := 0;
BEGIN
  LOOP
    v_tentativa := v_tentativa + 1;
    BEGIN
      LOCK TABLE public.negocios             IN ROW SHARE MODE NOWAIT;
      LOCK TABLE public.client_contracts     IN SHARE UPDATE EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.proposals            IN SHARE UPDATE EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.quotes               IN SHARE UPDATE EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.schedule_items       IN SHARE UPDATE EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.entity_interactions  IN SHARE UPDATE EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.anew_leads           IN SHARE UPDATE EXCLUSIVE MODE NOWAIT;
      EXIT;
    EXCEPTION WHEN lock_not_available THEN
      IF v_tentativa >= 10 THEN
        RAISE EXCEPTION 'Tabelas ocupadas (autovacuum ou DDL): voltar a tentar mais tarde (% tentativas).', v_tentativa
          USING ERRCODE = 'lock_not_available';
      END IF;
      PERFORM pg_sleep(0.25);
    END;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_txt text;
BEGIN
  SELECT string_agg(e.t || '.' || e.c, ',') INTO v_txt
  FROM (VALUES
    ('client_contracts', 'client_contracts_negocio_id_fkey'),
    ('proposals', 'proposals_negocio_id_fkey'),
    ('proposals', 'proposals_terms_check'),
    ('quotes', 'quotes_negocio_id_fkey'),
    ('schedule_items', 'schedule_items_negocio_id_fkey'),
    ('schedule_items', 'schedule_items_visit_outcome_check'),
    ('schedule_items', 'schedule_items_visit_kind_check'),
    ('entity_interactions', 'entity_interactions_negocio_id_fkey'),
    ('anew_leads', 'anew_leads_closure_result_check')
  ) AS e(t, c)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.' || e.t) AND c.conname::text = e.c
  );
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam restrições (aplicar primeiro 20261222130000 a 20261222180000): %; nada feito.', v_txt;
  END IF;
END;
$$;

ALTER TABLE public.client_contracts VALIDATE CONSTRAINT client_contracts_negocio_id_fkey;
ALTER TABLE public.proposals VALIDATE CONSTRAINT proposals_negocio_id_fkey;
ALTER TABLE public.proposals VALIDATE CONSTRAINT proposals_terms_check;
ALTER TABLE public.quotes VALIDATE CONSTRAINT quotes_negocio_id_fkey;
ALTER TABLE public.schedule_items VALIDATE CONSTRAINT schedule_items_negocio_id_fkey;
ALTER TABLE public.schedule_items VALIDATE CONSTRAINT schedule_items_visit_outcome_check;
ALTER TABLE public.schedule_items VALIDATE CONSTRAINT schedule_items_visit_kind_check;
ALTER TABLE public.entity_interactions VALIDATE CONSTRAINT entity_interactions_negocio_id_fkey;
ALTER TABLE public.anew_leads VALIDATE CONSTRAINT anew_leads_closure_result_check;

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. restrições novas todas validadas
  v_txt := (SELECT string_agg(e.t || '.' || e.c || ':' || coalesce(c.convalidated::text, 'falta'), ',' ORDER BY e.t COLLATE "C", e.c COLLATE "C")
       FROM (VALUES
    ('client_contracts', 'client_contracts_negocio_id_fkey'),
    ('proposals', 'proposals_negocio_id_fkey'),
    ('proposals', 'proposals_terms_check'),
    ('quotes', 'quotes_negocio_id_fkey'),
    ('schedule_items', 'schedule_items_negocio_id_fkey'),
    ('schedule_items', 'schedule_items_visit_outcome_check'),
    ('schedule_items', 'schedule_items_visit_kind_check'),
    ('entity_interactions', 'entity_interactions_negocio_id_fkey'),
    ('anew_leads', 'anew_leads_closure_result_check')
       ) AS e(t, c)
       LEFT JOIN pg_constraint c ON c.conrelid = to_regclass('public.' || e.t) AND c.conname::text = e.c);
  IF v_txt IS DISTINCT FROM 'anew_leads.anew_leads_closure_result_check:true,client_contracts.client_contracts_negocio_id_fkey:true,entity_interactions.entity_interactions_negocio_id_fkey:true,proposals.proposals_negocio_id_fkey:true,proposals.proposals_terms_check:true,quotes.quotes_negocio_id_fkey:true,schedule_items.schedule_items_negocio_id_fkey:true,schedule_items.schedule_items_visit_kind_check:true,schedule_items.schedule_items_visit_outcome_check:true' THEN
    RAISE EXCEPTION 'CONFERIR (1. restrições novas todas validadas): obtido %, esperado anew_leads.anew_leads_closure_result_check:true,client_contracts.client_contracts_negocio_id_fkey:true,entity_interactions.entity_interactions_negocio_id_fkey:true,proposals.proposals_negocio_id_fkey:true,proposals.proposals_terms_check:true,quotes.quotes_negocio_id_fkey:true,schedule_items.schedule_items_negocio_id_fkey:true,schedule_items.schedule_items_visit_kind_check:true,schedule_items.schedule_items_visit_outcome_check:true', coalesce(v_txt, '(nulo)');
  END IF;

  -- 2. chaves estrangeiras continuam ON DELETE SET NULL para negocios
  v_txt := (SELECT count(*)
       FROM pg_constraint c
       WHERE c.conname::text IN ('client_contracts_negocio_id_fkey', 'proposals_negocio_id_fkey', 'quotes_negocio_id_fkey',
                                 'schedule_items_negocio_id_fkey', 'entity_interactions_negocio_id_fkey')
         AND c.contype::text = 'f' AND c.confdeltype::text = 'n'
         AND c.confrelid = 'public.negocios'::regclass)::text;
  IF v_txt IS DISTINCT FROM '5' THEN
    RAISE EXCEPTION 'CONFERIR (2. chaves estrangeiras continuam ON DELETE SET NULL para negocios): obtido %, esperado 5', coalesce(v_txt, '(nulo)');
  END IF;

  -- 3. restrições NOT VALID antigas continuam como estavam
  v_txt := (SELECT string_agg(c.conrelid::regclass::text || '.' || c.conname::text, ',' ORDER BY c.conname::text COLLATE "C")
       FROM pg_constraint c
       WHERE NOT c.convalidated
         AND c.conrelid IN ('public.client_contracts'::regclass, 'public.proposals'::regclass, 'public.quotes'::regclass,
                            'public.schedule_items'::regclass, 'public.entity_interactions'::regclass, 'public.anew_leads'::regclass));
  IF v_txt IS DISTINCT FROM 'anew_leads.anew_leads_conversao_coerente,quotes.quotes_site_address_id_fkey,schedule_items.schedule_items_created_by_anew_users_fkey,schedule_items.schedule_items_user_id_anew_users_fkey' THEN
    RAISE EXCEPTION 'CONFERIR (3. restrições NOT VALID antigas continuam como estavam): obtido %, esperado anew_leads.anew_leads_conversao_coerente,quotes.quotes_site_address_id_fkey,schedule_items.schedule_items_created_by_anew_users_fkey,schedule_items.schedule_items_user_id_anew_users_fkey', coalesce(v_txt, '(nulo)');
  END IF;

  -- 4. md5 restrições existentes de client_contracts
  v_txt := (SELECT md5(coalesce(string_agg(c.conname::text || '=' || pg_get_constraintdef(c.oid) || '=' || c.convalidated::text, E'\n' ORDER BY c.conname::text COLLATE "C"), ''))
       FROM pg_constraint c
       WHERE c.conrelid = 'public.client_contracts'::regclass
         AND c.conname::text NOT IN ('client_contracts_negocio_id_fkey', 'proposals_terms_check', 'schedule_items_visit_outcome_check', 'schedule_items_visit_kind_check', 'anew_leads_closure_result_check'));
  IF v_txt IS DISTINCT FROM '483888927a906c23468039d9ceccc871' THEN
    RAISE EXCEPTION 'CONFERIR (4. md5 restrições existentes de client_contracts): obtido %, esperado 483888927a906c23468039d9ceccc871', coalesce(v_txt, '(nulo)');
  END IF;

  -- 5. md5 restrições existentes de proposals
  v_txt := (SELECT md5(coalesce(string_agg(c.conname::text || '=' || pg_get_constraintdef(c.oid) || '=' || c.convalidated::text, E'\n' ORDER BY c.conname::text COLLATE "C"), ''))
       FROM pg_constraint c
       WHERE c.conrelid = 'public.proposals'::regclass
         AND c.conname::text NOT IN ('proposals_negocio_id_fkey', 'proposals_terms_check', 'schedule_items_visit_outcome_check', 'schedule_items_visit_kind_check', 'anew_leads_closure_result_check'));
  IF v_txt IS DISTINCT FROM '7869eddd7b0ebbd4153a016ecf95577b' THEN
    RAISE EXCEPTION 'CONFERIR (5. md5 restrições existentes de proposals): obtido %, esperado 7869eddd7b0ebbd4153a016ecf95577b', coalesce(v_txt, '(nulo)');
  END IF;

  -- 6. md5 restrições existentes de quotes
  v_txt := (SELECT md5(coalesce(string_agg(c.conname::text || '=' || pg_get_constraintdef(c.oid) || '=' || c.convalidated::text, E'\n' ORDER BY c.conname::text COLLATE "C"), ''))
       FROM pg_constraint c
       WHERE c.conrelid = 'public.quotes'::regclass
         AND c.conname::text NOT IN ('quotes_negocio_id_fkey', 'proposals_terms_check', 'schedule_items_visit_outcome_check', 'schedule_items_visit_kind_check', 'anew_leads_closure_result_check'));
  IF v_txt IS DISTINCT FROM 'c2e5ee27b951b6ecdd5d2542c44f7d54' THEN
    RAISE EXCEPTION 'CONFERIR (6. md5 restrições existentes de quotes): obtido %, esperado c2e5ee27b951b6ecdd5d2542c44f7d54', coalesce(v_txt, '(nulo)');
  END IF;

  -- 7. md5 restrições existentes de schedule_items
  v_txt := (SELECT md5(coalesce(string_agg(c.conname::text || '=' || pg_get_constraintdef(c.oid) || '=' || c.convalidated::text, E'\n' ORDER BY c.conname::text COLLATE "C"), ''))
       FROM pg_constraint c
       WHERE c.conrelid = 'public.schedule_items'::regclass
         AND c.conname::text NOT IN ('schedule_items_negocio_id_fkey', 'proposals_terms_check', 'schedule_items_visit_outcome_check', 'schedule_items_visit_kind_check', 'anew_leads_closure_result_check'));
  IF v_txt IS DISTINCT FROM 'ef4f3816b25a9acc666d0601c792a6c2' THEN
    RAISE EXCEPTION 'CONFERIR (7. md5 restrições existentes de schedule_items): obtido %, esperado ef4f3816b25a9acc666d0601c792a6c2', coalesce(v_txt, '(nulo)');
  END IF;

  -- 8. md5 restrições existentes de entity_interactions
  v_txt := (SELECT md5(coalesce(string_agg(c.conname::text || '=' || pg_get_constraintdef(c.oid) || '=' || c.convalidated::text, E'\n' ORDER BY c.conname::text COLLATE "C"), ''))
       FROM pg_constraint c
       WHERE c.conrelid = 'public.entity_interactions'::regclass
         AND c.conname::text NOT IN ('entity_interactions_negocio_id_fkey', 'proposals_terms_check', 'schedule_items_visit_outcome_check', 'schedule_items_visit_kind_check', 'anew_leads_closure_result_check'));
  IF v_txt IS DISTINCT FROM '16e6b40ff4e9d9a271d10bf72aa44d6b' THEN
    RAISE EXCEPTION 'CONFERIR (8. md5 restrições existentes de entity_interactions): obtido %, esperado 16e6b40ff4e9d9a271d10bf72aa44d6b', coalesce(v_txt, '(nulo)');
  END IF;

  -- 9. md5 restrições existentes de anew_leads
  v_txt := (SELECT md5(coalesce(string_agg(c.conname::text || '=' || pg_get_constraintdef(c.oid) || '=' || c.convalidated::text, E'\n' ORDER BY c.conname::text COLLATE "C"), ''))
       FROM pg_constraint c
       WHERE c.conrelid = 'public.anew_leads'::regclass
         AND c.conname::text NOT IN ('anew_leads_negocio_id_fkey', 'proposals_terms_check', 'schedule_items_visit_outcome_check', 'schedule_items_visit_kind_check', 'anew_leads_closure_result_check'));
  IF v_txt IS DISTINCT FROM '169d34e7e67d39ab86808eaaa632291e' THEN
    RAISE EXCEPTION 'CONFERIR (9. md5 restrições existentes de anew_leads): obtido %, esperado 169d34e7e67d39ab86808eaaa632291e', coalesce(v_txt, '(nulo)');
  END IF;
END;
$$;

COMMIT;
