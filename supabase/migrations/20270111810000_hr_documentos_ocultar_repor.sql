-- ==============================================================================
-- 20270111810000_hr_documentos_ocultar_repor
--
-- Documentos de RH (ENTREGA E3 do plano "anular, ocultar e repor documentos de
-- RH"): ocultar e repor com motivo, lista dos ocultados e historico; nenhum
-- documento se apaga fisicamente; anulado e oculto desaparecem do portal.
-- Base RH (uetjghdkwbywbftedtth). NUNCA a principal, NUNCA a Mudelar.
--
-- PROVISORIO. DEPENDE DE 20270111800000 (aplicada antes, no mesmo push). NAO
-- FAZER db push sem: (1) listar o remoto imediatamente antes, a partir do
-- worktree rh-pessoas (supabase/.temp/project-ref = uetjgh...): pendentes so
-- 20270111800000 e este; (2) correr a prova na nike em transaccao desfeita
-- ANTES do push (os dois ficheiros, por ordem); (3) revisao
-- ecc:database-reviewer e ecc:security-reviewer.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. Catalogo: hr.pessoas.documentos.ocultar e hr.pessoas.documentos.repor
--    (perigosas, categoria hr, pai hr.pessoas.documentos.edit, organizacao).
--    Atribuidas SO aos papeis super_admin (todos os que tem esse code, como em
--    20261207010200). Escrita em papeis de sistema com a claim service_role
--    LOCAL a transaccao (padrao de 20270105600000), e NAO desligando
--    trg_protect_system_role_perms como em 20261207010200: o ALTER TABLE ...
--    DISABLE TRIGGER trancava anew_role_permissions (que
--    has_anew_permission_in_org le em TODAS as chamadas, de todas as
--    organizacoes) ate ao fim da transaccao, prova incluida.
--
-- 2. CHECK pessoas_documentos_so_final_oculto (deleted_at IS NULL OR estado
--    IN assinado, entregue, anulado), validado (lido a 9/11: nenhum oculto).
--
-- 3. Gatilhos trg_pessoas_documentos_sem_apagar (BEFORE DELETE, por linha) e
--    trg_pessoas_documentos_sem_truncate (BEFORE TRUNCATE): nenhum documento
--    se apaga fisicamente (D5), nem pela cascata da pessoa
--    (pessoas_documentos_pessoa_fkey e ON DELETE CASCADE: apagar fisicamente
--    uma pessoa com documentos passa a falhar). documento_nao_se_apaga (42501).
--
-- 4. rpc_hr_documento_ocultar(p_documento_id uuid, p_motivo text) RETURNS jsonb
--    {estado, oculto: true, envio_retirado}: permissao .ocultar; so assinado,
--    entregue ou anulado ainda nao ocultos (D6); retira o envio activo
--    (hr_documento_retirar_envio_activo, com o mesmo motivo); preenche
--    deleted_at/deleted_by (anew_users.id); acesso sensivel; ocorrencia.
--
-- 5. rpc_hr_documento_repor(p_documento_id uuid, p_motivo text) RETURNS jsonb
--    {estado, oculto: false}: permissao .repor; so ocultos; limpa deleted_*; o
--    envio ao portal NAO volta; acesso sensivel; ocorrencia.
--
-- 6. rpc_hr_documentos_ocultados(p_pessoa_id uuid) RETURNS TABLE (os
--    descritivos e a ultima ocultacao: quem, quando, motivo; nunca o texto nem
--    o caminho do ficheiro): permissao .repor na organizacao da pessoa.
--
-- 7. rpc_hr_documento_historico(p_documento_id uuid) RETURNS TABLE (as
--    ocorrencias, da mais antiga para a mais recente): .view se o documento
--    esta visivel, .repor se esta oculto.
--
-- 8. rpc_hr_portal_documentos_ler (portal, service_role): troca de texto no
--    corpo de 20270104700000 (guarda md5): o JOIN aos documentos passa a
--    excluir os anulados (D4). Os ocultos ja estavam excluidos (deleted_at), e
--    ocultar/anular retiram o envio. Mesma assinatura, GRANT e comentario
--    (pg_get_functiondef). As outras leituras do portal (conteudo, ficheiro,
--    codigo, assinar, recusar) ja recusavam anulados e ocultos.
--
-- Todas as RPCs: SECURITY DEFINER, search_path vazio, sem sessao 42501,
-- permissao verificada ANTES de qualquer lock, e documento/pessoa inexistente
-- ou sem permissao respondem nao_encontrado (HRA31). EXECUTE so authenticated.
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo; nenhum novo) --------------------------
--   42501 insufficient_privilege, documento_nao_se_apaga
--   HRA31 nao_encontrado, HRA37 motivo_invalido, HRA38 estado_invalido
--   23514 pessoas_documentos_so_final_oculto (escrita directa fora das RPCs)
--   documentos_ocultar_fora_de_transaccao (25000)
--
--
-- -- O QUE MUDA PARA AS ORGANIZACOES DA BASE RH -------------------------------
--   Os super_admin de todas as organizacoes da base RH ganham as duas
--   permissoes. Um DELETE fisico de documento (ou de pessoa com documentos)
--   passa a falhar (nenhum caminho da aplicacao o faz: lido em migrations,
--   src e supabase/functions). O portal deixa de mostrar documentos anulados
--   cujo envio nao foi retirado.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: repor o
-- corpo de rpc_hr_portal_documentos_ler de 20270104700000; largar as quatro
-- RPCs, os dois gatilhos e a funcao deles, o CHECK; tirar as duas permissoes
-- dos papeis (com a mesma claim) e do catalogo. Os documentos ocultos ficam
-- ocultos (deleted_at), como qualquer soft delete.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'documentos_ocultar_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- O corpo do portal em vigor (20270104700000), para a guarda md5 ---------
CREATE TEMP TABLE tmp_e3_ler_antigo (corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_e3_ler_antigo (corpo) VALUES ($old$
DECLARE
  v_s         record;
  v_ate       timestamptz;
  v_envios    jsonb;
  v_rh        jsonb;
  v_pessoa    jsonb;
  v_pendentes integer;
  v_n_rh      integer;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT c.portal_documentos_ate INTO v_ate FROM public.pessoas_convites_admissao c WHERE c.id = v_s.convite_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id',               e.id,
           'titulo',           d.titulo,
           'tipo',             d.tipo,
           'enviado_em',       e.enviado_em,
           'visto_em',         e.visto_em,
           'exige_assinatura', e.exige_assinatura,
           'situacao',         CASE
                                 WHEN d.estado = 'assinado' THEN 'assinado'
                                 WHEN d.estado = 'anulado' THEN 'anulado'
                                 WHEN e.recusado_em IS NOT NULL THEN 'recusado'
                                 WHEN d.estado = 'entregue' OR NOT e.exige_assinatura THEN 'entregue'
                                 ELSE 'por_assinar'
                               END,
           'assinado_em',      d.assinado_em,
           'assinatura_referencia', d.assinatura_referencia,
           'recusa_motivo',    e.recusa_motivo,
           'tem_conteudo',     public.hr_documento_corpo_visivel(d.corpo_html, d.modelo_id),
           'tem_ficheiro',     d.ficheiro_caminho IS NOT NULL,
           'codigo_expira_em', CASE WHEN e.sms_codigo_expira_em > now() THEN e.sms_codigo_expira_em END,
           'pedido_id',        e.pedido_id) ORDER BY e.enviado_em DESC, e.id), '[]'::jsonb),
         count(*) FILTER (WHERE e.exige_assinatura AND e.recusado_em IS NULL AND d.estado = 'a_aguardar_assinatura')
    INTO v_envios, v_pendentes
    FROM public.pessoas_portal_envios e
    JOIN public.pessoas_documentos d ON d.id = e.documento_id AND d.deleted_at IS NULL
   WHERE e.pessoa_id = v_s.pessoa_id AND e.organization_id = v_s.organization_id AND e.retirado_em IS NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'tipo', p.tipo, 'titulo', p.titulo, 'nota', p.nota, 'prazo', p.prazo,
           'estado', p.estado, 'motivo_recusa', p.motivo_recusa,
           'ficheiros', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome_original,
                                                                      'estado', a.estado) ORDER BY a.criado_em, a.id)
                                    FROM public.pessoas_anexos a
                                   WHERE a.pedido_id = p.id AND a.estado IN ('pendente', 'ligado')), '[]'::jsonb))
           ORDER BY p.criado_em DESC, p.id), '[]'::jsonb),
         count(*) FILTER (WHERE p.estado IN ('por_enviar', 'recusado'))
    INTO v_rh, v_n_rh
    FROM public.pessoas_portal_pedidos p
   WHERE p.pessoa_id = v_s.pessoa_id AND p.organization_id = v_s.organization_id
     AND p.direcao = 'rh_pede' AND p.estado <> 'cancelado';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'tipo', p.tipo, 'titulo', p.titulo, 'nota', p.nota, 'urgencia', p.urgencia,
           'estado', p.estado, 'motivo_recusa', p.motivo_recusa,
           'envio_id', (SELECT e.id FROM public.pessoas_portal_envios e
                         WHERE e.pedido_id = p.id AND e.retirado_em IS NULL LIMIT 1))
           ORDER BY p.criado_em DESC, p.id), '[]'::jsonb)
    INTO v_pessoa
    FROM public.pessoas_portal_pedidos p
   WHERE p.pessoa_id = v_s.pessoa_id AND p.organization_id = v_s.organization_id
     AND p.direcao = 'pessoa_pede';

  RETURN jsonb_build_object(
    'estado',              v_s.estado,
    'documentos_ate',      v_ate,
    'pendentes',           coalesce(v_pendentes, 0) + coalesce(v_n_rh, 0),
    'telemovel_mascarado', public.hr_telemovel_mascarar(public.hr_pessoa_telemovel(v_s.pessoa_id, v_s.organization_id)),
    'envios',              v_envios,
    'pedidos_rh',          v_rh,
    'pedidos_pessoa',      v_pessoa);
