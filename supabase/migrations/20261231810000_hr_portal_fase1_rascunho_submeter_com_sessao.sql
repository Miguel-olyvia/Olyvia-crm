-- ==============================================================================
-- Portal de admissao, FASE 1: o rascunho automatico e o Submeter passam a
-- exigir a sessao OTP, e o NISS e o IBAN passam a vir SO do Vault.
--
-- RASCUNHO. NAO APLICADO. Vive em supabase/rascunhos/ e so passa para
-- supabase/migrations/ depois de revisto e de corrido o teste
-- (supabase/rascunhos/TESTE-portal-fase1.sql).
-- Desenho: supabase/rascunhos/DESENHO-portal-fase1.md (opcao A: submeter
-- continua a escrever na ficha e a concluir, como no prototipo).
--
--
-- -- PRECISA DE CODIGO NOVO (LER ANTES DE APLICAR) -----------------------------
--
-- Esta migration LARGA as assinaturas antigas
--   rpc_hr_convite_admissao_rascunho(text, jsonb)
--   rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)
-- e cria as novas, com p_sessao_hash em segundo lugar:
--   rpc_hr_convite_admissao_rascunho(text, text, jsonb)
--   rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text)
-- So serve com a Edge Function convite-admissao NOVA (rascunho e submeter com
-- sessao; NISS/IBAN para o Vault por rpc_hr_convite_admissao_sensiveis_gravar;
-- p_ip por detectClientIp) e com o frontend novo do portal (gravacao
-- automatica, Submeter, ecra de sucesso, sem o botao "Guardar NISS").
--
-- E PRECISA DE TESTE NOVO NO MESMO ENVIO: src/lib/hr/__tests__/
-- conviteAdmissaoContrato.test.ts le a migration mais recente que define o
-- submeter e espera que a RPC leia 'niss' e 'iban' de p_dados. Deixa de ler
-- (vem do Vault): o contrato de chaves tem de mudar no mesmo envio.
--
--
-- -- ORDEM DE PUBLICACAO -------------------------------------------------------
--
-- 1. Base RH uetjghdkwbywbftedtth, a partir do worktree rh-pessoas (confirmar
--    supabase/.temp/project-ref). Nunca a principal, nunca a Mudelar.
-- 2. Testes da Edge e do cliente (vitest, um ficheiro de cada vez).
-- 3. Teste SQL (BEGIN; esta migration; TESTE-portal-fase1.sql; ROLLBACK) contra
--    o remoto ANTES do push, so com autorizacao para escritas revertidas na nike.
-- 4. migration list --linked imediatamente antes (a ultima aplicada a 27/10 e
--    20261231800000); db push --linked.
--    Entre 4 e 5 nada parte: a Edge publicada responde 410 a rascunho e a
--    submeter ANTES de chamar a base, por isso ninguem chama as assinaturas
--    largadas. O "Guardar NISS" continua (sensiveis_gravar nao muda).
-- 5. Edge Function convite-admissao. Entre 5 e 6 o frontend antigo nao chama
--    rascunho nem submeter (botoes desactivados).
-- 6. Frontend. Depois: verificacao ao vivo com um convite da nike
--    (b6ffce4f-f630-4933-833a-008649757a33).
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- RASCUNHO (rpc_hr_convite_admissao_rascunho(p_token_hash, p_sessao_hash,
-- p_rascunho) -> jsonb {ok, guardado_em}):
--   1. le o processo com FOR UPDATE (nao encontrado: HRA31 nao_encontrado);
--   2. portal encerrado ou usado HRA02, revogado HRA03, expirado HRA04,
--      bloqueado HRA05 (a mesma ordem de sensiveis_gravar e portal_ler);
--   3. hr_convite_sessao_exigir (HRA51/52/53; renova a actividade);
--   4. estado em_preenchimento ou devolvida, senao HRA38 estado_invalido;
--   5. objecto (HRA10 pedido_invalido); acima de 20000 bytes HRA10
--      rascunho_demasiado_grande; fora da lista branca HRA10
--      rascunho_chave_invalida -- ANTES do UPDATE, para nunca chegar ao 23514
--      do CHECK pessoas_convites_admissao_rascunho_lista_branca;
--   6. em devolvida: so mudam as chaves devolvidas (HRA47 campo_bloqueado,
--      DETAIL com os NOMES das chaves, nunca valores);
--   7. grava. As recusas sao RAISE (antes eram jsonb {erro}).
--
--   ACRESCENTO AO DESENHO (2.2 passo 6 vs 4.2): em devolvida o cliente envia SO
--   as chaves editaveis alteradas. Se o rascunho fosse substituido por inteiro,
--   as chaves ausentes contavam como "alteradas" (e davam HRA47) e eram
--   apagadas. Por isso, em devolvida: so as chaves ENVIADAS sao comparadas, e o
--   rascunho guardado e (anterior || enviado); limpar faz-se mandando null. Em
--   em_preenchimento o rascunho e substituido por inteiro, como hoje.
--   A correspondencia de nomes (morada_linha1<->linha1, ..., conta_swift<->
--   conta_bic) vale nos DOIS sentidos, no rascunho e no submeter.
--
-- SUBMETER (rpc_hr_convite_admissao_submeter(p_token_hash, p_sessao_hash,
-- p_dados, p_assinatura_nome, p_ip, p_user_agent) -> uuid da pessoa):
--   prefixo novo, antes de qualquer escrita:
--   1-4 iguais ao rascunho (HRA31, HRA02-05, sessao, HRA38);
--   5. p_dados objecto; com chave niss, iban ou conta_numero -> HRA10 (o NISS e
--      o IBAN em texto sao recusados; a Edge ja os retira, isto e a rede);
--   6. assinatura (btrim) vazia ou acima de 200 caracteres -> HRA10;
--   7. em devolvida: chaves de p_dados fora de devolucao.campos -> HRA47;
--   8. NISS e IBAN lidos do Vault (niss_segredo_id / iban_segredo_id do
--      processo, gravados por rpc_hr_convite_admissao_sensiveis_gravar).
--   Corpo: o do submeter VIVO (pg_get_functiondef, md5 3e3f8288... a 27/10),
--   com estas substituicoes e mais nenhuma:
--   - o UPDATE de used_at passa para depois do prefixo, WHERE id = processo,
--     grava submetido_em = now() e a assinatura sem espacos nas pontas; sai o
--     bloco "IF NOT FOUND dar o motivo exacto" (o prefixo ja o faz);
--   - v_niss e v_conta_num vem do Vault, nao de p_dados;
--   - duplicados: coalesce(v_niss, i.niss);
--   - pessoas_identificacao: entra tambem quando so ha NISS (v_niss), e o
--     ON CONFLICT escreve niss quando v_niss IS NOT NULL;
--   - tudo o resto (validacoes, duplicados, moradas, fardamento, portao de
--     pendencias, BIC, conta no Vault da ficha, auditoria, anexos) igual.
--   O trigger hr_convite_admissao_used_at_transitorio continua a passar o
--   processo a concluida, a gravar o evento submetido e a fechar o portal.
--
-- O staging do Vault (NISS/IBAN do processo) NAO se apaga ao concluir: ficam
-- duas copias cifradas (staging e ficha), como a V3a deixou decidido.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. Reverter = nova migration
-- que recria as assinaturas antigas a partir do pg_get_functiondef guardado
-- (md5 e1eddf2d... e 3e3f8288...) e larga as novas, NA MESMA transaccao, e com
-- a Edge antiga (410) ja publicada antes.
--
-- Prerequisitos (lidos no catalogo da base RH a 27/10):
--   hr_convite_sessao_exigir(uuid, text)                 md5 a7bc9d5c...
--   rpc_hr_convite_admissao_sensiveis_gravar(text,text,text,text) md5 28d2e779...
--   hr_convite_admissao_used_at_transitorio()            md5 0bbe69c7...
--   hr_convite_rascunho_valido(jsonb), vault.decrypted_secrets,
--   pessoas_convites_admissao.niss_segredo_id / iban_segredo_id / submetido_em
-- ==============================================================================

