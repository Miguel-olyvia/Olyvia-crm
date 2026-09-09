-- ==============================================================================
-- O bucket hr-justificacoes, e as politicas que o fecham.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Um atestado medico e um ficheiro. Um ficheiro tem de viver no Storage, nao na
-- base -- mas um bucket com atestados medicos e o pior sitio possivel para uma
-- politica larga.
--
-- E ha uma arquitectura em vigor que nao se contraria: 20261103020000 introduziu
-- QUARENTENA. O cliente NAO insere nos buckets reais; carrega num bucket
-- "-quarantine" e uma Edge Function com service_role valida a assinatura
-- binaria e so depois move o objecto para o bucket final.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Bucket hr-justificacoes: public = false, limite de 10 MB, tipos restritos a
-- PDF, JPEG, PNG e HEIC.
--
-- Caminho OBRIGATORIO: <organization_id>/<pessoa_id>/<falta_id>/<uuid>.<ext>.
-- O ambito organizacional e a PRIMEIRA PASTA, e e isso que a politica de SELECT
-- le -- (storage.foldername(name))[1] convertido em uuid e passado a
-- has_anew_permission_in_org.
--
-- SEM ramo de ficha-propria na politica de Storage, e e deliberado: o
-- trabalhador ve o seu ficheiro por URL ASSINADO emitido por codigo com
-- permissao verificada, nao por leitura directa do bucket. Cruzar
-- (storage.foldername(name))[2] com hr_pessoa_do_utilizador significaria que um
-- caminho mal formado abria a porta -- e o caminho e escrito por codigo, mas a
-- politica nao tem como o garantir. O objecto e opaco; quem decide e sempre
-- codigo.
--
-- E O INSERT ESTA BLOQUEADO AO CLIENTE, nesta ronda. INSERT, UPDATE e DELETE em
-- hr-justificacoes ficam AS RESTRICTIVE ... false para authenticated, e a
-- escrita e de service_role.
--
-- CONSEQUENCIA, DITA AS CLARAS: ate existir a Edge Function de upload
-- (quarentena -> scan -> promocao), NAO SE ANEXA FICHEIRO NENHUM. A falta
-- justifica-se por texto, documento_ref e tipo_documento, que e o que a maior
-- parte dos casos precisa. Prefere-se a lacuna assumida a abrir um bucket com
-- atestados medicos ao INSERT directo do browser.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A Edge Function de upload e a de URL assinado. Ronda propria.
-- - O bucket de quarentena correspondente (hr-justificacoes-quarantine): nao se
--   cria agora porque nao ha ainda funcao que promova objectos, e um bucket de
--   quarentena aberto ao INSERT sem nada que o esvazie e so um sitio onde
--   acumular ficheiros nao verificados.
-- - Nao se toca nos buckets existentes nem nas politicas de 20261103020000.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO com o bucket
-- vazio:
--   DROP POLICY "hr_justificacoes_block_delete" ON storage.objects;
--   DROP POLICY "hr_justificacoes_block_update" ON storage.objects;
--   DROP POLICY "hr_justificacoes_block_insert" ON storage.objects;
--   DROP POLICY "hr_justificacoes_select" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'hr-justificacoes';
--
--
-- Prerequisitos:
--   20261121210000  pessoas_faltas_justificacoes (as colunas do ficheiro)
--   20261121140000  hr.assiduidade.justificacao.view no catalogo
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'O esquema storage nao existe. Estado da base inesperado.';
  END IF;

  IF to_regclass('public.pessoas_faltas_justificacoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_faltas_justificacoes nao existe. Aplicar 20261121210000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_faltas_justificacoes'
       AND column_name = 'ficheiro_path'
  ) THEN
    RAISE EXCEPTION 'pessoas_faltas_justificacoes nao tem ficheiro_path. Este bucket nao serve para nada sem ela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.justificacao.view'
  ) THEN
    RAISE EXCEPTION
      'hr.assiduidade.justificacao.view nao esta no catalogo. Aplicar 20261121140000 primeiro, senao a politica de leitura do bucket devolve false para todos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000.';
  END IF;

  -- A arquitectura de quarentena tem de estar em vigor: e nela que esta
  -- migracao se apoia para NAO abrir o INSERT ao cliente.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents-quarantine') THEN
    RAISE NOTICE
      'O bucket documents-quarantine nao existe: a arquitectura de quarentena de 20261103020000 pode nao estar aplicada. Esta migracao mantem hr-justificacoes fechado ao cliente de qualquer modo.';
  END IF;
END;
$guardas$;

-- ---- O bucket --------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-justificacoes',
  'hr-justificacoes',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ---- As politicas ----------------------------------------------------------
-- LEITURA: o ambito organizacional e a PRIMEIRA PASTA do caminho. Um caminho
-- fora do formato <organization_id>/... nao e legivel por ninguem, e isso e a
-- intencao -- nao um efeito secundario.
DROP POLICY IF EXISTS "hr_justificacoes_select" ON storage.objects;
CREATE POLICY "hr_justificacoes_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'hr-justificacoes'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (SELECT public.has_anew_permission_in_org(
        (SELECT auth.uid()),
        'hr.assiduidade.justificacao.view',
        ((storage.foldername(name))[1])::uuid))
);

-- ESCRITA FECHADA AO CLIENTE. Ver o cabecalho: nao se contraria a arquitectura
-- de quarentena para RH, e nao se abre um bucket com atestados medicos ao
-- INSERT directo do browser.
DROP POLICY IF EXISTS "hr_justificacoes_block_insert" ON storage.objects;
CREATE POLICY "hr_justificacoes_block_insert"
ON storage.objects
AS RESTRICTIVE FOR INSERT
TO authenticated
WITH CHECK (bucket_id <> 'hr-justificacoes');