END;
$old$);

-- A troca: ancora, substituto, quantas vezes a ancora aparece no corpo.
CREATE TEMP TABLE tmp_e3_troca (fn text NOT NULL, ancora text NOT NULL, novo text NOT NULL, vezes integer NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_e3_troca (fn, ancora, novo, vezes) VALUES
('public.rpc_hr_portal_documentos_ler(text, text)',
 $x$JOIN public.pessoas_documentos d ON d.id = e.documento_id AND d.deleted_at IS NULL$x$,
 $x$JOIN public.pessoas_documentos d ON d.id = e.documento_id AND d.deleted_at IS NULL AND d.estado <> 'anulado'$x$,
 1);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista  text;
  v_n      integer;
  v_src    text;
  v_antigo text;
  v_t      record;
BEGIN
  -- G0. Quem aplica passa a RLS.
  IF NOT EXISTS (SELECT 1 FROM pg_roles ro
                  WHERE ro.rolname::text = current_user::text AND (ro.rolsuper OR ro.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS.', current_user::text;
  END IF;

  -- G1. 20270111800000 aplicada (ou aplicada antes, no mesmo push).
  IF to_regclass('public.pessoas_documentos_ocorrencias') IS NULL
     OR to_regprocedure('public.rpc_hr_documento_anular(uuid, text)') IS NULL
     OR to_regprocedure('public.hr_documento_motivo(text)') IS NULL
     OR to_regprocedure('public.hr_documento_retirar_envio_activo(uuid, uuid, text)') IS NULL
     OR to_regprocedure('public.hr_documento_ocorrencia_registar(uuid, uuid, uuid, text, text, text, uuid)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger t
                     WHERE t.tgrelid = to_regclass('public.pessoas_documentos')
                       AND t.tgname::text = 'trg_pessoas_documentos_anulado_imutavel') THEN
    RAISE EXCEPTION 'G1: falta 20270111800000 (tabela de ocorrencias, funcoes ou gatilho do anulado). Aplicar antes.';
  END IF;
  SELECT string_agg(f, ', ') INTO v_lista
    FROM unnest(ARRAY['public.has_anew_permission_in_org(uuid, text, uuid)',
                      'public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid)',
                      'public.rpc_hr_portal_documentos_ler(text, text)',
                      'public.rpc_hr_documento_ver_conteudo(uuid)',
                      'public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text)',
                      'public.rpc_hr_documento_registar_assinatura_externa(uuid)',
                      'public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean)',
                      'auth.uid()']) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: faltam funcoes: %.', v_lista;
  END IF;

  -- G2. Catalogo: colunas, pai, e os dois codigos livres ou com a mesma definicao.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.anew_permissions') AND NOT a.attisdropped
     AND a.attname::text IN ('code', 'name', 'description', 'category', 'parent_code', 'display_order',
                             'is_dangerous', 'scope', 'supports_scope');
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'G2: anew_permissions nao tem as 9 colunas esperadas (encontradas %).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = 'hr.pessoas.documentos.edit') THEN
    RAISE EXCEPTION 'G2: hr.pessoas.documentos.edit (pai) nao esta no catalogo.';
  END IF;
  SELECT string_agg(ap.code, ', ') INTO v_lista FROM public.anew_permissions ap
   WHERE ap.code IN ('hr.pessoas.documentos.ocultar', 'hr.pessoas.documentos.repor')
     AND (ap.category IS DISTINCT FROM 'hr' OR ap.is_dangerous IS DISTINCT FROM true
          OR ap.scope IS DISTINCT FROM 'organization' OR ap.parent_code IS DISTINCT FROM 'hr.pessoas.documentos.edit');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: % ja existe(m) no catalogo com outra definicao.', v_lista;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.anew_role_permissions') AND NOT a.attisdropped
     AND a.attname::text IN ('role_id', 'permission_code', 'created_by');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'G2: anew_role_permissions nao tem role_id, permission_code e created_by (% de 3).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_roles r WHERE r.code = 'super_admin') THEN
    RAISE EXCEPTION 'G2: nao existe nenhum papel super_admin. Investigar antes de aplicar.';
  END IF;

  -- G3. Nomes novos livres.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('rpc_hr_documento_ocultar', 'rpc_hr_documento_repor', 'rpc_hr_documentos_ocultados',
                             'rpc_hr_documento_historico', 'hr_documentos_sem_apagar');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G3: ja existem funcoes com nomes desta entrega: %.', v_lista;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = to_regclass('public.pessoas_documentos')
                AND t.tgname::text IN ('trg_pessoas_documentos_sem_apagar', 'trg_pessoas_documentos_sem_truncate'))
     OR EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conrelid = to_regclass('public.pessoas_documentos')
                   AND c.conname::text = 'pessoas_documentos_so_final_oculto') THEN
    RAISE EXCEPTION 'G3: um gatilho ou o CHECK desta entrega ja existe em pessoas_documentos.';
  END IF;

  -- G4. O corpo do portal e o de 20270104700000 (md5 sem \r), uma so
  --     assinatura, definer, search_path vazio; a ancora aparece uma vez.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname::text = 'public' AND p.proname::text = 'rpc_hr_portal_documentos_ler') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                     WHERE p.oid = to_regprocedure('public.rpc_hr_portal_documentos_ler(text, text)')::oid
                       AND p.prosecdef AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'G4: rpc_hr_portal_documentos_ler devia existir so como (text, text), SECURITY DEFINER e search_path vazio.';
  END IF;
  SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.rpc_hr_portal_documentos_ler(text, text)')::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_e3_ler_antigo t;
  IF md5(v_src) IS DISTINCT FROM md5(v_antigo) THEN
    RAISE EXCEPTION 'G4: rpc_hr_portal_documentos_ler no remoto (md5 sem \r %) nao e a de 20270104700000 transcrita aqui (md5 %). Reler a versao mais recente antes de aplicar.',
      md5(v_src), md5(v_antigo);
  END IF;
  FOR v_t IN SELECT * FROM tmp_e3_troca LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_t.fn)::oid;
    v_n := (length(v_src) - length(replace(v_src, v_t.ancora, ''))) / length(v_t.ancora);
    IF v_n <> v_t.vezes THEN
      RAISE EXCEPTION 'G4: em %, a ancora aparece % vez(es), esperava-se %.', v_t.fn, v_n, v_t.vezes;
    END IF;
  END LOOP;

  -- G5. Dados: nenhum oculto fora de um estado final (lido a 9/11: nenhum oculto).
  SELECT count(*) INTO v_n FROM public.pessoas_documentos d
   WHERE d.deleted_at IS NOT NULL AND d.estado NOT IN ('assinado', 'entregue', 'anulado');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G5: % documento(s) oculto(s) em rascunho ou a aguardar assinatura: o CHECK pessoas_documentos_so_final_oculto nao validaria. Decidir antes de aplicar.', v_n;
  END IF;
