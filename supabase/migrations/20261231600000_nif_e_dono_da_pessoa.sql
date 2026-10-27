-- =============================================================================
-- 20261231600000_nif_e_dono_da_pessoa.sql  (base RH)  -- RASCUNHO, NAO APLICAR
--
-- Substitui o rascunho 20261231300000 (cujo numero ficou registado na RH sem
-- conteudo e sem ficheiro: o db push nunca o aplicaria). Tres coisas:
--   A. neg_guardar_nif_pessoa: gravar (ou limpar) o NIF da pessoa.
--   B. Gatilho em negocios: quando um negocio ganha responsavel e a pessoa
--      ainda nao tem dono, a pessoa fica com o mesmo responsavel.
--   C. authenticated deixa de poder fazer UPDATE directo a
--      anew_entities.nif_hash, nif_encrypted e nif_last3: o NIF so se grava
--      pelas funcoes SECURITY DEFINER (esta e as rpc_* do nif-write-proxy).
--
-- SO RH (uetjghdkwbywbftedtth). Nao toca na Mudelar nem na base principal.
--
-- *** PRECISA DO NIF-WRITE-PROXY NOVO, PUBLICADO LOGO A SEGUIR AO DB PUSH ***
--   A parte A so pode ser chamada pela Edge Function nif-write-proxy, na
--   versao NOVA do ramo feature/rh-pessoas (opcao (a), ver DECIDIDO abaixo):
--   o proxy chama esta RPC com um cliente service_role (SEM o Authorization do
--   utilizador), poe p_actor_auth_uid = o utilizador do JWT que validou
--   (descartando o que o cliente mande) e ja NAO manda p_nif_tokens (a
--   assinatura nova nao o tem: o PostgREST nao encontraria a funcao).
--   Migration e proxy entram JUNTOS: com a migration e o proxy antigo nenhum
--   NIF se grava (authenticated deixa de ter EXECUTE e o proxy antigo chama
--   com o JWT do utilizador); com o proxy novo e sem a migration tambem nao
--   (a assinatura nao existe). Publicar o nif-write-proxy na RH (--use-api,
--   sem Docker) logo a seguir ao db push. O frontend (useGuardarNifPessoa) ja
--   chama o proxy e nao muda. O hash (HMAC-SHA256, NIF_HMAC_KEY) e a cifra
--   (AES-256-GCM, NIF_ENC_KEY) so se calculam na Edge Function; os dois
--   segredos ja existem na RH. A funcao nao existe hoje na RH (0 assinaturas,
--   lido a 27/10), por isso nada que hoje funcione deixa de funcionar.
--   A parte C NAO precisa de codigo: lido a 26/10, nenhuma funcao INVOKER
--   escreve nif_* (todas as que escrevem sao SECURITY DEFINER) e nem o
--   frontend nem as Edge Functions fazem UPDATE directo a essas colunas.
--
-- Onde fica o NIF (lido na RH a 26/10, so catalogo):
--   * anew_entities.nif_hash, nif_encrypted, nif_last3 (CHECK 3 digitos) e o
--     indice unico uq_anew_entities_org_nif_hash (organization_id, nif_hash)
--     WHERE nif_hash IS NOT NULL AND deleted_at IS NULL.
--   * fiscal_entities (NIF em claro) e o modelo antigo: NAO se usa aqui.
--   * fn_generic_entity_audit retira nif_hash e nif_encrypted do registo.
--   * neg_ficha_pessoa ja le nif_last3 e tem_nif por fn_neg_pessoa_tem_nif (na
--     base desde o numero 20261231400000; o ficheiro e o 20261231700000).
--
-- A. NIF repetido: NG030 so se a outra pessoa estiver no ambito 'view' do
--    actor; senao, e na corrida com o indice unico, NG031 com mensagem fixa e
--    generica. O NIF nunca entra numa mensagem, num log nem na auditoria.
--
-- A'. Como a funcao sabe quem e o actor (opcao (a), desenho em
--    supabase/rascunhos/DESENHO-nif-opcao-a.md):
--   1. quem chama tem de ser service_role sem utilizador: auth.uid() nulo e
--      auth.role() = 'service_role'; senao insufficient_privilege;
--   2. o actor (p_actor_auth_uid, id de auth.users) tem de existir em
--      anew_users (deleted_at nulo) e ter membership activa, nao cliente, na
--      organizacao; qualquer falha da a MESMA recusa generica que a falta de
--      permissao (nao distingue "nao existe" de "nao e membro");
--   3. a funcao assume a identidade do actor so dentro da transaccao
--      (set_config local de request.jwt.claim.sub, request.jwt.claim.role e
--      request.jwt.claims = {sub: actor, role: authenticated}) e confirma
--      logo a seguir que auth.uid() = actor e auth.role() = 'authenticated';
--      senao falha (impede que fn_neg_pessoa_no_ambito, que faz RETURN true
--      com uid nulo, corra sem utilizador);
--   4. corre as MESMAS verificacoes de hoje com as funcoes existentes, sem as
--      alterar (pessoas.view, organizacao, configuracao, pessoa, pessoas.edit
--      e ambito 'edit', entidade nao partilhada);
--   5. repoe os valores anteriores num unico ponto de saida (o set_config
--      local NAO e desfeito no fim da funcao, por ela ter SET search_path: so
--      no fim da transaccao ou num erro). Durante a escrita tambem neutraliza
--      app.audit_user_id e app.audit_bypass, para a auditoria registar o
--      actor pela identidade assumida e nao um valor posto por quem chama.
--
-- *** SEGURANCA: O QUE E BARREIRA E O QUE NAO E ***
--   * A UNICA barreira que torna o parametro p_actor_auth_uid confiavel e o
--     EXECUTE so para service_role (e o dono). Quem tiver a chave service_role
--     (ou uma ligacao como postgres/supabase_admin) grava em nome de qualquer
--     actor: e o mesmo poder que ja tem sobre a base inteira.
--   * A verificacao de auth.role() = 'service_role' NAO e uma barreira: o
--     claim e um GUC que qualquer papel pode por com set_config. Serve so para
--     recusar a chamada de quem ja tem sessao de utilizador (sub posto).
--   * Os default privileges do schema public dao EXECUTE a anon e
--     authenticated a cada funcao CRIADA. QUALQUER migration futura que toque
--     nesta funcao (CREATE OR REPLACE, DROP/CREATE, mudanca de assinatura) TEM
--     de repetir o REVOKE ALL ... FROM PUBLIC, anon, authenticated, o GRANT a
--     service_role e o conferir 9b; senao reabre o buraco em silencio.
--   * A identidade assumida so tem os claims sub e role. Lido a 27/10: nenhuma
--     funcao no caminho (as do 0b e os gatilhos de anew_entities) le outro
--     claim, auth.jwt() ou app_metadata. Prova estatica: ANTES do db push,
--     correr TESTE-teste-nif-e-dono.sql contra a RH em BEGIN/ROLLBACK (actor
--     nulo, inexistente, sem membership, sem pessoas.edit, sem ambito 'edit',
--     e o admin; o autor na auditoria). QUALQUER alteracao a uma funcao do 0b
--     (md5) obriga a repetir esse teste antes de mudar esta guarda.
--
-- B. Decisoes no gatilho:
--   * so preenche um dono nulo; nunca troca nem apaga um dono existente;
--   * so com negocio vivo, pessoa viva da MESMA organizacao, que nao e ficha de
--     organizacao nem entidade partilhada (fn_neg_entidade_partilhada);
--   * o responsavel tem de ser membro activo e nao cliente da organizacao;
--   * com sessao: so atribui se quem escreve tiver ambito 'edit' sobre a PESSOA
--     e, se o responsavel nao for ele proprio (fn_negocios_actor), leads.assign
--     na organizacao (fn_neg_tem_permissao_org); senao nao atribui;
--   * sem sessao (formularios, service_role): sem estas duas verificacoes;
--   * NUNCA faz falhar o negocio: qualquer erro inesperado dentro do gatilho e
--     apanhado, desfaz so a atribuicao e deixa um WARNING com o SQLSTATE (sem
--     dados da pessoa). query_canceled (statement_timeout) nao e apanhado;
--   * nao chama fn_owner_sync_apply: so anew_entities.assigned_to;
--   * bloqueio curto FOR NO KEY UPDATE SKIP LOCKED: se a pessoa estiver
--     bloqueada noutra transaccao, nao espera e nao atribui;
--   * sem recursao: nenhum gatilho de anew_entities escreve em negocios (0h).
--
-- C. Revogacao por coluna. authenticated nao tem UPDATE ao nivel da tabela em
--    anew_entities (relacl lido: authenticated=ad), por isso o REVOKE por
--    coluna produz efeito; a guarda 0i confirma-o antes. A guarda guarda a
--    lista de colunas que authenticated pode actualizar e o conferir exige que
--    depois seja exactamente essa lista menos as tres.
--    Fica de fora (por decisao de ambito): billing_nif_encrypted e
--    billing_nif_last3 (authenticated continua com UPDATE por coluna) e o
--    INSERT ao nivel da tabela (cobre nif_hash/nif_encrypted numa ficha nova).
--
-- D. Limite de tentativas NA BASE (decisao do utilizador, 26/10): imposto
--    DENTRO desta funcao, que e o unico ponto de passagem obrigatorio (so o
--    proxy a pode chamar) e e partilhado por todas as instancias do proxy.
--    Tabela neg_nif_tentativas, contador por (actor, minuto) com UPSERT
--    atomico (INSERT ... ON CONFLICT DO UPDATE ... RETURNING); constante
--    k_max_tentativas_minuto = 10; a 11.a gravacao com NIF do mesmo actor no
--    mesmo minuto falha com NG032 (o proxy da 429). Limpeza barata: so as
--    janelas com mais de uma hora do PROPRIO actor, pelo prefixo da chave
--    primaria. Para as recusas por NIF repetido CONTAREM, a RPC nao as lanca
--    como excepcao (o ROLLBACK levaria o contador): devolve {erro:
--    'NG030'|'NG031', mensagem}, e o nif-write-proxy traduz para erro HTTP com
--    o codigo na mensagem. As recusas por permissao/ambito sao lancadas e nao
--    contam (nao revelam nada sobre o NIF). Limitacoes aceites: janela fixa
--    de um minuto (ate 20 tentativas em dois segundos na fronteira) e o
--    limite e por actor. O limite em memoria do proxy fica como camada extra.
--
-- RISCO ACEITE: SKIP LOCKED pode perder uma atribuicao (fica a manual,
--   neg_atribuir_pessoa).
--
-- *** DECIDIDO (utilizador, 26/10): OPCAO (a) ***
--   O problema era: com EXECUTE para authenticated, quem tivesse pessoas.edit
--   e chamasse a RPC sem o proxy podia gravar um hash e uma cifra que nao
--   correspondem ao NIF (so se valida a forma). Escolhida a opcao (a): EXECUTE
--   revogado a PUBLIC, anon e authenticated e concedido SO a service_role; o
--   proxy chama com service_role e passa o utilizador ja verificado
--   (p_actor_auth_uid), que a funcao valida por dentro (A'). O contador de
--   tentativas fica na base (D), tambem por decisao do utilizador.
--
-- Corpos de referencia lidos de pg_get_functiondef no remoto RH a 26/10 e
-- 27/10 (auth.uid, auth.role e os helpers do caminho); as guardas conferem o
-- md5 de cada um.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas (falham antes de mudar o que quer que seja)
-- -----------------------------------------------------------------------------
DO $guarda$
DECLARE
  v_n    bigint;
  v_nome text;
  v_txt  text;
  r      record;
BEGIN
  -- 0a. uma so assinatura das funcoes que se copiam ou que se chamam
  FOREACH v_nome IN ARRAY ARRAY['neg_guardar_contacto_pessoa', 'neg_guardar_origem_pessoa',
                                'fn_neg_entidade_partilhada', 'fn_nif_key',
                                'fn_neg_exigir_pessoa', 'fn_neg_pessoa_no_ambito',
                                'fn_neg_tem_permissao_org', 'fn_neg_exigir_config',
                                'crm_scope_keys', 'get_user_crm_org_ids', 'has_anew_permission',
                                'fn_generic_entity_audit', 'fn_negocios_guardar_alteracao',
                                'neg_atribuir_pessoa', 'auto_assign_creator',
                                'fn_negocios_actor', 'resolve_lead_access_context',
                                'fn_neg_pessoa_por_negocio', 'current_business_user_id']
  LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Guarda: a funcao public.% tem % assinaturas (esperava 1).', v_nome, v_n;
    END IF;
  END LOOP;

  -- 0b. as funcoes de referencia ainda sao a versao lida (md5 de
  --     pg_get_functiondef). Se alguem as mudou, reler antes de aplicar.
  FOR r IN
    SELECT x.nome, x.h FROM (VALUES
      ('neg_guardar_contacto_pessoa',   'f21badc29bebc0b294508f7c40dc0ff2'),
      ('neg_guardar_origem_pessoa',     '2cc2e4e5563897496a8abba7293ae523'),
      ('fn_neg_entidade_partilhada',    '697dbf5d3969cf27dfa07280194ac52d'),
      ('fn_nif_key',                    '9d573e3b8385c08bf8dd84c9ab2cb362'),
      ('fn_neg_exigir_pessoa',          '6442d6f7782f82fa76b6908d1487cf79'),
      ('fn_neg_pessoa_no_ambito',       'c7a7be70424773fad627a460dd0e7030'),
      ('fn_neg_tem_permissao_org',      '05943a6cfb0382a07322870262170c8d'),
      ('fn_neg_exigir_config',          '566f127b4f3cea295f04c916e366cd5d'),
      ('fn_generic_entity_audit',       'd94654a5f57f1eb6e8b8fa6902b50533'),
      ('fn_negocios_guardar_alteracao', '5995a31b68f65202c9e1ddc6fe17f913'),
      ('neg_atribuir_pessoa',           '87fc2a837ad5e35da7d813542613f55b'),
      ('auto_assign_creator',           '29958e2be188efa75ae9a902448fb5bb'),
      ('fn_negocios_actor',             '26296535afef27c393ab0c932995e3cb'),
      -- caminho das verificacoes com a identidade assumida (lidos a 27/10)
      ('crm_scope_keys',                '7c0abecd98b5e212ebcac05ca5985d18'),
      ('has_anew_permission',           '8f69ed134c7d20e080d8c5a4161a3151'),
      ('get_user_crm_org_ids',          '29782031244dd3b0842ca43b271e2bf1'),
      ('resolve_lead_access_context',   '52cdb3e4bf1f3fa927270e178d9a2fe6'),
      ('fn_neg_pessoa_por_negocio',     'fb6fc66605bd2ff923d9f60fa8ae7e8a'),
      ('current_business_user_id',      '7e60101f074e4ff526559140be6618bb')
    ) AS x(nome, h)
  LOOP
    SELECT md5(pg_get_functiondef(p.oid))::text INTO v_txt
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome;
    IF v_txt IS DISTINCT FROM r.h THEN
      RAISE EXCEPTION 'Guarda: public.% no remoto ja nao e a versao lida (md5 %, esperado %).',
        r.nome, v_txt, r.h;
    END IF;
  END LOOP;

  -- 0b2. auth.uid() le request.jwt.claim.sub ANTES de request.jwt.claims, e
  --      auth.role() le request.jwt.claim.role antes de claims (lidos a 27/10).
  --      A identidade assumida em A' depende disto; se mudarem, reler e repetir
  --      o teste antes de aplicar.
  FOR r IN
    SELECT x.nome, x.h FROM (VALUES
      ('uid',  'ea3b41bf29e2ad573067939329aa088e'),
      ('role', '8a3e05459e07e0633d43c6fba2a2cdf4')
    ) AS x(nome, h)
  LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'auth'::regnamespace AND p.proname::text = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Guarda: auth.% tem % assinaturas (esperava 1).', r.nome, v_n;
    END IF;
    SELECT md5(pg_get_functiondef(p.oid))::text INTO v_txt
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'auth'::regnamespace AND p.proname::text = r.nome;
    IF v_txt IS DISTINCT FROM r.h THEN
      RAISE EXCEPTION 'Guarda: auth.% no remoto ja nao e a versao lida (md5 %, esperado %).',
        r.nome, v_txt, r.h;
    END IF;
  END LOOP;

  -- 0c. nomes novos ainda inexistentes, nenhuma funcao menciona a RPC, e os
  --     codigos NG030/NG031/NG032 por usar
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.prosrc LIKE '%neg_guardar_nif_pessoa%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: % funcoes ja mencionam neg_guardar_nif_pessoa.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname::text IN ('neg_guardar_nif_pessoa', 'fn_negocios_dono_para_pessoa');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ja existem % funcoes com os nomes novos.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_trigger t
  WHERE t.tgname::text = 'trg_negocios_dono_para_pessoa';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: o gatilho trg_negocios_dono_para_pessoa ja existe (% linhas).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND (p.prosrc LIKE '%NG030%' OR p.prosrc LIKE '%NG031%' OR p.prosrc LIKE '%NG032%');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: os codigos NG030/NG031/NG032 ja sao usados por % funcoes.', v_n;
  END IF;
  IF to_regclass('public.neg_nif_tentativas') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: a tabela public.neg_nif_tentativas ja existe.';
  END IF;

  -- 0d. colunas que se usam, com o tipo esperado
  FOR r IN
    SELECT x.tab, x.col, x.tipo FROM (VALUES
      ('anew_entities',    'nif_hash',        'text'),
      ('anew_entities',    'nif_encrypted',   'text'),
      ('anew_entities',    'nif_last3',       'text'),
      ('anew_entities',    'assigned_to',     'uuid'),
      ('anew_entities',    'organization_id', 'uuid'),
      ('anew_entities',    'deleted_at',      'timestamp with time zone'),
      ('negocios',         'assigned_to',     'uuid'),
      ('negocios',         'entity_id',       'uuid'),
      ('negocios',         'organization_id', 'uuid'),
      ('negocios',         'deleted_at',      'timestamp with time zone'),
      ('anew_memberships', 'role_is_client',  'boolean'),
      ('anew_memberships', 'status',          'text'),
      ('anew_memberships', 'user_id',         'uuid'),
      ('anew_memberships', 'organization_id', 'uuid'),
      ('anew_users',       'id',              'uuid'),
      ('anew_users',       'auth_user_id',    'uuid'),
      ('anew_users',       'deleted_at',      'timestamp with time zone')
    ) AS x(tab, col, tipo)
  LOOP
    SELECT c.data_type::text INTO v_txt
    FROM information_schema.columns c
    WHERE c.table_schema::text = 'public' AND c.table_name::text = r.tab
      AND c.column_name::text = r.col;
    IF v_txt IS DISTINCT FROM r.tipo THEN
      RAISE EXCEPTION 'Guarda: public.%.% e % (esperava %).', r.tab, r.col, COALESCE(v_txt, '(nao existe)'), r.tipo;
    END IF;
  END LOOP;

  -- 0e. o indice unico do NIF por organizacao e o esperado
  SELECT pg_get_indexdef(i.indexrelid)::text INTO v_txt
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
  WHERE c.relname::text = 'uq_anew_entities_org_nif_hash'
    AND c.relnamespace = 'public'::regnamespace;
  IF v_txt IS DISTINCT FROM 'CREATE UNIQUE INDEX uq_anew_entities_org_nif_hash ON public.anew_entities USING btree (organization_id, nif_hash) WHERE ((nif_hash IS NOT NULL) AND (deleted_at IS NULL))' THEN
    RAISE EXCEPTION 'Guarda: uq_anew_entities_org_nif_hash nao e o esperado: %.', COALESCE(v_txt, '(nao existe)');
  END IF;

  -- 0f. o CHECK dos ultimos 3 digitos
  SELECT pg_get_constraintdef(c.oid)::text INTO v_txt
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.anew_entities'::regclass
    AND c.conname::text = 'anew_entities_nif_last3_check';
  IF v_txt IS DISTINCT FROM 'CHECK (((nif_last3 IS NULL) OR (nif_last3 ~ ''^[0-9]{3}$''::text)))' THEN
    RAISE EXCEPTION 'Guarda: anew_entities_nif_last3_check nao e o esperado: %.', COALESCE(v_txt, '(nao existe)');
  END IF;

  -- 0g. a auditoria de anew_entities e o gatilho esperado (tgtype 29 = ROW +
  --     INSERT + DELETE + UPDATE, AFTER; lido na RH a 26/10)
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.anew_entities'::regclass AND NOT t.tgisinternal
    AND t.tgname::text = 'trg_audit_anew_entities'
    AND p.pronamespace = 'public'::regnamespace
    AND p.proname::text = 'fn_generic_entity_audit'
    AND t.tgtype::integer = 29
    AND t.tgenabled::text = 'O';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Guarda: trg_audit_anew_entities nao esta como esperado (% linhas).', v_n;
  END IF;

  -- 0h. nenhum gatilho de anew_entities escreve em negocios (sem recursao)
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.anew_entities'::regclass AND NOT t.tgisinternal
    AND p.prosrc ~* 'negocios';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: % gatilhos de anew_entities mencionam negocios (risco de recursao).', v_n;
  END IF;

  -- 0i. C so faz efeito se authenticated NAO tiver UPDATE ao nivel da tabela
  --     (um GRANT de tabela cobre todas as colunas e o REVOKE por coluna nao
  --     lhe tira nada). Nem authenticated nem PUBLIC.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_class c, LATERAL aclexplode(c.relacl) a
  WHERE c.oid = 'public.anew_entities'::regclass
    AND a.privilege_type::text = 'UPDATE'
    AND (a.grantee = 0 OR a.grantee = 'authenticated'::regrole::oid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: authenticated ou PUBLIC tem UPDATE de tabela em anew_entities (% entradas); o REVOKE por coluna nao chegaria.', v_n;
  END IF;
  -- e hoje pode actualizar as tres (o que C vai tirar)
  SELECT count(*) INTO v_n
  FROM unnest(ARRAY['nif_hash', 'nif_encrypted', 'nif_last3']) AS k(col)
  WHERE has_column_privilege('authenticated', 'public.anew_entities'::text, k.col, 'UPDATE');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: authenticated so actualiza % de 3 colunas nif_*; reler o estado antes de C.', v_n;
  END IF;
  -- guarda a lista actual de colunas actualizaveis por authenticated, para o
  -- conferir comparar depois. Ao nivel da SESSAO (is_local false), para
  -- sobreviver mesmo que o push nao embrulhe o ficheiro numa so transaccao;
  -- o conferir apaga-a no fim.
  SELECT string_agg(a.attname::text, ',' ORDER BY a.attname::text) INTO v_txt
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.anew_entities'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND has_column_privilege('authenticated', 'public.anew_entities'::text, a.attname::text, 'UPDATE');
  PERFORM set_config('olyvia.m600_upd_antes', COALESCE(v_txt, ''), false);
END
$guarda$;

-- -----------------------------------------------------------------------------
-- D. Contador de tentativas de gravar um NIF (por actor e minuto).
--    So a funcao DEFINER escreve aqui: RLS ligada, sem politicas, e sem
--    privilegios para anon, authenticated nem PUBLIC (service_role fica com o
--    que o default do schema lhe da). Nao guarda NIF nem hash.
-- -----------------------------------------------------------------------------
CREATE TABLE public.neg_nif_tentativas (
  actor  uuid        NOT NULL,
  janela timestamptz NOT NULL,
  n      integer     NOT NULL DEFAULT 1 CHECK (n > 0),
  PRIMARY KEY (actor, janela)
);
ALTER TABLE public.neg_nif_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.neg_nif_tentativas FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.neg_nif_tentativas IS
  'Limite de tentativas de neg_guardar_nif_pessoa: n gravacoes com NIF por actor (auth.users.id, posto pelo nif-write-proxy) em cada minuto. So a funcao escreve; as linhas com mais de uma hora apagam-se na chamada seguinte do mesmo actor. Nao guarda NIF nem hash.';

-- -----------------------------------------------------------------------------
-- A. neg_guardar_nif_pessoa
--    Chamada SO pelo nif-write-proxy, com service_role (EXECUTE so para
--    service_role). O proxy poe p_actor_auth_uid (auth.users.id do JWT que
--    validou), p_nif_hash e p_nif_encrypted; p_nif vazio ou NULL limpa o NIF
--    (e entao o hash e a cifra tem de vir NULL). Sem DEFAULTs: o proxy passa
--    sempre os seis.
--    Devolve {nif_ultimos3, mudou}; ou, na recusa por NIF repetido,
--    {erro: 'NG030'|'NG031', mensagem} (devolvido, nao lancado, para o
--    contador de D ficar gravado). NG032 (lancado): limite esgotado.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.neg_guardar_nif_pessoa(
  p_actor_auth_uid uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_nif text,
  p_nif_hash text,
  p_nif_encrypted text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_max_tentativas_minuto constant integer := 10;   -- gravacoes com NIF por actor e minuto
  v_uid      uuid;     -- o actor, depois de validado e assumido
  v_actor_id uuid;     -- anew_users.id do actor
  v_keys_pes text[];
  v_ent      public.anew_entities;
  v_nif      text;     -- normalizado como normalizeNif; nunca sai desta funcao
  v_aparado  text;     -- p_nif sem espacos nas pontas (o que o proxy cifra)
  v_limpar   boolean;
  v_last3    text;
  v_outra    uuid;     -- outra pessoa viva com o mesmo hash (nunca sai daqui)
  v_mudou    boolean := false;
  v_janela   timestamptz;
  v_tent     integer;
  v_res      jsonb;    -- resultado; devolvido no unico ponto de saida
  -- valores da sessao antes de assumir a identidade (repostos a saida)
  v_ant_sub      text;
  v_ant_role     text;
  v_ant_claims   text;
  v_ant_aud_user text;
  v_ant_aud_byp  text;
BEGIN
  -- 1. Valores. Mensagens fixas: nunca incluem o NIF.
  IF p_organization_id IS NULL OR p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Valor invalido: organizacao ou pessoa.' USING ERRCODE = 'NG009';
  END IF;

  v_aparado := regexp_replace(COALESCE(p_nif, ''), '^\s+|\s+$', '', 'g');
  v_nif     := upper(regexp_replace(v_aparado, '[\s.\-]', '', 'g'));
  v_limpar  := (v_nif = '');

  IF v_limpar THEN
    IF p_nif_hash IS NOT NULL OR p_nif_encrypted IS NOT NULL THEN
      RAISE EXCEPTION 'NIF invalido.' USING ERRCODE = 'NG009';
    END IF;
  ELSE
    -- NIF portugues: 9 digitos e digito de controlo certo (fn_nif_key)
    IF v_nif !~ '^[0-9]{9}$' THEN
      RAISE EXCEPTION 'NIF invalido: tem de ter 9 digitos.' USING ERRCODE = 'NG009';
    END IF;
    IF public.fn_nif_key(v_nif) IS DISTINCT FROM ('PT' || v_nif) THEN
      RAISE EXCEPTION 'NIF invalido: o digito de controlo nao confere.' USING ERRCODE = 'NG009';
    END IF;
    -- hash e cifra calculados pelo nif-write-proxy (HMAC-SHA256 em hex;
    -- base64 de iv[12] || cifra || tag[16])
    IF p_nif_hash IS NULL OR p_nif_hash !~ '^[0-9a-f]{64}$'
       OR p_nif_encrypted IS NULL OR p_nif_encrypted !~ '^[A-Za-z0-9+/]+={0,2}$'
       OR (length(p_nif_encrypted) % 4) <> 0 THEN
      RAISE EXCEPTION 'O NIF tem de ser gravado pelo servico de NIF.' USING ERRCODE = 'NG009';
    END IF;
    IF octet_length(decode(p_nif_encrypted, 'base64')) <> 28 + octet_length(v_aparado) THEN
      RAISE EXCEPTION 'O NIF tem de ser gravado pelo servico de NIF.' USING ERRCODE = 'NG009';
    END IF;
    v_last3 := right(v_nif, 3);
  END IF;

  -- 2. Quem chama: service_role SEM utilizador. Nao e uma barreira (os claims
  --    sao GUCs que qualquer papel pode por); a barreira e o EXECUTE so para
  --    service_role. Serve para recusar quem ja tem sessao de utilizador.
  IF auth.uid() IS NOT NULL OR auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Sem permissao para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. O actor: existe em anew_users (vivo) e e membro activo, nao cliente, da
  --    organizacao. A MESMA recusa generica em todos os casos.
  IF p_actor_auth_uid IS NOT NULL THEN
    SELECT au.id INTO v_actor_id FROM public.anew_users au
    WHERE au.auth_user_id = p_actor_auth_uid AND au.deleted_at IS NULL;
  END IF;
  IF v_actor_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.anew_memberships m
                    WHERE m.user_id = v_actor_id
                      AND m.organization_id = p_organization_id
                      AND m.status = 'active'
                      AND m.role_is_client IS NOT TRUE) THEN
    RAISE EXCEPTION 'Sem permissao para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 4. Assumir a identidade do actor, so nesta transaccao. Guardam-se antes os
  --    valores de quem chama, para os repor no ponto de saida. Neutraliza-se
  --    tambem app.audit_user_id e app.audit_bypass: a auditoria tem de
  --    registar o actor pela identidade assumida.
  v_ant_sub      := current_setting('request.jwt.claim.sub', true);
  v_ant_role     := current_setting('request.jwt.claim.role', true);
  v_ant_claims   := current_setting('request.jwt.claims', true);
  v_ant_aud_user := current_setting('app.audit_user_id', true);
  v_ant_aud_byp  := current_setting('app.audit_bypass', true);
  PERFORM set_config('request.jwt.claim.sub', p_actor_auth_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_actor_auth_uid::text, 'role', 'authenticated')::text,
                     true);
  PERFORM set_config('app.audit_user_id', '', true);
  PERFORM set_config('app.audit_bypass', '', true);
  -- guarda: as verificacoes seguintes leem auth.uid(); com uid nulo
  -- fn_neg_pessoa_no_ambito deixaria passar tudo
  IF auth.uid() IS DISTINCT FROM p_actor_auth_uid OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'neg_guardar_nif_pessoa: a identidade do actor nao ficou estabelecida.';
  END IF;
  v_uid := p_actor_auth_uid;

  <<corpo>>
  BEGIN
    -- 5. Organizacao do actor, com pessoas.view e com configuracao.
    v_keys_pes := public.crm_scope_keys('pessoas.view');
    IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
       OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
       OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                      WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
      RAISE EXCEPTION 'Organizacao sem a pagina Pessoas activa.' USING ERRCODE = 'NG008';
    END IF;
    PERFORM public.fn_neg_exigir_config(p_organization_id);

    -- 6. Pessoa: entidade viva desta organizacao, no ambito de leitura, e que
    --    nao e a ficha de uma organizacao do sistema.
    PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
    IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id) THEN
      RAISE EXCEPTION 'Pessoa indisponivel.' USING ERRCODE = 'NG003';
    END IF;

    -- 7. Editar: pessoas.edit na organizacao e ambito de edicao sobre a entidade.
    IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')
       OR NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
      RAISE EXCEPTION 'Sem permissao para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 7b. Nao muda os dados de uma entidade que aparece noutra organizacao (nem
    --     a ficha de um utilizador do sistema).
    IF public.fn_neg_entidade_partilhada(p_organization_id, p_entity_id) THEN
      RAISE EXCEPTION 'Pessoa indisponivel.' USING ERRCODE = 'NG003';
    END IF;

    -- 8. Bloqueio: uma alteracao de cada vez por pessoa (so viva).
    SELECT e.* INTO v_ent FROM public.anew_entities e
    WHERE e.id = p_entity_id AND e.organization_id = p_organization_id
      AND e.deleted_at IS NULL
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pessoa indisponivel.' USING ERRCODE = 'NG003';
    END IF;

    -- 9. Limpar (nao conta tentativa)
    IF v_limpar THEN
      IF v_ent.nif_hash IS NOT NULL OR v_ent.nif_encrypted IS NOT NULL
         OR v_ent.nif_last3 IS NOT NULL THEN
        UPDATE public.anew_entities e
        SET nif_hash      = NULL,
            nif_encrypted = NULL,
            nif_last3     = NULL,
            updated_at    = now()
        WHERE e.id = p_entity_id;
        v_mudou := true;
      END IF;
      v_res := jsonb_build_object('nif_ultimos3', NULL, 'mudou', v_mudou);
      EXIT corpo;
    END IF;

    -- 10. Limite de tentativas (D): conta TODAS as gravacoes com NIF, incluindo
    --     as recusas por repetido (que por isso se devolvem e nao se lancam).
    --     Limpeza so das janelas antigas do proprio actor (prefixo da chave
    --     primaria). UPSERT atomico: pedidos concorrentes do mesmo actor
    --     esperam pela linha. O NG032 desfaz so o incremento que passou o
    --     limite.
    v_janela := date_trunc('minute', now());
    DELETE FROM public.neg_nif_tentativas t
    WHERE t.actor = v_uid AND t.janela < v_janela - interval '1 hour';
    INSERT INTO public.neg_nif_tentativas AS t (actor, janela, n)
    VALUES (v_uid, v_janela, 1)
    ON CONFLICT (actor, janela) DO UPDATE SET n = t.n + 1
    RETURNING t.n INTO v_tent;
    IF v_tent > k_max_tentativas_minuto THEN
      RAISE EXCEPTION 'Demasiadas tentativas de gravar o NIF. Tente novamente dentro de um minuto.'
        USING ERRCODE = 'NG032';
    END IF;

    -- 11. Repetido noutra pessoa viva da organizacao. NG030 so se o actor ve
    --     a outra pessoa (ambito 'view'); senao NG031 generico. Devolvidos (nao
    --     lancados) para o contador de 10 ficar gravado.
    SELECT o.id INTO v_outra FROM public.anew_entities o
    WHERE o.organization_id = p_organization_id
      AND o.nif_hash = p_nif_hash
      AND o.deleted_at IS NULL
      AND o.id <> p_entity_id
    LIMIT 1;
    IF v_outra IS NOT NULL THEN
      IF public.fn_neg_pessoa_no_ambito(p_organization_id, v_outra, 'view') THEN
        v_res := jsonb_build_object('erro', 'NG030',
                                    'mensagem', 'Este NIF ja esta noutra pessoa da organizacao.');
      ELSE
        v_res := jsonb_build_object('erro', 'NG031', 'mensagem', 'Nao foi possivel gravar este NIF.');
      END IF;
      EXIT corpo;
    END IF;

    -- 12. So escreve se mudar (a cifra muda sempre por causa do IV aleatorio,
    --     por isso compara-se o hash e os ultimos 3 digitos).
    IF v_ent.nif_hash IS DISTINCT FROM p_nif_hash
       OR v_ent.nif_last3 IS DISTINCT FROM v_last3
       OR v_ent.nif_encrypted IS NULL THEN
      BEGIN
        UPDATE public.anew_entities e
        SET nif_hash      = p_nif_hash,
            nif_encrypted = p_nif_encrypted,
            nif_last3     = v_last3,
            updated_at    = now()
        WHERE e.id = p_entity_id;
        v_mudou := true;
      EXCEPTION WHEN unique_violation THEN
        -- corrida com outra gravacao do mesmo NIF: a mensagem do indice traria
        -- o hash no DETAIL; troca-se pela mensagem generica fixa. O bloco ja
        -- desfez o UPDATE; devolve-se (nao se lanca) para o contador ficar.
        v_res := jsonb_build_object('erro', 'NG031', 'mensagem', 'Nao foi possivel gravar este NIF.');
      END;
      IF v_res IS NOT NULL THEN
        EXIT corpo;
      END IF;
    END IF;

    v_res := jsonb_build_object('nif_ultimos3', v_last3, 'mudou', v_mudou);
  END corpo;

  -- 13. Ponto de saida unico: repor os valores de quem chama (o set_config
  --     local so seria desfeito no fim da transaccao; num erro, e desfeito
  --     pelo proprio ROLLBACK/subtransaccao).
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_ant_sub, ''), true);
  PERFORM set_config('request.jwt.claim.role', COALESCE(v_ant_role, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_ant_claims, ''), true);
  PERFORM set_config('app.audit_user_id', COALESCE(v_ant_aud_user, ''), true);
  PERFORM set_config('app.audit_bypass', COALESCE(v_ant_aud_byp, ''), true);
  RETURN v_res;
