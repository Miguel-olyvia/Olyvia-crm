-- ==============================================================================
-- O que falta a uma admissao passa a poder ser MOSTRADO aos RH na ficha, e a
-- Edge Function que cria o acesso ganha a RPC que lhe liga a conta.
--
-- POR APLICAR.
--
--
-- -- 1. AS PENDENCIAS: DE service_role PARA authenticated -----------------------
--
-- `hr_admissao_pendencias(uuid)` sabe exactamente o que falta a uma ficha para
-- a admissao ficar completa, e ate agora so `rpc_hr_convite_admissao_submeter`
-- a podia chamar. Quem trabalha em RH nao tinha forma nenhuma de ver a lista:
-- abria a ficha, via campos vazios espalhados por seis separadores, e adivinhava
-- se ja podia mandar as credenciais.
--
-- O comentario da propria funcao, escrito em 20261128010000, dizia o caminho:
--
--   "Expor isto a authenticated exigiria filtrar por permissao de leitura de
--    cada tabela de origem, tal como a politica de pessoas_dados_alteracoes faz."
--
-- E o que esta migracao faz, e sem inventar criterio novo: a politica
-- `pessoas_dados_alteracoes_select` (20261124140000) decide linha a linha pela
-- permissao da TABELA DE ONDE o valor veio, e nao por `hr.pessoas.view` para
-- tudo -- porque senao quem so podia ver a lista de colegas lia pelo historico a
-- data de nascimento, o NIF, o documento e a morada de casa. Aqui e igual: cada
-- CODIGO de pendencia exige a permissao da tabela que o guarda.
--
-- Porque isto importa mais do que parece: "falta o NISS" e "falta a conta
-- bancaria" sao, por si so, informacao sobre a pessoa. A funcao continua a
-- devolver SO CODIGOS, nunca valores -- e o que a impede de revelar o NISS ou o
-- IBAN -- mas quem nao pode ler a tabela de identificacao tambem nao tem que
-- saber se ela esta preenchida. Sem o filtro, expor a funcao a `authenticated`
-- seria a mesma "guarda no JSX" de sempre: a lista sairia inteira do PostgREST
-- para qualquer utilizador da organizacao.
--
-- O MAPA codigo -> permissao nao fica escondido dentro do corpo da funcao: e
-- uma funcao propria, `hr_admissao_campo_permissao()`, para o bloco CONFERIR
-- poder compara-la com `hr_admissao_campos_obrigatorios()` e ABORTAR se um
-- campo obrigatorio novo aparecer sem permissao associada. Sem isso, o proximo
-- campo obrigatorio entrava em silencio na lista sem gate nenhum -- ou, pior,
-- ficava invisivel para toda a gente sem ninguem perceber.
--
-- A CHAMADA POR service_role NAO PODE MUDAR DE COMPORTAMENTO. E ela que serve
-- de portao a submissao do convite: se o filtro de permissao se aplicasse
-- tambem a ela, `auth.uid()` viria NULL, nenhuma pendencia sairia, e a submissao
-- passaria a aceitar fichas vazias -- exactamente o defeito que o portao existe
-- para impedir. Por isso: `auth.uid() IS NULL` significa service_role e devolve
-- tudo. `anon` nao chega la (nao tem, e continua a nao ter, EXECUTE) e um
-- utilizador autenticado tem sempre uid.
--
-- A propria pessoa ve as suas pendencias todas, como ja ve o seu historico todo
-- em `pessoas_dados_alteracoes`. E dela.
--
-- Quem nao pode ver a ficha de todo leva `insufficient_privilege` em vez de uma
-- lista vazia: uma lista vazia lê-se como "esta tudo preenchido", e dizer "esta
-- tudo bem" a quem nao pode ver nada e pior do que recusar.
--
--
-- -- 2. A RPC DE LIGAR A CONTA DO LADO DO SERVICO ------------------------------
--
-- `rpc_hr_ligar_conta` (20261120090000) verifica `hr.pessoas.conta.link` com
-- `auth.uid()`. A Edge Function `criar-acesso-pessoa` cria a conta de raiz com
-- `service_role` -- onde `auth.uid()` e NULL -- depois de JA TER VERIFICADO, com
-- o JWT de quem clicou, que essa pessoa tem `hr.pessoas.conta.criar` na
-- organizacao da ficha. Chamar a RPC de utilizador dali nunca poderia funcionar.
--
-- Em vez de deixar a Edge Function escrever a mao em `pessoas_contas` -- que e
-- como se perdem as tres guardas curadas -- criamos a gemea de servico, com as
-- MESMAS guardas e sem a de permissao (que ja foi feita, e feita mais acima):
--   - a conta tem de ter membership ACTIVO na organizacao da pessoa;
--   - a conta nao pode ja estar ligada a OUTRA pessoa;
--   - a pessoa nao pode ja ter OUTRA conta activa.
-- Idempotente, como a irma. EXECUTE so a service_role.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, para voltar a
-- fechar as pendencias a `authenticated`:
--   REVOKE EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) FROM authenticated;
--   DROP FUNCTION IF EXISTS public.rpc_hr_ligar_conta_por_servico(uuid, uuid, uuid);
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120090000  pessoas_contas, hr_pessoa_do_utilizador, rpc_hr_ligar_conta
--   20261128010000  hr_admissao_campos_obrigatorios, hr_admissao_pendencias
--   20261129010000  catalogo com hr.pessoas.conta.criar
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF to_regclass('public.pessoas_contas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_contas nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias';
  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'Esperava exactamente 1 hr_admissao_pendencias, encontrei %. Duas aridades tornam a chamada da submissao ambigua.', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_campos_obrigatorios';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava exactamente 1 hr_admissao_campos_obrigatorios, encontrei %.', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'public.hr_pessoa_do_utilizador nao existe -- e o helper da clausula de ficha-propria. Aplicar 20261120090000 primeiro.';
  END IF;

  RAISE NOTICE 'Guardas passadas.';
END;
$guardas$;


-- ==============================================================================
-- O mapa: cada campo obrigatorio e a permissao da tabela que o guarda
-- ==============================================================================
-- Funcao propria, e nao uma lista enterrada no corpo de hr_admissao_pendencias,
-- para o bloco CONFERIR a poder cruzar com hr_admissao_campos_obrigatorios() e
-- abortar quando as duas divergirem.
DROP FUNCTION IF EXISTS public.hr_admissao_campo_permissao();

CREATE FUNCTION public.hr_admissao_campo_permissao()
RETURNS TABLE (codigo text, tabela text, permissao text)
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT *
  FROM (VALUES
    -- O nucleo da ficha
    ('email_pessoal',                 'pessoas',                  'hr.pessoas.view'),
    ('data_admissao',                 'pessoas',                  'hr.pessoas.view'),
    -- Dados pessoais
    ('data_nascimento',               'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('genero',                        'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('nacionalidade',                 'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('telefone_pessoal',              'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('estado_civil',                  'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('dependentes',                   'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('dependentes_deficientes',       'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('conjuge_situacao_profissional', 'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_freguesia',        'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_concelho',         'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('naturalidade_pais',             'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('habilitacao_academica',         'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    ('habilitacao_data_conclusao',    'pessoas_dados_pessoais',   'hr.pessoas.pessoais.view'),
    -- Identificacao (e onde vive o NISS)
    ('nif',                           'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('niss',                          'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('tipo_documento',                'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('numero_documento',              'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    ('validade_documento',            'pessoas_identificacao',    'hr.pessoas.identificacao.view'),
    -- Morada
    ('linha1',                        'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('codigo_postal',                 'pessoas_moradas',          'hr.pessoas.morada.view'),
    ('localidade',                    'pessoas_moradas',          'hr.pessoas.morada.view'),
    -- Fardamento: mesma permissao que a politica do historico ja lhe da
    ('tamanho_cima',                  'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tamanho_baixo',                 'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    ('tamanho_blazer',                'pessoas_fardamento',       'hr.pessoas.laborais.view'),
    -- Filiacao sindical: categoria especial, permissao propria
    ('sindicalizado',                 'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    ('sindicato',                     'pessoas_sindicalizacao',   'hr.pessoas.sindicalizacao.view'),
    -- Conta bancaria
    ('conta_numero',                  'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_titular',                 'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view'),
    ('conta_banco',                   'pessoas_dados_bancarios',  'hr.pessoas.bancarios.view')
  ) AS t(codigo, tabela, permissao);
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_campo_permissao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_campo_permissao() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campo_permissao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_campo_permissao() TO service_role;

COMMENT ON FUNCTION public.hr_admissao_campo_permissao() IS
'Para cada campo obrigatorio de admissao, a tabela que o guarda e a permissao que e precisa para saber se ele esta preenchido. Existe separada de hr_admissao_pendencias para o bloco CONFERIR das migracoes poder cruzar as duas listas e abortar quando um campo obrigatorio novo aparecer sem permissao associada. O criterio e o mesmo da politica pessoas_dados_alteracoes_select: cada item exige a permissao da TABELA DE ORIGEM, nunca hr.pessoas.view para tudo.';


-- ==============================================================================
-- hr_admissao_pendencias: a mesma resposta, agora com gate de permissao
-- ==============================================================================
-- Assinatura INALTERADA -- rpc_hr_convite_admissao_submeter chama-a assim e nao
-- se lhe toca nesta migracao.
DROP FUNCTION IF EXISTS public.hr_admissao_pendencias(uuid);

CREATE FUNCTION public.hr_admissao_pendencias(p_pessoa_id uuid)
RETURNS TABLE (codigo text, origem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_org        uuid;
  -- `auth.uid()` NULL = service_role. anon nao tem EXECUTE (e o bloco CONFERIR
  -- no fim deste ficheiro aborta se alguem lho der), e um utilizador
  -- autenticado tem sempre uid. Ver o cabecalho: sem este ramo, o portao da
  -- submissao do convite deixava passar fichas vazias.
  v_servico    boolean := (v_uid IS NULL);
  v_propria    boolean := false;
  v_ficha      boolean := false;
  v_permitidas text[]  := ARRAY[]::text[];
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  -- Ficha inexistente ou apagada: nada a dizer, e sem revelar qual dos dois.
  IF v_org IS NULL THEN
    RETURN;
  END IF;

  IF NOT v_servico THEN
    v_ficha := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view', v_org);

    v_propria := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view.own', v_org)
                 AND public.hr_pessoa_do_utilizador(v_uid, v_org) = p_pessoa_id;

    -- Uma lista vazia le-se como "esta tudo preenchido". A quem nao pode ver a
    -- ficha nao se diz isso: recusa-se.
    IF NOT (v_ficha OR v_propria) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;

    -- As permissoes DISTINTAS, resolvidas uma vez cada (sete chamadas, nao uma
    -- por campo obrigatorio).
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
      nullif(btrim(coalesce(f.tamanho_blazer, '')), '')      AS tamanho_blazer,
      -- Um interruptor respondido a "nao" esta respondido: o que se exige e que
      -- a resposta exista, nao que seja verdadeira.
      s.sindicalizado::text                                  AS sindicalizado,
      nullif(btrim(coalesce(s.sindicato, '')), '')           AS sindicato,
      -- A conta: o segredo do Vault e a prova de que ha numero. Nunca se le o
      -- numero, nem os ultimos quatro caracteres.
      b.conta_secret_id::text                                AS conta_numero,
      nullif(btrim(coalesce(b.titular, '')), '')             AS conta_titular,
      nullif(btrim(coalesce(b.banco, '')), '')               AS conta_banco
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
    WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
  )
  SELECT c.codigo, c.origem
  FROM estado e
  CROSS JOIN public.hr_admissao_campos_obrigatorios() c
  JOIN public.hr_admissao_campo_permissao() cp ON cp.codigo = c.codigo
  WHERE (to_jsonb(e) ->> c.codigo) IS NULL
    -- O gate. "Falta o NISS" e informacao sobre a pessoa: quem nao pode ler a
    -- tabela de identificacao tambem nao sabe se ela esta preenchida.
    AND (v_servico OR v_propria OR cp.permissao = ANY (v_permitidas))
    -- As condicionalidades, escritas por extenso em vez de inventadas por regra
    -- generica. Em todas elas, o campo de que dependem ainda por preencher NAO
    -- arrasta a pendencia consigo: essa ja aparece, e so uma, no proprio campo.
    AND (c.codigo <> 'validade_documento'
         OR (e.tipo_documento IS NOT NULL AND e.tipo_documento <> 'cartao_cidadao'))
    AND (c.codigo <> 'conjuge_situacao_profissional'
         OR e.estado_civil IN ('casado', 'uniao_de_facto'))
    AND (c.codigo <> 'sindicato'
         OR e.sindicalizado = 'true')
  ORDER BY c.codigo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_admissao_pendencias(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_admissao_pendencias(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_admissao_pendencias(uuid) IS
'Os campos obrigatorios de admissao que a ficha desta pessoa AINDA NAO tem, pelas duas paginas da folha de cadastro. Devolve SO codigos, nunca valores: saber que "falta o NISS" nao revela o NISS, e saber que "falta a conta" nao revela o IBAN. SECURITY DEFINER porque le colunas fechadas a authenticated (niss, conta_secret_id). Desde 20261129020000 e chamavel por authenticated, com gate: cada codigo exige a permissao da TABELA DE ORIGEM (mapa em hr_admissao_campo_permissao), tal como a politica de pessoas_dados_alteracoes; a propria pessoa ve tudo o que e seu; quem nao pode ver a ficha de todo leva insufficient_privilege em vez de uma lista vazia, que se leria como "esta tudo preenchido". auth.uid() NULL significa service_role e devolve tudo -- e o que mantem o portao de rpc_hr_convite_admissao_submeter a funcionar.';


-- ==============================================================================
-- RPC: ligar a conta do lado do servico
-- ==============================================================================
-- A gemea de rpc_hr_ligar_conta para quem ja verificou a permissao mais acima e
-- corre sem sessao. MESMAS guardas, menos a de permissao. Ver o cabecalho.
CREATE OR REPLACE FUNCTION public.rpc_hr_ligar_conta_por_servico(
  p_pessoa_id    uuid,
  p_anew_user_id uuid,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org       uuid;
  v_entity    uuid;
  v_id        uuid;
  v_ja_ligada uuid;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada';
  END IF;

  -- A conta tem de ser membro ACTIVO desta organizacao. Sem isto, ligava-se a
  -- ficha de uma organizacao a uma conta de outra, e a clausula de
  -- ficha-propria passaria a dar-lhe leitura.
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_memberships am
    WHERE am.user_id = p_anew_user_id
      AND am.organization_id = v_org
      AND am.status = 'active'
  ) THEN
    RAISE EXCEPTION 'conta_sem_membership_na_organizacao';
  END IF;

  SELECT pc.pessoa_id INTO v_ja_ligada
  FROM public.pessoas_contas pc
  WHERE pc.organization_id = v_org
    AND pc.anew_user_id = p_anew_user_id
    AND pc.estado = 'activa'
  LIMIT 1;

  IF v_ja_ligada IS NOT NULL AND v_ja_ligada <> p_pessoa_id THEN
    RAISE EXCEPTION 'conta_ja_ligada_a_outra_pessoa';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pessoas_contas pc
    WHERE pc.pessoa_id = p_pessoa_id
      AND pc.estado = 'activa'
      AND pc.anew_user_id <> p_anew_user_id
  ) THEN
    RAISE EXCEPTION 'pessoa_ja_tem_conta_activa';
  END IF;

  IF v_ja_ligada = p_pessoa_id THEN
    SELECT pc.id INTO v_id
    FROM public.pessoas_contas pc
    WHERE pc.pessoa_id = p_pessoa_id
      AND pc.anew_user_id = p_anew_user_id
      AND pc.estado = 'activa';
    RETURN v_id;
  END IF;

  SELECT au.entity_id INTO v_entity FROM public.anew_users au WHERE au.id = p_anew_user_id;

  INSERT INTO public.pessoas_contas
    (pessoa_id, organization_id, anew_user_id, entity_id, estado, ligada_por)
  VALUES
    (p_pessoa_id, v_org, p_anew_user_id, v_entity, 'activa', p_actor_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ligar_conta_por_servico(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ligar_conta_por_servico(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_ligar_conta_por_servico(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ligar_conta_por_servico(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ligar_conta_por_servico(uuid, uuid, uuid) IS
'Liga uma ficha de RH a uma conta de utilizador SEM verificar permissao -- e por isso SO service_role. Existe para a Edge Function criar-acesso-pessoa, que verifica hr.pessoas.conta.criar com o JWT de quem clicou ANTES de passar a service_role para criar a conta. Guardas identicas as de rpc_hr_ligar_conta: membership activo na organizacao da pessoa, conta nao ligada a outra pessoa, pessoa sem outra conta activa. Idempotente. Quem tem sessao usa rpc_hr_ligar_conta, que exige hr.pessoas.conta.link; esta nunca e chamavel por authenticated.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_sem_permissao text;
  v_sem_campo     text;
  v_perm_ausente  text;
  v_n             integer;
  v_src           text;
BEGIN
  -- 1. As duas listas cobrem-se exactamente uma a outra. Se um campo
  --    obrigatorio novo entrar sem permissao associada, ele nunca apareceria a
  --    ninguem (o JOIN deita-o fora) -- em silencio. Aborta.
  SELECT string_agg(c.codigo, ', ' ORDER BY c.codigo) INTO v_sem_permissao
    FROM public.hr_admissao_campos_obrigatorios() c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.hr_admissao_campo_permissao() cp WHERE cp.codigo = c.codigo
   );

  IF v_sem_permissao IS NOT NULL THEN
    RAISE EXCEPTION
      'Campos obrigatorios sem permissao associada em hr_admissao_campo_permissao: %. Sem isto ficariam invisiveis para toda a gente.',
      v_sem_permissao;
  END IF;

  SELECT string_agg(cp.codigo, ', ' ORDER BY cp.codigo) INTO v_sem_campo
    FROM public.hr_admissao_campo_permissao() cp
   WHERE NOT EXISTS (
     SELECT 1 FROM public.hr_admissao_campos_obrigatorios() c WHERE c.codigo = cp.codigo
   );

  IF v_sem_campo IS NOT NULL THEN
    RAISE EXCEPTION
      'hr_admissao_campo_permissao tem codigos que ja nao sao obrigatorios: %. Limpar antes de continuar.',
      v_sem_campo;
  END IF;

  SELECT count(*) INTO v_n FROM public.hr_admissao_campo_permissao();
  IF v_n <> 31 THEN
    RAISE EXCEPTION 'hr_admissao_campo_permissao devolve % linhas; esperavam-se 31.', v_n;
  END IF;

  -- 2. Cada permissao do mapa existe mesmo no catalogo. Um codigo com erro de
  --    escrita nunca casa e esconde o campo para sempre.
  SELECT string_agg(DISTINCT cp.permissao, ', ') INTO v_perm_ausente
    FROM public.hr_admissao_campo_permissao() cp
   WHERE NOT EXISTS (
     SELECT 1 FROM public.anew_permissions ap WHERE ap.code = cp.permissao
   );

  IF v_perm_ausente IS NOT NULL THEN
    RAISE EXCEPTION 'Permissoes do mapa que nao existem no catalogo: %.', v_perm_ausente;
  END IF;

  -- 3. Os grants: authenticated passa a poder executar, anon continua fora.
  IF NOT has_function_privilege('authenticated', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias continua fechada a authenticated -- era o objectivo desta migracao.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou aberta a anon. O ramo de service_role assenta em anon NUNCA chegar aqui.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_admissao_campo_permissao()', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_campo_permissao ficou aberta a anon.';
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_hr_ligar_conta_por_servico(uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_ligar_conta_por_servico(uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_ligar_conta_por_servico tem de ser SO service_role: nao verifica permissao nenhuma.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_admissao_pendencias(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_pendencias deixou de ser executavel por service_role -- o portao da submissao do convite parava.';
  END IF;

  -- 4. Uma aridade so, para a chamada da submissao nao ficar ambigua.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'hr_admissao_pendencias ficou com % aridades.', v_n;
  END IF;

  -- 5. O ramo de service_role tem de estar mesmo la: sem ele, o portao da
  --    submissao do convite passa a aceitar fichas vazias.
  SELECT pg_get_functiondef('public.hr_admissao_pendencias(uuid)'::regprocedure) INTO v_src;
  IF v_src NOT LIKE '%v_servico%' THEN
    RAISE EXCEPTION
      'hr_admissao_pendencias ficou sem o ramo de service_role -- o portao de rpc_hr_convite_admissao_submeter deixaria de ver pendencias.';
  END IF;
  IF v_src NOT LIKE '%insufficient_privilege%' THEN
    RAISE EXCEPTION
      'hr_admissao_pendencias ficou sem a recusa a quem nao pode ver a ficha -- uma lista vazia le-se como "esta tudo preenchido".';
  END IF;

  -- 6. A funcao continua SECURITY DEFINER com search_path fixo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias'
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION 'hr_admissao_pendencias perdeu SECURITY DEFINER ou o search_path fixo.';
  END IF;

  RAISE NOTICE
    'OK: 31 campos obrigatorios com permissao de origem associada, pendencias abertas a authenticated com gate, anon fora, e rpc_hr_ligar_conta_por_servico so para service_role.';
END;
$conferir$;
