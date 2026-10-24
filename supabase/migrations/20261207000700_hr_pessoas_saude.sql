-- ==============================================================================
-- Dados de saude da pessoa: incapacidade e adaptacao do posto de trabalho.
-- E o satelite mais restrito do modulo, e o unico que guarda dado de
-- categoria especial (art. 9.o do RGPD).
--
-- POR APLICAR. Ler o bloco "ANTES DO db push" no fim do ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O grau de incapacidade de um trabalhador tem de estar registado em algum
-- lado: conta para o IRS, conta para as quotas de emprego, e conta para saber
-- que adaptacoes o posto de trabalho precisa. Mas e um dado de saude, e nao
-- pode partilhar linha com dados administrativos: quem tem de ver a data de
-- nascimento e o estado civil para tratar de um contrato nao tem de saber que
-- alguem tem 60% de incapacidade.
--
-- Numa unica tabela de "dados pessoais", a RLS nao consegue separar as duas
-- coisas -- a RLS decide linhas, nao colunas. A separacao tem de ser fisica.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tabela propria, 1:1 com a pessoa, atras de duas permissoes proprias
-- (hr.pessoas.saude.view e hr.pessoas.saude.edit), ambas marcadas
-- is_dangerous = true no catalogo, e nenhuma atribuida a papel nenhum.
--
-- Quatro politicas, todas TO authenticated, todas com
-- has_anew_permission_in_org e as funcoes embrulhadas em (SELECT ...):
--   SELECT hr.pessoas.saude.view
--   INSERT hr.pessoas.saude.edit
--   UPDATE hr.pessoas.saude.edit (USING e WITH CHECK ambos escritos)
--   DELETE restritiva false
--
-- Cada INSERT e cada UPDATE ficam registados em pessoas_acessos_sensiveis
-- (campo='incapacidade', accao='alterar'), por trigger AFTER SECURITY DEFINER.
--
--
-- -- O QUE ESTA TABELA NAO GUARDA, E NAO E NEGOCIAVEL ---------------------------
--
-- NENHUM diagnostico. NENHUMA patologia. NENHUM dado clinico. Nem baixas
-- medicas, nem relatorios de medicina do trabalho, nem historico de consultas.
--
-- O que se guarda e o que a entidade patronal precisa para cumprir a lei e
-- adaptar o posto: a PERCENTAGEM de incapacidade (que vem de um atestado, sem
-- dizer de que), a validade do comprovativo, e as adaptacoes necessarias.
--
-- Um CHECK nao consegue impedir que alguem escreva um diagnostico no campo de
-- observacoes -- e por isso que esta escrito no COMMENT ON COLUMN, na
-- interface e aqui. O campo e para acomodacoes de posto de trabalho ("precisa
-- de cadeira ergonomica", "nao pode levantar mais de 10 kg"), nao para
-- informacao clinica.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Sem clausula de ficha-propria em 20261120090000. Parece contra-intuitivo
--   -- e o proprio dado do trabalhador -- mas dar-lhe leitura implicaria que a
--   coluna passasse pelo PostgREST com base numa permissao de auto-consulta, e
--   nao ha ainda decisao de produto sobre isso. Fica em aberto, escrito.
-- - Nao ha anexos nem ficheiros: o atestado nao se guarda aqui. Quando houver
--   documentos de RH, e la que ele vive, com a sua propria permissao.
-- - Nao se atribui permissao nenhuma a papel nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito: um .sql de reversao
-- guardado ao lado e aplicado pelo db push seguinte. A mao:
--   DROP TABLE IF EXISTS public.pessoas_dados_saude;
--   DROP FUNCTION IF EXISTS public.hr_saude_auditar();
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.* (hr.pessoas.saude.view / .edit)
--   20261120030000  pessoas (e a unique pessoas_id_org_key)
--   20261120040000  hr_satelite_ancora_imutavel(), pessoas_acessos_sensiveis,
--                   hr_registar_acesso_sensivel()
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_id_org_key' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe; a FK composta desta tabela depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'public.hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  -- As duas permissoes tem de existir E tem de estar marcadas perigosas: se
  -- alguem lhes tirou a marca, a interface de papeis deixa de avisar quem as
  -- atribui, e isso e parte do fecho desta tabela.
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions
    WHERE code = 'hr.pessoas.saude.view' AND is_dangerous
  ) THEN
    RAISE EXCEPTION
      'hr.pessoas.saude.view nao existe ou nao esta marcada is_dangerous. Aplicar 20261120020000, ou repor a marca antes de criar esta tabela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions
    WHERE code = 'hr.pessoas.saude.edit' AND is_dangerous
  ) THEN
    RAISE EXCEPTION
      'hr.pessoas.saude.edit nao existe ou nao esta marcada is_dangerous. Aplicar 20261120020000, ou repor a marca.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_acessos_sensiveis_campo_valido'
      AND conrelid = 'public.pessoas_acessos_sensiveis'::regclass
      AND pg_get_constraintdef(oid) LIKE '%incapacidade%'
  ) THEN
    RAISE EXCEPTION 'O CHECK de campo em pessoas_acessos_sensiveis nao aceita "incapacidade"; a auditoria desta migracao falharia.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_dados_saude
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_dados_saude (
  id                                     uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id                              uuid NOT NULL,
  organization_id                        uuid NOT NULL,

  incapacidade_percentagem               numeric(5,2),
  incapacidade_comprovativo_valido_ate   date,
  necessidades_adaptacao                 text,
  observacoes                            text,

  created_at                             timestamptz NOT NULL DEFAULT now(),
  updated_at                             timestamptz NOT NULL DEFAULT now(),
  created_by                             uuid,
  updated_by                             uuid,

  CONSTRAINT pessoas_dados_saude_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_dados_saude_pessoa_unica UNIQUE (pessoa_id),
  CONSTRAINT pessoas_dados_saude_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_dados_saude_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_dados_saude_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_dados_saude_incapacidade_valida
    CHECK (incapacidade_percentagem IS NULL
           OR (incapacidade_percentagem >= 0 AND incapacidade_percentagem <= 100))
);

