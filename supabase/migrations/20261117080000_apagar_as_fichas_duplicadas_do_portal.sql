-- Apagar as 473 fichas duplicadas da Mudelar que ficaram sem uso.
--
-- Vem a seguir a 20261117050000, que reapontou as contas de portal para a ficha
-- real do cliente. Depois disso, estas 473 fichas ficaram sem nada: sem conta a
-- apontar-lhes, sem ligacao a organizacao, sem papel, sem contactos alem do seu
-- proprio email, sem historico e sem auditoria. Nao aparecem em ecra nenhum do
-- CRM e nao podem ser emparelhadas por nenhuma lead nova (o emparelhador
-- `findLocalEntityForOrg` filtra os candidatos por `anew_entity_org_links`, e
-- estas nao tem nenhum). Sao lixo, e lixo tira-se.
--
-- O QUE ERAM
--
-- Ate 20261117010000, dar acesso ao portal criava, sem querer, uma segunda ficha
-- da pessoa: a Edge Function gravava o acesso apontado a ficha real, e o trigger
-- `handle_new_user` criava outra e ligava-lhe a conta. Estas 473 sao essas
-- segundas fichas, cada uma com o nome repetido e o email da propria conta --
-- email que, nestas 473, ja existe tambem na ficha real. Foi essa a condicao
-- para entrarem: nada se perde ao apaga-las.
--
-- O `created_by` de cada uma e a propria conta de portal que a originou. Nenhuma
-- destas contas criou mais nada no sistema (confirmado: 473 entidades criadas,
-- 473 sao a propria duplicada, zero sao outra coisa).
--
-- REVERSIVEL
--
-- As fichas e os emails sao copiados na integra antes de sair, para
-- anew_entities_apagadas_backup e anew_entity_emails_apagados_backup.
--
-- ORDEM
--
-- Ha 14 chaves estrangeiras a apontar para `anew_entities`: 3 apagam em cascata
-- e 4 impedem o apagar. Nenhuma tem linhas para estas 473, mas apaga-se pela
-- ordem certa a mesma -- emails primeiro, fichas depois -- em vez de confiar na
-- cascata para levar coisas a frente sem se ver.
--
-- FORA DISTO
--
-- Ficam as 16 fichas da Mudelar postas de lado (6 em que o email nao coincide,
-- 10 em que a ficha real tem duas contas), mais os tres casos conhecidos e as 6
-- de organizacoes de teste. Nada disso e tocado aqui.

BEGIN;

-- ============================================================
-- 1. As tabelas de copia
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anew_entities_apagadas_backup
  (LIKE public.anew_entities INCLUDING DEFAULTS);
ALTER TABLE public.anew_entities_apagadas_backup
  ADD COLUMN IF NOT EXISTS backup_em     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS backup_motivo text        NOT NULL DEFAULT 'ficha duplicada criada pelo acesso ao portal';

CREATE TABLE IF NOT EXISTS public.anew_entity_emails_apagados_backup
  (LIKE public.anew_entity_emails INCLUDING DEFAULTS);
ALTER TABLE public.anew_entity_emails_apagados_backup
  ADD COLUMN IF NOT EXISTS backup_em     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS backup_motivo text        NOT NULL DEFAULT 'ficha duplicada criada pelo acesso ao portal';

COMMENT ON TABLE public.anew_entities_apagadas_backup IS
  'Fichas apagadas em 20261117080000: as segundas fichas que o trigger '
  'handle_new_user criava ao dar acesso ao portal, depois de as contas terem '
  'sido reapontadas a ficha real. Copia integral, para repor se preciso.';
COMMENT ON TABLE public.anew_entity_emails_apagados_backup IS
  'Emails das fichas guardadas em anew_entities_apagadas_backup.';

-- ============================================================
-- 2. Quais sao
-- ============================================================
CREATE TEMP TABLE a_apagar ON COMMIT DROP AS
SELECT b.entity_id_anterior AS ficha, b.id AS conta
  FROM public.anew_users_ligacao_ficha_backup b
  JOIN public.anew_users u ON u.id = b.id
 WHERE b.backup_motivo = 'ligar conta de portal a ficha original'
   AND u.entity_id = b.entity_id_original;   -- a conta ja foi reapontada

