-- ==============================================================================
-- 20270101460000_hr_portal_documentos_contrato_sms.sql
--
-- RH: documentos no portal do colaborador, aprovacao/rejeicao da admissao e
-- assinatura do contrato de trabalho no portal por CODIGO SMS.
--
-- Base: RH (uetjghdkwbywbftedtth). NUNCA a principal, NUNCA a Mudelar.
-- Desenho: desenho-docs-portal.md (job bbc4f3a6), com a EMENDA DO UTILIZADOR
-- (assinatura por codigo SMS como nos contratos do CRM, sem client_contracts e
-- sem a Edge sms-otp).
--
--
-- !!! PRECISA DE CODIGO NOVO -- NAO APLICAR SOZINHA !!! ------------------------
--
-- Esta migration cria coisas novas, acrescenta valores a CHECKs e muda UMA
-- funcao existente: hr_convite_admissao_used_at_transitorio, que passa a deixar
-- a submissao em 'submetida' (ver abaixo; efeito imediato no push, mesmo sem a
-- Edge nova). O resto nada usa sem:
--   1. Edge convite-admissao NOVA (so no projecto RH): accoes doc_* (modulo
--      accoesDocumentos.ts), a accao de RH documentos_avisar, o envio do SMS
--      pela SMSAPI (segredo SMSAPI_TOKEN; nunca registar o codigo nem o token),
--      o HMAC do codigo SMS e do OTP com o pepper, e o fluxo do link: a accao
--      "estado" passa a chamar PRIMEIRO rpc_hr_portal_documentos_estado e so cai
--      na rpc_hr_convite_admissao_estado quando documentos_abertos = false; com
--      a janela aberta o OTP por e-mail e pedido/verificado por
--      rpc_hr_portal_documentos_otp_pedir/_otp_verificar (as de preenchimento
--      recusam um processo ja submetido). Codigos novos em erros.ts: HRA61
--      aceite_obrigatorio, HRA62 sem_ficheiro, HRA63 documentos_fechados, HRA64
--      sem_telemovel.
--   2. Front novo: portal (aba Documentos, dialogo de assinatura por SMS) e RH
--      (pipeline: Aprovar, Rejeitar, Enviar contrato; ficha: envios e pedidos).
--      Os tipos EstadoDocumentoRH (rh-exemplo/tipos e src/types/hr) TEM de
--      passar a aceitar 'entregue' e a origem 'portal' NO MESMO ENVIO do push:
--      um documento entregue com o front antigo cai num estado desconhecido.
--   Ordem: db push --linked (a partir do worktree rh-pessoas, confirmar
--   supabase/.temp/project-ref = uetjgh...) -> deploy da Edge so no projecto
--   RH -> front.
--
--
-- -- MUDANCA DE COMPORTAMENTO: A SUBMISSAO PASSA A 'submetida' -----------------
--
--  O trigger hr_convite_admissao_used_at_transitorio (remoto lido a 2/11) passava
--  a submissao a 'concluida', e por isso o RH nunca tinha nada para aprovar.
--  Decisao do utilizador: passa a 'submetida' (seccao 0). O link de preenchimento
--  continua a fechar. Os processos ja em 'concluida' ficam como estao.
--  O que isto muda, procurado em migrations, src e supabase/functions:
--   - um processo submetido continua ABERTO (hr_convite_estado_aberto): o indice
--     idx_pessoas_convites_admissao_processo_aberto impede convidar de novo a
--     mesma pessoa ate o processo ser aprovado/rejeitado/cancelado (e hoje nada
--     passa um processo a 'concluida': a activacao ainda nao existe);
--   - PessoaConviteAdmissaoEstado (hr e rh-exemplo) so esconde a ultima recusa
--     em 'concluida': numa submetida pode mostrar a recusa de uma tentativa
--     anterior; EstadoAdmissaoDaPessoa passa a mostrar o selo "Por aprovar";
--   - o pipeline (admissaoPipeline.ts) ja tem 'submetida' em "Por rever";
--   - a Edge convite-admissao nao le 'concluida'; a rpc_hr_convite_admissao_estado
--     continua a responder convite_ja_usado (portal_encerrado_em preenchido);
--   - hr_convite_anexos_limpar (passo d) decide por used_at, nao pelo estado;
--   - rpc_hr_convite_admissao_submeter so o refere no COMMENT (desactualizado);
--   - src/pages/__tests__/ConviteAdmissao.test.tsx simula 'concluida' depois de
--     submeter: o resultado no ecra e o mesmo (convite_ja_usado).
--
--
-- -- [CONFIRMAR] ANTES DO PUSH ---------------------------------------------------
--
--  a) Os CHECKs de pessoas_documentos e pessoas_anexos foram lidos no remoto a
--     2/11 (estado-remoto-3) e coincidem com os conjuntos que as guardas exigem;
--     as guardas continuam a conferi-los antes do DROP/ADD.
--  b) hr_convite_anexos_limpar e hr_convite_anexos_promover (corpos remotos por
--     ler): os ficheiros dos pedidos ficam com convite_id NULL de proposito, para
--     o passo (d) da limpeza nunca os promover para a ficha. A guarda confere que
--     o passo (d) ainda junta por convite.
--  c) Telemovel da pessoa: pessoas_dados_pessoais.telefone_pessoal (a ficha; e
--     onde o submeter grava o telefone do portal). Decidido: aceita telemovel PT
--     (9[1236]xxxxxxx, com ou sem +351/00351) e qualquer numero estrangeiro E.164
--     valido; so recusa numeros +351 que nao sejam telemovel.
--
--
-- -- DESVIOS AO DESENHO (decididos aqui, a validar) ---------------------------
--
--  1. NAO se recriam rpc_hr_convite_admissao_estado, _otp_pedir, _otp_verificar
--     nem rpc_hr_documento_assinar. Em vez de lhes mudar a condicao, ha tres
--     funcoes novas para a janela de documentos (estado, otp_pedir,
--     otp_verificar), copiadas das definicoes reais lidas a 2/11 e com a janela
--     no lugar da regra de preenchimento. Motivo: zero risco de repor uma versao
--     antiga de funcoes vivas. Custo: a Edge escolhe qual chamar (ponto 1
--     acima). Os contadores de OTP sao partilhados (eventos otp_pedido e
--     otp_falhado do mesmo processo).
--  2. A assinatura interna (rpc_hr_documento_assinar) fica como esta: nao grava
--     assinatura_conteudo_sha256. O avanco do processo vale para ela na mesma
--     (trigger em pessoas_documentos).
--  3. Assinatura por SMS (emenda): sai a comparacao do nome escrito (HRA60 nao
--     existe); o nome, se vier, so se guarda. Prova = codigo SMS + telemovel
--     mascarado + referencia SMS-XXXXXX + data + IP + agente + SHA-256.
--  4. rpc_hr_admissao_aprovar/_rejeitar recebem (p_convite_id, p_organization_id
--     ...) como _cancelar e _prolongar (activeCompany conferida com a linha). O
--     p_nota do desenho cai: nao ha coluna para ele e os metadados dos eventos so
--     aceitam codigos.
--  5. Acrescentada rpc_hr_portal_pedido_ficheiros (RH): os ficheiros de um
--     pedido ficam 'ligado' e a politica de pessoas_anexos so mostra
--     'promovido'; sem isto o RH nao sabe o que a pessoa enviou.
--  6. Os ficheiros dos pedidos: quarentena admissao/pedidos/<pedido>/<anexo>.<ext>
--     (o CHECK exige o prefixo admissao/), final <org>/<pessoa>/admissao/<anexo>.<ext>
--     (o mesmo da limpeza, que assim apanha copias orfas).
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo) ------------------------------------------
--   reutilizados: HRA10 pedido_invalido, HRA31 nao_encontrado, HRA37
--   motivo_invalido, HRA38 estado_invalido, HRA39 dias_invalidos, HRA41
--   limite_excedido, HRA42 otp_espera, HRA43 otp_limite_diario, HRA45
--   otp_bloqueado, HRA51/52/53 sessao, 42501.
--   novos: HRA61 aceite_obrigatorio, HRA62 sem_ficheiro, HRA63
--   documentos_fechados, HRA64 sem_telemovel.
--   Erros do codigo SMS ao assinar saem em jsonb {erro, restantes} (sem RAISE),
--   para a tentativa ficar contada: otp_expirado, otp_bloqueado, otp_invalido; e
--   conteudo_alterado (o texto mudou desde o pedido do codigo: nao gasta tentativa,
--   o codigo deixa de valer; a Edge TEM de aceitar este codigo no doc_assinar).
--
-- -- REVISAO (2/11): o que mudou depois das duas revisoes ------------------------
--   F1 a assinatura fica presa ao texto visto (sms_conteudo_sha256 + trigger que
--      fixa o texto/ficheiro de um documento no portal, sem recriar
--      rpc_hr_documento_anexar_ficheiro); F2/M1 matriz de permissao por tipo nos
--      ficheiros dos pedidos + rpc_hr_portal_pedido_ficheiro_url_rh (hr-anexo-url
--      nao se toca); F3 10 codigos/24 h, telemovel_mascarado no envio do contrato,
--      lista de indicativos editavel; F4 sessao antes da janela; F5 a pessoa nao ve
--      envios retirados; F6 contrato por assinar nunca passa a entregue; F7
--      permissao antes do FOR UPDATE; H1 a janela nao depende de attempts e quem a
--      abre zera-o; H2 rpc_hr_portal_documentos_link (service_role) para o aviso por
--      e-mail; L1 enviar_contrato tambem desde assinaturas_concluidas; L2 envio com
--      processo fora da janela da erro; L3 SELECT das colunas novas a service_role;
--      (a) rpc_hr_portal_pedido_ficheiro_contexto pedida pela Edge.
--   rpc_hr_admissao_enviar_contrato deixa passar as mensagens em texto livre da
--   rpc_hr_documento_emitir (sem SQLSTATE HRA) e 'erro_inesperado' (P0001).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e so sem dados:
-- largar as funcoes novas, os triggers novos, as 3 tabelas, as colunas novas e
-- repor os conjuntos de valores antigos dos CHECKs alargados.
--
-- Prerequisitos (lidos no remoto a 2/11): rpc_hr_documento_emitir(uuid, uuid[])
-- RETURNS SETOF uuid; hr_convite_sessao_exigir(uuid, text) RETURNS void;
-- hr_convite_sessao_valida(timestamptz x3); has_anew_permission_in_org(uuid,
-- text, uuid); hr_pessoa_do_utilizador(uuid, uuid).
-- ==============================================================================

SET lock_timeout = '5s';

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n     integer;
  v_def   text;
  v_lidos text[];
