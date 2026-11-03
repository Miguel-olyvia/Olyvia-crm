-- ==============================================================================
-- 20270104700000_hr_portal_documento_novo_com_ficheiro.sql
--
-- RH, portal do colaborador: "anexar ficheiro novo e enviar a pessoa" passa a
-- ser UMA so transaccao. Hoje o cliente encadeia tres chamadas
-- (rpc_hr_documento_upload_assinado_criar -> validate-upload ->
-- rpc_hr_portal_documento_enviar) e, se a segunda falha, fica na ficha um
-- documento sem ficheiro com o texto fixo "documento anexado directamente".
--
-- Base: RH (uetjghdkwbywbftedtth). NUNCA a principal, NUNCA a Mudelar.
-- Desenho: jobs/bbc4f3a6/tmp/desenho-envio-atomico.md
--
--
-- !!! PRECISA DE CODIGO NOVO -- NAO APLICAR SOZINHA !!! ------------------------
--
--  A RPC nova so e chamada pela Edge NOVA hr-documento-enviar-ficheiro (so no
--  projecto RH). Aplicar sozinha nao parte nada do que existe:
--   - rpc_hr_portal_documento_enviar fica com a mesma assinatura, os mesmos
--     GRANT e o mesmo comportamento, com UMA diferenca: um documento SEM
--     ficheiro cujo corpo e so o texto fixo do upload antigo deixa de poder ir
--     para o portal (HRA38), porque no portal ja nao mostraria nada;
--   - o portal deixa de mostrar "Ver" (tem_conteudo = false) e a RPC do
--     conteudo responde nao_encontrado para esse texto fixo e para corpo NULL;
--     o "Abrir ficheiro" continua igual.
--  Ordem: db push --linked (a partir do worktree rh-pessoas, confirmar
--  supabase/.temp/project-ref = uetjgh...) -> deploy da Edge so no projecto
--  RH -> front (usePortalDocumentosRh.anexarEEnviar passa a um so metodo).
--
--
-- -- O QUE MUDA ------------------------------------------------------------------
--
--  1. pessoas_documentos.corpo_html deixa de ser NOT NULL. NULL quer dizer "o
--     documento e so o ficheiro". CHECK novo: corpo_html OU ficheiro_caminho
--     (nenhuma linha fica sem uma das duas). As linhas existentes tem todas
--     corpo (era NOT NULL), por isso o CHECK valida de imediato.
--  2. hr_documento_corpo_visivel(corpo, modelo_id) (interna): false para NULL,
--     vazio, e para o texto fixo que rpc_hr_documento_upload_assinado_criar
--     grava sem modelo. Os documentos antigos NAO se reescrevem (os que estao
--     no portal ou assinados nem podiam, por trigger); so a leitura do portal
--     os passa a tratar como "sem texto".
--  3. hr_portal_documento_enviar_nucleo(uid, documento, convite, exige)
--     (interna): o corpo de rpc_hr_portal_documento_enviar, lido no repositorio
--     (20270102240000) e conferido por md5 contra o remoto, com o uid como
--     parametro. rpc_hr_portal_documento_enviar passa a ser so auth.uid() + o
--     nucleo. "Tem conteudo" passa a usar a funcao do ponto 2.
--  4. rpc_hr_portal_documento_novo_enviar (SO service_role): cria o documento
--     JA com o ficheiro (caminho, hash, anexado_em/por) em
--     a_aguardar_assinatura, audita e chama o nucleo -- tudo numa transaccao.
--  5. rpc_hr_portal_documentos_ler (tem_conteudo) e
--     rpc_hr_portal_documento_conteudo: mesma assinatura, so a regra do ponto 2.
--     rpc_hr_portal_documento_ficheiro NAO se toca: ja marca visto_em e grava o
--     evento 'visto' (20270102240000:2342-2346), por isso um documento
--     so-ficheiro tem prova de abertura antes da assinatura por SMS.
--  6. rpc_hr_documento_quarentena_dono(caminho) (SO service_role): o dono do
--     objecto na quarentena; a Edge recusa (403, sem apagar) so quando o dono
--     esta preenchido e e outro utilizador. Dono vazio passa.
--  O titulo recusa caracteres de controlo e invisiveis (HRA10). O limite por
--  actor (10 por minuto) fica na Edge, com _shared/rateLimit.ts
--  (rate_limit_attempts); nao ha tabela nova.
--
--  A assinatura por SMS NAO muda: hr_documento_conteudo_sha256(NULL, hash) =
--  sha256('|' || hash), ou seja, num documento so-ficheiro assina-se o hash do
--  ficheiro (conferido abaixo). hr_documento_assinar_nucleo ja aceita corpo
--  NULL com hash preenchido.
--
--
-- -- [CONFIRMAR] ANTES DO PUSH ---------------------------------------------------
--  a) Nenhuma migration local por comitar ou remota sem ficheiro recriou
--     rpc_hr_portal_documento_enviar, _documentos_ler ou _documento_conteudo
--     depois de 20270102240000. A guarda compara o prosrc com o texto desse
--     ficheiro; se divergir, o push para aqui e nada se aplica.
--  b) Quantos documentos antigos com o texto fixo e SEM ficheiro existem (sao
--     os orfaos do encadeamento antigo). Nao se tocam aqui; ficam por decidir.
--  c) Quem no RH le corpo_html (rpc_hr_documento_ver_conteudo e o ecra
--     Documentos da ficha) passa a poder receber NULL nos documentos novos: o
--     hook ja faz `data ?? ""`, mas o botao de ver texto deve esconder-se
--     quando ha so ficheiro.
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo; nenhum novo) -----------------------------
--   42501 insufficient_privilege (nao e service_role; sem utilizador ou
--         organizacao; sem hr.pessoas.documentos.emitir E .edit na organizacao),
--   HRA10 pedido_invalido (tipo, titulo vazio, longo ou com caracteres
--         invisiveis, hash ou caminho invalido; id do documento ja usado),
--   HRA31 nao_encontrado (pessoa fora da organizacao ou apagada; vinculo de
--         outra pessoa; convite de outra pessoa/organizacao -- este pelo nucleo),
--   HRA38 estado_invalido (sem assinatura so declaracao/recibo; convite fora da
--         janela de documentos -- pelo nucleo).
--   Usados no repositorio ate aqui: HRA02-05, 10, 31, 33, 37-39, 41-43, 45,
--   51-53, 56, 61-64 (20270102240000) e 65-74 (20270104500000).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: largar
-- rpc_hr_portal_documento_novo_enviar e rpc_hr_documento_quarentena_dono; repor os tres corpos de 20270102240000;
-- largar o nucleo e hr_documento_corpo_visivel; e SO se nao houver nenhuma
-- linha com corpo_html NULL, largar o CHECK e repor o NOT NULL.
-- ==============================================================================

