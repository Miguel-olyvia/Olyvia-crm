-- =============================================================================
-- 20261231300000_nif_e_dono_da_pessoa.sql  (base RH)  -- RASCUNHO, NAO APLICAR
--
-- Duas coisas decididas pelo utilizador para o Pipeline (comGuia):
--   A. neg_guardar_nif_pessoa: gravar (ou limpar) o NIF da pessoa.
--   B. Gatilho em negocios: quando um negocio ganha responsavel e a pessoa
--      ainda nao tem dono, a pessoa fica com o mesmo responsavel.
--
-- SO RH (uetjghdkwbywbftedtth). Nao toca na Mudelar nem na base principal.
--
-- ATENCAO: A PARTE A SO FUNCIONA ATRAVES DA EDGE FUNCTION nif-write-proxy.
--   O NIF guarda-se como no resto do sistema: hash HMAC-SHA256 (segredo
--   NIF_HMAC_KEY) e cifra AES-256-GCM (segredo NIF_ENC_KEY), calculados pela
--   Edge Function, mais os ultimos 3 digitos. Os segredos so existem nas Edge
--   Functions (Deno.env); o SQL nao consegue calcular o hash. Por isso a
--   assinatura nao e so (organizacao, pessoa, nif): leva tambem p_nif_hash,
--   p_nif_encrypted e p_nif_tokens, que e exactamente o que o nif-write-proxy
--   acrescenta (e descarta se vierem do cliente). Entra junto com:
--     * supabase/functions/nif-write-proxy/handler.ts: 'neg_guardar_nif_pessoa'
--       em ALLOWED_RPCS (e testes do proxy); publicar a Edge Function na RH;
--     * o frontend do Pipeline chama o proxy com
--       {rpc:'neg_guardar_nif_pessoa', nif, params:{p_organization_id,
--        p_entity_id, p_nif}} e trata NG009 / NG030 / NG031;
--     * src/integrations/supabase/types.ts.
--   Sem o proxy, uma chamada directa com NIF preenchido falha sempre (NG009:
--   faltam o hash e a cifra), por isso aplicar a migration sozinha nao parte
--   nada, so nao serve para nada.
--
-- Onde fica o NIF (lido na RH a 26/10, so catalogo e contagens):
--   * anew_entities tem nif_hash, nif_encrypted, nif_last3 (CHECK 3 digitos) e o
--     indice unico uq_anew_entities_org_nif_hash (organization_id, nif_hash)
--     WHERE nif_hash IS NOT NULL AND deleted_at IS NULL. Hoje 0 linhas com NIF.
--   * fiscal_entities (com a coluna nif EM CLARO, NOT NULL) esta vazia (0
--     linhas) e e o modelo antigo (rpc_update_client). NAO se usa aqui, para nao
--     escrever o NIF em claro numa tabela.
--   * fn_generic_entity_audit (gatilho de auditoria de anew_entities) ja retira
--     nif_hash, nif_encrypted e billing_nif_encrypted do registo; nif_last3
--     fica no registo (e legivel por authenticated, como na tabela).
--
-- LIMITE CONHECIDO (A): neg_ficha_pessoa continua a devolver nif NULL e
--   tem_nif a partir de anew_entity_fiscal_entities (modelo antigo). Depois de
--   gravar, a ficha NAO mostra o NIF nem tem_nif = true ate neg_ficha_pessoa
--   passar a ler anew_entities.nif_last3. Isso fica para outra migration (nao
--   esta no ambito desta).
-- LIMITE CONHECIDO (A): authenticated continua com GRANT UPDATE por coluna em
--   anew_entities.nif_hash/nif_encrypted/nif_last3 (20261228200000). A RLS de
--   UPDATE de anew_entities e a que manda nessa via directa. Nao muda aqui.
-- LIMITE CONHECIDO (A): como nas rpc_* do proxy, quem chamar a RPC directamente
--   (sem o proxy) pode mandar um hash/cifra que nao corresponde ao NIF. A
--   funcao valida a forma (hex de 64, base64 com o tamanho certo para o NIF
--   dado), nao a correspondencia: isso so o segredo prova.
-- A. NIF repetido (revisao 26/10, enumeracao): NG030 "ja esta noutra pessoa"
--   so se a outra pessoa estiver no ambito 'view' de quem chama
--   (fn_neg_pessoa_no_ambito). Senao, e na corrida com o indice unico (em que
--   nao se sabe de quem e), NG031 com uma mensagem fixa e generica: "Nao foi
--   possivel gravar este NIF.". O NG031 continua a dizer que a gravacao falhou
--   por causa do NIF (a unicidade por organizacao torna isso inevitavel); o que
--   deixa de dizer e que o NIF esta numa pessoa que quem chama nao ve.
--
-- B. Decisoes no gatilho:
--   * so preenche um dono nulo; nunca troca nem apaga um dono existente;
--   * so se o negocio esta vivo e a pessoa e viva, da MESMA organizacao, nao e
--     ficha de organizacao, nao e partilhada (fn_neg_entidade_partilhada, a
--     guarda 5b, que inclui a ficha de utilizador);
--   * o responsavel tem de ser membro activo e nao cliente (como
--     neg_atribuir_pessoa); se nao for, nao faz nada (nao falha o negocio);
--   * com sessao (auth.uid() nao nulo; revisao 26/10, HIGH): so atribui se quem
--     escreve no negocio tiver ambito 'edit' sobre a PESSOA
--     (fn_neg_pessoa_no_ambito) e, se o responsavel nao for ele proprio
--     (fn_negocios_actor), se tiver leads.assign na organizacao
--     (fn_neg_tem_permissao_org). Sem isto, quem tem pessoas.create criava um
--     negocio sobre uma pessoa sem dono fora do seu ambito e ficava dono dela.
--     Quando nao cumpre, NAO atribui e NAO falha: criar ou alterar um negocio
--     nunca falha por causa deste gatilho;
--   * sem sessao (formularios, service_role, gatilhos do sistema): como antes,
--     sem estas duas verificacoes;
--   * nao chama fn_owner_sync_apply: as visitas e outras pecas da pessoa NAO
--     sao reatribuidas; so anew_entities.assigned_to;
--   * bloqueio curto: FOR NO KEY UPDATE SKIP LOCKED. Se a pessoa estiver a ser
--     alterada noutra transaccao naquele instante, o gatilho NAO espera e NAO
--     atribui (evita esperas e deadlocks negocio<->pessoa). Na mesma transaccao
--     (ex.: neg_atribuir_pessoa) o bloqueio proprio nao conta.
--   * sem recursao: nenhum gatilho de anew_entities escreve em negocios.
--   * sem backfill: na RH ha 0 negocios (lido a 26/10).
--
-- RISCOS CONHECIDOS, ACEITES (revisao 26/10):
--   * SKIP LOCKED pode perder uma atribuicao: se a pessoa estiver bloqueada
--     noutra transaccao no instante do gatilho, a pessoa fica sem dono e nao ha
--     retentativa. Fica para a atribuicao manual (neg_atribuir_pessoa).
--   * authenticated continua com GRANT UPDATE por coluna em
--     anew_entities.nif_hash, nif_encrypted e nif_last3 (20261228200000); a RLS
--     de UPDATE de anew_entities e a unica guarda dessa via directa.
--
-- Corpos de referencia lidos de pg_get_functiondef no remoto RH a 26/10; as
-- guardas conferem o md5 de cada um.
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
                                'fn_negocios_actor']
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
      -- padrao copiado (sessao, organizacao, permissoes, ambito, 5b, bloqueio)
      ('neg_guardar_contacto_pessoa',   'f21badc29bebc0b294508f7c40dc0ff2'),
      ('neg_guardar_origem_pessoa',     '2cc2e4e5563897496a8abba7293ae523'),
      -- a guarda 5b numa funcao (so a chamam funcoes DEFINER)
      ('fn_neg_entidade_partilhada',    '697dbf5d3969cf27dfa07280194ac52d'),
      -- validacao do NIF portugues (digito de controlo)
      ('fn_nif_key',                    '9d573e3b8385c08bf8dd84c9ab2cb362'),
      ('fn_neg_exigir_pessoa',          '6442d6f7782f82fa76b6908d1487cf79'),
      ('fn_neg_pessoa_no_ambito',       'c7a7be70424773fad627a460dd0e7030'),
      ('fn_neg_tem_permissao_org',      '05943a6cfb0382a07322870262170c8d'),
      ('fn_neg_exigir_config',          '566f127b4f3cea295f04c916e366cd5d'),
      -- a auditoria retira nif_hash e nif_encrypted do registo
      ('fn_generic_entity_audit',       'd94654a5f57f1eb6e8b8fa6902b50533'),
      -- o gatilho B depende das regras de negocios e de neg_atribuir_pessoa
      ('fn_negocios_guardar_alteracao', '5995a31b68f65202c9e1ddc6fe17f913'),
      ('neg_atribuir_pessoa',           '87fc2a837ad5e35da7d813542613f55b'),
      ('auto_assign_creator',           '29958e2be188efa75ae9a902448fb5bb'),
      -- o gatilho B compara o responsavel com quem escreve (anew_users.id)
      ('fn_negocios_actor',             '26296535afef27c393ab0c932995e3cb')
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

  -- 0c. nomes novos ainda inexistentes
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
  -- os codigos de erro novos NG030 e NG031 ainda nao sao usados por nenhuma funcao
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%NG030%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: o codigo NG030 ja e usado por % funcoes.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%NG031%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: o codigo NG031 ja e usado por % funcoes.', v_n;
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
      ('anew_memberships', 'status',          'text')
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

  -- 0g. a auditoria de anew_entities e o gatilho esperado (retira os segredos).
  --     Compara pelo catalogo (oid da funcao em public, tgtype, tgenabled), sem
  --     texto que dependa do search_path. tgtype 29 = ROW + INSERT + DELETE +
  --     UPDATE, AFTER (lido na RH a 26/10).
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
END
$guarda$;

