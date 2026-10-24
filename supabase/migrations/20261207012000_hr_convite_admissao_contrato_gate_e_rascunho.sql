-- ==============================================================================
-- O convite de admissao deixa de apagar fichas, passa a ter um portao de
-- obrigatorios na propria base, e ganha a gravacao de rascunho.
--
-- POR APLICAR.
--
--
-- -- 1. O CONTRATO DE CHAVES ESTAVA PARTIDO NOS TRES LADOS ----------------------
--
-- E o pior dos defeitos, e o efeito nao era inercia -- era DESTRUICAO DE DADOS.
--
--   - o ecra publico mandava chaves planas          ("linha1", "niss", ...)
--   - a Edge Function reagrupava num objecto aninhado ({ pessoas_moradas: {...} })
--   - esta RPC lia chaves planas com prefixo de tabela ("morada_linha1", ...)
--
-- Nenhum `->>` acertava, excepto `email_pessoal` (que a Edge Function punha ao
-- topo e que usava coalesce, por isso sobrevivia). Todos os outros resolviam
-- NULL -- e como os `ON CONFLICT ... DO UPDATE SET col = EXCLUDED.col` eram
-- INCONDICIONAIS, esses NULL eram ESCRITOS.
--
-- Uma submissao real limpava pessoas_dados_pessoais, limpava
-- pessoas_identificacao (NIF e NISS incluidos -- incluindo o NISS que o RH ja
-- tinha posto a mao), limpava pessoas_fardamento, marcava o convite como usado
-- e devolvia ok. Em silencio.
--
-- Fica corrigido de duas maneiras, que sao precisas AS DUAS:
--   (a) os tres lados falam a MESMA forma -- planas, com prefixo de tabela so
--       onde o nome colidiria (`morada_*`), que e a forma que esta RPC ja
--       esperava. `src/lib/hr/__tests__/conviteAdmissaoContrato.test.ts` compara
--       as tres listas e parte se voltarem a divergir.
--   (b) cada `ON CONFLICT` passa a distinguir "a chave nem veio" de "a chave
--       veio a null, para limpar de proposito":
--         col = CASE WHEN p_dados ? 'chave' THEN EXCLUDED.col ELSE tabela.col END
--       Um `coalesce` NAO chegava: coalesce nao distingue os dois casos, e
--       tornaria impossivel limpar um campo alguma vez.
--
-- Alinhamentos que faltavam e entram agora: `genero` e `morada_pais` passam a
-- ser escritos (estavam na lista da Edge Function e nao no INSERT);
-- `quota_percentagem` sai do contrato (a coluna e NULL nesta ronda por decisao
-- de 20261124100000, e o ecra nunca a pediu).
--
--
-- -- 2. A VALIDACAO DE OBRIGATORIOS SO EXISTIA NO CLIENTE -----------------------
--
-- `src/lib/hr/admissaoObrigatorios.ts` era a unica barreira. Um POST directo a
-- Edge Function com `dados: {}` passava, consumia o token e -- como o indice
-- unico so permite um convite vivo por pessoa -- QUEIMAVA o convite.
--
-- O portao valida O RESULTADO, nao o pedido: aplicam-se as escritas e, ainda
-- dentro da transaccao, chama-se `hr_admissao_pendencias(pessoa)` filtrada a
-- origem 'pessoa'; se voltar nao-vazia, RAISE e a transaccao reverte inteira --
-- ficha intacta, token por gastar, a pessoa pode voltar ao link.
--
-- Validar o RESULTADO e nao o PEDIDO e o que faz a coisa certa quando o RH ja
-- tinha posto o NISS e a pessoa nao o reenvia: o campo esta preenchido na
-- ficha, logo nao ha pendencia, ainda que o pedido nao o traga.
--
--
-- -- 3. O CONTADOR DE TENTATIVAS ERA REVERTIDO PELO PROPRIO ERRO ----------------
--
-- `rpc_hr_convite_admissao_estado` incrementava `attempts` e a seguir fazia
-- RAISE. O RAISE aborta a transaccao e leva o incremento com ele: o contador
-- nunca contou nada, e nao havia tecto nenhum.
--
-- ESCOLHA, e porque: a funcao passa a DEVOLVER o motivo em jsonb em vez de
-- RAISE nos casos de token invalido/usado/revogado/expirado/bloqueado. A
-- alternativa -- tirar o incremento da transaccao -- exigia `dblink` ou uma
-- transaccao autonoma, que e maquinaria nova num caminho que corre sem sessao,
-- para guardar um inteiro. Devolver estado e a forma normal de uma funcao dizer
-- "isto nao correu bem" quando o insucesso e esperado, e nao excepcional.
--
-- E ganha tecto: 10. Mas SO AS ABERTURAS FALHADAS contam. Contar tambem as
-- boas seria pior do que nao contar: quem preenche um formulario de duas
-- paginas recarrega a pagina, perde a rede, volta -- e ao decimo recarregamento
-- legitimo ficava com o convite morto. Contra a enumeracao de codigos ao acaso
-- este contador nunca protegeu nada (um hash inexistente nao tem linha onde
-- contar); quem protege disso e o limite por IP da Edge Function.
--
--
-- -- 4. OS DEFEITOS QUE 20261124140000 (linhas 56-68) DEIXOU REGISTADOS ---------
--
--   - morada principal de OUTRO TIPO fazia a submissao rebentar com uma
--     violacao de `idx_pessoas_moradas_principal` em bruto: `is_principal`
--     passa a ser CALCULADO (so e principal se ainda nao houver outra).
--   - `morada_linha1` vazia passava o `IS NOT NULL` e rebentava no CHECK
--     `pessoas_moradas_linha1_nao_vazia`: passa a
--     `coalesce(btrim(...), '') <> ''`. E o mesmo tratamento vale para TODOS os
--     campos de texto, por `hr_json_texto`: vazio e ausencia, nunca ''.
--
--
-- -- 5. A GRAVACAO DE RASCUNHO --------------------------------------------------
--
-- A coluna `rascunho` existia, era lida por `_estado` e limpa por `_submeter`,
-- e NADA a escrevia: fechar o separador a meio perdia tudo. Entra
-- `rpc_hr_convite_admissao_rascunho`. A coluna ja esta fechada a `authenticated`
-- por grant de coluna (20261124120000), por isso guardar ali o NISS a meio do
-- preenchimento nao abre nada que ja nao estivesse fechado.
--
--
-- -- O QUE ESTA MIGRACAO NAO DECIDE ---------------------------------------------
--
-- Continua por decidir, e e decisao de produto: se um token valido pode
-- substituir a permissao do utilizador para escrever o NISS e o IBAN (ver o
-- "DESVIO FACE AO PLANO" em 20261124130000). O ramo do IBAN nesta RPC continua
-- inalcancavel -- a Edge Function nao reencaminha a conta, so devolve o aviso
-- `conta_nao_gravada` -- e fica assim ate essa decisao estar tomada.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Nao se reverte para a versao anterior: a versao anterior apaga fichas. Se
-- alguma coisa aqui estiver errada, corrige-se para a frente.
-- Os objectos NOVOS desta migracao largam-se assim:
--   DROP FUNCTION IF EXISTS public.rpc_hr_convite_admissao_rascunho(text, jsonb);
--   DROP FUNCTION IF EXISTS public.hr_admissao_pendencias(uuid);
--   DROP FUNCTION IF EXISTS public.hr_admissao_campos_obrigatorios();
--   DROP FUNCTION IF EXISTS public.hr_json_texto(jsonb, text);
--
-- Prerequisitos:
--   20261124130000  as tres RPCs do convite
--   20261124140000  correccoes da revisao (CHECK do formato do token)
--   20261127020000  'conta_bancaria' de volta no CHECK de acessos sensiveis
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_convites_admissao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_convites_admissao nao existe. Aplicar 20261124120000 primeiro.';
  END IF;

  -- pronargs, nunca comparacao de assinaturas por texto.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter'
      AND p.pronargs = 5
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter de 5 argumentos nao existe. Aplicar 20261124130000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_estado'
      AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado de 1 argumento nao existe. Aplicar 20261124130000 primeiro.';
  END IF;

  -- O portao de obrigatorios le estas colunas. Se alguma mudar de nome, e
  -- melhor parar aqui do que devolver "nao ha pendencias" por engano.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'data_admissao'
  ) THEN
    RAISE EXCEPTION 'public.pessoas.data_admissao nao existe -- hr_admissao_pendencias conta com ela.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_identificacao' AND column_name = 'niss'
  ) THEN
    RAISE EXCEPTION 'public.pessoas_identificacao.niss nao existe -- hr_admissao_pendencias conta com ela.';
  END IF;
