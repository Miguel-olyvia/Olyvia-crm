-- ==============================================================================
-- O par de cofres hr-documentos / hr-documentos-quarantine, e as politicas
-- que os fecham.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261123030000 criou pessoas_documentos com ficheiro_caminho sempre NULL,
-- porque nao havia Edge Function de promocao da quarentena. Essa Edge Function
-- (validate-upload) ja existe e ja serve documents/company-logos/media -- esta
-- migracao acrescenta-lhe o terceiro par, para anexar a um documento de RH
-- (ex.: um aditamento assinado a mao) o ficheiro digitalizado.
--
--
-- -- A REGRA NOVA ----------------------------------------------------------------
--
-- hr-documentos-quarantine: o cliente pode fazer INSERT (mesmo padrao de
-- documents-quarantine em 20261103020000), mas so num caminho no formato
-- OBRIGATORIO <organization_id>/<pessoa_id>/<documento_id>/<uuid_minusculo>.<pdf|jpg|jpeg|png>
-- -- as 4 PARTES (as 3 pastas E o nome do ficheiro) impostas pela PROPRIA
-- POLITICA (um unico regex sobre o caminho inteiro), nao por convencao do
-- cliente -- validar so as 3 pastas deixaria o nome do ficheiro livre, e um
-- nome igual ao de um documento ja assinado permitiria fazer upsert por cima
-- do objecto final (ver comentario em validate-upload). A politica exige
-- tambem hr.pessoas.documentos.edit na organizacao da primeira pasta: sem
-- isso, o INSERT na quarentena nem chega a acontecer, e a Edge Function nunca
-- ve o ficheiro. Nao confirma aqui que a pessoa da segunda pasta pertence
-- aquela organizacao -- isso a politica de storage nao consegue ver (pessoas
-- nao e legivel a partir de storage.objects sem uma sub-consulta cara em toda
-- a escrita) -- e por isso e a Edge Function validate-upload que faz essa
-- segunda confirmacao antes de promover, e o RPC de anexar (20261130065000)
-- confirma-a outra vez.
--
-- hr-documentos (final): ESCRITA E LEITURA fechadas ao cliente, as 4 por
-- RESTRICTIVE (insert/update/delete, mesmo padrao de documents/company-logos/
-- media, MAIS select). Ao contrario de hr-justificacoes (que tem uma politica
-- de leitura por pasta+permissao), aqui a leitura e SO por URL assinado de
-- curta duracao, emitido por codigo que verifica a permissao e regista em
-- pessoas_acessos_sensiveis -- nunca por SELECT directo ao bucket. Uma
-- RESTRICTIVE explicita de SELECT, e nao so a ausencia de uma politica
-- permissiva: uma RESTRICTIVE nao pode ser sobreposta por nenhuma politica
-- permissiva futura (ou criada fora de migracoes), a ausencia podia. O
-- service_role, que gera o URL assinado, ignora RLS por completo -- nao e
-- afectado por esta politica.
--
-- Tipos e tamanho: PDF e imagens (jpeg, png), 10 MB -- mesmo tecto de
-- hr-justificacoes. Sem HEIC aqui: validate-upload so sabe confirmar por
-- assinatura binaria os tipos que ja reconhece (detectSignature), e HEIC nao
-- e um deles: aceitar um mime type que a validacao binaria nunca confirma
-- deixaria esse tipo passar sem confirmacao real.
--
--
-- -- O LIMITE DE RAJADA ----------------------------------------------------------
--
-- enforce_upload_burst_rate_limit (20261103020000) protege as tres
-- quarentenas existentes contra um cliente comprometido a inundar o Storage.
-- hr-documentos-quarantine entra na mesma lista -- criar uma quarta quarentena
-- sem a incluir no limite deixava-a de fora da unica defesa contra rajada que
-- existe.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - O RPC que grava ficheiro_caminho/hash em pessoas_documentos: proxima
--   migracao (20261130065000), que tambem estende a Edge Function.
-- - O codigo que emite o URL assinado de leitura: fica para o backend/UI, fora
--   do alcance de uma migracao SQL.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO com os
-- cofres vazios:
--   DROP TRIGGER IF EXISTS enforce_upload_burst_rate_limit ON storage.objects;
--   CREATE TRIGGER enforce_upload_burst_rate_limit BEFORE INSERT ON storage.objects
--     FOR EACH ROW WHEN (NEW.bucket_id IN ('documents-quarantine','company-logos-quarantine','media-quarantine'))
--     EXECUTE FUNCTION public.enforce_upload_burst_rate_limit();
--   -- (e reverter enforce_upload_burst_rate_limit() para a versao anterior do IN-list)
--   DROP POLICY IF EXISTS "hr_documentos_block_select" ON storage.objects;
--   DROP POLICY IF EXISTS "hr_documentos_block_delete" ON storage.objects;
--   DROP POLICY IF EXISTS "hr_documentos_block_update" ON storage.objects;
--   DROP POLICY IF EXISTS "hr_documentos_block_insert" ON storage.objects;
--   DROP POLICY IF EXISTS "hr_documentos_quarentena_insert" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id IN ('hr-documentos','hr-documentos-quarantine');
--
--
-- Prerequisitos:
--   20261123030000  pessoas_documentos (ficheiro_caminho)
--   20261123010000  catalogo hr.pessoas.documentos.* (hr.pessoas.documentos.edit)
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
--   20261103020000  arquitectura de quarentena, enforce_upload_burst_rate_limit
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'O esquema storage nao existe. Estado da base inesperado.';
  END IF;

  IF to_regclass('public.pessoas_documentos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_documentos nao existe. Aplicar 20261123030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.documentos.edit'
  ) THEN
    RAISE EXCEPTION
      'hr.pessoas.documentos.edit nao esta no catalogo. Aplicar 20261123010000 primeiro, senao a politica de quarentena devolve false para todos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents-quarantine') THEN
    RAISE EXCEPTION
      'O bucket documents-quarantine nao existe: a arquitectura de quarentena de 20261103020000 nao esta aplicada. Sem ela nao ha Edge Function que promova hr-documentos-quarantine.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'enforce_upload_burst_rate_limit'
  ) THEN
    RAISE EXCEPTION 'public.enforce_upload_burst_rate_limit() nao existe. Aplicar 20261103020000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- Os dois cofres ---------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'hr-documentos-quarantine',
    'hr-documentos-quarantine',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
  ),
  (
    'hr-documentos',
    'hr-documentos',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
  )