BEGIN;

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_ras_oid  oid := to_regprocedure('public.rpc_hr_convite_admissao_rascunho(text, jsonb)');
  v_sub_oid  oid := to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)');
  v_n        bigint;
  v_nome     text;
BEGIN
  -- G1. As duas RPCs antigas existem, com o corpo lido a 27/10. Os corpos novos
  --     abaixo partem desse pg_get_functiondef; se mudou, refazer a copia.
  IF v_ras_oid IS NULL OR v_sub_oid IS NULL THEN
    RAISE EXCEPTION 'G1: falta rpc_hr_convite_admissao_rascunho(text, jsonb) ou rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text).';
  END IF;
  IF md5(pg_get_functiondef(v_ras_oid)) IS DISTINCT FROM 'e1eddf2d50abda32fdf39abfdac5170a' THEN
    RAISE EXCEPTION 'G1: o corpo de rpc_hr_convite_admissao_rascunho mudou desde 27/10 (md5 %). Reler e refazer a copia.',
      md5(pg_get_functiondef(v_ras_oid));
  END IF;
  IF md5(pg_get_functiondef(v_sub_oid)) IS DISTINCT FROM '3e3f82880d01924d109ca35f9a1d62c9' THEN
    RAISE EXCEPTION 'G1: o corpo de rpc_hr_convite_admissao_submeter mudou desde 27/10 (md5 %). Reler e refazer a copia.',
      md5(pg_get_functiondef(v_sub_oid));
  END IF;

  -- G2. As novas ainda nao existem, e ha so UMA funcao com cada nome.
  IF to_regprocedure('public.rpc_hr_convite_admissao_rascunho(text, text, jsonb)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'G2: uma das assinaturas novas ja existe. Ler o que la esta antes de aplicar.';
  END IF;
  FOREACH v_nome IN ARRAY ARRAY['rpc_hr_convite_admissao_rascunho', 'rpc_hr_convite_admissao_submeter'] LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'G2: esperava 1 funcao public.% e ha %.', v_nome, v_n;
    END IF;
  END LOOP;

  -- G3. Nenhum objecto da base depende das RPCs antigas (o DROP e sem CASCADE).
  SELECT count(*) INTO v_n
    FROM pg_depend d
   WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass
     AND d.refobjid IN (v_ras_oid, v_sub_oid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G3: ha % dependencias das RPCs antigas em pg_depend. Ler antes de largar.', v_n;
  END IF;

  -- G4. O que os corpos novos usam e cujo comportamento o desenho assume.
  IF md5(pg_get_functiondef(to_regprocedure('public.hr_convite_sessao_exigir(uuid, text)')))
       IS DISTINCT FROM 'a7bc9d5cc3c0a70500a75fb351dfd811' THEN
    RAISE EXCEPTION 'G4: hr_convite_sessao_exigir(uuid, text) nao existe ou mudou desde 27/10.';
  END IF;
  IF md5(pg_get_functiondef(to_regprocedure('public.rpc_hr_convite_admissao_sensiveis_gravar(text, text, text, text)')))
       IS DISTINCT FROM '28d2e779a75308d183dc1d336ff09c6f' THEN
    RAISE EXCEPTION 'G4: rpc_hr_convite_admissao_sensiveis_gravar nao existe ou mudou desde 27/10 (o formato do NISS/IBAN no Vault vem dela).';
  END IF;
  IF md5(pg_get_functiondef(to_regprocedure('public.hr_convite_admissao_used_at_transitorio()')))
       IS DISTINCT FROM '0bbe69c732ba585e047a1eea8115a83e' THEN
    RAISE EXCEPTION 'G4: hr_convite_admissao_used_at_transitorio nao existe ou mudou desde 27/10 (e ele que conclui o processo).';
  END IF;
  IF to_regprocedure('public.hr_convite_rascunho_valido(jsonb)') IS NULL
     OR to_regprocedure('public.hr_json_texto(jsonb, text)') IS NULL
     OR to_regprocedure('public.hr_nif_valido(text)') IS NULL
     OR to_regprocedure('public.hr_niss_valido(text)') IS NULL
     OR to_regprocedure('public.hr_iban_valido(text)') IS NULL
     OR to_regprocedure('public.hr_bic_valido(text)') IS NULL
     OR to_regprocedure('public.hr_registar_acesso_sensivel(uuid, uuid, text, text)') IS NULL
     OR to_regprocedure('public.hr_convite_anexos_promover(uuid)') IS NULL THEN
    RAISE EXCEPTION 'G4: falta uma das funcoes auxiliares do submeter (rascunho_valido, json_texto, nif/niss/iban/bic_valido, registar_acesso_sensivel, anexos_promover).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_duplicados_candidatos')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_pendencias') THEN
    RAISE EXCEPTION 'G4: falta hr_pessoa_duplicados_candidatos ou hr_admissao_pendencias.';
  END IF;

  -- G5. O Vault e as colunas do processo.
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'G5: vault.decrypted_secrets nao existe.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_convites_admissao')
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname::text IN ('niss_segredo_id', 'iban_segredo_id', 'submetido_em', 'estado',
                             'devolucao', 'portal_encerrado_em', 'rascunho', 'sessao_hash');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'G5: faltam colunas em pessoas_convites_admissao (encontradas % de 8).', v_n;
  END IF;