SET lock_timeout = '5s';

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- Dependencias, com as assinaturas exactas.
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_portal_evento(uuid, uuid, uuid, text, uuid, text, text, uuid, inet, text)') IS NULL
     OR to_regprocedure('public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_pessoa_telemovel(uuid, uuid)') IS NULL
     OR to_regprocedure('public.hr_telemovel_mascarar(text)') IS NULL
     OR to_regprocedure('public.hr_documento_conteudo_sha256(text, text)') IS NULL
     OR to_regprocedure('public.hr_convite_sessao_exigir_documentos(text, text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta uma das funcoes de apoio (has_anew_permission_in_org, hr_portal_evento, hr_registar_acesso_sensivel de 5 args, hr_pessoa_telemovel, hr_telemovel_mascarar, hr_documento_conteudo_sha256, hr_convite_sessao_exigir_documentos).';
  END IF;
  -- Primeiro so to_regprocedure (devolve NULL); os ::regprocedure vem depois, em
  -- instrucoes separadas, para uma ausencia dar a mensagem da guarda e nao um erro de sistema.
  IF to_regprocedure('public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean)') IS NULL
     OR to_regprocedure('public.rpc_hr_portal_documentos_ler(text, text)') IS NULL
     OR to_regprocedure('public.rpc_hr_portal_documento_conteudo(text, text, uuid)') IS NULL
     OR to_regprocedure('public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta rpc_hr_portal_documento_enviar(uuid, uuid, boolean), rpc_hr_portal_documentos_ler(text, text), rpc_hr_portal_documento_conteudo(text, text, uuid) ou rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text).';
  END IF;
  IF pg_get_function_result(to_regprocedure('public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean)')) IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_portal_documento_enviar(uuid, uuid, boolean) ja nao devolve uuid.';
  END IF;

  -- O dono do objecto da quarentena (rpc_hr_documento_quarentena_dono) e a
  -- escolha do utilizador da prova viva (membros activos da nike).
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('storage.objects') AND NOT a.attisdropped
     AND a.attname::text IN ('bucket_id', 'name', 'owner', 'owner_id');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Guarda: storage.objects nao tem bucket_id, name, owner e owner_id (encontradas % de 4).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.anew_memberships') AND NOT a.attisdropped
     AND a.attname::text IN ('user_id', 'organization_id', 'status');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: anew_memberships nao tem user_id, organization_id e status (encontradas % de 3).', v_n;
  END IF;

  -- Nada do que esta migration cria pode ja existir.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public'
     AND p.proname::text IN ('hr_documento_corpo_visivel', 'hr_portal_documento_enviar_nucleo',
                             'rpc_hr_portal_documento_novo_enviar', 'rpc_hr_documento_quarentena_dono');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ja existem % funcao(oes) com nomes desta migration. Investigar.', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint c
              WHERE c.conrelid = 'public.pessoas_documentos'::regclass
                AND c.conname::text = 'pessoas_documentos_corpo_ou_ficheiro') THEN
    RAISE EXCEPTION 'Guarda: pessoas_documentos_corpo_ou_ficheiro ja existe.';
  END IF;

  -- corpo_html e HOJE NOT NULL (20261207005900); se ja nao for, alguem mexeu.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = 'public.pessoas_documentos'::regclass
                    AND a.attname::text = 'corpo_html' AND NOT a.attisdropped AND a.attnotnull) THEN
    RAISE EXCEPTION 'Guarda: pessoas_documentos.corpo_html ja nao e NOT NULL. Investigar antes de aplicar.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = 'public.pessoas_documentos'::regclass AND NOT a.attisdropped
     AND a.attname::text IN ('ficheiro_caminho', 'ficheiro_hash_sha256', 'ficheiro_anexado_em',
                             'ficheiro_anexado_por', 'entregue_em', 'modelo_id', 'vinculo_id', 'emitido_em',
                             'emitido_por', 'created_by', 'updated_by', 'deleted_at');
  IF v_n <> 12 THEN
    RAISE EXCEPTION 'Guarda: pessoas_documentos nao tem as 12 colunas esperadas (encontradas %).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = 'public.pessoas'::regclass
                    AND a.attname::text = 'deleted_at' AND NOT a.attisdropped)
     OR to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta pessoas.deleted_at ou pessoas_vinculos.';
  END IF;

  -- As permissoes reutilizadas existem (nenhuma nova).
  SELECT count(DISTINCT code) INTO v_n FROM public.anew_permissions
   WHERE code IN ('hr.pessoas.documentos.emitir', 'hr.pessoas.documentos.edit');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Guarda: faltam permissoes no catalogo (encontradas % de 2).', v_n;
  END IF;

  -- O dono das funcoes tem de passar a RLS (pessoas_portal_* tem FORCE).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'Guarda: o papel que aplica (%) nao tem BYPASSRLS.', current_user::text;
  END IF;

  -- [CONFIRMAR a] Os tres corpos que se recriam sao EXACTAMENTE os de
  -- 20270102240000 (prosrc sem os \r, para valer com CRLF ou LF).
  IF md5(replace((SELECT p.prosrc FROM pg_proc p
                   WHERE p.oid = 'public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean)'::regprocedure), E'\r', ''))
     <> md5(replace($esperado$
DECLARE
  v_uid    uuid := auth.uid();
  v_doc    record;
  v_estado text;
  v_ate    timestamptz;
  v_c_pessoa uuid;
  v_c_org    uuid;
  v_envio  uuid;
  v_anew   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- A mesma ordem de locks do portal: convite -> envio -> documento.
  IF p_convite_id IS NOT NULL THEN
    SELECT c.estado, c.portal_documentos_ate, c.pessoa_id, c.organization_id
      INTO v_estado, v_ate, v_c_pessoa, v_c_org
      FROM public.pessoas_convites_admissao c
     WHERE c.id = p_convite_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
    END IF;
  END IF;

  SELECT d.id, d.organization_id, d.pessoa_id, d.estado, d.tipo, d.corpo_html IS NOT NULL AS tem_corpo,
         d.ficheiro_caminho IS NOT NULL AS tem_ficheiro
    INTO v_doc
    FROM public.pessoas_documentos d
   WHERE d.id = p_documento_id AND d.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.emitir', v_doc.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  -- Um documento que exige assinatura nunca passa a entregue sem ela. So uma
  -- declaracao ou um recibo a aguardar assinatura podem ser entregues sem assinar;
  -- contrato, adenda e outro, a aguardar assinatura, so saem assinados.
  IF p_exige_assinatura IS NULL OR v_doc.estado IN ('rascunho', 'anulado')
     OR (p_exige_assinatura AND v_doc.estado <> 'a_aguardar_assinatura')
     OR (NOT p_exige_assinatura AND v_doc.estado = 'a_aguardar_assinatura'
         AND v_doc.tipo NOT IN ('declaracao', 'recibo'))
     OR NOT (v_doc.tem_corpo OR v_doc.tem_ficheiro) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_portal_envios e
              WHERE e.documento_id = v_doc.id AND e.retirado_em IS NULL) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  IF p_convite_id IS NOT NULL THEN
    -- O convite (ja trancado acima) tem de ser da mesma pessoa e organizacao.
    IF v_c_pessoa IS DISTINCT FROM v_doc.pessoa_id OR v_c_org IS DISTINCT FROM v_doc.organization_id THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
    END IF;
    -- So os estados em que a janela de documentos existe; fora deles e erro, nao um envio sem janela.
    IF v_estado NOT IN ('aprovada', 'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao') THEN
      RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
    END IF;
  END IF;

  -- Sem assinatura: o documento fica entregue (final, imutavel).
  IF NOT p_exige_assinatura AND v_doc.estado = 'a_aguardar_assinatura' THEN
    SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;
    UPDATE public.pessoas_documentos
       SET estado = 'entregue', entregue_em = now(), updated_by = coalesce(v_anew, updated_by)
     WHERE id = v_doc.id;
    PERFORM public.hr_portal_evento(v_doc.organization_id, v_doc.pessoa_id, p_convite_id, 'documento', v_doc.id,
                                    'entregue', 'rh', v_uid);
  END IF;

  INSERT INTO public.pessoas_portal_envios
    (organization_id, pessoa_id, documento_id, convite_id, exige_assinatura, enviado_por)
  VALUES
    (v_doc.organization_id, v_doc.pessoa_id, v_doc.id, p_convite_id, p_exige_assinatura, v_uid)
  RETURNING id INTO v_envio;

  -- Com processo: abre a janela de documentos (14 dias, sem encurtar; attempts a
  -- zero) e, se for para assinar, avanca.
  IF p_convite_id IS NOT NULL THEN
    IF v_estado IN ('aprovada', 'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao') THEN
      UPDATE public.pessoas_convites_admissao
         SET portal_documentos_ate = greatest(coalesce(v_ate, now()), now() + interval '14 days'),
             attempts = 0,
             estado = CASE WHEN p_exige_assinatura AND v_estado IN ('aprovada', 'assinaturas_concluidas')
                           THEN 'a_aguardar_assinaturas' ELSE v_estado END
       WHERE id = p_convite_id;
      IF p_exige_assinatura AND v_estado IN ('aprovada', 'assinaturas_concluidas') THEN
        INSERT INTO public.pessoas_convites_admissao_eventos
          (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
        VALUES
          (p_convite_id, v_doc.organization_id, 'contrato_disponibilizado', 'rh', v_uid, v_estado,
           'a_aguardar_assinaturas', jsonb_build_object('documento_id', v_doc.id::text));
      END IF;
    END IF;
  END IF;

  PERFORM public.hr_portal_evento(v_doc.organization_id, v_doc.pessoa_id, p_convite_id, 'envio', v_envio,
                                  'enviado', 'rh', v_uid);
  RETURN v_envio;
END;
$esperado$, E'\r', '')) THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_portal_documento_enviar mudou desde 20270102240000. Rever esta migration antes de a aplicar.';
  END IF;

  IF md5(replace((SELECT p.prosrc FROM pg_proc p
                   WHERE p.oid = 'public.rpc_hr_portal_documentos_ler(text, text)'::regprocedure), E'\r', ''))
     <> md5(replace($esperado$
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
           'tem_conteudo',     d.corpo_html IS NOT NULL,
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
$esperado$, E'\r', '')) THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_portal_documentos_ler mudou desde 20270102240000. Rever esta migration antes de a aplicar.';
  END IF;

  IF md5(replace((SELECT p.prosrc FROM pg_proc p
                   WHERE p.oid = 'public.rpc_hr_portal_documento_conteudo(text, text, uuid)'::regprocedure), E'\r', ''))
     <> md5(replace($esperado$
DECLARE
  v_s     record;
  v_e     record;
  v_corpo text;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT e.id, e.documento_id, e.visto_em INTO v_e
    FROM public.pessoas_portal_envios e
   WHERE e.id = p_envio_id AND e.pessoa_id = v_s.pessoa_id AND e.organization_id = v_s.organization_id
     AND e.retirado_em IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  SELECT d.corpo_html INTO v_corpo
    FROM public.pessoas_documentos d
   WHERE d.id = v_e.documento_id AND d.deleted_at IS NULL
     -- Nunca o conteudo de um rascunho nem de um documento anulado.
     AND d.estado IN ('a_aguardar_assinatura', 'assinado', 'entregue');
  IF v_corpo IS NULL THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_e.visto_em IS NULL THEN
    UPDATE public.pessoas_portal_envios SET visto_em = now() WHERE id = v_e.id;
    PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'envio', v_e.id,
                                    'visto', 'pessoa', NULL);
  END IF;
  RETURN v_corpo;
END;
$esperado$, E'\r', '')) THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_portal_documento_conteudo mudou desde 20270102240000. Rever esta migration antes de a aplicar.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. corpo_html passa a poder ser NULL ("so ficheiro"), nunca sem as duas coisas
-- ==============================================================================
-- Primeiro o CHECK (valida ja: todas as linhas tem corpo), depois o NOT NULL sai.
ALTER TABLE public.pessoas_documentos
  ADD CONSTRAINT pessoas_documentos_corpo_ou_ficheiro
  CHECK (corpo_html IS NOT NULL OR ficheiro_caminho IS NOT NULL);