END;
$function$;

-- Os default privileges do schema public dariam EXECUTE a anon e
-- authenticated: revoga-se explicitamente. QUALQUER migration futura que
-- recrie ou altere esta funcao tem de repetir estas duas linhas e o 9b.
REVOKE ALL ON FUNCTION public.neg_guardar_nif_pessoa(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neg_guardar_nif_pessoa(uuid, uuid, uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.neg_guardar_nif_pessoa(uuid, uuid, uuid, text, text, text) IS
  'Pipeline: grava ou limpa o NIF da pessoa (anew_entities.nif_hash, nif_encrypted, nif_last3). So o nif-write-proxy a chama, com service_role (EXECUTE so para service_role), passando em p_actor_auth_uid o utilizador do JWT que validou; a funcao valida o actor (anew_users vivo, membership activa nao cliente) e corre as verificacoes de permissao e ambito com a identidade dele. Devolve {nif_ultimos3, mudou}, ou {erro, mensagem} na recusa: NG030 repetido numa pessoa que o actor ve, NG031 recusa generica (repetido fora do ambito ou corrida). Lanca NG009 invalido, 42501 sem permissao e NG032 limite de tentativas (neg_nif_tentativas, 10 por actor e minuto). Qualquer migration que a recrie tem de repetir o REVOKE a PUBLIC, anon e authenticated.';

-- -----------------------------------------------------------------------------
-- B. Dono da pessoa a partir do negocio
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.fn_negocios_dono_para_pessoa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_actor uuid;
BEGIN
  -- so negocios vivos com responsavel, e so quando o responsavel nasce ou muda
  IF NEW.assigned_to IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NULL;
  END IF;

  -- Tudo o resto num bloco protegido: este gatilho nunca faz falhar o negocio.
  BEGIN
    -- a pessoa ja tem dono (leitura sem bloqueio; a escrita volta a verificar)
    IF NOT EXISTS (SELECT 1 FROM public.anew_entities e
                   WHERE e.id = NEW.entity_id
                     AND e.organization_id = NEW.organization_id
                     AND e.assigned_to IS NULL
                     AND e.deleted_at IS NULL) THEN
      RETURN NULL;
    END IF;

    -- com sessao: quem escreve tem de poder editar a PESSOA e, se o responsavel
    -- nao for ele proprio, de poder atribuir (leads.assign). Senao nao atribui.
    IF v_uid IS NOT NULL THEN
      IF NOT COALESCE(public.fn_neg_pessoa_no_ambito(NEW.organization_id, NEW.entity_id, 'edit'), false) THEN
        RETURN NULL;
      END IF;
      v_actor := public.fn_negocios_actor();
      IF NEW.assigned_to IS DISTINCT FROM v_actor
         AND NOT COALESCE(public.fn_neg_tem_permissao_org(NEW.organization_id, 'leads.assign'), false) THEN
        RETURN NULL;
      END IF;
    END IF;

    -- o responsavel e membro activo, nao cliente, da organizacao do negocio
    IF NOT EXISTS (SELECT 1 FROM public.anew_memberships m
                   WHERE m.user_id = NEW.assigned_to
                     AND m.organization_id = NEW.organization_id
                     AND m.status = 'active'
                     AND m.role_is_client IS NOT TRUE) THEN
      RETURN NULL;
    END IF;

    -- nao mexe na ficha de uma organizacao do sistema nem numa entidade
    -- partilhada com outra organizacao (inclui ficha de utilizador)
    IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = NEW.entity_id)
       OR public.fn_neg_entidade_partilhada(NEW.organization_id, NEW.entity_id) THEN
      RETURN NULL;
    END IF;

    -- bloqueio curto: se a pessoa estiver bloqueada por outra transaccao, nao
    -- espera e nao atribui
    PERFORM 1 FROM public.anew_entities e
    WHERE e.id = NEW.entity_id
      AND e.organization_id = NEW.organization_id
      AND e.assigned_to IS NULL
      AND e.deleted_at IS NULL
    FOR NO KEY UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    UPDATE public.anew_entities e
    SET assigned_to = NEW.assigned_to,
        updated_at  = now()
    WHERE e.id = NEW.entity_id
      AND e.organization_id = NEW.organization_id
      AND e.assigned_to IS NULL;
  EXCEPTION WHEN OTHERS THEN
    -- desfaz so a atribuicao; o negocio segue. Sem dados da pessoa na mensagem.
    RAISE WARNING 'fn_negocios_dono_para_pessoa: a pessoa nao foi atribuida (SQLSTATE %).', SQLSTATE;
  END;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_negocios_dono_para_pessoa() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_negocios_dono_para_pessoa() TO service_role;

CREATE TRIGGER trg_negocios_dono_para_pessoa
  AFTER INSERT OR UPDATE OF assigned_to ON public.negocios
  FOR EACH ROW
  WHEN (NEW.assigned_to IS NOT NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.fn_negocios_dono_para_pessoa();

COMMENT ON FUNCTION public.fn_negocios_dono_para_pessoa() IS
  'Gatilho de negocios: quando o negocio ganha responsavel e a pessoa (mesma organizacao, viva, nao partilhada) nao tem dono, a pessoa fica com esse responsavel. Com sessao, so se quem escreve tiver ambito edit sobre a pessoa e, para outro responsavel, leads.assign. Nunca troca nem apaga um dono e nunca faz falhar o negocio.';

-- -----------------------------------------------------------------------------
-- C. O NIF so se escreve pelas funcoes DEFINER: authenticated perde o UPDATE
--    por coluna em nif_hash, nif_encrypted e nif_last3. Mantem o SELECT de
--    nif_last3 (neg_ficha_pessoa e INVOKER e le-o).
-- -----------------------------------------------------------------------------
REVOKE UPDATE (nif_hash, nif_encrypted, nif_last3) ON public.anew_entities FROM authenticated, anon, PUBLIC;

-- -----------------------------------------------------------------------------
-- 9. Conferir (falha a migration se o resultado nao for o esperado)
-- -----------------------------------------------------------------------------
DO $conferir$
DECLARE
  v_n     bigint;
  v_txt   text;
  v_antes text;
  v_esper text;
  r       record;
BEGIN
  -- 9a. um so nome, DEFINER, search_path fixo
  FOR r IN
    SELECT x.nome FROM (VALUES ('neg_guardar_nif_pessoa'), ('fn_negocios_dono_para_pessoa')) AS x(nome)
  LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: public.% tem % assinaturas (esperava 1).', r.nome, v_n;
    END IF;
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome
      AND p.prosecdef
      AND array_to_string(p.proconfig, ';')::text = 'search_path=public, pg_temp';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: public.% nao e SECURITY DEFINER com search_path public, pg_temp.', r.nome;
    END IF;
  END LOOP;

  SELECT pg_get_function_identity_arguments(p.oid)::text INTO v_txt
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_nif_pessoa';
  IF v_txt IS DISTINCT FROM 'p_actor_auth_uid uuid, p_organization_id uuid, p_entity_id uuid, p_nif text, p_nif_hash text, p_nif_encrypted text' THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_nif_pessoa tem outra assinatura: %.', v_txt;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_nif_pessoa'
    AND p.pronargdefaults = 0;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_nif_pessoa tem parametros com DEFAULT.';
  END IF;

  -- 9b. EXECUTE de neg_guardar_nif_pessoa: SO service_role e o dono. ACL
  --     explicita (nao nula: nula seria o default, com PUBLIC); por aclexplode
  --     o conjunto de quem tem EXECUTE e exactamente {service_role, dono};
  --     e has_function_privilege confirma anon e authenticated SEM e
  --     service_role COM. Repetir em qualquer migration que toque na funcao.
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_nif_pessoa'
    AND p.proacl IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_nif_pessoa ficou com a ACL por omissao (PUBLIC executa).';
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_nif_pessoa'
    AND a.privilege_type::text = 'EXECUTE'
    AND a.grantee <> 'service_role'::regrole::oid
    AND a.grantee <> p.proowner;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_nif_pessoa executavel por alguem alem de service_role e do dono (% entradas).', v_n;
  END IF;
  SELECT count(DISTINCT a.grantee) INTO v_n
  FROM pg_catalog.pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_nif_pessoa'
    AND a.privilege_type::text = 'EXECUTE'
    AND (a.grantee = 'service_role'::regrole::oid OR a.grantee = p.proowner);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_nif_pessoa sem EXECUTE para service_role e para o dono (% de 2).', v_n;
  END IF;
  IF has_function_privilege('anon', 'public.neg_guardar_nif_pessoa(uuid, uuid, uuid, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.neg_guardar_nif_pessoa(uuid, uuid, uuid, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: anon ou authenticated executa neg_guardar_nif_pessoa.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.neg_guardar_nif_pessoa(uuid, uuid, uuid, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: service_role nao executa neg_guardar_nif_pessoa (o proxy deixava de gravar).';
  END IF;

  -- 9b2. nenhuma outra funcao chama neg_guardar_nif_pessoa (uma DEFINER do
  --      mesmo dono passaria por cima do EXECUTE e escolheria o actor)
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.prosrc LIKE '%neg_guardar_nif_pessoa%'
    AND NOT (p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_nif_pessoa');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % outras funcoes mencionam neg_guardar_nif_pessoa.', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_negocios_dono_para_pessoa'
    AND a.privilege_type::text = 'EXECUTE'
    AND (a.grantee = 0 OR a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: fn_negocios_dono_para_pessoa executavel por PUBLIC, anon ou authenticated (% entradas).', v_n;
  END IF;

  -- 9c. o gatilho existe, activo, e e o esperado (pelo catalogo): tgtype 21 =
  --     ROW + INSERT + UPDATE, AFTER; UPDATE OF so assigned_to; com WHEN.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.negocios'::regclass
    AND t.tgname::text = 'trg_negocios_dono_para_pessoa'
    AND p.pronamespace = 'public'::regnamespace
    AND p.proname::text = 'fn_negocios_dono_para_pessoa'
    AND t.tgtype::integer = 21
    AND t.tgenabled::text = 'O'
    AND NOT t.tgisinternal
    AND NOT t.tgdeferrable
    AND t.tgqual IS NOT NULL
    -- tgattr (int2vector) tem indice inicial 0: compara-se como texto, que
    -- nao depende do indice inicial (compara-lo com ARRAY[...] da sempre falso)
    AND array_to_string(t.tgattr::int2[], ',') =
        (SELECT a.attnum::text FROM pg_catalog.pg_attribute a
         WHERE a.attrelid = 'public.negocios'::regclass
           AND a.attname::text = 'assigned_to'
           AND NOT a.attisdropped);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: trg_negocios_dono_para_pessoa nao esta como esperado (% linhas).', v_n;
  END IF;

  -- 9d. as funcoes de referencia, e TODAS as do caminho da identidade
  --     assumida (auth.uid, auth.role e os helpers), nao mudaram com esta
  --     migration
  FOR r IN
    SELECT x.esq, x.nome, x.h FROM (VALUES
      ('public', 'neg_guardar_contacto_pessoa',   'f21badc29bebc0b294508f7c40dc0ff2'),
      ('public', 'neg_guardar_origem_pessoa',     '2cc2e4e5563897496a8abba7293ae523'),
      ('public', 'fn_neg_entidade_partilhada',    '697dbf5d3969cf27dfa07280194ac52d'),
      ('public', 'fn_generic_entity_audit',       'd94654a5f57f1eb6e8b8fa6902b50533'),
      ('public', 'fn_negocios_guardar_alteracao', '5995a31b68f65202c9e1ddc6fe17f913'),
      ('public', 'neg_atribuir_pessoa',           '87fc2a837ad5e35da7d813542613f55b'),
      ('public', 'fn_nif_key',                    '9d573e3b8385c08bf8dd84c9ab2cb362'),
      ('public', 'fn_neg_exigir_pessoa',          '6442d6f7782f82fa76b6908d1487cf79'),
      ('public', 'fn_neg_pessoa_no_ambito',       'c7a7be70424773fad627a460dd0e7030'),
      ('public', 'fn_neg_tem_permissao_org',      '05943a6cfb0382a07322870262170c8d'),
      ('public', 'fn_neg_exigir_config',          '566f127b4f3cea295f04c916e366cd5d'),
      ('public', 'fn_negocios_actor',             '26296535afef27c393ab0c932995e3cb'),
      ('public', 'crm_scope_keys',                '7c0abecd98b5e212ebcac05ca5985d18'),
      ('public', 'has_anew_permission',           '8f69ed134c7d20e080d8c5a4161a3151'),
      ('public', 'get_user_crm_org_ids',          '29782031244dd3b0842ca43b271e2bf1'),
      ('public', 'resolve_lead_access_context',   '52cdb3e4bf1f3fa927270e178d9a2fe6'),
      ('public', 'fn_neg_pessoa_por_negocio',     'fb6fc66605bd2ff923d9f60fa8ae7e8a'),
      ('public', 'current_business_user_id',      '7e60101f074e4ff526559140be6618bb'),
      ('auth',   'uid',                           'ea3b41bf29e2ad573067939329aa088e'),
      ('auth',   'role',                          '8a3e05459e07e0633d43c6fba2a2cdf4')
    ) AS x(esq, nome, h)
  LOOP
    SELECT md5(pg_get_functiondef(p.oid))::text INTO v_txt
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = r.esq::regnamespace AND p.proname::text = r.nome;
    IF v_txt IS DISTINCT FROM r.h THEN
      RAISE EXCEPTION 'Conferir: %.% mudou (md5 %, esperado %).', r.esq, r.nome, v_txt, r.h;
    END IF;
  END LOOP;

  -- 9e. C: as tres colunas deixaram de ser actualizaveis por authenticated,
  --     continua sem UPDATE de tabela, nif_last3 continua legivel, e a lista
  --     de colunas actualizaveis e exactamente a de antes menos as tres.
  SELECT count(*) INTO v_n
  FROM unnest(ARRAY['nif_hash', 'nif_encrypted', 'nif_last3']) AS k(col)
  WHERE has_column_privilege('authenticated', 'public.anew_entities'::text, k.col, 'UPDATE')
     OR has_column_privilege('anon', 'public.anew_entities'::text, k.col, 'UPDATE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: authenticated ou anon ainda actualiza % colunas nif_*.', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_class c, LATERAL aclexplode(c.relacl) a
  WHERE c.oid = 'public.anew_entities'::regclass
    AND a.privilege_type::text = 'UPDATE'
    AND (a.grantee = 0 OR a.grantee = 'authenticated'::regrole::oid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: apareceu UPDATE de tabela em anew_entities (% entradas).', v_n;
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.anew_entities'::text, 'nif_last3'::text, 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: authenticated deixou de ler nif_last3 (partia neg_ficha_pessoa).';
  END IF;

  v_antes := current_setting('olyvia.m600_upd_antes', true);
  IF v_antes IS NULL OR v_antes = '' THEN
    RAISE EXCEPTION 'Conferir: perdeu-se a lista de colunas guardada pela guarda.';
  END IF;
  SELECT COALESCE(string_agg(k.col, ',' ORDER BY k.col), '') INTO v_esper
  FROM unnest(string_to_array(v_antes, ',')) AS k(col)
  WHERE k.col NOT IN ('nif_hash', 'nif_encrypted', 'nif_last3');
  SELECT COALESCE(string_agg(a.attname::text, ',' ORDER BY a.attname::text), '') INTO v_txt
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.anew_entities'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND has_column_privilege('authenticated', 'public.anew_entities'::text, a.attname::text, 'UPDATE');
  IF v_txt IS DISTINCT FROM v_esper THEN
    RAISE EXCEPTION 'Conferir: as colunas actualizaveis por authenticated nao sao as de antes menos as tres (antes %, agora %).', v_antes, v_txt;
  END IF;
  PERFORM set_config('olyvia.m600_upd_antes', '', false);

  -- 9f. D: o contador tem RLS ligada, nenhuma politica e nenhum privilegio
  --     para PUBLIC, anon ou authenticated (so a funcao DEFINER lhe mexe).
  SELECT count(*) INTO v_n FROM pg_catalog.pg_class c
  WHERE c.oid = 'public.neg_nif_tentativas'::regclass AND c.relrowsecurity;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: neg_nif_tentativas sem RLS ligada.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_policy p
  WHERE p.polrelid = 'public.neg_nif_tentativas'::regclass;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: neg_nif_tentativas tem % politicas (esperava 0).', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_class c, LATERAL aclexplode(c.relacl) a
  WHERE c.oid = 'public.neg_nif_tentativas'::regclass
    AND (a.grantee = 0 OR a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: neg_nif_tentativas tem % privilegios para PUBLIC, anon ou authenticated.', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.neg_nif_tentativas'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND (has_column_privilege('authenticated', 'public.neg_nif_tentativas'::text, a.attname::text, 'SELECT')
         OR has_column_privilege('authenticated', 'public.neg_nif_tentativas'::text, a.attname::text, 'INSERT')
         OR has_column_privilege('authenticated', 'public.neg_nif_tentativas'::text, a.attname::text, 'UPDATE'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: authenticated tem acesso a % colunas de neg_nif_tentativas.', v_n;
  END IF;
  -- colunas exactamente actor, janela, n (nada de NIF nem hash) e chave
  -- primaria (actor, janela), que serve a limpeza por actor
  SELECT string_agg(a.attname::text, ',' ORDER BY a.attnum) INTO v_txt
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.neg_nif_tentativas'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_txt IS DISTINCT FROM 'actor,janela,n' THEN
    RAISE EXCEPTION 'Conferir: neg_nif_tentativas tem as colunas % (esperava actor,janela,n).', v_txt;
  END IF;
  SELECT pg_get_constraintdef(c.oid)::text INTO v_txt
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.neg_nif_tentativas'::regclass AND c.contype::text = 'p';
  IF v_txt IS DISTINCT FROM 'PRIMARY KEY (actor, janela)' THEN
    RAISE EXCEPTION 'Conferir: a chave primaria de neg_nif_tentativas e % (esperava PRIMARY KEY (actor, janela)).', COALESCE(v_txt, '(nenhuma)');
  END IF;
END
$conferir$;
