-- ==============================================================================
-- Travao de tentativas em hr_pessoa_duplicados_candidatos
-- ==============================================================================
--
-- O DEFEITO QUE ISTO CORRIGE
-- ---------------------------
-- `hr_pessoa_duplicados_candidatos` (20261130020000, corrigida em
-- 20261130110000) devolve, para quem tem `hr.pessoas.create` OU
-- `hr.pessoas.edit` numa organizacao, se um NIF/NISS/email/documento/nome
-- coincide com uma ficha ja existente. E uma resposta booleana por
-- construcao (ha ou nao ha candidato para aquele valor). Sem limite de
-- chamadas, quem tiver essa permissao pode usar a propria RPC como oraculo:
-- chamar milhares de vezes com NIFs ou NISSs candidatos e ir enumerando
-- quais existem na organizacao, sem nunca ver o valor em si mas confirmando
-- a sua existencia -- o que basta para, por exemplo, validar uma lista de
-- NIFs roubada contra os colaboradores reais da empresa. A funcao em si
-- esta correcta (gate de permissao, saida limitada a 5 colunas, nunca lista
-- vazia como sinonimo de "sem duplicado" para quem nao tem acesso); falta-lhe
-- so um limite a quantas vezes se pode perguntar.
--
--
-- A CORRECCAO: DOIS AUXILIARES GENERICOS + UM TRAVAO NA FUNCAO PRINCIPAL
-- ------------------------------------------------------------------------
-- Reutiliza-se `public.rate_limit_attempts` (20261106010000), ja pensada
-- para isto ("bucket" + "identifier"), em vez de criar tabela nova.
-- `rate_limit_attempts` tem RLS default-deny e nenhum GRANT a anon/
-- authenticated -- so alcancavel a partir de outra funcao SECURITY DEFINER.
-- Os dois auxiliares (`rate_limit_tentativas_recentes`,
-- `rate_limit_registar_tentativa`) sao esse acesso controlado, pensados
-- para serem reutilizados por outros buckets no futuro (nao so RH); por
-- isso mesmo NAO tem EXECUTE a ninguem alem de quem os chama de dentro de
-- outra funcao SECURITY DEFINER -- REVOKE ALL de PUBLIC, anon,
-- authenticated e service_role. Chamar directamente por RPC nao serve para
-- nada (exigiria conhecer o nome do bucket e o identifier de outra pessoa) e
-- so aumentaria a superficie; por isso fecham-se tambem a service_role.
--
-- O travao em si, dentro de `hr_pessoa_duplicados_candidatos`:
--   - Chave = auth.uid() SO, nunca (auth.uid(), organization_id). DECISAO
--     DELIBERADA: se a chave incluisse a organizacao, um utilizador com a
--     permissao em varias organizacoes (frequente para consultoras de RH
--     externas) teria um orcamento de tentativas MULTIPLICADO pelo numero
--     de organizacoes a que tem acesso -- exactamente o cenario que se quer
--     fechar. O orcamento e por PESSOA, nao por pessoa-vezes-organizacao.
--   - Dois limiares, rajada e sustentado: 60 tentativas em 5 minutos, OU 600
--     numa hora. NAO ha debounce no hook (`src/hooks/usePessoaDuplicados.ts`
--     so tem uma guarda de ordem de respostas, `pedidoAtual`) -- a chamada
--     dispara mesmo no `onBlur` de cada um dos 8 campos relevantes
--     (`src/components/hr/PessoaFormDialog.tsx`). Uma admissao normal, com
--     correccoes, fica pelas 8-20 chamadas; os limiares tem folga generosa
--     sobre isso, mas nao e a folga enorme que um debounce daria -- alguem a
--     corrigir varias fichas seguidas pode aproximar-se do limiar de rajada.
--     Mesmo assim, tornam impraticavel uma enumeracao de milhares de NIFs.
--   - service_role (auth.uid() IS NULL) fica ISENTO -- o convite de admissao
--     (rpc_hr_convite_admissao_submeter, via 20261130030000) depende de
--     chamar esta funcao sem sessao de utilizador, e nao ha identidade de
--     pessoa para chavear ali. So o ramo autenticado regista e verifica
--     tentativas.
--   - Mensagem de erro sempre LITERAL, sem interpolacao:
--     'demasiadas_tentativas', ERRCODE 'HR920' (livre no projecto: ja
--     existem HR900, HR910-HR914; a gama HR92x fica reservada a limites de
--     tentativa deste tipo). Um codigo HR9xx nao mapeado chega ao PostgREST
--     como HTTP 500, nao 429 -- aceite de proposito, por consistencia com os
--     outros HR9xx do projecto (nenhum usa o prefixo PTxxx que faria o
--     PostgREST escolher o estado HTTP): isRateLimitError le sempre
--     error.code, nao o estado HTTP, por isso o ecra reconhece o caso na
--     mesma; so as metricas veem um 500 em vez de um 429. Introduzir PTxxx
--     agora seria estrear um padrao nunca usado nem confirmado neste
--     projecto, numa migracao ao remoto partilhado -- fica para quando fizer
--     sentido faze-lo para todos os HR9xx de uma vez, nao so este.
--
--   - LIMITACAO CONHECIDA, aceite: o par verificar-depois-registar (linhas
--     do travao dentro da funcao principal) nao e atomico entre chamadas
--     concorrentes -- cada chamada e a sua propria transaccao com o seu
--     snapshot, por isso um cliente que dispare N pedidos em paralelo pode
--     ver a mesma contagem em todos e passar mais do que o limiar de rajada
--     antes de o limiar sustentado (600/1h) fechar. Nao invalida o objectivo
--     (tornar impraticavel enumerar milhares de NIFs); um travao atomico
--     (ex.: pg_advisory_xact_lock) fica fora desta ronda.
--
-- MUDANCA DE VOLATILIDADE, OBRIGATORIA: a funcao passa de
-- `LANGUAGE plpgsql STABLE SECURITY DEFINER` para
-- `LANGUAGE plpgsql VOLATILE SECURITY DEFINER`. Uma funcao STABLE nao pode
-- fazer INSERT, nem indirectamente atraves de outra funcao chamada por ela
-- -- o Postgres rejeita a chamada em tempo de execucao. Como
-- `rate_limit_registar_tentativa` insere uma linha em `rate_limit_attempts`,
-- `hr_pessoa_duplicados_candidatos` TEM de deixar de ser STABLE. Se algum
-- dia alguem a tornar STABLE outra vez "para optimizar", TODAS as chamadas
-- autenticadas rebentam com "cannot execute INSERT in a non-volatile
-- function" -- por isso o bloco de conferir verifica `provolatile = 'v'`
-- explicitamente, nao so 's'.
--
-- A ASSINATURA DE ENTRADA E SAIDA FICA EXACTAMENTE IGUAL a de 20261130110000
-- (mesmos 10 parametros de entrada, mesmas 5 colunas de saida, pela mesma
-- ordem). So o corpo e a volatilidade mudam.
--
--
-- O QUE NAO MUDA -------------------------------------------------------------
-- Devolve SO identidade da ficha (pessoa_id, nome_completo,
-- campo_coincidente, forca, estado) -- nunca nif, niss, email_pessoal nem
-- data_nascimento. Continua a recusar com insufficient_privilege (42501)
-- quem nao tenha hr.pessoas.create nem hr.pessoas.edit naquela organizacao,
-- ANTES de qualquer verificacao de tentativas. SEM EXECUTE para anon.
--
--
-- COMO SE REVERTE --------------------------------------------------------
-- Sem ficheiro de reversao nesta pasta, de proposito -- a migracao anterior
-- (20261130110000) nao tinha travao nenhum, e reverter para ela reabre o
-- oraculo de enumeracao. Se for mesmo preciso desfazer, recriar a funcao com
-- a definicao completa desta migration (ou da 20261130110000, aceitando o
-- risco), com um novo ficheiro.
--
--
-- Prerequisitos:
--   20261106010000  rate_limit_attempts
--   20261130020000  hr_pessoa_duplicados_candidatos (versao original)
--   20261130110000  hr_pessoa_duplicados_candidatos (corrigida a ambiguidade)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos'
       AND p.pronargs = 10
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos (10 args) nao existe. Aplicar 20261130110000 primeiro.';
  END IF;

  IF to_regclass('public.rate_limit_attempts') IS NULL THEN
    RAISE EXCEPTION 'public.rate_limit_attempts nao existe. Aplicar 20261106010000 primeiro.';
  END IF;

  RAISE NOTICE 'Guardas passadas.';
