-- As contas de portal da Mudelar passam a apontar para a ficha real do cliente.
--
-- Muda UMA coluna, `anew_users.entity_id`, em 473 linhas. Mais nada.
-- Nao apaga nem marca a ficha duplicada. Nao toca em client_portal_users.
--
-- O QUE ACONTECEU
--
-- Ate 20261117010000, dar acesso ao portal fazia duas escritas por duas maos: a
-- Edge Function gravava a linha em `client_portal_users` com o `entity_id` da
-- ficha do documento partilhado -- a ficha REAL do cliente --, e o trigger
-- `handle_new_user`, ao ver a conta nova, criava uma SEGUNDA ficha e era a essa
-- que ligava a conta. Ficaram duas fichas da mesma pessoa: a verdadeira, com
-- telefone, morada e historico; e uma so com o nome e o email da conta.
--
--   client_portal_users
--     |- entity_id ---------------------------> ficha ORIGINAL
--     |     (escrita pela Edge Function, e a ficha do documento partilhado)
--     |
--     \- auth_user_id --> anew_users.auth_user_id
--                             \- entity_id ---> ficha DUPLICADA
--                                   (escrita pelo trigger, ao criar a conta)
--
-- Cada linha de client_portal_users carrega as duas pontas. Quando diferem, o
-- par esta identificado -- e o registo a dize-lo, nao uma semelhanca de nome.
-- Por nome falharia: a duplicada tem o nome todo enfiado no `first_name`
-- ("HELENA DUARTE HELENA DUARTE HELENA DUARTE") e a original tem-no repartido
-- ("HELENA" / "DUARTE").
--
-- O QUE ESTA AGARRADO AS FICHAS DUPLICADAS
--
-- Lido do lado do servidor, sem RLS -- uma leitura pela aplicacao, com RLS, nao
-- via as linhas de email e dizia que estas fichas estavam vazias. Nao estao:
--
--   anew_entity_emails ................ 1 por ficha (o email da propria conta)
--   as outras 30 colunas do esquema
--   que referenciam uma entidade ...... 0
--
-- Zero clientes, contactos, leads, propostas, contratos, orcamentos, negocios,
-- interaccoes, telefones, moradas, ligacoes a organizacao, entidades fiscais,
-- documentos, acessos ao portal, documentos do portal, etiquetas, registo de
-- emails, emails agendados, notificacoes, submissoes de formulario, pedidos de
-- apagamento, historico, relacoes, papeis, organizacoes, auditoria e registo de
-- alteracoes. O travao aqui em baixo confirma isto linha a linha e para se
-- encontrar seja o que for alem desse unico email.
--
-- PORQUE SAO 473 E NAO 489
--
--   473  o email da duplicada JA existe na ficha original -- abandonar a
--        duplicada nao tira nada a ninguem.                       <-- ESTA MIGRACAO
--     6  o email so existe na duplicada (1 caso) ou a original tem outro
--        email (5 casos). Ficam de fora: pos o email do portal na ficha do
--        cliente e decisao de negocio, nao de migracao.
--    10  cinco fichas originais partilhadas por duas contas cada. Uma delas
--        tem nomes diferentes dos dois lados e precisa de olho humano.
--
-- Ficam tambem de fora tres casos ja conhecidos: uma conta ja correcta, uma
-- linha de portal sem ficha guardada, e uma conta sem linha de portal nenhuma.
--
-- O PORTAL NAO PERDE NADA
--
-- Verificado no codigo, ecra a ecra: o portal do cliente nunca le
-- `anew_users.entity_id`. Propostas, contratos, documentos e a regra que
-- autoriza descarregar os ficheiros resolvem-se por `client_portal_users` (pelo
-- proposal_id/contract_id/quote_id, ou pelo entity_id dessa mesma tabela) e pelo
-- auth_user_id. Esta migracao nao toca nessa tabela.
--
-- A LISTA AUTORIZADA
--
-- Nao vem colada aqui. Os pares sao recalculados contra a base e tem de estar
-- todos dentro do que ficou guardado em `anew_users_ligacao_ficha_backup`
-- (20261117040000) com `a_corrigir = true`. Se algo mudou entretanto, isto para
-- e nao escreve nada.
--
-- COMO SE DESFAZ
--
--   UPDATE public.anew_users u
--      SET entity_id = b.entity_id_anterior
--     FROM public.anew_users_ligacao_ficha_backup b
--    WHERE b.id = u.id AND u.entity_id = b.entity_id_original;

BEGIN;

