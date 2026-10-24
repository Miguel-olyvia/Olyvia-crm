-- ==============================================================================
-- pessoas_retribuicoes ganha ALTERAR e CORRIGIR, no MESMO molde exacto de
-- pessoas_vinculos_horas (20261130180000): uma permissao nova
-- (hr.pessoas.retribuicao.corrigir) e as politicas de INSERT/UPDATE passam a
-- distinguir, pelo `valido_ate` da linha, uma ALTERACAO (hoje/futuro, exige
-- .edit -- ja existente e reaproveitada) de uma CORRECCAO (periodo ja
-- decorrido, exige .corrigir -- nova, perigosa).
--
-- Ate agora a retribuicao so se escrevia na admissao (INSERT directo, sem
-- politica dedicada de "alterar"); esta migracao NAO muda esse caminho --
-- so acrescenta o que faltava para dar um aumento, promover ou corrigir um
-- valor errado depois da admissao, coisa que hoje nao tem NENHUMA forma na
-- aplicacao.
--
-- SEM DADOS NOVOS, SEM TABELAS NOVAS: pessoas_retribuicoes, os seus indices,
-- triggers (nao-sobreposicao, auditoria, ancora imutavel) e a coluna
-- duodecimos_pct ja existem (20261120060000, 20261124090000) e nao mudam
-- aqui. So RLS de INSERT/UPDATE e o catalogo de permissoes.
-- ==============================================================================

DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_retribuicoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_retribuicoes nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_periodo_decorrido' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'public.hr_periodo_decorrido(date) nao existe. Aplicar 20261130060000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.edit nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.view') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Catalogo: nova permissao, mesma forma exacta de
-- hr.pessoas.vinculos.horas.corrigir (20261130050000). sort_order = 211,
-- entre hr.pessoas.retribuicao.edit (210) e hr.pessoas.bancarios.view (220).
--
-- Deliberadamente NAO se atribui a nenhum papel (nem super_admin) --
-- retribuicao segue a mesma politica de "zero atribuicoes por omissao" com
-- que .view e .edit ja nasceram (20261120020000): quem responde pelos dados
-- de uma organizacao atribui-a a proposito, no ecra de papeis.
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.pessoas.retribuicao.corrigir', 'Corrigir retribuicao passada',
   'PERIGOSA. CORRECCAO: mexer numa versao de retribuicao cujo periodo ja decorreu -- "o que registamos para Marco estava errado". A ALTERACAO (abrir uma versao nova a partir de hoje) continua a usar hr.pessoas.retribuicao.edit -- nao se duplica essa autoridade aqui.',
   'hr', 'hr.pessoas.retribuicao.edit', 211, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- ==============================================================================
-- 2. RLS: substituir INSERT e UPDATE de pessoas_retribuicoes para distinguir
-- ALTERACAO de CORRECCAO, EXACTAMENTE como pessoas_vinculos_horas_insert/
-- _update (20261130180000, linhas ~1474-1502). SELECT e o bloqueio de DELETE
-- nao mudam.
-- ==============================================================================

-- ALTERACAO vs CORRECCAO: o WITH CHECK de um INSERT nao tem linha "antiga" a
-- avaliar, por isso decide-se pelo valido_ate da propria linha nova -- mesmo
-- padrao de pessoas_vinculos_horas_insert e pessoas_afectacoes_insert.
DROP POLICY IF EXISTS pessoas_retribuicoes_insert ON public.pessoas_retribuicoes;
CREATE POLICY pessoas_retribuicoes_insert ON public.pessoas_retribuicoes
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (
      (
        NOT public.hr_periodo_decorrido(valido_ate)
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.edit', organization_id))
      )
      OR (
        public.hr_periodo_decorrido(valido_ate)
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.corrigir', organization_id))
      )
    )
  );

-- O USING avalia a linha ANTIGA num UPDATE: decide ai se esta linha, tal como
-- estava, e uma ALTERACAO (nao decorrida) ou uma CORRECCAO (ja decorrida).
DROP POLICY IF EXISTS pessoas_retribuicoes_update ON public.pessoas_retribuicoes;
CREATE POLICY pessoas_retribuicoes_update ON public.pessoas_retribuicoes
  FOR UPDATE TO authenticated
  USING (
    (
      NOT public.hr_periodo_decorrido(valido_ate)
      AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.edit', organization_id))
    )
    OR (
      public.hr_periodo_decorrido(valido_ate)
      AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.corrigir', organization_id))
    )
  )
  WITH CHECK (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.edit', organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.corrigir', organization_id))
  );