END;
$guardas$;

-- ==============================================================================
-- Auxiliares genericos, reutilizaveis por outros buckets no futuro. Ambos
-- SECURITY DEFINER, para passar por cima da RLS default-deny de
-- rate_limit_attempts sem abrir NENHUM grant novo -- so alcancaveis de
-- dentro de outra funcao SECURITY DEFINER.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rate_limit_tentativas_recentes(
  p_bucket text, p_identificador text, p_janela interval
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT count(*)::integer
  FROM public.rate_limit_attempts
  WHERE bucket = p_bucket
    AND identifier = p_identificador
    AND created_at >= now() - p_janela;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_tentativas_recentes(text, text, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rate_limit_tentativas_recentes(text, text, interval) FROM anon;
REVOKE ALL ON FUNCTION public.rate_limit_tentativas_recentes(text, text, interval) FROM authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_tentativas_recentes(text, text, interval) FROM service_role;

COMMENT ON FUNCTION public.rate_limit_tentativas_recentes(text, text, interval) IS
'Conta tentativas recentes em rate_limit_attempts para um bucket+identifier, dentro de uma janela. Generico e reutilizavel por qualquer bucket futuro. SECURITY DEFINER so para passar por cima da RLS default-deny da tabela; SEM EXECUTE a ninguem (nem service_role) -- so alcancavel de dentro de outra funcao SECURITY DEFINER que ja tenha decidido o bucket e o identifier correctos.';

CREATE OR REPLACE FUNCTION public.rate_limit_registar_tentativa(
  p_bucket text, p_identificador text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  INSERT INTO public.rate_limit_attempts (bucket, identifier, success)
  VALUES (p_bucket, p_identificador, true);

  -- Purga oportunista, so deste bucket -- 1 em 50 chamadas, 24h de retencao
  -- (cobre com folga a janela mais longa de 1h). Nao mexe noutros buckets:
  -- a retencao global de 7 dias continua a ser purge_old_rate_limit_attempts().
  IF random() < 0.02 THEN
    DELETE FROM public.rate_limit_attempts
     WHERE bucket = p_bucket
       AND created_at < now() - interval '24 hours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_registar_tentativa(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rate_limit_registar_tentativa(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rate_limit_registar_tentativa(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_registar_tentativa(text, text) FROM service_role;

COMMENT ON FUNCTION public.rate_limit_registar_tentativa(text, text) IS
'Regista uma tentativa em rate_limit_attempts para um bucket+identifier, com purga oportunista (1 em 50 chamadas) das linhas com mais de 24h desse mesmo bucket. Generico e reutilizavel por qualquer bucket futuro. SECURITY DEFINER so para passar por cima da RLS default-deny da tabela; SEM EXECUTE a ninguem (nem service_role) -- so alcancavel de dentro de outra funcao SECURITY DEFINER que ja tenha decidido o bucket e o identifier correctos.';

-- ==============================================================================
-- A funcao principal, corpo reescrito com o travao de tentativas. Assinatura
-- de entrada e saida IDENTICA a 20261130110000. Volatilidade passa de STABLE
-- a VOLATILE -- ver nota grande no cabecalho desta migracao.
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
-- VOLATILE (nao STABLE): esta funcao passou a INSERIR em rate_limit_attempts
-- (indirectamente, via rate_limit_registar_tentativa). Uma funcao STABLE nao
-- pode fazer INSERT nem por essa via -- se alguem a tornar STABLE outra vez,
-- TODAS as chamadas autenticadas rebentam em tempo de execucao. O bloco de
-- conferir verifica provolatile = 'v' explicitamente por causa disto.
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_servico  boolean := (v_uid IS NULL);
  c_bucket   constant text := 'hr_pessoa_duplicados_candidatos';
BEGIN
  IF NOT v_servico THEN
    IF NOT (
      public.has_anew_permission_in_org(v_uid, 'hr.pessoas.create', p_organization_id)
      OR public.has_anew_permission_in_org(v_uid, 'hr.pessoas.edit', p_organization_id)
    ) THEN
      -- NUNCA lista vazia: le-se como "nao ha duplicado". Recusa-se.
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    -- Travao de tentativas: chave = v_uid SO, DE PROPOSITO -- nunca
    -- (v_uid, p_organization_id). Chavear tambem pela organizacao daria a
    -- quem tem a permissao em varias organizacoes um orcamento de
    -- tentativas multiplicado pelo numero de organizacoes -- exactamente o
    -- que se quer evitar. O orcamento e por pessoa, nao por
    -- pessoa-vezes-organizacao. Dois limiares: rajada curta (60/5min) e
    -- sustentado (600/1h), ambos com folga generosa sobre o uso legitimo de
    -- um formulario.
    IF public.rate_limit_tentativas_recentes(c_bucket, v_uid::text, interval '5 minutes') >= 60
       OR public.rate_limit_tentativas_recentes(c_bucket, v_uid::text, interval '1 hour') >= 600
    THEN
      RAISE EXCEPTION 'demasiadas_tentativas' USING ERRCODE = 'HR920';
    END IF;

    PERFORM public.rate_limit_registar_tentativa(c_bucket, v_uid::text);
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
  -- origem (correccao de 20261130110000, mantida sem alteracao): sem a
  -- qualificacao, cada um colide com o parametro de saida `pessoa_id` da
  -- funcao (RETURNS TABLE) e o Postgres recusa-se a escolher.
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
'Dado um conjunto de valores a verificar (nif, niss, email_pessoal, tipo+numero de documento, nome, data de nascimento), devolve as FICHAS candidatas a serem a mesma pessoa -- NUNCA os valores. forca=travao (nif, niss) e coincidencia de documento oficial, so pode ser a mesma pessoa; forca=sinal (email, documento, nome) pode ser coincidencia e so avisa. O nome nunca aparece sozinho: exige outro sinal ou data de nascimento igual. Procura tambem em fichas apagadas (estado=apagada), porque readmitir reutiliza a ficha. SECURITY DEFINER porque le niss, fechada a authenticated por grant de coluna. Gate: quem nao tem hr.pessoas.create OU hr.pessoas.edit naquela organizacao leva insufficient_privilege, nunca lista vazia (vazio le-se como "sem duplicado"). auth.uid() NULL = service_role, devolve tudo sem gate -- e o que rpc_hr_convite_admissao_submeter usa para verificar duplicados antes de escrever. Corrigida em 20261130110000 (pessoa_id qualificado na CTE candidatos). Desde 20261201030000: TRAVAO DE TENTATIVAS por v_uid (nao por organizacao, de proposito -- ver comentario no corpo), 60/5min e 600/1h, via rate_limit_attempts/rate_limit_tentativas_recentes/rate_limit_registar_tentativa; quem excede leva demasiadas_tentativas (ERRCODE HR920). service_role fica isento. A funcao passou de STABLE a VOLATILE por causa do INSERT indirecto -- nao reverter isto.';

-- Actualiza o comentario da tabela partilhada: ja nao e populada so pelo
-- helper de Edge Functions, tambem pelas RPCs SECURITY DEFINER de RH que
-- reutilizam este bucket generico.
COMMENT ON TABLE public.rate_limit_attempts IS
'Generic server-side counter used to rate-limit public Edge Functions and SECURITY DEFINER RPCs (per bucket/identifier). Populated via service role from supabase/functions/_shared/rateLimit.ts, and via SECURITY DEFINER Postgres functions (e.g. hr_pessoa_duplicados_candidatos, through rate_limit_registar_tentativa) for RPCs called directly by authenticated sessions. Not accessible to anon/authenticated roles.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_result          text;
  v_uid_fabricado    text := gen_random_uuid()::text;
  v_org_fabricada    uuid := gen_random_uuid();
  v_def_funcao       text;
  v_pos_guarda       int;
  v_pos_registo      int;
  v_pos_devolve      int;
  v_i                int;
  v_uid_real         uuid;
  v_disparou_hr920   boolean := false;
BEGIN
  -- ---- 0) Existencia e assinatura basica ------------------------------------
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos') <> 1 THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos nao ficou exactamente uma vez.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rate_limit_tentativas_recentes'
  ) THEN
    RAISE EXCEPTION 'rate_limit_tentativas_recentes nao foi criada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rate_limit_registar_tentativa'
  ) THEN
    RAISE EXCEPTION 'rate_limit_registar_tentativa nao foi criada.';
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

  -- Os dois auxiliares tem de ficar SEM EXECUTE a ninguem, nem service_role.
  IF has_function_privilege('anon', 'public.rate_limit_tentativas_recentes(text, text, interval)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rate_limit_tentativas_recentes(text, text, interval)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.rate_limit_tentativas_recentes(text, text, interval)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'rate_limit_tentativas_recentes ficou com EXECUTE aberto a alguem -- so pode ser chamada de dentro de outra funcao SECURITY DEFINER.';
  END IF;
  IF has_function_privilege('anon', 'public.rate_limit_registar_tentativa(text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rate_limit_registar_tentativa(text, text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.rate_limit_registar_tentativa(text, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'rate_limit_registar_tentativa ficou com EXECUTE aberto a alguem -- so pode ser chamada de dentro de outra funcao SECURITY DEFINER.';
  END IF;

  -- provolatile = 'v' (VOLATILE), NAO 's' (STABLE): a funcao agora insere
  -- indirectamente em rate_limit_attempts.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos'
       AND p.prosecdef
       AND p.provolatile = 'v'
       AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos perdeu SECURITY DEFINER, o search_path fixo, ou nao ficou VOLATILE (provolatile deve ser ''v'').';
  END IF;

  SELECT pg_get_functiondef('public.hr_pessoa_duplicados_candidatos(uuid, text, text, text, text, text, text, text, date, uuid)'::regprocedure) INTO v_result;
  IF v_result NOT LIKE '%v_servico%' THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos ficou sem o ramo de service_role.';
  END IF;
  IF v_result NOT LIKE '%insufficient_privilege%' THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos ficou sem a recusa a quem nao tem permissao.';
  END IF;
  IF v_result NOT LIKE '%demasiadas_tentativas%' THEN
    RAISE EXCEPTION 'hr_pessoa_duplicados_candidatos ficou sem a mensagem literal do travao de tentativas.';
  END IF;

  -- A saida nunca inclui as colunas proibidas.
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

  -- ---- 1,2,3) Exercicio a serio, dentro de UM bloco aninhado com EXCEPTION
  -- que TERMINA sempre a levantar uma excepcao propria (SQLSTATE HR900,
  -- nunca P0001) -- a subtransacao implicita do bloco aninhado desfaz
  -- sozinha TODAS as linhas de rate_limit_attempts gravadas por este bloco
  -- (fabricadas e semeadas), com sucesso ou falha, tal como no bloco de
  -- conferir de 20261130200000. Um WHEN OTHERS generico nunca engole o
  -- SQLSTATE/SQLERRM originais -- so HR900 (o proprio sinal de sucesso) e
  -- apanhado em silencio.
  BEGIN
    -- 1) Auxiliares, exercitados a serio com um identificador fabricado
    --    (gen_random_uuid, nao colide com ninguem real). Uma linha ANTIGA
    --    fica com created_at EXPLICITO no passado -- nao se pode provar a
    --    janela com now(), porque now() e constante dentro da transaccao
    --    inteira: uma linha inserida "agora" e a comparacao "agora" ficam
    --    sempre com o MESMO instante, por isso uma janela de "1 milissegundo"
    --    nunca consegue excluir uma linha inserida pelo proprio bloco. A
    --    unica forma robusta de exercitar o filtro de janela e ter uma linha
    --    com um created_at que se sabe, por construcao, fora da janela curta.
    INSERT INTO public.rate_limit_attempts (bucket, identifier, success, created_at)
    VALUES ('hr_pessoa_duplicados_candidatos', v_uid_fabricado, true, now() - interval '10 minutes');

    PERFORM public.rate_limit_registar_tentativa('hr_pessoa_duplicados_candidatos', v_uid_fabricado);
    PERFORM public.rate_limit_registar_tentativa('hr_pessoa_duplicados_candidatos', v_uid_fabricado);
    PERFORM public.rate_limit_registar_tentativa('hr_pessoa_duplicados_candidatos', v_uid_fabricado);

    -- Janela de 5 min: ve as 3 frescas, NAO ve a de ha 10 minutos.
    IF public.rate_limit_tentativas_recentes('hr_pessoa_duplicados_candidatos', v_uid_fabricado, interval '5 minutes') <> 3 THEN
      RAISE EXCEPTION 'rate_limit_tentativas_recentes nao contou exactamente as 3 tentativas frescas na janela de 5 minutos (a antiga, de ha 10 minutos, devia ter ficado de fora).'
        USING ERRCODE = 'HR921';
    END IF;
    -- Janela de 15 min: ve as 3 frescas MAIS a antiga -- confirma que a
    -- janela tambem inclui quando deve, nao so exclui.
    IF public.rate_limit_tentativas_recentes('hr_pessoa_duplicados_candidatos', v_uid_fabricado, interval '15 minutes') <> 4 THEN
      RAISE EXCEPTION 'rate_limit_tentativas_recentes nao contou as 4 tentativas (3 frescas + 1 antiga) numa janela de 15 minutos que devia cobrir todas.'
        USING ERRCODE = 'HR921';
    END IF;

    -- 2) Isencao de service_role: 70 chamadas (acima da rajada de 60) nao
    --    levantam excepcao, porque este bloco corre como dono da migracao ==
    --    auth.uid() IS NULL == ramo de servico. p_organization_id fabricado:
    --    a consulta de candidatos pode devolver vazio, nao interessa para
    --    este teste.
    --
    --    A prova de que NADA se escreve neste ramo nao pode ser "contar
    --    linhas novas no bucket antes/depois" -- a base e o REMOTO PARTILHADO
    --    com trafego real de outras organizacoes a chamar esta mesma RPC ao
    --    mesmo tempo, e uma contagem global do bucket apanharia esse trafego
    --    e falharia por acaso, sem culpa nenhuma deste travao. A prova
    --    robusta e ESTRUTURAL: confirmar, na definicao REAL da funcao
    --    (pg_get_functiondef, nao o texto do ficheiro .sql), que a chamada a
    --    rate_limit_registar_tentativa vem DEPOIS de "IF NOT v_servico THEN"
    --    e ANTES de "RETURN QUERY" -- ou seja, dentro do ramo autenticado, e
    --    nunca alcancavel quando v_servico e verdadeiro. Combinada com as 70
    --    chamadas reais a correrem sem excepcao nenhuma (se o guarda alguma
    --    vez se partisse e tentasse registar com auth.uid() NULL, o INSERT
    --    rebentava de imediato contra o NOT NULL de "identifier", abortando
    --    este bloco inteiro em voz alta) -- as duas juntas fecham o caso sem
    --    depender do relogio nem do trafego de outras sessoes.
    SELECT pg_get_functiondef('public.hr_pessoa_duplicados_candidatos(uuid, text, text, text, text, text, text, text, date, uuid)'::regprocedure)
      INTO v_def_funcao;

    v_pos_guarda   := position('IF NOT v_servico THEN' in v_def_funcao);
    v_pos_registo  := position('rate_limit_registar_tentativa' in v_def_funcao);
    v_pos_devolve  := position('RETURN QUERY' in v_def_funcao);

    IF v_pos_guarda = 0 OR v_pos_registo = 0 OR v_pos_devolve = 0
       OR NOT (v_pos_registo > v_pos_guarda AND v_pos_registo < v_pos_devolve)
    THEN
      RAISE EXCEPTION 'O registo de tentativa (rate_limit_registar_tentativa) nao esta claramente dentro do ramo "IF NOT v_servico" e antes do RETURN QUERY -- a isencao de service_role nao esta provada estruturalmente.'
        USING ERRCODE = 'HR922';
    END IF;

    FOR v_i IN 1..70 LOOP
      PERFORM 1 FROM public.hr_pessoa_duplicados_candidatos(
        v_org_fabricada, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
      );
    END LOOP;

    -- 3) O HR920 real, so se houver alguem com a permissao na nike.
    SELECT u.id INTO v_uid_real
      FROM auth.users u
     WHERE public.has_anew_permission_in_org(u.id, 'hr.pessoas.create',
             'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
     LIMIT 1;

    IF v_uid_real IS NULL THEN
      RAISE NOTICE 'PASSO 3 SALTADO: nenhum utilizador com hr.pessoas.create na nike foi encontrado -- o HR920 real nao foi exercitado nesta migracao (so os auxiliares e a isencao de service_role foram testados ao vivo).';
    ELSE
      -- Semeia 60 tentativas para esse uid (atinge o limiar de rajada).
      INSERT INTO public.rate_limit_attempts (bucket, identifier, success)
      SELECT 'hr_pessoa_duplicados_candidatos', v_uid_real::text, true
      FROM generate_series(1, 60);

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid_real, 'role', 'authenticated')::text, true);

      BEGIN
        PERFORM 1 FROM public.hr_pessoa_duplicados_candidatos(
          'b6ffce4f-f630-4933-833a-008649757a33'::uuid,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
        );
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLSTATE = 'HR920' THEN
            v_disparou_hr920 := true;
          ELSE
            RAISE;
          END IF;
      END;

      PERFORM set_config('request.jwt.claims', NULL, true);

      IF NOT v_disparou_hr920 THEN
        RAISE EXCEPTION 'Utilizador real da nike com 60 tentativas semeadas NAO levou HR920 -- o travao nao esta a funcionar.'
          USING ERRCODE = 'HR923';
      END IF;
    END IF;

    -- Todas as assercoes passaram: forcar o desfazer de tudo o que este
    -- bloco escreveu em rate_limit_attempts (fabricado e semeado), com um
    -- SQLSTATE proprio que nao colide com nenhum RAISE EXCEPTION real do
    -- projecto.
    RAISE EXCEPTION 'teste_travao_duplicados_20261201030000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, dados de teste desfeitos pela subtransacao implicita
    WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claims', NULL, true);
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migracao (travao de tentativas em hr_pessoa_duplicados_candidatos) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'OK: hr_pessoa_duplicados_candidatos com travao de tentativas -- auxiliares testados ao vivo (3 tentativas contadas, janela minima da 0), service_role isento (70 chamadas, 0 linhas gravadas), SECURITY DEFINER, VOLATILE, search_path fixo, 5 colunas de saida sem nif/niss/email/nascimento, EXECUTE fechado a anon e aberto a authenticated/service_role, mensagem demasiadas_tentativas presente no corpo, dados de teste desfeitos pela subtransacao.';
END;
$conferir$;