BEGIN
  -- Dependencias com a assinatura e o retorno exactos.
  IF to_regprocedure('public.rpc_hr_documento_emitir(uuid, uuid[])') IS NULL
     OR pg_get_function_result('public.rpc_hr_documento_emitir(uuid, uuid[])'::regprocedure) IS DISTINCT FROM 'SETOF uuid' THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_documento_emitir(uuid, uuid[]) RETURNS SETOF uuid nao existe.';
  END IF;
  IF to_regprocedure('public.hr_convite_sessao_exigir(uuid, text)') IS NULL
     OR pg_get_function_result('public.hr_convite_sessao_exigir(uuid, text)'::regprocedure) IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'Guarda: hr_convite_sessao_exigir(uuid, text) RETURNS void nao existe.';
  END IF;
  IF to_regprocedure('public.hr_convite_sessao_valida(timestamptz, timestamptz, timestamptz)') IS NULL
     OR to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_pessoa_do_utilizador(uuid, uuid)') IS NULL
     OR to_regprocedure('public.hr_convite_evento_metadados_validos(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta uma das funcoes de apoio (sessao_valida, has_anew_permission_in_org, hr_pessoa_do_utilizador, hr_convite_evento_metadados_validos).';
  END IF;

  -- Nada do que esta migration cria pode ja existir.
  IF to_regclass('public.pessoas_portal_envios') IS NOT NULL
     OR to_regclass('public.pessoas_portal_pedidos') IS NOT NULL
     OR to_regclass('public.pessoas_portal_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: uma das tabelas pessoas_portal_* ja existe. Investigar.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND (p.proname IN ('rpc_hr_admissao_aprovar', 'rpc_hr_admissao_rejeitar', 'rpc_hr_admissao_devolver',
                        'rpc_hr_admissao_enviar_contrato', 'hr_documento_assinar_nucleo',
                        'hr_convite_documentos_abertos', 'hr_convite_sessao_exigir_documentos',
                        'hr_convite_avaliar_assinaturas', 'hr_telemovel_normalizar', 'hr_telemovel_mascarar',
                        'hr_pessoa_telemovel', 'hr_telemovel_indicativos_permitidos', 'hr_documento_conteudo_sha256',
                        'hr_convite_link_token_documentos', 'hr_documentos_conteudo_no_portal')
          OR p.proname LIKE 'rpc\_hr\_portal\_%'
          OR p.proname LIKE 'hr\_portal\_%'
          OR p.proname LIKE 'hr\_documentos\_entregue\_%');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: ja existem % funcao(oes) com nomes desta migration. Investigar.', v_n;
  END IF;

  -- Colunas novas ainda por criar; colunas que se leem tem de existir.
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = 'public.pessoas_documentos'::regclass AND NOT attisdropped
     AND attname IN ('assinatura_nome', 'assinatura_conteudo_sha256', 'assinatura_metodo',
                     'assinatura_telemovel_mascarado', 'assinatura_referencia', 'entregue_em');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: pessoas_documentos ja tem colunas desta migration.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = 'public.pessoas_documentos'::regclass AND NOT attisdropped
     AND attname IN ('corpo_html', 'ficheiro_caminho', 'ficheiro_hash_sha256', 'assinatura_origem',
                     'assinatura_ip', 'assinatura_user_agent', 'assinado_por_auth_uid', 'deleted_at');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'Guarda: pessoas_documentos nao tem as 8 colunas esperadas (encontradas %).', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.pessoas_anexos'::regclass
              AND attname = 'pedido_id' AND NOT attisdropped)
     OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.pessoas_convites_admissao'::regclass
              AND attname = 'portal_documentos_ate' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Guarda: pessoas_anexos.pedido_id ou pessoas_convites_admissao.portal_documentos_ate ja existem.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = 'public.pessoas_dados_pessoais'::regclass AND attname = 'telefone_pessoal' AND NOT attisdropped;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Guarda: pessoas_dados_pessoais.telefone_pessoal nao existe.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = 'public.pessoas'::regclass AND attname IN ('nome_completo', 'primeiro_nome') AND NOT attisdropped;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Guarda: pessoas.nome_completo/primeiro_nome nao existem.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'hr-documentos') THEN
    RAISE EXCEPTION 'Guarda: o bucket hr-documentos nao existe.';
  END IF;

  -- As permissoes reutilizadas existem todas (nenhuma nova).
  SELECT count(DISTINCT code) INTO v_n FROM public.anew_permissions
   WHERE code IN ('hr.pessoas.documentos.view', 'hr.pessoas.documentos.view.own', 'hr.pessoas.documentos.edit',
                  'hr.pessoas.documentos.emitir', 'hr.pessoas.documentos.anular', 'hr.onboarding.approve',
                  'hr.pessoas.view', 'hr.pessoas.identificacao.reveal', 'hr.pessoas.bancarios.edit');
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'Guarda: faltam permissoes no catalogo (encontradas % de 9).', v_n;
  END IF;

  -- O link guardado no Vault (para o aviso de documentos) e o organizador dele.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.pessoas_convites_admissao'::regclass
                  AND attname = 'link_segredo_id' AND NOT attisdropped)
     OR to_regclass('vault.decrypted_secrets') IS NULL
     OR to_regprocedure('public.hr_organizacao_empregadora(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta pessoas_convites_admissao.link_segredo_id, vault.decrypted_secrets ou hr_organizacao_empregadora.';
  END IF;

  -- Os CHECKs que se alargam tem HOJE exactamente estes valores.
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_lidos
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = 'public.pessoas_documentos'::regclass
     AND c.conname = 'pessoas_documentos_estado_valido' AND c.contype::text = 'c';
  IF v_lidos IS DISTINCT FROM ARRAY['a_aguardar_assinatura', 'anulado', 'assinado', 'rascunho'] THEN
    RAISE EXCEPTION 'Guarda: pessoas_documentos_estado_valido tem valores inesperados: %', coalesce(array_to_string(v_lidos, ','), '(ausente)');
  END IF;

  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_lidos
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = 'public.pessoas_documentos'::regclass
     AND c.conname = 'pessoas_documentos_assinatura_origem_valida' AND c.contype::text = 'c';
  IF v_lidos IS DISTINCT FROM ARRAY['externa', 'interna'] THEN
    RAISE EXCEPTION 'Guarda: pessoas_documentos_assinatura_origem_valida tem valores inesperados: %', coalesce(array_to_string(v_lidos, ','), '(ausente)');
  END IF;

  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_lidos
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = 'public.pessoas_anexos'::regclass
     AND c.conname = 'pessoas_anexos_tipo_valido' AND c.contype::text = 'c';
  IF v_lidos IS DISTINCT FROM ARRAY['cartao_cidadao', 'comprovativo_iban', 'fotografia'] THEN
    RAISE EXCEPTION 'Guarda: pessoas_anexos_tipo_valido tem valores inesperados: %', coalesce(array_to_string(v_lidos, ','), '(ausente)');
  END IF;

  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_lidos
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = 'public.pessoas_anexos'::regclass
     AND c.conname = 'pessoas_anexos_origem_valida' AND c.contype::text = 'c';
  IF v_lidos IS DISTINCT FROM ARRAY['convite', 'rh'] THEN
    RAISE EXCEPTION 'Guarda: pessoas_anexos_origem_valida tem valores inesperados: %', coalesce(array_to_string(v_lidos, ','), '(ausente)');
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_anexos'::regclass
     AND c.conname = 'pessoas_anexos_activo_tem_convite' AND c.contype::text = 'c';
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_lidos
    FROM regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''', 'g') AS m;
  IF v_def IS NULL OR v_lidos IS DISTINCT FROM ARRAY['ligado', 'pendente', 'rh']
     OR position('convite_id IS NOT NULL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Guarda: pessoas_anexos_activo_tem_convite nao e a de 20261210250000: %', coalesce(v_def, '(ausente)');
  END IF;

  -- O CHECK dos eventos do processo aceita as accoes que esta migration grava.
  SELECT array_agg(DISTINCT m[1]) INTO v_lidos
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = 'public.pessoas_convites_admissao_eventos'::regclass
     AND c.conname = 'pessoas_convites_admissao_eventos_acao_valida' AND c.contype::text = 'c';
  IF v_lidos IS NULL OR NOT (v_lidos @> ARRAY['aprovado', 'rejeitado', 'contrato_disponibilizado',
                                               'contrato_assinado_pessoa', 'otp_pedido', 'otp_validado',
                                               'otp_falhado', 'sessao_iniciada', 'sessao_substituida']) THEN
    RAISE EXCEPTION 'Guarda: o CHECK das accoes dos eventos do processo nao aceita as accoes desta migration.';
  END IF;
  IF NOT public.hr_convite_evento_metadados_validos('{"tipo": "documentos"}'::jsonb)
     OR NOT public.hr_convite_evento_metadados_validos('{"tipo": "documentos", "tentativas": 3}'::jsonb)
     OR NOT public.hr_convite_evento_metadados_validos('{"documento_id": "00000000-0000-0000-0000-000000000000"}'::jsonb) THEN
    RAISE EXCEPTION 'Guarda: hr_convite_evento_metadados_validos recusa os metadados desta migration.';
  END IF;

  -- [CONFIRMAR c] O passo (d) da limpeza continua a escolher os ligados POR CONVITE.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'hr_convite_anexos_limpar';
  IF v_def IS NULL OR position('c.id = a.convite_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Guarda: hr_convite_anexos_limpar mudou (o passo d ja nao junta por convite). Rever os ficheiros dos pedidos antes de aplicar.';
  END IF;

  -- O dono das funcoes tem de passar a RLS (as tabelas novas ficam com FORCE).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'Guarda: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao conseguiriam escrever.', current_user::text;
  END IF;

  -- O trigger que esta migration recria e EXACTAMENTE o lido no remoto a 2/11
  -- (estado-remoto-3). Compara-se o texto inteiro sem os \r (o corpo remoto tem
  -- CRLF e este ficheiro LF): equivale a uma guarda md5, que nao foi possivel
  -- calcular fora da base.
  IF to_regprocedure('public.hr_convite_admissao_used_at_transitorio()') IS NULL
     OR md5(replace(pg_get_functiondef('public.hr_convite_admissao_used_at_transitorio()'::regprocedure), E'\r', ''))
        <> md5(replace($esperado$CREATE OR REPLACE FUNCTION public.hr_convite_admissao_used_at_transitorio()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.used_at IS NULL AND NEW.used_at IS NOT NULL
     AND public.hr_convite_estado_aberto(NEW.estado) THEN
    INSERT INTO public.pessoas_convites_admissao_eventos
      (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
    VALUES
      (NEW.id, NEW.organization_id, 'submetido', 'pessoa', NULL, NEW.estado, 'concluida', '{}'::jsonb);
    NEW.estado := 'concluida';
    NEW.portal_encerrado_em := coalesce(NEW.portal_encerrado_em, now());
  END IF;
  RETURN NEW;
END;
$function$
$esperado$, E'\r', '')) THEN
    RAISE EXCEPTION 'Guarda: hr_convite_admissao_used_at_transitorio mudou desde a leitura de 2/11. Rever esta migration antes de a aplicar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = 'public.pessoas_convites_admissao'::regclass
                    AND t.tgname::text = 'trg_pessoas_convites_admissao_used_at_transitorio'
                    AND t.tgfoid = 'public.hr_convite_admissao_used_at_transitorio()'::regprocedure::oid
                    AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'Guarda: trg_pessoas_convites_admissao_used_at_transitorio nao existe ou nao chama a funcao esperada.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 0. A submissao passa a 'submetida' (decisao do utilizador, 2/11)
-- ==============================================================================
-- Ate aqui o trigger passava a submissao a 'concluida', e o RH nunca tinha
-- nada para aprovar. Mesma assinatura, mesmo search_path, o mesmo trigger (nao
-- se toca). So mudam o estado posterior do evento e o NEW.estado. O link de
-- preenchimento continua a fechar (portal_encerrado_em); a janela de documentos
-- (portal_documentos_ate) e que o reabre, so para documentos.
-- Os processos que ja estao em 'concluida' ficam como estao (sem migrar dados).
CREATE OR REPLACE FUNCTION public.hr_convite_admissao_used_at_transitorio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.used_at IS NULL AND NEW.used_at IS NOT NULL
     AND public.hr_convite_estado_aberto(NEW.estado) THEN
    INSERT INTO public.pessoas_convites_admissao_eventos
      (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
    VALUES
      (NEW.id, NEW.organization_id, 'submetido', 'pessoa', NULL, NEW.estado, 'submetida', '{}'::jsonb);
    NEW.estado := 'submetida';
    NEW.portal_encerrado_em := coalesce(NEW.portal_encerrado_em, now());
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_convite_admissao_used_at_transitorio() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.hr_convite_admissao_used_at_transitorio() IS
'Quando a submissao escreve used_at num processo aberto, o processo passa a submetida (fica a espera da decisao do RH), portal_encerrado_em = now() (o link de preenchimento fecha) e fica o evento submetido. Ate 20270101460000 passava a concluida. Desde 20261210420000; estado alterado em 20270101460000.';

-- ==============================================================================
-- 1. Colunas e CHECKs em tabelas existentes
-- ==============================================================================

-- ---- pessoas_documentos ------------------------------------------------------
ALTER TABLE public.pessoas_documentos
  ADD COLUMN assinatura_nome                text,
  ADD COLUMN assinatura_conteudo_sha256     text,
  ADD COLUMN assinatura_metodo              text,
  ADD COLUMN assinatura_telemovel_mascarado text,
  ADD COLUMN assinatura_referencia          text,
  ADD COLUMN entregue_em                    timestamptz;

ALTER TABLE public.pessoas_documentos DROP CONSTRAINT pessoas_documentos_estado_valido;
ALTER TABLE public.pessoas_documentos ADD CONSTRAINT pessoas_documentos_estado_valido
  CHECK (estado IN ('rascunho', 'a_aguardar_assinatura', 'assinado', 'entregue', 'anulado'));

ALTER TABLE public.pessoas_documentos DROP CONSTRAINT pessoas_documentos_assinatura_origem_valida;
ALTER TABLE public.pessoas_documentos ADD CONSTRAINT pessoas_documentos_assinatura_origem_valida
  CHECK (assinatura_origem IS NULL OR assinatura_origem IN ('interna', 'externa', 'portal'));

ALTER TABLE public.pessoas_documentos ADD CONSTRAINT pessoas_documentos_entregue_consistente
  CHECK (entregue_em IS NULL OR estado = 'entregue');
ALTER TABLE public.pessoas_documentos ADD CONSTRAINT pessoas_documentos_assinatura_portal_formato
  CHECK ((assinatura_metodo IS NULL OR assinatura_metodo IN ('sms'))
     AND (assinatura_conteudo_sha256 IS NULL OR assinatura_conteudo_sha256 ~ '^[0-9a-f]{64}$')
     AND (assinatura_referencia IS NULL OR assinatura_referencia ~ '^SMS-[0-9A-F]{6}$')
     AND (assinatura_nome IS NULL OR length(assinatura_nome) BETWEEN 1 AND 200)
     AND (assinatura_telemovel_mascarado IS NULL OR length(assinatura_telemovel_mascarado) <= 40));
ALTER TABLE public.pessoas_documentos ADD CONSTRAINT pessoas_documentos_assinatura_portal_completa
  CHECK (assinatura_origem IS DISTINCT FROM 'portal'
         OR (assinatura_metodo = 'sms' AND assinatura_referencia IS NOT NULL
             AND assinatura_telemovel_mascarado IS NOT NULL AND assinatura_conteudo_sha256 IS NOT NULL
             AND assinado_em IS NOT NULL));

COMMENT ON COLUMN public.pessoas_documentos.assinatura_conteudo_sha256 IS
'SHA-256 (hex) do que foi assinado: hr_documento_conteudo_sha256(corpo_html, ficheiro_hash_sha256) = sha256(coalesce(corpo_html, '''') || ''|'' || coalesce(ficheiro_hash_sha256, '''')). Preenchido pela assinatura no portal; e igual ao hash guardado quando o codigo SMS foi pedido. Desde 20270101460000.';
COMMENT ON COLUMN public.pessoas_documentos.assinatura_metodo IS
'Como a pessoa provou a identidade ao assinar no portal: sms (codigo de 6 digitos enviado para o telemovel da ficha). Desde 20270101460000.';
COMMENT ON COLUMN public.pessoas_documentos.assinatura_telemovel_mascarado IS
'Telemovel para onde foi o codigo SMS, mascarado (so os 3 ultimos digitos). Nunca o numero completo. Desde 20270101460000.';
COMMENT ON COLUMN public.pessoas_documentos.assinatura_referencia IS
'Referencia da assinatura por SMS (SMS-XXXXXX), como nos contratos do CRM. Desde 20270101460000.';
COMMENT ON COLUMN public.pessoas_documentos.entregue_em IS
'Quando o documento passou a entregue: documento final que nao se assina (declaracao, copia). Imutavel como um assinado. Desde 20270101460000.';

-- Os metadados novos sao legiveis como assinado_em; o conteudo, o IP e o agente continuam fechados.
GRANT SELECT (assinatura_nome, assinatura_conteudo_sha256, assinatura_metodo,
              assinatura_telemovel_mascarado, assinatura_referencia, entregue_em)
  ON TABLE public.pessoas_documentos TO authenticated;
GRANT SELECT (assinatura_nome, assinatura_conteudo_sha256, assinatura_metodo,
              assinatura_telemovel_mascarado, assinatura_referencia, entregue_em)
  ON TABLE public.pessoas_documentos TO service_role;

-- A prova do texto: SHA-256 de (corpo_html || '|' || ficheiro_hash_sha256), os dois
-- coalescidos a ''. A MESMA formula ao pedir o codigo SMS, ao assinar e no nucleo.
CREATE FUNCTION public.hr_documento_conteudo_sha256(p_corpo_html text, p_ficheiro_hash text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(sha256(convert_to(coalesce(p_corpo_html, '') || '|' || coalesce(p_ficheiro_hash, ''), 'UTF8')), 'hex')
$$;

-- Enquanto um documento a aguardar assinatura esta no portal (envio nao retirado),
-- o texto e o ficheiro nao mudam: a pessoa assina o que viu. Vale para
-- rpc_hr_documento_anexar_ficheiro (nao recriada) e para qualquer outra escrita.
-- Para anexar um ficheiro (ou assinar por fora) o RH retira primeiro o envio.
CREATE FUNCTION public.hr_documentos_conteudo_no_portal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado = 'a_aguardar_assinatura' AND OLD.estado = 'a_aguardar_assinatura'
     AND (NEW.corpo_html IS DISTINCT FROM OLD.corpo_html
          OR NEW.ficheiro_caminho IS DISTINCT FROM OLD.ficheiro_caminho
          OR NEW.ficheiro_hash_sha256 IS DISTINCT FROM OLD.ficheiro_hash_sha256)
     AND EXISTS (SELECT 1 FROM public.pessoas_portal_envios e
                  WHERE e.documento_id = OLD.id AND e.retirado_em IS NULL) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38',
      DETAIL = 'O documento esta no portal a aguardar assinatura: retire o envio antes de mudar o texto ou o ficheiro.';
  END IF;
  RETURN NEW;
END;
$$;

-- 'entregue' e final como 'assinado': so o soft delete passa.
CREATE FUNCTION public.hr_documentos_entregue_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.estado = 'entregue' THEN
    IF (to_jsonb(NEW) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'updated_by')
       = (to_jsonb(OLD) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'updated_by') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'documento_entregue_imutavel' USING ERRCODE = '42501',
      DETAIL = 'Um documento entregue nao se altera; so soft delete.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_documentos_entregue_imutavel() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.hr_documentos_entregue_imutavel() IS
'Trigger: um documento entregue e imutavel (excepto soft delete), como um assinado. Ao lado de hr_documentos_assinado_imutavel, que nao se tocou. Desde 20270101460000.';
CREATE TRIGGER trg_pessoas_documentos_entregue_imutavel
  BEFORE UPDATE ON public.pessoas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.hr_documentos_entregue_imutavel();

-- ---- pessoas_convites_admissao -------------------------------------------------
ALTER TABLE public.pessoas_convites_admissao
  ADD COLUMN portal_documentos_ate timestamptz;
COMMENT ON COLUMN public.pessoas_convites_admissao.portal_documentos_ate IS
'Ate quando o link reabre SO para documentos (aprovada, a_aguardar_assinaturas, assinaturas_concluidas, a_aguardar_ativacao). Nao reabre o preenchimento: portal_encerrado_em e valid_until nao se tocam. Sem SELECT para authenticated. Desde 20270101460000.';
-- Uma coluna nova so ganha SELECT se alguem lho der; reforca-se o fecho.
REVOKE ALL (portal_documentos_ate) ON TABLE public.pessoas_convites_admissao FROM anon, authenticated;

-- ==============================================================================
-- 2. As tres tabelas novas
-- ==============================================================================
CREATE TABLE public.pessoas_portal_pedidos (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pessoa_id       uuid NOT NULL,
  convite_id      uuid,
  direcao         text NOT NULL,
  tipo            text NOT NULL,
  titulo          text,
  nota            text,
  prazo           date,
  urgencia        text,
  estado          text NOT NULL,
  motivo_recusa   text,
  criado_por      uuid,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  enviado_em      timestamptz,
  decidido_em     timestamptz,
  decidido_por    uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_portal_pedidos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_portal_pedidos_id_pessoa_key UNIQUE (id, pessoa_id),
  CONSTRAINT pessoas_portal_pedidos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_portal_pedidos_convite_fkey
    FOREIGN KEY (convite_id, organization_id) REFERENCES public.pessoas_convites_admissao (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_portal_pedidos_por_direcao CHECK (
    (direcao = 'rh_pede'
       AND tipo IN ('cartao_cidadao', 'comprovativo_iban', 'fotografia', 'outro')
       AND estado IN ('por_enviar', 'enviado', 'aceite', 'recusado', 'cancelado')
       AND prazo IS NOT NULL AND urgencia IS NULL)
    OR
    (direcao = 'pessoa_pede'
       AND tipo IN ('declaracao_vinculo', 'comprovativo_rendimentos', 'copia_contrato', 'outro')
       AND estado IN ('pedido', 'em_preparacao', 'disponivel', 'recusado', 'cancelado')
       AND prazo IS NULL AND urgencia IN ('normal', 'urgente'))),
  CONSTRAINT pessoas_portal_pedidos_titulo CHECK (
    (titulo IS NULL OR length(btrim(titulo)) BETWEEN 1 AND 200)
    AND (tipo <> 'outro' OR titulo IS NOT NULL)),
  CONSTRAINT pessoas_portal_pedidos_nota CHECK (nota IS NULL OR length(nota) <= 2000),
  CONSTRAINT pessoas_portal_pedidos_motivo CHECK (
    (motivo_recusa IS NULL OR length(btrim(motivo_recusa)) BETWEEN 3 AND 2000)
    AND (estado <> 'recusado' OR motivo_recusa IS NOT NULL))
);
COMMENT ON TABLE public.pessoas_portal_pedidos IS
'Pedidos de documentos no portal, nos dois sentidos: rh_pede (o RH pede um ficheiro a pessoa) e pessoa_pede (a pessoa pede um documento ao RH). Escrita so pelas RPCs; as transicoes de estado sao conferidas por trigger (HRA38). Desde 20270101460000.';
CREATE INDEX idx_pessoas_portal_pedidos_pessoa ON public.pessoas_portal_pedidos (pessoa_id, direcao, estado);
CREATE INDEX idx_pessoas_portal_pedidos_org ON public.pessoas_portal_pedidos (organization_id, criado_em DESC);
CREATE INDEX idx_pessoas_portal_pedidos_convite ON public.pessoas_portal_pedidos (convite_id) WHERE convite_id IS NOT NULL;

CREATE TABLE public.pessoas_portal_envios (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL,
  pessoa_id               uuid NOT NULL,
  documento_id            uuid NOT NULL,
  convite_id              uuid,
  pedido_id               uuid,
  exige_assinatura        boolean NOT NULL,
  enviado_por             uuid NOT NULL,
  enviado_em              timestamptz NOT NULL DEFAULT now(),
  visto_em                timestamptz,
  recusado_em             timestamptz,
  recusa_motivo           text,
  retirado_em             timestamptz,
  retirado_por            uuid,
  retirado_motivo         text,
  sms_codigo_hmac         text,
  sms_codigo_expira_em    timestamptz,
  sms_codigo_tentativas   integer NOT NULL DEFAULT 0,
  sms_codigo_pedido_em    timestamptz,
  sms_telemovel_mascarado text,
  sms_conteudo_sha256     text,

  CONSTRAINT pessoas_portal_envios_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_portal_envios_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_portal_envios_documento_fkey
    FOREIGN KEY (documento_id) REFERENCES public.pessoas_documentos (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_portal_envios_convite_fkey
    FOREIGN KEY (convite_id, organization_id) REFERENCES public.pessoas_convites_admissao (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_portal_envios_pedido_fkey
    FOREIGN KEY (pedido_id, pessoa_id) REFERENCES public.pessoas_portal_pedidos (id, pessoa_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_portal_envios_recusa CHECK (
    (recusado_em IS NULL) = (recusa_motivo IS NULL)
    AND (recusa_motivo IS NULL OR length(btrim(recusa_motivo)) BETWEEN 3 AND 2000)
    AND (recusado_em IS NULL OR exige_assinatura)),
  CONSTRAINT pessoas_portal_envios_retirado CHECK (
    (retirado_em IS NULL) = (retirado_por IS NULL)
    AND (retirado_em IS NULL) = (retirado_motivo IS NULL)
    AND (retirado_motivo IS NULL OR length(btrim(retirado_motivo)) BETWEEN 3 AND 2000)),
  CONSTRAINT pessoas_portal_envios_sms CHECK (
    (sms_codigo_hmac IS NULL OR sms_codigo_hmac ~ '^[0-9a-f]{64}$')
    AND (sms_codigo_hmac IS NULL) = (sms_codigo_expira_em IS NULL)
    AND sms_codigo_tentativas BETWEEN 0 AND 1000
    AND (sms_telemovel_mascarado IS NULL OR length(sms_telemovel_mascarado) <= 40)
    AND (sms_conteudo_sha256 IS NULL OR sms_conteudo_sha256 ~ '^[0-9a-f]{64}$')
    AND (sms_codigo_hmac IS NULL OR sms_conteudo_sha256 IS NOT NULL))
);
COMMENT ON COLUMN public.pessoas_portal_envios.sms_conteudo_sha256 IS
'SHA-256 do texto do documento (hr_documento_conteudo_sha256) no momento em que o codigo SMS foi pedido: a assinatura so passa se o texto for ainda o mesmo (conteudo_alterado). Sem SELECT para authenticated. Desde 20270101460000.';
COMMENT ON TABLE public.pessoas_portal_envios IS
'O que o RH pos no portal da pessoa: cada linha partilha um documento de pessoas_documentos (a fonte de verdade continua a ser o separador Documentos). As colunas sms_* (o HMAC do codigo SMS, nunca o codigo) nao tem SELECT para authenticated. Escrita so pelas RPCs. Desde 20270101460000.';
CREATE UNIQUE INDEX idx_pessoas_portal_envios_documento_activo
  ON public.pessoas_portal_envios (documento_id) WHERE retirado_em IS NULL;
CREATE INDEX idx_pessoas_portal_envios_pessoa ON public.pessoas_portal_envios (pessoa_id, enviado_em DESC);
CREATE INDEX idx_pessoas_portal_envios_convite ON public.pessoas_portal_envios (convite_id) WHERE convite_id IS NOT NULL;
CREATE INDEX idx_pessoas_portal_envios_pedido ON public.pessoas_portal_envios (pedido_id) WHERE pedido_id IS NOT NULL;
CREATE INDEX idx_pessoas_portal_envios_org ON public.pessoas_portal_envios (organization_id, enviado_em DESC);

CREATE TABLE public.pessoas_portal_eventos (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pessoa_id       uuid NOT NULL,
  convite_id      uuid,
  entidade        text NOT NULL,
  entidade_id     uuid NOT NULL,
  evento          text NOT NULL,
  actor           text NOT NULL,
  actor_auth_uid  uuid,
  ip              inet,
  user_agent      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_portal_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_portal_eventos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_portal_eventos_entidade CHECK (entidade IN ('envio', 'pedido', 'documento', 'anexo', 'convite')),
  CONSTRAINT pessoas_portal_eventos_evento CHECK (evento IN (
    'enviado', 'visto', 'assinado', 'recusado', 'retirado', 'entregue',
    'pedido_criado', 'pedido_enviado', 'ficheiro_enviado', 'ficheiro_removido',
    'aceite', 'recusado_rh', 'em_preparacao', 'disponivel', 'cancelado',
    'admissao_aprovada', 'admissao_rejeitada', 'contrato_enviado',
    'codigo_pedido', 'codigo_falhado', 'ficheiro_aberto_rh')),
  CONSTRAINT pessoas_portal_eventos_actor CHECK (
    actor IN ('rh', 'pessoa', 'sistema') AND ((actor = 'rh') = (actor_auth_uid IS NOT NULL))),
  CONSTRAINT pessoas_portal_eventos_user_agent CHECK (user_agent IS NULL OR length(user_agent) <= 512)
);
COMMENT ON TABLE public.pessoas_portal_eventos IS
'Registo so de acrescentar do que acontece no portal de documentos (auditoria e limites do codigo SMS). UPDATE, DELETE e TRUNCATE recusados por trigger. ip e user_agent sem SELECT para authenticated. Desde 20270101460000.';
CREATE INDEX idx_pessoas_portal_eventos_pessoa ON public.pessoas_portal_eventos (pessoa_id, evento, criado_em);
CREATE INDEX idx_pessoas_portal_eventos_entidade ON public.pessoas_portal_eventos (entidade_id, criado_em);
CREATE INDEX idx_pessoas_portal_eventos_org ON public.pessoas_portal_eventos (organization_id, criado_em);

-- ---- pessoas_anexos: os ficheiros dos pedidos ---------------------------------
ALTER TABLE public.pessoas_anexos ADD COLUMN pedido_id uuid;
COMMENT ON COLUMN public.pessoas_anexos.pedido_id IS
'Pedido do RH (pessoas_portal_pedidos, rh_pede) a que este ficheiro responde. So com origem portal_pedido, e entao SEM convite_id: assim a limpeza e a promocao por convite nunca o levam para a ficha. Nunca se concede a authenticated. Desde 20270101460000.';
ALTER TABLE public.pessoas_anexos ADD CONSTRAINT pessoas_anexos_pedido_fkey
  FOREIGN KEY (pedido_id, pessoa_id) REFERENCES public.pessoas_portal_pedidos (id, pessoa_id) ON DELETE RESTRICT;
CREATE INDEX idx_pessoas_anexos_pedido ON public.pessoas_anexos (pedido_id, estado) WHERE pedido_id IS NOT NULL;

ALTER TABLE public.pessoas_anexos DROP CONSTRAINT pessoas_anexos_tipo_valido;
ALTER TABLE public.pessoas_anexos ADD CONSTRAINT pessoas_anexos_tipo_valido
  CHECK (tipo IN ('cartao_cidadao', 'comprovativo_iban', 'fotografia', 'outro'));
ALTER TABLE public.pessoas_anexos DROP CONSTRAINT pessoas_anexos_origem_valida;
ALTER TABLE public.pessoas_anexos ADD CONSTRAINT pessoas_anexos_origem_valida
  CHECK (origem IN ('convite', 'rh', 'portal_pedido'));
ALTER TABLE public.pessoas_anexos DROP CONSTRAINT pessoas_anexos_activo_tem_convite;
ALTER TABLE public.pessoas_anexos ADD CONSTRAINT pessoas_anexos_activo_tem_convite
  CHECK ((estado <> 'ligado' OR convite_id IS NOT NULL OR origem = 'portal_pedido')
     AND (estado <> 'pendente' OR convite_id IS NOT NULL OR origem IN ('rh', 'portal_pedido')));
ALTER TABLE public.pessoas_anexos ADD CONSTRAINT pessoas_anexos_pedido_coerente
  CHECK ((origem = 'portal_pedido') = (pedido_id IS NOT NULL)
     AND (origem <> 'portal_pedido' OR (convite_id IS NULL AND estado <> 'promovido')));
COMMENT ON CONSTRAINT pessoas_anexos_activo_tem_convite ON public.pessoas_anexos IS
'Ligado exige convite, excepto os ficheiros dos pedidos do portal (origem portal_pedido, ligados ao pedido). Pendente exige convite ou origem rh/portal_pedido. Reescrita em 20270101460000.';

-- ==============================================================================
-- 3. Triggers das tabelas novas
-- ==============================================================================
CREATE FUNCTION public.hr_portal_eventos_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'evento_imutavel' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.hr_portal_eventos_imutavel() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_pessoas_portal_eventos_sem_alterar
  BEFORE UPDATE OR DELETE ON public.pessoas_portal_eventos
  FOR EACH ROW EXECUTE FUNCTION public.hr_portal_eventos_imutavel();
CREATE TRIGGER trg_pessoas_portal_eventos_sem_truncate
  BEFORE TRUNCATE ON public.pessoas_portal_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_portal_eventos_imutavel();

-- Pedidos: coerencia na criacao, colunas fixas e so as transicoes do desenho.
CREATE FUNCTION public.hr_portal_pedido_coerencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.convite_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.pessoas_convites_admissao c
          WHERE c.id = NEW.convite_id AND c.pessoa_id = NEW.pessoa_id) THEN
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
    END IF;
    IF (NEW.direcao = 'rh_pede' AND NEW.estado <> 'por_enviar')
       OR (NEW.direcao = 'pessoa_pede' AND NEW.estado <> 'pedido') THEN
      RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id OR NEW.convite_id IS DISTINCT FROM OLD.convite_id
     OR NEW.direcao IS DISTINCT FROM OLD.direcao OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.criado_por IS DISTINCT FROM OLD.criado_por OR NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (
       (NEW.direcao = 'rh_pede' AND (OLD.estado, NEW.estado) IN (
          ('por_enviar', 'enviado'), ('recusado', 'enviado'), ('enviado', 'aceite'),
          ('enviado', 'recusado'), ('por_enviar', 'cancelado'), ('recusado', 'cancelado')))
       OR
       (NEW.direcao = 'pessoa_pede' AND (OLD.estado, NEW.estado) IN (
          ('pedido', 'em_preparacao'), ('pedido', 'disponivel'), ('em_preparacao', 'disponivel'),
          ('pedido', 'recusado'), ('em_preparacao', 'recusado'), ('pedido', 'cancelado')))) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_portal_pedido_coerencia() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_pessoas_portal_pedidos_coerencia
  BEFORE INSERT OR UPDATE ON public.pessoas_portal_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.hr_portal_pedido_coerencia();

-- Envios: o documento e o convite sao da mesma pessoa (o pedido, pela FK
-- composta); o que se fixou ao enviar nao muda.
CREATE FUNCTION public.hr_portal_envio_coerencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_documentos d
                    WHERE d.id = NEW.documento_id AND d.pessoa_id = NEW.pessoa_id
                      AND d.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
    END IF;
    IF NEW.convite_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.pessoas_convites_admissao c
          WHERE c.id = NEW.convite_id AND c.pessoa_id = NEW.pessoa_id) THEN
      RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id OR NEW.documento_id IS DISTINCT FROM OLD.documento_id
     OR NEW.convite_id IS DISTINCT FROM OLD.convite_id OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
     OR NEW.exige_assinatura IS DISTINCT FROM OLD.exige_assinatura
     OR NEW.enviado_por IS DISTINCT FROM OLD.enviado_por OR NEW.enviado_em IS DISTINCT FROM OLD.enviado_em
     OR (OLD.retirado_em IS NOT NULL AND NEW.retirado_em IS DISTINCT FROM OLD.retirado_em)
     OR (OLD.recusado_em IS NOT NULL AND NEW.recusado_em IS DISTINCT FROM OLD.recusado_em) THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_portal_envio_coerencia() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_pessoas_portal_envios_coerencia
  BEFORE INSERT OR UPDATE ON public.pessoas_portal_envios
  FOR EACH ROW EXECUTE FUNCTION public.hr_portal_envio_coerencia();

-- O texto de um documento no portal fica fixo (funcao na seccao 1).
REVOKE ALL ON FUNCTION public.hr_documentos_conteudo_no_portal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_documento_conteudo_sha256(text, text) FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_pessoas_documentos_conteudo_no_portal
  BEFORE UPDATE OF corpo_html, ficheiro_caminho, ficheiro_hash_sha256 ON public.pessoas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.hr_documentos_conteudo_no_portal();

-- ==============================================================================
-- 4. Privilegios e RLS das tabelas novas (escrita so por RPC)
-- ==============================================================================
REVOKE ALL ON TABLE public.pessoas_portal_pedidos FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pessoas_portal_envios  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pessoas_portal_eventos FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.pessoas_portal_pedidos TO service_role;
GRANT SELECT ON TABLE public.pessoas_portal_envios  TO service_role;
GRANT SELECT ON TABLE public.pessoas_portal_eventos TO service_role;

GRANT SELECT (id, organization_id, pessoa_id, convite_id, direcao, tipo, titulo, nota, prazo, urgencia,
              estado, motivo_recusa, criado_por, criado_em, enviado_em, decidido_em, decidido_por, updated_at)
  ON TABLE public.pessoas_portal_pedidos TO authenticated;
GRANT SELECT (id, organization_id, pessoa_id, documento_id, convite_id, pedido_id, exige_assinatura,
              enviado_por, enviado_em, visto_em, recusado_em, recusa_motivo,
              retirado_em, retirado_por, retirado_motivo)
  ON TABLE public.pessoas_portal_envios TO authenticated;
GRANT SELECT (id, organization_id, pessoa_id, convite_id, entidade, entidade_id, evento, actor,
              actor_auth_uid, criado_em)
  ON TABLE public.pessoas_portal_eventos TO authenticated;

ALTER TABLE public.pessoas_portal_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_portal_pedidos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_portal_envios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_portal_envios  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_portal_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_portal_eventos FORCE ROW LEVEL SECURITY;

-- O mesmo predicado de pessoas_documentos_select.
CREATE POLICY pessoas_portal_pedidos_select ON public.pessoas_portal_pedidos
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.view.own', organization_id))
      AND pessoa_id = public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id)
    )
  );
-- A propria pessoa nao ve os envios retirados (o motivo da retirada e interno do RH).
CREATE POLICY pessoas_portal_envios_select ON public.pessoas_portal_envios
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.view', organization_id))
    OR (
      retirado_em IS NULL
      AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.view.own', organization_id))
      AND pessoa_id = public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id)
    )
  );
CREATE POLICY pessoas_portal_eventos_select ON public.pessoas_portal_eventos
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.view', organization_id)));

-- ==============================================================================
-- 5. Funcoes internas (sem EXECUTE para ninguem alem do dono)
-- ==============================================================================

-- Os indicativos para onde se envia o codigo SMS. PARA ACRESCENTAR UM PAIS: uma
-- migration nova que recrie SO esta funcao (CREATE OR REPLACE) com a lista nova.
-- Por omissao: PT, ES, FR, DE, GB, BR, AO, MZ, CV, GW, ST, TL, LU, CH, BE, NL, IE, US.
CREATE FUNCTION public.hr_telemovel_indicativos_permitidos()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['351', '34', '33', '49', '44', '55', '244', '258', '238', '245', '239', '670',
               '352', '41', '32', '31', '353', '1']::text[]
$$;

-- Telemovel em E.164, ou NULL se nao servir para SMS (formato, telefone fixo
-- portugues, ou indicativo fora da lista acima).
CREATE FUNCTION public.hr_telemovel_normalizar(p_numero text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text := regexp_replace(coalesce(p_numero, ''), '[[:space:].()-]', '', 'g');
BEGIN
  IF v LIKE '00%' THEN
    v := '+' || substr(v, 3);
  END IF;
  IF v ~ '^9[1236][0-9]{7}$' THEN
    RETURN '+351' || v;
  END IF;
  IF v ~ '^\+3519[1236][0-9]{7}$' THEN
    RETURN v;
  END IF;
  IF v LIKE '+351%' THEN
    RETURN NULL;  -- numero portugues que nao e telemovel
  END IF;
  IF v ~ '^\+[1-9][0-9]{7,14}$'
     AND EXISTS (SELECT 1 FROM unnest(public.hr_telemovel_indicativos_permitidos()) AS i(codigo)
                  WHERE v LIKE '+' || i.codigo || '%') THEN
    RETURN v;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.hr_telemovel_mascarar(p_e164 text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  -- O indicativo reconhecido (o mais comprido da lista que encaixa: 351 antes de 35x,
  -- 244 antes de 24...), e nao os 3 primeiros caracteres.
  SELECT CASE
           WHEN p_e164 IS NULL THEN NULL
           ELSE coalesce('+' || (SELECT i.codigo
                                   FROM unnest(public.hr_telemovel_indicativos_permitidos()) AS i(codigo)
                                  WHERE p_e164 LIKE '+' || i.codigo || '%'
                                  ORDER BY length(i.codigo) DESC
                                  LIMIT 1),
                         left(p_e164, 3)) || ' *** *** ' || right(p_e164, 3)
         END
$$;

-- O telemovel principal da ficha: pessoas_dados_pessoais.telefone_pessoal.
CREATE FUNCTION public.hr_pessoa_telemovel(p_pessoa_id uuid, p_organization_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.hr_telemovel_normalizar(dp.telefone_pessoal)
    FROM public.pessoas_dados_pessoais dp
   WHERE dp.pessoa_id = p_pessoa_id AND dp.organization_id = p_organization_id
$$;

-- A janela de documentos (desenho 2.5). NAO depende de attempts: a
-- rpc_hr_convite_admissao_estado de sempre incrementa attempts a cada abertura de
-- um link ja usado, e isso fecharia a janela para sempre. A protecao contra
-- adivinhar e o OTP (limites proprios); e quem abre a janela poe attempts = 0.
CREATE FUNCTION public.hr_convite_documentos_abertos(
  p_estado text, p_ate timestamptz, p_revoked_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_estado IN ('aprovada', 'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao')
                  AND p_ate IS NOT NULL AND p_ate > now()
                  AND p_revoked_at IS NULL, false)
$$;

CREATE FUNCTION public.hr_portal_evento(
  p_organization_id uuid, p_pessoa_id uuid, p_convite_id uuid, p_entidade text, p_entidade_id uuid,
  p_evento text, p_actor text, p_actor_auth_uid uuid, p_ip inet DEFAULT NULL, p_user_agent text DEFAULT NULL)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.pessoas_portal_eventos
    (organization_id, pessoa_id, convite_id, entidade, entidade_id, evento, actor, actor_auth_uid, ip, user_agent)
  VALUES
    (p_organization_id, p_pessoa_id, p_convite_id, p_entidade, p_entidade_id, p_evento, p_actor,
     p_actor_auth_uid, p_ip, left(p_user_agent, 512))
$$;

-- Quem pode ver os ficheiros de um tipo: a MESMA matriz da politica
-- pessoas_anexos_select (20261210050000); 'outro' exige identificacao.reveal E
-- bancarios.edit (pode conter qualquer um dos dois). Sempre com documentos.view.
CREATE FUNCTION public.hr_portal_anexo_tipo_permitido(p_auth_uid uuid, p_tipo text, p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(p_auth_uid IS NOT NULL
    AND public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.documentos.view', p_organization_id)
    AND CASE p_tipo
          WHEN 'cartao_cidadao'    THEN public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.identificacao.reveal', p_organization_id)
          WHEN 'comprovativo_iban' THEN public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.bancarios.edit', p_organization_id)
          WHEN 'fotografia'        THEN public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.view', p_organization_id)
          -- 'outro' pode conter qualquer coisa (identificacao, dados bancarios): exige as duas.
          WHEN 'outro'             THEN public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.identificacao.reveal', p_organization_id)
                                    AND public.has_anew_permission_in_org(p_auth_uid, 'hr.pessoas.bancarios.edit', p_organization_id)
          ELSE false
        END, false)
$$;

-- O token em claro do link, para o aviso de documentos. Le o MESMO segredo do
-- Vault que hr_convite_link_token (20261210430000, que recusa um processo ja
-- submetido), mas com a regra da janela de documentos. Sem EXECUTE para ninguem.
CREATE FUNCTION public.hr_convite_link_token_documentos(p_convite_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c     record;
  v_token text;
BEGIN
  SELECT c.id, c.estado, c.revoked_at, c.portal_documentos_ate, c.link_segredo_id
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF NOT public.hr_convite_documentos_abertos(v_c.estado, v_c.portal_documentos_ate, v_c.revoked_at) THEN
    RAISE EXCEPTION 'documentos_fechados' USING ERRCODE = 'HRA63';
  END IF;
  IF v_c.link_segredo_id IS NULL THEN
    RAISE EXCEPTION 'link_indisponivel' USING ERRCODE = 'HRA56';
  END IF;

  SELECT s.decrypted_secret INTO v_token
    FROM vault.decrypted_secrets s
   WHERE s.id = v_c.link_segredo_id;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'link_indisponivel' USING ERRCODE = 'HRA56';
  END IF;
  RETURN v_token;
END;
$$;

-- Sessao do portal na janela de documentos: a verificacao de sessao e a da
-- hr_convite_sessao_exigir (chamada, nao copiada); a regra de estado e a janela.
CREATE FUNCTION public.hr_convite_sessao_exigir_documentos(
  p_token_hash text, p_sessao_hash text,
  OUT convite_id uuid, OUT organization_id uuid, OUT pessoa_id uuid, OUT estado text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_c record;
BEGIN
  SELECT c.id, c.organization_id, c.pessoa_id, c.estado, c.portal_documentos_ate, c.revoked_at
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Primeiro a sessao: sem ela nao se revela se a janela esta aberta.
  PERFORM public.hr_convite_sessao_exigir(v_c.id, p_sessao_hash);

  IF NOT public.hr_convite_documentos_abertos(v_c.estado, v_c.portal_documentos_ate, v_c.revoked_at) THEN
    RAISE EXCEPTION 'documentos_fechados' USING ERRCODE = 'HRA63';
  END IF;

  convite_id      := v_c.id;
  organization_id := v_c.organization_id;
  pessoa_id       := v_c.pessoa_id;
  estado          := v_c.estado;
END;
$$;

-- O nucleo da assinatura: um so UPDATE, com a prova do que foi assinado.
CREATE FUNCTION public.hr_documento_assinar_nucleo(
  p_documento_id uuid, p_origem text, p_metodo text, p_auth_uid uuid, p_ip inet, p_user_agent text,
  p_nome text, p_telemovel_mascarado text, p_referencia text)
RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_doc  public.pessoas_documentos%ROWTYPE;
  v_sha  text;
  v_anew uuid;
BEGIN
  SELECT * INTO v_doc
    FROM public.pessoas_documentos
   WHERE id = p_documento_id AND deleted_at IS NULL
   FOR UPDATE;
  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_doc.estado <> 'a_aguardar_assinatura' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  IF v_doc.corpo_html IS NULL AND v_doc.ficheiro_hash_sha256 IS NULL THEN
    -- Nem texto nem ficheiro: nao ha o que assinar.
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  -- A mesma formula de quando o codigo foi pedido (sms_conteudo_sha256).
  v_sha := public.hr_documento_conteudo_sha256(v_doc.corpo_html, v_doc.ficheiro_hash_sha256);

  IF p_auth_uid IS NOT NULL THEN
    SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = p_auth_uid LIMIT 1;
  END IF;

  UPDATE public.pessoas_documentos
     SET estado                         = 'assinado',
         assinado_em                    = now(),
         assinado_por_auth_uid          = p_auth_uid,
         assinatura_ip                  = p_ip,
         assinatura_user_agent          = left(p_user_agent, 512),
         assinatura_origem              = p_origem,
         assinatura_metodo              = p_metodo,
         assinatura_nome                = p_nome,
         assinatura_telemovel_mascarado = p_telemovel_mascarado,
         assinatura_referencia          = p_referencia,
         assinatura_conteudo_sha256     = v_sha,
         updated_by                     = coalesce(v_anew, updated_by)
   WHERE id = v_doc.id;

  RETURN now();
END;
$$;

-- Avanca o processo quando todas as assinaturas pedidas pelo portal estao feitas.
CREATE FUNCTION public.hr_convite_avaliar_assinaturas(p_convite_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c record;
BEGIN
  SELECT c.id, c.organization_id, c.estado INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id
   FOR UPDATE;
  IF NOT FOUND OR v_c.estado <> 'a_aguardar_assinaturas' THEN
    RETURN;
  END IF;

  -- Falta alguma? Ou nao ha nenhuma (tudo retirado)? Entao fica.
  -- Documentos apagados (deleted_at) nao contam para nenhum dos lados.
  IF EXISTS (SELECT 1
               FROM public.pessoas_portal_envios e
               JOIN public.pessoas_documentos d ON d.id = e.documento_id AND d.deleted_at IS NULL
              WHERE e.convite_id = v_c.id AND e.exige_assinatura AND e.retirado_em IS NULL
                AND d.estado <> 'assinado')
     OR NOT EXISTS (SELECT 1
               FROM public.pessoas_portal_envios e
               JOIN public.pessoas_documentos d ON d.id = e.documento_id AND d.deleted_at IS NULL
              WHERE e.convite_id = v_c.id AND e.exige_assinatura AND e.retirado_em IS NULL
                AND d.estado = 'assinado') THEN
    RETURN;
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET estado = 'assinaturas_concluidas'
   WHERE id = v_c.id;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'contrato_assinado_pessoa', 'sistema', NULL,
     'a_aguardar_assinaturas', 'assinaturas_concluidas', '{}'::jsonb);
END;
$$;

-- Trigger: qualquer assinatura (interna, externa ou portal) reavalia os processos dos envios do documento.
CREATE FUNCTION public.hr_portal_documento_assinado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_convite uuid;
BEGIN
  FOR v_convite IN
    SELECT DISTINCT e.convite_id
      FROM public.pessoas_portal_envios e
     WHERE e.documento_id = NEW.id AND e.retirado_em IS NULL AND e.convite_id IS NOT NULL
  LOOP
    PERFORM public.hr_convite_avaliar_assinaturas(v_convite);
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_pessoas_documentos_portal_assinado
  AFTER UPDATE OF estado ON public.pessoas_documentos
  FOR EACH ROW
  WHEN (NEW.estado = 'assinado' AND OLD.estado IS DISTINCT FROM 'assinado')
  EXECUTE FUNCTION public.hr_portal_documento_assinado();

REVOKE ALL ON FUNCTION public.hr_telemovel_normalizar(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_telemovel_mascarar(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_pessoa_telemovel(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_convite_documentos_abertos(text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_telemovel_indicativos_permitidos() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_portal_anexo_tipo_permitido(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_convite_link_token_documentos(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_portal_evento(uuid, uuid, uuid, text, uuid, text, text, uuid, inet, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_convite_sessao_exigir_documentos(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_documento_assinar_nucleo(uuid, text, text, uuid, inet, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_convite_avaliar_assinaturas(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_portal_documento_assinado() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.hr_convite_sessao_exigir_documentos(text, text) IS
'INTERNA. Exige a sessao do portal (pela hr_convite_sessao_exigir, que nao se copiou: mudancas a sessao ficam num so sitio) e a janela de documentos aberta (HRA63 documentos_fechados), em vez da regra de preenchimento. Desde 20270101460000.';
COMMENT ON FUNCTION public.hr_documento_assinar_nucleo(uuid, text, text, uuid, inet, text, text, text, text) IS
'INTERNA. Assina num so UPDATE: estado assinado, data, IP, agente (<= 512), origem, metodo, nome, telemovel mascarado, referencia e o SHA-256 do texto assinado. Exige a_aguardar_assinatura (HRA38). Desde 20270101460000.';

-- ==============================================================================
-- 6. RPCs do RH (authenticated; permissao verificada na organizacao da linha)
-- ==============================================================================

-- 6.1 Aprovar: submetida -> aprovada.
CREATE FUNCTION public.rpc_hr_admissao_aprovar(p_convite_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c   record;
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.ator_id = v_uid AND e.criado_em > now() - interval '1 hour';
  IF v_n >= 60 THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- A permissao primeiro, na activeCompany, antes de ler ou trancar a linha.
  IF p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.approve', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT c.id, c.organization_id, c.pessoa_id, c.estado INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_c.estado <> 'submetida' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET estado = 'aprovada', legado = false
   WHERE id = v_c.id;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'aprovado', 'rh', v_uid, 'submetida', 'aprovada', '{}'::jsonb);
  PERFORM public.hr_portal_evento(v_c.organization_id, v_c.pessoa_id, v_c.id, 'convite', v_c.id,
                                  'admissao_aprovada', 'rh', v_uid);

  RETURN jsonb_build_object('convite_id', v_c.id, 'estado', 'aprovada');
END;
$$;

-- 6.2 Rejeitar: submetida -> rejeitada (terminal; portal revogado; sessao e OTP apagados).
CREATE FUNCTION public.rpc_hr_admissao_rejeitar(
  p_convite_id uuid, p_organization_id uuid, p_mensagem text, p_motivo_interno text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_mensagem text := btrim(p_mensagem);
  v_interno  text := nullif(btrim(p_motivo_interno), '');
  v_c        record;
  v_anew     uuid;
  v_n        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.ator_id = v_uid AND e.criado_em > now() - interval '1 hour';
  IF v_n >= 60 THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- A permissao primeiro, na activeCompany, antes de ler ou trancar a linha.
  IF p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.approve', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT c.id, c.organization_id, c.pessoa_id, c.estado INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_mensagem IS NULL OR length(v_mensagem) < 3 OR length(v_mensagem) > 2000
     OR (v_interno IS NOT NULL AND length(v_interno) > 2000) THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;
  IF v_c.estado <> 'submetida' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  UPDATE public.pessoas_convites_admissao
     SET estado                     = 'rejeitada',
         legado                     = false,
         revoked_at                 = now(),
         rejeitada_em               = now(),
         rejeitada_por              = v_anew,
         rejeicao_mensagem          = v_mensagem,
         rejeicao_motivo_interno    = v_interno,
         sessao_hash                = NULL,
         sessao_iniciada_em         = NULL,
         sessao_ultima_atividade_em = NULL,
         otp_hmac                   = NULL,
         otp_expira_em              = NULL
   WHERE id = v_c.id;

  -- A mensagem e o motivo ficam so nas colunas, nunca nos metadados.
  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'rejeitado', 'rh', v_uid, 'submetida', 'rejeitada', '{}'::jsonb);
  PERFORM public.hr_portal_evento(v_c.organization_id, v_c.pessoa_id, v_c.id, 'convite', v_c.id,
                                  'admissao_rejeitada', 'rh', v_uid);

  RETURN jsonb_build_object('convite_id', v_c.id, 'estado', 'rejeitada', 'estado_portal', 'revogado');
END;
$$;

-- 6.3 Enviar o contrato: emite pelo caminho que ja existe e poe-no no portal.
CREATE FUNCTION public.rpc_hr_admissao_enviar_contrato(
  p_convite_id uuid, p_modelo_id uuid, p_dias_portal integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_c      record;
  v_ids    uuid[];
  v_doc    uuid;
  v_envio  uuid;
  v_ate    timestamptz;
  v_tel    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT c.id, c.organization_id, c.pessoa_id, c.estado, c.portal_documentos_ate INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id
   FOR UPDATE;
  IF NOT FOUND OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.emitir', v_c.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_c.estado NOT IN ('aprovada', 'a_aguardar_assinaturas', 'assinaturas_concluidas') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  IF p_dias_portal IS NULL OR p_dias_portal < 1 OR p_dias_portal > 30 THEN
    RAISE EXCEPTION 'dias_invalidos' USING ERRCODE = 'HRA39';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_documentos_modelos m
                  WHERE m.id = p_modelo_id AND m.organization_id = v_c.organization_id
                    AND m.tipo = 'contrato' AND m.activo AND m.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- A emissao de sempre, sem a alterar: verifica as suas permissoes (auth.uid() e o do JWT).
  SELECT array_agg(x.id) INTO v_ids
    FROM public.rpc_hr_documento_emitir(p_modelo_id, ARRAY[v_c.pessoa_id]) AS x(id);
  IF v_ids IS NULL OR array_length(v_ids, 1) <> 1 THEN
    RAISE EXCEPTION 'erro_inesperado';
  END IF;
  v_doc := v_ids[1];

  INSERT INTO public.pessoas_portal_envios
    (organization_id, pessoa_id, documento_id, convite_id, exige_assinatura, enviado_por)
  VALUES
    (v_c.organization_id, v_c.pessoa_id, v_doc, v_c.id, true, v_uid)
  RETURNING id INTO v_envio;

  v_ate := greatest(coalesce(v_c.portal_documentos_ate, now()), now() + make_interval(days => p_dias_portal));

  -- Abrir a janela zera attempts (a rpc_hr_convite_admissao_estado de sempre conta
  -- cada abertura de um link ja usado).
  UPDATE public.pessoas_convites_admissao
     SET estado = 'a_aguardar_assinaturas',
         portal_documentos_ate = v_ate,
         attempts = 0
   WHERE id = v_c.id;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'contrato_disponibilizado', 'rh', v_uid, v_c.estado, 'a_aguardar_assinaturas',
     jsonb_build_object('documento_id', v_doc::text));
  PERFORM public.hr_portal_evento(v_c.organization_id, v_c.pessoa_id, v_c.id, 'envio', v_envio,
                                  'contrato_enviado', 'rh', v_uid);

  -- tem_telemovel = false: o RH ve o aviso; a pessoa nao vai conseguir pedir o codigo (sem_telemovel).
  v_tel := public.hr_pessoa_telemovel(v_c.pessoa_id, v_c.organization_id);
  RETURN jsonb_build_object(
    'documento_id',          v_doc,
    'envio_id',              v_envio,
    'portal_documentos_ate', v_ate,
    'tem_telemovel',         v_tel IS NOT NULL,
    'telemovel_mascarado',   public.hr_telemovel_mascarar(v_tel));
END;
$$;

-- 6.4 Partilhar um documento que ja existe.
CREATE FUNCTION public.rpc_hr_portal_documento_enviar(
  p_documento_id uuid, p_convite_id uuid DEFAULT NULL, p_exige_assinatura boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- 6.5 Retirar um envio do portal (o documento nao muda; anular continua a ser a RPC de anular).
--     Documento anulado que ainda esta no portal (aparece la como 'anulado'): o RH
--     chama esta RPC com o motivo; funciona em qualquer estado do documento. Para
--     substituir um contrato: anular o documento, retirar o envio e enviar outro.
--     Para anexar ficheiro ou assinar por fora um documento no portal: retirar
--     primeiro (o trigger trg_pessoas_documentos_conteudo_no_portal recusa).
CREATE FUNCTION public.rpc_hr_portal_envio_retirar(p_envio_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_motivo  text := btrim(p_motivo);
  v_convite uuid;
  v_e       record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  -- A mesma ordem de locks do portal: convite -> envio. O convite_id de um envio
  -- nunca muda (trigger de coerencia), por isso le-se sem lock e tranca-se antes.
  SELECT e.convite_id INTO v_convite FROM public.pessoas_portal_envios e WHERE e.id = p_envio_id;
  IF v_convite IS NOT NULL THEN
    PERFORM 1 FROM public.pessoas_convites_admissao c WHERE c.id = v_convite FOR UPDATE;
  END IF;

  SELECT e.id, e.organization_id, e.pessoa_id, e.convite_id, e.retirado_em INTO v_e
    FROM public.pessoas_portal_envios e
   WHERE e.id = p_envio_id
   FOR UPDATE;
  IF NOT FOUND OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.anular', v_e.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 3 OR length(v_motivo) > 2000 THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;
  IF v_e.retirado_em IS NOT NULL THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  UPDATE public.pessoas_portal_envios
     SET retirado_em = now(), retirado_por = v_uid, retirado_motivo = v_motivo,
         sms_codigo_hmac = NULL, sms_codigo_expira_em = NULL
   WHERE id = v_e.id;

  PERFORM public.hr_portal_evento(v_e.organization_id, v_e.pessoa_id, v_e.convite_id, 'envio', v_e.id,
                                  'retirado', 'rh', v_uid);
  IF v_e.convite_id IS NOT NULL THEN
    PERFORM public.hr_convite_avaliar_assinaturas(v_e.convite_id);
  END IF;
END;
$$;

-- 6.6 O RH pede um ficheiro a pessoa.
CREATE FUNCTION public.rpc_hr_portal_pedido_criar(
  p_pessoa_id uuid, p_tipo text, p_titulo text, p_nota text, p_prazo date, p_convite_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_org    uuid;
  v_titulo text := nullif(btrim(p_titulo), '');
  v_nota   text := nullif(btrim(p_nota), '');
  v_id     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.pessoas p WHERE p.id = p_pessoa_id;
  IF v_org IS NULL OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.edit', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('cartao_cidadao', 'comprovativo_iban', 'fotografia', 'outro')
     OR (p_tipo = 'outro' AND v_titulo IS NULL)
     OR (v_titulo IS NOT NULL AND length(v_titulo) > 200)
     OR (v_nota IS NOT NULL AND length(v_nota) > 2000)
     OR p_prazo IS NULL OR p_prazo < (now() AT TIME ZONE 'Europe/Lisbon')::date THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF p_convite_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_convites_admissao c
        WHERE c.id = p_convite_id AND c.pessoa_id = p_pessoa_id AND c.organization_id = v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  INSERT INTO public.pessoas_portal_pedidos
    (organization_id, pessoa_id, convite_id, direcao, tipo, titulo, nota, prazo, estado, criado_por)
  VALUES
    (v_org, p_pessoa_id, p_convite_id, 'rh_pede', p_tipo, v_titulo, v_nota, p_prazo, 'por_enviar', v_uid)
  RETURNING id INTO v_id;

  PERFORM public.hr_portal_evento(v_org, p_pessoa_id, p_convite_id, 'pedido', v_id, 'pedido_criado', 'rh', v_uid);
  RETURN v_id;
END;
$$;

-- 6.7 Aceitar ou recusar o que a pessoa enviou.
CREATE FUNCTION public.rpc_hr_portal_pedido_decidir(p_pedido_id uuid, p_aceitar boolean, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_motivo text := nullif(btrim(p_motivo), '');
  v_p      record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT p.id, p.organization_id, p.pessoa_id, p.convite_id, p.direcao, p.estado INTO v_p
    FROM public.pessoas_portal_pedidos p
   WHERE p.id = p_pedido_id
   FOR UPDATE;
  IF NOT FOUND OR v_p.direcao <> 'rh_pede'
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.edit', v_p.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF p_aceitar IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF NOT p_aceitar AND (v_motivo IS NULL OR length(v_motivo) < 3 OR length(v_motivo) > 2000) THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;
  IF v_p.estado <> 'enviado' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  UPDATE public.pessoas_portal_pedidos
     SET estado        = CASE WHEN p_aceitar THEN 'aceite' ELSE 'recusado' END,
         motivo_recusa = CASE WHEN p_aceitar THEN motivo_recusa ELSE v_motivo END,
         decidido_em   = now(),
         decidido_por  = v_uid
   WHERE id = v_p.id;

  PERFORM public.hr_portal_evento(v_p.organization_id, v_p.pessoa_id, v_p.convite_id, 'pedido', v_p.id,
                                  CASE WHEN p_aceitar THEN 'aceite' ELSE 'recusado_rh' END, 'rh', v_uid);
END;
$$;

-- 6.8 Cancelar um pedido do RH ainda por responder (ou recusado).
CREATE FUNCTION public.rpc_hr_portal_pedido_cancelar(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p   record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT p.id, p.organization_id, p.pessoa_id, p.convite_id, p.direcao, p.estado INTO v_p
    FROM public.pessoas_portal_pedidos p
   WHERE p.id = p_pedido_id
   FOR UPDATE;
  IF NOT FOUND OR v_p.direcao <> 'rh_pede'
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.edit', v_p.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_p.estado NOT IN ('por_enviar', 'recusado') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  UPDATE public.pessoas_portal_pedidos
     SET estado = 'cancelado', decidido_em = now(), decidido_por = v_uid
   WHERE id = v_p.id;
  PERFORM public.hr_portal_evento(v_p.organization_id, v_p.pessoa_id, v_p.convite_id, 'pedido', v_p.id,
                                  'cancelado', 'rh', v_uid);
END;
$$;

-- 6.9 Tratar um pedido da pessoa: preparar ou recusar.
CREATE FUNCTION public.rpc_hr_portal_pedido_pessoa_tratar(p_pedido_id uuid, p_accao text, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_motivo text := nullif(btrim(p_motivo), '');
  v_p      record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT p.id, p.organization_id, p.pessoa_id, p.convite_id, p.direcao, p.estado INTO v_p
    FROM public.pessoas_portal_pedidos p
   WHERE p.id = p_pedido_id
   FOR UPDATE;
  IF NOT FOUND OR v_p.direcao <> 'pessoa_pede'
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.edit', v_p.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF p_accao IS NULL OR p_accao NOT IN ('preparar', 'recusar') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  IF p_accao = 'preparar' THEN
    IF v_p.estado <> 'pedido' THEN
      RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
    END IF;
    UPDATE public.pessoas_portal_pedidos SET estado = 'em_preparacao' WHERE id = v_p.id;
    PERFORM public.hr_portal_evento(v_p.organization_id, v_p.pessoa_id, v_p.convite_id, 'pedido', v_p.id,
                                    'em_preparacao', 'rh', v_uid);
  ELSE
    IF v_motivo IS NULL OR length(v_motivo) < 3 OR length(v_motivo) > 2000 THEN
      RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
    END IF;
    IF v_p.estado NOT IN ('pedido', 'em_preparacao') THEN
      RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
    END IF;
    UPDATE public.pessoas_portal_pedidos
       SET estado = 'recusado', motivo_recusa = v_motivo, decidido_em = now(), decidido_por = v_uid
     WHERE id = v_p.id;
    PERFORM public.hr_portal_evento(v_p.organization_id, v_p.pessoa_id, v_p.convite_id, 'pedido', v_p.id,
                                    'recusado_rh', 'rh', v_uid);
  END IF;
END;
$$;

-- 6.10 Responder a um pedido da pessoa com um documento (emitido de um modelo ou anexado).
CREATE FUNCTION public.rpc_hr_portal_pedido_pessoa_responder(p_pedido_id uuid, p_documento_id uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_p     record;
  v_doc   record;
  v_envio uuid;
  v_anew  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT p.id, p.organization_id, p.pessoa_id, p.convite_id, p.direcao, p.estado INTO v_p
    FROM public.pessoas_portal_pedidos p
   WHERE p.id = p_pedido_id
   FOR UPDATE;
  IF NOT FOUND OR v_p.direcao <> 'pessoa_pede'
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.emitir', v_p.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_p.estado NOT IN ('pedido', 'em_preparacao') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  SELECT d.id, d.estado, d.tipo, d.corpo_html IS NOT NULL OR d.ficheiro_caminho IS NOT NULL AS tem_conteudo INTO v_doc
    FROM public.pessoas_documentos d
   WHERE d.id = p_documento_id AND d.deleted_at IS NULL
     AND d.pessoa_id = v_p.pessoa_id AND d.organization_id = v_p.organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_doc.estado IN ('rascunho', 'anulado') OR NOT v_doc.tem_conteudo
     OR (v_doc.estado = 'a_aguardar_assinatura' AND v_doc.tipo NOT IN ('declaracao', 'recibo'))
     OR EXISTS (SELECT 1 FROM public.pessoas_portal_envios e WHERE e.documento_id = v_doc.id AND e.retirado_em IS NULL) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  IF v_doc.estado = 'a_aguardar_assinatura' THEN
    SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;
    UPDATE public.pessoas_documentos
       SET estado = 'entregue', entregue_em = now(), updated_by = coalesce(v_anew, updated_by)
     WHERE id = v_doc.id;
  END IF;

  INSERT INTO public.pessoas_portal_envios
    (organization_id, pessoa_id, documento_id, convite_id, pedido_id, exige_assinatura, enviado_por)
  VALUES
    (v_p.organization_id, v_p.pessoa_id, v_doc.id, v_p.convite_id, v_p.id, false, v_uid)
  RETURNING id INTO v_envio;

  UPDATE public.pessoas_portal_pedidos
     SET estado = 'disponivel', decidido_em = now(), decidido_por = v_uid
   WHERE id = v_p.id;

  PERFORM public.hr_portal_evento(v_p.organization_id, v_p.pessoa_id, v_p.convite_id, 'pedido', v_p.id,
                                  'disponivel', 'rh', v_uid);
  RETURN v_envio;
END;
$$;

-- 6.11 Os ficheiros que a pessoa enviou para um pedido (o SELECT de pessoas_anexos so mostra promovidos).
--      A matriz por tipo e a da politica pessoas_anexos_select (hr_portal_anexo_tipo_permitido):
--      sem a permissao do tipo devolve so a contagem, sem nomes nem ids.
CREATE FUNCTION public.rpc_hr_portal_pedido_ficheiros(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p   record;
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT p.organization_id, p.tipo, p.estado INTO v_p FROM public.pessoas_portal_pedidos p WHERE p.id = p_pedido_id;
  IF NOT FOUND OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.view', v_p.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- So o que a pessoa ja enviou ao RH: um pedido por enviar, recusado ou cancelado
  -- nao mostra os ficheiros que a pessoa ainda esta a preparar.
  IF v_p.estado NOT IN ('enviado', 'aceite') THEN
    RETURN jsonb_build_object('permitido', true, 'total', 0, 'ficheiros', '[]'::jsonb);
  END IF;

  IF NOT public.hr_portal_anexo_tipo_permitido(v_uid, v_p.tipo, v_p.organization_id) THEN
    SELECT count(*) INTO v_n
      FROM public.pessoas_anexos a
     WHERE a.pedido_id = p_pedido_id AND a.organization_id = v_p.organization_id AND a.estado = 'ligado';
    RETURN jsonb_build_object('permitido', false, 'total', v_n, 'ficheiros', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('permitido', true, 'total', 0, 'ficheiros', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome_original, 'mime', a.mime_type,
                                        'tamanho', a.tamanho_bytes, 'ligado_em', a.ligado_em)
                     ORDER BY a.ligado_em, a.id)
      FROM public.pessoas_anexos a
     WHERE a.pedido_id = p_pedido_id AND a.organization_id = v_p.organization_id AND a.estado = 'ligado'), '[]'::jsonb))
    || jsonb_build_object('total', (SELECT count(*) FROM public.pessoas_anexos a
                                     WHERE a.pedido_id = p_pedido_id AND a.organization_id = v_p.organization_id
                                       AND a.estado = 'ligado'));
END;
$$;

-- 6.12 Abrir um ficheiro de um pedido (RH). A Edge hr-anexo-url so serve anexos
--      'promovido' e nao se altera: a Edge convite-admissao (accao de RH, JWT
--      validado, actor do JWT) chama esta RPC e assina um URL de 60 s com o
--      caminho devolvido. O caminho nunca vai ao browser. SO service_role.
CREATE FUNCTION public.rpc_hr_portal_pedido_ficheiro_url_rh(
  p_anexo_id uuid, p_organization_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a record;
BEGIN
  IF p_actor IS NULL OR p_organization_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.anew_users au WHERE au.auth_user_id = p_actor) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT a.id, a.organization_id, a.pessoa_id, a.tipo, a.bucket, a.caminho, a.mime_type, p.convite_id
    INTO v_a
    FROM public.pessoas_anexos a
    JOIN public.pessoas_portal_pedidos p ON p.id = a.pedido_id
   WHERE a.id = p_anexo_id AND a.organization_id = p_organization_id
     AND a.origem = 'portal_pedido' AND a.estado = 'ligado'
     AND p.estado IN ('enviado', 'aceite');
  -- Inexistente, de outra organizacao, pedido ainda nao enviado ao RH, ou sem a
  -- permissao do tipo: o mesmo nao_encontrado.
  IF NOT FOUND OR NOT public.hr_portal_anexo_tipo_permitido(p_actor, v_a.tipo, v_a.organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  PERFORM public.hr_portal_evento(v_a.organization_id, v_a.pessoa_id, v_a.convite_id, 'anexo', v_a.id,
                                  'ficheiro_aberto_rh', 'rh', p_actor);
  RETURN jsonb_build_object('bucket', v_a.bucket, 'caminho', v_a.caminho, 'mime', v_a.mime_type);
END;
$$;

-- 6.13 O link do portal para o aviso de documentos (Edge, accao documentos_avisar).
--      SO service_role: a Edge valida o JWT, tira p_actor dele e passa a
--      activeCompany. Por dentro: actor da aplicacao (42501), organizacao da linha e
--      hr.pessoas.documentos.emitir nela (senao nao_encontrado), janela aberta
--      (HRA63), segredo no Vault (HRA56), 60 eventos/hora do actor e 3 avisos/hora
--      por processo (HRA41). Devolve a MESMA forma da rpc_hr_convite_admissao_reenviar
--      ({token, email_destino, documentos_ate, organization_id}): o token so serve para
--      a Edge compor o e-mail e nunca vai ao browser. Evento 'reenviado' com tipo 'documentos'.
CREATE FUNCTION public.rpc_hr_portal_documentos_link(p_convite_id uuid, p_organization_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c     record;
  v_token text;
  v_n     integer;
BEGIN
  IF p_actor IS NULL OR p_organization_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.anew_users au WHERE au.auth_user_id = p_actor) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_anew_permission_in_org(p_actor, 'hr.pessoas.documentos.emitir', p_organization_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text, 0));
  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.ator_id = p_actor AND e.criado_em > now() - interval '1 hour';
  IF v_n >= 60 THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  SELECT c.id, c.organization_id, c.estado, c.email_destino, c.portal_documentos_ate INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.convite_id = v_c.id AND e.acao = 'reenviado' AND e.criado_em > now() - interval '1 hour';
  IF v_n >= 3 THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- HRA63 com a janela fechada, HRA56 sem segredo.
  v_token := public.hr_convite_link_token_documentos(v_c.id);

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'reenviado', 'rh', p_actor, v_c.estado, v_c.estado,
     jsonb_build_object('tipo', 'documentos'));

  RETURN jsonb_build_object('token', v_token,
                            'email_destino', v_c.email_destino,
                            'documentos_ate', v_c.portal_documentos_ate,
                            'organization_id', v_c.organization_id);
END;
$$;

-- ==============================================================================
-- 7. RPCs do portal (SO service_role: a Edge convite-admissao)
-- ==============================================================================

-- 7.1 Estado publico na janela de documentos. A Edge chama esta PRIMEIRO; com
--     documentos_abertos = false cai na rpc_hr_convite_admissao_estado de sempre.
--     Nunca conta tentativas nem diz porque esta fechada (isso e da outra).
CREATE FUNCTION public.rpc_hr_portal_documentos_estado(p_token_hash text, p_sessao_hash text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_otp_max    constant integer := 5;
  c_falhas_dia constant integer := 15;
  v_c        record;
  v_sessao   text := nullif(btrim(p_sessao_hash), '');
  v_hdr      text;
  v_ok       boolean;
  v_primeiro text;
  v_org_nome text;
BEGIN
  SELECT c.id, c.organization_id, c.pessoa_id, c.estado, c.revoked_at, c.attempts, c.portal_documentos_ate,
         c.sessao_hash, c.sessao_iniciada_em, c.sessao_ultima_atividade_em,
         c.otp_hmac, c.otp_expira_em, c.otp_tentativas
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash;
  IF NOT FOUND OR NOT public.hr_convite_documentos_abertos(v_c.estado, v_c.portal_documentos_ate, v_c.revoked_at) THEN
    RETURN jsonb_build_object('documentos_abertos', false);
  END IF;

  IF v_sessao IS NULL THEN
    v_hdr := nullif(current_setting('request.headers', true), '');
    IF v_hdr IS NOT NULL THEN
      BEGIN
        v_sessao := nullif(btrim(v_hdr::jsonb ->> 'x-portal-sessao'), '');
      EXCEPTION WHEN invalid_text_representation THEN
        v_sessao := NULL;
      END;
    END IF;
  END IF;
  v_ok := v_sessao IS NOT NULL AND v_c.sessao_hash IS NOT NULL AND v_sessao = v_c.sessao_hash
          AND public.hr_convite_sessao_valida(v_c.sessao_iniciada_em, v_c.sessao_ultima_atividade_em, now());

  SELECT p.primeiro_nome INTO v_primeiro FROM public.pessoas p WHERE p.id = v_c.pessoa_id;
  SELECT o.name INTO v_org_nome FROM public.anew_organizations o WHERE o.id = v_c.organization_id;

  RETURN jsonb_build_object(
    'existe',             true,
    'estado',             v_c.estado,
    'estado_portal',      'documentos',
    'documentos_abertos', true,
    'documentos_ate',     v_c.portal_documentos_ate,
    'primeiro_nome',      v_primeiro,
    'organizacao_nome',   v_org_nome,
    'bloqueado',          coalesce(v_c.otp_hmac IS NOT NULL AND v_c.otp_expira_em > now()
                                   AND v_c.otp_tentativas >= c_otp_max, false)
                          OR (SELECT count(*) FROM public.pessoas_convites_admissao_eventos e
                               WHERE e.convite_id = v_c.id AND e.criado_em > now() - interval '24 hours'
                                 AND e.acao = 'otp_falhado') >= c_falhas_dia,
    'precisa_otp',        NOT coalesce(v_ok, false));
END;
$$;

-- 7.2 OTP por e-mail na janela de documentos. Copia da rpc_hr_convite_admissao_otp_pedir
--     real (2/11): mesmos limites e contadores; muda so a elegibilidade (a janela)
--     e o tipo do evento ('documentos'; o limite diario conta os dois tipos).
CREATE FUNCTION public.rpc_hr_portal_documentos_otp_pedir(p_token_hash text, p_otp_hmac text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_dia    constant integer  := 10;
  c_espera     constant interval := interval '60 seconds';
  c_janela     constant interval := interval '24 hours';
  c_validade   constant interval := interval '10 minutes';
  c_falhas_dia constant integer  := 15;
  v_c      record;
  v_n      integer;
  v_ultimo timestamptz;
  v_expira timestamptz := now() + c_validade;
BEGIN
  IF p_otp_hmac IS NULL OR p_otp_hmac !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT c.id, c.organization_id, c.estado, c.email_destino, c.revoked_at, c.attempts, c.portal_documentos_ate
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF NOT public.hr_convite_documentos_abertos(v_c.estado, v_c.portal_documentos_ate, v_c.revoked_at) THEN
    RAISE EXCEPTION 'documentos_fechados' USING ERRCODE = 'HRA63';
  END IF;

  SELECT count(*), max(e.criado_em) INTO v_n, v_ultimo
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.convite_id = v_c.id
     AND e.criado_em > now() - c_janela
     AND e.acao = 'otp_pedido'
     AND e.metadados ->> 'tipo' IN ('portal', 'documentos');
  IF v_n >= c_max_dia THEN
    RAISE EXCEPTION 'otp_limite_diario' USING ERRCODE = 'HRA43';
  END IF;
  IF v_ultimo IS NOT NULL AND v_ultimo > now() - c_espera THEN
    RAISE EXCEPTION 'otp_espera' USING ERRCODE = 'HRA42';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.convite_id = v_c.id
     AND e.criado_em > now() - c_janela
     AND e.acao = 'otp_falhado';
  IF v_n >= c_falhas_dia THEN
    RAISE EXCEPTION 'otp_bloqueado' USING ERRCODE = 'HRA45';
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET otp_hmac = p_otp_hmac, otp_expira_em = v_expira, otp_tentativas = 0
   WHERE id = v_c.id;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'otp_pedido', 'pessoa', NULL, v_c.estado, v_c.estado,
     jsonb_build_object('tipo', 'documentos'));

  -- Fica na Edge: o email e a organizacao nunca vao para o browser.
  RETURN jsonb_build_object('email_destino', v_c.email_destino,
                            'organization_id', v_c.organization_id,
                            'expira_em', v_expira);
END;
$$;

-- 7.3 Verificar o OTP na janela de documentos. Copia da _otp_verificar real (2/11),
--     com a janela no lugar da regra de preenchimento e sem transicao de estado.
CREATE FUNCTION public.rpc_hr_portal_documentos_otp_verificar(p_token_hash text, p_otp_hmac text, p_sessao_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max          constant integer  := 5;
  c_meta_max     constant integer  := 1000;
  c_inatividade  constant interval := interval '30 minutes';
  c_janela       constant interval := interval '24 hours';
  c_falhas_dia   constant integer  := 15;
  v_c       record;
  v_t       integer;
  v_falhas  integer;
  v_ativa   boolean;
BEGIN
  IF p_otp_hmac IS NULL OR p_otp_hmac !~ '^[0-9a-f]{64}$'
     OR p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT c.id, c.organization_id, c.estado, c.revoked_at, c.attempts, c.portal_documentos_ate,
         c.otp_hmac, c.otp_expira_em, c.otp_tentativas,
         c.sessao_hash, c.sessao_iniciada_em, c.sessao_ultima_atividade_em
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF NOT public.hr_convite_documentos_abertos(v_c.estado, v_c.portal_documentos_ate, v_c.revoked_at) THEN
    RAISE EXCEPTION 'documentos_fechados' USING ERRCODE = 'HRA63';
  END IF;

  -- Primeiro conta a tentativa; os erros seguintes saem em jsonb (sem RAISE).
  v_t := least(v_c.otp_tentativas + 1, c_meta_max);
  UPDATE public.pessoas_convites_admissao SET otp_tentativas = v_t WHERE id = v_c.id;

  IF v_c.otp_hmac IS NULL OR v_c.otp_expira_em IS NULL OR v_c.otp_expira_em <= now() THEN
    RETURN jsonb_build_object('erro', 'otp_expirado', 'restantes', 0);
  END IF;

  SELECT count(*) INTO v_falhas
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.convite_id = v_c.id
     AND e.criado_em > now() - c_janela
     AND e.acao = 'otp_falhado';
  IF v_falhas >= c_falhas_dia THEN
    RETURN jsonb_build_object('erro', 'otp_bloqueado', 'restantes', 0);
  END IF;

  IF v_t > c_max THEN
    IF v_t = c_max + 1 THEN
      INSERT INTO public.pessoas_convites_admissao_eventos
        (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
      VALUES
        (v_c.id, v_c.organization_id, 'otp_falhado', 'pessoa', NULL, v_c.estado, v_c.estado,
         jsonb_build_object('tentativas', v_t, 'erro_codigo', 'otp_bloqueado'));
    END IF;
    RETURN jsonb_build_object('erro', 'otp_bloqueado', 'restantes', 0);
  END IF;

  IF v_c.otp_hmac <> p_otp_hmac THEN
    INSERT INTO public.pessoas_convites_admissao_eventos
      (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
    VALUES
      (v_c.id, v_c.organization_id, 'otp_falhado', 'pessoa', NULL, v_c.estado, v_c.estado,
       jsonb_build_object('tentativas', v_t));
    RETURN jsonb_build_object('erro', 'otp_invalido', 'restantes', greatest(c_max - v_t, 0));
  END IF;

  v_ativa := v_c.sessao_hash IS NOT NULL
         AND v_c.sessao_hash <> p_sessao_hash
         AND public.hr_convite_sessao_valida(v_c.sessao_iniciada_em, v_c.sessao_ultima_atividade_em, now());

  BEGIN
    UPDATE public.pessoas_convites_admissao
       SET otp_hmac                   = NULL,
           otp_expira_em              = NULL,
           otp_tentativas             = 0,
           sessao_hash                = p_sessao_hash,
           sessao_iniciada_em         = now(),
           sessao_ultima_atividade_em = now(),
           sessao_falhas              = 0
     WHERE id = v_c.id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('erro', 'pedido_invalido', 'restantes', greatest(c_max - v_t, 0));
  END;

  IF v_ativa THEN
    INSERT INTO public.pessoas_convites_admissao_eventos
      (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
    VALUES
      (v_c.id, v_c.organization_id, 'sessao_substituida', 'pessoa', NULL, v_c.estado, v_c.estado, '{}'::jsonb);
  END IF;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'otp_validado', 'pessoa', NULL, v_c.estado, v_c.estado,
     jsonb_build_object('tipo', 'documentos', 'tentativas', v_t)),
    (v_c.id, v_c.organization_id, 'sessao_iniciada', 'pessoa', NULL, v_c.estado, v_c.estado, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'sessao_expira_em', now() + c_inatividade);
END;
$$;

-- 7.4 Ler: tudo o que a pessoa ve no portal, numa chamada, sem ciclo por linha.
CREATE FUNCTION public.rpc_hr_portal_documentos_ler(p_token_hash text, p_sessao_hash text)
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
$$;

-- 7.5 Conteudo de um documento (o HTML vai para o browser e e sanitizado la).
CREATE FUNCTION public.rpc_hr_portal_documento_conteudo(p_token_hash text, p_sessao_hash text, p_envio_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- 7.6 O ficheiro de um documento: so para a Edge assinar um URL de 60 s.
CREATE FUNCTION public.rpc_hr_portal_documento_ficheiro(p_token_hash text, p_sessao_hash text, p_envio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s       record;
  v_e       record;
  v_caminho text;
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
  SELECT d.ficheiro_caminho INTO v_caminho
    FROM public.pessoas_documentos d
   WHERE d.id = v_e.documento_id AND d.deleted_at IS NULL
     -- Nunca o conteudo de um rascunho nem de um documento anulado.
     AND d.estado IN ('a_aguardar_assinatura', 'assinado', 'entregue');
  IF v_caminho IS NULL THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_e.visto_em IS NULL THEN
    UPDATE public.pessoas_portal_envios SET visto_em = now() WHERE id = v_e.id;
    PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'envio', v_e.id,
                                    'visto', 'pessoa', NULL);
  END IF;
  -- O caminho fica na Edge; nunca vai para o browser.
  RETURN jsonb_build_object('bucket', 'hr-documentos', 'caminho', v_caminho);
END;
$$;

-- 7.7 Pedir o codigo SMS para assinar. A Edge gera o codigo (6 digitos), calcula
--     o HMAC com o pepper e envia o SMS para o "telemovel" devolvido. A base so
--     guarda o HMAC e o SHA-256 do texto nesse instante (sms_conteudo_sha256).
--     Validade 5 min; reenviar so aos 60 s; no maximo 3 codigos por pessoa em
--     10 min e 10 em 24 h; 15 falhas em 24 h bloqueiam.
CREATE FUNCTION public.rpc_hr_portal_documento_codigo_pedir(
  p_token_hash text, p_sessao_hash text, p_envio_id uuid, p_codigo_hmac text, p_ip inet DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_validade   constant interval := interval '5 minutes';
  c_espera     constant interval := interval '60 seconds';
  c_janela     constant interval := interval '10 minutes';
  c_max_janela constant integer  := 3;
  c_max_dia    constant integer  := 10;
  c_falhas_dia constant integer  := 15;
  v_s        record;
  v_e        record;
  v_tel      text;
  v_mascara  text;
  v_n        integer;
  v_ultimo   timestamptz;
  v_expira   timestamptz := now() + c_validade;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  IF p_codigo_hmac IS NULL OR p_codigo_hmac !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT e.id, e.exige_assinatura, e.recusado_em, d.estado AS doc_estado,
         public.hr_documento_conteudo_sha256(d.corpo_html, d.ficheiro_hash_sha256) AS conteudo_sha256
    INTO v_e
    FROM public.pessoas_portal_envios e
    JOIN public.pessoas_documentos d ON d.id = e.documento_id AND d.deleted_at IS NULL
   WHERE e.id = p_envio_id AND e.pessoa_id = v_s.pessoa_id AND e.organization_id = v_s.organization_id
     AND e.retirado_em IS NULL
   FOR UPDATE OF e, d;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF NOT v_e.exige_assinatura OR v_e.recusado_em IS NOT NULL OR v_e.doc_estado <> 'a_aguardar_assinatura' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  v_tel := public.hr_pessoa_telemovel(v_s.pessoa_id, v_s.organization_id);
  IF v_tel IS NULL THEN
    RAISE EXCEPTION 'sem_telemovel' USING ERRCODE = 'HRA64';
  END IF;
  v_mascara := public.hr_telemovel_mascarar(v_tel);

  -- Os limites sao por pessoa (o custo do SMS e por numero); em fila por pessoa.
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_portal_sms:' || v_s.pessoa_id::text, 0));
  SELECT count(*), max(ev.criado_em) INTO v_n, v_ultimo
    FROM public.pessoas_portal_eventos ev
   WHERE ev.pessoa_id = v_s.pessoa_id AND ev.evento = 'codigo_pedido' AND ev.criado_em > now() - c_janela;
  IF v_ultimo IS NOT NULL AND v_ultimo > now() - c_espera THEN
    RAISE EXCEPTION 'otp_espera' USING ERRCODE = 'HRA42';
  END IF;
  IF v_n >= c_max_janela THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;
  -- Tecto de 24 h (dentro do mesmo advisory lock).
  SELECT count(*) INTO v_n
    FROM public.pessoas_portal_eventos ev
   WHERE ev.pessoa_id = v_s.pessoa_id AND ev.evento = 'codigo_pedido' AND ev.criado_em > now() - interval '24 hours';
  IF v_n >= c_max_dia THEN
    RAISE EXCEPTION 'otp_limite_diario' USING ERRCODE = 'HRA43';
  END IF;
  SELECT count(*) INTO v_n
    FROM public.pessoas_portal_eventos ev
   WHERE ev.pessoa_id = v_s.pessoa_id AND ev.evento = 'codigo_falhado' AND ev.criado_em > now() - interval '24 hours';
  IF v_n >= c_falhas_dia THEN
    RAISE EXCEPTION 'otp_bloqueado' USING ERRCODE = 'HRA45';
  END IF;

  UPDATE public.pessoas_portal_envios
     SET sms_codigo_hmac = p_codigo_hmac, sms_codigo_expira_em = v_expira, sms_codigo_tentativas = 0,
         sms_codigo_pedido_em = now(), sms_telemovel_mascarado = v_mascara,
         sms_conteudo_sha256 = v_e.conteudo_sha256
   WHERE id = v_e.id;

  PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'envio', v_e.id,
                                  'codigo_pedido', 'pessoa', NULL, p_ip, NULL);

  -- "telemovel" e SO para a Edge enviar o SMS: nunca vai para o browser nem para logs.
  RETURN jsonb_build_object('telemovel', v_tel, 'telemovel_mascarado', v_mascara,
                            'expira_em', v_expira, 'reenviar_em', now() + c_espera);
END;
$$;

-- 7.8 Assinar com o codigo SMS. Os erros do codigo saem em jsonb {erro, restantes}
--     (sem RAISE) para a tentativa ficar contada.
CREATE FUNCTION public.rpc_hr_portal_documento_assinar(
  p_token_hash text, p_sessao_hash text, p_envio_id uuid, p_codigo_hmac text, p_aceite boolean,
  p_nome text DEFAULT NULL, p_ip inet DEFAULT NULL, p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max        constant integer := 5;
  c_meta_max   constant integer := 1000;
  c_falhas_dia constant integer := 15;
  v_s    record;
  v_e    record;
  -- p_nome fica na assinatura (a Edge envia-o) mas e IGNORADO: grava-se sempre o nome da ficha.
  v_nome text;
  v_t    integer;
  v_n    integer;
  v_ref  text;
  v_em   timestamptz;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);

  -- O envio E o documento ficam trancados ate ao fim: o texto comparado e o assinado.
  SELECT e.id, e.documento_id, e.exige_assinatura, e.recusado_em, e.sms_codigo_hmac, e.sms_codigo_expira_em,
         e.sms_codigo_tentativas, e.sms_telemovel_mascarado, e.sms_conteudo_sha256, d.estado AS doc_estado,
         public.hr_documento_conteudo_sha256(d.corpo_html, d.ficheiro_hash_sha256) AS conteudo_sha256
    INTO v_e
    FROM public.pessoas_portal_envios e
    JOIN public.pessoas_documentos d ON d.id = e.documento_id AND d.deleted_at IS NULL
   WHERE e.id = p_envio_id AND e.pessoa_id = v_s.pessoa_id AND e.organization_id = v_s.organization_id
     AND e.retirado_em IS NULL
   FOR UPDATE OF e, d;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF NOT v_e.exige_assinatura OR v_e.recusado_em IS NOT NULL OR v_e.doc_estado <> 'a_aguardar_assinatura' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  IF p_aceite IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'aceite_obrigatorio' USING ERRCODE = 'HRA61';
  END IF;
  IF p_codigo_hmac IS NULL OR p_codigo_hmac !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  -- O texto mudou desde que o codigo foi pedido: nao se assina e NAO se gasta a
  -- tentativa (a culpa nao e da pessoa); o codigo deixa de valer e pede-se outro.
  IF v_e.sms_codigo_hmac IS NOT NULL AND v_e.sms_conteudo_sha256 IS DISTINCT FROM v_e.conteudo_sha256 THEN
    UPDATE public.pessoas_portal_envios
       SET sms_codigo_hmac = NULL, sms_codigo_expira_em = NULL
     WHERE id = v_e.id;
    RETURN jsonb_build_object('erro', 'conteudo_alterado', 'restantes', 0);
  END IF;

  -- Conta a tentativa primeiro.
  v_t := least(v_e.sms_codigo_tentativas + 1, c_meta_max);
  UPDATE public.pessoas_portal_envios SET sms_codigo_tentativas = v_t WHERE id = v_e.id;

  IF v_e.sms_codigo_hmac IS NULL OR v_e.sms_codigo_expira_em <= now() THEN
    RETURN jsonb_build_object('erro', 'otp_expirado', 'restantes', 0);
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_portal_eventos ev
   WHERE ev.pessoa_id = v_s.pessoa_id AND ev.evento = 'codigo_falhado' AND ev.criado_em > now() - interval '24 hours';
  IF v_n >= c_falhas_dia THEN
    RETURN jsonb_build_object('erro', 'otp_bloqueado', 'restantes', 0);
  END IF;

  IF v_t > c_max THEN
    IF v_t = c_max + 1 THEN
      PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'envio', v_e.id,
                                      'codigo_falhado', 'pessoa', NULL, p_ip, p_user_agent);
    END IF;
    RETURN jsonb_build_object('erro', 'otp_bloqueado', 'restantes', 0);
  END IF;

  IF v_e.sms_codigo_hmac <> p_codigo_hmac THEN
    PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'envio', v_e.id,
                                    'codigo_falhado', 'pessoa', NULL, p_ip, p_user_agent);
    RETURN jsonb_build_object('erro', 'otp_invalido', 'restantes', greatest(c_max - v_t, 0));
  END IF;

  -- Certo: uso unico.
  UPDATE public.pessoas_portal_envios
     SET sms_codigo_hmac = NULL, sms_codigo_expira_em = NULL, sms_codigo_tentativas = 0
   WHERE id = v_e.id;

  SELECT nullif(btrim(p.nome_completo), '') INTO v_nome FROM public.pessoas p WHERE p.id = v_s.pessoa_id;
  v_ref := 'SMS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  v_em := public.hr_documento_assinar_nucleo(v_e.documento_id, 'portal', 'sms', NULL, p_ip, p_user_agent,
                                             left(v_nome, 200), v_e.sms_telemovel_mascarado, v_ref);

  PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'envio', v_e.id,
                                  'assinado', 'pessoa', NULL, p_ip, p_user_agent);

  RETURN jsonb_build_object('ok', true, 'assinado_em', v_em, 'referencia', v_ref);
END;
$$;

-- 7.9 Recusar assinar (o documento fica como esta; o RH decide).
CREATE FUNCTION public.rpc_hr_portal_documento_recusar(
  p_token_hash text, p_sessao_hash text, p_envio_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s      record;
  v_e      record;
  v_motivo text := btrim(p_motivo);
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT e.id, e.exige_assinatura, e.recusado_em, d.estado AS doc_estado INTO v_e
    FROM public.pessoas_portal_envios e
    JOIN public.pessoas_documentos d ON d.id = e.documento_id AND d.deleted_at IS NULL
   WHERE e.id = p_envio_id AND e.pessoa_id = v_s.pessoa_id AND e.organization_id = v_s.organization_id
     AND e.retirado_em IS NULL
   FOR UPDATE OF e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 3 OR length(v_motivo) > 2000 THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;
  IF NOT v_e.exige_assinatura OR v_e.recusado_em IS NOT NULL OR v_e.doc_estado <> 'a_aguardar_assinatura' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  UPDATE public.pessoas_portal_envios
     SET recusado_em = now(), recusa_motivo = v_motivo, sms_codigo_hmac = NULL, sms_codigo_expira_em = NULL
   WHERE id = v_e.id;
  PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'envio', v_e.id,
                                  'recusado', 'pessoa', NULL);
END;
$$;

-- 7.10 Reservar um ficheiro para um pedido do RH (fica pendente na quarentena).
CREATE FUNCTION public.rpc_hr_portal_pedido_ficheiro_reservar(
  p_token_hash text, p_sessao_hash text, p_pedido_id uuid, p_nome text, p_mime text, p_tamanho integer,
  p_ip inet DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_ficheiros constant integer := 4;
  v_s    record;
  v_p    record;
  v_nome text := btrim(p_nome);
  v_ext  text;
  v_id   uuid := gen_random_uuid();
  v_cam  text;
  v_n    integer;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT p.id, p.tipo, p.estado INTO v_p
    FROM public.pessoas_portal_pedidos p
   WHERE p.id = p_pedido_id AND p.pessoa_id = v_s.pessoa_id AND p.organization_id = v_s.organization_id
     AND p.direcao = 'rh_pede'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_p.estado NOT IN ('por_enviar', 'recusado') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  v_ext := CASE p_mime WHEN 'application/pdf' THEN 'pdf' WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' END;
  IF v_ext IS NULL OR v_nome IS NULL OR length(v_nome) NOT BETWEEN 1 AND 200 OR v_nome ~ '[/\\]'
     OR p_tamanho IS NULL OR p_tamanho < 1 OR p_tamanho > 10485760 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_anexos a
   WHERE a.pedido_id = v_p.id AND a.estado IN ('pendente', 'ligado');
  IF v_n >= c_max_ficheiros THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  v_cam := 'admissao/pedidos/' || v_p.id::text || '/' || v_id::text || '.' || v_ext;
  INSERT INTO public.pessoas_anexos
    (id, organization_id, pessoa_id, convite_id, tipo, estado, bucket, caminho, nome_original,
     upload_ip, caminho_quarentena, origem, pedido_id)
  VALUES
    (v_id, v_s.organization_id, v_s.pessoa_id, NULL, v_p.tipo, 'pendente', 'hr-documentos-quarantine', v_cam,
     v_nome, p_ip, v_cam, 'portal_pedido', v_p.id);

  RETURN jsonb_build_object('anexo_id', v_id, 'caminho_quarentena', v_cam);
END;
$$;

-- 7.10b O contexto de um ficheiro pendente, para a Edge o verificar e montar o
--       caminho final <org>/<pessoa>/admissao/<anexo>.<ext> (que a _ligar exige).
--       So o anexo pendente de um pedido da pessoa do convite. Nunca vai ao browser.
CREATE FUNCTION public.rpc_hr_portal_pedido_ficheiro_contexto(p_token_hash text, p_sessao_hash text, p_anexo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s record;
  v_a record;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT a.id, a.caminho_quarentena, a.organization_id, a.pessoa_id, a.tipo, p.estado AS pedido_estado INTO v_a
    FROM public.pessoas_anexos a
    JOIN public.pessoas_portal_pedidos p ON p.id = a.pedido_id
   WHERE a.id = p_anexo_id AND a.pessoa_id = v_s.pessoa_id AND a.organization_id = v_s.organization_id
     AND a.origem = 'portal_pedido' AND a.estado = 'pendente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_a.pedido_estado NOT IN ('por_enviar', 'recusado') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  RETURN jsonb_build_object('caminho_quarentena', v_a.caminho_quarentena,
                            'organization_id', v_a.organization_id,
                            'pessoa_id', v_a.pessoa_id,
                            'tipo', v_a.tipo);
END;
$$;

-- 7.11 Ligar o ficheiro depois de a Edge o ter verificado (assinatura real dos
--      bytes, tamanho real, SHA-256) e copiado para hr-documentos.
CREATE FUNCTION public.rpc_hr_portal_pedido_ficheiro_ligar(
  p_token_hash text, p_sessao_hash text, p_anexo_id uuid, p_caminho_final text, p_sha256 text,
  p_tamanho integer, p_mime text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s   record;
  v_a   record;
  v_ext text;
  v_cam text;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT a.id, a.nome_original, a.pedido_id, p.estado AS pedido_estado INTO v_a
    FROM public.pessoas_anexos a
    JOIN public.pessoas_portal_pedidos p ON p.id = a.pedido_id
   WHERE a.id = p_anexo_id AND a.pessoa_id = v_s.pessoa_id AND a.organization_id = v_s.organization_id
     AND a.origem = 'portal_pedido' AND a.estado = 'pendente'
   FOR UPDATE OF a, p;  -- o pedido tambem: nao muda de estado (enviar) a meio
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_a.pedido_estado NOT IN ('por_enviar', 'recusado') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  v_ext := CASE p_mime WHEN 'application/pdf' THEN 'pdf' WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' END;
  v_cam := v_s.organization_id::text || '/' || v_s.pessoa_id::text || '/admissao/' || v_a.id::text || '.' || v_ext;
  IF v_ext IS NULL OR p_caminho_final IS DISTINCT FROM v_cam
     OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$'
     OR p_tamanho IS NULL OR p_tamanho < 1 OR p_tamanho > 10485760 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  UPDATE public.pessoas_anexos
     SET estado = 'ligado', bucket = 'hr-documentos', caminho = v_cam, mime_type = p_mime,
         tamanho_bytes = p_tamanho, hash_sha256 = p_sha256, ligado_em = now()
   WHERE id = v_a.id;

  PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'anexo', v_a.id,
                                  'ficheiro_enviado', 'pessoa', NULL);
  RETURN jsonb_build_object('id', v_a.id, 'nome', v_a.nome_original, 'estado', 'ligado');
END;
$$;

-- 7.12 Remover um ficheiro de um pedido ainda por enviar (ou recusado). Devolve o
--      que a Edge apaga; o que ficar, a limpeza dos anexos apanha (passo c).
CREATE FUNCTION public.rpc_hr_portal_pedido_ficheiro_remover(p_token_hash text, p_sessao_hash text, p_anexo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s record;
  v_a record;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT a.id, a.bucket, a.caminho, a.caminho_quarentena, p.estado AS pedido_estado INTO v_a
    FROM public.pessoas_anexos a
    JOIN public.pessoas_portal_pedidos p ON p.id = a.pedido_id
   WHERE a.id = p_anexo_id AND a.pessoa_id = v_s.pessoa_id AND a.organization_id = v_s.organization_id
     AND a.origem = 'portal_pedido' AND a.estado IN ('pendente', 'ligado')
   FOR UPDATE OF a, p;  -- o pedido tambem: nao muda de estado (enviar) a meio
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_a.pedido_estado NOT IN ('por_enviar', 'recusado') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  UPDATE public.pessoas_anexos
     SET estado = 'apagado', apagado_em = now(), apagado_motivo = 'removido_pela_pessoa'
   WHERE id = v_a.id;

  PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'anexo', v_a.id,
                                  'ficheiro_removido', 'pessoa', NULL);
  RETURN jsonb_build_object('caminhos', jsonb_build_array(
    jsonb_build_object('bucket', v_a.bucket, 'caminho', v_a.caminho),
    jsonb_build_object('bucket', 'hr-documentos-quarantine', 'caminho', v_a.caminho_quarentena)));
END;
$$;

-- 7.13 Enviar ao RH o que o pedido pedia (1 a 4 ficheiros ligados).
CREATE FUNCTION public.rpc_hr_portal_pedido_enviar(p_token_hash text, p_sessao_hash text, p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s record;
  v_p record;
  v_n integer;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT p.id, p.estado INTO v_p
    FROM public.pessoas_portal_pedidos p
   WHERE p.id = p_pedido_id AND p.pessoa_id = v_s.pessoa_id AND p.organization_id = v_s.organization_id
     AND p.direcao = 'rh_pede'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_p.estado NOT IN ('por_enviar', 'recusado') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  SELECT count(*) INTO v_n FROM public.pessoas_anexos a WHERE a.pedido_id = v_p.id AND a.estado = 'ligado';
  IF v_n < 1 OR v_n > 4 THEN
    RAISE EXCEPTION 'sem_ficheiro' USING ERRCODE = 'HRA62';
  END IF;

  UPDATE public.pessoas_portal_pedidos SET estado = 'enviado', enviado_em = now() WHERE id = v_p.id;
  PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'pedido', v_p.id,
                                  'pedido_enviado', 'pessoa', NULL);
END;
$$;

-- 7.14 A pessoa pede um documento ao RH (no maximo 10 abertos).
CREATE FUNCTION public.rpc_hr_portal_pedido_ao_rh(
  p_token_hash text, p_sessao_hash text, p_tipo text, p_titulo text, p_nota text, p_urgencia text DEFAULT 'normal')
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s      record;
  v_titulo text := nullif(btrim(p_titulo), '');
  v_nota   text := nullif(btrim(p_nota), '');
  v_urg    text := coalesce(nullif(btrim(p_urgencia), ''), 'normal');
  v_n      integer;
  v_id     uuid;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  IF p_tipo IS NULL OR p_tipo NOT IN ('declaracao_vinculo', 'comprovativo_rendimentos', 'copia_contrato', 'outro')
     OR (p_tipo = 'outro' AND v_titulo IS NULL)
     OR (v_titulo IS NOT NULL AND length(v_titulo) > 200)
     OR (v_nota IS NOT NULL AND length(v_nota) > 2000)
     OR v_urg NOT IN ('normal', 'urgente') THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hr_portal_pedidos:' || v_s.pessoa_id::text, 0));
  SELECT count(*) INTO v_n
    FROM public.pessoas_portal_pedidos p
   WHERE p.pessoa_id = v_s.pessoa_id AND p.direcao = 'pessoa_pede' AND p.estado IN ('pedido', 'em_preparacao');
  IF v_n >= 10 THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  INSERT INTO public.pessoas_portal_pedidos
    (organization_id, pessoa_id, convite_id, direcao, tipo, titulo, nota, urgencia, estado)
  VALUES
    (v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'pessoa_pede', p_tipo, v_titulo, v_nota, v_urg, 'pedido')
  RETURNING id INTO v_id;

  PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'pedido', v_id,
                                  'pedido_criado', 'pessoa', NULL);
  RETURN v_id;
END;
$$;

-- 7.15 A pessoa cancela um pedido seu ainda por tratar.
CREATE FUNCTION public.rpc_hr_portal_pedido_cancelar_meu(p_token_hash text, p_sessao_hash text, p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s record;
  v_p record;
BEGIN
  SELECT * INTO v_s FROM public.hr_convite_sessao_exigir_documentos(p_token_hash, p_sessao_hash);
  SELECT p.id, p.estado INTO v_p
    FROM public.pessoas_portal_pedidos p
   WHERE p.id = p_pedido_id AND p.pessoa_id = v_s.pessoa_id AND p.organization_id = v_s.organization_id
     AND p.direcao = 'pessoa_pede'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  IF v_p.estado <> 'pedido' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;
  UPDATE public.pessoas_portal_pedidos SET estado = 'cancelado' WHERE id = v_p.id;
  PERFORM public.hr_portal_evento(v_s.organization_id, v_s.pessoa_id, v_s.convite_id, 'pedido', v_p.id,
                                  'cancelado', 'pessoa', NULL);
END;
$$;

-- ==============================================================================
-- 8. EXECUTE explicito (o Supabase da EXECUTE por omissao a anon e authenticated)
-- ==============================================================================

-- RH: so authenticated (com a permissao verificada por dentro).
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_aprovar(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_rejeitar(uuid, uuid, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_enviar_contrato(uuid, uuid, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_envio_retirar(uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_criar(uuid, text, text, text, date, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_decidir(uuid, boolean, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_cancelar(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_pessoa_tratar(uuid, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_pessoa_responder(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_ficheiros(uuid) FROM PUBLIC, anon, service_role;
-- Do RH mas chamadas pela Edge (JWT validado la, p_actor dele): so service_role.
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_url_rh(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documentos_link(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_url_rh(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documentos_link(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_aprovar(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_rejeitar(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_enviar_contrato(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_envio_retirar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_criar(uuid, text, text, text, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_decidir(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_cancelar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_pessoa_tratar(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_pessoa_responder(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_ficheiros(uuid) TO authenticated;

-- Portal: so service_role (a Edge).
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documentos_estado(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documentos_otp_pedir(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documentos_otp_verificar(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documentos_ler(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documento_conteudo(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documento_ficheiro(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documento_codigo_pedir(text, text, uuid, text, inet) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documento_assinar(text, text, uuid, text, boolean, text, inet, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_documento_recusar(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_reservar(text, text, uuid, text, text, integer, inet) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_ligar(text, text, uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_contexto(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_contexto(text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_remover(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_enviar(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_ao_rh(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_hr_portal_pedido_cancelar_meu(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documentos_estado(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documentos_otp_pedir(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documentos_otp_verificar(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documentos_ler(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documento_conteudo(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documento_ficheiro(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documento_codigo_pedir(text, text, uuid, text, inet) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documento_assinar(text, text, uuid, text, boolean, text, inet, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_documento_recusar(text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_reservar(text, text, uuid, text, text, integer, inet) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_ligar(text, text, uuid, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_ficheiro_remover(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_enviar(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_ao_rh(text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_portal_pedido_cancelar_meu(text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_admissao_aprovar(uuid, uuid) IS
'Aprova uma admissao submetida (submetida -> aprovada). JWT do RH; p_organization_id (activeCompany) tem de ser a do processo; hr.onboarding.approve (42501). Recusas: nao_encontrado HRA31, estado_invalido HRA38, limite_excedido HRA41 (60 eventos/hora do actor). Nao escreve na ficha (a submissao ja o fez). Desde 20270101460000.';
COMMENT ON FUNCTION public.rpc_hr_admissao_rejeitar(uuid, uuid, text, text) IS
'Rejeita uma admissao submetida: estado rejeitada, portal revogado, mensagem a pessoa (3-2000) e motivo interno opcional; apaga sessao e OTP. hr.onboarding.approve (42501). Recusas: HRA31, HRA37, HRA38, HRA41. O e-mail a pessoa e da Edge. Desde 20270101460000.';
COMMENT ON FUNCTION public.rpc_hr_admissao_enviar_contrato(uuid, uuid, integer) IS
'Emite o contrato (rpc_hr_documento_emitir, sem a alterar) de um modelo tipo contrato activo da organizacao do processo, poe-no no portal para assinar, abre a janela de documentos (1-30 dias, sem encurtar) e passa aprovada -> a_aguardar_assinaturas. Devolve documento_id, envio_id, portal_documentos_ate e tem_telemovel (false = aviso ao RH: a pessoa nao vai receber o SMS). hr.pessoas.documentos.emitir. Desde 20270101460000.';
COMMENT ON FUNCTION public.rpc_hr_portal_documento_codigo_pedir(text, text, uuid, text, inet) IS
'Portal (service_role). Guarda o HMAC do codigo SMS de assinatura (a Edge gera o codigo e envia o SMS para o telemovel devolvido, que nunca vai para o browser). Validade 5 min; reenvio aos 60 s (HRA42); 3 codigos por pessoa em 10 min (HRA41); 15 falhas em 24 h (HRA45); sem telemovel valido na ficha HRA64 sem_telemovel. Desde 20270101460000.';
COMMENT ON FUNCTION public.rpc_hr_portal_documento_assinar(text, text, uuid, text, boolean, text, inet, text) IS
'Portal (service_role). Assina com o codigo SMS: aceite obrigatorio (HRA61), 5 tentativas por codigo; erros do codigo em jsonb {erro: otp_expirado|otp_bloqueado|otp_invalido, restantes} para a tentativa ficar contada. Certo: assina pelo nucleo (origem portal, metodo sms, telemovel mascarado, referencia SMS-XXXXXX, SHA-256 do texto) e devolve {ok, assinado_em, referencia}. Desde 20270101460000.';
COMMENT ON FUNCTION public.rpc_hr_portal_documentos_estado(text, text) IS
'Portal (service_role). Estado publico do link na janela de documentos: a Edge chama-a antes da rpc_hr_convite_admissao_estado. Fechada: so {documentos_abertos: false}, sem contar tentativas. Aberta: estado, documentos_ate, primeiro nome, organizacao, bloqueado, precisa_otp. Desde 20270101460000.';

-- ==============================================================================
-- 9. Conferir: falha o push se o resultado nao for o esperado
-- ==============================================================================
DO $conferir$
DECLARE
  v_col   text;
  v_esp   text[];
  v_tab   text;
  v_fn    text;
  v_lidos text[];
  v_portal text[] := ARRAY[
    'public.rpc_hr_portal_documentos_estado(text, text)',
    'public.rpc_hr_portal_documentos_otp_pedir(text, text)',
    'public.rpc_hr_portal_documentos_otp_verificar(text, text, text)',
    'public.rpc_hr_portal_documentos_ler(text, text)',
    'public.rpc_hr_portal_documento_conteudo(text, text, uuid)',
    'public.rpc_hr_portal_documento_ficheiro(text, text, uuid)',
    'public.rpc_hr_portal_documento_codigo_pedir(text, text, uuid, text, inet)',
    'public.rpc_hr_portal_documento_assinar(text, text, uuid, text, boolean, text, inet, text)',
    'public.rpc_hr_portal_documento_recusar(text, text, uuid, text)',
    'public.rpc_hr_portal_pedido_ficheiro_reservar(text, text, uuid, text, text, integer, inet)',
    'public.rpc_hr_portal_pedido_ficheiro_ligar(text, text, uuid, text, text, integer, text)',
    'public.rpc_hr_portal_pedido_ficheiro_contexto(text, text, uuid)',
    'public.rpc_hr_portal_pedido_ficheiro_url_rh(uuid, uuid, uuid)',
    'public.rpc_hr_portal_documentos_link(uuid, uuid, uuid)',
    'public.rpc_hr_portal_pedido_ficheiro_remover(text, text, uuid)',
    'public.rpc_hr_portal_pedido_enviar(text, text, uuid)',
    'public.rpc_hr_portal_pedido_ao_rh(text, text, text, text, text, text)',
    'public.rpc_hr_portal_pedido_cancelar_meu(text, text, uuid)'];
  v_rh text[] := ARRAY[
    'public.rpc_hr_admissao_aprovar(uuid, uuid)',
    'public.rpc_hr_admissao_rejeitar(uuid, uuid, text, text)',
    'public.rpc_hr_admissao_enviar_contrato(uuid, uuid, integer)',
    'public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean)',
    'public.rpc_hr_portal_envio_retirar(uuid, text)',
    'public.rpc_hr_portal_pedido_criar(uuid, text, text, text, date, uuid)',
    'public.rpc_hr_portal_pedido_decidir(uuid, boolean, text)',
    'public.rpc_hr_portal_pedido_cancelar(uuid)',
    'public.rpc_hr_portal_pedido_pessoa_tratar(uuid, text, text)',
    'public.rpc_hr_portal_pedido_pessoa_responder(uuid, uuid)',
    'public.rpc_hr_portal_pedido_ficheiros(uuid)'];
  v_internas text[] := ARRAY[
    'public.hr_telemovel_normalizar(text)',
    'public.hr_telemovel_mascarar(text)',
    'public.hr_pessoa_telemovel(uuid, uuid)',
    'public.hr_convite_documentos_abertos(text, timestamptz, timestamptz)',
    'public.hr_telemovel_indicativos_permitidos()',
    'public.hr_documento_conteudo_sha256(text, text)',
    'public.hr_documentos_conteudo_no_portal()',
    'public.hr_convite_link_token_documentos(uuid)',
    'public.hr_portal_anexo_tipo_permitido(uuid, text, uuid)',
    'public.hr_portal_evento(uuid, uuid, uuid, text, uuid, text, text, uuid, inet, text)',
    'public.hr_convite_sessao_exigir_documentos(text, text)',
    'public.hr_documento_assinar_nucleo(uuid, text, text, uuid, inet, text, text, text, text)',
    'public.hr_convite_avaliar_assinaturas(uuid)',
    'public.hr_portal_documento_assinado()',
    'public.hr_documentos_entregue_imutavel()',
    'public.hr_portal_eventos_imutavel()',
    'public.hr_portal_pedido_coerencia()',
    'public.hr_portal_envio_coerencia()'];
BEGIN
  -- 1. Paridade das colunas concedidas a authenticated, tabela a tabela: as
  --    concedidas sao EXACTAMENTE as esperadas; qualquer outra (incluindo
  --    futuras) fica fechada; anon nao le nenhuma; ninguem escreve.
  FOR v_tab, v_esp IN
    SELECT t.tab, t.esp FROM (VALUES
      ('public.pessoas_documentos', ARRAY[
         'anulado_em','anulado_motivo','anulado_por','assinado_em','assinado_por_auth_uid','assinatura_origem',
         'created_at','created_by','deleted_at','deleted_by','emitido_em','emitido_por','estado',
         'ficheiro_anexado_em','ficheiro_anexado_por','ficheiro_caminho','ficheiro_hash_sha256','id','modelo_id',
         'organization_id','pessoa_id','tipo','titulo','updated_at','updated_by','vinculo_id',
         'assinatura_nome','assinatura_conteudo_sha256','assinatura_metodo','assinatura_telemovel_mascarado',
         'assinatura_referencia','entregue_em']::text[]),
      ('public.pessoas_anexos', ARRAY[
         'id','organization_id','pessoa_id','tipo','estado','nome_original','mime_type','tamanho_bytes',
         'promovido_em','criado_em']::text[]),
      ('public.pessoas_convites_admissao', ARRAY[]::text[]),
      ('public.pessoas_portal_pedidos', ARRAY[
         'id','organization_id','pessoa_id','convite_id','direcao','tipo','titulo','nota','prazo','urgencia',
         'estado','motivo_recusa','criado_por','criado_em','enviado_em','decidido_em','decidido_por',
         'updated_at']::text[]),
      ('public.pessoas_portal_envios', ARRAY[
         'id','organization_id','pessoa_id','documento_id','convite_id','pedido_id','exige_assinatura',
         'enviado_por','enviado_em','visto_em','recusado_em','recusa_motivo','retirado_em','retirado_por',
         'retirado_motivo']::text[]),
      ('public.pessoas_portal_eventos', ARRAY[
         'id','organization_id','pessoa_id','convite_id','entidade','entidade_id','evento','actor',
         'actor_auth_uid','criado_em']::text[])
    ) AS t(tab, esp)
  LOOP
    FOREACH v_col IN ARRAY v_esp LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = v_tab::regclass
                      AND a.attname = v_col AND a.attnum > 0 AND NOT a.attisdropped) THEN
        RAISE EXCEPTION 'Conferir: a coluna concedida %.% nao existe.', v_tab, v_col;
      END IF;
    END LOOP;
    FOR v_col IN
      SELECT a.attname::text FROM pg_attribute a
       WHERE a.attrelid = v_tab::regclass AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      IF (v_col = ANY (v_esp)) IS DISTINCT FROM has_column_privilege('authenticated', v_tab, v_col, 'SELECT') THEN
        RAISE EXCEPTION 'Conferir: o SELECT de authenticated em %.% diverge do esperado.', v_tab, v_col;
      END IF;
      IF has_column_privilege('anon', v_tab, v_col, 'SELECT') THEN
        RAISE EXCEPTION 'Conferir: anon le %.%.', v_tab, v_col;
      END IF;
    END LOOP;
    IF has_table_privilege('authenticated', v_tab, 'INSERT') OR has_table_privilege('authenticated', v_tab, 'UPDATE')
       OR has_table_privilege('authenticated', v_tab, 'DELETE') OR has_table_privilege('anon', v_tab, 'INSERT')
       OR has_table_privilege('anon', v_tab, 'UPDATE') OR has_table_privilege('anon', v_tab, 'DELETE') THEN
      RAISE EXCEPTION 'Conferir: % tem escrita para anon ou authenticated.', v_tab;
    END IF;
  END LOOP;

  -- 2. corpo_html, IP, agente e o HMAC do SMS continuam fechados.
  IF has_column_privilege('authenticated', 'public.pessoas_documentos', 'corpo_html', 'SELECT')
     OR has_column_privilege('authenticated', 'public.pessoas_documentos', 'assinatura_ip', 'SELECT')
     OR has_column_privilege('authenticated', 'public.pessoas_portal_eventos', 'ip', 'SELECT')
     OR has_column_privilege('authenticated', 'public.pessoas_portal_eventos', 'user_agent', 'SELECT')
     OR has_column_privilege('authenticated', 'public.pessoas_portal_envios', 'sms_codigo_hmac', 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: uma coluna fechada (corpo_html, ip, user_agent, sms_codigo_hmac) ficou legivel.';
  END IF;

  -- 3. RLS ligada e forcada nas tres tabelas novas.
  IF EXISTS (SELECT 1 FROM pg_class c
              WHERE c.oid IN ('public.pessoas_portal_pedidos'::regclass, 'public.pessoas_portal_envios'::regclass,
                              'public.pessoas_portal_eventos'::regclass)
                AND NOT (c.relrowsecurity AND c.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'Conferir: uma das tabelas pessoas_portal_* nao tem RLS ligada e forcada.';
  END IF;

  -- 4. EXECUTE efectivo.
  FOREACH v_fn IN ARRAY v_portal LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % devia ser so de service_role.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_rh LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('service_role', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % devia ser so de authenticated.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_internas LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: a funcao interna % tem EXECUTE para alguem.', v_fn;
    END IF;
  END LOOP;

  -- 5. Todas as funcoes novas com search_path fixo e vazio.
  IF EXISTS (SELECT 1 FROM pg_proc p
              WHERE p.oid = ANY (ARRAY(SELECT x::regprocedure::oid FROM unnest(v_portal || v_rh || v_internas) AS x))
                AND NOT (coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""'])) THEN
    RAISE EXCEPTION 'Conferir: uma funcao nova nao tem search_path vazio.';
  END IF;

  -- 6. Os CHECKs alargados ficaram com os valores novos.
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_lidos
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = 'public.pessoas_documentos'::regclass AND c.conname = 'pessoas_documentos_estado_valido'
     AND c.contype::text = 'c';
  IF v_lidos IS DISTINCT FROM ARRAY['a_aguardar_assinatura', 'anulado', 'assinado', 'entregue', 'rascunho'] THEN
    RAISE EXCEPTION 'Conferir: pessoas_documentos_estado_valido ficou com %', array_to_string(v_lidos, ',');
  END IF;
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_lidos
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = 'public.pessoas_anexos'::regclass AND c.conname = 'pessoas_anexos_origem_valida'
     AND c.contype::text = 'c';
  IF v_lidos IS DISTINCT FROM ARRAY['convite', 'portal_pedido', 'rh'] THEN
    RAISE EXCEPTION 'Conferir: pessoas_anexos_origem_valida ficou com %', array_to_string(v_lidos, ',');
  END IF;

  -- 7. Os triggers novos (e o de imutabilidade que ja existia) estao activos.
  SELECT array_agg(t.tgname::text ORDER BY t.tgname::text) INTO v_lidos
    FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgenabled::text <> 'D'
     AND t.tgname::text IN ('trg_pessoas_documentos_entregue_imutavel', 'trg_pessoas_documentos_portal_assinado',
                            'trg_pessoas_portal_pedidos_coerencia', 'trg_pessoas_portal_envios_coerencia',
                            'trg_pessoas_portal_eventos_sem_alterar', 'trg_pessoas_portal_eventos_sem_truncate',
                            'trg_pessoas_documentos_assinado_imutavel', 'trg_pessoas_documentos_conteudo_no_portal');
  IF coalesce(array_length(v_lidos, 1), 0) <> 8 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se 8 triggers activos; ha %', coalesce(array_to_string(v_lidos, ','), '(nenhum)');
  END IF;

  -- 7a. A prova do texto: a formula fixa (corpo | hash do ficheiro), com valor conhecido.
  IF public.hr_documento_conteudo_sha256(NULL, NULL) IS DISTINCT FROM encode(sha256(convert_to('|', 'UTF8')), 'hex')
     OR public.hr_documento_conteudo_sha256('a', NULL) IS DISTINCT FROM encode(sha256(convert_to('a|', 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Conferir: hr_documento_conteudo_sha256 nao segue a formula sha256(corpo || ''|'' || hash).';
  END IF;

  -- 7b. A submissao passa a submetida (e ja nao a concluida); o trigger e o mesmo.
  IF position('''submetida''' IN pg_get_functiondef('public.hr_convite_admissao_used_at_transitorio()'::regprocedure)) = 0
     OR position('''concluida''' IN pg_get_functiondef('public.hr_convite_admissao_used_at_transitorio()'::regprocedure)) > 0
     OR NOT EXISTS (SELECT 1 FROM pg_trigger t
                     WHERE t.tgname::text = 'trg_pessoas_convites_admissao_used_at_transitorio'
                       AND t.tgfoid = 'public.hr_convite_admissao_used_at_transitorio()'::regprocedure::oid
                       AND t.tgenabled::text <> 'D')
     OR has_function_privilege('anon', 'public.hr_convite_admissao_used_at_transitorio()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_convite_admissao_used_at_transitorio()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: hr_convite_admissao_used_at_transitorio nao ficou a passar a submissao a submetida.';
  END IF;

  -- 8. As funcoes puras do telemovel, com valores fixos.
  IF public.hr_telemovel_normalizar('912 345 678') IS DISTINCT FROM '+351912345678'
     OR public.hr_telemovel_normalizar('00351 961234567') IS DISTINCT FROM '+351961234567'
     OR public.hr_telemovel_normalizar('+351 212 345 678') IS NOT NULL
     OR public.hr_telemovel_normalizar('+44 7700 900123') IS DISTINCT FROM '+447700900123'
     OR public.hr_telemovel_normalizar('+55 11 91234 5678') IS DISTINCT FROM '+5511912345678'
     OR public.hr_telemovel_normalizar('+7 912 345 6789') IS NOT NULL       -- indicativo fora da lista
     OR public.hr_telemovel_normalizar('+86 138 0013 8000') IS NOT NULL
     OR public.hr_telemovel_normalizar('abc') IS NOT NULL
     OR public.hr_telemovel_normalizar(NULL) IS NOT NULL
     OR public.hr_telemovel_mascarar('+351912345678') IS DISTINCT FROM '+351 *** *** 678'
     OR public.hr_telemovel_mascarar('+244923456789') IS DISTINCT FROM '+244 *** *** 789'
     OR public.hr_telemovel_mascarar('+447700900123') IS DISTINCT FROM '+44 *** *** 123'
     OR public.hr_telemovel_mascarar('+12025550123') IS DISTINCT FROM '+1 *** *** 123' THEN
    RAISE EXCEPTION 'Conferir: hr_telemovel_normalizar/mascarar nao dao os valores esperados.';
  END IF;

  RAISE NOTICE 'OK: portal de documentos (3 tabelas, 18 RPCs so de service_role, 11 do RH), paridade de colunas e privilegios conferidos.';
END;
$conferir$;
