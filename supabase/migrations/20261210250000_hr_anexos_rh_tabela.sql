-- ==============================================================================
-- Anexos pelo RH (1/3): a tabela pessoas_anexos passa a aceitar anexos que o RH
-- carrega na ficha, sem convite.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO. Esta e a primeira de tres migrations (250000, 260000,
-- 270000) que so fazem sentido juntas com a Edge Function nova hr-anexo-rh (accoes
-- url, confirmar e remover) e com o ecra novo (cartao de anexos da ficha e zona de
-- anexos de Nova pessoa). Publicar na ordem: db push, deploy de hr-anexo-rh, ecra;
-- a Edge e o cliente entram no mesmo commit. Sozinha esta migration so acrescenta
-- tres colunas com valor por omissao e afrouxa um CHECK para o RH poder ter um
-- pendente sem convite; nada a usa ainda e os anexos do convite ficam como estavam.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- pessoas_anexos foi desenhada para os ficheiros que a PESSOA carrega no convite
-- de admissao. O RH tambem passa a poder anexar o cartao de cidadao, o comprovativo
-- de IBAN e a fotografia. Um anexo do RH nao tem convite, por isso:
--
--   origem          'convite' (por omissao, tudo o que ja existe) ou 'rh'.
--   carregado_por   auth uid de quem anexou (so RH). Quem reservou e o unico que
--                   pode confirmar o envio: ninguem adopta o upload de outro.
--   apagado_por     auth uid de quem removeu ou substituiu (so RH). NULL quando foi o
--                   sistema (o convite, a limpeza).
--
-- NENHUMA das tres e concedida a authenticated: o authenticated so tem SELECT por
-- coluna e uma concessao por coluna nao cobre colunas novas -- e o que se quer. O
-- conferir compara as colunas concedidas com as da tabela e FALHA se divergirem.
--
-- O CHECK pessoas_anexos_activo_tem_convite exigia convite para pendente e ligado;
-- passa a exigir convite so para ligado, e para pendente aceita convite OU origem
-- 'rh'. Dois CHECKs novos fecham o resto: um anexo do RH nunca tem convite
-- (pessoas_anexos_rh_sem_convite) e tem sempre autor (pessoas_anexos_rh_tem_autor).
-- O CHECK da quarentena (caminho_quarentena LIKE 'admissao/%') mantem-se: o RH usa
-- o prefixo admissao/rh/, que nunca colide com o de um convite (um uuid).
--
-- Um RH nunca passa por 'ligado': nao ha submissao a esperar. Vai de pendente a
-- promovido directamente.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) O DROP e o ADD do CHECK pessoas_anexos_activo_tem_convite correm na mesma
--    transaccao da migration. Antes de cada ADD conta-se as linhas que violariam o
--    CHECK novo (devem ser 0) e a migration falha com a contagem.
-- b) hr.pessoas.bancarios.edit conta nas duas listas (leitura e escrita do
--    comprovativo): o catalogo tem de ter as 5 permissoes distintas.
-- c) Mudelar: esta migration nao muda nada do que la corre (a coluna origem e
--    'convite' em todas as linhas). O RH so passa a poder anexar quando o codigo
--    novo for publicado.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (uma reversao na pasta e
-- aplicada pelo db push). A mao, so se nao houver anexos do RH: largar os CHECKs
-- novos, repor pessoas_anexos_activo_tem_convite com a definicao de 20261210050000
-- e largar as tres colunas e o indice.
--
-- Prerequisitos:
--   20261210050000  pessoas_anexos (com caminho_quarentena e o motivo 'rh')
--   20261130200000  hr_registar_acesso_sensivel com 5 argumentos
--   20261120020000  as permissoes do catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF to_regclass('public.pessoas_anexos') IS NULL THEN
    RAISE EXCEPTION 'pessoas_anexos nao existe. Aplicar 20261210050000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_anexos' AND column_name = 'caminho_quarentena'
  ) THEN
    RAISE EXCEPTION 'pessoas_anexos nao tem caminho_quarentena. Aplicar 20261210050000 primeiro.';
  END IF;

  -- O motivo do RH e o da substituicao ja estao no CHECK de 050000: nao se mexe nele.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_anexos_motivo_valido'
       AND conrelid = 'public.pessoas_anexos'::regclass
       AND pg_get_constraintdef(oid) LIKE '%''rh''%'
       AND pg_get_constraintdef(oid) LIKE '%''substituido''%'
  ) THEN
    RAISE EXCEPTION 'pessoas_anexos_motivo_valido devia aceitar os motivos rh e substituido (20261210050000).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_anexos_activo_tem_convite'
       AND conrelid = 'public.pessoas_anexos'::regclass
  ) THEN
    RAISE EXCEPTION 'pessoas_anexos_activo_tem_convite nao existe; e esta migration que a reescreve.';
  END IF;

  -- As tres de escrita (identificacao.edit, bancarios.edit, pessoais.edit) e as de
  -- leitura que a Edge hr-anexo-url usa (view, identificacao.reveal, bancarios.edit):
  -- bancarios.edit esta nas duas listas, por isso sao cinco codigos distintos.
  SELECT count(*) INTO v_n
    FROM public.anew_permissions
   WHERE code IN ('hr.pessoas.identificacao.edit', 'hr.pessoas.bancarios.edit', 'hr.pessoas.pessoais.edit',
                  'hr.pessoas.view', 'hr.pessoas.identificacao.reveal');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'O catalogo devia ter as 5 permissoes distintas de que os anexos do RH dependem (identificacao.edit, bancarios.edit, pessoais.edit, view, identificacao.reveal); encontrei % (20261120020000).', v_n;
  END IF;

  IF to_regprocedure('public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid) nao existe. Aplicar 20261130200000 primeiro.';
  END IF;

  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. As colunas novas (nenhuma e concedida a authenticated)
-- ==============================================================================
ALTER TABLE public.pessoas_anexos
  ADD COLUMN IF NOT EXISTS origem        text NOT NULL DEFAULT 'convite',
  ADD COLUMN IF NOT EXISTS carregado_por uuid,
  ADD COLUMN IF NOT EXISTS apagado_por   uuid;

COMMENT ON COLUMN public.pessoas_anexos.origem IS
'Quem iniciou o anexo: convite (a pessoa, no convite de admissao; o valor de todas as linhas anteriores) ou rh (o RH, na ficha, sem convite). Nunca se concede a authenticated. Desde 20261210250000.';
COMMENT ON COLUMN public.pessoas_anexos.carregado_por IS
'Auth uid de quem anexou o ficheiro (so origem rh). So quem reservou confirma o envio. Nunca se concede a authenticated. Desde 20261210250000.';
COMMENT ON COLUMN public.pessoas_anexos.apagado_por IS
'Auth uid de quem removeu ou substituiu o anexo (so RH). NULL quando o apagou o sistema (convite, limpeza). Nunca se concede a authenticated. Desde 20261210250000.';

-- ==============================================================================
-- 2. Os CHECKs
-- ==============================================================================
DO $checks$
DECLARE
  v_viola_origem_valida        integer;
  v_viola_activo_tem_convite   integer;
  v_viola_rh_sem_convite       integer;
  v_viola_rh_tem_autor         integer;
BEGIN
  -- origem so aceita convite e rh.
  SELECT count(*) INTO v_viola_origem_valida
    FROM public.pessoas_anexos WHERE origem NOT IN ('convite', 'rh');
  IF v_viola_origem_valida <> 0 THEN
    RAISE EXCEPTION 'Ha % linha(s) com origem fora de convite e rh; nao se acrescenta o CHECK.', v_viola_origem_valida;
  END IF;

  ALTER TABLE public.pessoas_anexos DROP CONSTRAINT IF EXISTS pessoas_anexos_origem_valida;
  ALTER TABLE public.pessoas_anexos
    ADD CONSTRAINT pessoas_anexos_origem_valida CHECK (origem IN ('convite', 'rh'));

  -- ligado exige convite; pendente exige convite OU origem rh.
  SELECT count(*) INTO v_viola_activo_tem_convite
    FROM public.pessoas_anexos
   WHERE (estado = 'ligado' AND convite_id IS NULL)
      OR (estado = 'pendente' AND convite_id IS NULL AND origem <> 'rh');
  IF v_viola_activo_tem_convite <> 0 THEN
    RAISE EXCEPTION 'Ha % linha(s) que violariam o novo pessoas_anexos_activo_tem_convite (ligado ou pendente sem convite); nao se reescreve o CHECK.', v_viola_activo_tem_convite;
  END IF;

  ALTER TABLE public.pessoas_anexos DROP CONSTRAINT IF EXISTS pessoas_anexos_activo_tem_convite;
  ALTER TABLE public.pessoas_anexos
    ADD CONSTRAINT pessoas_anexos_activo_tem_convite
    CHECK ((estado <> 'ligado' OR convite_id IS NOT NULL)
           AND (estado <> 'pendente' OR convite_id IS NOT NULL OR origem = 'rh'));

  -- Um anexo do RH nunca tem convite.
  SELECT count(*) INTO v_viola_rh_sem_convite
    FROM public.pessoas_anexos WHERE origem = 'rh' AND convite_id IS NOT NULL;
  IF v_viola_rh_sem_convite <> 0 THEN
    RAISE EXCEPTION 'Ha % linha(s) do RH com convite; nao se acrescenta pessoas_anexos_rh_sem_convite.', v_viola_rh_sem_convite;
  END IF;

  ALTER TABLE public.pessoas_anexos DROP CONSTRAINT IF EXISTS pessoas_anexos_rh_sem_convite;
  ALTER TABLE public.pessoas_anexos
    ADD CONSTRAINT pessoas_anexos_rh_sem_convite CHECK (origem <> 'rh' OR convite_id IS NULL);

  -- Um anexo do RH tem sempre autor.
  SELECT count(*) INTO v_viola_rh_tem_autor
    FROM public.pessoas_anexos WHERE origem = 'rh' AND carregado_por IS NULL;
  IF v_viola_rh_tem_autor <> 0 THEN
    RAISE EXCEPTION 'Ha % linha(s) do RH sem autor; nao se acrescenta pessoas_anexos_rh_tem_autor.', v_viola_rh_tem_autor;
  END IF;

  ALTER TABLE public.pessoas_anexos DROP CONSTRAINT IF EXISTS pessoas_anexos_rh_tem_autor;
  ALTER TABLE public.pessoas_anexos
    ADD CONSTRAINT pessoas_anexos_rh_tem_autor CHECK (origem <> 'rh' OR carregado_por IS NOT NULL);
END;
$checks$;

COMMENT ON CONSTRAINT pessoas_anexos_activo_tem_convite ON public.pessoas_anexos IS
'Ligado exige convite. Pendente exige convite ou origem rh (o RH nao tem convite). Reescrita em 20261210250000 (antes: pendente e ligado exigiam convite).';

-- ==============================================================================
-- 3. O indice das contagens por pessoa e tipo
--    (promovidos, e pendentes do RH: os que contam para os limites do RH)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS pessoas_anexos_activos_pessoa_tipo_idx
  ON public.pessoas_anexos (pessoa_id, tipo)
  WHERE estado = 'promovido' OR (estado = 'pendente' AND origem = 'rh');

-- ==============================================================================
-- 4. O comentario da tabela (deixa de ser so "carregados pela pessoa no convite")
-- ==============================================================================
COMMENT ON TABLE public.pessoas_anexos IS
'Ficheiros anexados a ficha: pela pessoa no convite de admissao (origem convite) ou pelo RH na ficha (origem rh): cartao de cidadao, comprovativo de IBAN, fotografia. Estados: pendente (na quarentena), ligado (so do convite: verificado, em hr-documentos, invisivel na ficha), promovido (visivel na ficha) e apagado (a Edge Function apaga o objecto e marca objecto_removido_em). SELECT por coluna a authenticated, sem caminho, hash, IP, convite, origem, autor nem motivo; sem escrita para authenticated; o conteudo so se abre pela Edge Function hr-anexo-url. Desde 20261210050000; origem do RH desde 20261210250000.';

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_col       text;
  v_def       text;
  v_n         integer;
  v_proibidas text[] := ARRAY['caminho', 'hash_sha256', 'upload_ip', 'convite_id', 'apagado_motivo', 'objecto_removido_em',
                              'caminho_quarentena', 'quarentena_removida_em', 'limpeza_tentativas',
                              'origem', 'carregado_por', 'apagado_por'];
  v_concedidas text[] := ARRAY['id', 'organization_id', 'pessoa_id', 'tipo', 'estado', 'nome_original',
                               'mime_type', 'tamanho_bytes', 'promovido_em', 'criado_em'];
BEGIN
  -- 1. As colunas concedidas sao EXACTAMENTE as 10 de 20261210050000, e todas as
  --    outras (as tres novas e qualquer coluna futura) ficam fechadas.
  FOR v_col IN
    SELECT a.attname::text FROM pg_attribute a
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
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = 'public.pessoas_anexos'::regclass AND a.attname = v_col AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'A coluna % devia existir em pessoas_anexos.', v_col;
    END IF;
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
     WHERE schemaname = 'public' AND tablename = 'pessoas_anexos' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'A unica politica de pessoas_anexos devia ser de SELECT.';
  END IF;

  -- 4. Os CHECKs novos e o reescrito.
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'pessoas_anexos_activo_tem_convite' AND conrelid = 'public.pessoas_anexos'::regclass;
  IF v_def IS NULL OR v_def NOT LIKE '%origem%' OR v_def NOT LIKE '%''rh''%' OR v_def NOT LIKE '%convite_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'pessoas_anexos_activo_tem_convite nao ficou com a regra do RH: %', coalesce(v_def, '(ausente)');
  END IF;

  FOREACH v_col IN ARRAY ARRAY['pessoas_anexos_origem_valida', 'pessoas_anexos_rh_sem_convite', 'pessoas_anexos_rh_tem_autor',
                               'pessoas_anexos_quarentena_caminho_formato'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = v_col AND conrelid = 'public.pessoas_anexos'::regclass
    ) THEN
      RAISE EXCEPTION 'O CHECK % nao existe.', v_col;
    END IF;
  END LOOP;

  -- 5. A coluna origem tem valor por omissao e nao aceita NULL.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_anexos' AND column_name = 'origem'
       AND is_nullable = 'NO' AND column_default LIKE '%convite%'
  ) THEN
    RAISE EXCEPTION 'pessoas_anexos.origem devia ser NOT NULL com valor por omissao convite.';
  END IF;

  RAISE NOTICE 'OK: pessoas_anexos com SELECT so nas 10 colunas esperadas (origem, carregado_por e apagado_por fechadas), sem escrita, uma politica de SELECT, e os CHECKs do RH.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria dados de teste e DESFAZ-OS