-- ============================================================
-- 3. Travoes. Qualquer um para tudo, sem apagar nada.
-- ============================================================
DO $guardas$
DECLARE
  v_n      integer;
  v_existe integer;
  v_conta  integer;
  v_mails  integer;
  v_presa  integer;
  v_ja     integer;
BEGIN
  SELECT count(*) INTO v_n FROM a_apagar;
  IF v_n <> 473 THEN
    RAISE EXCEPTION 'Esperava 473 fichas a apagar e encontrei %. A base mudou; reconferir.', v_n;
  END IF;

  SELECT count(*) INTO v_existe FROM a_apagar a JOIN public.anew_entities e ON e.id = a.ficha;
  IF v_existe <> 473 THEN
    RAISE EXCEPTION 'So % das 473 fichas existem. Alguem ja lhes mexeu.', v_existe;
  END IF;

  SELECT count(*) INTO v_conta FROM public.anew_users u JOIN a_apagar a ON a.ficha = u.entity_id;
  IF v_conta > 0 THEN
    RAISE EXCEPTION 'Ha % contas ainda ligadas a fichas que ia apagar.', v_conta;
  END IF;

  SELECT count(*) INTO v_mails FROM a_apagar a
   WHERE (SELECT count(*) FROM public.anew_entity_emails e WHERE e.entity_id = a.ficha) <> 1;
  IF v_mails > 0 THEN
    RAISE EXCEPTION 'Ha % fichas sem exactamente um email. Mudou alguma coisa; reconferir.', v_mails;
  END IF;

  SELECT count(*) INTO v_ja
    FROM a_apagar a
    JOIN public.anew_users_ligacao_ficha_backup b ON b.id = a.conta
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.anew_entity_emails ed
       JOIN public.anew_entity_emails eo
         ON lower(trim(eo.email)) = lower(trim(ed.email))
        AND eo.entity_id = b.entity_id_original
      WHERE ed.entity_id = a.ficha);
  IF v_ja > 0 THEN
    RAISE EXCEPTION 'Ha % fichas cujo email deixou de existir na ficha real. Apagar perderia o email.', v_ja;
  END IF;

  SELECT count(*) INTO v_presa FROM (
          SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_clients                 x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_contacts                x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_leads                   x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.proposals                    x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.client_contracts             x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.quotes                       x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.deals                        x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.entity_interactions          x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_entity_phones           x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_entity_addresses        x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_entity_org_links        x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_entity_fiscal_entities  x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_entity_history          x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_entity_roles            x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_entity_relationships    x WHERE x.from_entity_id = a.ficha OR x.to_entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.anew_organizations           x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.documents                    x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.client_portal_users          x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.client_portal_documents      x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.contact_tags                 x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.email_logs                   x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.scheduled_emails             x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.notifications                x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.form_submissions             x WHERE x.entity_id = a.ficha OR x.conflicting_entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.data_erasure_requests        x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.entity_audit_log             x WHERE x.entity_id = a.ficha)
    UNION SELECT a.ficha FROM a_apagar a WHERE EXISTS (SELECT 1 FROM public.entity_change_log            x WHERE x.entity_id = a.ficha)
  ) x;
  IF v_presa > 0 THEN
    RAISE EXCEPTION 'Ha % fichas com dados agarrados alem do email. Nao se apagam.', v_presa;
  END IF;

  SELECT count(*) INTO v_ja FROM public.anew_entities_apagadas_backup;
  IF v_ja > 0 THEN
    RAISE EXCEPTION 'Ja existem % fichas guardadas na copia. Nao se corre isto duas vezes.', v_ja;
  END IF;

  RAISE NOTICE 'Travoes passados: % fichas a apagar.', v_n;
END;
$guardas$;

-- ============================================================
-- 4. Guardar antes de apagar
-- ============================================================
INSERT INTO public.anew_entity_emails_apagados_backup
SELECT e.*, now(), 'ficha duplicada criada pelo acesso ao portal'
  FROM public.anew_entity_emails e
  JOIN a_apagar a ON a.ficha = e.entity_id;

INSERT INTO public.anew_entities_apagadas_backup
SELECT e.*, now(), 'ficha duplicada criada pelo acesso ao portal'
  FROM public.anew_entities e
  JOIN a_apagar a ON a.ficha = e.id;

