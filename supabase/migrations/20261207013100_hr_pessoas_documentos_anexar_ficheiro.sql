-- ==============================================================================
-- rpc_hr_documento_anexar_ficheiro -- anexa a pessoas_documentos o ficheiro ja
-- validado e promovido para hr-documentos, com o seu hash.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261123030000 deixou ficheiro_caminho sempre NULL porque nao havia Edge
-- Function de promocao da quarentena. 20261130055000 criou os cofres; falta o
-- unico caminho de escrita permitido. ficheiro_caminho JA esta no GRANT de
-- coluna a authenticated (e metadado legivel, ao contrario de corpo_html, que
-- continua completamente fechado) -- o que falta nao e a LEITURA, e a
-- ESCRITA: a tabela nao da UPDATE nenhum a authenticated (so a politica
-- RESTRICTIVE de 20261123030000), por isso so uma RPC SECURITY DEFINER
-- consegue gravar ficheiro_caminho.
--
--
-- -- A ORDEM: ANEXAR, DEPOIS ASSINAR -------------------------------------------
--
-- Decisao ja tomada: o ficheiro tem de estar anexado ANTES de o documento
-- passar a assinado. Esta RPC por isso so aceita o documento em
-- estado='a_aguardar_assinatura' -- nunca 'rascunho' (ainda nao foi emitido),
-- nunca 'assinado' ou 'anulado'. Uma vez assinado, o trigger
-- hr_documentos_assinado_imutavel (20261123030000) bloqueia qualquer UPDATE,
-- incluindo desta RPC -- nao se abre aqui excepcao nenhuma a esse trigger.
-- Corrigir um ficheiro de um documento ja assinado nao e reescrever: e anular
-- com motivo (quando existir essa RPC) e emitir outro.
--
-- Antes de assinado, um novo anexo SUBSTITUI o anterior (o mesmo caminho de
-- correccao de um scan mal enquadrado) -- so depois de assinado e que fica
-- congelado para sempre.
--
--
-- -- O HASH ----------------------------------------------------------------------
--
-- ficheiro_hash_sha256 grava o resumo SHA-256 dos bytes, calculado por
-- validate-upload a partir do objecto ja confirmado por assinatura binaria (a
-- mesma leitura que a Edge Function ja faz para mover o ficheiro -- nao se lê
-- o objecto uma segunda vez so para o hash). Guardado ANTES do documento
-- poder ser assinado, e congelado com o resto da linha pelo trigger de
-- imutabilidade assim que o estado passa a assinado: prova que os bytes
-- marcados como assinados continuam os mesmos que foram anexados.
--
--
-- -- PORQUE UM p_auth_uid EXPLICITO -- E PORQUE SO service_role O PODE USAR ----
--
-- Esta RPC e chamada por validate-upload, que corre com SUPABASE_SERVICE_ROLE_KEY
-- -- nesse contexto auth.uid() e NULL, nao o utilizador que fez upload, por
-- isso precisa de um parametro explicito para saber quem e o dono da accao.
--
-- MAS: ao contrario de has_anew_permission_in_org (uma funcao STABLE,
-- so-leitura, onde receber o uid errado no maximo devolve um booleano
-- incorrecto), aqui p_auth_uid e o UNICO dado usado para autorizar uma
-- ESCRITA. Se esta RPC estivesse aberta a `authenticated` com p_auth_uid livre,
-- qualquer utilizador autenticado -- mesmo sem nenhuma permissao de RH --
-- podia chamar esta funcao a passar o uid de um administrador de RH e a
-- verificacao de permissao passava, avaliada para a identidade
-- impersonada. Por isso:
--   (a) EXECUTE nesta funcao NAO e concedido a `authenticated`, so a
--       `service_role` -- nao ha, nesta ronda, nenhum caminho de UI que a
--       chame directamente, so validate-upload;
--   (b) mesmo assim, a funcao verifica ELA PROPRIA que quem a esta a chamar e
--       service_role sempre que p_auth_uid vem preenchido -- para que uma
--       futura alteracao de GRANT (ou um `SET ROLE`) nao reabra sozinha a
--       impersonacao. Chamada sem p_auth_uid, continua a funcionar com
--       auth.uid() da propria sessao, tal como qualquer outra RPC desta
--       tabela.
--
--
-- -- A VALIDACAO DO CAMINHO, OUTRA VEZ, AQUI ------------------------------------
--
-- A politica de storage (20261130055000) ja exige que o caminho de quarentena
-- tenha a forma <organization_id>/<pessoa_id>/<documento_id>/<uuid>.<ext>, e
-- validate-upload confirma que a pessoa da 2a pasta pertence a organizacao da
-- 1a antes de promover. Mesmo assim esta RPC volta a confirmar a FORMA
-- COMPLETA de p_ficheiro_caminho (nao so o prefixo) contra
-- <organizacao do documento>/<pessoa do documento>/<id do documento>/<uuid>.<ext>
-- -- a RPC e SECURITY DEFINER e (para service_role) chamavel com qualquer
-- caminho, por isso nao pode confiar em nenhuma validacao feita noutro sitio,
-- nem so no prefixo (um prefixo correcto seguido de lixo arbitrario passaria
-- um simples `left(...) = prefixo`).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.rpc_hr_documento_anexar_ficheiro(uuid, text, text, uuid);
--   ALTER TABLE public.pessoas_documentos
--     DROP COLUMN IF EXISTS ficheiro_hash_sha256,
--     DROP COLUMN IF EXISTS ficheiro_anexado_em,
--     DROP COLUMN IF EXISTS ficheiro_anexado_por;
-- Isto perde o hash e a data de anexo de qualquer ficheiro ja anexado.
-- Exportar antes.
--
--
-- Prerequisitos:
--   20261123030000  pessoas_documentos, hr_documentos_assinado_imutavel
--   20261130055000  hr-documentos / hr-documentos-quarantine
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
--   20261120040000  hr_registar_acesso_sensivel(uuid, uuid, text, text)
--   20261123015000  pessoas_acessos_sensiveis aceita campo='documento'
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_documentos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_documentos nao existe. Aplicar 20261123030000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'hr-documentos') THEN
    RAISE EXCEPTION 'O bucket hr-documentos nao existe. Aplicar 20261130055000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe. Aplicar 20261120040000.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.pessoas_acessos_sensiveis'::regclass
       AND c.conname = 'pessoas_acessos_sensiveis_campo_valido'
       AND pg_get_constraintdef(c.oid) LIKE '%documento%'
  ) THEN
    RAISE EXCEPTION 'pessoas_acessos_sensiveis nao aceita campo=documento ainda. Aplicar 20261123015000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.pessoas_documentos'::regclass
       AND t.tgname = 'trg_pessoas_documentos_assinado_imutavel'
  ) THEN
    RAISE EXCEPTION 'O trigger de imutabilidade trg_pessoas_documentos_assinado_imutavel nao existe. Aplicar 20261123030000 primeiro -- esta RPC depende dele para nunca poder reescrever um documento assinado.';
  END IF;
