-- ==============================================================================
-- Tres correccoes da revisao de seguranca ao modulo de admissao, JA APLICADO.
--
-- As migrations 20261124010000..130000 entraram no ramo antes de serem
-- revistas -- o workflow foi parado tres vezes para corrigir o desenho e a
-- fase de revisao nunca chegou a correr. A revisao correu depois e encontrou
-- tres coisas VIVAS na base. Esta migration fecha-as.
--
--
-- -- 1. pessoas_fardamento ficou com TRUNCATE aberto ---------------------------
--
-- 20261124070000:136-137 faz REVOKE ALL so a `anon` e depois GRANT SELECT,
-- INSERT, UPDATE a `authenticated`. Os privilegios por omissao do Supabase
-- deixam DELETE, TRUNCATE, REFERENCES e TRIGGER por cima, e o GRANT nao retira
-- nada. TRUNCATE NAO passa por RLS, por isso a politica
-- pessoas_fardamento_block_delete nao o trava: qualquer autenticado esvaziava
-- a tabela de TODAS as organizacoes.
--
-- E a unica das quatro tabelas novas onde faltou -- pessoas_sindicalizacao,
-- pessoas_dados_alteracoes e pessoas_convites_admissao fazem os dois REVOKEs.
--
--
-- -- 2. O historico era a porta das traseiras dos dados fechados ---------------
--
-- pessoas_dados_alteracoes guarda valores vindos de cinco tabelas, cada uma
-- com a SUA permissao de leitura -- e a politica de SELECT do historico exigia
-- apenas `hr.pessoas.view`, a permissao mais BASICA do modulo, a que serve
-- para ver a lista de colegas.
--
-- Resultado: quem so podia ver nomes lia, pelo historico, a data de
-- nascimento, o estado civil, os dependentes, o NIF, o numero do documento de
-- identificacao, a carta de conducao e a morada de casa completa.
--
-- O autor viu o problema PARA O NISS e fechou-o bem (lista branca sem niss,
-- verificada por pg_get_functiondef). O mesmo raciocinio faltou para o resto.
-- E a classe "esconder no ecra nao e fechar" virada do avesso: a guarda estava
-- na tabela de origem e o historico era a porta de tras.
--
-- A politica passa a exigir a permissao DA TABELA DE ORIGEM. A coluna `tabela`
-- ja esta na linha, por isso resolve-se na propria politica, sem tabela nova.
--
-- E `irs_retencao_percentagem` sai da lista branca: e dado fiscal, nao faz
-- parte de nenhum fluxo de admissao, e estava la so por a lista ser "todos os
-- campos de negocio".
--
--
-- -- 3. O codigo do convite aceitava qualquer coisa ----------------------------
--
-- rpc_hr_convite_admissao_criar esta concedida a `authenticated` e aceitava
-- qualquer `p_token_hash` -- incluindo 'a' -- e qualquer prazo, desde que
-- futuro. Quem tivesse a permissao de enviar convites podia criar um cujo
-- codigo era trivialmente adivinhavel. A tabela promete SHA-256 em hexadecimal
-- num comentario, e a base nao o verificava. Fica estrutural.
--
--
-- -- O QUE ESTA MIGRATION NAO CORRIGE, E PORQUE --------------------------------
--
-- A revisao encontrou mais defeitos em rpc_hr_convite_admissao_submeter: a
-- submissao apaga em silencio os campos que nao vierem no pedido (incluindo o
-- NISS que o RH ja tinha posto), o contador de tentativas nao conta nada
-- porque o RAISE reverte o proprio incremento, nao ha tecto de tentativas na
-- base, e uma morada principal de outro tipo faz a submissao rebentar com um
-- erro em bruto.
--
-- Nao entram aqui porque NAO ESTAO ALCANCAVEIS: `_submeter` e `_estado` sao
-- service_role, e a Edge Function que as chamaria nao esta publicada. Corrigir
-- agora seria reescrever uma funcao longa que ninguem pode invocar. Ficam
-- registadas como BLOQUEANTES de publicar essa funcao.
--
-- Fica igualmente por decidir, e e decisao de produto e nao de codigo: se um
-- token valido pode substituir a permissao do utilizador para escrever o NISS
-- e o IBAN. Nao se publica a Edge Function sem essa decisao registada.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- A politica antiga esta no corpo de 20261124110000. A mao:
--   ALTER TABLE public.pessoas_convites_admissao
--     DROP CONSTRAINT pessoas_convites_admissao_token_hash_formato;
-- Repor o TRUNCATE em pessoas_fardamento nao se faz.
--
-- Prerequisitos:
--   20261124070000  pessoas_fardamento
--   20261124110000  pessoas_dados_alteracoes
--   20261124120000  pessoas_convites_admissao
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_fardamento') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_fardamento nao existe. Aplicar 20261124070000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_dados_alteracoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_dados_alteracoes nao existe. Aplicar 20261124110000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_convites_admissao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_convites_admissao nao existe. Aplicar 20261124120000 primeiro.';
  END IF;
  -- As seis permissoes que a politica nova cita tem de existir TODAS: uma
  -- politica com um codigo ausente devolve false em silencio, e o historico
  -- ficaria invisivel a toda a gente sem ninguem perceber porque.
  IF (SELECT count(DISTINCT code) FROM public.anew_permissions
       WHERE code IN ('hr.pessoas.view','hr.pessoas.pessoais.view',
                      'hr.pessoas.identificacao.view','hr.pessoas.morada.view',
                      'hr.pessoas.laborais.view','hr.pessoas.view.own')) <> 6 THEN
    RAISE EXCEPTION 'Faltam codigos de permissao dos que a politica nova cita. Confirmar o catalogo antes de aplicar.';
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. TRUNCATE em pessoas_fardamento
-- ==============================================================================
REVOKE ALL ON TABLE public.pessoas_fardamento FROM anon;
REVOKE ALL ON TABLE public.pessoas_fardamento FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_fardamento TO authenticated;
GRANT ALL ON TABLE public.pessoas_fardamento TO service_role;