END;
$guardas$;


-- ==============================================================================
-- Um texto de jsonb, ja aparado: '' e ausencia, nunca string vazia
-- ==============================================================================
-- Sem isto, `p_dados ->> 'morada_linha1'` com "" passava o IS NOT NULL e
-- rebentava no CHECK `pessoas_moradas_linha1_nao_vazia` em bruto. E vale para
-- todos os campos com CHECK de formato (nacionalidade, pais, habilitacao...).
CREATE OR REPLACE FUNCTION public.hr_json_texto(p_dados jsonb, p_chave text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT nullif(btrim(p_dados ->> p_chave), '');
$$;

COMMENT ON FUNCTION public.hr_json_texto(jsonb, text) IS
'Le uma chave de texto de um jsonb tratando "" como ausencia. Existe porque um "" vindo de um formulario passava o IS NOT NULL e ia rebentar no CHECK da coluna com um erro em bruto.';


-- ==============================================================================
-- A lista de campos obrigatorios da admissao -- a autoridade, em SQL
-- ==============================================================================
-- Espelhada em `src/lib/hr/admissaoObrigatorios.ts` (so os de origem 'pessoa',
-- que sao os unicos que o formulario publico pede) e comparada com ela por
-- `conviteAdmissaoContrato.test.ts`.
--
-- origem 'pessoa' = a propria pessoa preenche no convite.
-- origem 'rh'     = o RH preenche na retaguarda; NUNCA trava a submissao do
--                   convite, senao a pessoa ficava refem de um campo que nao
--                   ve nem pode preencher.
DROP FUNCTION IF EXISTS public.hr_admissao_campos_obrigatorios();

CREATE FUNCTION public.hr_admissao_campos_obrigatorios()
RETURNS TABLE (codigo text, origem text, condicional boolean)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT *
  FROM (VALUES
    ('data_nascimento',    'pessoa', false),
    ('nacionalidade',      'pessoa', false),
    ('telefone_pessoal',   'pessoa', false),
    ('email_pessoal',      'pessoa', false),
    ('estado_civil',       'pessoa', false),
    ('dependentes',        'pessoa', false),
    ('nif',                'pessoa', false),
    ('niss',               'pessoa', false),
    ('tipo_documento',     'pessoa', false),
    ('numero_documento',   'pessoa', false),
    ('validade_documento', 'pessoa', true),
    ('linha1',             'pessoa', false),
    ('codigo_postal',      'pessoa', false),
    ('localidade',         'pessoa', false),
    ('data_admissao',      'rh',     false)
  ) AS t(codigo, origem, condicional);
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campos_obrigatorios() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campos_obrigatorios() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campos_obrigatorios() IS
'A lista dos campos sem os quais uma ficha de admissao nao fica utilizavel. origem "pessoa" e o que o convite publico pede e o que trava a submissao; origem "rh" e o que a retaguarda preenche e nunca trava o convite. condicional=true marca os campos cuja obrigatoriedade depende de outro (hoje so validade_documento, que nao se pede a um cartao de cidadao). Espelhada em src/lib/hr/admissaoObrigatorios.ts e comparada com ela por teste.';


-- ==============================================================================
-- O que FALTA a ficha de uma pessoa
-- ==============================================================================
-- SECURITY DEFINER porque tem de saber se `pessoas_identificacao.niss` esta
-- preenchido, e essa coluna esta fechada a `authenticated` por grant de coluna.
-- Devolve SO codigos de campo -- nunca um valor -- por isso saber "o NISS esta
-- preenchido" nao revela o NISS.
DROP FUNCTION IF EXISTS public.hr_admissao_pendencias(uuid);

CREATE FUNCTION public.hr_admissao_pendencias(p_pessoa_id uuid)
RETURNS TABLE (codigo text, origem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  WITH estado AS (
    SELECT
      nullif(btrim(coalesce(p.email_pessoal, '')), '')       AS email_pessoal,
      p.data_admissao::text                                  AS data_admissao,
      dp.data_nascimento::text                               AS data_nascimento,
      nullif(btrim(coalesce(dp.nacionalidade, '')), '')      AS nacionalidade,
      nullif(btrim(coalesce(dp.telefone_pessoal, '')), '')   AS telefone_pessoal,
      nullif(btrim(coalesce(dp.estado_civil, '')), '')       AS estado_civil,
      dp.dependentes::text                                   AS dependentes,
      nullif(btrim(coalesce(i.nif, '')), '')                 AS nif,
      nullif(btrim(coalesce(i.niss, '')), '')                AS niss,
      nullif(btrim(coalesce(i.tipo_documento, '')), '')      AS tipo_documento,
      nullif(btrim(coalesce(i.numero_documento, '')), '')    AS numero_documento,
      i.validade_documento::text                             AS validade_documento,
      nullif(btrim(coalesce(m.linha1, '')), '')              AS linha1,
      nullif(btrim(coalesce(m.codigo_postal, '')), '')       AS codigo_postal,
      nullif(btrim(coalesce(m.localidade, '')), '')          AS localidade
    FROM public.pessoas p
    LEFT JOIN public.pessoas_dados_pessoais dp ON dp.pessoa_id = p.id
    LEFT JOIN public.pessoas_identificacao   i ON i.pessoa_id  = p.id
    LEFT JOIN LATERAL (
      SELECT mm.linha1, mm.codigo_postal, mm.localidade
      FROM public.pessoas_moradas mm
      WHERE mm.pessoa_id = p.id AND mm.tipo = 'residencia'
      ORDER BY mm.is_principal DESC, mm.created_at
      LIMIT 1
    ) m ON true
    WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
  )
  SELECT c.codigo, c.origem
  FROM estado e
  CROSS JOIN public.hr_admissao_campos_obrigatorios() c
  WHERE (to_jsonb(e) ->> c.codigo) IS NULL
    -- A unica condicionalidade de hoje, escrita por extenso em vez de
    -- inventada por regra generica: a validade nao se pede a um cartao de
    -- cidadao, e um tipo de documento ainda por escolher nao arrasta a
    -- validade consigo (essa pendencia ja aparece, e so uma, no tipo).
    AND (c.codigo <> 'validade_documento'
         OR (e.tipo_documento IS NOT NULL AND e.tipo_documento <> 'cartao_cidadao'))
  ORDER BY c.codigo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_pendencias(uuid) IS
'Os campos obrigatorios de admissao que a ficha desta pessoa AINDA NAO tem. SECURITY DEFINER porque precisa de saber se pessoas_identificacao.niss esta preenchido, e essa coluna esta fechada a authenticated por grant de coluna -- devolve SO codigos, nunca valores, por isso nao revela o NISS. So service_role: hoje o unico chamador e rpc_hr_convite_admissao_submeter. Expor isto a authenticated exigiria filtrar por permissao de leitura de cada tabela de origem, tal como a politica de pessoas_dados_alteracoes faz.';


-- ==============================================================================
-- RPC: estado do convite -- devolve o motivo, nao o lanca
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_estado(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto  constant integer := 10;
  v_convite record;
  v_pessoa  record;
  v_ident   record;
  v_conta   record;
  v_motivo  text;
BEGIN
  SELECT * INTO v_convite
  FROM public.pessoas_convites_admissao
  WHERE token_hash = p_token_hash;

  IF v_convite.id IS NULL THEN
    -- Nao ha linha nenhuma onde contar. Quem experimenta codigos ao acaso e
    -- travado pelo limite por IP da Edge Function -- e sempre foi so por ai,
    -- ainda que o comentario antigo desta funcao dissesse o contrario.
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  IF v_convite.used_at IS NOT NULL THEN
    v_motivo := 'convite_ja_usado';
  ELSIF v_convite.revoked_at IS NOT NULL THEN
    v_motivo := 'convite_revogado';
  ELSIF v_convite.valid_until <= now() THEN
    v_motivo := 'convite_expirado';
  ELSIF v_convite.attempts >= c_tecto THEN
    v_motivo := 'convite_bloqueado';
  END IF;

  IF v_motivo IS NOT NULL THEN
    -- O incremento SOBREVIVE porque nao ha RAISE a seguir. So as aberturas
    -- falhadas contam: quem recarrega um convite vivo nao gasta tentativas.
    IF v_convite.attempts < c_tecto THEN
      UPDATE public.pessoas_convites_admissao
         SET attempts = attempts + 1
       WHERE id = v_convite.id;
    END IF;
    RETURN jsonb_build_object('erro', v_motivo);
  END IF;

  SELECT nome_completo, email_pessoal INTO v_pessoa
  FROM public.pessoas WHERE id = v_convite.pessoa_id;

  SELECT nif, niss_ultimos4 INTO v_ident
  FROM public.pessoas_identificacao WHERE pessoa_id = v_convite.pessoa_id;

  SELECT conta_ultimos4, formato_conta INTO v_conta
  FROM public.pessoas_dados_bancarios WHERE pessoa_id = v_convite.pessoa_id;

  -- NUNCA niss, NUNCA conta completa, NUNCA sindicalizacao: o convite so
  -- escreve filiacao sindical, nunca a revela por este caminho.
  RETURN jsonb_build_object(
    'pessoa_nome', v_pessoa.nome_completo,
    'email_pessoal', v_pessoa.email_pessoal,
    'nif', v_ident.nif,
    'niss_ultimos4', v_ident.niss_ultimos4,
    'conta_ultimos4', v_conta.conta_ultimos4,
    'formato_conta', v_conta.formato_conta,
    'rascunho', v_convite.rascunho,
    'valid_until', v_convite.valid_until
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_estado(text) IS
'Le o estado de um convite pelo hash do token. SO service_role -- o codigo em claro so a Edge Function o ve, e e la que fica o limite por IP. DEVOLVE o motivo em jsonb ({"erro": ...}) em vez de o lancar: com RAISE, a transaccao abortava e levava consigo o proprio incremento de attempts, que por isso nunca contou nada. Conta SO as aberturas falhadas, com tecto de 10 -- contar tambem as boas matava convites de quem apenas recarrega a pagina. Nunca devolve niss, a conta bancaria completa nem a resposta de sindicalizacao.';


-- ==============================================================================
-- RPC NOVA: gravar o rascunho
-- ==============================================================================
DROP FUNCTION IF EXISTS public.rpc_hr_convite_admissao_rascunho(text, jsonb);

CREATE FUNCTION public.rpc_hr_convite_admissao_rascunho(
  p_token_hash text,
  p_rascunho   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto        constant integer := 10;
  c_bytes_maximo constant integer := 20000;
BEGIN
  IF jsonb_typeof(p_rascunho) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('erro', 'pedido_invalido');
  END IF;

  -- Tecto de tamanho: sem ele, um convite valido virava armazenamento gratuito
  -- para quem tem o link.
  IF octet_length(p_rascunho::text) > c_bytes_maximo THEN
    RETURN jsonb_build_object('erro', 'rascunho_demasiado_grande');
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET rascunho = p_rascunho
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND revoked_at IS NULL
     AND valid_until > now()
     AND attempts < c_tecto;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, jsonb) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, jsonb) IS
'Grava o preenchimento a meio, para fechar o separador nao perder tudo. SO service_role. Nao consome o convite, nao conta tentativas e nao valida o conteudo: um rascunho e uma conveniencia. A coluna rascunho esta fechada a authenticated por grant de coluna (20261124120000), por isso guardar ali o NISS a meio do preenchimento nao abre nada que ja nao estivesse fechado.';


-- ==============================================================================
-- RPC: submeter -- consumo atomico, escrita que PRESERVA, e portao no fim
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_submeter(
  p_token_hash      text,
  p_dados           jsonb,
  p_assinatura_nome text,
  p_ip              inet,
  p_user_agent      text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto constant integer := 10;
  v_pessoa_id  uuid;
  v_org        uuid;
  v_niss       text;
  v_linha1     text;
  v_pais       text;
  v_principal  boolean;
  v_conta_num  text;
  v_conta_lin  record;
  v_secret_id  uuid;
  v_faltam     text[];
BEGIN
  IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'pedido_invalido';
  END IF;

  -- Um convite ja bloqueado por tentativas falhadas nao se submete.
  IF EXISTS (
    SELECT 1 FROM public.pessoas_convites_admissao
     WHERE token_hash = p_token_hash AND attempts >= c_tecto
  ) THEN
    RAISE EXCEPTION 'convite_bloqueado';
  END IF;

  -- Consumo atomico: a primeira instrucao, e trava a linha. Uma segunda
  -- chamada concorrente encontra used_at ja preenchido e devolve zero linhas.
  UPDATE public.pessoas_convites_admissao
     SET used_at = now(),
         assinatura_nome = p_assinatura_nome,
         assinatura_ip = p_ip,
         assinatura_user_agent = p_user_agent,
         rascunho = NULL
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND revoked_at IS NULL
     AND valid_until > now()
  RETURNING pessoa_id, organization_id INTO v_pessoa_id, v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'convite_invalido';
  END IF;

  -- Origem das escritas seguintes: lida pelos triggers de auditoria em
  -- pessoas_dados_alteracoes.
  PERFORM set_config('hr.origem_escrita', 'convite', true);

  -- ---- pessoas: so o contacto pessoal ----------------------------------
  IF p_dados ? 'email_pessoal' THEN
    UPDATE public.pessoas
       SET email_pessoal = public.hr_json_texto(p_dados, 'email_pessoal')
     WHERE id = v_pessoa_id;
  END IF;

  -- ---- pessoas_dados_pessoais -------------------------------------------
  -- O `CASE WHEN p_dados ? <chave>` de cada linha e o que distingue "a chave
  -- nem veio" (preservar) de "veio a null" (limpar de proposito). Foi a sua
  -- ausencia que fez uma submissao apagar a ficha inteira.
  IF p_dados ?| ARRAY[
       'data_nascimento','genero','nacionalidade','telefone_pessoal','estado_civil',
       'dependentes','naturalidade_freguesia','naturalidade_concelho','naturalidade_pais',
       'conjuge_situacao_profissional','dependentes_deficientes',
       'habilitacao_academica','habilitacao_data_conclusao'
     ] THEN
    INSERT INTO public.pessoas_dados_pessoais (
      pessoa_id, organization_id,
      data_nascimento, genero, nacionalidade, estado_civil, dependentes,
      telefone_pessoal, naturalidade_freguesia, naturalidade_concelho, naturalidade_pais,
      conjuge_situacao_profissional, dependentes_deficientes,
      habilitacao_academica, habilitacao_data_conclusao
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'data_nascimento')::date,
      public.hr_json_texto(p_dados, 'genero'),
      upper(public.hr_json_texto(p_dados, 'nacionalidade')),
      public.hr_json_texto(p_dados, 'estado_civil'),
      public.hr_json_texto(p_dados, 'dependentes')::smallint,
      public.hr_json_texto(p_dados, 'telefone_pessoal'),
      public.hr_json_texto(p_dados, 'naturalidade_freguesia'),
      public.hr_json_texto(p_dados, 'naturalidade_concelho'),
      upper(public.hr_json_texto(p_dados, 'naturalidade_pais')),
      public.hr_json_texto(p_dados, 'conjuge_situacao_profissional'),
      public.hr_json_texto(p_dados, 'dependentes_deficientes')::smallint,
      public.hr_json_texto(p_dados, 'habilitacao_academica'),
      public.hr_json_texto(p_dados, 'habilitacao_data_conclusao')::date
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      data_nascimento = CASE WHEN p_dados ? 'data_nascimento'
        THEN EXCLUDED.data_nascimento ELSE pessoas_dados_pessoais.data_nascimento END,
      genero = CASE WHEN p_dados ? 'genero'
        THEN EXCLUDED.genero ELSE pessoas_dados_pessoais.genero END,
      nacionalidade = CASE WHEN p_dados ? 'nacionalidade'
        THEN EXCLUDED.nacionalidade ELSE pessoas_dados_pessoais.nacionalidade END,
      estado_civil = CASE WHEN p_dados ? 'estado_civil'
        THEN EXCLUDED.estado_civil ELSE pessoas_dados_pessoais.estado_civil END,
      dependentes = CASE WHEN p_dados ? 'dependentes'
        THEN EXCLUDED.dependentes ELSE pessoas_dados_pessoais.dependentes END,
      telefone_pessoal = CASE WHEN p_dados ? 'telefone_pessoal'
        THEN EXCLUDED.telefone_pessoal ELSE pessoas_dados_pessoais.telefone_pessoal END,
      naturalidade_freguesia = CASE WHEN p_dados ? 'naturalidade_freguesia'
        THEN EXCLUDED.naturalidade_freguesia ELSE pessoas_dados_pessoais.naturalidade_freguesia END,
      naturalidade_concelho = CASE WHEN p_dados ? 'naturalidade_concelho'
        THEN EXCLUDED.naturalidade_concelho ELSE pessoas_dados_pessoais.naturalidade_concelho END,
      naturalidade_pais = CASE WHEN p_dados ? 'naturalidade_pais'
        THEN EXCLUDED.naturalidade_pais ELSE pessoas_dados_pessoais.naturalidade_pais END,
      conjuge_situacao_profissional = CASE WHEN p_dados ? 'conjuge_situacao_profissional'
        THEN EXCLUDED.conjuge_situacao_profissional ELSE pessoas_dados_pessoais.conjuge_situacao_profissional END,
      dependentes_deficientes = CASE WHEN p_dados ? 'dependentes_deficientes'
        THEN EXCLUDED.dependentes_deficientes ELSE pessoas_dados_pessoais.dependentes_deficientes END,
      habilitacao_academica = CASE WHEN p_dados ? 'habilitacao_academica'
        THEN EXCLUDED.habilitacao_academica ELSE pessoas_dados_pessoais.habilitacao_academica END,
      habilitacao_data_conclusao = CASE WHEN p_dados ? 'habilitacao_data_conclusao'
        THEN EXCLUDED.habilitacao_data_conclusao ELSE pessoas_dados_pessoais.habilitacao_data_conclusao END,
      updated_at = now();
  END IF;

  -- ---- pessoas_identificacao, incluindo niss ----------------------------
  -- Escrita directa e nao pela RPC dedicada de niss: ver o cabecalho de
  -- 20261124130000 ("DESVIO FACE AO PLANO"). A validacao de formato mantem-se.
  v_niss := public.hr_json_texto(p_dados, 'niss');
  IF v_niss IS NOT NULL AND v_niss !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'niss_invalido';
  END IF;

  IF p_dados ?| ARRAY[
       'tipo_documento','numero_documento','validade_documento','nif','niss',
       'carta_conducao_numero','carta_conducao_categorias','carta_conducao_validade'
     ] THEN
    INSERT INTO public.pessoas_identificacao (
      pessoa_id, organization_id,
      tipo_documento, numero_documento, validade_documento, nif, niss,
      carta_conducao_numero, carta_conducao_categorias, carta_conducao_validade
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'tipo_documento'),
      public.hr_json_texto(p_dados, 'numero_documento'),
      public.hr_json_texto(p_dados, 'validade_documento')::date,
      public.hr_json_texto(p_dados, 'nif'),
      v_niss,
      public.hr_json_texto(p_dados, 'carta_conducao_numero'),
      public.hr_json_texto(p_dados, 'carta_conducao_categorias'),
      public.hr_json_texto(p_dados, 'carta_conducao_validade')::date
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      tipo_documento = CASE WHEN p_dados ? 'tipo_documento'
        THEN EXCLUDED.tipo_documento ELSE pessoas_identificacao.tipo_documento END,
      numero_documento = CASE WHEN p_dados ? 'numero_documento'
        THEN EXCLUDED.numero_documento ELSE pessoas_identificacao.numero_documento END,
      validade_documento = CASE WHEN p_dados ? 'validade_documento'
        THEN EXCLUDED.validade_documento ELSE pessoas_identificacao.validade_documento END,
      nif = CASE WHEN p_dados ? 'nif'
        THEN EXCLUDED.nif ELSE pessoas_identificacao.nif END,
      -- O NISS e o caso que mais custou: com o UPDATE incondicional, uma
      -- submissao que nao o trouxesse apagava o que o RH ja tinha posto.
      niss = CASE WHEN p_dados ? 'niss'
        THEN EXCLUDED.niss ELSE pessoas_identificacao.niss END,
      carta_conducao_numero = CASE WHEN p_dados ? 'carta_conducao_numero'
        THEN EXCLUDED.carta_conducao_numero ELSE pessoas_identificacao.carta_conducao_numero END,
      carta_conducao_categorias = CASE WHEN p_dados ? 'carta_conducao_categorias'
        THEN EXCLUDED.carta_conducao_categorias ELSE pessoas_identificacao.carta_conducao_categorias END,
      carta_conducao_validade = CASE WHEN p_dados ? 'carta_conducao_validade'
        THEN EXCLUDED.carta_conducao_validade ELSE pessoas_identificacao.carta_conducao_validade END,
      updated_at = now();
  END IF;

  IF v_niss IS NOT NULL THEN
    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, 'niss', 'alterar');
  END IF;

  -- ---- pessoas_moradas: a de residencia ----------------------------------
  v_linha1 := public.hr_json_texto(p_dados, 'morada_linha1');
  v_pais   := upper(public.hr_json_texto(p_dados, 'morada_pais'));

  IF v_pais IS NOT NULL AND v_pais !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'pais_invalido';
  END IF;

  IF p_dados ?| ARRAY[
       'morada_linha1','morada_linha2','morada_codigo_postal',
       'morada_localidade','morada_distrito','morada_pais'
     ] THEN
    UPDATE public.pessoas_moradas
       -- linha1 e NOT NULL e tem CHECK de nao-vazia: so se substitui por um
       -- valor real, nunca se limpa por este caminho. O portao de obrigatorios
       -- la em baixo e que garante que ela existe.
       SET linha1 = CASE WHEN v_linha1 IS NOT NULL THEN v_linha1 ELSE pessoas_moradas.linha1 END,
           linha2 = CASE WHEN p_dados ? 'morada_linha2'
             THEN public.hr_json_texto(p_dados, 'morada_linha2') ELSE pessoas_moradas.linha2 END,
           codigo_postal = CASE WHEN p_dados ? 'morada_codigo_postal'
             THEN public.hr_json_texto(p_dados, 'morada_codigo_postal') ELSE pessoas_moradas.codigo_postal END,
           localidade = CASE WHEN p_dados ? 'morada_localidade'
             THEN public.hr_json_texto(p_dados, 'morada_localidade') ELSE pessoas_moradas.localidade END,
           distrito = CASE WHEN p_dados ? 'morada_distrito'
             THEN public.hr_json_texto(p_dados, 'morada_distrito') ELSE pessoas_moradas.distrito END,
           pais = CASE WHEN v_pais IS NOT NULL THEN v_pais ELSE pessoas_moradas.pais END,
           updated_at = now()
     WHERE pessoa_id = v_pessoa_id AND organization_id = v_org AND tipo = 'residencia';

    IF NOT FOUND AND v_linha1 IS NOT NULL THEN
      -- is_principal CALCULADO, nunca fixo em true: uma pessoa que ja tenha
      -- uma morada principal de outro tipo (fiscal, correspondencia) fazia a
      -- submissao rebentar com a violacao de idx_pessoas_moradas_principal em
      -- bruto -- um indice unico parcial nao e uma mensagem de erro.
      SELECT NOT EXISTS (
        SELECT 1 FROM public.pessoas_moradas
         WHERE pessoa_id = v_pessoa_id AND is_principal
      ) INTO v_principal;

      INSERT INTO public.pessoas_moradas (
        pessoa_id, organization_id, tipo, linha1, linha2,
        codigo_postal, localidade, distrito, pais, is_principal
      ) VALUES (
        v_pessoa_id, v_org, 'residencia',
        v_linha1,
        public.hr_json_texto(p_dados, 'morada_linha2'),
        public.hr_json_texto(p_dados, 'morada_codigo_postal'),
        public.hr_json_texto(p_dados, 'morada_localidade'),
        public.hr_json_texto(p_dados, 'morada_distrito'),
        coalesce(v_pais, 'PT'),
        v_principal
      );
    END IF;
  END IF;

  -- ---- pessoas_fardamento -------------------------------------------------
  IF p_dados ?| ARRAY[
       'tamanho_cima','tamanho_cima_detalhe','tamanho_baixo','tamanho_baixo_detalhe',
       'tamanho_blazer','tamanho_blazer_detalhe'
     ] THEN
    INSERT INTO public.pessoas_fardamento (
      pessoa_id, organization_id,
      tamanho_cima, tamanho_cima_detalhe, tamanho_baixo, tamanho_baixo_detalhe,
      tamanho_blazer, tamanho_blazer_detalhe
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'tamanho_cima'),
      public.hr_json_texto(p_dados, 'tamanho_cima_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_baixo'),
      public.hr_json_texto(p_dados, 'tamanho_baixo_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_blazer'),
      public.hr_json_texto(p_dados, 'tamanho_blazer_detalhe')
    )
    ON CONFLICT (pessoa_id, organization_id) DO UPDATE SET
      tamanho_cima = CASE WHEN p_dados ? 'tamanho_cima'
        THEN EXCLUDED.tamanho_cima ELSE pessoas_fardamento.tamanho_cima END,
      tamanho_cima_detalhe = CASE WHEN p_dados ? 'tamanho_cima_detalhe'
        THEN EXCLUDED.tamanho_cima_detalhe ELSE pessoas_fardamento.tamanho_cima_detalhe END,
      tamanho_baixo = CASE WHEN p_dados ? 'tamanho_baixo'
        THEN EXCLUDED.tamanho_baixo ELSE pessoas_fardamento.tamanho_baixo END,
      tamanho_baixo_detalhe = CASE WHEN p_dados ? 'tamanho_baixo_detalhe'
        THEN EXCLUDED.tamanho_baixo_detalhe ELSE pessoas_fardamento.tamanho_baixo_detalhe END,
      tamanho_blazer = CASE WHEN p_dados ? 'tamanho_blazer'
        THEN EXCLUDED.tamanho_blazer ELSE pessoas_fardamento.tamanho_blazer END,
      tamanho_blazer_detalhe = CASE WHEN p_dados ? 'tamanho_blazer_detalhe'
        THEN EXCLUDED.tamanho_blazer_detalhe ELSE pessoas_fardamento.tamanho_blazer_detalhe END,
      updated_at = now();
  END IF;

  -- ---- pessoas_sindicalizacao ---------------------------------------------
  IF p_dados ? 'sindicalizado' THEN
    INSERT INTO public.pessoas_sindicalizacao (pessoa_id, organization_id, sindicalizado, sindicato)
    VALUES (
      v_pessoa_id, v_org,
      coalesce((p_dados ->> 'sindicalizado')::boolean, false),
      public.hr_json_texto(p_dados, 'sindicato')
    )
    ON CONFLICT (pessoa_id, organization_id) DO UPDATE SET
      sindicalizado = EXCLUDED.sindicalizado,
      sindicato = CASE WHEN p_dados ? 'sindicato'
        THEN EXCLUDED.sindicato ELSE pessoas_sindicalizacao.sindicato END,
      updated_at = now();
  END IF;

  -- ---- pessoas_dados_bancarios: IBAN, escrita directa --------------------
  -- INALCANCAVEL POR ENQUANTO, e de proposito: a Edge Function nao reencaminha
  -- a conta (so devolve o aviso `conta_nao_gravada`) enquanto nao estiver
  -- decidido se um token valido substitui a permissao do utilizador. Fica
  -- escrito para o dia em que essa decisao existir.
  v_conta_num := public.hr_json_texto(p_dados, 'iban');
  IF v_conta_num IS NOT NULL THEN
    v_conta_num := upper(regexp_replace(v_conta_num, '[[:space:]]', '', 'g'));

    IF NOT public.hr_iban_valido(v_conta_num) THEN
      RAISE EXCEPTION 'iban_invalido';
    END IF;

    SELECT b.id, b.conta_secret_id INTO v_conta_lin
    FROM public.pessoas_dados_bancarios b
    WHERE b.pessoa_id = v_pessoa_id;

    IF v_conta_lin.id IS NOT NULL AND v_conta_lin.conta_secret_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_conta_lin.conta_secret_id, v_conta_num);
      v_secret_id := v_conta_lin.conta_secret_id;
    ELSE
      v_secret_id := vault.create_secret(
        v_conta_num,
        'hr_conta:' || v_pessoa_id::text || ':' || gen_random_uuid()::text,
        'Conta bancaria de RH da pessoa ' || v_pessoa_id::text || ' (via convite de admissao)'
      );
    END IF;

    INSERT INTO public.pessoas_dados_bancarios (
      pessoa_id, organization_id, titular, banco, agencia, formato_conta,
      conta_secret_id, conta_ultimos4, conta_pais, swift, is_principal
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'conta_titular'),
      public.hr_json_texto(p_dados, 'conta_banco'),
      public.hr_json_texto(p_dados, 'conta_agencia'),
      'iban',
      v_secret_id, right(v_conta_num, 4), left(v_conta_num, 2),
      public.hr_json_texto(p_dados, 'conta_swift'), true
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      titular = CASE WHEN p_dados ? 'conta_titular'
        THEN EXCLUDED.titular ELSE pessoas_dados_bancarios.titular END,
      banco = CASE WHEN p_dados ? 'conta_banco'
        THEN EXCLUDED.banco ELSE pessoas_dados_bancarios.banco END,
      agencia = CASE WHEN p_dados ? 'conta_agencia'
        THEN EXCLUDED.agencia ELSE pessoas_dados_bancarios.agencia END,
      formato_conta = EXCLUDED.formato_conta,
      conta_secret_id = EXCLUDED.conta_secret_id,
      conta_ultimos4 = EXCLUDED.conta_ultimos4,
      conta_pais = EXCLUDED.conta_pais,
      swift = CASE WHEN p_dados ? 'conta_swift'
        THEN EXCLUDED.swift ELSE pessoas_dados_bancarios.swift END,
      updated_at = now();

    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, 'conta_bancaria', 'alterar');
  END IF;

  -- ---- O PORTAO: valida-se o RESULTADO, nao o pedido ----------------------
  -- Depois de escrever tudo, e ainda dentro da transaccao, pergunta-se a ficha
  -- o que lhe falta. Se faltar alguma coisa de origem 'pessoa', o RAISE reverte
  -- a transaccao inteira: a ficha fica como estava e o token NAO fica gasto.
  --
  -- Perguntar a ficha, e nao ao pedido, e o que faz a coisa certa quando o RH
  -- ja tinha posto o NISS e a pessoa nao o reenvia.
  SELECT array_agg(pend.codigo ORDER BY pend.codigo)
    INTO v_faltam
    FROM public.hr_admissao_pendencias(v_pessoa_id) AS pend
   WHERE pend.origem = 'pessoa';

  IF v_faltam IS NOT NULL AND array_length(v_faltam, 1) > 0 THEN
    RAISE EXCEPTION 'admissao_incompleta: %', array_to_string(v_faltam, ', ');
  END IF;

  RETURN v_pessoa_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text) IS