END;
$guardas$;

-- ---- As tres colunas novas ----------------------------------------------------
ALTER TABLE public.pessoas_documentos
  ADD COLUMN IF NOT EXISTS ficheiro_hash_sha256 text,
  ADD COLUMN IF NOT EXISTS ficheiro_anexado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS ficheiro_anexado_por  uuid;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_documentos_ficheiro_anexado_por_fkey'
       AND conrelid = 'public.pessoas_documentos'::regclass
  ) THEN
    ALTER TABLE public.pessoas_documentos
      ADD CONSTRAINT pessoas_documentos_ficheiro_anexado_por_fkey
      FOREIGN KEY (ficheiro_anexado_por) REFERENCES public.anew_users (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_documentos_ficheiro_hash_formato'
       AND conrelid = 'public.pessoas_documentos'::regclass
  ) THEN
    ALTER TABLE public.pessoas_documentos
      ADD CONSTRAINT pessoas_documentos_ficheiro_hash_formato
      CHECK (ficheiro_hash_sha256 IS NULL OR ficheiro_hash_sha256 ~ '^[0-9a-f]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_documentos_ficheiro_anexado_consistente'
       AND conrelid = 'public.pessoas_documentos'::regclass
  ) THEN
    -- Um hash ou uma data de anexo sem o caminho do ficheiro seria um resto
    -- inconsistente (ex.: de um anexo que falhou a meio).
    ALTER TABLE public.pessoas_documentos
      ADD CONSTRAINT pessoas_documentos_ficheiro_anexado_consistente
      CHECK (
        (ficheiro_caminho IS NOT NULL) OR
        (ficheiro_hash_sha256 IS NULL AND ficheiro_anexado_em IS NULL AND ficheiro_anexado_por IS NULL)
      );
  END IF;
END;
$fk$;