-- ============================================================
-- 5. Apagar -- emails primeiro, fichas depois
-- ============================================================
DELETE FROM public.anew_entity_emails e
 USING a_apagar a
 WHERE e.entity_id = a.ficha;

DELETE FROM public.anew_entities e
 USING a_apagar a
 WHERE e.id = a.ficha;

-- ============================================================
-- 6. Conferir, ainda dentro da transaccao
-- ============================================================
DO $conferir$
DECLARE
  v_fichas  integer;
  v_mails   integer;
  v_sobram  integer;
  v_contas  integer;
  v_perdido integer;
  v_lado    integer;
BEGIN
  SELECT count(*) INTO v_fichas FROM public.anew_entities_apagadas_backup;
  SELECT count(*) INTO v_mails  FROM public.anew_entity_emails_apagados_backup;
  IF v_fichas <> 473 OR v_mails <> 473 THEN
    RAISE EXCEPTION 'A copia ficou com % fichas e % emails. Esperava 473 e 473.', v_fichas, v_mails;
  END IF;

  SELECT count(*) INTO v_sobram FROM a_apagar a JOIN public.anew_entities e ON e.id = a.ficha;
  IF v_sobram <> 0 THEN
    RAISE EXCEPTION 'Sobraram % fichas por apagar.', v_sobram;
  END IF;

  SELECT count(*) INTO v_contas
    FROM public.client_portal_users cpu
    JOIN public.anew_users u ON u.auth_user_id = cpu.auth_user_id
   WHERE cpu.organization_id = '3242e925-da26-459a-8258-be04d904e355'::uuid
     AND u.entity_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.anew_entities e WHERE e.id = u.entity_id);
  -- 491 linhas de acesso na Mudelar, todas com conta cuja ficha existe. Inclui
  -- a linha que nao guardou entidade nenhuma: falta-lhe o entity_id a ela, nao
  -- a conta.
  IF v_contas <> 491 THEN
    RAISE EXCEPTION 'So % das 491 contas de portal apontam para fichas existentes.', v_contas;
  END IF;

  SELECT count(*) INTO v_perdido
    FROM public.anew_users u
    JOIN public.anew_users_ligacao_ficha_backup b ON b.id = u.id
   WHERE b.backup_motivo = 'ligar conta de portal a ficha original'
     AND u.entity_id = b.entity_id_original
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_entity_emails e
        WHERE e.entity_id = u.entity_id
          AND lower(trim(e.email)) = lower(trim(u.email)));
  IF v_perdido > 0 THEN
    RAISE EXCEPTION 'Ha % pessoas cuja ficha ficou sem o email da conta.', v_perdido;
  END IF;

  SELECT count(*) INTO v_lado
    FROM public.client_portal_users cpu
    JOIN public.anew_users au ON au.auth_user_id = cpu.auth_user_id
   WHERE cpu.organization_id = '3242e925-da26-459a-8258-be04d904e355'::uuid
     AND cpu.entity_id IS NOT NULL AND au.entity_id IS NOT NULL
     AND au.entity_id IS DISTINCT FROM cpu.entity_id;
  IF v_lado <> 16 THEN
    RAISE EXCEPTION 'As 16 postas de lado passaram a %.', v_lado;
  END IF;

  RAISE NOTICE 'Feito: 473 fichas apagadas e guardadas, 16 intactas, nenhum email perdido.';
END;
$conferir$;

-- ============================================================
-- 7. As copias tem dados de pessoas: fecham-se como o resto
-- ============================================================
ALTER TABLE public.anew_entities_apagadas_backup      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anew_entity_emails_apagados_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "So o system admin ve as fichas apagadas" ON public.anew_entities_apagadas_backup;
CREATE POLICY "So o system admin ve as fichas apagadas"
  ON public.anew_entities_apagadas_backup FOR SELECT TO authenticated
  USING (public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS "So o system admin ve os emails apagados" ON public.anew_entity_emails_apagados_backup;
CREATE POLICY "So o system admin ve os emails apagados"
  ON public.anew_entity_emails_apagados_backup FOR SELECT TO authenticated
  USING (public.is_system_admin(auth.uid()));

COMMIT;
