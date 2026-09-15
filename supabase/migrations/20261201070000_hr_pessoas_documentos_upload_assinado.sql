-- ==============================================================================
-- Segundo caminho de criar um documento de RH: anexar directamente um
-- contrato ja assinado em papel, fora do sistema -- sem passar por modelo,
-- sem assinatura dentro da app pelo colaborador.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Ate agora so ha UMA forma de criar um documento (rpc_hr_documento_emitir,
-- 20261123030000): sempre a partir de um modelo, sempre a comecar em
-- a_aguardar_assinatura para SER ASSINADO DENTRO DA APP pela propria pessoa
-- (rpc_hr_documento_assinar). RH tambem precisa de um segundo caminho: um
-- contrato ja assinado em papel, fora do sistema -- RH so anexa o PDF e
-- regista que ja veio assinado. Nao ha modelo nenhum por tras, e nao e o
-- colaborador que assina dentro da app.
--
--
-- -- assinatura_origem -- A DISTINCAO ENTRE OS DOIS CAMINHOS -------------------
--
-- Coluna nova em pessoas_documentos, so tem sentido depois de assinado:
--   NULL     -- ainda nao assinado, ou documento legado anterior a esta coluna.
--   'interna' -- assinado DENTRO da app pela propria pessoa (rpc_hr_documento_assinar).
--   'externa' -- ja vinha assinado em papel; RH so registou e anexou o ficheiro
--              (rpc_hr_documento_registar_assinatura_externa).
-- rpc_hr_documento_assinar passa a gravar 'interna' no MESMO UPDATE que ja
-- fazia -- nenhuma outra regra dessa funcao muda.
--
--
-- -- OS DOIS PASSOS DO CAMINHO EXTERNO -------------------------------------------
--
-- 1) rpc_hr_documento_upload_assinado_criar cria a linha (sem modelo,
--    corpo_html com um texto fixo a apontar para o ficheiro anexo,
--    estado=a_aguardar_assinatura) -- exige hr.pessoas.documentos.emitir,
--    a MESMA permissao que ja abre a emissao por modelo.
-- 2) O ficheiro anexa-se pelo caminho JA EXISTENTE, sem tocar nele:
--    rpc_hr_documento_anexar_ficheiro (20261130065000), via validate-upload
--    -- ja aceita estado=a_aguardar_assinatura, que e exactamente o estado em
--    que a linha nasce aqui.
-- 3) rpc_hr_documento_registar_assinatura_externa fecha o ciclo: so aceita
--    a_aguardar_assinatura E ficheiro_caminho JA preenchido -- "confirma a
--    assinatura" sem ficheiro anexado seria confirmar uma promessa, nao um
--    facto. assinado_por_auth_uid fica NULL DE PROPOSITO: ninguem assinou
--    dentro da app, seria falso registar um auth.uid() ali.
--
-- Depois disto a linha fica imutavel pelo trigger JA EXISTENTE
-- (hr_documentos_assinado_imutavel, 20261123030000) -- nao se toca nele.
--
--
-- -- PORQUE hr.pessoas.documentos.emitir, E NAO .edit -----------------------
--
-- Criar um documento por upload e a mesma classe de accao que emitir por
-- modelo -- "criar um documento novo para esta pessoa" -- por isso reaproveita
-- a MESMA permissao de rpc_hr_documento_emitir. hr.pessoas.documentos.edit
-- continua sem uso nesta ronda (ver a nota de 20261123030000: fica no
-- catalogo para uma decisao de produto futura, nao e usada por proposito).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.rpc_hr_documento_registar_assinatura_externa(uuid);
--   DROP FUNCTION IF EXISTS public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text);
--   ALTER TABLE public.pessoas_documentos DROP COLUMN IF EXISTS assinatura_origem;
-- Isto perde a distincao interna/externa de qualquer documento ja assinado,
-- e a possibilidade de criar documentos por upload. Exportar antes.
--
--
-- Prerequisitos:
--   20261123030000  pessoas_documentos, rpc_hr_documento_assinar,
--                   hr_documentos_assinado_imutavel
--   20261130065000  rpc_hr_documento_anexar_ficheiro (nao se toca aqui)
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
--   20261120040000  hr_registar_acesso_sensivel(uuid, uuid, text, text)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_documentos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_documentos nao existe. Aplicar 20261123030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_documento_assinar' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'rpc_hr_documento_assinar(uuid) nao existe. Aplicar 20261123030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.pessoas_documentos'::regclass
       AND t.tgname = 'trg_pessoas_documentos_assinado_imutavel'
  ) THEN
    RAISE EXCEPTION 'trg_pessoas_documentos_assinado_imutavel nao existe. Aplicar 20261123030000 primeiro -- as RPCs desta migracao dependem dele.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.pessoas_documentos')
       AND a.attname = 'assinatura_origem'
       AND NOT a.attisdropped
  ) THEN
    RAISE NOTICE 'pessoas_documentos.assinatura_origem ja existe -- ADD COLUMN IF NOT EXISTS abaixo e um no-op.';
  END IF;