END;
$guardas$;


-- ---- Largar as assinaturas antigas (na mesma transaccao das novas) ---------
DROP FUNCTION public.rpc_hr_convite_admissao_rascunho(text, jsonb);
DROP FUNCTION public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text);


-- ---- 1. Rascunho -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_rascunho(
  p_token_hash  text,
  p_sessao_hash text,
  p_rascunho    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto        constant integer := 10;
  c_bytes_maximo constant integer := 20000;
  v_c          record;
  v_campos     jsonb;
  v_anterior   jsonb;
  v_novo       jsonb;
  v_bloqueadas text;
BEGIN
  SELECT c.id, c.estado, c.valid_until, c.used_at, c.revoked_at, c.portal_encerrado_em,
         c.attempts, c.devolucao, c.rascunho
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  -- O link sozinho nao escreve.
  PERFORM public.hr_convite_sessao_exigir(v_c.id, p_sessao_hash);

  IF v_c.estado NOT IN ('em_preenchimento', 'devolvida') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  IF jsonb_typeof(p_rascunho) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  -- Tecto de tamanho: sem ele, um processo valido virava armazenamento gratuito.
  IF octet_length(p_rascunho::text) > c_bytes_maximo THEN
    RAISE EXCEPTION 'rascunho_demasiado_grande' USING ERRCODE = 'HRA10';
  END IF;
  -- Lista branca ANTES do UPDATE: o CHECK da tabela daria 23514 (erro
  -- inesperado). O CHECK continua a proibir niss, iban e conta_numero.
  IF NOT public.hr_convite_rascunho_valido(p_rascunho) THEN
    RAISE EXCEPTION 'rascunho_chave_invalida' USING ERRCODE = 'HRA10';
  END IF;

  v_anterior := coalesce(v_c.rascunho, '{}'::jsonb);
  v_novo     := p_rascunho;

  -- Em devolvida so se corrige o que o RH devolveu. Comparam-se so as chaves
  -- enviadas; as outras ficam como estavam (o rascunho e anterior || enviado).
  IF v_c.estado = 'devolvida' THEN
    v_campos := CASE WHEN jsonb_typeof(v_c.devolucao -> 'campos') = 'object'
                     THEN v_c.devolucao -> 'campos' ELSE '{}'::jsonb END;

    SELECT string_agg(k.chave, ',' ORDER BY k.chave)
      INTO v_bloqueadas
      FROM jsonb_object_keys(p_rascunho) AS k(chave)
      LEFT JOIN (VALUES
          ('morada_linha1',        'linha1'),
          ('morada_linha2',        'linha2'),
          ('morada_codigo_postal', 'codigo_postal'),
          ('morada_localidade',    'localidade'),
          ('morada_distrito',      'distrito'),
          ('morada_pais',          'pais'),
          ('conta_swift',          'conta_bic')
        ) AS m(portal, ficha)
        ON k.chave IN (m.portal, m.ficha)
     WHERE (p_rascunho -> k.chave) IS DISTINCT FROM (v_anterior -> k.chave)
       AND NOT (v_campos ? k.chave)
       AND NOT (m.portal IS NOT NULL AND (v_campos ? m.portal OR v_campos ? m.ficha));

    IF v_bloqueadas IS NOT NULL THEN
      RAISE EXCEPTION 'campo_bloqueado' USING ERRCODE = 'HRA47', DETAIL = v_bloqueadas;
    END IF;

    v_novo := v_anterior || p_rascunho;
    IF octet_length(v_novo::text) > c_bytes_maximo THEN
      RAISE EXCEPTION 'rascunho_demasiado_grande' USING ERRCODE = 'HRA10';
    END IF;
    IF NOT public.hr_convite_rascunho_valido(v_novo) THEN
      RAISE EXCEPTION 'rascunho_chave_invalida' USING ERRCODE = 'HRA10';
    END IF;
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET rascunho = v_novo
   WHERE id = v_c.id;

  RETURN jsonb_build_object('ok', true, 'guardado_em', now());
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_rascunho(text, text, jsonb) IS
'Portal de admissao: grava o rascunho do formulario. So service_role (a Edge convite-admissao). Exige sessao OTP valida (hr_convite_sessao_exigir: HRA51/52/53); estados aceites em_preenchimento e devolvida (HRA38); em devolvida so mudam as chaves devolvidas (HRA47) e o rascunho e anterior || enviado. Lista branca e tecto de 20000 bytes verificados antes de gravar (HRA10). NISS, IBAN e conta_numero nunca entram no rascunho: vao para o Vault por rpc_hr_convite_admissao_sensiveis_gravar. Devolve {ok, guardado_em}. Desde 20261231810000.';


-- ---- 2. Submeter -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_submeter(
  p_token_hash      text,
  p_sessao_hash     text,
  p_dados           jsonb,
  p_assinatura_nome text,
  p_ip              inet,
  p_user_agent      text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto constant integer := 10;
  c_assinatura_max constant integer := 200;
  -- Nunca em texto: o NISS e o IBAN so chegam pelo Vault.
  c_proibidas constant text[] := ARRAY['niss', 'iban', 'conta_numero'];
  v_c          record;
  v_campos     jsonb;
  v_bloqueadas text;
  v_assinatura text;
  v_pessoa_id  uuid;
  v_convite_id uuid;
  v_org        uuid;
  v_nif        text;
  v_niss       text;
  v_linha1     text;
  v_pais       text;
  v_principal  boolean;
  v_conta_num  text;
  v_conta_tit  text;
  v_conta_bco  text;
  v_conta_bic  text;
  v_conta_lin  record;
  v_secret_id  uuid;
  v_faltam     text[];
  v_dup_nome1     text;
  v_dup_apelido   text;
  v_dup_nascim    date;
  v_dup_nif       text;
  v_dup_niss      text;
  v_dup_tipo      text;
  v_dup_numero    text;
  v_dup_email     text;
  v_ids_nif       text;
  v_ids_niss      text;
BEGIN
  -- ---- Prefixo: nada se escreve antes disto ----------------------------------
  SELECT c.id, c.estado, c.valid_until, c.used_at, c.revoked_at, c.portal_encerrado_em,
         c.attempts, c.devolucao, c.niss_segredo_id, c.iban_segredo_id
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  -- O link sozinho nao submete.
  PERFORM public.hr_convite_sessao_exigir(v_c.id, p_sessao_hash);

  IF v_c.estado NOT IN ('em_preenchimento', 'devolvida') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_dados) AS k(chave) WHERE k.chave = ANY (c_proibidas)) THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  v_assinatura := nullif(btrim(coalesce(p_assinatura_nome, '')), '');
  IF v_assinatura IS NULL OR length(v_assinatura) > c_assinatura_max THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  -- Em devolvida so se submete o que o RH devolveu.
  IF v_c.estado = 'devolvida' THEN
    v_campos := CASE WHEN jsonb_typeof(v_c.devolucao -> 'campos') = 'object'
                     THEN v_c.devolucao -> 'campos' ELSE '{}'::jsonb END;

    SELECT string_agg(k.chave, ',' ORDER BY k.chave)
      INTO v_bloqueadas
      FROM jsonb_object_keys(p_dados) AS k(chave)
      LEFT JOIN (VALUES
          ('morada_linha1',        'linha1'),
          ('morada_linha2',        'linha2'),
          ('morada_codigo_postal', 'codigo_postal'),
          ('morada_localidade',    'localidade'),
          ('morada_distrito',      'distrito'),
          ('morada_pais',          'pais'),
          ('conta_swift',          'conta_bic')
        ) AS m(portal, ficha)
        ON k.chave IN (m.portal, m.ficha)
     WHERE NOT (v_campos ? k.chave)
       AND NOT (m.portal IS NOT NULL AND (v_campos ? m.portal OR v_campos ? m.ficha));

    IF v_bloqueadas IS NOT NULL THEN
      RAISE EXCEPTION 'campo_bloqueado' USING ERRCODE = 'HRA47', DETAIL = v_bloqueadas;
    END IF;
  END IF;

  -- NISS e IBAN: so do Vault (staging gravado por sensiveis_gravar, ja sem
  -- espacos e com o IBAN em maiusculas). Nulos se nao houver segredo.
  IF v_c.niss_segredo_id IS NOT NULL THEN
    SELECT s.decrypted_secret INTO v_niss
      FROM vault.decrypted_secrets s WHERE s.id = v_c.niss_segredo_id;
  END IF;
  IF v_c.iban_segredo_id IS NOT NULL THEN
    SELECT s.decrypted_secret INTO v_conta_num
      FROM vault.decrypted_secrets s WHERE s.id = v_c.iban_segredo_id;
  END IF;
  v_niss      := nullif(btrim(v_niss), '');
  v_conta_num := nullif(btrim(v_conta_num), '');

  -- ---- Corpo do submeter vivo (27/10), com as substituicoes do cabecalho -----
  UPDATE public.pessoas_convites_admissao
     SET used_at = now(),
         submetido_em = now(),
         assinatura_nome = v_assinatura,
         assinatura_ip = p_ip,
         assinatura_user_agent = p_user_agent,
         rascunho = NULL,
         -- Convite consumido: a ultima recusa (campos e fichas em conflito)
         -- deixa de fazer falta e nao fica guardada.
         ultima_recusa_codigo = NULL,
         ultima_recusa_em = NULL,
         ultima_recusa_campos = NULL,
         ultima_recusa_conflitos = NULL
   WHERE id = v_c.id
  RETURNING id, pessoa_id, organization_id INTO v_convite_id, v_pessoa_id, v_org;

  -- NIF e NISS pelo digito de controlo, ANTES dos duplicados e de qualquer
  -- escrita na ficha. O NISS vem do Vault; valida-se na mesma, por defesa.
  v_nif := public.hr_json_texto(p_dados, 'nif');

  IF v_nif IS NOT NULL AND NOT public.hr_nif_valido(v_nif) THEN
    RAISE EXCEPTION 'nif_invalido' USING ERRCODE = 'HRA11';
  END IF;
  IF v_niss IS NOT NULL AND NOT public.hr_niss_valido(v_niss) THEN
    RAISE EXCEPTION 'niss_invalido' USING ERRCODE = 'HRA12';
  END IF;

  SELECT
    p.primeiro_nome,
    p.apelido,
    coalesce(public.hr_json_texto(p_dados, 'email_pessoal'), p.email_pessoal),
    coalesce(public.hr_json_texto(p_dados, 'nif'), i.nif),
    coalesce(v_niss, i.niss),
    coalesce(public.hr_json_texto(p_dados, 'tipo_documento'), i.tipo_documento),
    coalesce(public.hr_json_texto(p_dados, 'numero_documento'), i.numero_documento),
    coalesce(public.hr_json_texto(p_dados, 'data_nascimento')::date, dp.data_nascimento)
    INTO v_dup_nome1, v_dup_apelido, v_dup_email, v_dup_nif, v_dup_niss,
         v_dup_tipo, v_dup_numero, v_dup_nascim
  FROM public.pessoas p
  LEFT JOIN public.pessoas_identificacao i ON i.pessoa_id = p.id
  LEFT JOIN public.pessoas_dados_pessoais dp ON dp.pessoa_id = p.id
  WHERE p.id = v_pessoa_id;

  -- Os pessoa_id em conflito ficam no DETAIL: so a Edge Function o le e NUNCA
  -- sai para o publico.
  SELECT
    string_agg(DISTINCT cand.pessoa_id::text, ',') FILTER (WHERE cand.campo_coincidente = 'nif'),
    string_agg(DISTINCT cand.pessoa_id::text, ',') FILTER (WHERE cand.campo_coincidente = 'niss')
    INTO v_ids_nif, v_ids_niss
  FROM public.hr_pessoa_duplicados_candidatos(
    v_org, v_dup_nif, v_dup_niss, v_dup_email, v_dup_tipo, v_dup_numero,
    v_dup_nome1, v_dup_apelido, v_dup_nascim, v_pessoa_id
  ) AS cand
  WHERE cand.forca = 'travao';

  IF v_ids_nif IS NOT NULL THEN
    RAISE EXCEPTION 'nif_ja_existe' USING ERRCODE = 'HRA13', DETAIL = v_ids_nif;
  END IF;
  IF v_ids_niss IS NOT NULL THEN
    RAISE EXCEPTION 'niss_ja_existe' USING ERRCODE = 'HRA14', DETAIL = v_ids_niss;
  END IF;

  PERFORM set_config('hr.origem_escrita', 'convite', true);

  IF p_dados ? 'email_pessoal' THEN
    UPDATE public.pessoas
       SET email_pessoal = public.hr_json_texto(p_dados, 'email_pessoal')
     WHERE id = v_pessoa_id;
  END IF;

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

  -- O NISS ja nao vem em p_dados: a identificacao entra tambem quando so ha
  -- NISS no Vault.
  IF p_dados ?| ARRAY[
       'tipo_documento','numero_documento','validade_documento','nif',
       'carta_conducao_numero','carta_conducao_categorias','carta_conducao_validade'
     ] OR v_niss IS NOT NULL THEN
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
      niss = CASE WHEN v_niss IS NOT NULL
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

  v_linha1 := public.hr_json_texto(p_dados, 'morada_linha1');
  v_pais   := upper(public.hr_json_texto(p_dados, 'morada_pais'));

  IF v_pais IS NOT NULL AND v_pais !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'pais_invalido' USING ERRCODE = 'HRA15';
  END IF;

  IF p_dados ?| ARRAY[
       'morada_linha1','morada_linha2','morada_codigo_postal',
       'morada_localidade','morada_distrito','morada_pais'
     ] THEN
    UPDATE public.pessoas_moradas
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

  -- ---- pessoas_fardamento --------------------------------------------------
  IF p_dados ?| ARRAY[
       'tamanho_cima','tamanho_cima_detalhe','tamanho_baixo','tamanho_baixo_detalhe',
       'tamanho_calcado','tamanho_calcado_detalhe'
     ] THEN
    INSERT INTO public.pessoas_fardamento (
      pessoa_id, organization_id,
      tamanho_cima, tamanho_cima_detalhe, tamanho_baixo, tamanho_baixo_detalhe,
      tamanho_calcado, tamanho_calcado_detalhe
    ) VALUES (
      v_pessoa_id, v_org,
      public.hr_json_texto(p_dados, 'tamanho_cima'),
      public.hr_json_texto(p_dados, 'tamanho_cima_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_baixo'),
      public.hr_json_texto(p_dados, 'tamanho_baixo_detalhe'),
      public.hr_json_texto(p_dados, 'tamanho_calcado'),
      public.hr_json_texto(p_dados, 'tamanho_calcado_detalhe')
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
      tamanho_calcado = CASE WHEN p_dados ? 'tamanho_calcado'
        THEN EXCLUDED.tamanho_calcado ELSE pessoas_fardamento.tamanho_calcado END,
      tamanho_calcado_detalhe = CASE WHEN p_dados ? 'tamanho_calcado_detalhe'
        THEN EXCLUDED.tamanho_calcado_detalhe ELSE pessoas_fardamento.tamanho_calcado_detalhe END,
      updated_at = now();
  END IF;

  -- Filiacao sindical deixou de se escrever por aqui (20261202080000).

  -- O IBAN vem do Vault (v_conta_num, lido no prefixo).
  v_conta_tit := public.hr_json_texto(p_dados, 'conta_titular');
  v_conta_bco := public.hr_json_texto(p_dados, 'conta_banco');
  -- O BIC (coluna swift) viaja como conta_swift. Maiusculas e sem espacos, como o IBAN.
  v_conta_bic := nullif(upper(regexp_replace(coalesce(public.hr_json_texto(p_dados, 'conta_swift'), ''), '[[:space:]]', '', 'g')), '');

  IF v_conta_num IS NOT NULL THEN
    v_conta_num := upper(regexp_replace(v_conta_num, '[[:space:]]', '', 'g'));

    IF NOT public.hr_iban_valido(v_conta_num) THEN
      RAISE EXCEPTION 'iban_invalido' USING ERRCODE = 'HRA16';
    END IF;
  END IF;

  -- O BIC valida-se mesmo sem IBAN: a pessoa pode dar um e deixar o outro para a ficha.
  IF v_conta_bic IS NOT NULL AND NOT public.hr_bic_valido(v_conta_bic) THEN
    RAISE EXCEPTION 'bic_invalido' USING ERRCODE = 'HRA18';
  END IF;

  -- O portao: so trava o que a PESSOA tem de preencher no convite (origem
  -- pessoa, posicao convite). Os de posicao ficha NUNCA travam o convite.
  SELECT array_agg(pend.codigo ORDER BY pend.codigo)
    INTO v_faltam
    FROM public.hr_admissao_pendencias(v_pessoa_id) AS pend
   WHERE pend.origem = 'pessoa'
     AND pend.posicao = 'convite'
     AND NOT (pend.codigo = 'conta_numero'  AND v_conta_num IS NOT NULL)
     AND NOT (pend.codigo = 'conta_titular' AND v_conta_num IS NOT NULL AND v_conta_tit IS NOT NULL)
     AND NOT (pend.codigo = 'conta_banco'   AND v_conta_num IS NOT NULL AND v_conta_bco IS NOT NULL)
     AND NOT (pend.codigo = 'conta_bic'     AND v_conta_bic IS NOT NULL);

  IF v_faltam IS NOT NULL AND array_length(v_faltam, 1) > 0 THEN
    RAISE EXCEPTION 'admissao_incompleta' USING ERRCODE = 'HRA17', DETAIL = array_to_string(v_faltam, ',');
  END IF;

  IF v_conta_num IS NOT NULL THEN
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
      v_conta_tit,
      v_conta_bco,
      public.hr_json_texto(p_dados, 'conta_agencia'),
      'iban',
      v_secret_id, right(v_conta_num, 4), left(v_conta_num, 2),
      v_conta_bic, true
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      titular = CASE WHEN v_conta_tit IS NOT NULL
        THEN EXCLUDED.titular ELSE pessoas_dados_bancarios.titular END,
      banco = CASE WHEN v_conta_bco IS NOT NULL
        THEN EXCLUDED.banco ELSE pessoas_dados_bancarios.banco END,
      agencia = CASE WHEN p_dados ? 'conta_agencia'
        THEN EXCLUDED.agencia ELSE pessoas_dados_bancarios.agencia END,
      formato_conta = EXCLUDED.formato_conta,
      conta_secret_id = EXCLUDED.conta_secret_id,
      conta_ultimos4 = EXCLUDED.conta_ultimos4,
      conta_pais = EXCLUDED.conta_pais,
      -- Um BIC dado grava-se; um BIC em branco NUNCA apaga o que ja esta na ficha
      -- (igual ao ramo so-BIC, que so corre com BIC preenchido); e um swift legado
      -- que nao e um BIC (o CHECK antigo aceitava ABCD1234) passa a NULL em vez de
      -- fazer este UPDATE falhar com 23514 contra o CHECK NOT VALID.
      swift = CASE
        WHEN v_conta_bic IS NOT NULL THEN EXCLUDED.swift
        WHEN public.hr_bic_valido(pessoas_dados_bancarios.swift) THEN pessoas_dados_bancarios.swift
        ELSE NULL END,
      updated_at = now();

    PERFORM public.hr_registar_acesso_sensivel(v_pessoa_id, v_org, 'conta_bancaria', 'alterar');
  END IF;

  -- So o BIC, sem IBAN. O BIC identifica o banco e nao a conta: nao e sensivel,
  -- por isso nao leva segredo no Vault nem auditoria de acesso. conta_secret_id e
  -- conta_ultimos4 ficam NULL (o CHECK de segredo e mascara aceita os dois a NULL) e
  -- a pendencia conta_numero continua.
  IF v_conta_num IS NULL AND v_conta_bic IS NOT NULL THEN
    INSERT INTO public.pessoas_dados_bancarios (
      pessoa_id, organization_id, swift, is_principal
    ) VALUES (
      v_pessoa_id, v_org, v_conta_bic, true
    )
    ON CONFLICT (pessoa_id) DO UPDATE SET
      swift = EXCLUDED.swift,
      updated_at = now();
  END IF;

  -- Os ficheiros ligados ao convite passam a fazer parte da ficha, NA MESMA
  -- transaccao: qualquer RAISE acima desfaz tudo e os ficheiros continuam
  -- ligados ao convite (e ao rascunho). A propria promover isola a promocao
  -- numa subtransaccao: uma falha dela nunca desfaz a admissao.
  PERFORM public.hr_convite_anexos_promover(v_convite_id);

  RETURN v_pessoa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text) IS