END;
$guardas$;

-- O corpo de antes da troca, para o conferir provar que so mudou o pedido.
CREATE TEMP TABLE tmp_e3_antes ON COMMIT DROP AS
SELECT t.fn, p.prosrc, p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
       coalesce(p.proacl::text, '') AS proacl
  FROM tmp_e3_troca t
  JOIN pg_proc p ON p.oid = to_regprocedure(t.fn)::oid;


-- ==============================================================================
-- 1. Catalogo e atribuicao ao super_admin
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.pessoas.documentos.ocultar', 'Ocultar documentos de RH',
   'Esconder da ficha um documento assinado, entregue ou anulado, com motivo. O documento não se apaga: deixa de aparecer na lista, no portal e na leitura do conteúdo até ser reposto, e o envio ao portal é retirado. Cada ocultação fica registada.',
   'hr', 'hr.pessoas.documentos.edit', 661, true, 'organization', false),
  ('hr.pessoas.documentos.repor', 'Repor documentos ocultados',
   'Ver a lista dos documentos ocultados de uma pessoa (sem o conteúdo) e repô-los na ficha, com motivo. O envio ao portal não volta. Cada reposição fica registada.',
   'hr', 'hr.pessoas.documentos.edit', 662, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- Papeis de sistema so aceitam escrita com a claim service_role (gatilho de
-- protecao). A claim e LOCAL e reposta logo a seguir; nenhum gatilho e
-- desligado e anew_role_permissions nao fica trancada.
DO $atribuir$
DECLARE
  v_prev text;
BEGIN
  v_prev := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
  SELECT ro.id, x.code, NULL::uuid
    FROM public.anew_roles ro
   CROSS JOIN (VALUES ('hr.pessoas.documentos.ocultar'), ('hr.pessoas.documentos.repor')) AS x(code)
   WHERE ro.code = 'super_admin'
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev, '') = '' THEN '{}' ELSE v_prev END, true);
END;
$atribuir$;


-- ==============================================================================
-- 2. Nada se apaga fisicamente; so o que e final se oculta
-- ==============================================================================
ALTER TABLE public.pessoas_documentos ADD CONSTRAINT pessoas_documentos_so_final_oculto
  CHECK (deleted_at IS NULL OR estado IN ('assinado', 'entregue', 'anulado'));

COMMENT ON CONSTRAINT pessoas_documentos_so_final_oculto ON public.pessoas_documentos IS
'So um documento final (assinado, entregue, anulado) pode estar oculto (deleted_at). Um rascunho ou um documento a aguardar assinatura anula-se, nao se oculta. Desde 20270111810000.';

CREATE FUNCTION public.hr_documentos_sem_apagar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'documento_nao_se_apaga' USING ERRCODE = '42501',
    DETAIL = 'Os documentos de RH nunca se apagam: anular (rpc_hr_documento_anular) ou ocultar (rpc_hr_documento_ocultar).';
END;
$$;

COMMENT ON FUNCTION public.hr_documentos_sem_apagar() IS
'INTERNA (gatilhos BEFORE DELETE e BEFORE TRUNCATE de pessoas_documentos). Recusa apagar documentos fisicamente (documento_nao_se_apaga, 42501), tambem ao dono, a service_role e a cascata de apagar a pessoa. Desde 20270111810000.';

CREATE TRIGGER trg_pessoas_documentos_sem_apagar
  BEFORE DELETE ON public.pessoas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.hr_documentos_sem_apagar();
CREATE TRIGGER trg_pessoas_documentos_sem_truncate
  BEFORE TRUNCATE ON public.pessoas_documentos
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_documentos_sem_apagar();


-- ==============================================================================
-- 3. Ocultar e repor
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_documento_ocultar(p_documento_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_motivo text;
  v_doc    record;
  v_trc    record;
  v_anew   uuid;
  v_envio  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 1. Permissao ANTES de qualquer lock (leitura simples).
  SELECT d.id, d.organization_id, d.pessoa_id, d.estado, d.deleted_at INTO v_doc
    FROM public.pessoas_documentos d
   WHERE d.id = p_documento_id;
  IF NOT FOUND
     OR NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.ocultar', v_doc.organization_id), false) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- 2. O motivo.
  v_motivo := public.hr_documento_motivo(p_motivo);
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;

  -- 3. So o que e final e ainda nao esta oculto (D6).
  IF v_doc.deleted_at IS NOT NULL OR v_doc.estado NOT IN ('assinado', 'entregue', 'anulado') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 4. Tranca processo -> envio -> documento e retira o envio activo.
  v_envio := public.hr_documento_retirar_envio_activo(v_uid, v_doc.id, v_motivo);

  -- 5. De novo, ja com o documento trancado.
  SELECT d.estado, d.deleted_at INTO v_trc
    FROM public.pessoas_documentos d
   WHERE d.id = v_doc.id
   FOR UPDATE;
  IF v_trc.deleted_at IS NOT NULL OR v_trc.estado NOT IN ('assinado', 'entregue', 'anulado') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  UPDATE public.pessoas_documentos
     SET deleted_at = now(), deleted_by = v_anew, updated_by = v_anew
   WHERE id = v_doc.id;

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'alterar', NULL::uuid);
  PERFORM public.hr_documento_ocorrencia_registar(v_uid, v_anew, v_doc.id, 'ocultado', v_motivo, v_trc.estado, v_envio);

  RETURN jsonb_build_object('estado', v_trc.estado, 'oculto', true, 'envio_retirado', v_envio IS NOT NULL);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_documento_ocultar(uuid, text) IS
