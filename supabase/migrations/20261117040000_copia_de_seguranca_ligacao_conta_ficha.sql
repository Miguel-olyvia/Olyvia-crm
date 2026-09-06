-- Copia de seguranca das contas de portal da Mudelar, ANTES de lhes mudar a ficha.
--
-- Esta migracao NAO ALTERA NADA. So guarda.
--
-- PORQUE EXISTE
--
-- Ate 20261117010000, dar acesso ao portal fazia duas escritas por duas maos: a
-- Edge Function gravava a linha em `client_portal_users` com o `entity_id` da
-- ficha do documento partilhado -- a ficha REAL do cliente --, e o trigger
-- `handle_new_user`, ao ver a conta nova, criava uma SEGUNDA ficha e era a essa
-- que ligava a conta. Ficaram duas fichas da mesma pessoa: a verdadeira, com
-- email, telefone, morada e historico; e uma vazia, so com o nome.
--
-- A origem esta tapada. Falta reapontar as contas antigas, e isso vai numa
-- migracao a parte. Esta e a rede por baixo: guarda a linha INTEIRA de cada
-- conta afectada, tal como esta hoje, para que a alteracao seja reversivel e
-- conferivel sem depender de nenhuma lista fora da base.
--
-- COMO SE SABE QUAL E A FICHA ORIGINAL DE CADA CONTA
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
-- Emparelhar por nome falharia: a duplicada tem o nome todo enfiado no
-- `first_name` e a original tem-no repartido em `first_name`/`last_name`.
--
-- O QUE FICA GUARDADO
--
-- As 489 contas da Mudelar cuja ficha diverge, cada uma com a linha completa e
-- com as duas fichas identificadas. A coluna `a_corrigir` separa-as:
--
--   true  (479) -- um para um: uma conta, uma ficha original so dela.
--   false ( 10) -- cinco fichas originais que tem DUAS contas a apontar-lhes.
--                  Ficam de fora ate alguem da Mudelar dizer se as duas contas
--                  sao mesmo da mesma pessoa. Uma delas tem nomes diferentes
--                  dos dois lados e precisa de olho humano.
--
-- Fora disto ficam tres casos ja identificados e deliberadamente ignorados: uma
-- conta ja correcta, uma linha de portal sem ficha guardada, e uma conta sem
-- linha de portal nenhuma.

BEGIN;

-- ============================================================
-- 1. A tabela: a linha inteira de anew_users, mais o que interessa saber depois
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anew_users_ligacao_ficha_backup
  (LIKE public.anew_users INCLUDING DEFAULTS);

ALTER TABLE public.anew_users_ligacao_ficha_backup
  ADD COLUMN IF NOT EXISTS backup_em          timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS backup_motivo      text        NOT NULL DEFAULT 'ligar conta de portal a ficha original',
  ADD COLUMN IF NOT EXISTS entity_id_anterior uuid,
  ADD COLUMN IF NOT EXISTS entity_id_original uuid,
  ADD COLUMN IF NOT EXISTS a_corrigir         boolean     NOT NULL DEFAULT true;

COMMENT ON TABLE public.anew_users_ligacao_ficha_backup IS
  'Copia integral das linhas de anew_users antes de lhes mudar o entity_id. '
  'Guardada em 20261117040000, para as contas de portal da Mudelar que ficaram '
  'ligadas a ficha vazia criada pelo trigger handle_new_user em vez da ficha '
  'real do cliente. entity_id_anterior e a ficha vazia; entity_id_original e a '
  'ficha verdadeira, lida de client_portal_users. Serve para desfazer e para '
  'conferir.';

COMMENT ON COLUMN public.anew_users_ligacao_ficha_backup.a_corrigir IS
  'true quando a conta e a ficha original sao um para um. false quando a mesma '
  'ficha original tem mais do que uma conta a apontar-lhe -- esses casos ficam '
  'de fora ate se confirmar se sao a mesma pessoa.';