END;
$guardas$;

-- ---- A coluna nova ----------------------------------------------------------
ALTER TABLE public.pessoas_documentos
  ADD COLUMN IF NOT EXISTS assinatura_origem text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_documentos_assinatura_origem_valida'
       AND conrelid = 'public.pessoas_documentos'::regclass
  ) THEN
    ALTER TABLE public.pessoas_documentos
      ADD CONSTRAINT pessoas_documentos_assinatura_origem_valida
      CHECK (assinatura_origem IS NULL OR assinatura_origem IN ('interna', 'externa'));
  END IF;
END;
$constraint$;

COMMENT ON COLUMN public.pessoas_documentos.assinatura_origem IS
'NULL enquanto nao assinado, ou documento legado anterior a esta coluna. ''interna'' = assinado DENTRO da app pela propria pessoa (rpc_hr_documento_assinar). ''externa'' = ja vinha assinado em papel fora do sistema; RH so registou e anexou o ficheiro (rpc_hr_documento_registar_assinatura_externa). Nao se infere do resto da linha -- e o unico registo de qual dos dois caminhos assinou este documento.';

-- ---- Grants: a coluna nova junta-se aos metadados legiveis ------------------
-- Repete o REVOKE ALL + GRANT SELECT inteiro, nao um GRANT incremental --
-- mesma disciplina de 20261130065000, para o bloco de conferir poder
-- comparar a lista toda contra o que espera.
REVOKE ALL ON TABLE public.pessoas_documentos FROM anon;
REVOKE ALL ON TABLE public.pessoas_documentos FROM authenticated;

GRANT SELECT (
  id, pessoa_id, organization_id, vinculo_id, modelo_id,
  tipo, titulo, ficheiro_caminho, ficheiro_hash_sha256,
  ficheiro_anexado_em, ficheiro_anexado_por,
  estado, emitido_em, emitido_por,
  assinado_em, assinado_por_auth_uid, assinatura_origem,
  anulado_em, anulado_por, anulado_motivo,
  deleted_at, deleted_by, created_at, updated_at, created_by, updated_by
) ON TABLE public.pessoas_documentos TO authenticated;

GRANT ALL ON TABLE public.pessoas_documentos TO service_role;