ON CONFLICT (id) DO NOTHING;

-- ---- Quarentena: INSERT do cliente, caminho e permissao impostos por politica --
-- Formato obrigatorio: <organization_id>/<pessoa_id>/<documento_id>/<uuid>.<ext>
-- -- 3 pastas uuid MAIS o nome do ficheiro, que TAMBEM e imposto aqui (uuid
-- minusculo + pdf/jpg/jpeg/png): sem isto o nome do ficheiro seria escolhido
-- livremente pelo cliente, e um nome igual ao de um documento ja assinado
-- (mesma organizacao/pessoa/documento) permitiria fazer upsert por cima do
-- objecto final -- ver o comentario em validate-upload sobre a mesma questao.
-- Os uuid sao exigidos em MINUSCULAS (~ e nao ~*): crypto.randomUUID() no
-- cliente ja produz minusculas, e usar ~* aqui deixaria passar um caminho que
-- validateOrgScope (auth.ts, comparacao de strings sensivel a maiusculas) e a
-- RPC de anexar (idem) depois rejeitam com um 403 confuso.
--
-- A politica valida a FORMA do caminho; nao confirma que a pessoa da 2a pasta
-- pertence a organizacao da 1a -- isso fica para validate-upload, que tem
-- acesso a tabela pessoas (storage.objects nao ve outras tabelas sem uma
-- sub-consulta cara em toda a escrita).
DROP POLICY IF EXISTS "hr_documentos_quarentena_insert" ON storage.objects;
CREATE POLICY "hr_documentos_quarentena_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'hr-documentos-quarantine'
  AND name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png)$'
  )
  AND (SELECT public.has_anew_permission_in_org(
        (SELECT auth.uid()),
        'hr.pessoas.documentos.edit',
        ((storage.foldername(name))[1])::uuid))
);