COMMENT ON TABLE public.pessoas_dados_saude IS
'Incapacidade e adaptacao do posto de trabalho (1:1 com a pessoa). Dado de categoria especial, art. 9.o do RGPD -- e por isso que esta em tabela separada e nao dentro de pessoas_dados_pessoais: a RLS decide linhas e nao colunas, logo a separacao tem de ser fisica. NAO guarda diagnosticos, patologias, baixas medicas nem qualquer informacao clinica. As permissoes hr.pessoas.saude.view e .edit estao marcadas is_dangerous e a intencao e que nenhum papel as receba por omissao.';

COMMENT ON COLUMN public.pessoas_dados_saude.incapacidade_percentagem IS
'Percentagem que consta do atestado multiuso, SEM a razao clinica. E o numero que conta para o IRS, para as quotas de emprego e para as adaptacoes devidas.';
COMMENT ON COLUMN public.pessoas_dados_saude.necessidades_adaptacao IS
'Adaptacoes do posto de trabalho -- "cadeira ergonomica", "nao levantar mais de 10 kg". NAO e para informacao clinica.';
COMMENT ON COLUMN public.pessoas_dados_saude.observacoes IS
'Texto livre para acomodacoes do posto de trabalho. Um CHECK nao consegue impedir que alguem escreva aqui um diagnostico; fica escrito no comentario, na interface e na migracao que NAO se escreve informacao clinica neste campo.';