-- -----------------------------------------------------------------------------
-- A. neg_guardar_nif_pessoa
--    Chamada SO pelo nif-write-proxy (que acrescenta p_nif_hash, p_nif_encrypted
--    e p_nif_tokens). p_nif vazio ou NULL limpa o NIF (e entao o hash e a cifra
--    tem de vir NULL, que e o que o proxy faz com um NIF em branco).
--    p_nif_tokens aceita-se para o proxy poder chamar a funcao e ignora-se:
--    anew_entities nao tem tabela de trigramas.
--    Devolve so {nif_ultimos3, mudou}. O NIF nunca entra numa mensagem de
--    erro, num RAISE, num log nem na auditoria.
--    Estrutura de seguranca copiada de neg_guardar_origem_pessoa (viva): sessao,
--    organizacao com pessoas.view, configuracao, pessoa viva no ambito,
--    pessoas.edit e ambito 'edit', guarda 5b (fn_neg_entidade_partilhada) e
--    bloqueio da entidade.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.neg_guardar_nif_pessoa(
  p_organization_id uuid,
  p_entity_id uuid,
  p_nif text,
  p_nif_hash text DEFAULT NULL::text,
  p_nif_encrypted text DEFAULT NULL::text,
  p_nif_tokens text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_keys_pes text[];
  v_ent      public.anew_entities;
  v_nif      text;     -- normalizado como normalizeNif; nunca sai desta funcao
  v_aparado  text;     -- p_nif sem espacos nas pontas (o que o proxy cifra)
  v_limpar   boolean;
  v_last3    text;
  v_outra    uuid;     -- outra pessoa viva com o mesmo hash (nunca sai daqui)
  v_mudou    boolean := false;
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

  -- 2. Sessao
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organizacao do utilizador, com pessoas.view e com configuracao.
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organizacao sem a pagina Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 4. Pessoa: entidade viva desta organizacao, no ambito de leitura, e que
  --    nao e a ficha de uma organizacao do sistema.
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id) THEN
    RAISE EXCEPTION 'Pessoa indisponivel.' USING ERRCODE = 'NG003';
  END IF;

  -- 5. Editar: pessoas.edit na organizacao e ambito de edicao sobre a entidade.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')
     OR NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissao para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5b. Nao muda os dados de uma entidade que aparece noutra organizacao (nem a
  --     ficha de um utilizador do sistema): a mesma guarda das neg_guardar_*.
  IF public.fn_neg_entidade_partilhada(p_organization_id, p_entity_id) THEN
    RAISE EXCEPTION 'Pessoa indisponivel.' USING ERRCODE = 'NG003';
  END IF;

  -- 6. Bloqueio: uma alteracao de cada vez por pessoa (so viva).
  SELECT e.* INTO v_ent FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id
    AND e.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponivel.' USING ERRCODE = 'NG003';
  END IF;

  -- 7. Limpar
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
    RETURN jsonb_build_object('nif_ultimos3', NULL, 'mudou', v_mudou);
  END IF;

  -- 8. Repetido noutra pessoa viva da organizacao (o indice unico ignora as
  --    apagadas, soft delete). Mensagens fixas, sem o NIF nem o hash.
  --    NG030 so se quem chama ve a outra pessoa (ambito 'view'); senao NG031
  --    generico, para nao revelar que o NIF esta numa pessoa que nao ve.
  SELECT o.id INTO v_outra FROM public.anew_entities o
  WHERE o.organization_id = p_organization_id
    AND o.nif_hash = p_nif_hash
    AND o.deleted_at IS NULL
    AND o.id <> p_entity_id
  LIMIT 1;
  IF v_outra IS NOT NULL THEN
    IF public.fn_neg_pessoa_no_ambito(p_organization_id, v_outra, 'view') THEN
      RAISE EXCEPTION 'Este NIF ja esta noutra pessoa da organizacao.' USING ERRCODE = 'NG030';
    END IF;
    RAISE EXCEPTION 'Nao foi possivel gravar este NIF.' USING ERRCODE = 'NG031';
  END IF;

  -- 9. So escreve se mudar (a cifra muda sempre por causa do IV aleatorio, por
  --    isso compara-se o hash e os ultimos 3 digitos).
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
    EXCEPTION WHEN unique_violation THEN
      -- corrida com outra gravacao do mesmo NIF: a mensagem do indice traria o
      -- hash no DETAIL, e a outra pessoa ainda nao e visivel (nao se sabe se
      -- quem chama a ve); troca-se pela mensagem generica fixa.
      RAISE EXCEPTION 'Nao foi possivel gravar este NIF.' USING ERRCODE = 'NG031';
    END;
    v_mudou := true;
  END IF;

  RETURN jsonb_build_object('nif_ultimos3', v_last3, 'mudou', v_mudou);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_nif_pessoa(uuid, uuid, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_guardar_nif_pessoa(uuid, uuid, text, text, text, text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.neg_guardar_nif_pessoa(uuid, uuid, text, text, text, text[]) IS
  'Pipeline: grava ou limpa o NIF da pessoa (anew_entities.nif_hash, nif_encrypted, nif_last3). So via nif-write-proxy. Devolve {nif_ultimos3, mudou}. NG009 invalido, NG030 repetido numa pessoa que quem chama ve, NG031 recusa generica (repetido fora do ambito ou corrida).';

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

  -- a pessoa ja tem dono (leitura sem bloqueio; a escrita volta a verificar)
  IF NOT EXISTS (SELECT 1 FROM public.anew_entities e
                 WHERE e.id = NEW.entity_id
                   AND e.organization_id = NEW.organization_id
                   AND e.assigned_to IS NULL
                   AND e.deleted_at IS NULL) THEN
    RETURN NULL;
  END IF;

  -- com sessao: quem escreve no negocio tem de poder editar a PESSOA e, se o
  -- responsavel nao for ele proprio, de poder atribuir (leads.assign). Se nao
  -- puder, nao atribui e nao falha. Sem sessao (formularios, service_role)
  -- segue como antes.
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
  -- partilhada com outra organizacao (guarda 5b, inclui ficha de utilizador)
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
-- 9. Conferir (falha a migration se o resultado nao for o esperado)
-- -----------------------------------------------------------------------------
DO $conferir$
DECLARE
  v_n   bigint;
  v_txt text;
  r     record;
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
  IF v_txt IS DISTINCT FROM 'p_organization_id uuid, p_entity_id uuid, p_nif text, p_nif_hash text, p_nif_encrypted text, p_nif_tokens text[]' THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_nif_pessoa tem outra assinatura: %.', v_txt;
  END IF;

  -- 9b. ACL por proacl: a RPC so para authenticated e service_role (sem PUBLIC
  --     nem anon); a funcao do gatilho sem PUBLIC, anon nem authenticated.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_nif_pessoa'
    AND a.privilege_type::text = 'EXECUTE'
    AND (a.grantee = 0 OR a.grantee = 'anon'::regrole::oid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_nif_pessoa executavel por PUBLIC ou anon (% entradas).', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_guardar_nif_pessoa'
    AND a.privilege_type::text = 'EXECUTE'
    AND a.grantee IN ('authenticated'::regrole::oid, 'service_role'::regrole::oid);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: neg_guardar_nif_pessoa sem EXECUTE para authenticated e service_role (% de 2).', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_negocios_dono_para_pessoa'
    AND a.privilege_type::text = 'EXECUTE'
    AND (a.grantee = 0 OR a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: fn_negocios_dono_para_pessoa executavel por PUBLIC, anon ou authenticated (% entradas).', v_n;
  END IF;

  -- 9c. o gatilho existe, activo, e e o esperado. Pelo catalogo, sem texto de
  --     pg_get_triggerdef (que depende do search_path): a funcao e a de public,
  --     tgtype 21 = ROW + INSERT + UPDATE, AFTER; UPDATE OF so assigned_to;
  --     com WHEN (tgqual); nao interno, nao adiavel. A propria funcao repete as
  --     condicoes do WHEN, por isso o WHEN e so um atalho.
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
    AND t.tgattr::int2[] = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a
                                  WHERE a.attrelid = 'public.negocios'::regclass
                                    AND a.attname::text = 'assigned_to'
                                    AND NOT a.attisdropped)]::int2[];
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: trg_negocios_dono_para_pessoa nao esta como esperado (% linhas).', v_n;
  END IF;

  -- 9d. as funcoes de referencia nao mudaram com esta migration
  FOR r IN
    SELECT x.nome, x.h FROM (VALUES
      ('neg_guardar_contacto_pessoa',   'f21badc29bebc0b294508f7c40dc0ff2'),
      ('neg_guardar_origem_pessoa',     '2cc2e4e5563897496a8abba7293ae523'),
      ('fn_neg_entidade_partilhada',    '697dbf5d3969cf27dfa07280194ac52d'),
      ('fn_generic_entity_audit',       'd94654a5f57f1eb6e8b8fa6902b50533'),
      ('fn_negocios_guardar_alteracao', '5995a31b68f65202c9e1ddc6fe17f913'),
      ('neg_atribuir_pessoa',           '87fc2a837ad5e35da7d813542613f55b')
    ) AS x(nome, h)
  LOOP
    SELECT md5(pg_get_functiondef(p.oid))::text INTO v_txt
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome;
    IF v_txt IS DISTINCT FROM r.h THEN
      RAISE EXCEPTION 'Conferir: public.% mudou (md5 %, esperado %).', r.nome, v_txt, r.h;
    END IF;
  END LOOP;
END
$conferir$;