COMMENT ON POLICY "hr_documentos_quarentena_insert" ON storage.objects IS
'Permite a authenticated fazer INSERT em hr-documentos-quarantine SO num caminho <organization_id>/<pessoa_id>/<documento_id>/<uuid_minusculo>.<pdf|jpg|jpeg|png> (as 4 partes validadas por regex, incluindo o nome do ficheiro -- nao so as 3 pastas) E com hr.pessoas.documentos.edit NA ORGANIZACAO da primeira pasta. Um caminho mal formado, ou sem a permissao, nao chega a ser aceite -- a forma do caminho e imposta aqui, nao por convencao do cliente. Nao confirma que a pessoa da 2a pasta pertence aquela organizacao (storage.objects nao ve pessoas sem uma sub-consulta cara em toda a escrita); essa confirmacao e feita por validate-upload antes de promover.';

-- ---- Final: escrita e leitura fechadas ao cliente ---------------------------
DROP POLICY IF EXISTS "hr_documentos_block_insert" ON storage.objects;
CREATE POLICY "hr_documentos_block_insert"
ON storage.objects
AS RESTRICTIVE FOR INSERT
TO authenticated
WITH CHECK (bucket_id <> 'hr-documentos');

DROP POLICY IF EXISTS "hr_documentos_block_update" ON storage.objects;
CREATE POLICY "hr_documentos_block_update"
ON storage.objects
AS RESTRICTIVE FOR UPDATE
TO authenticated
USING (bucket_id <> 'hr-documentos')
WITH CHECK (bucket_id <> 'hr-documentos');

DROP POLICY IF EXISTS "hr_documentos_block_delete" ON storage.objects;
CREATE POLICY "hr_documentos_block_delete"
ON storage.objects
AS RESTRICTIVE FOR DELETE
TO authenticated
USING (bucket_id <> 'hr-documentos');

-- Ao contrario de hr-justificacoes (que tem uma politica de leitura por
-- pasta+permissao), aqui NAO ha SELECT nenhum para authenticated -- nem por
-- omissao (a mera ausencia de uma politica permissiva ja bastaria, RLS nega
-- por omissao), mas SIM por uma RESTRICTIVE explicita: uma ausencia pode ser
-- desfeita em silencio por uma politica futura ou criada no dashboard: uma
-- RESTRICTIVE nao pode ser sobreposta por nenhuma politica permissiva,
-- presente ou futura. A leitura e SEMPRE por URL assinado de curta duracao,
-- emitido por codigo (nao pela base) que verifica a permissao e regista em
-- pessoas_acessos_sensiveis ANTES de emitir o URL -- URLs assinados sao
-- gerados por service_role, que ignora RLS, por isso nao sao afectados por
-- esta politica.
DROP POLICY IF EXISTS "hr_documentos_block_select" ON storage.objects;
CREATE POLICY "hr_documentos_block_select"
ON storage.objects
AS RESTRICTIVE FOR SELECT
TO authenticated
USING (bucket_id <> 'hr-documentos');

COMMENT ON POLICY "hr_documentos_block_insert" ON storage.objects IS
'O cliente NAO escreve em hr-documentos. RESTRICTIVE com bucket_id <> hr-documentos: nao interfere com os outros buckets. Escrita so por validate-upload, com service_role, depois de validar assinatura binaria, permissao e organizacao.';