-- ==============================================================================
-- 2. O historico passa a exigir a permissao da tabela de origem
-- ==============================================================================
DROP POLICY IF EXISTS pessoas_dados_alteracoes_select ON public.pessoas_dados_alteracoes;
CREATE POLICY pessoas_dados_alteracoes_select ON public.pessoas_dados_alteracoes
  FOR SELECT TO authenticated
  USING (
    (
      -- Cada linha exige a permissao de quem pode ler a tabela DE ONDE o valor
      -- veio. `tabela` esta na propria linha, por isso a decisao e local.
      (tabela = 'pessoas'
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view', organization_id)))
   OR (tabela = 'pessoas_dados_pessoais'
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.pessoais.view', organization_id)))
   OR (tabela = 'pessoas_identificacao'
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.identificacao.view', organization_id)))
   OR (tabela = 'pessoas_moradas'
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.morada.view', organization_id)))
   OR (tabela = 'pessoas_fardamento'
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.view', organization_id)))
    )
    OR (
      -- A propria pessoa continua a ver o seu historico todo. E dela.
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
      AND pessoa_id = public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id)
    )
  );

COMMENT ON POLICY pessoas_dados_alteracoes_select ON public.pessoas_dados_alteracoes IS
'Cada linha exige a permissao da TABELA DE ORIGEM, e nao hr.pessoas.view para tudo. Antes, quem so podia ver a lista de colegas lia pelo historico a data de nascimento, o NIF, o documento de identificacao e a morada de casa -- dados que as tabelas de origem fecham atras de permissoes proprias. A propria pessoa ve sempre o seu historico completo.';

-- `irs_retencao_percentagem` sai do historico: e dado fiscal, nao faz parte de
-- nenhum fluxo de admissao, e estava na lista so por ela ser "todos os campos".
CREATE OR REPLACE FUNCTION public.hr_dados_pessoais_registar_alteracao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campos text[] := ARRAY[
    'data_nascimento','ocultar_aniversario','genero','pronomes','nacionalidade',
    'telefone_pessoal','email_comunicacoes','estado_civil','dependentes',
    'naturalidade_freguesia','naturalidade_concelho',
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
    IF (v_old ->> v_campo) IS DISTINCT FROM (v_new ->> v_campo) THEN
      INSERT INTO public.pessoas_dados_alteracoes
        (pessoa_id, organization_id, tabela, campo, valor_antes, valor_depois, origem, created_by)
      VALUES
        (NEW.pessoa_id, NEW.organization_id, 'pessoas_dados_pessoais', v_campo,
         v_old ->> v_campo, v_new ->> v_campo, v_origem, v_criado_por);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_dados_pessoais_registar_alteracao() IS
'Lista branca dos campos de negocio de pessoas_dados_pessoais. SEM irs_retencao_percentagem: e dado fiscal e nao faz parte do historico de admissao.';


-- ==============================================================================
-- 3. O codigo do convite tem de ser um SHA-256
-- ==============================================================================
DO $formato$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
       AND conname = 'pessoas_convites_admissao_token_hash_formato'
  ) THEN
    RAISE NOTICE 'O CHECK do formato do token ja existe; nada a fazer.';
    RETURN;
  END IF;

  -- NOT VALID se houver convites de teste com hash de outro formato: fecha-se
  -- a porta ao que vier a seguir sem rebentar por causa do passado.
  IF EXISTS (
    SELECT 1 FROM public.pessoas_convites_admissao
     WHERE token_hash !~ '^[0-9a-f]{64}$'
  ) THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_token_hash_formato
      CHECK (token_hash ~ '^[0-9a-f]{64}$') NOT VALID;
    RAISE NOTICE 'CHECK do formato do token criado NOT VALID: ha convites com hash de outro formato.';
  ELSE
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_token_hash_formato
      CHECK (token_hash ~ '^[0-9a-f]{64}$');
    RAISE NOTICE 'CHECK do formato do token criado e validado.';
  END IF;
END;
$formato$;


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_privilegios text;
  v_def         text;
  v_codigo      text;
BEGIN
  -- 1. O fardamento nao pode ter TRUNCATE nem DELETE.
  IF has_table_privilege('authenticated', 'public.pessoas_fardamento', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.pessoas_fardamento', 'DELETE') THEN
    RAISE EXCEPTION 'pessoas_fardamento continua com TRUNCATE ou DELETE para authenticated.';
  END IF;

  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_privilegios
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pessoas_fardamento'
     AND grantee = 'authenticated';

  IF v_privilegios IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION
      'pessoas_fardamento: authenticated tem "%", esperava-se INSERT,SELECT,UPDATE.',
      coalesce(v_privilegios, '(nenhum)');
  END IF;

  -- 2. A politica nova tem mesmo de citar as permissoes das tabelas de origem.
  --    Se alguem a simplificar de volta para hr.pessoas.view, isto apanha.
  SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO v_def
    FROM pg_policy pol
   WHERE pol.polrelid = to_regclass('public.pessoas_dados_alteracoes')
     AND pol.polname = 'pessoas_dados_alteracoes_select';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'A politica pessoas_dados_alteracoes_select nao existe.';
  END IF;

  FOREACH v_codigo IN ARRAY ARRAY[
    'hr.pessoas.pessoais.view','hr.pessoas.identificacao.view',
    'hr.pessoas.morada.view','hr.pessoas.laborais.view'
  ]
  LOOP
    IF v_def NOT LIKE '%' || v_codigo || '%' THEN
      RAISE EXCEPTION
        'A politica de leitura do historico nao cita %. Sem isso, quem tem so hr.pessoas.view volta a ler pelo historico o que a tabela de origem fecha.',
        v_codigo;
    END IF;
  END LOOP;

  -- 3. O IRS nao pode voltar ao historico.
  SELECT pg_get_functiondef('public.hr_dados_pessoais_registar_alteracao()'::regprocedure) INTO v_def;
  IF v_def LIKE '%irs_retencao_percentagem%' THEN
    RAISE EXCEPTION 'irs_retencao_percentagem voltou a lista branca do historico.';
  END IF;

  -- 4. O CHECK do formato do token.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
       AND conname = 'pessoas_convites_admissao_token_hash_formato'
  ) THEN
    RAISE EXCEPTION 'O CHECK do formato do token nao ficou criado.';
  END IF;

  RAISE NOTICE 'OK: fardamento sem TRUNCATE, historico com a permissao da tabela de origem, IRS fora do historico, token do convite obrigado a SHA-256.';
END;
$conferir$;