-- ============================================================
-- 1. Os pares, recalculados agora contra a base
-- ============================================================
CREATE TEMP TABLE pares ON COMMIT DROP AS
SELECT DISTINCT
       au.id         AS conta,
       au.entity_id  AS duplicada,
       cpu.entity_id AS original
  FROM public.client_portal_users cpu
  JOIN public.anew_users au ON au.auth_user_id = cpu.auth_user_id
 WHERE cpu.organization_id = '3242e925-da26-459a-8258-be04d904e355'::uuid  -- Mudelar
   AND cpu.entity_id IS NOT NULL
   AND au.entity_id  IS NOT NULL
   AND au.entity_id IS DISTINCT FROM cpu.entity_id;

-- as que avancam: um para um, E com o email ja presente na ficha original
CREATE TEMP TABLE a_corrigir ON COMMIT DROP AS
SELECT p.*
  FROM pares p
 WHERE (SELECT count(*) FROM pares p2 WHERE p2.original = p.original) = 1
   AND EXISTS (
     SELECT 1
       FROM public.anew_entity_emails ed
       JOIN public.anew_entity_emails eo
         ON lower(trim(eo.email)) = lower(trim(ed.email))
        AND eo.entity_id = p.original
      WHERE ed.entity_id = p.duplicada);

-- ============================================================
-- 2. Travoes. Qualquer um destes para tudo, sem escrever nada.
-- ============================================================
DO $guardas$
DECLARE
  v_n       integer;
  v_ambiguo integer;
  v_fora    integer;
  v_drift   integer;
  v_presa   integer;
  v_mails   integer;
  v_orig_ma integer;
BEGIN
  SELECT count(*) INTO v_n FROM a_corrigir;

  -- 2.1 uma conta nao pode ter duas fichas originais candidatas
  SELECT count(*) INTO v_ambiguo
    FROM (SELECT conta FROM a_corrigir GROUP BY conta HAVING count(DISTINCT original) > 1) x;
  IF v_ambiguo > 0 THEN
    RAISE EXCEPTION 'Ha % contas com mais do que uma ficha original candidata.', v_ambiguo;
  END IF;

  -- 2.2 tem de ser exactamente as 473 verificadas
  IF v_n <> 473 THEN
    RAISE EXCEPTION 'Esperava 473 contas a corrigir e encontrei %. A base mudou desde a verificacao.', v_n;
  END IF;

  -- 2.3 todas dentro da lista autorizada na copia de seguranca
  SELECT count(*) INTO v_fora
    FROM a_corrigir c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.anew_users_ligacao_ficha_backup b
      WHERE b.id = c.conta AND b.a_corrigir
        AND b.backup_motivo = 'ligar conta de portal a ficha original');
  IF v_fora > 0 THEN
    RAISE EXCEPTION 'Ha % contas fora da lista autorizada na copia de seguranca.', v_fora;
  END IF;

  -- 2.4 e as fichas tem de ser as mesmas que foram guardadas
  SELECT count(*) INTO v_drift
    FROM a_corrigir c
    JOIN public.anew_users_ligacao_ficha_backup b ON b.id = c.conta
   WHERE b.backup_motivo = 'ligar conta de portal a ficha original'
     AND (b.entity_id_anterior IS DISTINCT FROM c.duplicada
       OR b.entity_id_original IS DISTINCT FROM c.original);
  IF v_drift > 0 THEN
    RAISE EXCEPTION 'Ha % contas cujas fichas mudaram desde a copia de seguranca.', v_drift;
  END IF;

  -- 2.5 cada ficha duplicada tem de ter EXACTAMENTE um email, nem zero nem dois
  SELECT count(*) INTO v_mails
    FROM a_corrigir c
   WHERE (SELECT count(*) FROM public.anew_entity_emails e WHERE e.entity_id = c.duplicada) <> 1;
  IF v_mails > 0 THEN
    RAISE EXCEPTION 'Ha % fichas duplicadas que nao tem exactamente um email. Mudou alguma coisa; reconferir.', v_mails;
  END IF;

  -- 2.6 e nao pode ter mais nada agarrado, em nenhuma das outras 30 colunas
  SELECT count(*) INTO v_presa FROM (
          SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_clients                 x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_contacts                x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_leads                   x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.proposals                    x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.client_contracts             x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.quotes                       x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.deals                        x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.entity_interactions          x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_entity_phones           x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_entity_addresses        x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_entity_org_links        x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_entity_fiscal_entities  x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_entity_history          x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_entity_roles            x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_entity_relationships    x WHERE x.from_entity_id = c.duplicada OR x.to_entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.anew_organizations           x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.documents                    x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.client_portal_users          x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.client_portal_documents      x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.contact_tags                 x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.email_logs                   x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.scheduled_emails             x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.notifications                x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.form_submissions             x WHERE x.entity_id = c.duplicada OR x.conflicting_entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.data_erasure_requests        x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.entity_audit_log             x WHERE x.entity_id = c.duplicada)
    UNION SELECT c.duplicada FROM a_corrigir c WHERE EXISTS (SELECT 1 FROM public.entity_change_log            x WHERE x.entity_id = c.duplicada)
  ) x;
  IF v_presa > 0 THEN
    RAISE EXCEPTION 'Ha % fichas duplicadas com dados agarrados alem do email. Nao se juntam as cegas.', v_presa;
  END IF;

  -- 2.7 a ficha original tem de existir, estar activa e pertencer a organizacao
  SELECT count(*) INTO v_orig_ma
    FROM a_corrigir c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.anew_entities e
      JOIN public.anew_entity_org_links l ON l.entity_id = e.id
     WHERE e.id = c.original AND e.status = 'active');
  IF v_orig_ma > 0 THEN
    RAISE EXCEPTION 'Ha % fichas originais inexistentes, inactivas ou sem organizacao.', v_orig_ma;
  END IF;

  RAISE NOTICE 'Travoes passados: % contas a reapontar.', v_n;