COMMENT ON POLICY "hr_documentos_block_update" ON storage.objects IS
'Sem UPDATE de authenticated em hr-documentos. Corrigir um documento significa anular e emitir outro, nunca sobrescrever o ficheiro de um documento assinado.';

COMMENT ON POLICY "hr_documentos_block_select" ON storage.objects IS
'Sem SELECT directo de authenticated em hr-documentos, RESTRICTIVE de proposito (nao apenas ausencia de politica permissiva): garante que nenhuma politica futura, ou criada fora de migracoes, consegue reabrir a leitura directa deste bucket. A leitura e sempre por URL assinado emitido por codigo que verifica a permissao e audita em pessoas_acessos_sensiveis.';

-- ---- Limite de rajada: hr-documentos-quarantine entra na lista --------------
CREATE OR REPLACE FUNCTION public.enforce_upload_burst_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_window interval := interval '1 minute';
  v_max_objects integer := 20;
  v_max_bytes bigint := 104857600; -- 100MB per user per window, across the limited buckets
  v_recent_count integer;
  v_recent_bytes bigint;
  v_new_size bigint;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_size := COALESCE((NEW.metadata->>'size')::bigint, 0);

  SELECT count(*), COALESCE(sum((metadata->>'size')::bigint), 0)
  INTO v_recent_count, v_recent_bytes
  FROM storage.objects
  WHERE owner = v_uid
    AND bucket_id IN ('documents-quarantine', 'company-logos-quarantine', 'media-quarantine', 'hr-documentos-quarantine')
    AND created_at > now() - v_window;

  IF v_recent_count + 1 > v_max_objects OR v_recent_bytes + v_new_size > v_max_bytes THEN
    RAISE EXCEPTION 'upload_burst_rate_limit_exceeded: max % uploads or % bytes per % per user'
      , v_max_objects, v_max_bytes, v_window
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Postgres has no ALTER TRIGGER ... WHEN, so the trigger is recreated over the
-- function above with an updated WHEN clause including hr-documentos-quarantine.
DROP TRIGGER IF EXISTS enforce_upload_burst_rate_limit ON storage.objects;
CREATE TRIGGER enforce_upload_burst_rate_limit
BEFORE INSERT ON storage.objects
FOR EACH ROW
WHEN (NEW.bucket_id IN ('documents-quarantine', 'company-logos-quarantine', 'media-quarantine', 'hr-documentos-quarantine'))
EXECUTE FUNCTION public.enforce_upload_burst_rate_limit();

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_publico_q boolean;
  v_publico_f boolean;
  v_limite_q  bigint;
  v_limite_f  bigint;
  v_mimes_q   text;
  v_mimes_f   text;
  v_pol_q     integer;
  v_pol_f     integer;
  v_pol_select_f integer;
  v_trg_def   text;
