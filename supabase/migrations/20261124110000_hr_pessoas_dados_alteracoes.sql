-- ==============================================================================
-- pessoas_dados_alteracoes -- historico geral de alteracoes a dados pessoais,
-- identificacao (excepto NISS), morada e fardamento. Copia estrutural de
-- pessoas_vinculos_alteracoes (20261123050000).
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A admissao por convite escreve de uma vez em varias tabelas (pessoas,
-- pessoas_dados_pessoais, pessoas_identificacao, pessoas_moradas,
-- pessoas_fardamento). Sem rasto, uma correccao ou uma submissao de convite
-- fica indistinguivel de sempre ter sido assim.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma tabela so, "tabela" + "campo" identificam a origem da linha (ao
-- contrario de pessoas_vinculos_alteracoes, que e dedicada a uma unica
-- tabela). Append-only: SELECT por hr.pessoas.view OU (hr.pessoas.view.own E
-- pessoa_id = hr_pessoa_do_utilizador(...)) -- a MESMA clausula de
-- pessoas_vinculos_alteracoes; INSERT/UPDATE/DELETE bloqueados por politicas
-- restritivas false, so triggers SECURITY DEFINER escrevem.
--
-- Cinco triggers AFTER INSERT OR UPDATE, cada um com a sua LISTA BRANCA de
-- campos (nunca to_jsonb(NEW) inteiro, para uma coluna nova nao entrar
-- silenciosamente no historico sem decisao):
--   pessoas               (subconjunto: email_trabalho, email_pessoal,
--                          telefone_trabalho, departamento, estrutura --
--                          cargo fica de fora, ja tem o seu proprio trigger
--                          para pessoas_vinculos_alteracoes desde 20261123050000)
--   pessoas_dados_pessoais (todos os campos de negocio)
--   pessoas_identificacao  (todos EXCEPTO niss e niss_ultimos4 -- ver abaixo)
--   pessoas_moradas        (todos os campos de negocio)
--   pessoas_fardamento     (todos os campos de negocio)
--
-- A ORIGEM da escrita ('utilizador' | 'convite' | 'service_role') vem de
-- hr_dados_alteracoes_origem(): 'convite' quando a transaccao tiver corrido
-- set_config('hr.origem_escrita', 'convite', true) -- e o que
-- rpc_hr_convite_admissao_submeter (20261124130000) faz antes de escrever;
-- 'utilizador' quando ha auth.uid(); 'service_role' no resto.
--
--
-- -- A GUARDA CENTRAL: NISS NAO ENTRA AQUI --------------------------------------
--
-- pessoas_identificacao fecha niss por GRANT DE COLUNA (20261120040000) --
-- authenticated nao le nem escreve a coluna directamente. Um historico
-- gravado aqui, legivel por hr.pessoas.view (a permissao mais BASICA do
-- modulo, muito mais larga que hr.pessoas.identificacao.reveal), reabriria
-- exactamente o que aquele fecho existe para impedir. Por isso a lista branca
-- do trigger de pessoas_identificacao OMITE niss E niss_ultimos4 -- ainda que
-- o plano so exigisse omitir niss, niss_ultimos4 e igualmente mais largo do
-- que hr.pessoas.view deveria poder ver. O bloco de conferir FALHA se
-- qualquer um dos dois aparecer na definicao da funcao.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- DROP TRIGGER IF EXISTS trg_pessoas_registar_alteracao_dados ON public.pessoas;
-- DROP TRIGGER IF EXISTS trg_pessoas_dados_pessoais_registar_alteracao ON public.pessoas_dados_pessoais;
-- DROP TRIGGER IF EXISTS trg_pessoas_identificacao_registar_alteracao ON public.pessoas_identificacao;
-- DROP TRIGGER IF EXISTS trg_pessoas_moradas_registar_alteracao ON public.pessoas_moradas;
-- DROP TRIGGER IF EXISTS trg_pessoas_fardamento_registar_alteracao ON public.pessoas_fardamento;
-- DROP FUNCTION IF EXISTS public.hr_pessoas_registar_alteracao_dados();
-- DROP FUNCTION IF EXISTS public.hr_dados_pessoais_registar_alteracao();
-- DROP FUNCTION IF EXISTS public.hr_identificacao_registar_alteracao();
-- DROP FUNCTION IF EXISTS public.hr_moradas_registar_alteracao();
-- DROP FUNCTION IF EXISTS public.hr_fardamento_registar_alteracao();
-- DROP FUNCTION IF EXISTS public.hr_dados_alteracoes_origem();
-- DROP TABLE IF EXISTS public.pessoas_dados_alteracoes;
--
--
-- Prerequisitos:
--   20261120030000  pessoas (pessoas_id_org_key)
--   20261120040000  pessoas_dados_pessoais, pessoas_identificacao
--   20261120050000  pessoas_moradas
--   20261120090000  hr_pessoa_do_utilizador
--   20261124060000  pessoas.departamento / estrutura
--   20261124070000  pessoas_fardamento
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe.';
  END IF;
  IF to_regclass('public.pessoas_dados_pessoais') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_dados_pessoais nao existe. Aplicar 20261120040000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_identificacao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_identificacao nao existe. Aplicar 20261120040000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_moradas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_moradas nao existe. Aplicar 20261120050000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_fardamento') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_fardamento nao existe. Aplicar 20261124070000 primeiro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name IN ('departamento','estrutura')
  ) THEN
    RAISE EXCEPTION 'pessoas.departamento/estrutura nao existem. Aplicar 20261124060000 primeiro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'public.hr_pessoa_do_utilizador(uuid,uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;
  -- niss tem de continuar fechado por grant de coluna -- se ja nao estiver,
  -- esta migracao nao deve ser a primeira a descobrir isso.
  IF has_column_privilege('authenticated', 'public.pessoas_identificacao', 'niss', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated ja consegue ler niss -- o fecho por grant de coluna caiu antes desta migracao correr. Investigar 20261120040000/20261124040000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_dados_alteracoes
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_dados_alteracoes (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id       uuid NOT NULL,
  organization_id uuid NOT NULL,

  tabela          text NOT NULL,
  campo           text NOT NULL,
  valor_antes     text,
  valor_depois    text,
  origem          text NOT NULL DEFAULT 'utilizador',

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,

  CONSTRAINT pessoas_dados_alteracoes_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_dados_alteracoes_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_dados_alteracoes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_dados_alteracoes_origem_valida
    CHECK (origem IN ('utilizador','convite','service_role')),
  CONSTRAINT pessoas_dados_alteracoes_tabela_valida
    CHECK (tabela IN ('pessoas','pessoas_dados_pessoais','pessoas_identificacao','pessoas_moradas','pessoas_fardamento'))
);

COMMENT ON TABLE public.pessoas_dados_alteracoes IS
'Historico de alteracoes a pessoas (subconjunto: contactos, departamento, estrutura -- cargo tem o seu proprio historico em pessoas_vinculos_alteracoes), pessoas_dados_pessoais, pessoas_identificacao, pessoas_moradas e pessoas_fardamento. Uma linha por campo alterado, escrita SO por trigger. NUNCA guarda niss nem niss_ultimos4 -- ver cabecalho da migracao que a criou.';
COMMENT ON COLUMN public.pessoas_dados_alteracoes.tabela IS
'De onde veio a alteracao. Diferente de pessoas_vinculos_alteracoes (dedicada a uma so tabela): aqui cinco tabelas partilham o mesmo historico, por isso a origem tem de ir na linha.';
COMMENT ON COLUMN public.pessoas_dados_alteracoes.origem IS
'utilizador (auth.uid() presente), convite (escrita por rpc_hr_convite_admissao_submeter, via set_config(''hr.origem_escrita'',''convite'',true)) ou service_role (nenhum dos anteriores).';

CREATE INDEX IF NOT EXISTS idx_pessoas_dados_alteracoes_pessoa_id
  ON public.pessoas_dados_alteracoes (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_dados_alteracoes_organization_id
  ON public.pessoas_dados_alteracoes (organization_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_dados_alteracoes_pessoa_data
  ON public.pessoas_dados_alteracoes (pessoa_id, created_at DESC);

REVOKE ALL ON TABLE public.pessoas_dados_alteracoes FROM anon;
REVOKE ALL ON TABLE public.pessoas_dados_alteracoes FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_dados_alteracoes TO authenticated;
GRANT ALL ON TABLE public.pessoas_dados_alteracoes TO service_role;

ALTER TABLE public.pessoas_dados_alteracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_dados_alteracoes_select ON public.pessoas_dados_alteracoes;
CREATE POLICY pessoas_dados_alteracoes_select ON public.pessoas_dados_alteracoes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
      AND pessoa_id = public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id)
    )
  );

DROP POLICY IF EXISTS pessoas_dados_alteracoes_block_insert ON public.pessoas_dados_alteracoes;
CREATE POLICY pessoas_dados_alteracoes_block_insert ON public.pessoas_dados_alteracoes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_dados_alteracoes_block_update ON public.pessoas_dados_alteracoes;
CREATE POLICY pessoas_dados_alteracoes_block_update ON public.pessoas_dados_alteracoes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_dados_alteracoes_block_delete ON public.pessoas_dados_alteracoes;
CREATE POLICY pessoas_dados_alteracoes_block_delete ON public.pessoas_dados_alteracoes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ---- Origem partilhada -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_dados_alteracoes_origem()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_setting('hr.origem_escrita', true) = 'convite' THEN
    RETURN 'convite';
  ELSIF auth.uid() IS NOT NULL THEN
    RETURN 'utilizador';
  ELSE
    RETURN 'service_role';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_dados_alteracoes_origem() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_dados_alteracoes_origem() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_dados_alteracoes_origem() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_dados_alteracoes_origem() TO service_role;

COMMENT ON FUNCTION public.hr_dados_alteracoes_origem() IS
'"convite" so quando a transaccao correu set_config(''hr.origem_escrita'',''convite'',true) -- feito por rpc_hr_convite_admissao_submeter antes de escrever. Caso contrario "utilizador" com auth.uid(), senao "service_role".';

-- ==============================================================================
-- Trigger 1: pessoas (subconjunto)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_pessoas_registar_alteracao_dados()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campos text[] := ARRAY['email_trabalho','email_pessoal','telefone_trabalho','departamento','estrutura'];
  v_old  jsonb := to_jsonb(OLD);
  v_new  jsonb := to_jsonb(NEW);
  v_campo text;
  v_criado_por uuid;
  v_origem text := public.hr_dados_alteracoes_origem();
BEGIN
  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  FOREACH v_campo IN ARRAY v_campos
  LOOP
    IF v_old ->> v_campo IS DISTINCT FROM v_new ->> v_campo THEN
      INSERT INTO public.pessoas_dados_alteracoes
        (pessoa_id, organization_id, tabela, campo, valor_antes, valor_depois, origem, created_by)
      VALUES
        (NEW.id, NEW.organization_id, 'pessoas', v_campo, v_old ->> v_campo, v_new ->> v_campo, v_origem, v_criado_por);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_registar_alteracao_dados() IS
'Audita SO email_trabalho, email_pessoal, telefone_trabalho, departamento e estrutura de pessoas. cargo fica de fora: ja tem trigger proprio para pessoas_vinculos_alteracoes desde 20261123050000, e nao se duplica num segundo historico.';

DROP TRIGGER IF EXISTS trg_pessoas_registar_alteracao_dados ON public.pessoas;
CREATE TRIGGER trg_pessoas_registar_alteracao_dados
  AFTER INSERT OR UPDATE ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_registar_alteracao_dados();

-- ==============================================================================
-- Trigger 2: pessoas_dados_pessoais
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_dados_pessoais_registar_alteracao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campos text[] := ARRAY[
    'data_nascimento','ocultar_aniversario','genero','pronomes','nacionalidade',
    'telefone_pessoal','email_comunicacoes','estado_civil','dependentes',
    'irs_retencao_percentagem','naturalidade_freguesia','naturalidade_concelho',
    'naturalidade_pais','conjuge_situacao_profissional','dependentes_deficientes',
    'habilitacao_academica','habilitacao_data_conclusao'
  ];
  v_old  jsonb := to_jsonb(OLD);
  v_new  jsonb := to_jsonb(NEW);
  v_campo text;
  v_criado_por uuid;
  v_origem text := public.hr_dados_alteracoes_origem();
BEGIN
  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  FOREACH v_campo IN ARRAY v_campos
  LOOP
    IF v_old ->> v_campo IS DISTINCT FROM v_new ->> v_campo THEN
      INSERT INTO public.pessoas_dados_alteracoes
        (pessoa_id, organization_id, tabela, campo, valor_antes, valor_depois, origem, created_by)
      VALUES
        (NEW.pessoa_id, NEW.organization_id, 'pessoas_dados_pessoais', v_campo, v_old ->> v_campo, v_new ->> v_campo, v_origem, v_criado_por);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pessoas_dados_pessoais_registar_alteracao ON public.pessoas_dados_pessoais;
CREATE TRIGGER trg_pessoas_dados_pessoais_registar_alteracao
  AFTER INSERT OR UPDATE ON public.pessoas_dados_pessoais
  FOR EACH ROW EXECUTE FUNCTION public.hr_dados_pessoais_registar_alteracao();

-- ==============================================================================
-- Trigger 3: pessoas_identificacao -- NISS NAO ENTRA
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_identificacao_registar_alteracao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- NUNCA acrescentar 'niss' nem 'niss_ultimos4' a esta lista: e a garantia
  -- central desta migracao, verificada no bloco de conferir por
  -- pg_get_functiondef.
  v_campos text[] := ARRAY[
    'tipo_documento','numero_documento','validade_documento','nif',
    'carta_conducao_numero','carta_conducao_categorias','carta_conducao_validade'
  ];
  v_old  jsonb := to_jsonb(OLD);
  v_new  jsonb := to_jsonb(NEW);
  v_campo text;
  v_criado_por uuid;
  v_origem text := public.hr_dados_alteracoes_origem();
BEGIN
  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  FOREACH v_campo IN ARRAY v_campos
  LOOP
    IF v_old ->> v_campo IS DISTINCT FROM v_new ->> v_campo THEN
      INSERT INTO public.pessoas_dados_alteracoes
        (pessoa_id, organization_id, tabela, campo, valor_antes, valor_depois, origem, created_by)
      VALUES
        (NEW.pessoa_id, NEW.organization_id, 'pessoas_identificacao', v_campo, v_old ->> v_campo, v_new ->> v_campo, v_origem, v_criado_por);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_identificacao_registar_alteracao() IS
'Lista branca SEM niss nem niss_ultimos4, de proposito: esta tabela e legivel por hr.pessoas.view, muito mais larga que hr.pessoas.identificacao.reveal. Gravar o NISS aqui reabriria o que o grant de coluna em pessoas_identificacao fecha.';

DROP TRIGGER IF EXISTS trg_pessoas_identificacao_registar_alteracao ON public.pessoas_identificacao;
CREATE TRIGGER trg_pessoas_identificacao_registar_alteracao
  AFTER INSERT OR UPDATE ON public.pessoas_identificacao
  FOR EACH ROW EXECUTE FUNCTION public.hr_identificacao_registar_alteracao();

-- ==============================================================================
-- Trigger 4: pessoas_moradas
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_moradas_registar_alteracao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campos text[] := ARRAY['tipo','linha1','linha2','codigo_postal','localidade','distrito','pais','is_principal'];
  v_old  jsonb := to_jsonb(OLD);
  v_new  jsonb := to_jsonb(NEW);
  v_campo text;
  v_criado_por uuid;
  v_origem text := public.hr_dados_alteracoes_origem();
BEGIN
  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  FOREACH v_campo IN ARRAY v_campos
  LOOP
    IF v_old ->> v_campo IS DISTINCT FROM v_new ->> v_campo THEN
      INSERT INTO public.pessoas_dados_alteracoes
        (pessoa_id, organization_id, tabela, campo, valor_antes, valor_depois, origem, created_by)
      VALUES
        (NEW.pessoa_id, NEW.organization_id, 'pessoas_moradas', v_campo, v_old ->> v_campo, v_new ->> v_campo, v_origem, v_criado_por);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pessoas_moradas_registar_alteracao ON public.pessoas_moradas;
CREATE TRIGGER trg_pessoas_moradas_registar_alteracao
  AFTER INSERT OR UPDATE ON public.pessoas_moradas
  FOR EACH ROW EXECUTE FUNCTION public.hr_moradas_registar_alteracao();

-- ==============================================================================
-- Trigger 5: pessoas_fardamento
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_fardamento_registar_alteracao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campos text[] := ARRAY[
    'tamanho_cima','tamanho_cima_detalhe','tamanho_baixo','tamanho_baixo_detalhe',
    'tamanho_blazer','tamanho_blazer_detalhe'
  ];
  v_old  jsonb := to_jsonb(OLD);
  v_new  jsonb := to_jsonb(NEW);
  v_campo text;
  v_criado_por uuid;
  v_origem text := public.hr_dados_alteracoes_origem();
BEGIN
  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  FOREACH v_campo IN ARRAY v_campos
  LOOP
    IF v_old ->> v_campo IS DISTINCT FROM v_new ->> v_campo THEN
      INSERT INTO public.pessoas_dados_alteracoes
        (pessoa_id, organization_id, tabela, campo, valor_antes, valor_depois, origem, created_by)
      VALUES
        (NEW.pessoa_id, NEW.organization_id, 'pessoas_fardamento', v_campo, v_old ->> v_campo, v_new ->> v_campo, v_origem, v_criado_por);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pessoas_fardamento_registar_alteracao ON public.pessoas_fardamento;
CREATE TRIGGER trg_pessoas_fardamento_registar_alteracao
  AFTER INSERT OR UPDATE ON public.pessoas_fardamento
  FOR EACH ROW EXECUTE FUNCTION public.hr_fardamento_registar_alteracao();

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas integer;
  v_def text;
BEGIN
  SELECT count(*) INTO v_politicas FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pessoas_dados_alteracoes';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'pessoas_dados_alteracoes ficou com % politicas, esperavam-se 4.', v_politicas;
  END IF;

  FOR v_def IN
    SELECT 'trg_pessoas_registar_alteracao_dados' UNION ALL
    SELECT 'trg_pessoas_dados_pessoais_registar_alteracao' UNION ALL
    SELECT 'trg_pessoas_identificacao_registar_alteracao' UNION ALL
    SELECT 'trg_pessoas_moradas_registar_alteracao' UNION ALL
    SELECT 'trg_pessoas_fardamento_registar_alteracao'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_def) THEN
      RAISE EXCEPTION 'O trigger % nao foi criado.', v_def;
    END IF;
  END LOOP;

  -- A guarda central: niss e niss_ultimos4 NAO podem aparecer na definicao do
  -- trigger de pessoas_identificacao.
  SELECT pg_get_functiondef('public.hr_identificacao_registar_alteracao()'::regprocedure) INTO v_def;
  IF v_def ILIKE '%''niss''%' OR v_def ILIKE '%niss_ultimos4%' THEN
    RAISE EXCEPTION 'hr_identificacao_registar_alteracao() referencia niss ou niss_ultimos4. Isto reabriria o que o grant de coluna fecha -- corrigir antes de aplicar.';
  END IF;

  RAISE NOTICE 'OK: pessoas_dados_alteracoes criada, 4 politicas, 5 triggers de auditoria activos, niss confirmado ausente do trigger de identificacao.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. So cria objectos novos e acrescenta triggers AFTER; nenhuma tabela ou
--    politica existente e reescrita -- sem janela de estado defeituoso.
-- 2. hr_dados_alteracoes_origem() e SECURITY DEFINER so para poder ler
--    current_setting e auth.uid() de forma estavel; nao toca em tabela
--    nenhuma e nao precisa de grant alem de EXECUTE.
-- ==============================================================================
