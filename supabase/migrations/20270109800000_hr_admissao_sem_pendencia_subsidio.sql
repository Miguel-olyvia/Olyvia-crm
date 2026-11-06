-- ==============================================================================
-- Admissao: o subsidio de alimentacao deixa de ser pendencia da ficha.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto e confirmar que o
-- carimbo 20270109800000 fica acima do maximo aplicado e que so este ficheiro
-- (e as dependencias abaixo) esta pendente; (2) correr a prova na nike em
-- transaccao desfeita; (3) revisao ecc:database-reviewer e
-- ecc:security-reviewer. Depende de 20270109700000 (e esta de 20270109600000)
-- ja aplicadas: a regra salarial da organizacao e a fonte do subsidio.
--
--
-- -- PORQUE -------------------------------------------------------------------
--
-- O subsidio de almoco passou a ser obrigatorio no CARGO e a vir da regra
-- salarial da organizacao (hr_regras_salariais), nunca por pessoa. A ficha
-- continuava a dar "falta o subsidio de alimentacao" a quem nao tinha
-- pessoas_retribuicoes.subsidio_alimentacao preenchido na retribuicao em
-- aberto, o que travava a criacao de acesso (criar-acesso-pessoa recusa com
-- pendencias de posicao convite ou ficha) por um valor que ja nao se escreve
-- por pessoa.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- hr_admissao_pendencias(uuid) RETURNS TABLE (codigo text, origem text,
-- posicao text): MESMA assinatura e MESMO RETURNS TABLE, por isso CREATE OR
-- REPLACE (nunca DROP + CREATE). Corpo de 20261210040000 (sec. 5) com tres
-- mudancas, e mais nenhuma:
--   a) o CTE estado deixa de ler ret.subsidio_alimentacao;
--   b) o LATERAL da retribuicao em aberto so devolve duodecimos;
--   c) o WHERE final exclui o codigo 'subsidio_alimentacao' (sem isto, com a
--      coluna fora do estado, o codigo passaria a ser SEMPRE pendencia).
-- search_path passa de 'public, pg_temp' a '' (o corpo ja esta todo
-- qualificado: public.*, auth.uid(); o resto e pg_catalog). SECURITY DEFINER,
-- STABLE, REVOKE/GRANT e o gate ficam iguais.
--
-- NAO muda (ficam a listar o codigo, ver "O QUE FICA" abaixo):
-- hr_admissao_campos_obrigatorios, hr_admissao_campo_permissao,
-- hr_admissao_campos_obrigatorios_org. O codigo continua no catalogo, so
-- deixa de ser pendencia.
--
--
-- -- O QUE MUDA PARA AS ORGANIZACOES DA BASE RH --------------------------------
--
-- Em TODAS: nenhuma ficha volta a ter a pendencia subsidio_alimentacao. Quem
-- so estava travado por ela passa a poder receber acesso (criar-acesso-pessoa)
-- e o portao da submissao do convite deixa de a contar. Nada se escreve: a
-- coluna pessoas_retribuicoes.subsidio_alimentacao fica como esta.
--
--
-- -- CODIGO --------------------------------------------------------------------
--
-- Nao parte o cliente: a forma da resposta e a mesma. O ecra continua a
-- descrever o campo (src/lib/hr/admissaoCamposRh.ts) mas ele simplesmente
-- deixa de aparecer nas pendencias. Testes que leem por texto a ULTIMA
-- definicao de hr_admissao_pendencias nas migrations (lote B, BIC) passam a
-- encontrar esta: correr o vitest antes do push.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, por migration
-- nova: repor hr_admissao_pendencias de 20261210040000 (sec. 5).
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G0: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'admissao_sem_subsidio_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Corpo esperado no remoto (guarda md5) -----------------------------------
-- O corpo de hr_admissao_pendencias de 20261210040000:334 (sec. 5).
CREATE TEMP TABLE tmp_asp_esperado (fn text PRIMARY KEY, corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_asp_esperado (fn, corpo) VALUES
('public.hr_admissao_pendencias(uuid)', $old$
DECLARE
  v_uid        uuid := auth.uid();
  v_org        uuid;
  v_servico    boolean := (v_uid IS NULL);
  v_propria    boolean := false;
  v_ficha      boolean := false;
  v_permitidas text[]  := ARRAY[]::text[];
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_servico THEN
    v_ficha := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view', v_org);

    v_propria := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view.own', v_org)
                 AND public.hr_pessoa_do_utilizador(v_uid, v_org) = p_pessoa_id;

    IF NOT (v_ficha OR v_propria) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(array_agg(d.permissao), ARRAY[]::text[])
      INTO v_permitidas
      FROM (SELECT DISTINCT cp.permissao FROM public.hr_admissao_campo_permissao() cp) d
     WHERE public.has_anew_permission_in_org(v_uid, d.permissao, v_org);
  END IF;

  RETURN QUERY
  WITH estado AS (
    SELECT
      nullif(btrim(coalesce(p.email_pessoal, '')), '')       AS email_pessoal,
      p.data_admissao::text                                  AS data_admissao,
      p.cargo_id::text                                       AS cargo,
      vin.tipo_contrato                                      AS tipo_contrato,
      ret.subsidio_alimentacao                               AS subsidio_alimentacao,
      ret.duodecimos                                         AS duodecimos,
      -- GANCHO: o campo tipo_horario entra aqui no lote dos horarios.
      dp.data_nascimento::text                               AS data_nascimento,
      nullif(btrim(coalesce(dp.genero, '')), '')             AS genero,
      nullif(btrim(coalesce(dp.nacionalidade, '')), '')      AS nacionalidade,
      nullif(btrim(coalesce(dp.telefone_pessoal, '')), '')   AS telefone_pessoal,
      nullif(btrim(coalesce(dp.estado_civil, '')), '')       AS estado_civil,
      dp.dependentes::text                                   AS dependentes,
      dp.dependentes_deficientes::text                       AS dependentes_deficientes,
      nullif(btrim(coalesce(dp.conjuge_situacao_profissional, '')), '')
                                                             AS conjuge_situacao_profissional,
      nullif(btrim(coalesce(dp.naturalidade_freguesia, '')), '')
                                                             AS naturalidade_freguesia,
      nullif(btrim(coalesce(dp.naturalidade_concelho, '')), '')
                                                             AS naturalidade_concelho,
      nullif(btrim(coalesce(dp.naturalidade_pais, '')), '')  AS naturalidade_pais,
      nullif(btrim(coalesce(dp.habilitacao_academica, '')), '')
                                                             AS habilitacao_academica,
      dp.habilitacao_data_conclusao::text                    AS habilitacao_data_conclusao,
      nullif(btrim(coalesce(i.nif, '')), '')                 AS nif,
      nullif(btrim(coalesce(i.niss, '')), '')                AS niss,
      nullif(btrim(coalesce(i.tipo_documento, '')), '')      AS tipo_documento,
      nullif(btrim(coalesce(i.numero_documento, '')), '')    AS numero_documento,
      i.validade_documento::text                             AS validade_documento,
      nullif(btrim(coalesce(m.linha1, '')), '')              AS linha1,
      nullif(btrim(coalesce(m.codigo_postal, '')), '')       AS codigo_postal,
      nullif(btrim(coalesce(m.localidade, '')), '')          AS localidade,
      nullif(btrim(coalesce(f.tamanho_cima, '')), '')        AS tamanho_cima,
      nullif(btrim(coalesce(f.tamanho_baixo, '')), '')       AS tamanho_baixo,
      nullif(btrim(coalesce(f.tamanho_calcado, '')), '')     AS tamanho_calcado,
      s.sindicalizado::text                                  AS sindicalizado,
      nullif(btrim(coalesce(s.sindicato, '')), '')           AS sindicato,
      b.conta_secret_id::text                                AS conta_numero,
      nullif(btrim(coalesce(b.titular, '')), '')             AS conta_titular,
      nullif(btrim(coalesce(b.banco, '')), '')               AS conta_banco,
      nullif(btrim(coalesce(b.swift, '')), '')               AS conta_bic
    FROM public.pessoas p
    LEFT JOIN public.pessoas_dados_pessoais  dp ON dp.pessoa_id = p.id
    LEFT JOIN public.pessoas_identificacao    i ON i.pessoa_id  = p.id
    LEFT JOIN public.pessoas_fardamento       f ON f.pessoa_id  = p.id
    LEFT JOIN public.pessoas_sindicalizacao   s ON s.pessoa_id  = p.id
    LEFT JOIN public.pessoas_dados_bancarios  b ON b.pessoa_id  = p.id
    LEFT JOIN LATERAL (
      SELECT mm.linha1, mm.codigo_postal, mm.localidade
      FROM public.pessoas_moradas mm
      WHERE mm.pessoa_id = p.id AND mm.tipo = 'residencia'
      ORDER BY mm.is_principal DESC, mm.created_at
      LIMIT 1
    ) m ON true
    -- Conta como tipo de contrato um vinculo nao apagado, activo ou futuro
    -- (o activo primeiro). Um contrato so terminado nao conta.
    LEFT JOIN LATERAL (
      SELECT vv.tipo_contrato
      FROM public.pessoas_vinculos vv
      WHERE vv.pessoa_id = p.id
        AND vv.deleted_at IS NULL
        AND vv.estado IN ('activo', 'futuro')
      ORDER BY (vv.estado = 'activo') DESC, vv.data_inicio DESC
      LIMIT 1
    ) vin ON true
    -- A retribuicao em aberto. Subsidio 0 conta como preenchido (so NULL e
    -- pendencia); sem retribuicao aberta, ambos sao pendencia.
    LEFT JOIN LATERAL (
      SELECT rr.subsidio_alimentacao::text AS subsidio_alimentacao,
             rr.duodecimos_pct::text       AS duodecimos
      FROM public.pessoas_retribuicoes rr
      WHERE rr.pessoa_id = p.id
        AND rr.valido_ate IS NULL
        AND rr.deleted_at IS NULL
      LIMIT 1
    ) ret ON true
    WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
  )
  SELECT c.codigo, c.origem, c.posicao
  FROM estado e
  CROSS JOIN public.hr_admissao_campos_obrigatorios_org(v_org) c
  JOIN public.hr_admissao_campo_permissao() cp ON cp.codigo = c.codigo
  WHERE (to_jsonb(e) ->> c.codigo) IS NULL
    AND c.posicao IN ('convite', 'ficha')
    AND (v_servico OR v_propria OR cp.permissao = ANY (v_permitidas))
    AND (c.codigo <> 'validade_documento'
         OR (e.tipo_documento IS NOT NULL AND e.tipo_documento <> 'cartao_cidadao'))
    AND (c.codigo <> 'conjuge_situacao_profissional'
         OR e.estado_civil IN ('casado', 'uniao_de_facto'))
    AND (c.codigo <> 'sindicato'
         OR e.sindicalizado = 'true')
    AND (c.codigo <> 'nif'
         OR e.niss IS NULL)
    AND (c.codigo <> 'niss'
         OR e.nif IS NULL)
  ORDER BY c.codigo;
END;
$old$);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n   integer;
  v_r   record;
  v_src text;
BEGIN
  -- G1. Uma so assinatura, a lida, com a coluna posicao no resultado.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'hr_admissao_pendencias';
  IF v_n <> 1 OR to_regprocedure('public.hr_admissao_pendencias(uuid)') IS NULL THEN
    RAISE EXCEPTION 'G1: hr_admissao_pendencias devia existir so como (uuid); ha % assinatura(s).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure('public.hr_admissao_pendencias(uuid)')::oid
                    AND p.prosecdef
                    AND p.proargnames::text[] = ARRAY['p_pessoa_id', 'codigo', 'origem', 'posicao']::text[]) THEN
    RAISE EXCEPTION 'G1: hr_admissao_pendencias(uuid) nao e SECURITY DEFINER ou nao devolve (codigo, origem, posicao).';
  END IF;

  -- G2. md5 do corpo que se substitui (sem os \r dos dois lados).
  FOR v_r IN SELECT * FROM tmp_asp_esperado ORDER BY fn LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF md5(replace(v_src, chr(13), '')) IS DISTINCT FROM md5(replace(v_r.corpo, chr(13), '')) THEN
      RAISE EXCEPTION 'G2: o corpo de % no remoto (md5 %) nao e o lido (md5 %). Reler a versao mais recente antes de aplicar.',
        v_r.fn, md5(replace(v_src, chr(13), '')), md5(replace(v_r.corpo, chr(13), ''));
    END IF;
  END LOOP;

  -- G3. O que o corpo chama existe com as assinaturas usadas.
  IF to_regprocedure('public.hr_admissao_campos_obrigatorios_org(uuid)') IS NULL
     OR to_regprocedure('public.hr_admissao_campo_permissao()') IS NULL
     OR to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_pessoa_do_utilizador(uuid, uuid)') IS NULL
     OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'G3: falta uma das funcoes que hr_admissao_pendencias chama (campos_obrigatorios_org, campo_permissao, has_anew_permission_in_org, hr_pessoa_do_utilizador, auth.uid).';
  END IF;

  -- G4. A regra salarial (fonte nova do subsidio) ja esta aplicada.
  IF to_regclass('public.hr_regras_salariais') IS NULL
     OR to_regprocedure('public.hr_regras_salariais_em(uuid, date)') IS NULL THEN
    RAISE EXCEPTION 'G4: falta 20270109600000 (hr_regras_salariais / hr_regras_salariais_em). Aplicar primeiro.';
  END IF;