'Submissao final do convite de admissao. SO service_role. Consome o token atomicamente. pessoa_id e organization_id vem SO da linha do convite, nunca de p_dados. p_dados e PLANO, com prefixo de tabela so em morada_* -- a mesma forma que a Edge Function e o ecra usam, amarrada por teste. Cada ON CONFLICT distingue "a chave nem veio" de "veio a null": sem isso, uma submissao apagava a ficha inteira, NISS incluido. No fim, e ainda dentro da transaccao, chama hr_admissao_pendencias e RAISE se faltar algum campo de origem "pessoa" -- valida o RESULTADO e nao o pedido, para o token nao se gastar numa submissao vazia e para o que o RH ja tinha posto contar como preenchido. Escreve em pessoas (so email_pessoal), pessoas_dados_pessoais, pessoas_identificacao (incl. niss), pessoas_moradas, pessoas_fardamento, pessoas_sindicalizacao e pessoas_dados_bancarios (ramo do IBAN, hoje inalcancavel por decisao pendente).';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_corpo   text;
  v_chave   text;
  v_faltam  text[];
  -- As 36 chaves do contrato, por ordem alfabetica. A MESMA lista que
  -- src/lib/hr/conviteAdmissaoPayload.ts e a lista branca da Edge Function.
  v_chaves  text[] := ARRAY[
    'carta_conducao_categorias','carta_conducao_numero','carta_conducao_validade',
    'conjuge_situacao_profissional','data_nascimento','dependentes',
    'dependentes_deficientes','email_pessoal','estado_civil','genero',
    'habilitacao_academica','habilitacao_data_conclusao','morada_codigo_postal',
    'morada_distrito','morada_linha1','morada_linha2','morada_localidade',
    'morada_pais','nacionalidade','naturalidade_concelho','naturalidade_freguesia',
    'naturalidade_pais','nif','niss','numero_documento','sindicalizado','sindicato',
    'tamanho_baixo','tamanho_baixo_detalhe','tamanho_blazer','tamanho_blazer_detalhe',
    'tamanho_cima','tamanho_cima_detalhe','telefone_pessoal','tipo_documento',
    'validade_documento'
  ];