'Oculta da ficha um documento assinado, entregue ou anulado (deleted_at/deleted_by). Exige hr.pessoas.documentos.ocultar na organizacao do documento, verificada antes de qualquer lock (sem sessao 42501; inexistente ou sem permissao HRA31). Motivo 3 a 2000 (HRA37); outro estado ou ja oculto HRA38. Retira o envio activo do portal com o mesmo motivo; regista o acesso sensivel (documento, alterar) e a ocorrencia. Oculto deixa de aparecer na leitura normal, em rpc_hr_documento_ver_conteudo, na Edge do ficheiro e no portal; ver o conteudo exige repo-lo. Devolve {estado, oculto, envio_retirado}. Desde 20270111810000.';

CREATE FUNCTION public.rpc_hr_documento_repor(p_documento_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_motivo text;
  v_doc    record;
  v_trc    record;
  v_anew   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 1. Permissao ANTES de qualquer lock (leitura simples).
  SELECT d.id, d.organization_id, d.pessoa_id, d.deleted_at INTO v_doc
    FROM public.pessoas_documentos d
   WHERE d.id = p_documento_id;
  IF NOT FOUND
     OR NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.repor', v_doc.organization_id), false) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- 2. O motivo.
  v_motivo := public.hr_documento_motivo(p_motivo);
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;

  -- 3. So o que esta oculto.
  IF v_doc.deleted_at IS NULL THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 4. So o documento se tranca: um oculto nao tem envio activo, e o envio nao volta.
  SELECT d.estado, d.deleted_at INTO v_trc
    FROM public.pessoas_documentos d
   WHERE d.id = v_doc.id
   FOR UPDATE;
  IF v_trc.deleted_at IS NULL THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  UPDATE public.pessoas_documentos
     SET deleted_at = NULL, deleted_by = NULL, updated_by = v_anew
   WHERE id = v_doc.id;

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'alterar', NULL::uuid);
  PERFORM public.hr_documento_ocorrencia_registar(v_uid, v_anew, v_doc.id, 'reposto', v_motivo, v_trc.estado, NULL::uuid);

  RETURN jsonb_build_object('estado', v_trc.estado, 'oculto', false);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_documento_repor(uuid, text) IS
'Repoe na ficha um documento oculto (limpa deleted_at/deleted_by). Exige hr.pessoas.documentos.repor na organizacao do documento, verificada antes de qualquer lock (sem sessao 42501; inexistente ou sem permissao HRA31). Motivo 3 a 2000 (HRA37); documento nao oculto HRA38. O envio ao portal NAO volta (enviar de novo, se for o caso). Regista o acesso sensivel (documento, alterar) e a ocorrencia. Devolve {estado, oculto}. Desde 20270111810000.';