BEGIN
  SELECT b.public, b.file_size_limit, coalesce(array_to_string(b.allowed_mime_types, ','), '')
    INTO v_publico_q, v_limite_q, v_mimes_q
    FROM storage.buckets b WHERE b.id = 'hr-documentos-quarantine';

  SELECT b.public, b.file_size_limit, coalesce(array_to_string(b.allowed_mime_types, ','), '')
    INTO v_publico_f, v_limite_f, v_mimes_f
    FROM storage.buckets b WHERE b.id = 'hr-documentos';

  IF v_publico_q IS NULL OR v_publico_f IS NULL THEN
    RAISE EXCEPTION 'Um dos dois cofres hr-documentos(-quarantine) nao ficou criado.';
  END IF;

  IF v_publico_q IS DISTINCT FROM false OR v_publico_f IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'hr-documentos ou hr-documentos-quarantine ficou PUBLICO. Contem documentos de RH: um bucket publico e uma fuga por URL.';
  END IF;

  IF coalesce(v_limite_q, 0) <= 0 OR v_limite_q > 10485760 OR coalesce(v_limite_f, 0) <= 0 OR v_limite_f > 10485760 THEN
    RAISE EXCEPTION 'O limite de tamanho de hr-documentos(-quarantine) nao e 10 MB como esperado.';
  END IF;

  IF v_mimes_q = '' OR v_mimes_f = '' THEN
    RAISE EXCEPTION 'Um dos dois cofres ficou sem allowed_mime_types. Sem restricao de tipo, aceita executaveis.';
  END IF;

  SELECT count(*) INTO v_pol_q FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'hr_documentos_quarentena_insert';
  IF v_pol_q <> 1 THEN
    RAISE EXCEPTION 'Esperava-se a politica hr_documentos_quarentena_insert, encontraram-se %.', v_pol_q;
  END IF;

  SELECT count(*) INTO v_pol_f FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('hr_documentos_block_insert','hr_documentos_block_update','hr_documentos_block_delete','hr_documentos_block_select');
  IF v_pol_f <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se as 4 politicas de bloqueio de hr-documentos (insert/update/delete/select), encontraram-se %.', v_pol_f;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('hr_documentos_block_insert','hr_documentos_block_update','hr_documentos_block_delete','hr_documentos_block_select')
       AND permissive <> 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'Alguma das politicas de bloqueio de hr-documentos nao e RESTRICTIVE -- permissiva, nao fecha nada.';
  END IF;

  -- A politica de bloqueio de SELECT tem de existir, ser RESTRICTIVE, e
  -- cobrir mesmo hr-documentos (nao confundir com hr-documentos-quarantine).
  SELECT count(*) INTO v_pol_select_f FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'hr_documentos_block_select'
     AND cmd IN ('SELECT', 'ALL')
     AND coalesce(qual, '') LIKE '%hr-documentos%';
  IF v_pol_select_f <> 1 THEN
    RAISE EXCEPTION 'A politica hr_documentos_block_select nao existe ou nao bloqueia hr-documentos. A leitura tem de ser so por URL assinado, nunca por SELECT directo.';
  END IF;

  -- FOR INSERT nao tem USING (qual e NULL): a condicao vive em with_check.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'hr_documentos_quarentena_insert'
       AND coalesce(with_check,'') LIKE '%hr.pessoas.documentos.edit%'
       AND coalesce(with_check,'') LIKE '%foldername%'
  ) THEN
    RAISE EXCEPTION 'A politica de insercao na quarentena nao exige hr.pessoas.documentos.edit sobre a organizacao da primeira pasta do caminho.';
  END IF;

  -- O nome do ficheiro tem de ser validado tambem (uuid + extensao), nao so
  -- as 3 pastas -- senao um nome escolhido livremente pelo cliente permite
  -- upsert por cima do objecto final de um documento ja assinado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'hr_documentos_quarentena_insert'
       AND coalesce(with_check,'') LIKE '%pdf|jpg|jpeg|png%'
  ) THEN
    RAISE EXCEPTION 'A politica de insercao na quarentena nao valida a forma do nome do ficheiro (uuid + extensao).';
  END IF;

  SELECT pg_get_triggerdef(t.oid) INTO v_trg_def
    FROM pg_trigger t
   WHERE t.tgrelid = 'storage.objects'::regclass
     AND t.tgname = 'enforce_upload_burst_rate_limit';

  IF v_trg_def IS NULL OR v_trg_def NOT LIKE '%hr-documentos-quarantine%' THEN
    RAISE EXCEPTION 'O limite de rajada nao inclui hr-documentos-quarantine.';
  END IF;

  RAISE NOTICE 'Conferido: hr-documentos e hr-documentos-quarantine privados, com limite e tipos, quarentena impondo caminho (incl. nome do ficheiro)+permissao por politica, final bloqueado por RESTRICTIVE em INSERT/UPDATE/DELETE/SELECT, e no limite de rajada.';
END;
$conferir$;