'Portal de admissao: submete o formulario, escreve na ficha e conclui o processo (o trigger used_at_transitorio passa a concluida e fecha o portal). So service_role (a Edge convite-admissao). Exige sessao OTP valida (HRA51/52/53); estados aceites em_preenchimento e devolvida (HRA38); em devolvida so as chaves devolvidas (HRA47). NISS e IBAN lidos SO do Vault (niss_segredo_id / iban_segredo_id do processo); niss, iban ou conta_numero em p_dados sao recusados (HRA10). Assinatura obrigatoria, ate 200 caracteres (HRA10). Grava submetido_em. Devolve o id da pessoa. Desde 20261231810000.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_ras     oid := to_regprocedure('public.rpc_hr_convite_admissao_rascunho(text, text, jsonb)');
  v_sub     oid := to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, text, jsonb, text, inet, text)');
  v_alvo    oid;
  v_rotulo  text;
  v_secdef  boolean;
  v_vol     text;
  v_cfg     text[];
  v_acl     aclitem[];
  v_dono    oid;
  v_ret     oid;
  v_outros  text[];
  v_src     text;
  v_n       bigint;
  v_nome    text;
BEGIN
  -- C1. As antigas sairam; as novas existem.
  IF to_regprocedure('public.rpc_hr_convite_admissao_rascunho(text, jsonb)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'C1: uma assinatura antiga continua a existir.';
  END IF;
  IF v_ras IS NULL OR v_sub IS NULL THEN
    RAISE EXCEPTION 'C1: uma assinatura nova nao ficou criada.';
  END IF;

  -- C2. Uma so funcao por nome (o PostgREST nao pode escolher entre duas).
  FOREACH v_nome IN ARRAY ARRAY['rpc_hr_convite_admissao_rascunho', 'rpc_hr_convite_admissao_submeter'] LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'C2: ficaram % funcoes public.%.', v_n, v_nome;
    END IF;
  END LOOP;

  -- C3. SECURITY DEFINER, VOLATILE, search_path fixo, tipo de retorno, e
  --     EXECUTE so para service_role (alem do dono).
  FOR v_alvo, v_rotulo IN
    SELECT x.o, x.r FROM (VALUES (v_ras, 'rascunho'), (v_sub, 'submeter')) AS x(o, r)
  LOOP
    SELECT p.prosecdef, p.provolatile::text, p.proconfig, p.proacl, p.proowner, p.prorettype
      INTO v_secdef, v_vol, v_cfg, v_acl, v_dono, v_ret
      FROM pg_proc p WHERE p.oid = v_alvo;

    IF v_secdef IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'C3 %: nao ficou SECURITY DEFINER.', v_rotulo;
    END IF;
    IF v_vol IS DISTINCT FROM 'v' THEN
      RAISE EXCEPTION 'C3 %: nao ficou VOLATILE (provolatile %).', v_rotulo, v_vol;
    END IF;
    IF NOT ('search_path=public, pg_temp' = ANY (coalesce(v_cfg, '{}'::text[]))) THEN
      RAISE EXCEPTION 'C3 %: search_path nao ficou fixo em public, pg_temp (proconfig %).', v_rotulo, coalesce(array_to_string(v_cfg, ';'), 'vazio');
    END IF;
    IF v_ret IS DISTINCT FROM (CASE WHEN v_rotulo = 'rascunho' THEN 'jsonb'::regtype ELSE 'uuid'::regtype END)::oid THEN
      RAISE EXCEPTION 'C3 %: tipo de retorno inesperado (%).', v_rotulo, v_ret::regtype::text;
    END IF;

    SELECT array_agg(g.quem ORDER BY g.quem) INTO v_outros
      FROM (SELECT DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS quem
              FROM aclexplode(v_acl) AS a
             WHERE a.grantee <> v_dono AND a.privilege_type = 'EXECUTE') AS g;
    IF v_outros IS DISTINCT FROM ARRAY['service_role']::text[] THEN
      RAISE EXCEPTION 'C3 %: EXECUTE devia ser so de service_role, e de: %.', v_rotulo, coalesce(array_to_string(v_outros, ','), 'ninguem (proacl nulo = PUBLIC)');
    END IF;
    IF has_function_privilege('anon', v_alvo, 'EXECUTE')
       OR has_function_privilege('authenticated', v_alvo, 'EXECUTE') THEN
      RAISE EXCEPTION 'C3 %: anon ou authenticated executam a funcao.', v_rotulo;
    END IF;
  END LOOP;

  -- C4. O submeter ja nao le o NISS nem o IBAN de p_dados, e le-os do Vault.
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = v_sub;
  IF strpos(v_src, 'hr_json_texto(p_dados, ''niss'')') > 0
     OR strpos(v_src, 'hr_json_texto(p_dados, ''iban'')') > 0
     OR strpos(v_src, 'p_dados ? ''niss''') > 0
     OR strpos(v_src, 'p_dados ->> ''iban''') > 0 THEN
    RAISE EXCEPTION 'C4: o submeter ainda le o NISS ou o IBAN de p_dados.';
  END IF;
  IF strpos(v_src, 'niss_segredo_id') = 0
     OR strpos(v_src, 'iban_segredo_id') = 0
     OR strpos(v_src, 'vault.decrypted_secrets') = 0
     OR strpos(v_src, 'hr_convite_sessao_exigir') = 0 THEN
    RAISE EXCEPTION 'C4: o submeter nao le do Vault ou nao exige a sessao.';
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = v_ras;
  IF strpos(v_src, 'hr_convite_sessao_exigir') = 0
     OR strpos(v_src, 'hr_convite_rascunho_valido') = 0 THEN
    RAISE EXCEPTION 'C4: o rascunho nao exige a sessao ou nao valida a lista branca.';
  END IF;

  -- C5. hr_convite_sessao_exigir continua sem EXECUTE para ninguem alem do dono.
  v_alvo := to_regprocedure('public.hr_convite_sessao_exigir(uuid, text)');
  IF has_function_privilege('service_role', v_alvo, 'EXECUTE')
     OR has_function_privilege('anon', v_alvo, 'EXECUTE')
     OR has_function_privilege('authenticated', v_alvo, 'EXECUTE') THEN
    RAISE EXCEPTION 'C5: hr_convite_sessao_exigir ganhou EXECUTE para service_role, anon ou authenticated.';
  END IF;

  -- C6. sensiveis_gravar nao foi tocada (a Edge reutiliza-a).
  IF md5(pg_get_functiondef(to_regprocedure('public.rpc_hr_convite_admissao_sensiveis_gravar(text, text, text, text)')))
       IS DISTINCT FROM '28d2e779a75308d183dc1d336ff09c6f' THEN
    RAISE EXCEPTION 'C6: rpc_hr_convite_admissao_sensiveis_gravar mudou.';
  END IF;
END;
$conferir$;

NOTIFY pgrst, 'reload schema';

COMMIT;