-- tudo com a sentinela HR900 (a subtransaccao reverte as linhas).
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_cargo     uuid;
  v_pessoa    uuid;
  v_id        uuid;
  v_cons      text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo dos anexos do RH foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima).
    -- O trigger de cargos (20261210110000, HRC08) recusa uma ficha sem cargo: fabrica-se
    -- primeiro um cargo activo de teste na nike, com nome unico (hr_cargo_nome_chave,
    -- 20261210160000). Desfeito com tudo o resto pela sentinela HR900.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210250000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210250000 -- apagar', v_cargo, current_date)
    RETURNING id INTO v_pessoa;

    -- 1. Um pendente do RH, sem convite e com autor, e aceite.
    INSERT INTO public.pessoas_anexos
      (organization_id, pessoa_id, tipo, estado, caminho, caminho_quarentena, nome_original, origem, carregado_por)
    VALUES
      (v_org_nike, v_pessoa, 'cartao_cidadao', 'pendente', 'admissao/rh/teste-20261210250000.pdf',
       'admissao/rh/teste-20261210250000.pdf', 'cartao.pdf', 'rh', gen_random_uuid())
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Um pendente do RH sem convite devia ser aceite.' USING ERRCODE = 'HR961';
    END IF;

    -- 2. Um ligado sem convite continua recusado (so o convite liga).
    v_cons := NULL;
    BEGIN
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, tipo, estado, bucket, caminho, nome_original,
         mime_type, tamanho_bytes, hash_sha256, origem, carregado_por)
      VALUES
        (v_org_nike, v_pessoa, 'cartao_cidadao', 'ligado', 'hr-documentos', 'teste-20261210250000/ligado.pdf', 'x.pdf',
         'application/pdf', 10, repeat('a', 64), 'rh', gen_random_uuid());
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'pessoas_anexos_activo_tem_convite' THEN
      RAISE EXCEPTION 'Um ligado sem convite devia ser recusado por pessoas_anexos_activo_tem_convite; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR961';
    END IF;

    -- 3. Um pendente que nao e do RH e nao tem convite continua recusado.
    v_cons := NULL;
    BEGIN
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, tipo, estado, caminho, nome_original)
      VALUES (v_org_nike, v_pessoa, 'cartao_cidadao', 'pendente', 'teste-20261210250000/sem-convite.pdf', 'x.pdf');
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'pessoas_anexos_activo_tem_convite' THEN
      RAISE EXCEPTION 'Um pendente de convite sem convite devia ser recusado por pessoas_anexos_activo_tem_convite; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR961';
    END IF;

    -- 4. Origem rh com convite e recusada. O convite e fabricado: o CHECK dispara
    --    antes da chave estrangeira.
    v_cons := NULL;
    BEGIN
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, convite_id, tipo, estado, caminho, nome_original, origem, carregado_por)
      VALUES (v_org_nike, v_pessoa, gen_random_uuid(), 'cartao_cidadao', 'pendente', 'teste-20261210250000/com-convite.pdf',
              'x.pdf', 'rh', gen_random_uuid());
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'pessoas_anexos_rh_sem_convite' THEN
      RAISE EXCEPTION 'Origem rh com convite devia ser recusada por pessoas_anexos_rh_sem_convite; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR961';
    END IF;

    -- 5. Origem rh sem autor e recusada.
    v_cons := NULL;
    BEGIN
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, tipo, estado, caminho, nome_original, origem)
      VALUES (v_org_nike, v_pessoa, 'cartao_cidadao', 'pendente', 'teste-20261210250000/sem-autor.pdf', 'x.pdf', 'rh');
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'pessoas_anexos_rh_tem_autor' THEN
      RAISE EXCEPTION 'Origem rh sem carregado_por devia ser recusada por pessoas_anexos_rh_tem_autor; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR961';
    END IF;

    -- 6. Uma origem fora de convite e rh e recusada. Leva um convite fabricado para
    --    nao violar tambem pessoas_anexos_activo_tem_convite (com varios CHECKs
    --    violados, a base devolve o primeiro por ordem alfabetica do nome).
    v_cons := NULL;
    BEGIN
      INSERT INTO public.pessoas_anexos
        (organization_id, pessoa_id, convite_id, tipo, estado, caminho, nome_original, origem, carregado_por)
      VALUES (v_org_nike, v_pessoa, gen_random_uuid(), 'cartao_cidadao', 'pendente', 'teste-20261210250000/origem.pdf',
              'x.pdf', 'outra', gen_random_uuid());
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'pessoas_anexos_origem_valida' THEN
      RAISE EXCEPTION 'Uma origem invalida devia ser recusada por pessoas_anexos_origem_valida; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR961';
    END IF;

    RAISE EXCEPTION 'teste_hr_anexos_rh_tabela_20261210250000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao (linhas).
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo dos anexos do RH (tabela) falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): pendente do RH sem convite aceite; ligado sem convite, pendente de convite sem convite, origem rh com convite, origem rh sem autor e origem invalida recusados pelo CHECK certo. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho. Ordem: db push das tres migrations
--    (250000, 260000, 270000), deploy de hr-anexo-rh, ecra. Aplica-se com o
--    codigo no mesmo commit.
--
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked): o push aplica TUDO o que estiver na
--    pasta, por ordem. Antes de escolher estas versoes, listar tambem o remoto:
--    migrations de outros ramos ficam aplicadas na base partilhada sem ficheiro
--    aqui. Nunca migration repair.
--
-- 3. Nao ha vermelho a demonstrar contra o remoto: as colunas sao novas e os
--    testes de texto dao o vermelho antes do codigo. Depois do push NAO se volta
--    atras para demonstrar nada.
-- ==============================================================================