CREATE INDEX IF NOT EXISTS idx_pessoas_dados_saude_pessoa_id
  ON public.pessoas_dados_saude (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_dados_saude_organization_id
  ON public.pessoas_dados_saude (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_dados_saude_updated_at ON public.pessoas_dados_saude;
CREATE TRIGGER trg_pessoas_dados_saude_updated_at
  BEFORE UPDATE ON public.pessoas_dados_saude
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_dados_saude_ancora ON public.pessoas_dados_saude;
CREATE TRIGGER trg_pessoas_dados_saude_ancora
  BEFORE UPDATE ON public.pessoas_dados_saude
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Auditoria -------------------------------------------------------------
-- SECURITY DEFINER porque hr_registar_acesso_sensivel nao esta ao alcance de
-- authenticated: so funcoes definer do modulo a alcancam.
CREATE OR REPLACE FUNCTION public.hr_saude_auditar()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.hr_registar_acesso_sensivel(
    NEW.pessoa_id, NEW.organization_id, 'incapacidade', 'alterar'
  );
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_saude_auditar() IS
'Registra em pessoas_acessos_sensiveis cada criacao ou alteracao de dados de saude. SECURITY DEFINER porque hr_registar_acesso_sensivel nao e chamavel por authenticated. Se nao houver auth.uid() (service_role), grava origem=service_role em vez de falhar a operacao.';

DROP TRIGGER IF EXISTS trg_pessoas_dados_saude_auditar ON public.pessoas_dados_saude;
CREATE TRIGGER trg_pessoas_dados_saude_auditar
  AFTER INSERT OR UPDATE ON public.pessoas_dados_saude
  FOR EACH ROW EXECUTE FUNCTION public.hr_saude_auditar();

-- ---- Grants e RLS ----------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_dados_saude FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_dados_saude TO authenticated;
GRANT ALL ON TABLE public.pessoas_dados_saude TO service_role;

ALTER TABLE public.pessoas_dados_saude ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_dados_saude_select ON public.pessoas_dados_saude;
CREATE POLICY pessoas_dados_saude_select ON public.pessoas_dados_saude
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.saude.view', organization_id)));

DROP POLICY IF EXISTS pessoas_dados_saude_insert ON public.pessoas_dados_saude;
CREATE POLICY pessoas_dados_saude_insert ON public.pessoas_dados_saude
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.saude.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_dados_saude_update ON public.pessoas_dados_saude;
CREATE POLICY pessoas_dados_saude_update ON public.pessoas_dados_saude
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.saude.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.saude.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_dados_saude_block_delete ON public.pessoas_dados_saude;
CREATE POLICY pessoas_dados_saude_block_delete ON public.pessoas_dados_saude
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_dados_saude_select ON public.pessoas_dados_saude IS
'Ve dados de saude quem tem hr.pessoas.saude.view NAQUELA organizacao -- uma permissao marcada perigosa, que nao e atribuida a papel nenhum por omissao. Sem membership activo na organizacao nao ha leitura, seja qual for o papel.';
COMMENT ON POLICY pessoas_dados_saude_block_delete ON public.pessoas_dados_saude IS
'Nao se apaga: a incapacidade que deixou de existir corrige-se para NULL, e a alteracao fica registada. Apagar a linha apagaria tambem o rasto de quem a mudou.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls boolean;
  v_politicas integer;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'pessoas_dados_saude';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_dados_saude ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pessoas_dados_saude';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em pessoas_dados_saude, encontraram-se %.', v_politicas;
  END IF;

  -- Nenhuma politica pode usar a funcao SEM organizacao nem a de organizacoes
  -- visiveis: nesta tabela um erro desses expoe dados de saude de outra
  -- organizacao.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pessoas_dados_saude'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION 'Alguma politica de pessoas_dados_saude usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pessoas_dados_saude'::regclass
      AND tgname = 'trg_pessoas_dados_saude_auditar'
  ) THEN
    RAISE EXCEPTION 'O trigger de auditoria de dados de saude nao ficou criado.';
  END IF;

  RAISE NOTICE 'OK: pessoas_dados_saude criada, RLS activo, 4 politicas, auditoria por trigger, permissoes perigosas e por atribuir.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list" e confirmar que nao ha nenhum timestamp
--    20261120* ja aplicado no remoto sem ficheiro local. Se colidir, renumerar
--    o bloco inteiro mantendo a ordem relativa.
--
-- 2. Confirmar que 20261120010000 a 20261120070000 vao a frente desta na fila.
--
-- 3. So cria objectos novos. Nao altera tabela, politica nem funcao existente,
--    por isso nao ha janela em que a base partilhada fique defeituosa.
--
-- 4. Depois de aplicada, ninguem ve esta tabela: as duas permissoes existem no
--    catalogo e nao estao atribuidas a papel nenhum. Atribui-las e um acto
--    consciente, organizacao a organizacao, e devia ser a menos gente do
--    modulo todo.
-- ==============================================================================
