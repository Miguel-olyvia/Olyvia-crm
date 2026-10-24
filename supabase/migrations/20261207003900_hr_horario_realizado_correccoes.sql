-- ==============================================================================
-- pessoas_horario_realizado: cadeia de correccao, valor em vigor, e o ramo de
-- chefia na leitura.
--
-- POR APLICAR.
--
-- SO ADITIVO: ADD COLUMN IF NOT EXISTS, ADD CONSTRAINT de uma unique nova, um
-- indice, uma vista e um ALTER POLICY. NENHUM drop de coluna, de constraint ou
-- de politica. E nem uma linha em pessoas_vinculos ou pessoas_retribuicoes.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- pessoas_horario_realizado (ronda 2) tem estado registado/validado/rejeitado e
-- motivo_rejeicao, e o trigger de sobreposicao JA isenta as linhas rejeitadas
-- -- foi previsto exactamente para se poder guardar um registo errado sem que
-- ele impeca a versao correcta. Falta a outra metade: a linha nova nao sabe
-- dizer QUAL linha errada substitui.
--
-- E falta a FK composta de pessoas_picagens.realizado_id, que 20261121160000
-- deixou como coluna sem FK porque a unique de que ela depende nao existia.
--
-- E falta, na leitura, o ramo de chefia: a politica da ronda 2 tem organizacao
-- e ficha-propria, e uma chefia com hr.assiduidade.equipa.view nao ve as horas
-- da equipa.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tres colunas novas: corrige_realizado_id (FK composta para a propria tabela),
-- correccao_motivo, e as duas de autor da correccao. O mesmo desenho das
-- picagens: corrigir e INSERIR, a linha corrigida passa a estado='rejeitado'
-- com motivo_rejeicao -- que e o vocabulario que a ronda 2 ja fixou e que o
-- trigger de sobreposicao ja isenta -- e nada se apaga.
--
-- Uma unique nova, (id, pessoa_id, organization_id), pela mesma razao de sempre
-- neste modulo: e o alvo da FK COMPOSTA de pessoas_picagens.realizado_id. Sem
-- ela, uma picagem podia dizer que formou o intervalo de OUTRA pessoa.
--
-- E o mesmo indice de cadeia linear das picagens, para o valor em vigor ser um
-- anti-join e nao um WITH RECURSIVE.
--
--
-- -- O QUE NAO SE FAZ AQUI -----------------------------------------------------
--
-- - NAO se reescrevem as quatro politicas da ronda 2. Acrescenta-se UM ramo a
--   de SELECT por ALTER POLICY, e o bloco de conferencia aborta se o ramo de
--   ficha-propria tiver desaparecido no processo. Reescrever a politica inteira
--   e o caminho por onde se perde um ramo copiando uma versao antiga.
-- - A validacao fechada (hr.pessoas.horario_realizado.validar a passar de
--   decorativa a verificada): 20261121240000.
-- - A consolidacao: 20261121190000.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP VIEW public.v_hr_horario_realizado_em_vigor;
--   DROP INDEX public.uq_realizado_um_corrector_vivo;
--   ALTER TABLE public.pessoas_picagens DROP CONSTRAINT pessoas_picagens_realizado_fkey;
--   -- as colunas novas podem ficar: sao aditivas e nao estorvam.
--   -- e repor o USING anterior de pessoas_horario_realizado_select.
--
--
-- Prerequisitos:
--   20261120160000  pessoas_horario_realizado
--   20261121160000  pessoas_picagens (a coluna realizado_id, sem FK)
--   20261121140000  hr.assiduidade.equipa.view no catalogo
--   20261121050000  hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_qual text;
BEGIN
  IF to_regclass('public.pessoas_horario_realizado') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_horario_realizado nao existe. Aplicar 20261120160000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_picagens') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_picagens nao existe. Aplicar 20261121160000 primeiro.';
  END IF;

  -- O vocabulario da ronda 2 tem de estar la: e sobre ele que esta migracao
  -- assenta a correccao.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_estado_valido'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_realizado nao tem o CHECK de estado da ronda 2. Nao e a tabela esperada -- investigar antes de a alterar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_horario_realizado'
       AND column_name = 'motivo_rejeicao'
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_realizado nao tem motivo_rejeicao. A correccao marca a linha errada como rejeitada com motivo, e depende dessa coluna.';
  END IF;

  -- A politica que se vai completar tem de existir E ter o ramo de
  -- ficha-propria. Se nao o tiver, alguem ja a reescreveu e o ALTER POLICY
  -- desta migracao apagaria essa alteracao.
  SELECT coalesce(qual, '') INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_horario_realizado'
     AND policyname = 'pessoas_horario_realizado_select';

  IF v_qual IS NULL THEN
    RAISE EXCEPTION
      'A politica pessoas_horario_realizado_select nao existe. Esta migracao acrescenta-lhe um ramo; nao a cria.';
  END IF;

  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION
      'A politica pessoas_horario_realizado_select nao tem o ramo de ficha-propria. Ou nao e a da ronda 2, ou alguem a reescreveu -- ler a versao em vigor antes de a alterar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_pessoa_na_minha_cadeia' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) nao existe. Aplicar 20261121050000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.equipa.view') THEN
    RAISE EXCEPTION 'hr.assiduidade.equipa.view nao esta no catalogo. Aplicar 20261121140000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- Colunas novas (so ADD) ------------------------------------------------