BEGIN
  -- 1. As funcoes novas existem, com a aridade certa (pronargs, nunca texto).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_campos_obrigatorios' AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() nao ficou criada.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias') <> 1 THEN
    RAISE EXCEPTION 'hr_admissao_pendencias nao esta exactamente uma vez -- duas aridades tornam a chamada ambigua.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_rascunho') <> 1 THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_rascunho nao esta exactamente uma vez.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_convite_admissao_submeter') <> 1 THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter ficou com mais do que uma aridade.';
  END IF;

  -- 2. A lista de obrigatorios tem os 15 campos, com as duas origens.
  IF (SELECT count(*) FROM public.hr_admissao_campos_obrigatorios()) <> 15 THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() nao devolve 15 campos.';
  END IF;
  IF (SELECT count(*) FROM public.hr_admissao_campos_obrigatorios() WHERE origem = 'pessoa') <> 14 THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios() nao tem 14 campos de origem "pessoa".';
  END IF;

  -- 3. Nenhum acesso indevido: as tres funcoes sem sessao continuam so a
  --    service_role, e a de pendencias tambem (devolve o estado do NISS).
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_estado(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado deixou de ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter deixou de ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_rascunho(text, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_rascunho(text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_rascunho tem de ser so service_role.';
  END IF;
  IF has_function_privilege('authenticated', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias tem de ser so service_role: diz se o NISS esta preenchido.';
  END IF;

  SELECT pg_get_functiondef(
    'public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)'::regprocedure
  ) INTO v_corpo;

  -- 4. A promessa da lista branca, herdada de 20261124130000.
  IF v_corpo ILIKE '%retribuic%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia retribuicao -- fora da lista branca do convite.';
  END IF;
  IF v_corpo ILIKE '%vinculo%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia vinculo -- fora da lista branca do convite.';
  END IF;
  IF v_corpo ILIKE '%membership%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia membership -- fora da lista branca do convite.';
  END IF;
  IF v_corpo ILIKE '%permission%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia permission -- a validade aqui e a do token.';
  END IF;
  IF v_corpo ILIKE '%pessoas_contas%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter referencia pessoas_contas -- o convite nao liga contas de utilizador.';
  END IF;

  -- 5. O CONTRATO: a RPC tem de LER todas as chaves do contrato. E a guarda
  --    que impede o desalinhamento de voltar -- do lado da base. Do lado do
  --    codigo, conviteAdmissaoContrato.test.ts faz a comparacao inversa.
  v_faltam := ARRAY[]::text[];
  FOREACH v_chave IN ARRAY v_chaves
  LOOP
    IF v_corpo NOT LIKE '%''' || v_chave || '''%' THEN
      v_faltam := v_faltam || v_chave;
    END IF;
  END LOOP;

  IF array_length(v_faltam, 1) > 0 THEN
    RAISE EXCEPTION
      'rpc_hr_convite_admissao_submeter nao le estas chaves do contrato: %. Foi exactamente este desalinhamento que apagava fichas inteiras.',
      array_to_string(v_faltam, ', ');
  END IF;

  -- 6. Nenhum ON CONFLICT pode ter voltado a ser incondicional nas colunas de
  --    negocio. O NISS e o caso-teste: era ele que se perdia.
  IF v_corpo NOT LIKE '%niss = CASE WHEN p_dados ? ''niss''%' THEN
    RAISE EXCEPTION 'O UPDATE do niss voltou a ser incondicional -- apagaria o NISS que o RH ja tinha posto.';
  END IF;

  -- 7. O portao tem de estar la.
  IF v_corpo NOT LIKE '%hr_admissao_pendencias%' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_submeter nao chama hr_admissao_pendencias -- ficou sem portao de obrigatorios.';
  END IF;

  -- 8. A morada tem de CALCULAR is_principal, nunca fixa-lo em true.
  IF v_corpo NOT LIKE '%SELECT NOT EXISTS (%' THEN
    RAISE EXCEPTION 'A morada deixou de calcular is_principal -- fixa-lo em true rebenta quando a pessoa ja tem outra morada principal.';
  END IF;

  RAISE NOTICE 'OK: contrato de % chaves alinhado, ON CONFLICT condicionais, portao de obrigatorios ligado, rascunho gravavel, tudo so a service_role.',
    array_length(v_chaves, 1);
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. Esta migracao PRESSUPOE que 20261124130000 ja esta aplicada (esta: as duas
--    aparecem em `supabase migration list --linked`). Substitui o corpo de
--    _estado e _submeter, ambos com a MESMA aridade -- por isso CREATE OR
--    REPLACE, e nao DROP+CREATE, e nao ha risco de duas candidatas.
-- 2. A Edge Function `convite-admissao` TEM de ser publicada na mesma leva: a
--    versao anterior dela manda o payload aninhado, que esta versao da RPC
--    ignora por inteiro. Com a RPC nova e a Edge Function velha, uma submissao
--    passa a falhar no portao ("admissao_incompleta") em vez de apagar a ficha
--    -- o que ja e melhor, mas continua a nao funcionar.
-- 3. Continua por decidir: se um token valido substitui a permissao do
--    utilizador para escrever o NISS e o IBAN. O ramo do IBAN permanece
--    inalcancavel ate essa decisao.
-- ==============================================================================