-- ==============================================================================
-- 4. Leituras: os ocultados de uma pessoa e o historico de um documento
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_documentos_ocultados(p_pessoa_id uuid)
RETURNS TABLE (
  documento_id      uuid,
  tipo              text,
  titulo            text,
  estado            text,
  emitido_em        timestamptz,
  assinado_em       timestamptz,
  entregue_em       timestamptz,
  anulado_em        timestamptz,
  tem_ficheiro      boolean,
  ocultado_em       timestamptz,
  ocultado_por      uuid,
  ocultado_por_nome text,
  ocultado_motivo   text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.pessoas p WHERE p.id = p_pessoa_id;
  IF v_org IS NULL
     OR NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.repor', v_org), false) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Nunca corpo_html nem ficheiro_caminho: so descritivos.
  RETURN QUERY
  SELECT d.id, d.tipo::text, d.titulo::text, d.estado::text, d.emitido_em, d.assinado_em, d.entregue_em, d.anulado_em,
         d.ficheiro_caminho IS NOT NULL,
         d.deleted_at, d.deleted_by, u.name::text, ult.motivo
    FROM public.pessoas_documentos d
    LEFT JOIN public.anew_users u ON u.id = d.deleted_by
    LEFT JOIN LATERAL (SELECT oc.motivo
                         FROM public.pessoas_documentos_ocorrencias oc
                        WHERE oc.documento_id = d.id AND oc.accao = 'ocultado'
                        ORDER BY oc.criado_em DESC, oc.seq DESC
                        LIMIT 1) AS ult ON true
   WHERE d.pessoa_id = p_pessoa_id AND d.organization_id = v_org AND d.deleted_at IS NOT NULL
   ORDER BY d.deleted_at DESC, d.id;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_documentos_ocultados(uuid) IS
'Os documentos ocultos de uma pessoa: descritivos (tipo, titulo, estado, datas, tem_ficheiro) e a ultima ocultacao (quando, quem: anew_users.id e nome, motivo). Nunca o texto nem o caminho do ficheiro. Exige hr.pessoas.documentos.repor na organizacao da pessoa (sem sessao 42501; pessoa inexistente ou sem permissao HRA31). Desde 20270111810000.';

CREATE FUNCTION public.rpc_hr_documento_historico(p_documento_id uuid)
RETURNS TABLE (
  ocorrencia_id      uuid,
  accao              text,
  motivo             text,
  estado_documento   text,
  actor_anew_user_id uuid,
  actor_nome         text,
  envio_retirado_id  uuid,
  criado_em          timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid  uuid := auth.uid();
  v_doc  record;
  v_perm text;
  v_repor boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT d.id, d.organization_id, d.deleted_at INTO v_doc
    FROM public.pessoas_documentos d
   WHERE d.id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  -- Visivel: quem ve os documentos; oculto: so quem pode repor.
  v_perm := 'hr.pessoas.documentos.view';
  IF v_doc.deleted_at IS NOT NULL THEN
    v_perm := 'hr.pessoas.documentos.repor';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(v_uid, v_perm, v_doc.organization_id), false) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Os motivos de ocultado e reposto sao sensiveis: exigem sempre .repor, mesmo
  -- depois de reposto. Quem so tem .view ve apenas as linhas de 'anulado'.
  v_repor := coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.repor', v_doc.organization_id), false);

  RETURN QUERY
  SELECT oc.id, oc.accao, oc.motivo, oc.estado_documento, oc.actor_anew_user_id, u.name::text,
         oc.envio_retirado_id, oc.criado_em
    FROM public.pessoas_documentos_ocorrencias oc
    LEFT JOIN public.anew_users u ON u.id = oc.actor_anew_user_id
   WHERE oc.documento_id = v_doc.id AND oc.organization_id = v_doc.organization_id
     AND (v_repor OR oc.accao = 'anulado')
   ORDER BY oc.criado_em, oc.seq;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_documento_historico(uuid) IS
'O historico (pessoas_documentos_ocorrencias) de um documento: anulado, ocultado, reposto, com motivo, estado anterior, quem e o envio retirado, do mais antigo para o mais recente. Exige hr.pessoas.documentos.view se o documento esta visivel e hr.pessoas.documentos.repor se esta oculto; sem .repor so devolve as linhas de anulado (ocultado e reposto exigem .repor) (sem sessao 42501; inexistente ou sem permissao HRA31). Desde 20270111810000.';


-- ==============================================================================
-- 5. O portal deixa de mostrar anulados (troca de texto; mantem dono,
--    privilegios, SECURITY DEFINER, search_path e comentario)
-- ==============================================================================
DO $troca$
DECLARE
  v_def text;
  v_t   record;
BEGIN
  FOR v_t IN SELECT * FROM tmp_e3_troca LOOP
    v_def := pg_get_functiondef(to_regprocedure(v_t.fn)::oid);
    v_def := replace(v_def, v_t.ancora, v_t.novo);
    EXECUTE v_def;
    EXECUTE format('COMMENT ON FUNCTION %s IS %L',
                   to_regprocedure(v_t.fn)::text,
                   coalesce(obj_description(to_regprocedure(v_t.fn)::oid, 'pg_proc'), '')
                   || ' Desde 20270111810000: os documentos anulados deixam de aparecer no portal (D4); os ocultos ja nao apareciam.');
  END LOOP;
END;
$troca$;


-- ==============================================================================
-- 6. Privilegios
-- ==============================================================================
REVOKE ALL ON FUNCTION public.hr_documentos_sem_apagar() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_ocultar(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_repor(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_documentos_ocultados(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_historico(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_ocultar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_repor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documentos_ocultados(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_historico(uuid) TO authenticated;


-- ==============================================================================
-- 7. Conferir: estrutura e privilegios; depois a prova na nike, DESFEITA
-- ==============================================================================
CREATE FUNCTION pg_temp.e3_chamar(p_auth uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v_res    text;
  v_estado text;
  v_msg    text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_auth::text, ''), true),
          set_config('request.jwt.claims',
                     CASE WHEN p_auth IS NULL THEN '{}'
                          ELSE json_build_object('sub', p_auth, 'role', 'authenticated')::text END, true);
  BEGIN
    EXECUTE p_sql INTO v_res;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    v_res := 'ERRO:' || v_estado || ':' || v_msg;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
  RETURN coalesce(v_res, '');
END;
$f$;

CREATE FUNCTION pg_temp.e3_ok(p_auth uuid, p_sql text, p_rotulo text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v_res text := pg_temp.e3_chamar(p_auth, p_sql);
BEGIN
  IF v_res LIKE 'ERRO:%' THEN
    RAISE EXCEPTION 'Conferir [%]: devia passar; deu %', p_rotulo, left(v_res, 400);
  END IF;
  RETURN v_res;
END;
$f$;

CREATE FUNCTION pg_temp.e3_erro(p_auth uuid, p_sql text, p_codigo text, p_rotulo text)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  v_res text := pg_temp.e3_chamar(p_auth, p_sql);
BEGIN
  IF v_res NOT LIKE 'ERRO:' || p_codigo || ':%' THEN
    RAISE EXCEPTION 'Conferir [%]: esperava o erro %, veio %', p_rotulo, p_codigo, left(coalesce(v_res, ''), 400);
  END IF;
END;
$f$;

CREATE FUNCTION pg_temp.e3_directo(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLSTATE;
  END;
  RETURN 'ok';
END;
$f$;

-- Quantas linhas do documento a leitura NORMAL (papel authenticated, RLS de
-- pessoas_documentos_select) devolve a este utilizador; -1 se o papel nao se
-- pode assumir (a prova diz que ficou por provar).
CREATE FUNCTION pg_temp.e3_visivel(p_auth uuid, p_doc uuid)
RETURNS integer
LANGUAGE plpgsql
AS $f$
DECLARE
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_auth::text, true),
          set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM public.pessoas_documentos d WHERE d.id = p_doc;
    -- Nao RESET ROLE: no db push o utilizador de sessao e cli_login_postgres (sem
    -- EXECUTE nas funcoes novas) e o postgres e so um SET ROLE; volta-se a ele.
    EXECUTE 'SET LOCAL ROLE postgres';
  EXCEPTION WHEN OTHERS THEN
    v_n := -1;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
  RETURN v_n;
END;
$f$;

DO $conferir$
DECLARE
  k_nike     constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_motivo   constant text := 'prova da migracao 20270111810000';
  k_titulo   constant text := 'prova 20270111810000';
  k_rpcs     constant text[] := ARRAY['public.rpc_hr_documento_ocultar(uuid, text)',
                                      'public.rpc_hr_documento_repor(uuid, text)',
                                      'public.rpc_hr_documentos_ocultados(uuid)',
                                      'public.rpc_hr_documento_historico(uuid)'];
  v_fn       text;
  v_grant    text;
  v_n        integer;
  v_n2       integer;
  v_res      text;
  v_j        jsonb;
  v_st       text;
  v_t        record;
  v_new      record;
  v_esperado text;
  v_uid      uuid;
  v_anew     uuid;
  v_prev     text;
  v_p        uuid;
  v_s        uuid;
  v_w        uuid;
  v_x        uuid;
  v_envio    uuid;
  v_conteudo boolean;
  v_prova_rls      text;
  v_prova_perm     text := 'o papel do utilizador de teste ja as tinha';
  v_prova_conteudo text;
BEGIN
  -- 7.1 Catalogo e atribuicao: os dois codigos, e todos os super_admin com eles.
  IF (SELECT count(*) FROM public.anew_permissions ap
       WHERE ap.code IN ('hr.pessoas.documentos.ocultar', 'hr.pessoas.documentos.repor')
         AND ap.category = 'hr' AND ap.is_dangerous IS TRUE AND ap.scope = 'organization'
         AND ap.parent_code = 'hr.pessoas.documentos.edit') <> 2 THEN
    RAISE EXCEPTION 'Conferir: as duas permissoes novas nao ficaram no catalogo como deviam.';
  END IF;
  SELECT string_agg(ro.id::text || ':' || x.code, ', ') INTO v_res
    FROM public.anew_roles ro
   CROSS JOIN (VALUES ('hr.pessoas.documentos.ocultar'), ('hr.pessoas.documentos.repor')) AS x(code)
   WHERE ro.code = 'super_admin'
     AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                      WHERE rp.role_id = ro.id AND rp.permission_code = x.code);
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: super_admin sem as permissoes novas: %.', v_res;
  END IF;
  SELECT count(*) INTO v_n
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles ro ON ro.id = rp.role_id
   WHERE rp.permission_code IN ('hr.pessoas.documentos.ocultar', 'hr.pessoas.documentos.repor')
     AND ro.code IS DISTINCT FROM 'super_admin';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Conferir: % atribuicao(oes) das permissoes novas a papeis que nao sao super_admin.', v_n;
  END IF;
  IF coalesce(current_setting('request.jwt.claims', true), '') LIKE '%service_role%' THEN
    RAISE EXCEPTION 'Conferir: a claim service_role ficou posta depois da atribuicao.';
  END IF;

  -- 7.2 CHECK validado; gatilhos ligados (tgtype: 1 ROW, 2 BEFORE, 8 DELETE, 32 TRUNCATE).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_documentos')
                    AND c.conname::text = 'pessoas_documentos_so_final_oculto'
                    AND c.contype::text = 'c' AND c.convalidated) THEN
    RAISE EXCEPTION 'Conferir: pessoas_documentos_so_final_oculto nao existe ou nao esta validado.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE t.tgrelid = to_regclass('public.pessoas_documentos') AND NOT t.tgisinternal AND t.tgenabled::text <> 'D'
     AND t.tgfoid = to_regprocedure('public.hr_documentos_sem_apagar()')::oid
     AND ((t.tgname::text = 'trg_pessoas_documentos_sem_apagar' AND (t.tgtype::integer & 63) = 11)
       OR (t.tgname::text = 'trg_pessoas_documentos_sem_truncate' AND (t.tgtype::integer & 63) = 34));
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se os 2 gatilhos de nao apagar ligados; ha %.', v_n;
  END IF;

  -- 7.3 Funcoes: as RPCs definer, search_path vazio, EXECUTE so authenticated;
  --     a do gatilho sem EXECUTE e nao definer.
  FOREACH v_fn IN ARRAY k_rpcs LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % devia existir, SECURITY DEFINER e search_path vazio.', v_fn;
    END IF;
    SELECT string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ',')
      INTO v_grant
      FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.privilege_type::text = 'EXECUTE'
       AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
    IF coalesce(v_grant, '') IS DISTINCT FROM 'authenticated' THEN
      RAISE EXCEPTION 'Conferir: EXECUTE em % devia ser so "authenticated", e "%".', v_fn, coalesce(v_grant, '');
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure('public.hr_documentos_sem_apagar()')::oid AND NOT p.prosecdef
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Conferir: hr_documentos_sem_apagar devia ter search_path vazio e nao ser definer.';
  END IF;
  SELECT string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ',')
    INTO v_grant
    FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = to_regprocedure('public.hr_documentos_sem_apagar()')::oid AND a.privilege_type::text = 'EXECUTE'
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
  IF v_grant IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: hr_documentos_sem_apagar tem EXECUTE para "%".', v_grant;
  END IF;

  -- 7.4 A troca no portal: corpo novo = antigo com a troca (sem \r), resto igual,
  --     e EXECUTE do portal continua so service_role.
  FOR v_t IN SELECT a.fn, a.prosrc, a.prosecdef, a.proconfig, a.proacl, t.ancora, t.novo
               FROM tmp_e3_antes a JOIN tmp_e3_troca t ON t.fn = a.fn LOOP
    v_esperado := replace(v_t.prosrc, v_t.ancora, v_t.novo);
    SELECT p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
           coalesce(p.proacl::text, '') AS proacl
      INTO v_new FROM pg_proc p WHERE p.oid = to_regprocedure(v_t.fn)::oid;
    IF replace(v_new.prosrc, chr(13), '') IS DISTINCT FROM replace(v_esperado, chr(13), '')
       OR v_new.prosecdef IS DISTINCT FROM v_t.prosecdef
       OR v_new.proconfig IS DISTINCT FROM v_t.proconfig
       OR v_new.proacl IS DISTINCT FROM v_t.proacl THEN
      RAISE EXCEPTION 'Conferir: % mudou mais do que a troca (corpo, SECURITY DEFINER, search_path ou privilegios).', v_t.fn;
    END IF;
    IF replace(replace(v_new.prosrc, chr(13), ''), v_t.novo, v_t.ancora)
       IS DISTINCT FROM (SELECT replace(o.corpo, chr(13), '') FROM tmp_e3_ler_antigo o) THEN
      RAISE EXCEPTION 'Conferir: sem a troca, o portal devia ser o corpo de 20270104700000.';
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.rpc_hr_portal_documentos_ler(text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_hr_portal_documentos_ler(text, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_portal_documentos_ler(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_portal_documentos_ler devia continuar so de service_role.';
  END IF;

  -- 7.5 Prova na nike, DESFEITA no fim (sentinela HDO00).
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- Quem cria, envia, anula, oculta e repoe: membro activo da nike com
    -- view, emitir e anular (de preferencia ja com ocultar e repor).
    SELECT au.auth_user_id, au.id INTO v_uid, v_anew
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND am.role_is_client IS NOT TRUE
       AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.documentos.view', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.documentos.emitir', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.documentos.anular', k_nike), false)
     ORDER BY coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.documentos.ocultar', k_nike), false) DESC,
              au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um membro activo com hr.pessoas.documentos.view, .emitir e .anular.';
    END IF;
    -- Sem ocultar/repor (nao e super_admin): dadas so para a prova aos papeis
    -- dele NA NIKE, e desfeitas no fim com o resto.
    IF NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.ocultar', k_nike), false)
       OR NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.repor', k_nike), false) THEN
      v_prev := current_setting('request.jwt.claims', true);
      PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
      INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
      SELECT am.role_id, x.code, NULL::uuid
        FROM public.anew_memberships am
       CROSS JOIN (VALUES ('hr.pessoas.documentos.ocultar'), ('hr.pessoas.documentos.repor')) AS x(code)
       WHERE am.organization_id = k_nike AND am.user_id = v_anew AND am.status = 'active'
         AND am.role_is_client IS NOT TRUE AND am.role_id IS NOT NULL
      ON CONFLICT (role_id, permission_code) DO NOTHING;
      PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev, '') = '' THEN '{}' ELSE v_prev END, true);
      v_prova_perm := 'dadas so na prova ao papel do utilizador de teste (desfeito)';
      IF NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.ocultar', k_nike), false)
         OR NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.repor', k_nike), false) THEN
        RAISE EXCEPTION 'Conferir: nao foi possivel dar ocultar/repor ao utilizador de teste na nike.';
      END IF;
    END IF;
    v_conteudo := coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.conteudo.view', k_nike), false);

    SELECT p.id INTO v_p
      FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL
     ORDER BY p.id
     LIMIT 1;
    IF v_p IS NULL THEN
      RAISE EXCEPTION 'Conferir: a nike nao tem nenhuma pessoa nao apagada.';
    END IF;

    -- S: com ficheiro, no portal (sem processo), assinado por fora.
    v_s := pg_temp.e3_ok(v_uid, format(
      'SELECT public.rpc_hr_documento_upload_assinado_criar(%L::uuid, NULL::uuid, %L, %L)::text',
      v_p, 'contrato', k_titulo || ' S'), 'criar S')::uuid;
    v_st := pg_temp.e3_directo(format(
      'UPDATE public.pessoas_documentos SET ficheiro_caminho = %L, ficheiro_hash_sha256 = %L, ficheiro_anexado_em = now(), ficheiro_anexado_por = %L::uuid WHERE id = %L::uuid',
      k_nike::text || '/' || v_p::text || '/' || v_s::text || '/' || gen_random_uuid()::text || '.pdf',
      repeat('c', 64), v_anew, v_s));
    IF v_st IS DISTINCT FROM 'ok' THEN
      RAISE EXCEPTION 'Conferir: anexar o ficheiro de teste a S falhou (%).', v_st;
    END IF;
    v_envio := pg_temp.e3_ok(v_uid, format('SELECT public.rpc_hr_portal_documento_enviar(%L::uuid, NULL::uuid, true)::text', v_s),
                             'enviar S ao portal')::uuid;
    PERFORM pg_temp.e3_ok(v_uid, format('SELECT %L FROM public.rpc_hr_documento_registar_assinatura_externa(%L::uuid)', 'ok', v_s),
                          'assinar S por fora');
    -- W: a aguardar assinatura (sem ficheiro). X: a aguardar, para o CHECK.
    v_w := pg_temp.e3_ok(v_uid, format(
      'SELECT public.rpc_hr_documento_upload_assinado_criar(%L::uuid, NULL::uuid, %L, %L)::text',
      v_p, 'declaracao', k_titulo || ' W'), 'criar W')::uuid;
    v_x := pg_temp.e3_ok(v_uid, format(
      'SELECT public.rpc_hr_documento_upload_assinado_criar(%L::uuid, NULL::uuid, %L, %L)::text',
      v_p, 'outro', k_titulo || ' X'), 'criar X')::uuid;

    -- a) Recusas: sem sessao, inexistente, sem permissao, motivo, estado.
    PERFORM pg_temp.e3_erro(NULL, format('SELECT public.rpc_hr_documento_ocultar(%L::uuid, %L)::text', v_s, k_motivo),
                            '42501', 'ocultar sem sessao');
    PERFORM pg_temp.e3_erro(v_uid, format('SELECT public.rpc_hr_documento_ocultar(%L::uuid, %L)::text', gen_random_uuid(), k_motivo),
                            'HRA31', 'ocultar inexistente');
    PERFORM pg_temp.e3_erro(gen_random_uuid(), format('SELECT public.rpc_hr_documento_ocultar(%L::uuid, %L)::text', v_s, k_motivo),
                            'HRA31', 'ocultar sem permissao');
    PERFORM pg_temp.e3_erro(v_uid, format('SELECT public.rpc_hr_documento_ocultar(%L::uuid, %L)::text', v_s, 'x'),
                            'HRA37', 'ocultar motivo curto');
    PERFORM pg_temp.e3_erro(v_uid, format('SELECT public.rpc_hr_documento_ocultar(%L::uuid, %L)::text', v_w, k_motivo),
                            'HRA38', 'ocultar a aguardar assinatura');
    PERFORM pg_temp.e3_erro(v_uid, format('SELECT public.rpc_hr_documento_repor(%L::uuid, %L)::text', v_s, k_motivo),
                            'HRA38', 'repor um visivel');
    PERFORM pg_temp.e3_erro(gen_random_uuid(), format('SELECT count(*)::text FROM public.rpc_hr_documentos_ocultados(%L::uuid)', v_p),
                            'HRA31', 'ocultados sem permissao');
    PERFORM pg_temp.e3_erro(v_uid, format('SELECT count(*)::text FROM public.rpc_hr_documentos_ocultados(%L::uuid)', gen_random_uuid()),
                            'HRA31', 'ocultados de pessoa inexistente');
    PERFORM pg_temp.e3_erro(NULL, format('SELECT count(*)::text FROM public.rpc_hr_documento_historico(%L::uuid)', v_s),
                            '42501', 'historico sem sessao');
    IF (SELECT d.deleted_at FROM public.pessoas_documentos d WHERE d.id = v_s) IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.pessoas_documentos_ocorrencias o WHERE o.documento_id IN (v_s, v_w)) THEN
      RAISE EXCEPTION 'Conferir: uma recusa deixou S oculto ou uma ocorrencia escrita.';
    END IF;

    -- b) Antes: S visivel na leitura normal.
    v_n := pg_temp.e3_visivel(v_uid, v_s);
    IF v_n = -1 THEN
      v_prova_rls := 'nao provado: o papel authenticated nao se pode assumir aqui (provado so por deleted_at)';
    ELSIF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: antes de ocultar, a leitura normal devia ver S (viu % linha(s)).', v_n;
    ELSE
      v_prova_rls := 'provado com o papel authenticated';
    END IF;

    -- c) Ocultar S (assinado, no portal).
    v_res := pg_temp.e3_ok(v_uid, format('SELECT public.rpc_hr_documento_ocultar(%L::uuid, %L)::text', v_s, k_motivo), 'ocultar S');
    v_j := v_res::jsonb;
    IF v_j IS DISTINCT FROM jsonb_build_object('estado', 'assinado', 'oculto', true, 'envio_retirado', true) THEN
      RAISE EXCEPTION 'Conferir: ocultar S devia devolver {estado: assinado, oculto: true, envio_retirado: true}; deu %.', v_res;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_documentos d
                    WHERE d.id = v_s AND d.deleted_at IS NOT NULL AND d.deleted_by = v_anew AND d.estado = 'assinado') THEN
      RAISE EXCEPTION 'Conferir: S devia ficar oculto (deleted_at, deleted_by) e assinado.';
    END IF;
    -- Portal: o envio saiu (rpc_hr_portal_documentos_ler so le envios activos de documentos nao ocultos).
    IF EXISTS (SELECT 1 FROM public.pessoas_portal_envios e WHERE e.documento_id = v_s AND e.retirado_em IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public.pessoas_portal_envios e
                       WHERE e.id = v_envio AND e.retirado_em IS NOT NULL AND e.retirado_motivo = k_motivo) THEN
      RAISE EXCEPTION 'Conferir: ocultar S devia retirar o envio ao portal com o motivo.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_documentos_ocorrencias o
                    WHERE o.documento_id = v_s AND o.accao = 'ocultado' AND o.estado_documento = 'assinado'
                      AND o.motivo = k_motivo AND o.envio_retirado_id = v_envio AND o.actor_auth_uid = v_uid) THEN
      RAISE EXCEPTION 'Conferir: ocultar S devia escrever a ocorrencia com o envio retirado.';
    END IF;
    -- Leitura normal e conteudo.
    IF v_prova_rls LIKE 'provado%' THEN
      v_n := pg_temp.e3_visivel(v_uid, v_s);
      v_n2 := pg_temp.e3_visivel(v_uid, v_w);
      IF v_n <> 0 OR v_n2 <> 1 THEN
        RAISE EXCEPTION 'Conferir: depois de ocultar, a leitura normal nao devia ver S (viu %) e devia ver W (viu %).', v_n, v_n2;
      END IF;
    END IF;
    v_res := pg_temp.e3_chamar(v_uid, format('SELECT public.rpc_hr_documento_ver_conteudo(%L::uuid)', v_s));
    IF v_res NOT LIKE 'ERRO:%nao encontrado ou apagado%' THEN
      RAISE EXCEPTION 'Conferir: ver o conteudo de S oculto devia ser recusado; deu %.', left(v_res, 300);
    END IF;
    PERFORM pg_temp.e3_erro(v_uid, format('SELECT public.rpc_hr_documento_ocultar(%L::uuid, %L)::text', v_s, k_motivo),
                            'HRA38', 'ocultar de novo');
    PERFORM pg_temp.e3_erro(v_uid, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_s, k_motivo),
                            'HRA31', 'anular um oculto');

    -- d) A lista dos ocultados e o historico.
    v_res := pg_temp.e3_ok(v_uid, format(
      'SELECT coalesce(jsonb_agg(to_jsonb(o)), %L::jsonb)::text FROM public.rpc_hr_documentos_ocultados(%L::uuid) AS o',
      '[]', v_p), 'listar ocultados');
    v_j := v_res::jsonb;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) AS el(v)
                    WHERE (el.v ->> 'documento_id')::uuid = v_s AND el.v ->> 'ocultado_motivo' = k_motivo
                      AND (el.v ->> 'ocultado_por')::uuid = v_anew AND el.v ->> 'estado' = 'assinado'
                      AND (el.v ->> 'tem_ficheiro')::boolean AND el.v ->> 'ocultado_em' IS NOT NULL)
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) AS el(v) WHERE (el.v ->> 'documento_id')::uuid = v_w)
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_j) AS el(v)
                   WHERE el.v ? 'corpo_html' OR el.v ? 'ficheiro_caminho') THEN
      RAISE EXCEPTION 'Conferir: os ocultados deviam trazer S (motivo, quem, quando), sem W e sem texto nem caminho; deu %.', left(v_res, 400);
    END IF;
    v_res := pg_temp.e3_ok(v_uid, format('SELECT count(*)::text FROM public.rpc_hr_documento_historico(%L::uuid) AS h WHERE h.accao = %L',
                                         v_s, 'ocultado'), 'historico de S oculto');
    IF v_res IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'Conferir: o historico de S devia ter 1 ocultacao; tem %.', v_res;
    END IF;

    -- e) Repor S: volta a leitura normal; o envio NAO volta.
    PERFORM pg_temp.e3_erro(v_uid, format('SELECT public.rpc_hr_documento_repor(%L::uuid, %L)::text', v_s, 'ab'),
                            'HRA37', 'repor motivo curto');
    PERFORM pg_temp.e3_erro(gen_random_uuid(), format('SELECT public.rpc_hr_documento_repor(%L::uuid, %L)::text', v_s, k_motivo),
                            'HRA31', 'repor sem permissao');
    v_res := pg_temp.e3_ok(v_uid, format('SELECT public.rpc_hr_documento_repor(%L::uuid, %L)::text', v_s, k_motivo), 'repor S');
    IF v_res::jsonb IS DISTINCT FROM jsonb_build_object('estado', 'assinado', 'oculto', false) THEN
      RAISE EXCEPTION 'Conferir: repor S devia devolver {estado: assinado, oculto: false}; deu %.', v_res;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_documentos d
                    WHERE d.id = v_s AND d.deleted_at IS NULL AND d.deleted_by IS NULL AND d.estado = 'assinado') THEN
      RAISE EXCEPTION 'Conferir: S devia voltar visivel e assinado.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pessoas_portal_envios e WHERE e.documento_id = v_s AND e.retirado_em IS NULL) THEN
      RAISE EXCEPTION 'Conferir: repor S nao devia trazer de volta o envio ao portal.';
    END IF;
    IF v_prova_rls LIKE 'provado%' THEN
      IF pg_temp.e3_visivel(v_uid, v_s) <> 1 THEN
        RAISE EXCEPTION 'Conferir: depois de repor, a leitura normal devia ver S.';
      END IF;
    END IF;
    IF v_conteudo THEN
      PERFORM pg_temp.e3_ok(v_uid, format('SELECT public.rpc_hr_documento_ver_conteudo(%L::uuid)', v_s), 'ver conteudo de S reposto');
      v_prova_conteudo := 'provado (oculto recusado, reposto lido)';
    ELSE
      v_prova_conteudo := 'oculto recusado; leitura depois de repor nao provada (o utilizador nao tem conteudo.view)';
    END IF;
    v_res := pg_temp.e3_ok(v_uid, format(
      'SELECT string_agg(h.accao, %L) FROM (SELECT x.accao FROM public.rpc_hr_documento_historico(%L::uuid) AS x OFFSET 0) AS h',
      ',', v_s), 'historico de S reposto');
    IF v_res IS DISTINCT FROM 'ocultado,reposto' THEN
      RAISE EXCEPTION 'Conferir: o historico de S devia ser "ocultado,reposto"; deu %.', v_res;
    END IF;
    -- M6: com .repor o historico de S reposto traz as 2 linhas; as de ocultado/reposto
    -- sao as que um perfil so com .view nao pode ver (esse filtro e o AND na RPC).
    v_res := pg_temp.e3_ok(v_uid, format(
      'SELECT count(*)::text FROM public.rpc_hr_documento_historico(%L::uuid) AS h WHERE h.accao IN (%L, %L)',
      v_s, 'ocultado', 'reposto'), 'historico de S com repor');
    IF v_res IS DISTINCT FROM '2' THEN
      RAISE EXCEPTION 'Conferir: com .repor o historico de S reposto devia trazer 2 linhas ocultado/reposto; trouxe %.', v_res;
    END IF;
    v_res := pg_temp.e3_ok(v_uid, format('SELECT count(*)::text FROM public.rpc_hr_documentos_ocultados(%L::uuid) AS o WHERE o.documento_id = %L::uuid',
                                         v_p, v_s), 'S fora dos ocultados');
    IF v_res IS DISTINCT FROM '0' THEN
      RAISE EXCEPTION 'Conferir: S reposto nao devia aparecer nos ocultados.';
    END IF;

    -- f) Anulado tambem se oculta e repoe (D6).
    PERFORM pg_temp.e3_ok(v_uid, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_w, k_motivo), 'anular W');
    v_res := pg_temp.e3_ok(v_uid, format('SELECT public.rpc_hr_documento_ocultar(%L::uuid, %L)::text', v_w, k_motivo), 'ocultar W anulado');
    IF v_res::jsonb IS DISTINCT FROM jsonb_build_object('estado', 'anulado', 'oculto', true, 'envio_retirado', false) THEN
      RAISE EXCEPTION 'Conferir: ocultar W anulado devia devolver {estado: anulado, oculto: true, envio_retirado: false}; deu %.', v_res;
    END IF;
    PERFORM pg_temp.e3_ok(v_uid, format('SELECT public.rpc_hr_documento_repor(%L::uuid, %L)::text', v_w, k_motivo), 'repor W anulado');
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_documentos d WHERE d.id = v_w AND d.deleted_at IS NULL AND d.estado = 'anulado') THEN
      RAISE EXCEPTION 'Conferir: W devia voltar visivel e anulado.';
    END IF;

    -- g) Escritas directas: ocultar um nao final viola o CHECK; apagar e recusado.
    v_st := pg_temp.e3_directo(format('UPDATE public.pessoas_documentos SET deleted_at = now() WHERE id = %L::uuid', v_x));
    IF v_st IS DISTINCT FROM '23514' THEN
      RAISE EXCEPTION 'Conferir: ocultar directamente um documento a aguardar assinatura devia dar 23514 (deu %).', v_st;
    END IF;
    v_st := pg_temp.e3_directo(format('DELETE FROM public.pessoas_documentos WHERE id = %L::uuid', v_x));
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: apagar um documento devia dar 42501 (deu %).', v_st;
    END IF;
    v_st := pg_temp.e3_directo(format('DELETE FROM public.pessoas_documentos WHERE id = %L::uuid', v_w));
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: apagar um documento anulado devia dar 42501 (deu %).', v_st;
    END IF;
    IF (SELECT count(*) FROM public.pessoas_documentos d WHERE d.id IN (v_s, v_w, v_x)) <> 3 THEN
      RAISE EXCEPTION 'Conferir: nenhum documento de teste devia ter desaparecido.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE NOTICE 'Conferir 20270111810000: prova na nike; permissoes: %; leitura normal: %; conteudo: %; portal: provado pelo envio retirado e pela troca no corpo (rpc_hr_portal_documentos_ler pede sessao do portal, nao foi chamada).',
      v_prova_perm, v_prova_rls, v_prova_conteudo;
    RAISE EXCEPTION 'teste_documentos_ocultar_ok' USING ERRCODE = 'HDO00';
  EXCEPTION
    WHEN SQLSTATE 'HDO00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.pessoas_documentos_ocorrencias o WHERE o.motivo = k_motivo)
     OR EXISTS (SELECT 1 FROM public.pessoas_documentos d WHERE d.titulo LIKE k_titulo || '%')
     OR EXISTS (SELECT 1 FROM public.pessoas_portal_envios e WHERE e.retirado_motivo = k_motivo)
     OR EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                  JOIN public.anew_roles ro ON ro.id = rp.role_id
                 WHERE rp.permission_code IN ('hr.pessoas.documentos.ocultar', 'hr.pessoas.documentos.repor')
                   AND ro.code IS DISTINCT FROM 'super_admin') THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido 20270111810000: permissoes ocultar/repor no catalogo e em todos os super_admin; so finais se ocultam (CHECK); nada se apaga (gatilhos); ocultar/repor/ocultados/historico com 42501, HRA31, HRA37 e HRA38; oculto sai da leitura normal, do conteudo e do portal e volta ao repor (o envio nao); anulado oculta-se e repoe-se; portal sem anulados.';
END;
$conferir$;

DROP FUNCTION pg_temp.e3_ok(uuid, text, text);
DROP FUNCTION pg_temp.e3_erro(uuid, text, text, text);
DROP FUNCTION pg_temp.e3_chamar(uuid, text);
DROP FUNCTION pg_temp.e3_directo(text);
DROP FUNCTION pg_temp.e3_visivel(uuid, uuid);

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): pendentes so
--    20270111800000 e este.
-- 2. Prova na nike ANTES do push: os dois ficheiros, por ordem, numa
--    transaccao terminada por um RAISE EXCEPTION (desfaz tudo).
-- 3. Cliente (E2/E4) publicado no mesmo envio.
-- ==============================================================================