COMMENT ON COLUMN public.pessoas_documentos.ficheiro_hash_sha256 IS
'SHA-256 (hex, 64 caracteres) dos bytes do ficheiro anexado, calculado por validate-upload a partir do objecto ja confirmado por assinatura binaria. Gravado por rpc_hr_documento_anexar_ficheiro, antes do documento poder ser assinado; congelado com o resto da linha pelo trigger de imutabilidade assim que o estado passa a assinado. Prova que os bytes marcados como assinados continuam os mesmos que foram anexados.';
COMMENT ON COLUMN public.pessoas_documentos.ficheiro_anexado_em IS
'Quando o ficheiro foi anexado por rpc_hr_documento_anexar_ficheiro. NULL enquanto ficheiro_caminho for NULL.';
COMMENT ON COLUMN public.pessoas_documentos.ficheiro_anexado_por IS
'anew_users.id de quem anexou o ficheiro (resolvido do auth uid que chamou rpc_hr_documento_anexar_ficheiro, directamente ou via validate-upload).';

-- ---- Grants: as tres colunas novas juntam-se aos metadados legiveis --------
-- Repete o REVOKE ALL + GRANT SELECT inteiro (nao um GRANT incremental):
-- assim a lista fica sempre explicita e o bloco de conferir continua a poder
-- comparar a lista toda contra o que espera, sem depender do que ja lá estava.
REVOKE ALL ON TABLE public.pessoas_documentos FROM anon;
REVOKE ALL ON TABLE public.pessoas_documentos FROM authenticated;

GRANT SELECT (
  id, pessoa_id, organization_id, vinculo_id, modelo_id,
  tipo, titulo, ficheiro_caminho, ficheiro_hash_sha256,
  ficheiro_anexado_em, ficheiro_anexado_por,
  estado, emitido_em, emitido_por,
  assinado_em, assinado_por_auth_uid,
  anulado_em, anulado_por, anulado_motivo,
  deleted_at, deleted_by, created_at, updated_at, created_by, updated_by
) ON TABLE public.pessoas_documentos TO authenticated;

GRANT ALL ON TABLE public.pessoas_documentos TO service_role;