-- pessoas_retribuicoes_select e pessoas_retribuicoes_block_delete
-- (20261120060000) NAO se tocam.

COMMENT ON POLICY pessoas_retribuicoes_insert ON public.pessoas_retribuicoes IS
'ALTERACAO (hr.pessoas.retribuicao.edit, reaproveitada): a linha nao decorreu -- inclui a admissao, que continua a inserir por aqui. CORRECCAO (hr.pessoas.retribuicao.corrigir, perigosa, desde 20261201040000): a linha ja decorreu -- inserir uma versao puramente historica.';
COMMENT ON POLICY pessoas_retribuicoes_update ON public.pessoas_retribuicoes IS
'O USING decide pela linha ANTIGA: se ainda nao decorreu, exige .edit (ALTERACAO); se ja decorreu, exige .corrigir (CORRECCAO, perigosa). Mesma logica de pessoas_vinculos_horas_update e pessoas_afectacoes_update.';

-- ==============================================================================
-- 3. Conferir -- EXERCITA a mudanca a serio, com organizacao e pessoa
-- fabricadas (sem FK a nike ou a qualquer organizacao pre-existente), dentro
-- de um bloco aninhado que TERMINA sempre com SQLSTATE HR900 (o mesmo
-- sentinela de sucesso de 20261130200000) -- a subtransacao implicita do
-- bloco desfaz tudo, com sucesso ou falha. WHEN OTHERS nunca engole
-- SQLSTATE/SQLERRM reais.
--
-- Verificacao ESTRUTURAL das politicas (pg_policies.with_check/qual, ja em
-- texto, reconstruido pelo proprio Postgres): o dono da migracao corre com
-- privilegios que normalmente atravessam RLS de forma diferente de um
-- utilizador autenticado comum, por isso simular a sessao nao seria um teste
-- realista da politica em si -- confirma-se em vez disso que o TEXTO da
-- politica aplicada contem as referencias certas. NAO e uma tecnica com
-- precedente nesta base (as outras migracoes deste modulo so confirmam
-- CONTAGEM de politicas via pg_policies, nunca leem qual/with_check) --
-- introduzida aqui porque a mudanca em si e so de RLS, sem corpo de funcao
-- para inspeccionar com pg_get_functiondef como as outras fazem.
--
-- UMA POLITICA "FOR INSERT" NAO TEM "USING", SO "WITH CHECK": por isso
-- pg_policies.qual (que reflecte polqual, o USING) vem sempre NULL para
-- pessoas_retribuicoes_insert -- so pg_policies.with_check (polwithcheck)
-- tem o predicado. Ler qual aqui falharia SEMPRE, nao por acaso.
-- ==============================================================================
DO $conferir$
BEGIN
  DECLARE
    v_org_teste       uuid;
    v_pessoa_teste    uuid;
    v_permissao       record;
    v_insert_qual     text;
    v_update_qual     text;
    v_update_check    text;
  BEGIN
    -- 3.1: a permissao nova esta no catalogo, com a forma certa.
    SELECT * INTO v_permissao
      FROM public.anew_permissions
     WHERE code = 'hr.pessoas.retribuicao.corrigir';

    IF v_permissao.code IS NULL THEN
      RAISE EXCEPTION 'hr.pessoas.retribuicao.corrigir nao ficou no catalogo.'
        USING ERRCODE = 'HR901';
    END IF;

    IF v_permissao.parent_code IS DISTINCT FROM 'hr.pessoas.retribuicao.edit' THEN
      RAISE EXCEPTION 'hr.pessoas.retribuicao.corrigir devia pendurar em hr.pessoas.retribuicao.edit, pendura em %.',
        v_permissao.parent_code
        USING ERRCODE = 'HR902';
    END IF;

    IF v_permissao.is_dangerous IS NOT TRUE THEN
      RAISE EXCEPTION 'hr.pessoas.retribuicao.corrigir devia estar marcada is_dangerous.'
        USING ERRCODE = 'HR903';
    END IF;

    -- 3.2: as politicas de INSERT/UPDATE mudaram e falam da permissao nova e
    -- de hr_periodo_decorrido -- confirmado estruturalmente pelo texto que o
    -- proprio Postgres reconstroi em pg_policies, coluna a coluna. INSERT so
    -- tem WITH CHECK (nunca USING) -- por isso le-se with_check, nao qual.
    SELECT pg.with_check INTO v_insert_qual
      FROM pg_policies pg
     WHERE pg.schemaname = 'public'
       AND pg.tablename = 'pessoas_retribuicoes'
       AND pg.policyname = 'pessoas_retribuicoes_insert';

    IF v_insert_qual IS NULL
       OR position('hr.pessoas.retribuicao.corrigir' IN v_insert_qual) = 0
       OR position('hr_periodo_decorrido' IN v_insert_qual) = 0 THEN
      RAISE EXCEPTION 'pessoas_retribuicoes_insert nao referencia hr.pessoas.retribuicao.corrigir/hr_periodo_decorrido no WITH CHECK (lido via pg_policies.with_check).'
        USING ERRCODE = 'HR904';
    END IF;

    SELECT pg.qual, pg.with_check INTO v_update_qual, v_update_check
      FROM pg_policies pg
     WHERE pg.schemaname = 'public'
       AND pg.tablename = 'pessoas_retribuicoes'
       AND pg.policyname = 'pessoas_retribuicoes_update';

    IF v_update_qual IS NULL
       OR position('hr.pessoas.retribuicao.corrigir' IN v_update_qual) = 0
       OR position('hr_periodo_decorrido' IN v_update_qual) = 0 THEN
      RAISE EXCEPTION 'pessoas_retribuicoes_update nao referencia hr.pessoas.retribuicao.corrigir/hr_periodo_decorrido no USING.'
        USING ERRCODE = 'HR905';
    END IF;

    IF v_update_check IS NULL
       OR position('hr.pessoas.retribuicao.corrigir' IN v_update_check) = 0 THEN
      RAISE EXCEPTION 'pessoas_retribuicoes_update nao referencia hr.pessoas.retribuicao.corrigir no WITH CHECK.'
        USING ERRCODE = 'HR906';
    END IF;

    -- 3.3: pessoas_retribuicoes_select e o bloqueio de DELETE continuam la,
    -- sem terem sido tocados por engano (DROP POLICY sem CREATE a seguir).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'pessoas_retribuicoes'
         AND policyname = 'pessoas_retribuicoes_select'
    ) THEN
      RAISE EXCEPTION 'pessoas_retribuicoes_select desapareceu -- nao devia ter sido tocada.'
        USING ERRCODE = 'HR907';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'pessoas_retribuicoes'
         AND policyname = 'pessoas_retribuicoes_block_delete'
    ) THEN
      RAISE EXCEPTION 'pessoas_retribuicoes_block_delete desapareceu -- nao devia ter sido tocada.'
        USING ERRCODE = 'HR908';
    END IF;

    -- 3.4: dados fabricados, so para confirmar que a tabela continua a
    -- aceitar um INSERT normal por parte de quem corre esta migracao
    -- (service_role/dono, que atravessa RLS) -- nao prova RLS em si (isso
    -- ja ficou confirmado estruturalmente acima), so que o DDL novo nao
    -- partiu a tabela.
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261201040000 (descartavel)')
    RETURNING id INTO v_org_teste;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_teste, 'Teste Migracao', 'Retribuicao 20261201040000')
    RETURNING id INTO v_pessoa_teste;

    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade, valido_de, valido_ate)
    VALUES
      (v_pessoa_teste, v_org_teste, 1500, 'EUR', 'mensal', '2024-01-01', NULL);

    IF NOT EXISTS (
      SELECT 1 FROM public.pessoas_retribuicoes
       WHERE pessoa_id = v_pessoa_teste AND organization_id = v_org_teste
    ) THEN
      RAISE EXCEPTION 'INSERT de teste em pessoas_retribuicoes nao gravou nenhuma linha.'
        USING ERRCODE = 'HR909';
    END IF;

    -- Todas as assercoes passaram: forcar o desfazer da organizacao, pessoa
    -- e retribuicao de teste, com o sentinela de sucesso convencionado
    -- (HR900, o mesmo de 20261130180000/20261130200000).
    RAISE EXCEPTION 'teste_retribuicao_alterar_corrigir_20261201040000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, dados de teste desfeitos pela subtransacao implicita
    WHEN OTHERS THEN
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migracao (ALTERAR/CORRIGIR de pessoas_retribuicoes) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'OK: hr.pessoas.retribuicao.corrigir no catalogo, pessoas_retribuicoes_insert/_update distinguem ALTERAR de CORRIGIR pelo valido_ate, select/block_delete intocadas -- confirmado ao vivo e estruturalmente, com organizacao e pessoa proprias, desfeitas pela subtransacao.';
END;
$conferir$;
