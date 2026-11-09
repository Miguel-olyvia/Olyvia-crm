-- ==============================================================================
-- Anexos nas justificacoes (ENTREGA E2 do plano "anexos reais nas
-- justificacoes"): o modelo dos ficheiros anexados a uma justificacao do dia
-- ou ao papel de uma falta, com quarentena, e as RPCs que a Edge Function
-- hr-justificacao-anexo (E3) e o ecra (E5) vao chamar. Fecha tambem o achado 3
-- (a leitura directa do bucket hr-justificacoes).
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth):
-- pendentes so 20270111600000 (de que esta depende) e este, acima de
-- 20270111500000; (2) correr a prova na nike em transaccao desfeita ANTES do
-- push (o conferir abaixo e essa prova); (3) revisao ecc:database-reviewer e
-- ecc:security-reviewer.
--
--
-- -- PRECISA DE CODIGO NOVO? ---------------------------------------------------
--
-- Nao parte nada: so acrescenta. Ninguem anexa nada ate existirem a Edge
-- Function (E3), a limpeza agendada (E4: so o cron e a Edge de limpeza; a
-- funcao hr_justificacao_anexos_limpar ja vem aqui) e o ecra (E5). O bucket
-- hr-justificacoes tinha 0 objectos a 9/11 (guarda G6).
-- A Edge NAO pode reutilizar alvosDoDescarte de convite-admissao/accoesAnexos.ts
-- tal como esta: aceita so hr-documentos(-quarantine) e o bucket final aqui e
-- hr-justificacoes.
--
--
-- -- DECISOES DO PLANO QUE ISTO APLICA -----------------------------------------
--
-- D1 abrir: so hr.assiduidade.justificacao.view (com registo) e a propria
--    pessoa (sem registo); quem so decide (.edit) ve a contagem, sem nome.
-- D2 anexa-se enquanto a justificacao-mae esta pendente (dia: estado
--    'pendente'; falta: papel nao anulado, falta activa e justificacao_estado
--    fora de justificada/recusada).
-- D4 reter_ate = 31/12 do ano da falta (ou do dia) + 5 anos. A purga e de uma
--    entrega posterior; o gatilho ja a deixa passar depois de reter_ate.
-- D5 o RH (.edit) anexa em nome da pessoa: carregado_por e o utilizador real
--    e carregado_como = 'rh'.
-- D6 anexos_nomes antigos (simulados) ficam escondidos (20270111600000).
-- D7 "Esqueci-me de picar" fica fora; num_nonnulls = 1 deixa a ligacao pronta.
--
--
-- -- A MATRIZ (organizacao SEMPRE a da linha; nada entra pelo pedido) ----------
--
--                         conta  nome  abre            anexa/remove (pendente)
--   propria (view.own)    sim    sim   sem registo     os seus (so do dia)
--   RH justificacao.view  sim    sim   COM registo     nao
--   RH so .edit           sim    nao   nao             sim (qualquer)
--   chefia / faltas.view  "nao encontrado"
--   outra organizacao     "nao encontrado"
-- A propria pessoa so ve anexos de justificacoes do DIA (tambem os que chegam
-- pela falta que a aceitacao criou). Sobre a propria ficha quem tem .edit e
-- so a pessoa (a mesma regra de rpc_hr_justificacao_dia_registar).
-- Abrir com registo: hr_registar_acesso_sensivel(..., 'justificacao_anexo',
-- 'revelar', p_auth_uid) DENTRO de rpc_hr_justificacao_anexo_autorizar_abertura,
-- antes de devolver o caminho (o plano dizia "devolve se deve registar";
-- registar na base garante que nunca ha URL sem registo).
-- Limites: 4 activos por justificacao (verificados + quarentenas com menos de
-- 2 h; ao verificar, o proprio conta sempre); 12 reservas na vida de uma
-- justificacao (todos os estados).
--
--
-- -- AS RPCs (assinaturas exactas) ---------------------------------------------
--
-- Cliente (authenticated, auth.uid()):
--   rpc_hr_justificacao_anexos_listar(_justificacao_dia_id uuid DEFAULT NULL,
--     _falta_id uuid DEFAULT NULL)  -- exactamente um; _falta_id = pessoas_faltas.id
--     RETURNS TABLE (id uuid, estado text, nome text, mime_type text,
--       tamanho_bytes bigint, criado_em timestamptz, carregado_por_nome text,
--       pode_abrir boolean, pode_remover boolean, origem text)
--     Erros (RAISE): justificacao_anexos_sem_sessao 42501;
--       justificacao_anexos_pedido_invalido 22023;
--       justificacao_anexos_nao_encontrada P0002 (inexistente = sem acesso).
-- Edge (so service_role, HR911 fora dele; devolvem jsonb, recusas em {erro}):
--   rpc_hr_justificacao_anexo_reservar(p_auth_uid uuid, p_justificacao_dia_id uuid,
--     p_falta_justificacao_id uuid, p_nome_original text, p_tamanho_declarado bigint,
--     p_mime_declarado text) -> {anexo_id, caminho}
--   rpc_hr_justificacao_anexo_contexto(p_auth_uid uuid, p_anexo_id uuid)
--     -> {anexo_id, caminho, organization_id, pessoa_id, justificacao_id}
--   rpc_hr_justificacao_anexo_verificar(p_auth_uid uuid, p_anexo_id uuid,
--     p_caminho_final text, p_mime text, p_tamanho bigint, p_hash text)
--     -> {ok, anexo: {id, nome_original, tamanho_bytes, mime_type}}
--   rpc_hr_justificacao_anexo_descartar(p_auth_uid uuid, p_anexo_id uuid, p_motivo text)
--     -> {ok, bucket, caminho, caminho_quarentena}
--   rpc_hr_justificacao_anexo_remover(p_auth_uid uuid, p_anexo_id uuid)
--     -> {ok, bucket, caminho, caminho_quarentena}
--   rpc_hr_justificacao_anexo_autorizar_abertura(p_auth_uid uuid, p_anexo_id uuid)
--     -> {ok, anexo_id, bucket, caminho, mime_type, nome_original, registado}
--   rpc_hr_justificacao_anexo_objecto_removido(p_ids uuid[]) -> integer
--   hr_justificacao_anexos_limpar(p_limite integer DEFAULT 200)
--     RETURNS TABLE (anexo_id uuid, bucket text, caminho text,
--       caminho_quarentena text, caminhos_finais text[], tentativas integer)
-- Codigos {erro}: sem_sessao, pedido_invalido, justificacao_nao_encontrada,
--   justificacao_decidida, sem_permissao, anexo_nao_encontrado,
--   anexo_estado_invalido, anexo_formato_invalido, anexo_vazio,
--   anexo_demasiado_grande, anexo_maximo_ficheiros, anexo_limite_reservas,
--   anexo_falha_envio.
-- Caminhos: quarentena (hr-documentos-quarantine) justificacoes/<anexo>.<ext>
--   (nao passa o regex de INSERT do cliente: so entra com o token assinado);
--   final (hr-justificacoes) <org>/<pessoa>/<id da justificacao>/<anexo>.<ext>,
--   com a extensao do tipo REAL (pdf, png, jpg).
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. pessoas_acessos_sensiveis_campo_valido ganha 'justificacao_anexo', LIDA a
--    lista vigente e acrescentado (padrao de 20261231790000:136; esta
--    constraint ja perdeu valores duas vezes).
-- 2. pessoas_faltas_justificacoes ganha UNIQUE (id, pessoa_id,
--    organization_id), ancora da FK composta.
-- 3. Tabela public.pessoas_justificacoes_anexos, fechada ao cliente: nenhum
--    privilegio de tabela nem de coluna para anon, authenticated e
--    service_role; RLS activa sem politica permissiva. Gatilho BEFORE UPDATE
--    hr_justificacao_anexo_guarda (HJA11: colunas-ancora e transicoes;
--    HJA10: depois de decidida a justificacao so mexem as colunas de limpeza
--    e de retencao). Sem DELETE para ninguem.
-- 4. Storage: a politica permissiva hr_justificacoes_select (le o bucket
--    directamente, sem registo) da lugar a RESTRICTIVE
--    hr_justificacoes_block_select; image/heic sai dos tipos do bucket
--    (a assinatura binaria nunca o confirma).
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- Nada que se veja: ninguem tinha ficheiros em hr-justificacoes. Um CHECK de
-- pessoas_acessos_sensiveis reescrito (toma a tabela por instantes). Mudelar
-- nao esta nesta base.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova e SO com a
-- tabela vazia: largar as funcoes, o gatilho e a tabela desta migration, a
-- UNIQUE de pessoas_faltas_justificacoes e hr_justificacoes_block_select.
-- O valor do CHECK pode ficar.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'justificacoes_anexos_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- Os valores do CHECK de acessos ANTES desta migration (o conferir compara).
CREATE TEMP TABLE tmp_hja2_campos_antes (valor text NOT NULL, ordem bigint NOT NULL) ON COMMIT DROP;

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista text;
  v_n     integer;
  v_def   text;
  v_cod   text;
  v_mimes text[];