-- ==============================================================================
-- rpc_hr_documento_assinar (20261123030000) -- MESMA assinatura, ganha so
-- assinatura_origem='interna' no UPDATE que ja fazia. Nenhuma outra regra
-- muda: identidade, permissao, estado exigido, IP/user-agent do cabecalho,
-- auditoria -- tudo igual.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_documento_assinar(
  p_documento_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth       uuid := auth.uid();
  v_doc        public.pessoas_documentos%ROWTYPE;
  v_pessoa_do_utilizador uuid;
  v_headers    json;
  v_ip         inet;
  v_user_agent text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_assinar exige um utilizador autenticado.';
  END IF;

  SELECT * INTO v_doc
    FROM public.pessoas_documentos
   WHERE id = p_documento_id AND deleted_at IS NULL
   FOR UPDATE;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento % nao encontrado ou apagado.', p_documento_id;
  END IF;

  v_pessoa_do_utilizador := public.hr_pessoa_do_utilizador(v_auth, v_doc.organization_id);

  IF v_pessoa_do_utilizador IS NULL THEN
    RAISE EXCEPTION 'Nao ha ficha ligada a esta conta nesta organizacao; nao ha nada para assinar.';
  END IF;

  IF v_doc.pessoa_id IS DISTINCT FROM v_pessoa_do_utilizador THEN
    RAISE EXCEPTION 'So a propria pessoa pode assinar este documento.';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.view.own', v_doc.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao para assinar documentos proprios.';
  END IF;

  IF v_doc.estado <> 'a_aguardar_assinatura' THEN
    RAISE EXCEPTION 'Documento % nao esta a aguardar assinatura (estado actual: %).', p_documento_id, v_doc.estado;
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  BEGIN
    v_ip := nullif(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1), '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  v_user_agent := v_headers->>'user-agent';

  UPDATE public.pessoas_documentos
     SET estado = 'assinado',
         assinado_em = now(),
         assinado_por_auth_uid = v_auth,
         assinatura_ip = v_ip,
         assinatura_user_agent = v_user_agent,
         assinatura_origem = 'interna',
         updated_by = (SELECT au.id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1)
   WHERE id = p_documento_id;

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'alterar');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_documento_assinar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_assinar(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_assinar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_assinar(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_documento_assinar(uuid) IS
'Assina um documento em nome da propria pessoa (hr_pessoa_do_utilizador): confirma identidade, exige estado=a_aguardar_assinatura, grava assinado_em/assinado_por_auth_uid/assinatura_ip/assinatura_user_agent (do cabecalho do pedido, nunca de parametro do cliente) e assinatura_origem=''interna'' (desde 20261201070000 -- distingue de ''externa'', registada por rpc_hr_documento_registar_assinatura_externa), e passa a assinado. Depois desta chamada a linha fica imutavel por trigger (hr_documentos_assinado_imutavel), mesmo para service_role. Audita em pessoas_acessos_sensiveis (campo=documento, accao=alterar).';

-- ==============================================================================
-- RPC nova 1: criar um documento por upload -- sem modelo, sem assinatura na
-- app. Nasce a_aguardar_assinatura, tal como rpc_hr_documento_emitir; o
-- ficheiro anexa-se a seguir pelo caminho JA EXISTENTE
-- (rpc_hr_documento_anexar_ficheiro / validate-upload).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_documento_upload_assinado_criar(
  p_pessoa_id  uuid,
  p_vinculo_id uuid,
  p_tipo       text,
  p_titulo     text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth       uuid := auth.uid();
  v_pessoa_org uuid;
  v_criado_por uuid;
  v_novo_id    uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_upload_assinado_criar exige um utilizador autenticado.';
  END IF;

  SELECT p.organization_id INTO v_pessoa_org
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id;

  IF v_pessoa_org IS NULL THEN
    RAISE EXCEPTION 'Pessoa % nao encontrada.', p_pessoa_id;
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.emitir', v_pessoa_org) THEN
    RAISE EXCEPTION 'Sem permissao hr.pessoas.documentos.emitir na organizacao da pessoa.';
  END IF;

  -- Mesma verificacao que a FK composta pessoas_documentos_vinculo_fkey
  -- (20261123030000) ja impoe no INSERT abaixo, mas com uma mensagem clara
  -- ANTES de gastar esse INSERT -- um erro de FK generico nao diria "o
  -- vinculo e de outra pessoa".
  IF p_vinculo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pessoas_vinculos v
     WHERE v.id = p_vinculo_id
       AND v.pessoa_id = p_pessoa_id
       AND v.organization_id = v_pessoa_org
  ) THEN
    RAISE EXCEPTION 'O vinculo % nao pertence a pessoa % nesta organizacao.', p_vinculo_id, p_pessoa_id;
  END IF;

  IF p_tipo IS NULL OR p_tipo NOT IN ('contrato', 'adenda', 'declaracao', 'recibo', 'outro') THEN
    RAISE EXCEPTION 'p_tipo tem de ser um de: contrato, adenda, declaracao, recibo, outro.';
  END IF;

  IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN
    RAISE EXCEPTION 'p_titulo nao pode ser vazio.';
  END IF;

  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  INSERT INTO public.pessoas_documentos (
    pessoa_id, organization_id, vinculo_id, modelo_id,
    tipo, titulo, corpo_html,
    estado, emitido_em, emitido_por,
    created_by, updated_by
  ) VALUES (
    p_pessoa_id, v_pessoa_org, p_vinculo_id, NULL,
    p_tipo, p_titulo,
    '— documento anexado directamente, sem modelo; ver ficheiro anexo —',
    'a_aguardar_assinatura', now(), v_criado_por,
    v_criado_por, v_criado_por
  )
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text) IS
'Cria um documento sem modelo (modelo_id NULL, corpo_html com um texto fixo a apontar para o ficheiro anexo), estado=a_aguardar_assinatura -- o primeiro passo do caminho "anexar contrato ja assinado em papel". Exige hr.pessoas.documentos.emitir na organizacao da pessoa (a MESMA permissao que ja abre a emissao por modelo). Confirma p_vinculo_id (quando preenchido) pertence a esta pessoa/organizacao. O ficheiro anexa-se a seguir pelo caminho JA EXISTENTE (rpc_hr_documento_anexar_ficheiro via validate-upload); esta RPC nao toca em ficheiro_caminho. SECURITY DEFINER: escreve em pessoas_documentos apesar de INSERT estar bloqueado a authenticated por politica.';

-- ==============================================================================
-- RPC nova 2: registar que o documento ja veio assinado em papel -- so depois
-- de o ficheiro estar anexado. assinado_por_auth_uid fica NULL DE PROPOSITO.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_documento_registar_assinatura_externa(
  p_documento_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_doc  public.pessoas_documentos%ROWTYPE;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_registar_assinatura_externa exige um utilizador autenticado.';
  END IF;

  SELECT * INTO v_doc
    FROM public.pessoas_documentos
   WHERE id = p_documento_id AND deleted_at IS NULL
   FOR UPDATE;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento % nao encontrado ou apagado.', p_documento_id;
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.emitir', v_doc.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.pessoas.documentos.emitir na organizacao do documento.';
  END IF;

  IF v_doc.estado <> 'a_aguardar_assinatura' THEN
    RAISE EXCEPTION 'Documento % nao esta a aguardar assinatura (estado actual: %).', p_documento_id, v_doc.estado;
  END IF;

  -- Nao se pode "confirmar assinatura" sem o ficheiro ja anexado -- seria
  -- confirmar uma promessa, nao um facto ja acontecido.
  IF v_doc.ficheiro_caminho IS NULL THEN
    RAISE EXCEPTION 'Anexa primeiro o ficheiro assinado antes de confirmar.';
  END IF;

  UPDATE public.pessoas_documentos
     SET estado = 'assinado',
         assinado_em = now(),
         assinatura_origem = 'externa',
         updated_by = (SELECT au.id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1)
   WHERE id = p_documento_id;
  -- assinado_por_auth_uid NAO se preenche: ninguem assinou dentro da app.

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'alterar');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_documento_registar_assinatura_externa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_registar_assinatura_externa(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_registar_assinatura_externa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_registar_assinatura_externa(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_documento_registar_assinatura_externa(uuid) IS
'Segundo passo do caminho "anexar contrato ja assinado em papel": exige hr.pessoas.documentos.emitir na organizacao do documento, exige estado=a_aguardar_assinatura E ficheiro_caminho JA preenchido (erro claro "Anexa primeiro o ficheiro assinado antes de confirmar." se nao), grava estado=assinado/assinado_em/assinatura_origem=''externa''. assinado_por_auth_uid fica NULL de proposito -- ninguem assinou dentro da app. Depois desta chamada a linha fica imutavel por trigger (hr_documentos_assinado_imutavel), sem nenhuma alteracao a esse trigger. Audita em pessoas_acessos_sensiveis (campo=documento, accao=alterar).';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
BEGIN
  DECLARE
    v_colunas_grant   text[];
    v_esperadas       text[] := ARRAY[
      'id','pessoa_id','organization_id','vinculo_id','modelo_id',
      'tipo','titulo','ficheiro_caminho','ficheiro_hash_sha256',
      'ficheiro_anexado_em','ficheiro_anexado_por',
      'estado','emitido_em','emitido_por',
      'assinado_em','assinado_por_auth_uid','assinatura_origem',
      'anulado_em','anulado_por','anulado_motivo',
      'deleted_at','deleted_by','created_at','updated_at','created_by','updated_by'
    ];
    v_falta           text[];
    v_a_mais          text[];
    v_def_assinar     text;
    v_org_nike        uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
    v_uid_real        uuid;
    v_pessoa_teste    uuid;
    v_doc_id          uuid;
    v_estado          text;
    v_modelo_id       uuid;
    v_corpo           text;
    v_falhou_sem_ficheiro boolean := false;
    v_falhou_imutavel     boolean := false;
    v_origem          text;
    v_assinado_por    uuid;
  BEGIN
    -- 1) authenticated continua com exactamente os metadados esperados,
    -- assinatura_origem incluida, corpo_html continua fechado.
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
      RAISE EXCEPTION 'pessoas_documentos: authenticated NAO tem SELECT nas colunas %.', v_falta
        USING ERRCODE = 'HR901';
    END IF;

    IF v_a_mais IS NOT NULL THEN
      RAISE EXCEPTION 'pessoas_documentos: authenticated tem SELECT a MAIS nas colunas %.', v_a_mais
        USING ERRCODE = 'HR902';
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = to_regclass('public.pessoas_documentos')
         AND a.attname = 'corpo_html'
         AND a.attacl IS NOT NULL
         AND EXISTS (SELECT 1 FROM unnest(a.attacl) acl WHERE acl::text LIKE '%authenticated%')
    ) THEN
      RAISE EXCEPTION 'pessoas_documentos.corpo_html tem ALGUM privilegio para authenticated -- deve continuar completamente fechado.'
        USING ERRCODE = 'HR903';
    END IF;

    -- 2) rpc_hr_documento_assinar continua a gravar assinatura_origem, no
    -- ramo interna. Estrutural: a identidade e a permissao exigidas para
    -- exercitar esta funcao ao vivo dependem de a conta ter ficha ligada na
    -- organizacao (hr_pessoa_do_utilizador) -- nao se fabrica essa ligacao
    -- so para este teste.
    SELECT pg_get_functiondef('public.rpc_hr_documento_assinar(uuid)'::regprocedure)
      INTO v_def_assinar;

    IF position('assinatura_origem' IN v_def_assinar) = 0
       OR position('''interna''' IN v_def_assinar) = 0 THEN
      RAISE EXCEPTION 'rpc_hr_documento_assinar nao parece gravar assinatura_origem=''interna'' -- investigar antes de dar por concluido.'
        USING ERRCODE = 'HR904';
    END IF;

    -- 3) As duas RPCs novas existem com o EXECUTE certo.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
       WHERE routine_schema = 'public' AND routine_name = 'rpc_hr_documento_upload_assinado_criar'
         AND grantee = 'authenticated'
    ) THEN
      RAISE EXCEPTION 'rpc_hr_documento_upload_assinado_criar sem EXECUTE para authenticated.'
        USING ERRCODE = 'HR905';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
       WHERE routine_schema = 'public' AND routine_name = 'rpc_hr_documento_upload_assinado_criar'
         AND grantee = 'anon'
    ) THEN
      RAISE EXCEPTION 'rpc_hr_documento_upload_assinado_criar tem EXECUTE para anon -- nunca deveria.'
        USING ERRCODE = 'HR906';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
       WHERE routine_schema = 'public' AND routine_name = 'rpc_hr_documento_registar_assinatura_externa'
         AND grantee = 'authenticated'
    ) THEN
      RAISE EXCEPTION 'rpc_hr_documento_registar_assinatura_externa sem EXECUTE para authenticated.'
        USING ERRCODE = 'HR907';
    END IF;

    -- 4) Teste ao vivo, contra a organizacao nike, com um utilizador REAL que
    -- ja tenha hr.pessoas.documentos.emitir nessa organizacao -- e uma pessoa
    -- descartavel, fabricada dentro da nike so para este teste. Tudo desfeito
    -- pela subtransacao implicita deste bloco (sentinela HR900 no fim).
    SELECT u.id INTO v_uid_real
      FROM auth.users u
     WHERE public.has_anew_permission_in_org(u.id, 'hr.pessoas.documentos.emitir', v_org_nike)
     LIMIT 1;

    IF v_uid_real IS NULL THEN
      RAISE NOTICE 'PASSO 4 SALTADO: nenhum utilizador com hr.pessoas.documentos.emitir na nike foi encontrado -- o caminho de upload/assinatura externa nao foi exercitado ao vivo nesta migracao (so as verificacoes estruturais e de grants correram).';
    ELSE
      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
      VALUES (v_org_nike, 'Teste Migracao', 'UploadAssinado 20261201070000')
      RETURNING id INTO v_pessoa_teste;

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid_real, 'role', 'authenticated')::text, true);

      -- 4.1: criar por upload -- sem modelo, a_aguardar_assinatura.
      SELECT public.rpc_hr_documento_upload_assinado_criar(
        v_pessoa_teste, NULL, 'contrato', 'Teste upload assinado 20261201070000'
      ) INTO v_doc_id;

      SELECT estado, modelo_id, corpo_html INTO v_estado, v_modelo_id, v_corpo
        FROM public.pessoas_documentos WHERE id = v_doc_id;

      IF v_estado <> 'a_aguardar_assinatura' OR v_modelo_id IS NOT NULL OR v_corpo IS NULL THEN
        RAISE EXCEPTION 'rpc_hr_documento_upload_assinado_criar nao criou a linha como esperado (estado=%, modelo_id=%, corpo_html nulo=%).',
          v_estado, v_modelo_id, (v_corpo IS NULL)
          USING ERRCODE = 'HR910';
      END IF;

      -- 4.2: registar assinatura externa SEM ficheiro anexado -- tem de falhar
      -- com a mensagem clara, nao com um erro generico.
      BEGIN
        PERFORM public.rpc_hr_documento_registar_assinatura_externa(v_doc_id);
      EXCEPTION
        WHEN OTHERS THEN
          IF position('Anexa primeiro o ficheiro assinado' IN SQLERRM) > 0 THEN
            v_falhou_sem_ficheiro := true;
          ELSE
            RAISE;
          END IF;
      END;

      IF NOT v_falhou_sem_ficheiro THEN
        RAISE EXCEPTION 'rpc_hr_documento_registar_assinatura_externa nao rejeitou um documento sem ficheiro anexado.'
          USING ERRCODE = 'HR911';
      END IF;

      -- 4.3: simula o anexo do ficheiro por UPDATE directo como dono da
      -- migracao (a Edge Function real, validate-upload, nao corre dentro de
      -- uma migracao) -- so para este teste.
      PERFORM set_config('request.jwt.claims', NULL, true);

      UPDATE public.pessoas_documentos
         SET ficheiro_caminho = v_org_nike::text || '/' || v_pessoa_teste::text || '/' || v_doc_id::text || '/00000000-0000-0000-0000-000000000000.pdf',
             ficheiro_hash_sha256 = repeat('0', 64)
       WHERE id = v_doc_id;

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid_real, 'role', 'authenticated')::text, true);

      -- 4.4: agora com sucesso.
      PERFORM public.rpc_hr_documento_registar_assinatura_externa(v_doc_id);

      SELECT estado, assinatura_origem, assinado_por_auth_uid
        INTO v_estado, v_origem, v_assinado_por
        FROM public.pessoas_documentos WHERE id = v_doc_id;

      IF v_estado <> 'assinado' OR v_origem <> 'externa' OR v_assinado_por IS NOT NULL THEN
        RAISE EXCEPTION 'rpc_hr_documento_registar_assinatura_externa nao deixou o documento no estado esperado (estado=%, assinatura_origem=%, assinado_por_auth_uid=%).',
          v_estado, v_origem, v_assinado_por
          USING ERRCODE = 'HR912';
      END IF;

      -- 4.5: imutabilidade a seguir -- um UPDATE trivial tem de ser rejeitado
      -- pelo trigger JA EXISTENTE, sem nenhuma excepcao aberta por esta
      -- migracao.
      PERFORM set_config('request.jwt.claims', NULL, true);
      BEGIN
        UPDATE public.pessoas_documentos SET titulo = 'tentativa de reescrever' WHERE id = v_doc_id;
        v_falhou_imutavel := false;
      EXCEPTION
        WHEN OTHERS THEN
          v_falhou_imutavel := true;
      END;

      IF NOT v_falhou_imutavel THEN
        RAISE EXCEPTION 'Um documento assinado por esta migracao nao ficou imutavel -- o trigger hr_documentos_assinado_imutavel nao rejeitou o UPDATE.'
          USING ERRCODE = 'HR913';
      END IF;
    END IF;

    PERFORM set_config('request.jwt.claims', NULL, true);

    -- Todas as assercoes passaram: forcar o desfazer da pessoa e do documento
    -- de teste (quando o passo 4 correu), com o sentinela de sucesso
    -- convencionado (HR900, o mesmo de 20261130180000/20261130200000/20261201040000).
    RAISE EXCEPTION 'teste_documentos_upload_assinado_20261201070000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, dados de teste desfeitos pela subtransacao implicita
    WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claims', NULL, true);
      RAISE EXCEPTION
        'Um dos testes desta migracao (upload de contrato ja assinado / assinatura externa) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'OK: pessoas_documentos.assinatura_origem com CHECK e grant de metadados, rpc_hr_documento_assinar grava assinatura_origem=interna (confirmado estruturalmente), rpc_hr_documento_upload_assinado_criar e rpc_hr_documento_registar_assinatura_externa criadas com EXECUTE certo (authenticated/service_role, nunca anon) -- exercitadas ao vivo contra a nike quando havia utilizador com a permissao, dados de teste desfeitos pela subtransacao.';
END;
$conferir$;