ALTER TABLE public.pessoas_horario_realizado
  ADD COLUMN IF NOT EXISTS corrige_realizado_id uuid,
  ADD COLUMN IF NOT EXISTS correccao_motivo text,
  ADD COLUMN IF NOT EXISTS corrigido_por_anew_user_id uuid,
  ADD COLUMN IF NOT EXISTS corrigido_por_pessoa_id uuid;

-- ---- A unique de que a FK composta depende (so ADD) ------------------------
DO $uq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    ALTER TABLE public.pessoas_horario_realizado
      ADD CONSTRAINT pessoas_horario_realizado_id_pessoa_org_key
      UNIQUE (id, pessoa_id, organization_id);
  END IF;
END;
$uq$;

COMMENT ON CONSTRAINT pessoas_horario_realizado_id_pessoa_org_key ON public.pessoas_horario_realizado IS
'Alvo das FKs COMPOSTAS que apontam a esta tabela: pessoas_picagens.realizado_id e a propria cadeia de correccao. Sem pessoa_id na chave, uma picagem podia dizer que formou o intervalo de OUTRA pessoa da mesma organizacao.';

-- ---- As FKs (so ADD) -------------------------------------------------------
DO $fks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_corrige_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    ALTER TABLE public.pessoas_horario_realizado
      ADD CONSTRAINT pessoas_horario_realizado_corrige_fkey
      FOREIGN KEY (corrige_realizado_id, pessoa_id, organization_id)
      REFERENCES public.pessoas_horario_realizado (id, pessoa_id, organization_id)
      ON DELETE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_corrigido_por_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    ALTER TABLE public.pessoas_horario_realizado
      ADD CONSTRAINT pessoas_horario_realizado_corrigido_por_fkey
      FOREIGN KEY (corrigido_por_anew_user_id)
      REFERENCES public.anew_users (id) ON DELETE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_corrigido_por_pessoa_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    ALTER TABLE public.pessoas_horario_realizado
      ADD CONSTRAINT pessoas_horario_realizado_corrigido_por_pessoa_fkey
      FOREIGN KEY (corrigido_por_pessoa_id, organization_id)
      REFERENCES public.pessoas (id, organization_id)
      ON DELETE SET NULL (corrigido_por_pessoa_id);
  END IF;

  -- Corrigir sem dizer porque nao e corrigir. NOT VALID nao se usa: a tabela
  -- so tem linhas com as colunas novas a NULL, e o CHECK passa nelas.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_correccao_com_motivo'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    ALTER TABLE public.pessoas_horario_realizado
      ADD CONSTRAINT pessoas_horario_realizado_correccao_com_motivo
      CHECK (corrige_realizado_id IS NULL
             OR (correccao_motivo IS NOT NULL AND btrim(correccao_motivo) <> ''));
  END IF;

  -- E a FK que 20261121160000 deixou pendente.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_picagens_realizado_fkey'
       AND conrelid = to_regclass('public.pessoas_picagens')
  ) THEN
    ALTER TABLE public.pessoas_picagens
      ADD CONSTRAINT pessoas_picagens_realizado_fkey
      FOREIGN KEY (realizado_id, pessoa_id, organization_id)
      REFERENCES public.pessoas_horario_realizado (id, pessoa_id, organization_id)
      ON DELETE SET NULL (realizado_id);
  END IF;
