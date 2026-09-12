-- ==============================================================================
-- hr_pessoa_duplicados_candidatos: dado um conjunto de valores a verificar,
-- devolve FICHAS que podem ser a mesma pessoa -- nunca os valores em si.
--
-- POR APLICAR.
--
--
-- -- O QUE DEVOLVE E O QUE NUNCA DEVOLVE ---------------------------------------
--
-- Entrada: os valores que o ecra (ou o convite) tem NAQUELE momento -- nif,
-- niss, email_pessoal, tipo+numero de documento, primeiro_nome, apelido,
-- data_nascimento -- e a pessoa a excluir (ela propria, quando ja existe uma
-- ficha em edicao).
--
-- Saida: (pessoa_id, nome_completo, campo_coincidente, forca, estado) das
-- fichas candidatas. NUNCA nif, niss, niss_ultimos4, data_nascimento nem
-- email -- devolver o nome e a razao do encontro basta para o ecra dizer
-- "parece que ja existe uma ficha para isto" e oferecer abri-la; devolver o
-- NIF ou o NISS transformaria a funcao num oraculo de adivinhar dados de
-- terceiros por tentativa e erro.
--
-- `forca`:
--   'travao' -- nif, niss: dois documentos de identificacao oficiais iguais
--              SO podem ser a mesma pessoa. Bloqueia.
--   'sinal'  -- email_pessoal, (tipo_documento+numero_documento), nome: podem
--              coincidir por acaso (nome comum, email partilhado por um
--              casal). Avisa, nao bloqueia.
--
-- O NOME e o sinal mais fraco de todos -- ha muita gente com o mesmo nome.
-- SO devolve linha quando vem acompanhado de OUTRO sinal (email OU documento)
-- OU de data de nascimento coincidente. Nome sozinho nunca aparece: seria
-- ruido a mais para ser util.
--
-- `estado` e 'activa' ou 'apagada' -- a procura cobre TAMBEM as fichas com
-- deleted_at preenchido, porque readmitir reutiliza a ficha (o mesmo criterio
-- do indice unico parcial da migracao seguinte, por aplicar).
--
--
-- -- O GATE ---------------------------------------------------------------
--
-- SECURITY DEFINER com search_path fixo, porque precisa de ler `niss`
-- (fechada a authenticated por grant de coluna) para comparar contra o
-- pedido.
--
-- Quem nao tiver `hr.pessoas.create` OU `hr.pessoas.edit` NAQUELA organizacao
-- leva insufficient_privilege -- NUNCA lista vazia: uma lista vazia le-se
-- como "nao ha duplicado", e dizer isso a quem nao pode ver nada e pior do
-- que recusar (o mesmo criterio de hr_admissao_pendencias, 20261129020000).
--
-- `p_organization_id` nao e aceite a confianca: `has_anew_permission_in_org`
-- confirma a permissao NAQUELA organizacao, com membership activo -- nao
-- basta ter a permissao nalguma organizacao.
--
-- `auth.uid() IS NULL` significa service_role (chamada sem sessao, tal como
-- em hr_admissao_pendencias) e devolve tudo sem gate: e o que
-- `rpc_hr_convite_admissao_submeter` (migracao seguinte) precisa para
-- verificar duplicados antes de escrever, sem ter sessao de utilizador
-- nenhuma.
--
-- EXECUTE so a authenticated e service_role. anon NUNCA -- o bloco CONFERIR
-- aborta se anon tiver EXECUTE.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.hr_pessoa_duplicados_candidatos(
--     uuid, text, text, text, text, text, text, text, date, uuid);
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.* (hr.pessoas.create, hr.pessoas.edit)
--   20261120030000  pessoas
--   20261120040000  pessoas_dados_pessoais, pessoas_identificacao
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_identificacao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_identificacao nao existe. Aplicar 20261120040000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_dados_pessoais') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_dados_pessoais nao existe. Aplicar 20261120040000 primeiro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org'
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org nao existe. Aplicar 20261120010000 primeiro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.create')
     OR NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.create ou hr.pessoas.edit nao estao no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  RAISE NOTICE 'Guardas passadas.';
END;
$guardas$;

-- ==============================================================================
-- A funcao
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_pessoa_duplicados_candidatos(
  uuid, text, text, text, text, text, text, text, date, uuid);

CREATE FUNCTION public.hr_pessoa_duplicados_candidatos(
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
  candidatos AS (
    SELECT pessoa_id, 'nif'::text AS campo_coincidente, 'travao'::text AS forca, deleted_at FROM nif_match
    UNION ALL
    SELECT pessoa_id, 'niss', 'travao', deleted_at FROM niss_match
    UNION ALL
    SELECT pessoa_id, 'email_pessoal', 'sinal', deleted_at FROM email_match
    UNION ALL
    SELECT pessoa_id, 'documento', 'sinal', deleted_at FROM doc_match
    UNION ALL
    SELECT pessoa_id, 'nome', 'sinal', deleted_at FROM nome_match
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
'Dado um conjunto de valores a verificar (nif, niss, email_pessoal, tipo+numero de documento, nome, data de nascimento), devolve as FICHAS candidatas a serem a mesma pessoa -- NUNCA os valores. forca=travao (nif, niss) e coincidencia de documento oficial, so pode ser a mesma pessoa; forca=sinal (email, documento, nome) pode ser coincidencia e so avisa. O nome nunca aparece sozinho: exige outro sinal ou data de nascimento igual. Procura tambem em fichas apagadas (estado=apagada), porque readmitir reutiliza a ficha. SECURITY DEFINER porque le niss, fechada a authenticated por grant de coluna. Gate: quem nao tem hr.pessoas.create OU hr.pessoas.edit naquela organizacao leva insufficient_privilege, nunca lista vazia (vazio le-se como "sem duplicado"). auth.uid() NULL = service_role, devolve tudo sem gate -- e o que rpc_hr_convite_admissao_submeter usa para verificar duplicados antes de escrever.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_src text;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos') <> 1 THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos nao ficou exactamente uma vez.';
  END IF;

  IF has_function_privilege('anon', 'public.hr_pessoa_duplicados_candidatos(uuid, text, text, text, text, text, text, text, date, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos ficou aberta a anon -- NUNCA pode ficar.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.hr_pessoa_duplicados_candidatos(uuid, text, text, text, text, text, text, text, date, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos deixou de ser executavel por authenticated -- era o objectivo desta migracao.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_pessoa_duplicados_candidatos(uuid, text, text, text, text, text, text, text, date, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos deixou de ser executavel por service_role -- o portao do convite (migracao seguinte) precisa dela.';
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
  DECLARE
    v_result text;
  BEGIN
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
  END;

  RAISE NOTICE 'OK: hr_pessoa_duplicados_candidatos criada, SECURITY DEFINER, aberta a authenticated e service_role, fechada a anon, com gate de permissao, ramo de service_role, e saida limitada as 5 colunas de ficha.';
END;
$conferir$;
