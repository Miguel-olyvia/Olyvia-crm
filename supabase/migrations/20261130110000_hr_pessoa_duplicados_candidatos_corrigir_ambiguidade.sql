-- ==============================================================================
-- hr_pessoa_duplicados_candidatos: corrigir "column reference \"pessoa_id\"
-- is ambiguous", medido ao vivo (permission denied confirmado para anon via
-- curl contra o remoto; o erro de ambiguidade em si so e alcancavel por uma
-- sessao authenticated ou pelo ramo service_role, e o proprio pedido desta
-- tarefa ja o mediu ao vivo com p_organization_id e p_nif preenchidos).
--
--
-- -- A CAUSA, CONFIRMADA POR LEITURA DA DEFINICAO REAL (pg_get_functiondef),
-- -- NAO POR SUPOSICAO -------------------------------------------------------
--
-- `RETURNS TABLE (pessoa_id uuid, ...)` declara `pessoa_id` como parametro de
-- SAIDA, e em PL/pgSQL um parametro de saida e uma variavel visivel dentro de
-- TODO o corpo da funcao -- exactamente como se tivesse sido declarado em
-- DECLARE. A CTE `candidatos`, no ficheiro original
-- (20261130020000_hr_pessoa_duplicados_candidatos.sql), tem cinco ramos que
-- seleccionam `pessoa_id` SEM qualificar:
--
--   SELECT pessoa_id, 'nif'::text AS campo_coincidente, ... FROM nif_match
--   SELECT pessoa_id, 'niss', ...                          FROM niss_match
--   SELECT pessoa_id, 'email_pessoal', ...                 FROM email_match
--   SELECT pessoa_id, 'documento', ...                      FROM doc_match
--   SELECT pessoa_id, 'nome', ...                           FROM nome_match
--
-- Cada uma dessas CTEs de origem (nif_match, niss_match, email_match,
-- doc_match, nome_match) TEM uma coluna `pessoa_id`. Com
-- `#variable_conflict` na omissao (o valor por omissao e `error`), quando um
-- identificador dentro de SQL embutido corresponde AO MESMO TEMPO a uma
-- coluna da consulta e a uma variavel PL/pgSQL, o Postgres recusa-se a
-- escolher e devolve exactamente "column reference \"pessoa_id\" is
-- ambiguous" -- o erro medido. NAO ha ambiguidade nas outras quatro colunas
-- de saida (nome_completo, campo_coincidente, forca, estado) porque em todos
-- os outros locais do corpo elas ou sao alias literais (`'nif'::text AS
-- campo_coincidente`) ou ja vem qualificadas (`c.forca`, `p.nome_completo`) --
-- so estes cinco `pessoa_id` nao qualificados colidem.
--
--
-- -- A CORRECCAO ESCOLHIDA, E PORQUE NAO AS OUTRAS DUAS -----------------------
--
-- Qualificar os cinco `pessoa_id` com o nome da CTE de origem
-- (`nif_match.pessoa_id`, etc). Prefere-se isto a:
--
--   - `#variable_conflict use_column`: resolveria os cinco casos, mas muda o
--     comportamento de QUALQUER identificador ambiguo em TODO o corpo da
--     funcao, presente e futuro -- incluindo um que venha a ser introduzido
--     por engano numa alteracao seguinte, e que ficaria a escolher a coluna
--     em silencio em vez de avisar. Qualificar e cirurgico: corrige so os
--     cinco locais que sao mesmo o problema.
--   - Renomear as colunas de saida (ex.: pessoa_id -> id): tem DOIS
--     consumidores que leem pelo nome exacto, confirmados em `src/` e nas
--     migrations:
--       * src/hooks/usePessoaDuplicados.ts (RespostaRpc.pessoa_id,
--         linha.pessoa_id, linha.nome_completo, linha.campo_coincidente,
--         linha.forca, linha.estado)
--       * supabase/migrations/20261130030000_hr_convite_admissao_portao_duplicados.sql
--         (`cand.campo_coincidente`, `cand.forca`)
--     Renomear obrigaria a tocar nos dois a par desta migration, por nenhum
--     ganho -- a assinatura de retorno fica identica.
--
-- A assinatura da funcao (nomes, tipos, ordem dos parametros de entrada e
-- das colunas de saida) fica EXACTAMENTE igual. So o corpo muda.
--
--
-- -- O QUE NAO MUDA (repetido do original, para nao se perder na correccao) --
--
-- Devolve SO identidade da ficha (pessoa_id, nome_completo,
-- campo_coincidente, forca, estado) -- NUNCA nif, niss, email_pessoal nem
-- data_nascimento. Recusa com insufficient_privilege quem nao tenha
-- hr.pessoas.create nem hr.pessoas.edit NAQUELA organizacao. auth.uid() IS
-- NULL (service_role) devolve tudo sem gate -- o convite depende disto. SEM
-- EXECUTE para anon.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito -- a migracao anterior
-- (20261130020000) ficava com a funcao partida, por isso reverter para ela
-- reintroduz o bug. Se for mesmo preciso desfazer esta correccao, recriar a
-- funcao com a definicao completa desta migration, com um novo ficheiro.
--
--
-- Prerequisitos:
--   20261130020000  hr_pessoa_duplicados_candidatos (a versao partida)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos'
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos nao existe. Aplicar 20261130020000 primeiro.';
  END IF;

  RAISE NOTICE 'Guardas passadas.';