END;
$fks$;

COMMENT ON COLUMN public.pessoas_horario_realizado.corrige_realizado_id IS
'O intervalo errado que esta linha substitui. Corrigir e INSERIR: a linha antiga passa a estado=rejeitado com motivo_rejeicao -- vocabulario da ronda 2, que o trigger de sobreposicao JA isenta, e foi previsto exactamente para isto.';

COMMENT ON COLUMN public.pessoas_horario_realizado.corrigido_por_pessoa_id IS
'A ficha de quem corrigiu, ao lado do anew_user_id. Nao e redundancia: e a ficha que se le dentro de cinco anos, quando a conta ja nao existe.';

-- ---- A cadeia linear -------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_realizado_um_corrector_vivo
  ON public.pessoas_horario_realizado (corrige_realizado_id)
  WHERE corrige_realizado_id IS NOT NULL AND estado <> 'rejeitado' AND deleted_at IS NULL;

COMMENT ON INDEX public.uq_realizado_um_corrector_vivo IS
'No maximo UM corrector vivo por intervalo. E o que mantem a cadeia linear e torna o valor em vigor um anti-join em vez de um WITH RECURSIVE de resultado ambiguo.';

-- ---- O valor em vigor ------------------------------------------------------
CREATE OR REPLACE VIEW public.v_hr_horario_realizado_em_vigor
WITH (security_invoker = true) AS
SELECT h.*
  FROM public.pessoas_horario_realizado h
 WHERE h.deleted_at IS NULL
   AND h.estado <> 'rejeitado'
   AND NOT EXISTS (
     SELECT 1 FROM public.pessoas_horario_realizado c
      WHERE c.corrige_realizado_id = h.id
        AND c.estado <> 'rejeitado'
        AND c.deleted_at IS NULL
   );

REVOKE ALL ON public.v_hr_horario_realizado_em_vigor FROM anon;
GRANT SELECT ON public.v_hr_horario_realizado_em_vigor TO authenticated;
GRANT SELECT ON public.v_hr_horario_realizado_em_vigor TO service_role;

COMMENT ON VIEW public.v_hr_horario_realizado_em_vigor IS
'Os intervalos de tempo trabalhado que CONTAM: vivos, nao rejeitados, e que ninguem corrige. E daqui que se somam horas para pagar -- nao da tabela em bruto, que contem tambem as versoes substituidas.

security_invoker = true e OBRIGATORIO: sem isso corre com os direitos do dono e vira porta lateral para as horas de outras organizacoes.';

-- ---- O ramo de chefia na leitura (ALTER POLICY, nao reescrita) -------------
ALTER POLICY pessoas_horario_realizado_select ON public.pessoas_horario_realizado
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.horario_realizado.view', organization_id))
      OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
        AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
      )
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view.own', organization_id))
        AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
      )
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.equipa.view', organization_id))
        AND (SELECT public.hr_ausencias_pessoa_na_minha_cadeia((SELECT auth.uid()), pessoa_id, organization_id))
      )
    )
  );

COMMENT ON POLICY pessoas_horario_realizado_select ON public.pessoas_horario_realizado IS
'Ve as horas realizadas: quem tem hr.pessoas.horario_realizado.view ou hr.assiduidade.view naquela organizacao; cada um as suas (por hr.pessoas.view.own ou hr.assiduidade.view.own, com a conta ligada a ficha); e a chefia as da sua cadeia (hr.assiduidade.equipa.view).