-- ==============================================================================
-- RPC: anexar ficheiro -- so entre a_aguardar_assinatura, e so quem tem
-- hr.pessoas.documentos.edit na organizacao do documento
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_documento_anexar_ficheiro(
  p_documento_id        uuid,
  p_ficheiro_caminho    text,
  p_ficheiro_hash_sha256 text,
  p_auth_uid            uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth          uuid := coalesce(p_auth_uid, auth.uid());
  v_doc           public.pessoas_documentos%ROWTYPE;
  v_prefixo       text;
  v_anexado_por   uuid;
  v_caminho_anterior text;
  v_request_role  text := current_setting('request.jwt.claims', true)::jsonb->>'role';
BEGIN
  -- p_auth_uid so pode ser usado por service_role (validate-upload). Sem esta
  -- verificacao, qualquer authenticated podia passar o uid de outra pessoa e
  -- a verificacao de permissao abaixo seria avaliada para a identidade
  -- impersonada -- exactamente o que esta funcao precisa de nunca permitir,
  -- por ser SECURITY DEFINER e por autorizar uma ESCRITA (ao contrario de
  -- has_anew_permission_in_org, que so devolve um booleano). EXECUTE ja nao e
  -- concedido a authenticated (ver GRANT abaixo); esta verificacao e o
  -- cinto-e-suspensorios para o caso de um GRANT futuro reabrir o caminho.
  IF p_auth_uid IS NOT NULL AND v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.';
  END IF;

  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_anexar_ficheiro exige um utilizador autenticado.';
  END IF;

  IF p_ficheiro_caminho IS NULL OR length(trim(p_ficheiro_caminho)) = 0 THEN
    RAISE EXCEPTION 'p_ficheiro_caminho nao pode ser vazio.';
  END IF;

  IF p_ficheiro_hash_sha256 IS NULL OR p_ficheiro_hash_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'p_ficheiro_hash_sha256 tem de ser um SHA-256 em hexadecimal minusculo (64 caracteres).';
  END IF;

  SELECT * INTO v_doc
    FROM public.pessoas_documentos
   WHERE id = p_documento_id AND deleted_at IS NULL
   FOR UPDATE;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento % nao encontrado ou apagado.', p_documento_id;
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.edit', v_doc.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.pessoas.documentos.edit na organizacao do documento.';
  END IF;

  -- A ordem e fechada: so se anexa ANTES de assinar. Uma vez assinado ou
  -- anulado, o caminho e anular e emitir outro -- nunca sobrescrever. O
  -- trigger de imutabilidade ja bloquearia o UPDATE abaixo para 'assinado',
  -- mas verificar aqui da um erro claro em vez de deixar a excepcao do
  -- trigger, que fala de "qualquer alteracao" e nao desta regra especifica.
  IF v_doc.estado <> 'a_aguardar_assinatura' THEN
    RAISE EXCEPTION 'Documento % nao esta a aguardar assinatura (estado actual: %). So se anexa ficheiro antes de assinar; um documento assinado ou anulado nunca se sobrescreve.', p_documento_id, v_doc.estado;
  END IF;

  -- O caminho tem de ter a FORMA COMPLETA
  -- <organizacao do documento>/<pessoa do documento>/<id do documento>/<uuid>.<ext>
  -- -- nao so o PREFIXO: um prefixo correcto seguido de lixo arbitrario (outro
  -- "/", travessia de caminho, um segundo documento embutido) passaria um
  -- simples left(...) = prefixo. Comparado em minusculas: os uuid dos
  -- parametros da linha ja saem sempre em minusculas de ::text, mas
  -- p_ficheiro_caminho vem de fora e a politica de storage aceita so
  -- minusculas (~ e nao ~*) -- lower() aqui evita rejeitar por diferenca de
  -- caixa um caminho que a politica ja aceitou.
  v_prefixo := lower(v_doc.organization_id::text || '/' || v_doc.pessoa_id::text || '/' || v_doc.id::text || '/');
  IF lower(p_ficheiro_caminho) !~ ('^' || v_prefixo || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png)$') THEN
    RAISE EXCEPTION 'p_ficheiro_caminho nao tem a forma esperada para este documento (esperava-se %<uuid>.<pdf|jpg|jpeg|png>).', v_prefixo;
  END IF;

  v_caminho_anterior := v_doc.ficheiro_caminho;

  SELECT au.id INTO v_anexado_por FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  UPDATE public.pessoas_documentos
     SET ficheiro_caminho = p_ficheiro_caminho,
         ficheiro_hash_sha256 = p_ficheiro_hash_sha256,
         ficheiro_anexado_em = now(),
         ficheiro_anexado_por = v_anexado_por,
         updated_by = v_anexado_por
   WHERE id = p_documento_id;

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'alterar');

  -- Devolve o caminho ANTERIOR (NULL na 1a vez), nao o novo -- o novo o
  -- chamador ja o tem. Um novo anexo antes de assinar substitui o registo,
  -- mas o OBJECTO antigo em hr-documentos so pode ser apagado por quem fala
  -- com o Storage (esta funcao SQL nao alcanca o Storage); devolver o caminho
  -- antigo e o que permite a validate-upload limpa-lo, em vez de o deixar um
  -- objecto orfao para sempre (sem politica de SELECT, ninguem o alcancaria).
  RETURN v_caminho_anterior;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_documento_anexar_ficheiro(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_anexar_ficheiro(uuid, text, text, uuid) FROM anon;
-- NAO concedido a authenticated: nao ha, nesta ronda, nenhum caminho de UI
-- que chame esta RPC directamente -- so validate-upload, com service_role.
-- Ver o comentario "PORQUE UM p_auth_uid EXPLICITO" no cabecalho: se esta
-- funcao alguma vez precisar de ser chamada directamente pelo cliente (sem
-- p_auth_uid, usando a sua propria auth.uid()), o GRANT a authenticated pode
-- ser reintroduzido -- o guard de p_auth_uid acima continua a proteger esse
-- caso, porque so bloqueia p_auth_uid preenchido por quem nao e service_role.
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_anexar_ficheiro(uuid, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_documento_anexar_ficheiro(uuid, text, text, uuid) IS
'Grava ficheiro_caminho e ficheiro_hash_sha256 num documento que ainda aguarda assinatura (estado=a_aguardar_assinatura) e devolve o ficheiro_caminho ANTERIOR (NULL na 1a vez), para quem fala com o Storage poder apagar o objecto substituido. Exige hr.pessoas.documentos.edit na organizacao do documento. Rejeita qualquer outro estado -- anexar so acontece antes de assinar, e um documento assinado e imutavel por trigger (nunca se sobrescreve; anula-se e emite-se outro). p_auth_uid e explicito (default auth.uid()) para ser chamada por validate-upload (service_role, sem auth.uid() proprio) -- so service_role pode preenche-lo; qualquer outro chamador com p_auth_uid nao-nulo e rejeitado. EXECUTE so a service_role nesta ronda. Audita em pessoas_acessos_sensiveis (campo=documento, accao=alterar).';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_colunas_grant   text[];
  v_esperadas       text[] := ARRAY[
    'id','pessoa_id','organization_id','vinculo_id','modelo_id',
    'tipo','titulo','ficheiro_caminho','ficheiro_hash_sha256',
    'ficheiro_anexado_em','ficheiro_anexado_por',
    'estado','emitido_em','emitido_por',
    'assinado_em','assinado_por_auth_uid',
    'anulado_em','anulado_por','anulado_motivo',
    'deleted_at','deleted_by','created_at','updated_at','created_by','updated_by'
  ];
  v_falta           text[];
  v_a_mais          text[];
  v_funcao_existe   boolean;
BEGIN
  SELECT array_agg(a.attname ORDER BY a.attname) INTO v_colunas_grant
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_documentos')
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attacl IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM unnest(a.attacl) acl
        WHERE acl::text LIKE '%authenticated=r%'
     );

  SELECT array_agg(x ORDER BY x) INTO v_esperadas FROM unnest(v_esperadas) x;

  SELECT array_agg(c) INTO v_falta
    FROM unnest(v_esperadas) c
   WHERE NOT (c = ANY (coalesce(v_colunas_grant, ARRAY[]::text[])));

  SELECT array_agg(c) INTO v_a_mais
    FROM unnest(coalesce(v_colunas_grant, ARRAY[]::text[])) c
   WHERE NOT (c = ANY (v_esperadas));

  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'pessoas_documentos: authenticated NAO tem SELECT nas colunas de metadados %. A lista de GRANT diverge da esperada.', v_falta;
  END IF;

  IF v_a_mais IS NOT NULL THEN
    RAISE EXCEPTION 'pessoas_documentos: authenticated tem SELECT a MAIS nas colunas %. Se corpo_html aparecer aqui, o conteudo deixou de estar fechado.', v_a_mais;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.pessoas_documentos')
       AND a.attname = 'corpo_html'
       AND a.attacl IS NOT NULL
       AND EXISTS (SELECT 1 FROM unnest(a.attacl) acl WHERE acl::text LIKE '%authenticated%')
  ) THEN
    RAISE EXCEPTION 'pessoas_documentos.corpo_html tem ALGUM privilegio para authenticated. Deve continuar completamente fechado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
     WHERE table_schema = 'public' AND table_name = 'pessoas_documentos'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated tem INSERT, UPDATE ou DELETE ao nivel da TABELA em pessoas_documentos -- devia ter zero (so SELECT de coluna).';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_documento_anexar_ficheiro' AND p.pronargs = 4
  ) INTO v_funcao_existe;
  IF NOT v_funcao_existe THEN
    RAISE EXCEPTION 'rpc_hr_documento_anexar_ficheiro(uuid,text,text,uuid) nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_documento_anexar_ficheiro'
       AND pg_get_functiondef(p.oid) LIKE '%has_anew_permission_in_org%'
       AND pg_get_functiondef(p.oid) LIKE '%a_aguardar_assinatura%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_documento_anexar_ficheiro nao parece verificar permissao e estado -- investigar antes de dar por concluido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.pessoas_documentos'::regclass
       AND c.conname = 'pessoas_documentos_ficheiro_hash_formato'
  ) THEN
    RAISE EXCEPTION 'pessoas_documentos_ficheiro_hash_formato nao ficou criada.';
  END IF;

  -- p_auth_uid so pode ser autorizado com base em service_role: a funcao tem
  -- de conter a sua propria verificacao do request.jwt.claims, nao confiar
  -- so no GRANT.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_documento_anexar_ficheiro'
       AND pg_get_functiondef(p.oid) LIKE '%request.jwt.claims%'
       AND pg_get_functiondef(p.oid) LIKE '%service_role%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_documento_anexar_ficheiro nao parece verificar que p_auth_uid so vem de service_role -- investigar antes de dar por concluido.';
  END IF;

  -- EXECUTE nesta ronda e so para service_role: nao ha caminho de UI que
  -- chame esta RPC directamente, so validate-upload.
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'rpc_hr_documento_anexar_ficheiro'
       AND grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_documento_anexar_ficheiro tem EXECUTE para authenticated -- nesta ronda so service_role deve poder chama-la (ver o guard de p_auth_uid no cabecalho).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'rpc_hr_documento_anexar_ficheiro'
       AND grantee = 'service_role'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_documento_anexar_ficheiro nao tem EXECUTE para service_role -- validate-upload nao a conseguiria chamar.';
  END IF;

  RAISE NOTICE 'Guardas passadas: 3 colunas novas com grant de metadados, rpc_hr_documento_anexar_ficheiro criada com verificacao de permissao, estado e guard de p_auth_uid/service_role, EXECUTE so a service_role, corpo_html continua fechado, zero INSERT/UPDATE/DELETE de tabela para authenticated.';
END;
$conferir$;