ALTER TABLE public.pessoas_documentos ALTER COLUMN corpo_html DROP NOT NULL;

COMMENT ON CONSTRAINT pessoas_documentos_corpo_ou_ficheiro ON public.pessoas_documentos IS
'Um documento tem texto, ficheiro ou os dois; nunca nenhum. corpo_html NULL = documento so-ficheiro (rpc_hr_portal_documento_novo_enviar). Desde 20270104700000.';
COMMENT ON COLUMN public.pessoas_documentos.corpo_html IS
'Conteudo do documento, copiado do modelo no momento da emissao. NULL desde 20270104700000 quando o documento e so o ficheiro anexado (nunca com ficheiro_caminho tambem NULL: CHECK pessoas_documentos_corpo_ou_ficheiro). Fechado por GRANT de coluna: authenticated nao tem SELECT. So sai por rpc_hr_documento_ver_conteudo (RH) ou rpc_hr_portal_documento_conteudo (portal).';

-- ==============================================================================
-- 2. O texto que o portal mostra (interna)
-- ==============================================================================
-- false para NULL, vazio, e para o texto fixo que rpc_hr_documento_upload_assinado_criar
-- (20261207014900) grava sem modelo. Esse texto fica nas linhas antigas (e no
-- SHA-256 de alguma assinatura feita sobre elas); so deixa de se mostrar.
CREATE FUNCTION public.hr_documento_corpo_visivel(p_corpo_html text, p_modelo_id uuid)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(btrim(p_corpo_html) <> ''
                  AND NOT (p_modelo_id IS NULL
                           AND p_corpo_html = E'— documento anexado directamente, sem modelo; ver ficheiro anexo —'),
                  false)