END;
$guardas$;

-- O estado de antes, para o conferir provar que so mudou o pedido:
-- privilegios, e as pendencias de cada pessoa da nike (ramo de servico:
-- auth.uid() e NULL durante a migration). So leitura.
CREATE TEMP TABLE tmp_asp_acl ON COMMIT DROP AS
SELECT coalesce(p.proacl::text, '') AS proacl
  FROM pg_proc p
 WHERE p.oid = to_regprocedure('public.hr_admissao_pendencias(uuid)')::oid;

CREATE TEMP TABLE tmp_asp_antes ON COMMIT DROP AS
SELECT pe.id AS pessoa_id, x.codigo, x.origem, x.posicao
  FROM public.pessoas pe
  CROSS JOIN LATERAL public.hr_admissao_pendencias(pe.id) x
 WHERE pe.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
   AND pe.deleted_at IS NULL;


-- ==============================================================================
-- 1. hr_admissao_pendencias: sem a pendencia subsidio_alimentacao
--    MESMO RETURNS TABLE (CREATE OR REPLACE, sem largar). Corpo de
--    20261210040000 (sec. 5) com as tres mudancas do cabecalho.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_admissao_pendencias(p_pessoa_id uuid)
RETURNS TABLE (codigo text, origem text, posicao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_org        uuid;
  v_servico    boolean := (v_uid IS NULL);
  v_propria    boolean := false;
  v_ficha      boolean := false;
  v_permitidas text[]  := ARRAY[]::text[];
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_servico THEN
    v_ficha := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view', v_org);

    v_propria := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view.own', v_org)
                 AND public.hr_pessoa_do_utilizador(v_uid, v_org) = p_pessoa_id;

    IF NOT (v_ficha OR v_propria) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(array_agg(d.permissao), ARRAY[]::text[])
      INTO v_permitidas
      FROM (SELECT DISTINCT cp.permissao FROM public.hr_admissao_campo_permissao() cp) d
     WHERE public.has_anew_permission_in_org(v_uid, d.permissao, v_org);
  END IF;

  RETURN QUERY
  WITH estado AS (
    SELECT
      nullif(btrim(coalesce(p.email_pessoal, '')), '')       AS email_pessoal,
      p.data_admissao::text                                  AS data_admissao,
      p.cargo_id::text                                       AS cargo,
      vin.tipo_contrato                                      AS tipo_contrato,
      ret.duodecimos                                         AS duodecimos,
      -- GANCHO: o campo tipo_horario entra aqui no lote dos horarios.
      dp.data_nascimento::text                               AS data_nascimento,
      nullif(btrim(coalesce(dp.genero, '')), '')             AS genero,
      nullif(btrim(coalesce(dp.nacionalidade, '')), '')      AS nacionalidade,
      nullif(btrim(coalesce(dp.telefone_pessoal, '')), '')   AS telefone_pessoal,
      nullif(btrim(coalesce(dp.estado_civil, '')), '')       AS estado_civil,
      dp.dependentes::text                                   AS dependentes,
      dp.dependentes_deficientes::text                       AS dependentes_deficientes,
      nullif(btrim(coalesce(dp.conjuge_situacao_profissional, '')), '')
                                                             AS conjuge_situacao_profissional,
      nullif(btrim(coalesce(dp.naturalidade_freguesia, '')), '')
                                                             AS naturalidade_freguesia,
      nullif(btrim(coalesce(dp.naturalidade_concelho, '')), '')
                                                             AS naturalidade_concelho,
      nullif(btrim(coalesce(dp.naturalidade_pais, '')), '')  AS naturalidade_pais,
      nullif(btrim(coalesce(dp.habilitacao_academica, '')), '')
                                                             AS habilitacao_academica,
      dp.habilitacao_data_conclusao::text                    AS habilitacao_data_conclusao,
      nullif(btrim(coalesce(i.nif, '')), '')                 AS nif,
      nullif(btrim(coalesce(i.niss, '')), '')                AS niss,
      nullif(btrim(coalesce(i.tipo_documento, '')), '')      AS tipo_documento,
      nullif(btrim(coalesce(i.numero_documento, '')), '')    AS numero_documento,
      i.validade_documento::text                             AS validade_documento,
      nullif(btrim(coalesce(m.linha1, '')), '')              AS linha1,
      nullif(btrim(coalesce(m.codigo_postal, '')), '')       AS codigo_postal,
      nullif(btrim(coalesce(m.localidade, '')), '')          AS localidade,
      nullif(btrim(coalesce(f.tamanho_cima, '')), '')        AS tamanho_cima,
      nullif(btrim(coalesce(f.tamanho_baixo, '')), '')       AS tamanho_baixo,
      nullif(btrim(coalesce(f.tamanho_calcado, '')), '')     AS tamanho_calcado,
      s.sindicalizado::text                                  AS sindicalizado,
      nullif(btrim(coalesce(s.sindicato, '')), '')           AS sindicato,
      b.conta_secret_id::text                                AS conta_numero,
      nullif(btrim(coalesce(b.titular, '')), '')             AS conta_titular,
      nullif(btrim(coalesce(b.banco, '')), '')               AS conta_banco,
      nullif(btrim(coalesce(b.swift, '')), '')               AS conta_bic
    FROM public.pessoas p
    LEFT JOIN public.pessoas_dados_pessoais  dp ON dp.pessoa_id = p.id
    LEFT JOIN public.pessoas_identificacao    i ON i.pessoa_id  = p.id
    LEFT JOIN public.pessoas_fardamento       f ON f.pessoa_id  = p.id
    LEFT JOIN public.pessoas_sindicalizacao   s ON s.pessoa_id  = p.id
    LEFT JOIN public.pessoas_dados_bancarios  b ON b.pessoa_id  = p.id
    LEFT JOIN LATERAL (
      SELECT mm.linha1, mm.codigo_postal, mm.localidade
      FROM public.pessoas_moradas mm
      WHERE mm.pessoa_id = p.id AND mm.tipo = 'residencia'
      ORDER BY mm.is_principal DESC, mm.created_at
      LIMIT 1
    ) m ON true
    -- Conta como tipo de contrato um vinculo nao apagado, activo ou futuro
    -- (o activo primeiro). Um contrato so terminado nao conta.
    LEFT JOIN LATERAL (
      SELECT vv.tipo_contrato
      FROM public.pessoas_vinculos vv
      WHERE vv.pessoa_id = p.id
        AND vv.deleted_at IS NULL
        AND vv.estado IN ('activo', 'futuro')
      ORDER BY (vv.estado = 'activo') DESC, vv.data_inicio DESC
      LIMIT 1
    ) vin ON true
    -- A retribuicao em aberto: so os duodecimos (sem retribuicao aberta, sao
    -- pendencia). O subsidio de alimentacao ja nao se le aqui: vem do cargo e
    -- da regra salarial da organizacao, nunca da pessoa (20270109800000).
    LEFT JOIN LATERAL (
      SELECT rr.duodecimos_pct::text       AS duodecimos
      FROM public.pessoas_retribuicoes rr
      WHERE rr.pessoa_id = p.id
        AND rr.valido_ate IS NULL
        AND rr.deleted_at IS NULL
      LIMIT 1
    ) ret ON true
    WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
  )
  SELECT c.codigo, c.origem, c.posicao
  FROM estado e
  CROSS JOIN public.hr_admissao_campos_obrigatorios_org(v_org) c
  JOIN public.hr_admissao_campo_permissao() cp ON cp.codigo = c.codigo
  WHERE (to_jsonb(e) ->> c.codigo) IS NULL
    AND c.posicao IN ('convite', 'ficha')
    AND (v_servico OR v_propria OR cp.permissao = ANY (v_permitidas))
    -- O subsidio de alimentacao nunca e pendencia (vem da regra salarial).
    AND c.codigo <> 'subsidio_alimentacao'
    AND (c.codigo <> 'validade_documento'
         OR (e.tipo_documento IS NOT NULL AND e.tipo_documento <> 'cartao_cidadao'))
    AND (c.codigo <> 'conjuge_situacao_profissional'
         OR e.estado_civil IN ('casado', 'uniao_de_facto'))
    AND (c.codigo <> 'sindicato'
         OR e.sindicalizado = 'true')
    AND (c.codigo <> 'nif'
         OR e.niss IS NULL)
    AND (c.codigo <> 'niss'
         OR e.nif IS NULL)
  ORDER BY c.codigo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_pendencias(uuid) IS
'O que a ficha desta pessoa AINDA NAO tem, entre os campos de admissao cuja posicao e convite ou ficha (um campo opcional nunca e pendencia). Devolve codigo, origem e posicao -- nunca valores. Le tambem cargo, tipo de contrato (vinculo nao apagado, activo ou futuro), os duodecimos da retribuicao em aberto e o BIC (coluna swift de pessoas_dados_bancarios, codigo conta_bic). Desde 20270109800000 o subsidio de alimentacao NUNCA e pendencia: vem do cargo e da regra salarial da organizacao, nao da pessoa (o codigo continua no catalogo da admissao). Mantem o gate (recusa a quem nao pode ver a ficha; a propria pessoa ve o que e seu), a permissao por codigo, as excepcoes validade_documento, conjuge e NIF-ou-NISS, e o ramo de servico (auth.uid() NULL devolve tudo, o que sustenta o portao da submissao e a guarda de criar-acesso-pessoa). search_path vazio.';


-- ==============================================================================
-- 2. Conferir (estrutura, privilegios e comportamento na nike, so leitura)
-- ==============================================================================
CREATE TEMP TABLE tmp_asp_depois ON COMMIT DROP AS
SELECT pe.id AS pessoa_id, x.codigo, x.origem, x.posicao
  FROM public.pessoas pe
  CROSS JOIN LATERAL public.hr_admissao_pendencias(pe.id) x
 WHERE pe.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
   AND pe.deleted_at IS NULL;

DO $conferir$
DECLARE
  k_fn        constant text := 'public.hr_admissao_pendencias(uuid)';
  v_n         integer;
  v_antes     integer;
  v_retiradas integer;
  v_src       text;
BEGIN
  -- 2.1 Uma so assinatura; SECURITY DEFINER e search_path vazio.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'hr_admissao_pendencias';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: hr_admissao_pendencias devia ter uma so assinatura; tem %.', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(k_fn)::oid AND p.prosecdef
                    AND coalesce(array_to_string(p.proconfig, ','), '') IN ('search_path=""', 'search_path=')) THEN
    RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER com search_path vazio.', k_fn;
  END IF;

  -- 2.2 Privilegios: iguais aos de antes; authenticated e service_role sim, anon nao.
  IF (SELECT coalesce(p.proacl::text, '') FROM pg_proc p WHERE p.oid = to_regprocedure(k_fn)::oid)
     IS DISTINCT FROM (SELECT a.proacl FROM tmp_asp_acl a) THEN
    RAISE EXCEPTION 'Conferir: os privilegios de % mudaram.', k_fn;
  END IF;
  IF NOT has_function_privilege('authenticated', k_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', k_fn, 'EXECUTE')
     OR has_function_privilege('anon', k_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: % com privilegios errados (authenticated e service_role sim, anon nao).', k_fn;
  END IF;

  -- 2.3 O corpo ja nao le o subsidio da pessoa; continua a ler os duodecimos e o BIC.
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(k_fn)::oid;
  IF v_src LIKE '%rr.subsidio_alimentacao%' OR v_src LIKE '%ret.subsidio_alimentacao%'
     OR v_src NOT LIKE '%c.codigo <> ''subsidio_alimentacao''%'
     OR v_src NOT LIKE '%rr.duodecimos_pct%' OR v_src NOT LIKE '%b.swift%' THEN
    RAISE EXCEPTION 'Conferir: o corpo de % nao e o esperado (subsidio ainda lido, exclusao em falta, ou perdeu duodecimos/BIC).', k_fn;
  END IF;

  -- 2.4 Na nike (ramo de servico): nenhuma pendencia subsidio_alimentacao, e
  --     todas as outras pendencias exactamente iguais as de antes.
  IF EXISTS (SELECT 1 FROM tmp_asp_depois d WHERE d.codigo = 'subsidio_alimentacao') THEN
    RAISE EXCEPTION 'Conferir: ainda ha pendencias subsidio_alimentacao na nike.';
  END IF;
  SELECT count(*) INTO v_n
    FROM ((SELECT a.pessoa_id, a.codigo, a.origem, a.posicao FROM tmp_asp_antes a
            WHERE a.codigo <> 'subsidio_alimentacao'
           EXCEPT ALL
           SELECT d.pessoa_id, d.codigo, d.origem, d.posicao FROM tmp_asp_depois d)
          UNION ALL
          (SELECT d.pessoa_id, d.codigo, d.origem, d.posicao FROM tmp_asp_depois d
           EXCEPT ALL
           SELECT a.pessoa_id, a.codigo, a.origem, a.posicao FROM tmp_asp_antes a
            WHERE a.codigo <> 'subsidio_alimentacao')) dif;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: na nike, % pendencia(s) alem do subsidio mudaram com a funcao nova.', v_n;
  END IF;

  SELECT count(*) INTO v_antes FROM tmp_asp_antes;
  SELECT count(*) INTO v_retiradas FROM tmp_asp_antes a WHERE a.codigo = 'subsidio_alimentacao';
  IF v_antes = 0 THEN
    RAISE NOTICE 'A nike nao tem pendencias (ou pessoas): a comparacao antes/depois nao exercitou a funcao.';
  END IF;

  RAISE NOTICE 'Conferido: hr_admissao_pendencias sem a pendencia subsidio_alimentacao. Na nike: % pendencia(s) antes, % de subsidio retirada(s), as restantes iguais.',
    v_antes, v_retiradas;
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (confirmar supabase/.temp/project-ref da base RH):
--    so 20270109600000, 20270109700000 e este pendentes (ou ja aplicados por
--    ordem), carimbo acima do maximo do remoto.
-- 2. Prova na nike ANTES do push: correr este ficheiro inteiro numa transaccao
--    terminada por um RAISE EXCEPTION 'RESULTADO ...' (desfaz tudo). A guarda
--    G2 confirma o corpo do remoto; o conferir compara as pendencias da nike
--    antes e depois. Antes do push, contar (so agregado, so nike) quantas
--    fichas da nike tinham a pendencia subsidio_alimentacao: e o vermelho.
-- 3. vitest antes do push: os testes que leem a ultima definicao de
--    hr_admissao_pendencias nas migrations passam a ler esta.
-- ==============================================================================
