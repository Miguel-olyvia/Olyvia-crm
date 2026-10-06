-- ==============================================================================
-- Anexos da admissao (1/4): a tabela pessoas_anexos, a fotografia na ficha e a
-- auditoria dos dois ficheiros sensiveis.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO. Esta e a primeira de quatro migrations (050000,
-- 060000, 070000, 080000) que so fazem sentido juntas com a Edge Function
-- convite-admissao (accoes anexo_url, anexo_confirmar, anexo_remover), a nova
-- convite-admissao-limpeza, a nova hr-anexo-url, o validate-upload refactorizado
-- e o ecra novo. Sozinha esta migration so cria uma tabela vazia e uma coluna
-- nova em pessoas; nao parte nada, mas nada a usa ainda.
--
--
-- -- O MODELO -------------------------------------------------------------------
--
-- Uma linha por ficheiro carregado pela pessoa no convite de admissao. Estados:
--   pendente   URL de upload emitido, ficheiro na quarentena por verificar.
--   ligado     tipo real e tamanho verificados, ficheiro em hr-documentos, ligado
--              ao convite (e ao rascunho), INVISIVEL na ficha.
--   promovido  a submissao foi aceite; visivel na ficha a quem pode ver a ficha.
--   apagado    removido; a Edge Function apaga o objecto e marca
--              objecto_removido_em (ficheiros so se apagam pela API do Storage,
--              nunca por DELETE em storage.objects).
--
-- Caminhos: quarentena admissao/<convite_id>/<anexo_id>.<ext>; final
-- <organization_id>/<pessoa_id>/admissao/<anexo_id>.<ext>, com a extensao do tipo
-- REAL do ficheiro. Nenhum casa com a politica de INSERT da quarentena
-- (20261130055000), por isso authenticated nunca escreve ali; anon nao tem
-- politica. NAO se mexe nos buckets nem nas politicas de storage.
--
-- Leitura: a tabela inteira fica fechada e concede-se SELECT coluna a coluna a
-- authenticated, SEM caminho, hash, IP, convite, motivo nem estado do objecto.
-- Uma concessao por coluna nao cobre colunas futuras: o conferir compara as
-- colunas concedidas com as da tabela e FALHA se divergirem. A unica politica
-- de SELECT so deixa ver anexos promovidos, e DEPENDE DO TIPO (a mesma matriz da
-- Edge Function hr-anexo-url): a fotografia a quem ve a ficha (hr.pessoas.view),
-- o cartao de cidadao a quem tem hr.pessoas.identificacao.reveal e o comprovativo
-- de IBAN a quem tem hr.pessoas.bancarios.edit; a propria pessoa
-- (hr.pessoas.view.own e a sua ficha) ve os tres. Razao: nome_original e texto
-- livre da pessoa (pode ser 'CC 12345678 9ZZ4.pdf' ou levar um IBAN) e o
-- tamanho/tipo dizem que o documento existe; com so hr.pessoas.view lia-se tudo
-- isso por GET directo ao PostgREST, sem permissao do tipo e sem auditoria. O
-- CONTEUDO continua fechado: so se abre pela Edge Function hr-anexo-url, com a
-- permissao do tipo. Escrita: nenhuma para authenticated; tudo por RPC de
-- service_role.
--
-- Caminho da quarentena: a coluna caminho_quarentena guarda ATE AO FIM o caminho
-- do objecto na quarentena (admissao/<convite>/<anexo>.<ext>), preenchida por
-- rpc_hr_convite_anexo_reservar e NUNCA reescrita (ligar muda so `caminho`, que
-- passa a ser o final). Sem ela, depois de ligar perdia-se o caminho da
-- quarentena: se a Edge Function falhasse a remover essa copia, o cartao de
-- cidadao ficava para sempre no bucket sem linha que o referisse, e o URL de
-- upload assinado (2 h, reutilizavel) deixava despejar outro ficheiro no mesmo
-- caminho. quarentena_removida_em marca quando a limpeza o apagou;
-- limpeza_tentativas conta as vezes que a limpeza devolveu a linha (para uma
-- linha que falha sempre nao bloquear a fila).
--
-- Fotografia: pessoas.fotografia_anexo_id. Como pessoas tem UPDATE de tabela
-- para authenticated, a integridade vai por trigger (um BEFORE INSERT OR UPDATE
-- OF fotografia_anexo_id): so aceita uma fotografia PROMOVIDA da MESMA pessoa e
-- organizacao. Sem isto era possivel apontar o avatar para o cartao de cidadao
-- de outra pessoa.
--
-- Auditoria: pessoas_acessos_sensiveis.campo passa de 8 a 10 valores, com
-- anexo_cartao_cidadao e anexo_comprovativo_iban (dois e nao um, para a
-- auditoria dizer QUAL ficheiro foi aberto). A fotografia nunca se audita.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) O CHECK pessoas_acessos_sensiveis_campo_valido ja perdeu valores duas
--    vezes por uma migration reescrever a lista de cor. Aqui parte-se da lista
--    VIGENTE (20261130180000, 8 valores) e o conferir confirma os 10.
-- b) Apagar uma pessoa (ou um convite) com anexos fica recusado pela base: as
--    chaves estrangeiras sao NO ACTION, de proposito (nao se perdem ficheiros em
--    silencio). Hoje pessoas ja nao se apagam (politica pessoas_delete_bloqueado).
-- c) A retencao dos anexos promovidos depois da saida da pessoa fica FORA.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (uma reversao na pasta e
-- aplicada pelo db push). A mao, so se a tabela estiver vazia: largar o trigger
-- e a funcao hr_pessoas_fotografia_valida, a coluna pessoas.fotografia_anexo_id,
-- a tabela pessoas_anexos e repor o CHECK com os 8 valores.
--
--
-- Prerequisitos:
--   20261120030000  pessoas e a unique pessoas_id_org_key
--   20261120090000  hr_pessoa_do_utilizador
--   20261124120000  pessoas_convites_admissao
--   20261130055000  buckets hr-documentos e hr-documentos-quarantine
--   20261130180000  pessoas_acessos_sensiveis_campo_valido (8 valores)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_id_org_key' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe; a FK composta de pessoas_anexos depende dela.';
  END IF;

  IF to_regclass('public.pessoas_convites_admissao') IS NULL THEN
    RAISE EXCEPTION 'pessoas_convites_admissao nao existe. Aplicar 20261124120000 primeiro.';
  END IF;

  SELECT count(*) INTO v_n
    FROM storage.buckets
   WHERE id IN ('hr-documentos', 'hr-documentos-quarantine');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Os buckets hr-documentos e hr-documentos-quarantine devem existir (20261130055000); encontrei %.', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid, uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  -- A politica de SELECT depende destas tres permissoes do catalogo.
  SELECT count(*) INTO v_n
    FROM public.anew_permissions
   WHERE code IN ('hr.pessoas.view', 'hr.pessoas.view.own', 'hr.pessoas.identificacao.reveal', 'hr.pessoas.bancarios.edit');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'O catalogo devia ter as quatro permissoes de que a politica de pessoas_anexos depende (view, view.own, identificacao.reveal, bancarios.edit); encontrei % (20261120020000).', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_acessos_sensiveis_campo_valido'
       AND conrelid = to_regclass('public.pessoas_acessos_sensiveis')
       AND pg_get_constraintdef(oid) LIKE '%horas_contratadas%'
  ) THEN
    RAISE EXCEPTION 'pessoas_acessos_sensiveis_campo_valido nao tem os 8 valores de 20261130180000 (falta horas_contratadas).';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A tabela
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_anexos (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL,
  pessoa_id            uuid        NOT NULL,
  convite_id           uuid,
  tipo                 text        NOT NULL,
  estado               text        NOT NULL DEFAULT 'pendente',
  bucket               text        NOT NULL DEFAULT 'hr-documentos-quarantine',
  caminho              text        NOT NULL,
  nome_original        text        NOT NULL,
  mime_type            text,
  tamanho_bytes        bigint,
  hash_sha256          text,
  upload_ip            inet,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  ligado_em            timestamptz,
  promovido_em         timestamptz,
  apagado_em           timestamptz,
  apagado_motivo       text,
  objecto_removido_em  timestamptz,
  caminho_quarentena   text,
  quarentena_removida_em timestamptz,
  limpeza_tentativas   integer     NOT NULL DEFAULT 0,

  CONSTRAINT pessoas_anexos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_anexos_caminho_key UNIQUE (caminho),
  CONSTRAINT pessoas_anexos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id),
  CONSTRAINT pessoas_anexos_convite_fkey
    FOREIGN KEY (convite_id)
    REFERENCES public.pessoas_convites_admissao (id),

  CONSTRAINT pessoas_anexos_tipo_valido
    CHECK (tipo IN ('cartao_cidadao', 'comprovativo_iban', 'fotografia')),
  CONSTRAINT pessoas_anexos_estado_valido
    CHECK (estado IN ('pendente', 'ligado', 'promovido', 'apagado')),
  CONSTRAINT pessoas_anexos_bucket_valido
    CHECK (bucket IN ('hr-documentos-quarantine', 'hr-documentos')),
  CONSTRAINT pessoas_anexos_mime_valido
    CHECK (mime_type IS NULL OR mime_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  CONSTRAINT pessoas_anexos_motivo_valido
    CHECK (apagado_motivo IS NULL OR apagado_motivo IN (
      'removido_pela_pessoa', 'convite_expirado', 'convite_revogado', 'substituido',
      'upload_abandonado', 'formato_invalido', 'demasiado_grande', 'rh'
    )),
  CONSTRAINT pessoas_anexos_hash_formato
    CHECK (hash_sha256 IS NULL OR hash_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT pessoas_anexos_nome_tamanho
    CHECK (length(nome_original) BETWEEN 1 AND 200),
  CONSTRAINT pessoas_anexos_tamanho_positivo
    CHECK (tamanho_bytes IS NULL OR (tamanho_bytes > 0 AND tamanho_bytes <= 10485760)),

  -- Coerencia entre o estado e o resto da linha.
  CONSTRAINT pessoas_anexos_pendente_em_quarentena
    CHECK (estado <> 'pendente' OR bucket = 'hr-documentos-quarantine'),
  CONSTRAINT pessoas_anexos_ligado_verificado
    CHECK (estado NOT IN ('ligado', 'promovido')
           OR (bucket = 'hr-documentos'
               AND mime_type IS NOT NULL
               AND tamanho_bytes IS NOT NULL
               AND hash_sha256 IS NOT NULL)),
  CONSTRAINT pessoas_anexos_apagado_com_motivo
    CHECK (estado <> 'apagado' OR (apagado_em IS NOT NULL AND apagado_motivo IS NOT NULL)),
  CONSTRAINT pessoas_anexos_activo_tem_convite
    CHECK (estado NOT IN ('pendente', 'ligado') OR convite_id IS NOT NULL),
  CONSTRAINT pessoas_anexos_quarentena_removida_coerente
    CHECK (quarentena_removida_em IS NULL OR caminho_quarentena IS NOT NULL),
  CONSTRAINT pessoas_anexos_quarentena_caminho_formato
    CHECK (caminho_quarentena IS NULL OR caminho_quarentena LIKE 'admissao/%'),
  CONSTRAINT pessoas_anexos_limpeza_tentativas_positivas
    CHECK (limpeza_tentativas >= 0)
);

COMMENT ON TABLE public.pessoas_anexos IS
'Ficheiros carregados pela pessoa no convite de admissao (cartao de cidadao, comprovativo de IBAN, fotografia). Estados: pendente (na quarentena), ligado (verificado, em hr-documentos, invisivel na ficha), promovido (submissao aceite, visivel na ficha) e apagado (a Edge Function apaga o objecto e marca objecto_removido_em). SELECT por coluna a authenticated, sem caminho, hash, IP, convite nem motivo; sem escrita para authenticated; o conteudo so se abre pela Edge Function hr-anexo-url. Desde 20261210050000.';

COMMENT ON COLUMN public.pessoas_anexos.caminho IS
'Caminho do objecto no bucket desta linha. Pendente: admissao/<convite_id>/<anexo_id>.<ext> na quarentena. Ligado ou promovido: <organization_id>/<pessoa_id>/admissao/<anexo_id>.<ext> em hr-documentos, com a extensao do tipo REAL. Nunca se concede a authenticated.';
COMMENT ON COLUMN public.pessoas_anexos.mime_type IS
'Tipo REAL do ficheiro (pela assinatura dos bytes), preenchido so ao ligar. Nunca o tipo declarado pelo browser.';
COMMENT ON COLUMN public.pessoas_anexos.convite_id IS
'Convite a que o ficheiro foi ligado. Fica como historico depois da promocao. Nunca se concede a authenticated.';
COMMENT ON COLUMN public.pessoas_anexos.objecto_removido_em IS
'Quando a Edge Function apagou o objecto do Storage. Uma linha apagada sem este valor ainda tem um objecto por remover.';
COMMENT ON COLUMN public.pessoas_anexos.caminho_quarentena IS
'Caminho do objecto na quarentena (admissao/<convite_id>/<anexo_id>.<ext>), gravado por rpc_hr_convite_anexo_reservar e nunca reescrito: ligar muda so `caminho`. Serve para a limpeza apagar a copia da quarentena de linhas ligadas, promovidas ou apagadas (mais de 3 horas depois de criadas, quando o URL de upload ja nao vale). Nunca se concede a authenticated.';
COMMENT ON COLUMN public.pessoas_anexos.quarentena_removida_em IS
'Quando a limpeza apagou o objecto da quarentena (caminho_quarentena). Nulo com caminho_quarentena preenchido e a linha com mais de 3 horas = copia da quarentena por apagar. Nunca se concede a authenticated.';
COMMENT ON COLUMN public.pessoas_anexos.limpeza_tentativas IS
'Quantas vezes hr_convite_anexos_limpar devolveu esta linha. A limpeza ordena por este valor (as linhas que falham sempre ficam para o fim da fila e nao impedem as novas). Nunca se concede a authenticated.';

CREATE INDEX IF NOT EXISTS pessoas_anexos_convite_estado_idx
  ON public.pessoas_anexos (convite_id, estado);
CREATE INDEX IF NOT EXISTS pessoas_anexos_pessoa_estado_idx
  ON public.pessoas_anexos (pessoa_id, estado);
CREATE INDEX IF NOT EXISTS pessoas_anexos_por_remover_idx
  ON public.pessoas_anexos (apagado_em)
  WHERE estado = 'apagado' AND objecto_removido_em IS NULL;
CREATE INDEX IF NOT EXISTS pessoas_anexos_pendentes_idx
  ON public.pessoas_anexos (criado_em)
  WHERE estado = 'pendente';
CREATE INDEX IF NOT EXISTS pessoas_anexos_quarentena_por_remover_idx
  ON public.pessoas_anexos (criado_em)
  WHERE caminho_quarentena IS NOT NULL AND quarentena_removida_em IS NULL;

-- ---- Privilegios e RLS ------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_anexos FROM anon;
REVOKE ALL ON TABLE public.pessoas_anexos FROM authenticated;
GRANT ALL ON TABLE public.pessoas_anexos TO service_role;

GRANT SELECT (
  id, organization_id, pessoa_id, tipo, estado, nome_original, mime_type,
  tamanho_bytes, promovido_em, criado_em
) ON TABLE public.pessoas_anexos TO authenticated;

ALTER TABLE public.pessoas_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_anexos_select ON public.pessoas_anexos;
CREATE POLICY pessoas_anexos_select ON public.pessoas_anexos
  FOR SELECT TO authenticated
  USING (
    estado = 'promovido'
    AND (
      -- A fotografia: a quem ve a ficha.
      (tipo = 'fotografia'
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view', organization_id)))
      -- O cartao de cidadao: so a quem o pode abrir (a permissao da Edge hr-anexo-url).
      OR (tipo = 'cartao_cidadao'
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.identificacao.reveal', organization_id)))
      -- O comprovativo de IBAN: so a quem o pode abrir.
      OR (tipo = 'comprovativo_iban'
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.bancarios.edit', organization_id)))
      -- A propria pessoa ve os tres.
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view.own', organization_id))
        AND pessoa_id = public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id)
      )
    )
  );

COMMENT ON POLICY pessoas_anexos_select ON public.pessoas_anexos IS
'So se ve um anexo promovido, e conforme o tipo (a mesma matriz da Edge hr-anexo-url): fotografia com hr.pessoas.view; cartao_cidadao com hr.pessoas.identificacao.reveal; comprovativo_iban com hr.pessoas.bancarios.edit; a propria pessoa (hr.pessoas.view.own e a sua ficha) ve os tres. Assim o nome do ficheiro (texto livre da pessoa), o tamanho e o tipo dos documentos sensiveis nao se leem so com hr.pessoas.view. Ligado e pendente nunca se veem: ainda nao foram aceites. Sem politicas de escrita: nao ha grants de escrita. Desde 20261210050000.';

-- ==============================================================================
-- 2. A fotografia na ficha
-- ==============================================================================
ALTER TABLE public.pessoas
  ADD COLUMN IF NOT EXISTS fotografia_anexo_id uuid
    REFERENCES public.pessoas_anexos (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pessoas.fotografia_anexo_id IS
'Fotografia (anexo promovido do tipo fotografia, desta pessoa) mostrada no cabecalho da ficha. A integridade e do trigger hr_pessoas_fotografia_valida. Desde 20261210050000.';

CREATE OR REPLACE FUNCTION public.hr_pessoas_fotografia_valida()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.fotografia_anexo_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pessoas_anexos a
     WHERE a.id = NEW.fotografia_anexo_id
       AND a.tipo = 'fotografia'
       AND a.estado = 'promovido'
       AND a.pessoa_id = NEW.id
       AND a.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'fotografia_invalida' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_pessoas_fotografia_valida() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_pessoas_fotografia_valida() FROM anon;
REVOKE ALL ON FUNCTION public.hr_pessoas_fotografia_valida() FROM authenticated;

COMMENT ON FUNCTION public.hr_pessoas_fotografia_valida() IS
'Trigger de pessoas: fotografia_anexo_id, se preenchido, tem de ser um anexo promovido do tipo fotografia, da MESMA pessoa e organizacao (senao fotografia_invalida, 23514). Impede apontar o avatar para o cartao de cidadao de outra pessoa. SECURITY DEFINER para ler pessoas_anexos sem depender da RLS de quem escreve.';

DROP TRIGGER IF EXISTS trg_pessoas_fotografia_valida ON public.pessoas;
CREATE TRIGGER trg_pessoas_fotografia_valida
  BEFORE INSERT OR UPDATE OF fotografia_anexo_id ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_fotografia_valida();

-- ==============================================================================
-- 3. A auditoria: 8 valores passam a 10
-- ==============================================================================
DO $campo_anexos$
DECLARE
  v_lista text[] := ARRAY[
    'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao',
    'documento', 'sindicalizacao', 'horas_contratadas',
    'anexo_cartao_cidadao', 'anexo_comprovativo_iban'
  ];
  v_fora text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_acessos_sensiveis_campo_valido'
       AND conrelid = to_regclass('public.pessoas_acessos_sensiveis')
       AND pg_get_constraintdef(oid) LIKE '%anexo_comprovativo_iban%'
  ) THEN
    RAISE NOTICE 'pessoas_acessos_sensiveis_campo_valido ja aceita os anexos; nada a fazer.';
    RETURN;
  END IF;

  -- Nenhuma linha existente pode ficar ilegal: a lista nova e um superconjunto.
  SELECT string_agg(DISTINCT campo, ', ' ORDER BY campo) INTO v_fora
    FROM public.pessoas_acessos_sensiveis
   WHERE campo <> ALL (v_lista);

  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION
      'Ha linhas de auditoria com campo fora da lista nova: %. Acrescentar esses valores a lista desta migration antes de aplicar.',
      v_fora;
  END IF;

  ALTER TABLE public.pessoas_acessos_sensiveis
    DROP CONSTRAINT pessoas_acessos_sensiveis_campo_valido;

  ALTER TABLE public.pessoas_acessos_sensiveis
    ADD CONSTRAINT pessoas_acessos_sensiveis_campo_valido
    CHECK (campo = ANY (ARRAY[
      'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao',
      'documento', 'sindicalizacao', 'horas_contratadas',
      'anexo_cartao_cidadao', 'anexo_comprovativo_iban'
    ]));

  RAISE NOTICE 'CHECK da auditoria reposto com os 10 valores (os 8 antigos mais os dois anexos).';
END;
$campo_anexos$;

COMMENT ON CONSTRAINT pessoas_acessos_sensiveis_campo_valido ON public.pessoas_acessos_sensiveis IS
'Os campos cujo acesso se regista (10 valores desde 20261210050000: os 8 de 20261130180000 mais anexo_cartao_cidadao e anexo_comprovativo_iban). ATENCAO a quem acrescentar um valor novo: esta constraint ja perdeu "conta_bancaria" duas vezes porque uma migration reescreveu a lista de cor em vez de acrescentar a que la estava. Acrescentar sempre a lista COMPLETA, e conferir todos os valores. A fotografia nunca se audita.';

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_col      text;
  v_def      text;
  v_valor    text;
  v_n        integer;
  v_proibidas text[] := ARRAY['caminho', 'hash_sha256', 'upload_ip', 'convite_id', 'apagado_motivo', 'objecto_removido_em',
                              'caminho_quarentena', 'quarentena_removida_em', 'limpeza_tentativas'];
  v_concedidas text[] := ARRAY['id', 'organization_id', 'pessoa_id', 'tipo', 'estado', 'nome_original',
                               'mime_type', 'tamanho_bytes', 'promovido_em', 'criado_em'];
BEGIN
  -- 1. As colunas concedidas sao EXACTAMENTE as esperadas, e todas as outras
  --    (incluindo uma coluna futura) ficam fechadas ate alguem as conceder aqui.
  FOR v_col IN
    SELECT a.attname FROM pg_attribute a
     WHERE a.attrelid = 'public.pessoas_anexos'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    IF v_col = ANY (v_concedidas) THEN
      IF NOT has_column_privilege('authenticated', 'public.pessoas_anexos', v_col, 'SELECT') THEN
        RAISE EXCEPTION 'A coluna % de pessoas_anexos devia ter SELECT para authenticated.', v_col;
      END IF;
    ELSE
      IF has_column_privilege('authenticated', 'public.pessoas_anexos', v_col, 'SELECT') THEN
        RAISE EXCEPTION 'authenticated consegue ler pessoas_anexos.%, que devia estar fechada.', v_col;
      END IF;
    END IF;
    IF has_column_privilege('anon', 'public.pessoas_anexos', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'anon consegue ler pessoas_anexos.%.', v_col;
    END IF;
  END LOOP;

  FOREACH v_col IN ARRAY v_proibidas LOOP
    IF has_column_privilege('authenticated', 'public.pessoas_anexos', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated consegue ler pessoas_anexos.%.', v_col;
    END IF;
  END LOOP;

  FOREACH v_col IN ARRAY v_concedidas LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = 'public.pessoas_anexos'::regclass AND a.attname = v_col AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'A coluna concedida % ja nao existe em pessoas_anexos.', v_col;
    END IF;
  END LOOP;

  -- 2. Sem escrita para authenticated nem anon.
  IF has_table_privilege('authenticated', 'public.pessoas_anexos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pessoas_anexos', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pessoas_anexos', 'DELETE')
     OR has_table_privilege('anon', 'public.pessoas_anexos', 'SELECT')
     OR has_table_privilege('anon', 'public.pessoas_anexos', 'INSERT') THEN
    RAISE EXCEPTION 'pessoas_anexos tem privilegios de tabela a mais para anon ou authenticated.';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.pessoas_anexos', 'INSERT') THEN
    RAISE EXCEPTION 'service_role devia ter acesso total a pessoas_anexos.';
  END IF;

  -- 3. RLS ligada e uma unica politica, de SELECT.
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.pessoas_anexos'::regclass) THEN
    RAISE EXCEPTION 'pessoas_anexos sem RLS.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pessoas_anexos';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'pessoas_anexos devia ter UMA politica (SELECT); tem %.', v_n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_anexos'
       AND cmd = 'SELECT' AND qual LIKE '%promovido%' AND qual LIKE '%hr.pessoas.view%'
       AND qual LIKE '%hr.pessoas.identificacao.reveal%' AND qual LIKE '%hr.pessoas.bancarios.edit%'
       AND qual LIKE '%hr.pessoas.view.own%'
  ) THEN
    RAISE EXCEPTION 'A politica de SELECT de pessoas_anexos nao exige estado promovido e a permissao de cada tipo (view, identificacao.reveal, bancarios.edit) ou a propria pessoa (view.own).';
  END IF;

  -- 4. O trigger da fotografia e a coluna.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.pessoas'::regclass AND tgname = 'trg_pessoas_fotografia_valida' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger trg_pessoas_fotografia_valida nao existe.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'fotografia_anexo_id'
  ) THEN
    RAISE EXCEPTION 'pessoas.fotografia_anexo_id nao existe.';
  END IF;

  -- 5. A auditoria: os 10 valores, os 8 antigos incluidos.
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'pessoas_acessos_sensiveis_campo_valido'
     AND conrelid = to_regclass('public.pessoas_acessos_sensiveis');
  FOREACH v_valor IN ARRAY ARRAY[
    'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao', 'documento',
    'sindicalizacao', 'horas_contratadas', 'anexo_cartao_cidadao', 'anexo_comprovativo_iban'
  ] LOOP
    IF v_def IS NULL OR v_def NOT LIKE '%''' || v_valor || '''%' THEN
      RAISE EXCEPTION 'pessoas_acessos_sensiveis_campo_valido perdeu ou nao tem o valor %: %', v_valor, coalesce(v_def, '(ausente)');
    END IF;
  END LOOP;

  -- 6. Privilegios do trigger: ninguem o executa por fora.
  IF has_function_privilege('authenticated', 'public.hr_pessoas_fotografia_valida()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_pessoas_fotografia_valida()', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_pessoas_fotografia_valida nao devia ser executavel por anon nem authenticated.';
  END IF;

  RAISE NOTICE 'OK: pessoas_anexos com SELECT so nas 10 colunas esperadas, sem escrita, RLS com uma politica, trigger da fotografia e auditoria com 10 valores.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria dados de teste e DESFAZ-OS
-- tudo com a sentinela HR900 (a subtransaccao reverte as linhas e o role).
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_uid_real  uuid;
  v_pessoa_a  uuid;
  v_pessoa_b  uuid;
  v_foto_a    uuid;
  v_foto_b    uuid;
  v_cartao_a  uuid;
  v_ligado_a  uuid;
  v_falhou    boolean;
  v_ve_cartao boolean;
  v_ve_iban   boolean;
  v_n         integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo de pessoas_anexos foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima).
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210050000 A -- apagar')
    RETURNING id INTO v_pessoa_a;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210050000 B -- apagar')
    RETURNING id INTO v_pessoa_b;

    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
       mime_type, tamanho_bytes, hash_sha256, promovido_em)
    VALUES
      (v_org_nike, v_pessoa_a, 'fotografia', 'promovido', 'hr-documentos',
       'teste-20261210050000/a-foto.png', 'foto.png', 'image/png', 1000, repeat('a', 64), now())
    RETURNING id INTO v_foto_a;
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
       mime_type, tamanho_bytes, hash_sha256, promovido_em)
    VALUES
      (v_org_nike, v_pessoa_b, 'fotografia', 'promovido', 'hr-documentos',
       'teste-20261210050000/b-foto.png', 'foto.png', 'image/png', 1000, repeat('b', 64), now())
    RETURNING id INTO v_foto_b;
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
       mime_type, tamanho_bytes, hash_sha256, promovido_em)
    VALUES
      (v_org_nike, v_pessoa_a, 'cartao_cidadao', 'promovido', 'hr-documentos',
       'teste-20261210050000/a-cartao.pdf', 'cartao.pdf', 'application/pdf', 2000, repeat('c', 64), now())
    RETURNING id INTO v_cartao_a;

    -- A fotografia propria e aceite.
    UPDATE public.pessoas SET fotografia_anexo_id = v_foto_a WHERE id = v_pessoa_a;

    -- A fotografia de OUTRA pessoa e recusada.
    v_falhou := false;
    BEGIN
      UPDATE public.pessoas SET fotografia_anexo_id = v_foto_b WHERE id = v_pessoa_a;
    EXCEPTION WHEN check_violation THEN
      v_falhou := true;
    END;
    IF NOT v_falhou THEN
      RAISE EXCEPTION 'O trigger devia recusar a fotografia de outra pessoa.' USING ERRCODE = 'HR961';
    END IF;

    -- O cartao de cidadao como fotografia e recusado.
    v_falhou := false;
    BEGIN
      UPDATE public.pessoas SET fotografia_anexo_id = v_cartao_a WHERE id = v_pessoa_a;
    EXCEPTION WHEN check_violation THEN
      v_falhou := true;
    END;
    IF NOT v_falhou THEN
      RAISE EXCEPTION 'O trigger devia recusar um anexo que nao e fotografia.' USING ERRCODE = 'HR961';
    END IF;

    -- Os CHECKs de coerencia: ligado em quarentena, activo sem convite, promovido sem hash.
    v_falhou := false;
    BEGIN
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
         mime_type, tamanho_bytes, hash_sha256, convite_id)
      VALUES
        (v_org_nike, v_pessoa_a, 'cartao_cidadao', 'ligado', 'hr-documentos-quarantine',
         'teste-20261210050000/x1', 'x.pdf', 'application/pdf', 10, repeat('d', 64), gen_random_uuid());
    EXCEPTION WHEN check_violation OR foreign_key_violation THEN
      v_falhou := true;
    END;
    IF NOT v_falhou THEN
      RAISE EXCEPTION 'Um ligado na quarentena devia ser recusado.' USING ERRCODE = 'HR961';
    END IF;

    v_falhou := false;
    BEGIN
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, tipo, estado, caminho, nome_original)
      VALUES (v_org_nike, v_pessoa_a, 'cartao_cidadao', 'pendente', 'teste-20261210050000/x2', 'x.pdf');
    EXCEPTION WHEN check_violation THEN
      v_falhou := true;
    END;
    IF NOT v_falhou THEN
      RAISE EXCEPTION 'Um pendente sem convite devia ser recusado.' USING ERRCODE = 'HR961';
    END IF;

    v_falhou := false;
    BEGIN
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original, mime_type, tamanho_bytes)
      VALUES (v_org_nike, v_pessoa_a, 'cartao_cidadao', 'promovido', 'hr-documentos',
              'teste-20261210050000/x3', 'x.pdf', 'application/pdf', 10);
    EXCEPTION WHEN check_violation THEN
      v_falhou := true;
    END;
    IF NOT v_falhou THEN
      RAISE EXCEPTION 'Um promovido sem hash devia ser recusado.' USING ERRCODE = 'HR961';
    END IF;

    -- A auditoria aceita os dois valores novos.
    INSERT INTO public.pessoas_acessos_sensiveis (pessoa_id, organization_id, origem, campo, accao)
    VALUES (v_pessoa_a, v_org_nike, 'service_role', 'anexo_cartao_cidadao', 'revelar'),
           (v_pessoa_a, v_org_nike, 'service_role', 'anexo_comprovativo_iban', 'revelar');

    -- Visto por um utilizador real da nike (super_admin): ve o promovido, nunca as colunas fechadas.
    SELECT au.auth_user_id INTO v_uid_real
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
      JOIN public.anew_roles ar ON ar.id = am.role_id AND ar.code = 'super_admin'
     WHERE am.organization_id = v_org_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
     ORDER BY au.auth_user_id
     LIMIT 1;

    IF v_uid_real IS NULL
       OR NOT public.has_anew_permission_in_org(v_uid_real, 'hr.pessoas.view', v_org_nike) THEN
      RAISE NOTICE 'CONFERIR RLS de pessoas_anexos saltado: nao ha super_admin com membership activo e hr.pessoas.view na nike.';
    ELSE
      -- Um anexo ligado (nao promovido) para provar que a RLS o esconde.
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
         mime_type, tamanho_bytes, hash_sha256, ligado_em, convite_id)
      SELECT v_org_nike, v_pessoa_a, 'comprovativo_iban', 'ligado', 'hr-documentos',
             'teste-20261210050000/a-iban.pdf', 'iban.pdf', 'application/pdf', 3000, repeat('e', 64), now(), c.id
        FROM public.pessoas_convites_admissao c
       WHERE c.organization_id = v_org_nike
       LIMIT 1;
      GET DIAGNOSTICS v_n = ROW_COUNT;

      -- Um comprovativo PROMOVIDO, para provar a regra por tipo.
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
         mime_type, tamanho_bytes, hash_sha256, promovido_em)
      VALUES (v_org_nike, v_pessoa_a, 'comprovativo_iban', 'promovido', 'hr-documentos',
              'teste-20261210050000/a-iban-promovido.pdf', 'iban.pdf', 'application/pdf', 3000, repeat('9', 64), now());

      -- O que este utilizador pode abrir, tipo a tipo (a mesma matriz da Edge).
      v_ve_cartao := public.has_anew_permission_in_org(v_uid_real, 'hr.pessoas.identificacao.reveal', v_org_nike);
      v_ve_iban   := public.has_anew_permission_in_org(v_uid_real, 'hr.pessoas.bancarios.edit', v_org_nike);

      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid_real, 'role', 'authenticated')::text, true);

      -- A fotografia: ve sempre (tem hr.pessoas.view, confirmado acima).
      SELECT count(*) INTO v_n FROM public.pessoas_anexos WHERE pessoa_id = v_pessoa_a AND tipo = 'fotografia';
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'quem tem hr.pessoas.view devia ver a fotografia promovida da pessoa de teste; viu %.', v_n
          USING ERRCODE = 'HR961';
      END IF;

      -- O cartao e o comprovativo: so com a permissao do tipo (nunca o ligado).
      SELECT count(*) INTO v_n FROM public.pessoas_anexos WHERE pessoa_id = v_pessoa_a AND tipo = 'cartao_cidadao';
      IF v_n <> (CASE WHEN v_ve_cartao THEN 1 ELSE 0 END) THEN
        RAISE EXCEPTION 'o cartao de cidadao promovido devia ser visto por %, e foi visto % vez(es) (tem identificacao.reveal: %).',
          CASE WHEN v_ve_cartao THEN 'este utilizador' ELSE 'ninguem sem identificacao.reveal' END, v_n, v_ve_cartao
          USING ERRCODE = 'HR961';
      END IF;

      SELECT count(*) INTO v_n FROM public.pessoas_anexos WHERE pessoa_id = v_pessoa_a AND tipo = 'comprovativo_iban';
      IF v_n <> (CASE WHEN v_ve_iban THEN 1 ELSE 0 END) THEN
        RAISE EXCEPTION 'o comprovativo de IBAN promovido (e nao o ligado) devia contar % para este utilizador; viu % (tem bancarios.edit: %).',
          CASE WHEN v_ve_iban THEN 1 ELSE 0 END, v_n, v_ve_iban
          USING ERRCODE = 'HR961';
      END IF;

      v_falhou := false;
      BEGIN
        PERFORM caminho FROM public.pessoas_anexos WHERE pessoa_id = v_pessoa_a;
      EXCEPTION WHEN insufficient_privilege THEN
        v_falhou := true;
      END;
      IF NOT v_falhou THEN
        RAISE EXCEPTION 'authenticated conseguiu ler a coluna caminho.' USING ERRCODE = 'HR961';
      END IF;

      v_falhou := false;
      BEGIN
        INSERT INTO public.pessoas_anexos
          (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
           mime_type, tamanho_bytes, hash_sha256)
        VALUES (v_org_nike, v_pessoa_a, 'fotografia', 'promovido', 'hr-documentos',
                'teste-20261210050000/x4', 'x.png', 'image/png', 10, repeat('f', 64));
      EXCEPTION WHEN insufficient_privilege THEN
        v_falhou := true;
      END;
      IF NOT v_falhou THEN
        RAISE EXCEPTION 'authenticated conseguiu escrever em pessoas_anexos.' USING ERRCODE = 'HR961';
      END IF;

      EXECUTE 'RESET ROLE';
      PERFORM set_config('request.jwt.claims', NULL, true);
    END IF;

    RAISE EXCEPTION 'teste_hr_anexos_tabela_20261210050000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao (linhas e role).
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      PERFORM set_config('request.jwt.claims', NULL, true);
      RAISE EXCEPTION 'O conferir ao vivo de pessoas_anexos falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): fotografia propria aceite, de outra pessoa e cartao recusados, CHECKs de coerencia, auditoria com os dois valores novos, RLS (so promovidos), caminho fechado e escrita recusada. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho. Ordem de publicacao: db push das
--    quatro migrations, depois deploy das Edge Functions (convite-admissao,
--    convite-admissao-limpeza, hr-anexo-url, validate-upload), depois o ecra.
--
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked): o push aplica TUDO o que estiver na
--    pasta, por ordem. Antes de escolher estas versoes, listar tambem o remoto:
--    migrations de outros ramos ficam aplicadas na base partilhada sem ficheiro
--    aqui. Nunca migration repair.
--
-- 3. Confirmar por leitura, no remoto, que a versao VIGENTE de
--    pessoas_acessos_sensiveis_campo_valido tem os 8 valores (a guarda desta
--    migration tambem o exige).
--
-- 4. Nao ha vermelho a demonstrar contra o remoto: a tabela e nova.
-- ==============================================================================