$$;
REVOKE ALL ON FUNCTION public.hr_documento_corpo_visivel(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.hr_documento_corpo_visivel(text, uuid) IS
'INTERNA. O documento tem texto para mostrar no portal: corpo nao nulo nem vazio, e nao o texto fixo do upload sem modelo (20261207014900). Desde 20270104700000.';

-- ==============================================================================
-- 3. O envio ao portal, com o actor como parametro (interna)
-- ==============================================================================
-- Copia de rpc_hr_portal_documento_enviar (20270102240000, conferida acima) com
-- v_uid := p_uid e "tem corpo" pela hr_documento_corpo_visivel. Quem chama TEM
-- de ter confirmado o actor (auth.uid() ou service_role com o uid revalidado).
CREATE FUNCTION public.hr_portal_documento_enviar_nucleo(
  p_uid uuid, p_documento_id uuid, p_convite_id uuid, p_exige_assinatura boolean)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := p_uid;
  v_doc    record;
  v_estado text;
  v_ate    timestamptz;
  v_c_pessoa uuid;
  v_c_org    uuid;
  v_envio  uuid;
  v_anew   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- A mesma ordem de locks do portal: convite -> envio -> documento.
  IF p_convite_id IS NOT NULL THEN
    SELECT c.estado, c.portal_documentos_ate, c.pessoa_id, c.organization_id
      INTO v_estado, v_ate, v_c_pessoa, v_c_org
      FROM public.pessoas_convites_admissao c
     WHERE c.id = p_convite_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
    END IF;
  END IF;

  SELECT d.id, d.organization_id, d.pessoa_id, d.estado, d.tipo,
         public.hr_documento_corpo_visivel(d.corpo_html, d.modelo_id) AS tem_corpo,
         d.ficheiro_caminho IS NOT NULL AS tem_ficheiro
    INTO v_doc
    FROM public.pessoas_documentos d
   WHERE d.id = p_documento_id AND d.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.emitir', v_doc.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  -- Um documento que exige assinatura nunca passa a entregue sem ela. So uma
  -- declaracao ou um recibo a aguardar assinatura podem ser entregues sem assinar;
  -- contrato, adenda e outro, a aguardar assinatura, so saem assinados.
  -- Sem texto visivel e sem ficheiro (o texto fixo do upload antigo sem anexo)
  -- nao ha nada para a pessoa ver: recusado.
  IF p_exige_assinatura IS NULL OR v_doc.estado IN ('rascunho', 'anulado')
     OR (p_exige_assinatura AND v_doc.estado <> 'a_aguardar_assinatura')
     OR (NOT p_exige_assinatura AND v_doc.estado = 'a_aguardar_assinatura'
         AND v_doc.tipo NOT IN ('declaracao', 'recibo'))
     OR NOT (v_doc.tem_corpo OR v_doc.tem_ficheiro) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_portal_envios e
              WHERE e.documento_id = v_doc.id AND e.retirado_em IS NULL) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  IF p_convite_id IS NOT NULL THEN
    -- O convite (ja trancado acima) tem de ser da mesma pessoa e organizacao.
    IF v_c_pessoa IS DISTINCT FROM v_doc.pessoa_id OR v_c_org IS DISTINCT FROM v_doc.organization_id THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
    END IF;
    -- So os estados em que a janela de documentos existe; fora deles e erro, nao um envio sem janela.
    IF v_estado NOT IN ('aprovada', 'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao') THEN
      RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
    END IF;
  END IF;

  -- Sem assinatura: o documento fica entregue (final, imutavel).
  IF NOT p_exige_assinatura AND v_doc.estado = 'a_aguardar_assinatura' THEN
    SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;
    UPDATE public.pessoas_documentos
       SET estado = 'entregue', entregue_em = now(), updated_by = coalesce(v_anew, updated_by)
     WHERE id = v_doc.id;
    PERFORM public.hr_portal_evento(v_doc.organization_id, v_doc.pessoa_id, p_convite_id, 'documento', v_doc.id,
                                    'entregue', 'rh', v_uid);
  END IF;

  INSERT INTO public.pessoas_portal_envios
    (organization_id, pessoa_id, documento_id, convite_id, exige_assinatura, enviado_por)
  VALUES
    (v_doc.organization_id, v_doc.pessoa_id, v_doc.id, p_convite_id, p_exige_assinatura, v_uid)
  RETURNING id INTO v_envio;

  -- Com processo: abre a janela de documentos (14 dias, sem encurtar; attempts a
  -- zero) e, se for para assinar, avanca.
  IF p_convite_id IS NOT NULL THEN
    IF v_estado IN ('aprovada', 'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao') THEN
      UPDATE public.pessoas_convites_admissao
         SET portal_documentos_ate = greatest(coalesce(v_ate, now()), now() + interval '14 days'),
             attempts = 0,
             estado = CASE WHEN p_exige_assinatura AND v_estado IN ('aprovada', 'assinaturas_concluidas')
                           THEN 'a_aguardar_assinaturas' ELSE v_estado END
       WHERE id = p_convite_id;
      IF p_exige_assinatura AND v_estado IN ('aprovada', 'assinaturas_concluidas') THEN
        INSERT INTO public.pessoas_convites_admissao_eventos
          (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
        VALUES
          (p_convite_id, v_doc.organization_id, 'contrato_disponibilizado', 'rh', v_uid, v_estado,
           'a_aguardar_assinaturas', jsonb_build_object('documento_id', v_doc.id::text));
      END IF;
    END IF;
  END IF;

  PERFORM public.hr_portal_evento(v_doc.organization_id, v_doc.pessoa_id, p_convite_id, 'envio', v_envio,
                                  'enviado', 'rh', v_uid);
  RETURN v_envio;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_portal_documento_enviar_nucleo(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.hr_portal_documento_enviar_nucleo(uuid, uuid, uuid, boolean) IS
'INTERNA. Poe no portal um documento que ja existe, em nome de p_uid (que quem chama ja confirmou): mesma logica de rpc_hr_portal_documento_enviar de 20270102240000 (hr.pessoas.documentos.emitir; sem assinatura so declaracao/recibo e fica entregue; convite da mesma pessoa e organizacao, na janela de documentos; abre a janela 14 dias). Recusa o documento sem texto visivel e sem ficheiro (HRA38). Desde 20270104700000.';

-- A RPC do RH fica so com a sessao + o nucleo. Mesma assinatura, mesmos GRANT
-- (CREATE OR REPLACE mantem-nos; o bloco de conferir confirma-os).
CREATE OR REPLACE FUNCTION public.rpc_hr_portal_documento_enviar(
  p_documento_id uuid, p_convite_id uuid DEFAULT NULL, p_exige_assinatura boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  RETURN public.hr_portal_documento_enviar_nucleo(v_uid, p_documento_id, p_convite_id, p_exige_assinatura);
END;
$$;

-- ==============================================================================
-- 4. Criar o documento JA com o ficheiro e envia-lo, numa transaccao (service_role)
-- ==============================================================================
-- Chamada SO pela Edge hr-documento-enviar-ficheiro, depois de ela ter copiado o
-- ficheiro da quarentena para hr-documentos (sem upsert) e calculado o SHA-256.
-- O actor e a organizacao vem da Edge e revalidam-se aqui, antes de ler
-- qualquer linha. O id do documento e gerado pelo cliente (a 3.a pasta do
-- caminho da quarentena, imposto pela politica de 20261207012900).
CREATE FUNCTION public.rpc_hr_portal_documento_novo_enviar(
  p_auth_uid             uuid,
  p_organization_id      uuid,
  p_pessoa_id            uuid,
  p_documento_id         uuid,
  p_tipo                 text,
  p_titulo               text,
  p_ficheiro_caminho     text,
  p_ficheiro_hash_sha256 text,
  p_exige_assinatura     boolean,
  p_convite_id           uuid DEFAULT NULL,
  p_vinculo_id           uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_tipos   constant text[] := ARRAY['contrato', 'adenda', 'declaracao', 'recibo', 'outro'];
  v_role    text;
  v_titulo  text := btrim(p_titulo);
  v_prefixo text;
  v_anew    uuid;
  v_envio   uuid;
  v_estado  text;
  v_tel     text;
BEGIN
  -- 1. So a Edge (service_role) chama isto: o uid vem dela, nunca de um
  --    cliente. O GRANT ja so e a service_role; isto e o cinto e suspensorios
  --    (o mesmo de rpc_hr_documento_anexar_ficheiro).
  BEGIN
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION WHEN invalid_text_representation THEN
    v_role := NULL;
  END;
  IF v_role IS DISTINCT FROM 'service_role' OR p_auth_uid IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 2. As duas permissoes na organizacao pedida, antes de ler o que quer que seja:
  --    criar/enviar (.emitir) e anexar ficheiro (.edit, a de rpc_hr_documento_anexar_ficheiro).
  IF NOT public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.documentos.emitir', p_organization_id)
     OR NOT public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.documentos.edit', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 3. A pessoa e desta organizacao e nao esta apagada.
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- 4. Os dados do documento.
  IF p_documento_id IS NULL OR p_tipo IS NULL OR NOT (p_tipo = ANY (c_tipos))
     OR v_titulo IS NULL OR length(v_titulo) < 1 OR length(v_titulo) > 200
     -- Sem caracteres de controlo nem invisiveis (C0, DEL, C1, larguras zero,
     -- marcas e isolamentos de direccao, BOM): o titulo aparece no portal.
     OR p_titulo ~ '[\x01-\x1f\x7f-\x9f\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]'
     OR p_exige_assinatura IS NULL
     OR p_ficheiro_hash_sha256 IS NULL OR p_ficheiro_hash_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  -- A regra de rpc_hr_portal_documento_enviar, antes de criar seja o que for.
  IF NOT p_exige_assinatura AND p_tipo NOT IN ('declaracao', 'recibo') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  -- O caminho e o desta organizacao/pessoa/documento, com o nome que a politica
  -- da quarentena impoe (uuid minusculo + extensao); a forma inteira, nao o prefixo.
  v_prefixo := p_organization_id::text || '/' || p_pessoa_id::text || '/' || p_documento_id::text || '/';
  IF p_ficheiro_caminho IS NULL
     OR p_ficheiro_caminho !~ ('^' || v_prefixo
                               || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png)$') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF p_vinculo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_vinculos v
        WHERE v.id = p_vinculo_id AND v.pessoa_id = p_pessoa_id AND v.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  -- O id e do cliente: um id ja usado (por esta ou outra organizacao) e recusado.
  IF EXISTS (SELECT 1 FROM public.pessoas_documentos d WHERE d.id = p_documento_id) THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = p_auth_uid LIMIT 1;

  -- 5. O documento nasce com o ficheiro: nunca existe uma linha sem ele.
  BEGIN
    INSERT INTO public.pessoas_documentos (
      id, pessoa_id, organization_id, vinculo_id, modelo_id,
      tipo, titulo, corpo_html,
      ficheiro_caminho, ficheiro_hash_sha256, ficheiro_anexado_em, ficheiro_anexado_por,
      estado, emitido_em, emitido_por,
      created_by, updated_by
    ) VALUES (
      p_documento_id, p_pessoa_id, p_organization_id, p_vinculo_id, NULL,
      p_tipo, v_titulo, NULL,
      p_ficheiro_caminho, p_ficheiro_hash_sha256, now(), v_anew,
      'a_aguardar_assinatura', now(), v_anew,
      v_anew, v_anew
    );
  EXCEPTION WHEN unique_violation THEN
    -- Dois pedidos com o mesmo id ao mesmo tempo: o segundo perde.
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END;

  -- 6. Auditoria: a mesma de anexar ficheiro (documento/alterar), com quem fez.
  PERFORM public.hr_registar_acesso_sensivel(p_pessoa_id, p_organization_id, 'documento', 'alterar', p_auth_uid);

  -- 7. O envio: a MESMA logica da RPC do RH (convite, janela, entregue, eventos).
  v_envio := public.hr_portal_documento_enviar_nucleo(p_auth_uid, p_documento_id, p_convite_id, p_exige_assinatura);

  SELECT d.estado INTO v_estado FROM public.pessoas_documentos d WHERE d.id = p_documento_id;
  IF p_exige_assinatura THEN
    v_tel := public.hr_pessoa_telemovel(p_pessoa_id, p_organization_id);
  END IF;

  -- tem_telemovel = false: o RH ve o aviso; a pessoa nao vai conseguir pedir o codigo SMS.
  RETURN jsonb_build_object(
    'documento_id',        p_documento_id,
    'envio_id',            v_envio,
    'estado',              v_estado,
    'tem_telemovel',       CASE WHEN p_exige_assinatura THEN v_tel IS NOT NULL END,
    'telemovel_mascarado', CASE WHEN p_exige_assinatura THEN public.hr_telemovel_mascarar(v_tel) END);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documento_novo_enviar(uuid, uuid, uuid, uuid, text, text, text, text, boolean, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documento_novo_enviar(uuid, uuid, uuid, uuid, text, text, text, text, boolean, uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.rpc_hr_portal_documento_novo_enviar(uuid, uuid, uuid, uuid, text, text, text, text, boolean, uuid, uuid) IS
'SO service_role (Edge hr-documento-enviar-ficheiro). Numa transaccao: cria o documento so-ficheiro (corpo_html NULL, ficheiro_caminho, hash, anexado_em/por) em a_aguardar_assinatura e poe-no no portal pelo hr_portal_documento_enviar_nucleo (sem assinatura: so declaracao/recibo, fica entregue). Revalida o actor e a organizacao: hr.pessoas.documentos.emitir E .edit (42501), pessoa da organizacao e nao apagada (HRA31), vinculo da pessoa (HRA31), caminho <org>/<pessoa>/<documento>/<uuid>.<ext> e hash hex (HRA10), id novo (HRA10). Audita documento/alterar com o uid. Devolve {documento_id, envio_id, estado, tem_telemovel, telemovel_mascarado}. Desde 20270104700000.';

-- Quem subiu o objecto da quarentena (storage.objects nao esta exposto ao
-- PostgREST). NULL = o objecto nao existe; {"dono": null} = existe sem dono
-- preenchido (lido no remoto: os objectos copiados pela Edge tem owner_id NULL,
-- e nao ha prova do que o Storage preenche num upload do utilizador). A Edge so
-- recusa quando o dono ESTA preenchido e e outro; sem dono passa (o caminho ja
-- esta preso a organizacao/pessoa/documento do pedido).
CREATE FUNCTION public.rpc_hr_documento_quarentena_dono(p_caminho text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('dono', coalesce(nullif(o.owner_id, ''), o.owner::text))
    FROM storage.objects o
   WHERE o.bucket_id = 'hr-documentos-quarantine' AND o.name = p_caminho
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_quarentena_dono(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_quarentena_dono(text) TO service_role;
COMMENT ON FUNCTION public.rpc_hr_documento_quarentena_dono(text) IS
'SO service_role (Edge hr-documento-enviar-ficheiro). {"dono": <auth uid em texto ou null>} do objecto em hr-documentos-quarantine com este caminho, ou NULL se o objecto nao existe. Dono vazio nao e recusa: a Edge so recusa um dono preenchido e diferente de quem chama. Nunca devolve o conteudo. Desde 20270104700000.';

-- ==============================================================================
-- 5. O portal deixa de mostrar o texto de um documento so-ficheiro
-- ==============================================================================
-- Mesma assinatura e GRANT; so tem_conteudo muda (era corpo_html IS NOT NULL).
CREATE OR REPLACE FUNCTION public.rpc_hr_portal_documentos_ler(p_token_hash text, p_sessao_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- Mesma assinatura e GRANT; o texto fixo e o corpo NULL dao nao_encontrado.
CREATE OR REPLACE FUNCTION public.rpc_hr_portal_documento_conteudo(p_token_hash text, p_sessao_hash text, p_envio_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s      record;
  v_e      record;
  v_corpo  text;
  v_modelo uuid;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT e.id, e.documento_id, e.visto_em INTO v_e
    FROM public.pessoas_portal_envios e
   WHERE e.id = p_envio_id AND e.pessoa_id = v_s.pessoa_id AND e.organization_id = v_s.organization_id
     AND e.retirado_em IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  SELECT d.corpo_html, d.modelo_id INTO v_corpo, v_modelo
    FROM public.pessoas_documentos d
   WHERE d.id = v_e.documento_id AND d.deleted_at IS NULL
     -- Nunca o conteudo de um rascunho nem de um documento anulado.
     AND d.estado IN ('a_aguardar_assinatura', 'assinado', 'entregue');
  -- Sem linha, sem texto, ou so o texto fixo do upload sem modelo: nada a mostrar.
  IF NOT public.hr_documento_corpo_visivel(v_corpo, v_modelo) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_e.visto_em IS NULL THEN
    UPDATE public.pessoas_portal_envios SET visto_em = now() WHERE id = v_e.id;
    PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'envio', v_e.id,
                                    'visto', 'pessoa', NULL);
  END IF;
  RETURN v_corpo;
END;
$$;

-- ==============================================================================
-- 6. Conferir: falha o push se o resultado nao for o esperado
-- ==============================================================================
DO $conferir$
DECLARE
  v_fn text;
  v_marcador constant text := E'— documento anexado directamente, sem modelo; ver ficheiro anexo —';
  v_hash constant text := repeat('a', 64);
BEGIN
  -- 1. corpo_html pode ser NULL, e o CHECK novo esta validado.
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = 'public.pessoas_documentos'::regclass
                AND a.attname::text = 'corpo_html' AND a.attnotnull) THEN
    RAISE EXCEPTION 'Conferir: corpo_html continua NOT NULL.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = 'public.pessoas_documentos'::regclass
                    AND c.conname::text = 'pessoas_documentos_corpo_ou_ficheiro'
                    AND c.contype::text = 'c' AND c.convalidated) THEN
    RAISE EXCEPTION 'Conferir: pessoas_documentos_corpo_ou_ficheiro nao existe ou nao esta validado.';
  END IF;
  -- corpo_html continua fechado a authenticated.
  IF has_column_privilege('authenticated', 'public.pessoas_documentos', 'corpo_html', 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: corpo_html ficou legivel por authenticated.';
  END IF;

  -- 2. EXECUTE efectivo.
  FOREACH v_fn IN ARRAY ARRAY['public.rpc_hr_portal_documento_novo_enviar(uuid, uuid, uuid, uuid, text, text, text, text, boolean, uuid, uuid)',
                              'public.rpc_hr_documento_quarentena_dono(text)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % devia ser so de service_role.', v_fn;
    END IF;
  END LOOP;
  IF public.rpc_hr_documento_quarentena_dono('00000000-0000-0000-0000-000000000000/nao/existe.pdf') IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_documento_quarentena_dono devolveu dono para um objecto que nao existe.';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY['public.hr_documento_corpo_visivel(text, uuid)',
                              'public.hr_portal_documento_enviar_nucleo(uuid, uuid, uuid, boolean)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % tem EXECUTE para alguem.', v_fn;
    END IF;
  END LOOP;
  v_fn := 'public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean)';
  IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('service_role', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_portal_documento_enviar devia continuar so de authenticated.';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY['public.rpc_hr_portal_documentos_ler(text, text)',
                              'public.rpc_hr_portal_documento_conteudo(text, text, uuid)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % devia continuar so de service_role.', v_fn;
    END IF;
  END LOOP;

  -- 3. search_path vazio nas sete funcoes que esta migration cria ou recria.
  IF EXISTS (SELECT 1 FROM pg_proc p
              WHERE p.oid IN ('public.hr_documento_corpo_visivel(text, uuid)'::regprocedure,
                              'public.rpc_hr_documento_quarentena_dono(text)'::regprocedure,
                              'public.hr_portal_documento_enviar_nucleo(uuid, uuid, uuid, boolean)'::regprocedure,
                              'public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean)'::regprocedure,
                              'public.rpc_hr_portal_documento_novo_enviar(uuid, uuid, uuid, uuid, text, text, text, text, boolean, uuid, uuid)'::regprocedure,
                              'public.rpc_hr_portal_documentos_ler(text, text)'::regprocedure,
                              'public.rpc_hr_portal_documento_conteudo(text, text, uuid)'::regprocedure)
                AND NOT (coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""'])) THEN
    RAISE EXCEPTION 'Conferir: uma funcao desta migration nao tem search_path vazio.';
  END IF;

  -- 4. O texto visivel, com valores fixos.
  IF public.hr_documento_corpo_visivel(NULL, NULL)
     OR public.hr_documento_corpo_visivel('   ', NULL)
     OR public.hr_documento_corpo_visivel(v_marcador, NULL)
     OR NOT public.hr_documento_corpo_visivel(v_marcador, gen_random_uuid())
     OR NOT public.hr_documento_corpo_visivel('<p>Contrato</p>', NULL) THEN
    RAISE EXCEPTION 'Conferir: hr_documento_corpo_visivel nao da os valores esperados.';
  END IF;
  -- O texto fixo e o que rpc_hr_documento_upload_assinado_criar grava hoje.
  IF position(v_marcador IN (SELECT p.prosrc FROM pg_proc p
                              WHERE p.oid = 'public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Conferir: o texto fixo de rpc_hr_documento_upload_assinado_criar nao e o que hr_documento_corpo_visivel esconde.';
  END IF;

  -- 5. Num documento so-ficheiro, o SMS assina o hash do ficheiro.
  IF public.hr_documento_conteudo_sha256(NULL, v_hash)
     IS DISTINCT FROM encode(sha256(convert_to('|' || v_hash, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Conferir: o SHA-256 de um documento so-ficheiro nao e sha256(''|'' || hash).';
  END IF;

  -- 6. Ao vivo na nike, numa pessoa que la existe, tudo desfeito no fim (HR900).
  DECLARE
    v_org     constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
    v_uid     uuid;
    v_pessoa  uuid;
    v_doc1    uuid := gen_random_uuid();
    v_doc2    uuid := gen_random_uuid();
    v_doc3    uuid := gen_random_uuid();
    v_r       jsonb;
    v_d       record;
    v_n       integer;
    v_recusou boolean;
  BEGIN
    -- Parte dos membros activos da nike (poucos), nao de auth.users inteiro.
    SELECT m.uid INTO v_uid
      FROM (SELECT DISTINCT au.auth_user_id AS uid
              FROM public.anew_memberships ms
              JOIN public.anew_users au ON au.id = ms.user_id
             WHERE ms.organization_id = v_org AND ms.status = 'active' AND au.auth_user_id IS NOT NULL) m
     WHERE public.has_anew_permission_in_org(m.uid, 'hr.pessoas.documentos.emitir', v_org)
       AND public.has_anew_permission_in_org(m.uid, 'hr.pessoas.documentos.edit', v_org)
     LIMIT 1;
    SELECT p.id INTO v_pessoa
      FROM public.pessoas p
     WHERE p.organization_id = v_org AND p.deleted_at IS NULL
     LIMIT 1;

    -- Sem prova viva nao se aplica: a falta de utilizador ou de pessoa na nike para o push.
    IF v_uid IS NULL OR v_pessoa IS NULL THEN
      RAISE EXCEPTION 'Conferir: a prova viva precisa, na nike, de um membro activo com hr.pessoas.documentos.emitir e .edit e de uma pessoa nao apagada (utilizador encontrado: %, pessoa encontrada: %).',
        (v_uid IS NOT NULL), (v_pessoa IS NOT NULL) USING ERRCODE = 'HR920';
    ELSE
      -- 6.1 Fora de service_role: recusado.
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      v_recusou := false;
      BEGIN
        PERFORM public.rpc_hr_portal_documento_novo_enviar(
          v_uid, v_org, v_pessoa, v_doc1, 'declaracao', 'Teste 20270104700000',
          v_org::text || '/' || v_pessoa::text || '/' || v_doc1::text || '/' || gen_random_uuid()::text || '.pdf',
          v_hash, false);
      EXCEPTION WHEN SQLSTATE '42501' THEN
        v_recusou := true;
      END;
      IF NOT v_recusou THEN
        RAISE EXCEPTION 'Conferir: a RPC nova aceitou um chamador que nao e service_role.' USING ERRCODE = 'HR921';
      END IF;

      PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

      -- 6.1b Titulo com caractere invisivel (espaco de largura zero): HRA10.
      v_recusou := false;
      BEGIN
        PERFORM public.rpc_hr_portal_documento_novo_enviar(
          v_uid, v_org, v_pessoa, v_doc1, 'declaracao', E'Teste\u200B 20270104700000',
          v_org::text || '/' || v_pessoa::text || '/' || v_doc1::text || '/' || gen_random_uuid()::text || '.pdf',
          v_hash, false);
      EXCEPTION WHEN SQLSTATE 'HRA10' THEN
        v_recusou := true;
      END;
      IF NOT v_recusou THEN
        RAISE EXCEPTION 'Conferir: um titulo com caractere invisivel nao foi recusado.' USING ERRCODE = 'HR928';
      END IF;

      PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

      -- 6.2 Declaracao sem assinatura: nasce com ficheiro e fica entregue, no portal.
      v_r := public.rpc_hr_portal_documento_novo_enviar(
        v_uid, v_org, v_pessoa, v_doc1, 'declaracao', 'Teste 20270104700000',
        v_org::text || '/' || v_pessoa::text || '/' || v_doc1::text || '/' || gen_random_uuid()::text || '.pdf',
        v_hash, false);
      SELECT d.estado, d.corpo_html, d.ficheiro_caminho, d.ficheiro_hash_sha256, d.ficheiro_anexado_em, d.entregue_em
        INTO v_d FROM public.pessoas_documentos d WHERE d.id = v_doc1;
      SELECT count(*) INTO v_n FROM public.pessoas_portal_envios e
       WHERE e.documento_id = v_doc1 AND e.retirado_em IS NULL AND NOT e.exige_assinatura
         AND e.id = (v_r ->> 'envio_id')::uuid;
      IF v_d.estado IS DISTINCT FROM 'entregue' OR v_d.corpo_html IS NOT NULL OR v_d.ficheiro_caminho IS NULL
         OR v_d.ficheiro_hash_sha256 IS DISTINCT FROM v_hash OR v_d.ficheiro_anexado_em IS NULL
         OR v_d.entregue_em IS NULL OR v_n <> 1 OR (v_r ->> 'estado') IS DISTINCT FROM 'entregue' THEN
        RAISE EXCEPTION 'Conferir: a declaracao sem assinatura nao ficou como esperado (%).', v_r::text USING ERRCODE = 'HR922';
      END IF;

      -- 6.3 O mesmo id outra vez: HRA10.
      v_recusou := false;
      BEGIN
        PERFORM public.rpc_hr_portal_documento_novo_enviar(
          v_uid, v_org, v_pessoa, v_doc1, 'declaracao', 'Teste 20270104700000',
          v_org::text || '/' || v_pessoa::text || '/' || v_doc1::text || '/' || gen_random_uuid()::text || '.pdf',
          v_hash, false);
      EXCEPTION WHEN SQLSTATE 'HRA10' THEN
        v_recusou := true;
      END;
      IF NOT v_recusou THEN
        RAISE EXCEPTION 'Conferir: um id de documento repetido nao foi recusado.' USING ERRCODE = 'HR923';
      END IF;

      -- 6.4 Contrato sem assinatura: HRA38, e nada fica criado.
      v_recusou := false;
      BEGIN
        PERFORM public.rpc_hr_portal_documento_novo_enviar(
          v_uid, v_org, v_pessoa, v_doc2, 'contrato', 'Teste 20270104700000',
          v_org::text || '/' || v_pessoa::text || '/' || v_doc2::text || '/' || gen_random_uuid()::text || '.pdf',
          v_hash, false);
      EXCEPTION WHEN SQLSTATE 'HRA38' THEN
        v_recusou := true;
      END;
      IF NOT v_recusou OR EXISTS (SELECT 1 FROM public.pessoas_documentos d WHERE d.id = v_doc2) THEN
        RAISE EXCEPTION 'Conferir: um contrato sem assinatura nao foi recusado sem deixar linha.' USING ERRCODE = 'HR924';
      END IF;

      -- 6.5 Caminho de outro documento: HRA10.
      v_recusou := false;
      BEGIN
        PERFORM public.rpc_hr_portal_documento_novo_enviar(
          v_uid, v_org, v_pessoa, v_doc2, 'contrato', 'Teste 20270104700000',
          v_org::text || '/' || v_pessoa::text || '/' || v_doc3::text || '/' || gen_random_uuid()::text || '.pdf',
          v_hash, true);
      EXCEPTION WHEN SQLSTATE 'HRA10' THEN
        v_recusou := true;
      END;
      IF NOT v_recusou THEN
        RAISE EXCEPTION 'Conferir: um caminho que nao e deste documento nao foi recusado.' USING ERRCODE = 'HR925';
      END IF;

      -- 6.6 Contrato com assinatura: fica a aguardar, no portal, sem texto visivel.
      v_r := public.rpc_hr_portal_documento_novo_enviar(
        v_uid, v_org, v_pessoa, v_doc3, 'contrato', 'Teste 20270104700000',
        v_org::text || '/' || v_pessoa::text || '/' || v_doc3::text || '/' || gen_random_uuid()::text || '.png',
        v_hash, true);
      SELECT d.estado, d.corpo_html, d.modelo_id INTO v_d FROM public.pessoas_documentos d WHERE d.id = v_doc3;
      IF v_d.estado IS DISTINCT FROM 'a_aguardar_assinatura'
         OR public.hr_documento_corpo_visivel(v_d.corpo_html, v_d.modelo_id)
         OR NOT EXISTS (SELECT 1 FROM public.pessoas_portal_envios e
                         WHERE e.documento_id = v_doc3 AND e.exige_assinatura AND e.retirado_em IS NULL)
         OR NOT (v_r ? 'tem_telemovel') THEN
        RAISE EXCEPTION 'Conferir: o contrato com assinatura nao ficou como esperado (%).', v_r::text USING ERRCODE = 'HR926';
      END IF;

      -- 6.7 A RPC do RH chega ao nucleo: o mesmo documento ja esta no portal (HRA38).
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      v_recusou := false;
      BEGIN
        PERFORM public.rpc_hr_portal_documento_enviar(v_doc3, NULL, true);
      EXCEPTION WHEN SQLSTATE 'HRA38' THEN
        v_recusou := true;
      END;
      IF NOT v_recusou THEN
        RAISE EXCEPTION 'Conferir: rpc_hr_portal_documento_enviar deixou enviar duas vezes o mesmo documento.' USING ERRCODE = 'HR927';
      END IF;
    END IF;

    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'teste_documento_novo_enviar_20270104700000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: documentos, envios, eventos e auditoria de teste desfazem-se com a subtransaccao
    WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claims', NULL, true);
      RAISE EXCEPTION 'Conferir (ao vivo) falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'OK: corpo_html aceita NULL com CHECK corpo-ou-ficheiro; rpc_hr_portal_documento_novo_enviar so de service_role; nucleo e corpo_visivel internos; ler/conteudo escondem o texto de um documento so-ficheiro; SHA-256 do SMS = sha256(''|'' || hash).';
END;
$conferir$;