BEGIN
  -- G0. Quem aplica passa a RLS (a prova le e escreve na nike).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS.', current_user::text;
  END IF;

  -- G1. 20270111600000 aplicada: anexos_nomes fechada e a listagem do dia ja
  --     esconde os nomes.
  IF has_column_privilege('authenticated', 'public.pessoas_justificacoes_dia', 'anexos_nomes', 'SELECT')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                     WHERE p.oid = to_regprocedure('public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean)')::oid
                       AND p.prosrc LIKE '%THEN j.anexos_nomes ELSE ''{}''::text[] END,%') THEN
    RAISE EXCEPTION 'G1: aplicar 20270111600000 antes (anexos_nomes ainda legivel ou a listagem do dia ainda devolve os nomes).';
  END IF;

  -- G2. Nomes novos livres.
  IF to_regclass('public.pessoas_justificacoes_anexos') IS NOT NULL THEN
    RAISE EXCEPTION 'G2: public.pessoas_justificacoes_anexos ja existe. Ler o que la esta.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND (p.proname::text LIKE 'hr\_justificacao\_anexo%' OR p.proname::text LIKE 'rpc\_hr\_justificacao\_anexo%');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: ja existem funcoes com nomes desta migration: %.', v_lista;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint c
              WHERE c.conrelid = to_regclass('public.pessoas_faltas_justificacoes')
                AND c.conname::text = 'pessoas_faltas_justificacoes_id_pessoa_org_key') THEN
    RAISE EXCEPTION 'G2: pessoas_faltas_justificacoes_id_pessoa_org_key ja existe.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies pp
              WHERE pp.schemaname::text = 'storage' AND pp.tablename::text = 'objects'
                AND pp.policyname::text = 'hr_justificacoes_block_select') THEN
    RAISE EXCEPTION 'G2: a politica hr_justificacoes_block_select ja existe.';
  END IF;

  -- G3. As ancoras das FKs compostas e as colunas lidas.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas') AND c.conname::text = 'pessoas_id_org_key') THEN
    RAISE EXCEPTION 'G3: a unique pessoas_id_org_key nao existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_justificacoes_dia')
                    AND c.conname::text = 'pessoas_justificacoes_dia_id_pessoa_org_key'
                    AND c.contype::text = 'u' AND cardinality(c.conkey) = 3) THEN
    RAISE EXCEPTION 'G3: a unique (id, pessoa_id, organization_id) de pessoas_justificacoes_dia nao existe.';
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('pessoas_justificacoes_dia', 'estado'), ('pessoas_justificacoes_dia', 'data'),
                 ('pessoas_justificacoes_dia', 'falta_id'),
                 ('pessoas_faltas_justificacoes', 'falta_id'), ('pessoas_faltas_justificacoes', 'pessoa_id'),
                 ('pessoas_faltas_justificacoes', 'organization_id'), ('pessoas_faltas_justificacoes', 'anulado_em'),
                 ('pessoas_faltas', 'estado'), ('pessoas_faltas', 'justificacao_estado'), ('pessoas_faltas', 'data'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'G3: faltam colunas esperadas em pessoas_justificacoes_dia, pessoas_faltas_justificacoes ou pessoas_faltas (% de 10).', v_n;
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_faltas') AND c.conname::text = 'pessoas_faltas_justificacao_estado_valido';
  IF v_def IS NULL OR v_def NOT LIKE '%''justificada''%' OR v_def NOT LIKE '%''recusada''%' THEN
    RAISE EXCEPTION 'G3: pessoas_faltas.justificacao_estado ja nao tem justificada/recusada (definicao: %).', coalesce(v_def, 'ausente');
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_justificacoes_dia') AND c.conname::text = 'pessoas_justificacoes_dia_estado_valido';
  IF v_def IS NULL OR v_def NOT LIKE '%''pendente''%' THEN
    RAISE EXCEPTION 'G3: pessoas_justificacoes_dia.estado ja nao tem pendente (definicao: %).', coalesce(v_def, 'ausente');
  END IF;

  -- G4. As funcoes de que esta migration depende; o registo de 5 argumentos
  --     com a guarda de service_role.
  SELECT string_agg(f, ', ') INTO v_lista
    FROM unnest(ARRAY['public.has_anew_permission_in_org(uuid, text, uuid)',
                      'public.hr_pessoa_do_utilizador(uuid, uuid)',
                      'public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid)',
                      'auth.uid()']) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G4: faltam funcoes: %.', v_lista;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure('public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid)')::oid
                    AND p.prosrc LIKE '%service_role%' AND p.prosrc LIKE '%p_auth_uid%') THEN
    RAISE EXCEPTION 'G4: hr_registar_acesso_sensivel de 5 argumentos perdeu a guarda de service_role. Reler.';
  END IF;

  -- G5. Permissoes; justificacao.view perigosa.
  FOREACH v_cod IN ARRAY ARRAY['hr.assiduidade.justificacao.view', 'hr.assiduidade.justificacao.edit',
                               'hr.assiduidade.view.own', 'hr.assiduidade.faltas.view'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G5: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap
                  WHERE ap.code = 'hr.assiduidade.justificacao.view' AND ap.is_dangerous = true) THEN
    RAISE EXCEPTION 'G5: hr.assiduidade.justificacao.view nao esta marcada is_dangerous.';
  END IF;

  -- G6. Storage: hr-justificacoes privado e VAZIO, com as 4 politicas de
  --     20261207004300 (e nenhuma outra com "justificac"); a quarentena de RH
  --     privada, e o INSERT do cliente nela exige um caminho que comeca por
  --     um uuid (justificacoes/... nunca passa).
  IF NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = 'hr-justificacoes' AND b.public = false) THEN
    RAISE EXCEPTION 'G6: o bucket hr-justificacoes nao existe ou e publico.';
  END IF;
  SELECT count(*) INTO v_n FROM storage.objects o WHERE o.bucket_id = 'hr-justificacoes';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G6: hr-justificacoes tem % objecto(s); a politica de leitura so se troca com o bucket vazio. Ler antes de aplicar.', v_n;
  END IF;
  SELECT b.allowed_mime_types INTO v_mimes FROM storage.buckets b WHERE b.id = 'hr-justificacoes';
  IF v_mimes IS NULL OR NOT (v_mimes <@ ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic']::text[]) THEN
    RAISE EXCEPTION 'G6: hr-justificacoes aceita tipos inesperados: %.', coalesce(v_mimes::text, 'NULL (todos)');
  END IF;
  SELECT string_agg(pp.policyname::text, ', ' ORDER BY pp.policyname::text COLLATE "C") INTO v_lista
    FROM pg_policies pp
   WHERE pp.schemaname::text = 'storage' AND pp.tablename::text = 'objects'
     AND pp.policyname::text ILIKE '%justificac%';
  IF v_lista IS DISTINCT FROM 'hr_justificacoes_block_delete, hr_justificacoes_block_insert, hr_justificacoes_block_update, hr_justificacoes_select' THEN
    RAISE EXCEPTION 'G6: as politicas de storage com "justificac" nao sao as 4 de 20261207004300: %.', coalesce(v_lista, 'nenhuma');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies pp
                  WHERE pp.schemaname::text = 'storage' AND pp.tablename::text = 'objects'
                    AND pp.policyname::text = 'hr_justificacoes_select'
                    AND pp.permissive::text = 'PERMISSIVE' AND pp.cmd::text = 'SELECT') THEN
    RAISE EXCEPTION 'G6: hr_justificacoes_select ja nao e a permissiva de SELECT de 20261207004300.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets b
                  WHERE b.id = 'hr-documentos-quarantine' AND b.public = false
                    AND coalesce(b.file_size_limit, 0) BETWEEN 1 AND 10485760) THEN
    RAISE EXCEPTION 'G6: o bucket hr-documentos-quarantine nao existe, e publico ou nao tem limite de 10 MB.';
  END IF;
  SELECT string_agg(pp.policyname::text, ', ') INTO v_lista
    FROM pg_policies pp
   WHERE pp.schemaname::text = 'storage' AND pp.tablename::text = 'objects'
     AND pp.permissive::text = 'PERMISSIVE' AND pp.cmd::text IN ('INSERT', 'ALL')
     AND (coalesce(pp.with_check::text, '') LIKE '%hr-documentos-quarantine%' OR coalesce(pp.qual::text, '') LIKE '%hr-documentos-quarantine%')
     AND coalesce(pp.with_check::text, '') NOT LIKE '%^[0-9a-f]{8}-%';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G6: ha politicas de INSERT em hr-documentos-quarantine que nao exigem um uuid no inicio do caminho (o browser poderia escrever em justificacoes/): %.', v_lista;
  END IF;

  -- G7. O CHECK de acessos: lido, guardado para o conferir.
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname::text = 'pessoas_acessos_sensiveis_campo_valido';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'G7: a constraint pessoas_acessos_sensiveis_campo_valido nao existe.';
  END IF;
  INSERT INTO tmp_hja2_campos_antes (valor, ordem)
  SELECT m.v[1], m.o FROM regexp_matches(v_def, '''([a-z_]+)''::text', 'g') WITH ORDINALITY AS m(v, o);
  -- Cada literal do CHECK tem de ter sido extraido pela regex: se a definicao
  -- tiver um literal que ela nao apanha (maiusculas, digitos, hifen...), o CHECK
  -- reescrito perderia esse valor em silencio.
  IF (length(v_def) - length(replace(v_def, '''::text', ''))) / length('''::text')
     <> (SELECT count(*) FROM tmp_hja2_campos_antes) THEN
    RAISE EXCEPTION 'G7: o CHECK de acessos tem % literais ''::text mas a regex extraiu %; a lista nao se pode reescrever com seguranca: %.',
      (length(v_def) - length(replace(v_def, '''::text', ''))) / length('''::text'),
      (SELECT count(*) FROM tmp_hja2_campos_antes), v_def;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tmp_hja2_campos_antes t WHERE t.valor = 'justificacao_dia') THEN
    RAISE EXCEPTION 'G7: nao consegui ler os valores do CHECK de acessos (ou perdeu justificacao_dia): %.', v_def;
  END IF;

  -- G8. Os SQLSTATE novos (HJA10, HJA11) nao sao usados por ninguem.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND (p.prosrc LIKE '%HJA10%' OR p.prosrc LIKE '%HJA11%');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G8: HJA10/HJA11 ja sao usados por: %. Escolher outros.', v_lista;
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. 'justificacao_anexo' no CHECK de pessoas_acessos_sensiveis.campo
--    A lista vem da definicao VIGENTE, e so se acrescenta.
-- ==============================================================================
DO $acessos$
DECLARE
  k_novo   constant text := 'justificacao_anexo';
  v_coment text;
  v_ddl    text;
  v_fora   text;
BEGIN
  IF EXISTS (SELECT 1 FROM tmp_hja2_campos_antes t WHERE t.valor = k_novo) THEN
    RAISE NOTICE 'O CHECK de acessos ja aceita %; nada a fazer.', k_novo;
    RETURN;
  END IF;

  SELECT string_agg(DISTINCT s.campo, ', ' ORDER BY s.campo) INTO v_fora
    FROM public.pessoas_acessos_sensiveis s
   WHERE s.campo NOT IN (SELECT t.valor FROM tmp_hja2_campos_antes t);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'Ha linhas de pessoas_acessos_sensiveis com campo fora do CHECK actual: %. Investigar antes de aplicar.', v_fora;
  END IF;

  SELECT obj_description(c.oid, 'pg_constraint') INTO v_coment FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname::text = 'pessoas_acessos_sensiveis_campo_valido';

  SELECT 'ALTER TABLE public.pessoas_acessos_sensiveis ADD CONSTRAINT pessoas_acessos_sensiveis_campo_valido CHECK (campo = ANY (ARRAY['
         || string_agg(quote_literal(x.valor), ', ' ORDER BY x.ordem) || ']))'
    INTO v_ddl
    FROM (SELECT t.valor, t.ordem FROM tmp_hja2_campos_antes t
          UNION ALL
          SELECT k_novo, (SELECT max(t2.ordem) + 1 FROM tmp_hja2_campos_antes t2)) AS x;

  ALTER TABLE public.pessoas_acessos_sensiveis DROP CONSTRAINT pessoas_acessos_sensiveis_campo_valido;
  EXECUTE v_ddl;

  EXECUTE format('COMMENT ON CONSTRAINT pessoas_acessos_sensiveis_campo_valido ON public.pessoas_acessos_sensiveis IS %L',
                 coalesce(v_coment, '') || ' Desde 20270111610000: justificacao_anexo (abrir um anexo de uma justificacao, rpc_hr_justificacao_anexo_autorizar_abertura). Lista lida da definicao vigente e so acrescentada.');
END;
$acessos$;


-- ==============================================================================
-- 2. A ancora da FK composta em pessoas_faltas_justificacoes
-- ==============================================================================
ALTER TABLE public.pessoas_faltas_justificacoes
  ADD CONSTRAINT pessoas_faltas_justificacoes_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id);


-- ==============================================================================
-- 3. A tabela
-- ==============================================================================
CREATE TABLE public.pessoas_justificacoes_anexos (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid        NOT NULL,
  pessoa_id              uuid        NOT NULL,
  justificacao_dia_id    uuid,
  falta_justificacao_id  uuid,

  estado                 text        NOT NULL DEFAULT 'quarentena',
  motivo_fim             text,

  nome_original          text        NOT NULL,
  mime_type              text,
  tamanho_bytes          bigint,
  hash_sha256            text,

  bucket                 text        NOT NULL DEFAULT 'hr-documentos-quarantine',
  caminho                text        NOT NULL,
  caminho_quarentena     text        NOT NULL,
  quarentena_removida_em timestamptz,
  objecto_removido_em    timestamptz,
  limpeza_tentativas     integer     NOT NULL DEFAULT 0,

  carregado_por          uuid        NOT NULL,
  carregado_como         text        NOT NULL,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  verificado_em          timestamptz,
  removido_em            timestamptz,
  removido_por           uuid,
  reter_ate              date        NOT NULL,

  CONSTRAINT pessoas_justificacoes_anexos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_justificacoes_anexos_caminho_key UNIQUE (caminho),
  CONSTRAINT pessoas_justificacoes_anexos_caminho_quarentena_key UNIQUE (caminho_quarentena),

  CONSTRAINT pessoas_justificacoes_anexos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_justificacoes_anexos_dia_fkey
    FOREIGN KEY (justificacao_dia_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_justificacoes_dia (id, pessoa_id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_justificacoes_anexos_falta_fkey
    FOREIGN KEY (falta_justificacao_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_faltas_justificacoes (id, pessoa_id, organization_id) ON DELETE NO ACTION,

  -- Uma justificacao, e uma so: do dia ou o papel de uma falta. Um terceiro
  -- alvo (D7, "esqueci-me de picar") entra como mais uma coluna nesta conta.
  CONSTRAINT pessoas_justificacoes_anexos_um_alvo
    CHECK (num_nonnulls(justificacao_dia_id, falta_justificacao_id) = 1),

  CONSTRAINT pessoas_justificacoes_anexos_estado_valido
    CHECK (estado IN ('quarentena', 'verificado', 'recusado', 'removido')),
  CONSTRAINT pessoas_justificacoes_anexos_motivo_valido
    CHECK (motivo_fim IS NULL OR motivo_fim IN (
      'formato_invalido', 'demasiado_grande', 'conteudo_recusado', 'upload_abandonado',
      'removido_pela_pessoa', 'removido_pelo_rh', 'retencao')),
  CONSTRAINT pessoas_justificacoes_anexos_bucket_valido
    CHECK (bucket IN ('hr-documentos-quarantine', 'hr-justificacoes')),
  CONSTRAINT pessoas_justificacoes_anexos_mime_valido
    CHECK (mime_type IS NULL OR mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT pessoas_justificacoes_anexos_hash_formato
    CHECK (hash_sha256 IS NULL OR hash_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT pessoas_justificacoes_anexos_nome_valido
    CHECK (char_length(nome_original) BETWEEN 1 AND 200 AND nome_original !~ '[[:cntrl:]]'),
  CONSTRAINT pessoas_justificacoes_anexos_tamanho_valido
    CHECK (tamanho_bytes IS NULL OR (tamanho_bytes > 0 AND tamanho_bytes <= 10485760)),
  CONSTRAINT pessoas_justificacoes_anexos_carregado_como_valido
    CHECK (carregado_como IN ('propria', 'rh')),
  CONSTRAINT pessoas_justificacoes_anexos_propria_so_no_dia
    CHECK (carregado_como <> 'propria' OR justificacao_dia_id IS NOT NULL),
  CONSTRAINT pessoas_justificacoes_anexos_limpeza_positiva
    CHECK (limpeza_tentativas >= 0),

  -- O caminho da quarentena: justificacoes/<id>.<ext>, sempre o desta linha.
  CONSTRAINT pessoas_justificacoes_anexos_quarentena_formato
    CHECK (caminho_quarentena ~ ('^justificacoes/' || id::text || '\.(pdf|png|jpg)$')),

  -- Coerencia entre o estado e o resto da linha.
  CONSTRAINT pessoas_justificacoes_anexos_quarentena_coerente
    CHECK (estado <> 'quarentena'
           OR (bucket = 'hr-documentos-quarantine' AND caminho = caminho_quarentena
               AND verificado_em IS NULL AND motivo_fim IS NULL AND removido_em IS NULL
               AND quarentena_removida_em IS NULL AND objecto_removido_em IS NULL)),
  CONSTRAINT pessoas_justificacoes_anexos_verificado_coerente
    CHECK (estado <> 'verificado'
           OR (bucket = 'hr-justificacoes' AND mime_type IS NOT NULL AND tamanho_bytes IS NOT NULL
               AND hash_sha256 IS NOT NULL AND verificado_em IS NOT NULL
               AND motivo_fim IS NULL AND removido_em IS NULL AND objecto_removido_em IS NULL)),
  CONSTRAINT pessoas_justificacoes_anexos_fim_coerente
    CHECK ((estado IN ('recusado', 'removido')) = (motivo_fim IS NOT NULL AND removido_em IS NOT NULL)),
  CONSTRAINT pessoas_justificacoes_anexos_recusado_coerente
    CHECK (estado <> 'recusado'
           OR (motivo_fim IN ('formato_invalido', 'demasiado_grande', 'conteudo_recusado', 'upload_abandonado')
               AND verificado_em IS NULL AND bucket = 'hr-documentos-quarantine')),
  CONSTRAINT pessoas_justificacoes_anexos_removido_coerente
    CHECK (estado <> 'removido' OR motivo_fim IN ('removido_pela_pessoa', 'removido_pelo_rh', 'retencao')),
  CONSTRAINT pessoas_justificacoes_anexos_removido_por_coerente
    CHECK ((removido_por IS NOT NULL) = coalesce(motivo_fim IN ('removido_pela_pessoa', 'removido_pelo_rh'), false)),
  CONSTRAINT pessoas_justificacoes_anexos_objecto_removido_coerente
    CHECK (objecto_removido_em IS NULL OR estado IN ('recusado', 'removido')),
  -- O caminho final e o unico possivel, construido dos valores da propria linha.
  CONSTRAINT pessoas_justificacoes_anexos_final_formato
    CHECK (bucket <> 'hr-justificacoes'
           OR (mime_type IS NOT NULL
               AND caminho = organization_id::text || '/' || pessoa_id::text || '/'
                             || coalesce(justificacao_dia_id, falta_justificacao_id)::text || '/'
                             || id::text || '.'
                             || CASE mime_type WHEN 'application/pdf' THEN 'pdf'
                                               WHEN 'image/png' THEN 'png'
                                               WHEN 'image/jpeg' THEN 'jpg' END))
);

CREATE INDEX pessoas_justificacoes_anexos_dia_idx
  ON public.pessoas_justificacoes_anexos (justificacao_dia_id) WHERE justificacao_dia_id IS NOT NULL;
CREATE INDEX pessoas_justificacoes_anexos_falta_idx
  ON public.pessoas_justificacoes_anexos (falta_justificacao_id) WHERE falta_justificacao_id IS NOT NULL;
CREATE INDEX pessoas_justificacoes_anexos_pessoa_idx
  ON public.pessoas_justificacoes_anexos (pessoa_id, organization_id);
CREATE INDEX pessoas_justificacoes_anexos_quarentena_idx
  ON public.pessoas_justificacoes_anexos (criado_em) WHERE estado = 'quarentena';
CREATE INDEX pessoas_justificacoes_anexos_por_remover_idx
  ON public.pessoas_justificacoes_anexos (criado_em)
  WHERE estado IN ('recusado', 'removido') AND objecto_removido_em IS NULL;
CREATE INDEX pessoas_justificacoes_anexos_copia_por_remover_idx
  ON public.pessoas_justificacoes_anexos (criado_em) WHERE quarentena_removida_em IS NULL;
CREATE INDEX pessoas_justificacoes_anexos_retencao_idx
  ON public.pessoas_justificacoes_anexos (reter_ate) WHERE estado = 'verificado';

COMMENT ON TABLE public.pessoas_justificacoes_anexos IS
'Ficheiros anexados a uma justificacao do dia (justificacao_dia_id) ou ao papel de uma falta (falta_justificacao_id), exactamente um. Estados: quarentena (reservado; o browser envia para hr-documentos-quarantine em justificacoes/<id>.<ext> com um token assinado), verificado (a Edge confirmou a assinatura, limpou o conteudo e copiou para hr-justificacoes em <org>/<pessoa>/<justificacao>/<id>.<ext>), recusado (formato, tamanho, conteudo ou abandono) e removido (pela pessoa, pelo RH ou por retencao). FECHADA ao cliente: nenhum privilegio para anon, authenticated nem service_role; tudo pelas RPCs SECURITY DEFINER (rpc_hr_justificacao_anexos_listar para o ecra; rpc_hr_justificacao_anexo_* so service_role, para a Edge hr-justificacao-anexo). Depois de decidida a justificacao so mexem as colunas de limpeza e de retencao (gatilho hr_justificacao_anexo_guarda). Sem DELETE. Desde 20270111610000.';
COMMENT ON COLUMN public.pessoas_justificacoes_anexos.nome_original IS
'O nome que o browser mandou, sem caracteres de controlo e com 1 a 200 caracteres. So para mostrar a quem pode abrir (a propria pessoa e justificacao.view): pode ser dado de saude. O ficheiro nunca se guarda com este nome. Passa a "removido" quando o anexo e removido.';
COMMENT ON COLUMN public.pessoas_justificacoes_anexos.hash_sha256 IS
'SHA-256 dos bytes JA LIMPOS (os que ficam guardados em hr-justificacoes), em hexadecimal minusculo.';
COMMENT ON COLUMN public.pessoas_justificacoes_anexos.carregado_por IS
'auth uid de quem reservou (a pessoa ou alguem do RH, D5). So quem reservou confirma, descarta ou ve a quarentena.';
COMMENT ON COLUMN public.pessoas_justificacoes_anexos.reter_ate IS
'31/12 do ano do dia justificado (ou da falta) + 5 anos (D4). Depois disto o gatilho deixa passar a remocao por retencao; a purga automatica e de uma entrega posterior.';
COMMENT ON COLUMN public.pessoas_justificacoes_anexos.caminho_quarentena IS
'justificacoes/<id>.<ext> em hr-documentos-quarantine, gravado ao reservar e nunca reescrito: e o que deixa a limpeza apagar a copia da quarentena depois de verificado, recusado ou removido.';

-- ---- Privilegios e RLS: fechada ---------------------------------------------
REVOKE ALL ON TABLE public.pessoas_justificacoes_anexos FROM PUBLIC;
REVOKE ALL ON TABLE public.pessoas_justificacoes_anexos FROM anon;
REVOKE ALL ON TABLE public.pessoas_justificacoes_anexos FROM authenticated;
REVOKE ALL ON TABLE public.pessoas_justificacoes_anexos FROM service_role;

ALTER TABLE public.pessoas_justificacoes_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY pessoas_justificacoes_anexos_sem_acesso ON public.pessoas_justificacoes_anexos
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON POLICY pessoas_justificacoes_anexos_sem_acesso ON public.pessoas_justificacoes_anexos IS
'Ninguem le nem escreve pela tabela (e nao ha GRANT nenhum): RESTRICTIVE de proposito, para nenhuma politica permissiva futura a reabrir. Tudo pelas RPCs.';


-- ==============================================================================
-- 4. Internas (sem EXECUTE para ninguem; so as RPCs desta migration, que
--    correm como o dono, as chamam)
-- ==============================================================================

-- A justificacao-mae ainda aceita anexos? (D2)
CREATE FUNCTION public.hr_justificacao_anexo_mae_pendente(p_justificacao_dia_id uuid, p_falta_justificacao_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_justificacao_dia_id IS NOT NULL THEN
      EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
               WHERE j.id = p_justificacao_dia_id AND j.estado = 'pendente')
    WHEN p_falta_justificacao_id IS NOT NULL THEN
      EXISTS (SELECT 1
                FROM public.pessoas_faltas_justificacoes fj
                JOIN public.pessoas_faltas f
                  ON f.id = fj.falta_id AND f.organization_id = fj.organization_id
               WHERE fj.id = p_falta_justificacao_id
                 AND fj.anulado_em IS NULL
                 AND f.estado = 'activa'
                 AND f.justificacao_estado NOT IN ('justificada', 'recusada'))
    ELSE false
  END
$$;

COMMENT ON FUNCTION public.hr_justificacao_anexo_mae_pendente(uuid, uuid) IS
'INTERNA (sem EXECUTE para ninguem). true se a justificacao ainda aceita anexos: do dia, estado pendente; papel de uma falta, nao anulado, falta activa e justificacao_estado fora de justificada/recusada. Desde 20270111610000.';

-- Quem e este utilizador perante esta pessoa nesta organizacao.
CREATE FUNCTION public.hr_justificacao_anexo_quem(
  p_auth_uid uuid, p_org uuid, p_pessoa_id uuid,
  OUT o_propria boolean, OUT o_rh_ver boolean, OUT o_rh_editar boolean)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_eu uuid;
BEGIN
  o_propria := false;
  o_rh_ver := false;
  o_rh_editar := false;
  IF p_auth_uid IS NULL OR p_org IS NULL OR p_pessoa_id IS NULL THEN
    RETURN;
  END IF;
  v_eu := public.hr_pessoa_do_utilizador(p_auth_uid, p_org);
  o_propria := v_eu IS NOT NULL AND v_eu = p_pessoa_id
               AND coalesce(public.has_anew_permission_in_org(p_auth_uid, 'hr.assiduidade.view.own', p_org), false);
  o_rh_ver := coalesce(public.has_anew_permission_in_org(p_auth_uid, 'hr.assiduidade.justificacao.view', p_org), false);
  -- Sobre a propria ficha quem e do RH e so a pessoa (a regra de _dia_registar).
  o_rh_editar := coalesce(public.has_anew_permission_in_org(p_auth_uid, 'hr.assiduidade.justificacao.edit', p_org), false)
                 AND v_eu IS DISTINCT FROM p_pessoa_id;
END;
$$;

COMMENT ON FUNCTION public.hr_justificacao_anexo_quem(uuid, uuid, uuid) IS
'INTERNA (sem EXECUTE para ninguem). o_propria: a conta esta ligada a esta pessoa e tem hr.assiduidade.view.own; o_rh_ver: hr.assiduidade.justificacao.view na organizacao; o_rh_editar: hr.assiduidade.justificacao.edit na organizacao e a pessoa NAO e a propria. A organizacao e sempre a da linha. Desde 20270111610000.';

-- Le e BLOQUEIA a justificacao-mae (serializa reservas, verificacoes e
-- remocoes da mesma justificacao, e com a decisao, que a bloqueia FOR UPDATE).
-- Falta: FOR SHARE da falta (a decisao actualiza-a) e depois FOR NO KEY UPDATE
-- do papel. o_org NULL = nao existe.
CREATE FUNCTION public.hr_justificacao_anexo_mae_bloquear(
  p_justificacao_dia_id uuid, p_falta_justificacao_id uuid,
  OUT o_org uuid, OUT o_pessoa uuid, OUT o_data date, OUT o_pendente boolean)
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_falta    uuid;
  v_f_estado text;
  v_f_just   text;
  v_f_org    uuid;
  v_anulado  timestamptz;
  v_estado   text;
BEGIN
  o_pendente := false;
  IF num_nonnulls(p_justificacao_dia_id, p_falta_justificacao_id) <> 1 THEN
    RETURN;
  END IF;

  IF p_justificacao_dia_id IS NOT NULL THEN
    SELECT j.organization_id, j.pessoa_id, j.data, j.estado
      INTO o_org, o_pessoa, o_data, v_estado
      FROM public.pessoas_justificacoes_dia j
     WHERE j.id = p_justificacao_dia_id
       FOR NO KEY UPDATE;
    o_pendente := coalesce(v_estado = 'pendente', false);
    RETURN;
  END IF;

  SELECT fj.falta_id INTO v_falta
    FROM public.pessoas_faltas_justificacoes fj
   WHERE fj.id = p_falta_justificacao_id;
  IF v_falta IS NULL THEN
    RETURN;
  END IF;
  SELECT f.data, f.estado, f.justificacao_estado, f.organization_id
    INTO o_data, v_f_estado, v_f_just, v_f_org
    FROM public.pessoas_faltas f
   WHERE f.id = v_falta
     FOR SHARE;
  SELECT fj.organization_id, fj.pessoa_id, fj.anulado_em
    INTO o_org, o_pessoa, v_anulado
    FROM public.pessoas_faltas_justificacoes fj
   WHERE fj.id = p_falta_justificacao_id AND fj.falta_id = v_falta
     FOR NO KEY UPDATE;
  IF o_org IS NULL OR v_f_org IS DISTINCT FROM o_org THEN
    o_org := NULL;
    RETURN;
  END IF;
  o_pendente := v_anulado IS NULL AND v_f_estado = 'activa'
                AND coalesce(v_f_just NOT IN ('justificada', 'recusada'), false);
END;
$$;

COMMENT ON FUNCTION public.hr_justificacao_anexo_mae_bloquear(uuid, uuid) IS
'INTERNA (sem EXECUTE para ninguem). Le e bloqueia a justificacao-mae (dia: FOR NO KEY UPDATE; falta: FOR SHARE da falta, depois FOR NO KEY UPDATE do papel) e diz organizacao, pessoa, data (do dia ou da falta) e se ainda aceita anexos. o_org NULL = nao existe. Desde 20270111610000.';

-- O gatilho: ancoras imutaveis, transicoes validas, e depois da decisao so a
-- limpeza e a retencao.
CREATE FUNCTION public.hr_justificacao_anexo_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  k_ancoras constant text[] := ARRAY['id', 'organization_id', 'pessoa_id', 'justificacao_dia_id',
                                     'falta_justificacao_id', 'carregado_por', 'carregado_como',
                                     'criado_em', 'caminho_quarentena'];
  v_old     jsonb := to_jsonb(OLD);
  v_new     jsonb := to_jsonb(NEW);
  v_c       text;
  v_livres  text[];
  v_valida  boolean;
BEGIN
  FOREACH v_c IN ARRAY k_ancoras LOOP
    IF (v_new -> v_c) IS DISTINCT FROM (v_old -> v_c) THEN
      RAISE EXCEPTION 'justificacao_anexo_imutavel' USING ERRCODE = 'HJA11',
        DETAIL = 'A coluna ' || v_c || ' de um anexo de justificacao nunca muda.';
    END IF;
  END LOOP;

  v_valida := NEW.estado = OLD.estado
              OR (OLD.estado = 'quarentena' AND NEW.estado IN ('verificado', 'recusado', 'removido'))
              OR (OLD.estado = 'verificado' AND NEW.estado = 'removido');
  IF NOT v_valida THEN
    RAISE EXCEPTION 'justificacao_anexo_imutavel' USING ERRCODE = 'HJA11',
      DETAIL = 'Transicao de estado invalida: ' || OLD.estado || ' -> ' || NEW.estado || '.';
  END IF;

  IF NOT public.hr_justificacao_anexo_mae_pendente(NEW.justificacao_dia_id, NEW.falta_justificacao_id) THEN
    v_livres := ARRAY['quarentena_removida_em', 'objecto_removido_em', 'limpeza_tentativas', 'reter_ate'];
    IF OLD.estado = 'quarentena' AND NEW.estado = 'recusado' THEN
      -- Um envio que nunca foi verificado sai sempre (limpeza).
      v_livres := v_livres || ARRAY['estado', 'motivo_fim', 'removido_em'];
    ELSIF OLD.estado = 'verificado' AND NEW.estado = 'removido'
          AND NEW.motivo_fim = 'retencao' AND OLD.reter_ate < current_date THEN
      -- A purga por retencao (D4), so depois de reter_ate.
      v_livres := v_livres || ARRAY['estado', 'motivo_fim', 'removido_em', 'nome_original', 'hash_sha256'];
    END IF;
    IF (v_new - v_livres) IS DISTINCT FROM (v_old - v_livres) THEN
      RAISE EXCEPTION 'justificacao_anexo_justificacao_decidida' USING ERRCODE = 'HJA10',
        DETAIL = 'A justificacao deste anexo ja foi decidida (ou anulada): so a limpeza e a retencao mexem nele.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_justificacao_anexo_guarda() IS
'INTERNA (gatilho BEFORE UPDATE de pessoas_justificacoes_anexos). HJA11 (justificacao_anexo_imutavel): muda uma ancora (id, organizacao, pessoa, justificacao, autor, como, criado_em, caminho da quarentena) ou uma transicao fora de quarentena -> verificado|recusado|removido e verificado -> removido. HJA10 (justificacao_anexo_justificacao_decidida): com a justificacao-mae ja decidida ou anulada, so mudam quarentena_removida_em, objecto_removido_em, limpeza_tentativas e reter_ate, mais quarentena -> recusado (limpeza) e verificado -> removido por retencao depois de reter_ate. Desde 20270111610000.';

CREATE TRIGGER trg_pessoas_justificacoes_anexos_guarda
  BEFORE UPDATE ON public.pessoas_justificacoes_anexos
  FOR EACH ROW EXECUTE FUNCTION public.hr_justificacao_anexo_guarda();

REVOKE ALL ON FUNCTION public.hr_justificacao_anexo_mae_pendente(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_justificacao_anexo_quem(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_justificacao_anexo_mae_bloquear(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_justificacao_anexo_guarda() FROM PUBLIC, anon, authenticated, service_role;


-- ==============================================================================
-- 5. As RPCs da Edge (so service_role; o utilizador vem em p_auth_uid)
-- ==============================================================================

-- ---- 5.1 Reservar ------------------------------------------------------------
CREATE FUNCTION public.rpc_hr_justificacao_anexo_reservar(
  p_auth_uid              uuid,
  p_justificacao_dia_id   uuid,
  p_falta_justificacao_id uuid,
  p_nome_original         text,
  p_tamanho_declarado     bigint,
  p_mime_declarado        text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_activos  constant integer := 4;
  c_max_reservas constant integer := 12;
  c_max_bytes    constant bigint  := 10485760;
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_mae          record;
  v_quem         record;
  v_e_dia        boolean := p_justificacao_dia_id IS NOT NULL;
  v_mime         text := lower(btrim(coalesce(p_mime_declarado, '')));
  v_activos      integer;
  v_reservas     integer;
  v_ext          text;
  v_nome         text;
  v_como         text;
  v_id           uuid := gen_random_uuid();
  v_caminho      text;
BEGIN
  -- So service_role: sem isto um EXECUTE futuro a authenticated deixaria
  -- qualquer utilizador passar o uid de outra pessoa.
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.' USING ERRCODE = 'HR911';
  END IF;
  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;
  IF num_nonnulls(p_justificacao_dia_id, p_falta_justificacao_id) <> 1 THEN
    RETURN jsonb_build_object('erro', 'pedido_invalido');
  END IF;

  -- A justificacao fica bloqueada ate ao fim: duas reservas em simultaneo nao
  -- passam as duas pelos limites, e a decisao espera.
  SELECT * INTO v_mae FROM public.hr_justificacao_anexo_mae_bloquear(p_justificacao_dia_id, p_falta_justificacao_id);
  IF v_mae.o_org IS NULL THEN
    RETURN jsonb_build_object('erro', 'justificacao_nao_encontrada');
  END IF;

  SELECT * INTO v_quem FROM public.hr_justificacao_anexo_quem(p_auth_uid, v_mae.o_org, v_mae.o_pessoa);
  -- Quem nao a ve (chefia, outra organizacao) recebe o mesmo que uma inexistente.
  IF NOT ((v_e_dia AND v_quem.o_propria) OR v_quem.o_rh_ver OR v_quem.o_rh_editar) THEN
    RETURN jsonb_build_object('erro', 'justificacao_nao_encontrada');
  END IF;
  IF NOT ((v_e_dia AND v_quem.o_propria) OR v_quem.o_rh_editar) THEN
    RETURN jsonb_build_object('erro', 'sem_permissao');
  END IF;
  IF NOT v_mae.o_pendente THEN
    RETURN jsonb_build_object('erro', 'justificacao_decidida');
  END IF;

  IF v_mime NOT IN ('application/pdf', 'image/jpeg', 'image/png') THEN
    RETURN jsonb_build_object('erro', 'anexo_formato_invalido');
  END IF;
  IF p_tamanho_declarado IS NULL OR p_tamanho_declarado <= 0 THEN
    RETURN jsonb_build_object('erro', 'anexo_vazio');
  END IF;
  IF p_tamanho_declarado > c_max_bytes THEN
    RETURN jsonb_build_object('erro', 'anexo_demasiado_grande');
  END IF;

  -- Activos: verificados + quarentenas com menos de 2 h (uma mais velha e um
  -- envio abandonado; a limpeza recusa-a as 3 h). Reservas: todas, de sempre.
  SELECT count(*) FILTER (WHERE a.estado = 'verificado'
                             OR (a.estado = 'quarentena' AND a.criado_em > now() - interval '2 hours')),
         count(*)
    INTO v_activos, v_reservas
    FROM public.pessoas_justificacoes_anexos a
   WHERE a.justificacao_dia_id = p_justificacao_dia_id
      OR a.falta_justificacao_id = p_falta_justificacao_id;
  IF v_activos >= c_max_activos THEN
    RETURN jsonb_build_object('erro', 'anexo_maximo_ficheiros');
  END IF;
  IF v_reservas >= c_max_reservas THEN
    RETURN jsonb_build_object('erro', 'anexo_limite_reservas');
  END IF;

  v_ext := CASE v_mime WHEN 'application/pdf' THEN 'pdf' WHEN 'image/png' THEN 'png' ELSE 'jpg' END;
  -- So para mostrar: sem caracteres de controlo, ate 200. O ficheiro usa o id.
  v_nome := btrim(left(btrim(regexp_replace(coalesce(p_nome_original, ''), '[[:cntrl:]]', '', 'g')), 200));
  IF v_nome = '' THEN
    v_nome := 'ficheiro';
  END IF;
  v_como := CASE WHEN v_e_dia AND v_quem.o_propria THEN 'propria' ELSE 'rh' END;
  v_caminho := 'justificacoes/' || v_id::text || '.' || v_ext;

  INSERT INTO public.pessoas_justificacoes_anexos (
    id, organization_id, pessoa_id, justificacao_dia_id, falta_justificacao_id,
    estado, nome_original, bucket, caminho, caminho_quarentena,
    carregado_por, carregado_como, reter_ate
  ) VALUES (
    v_id, v_mae.o_org, v_mae.o_pessoa, p_justificacao_dia_id, p_falta_justificacao_id,
    'quarentena', v_nome, 'hr-documentos-quarantine', v_caminho, v_caminho,
    p_auth_uid, v_como, make_date(extract(year FROM v_mae.o_data)::integer + 5, 12, 31)
  );

  RETURN jsonb_build_object('anexo_id', v_id, 'caminho', v_caminho);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_justificacao_anexo_reservar(uuid, uuid, uuid, text, bigint, text) IS
'Reserva um anexo numa justificacao (do dia OU o papel de uma falta, exactamente um): bloqueia a justificacao, tira a organizacao e a pessoa DELA, verifica quem pode (a propria pessoa com view.own so no dia; o RH com justificacao.edit, nunca sobre a propria ficha), que ainda esta pendente, o tipo e o tamanho declarados (pdf/jpeg/png, ate 10 MB) e os limites (4 activos; 12 reservas na vida da justificacao). Cria a linha em quarentena (justificacoes/<id>.<ext>, carregado_por = p_auth_uid, carregado_como propria|rh, reter_ate = 31/12 do ano + 5). Devolve {anexo_id, caminho} ou {erro}: justificacao_nao_encontrada (tambem sem acesso), sem_permissao, justificacao_decidida, anexo_formato_invalido, anexo_vazio, anexo_demasiado_grande, anexo_maximo_ficheiros, anexo_limite_reservas, pedido_invalido, sem_sessao. SO service_role; fora dele, HR911. Desde 20270111610000.';

-- ---- 5.2 Contexto (para confirmar) ------------------------------------------
CREATE FUNCTION public.rpc_hr_justificacao_anexo_contexto(p_auth_uid uuid, p_anexo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_a            public.pessoas_justificacoes_anexos%ROWTYPE;
  v_quem         record;
  v_e_dia        boolean;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.' USING ERRCODE = 'HR911';
  END IF;
  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_a FROM public.pessoas_justificacoes_anexos a WHERE a.id = p_anexo_id;
  -- Inexistente ou reservado por outro: o mesmo codigo.
  IF v_a.id IS NULL OR v_a.carregado_por IS DISTINCT FROM p_auth_uid THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  IF v_a.estado <> 'quarentena' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  v_e_dia := v_a.justificacao_dia_id IS NOT NULL;
  SELECT * INTO v_quem FROM public.hr_justificacao_anexo_quem(p_auth_uid, v_a.organization_id, v_a.pessoa_id);
  IF NOT ((v_e_dia AND v_quem.o_propria) OR v_quem.o_rh_editar) THEN
    RETURN jsonb_build_object('erro', 'sem_permissao');
  END IF;
  IF NOT public.hr_justificacao_anexo_mae_pendente(v_a.justificacao_dia_id, v_a.falta_justificacao_id) THEN
    RETURN jsonb_build_object('erro', 'justificacao_decidida');
  END IF;

  -- Uso interno da Edge (constroi o caminho final). Nunca chega ao browser.
  RETURN jsonb_build_object(
    'anexo_id', v_a.id,
    'caminho', v_a.caminho,
    'organization_id', v_a.organization_id,
    'pessoa_id', v_a.pessoa_id,
    'justificacao_id', coalesce(v_a.justificacao_dia_id, v_a.falta_justificacao_id)
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_justificacao_anexo_contexto(uuid, uuid) IS
'Contexto de um anexo em quarentena para a Edge o confirmar: {anexo_id, caminho (quarentena), organization_id, pessoa_id, justificacao_id}; o caminho final e <organization_id>/<pessoa_id>/<justificacao_id>/<anexo_id>.<ext real>. So quem reservou (senao anexo_nao_encontrado); fora de quarentena anexo_estado_invalido; sem a permissao de anexar sem_permissao; justificacao ja decidida justificacao_decidida (a Edge descarta). Uso INTERNO da Edge: organizacao e pessoa nunca chegam ao browser. SO service_role; HR911. Desde 20270111610000.';

-- ---- 5.3 Verificar (a Edge ja limpou e copiou para hr-justificacoes) --------
CREATE FUNCTION public.rpc_hr_justificacao_anexo_verificar(
  p_auth_uid      uuid,
  p_anexo_id      uuid,
  p_caminho_final text,
  p_mime          text,
  p_tamanho       bigint,
  p_hash          text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_activos constant integer := 4;
  c_max_bytes   constant bigint  := 10485760;
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_dia          uuid;
  v_fj           uuid;
  v_mae          record;
  v_a            public.pessoas_justificacoes_anexos%ROWTYPE;
  v_quem         record;
  v_e_dia        boolean;
  v_outros       integer;
  v_ext          text;
  v_esperado     text;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.' USING ERRCODE = 'HR911';
  END IF;
  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  SELECT a.justificacao_dia_id, a.falta_justificacao_id INTO v_dia, v_fj
    FROM public.pessoas_justificacoes_anexos a WHERE a.id = p_anexo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  -- Ordem dos bloqueios: a justificacao, depois o anexo (a de remover).
  SELECT * INTO v_mae FROM public.hr_justificacao_anexo_mae_bloquear(v_dia, v_fj);
  SELECT * INTO v_a FROM public.pessoas_justificacoes_anexos a WHERE a.id = p_anexo_id FOR UPDATE;
  IF v_a.id IS NULL OR v_mae.o_org IS NULL OR v_a.carregado_por IS DISTINCT FROM p_auth_uid THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  IF v_a.estado <> 'quarentena' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  v_e_dia := v_a.justificacao_dia_id IS NOT NULL;
  SELECT * INTO v_quem FROM public.hr_justificacao_anexo_quem(p_auth_uid, v_a.organization_id, v_a.pessoa_id);
  IF NOT ((v_e_dia AND v_quem.o_propria) OR v_quem.o_rh_editar) THEN
    RETURN jsonb_build_object('erro', 'sem_permissao');
  END IF;
  IF NOT v_mae.o_pendente THEN
    RETURN jsonb_build_object('erro', 'justificacao_decidida');
  END IF;

  -- O tipo e o tamanho REAIS (medidos pela Edge nos bytes limpos).
  IF p_mime IS NULL OR p_mime NOT IN ('application/pdf', 'image/jpeg', 'image/png') THEN
    RETURN jsonb_build_object('erro', 'anexo_formato_invalido');
  END IF;
  IF p_tamanho IS NULL OR p_tamanho <= 0 THEN
    RETURN jsonb_build_object('erro', 'anexo_vazio');
  END IF;
  IF p_tamanho > c_max_bytes THEN
    RETURN jsonb_build_object('erro', 'anexo_demasiado_grande');
  END IF;
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('erro', 'anexo_falha_envio');
  END IF;

  v_ext := CASE p_mime WHEN 'application/pdf' THEN 'pdf' WHEN 'image/png' THEN 'png' ELSE 'jpg' END;
  v_esperado := v_a.organization_id::text || '/' || v_a.pessoa_id::text || '/'
                || coalesce(v_a.justificacao_dia_id, v_a.falta_justificacao_id)::text || '/'
                || v_a.id::text || '.' || v_ext;
  IF p_caminho_final IS DISTINCT FROM v_esperado THEN
    RETURN jsonb_build_object('erro', 'anexo_falha_envio');
  END IF;

  -- Este conta sempre; os outros activos como ao reservar.
  SELECT count(*) INTO v_outros
    FROM public.pessoas_justificacoes_anexos a
   WHERE (a.justificacao_dia_id = v_a.justificacao_dia_id OR a.falta_justificacao_id = v_a.falta_justificacao_id)
     AND a.id <> v_a.id
     AND (a.estado = 'verificado'
          OR (a.estado = 'quarentena' AND a.criado_em > now() - interval '2 hours'));
  IF v_outros >= c_max_activos THEN
    RETURN jsonb_build_object('erro', 'anexo_maximo_ficheiros');
  END IF;

  UPDATE public.pessoas_justificacoes_anexos a
     SET estado        = 'verificado',
         bucket        = 'hr-justificacoes',
         caminho       = p_caminho_final,
         mime_type     = p_mime,
         tamanho_bytes = p_tamanho,
         hash_sha256   = p_hash,
         verificado_em = now()
   WHERE a.id = v_a.id;

  RETURN jsonb_build_object(
    'ok', true,
    'anexo', jsonb_build_object(
      'id', v_a.id,
      'nome_original', v_a.nome_original,
      'tamanho_bytes', p_tamanho,
      'mime_type', p_mime
    )
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_justificacao_anexo_verificar(uuid, uuid, text, text, bigint, text) IS
'Passa a verificado um anexo em quarentena depois de a Edge confirmar a assinatura, limpar o conteudo e copiar os bytes LIMPOS para hr-justificacoes. Bloqueia a justificacao e o anexo; repete autor, estado, permissao e pendente; exige tipo real pdf/jpeg/png, 1 byte a 10 MB, hash SHA-256 em hexadecimal minusculo e o caminho final exacto <org>/<pessoa>/<justificacao>/<id>.<pdf|png|jpg> (senao anexo_falha_envio); este conta sempre para os 4 activos. Devolve {ok, anexo: {id, nome_original, tamanho_bytes, mime_type}} ou {erro}. Ja verificado: anexo_estado_invalido. SO service_role; HR911. Desde 20270111610000.';

-- ---- 5.4 Descartar (a Edge desfaz o proprio trabalho) ------------------------
CREATE FUNCTION public.rpc_hr_justificacao_anexo_descartar(p_auth_uid uuid, p_anexo_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_a            public.pessoas_justificacoes_anexos%ROWTYPE;
  v_copia        text;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.' USING ERRCODE = 'HR911';
  END IF;
  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;
  -- Nunca "removido pela pessoa/RH" por aqui: so os motivos da Edge.
  IF p_motivo IS NULL
     OR p_motivo NOT IN ('upload_abandonado', 'formato_invalido', 'demasiado_grande', 'conteudo_recusado') THEN
    RETURN jsonb_build_object('erro', 'pedido_invalido');
  END IF;

  SELECT * INTO v_a FROM public.pessoas_justificacoes_anexos a WHERE a.id = p_anexo_id FOR UPDATE;
  IF v_a.id IS NULL OR v_a.carregado_por IS DISTINCT FROM p_auth_uid THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  IF v_a.estado = 'verificado' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  IF v_a.estado = 'quarentena' THEN
    -- Tambem depois de decidida a justificacao: um envio nunca verificado sai sempre.
    UPDATE public.pessoas_justificacoes_anexos a
       SET estado = 'recusado', motivo_fim = p_motivo, removido_em = now()
     WHERE a.id = v_a.id;
  END IF;

  -- Idempotente: recusado ou removido devolve onde esta o objecto.
  v_copia := CASE WHEN v_a.caminho_quarentena IS DISTINCT FROM v_a.caminho THEN v_a.caminho_quarentena END;
  RETURN jsonb_build_object('ok', true, 'bucket', v_a.bucket, 'caminho', v_a.caminho, 'caminho_quarentena', v_copia);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_justificacao_anexo_descartar(uuid, uuid, text) IS
'So para a Edge desfazer o proprio trabalho: passa a recusado um anexo em QUARENTENA reservado por este utilizador, com upload_abandonado, formato_invalido, demasiado_grande ou conteudo_recusado (outro motivo: pedido_invalido); funciona tambem depois de decidida a justificacao. Verificado: anexo_estado_invalido. Inexistente ou de outro autor: anexo_nao_encontrado. Idempotente. Devolve {ok, bucket, caminho, caminho_quarentena} ou {erro}. SO service_role; HR911. Desde 20270111610000.';

-- ---- 5.5 Remover (pela pessoa ou pelo RH, enquanto pendente) ----------------
CREATE FUNCTION public.rpc_hr_justificacao_anexo_remover(p_auth_uid uuid, p_anexo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_dia          uuid;
  v_fj           uuid;
  v_mae          record;
  v_a            public.pessoas_justificacoes_anexos%ROWTYPE;
  v_quem         record;
  v_e_dia        boolean;
  v_como_pessoa  boolean;
  v_motivo       text;
  v_copia        text;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.' USING ERRCODE = 'HR911';
  END IF;
  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  SELECT a.justificacao_dia_id, a.falta_justificacao_id INTO v_dia, v_fj
    FROM public.pessoas_justificacoes_anexos a WHERE a.id = p_anexo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  SELECT * INTO v_mae FROM public.hr_justificacao_anexo_mae_bloquear(v_dia, v_fj);
  SELECT * INTO v_a FROM public.pessoas_justificacoes_anexos a WHERE a.id = p_anexo_id FOR UPDATE;
  IF v_a.id IS NULL OR v_mae.o_org IS NULL THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  v_e_dia := v_a.justificacao_dia_id IS NOT NULL;
  SELECT * INTO v_quem FROM public.hr_justificacao_anexo_quem(p_auth_uid, v_a.organization_id, v_a.pessoa_id);
  -- Quem nao ve a justificacao recebe o mesmo que um anexo que nao existe.
  IF NOT ((v_e_dia AND v_quem.o_propria) OR v_quem.o_rh_ver OR v_quem.o_rh_editar) THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  IF v_a.estado IN ('recusado', 'removido') THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  IF v_a.estado = 'quarentena' AND v_a.carregado_por IS DISTINCT FROM p_auth_uid THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  -- A pessoa remove so os seus; o RH com .edit e .view remove qualquer um; o RH
  -- so com .edit (sem .view) remove apenas os que ele proprio carregou.
  v_como_pessoa := v_e_dia AND v_quem.o_propria
                   AND v_a.carregado_como = 'propria' AND v_a.carregado_por = p_auth_uid;
  IF NOT (v_como_pessoa
          OR (v_quem.o_rh_editar AND (v_quem.o_rh_ver OR v_a.carregado_por = p_auth_uid))) THEN
    RETURN jsonb_build_object('erro', 'sem_permissao');
  END IF;
  IF NOT v_mae.o_pendente THEN
    RETURN jsonb_build_object('erro', 'justificacao_decidida');
  END IF;

  v_motivo := CASE WHEN v_como_pessoa THEN 'removido_pela_pessoa' ELSE 'removido_pelo_rh' END;
  UPDATE public.pessoas_justificacoes_anexos a
     SET estado = 'removido', motivo_fim = v_motivo, removido_em = now(), removido_por = p_auth_uid,
         nome_original = 'removido', hash_sha256 = NULL
   WHERE a.id = v_a.id;

  v_copia := CASE WHEN v_a.quarentena_removida_em IS NULL AND v_a.caminho_quarentena IS DISTINCT FROM v_a.caminho
                  THEN v_a.caminho_quarentena END;
  RETURN jsonb_build_object('ok', true, 'bucket', v_a.bucket, 'caminho', v_a.caminho, 'caminho_quarentena', v_copia);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_justificacao_anexo_remover(uuid, uuid) IS
'Remove um anexo de uma justificacao PENDENTE: a propria pessoa so os que ela carregou (removido_pela_pessoa); o RH com justificacao.edit E .view qualquer um, e so com .edit apenas os que ele proprio carregou (removido_pelo_rh). Bloqueia a justificacao e o anexo. Inexistente, ja removido/recusado ou sem acesso a justificacao: anexo_nao_encontrado; quarentena de outro autor: anexo_estado_invalido; sem permissao: sem_permissao; decidida: justificacao_decidida. O nome passa a "removido" e o hash a NULL. Devolve {ok, bucket, caminho, caminho_quarentena} ou {erro}: a Edge apaga os objectos e chama rpc_hr_justificacao_anexo_objecto_removido. SO service_role; HR911. Desde 20270111610000.';

-- ---- 5.6 Autorizar a abertura (regista ANTES de devolver o caminho) ---------
CREATE FUNCTION public.rpc_hr_justificacao_anexo_autorizar_abertura(p_auth_uid uuid, p_anexo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_a            public.pessoas_justificacoes_anexos%ROWTYPE;
  v_quem         record;
  v_e_dia        boolean;
  v_propria      boolean;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'p_auth_uid so pode ser fornecido por service_role.' USING ERRCODE = 'HR911';
  END IF;
  IF p_auth_uid IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_a FROM public.pessoas_justificacoes_anexos a WHERE a.id = p_anexo_id;
  IF v_a.id IS NULL THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  v_e_dia := v_a.justificacao_dia_id IS NOT NULL;
  SELECT * INTO v_quem FROM public.hr_justificacao_anexo_quem(p_auth_uid, v_a.organization_id, v_a.pessoa_id);
  IF NOT ((v_e_dia AND v_quem.o_propria) OR v_quem.o_rh_ver OR v_quem.o_rh_editar) THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  IF v_a.estado IN ('recusado', 'removido') THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;
  IF v_a.estado <> 'verificado' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  -- Abre a propria pessoa (sem registo) e quem tem justificacao.view (com
  -- registo). Decidir (.edit) nao da acesso ao conteudo (D1).
  v_propria := v_e_dia AND v_quem.o_propria;
  IF NOT (v_propria OR v_quem.o_rh_ver) THEN
    RETURN jsonb_build_object('erro', 'sem_permissao');
  END IF;
  IF NOT v_propria THEN
    PERFORM public.hr_registar_acesso_sensivel(v_a.pessoa_id, v_a.organization_id, 'justificacao_anexo', 'revelar', p_auth_uid);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'anexo_id', v_a.id,
    'bucket', v_a.bucket,
    'caminho', v_a.caminho,
    'mime_type', v_a.mime_type,
    'nome_original', v_a.nome_original,
    'registado', NOT v_propria
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_justificacao_anexo_autorizar_abertura(uuid, uuid) IS
'Autoriza abrir um anexo VERIFICADO: a propria pessoa (justificacao do dia, view.own) sem registo; quem tem hr.assiduidade.justificacao.view COM registo em pessoas_acessos_sensiveis (justificacao_anexo, revelar, com p_auth_uid), feito AQUI e antes de devolver o caminho; quem so tem .edit: sem_permissao. Sem acesso a justificacao, removido ou recusado: anexo_nao_encontrado; em quarentena: anexo_estado_invalido. Devolve {ok, anexo_id, bucket, caminho, mime_type, nome_original, registado} ou {erro}. A Edge emite o URL assinado (TTL curto) e NUNCA devolve o caminho ao browser. SO service_role; HR911. Desde 20270111610000.';

-- ---- 5.7 O objecto saiu do Storage ------------------------------------------
CREATE FUNCTION public.rpc_hr_justificacao_anexo_objecto_removido(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_n integer := 0;
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'esta funcao so pode ser chamada por service_role.' USING ERRCODE = 'HR911';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_ids) > 1000 THEN
    RAISE EXCEPTION 'justificacao_anexo_lote_grande: no maximo 1000 ids por chamada.' USING ERRCODE = '22023';
  END IF;

  -- So se marca o que ja nao pode receber um objecto: o objecto da linha
  -- (recusado/removido) se foi verificado (o final nao tem URL de upload) ou
  -- foi criado ha mais de 3 h; a copia da quarentena so 3 h depois de criada
  -- (o URL de upload assinado vale 2 h). O resto volta na proxima limpeza.
  UPDATE public.pessoas_justificacoes_anexos a
     SET objecto_removido_em = CASE
           WHEN a.estado IN ('recusado', 'removido') AND a.objecto_removido_em IS NULL
                AND (a.verificado_em IS NOT NULL OR a.criado_em < now() - interval '3 hours')
           THEN now() ELSE a.objecto_removido_em END,
         quarentena_removida_em = CASE
           WHEN a.quarentena_removida_em IS NULL AND a.estado <> 'quarentena'
                AND a.criado_em < now() - interval '3 hours'
           THEN now() ELSE a.quarentena_removida_em END
   WHERE a.id = ANY (p_ids)
     AND ((a.estado IN ('recusado', 'removido') AND a.objecto_removido_em IS NULL
           AND (a.verificado_em IS NOT NULL OR a.criado_em < now() - interval '3 hours'))
          OR (a.quarentena_removida_em IS NULL AND a.estado <> 'quarentena'
              AND a.criado_em < now() - interval '3 hours'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_justificacao_anexo_objecto_removido(uuid[]) IS
'A Edge (ou a limpeza) diz que apagou os objectos destes anexos: marca objecto_removido_em nos recusados/removidos que foram verificados ou tem mais de 3 h, e quarentena_removida_em nos que ja sairam da quarentena e tem mais de 3 h. So passar ids em que TODOS os objectos da linha sairam. Ate 1000 ids. Devolve quantas linhas marcou. SO service_role. Desde 20270111610000.';

-- ---- 5.8 Limpeza (o cron e a Edge de limpeza sao a E4) -----------------------
CREATE FUNCTION public.hr_justificacao_anexos_limpar(p_limite integer DEFAULT 200)
RETURNS TABLE (
  anexo_id           uuid,
  bucket             text,
  caminho            text,
  caminho_quarentena text,
  caminhos_finais    text[],
  tentativas         integer
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  c_quarentena_max constant interval := interval '3 hours';
  v_request_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
BEGIN
  IF v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'esta funcao so pode ser chamada por service_role.' USING ERRCODE = 'HR911';
  END IF;
  -- (a) Quarentenas que nunca foram confirmadas.
  UPDATE public.pessoas_justificacoes_anexos a
     SET estado = 'recusado', motivo_fim = 'upload_abandonado', removido_em = now()
   WHERE a.estado = 'quarentena'
     AND a.criado_em < now() - c_quarentena_max;

  -- (b) O que a Edge tem de apagar: o objecto de um recusado/removido, e a
  --     copia da quarentena de quem ja saiu dela. Linhas criadas ha mais de
  --     3 h (o mesmo URL de upload pode voltar a pousar um objecto). Para os
  --     nunca verificados, os tres caminhos finais possiveis (a Edge pode ter
  --     copiado e morrido antes de verificar). Ordena por tentativas; SKIP
  --     LOCKED para duas voltas nao devolverem as mesmas linhas.
  RETURN QUERY
  WITH escolhidas AS (
    SELECT a.id
      FROM public.pessoas_justificacoes_anexos a
     WHERE a.criado_em < now() - c_quarentena_max
       AND ((a.estado IN ('recusado', 'removido') AND a.objecto_removido_em IS NULL)
            OR (a.estado <> 'quarentena' AND a.quarentena_removida_em IS NULL))
     ORDER BY a.limpeza_tentativas, coalesce(a.removido_em, a.criado_em), a.id
     LIMIT v_limite
     FOR UPDATE OF a SKIP LOCKED
  ),
  marcadas AS (
    UPDATE public.pessoas_justificacoes_anexos a
       SET limpeza_tentativas = a.limpeza_tentativas + 1
      FROM escolhidas e
     WHERE a.id = e.id
    RETURNING a.id, a.estado, a.bucket, a.caminho, a.caminho_quarentena, a.quarentena_removida_em,
              a.objecto_removido_em, a.verificado_em, a.organization_id, a.pessoa_id,
              coalesce(a.justificacao_dia_id, a.falta_justificacao_id) AS justificacao_id,
              a.limpeza_tentativas
  )
  SELECT m.id,
         CASE WHEN m.estado IN ('recusado', 'removido') AND m.objecto_removido_em IS NULL THEN m.bucket END,
         CASE WHEN m.estado IN ('recusado', 'removido') AND m.objecto_removido_em IS NULL THEN m.caminho END,
         CASE WHEN m.quarentena_removida_em IS NULL
                   AND NOT (m.estado IN ('recusado', 'removido') AND m.objecto_removido_em IS NULL
                            AND m.caminho = m.caminho_quarentena)
              THEN m.caminho_quarentena END,
         CASE WHEN m.estado IN ('recusado', 'removido') AND m.objecto_removido_em IS NULL AND m.verificado_em IS NULL
              THEN ARRAY[
                     m.organization_id::text || '/' || m.pessoa_id::text || '/' || m.justificacao_id::text || '/' || m.id::text || '.pdf',
                     m.organization_id::text || '/' || m.pessoa_id::text || '/' || m.justificacao_id::text || '/' || m.id::text || '.png',
                     m.organization_id::text || '/' || m.pessoa_id::text || '/' || m.justificacao_id::text || '/' || m.id::text || '.jpg'
                   ]
         END,
         m.limpeza_tentativas
    FROM marcadas m
   ORDER BY m.limpeza_tentativas, m.id;
END;
$$;

COMMENT ON FUNCTION public.hr_justificacao_anexos_limpar(integer) IS
'Passa a recusado (upload_abandonado) as quarentenas com mais de 3 h e devolve ate p_limite (200; tecto 1000) linhas com objectos por sair do Storage: {anexo_id, bucket+caminho (o objecto de um recusado/removido), caminho_quarentena (a copia por apagar, se for outro objecto), caminhos_finais (nunca verificados: os tres finais possiveis em hr-justificacoes), tentativas}. Incrementa limpeza_tentativas e ordena por elas. A Edge de limpeza (E4) apaga tudo e chama rpc_hr_justificacao_anexo_objecto_removido so com os ids em que tudo saiu. SO service_role. Desde 20270111610000.';

REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_anexo_reservar(uuid, uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_anexo_contexto(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_anexo_verificar(uuid, uuid, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_anexo_descartar(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_anexo_remover(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_anexo_autorizar_abertura(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_anexo_objecto_removido(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_justificacao_anexos_limpar(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_anexo_reservar(uuid, uuid, uuid, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_anexo_contexto(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_anexo_verificar(uuid, uuid, text, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_anexo_descartar(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_anexo_remover(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_anexo_autorizar_abertura(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_anexo_objecto_removido(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_anexos_limpar(integer) TO service_role;


-- ==============================================================================
-- 6. A listagem para o ecra (authenticated, auth.uid())
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_justificacao_anexos_listar(
  _justificacao_dia_id uuid DEFAULT NULL,
  _falta_id            uuid DEFAULT NULL
)
RETURNS TABLE (
  id                 uuid,
  estado             text,
  nome               text,
  mime_type          text,
  tamanho_bytes      bigint,
  criado_em          timestamptz,
  carregado_por_nome text,
  pode_abrir         boolean,
  pode_remover       boolean,
  origem             text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_auth   uuid := auth.uid();
  v_org    uuid;
  v_pessoa uuid;
  v_quem   record;
  v_ve     boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_anexos_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF num_nonnulls(_justificacao_dia_id, _falta_id) <> 1 THEN
    RAISE EXCEPTION 'justificacao_anexos_pedido_invalido: indicar a justificacao do dia OU a falta.' USING ERRCODE = '22023';
  END IF;

  IF _justificacao_dia_id IS NOT NULL THEN
    SELECT j.organization_id, j.pessoa_id INTO v_org, v_pessoa
      FROM public.pessoas_justificacoes_dia j WHERE j.id = _justificacao_dia_id;
  ELSE
    SELECT f.organization_id, f.pessoa_id INTO v_org, v_pessoa
      FROM public.pessoas_faltas f WHERE f.id = _falta_id;
  END IF;

  SELECT * INTO v_quem FROM public.hr_justificacao_anexo_quem(v_auth, v_org, v_pessoa);
  -- Na falta, a propria pessoa ve so os anexos da justificacao do dia que a
  -- originou; a chefia e outra organizacao nao veem nada.
  v_ve := v_quem.o_propria OR v_quem.o_rh_ver OR v_quem.o_rh_editar;
  IF v_org IS NULL OR NOT v_ve THEN
    RAISE EXCEPTION 'justificacao_anexos_nao_encontrada: a justificacao nao existe ou nao tem acesso a ela.' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH alvo AS (
    SELECT a.*
      FROM public.pessoas_justificacoes_anexos a
     WHERE a.organization_id = v_org
       AND _justificacao_dia_id IS NOT NULL
       AND a.justificacao_dia_id = _justificacao_dia_id
    UNION ALL
    SELECT a.*
      FROM public.pessoas_justificacoes_anexos a
     WHERE a.organization_id = v_org
       AND _falta_id IS NOT NULL
       AND a.justificacao_dia_id IN (SELECT j.id FROM public.pessoas_justificacoes_dia j
                                      WHERE j.falta_id = _falta_id AND j.organization_id = v_org)
    UNION ALL
    SELECT a.*
      FROM public.pessoas_justificacoes_anexos a
     WHERE a.organization_id = v_org
       AND _falta_id IS NOT NULL
       AND (v_quem.o_rh_ver OR v_quem.o_rh_editar)
       AND a.falta_justificacao_id IN (SELECT fj.id FROM public.pessoas_faltas_justificacoes fj
                                        WHERE fj.falta_id = _falta_id AND fj.organization_id = v_org)
  )
  SELECT x.id,
         x.estado,
         CASE WHEN ((x.justificacao_dia_id IS NOT NULL AND v_quem.o_propria) OR v_quem.o_rh_ver)
                    AND NOT (x.justificacao_dia_id IS NOT NULL AND NOT v_quem.o_propria
                             AND EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia jd
                                          WHERE jd.id = x.justificacao_dia_id
                                            AND jd.organization_id = v_org
                                            AND jd.tipo = 'consulta_medica'))
              THEN x.nome_original END,
         x.mime_type,
         x.tamanho_bytes,
         x.criado_em,
         (SELECT u.name::text FROM public.anew_users u WHERE u.auth_user_id = x.carregado_por LIMIT 1),
         (x.estado = 'verificado'
          AND ((x.justificacao_dia_id IS NOT NULL AND v_quem.o_propria) OR v_quem.o_rh_ver)),
         ((x.estado = 'verificado' OR x.carregado_por = v_auth)
          AND ((x.justificacao_dia_id IS NOT NULL AND v_quem.o_propria
                AND x.carregado_como = 'propria' AND x.carregado_por = v_auth)
               OR (v_quem.o_rh_editar AND (v_quem.o_rh_ver OR x.carregado_por = v_auth)))
          AND public.hr_justificacao_anexo_mae_pendente(x.justificacao_dia_id, x.falta_justificacao_id)),
         CASE WHEN x.justificacao_dia_id IS NOT NULL THEN 'justificacao_dia' ELSE 'falta' END
    FROM alvo x
   WHERE x.estado = 'verificado'
      OR (x.estado = 'quarentena' AND x.carregado_por = v_auth)
   ORDER BY x.criado_em, x.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_anexos_listar(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_anexos_listar(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_justificacao_anexos_listar(uuid, uuid) IS
'Os anexos de uma justificacao do dia (_justificacao_dia_id) OU de uma falta (_falta_id = pessoas_faltas.id: os do papel da falta e os da justificacao do dia que a originou). Mostra os verificados e as quarentenas do proprio. nome so a quem pode abrir (a propria pessoa, no dia; justificacao.view); quem so tem .edit ve a contagem com nome NULL; numa consulta medica (justificacao do dia, tambem na falta) o nome e NULL para quem nao e a propria pessoa, mesmo com .view (a abertura continua permitida, com registo). pode_abrir: verificado e pode ver o nome. pode_remover: justificacao pendente e (a pessoa nos seus; o RH com .edit e .view em qualquer um; o RH so com .edit nos que ele carregou). A propria pessoa nao ve os anexos do papel da falta. Inexistente ou sem acesso (chefia, outra organizacao): justificacao_anexos_nao_encontrada (P0002). Desde 20270111610000.';


-- ==============================================================================
-- 7. Storage: hr-justificacoes deixa de se ler directamente; sem HEIC
-- ==============================================================================
CREATE POLICY "hr_justificacoes_block_select"
ON storage.objects
AS RESTRICTIVE FOR SELECT
TO anon, authenticated
USING (bucket_id <> 'hr-justificacoes');

DROP POLICY "hr_justificacoes_select" ON storage.objects;

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
 WHERE id = 'hr-justificacoes';

COMMENT ON POLICY "hr_justificacoes_block_select" ON storage.objects IS
'Sem SELECT directo de anon/authenticated em hr-justificacoes, RESTRICTIVE de proposito (como hr_documentos_block_select): substitui hr_justificacoes_select, que deixava quem tem justificacao.view ler os atestados sem registo de acesso. A leitura e so por URL assinado de curta duracao, emitido pela Edge depois de rpc_hr_justificacao_anexo_autorizar_abertura (que regista). Desde 20270111610000.';


-- ==============================================================================
-- 8. Conferir (estrutura, e comportamento na nike, desfeito)
-- ==============================================================================

-- Um perfil de prova na nike (papel novo com so estes codigos, molde num papel
-- da propria nike), atribuido a este utilizador na nike. Desfeito pela
-- sentinela. Funcoes temporarias, largadas no fim do ficheiro.
CREATE FUNCTION pg_temp.hja2_perfil(p_org uuid, p_anew_user uuid, p_codigos text[], p_rotulo text)
RETURNS uuid
LANGUAGE plpgsql
AS $perfil$
DECLARE
  v_base jsonb;
  v_role uuid := gen_random_uuid();
  v_tag  text;
  v_n    integer;
BEGIN
  v_tag := replace(v_role::text, '-', '');
  SELECT to_jsonb(r) INTO v_base
    FROM public.anew_roles r
   WHERE r.organization_id = p_org
   ORDER BY ((to_jsonb(r) ->> 'code') IN ('viewer', 'worker')) DESC,
            coalesce((to_jsonb(r) ->> 'is_system')::boolean, false),
            r.id
   LIMIT 1;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'Conferir: a nike nao tem nenhum papel que sirva de molde ao perfil de prova.';
  END IF;

  INSERT INTO public.anew_roles
  SELECT * FROM jsonb_populate_record(NULL::public.anew_roles,
            v_base || jsonb_build_object(
              'id', v_role,
              'code', 'prova_hja2_' || p_rotulo || '_' || v_tag,
              'slug', 'prova_hja2_' || p_rotulo || '_' || v_tag,
              'key', 'prova_hja2_' || p_rotulo || '_' || v_tag,
              'name', 'Prova HJA2 ' || p_rotulo || ' ' || v_tag,
              'nome', 'Prova HJA2 ' || p_rotulo || ' ' || v_tag,
              'description', 'Papel de prova da migracao 20270111610000 (desfeito)',
              'is_system', false, 'is_default', false, 'can_sign_contracts', false,
              'created_by', NULL));

  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role, c.codigo FROM unnest(p_codigos) AS c(codigo);

  UPDATE public.anew_memberships m
     SET role_id = v_role
   WHERE m.user_id = p_anew_user AND m.organization_id = p_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: o perfil de prova % devia mudar 1 associacao na nike; mudou %.', p_rotulo, v_n;
  END IF;
  RETURN v_role;
END;
$perfil$;

-- Quem fala com a base: a Edge (service_role) ou um utilizador (authenticated).
CREATE FUNCTION pg_temp.hja2_servico()
RETURNS void
LANGUAGE plpgsql
AS $s$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true),
          set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$s$;

CREATE FUNCTION pg_temp.hja2_como(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $c$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true),
          set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
END;
$c$;

-- A listagem vista por um utilizador: contagens, ou o SQLSTATE da recusa.
CREATE FUNCTION pg_temp.hja2_ver(p_uid uuid, p_dia uuid, p_falta uuid,
  OUT o_linhas integer, OUT o_com_nome integer, OUT o_abre integer, OUT o_remove integer, OUT o_erro text)
LANGUAGE plpgsql
AS $v$
BEGIN
  PERFORM pg_temp.hja2_como(p_uid);
  BEGIN
    SELECT count(*), count(*) FILTER (WHERE l.nome IS NOT NULL),
           count(*) FILTER (WHERE l.pode_abrir), count(*) FILTER (WHERE l.pode_remover)
      INTO o_linhas, o_com_nome, o_abre, o_remove
      FROM public.rpc_hr_justificacao_anexos_listar(p_dia, p_falta) AS l;
  EXCEPTION WHEN OTHERS THEN
    o_erro := SQLSTATE || ' ' || split_part(SQLERRM, ':', 1);
  END;
  PERFORM pg_temp.hja2_servico();
END;
$v$;

-- ---- 8.1 Estrutura -----------------------------------------------------------
DO $conferir_estrutura$
DECLARE
  k_tab   constant text := 'public.pessoas_justificacoes_anexos';
  v_r     record;
  v_grant text;
  v_papel text;
  v_priv  text;
  v_falta text;
  v_sobra text;
  v_orfaos text;
  v_def   text;
  v_lista text;
  v_mimes text[];
BEGIN
  -- Tabela: RLS activa, so a politica RESTRICTIVE, nenhum privilegio para
  -- anon, authenticated e service_role (tabela e coluna), nenhum GRANT na ACL
  -- alem do dono.
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass(k_tab) AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'Conferir: pessoas_justificacoes_anexos sem RLS activa.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies pp
              WHERE pp.schemaname::text = 'public' AND pp.tablename::text = 'pessoas_justificacoes_anexos'
                AND pp.permissive::text <> 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'Conferir: pessoas_justificacoes_anexos tem uma politica permissiva.';
  END IF;
  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(v_papel, k_tab, v_priv) THEN
        RAISE EXCEPTION 'Conferir: % tem % na tabela pessoas_justificacoes_anexos.', v_papel, v_priv;
      END IF;
    END LOOP;
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege(v_papel, k_tab, v_priv) THEN
        RAISE EXCEPTION 'Conferir: % tem % em alguma coluna de pessoas_justificacoes_anexos.', v_papel, v_priv;
      END IF;
    END LOOP;
  END LOOP;
  SELECT string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ',') INTO v_grant
    FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = to_regclass(k_tab) AND a.grantee <> c.relowner;
  IF v_grant IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: a ACL de pessoas_justificacoes_anexos tem concessoes para "%".', v_grant;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = to_regclass(k_tab) AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'Conferir: ha concessoes por coluna em pessoas_justificacoes_anexos.';
  END IF;

  -- O gatilho: ligado, BEFORE UPDATE, por linha (tgtype: 1 ROW, 2 BEFORE, 16 UPDATE).
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = to_regclass(k_tab)
                    AND t.tgname::text = 'trg_pessoas_justificacoes_anexos_guarda'
                    AND NOT t.tgisinternal AND t.tgenabled::text <> 'D'
                    AND t.tgfoid = to_regprocedure('public.hr_justificacao_anexo_guarda()')::oid
                    AND (t.tgtype::integer & 31) = 19) THEN
    RAISE EXCEPTION 'Conferir: trg_pessoas_justificacoes_anexos_guarda devia estar ligado, BEFORE UPDATE, por linha.';
  END IF;

  -- As funcoes: SECURITY DEFINER (ou nao), search_path vazio, EXECUTE exacto.
  FOR v_r IN
    SELECT * FROM (VALUES
      ('public.hr_justificacao_anexo_mae_pendente(uuid, uuid)', '', false),
      ('public.hr_justificacao_anexo_quem(uuid, uuid, uuid)', '', false),
      ('public.hr_justificacao_anexo_mae_bloquear(uuid, uuid)', '', false),
      ('public.hr_justificacao_anexo_guarda()', '', false),
      ('public.rpc_hr_justificacao_anexo_reservar(uuid, uuid, uuid, text, bigint, text)', 'service_role', true),
      ('public.rpc_hr_justificacao_anexo_contexto(uuid, uuid)', 'service_role', true),
      ('public.rpc_hr_justificacao_anexo_verificar(uuid, uuid, text, text, bigint, text)', 'service_role', true),
      ('public.rpc_hr_justificacao_anexo_descartar(uuid, uuid, text)', 'service_role', true),
      ('public.rpc_hr_justificacao_anexo_remover(uuid, uuid)', 'service_role', true),
      ('public.rpc_hr_justificacao_anexo_autorizar_abertura(uuid, uuid)', 'service_role', true),
      ('public.rpc_hr_justificacao_anexo_objecto_removido(uuid[])', 'service_role', true),
      ('public.hr_justificacao_anexos_limpar(integer)', 'service_role', true),
      ('public.rpc_hr_justificacao_anexos_listar(uuid, uuid)', 'authenticated', true)
    ) AS t(fn, quem, definer)
  LOOP
    IF to_regprocedure(v_r.fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao % nao existe.', v_r.fn;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_r.fn)::oid
                      AND p.prosecdef = v_r.definer
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % devia ter search_path vazio e SECURITY DEFINER = %.', v_r.fn, v_r.definer;
    END IF;
    SELECT coalesce(string_agg(g.quem, ',' ORDER BY g.quem), '') INTO v_grant
      FROM (SELECT DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS quem
              FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             WHERE p.oid = to_regprocedure(v_r.fn)::oid
               AND a.privilege_type::text = 'EXECUTE'
               AND a.grantee <> p.proowner) g;
    IF v_grant IS DISTINCT FROM v_r.quem THEN
      RAISE EXCEPTION 'Conferir: EXECUTE em % devia ser "%", e "%".', v_r.fn, v_r.quem, v_grant;
    END IF;
  END LOOP;

  -- A guarda de service_role em todas as RPCs da Edge que recebem p_auth_uid.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND (p.proname::text LIKE 'rpc\_hr\_justificacao\_anexo\_%' OR p.proname::text = 'hr_justificacao_anexos_limpar')
     AND (p.prosrc NOT LIKE '%request.jwt.claims%' OR p.prosrc NOT LIKE '%HR911%');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: sem a guarda de service_role (HR911): %.', v_lista;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure('public.rpc_hr_justificacao_anexo_autorizar_abertura(uuid, uuid)')::oid
                    AND p.prosrc LIKE '%hr_registar_acesso_sensivel(%''justificacao_anexo'', ''revelar'', p_auth_uid)%') THEN
    RAISE EXCEPTION 'Conferir: autorizar_abertura nao regista justificacao_anexo com p_auth_uid.';
  END IF;

  -- O CHECK de acessos: exactamente os de antes mais justificacao_anexo; e
  -- todos os literais passados a hr_registar_acesso_sensivel estao la.
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname::text = 'pessoas_acessos_sensiveis_campo_valido';
  WITH depois AS (SELECT m[1] AS v FROM regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''::text', 'g') AS m),
       esperado AS (SELECT t.valor AS v FROM tmp_hja2_campos_antes t UNION SELECT 'justificacao_anexo')
  SELECT (SELECT string_agg(e.v, ', ' ORDER BY e.v) FROM esperado e WHERE e.v NOT IN (SELECT d.v FROM depois d)),
         (SELECT string_agg(d.v, ', ' ORDER BY d.v) FROM depois d WHERE d.v NOT IN (SELECT e.v FROM esperado e))
    INTO v_falta, v_sobra;
  IF v_falta IS NOT NULL OR v_sobra IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: o CHECK de acessos devia ser o de antes mais justificacao_anexo; falta: %; sobra: %.',
      coalesce(v_falta, '-'), coalesce(v_sobra, '-');
  END IF;
  SELECT string_agg(DISTINCT p.proname::text || ' -> ' || m[1], '; ') INTO v_orfaos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL regexp_matches(p.prosrc,
      'hr_registar_acesso_sensivel\s*\([^;]*?''([a-z_]+)''\s*,\s*''(revelar|alterar)''', 'g') AS m
   WHERE n.nspname::text = 'public'
     AND m[1] NOT IN (SELECT d[1] FROM regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''::text', 'g') AS d);
  IF v_orfaos IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: ha funcoes que registam acessos com um campo que o CHECK recusa: %.', v_orfaos;
  END IF;

  -- A UNIQUE nova.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_faltas_justificacoes')
                    AND c.conname::text = 'pessoas_faltas_justificacoes_id_pessoa_org_key'
                    AND c.contype::text = 'u' AND cardinality(c.conkey) = 3) THEN
    RAISE EXCEPTION 'Conferir: a unique (id, pessoa_id, organization_id) de pessoas_faltas_justificacoes nao ficou criada.';
  END IF;

  -- Storage: as 4 politicas de hr-justificacoes, todas RESTRICTIVE (a de
  -- SELECT nova); bucket privado so com pdf/jpeg/png.
  SELECT string_agg(pp.policyname::text || ':' || pp.permissive::text || ':' || pp.cmd::text, ', '
                    ORDER BY pp.policyname::text COLLATE "C")
    INTO v_lista
    FROM pg_policies pp
   WHERE pp.schemaname::text = 'storage' AND pp.tablename::text = 'objects'
     AND pp.policyname::text ILIKE '%justificac%';
  IF v_lista IS DISTINCT FROM
     'hr_justificacoes_block_delete:RESTRICTIVE:DELETE, hr_justificacoes_block_insert:RESTRICTIVE:INSERT, hr_justificacoes_block_select:RESTRICTIVE:SELECT, hr_justificacoes_block_update:RESTRICTIVE:UPDATE' THEN
    RAISE EXCEPTION 'Conferir: as politicas de hr-justificacoes deviam ser as 4 RESTRICTIVE; sao: %.', coalesce(v_lista, 'nenhuma');
  END IF;
  SELECT array_agg(x.m ORDER BY x.m COLLATE "C") INTO v_mimes
    FROM storage.buckets b, LATERAL unnest(b.allowed_mime_types) AS x(m)
   WHERE b.id = 'hr-justificacoes' AND b.public = false;
  IF v_mimes IS DISTINCT FROM ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[] THEN
    RAISE EXCEPTION 'Conferir: hr-justificacoes devia ser privado e aceitar so pdf, jpeg e png; aceita %.', coalesce(v_mimes::text, 'NULL');
  END IF;

  RAISE NOTICE 'Conferido (estrutura): tabela fechada a anon/authenticated/service_role, gatilho, 13 funcoes com EXECUTE exacto e search_path vazio, CHECK de acessos = antes + justificacao_anexo, UNIQUE nova, hr-justificacoes so com politicas RESTRICTIVE e sem HEIC.';
END;
$conferir_estrutura$;

-- ---- 8.2 Comportamento na nike, DESFEITO no fim (sentinela HJA00) -------------
DO $conferir$
DECLARE
  k_nike   constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_motivo constant text := 'prova da migracao 20270111610000';
  k_hash   constant text := encode(sha256(convert_to('prova 20270111610000', 'UTF8')), 'hex');
  v_p      uuid;
  v_uid_p  uuid;  v_anew_p uuid;
  v_uid_v  uuid;  v_anew_v uuid;
  v_uid_e  uuid;  v_anew_e uuid;
  v_uid_c  uuid;  v_anew_c uuid;
  v_uid_x  uuid;
  v_d      date;
  v_i      integer;
  v_j      uuid;
  v_a1     uuid;
  v_a2     uuid;
  v_a3     uuid;
  v_a4     uuid;
  v_a5     uuid;
  v_ax     uuid;
  v_r      jsonb;
  v_e      text;
  v_st     text;
  v_n      integer;
  v_n0     integer;
  v_ver    record;
  v_row    record;
  v_fj     record;
  v_prova_x     text := 'provado';
  v_prova_falta text := 'provado';
  v_prova_sr    text := 'provado';
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- ---- Os perfis (toda a consulta leva a organizacao da nike) --------------
    -- A propria pessoa: uma conta ligada a uma pessoa da nike, activa, com uma
    -- so associacao na nike.
    SELECT pc.pessoa_id, au.auth_user_id, au.id INTO v_p, v_uid_p, v_anew_p
      FROM public.pessoas_contas pc
      JOIN public.anew_users au ON au.id = pc.anew_user_id
      JOIN public.pessoas p ON p.id = pc.pessoa_id AND p.organization_id = k_nike AND p.deleted_at IS NULL
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.organization_id = k_nike AND am.status = 'active'
     WHERE pc.organization_id = k_nike AND pc.estado = 'activa' AND pc.revogada_em IS NULL
       AND au.auth_user_id IS NOT NULL
       AND (SELECT count(*) FROM public.anew_memberships m2 WHERE m2.user_id = au.id AND m2.organization_id = k_nike) = 1
       AND public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) = pc.pessoa_id
     ORDER BY au.id
     LIMIT 1;
    IF v_p IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta uma conta activa ligada a uma pessoa, com uma so associacao (a propria pessoa da matriz).';
    END IF;

    -- Tres outros utilizadores activos da nike, com uma so associacao e sem
    -- ligacao a pessoa de teste: RH .view, RH so .edit e chefia (faltas.view).
    SELECT au.auth_user_id, au.id INTO v_uid_v, v_anew_v
      FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.organization_id = k_nike AND am.status = 'active'
     WHERE au.auth_user_id IS NOT NULL AND au.id <> v_anew_p
       AND (SELECT count(*) FROM public.anew_memberships m2 WHERE m2.user_id = au.id AND m2.organization_id = k_nike) = 1
       AND public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) IS DISTINCT FROM v_p
     ORDER BY au.id
     LIMIT 1;
    SELECT au.auth_user_id, au.id INTO v_uid_e, v_anew_e
      FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.organization_id = k_nike AND am.status = 'active'
     WHERE au.auth_user_id IS NOT NULL AND au.id NOT IN (v_anew_p, coalesce(v_anew_v, v_anew_p))
       AND (SELECT count(*) FROM public.anew_memberships m2 WHERE m2.user_id = au.id AND m2.organization_id = k_nike) = 1
       AND public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) IS DISTINCT FROM v_p
     ORDER BY au.id
     LIMIT 1;
    SELECT au.auth_user_id, au.id INTO v_uid_c, v_anew_c
      FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.organization_id = k_nike AND am.status = 'active'
     WHERE au.auth_user_id IS NOT NULL
       AND au.id NOT IN (v_anew_p, coalesce(v_anew_v, v_anew_p), coalesce(v_anew_e, v_anew_p))
       AND (SELECT count(*) FROM public.anew_memberships m2 WHERE m2.user_id = au.id AND m2.organization_id = k_nike) = 1
       AND public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) IS DISTINCT FROM v_p
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_v IS NULL OR v_uid_e IS NULL OR v_uid_c IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike faltam tres utilizadores activos, com uma so associacao e sem ligacao a pessoa de teste (RH view, RH edit, chefia).';
    END IF;

    PERFORM pg_temp.hja2_perfil(k_nike, v_anew_p, ARRAY['hr.assiduidade.view.own'], 'propria');
    PERFORM pg_temp.hja2_perfil(k_nike, v_anew_v, ARRAY['hr.assiduidade.justificacao.view'], 'view');
    PERFORM pg_temp.hja2_perfil(k_nike, v_anew_e, ARRAY['hr.assiduidade.justificacao.edit'], 'edit');
    PERFORM pg_temp.hja2_perfil(k_nike, v_anew_c, ARRAY['hr.assiduidade.faltas.view'], 'chefia');
    IF NOT public.has_anew_permission_in_org(v_uid_p, 'hr.assiduidade.view.own', k_nike)
       OR public.has_anew_permission_in_org(v_uid_p, 'hr.assiduidade.justificacao.view', k_nike)
       OR NOT public.has_anew_permission_in_org(v_uid_v, 'hr.assiduidade.justificacao.view', k_nike)
       OR public.has_anew_permission_in_org(v_uid_v, 'hr.assiduidade.justificacao.edit', k_nike)
       OR NOT public.has_anew_permission_in_org(v_uid_e, 'hr.assiduidade.justificacao.edit', k_nike)
       OR public.has_anew_permission_in_org(v_uid_e, 'hr.assiduidade.justificacao.view', k_nike)
       OR NOT public.has_anew_permission_in_org(v_uid_c, 'hr.assiduidade.faltas.view', k_nike)
       OR public.has_anew_permission_in_org(v_uid_c, 'hr.assiduidade.justificacao.edit', k_nike)
       OR public.has_anew_permission_in_org(v_uid_c, 'hr.assiduidade.justificacao.view', k_nike) THEN
      RAISE EXCEPTION 'Conferir: os perfis de prova nao ficaram com as permissoes pedidas.';
    END IF;

    -- Um utilizador de OUTRA organizacao (sem associacao na nike). So se le o id.
    SELECT au.auth_user_id INTO v_uid_x
      FROM public.anew_users au
     WHERE au.auth_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.anew_memberships m WHERE m.user_id = au.id AND m.organization_id = k_nike)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_x IS NULL THEN
      v_prova_x := 'nao provado: nao ha utilizador sem associacao na nike';
    END IF;

    -- ---- A justificacao do dia, pendente, da pessoa de teste ------------------
    v_d := NULL;
    FOR v_i IN 2..60 LOOP
      IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                      WHERE j.pessoa_id = v_p AND j.organization_id = k_nike AND j.data = current_date - v_i) THEN
        v_d := current_date - v_i;
        EXIT;
      END IF;
    END LOOP;
    IF v_d IS NULL THEN
      RAISE EXCEPTION 'Conferir: a pessoa de teste tem justificacoes do dia em todos os ultimos 60 dias.';
    END IF;
    INSERT INTO public.pessoas_justificacoes_dia
      (organization_id, pessoa_id, data, tipo, de_atraso, periodo_inicio, periodo_fim, motivo)
    VALUES (k_nike, v_p, v_d, 'consulta_medica', false, TIME '05:00', TIME '05:15', k_motivo)
    RETURNING id INTO v_j;

    -- ---- a) Fora de service_role: HR911 ---------------------------------------
    PERFORM pg_temp.hja2_como(v_uid_e);
    v_st := NULL;
    BEGIN
      PERFORM public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'a.pdf', 1000, 'application/pdf');
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM 'HR911' THEN
      RAISE EXCEPTION 'Conferir: reservar fora de service_role devia dar HR911; deu %.', coalesce(v_st, 'aceite');
    END IF;
    PERFORM pg_temp.hja2_servico();

    -- ---- b) Quem nao pode anexar ----------------------------------------------
    v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_c, v_j, NULL, 'a.pdf', 1000, 'application/pdf');
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'justificacao_nao_encontrada' THEN
      RAISE EXCEPTION 'Conferir: a chefia a reservar devia dar justificacao_nao_encontrada; deu %.', v_r::text;
    END IF;
    IF v_uid_x IS NOT NULL THEN
      v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_x, v_j, NULL, 'a.pdf', 1000, 'application/pdf');
      v_e := v_r ->> 'erro';
      IF v_e IS DISTINCT FROM 'justificacao_nao_encontrada' THEN
        RAISE EXCEPTION 'Conferir: outra organizacao a reservar devia dar justificacao_nao_encontrada; deu %.', v_r::text;
      END IF;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_v, v_j, NULL, 'a.pdf', 1000, 'application/pdf');
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'sem_permissao' THEN
      RAISE EXCEPTION 'Conferir: o RH so com .view a reservar devia dar sem_permissao; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'a.gif', 1000, 'image/gif');
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_formato_invalido' THEN
      RAISE EXCEPTION 'Conferir: reservar um gif devia dar anexo_formato_invalido; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'a.pdf', 10485761, 'application/pdf');
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_demasiado_grande' THEN
      RAISE EXCEPTION 'Conferir: reservar mais de 10 MB devia dar anexo_demasiado_grande; deu %.', v_r::text;
    END IF;

    -- ---- c) A propria pessoa e o RH .edit reservam ----------------------------
    v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_p, v_j, NULL, E'atestado\nprova.pdf', 1000, 'application/pdf');
    v_a1 := (v_r ->> 'anexo_id')::uuid;
    IF v_a1 IS NULL OR (v_r ->> 'caminho') IS DISTINCT FROM 'justificacoes/' || v_a1::text || '.pdf' THEN
      RAISE EXCEPTION 'Conferir: a propria pessoa devia reservar (justificacoes/<id>.pdf); deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'digitalizacao.png', 2000, 'IMAGE/PNG');
    v_a2 := (v_r ->> 'anexo_id')::uuid;
    IF v_a2 IS NULL THEN
      RAISE EXCEPTION 'Conferir: o RH so com .edit devia reservar; deu %.', v_r::text;
    END IF;
    SELECT a.carregado_como, a.carregado_por, a.nome_original, a.reter_ate INTO v_row
      FROM public.pessoas_justificacoes_anexos a WHERE a.id = v_a1;
    IF v_row.carregado_como IS DISTINCT FROM 'propria' OR v_row.carregado_por IS DISTINCT FROM v_uid_p
       OR v_row.nome_original IS DISTINCT FROM 'atestadoprova.pdf'
       OR v_row.reter_ate IS DISTINCT FROM make_date(extract(year FROM v_d)::integer + 5, 12, 31) THEN
      RAISE EXCEPTION 'Conferir: a reserva da pessoa devia ficar propria, com o autor, o nome limpo e reter_ate 31/12+5; ficou %.', row_to_json(v_row)::text;
    END IF;
    IF (SELECT a.carregado_como FROM public.pessoas_justificacoes_anexos a WHERE a.id = v_a2) IS DISTINCT FROM 'rh' THEN
      RAISE EXCEPTION 'Conferir: a reserva do RH devia ficar carregado_como rh.';
    END IF;

    -- ---- d) Contexto: so quem reservou ---------------------------------------
    v_r := public.rpc_hr_justificacao_anexo_contexto(v_uid_e, v_a1);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'Conferir: o contexto do anexo de outro autor devia dar anexo_nao_encontrado; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_contexto(v_uid_p, v_a1);
    IF (v_r ->> 'organization_id')::uuid IS DISTINCT FROM k_nike OR (v_r ->> 'pessoa_id')::uuid IS DISTINCT FROM v_p
       OR (v_r ->> 'justificacao_id')::uuid IS DISTINCT FROM v_j THEN
      RAISE EXCEPTION 'Conferir: o contexto devia trazer a nike, a pessoa e a justificacao; deu %.', v_r::text;
    END IF;

    -- ---- e) Verificar --------------------------------------------------------
    v_r := public.rpc_hr_justificacao_anexo_verificar(v_uid_p, v_a1, k_nike::text || '/outro/' || v_a1::text || '.pdf',
                                                     'application/pdf', 1000, k_hash);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_falha_envio' THEN
      RAISE EXCEPTION 'Conferir: verificar com um caminho final errado devia dar anexo_falha_envio; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_verificar(v_uid_p, v_a1,
             k_nike::text || '/' || v_p::text || '/' || v_j::text || '/' || v_a1::text || '.pdf', 'application/pdf', 1000, k_hash);
    IF (v_r ->> 'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Conferir: verificar o anexo da pessoa devia passar; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_verificar(v_uid_e, v_a2,
             k_nike::text || '/' || v_p::text || '/' || v_j::text || '/' || v_a2::text || '.png', 'image/png', 2000, k_hash);
    IF (v_r ->> 'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Conferir: verificar o anexo do RH devia passar; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_verificar(v_uid_e, v_a2,
             k_nike::text || '/' || v_p::text || '/' || v_j::text || '/' || v_a2::text || '.png', 'image/png', 2000, k_hash);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_estado_invalido' THEN
      RAISE EXCEPTION 'Conferir: verificar outra vez devia dar anexo_estado_invalido; deu %.', v_r::text;
    END IF;

    -- ---- f) A listagem, perfil a perfil --------------------------------------
    SELECT * INTO v_ver FROM pg_temp.hja2_ver(v_uid_p, v_j, NULL);
    IF v_ver.o_erro IS NOT NULL OR v_ver.o_linhas <> 2 OR v_ver.o_com_nome <> 2 OR v_ver.o_abre <> 2 OR v_ver.o_remove <> 1 THEN
      RAISE EXCEPTION 'Conferir: a propria pessoa devia ver 2 anexos, 2 nomes, abrir 2 e remover 1 (o seu); viu %.', row_to_json(v_ver)::text;
    END IF;
    SELECT * INTO v_ver FROM pg_temp.hja2_ver(v_uid_v, v_j, NULL);
    IF v_ver.o_erro IS NOT NULL OR v_ver.o_linhas <> 2 OR v_ver.o_com_nome <> 0 OR v_ver.o_abre <> 2 OR v_ver.o_remove <> 0 THEN
      RAISE EXCEPTION 'Conferir: o RH .view numa consulta medica devia ver 2 anexos, 0 nomes (dado de saude), abrir 2 e remover 0; viu %.', row_to_json(v_ver)::text;
    END IF;
    SELECT * INTO v_ver FROM pg_temp.hja2_ver(v_uid_e, v_j, NULL);
    IF v_ver.o_erro IS NOT NULL OR v_ver.o_linhas <> 2 OR v_ver.o_com_nome <> 0 OR v_ver.o_abre <> 0 OR v_ver.o_remove <> 1 THEN
      RAISE EXCEPTION 'Conferir: o RH so .edit devia ver 2 anexos, 0 nomes, abrir 0 e remover 1 (so o que ele carregou); viu %.', row_to_json(v_ver)::text;
    END IF;
    SELECT * INTO v_ver FROM pg_temp.hja2_ver(v_uid_c, v_j, NULL);
    IF coalesce(v_ver.o_erro, '') <> 'P0002 justificacao_anexos_nao_encontrada' THEN
      RAISE EXCEPTION 'Conferir: a chefia devia receber justificacao_anexos_nao_encontrada (P0002); recebeu %.', row_to_json(v_ver)::text;
    END IF;
    IF v_uid_x IS NOT NULL THEN
      SELECT * INTO v_ver FROM pg_temp.hja2_ver(v_uid_x, v_j, NULL);
      IF coalesce(v_ver.o_erro, '') <> 'P0002 justificacao_anexos_nao_encontrada' THEN
        RAISE EXCEPTION 'Conferir: outra organizacao devia receber justificacao_anexos_nao_encontrada (P0002); recebeu %.', row_to_json(v_ver)::text;
      END IF;
    END IF;

    -- ---- g) Abrir ------------------------------------------------------------
    v_r := public.rpc_hr_justificacao_anexo_autorizar_abertura(v_uid_e, v_a1);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'sem_permissao' THEN
      RAISE EXCEPTION 'Conferir: abrir com .edit sem .view devia dar sem_permissao; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_autorizar_abertura(v_uid_c, v_a1);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'Conferir: a chefia a abrir devia dar anexo_nao_encontrado; deu %.', v_r::text;
    END IF;
    SELECT count(*) INTO v_n0 FROM public.pessoas_acessos_sensiveis s
     WHERE s.pessoa_id = v_p AND s.organization_id = k_nike AND s.campo = 'justificacao_anexo';
    v_r := public.rpc_hr_justificacao_anexo_autorizar_abertura(v_uid_v, v_a1);
    IF (v_r ->> 'registado') IS DISTINCT FROM 'true' OR (v_r ->> 'bucket') IS DISTINCT FROM 'hr-justificacoes' THEN
      RAISE EXCEPTION 'Conferir: o RH .view devia abrir com registo; deu %.', v_r::text;
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_acessos_sensiveis s
     WHERE s.pessoa_id = v_p AND s.organization_id = k_nike AND s.campo = 'justificacao_anexo'
       AND s.accao = 'revelar' AND s.auth_user_id = v_uid_v;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: abrir como RH .view devia deixar 1 registo de acesso com o utilizador; ha %.', v_n;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_autorizar_abertura(v_uid_p, v_a1);
    IF (v_r ->> 'registado') IS DISTINCT FROM 'false' OR (v_r ->> 'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Conferir: a propria pessoa devia abrir sem registo; deu %.', v_r::text;
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_acessos_sensiveis s
     WHERE s.pessoa_id = v_p AND s.organization_id = k_nike AND s.campo = 'justificacao_anexo';
    IF v_n <> v_n0 + 1 THEN
      RAISE EXCEPTION 'Conferir: a propria pessoa a abrir nao devia registar acesso (registos: % antes, % depois).', v_n0, v_n;
    END IF;

    -- ---- h) Os limites: 4 activos e 12 reservas ------------------------------
    v_a3 := (public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'c.pdf', 10, 'application/pdf') ->> 'anexo_id')::uuid;
    v_a4 := (public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'd.pdf', 10, 'application/pdf') ->> 'anexo_id')::uuid;
    IF v_a3 IS NULL OR v_a4 IS NULL THEN
      RAISE EXCEPTION 'Conferir: a 3.a e a 4.a reservas deviam passar.';
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'e.pdf', 10, 'application/pdf');
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_maximo_ficheiros' THEN
      RAISE EXCEPTION 'Conferir: com 4 activos a reserva devia dar anexo_maximo_ficheiros; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_descartar(v_uid_p, v_a3, 'upload_abandonado');
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'Conferir: descartar a reserva de outro devia dar anexo_nao_encontrado; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_descartar(v_uid_e, v_a1, 'upload_abandonado');
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'Conferir: descartar o anexo verificado de outro autor devia dar anexo_nao_encontrado; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_descartar(v_uid_e, v_a3, 'upload_abandonado');
    IF (v_r ->> 'ok') IS DISTINCT FROM 'true' OR (v_r ->> 'bucket') IS DISTINCT FROM 'hr-documentos-quarantine' THEN
      RAISE EXCEPTION 'Conferir: descartar a 3.a devia passar; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_descartar(v_uid_e, v_a3, 'formato_invalido');
    IF (v_r ->> 'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Conferir: descartar outra vez devia ser idempotente; deu %.', v_r::text;
    END IF;
    PERFORM public.rpc_hr_justificacao_anexo_descartar(v_uid_e, v_a4, 'conteudo_recusado');
    -- Reservas 5 a 11 (reserva e descarta); a 12.a fica em quarentena; a 13.a recusa.
    FOR v_i IN 1..7 LOOP
      v_ax := (public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'ciclo.pdf', 10, 'application/pdf') ->> 'anexo_id')::uuid;
      IF v_ax IS NULL THEN
        RAISE EXCEPTION 'Conferir: a reserva % do ciclo devia passar.', v_i + 4;
      END IF;
      PERFORM public.rpc_hr_justificacao_anexo_descartar(v_uid_e, v_ax, 'upload_abandonado');
    END LOOP;
    v_a5 := (public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'f.pdf', 10, 'application/pdf') ->> 'anexo_id')::uuid;
    IF v_a5 IS NULL THEN
      RAISE EXCEPTION 'Conferir: a 12.a reserva devia passar.';
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_e, v_j, NULL, 'g.pdf', 10, 'application/pdf');
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_limite_reservas' THEN
      RAISE EXCEPTION 'Conferir: a 13.a reserva devia dar anexo_limite_reservas; deu %.', v_r::text;
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_justificacoes_anexos a WHERE a.justificacao_dia_id = v_j;
    IF v_n <> 12 THEN
      RAISE EXCEPTION 'Conferir: deviam existir 12 reservas na justificacao de teste; ha %.', v_n;
    END IF;

    -- ---- i) Remover ----------------------------------------------------------
    v_r := public.rpc_hr_justificacao_anexo_remover(v_uid_v, v_a1);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'sem_permissao' THEN
      RAISE EXCEPTION 'Conferir: o RH .view a remover devia dar sem_permissao; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_remover(v_uid_e, v_a1);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'sem_permissao' THEN
      RAISE EXCEPTION 'Conferir: o RH so .edit a remover o anexo da pessoa devia dar sem_permissao; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_remover(v_uid_p, v_a2);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'sem_permissao' THEN
      RAISE EXCEPTION 'Conferir: a pessoa a remover o anexo do RH devia dar sem_permissao; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_remover(v_uid_c, v_a1);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'Conferir: a chefia a remover devia dar anexo_nao_encontrado; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_remover(v_uid_p, v_a1);
    IF (v_r ->> 'ok') IS DISTINCT FROM 'true' OR (v_r ->> 'bucket') IS DISTINCT FROM 'hr-justificacoes'
       OR (v_r ->> 'caminho_quarentena') IS DISTINCT FROM 'justificacoes/' || v_a1::text || '.pdf' THEN
      RAISE EXCEPTION 'Conferir: a pessoa devia remover o seu anexo (e receber o final e a copia da quarentena); deu %.', v_r::text;
    END IF;
    SELECT a.estado, a.motivo_fim, a.removido_por, a.nome_original, a.hash_sha256 INTO v_row
      FROM public.pessoas_justificacoes_anexos a WHERE a.id = v_a1;
    IF v_row.estado IS DISTINCT FROM 'removido' OR v_row.motivo_fim IS DISTINCT FROM 'removido_pela_pessoa'
       OR v_row.removido_por IS DISTINCT FROM v_uid_p OR v_row.nome_original IS DISTINCT FROM 'removido'
       OR v_row.hash_sha256 IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: o anexo removido pela pessoa ficou %.', row_to_json(v_row)::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_autorizar_abertura(v_uid_v, v_a1);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'Conferir: abrir um anexo removido devia dar anexo_nao_encontrado; deu %.', v_r::text;
    END IF;

    -- ---- j) Decidida a justificacao, nada mexe (so a limpeza) ----------------
    UPDATE public.pessoas_justificacoes_dia j
       SET estado = 'recusada', decidida_por = v_anew_v, decidida_em = now(), motivo_recusa = k_motivo
     WHERE j.id = v_j;

    v_r := public.rpc_hr_justificacao_anexo_remover(v_uid_e, v_a2);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'justificacao_decidida' THEN
      RAISE EXCEPTION 'Conferir: remover depois da decisao devia dar justificacao_decidida; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_p, v_j, NULL, 'h.pdf', 10, 'application/pdf');
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'justificacao_decidida' THEN
      RAISE EXCEPTION 'Conferir: reservar depois da decisao devia dar justificacao_decidida; deu %.', v_r::text;
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_contexto(v_uid_e, v_a5);
    v_e := v_r ->> 'erro';
    IF v_e IS DISTINCT FROM 'justificacao_decidida' THEN
      RAISE EXCEPTION 'Conferir: o contexto depois da decisao devia dar justificacao_decidida; deu %.', v_r::text;
    END IF;
    v_st := NULL;
    BEGIN
      UPDATE public.pessoas_justificacoes_anexos a SET nome_original = 'outro.pdf' WHERE a.id = v_a2;
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM 'HJA10' THEN
      RAISE EXCEPTION 'Conferir: mudar o nome depois da decisao devia dar HJA10; deu %.', coalesce(v_st, 'aceite');
    END IF;
    v_st := NULL;
    BEGIN
      UPDATE public.pessoas_justificacoes_anexos a
         SET estado = 'removido', motivo_fim = 'removido_pelo_rh', removido_em = now(), removido_por = v_uid_e
       WHERE a.id = v_a2;
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM 'HJA10' THEN
      RAISE EXCEPTION 'Conferir: remover pela tabela depois da decisao devia dar HJA10; deu %.', coalesce(v_st, 'aceite');
    END IF;
    v_st := NULL;
    BEGIN
      UPDATE public.pessoas_justificacoes_anexos a SET carregado_por = v_uid_v WHERE a.id = v_a2;
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM 'HJA11' THEN
      RAISE EXCEPTION 'Conferir: mudar o autor devia dar HJA11; deu %.', coalesce(v_st, 'aceite');
    END IF;
    UPDATE public.pessoas_justificacoes_anexos a SET limpeza_tentativas = a.limpeza_tentativas + 1 WHERE a.id = v_a2;
    IF (SELECT a.limpeza_tentativas FROM public.pessoas_justificacoes_anexos a WHERE a.id = v_a2) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'Conferir: a limpeza devia poder mexer em limpeza_tentativas depois da decisao.';
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_descartar(v_uid_e, v_a5, 'upload_abandonado');
    IF (v_r ->> 'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Conferir: descartar uma quarentena depois da decisao devia passar (limpeza); deu %.', v_r::text;
    END IF;
    IF (SELECT a.estado FROM public.pessoas_justificacoes_anexos a WHERE a.id = v_a5) IS DISTINCT FROM 'recusado' THEN
      RAISE EXCEPTION 'Conferir: a quarentena descartada depois da decisao devia ficar recusada.';
    END IF;
    v_r := public.rpc_hr_justificacao_anexo_autorizar_abertura(v_uid_v, v_a2);
    IF (v_r ->> 'ok') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Conferir: abrir depois da decisao devia continuar a passar; deu %.', v_r::text;
    END IF;
    SELECT * INTO v_ver FROM pg_temp.hja2_ver(v_uid_e, v_j, NULL);
    IF v_ver.o_erro IS NOT NULL OR v_ver.o_linhas <> 1 OR v_ver.o_remove <> 0 THEN
      RAISE EXCEPTION 'Conferir: depois da decisao o RH .edit devia ver 1 anexo e remover 0; viu %.', row_to_json(v_ver)::text;
    END IF;

    -- ---- k) Nenhum privilegio pela tabela (authenticated e service_role) -----
    --      Cada bloco acaba numa excepcao, que desfaz o SET LOCAL ROLE. O
    --      controlo prova que o SET ROLE funcionou (senao o 42501 seria dele).
    v_st := NULL;
    BEGIN
      SET LOCAL ROLE authenticated;
      IF current_user::text IS DISTINCT FROM 'authenticated' THEN
        RAISE EXCEPTION 'controlo_sem_role' USING ERRCODE = 'HJA07';
      END IF;
      SELECT count(*) INTO v_n FROM (SELECT j.id FROM public.pessoas_justificacoes_dia j LIMIT 1) x;
      RAISE EXCEPTION 'controlo_ok' USING ERRCODE = 'HJA08';
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM 'HJA08' THEN
      RAISE EXCEPTION 'Conferir: o controlo (SET ROLE authenticated e ler pessoas_justificacoes_dia.id) devia passar; deu %.', coalesce(v_st, '?');
    END IF;
    v_st := NULL;
    BEGIN
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO v_n FROM (SELECT a.id FROM public.pessoas_justificacoes_anexos a LIMIT 1) x;
      RAISE EXCEPTION 'leu' USING ERRCODE = 'HJA09';
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: ler pessoas_justificacoes_anexos como authenticated devia dar 42501; deu %.', coalesce(v_st, '?');
    END IF;
    v_st := NULL;
    BEGIN
      SET LOCAL ROLE service_role;
      IF current_user::text IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'controlo_sem_role' USING ERRCODE = 'HJA07';
      END IF;
      RAISE EXCEPTION 'controlo_ok' USING ERRCODE = 'HJA08';
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM 'HJA08' THEN
      v_prova_sr := 'nao provado pela tabela (SET ROLE service_role deu ' || coalesce(v_st, '?') || '); provado so por has_table_privilege';
    ELSE
      v_st := NULL;
      BEGIN
        SET LOCAL ROLE service_role;
        SELECT count(*) INTO v_n FROM (SELECT a.id FROM public.pessoas_justificacoes_anexos a LIMIT 1) x;
        RAISE EXCEPTION 'leu' USING ERRCODE = 'HJA09';
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'Conferir: ler pessoas_justificacoes_anexos como service_role devia dar 42501; deu %.', coalesce(v_st, '?');
      END IF;
    END IF;
    IF current_user::text IN ('authenticated', 'service_role') THEN
      RAISE EXCEPTION 'Conferir: o SET ROLE da prova nao foi desfeito.';
    END IF;

    -- ---- l) O papel de uma falta (se a nike tiver um pendente) ---------------
    SELECT fj.id, fj.falta_id, fj.pessoa_id INTO v_fj
      FROM public.pessoas_faltas_justificacoes fj
      JOIN public.pessoas_faltas f ON f.id = fj.falta_id AND f.organization_id = fj.organization_id
     WHERE fj.organization_id = k_nike
       AND fj.anulado_em IS NULL
       AND f.estado = 'activa'
       AND f.justificacao_estado NOT IN ('justificada', 'recusada')
       AND public.hr_pessoa_do_utilizador(v_uid_e, k_nike) IS DISTINCT FROM fj.pessoa_id
     ORDER BY fj.id
     LIMIT 1;
    IF v_fj.id IS NULL THEN
      v_prova_falta := 'nao provado: a nike nao tem papel de falta pendente';
    ELSE
      v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_e, NULL, v_fj.id, 'papel.pdf', 10, 'application/pdf');
      v_ax := (v_r ->> 'anexo_id')::uuid;
      IF v_ax IS NULL THEN
        RAISE EXCEPTION 'Conferir: o RH .edit devia reservar no papel de uma falta pendente; deu %.', v_r::text;
      END IF;
      v_r := public.rpc_hr_justificacao_anexo_verificar(v_uid_e, v_ax,
               k_nike::text || '/' || v_fj.pessoa_id::text || '/' || v_fj.id::text || '/' || v_ax::text || '.pdf',
               'application/pdf', 10, k_hash);
      IF (v_r ->> 'ok') IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Conferir: verificar no papel da falta devia passar; deu %.', v_r::text;
      END IF;
      v_r := public.rpc_hr_justificacao_anexo_reservar(v_uid_p, NULL, v_fj.id, 'papel.pdf', 10, 'application/pdf');
      v_e := v_r ->> 'erro';
      IF v_e IS DISTINCT FROM 'justificacao_nao_encontrada' THEN
        RAISE EXCEPTION 'Conferir: a pessoa (so view.own) a reservar no papel de uma falta devia dar justificacao_nao_encontrada; deu %.', v_r::text;
      END IF;
      SELECT * INTO v_ver FROM pg_temp.hja2_ver(v_uid_e, NULL, v_fj.falta_id);
      IF v_ver.o_erro IS NOT NULL OR v_ver.o_linhas < 1 OR v_ver.o_com_nome <> 0 THEN
        RAISE EXCEPTION 'Conferir: o RH .edit devia ver os anexos da falta sem nome; viu %.', row_to_json(v_ver)::text;
      END IF;
      SELECT * INTO v_ver FROM pg_temp.hja2_ver(v_uid_c, NULL, v_fj.falta_id);
      IF coalesce(v_ver.o_erro, '') <> 'P0002 justificacao_anexos_nao_encontrada' THEN
        RAISE EXCEPTION 'Conferir: a chefia a listar a falta devia receber justificacao_anexos_nao_encontrada; recebeu %.', row_to_json(v_ver)::text;
      END IF;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE NOTICE 'Conferir E2: prova na nike no dia % (pessoa %): HR911; chefia "nao encontrado"; outra organizacao: %; .view nao anexa nem remove; pessoa e .edit reservam e verificam; listagem por perfil (pessoa 2/2/2/1, .view 2/0/2/0 numa consulta medica, .edit 2/0/0/1); abrir: .edit recusa, .view regista, pessoa sem registo; 4 activos e 12 reservas; remover pela pessoa; depois da decisao HJA10, HJA11, limpeza aceite; authenticated sem leitura pela tabela; service_role pela tabela: %; papel de falta: %.',
      v_d, v_p, v_prova_x, v_prova_sr, v_prova_falta;
    RAISE EXCEPTION 'teste_anexos_justificacoes_ok' USING ERRCODE = 'HJA00';
  EXCEPTION
    WHEN SQLSTATE 'HJA00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.pessoas_justificacoes_anexos)
     OR EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j WHERE j.motivo = k_motivo)
     OR EXISTS (SELECT 1 FROM public.pessoas_acessos_sensiveis s WHERE s.campo = 'justificacao_anexo')
     OR EXISTS (SELECT 1 FROM public.anew_roles r WHERE (to_jsonb(r) ->> 'code') LIKE 'prova\_hja2\_%') THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;
END;
$conferir$;

DROP FUNCTION pg_temp.hja2_ver(uuid, uuid, uuid);
DROP FUNCTION pg_temp.hja2_como(uuid);
DROP FUNCTION pg_temp.hja2_servico();
DROP FUNCTION pg_temp.hja2_perfil(uuid, uuid, text[], text);

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): pendentes so
--    20270111600000 e este, acima de 20270111500000.
-- 2. Prova na nike ANTES do push: correr os dois ficheiros numa transaccao
--    terminada por um RAISE EXCEPTION (desfaz tudo). O NOTICE diz o que
--    ficou por provar (outra organizacao, service_role pela tabela, papel de
--    falta).
-- 3. Nada a publicar no cliente para isto nao partir; para USAR: E3 (Edge),
--    E4 (cron da limpeza, ANTES de abrir o envio) e E5 (ecra).
-- ==============================================================================