END;
$guardas$;

-- ============================================================
-- 3. A alteracao. Uma coluna.
-- ============================================================
UPDATE public.anew_users u
   SET entity_id  = c.original,
       updated_at = now()
  FROM a_corrigir c
 WHERE u.id = c.conta;

-- ============================================================
-- 4. Conferir depois de escrever, ainda dentro da transaccao
-- ============================================================
DO $conferir$
DECLARE
  v_feitas    integer;
  v_por_fazer integer;
  v_docs      integer;
  v_perdidos  integer;
BEGIN
  -- as 473 apontam agora para a ficha guardada como original
  SELECT count(*) INTO v_feitas
    FROM public.anew_users u
    JOIN public.anew_users_ligacao_ficha_backup b ON b.id = u.id
   WHERE b.backup_motivo = 'ligar conta de portal a ficha original'
     AND u.entity_id = b.entity_id_original;
  IF v_feitas <> 473 THEN
    RAISE EXCEPTION 'So % das 473 contas ficaram a apontar para a ficha original.', v_feitas;
  END IF;

  -- sobram exactamente as 16 postas de lado (6 dos emails + 10 das partilhadas)
  SELECT count(*) INTO v_por_fazer
    FROM public.client_portal_users cpu
    JOIN public.anew_users au ON au.auth_user_id = cpu.auth_user_id
   WHERE cpu.organization_id = '3242e925-da26-459a-8258-be04d904e355'::uuid
     AND cpu.entity_id IS NOT NULL
     AND au.entity_id  IS NOT NULL
     AND au.entity_id IS DISTINCT FROM cpu.entity_id;
  IF v_por_fazer <> 16 THEN
    RAISE EXCEPTION 'Deviam sobrar 16 contas por corrigir e sobraram %.', v_por_fazer;
  END IF;

  -- o portal continua a mostrar os mesmos documentos as mesmas contas
  SELECT count(*) INTO v_docs
    FROM public.client_portal_users cpu
    JOIN public.anew_users u ON u.auth_user_id = cpu.auth_user_id
    JOIN public.anew_users_ligacao_ficha_backup b
      ON b.id = u.id
     AND b.backup_motivo = 'ligar conta de portal a ficha original'
   WHERE u.entity_id = b.entity_id_original
     AND (cpu.proposal_id IS NOT NULL OR cpu.contract_id IS NOT NULL OR cpu.quote_id IS NOT NULL);
  IF v_docs <> 473 THEN
    RAISE EXCEPTION 'As linhas de acesso ao portal com documento passaram a %. Deviam ser 473.', v_docs;
  END IF;

  -- e nenhuma destas pessoas ficou sem o seu email na ficha
  SELECT count(*) INTO v_perdidos
    FROM public.anew_users u
    JOIN public.anew_users_ligacao_ficha_backup b ON b.id = u.id
   WHERE b.backup_motivo = 'ligar conta de portal a ficha original'
     AND u.entity_id = b.entity_id_original
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_entity_emails e
        WHERE e.entity_id = u.entity_id
          AND lower(trim(e.email)) = lower(trim(u.email)));
  IF v_perdidos > 0 THEN
    RAISE EXCEPTION 'Ha % pessoas cuja ficha nao tem o email da conta. Nao devia acontecer nenhuma.', v_perdidos;
  END IF;

  RAISE NOTICE 'Feito: 473 contas ligadas a ficha real, 16 postas de lado, portal intacto, nenhum email perdido.';
END;
$conferir$;

COMMIT;