DROP POLICY IF EXISTS "hr_justificacoes_block_update" ON storage.objects;
CREATE POLICY "hr_justificacoes_block_update"
ON storage.objects
AS RESTRICTIVE FOR UPDATE
TO authenticated
USING (bucket_id <> 'hr-justificacoes')
WITH CHECK (bucket_id <> 'hr-justificacoes');

DROP POLICY IF EXISTS "hr_justificacoes_block_delete" ON storage.objects;
CREATE POLICY "hr_justificacoes_block_delete"
ON storage.objects
AS RESTRICTIVE FOR DELETE
TO authenticated
USING (bucket_id <> 'hr-justificacoes');

COMMENT ON POLICY "hr_justificacoes_select" ON storage.objects IS
'Le um objecto de hr-justificacoes quem tem hr.assiduidade.justificacao.view NA ORGANIZACAO da primeira pasta do caminho. O caminho e obrigatoriamente <organization_id>/<pessoa_id>/<falta_id>/<uuid>.<ext>, e a primeira pasta e validada como uuid antes do cast -- um caminho mal formado nao chega a chamar a funcao de permissao.

SEM ramo de ficha-propria, e DELIBERADO: o trabalhador ve o seu ficheiro por URL assinado emitido por codigo com permissao verificada, nao por leitura directa. Cruzar a segunda pasta com hr_pessoa_do_utilizador faria de um caminho mal formado uma porta aberta.';

COMMENT ON POLICY "hr_justificacoes_block_insert" ON storage.objects IS
'O cliente NAO escreve em hr-justificacoes. RESTRICTIVE com bucket_id <> hr-justificacoes: nao interfere com os outros buckets (as politicas permissivas deles continuam a decidir), e fecha este a authenticated qualquer que seja a politica permissiva que exista ou venha a existir.

CONSEQUENCIA ASSUMIDA: ate existir a Edge Function de upload (quarentena, validacao de assinatura binaria, promocao), nao se anexa ficheiro nenhum a uma falta -- justifica-se por texto e referencia. Prefere-se a lacuna a abrir um bucket com atestados medicos ao INSERT directo do browser.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_publico boolean;
  v_limite  bigint;
  v_mimes   text;
  v_pol     integer;
BEGIN
  SELECT b.public, b.file_size_limit, coalesce(array_to_string(b.allowed_mime_types, ','), '')
    INTO v_publico, v_limite, v_mimes
    FROM storage.buckets b WHERE b.id = 'hr-justificacoes';

  IF v_publico IS NULL THEN
    RAISE EXCEPTION 'O bucket hr-justificacoes nao ficou criado.';
  END IF;

  -- Um bucket publico com atestados medicos seria uma fuga de dados de saude
  -- por URL adivinhavel.
  IF v_publico IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'O bucket hr-justificacoes esta PUBLICO. Contem dados de saude: um bucket publico e uma fuga por URL.';
  END IF;

  IF coalesce(v_limite, 0) <= 0 OR v_limite > 10485760 THEN
    RAISE EXCEPTION
      'O bucket hr-justificacoes tem file_size_limit de % em vez de 10485760 (10 MB).', coalesce(v_limite, 0);
  END IF;

  IF v_mimes = '' THEN
    RAISE EXCEPTION
      'O bucket hr-justificacoes ficou sem allowed_mime_types. Sem restricao de tipo, aceita executaveis.';
  END IF;

  -- As quatro politicas.
  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('hr_justificacoes_select','hr_justificacoes_block_insert',
                        'hr_justificacoes_block_update','hr_justificacoes_block_delete');

  IF v_pol <> 4 THEN
    RAISE EXCEPTION
      'Esperavam-se as 4 politicas de hr-justificacoes em storage.objects, encontraram-se %.', v_pol;
  END IF;

  -- As tres de escrita tem de ser RESTRICTIVE: permissivas, nao fechavam nada.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('hr_justificacoes_block_insert','hr_justificacoes_block_update',
                          'hr_justificacoes_block_delete')
       AND permissive <> 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION
      'Alguma das politicas de escrita de hr-justificacoes nao e RESTRICTIVE. Permissiva, nao fecha nada -- as outras politicas de storage.objects continuariam a autorizar o INSERT.';
  END IF;

  -- A de leitura tem de exigir a permissao perigosa E olhar para a primeira
  -- pasta. Sem uma das duas, ou nao abre a ninguem, ou abre a todos.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'hr_justificacoes_select'
       AND coalesce(qual,'') LIKE '%hr.assiduidade.justificacao.view%'
       AND coalesce(qual,'') LIKE '%foldername%'
  ) THEN
    RAISE EXCEPTION
      'A politica de leitura de hr-justificacoes nao exige hr.assiduidade.justificacao.view sobre a organizacao da primeira pasta do caminho.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'hr_justificacoes_select'
       AND coalesce(qual,'') ~ 'has_anew_permission\([^_]'
  ) THEN
    RAISE EXCEPTION
      'A politica de leitura usa has_anew_permission (global) em vez de has_anew_permission_in_org: a permissao numa organizacao daria acesso aos atestados de todas.';
  END IF;

  RAISE NOTICE 'Conferido: bucket hr-justificacoes privado, com limite e tipos, e fechado a escrita do cliente.';
END;
$conferir$;