Os DOIS ramos de organizacao e os DOIS de ficha-propria coexistem de proposito: as permissoes de horario da ronda 2 continuam a valer, e as de assiduidade da ronda 4 acrescentam-se -- nao substituem. Tirar as antigas fecharia a tabela a quem hoje a ve.

Que o trabalhador veja as horas que lhe foram registadas continua a ser deliberado: e a base de poder contesta-las.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_qual text;
  v_opts text;
  v_pol  integer;
BEGIN
  -- As colunas novas.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_horario_realizado'
       AND column_name = 'corrige_realizado_id'
  ) THEN
    RAISE EXCEPTION 'corrige_realizado_id nao ficou criada.';
  END IF;

  -- A unique composta e as FKs.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION 'A unique (id, pessoa_id, organization_id) nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_picagens_realizado_fkey'
       AND conrelid = to_regclass('public.pessoas_picagens')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'A FK composta de pessoas_picagens.realizado_id nao ficou criada. Uma picagem podia dizer que formou o intervalo de outra pessoa.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_realizado_corrige_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_realizado')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION 'A FK composta da cadeia de correccao do realizado nao ficou criada.';
  END IF;

  -- As QUATRO politicas da ronda 2 tem de continuar a ser quatro: se forem
  -- menos, o ALTER POLICY nao foi um ALTER.
  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_horario_realizado';
  IF v_pol <> 4 THEN
    RAISE EXCEPTION
      'Esperavam-se as 4 politicas da ronda 2 em pessoas_horario_realizado, encontraram-se %. Esta migracao acrescenta um ramo, nao mexe no numero de politicas.', v_pol;
  END IF;

  SELECT coalesce(qual,'') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_horario_realizado'
     AND policyname = 'pessoas_horario_realizado_select';

  -- A guarda que a ronda 2 ja usa contra reescritas a partir de versoes antigas.
  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION
      'A politica de SELECT PERDEU o ramo de ficha-propria ao ganhar o da chefia. O trabalhador deixaria de ver as horas que lhe foram registadas.';
  END IF;
  IF v_qual NOT LIKE '%hr.pessoas.horario_realizado.view%' THEN
    RAISE EXCEPTION
      'A politica de SELECT perdeu o ramo de hr.pessoas.horario_realizado.view. Quem hoje ve as horas deixaria de as ver.';
  END IF;
  IF v_qual NOT LIKE '%hr_ausencias_pessoa_na_minha_cadeia%' THEN
    RAISE EXCEPTION 'A politica de SELECT nao ganhou o ramo da chefia.';
  END IF;
  IF v_qual LIKE '%get_user_visible_org_ids%' THEN
    RAISE EXCEPTION 'A politica passou a usar get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;
  IF v_qual ~ 'has_anew_permission\([^_]' THEN
    RAISE EXCEPTION 'A politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  -- A vista.
  IF to_regclass('public.v_hr_horario_realizado_em_vigor') IS NULL THEN
    RAISE EXCEPTION 'A vista v_hr_horario_realizado_em_vigor nao ficou criada.';
  END IF;

  SELECT coalesce(array_to_string(c.reloptions, ','), '') INTO v_opts
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'v_hr_horario_realizado_em_vigor';

  IF v_opts NOT LIKE '%security_invoker=true%' THEN
    RAISE EXCEPTION
      'v_hr_horario_realizado_em_vigor ficou sem security_invoker=true -- seria uma porta lateral para as horas de outras organizacoes. Opcoes: "%"', v_opts;
  END IF;

  -- O trigger de sobreposicao da ronda 2 tem de continuar de pe: esta migracao
  -- nao lhe toca, e se desapareceu foi outra coisa.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_horario_realizado')
       AND tgname = 'trg_pessoas_horario_realizado_sem_sobreposicao' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'O trigger de nao-sobreposicao do realizado (ronda 2) nao esta la. Esta migracao nao lhe toca -- investigar.';
  END IF;

  RAISE NOTICE 'Conferido: colunas de correccao, unique composta, FK das picagens, vista em vigor, e ramo de chefia na leitura.';
END;
$conferir$;