-- ============================================================
-- 2. Os pares, calculados agora contra a base
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

-- ============================================================
-- 3. Travoes. Guardar a coisa errada e pior do que nao guardar nada.
-- ============================================================
DO $guardas$
DECLARE
  v_contas  integer;
  v_ambiguo integer;
  v_ja      integer;
BEGIN
  SELECT count(DISTINCT conta) INTO v_contas FROM pares;

  SELECT count(*) INTO v_ambiguo
    FROM (SELECT conta FROM pares GROUP BY conta HAVING count(DISTINCT original) > 1) x;
  IF v_ambiguo > 0 THEN
    RAISE EXCEPTION 'Ha % contas com mais do que uma ficha original candidata. A copia ficaria ambigua.', v_ambiguo;
  END IF;

  IF v_contas <> 489 THEN
    RAISE EXCEPTION 'Esperava 489 contas e encontrei %. A base mudou desde a verificacao; reconferir antes de guardar.', v_contas;
  END IF;

  SELECT count(*) INTO v_ja FROM public.anew_users_ligacao_ficha_backup
   WHERE backup_motivo = 'ligar conta de portal a ficha original';
  IF v_ja > 0 THEN
    RAISE EXCEPTION 'Ja existem % linhas guardadas com este motivo. Nao se guarda por cima de uma copia anterior.', v_ja;
  END IF;
END;
$guardas$;

-- ============================================================
-- 4. Guardar
-- ============================================================
INSERT INTO public.anew_users_ligacao_ficha_backup
SELECT u.*,
       now(),
       'ligar conta de portal a ficha original',
       p.duplicada,
       p.original,
       (SELECT count(*) FROM pares p2 WHERE p2.original = p.original) = 1
  FROM public.anew_users u
  JOIN pares p ON p.conta = u.id;

-- ============================================================
-- 5. Conferir, ainda dentro da transaccao
-- ============================================================
DO $conferir$
DECLARE
  v_total integer;
  v_sim   integer;
  v_nao   integer;
  v_maus  integer;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE a_corrigir),
         count(*) FILTER (WHERE NOT a_corrigir)
    INTO v_total, v_sim, v_nao
    FROM public.anew_users_ligacao_ficha_backup
   WHERE backup_motivo = 'ligar conta de portal a ficha original';

  IF v_total <> 489 OR v_sim <> 479 OR v_nao <> 10 THEN
    RAISE EXCEPTION 'A copia ficou com % linhas (% a corrigir, % de fora). Esperava 489 (479 / 10).', v_total, v_sim, v_nao;
  END IF;

  -- o entity_id guardado tem de ser o que esta neste momento em anew_users
  SELECT count(*) INTO v_maus
    FROM public.anew_users_ligacao_ficha_backup b
    JOIN public.anew_users u ON u.id = b.id
   WHERE b.backup_motivo = 'ligar conta de portal a ficha original'
     AND (u.entity_id IS DISTINCT FROM b.entity_id
       OR u.entity_id IS DISTINCT FROM b.entity_id_anterior);
  IF v_maus > 0 THEN
    RAISE EXCEPTION 'Ha % linhas guardadas que nao batem certo com anew_users.', v_maus;
  END IF;

  RAISE NOTICE 'Copia guardada: 489 contas (479 a corrigir, 10 de fora). Nada foi alterado.';
END;
$conferir$;

-- ============================================================
-- 6. Sao dados de pessoas: fecha-se como o resto
-- ============================================================
ALTER TABLE public.anew_users_ligacao_ficha_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "So o system admin ve a copia de seguranca"
  ON public.anew_users_ligacao_ficha_backup;
CREATE POLICY "So o system admin ve a copia de seguranca"
  ON public.anew_users_ligacao_ficha_backup FOR SELECT TO authenticated
  USING (public.is_system_admin(auth.uid()));

COMMIT;