END;
$guardas$;

-- ==============================================================================
-- A funcao, corrigida: os cinco `pessoa_id` da CTE `candidatos` passam a vir
-- qualificados pelo nome da CTE de origem. Tudo o resto e identico ao
-- original (20261130020000).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_pessoa_duplicados_candidatos(
  p_organization_id  uuid,
  p_nif              text,
  p_niss             text,
  p_email_pessoal    text,
  p_tipo_documento   text,
  p_numero_documento text,
  p_primeiro_nome    text,
  p_apelido          text,
  p_data_nascimento  date,
  p_excluir_pessoa_id uuid
)
RETURNS TABLE (
  pessoa_id        uuid,
  nome_completo    text,
  campo_coincidente text,
  forca            text,
  estado           text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_servico  boolean := (v_uid IS NULL);
BEGIN
  IF NOT v_servico THEN
    IF NOT (
      public.has_anew_permission_in_org(v_uid, 'hr.pessoas.create', p_organization_id)
      OR public.has_anew_permission_in_org(v_uid, 'hr.pessoas.edit', p_organization_id)
    ) THEN
      -- NUNCA lista vazia: le-se como "nao ha duplicado". Recusa-se.
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH nif_match AS (
    SELECT i.pessoa_id, p.deleted_at
    FROM public.pessoas_identificacao i
    JOIN public.pessoas p ON p.id = i.pessoa_id AND p.organization_id = i.organization_id
    WHERE i.organization_id = p_organization_id
      AND p_nif IS NOT NULL
      AND i.nif = p_nif
      AND i.pessoa_id IS DISTINCT FROM p_excluir_pessoa_id
  ),
  niss_match AS (
    SELECT i.pessoa_id, p.deleted_at
    FROM public.pessoas_identificacao i
    JOIN public.pessoas p ON p.id = i.pessoa_id AND p.organization_id = i.organization_id
    WHERE i.organization_id = p_organization_id
      AND p_niss IS NOT NULL
      AND i.niss = p_niss
      AND i.pessoa_id IS DISTINCT FROM p_excluir_pessoa_id
  ),
  email_match AS (
    SELECT p.id AS pessoa_id, p.deleted_at
    FROM public.pessoas p
    WHERE p.organization_id = p_organization_id
      AND p_email_pessoal IS NOT NULL AND btrim(p_email_pessoal) <> ''
      AND p.email_pessoal IS NOT NULL
      AND lower(btrim(p.email_pessoal)) = lower(btrim(p_email_pessoal))
      AND p.id IS DISTINCT FROM p_excluir_pessoa_id
  ),
  doc_match AS (
    SELECT i.pessoa_id, p.deleted_at
    FROM public.pessoas_identificacao i
    JOIN public.pessoas p ON p.id = i.pessoa_id AND p.organization_id = i.organization_id
    WHERE i.organization_id = p_organization_id
      AND p_tipo_documento IS NOT NULL
      AND p_numero_documento IS NOT NULL AND btrim(p_numero_documento) <> ''
      AND i.tipo_documento = p_tipo_documento
      AND i.numero_documento = p_numero_documento
      AND i.pessoa_id IS DISTINCT FROM p_excluir_pessoa_id
  ),
  nome_bruto AS (
    SELECT p.id AS pessoa_id, p.deleted_at, dp.data_nascimento
    FROM public.pessoas p
    LEFT JOIN public.pessoas_dados_pessoais dp ON dp.pessoa_id = p.id
    WHERE p.organization_id = p_organization_id
      AND p_primeiro_nome IS NOT NULL AND btrim(p_primeiro_nome) <> ''
      AND p_apelido IS NOT NULL AND btrim(p_apelido) <> ''
      AND lower(btrim(p.primeiro_nome)) = lower(btrim(p_primeiro_nome))
      AND lower(btrim(p.apelido)) = lower(btrim(p_apelido))
      AND p.id IS DISTINCT FROM p_excluir_pessoa_id
  ),
  -- O nome SO conta acompanhado de outro sinal ou de data de nascimento
  -- coincidente -- nunca sozinho.
  nome_match AS (
    SELECT nb.pessoa_id, nb.deleted_at
    FROM nome_bruto nb
    WHERE EXISTS (SELECT 1 FROM email_match em WHERE em.pessoa_id = nb.pessoa_id)
       OR EXISTS (SELECT 1 FROM doc_match dm WHERE dm.pessoa_id = nb.pessoa_id)
       OR (p_data_nascimento IS NOT NULL AND nb.data_nascimento = p_data_nascimento)
  ),
  -- Os cinco `pessoa_id` abaixo vem QUALIFICADOS com o nome da CTE de
  -- origem -- esta e a correccao. Sem a qualificacao, cada um colide com o
  -- parametro de saida `pessoa_id` da funcao (RETURNS TABLE) e o Postgres
  -- recusa escolher, com #variable_conflict na omissao (`error`).
  candidatos AS (
    SELECT nif_match.pessoa_id, 'nif'::text AS campo_coincidente, 'travao'::text AS forca, nif_match.deleted_at FROM nif_match
    UNION ALL
    SELECT niss_match.pessoa_id, 'niss', 'travao', niss_match.deleted_at FROM niss_match
    UNION ALL
    SELECT email_match.pessoa_id, 'email_pessoal', 'sinal', email_match.deleted_at FROM email_match
    UNION ALL
    SELECT doc_match.pessoa_id, 'documento', 'sinal', doc_match.deleted_at FROM doc_match
    UNION ALL
    SELECT nome_match.pessoa_id, 'nome', 'sinal', nome_match.deleted_at FROM nome_match
  )
  SELECT
    c.pessoa_id,
    p.nome_completo,
    c.campo_coincidente,
    c.forca,
    CASE WHEN c.deleted_at IS NULL THEN 'activa' ELSE 'apagada' END AS estado
  FROM candidatos c
  JOIN public.pessoas p ON p.id = c.pessoa_id
  ORDER BY c.pessoa_id, c.campo_coincidente;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_pessoa_duplicados_candidatos(
  uuid, text, text, text, text, text, text, text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_pessoa_duplicados_candidatos(
  uuid, text, text, text, text, text, text, text, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_pessoa_duplicados_candidatos(
  uuid, text, text, text, text, text, text, text, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_pessoa_duplicados_candidatos(
  uuid, text, text, text, text, text, text, text, date, uuid) TO service_role;

COMMENT ON FUNCTION public.hr_pessoa_duplicados_candidatos(
  uuid, text, text, text, text, text, text, text, date, uuid) IS
'Dado um conjunto de valores a verificar (nif, niss, email_pessoal, tipo+numero de documento, nome, data de nascimento), devolve as FICHAS candidatas a serem a mesma pessoa -- NUNCA os valores. forca=travao (nif, niss) e coincidencia de documento oficial, so pode ser a mesma pessoa; forca=sinal (email, documento, nome) pode ser coincidencia e so avisa. O nome nunca aparece sozinho: exige outro sinal ou data de nascimento igual. Procura tambem em fichas apagadas (estado=apagada), porque readmitir reutiliza a ficha. SECURITY DEFINER porque le niss, fechada a authenticated por grant de coluna. Gate: quem nao tem hr.pessoas.create OU hr.pessoas.edit naquela organizacao leva insufficient_privilege, nunca lista vazia (vazio le-se como "sem duplicado"). auth.uid() NULL = service_role, devolve tudo sem gate -- e o que rpc_hr_convite_admissao_submeter usa para verificar duplicados antes de escrever. Corrigida em 20261130110000: os pessoa_id da CTE candidatos vem qualificados, porque colidiam com o parametro de saida do mesmo nome ("column reference pessoa_id is ambiguous").';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_src text;
  v_result text;
  v_count int;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos') <> 1 THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos nao ficou exactamente uma vez.';
  END IF;

  IF has_function_privilege('anon', 'public.hr_pessoa_duplicados_candidatos(uuid, text, text, text, text, text, text, text, date, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos ficou aberta a anon -- NUNCA pode ficar.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.hr_pessoa_duplicados_candidatos(uuid, text, text, text, text, text, text, text, date, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos deixou de ser executavel por authenticated.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_pessoa_duplicados_candidatos(uuid, text, text, text, text, text, text, text, date, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos deixou de ser executavel por service_role -- o portao do convite precisa dela.';
  END IF;

  SELECT pg_get_functiondef('public.hr_pessoa_duplicados_candidatos(uuid, text, text, text, text, text, text, text, date, uuid)'::regprocedure) INTO v_src;

  IF v_src NOT LIKE '%v_servico%' THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos ficou sem o ramo de service_role.';
  END IF;
  IF v_src NOT LIKE '%insufficient_privilege%' THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos ficou sem a recusa a quem nao tem permissao.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos'
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos perdeu SECURITY DEFINER ou o search_path fixo.';
  END IF;

  -- A saida nunca inclui as colunas proibidas: confere-se contra a ASSINATURA
  -- de retorno REAL da funcao (pg_get_function_result), nao contra o texto do
  -- ficheiro .sql.
  SELECT pg_get_function_result(p.oid) INTO v_result
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos';

  IF v_result IS NULL
     OR v_result NOT LIKE '%pessoa_id%' OR v_result NOT LIKE '%nome_completo%'
     OR v_result NOT LIKE '%campo_coincidente%' OR v_result NOT LIKE '%forca%'
     OR v_result NOT LIKE '%estado%' THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos nao devolve as 5 colunas esperadas. Assinatura: %', v_result;
  END IF;

  IF v_result LIKE '%nif%' OR v_result LIKE '%niss%' OR v_result LIKE '%email%'
     OR v_result LIKE '%nascimento%' THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos passou a devolver um campo proibido (nif/niss/email/data_nascimento). Assinatura: %', v_result;
  END IF;

  -- ---- A parte que a migracao anterior NAO fez: CHAMAR a funcao a serio. --
  -- Sem isto, uma funcao que aplica limpa mas nunca corre passa despercebida
  -- -- foi exactamente o que aconteceu da ultima vez. Chama-se sempre como
  -- service_role (auth.uid() IS NULL dentro de um bloco DO/PL-pgSQL de
  -- migration, correndo como o dono da migracao) para exercitar o ramo que
  -- nao precisa de sessao -- o mesmo ramo que rpc_hr_convite_admissao_submeter
  -- usa -- sem depender de nenhum utilizador de teste existir no ambiente.
  -- Cada chamada teria disparado "column reference pessoa_id is ambiguous"
  -- antes desta correccao; qualquer excepcao aqui falha a migration.

  -- 1) Caminho por NIF: so verifica que corre sem levantar excepcao. Nao se
  --    assume nenhum resultado especifico (os dados reais da organizacao sao
  --    desconhecidos nesta migration) -- o que se testa e que a CONSULTA nao
  --    rebenta, que era o bug.
  PERFORM 1 FROM public.hr_pessoa_duplicados_candidatos(
    'b6ffce4f-f630-4933-833a-008649757a33'::uuid,
    '999999999', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );

  -- 2) Caminho por NISS.
  PERFORM 1 FROM public.hr_pessoa_duplicados_candidatos(
    'b6ffce4f-f630-4933-833a-008649757a33'::uuid,
    NULL, '99999999999', NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );

  -- 3) Caminho por nome + data de nascimento (o unico em que o nome sozinho
  --    passa a contar, por vir acompanhado da data).
  PERFORM 1 FROM public.hr_pessoa_duplicados_candidatos(
    'b6ffce4f-f630-4933-833a-008649757a33'::uuid,
    NULL, NULL, NULL, NULL, NULL,
    'Zzz_teste_conferir_migration', 'Zzz_teste_conferir_migration',
    '1900-01-01'::date, NULL
  );

  -- 4) Caminho que devolve vazio de propósito: valores que quase de certeza
  --    nao existem em nenhuma organizacao. Confirma que "sem duplicado" e
  --    mesmo zero linhas, e nao um erro disfarcado de zero linhas.
  SELECT count(*) INTO v_count FROM public.hr_pessoa_duplicados_candidatos(
    'b6ffce4f-f630-4933-833a-008649757a33'::uuid,
    'zzz-nif-que-nao-existe-de-certeza-99999',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos devolveu % linha(s) para um NIF fabricado que nao deveria coincidir com nada -- rever o filtro.', v_count;
  END IF;

  RAISE NOTICE 'OK: hr_pessoa_duplicados_candidatos corrigida -- chamada por nif, por niss, por nome+nascimento e o caminho vazio correram todas sem "ambiguous", SECURITY DEFINER, aberta a authenticated e service_role, fechada a anon, com gate de permissao, ramo de service_role, e saida limitada as 5 colunas de ficha.';
END;
$conferir$;
