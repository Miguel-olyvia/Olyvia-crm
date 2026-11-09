-- ==============================================================================
-- 20270111800000_hr_documentos_anular
--
-- Documentos de RH (ENTREGA E1 do plano "anular, ocultar e repor documentos de
-- RH, e nunca assinar um documento sem conteudo"): anular com motivo, historico
-- so de acrescentar, anulado e final, e a assinatura recusa documento sem
-- conteudo real. Base RH (uetjghdkwbywbftedtth). NUNCA a principal, NUNCA a
-- Mudelar.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjgh...):
-- pendente so este (e 20270111810000 depois dele); (2) correr a prova na nike
-- em transaccao desfeita ANTES do push (o bloco de conferir abaixo e essa
-- prova); (3) revisao ecc:database-reviewer e ecc:security-reviewer.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. Tabela nova pessoas_documentos_ocorrencias: historico so de acrescentar
--    (anulado | ocultado | reposto), com motivo, estado do documento antes da
--    accao, quem (auth uid obrigatorio e anew_users.id) e o envio do portal
--    que a accao retirou. RLS ligada E forcada, politica RESTRICTIVE que nega
--    tudo, nenhum privilegio para PUBLIC/anon/authenticated/service_role: so
--    as funcoes desta entrega (e as de 20270111810000) escrevem e leem.
--    UPDATE, DELETE e TRUNCATE recusados por gatilho (ocorrencia_imutavel,
--    42501). As FKs ao documento, a pessoa e ao envio sao RESTRICT.
--
-- 2. hr_documento_motivo(text) (interna): o motivo sem espacos/mudancas de
--    linha nas pontas, entre 3 e 2000 caracteres, sem caracteres de controlo
--    (a mudanca de linha \n e aceite) nem invisiveis (larguras zero, marcas de
--    direccao, BOM); NULL se invalido. A mesma regra esta no CHECK da tabela.
--
-- 3. hr_documento_retirar_envio_activo(p_uid, p_documento_id, p_motivo)
--    (interna): tranca processo -> envio -> documento (a ordem do portal e de
--    hr_portal_documento_enviar_nucleo), retira o envio activo com o motivo,
--    apaga o codigo SMS, regista o evento 'retirado' (actor rh) e reavalia o
--    processo (hr_convite_avaliar_assinaturas). Devolve o id do envio retirado
--    ou NULL. Se entre a leitura e o lock aparecer um envio activo novo,
--    recusa (HRA38) em vez de trancar o processo fora de ordem.
--
-- 4. rpc_hr_documento_anular(p_documento_id uuid, p_motivo text) RETURNS jsonb
--    {estado: 'anulado', envio_retirado: boolean}. Permissao
--    hr.pessoas.documentos.anular na organizacao do documento, lida ANTES de
--    qualquer lock. So rascunho e a_aguardar_assinatura. Retira o envio
--    activo, preenche anulado_em/anulado_por (anew_users.id)/anulado_motivo,
--    regista o acesso sensivel (documento, alterar) e a ocorrencia. O ficheiro
--    no storage fica guardado (nada se apaga).
--
-- 5. Gatilho trg_pessoas_documentos_anulado_imutavel: anulado e final; so
--    deixa mudar deleted_at, deleted_by, updated_at, updated_by (a mesma folga
--    de assinado e entregue, para o "ocultar" de 20270111810000).
--
-- 6. CHECK pessoas_documentos_anulado_completo, VALIDADO: um anulado tem data,
--    autor e motivo de 3 a 2000. A guarda G7 conta antes os que o violariam.
--
-- 7. Gatilho trg_pessoas_documentos_assinar_exige_conteudo (BEFORE INSERT OR
--    UPDATE OF estado): passar a assinado (ou nascer assinado) exige conteudo
--    real (D2): ficheiro_caminho preenchido OU hr_documento_corpo_visivel
--    (corpo_html com texto; o texto fixo do upload sem modelo nao conta).
--    Senao: sem_ficheiro (HRA62). Vale para TODOS os caminhos de assinatura
--    (rpc_hr_documento_assinar, rpc_hr_documento_registar_assinatura_externa,
--    hr_documento_assinar_nucleo do portal e qualquer futuro) SEM recriar
--    nenhuma dessas funcoes: protege o caminho em dois passos de
--    src/components/hr sem lhe tocar.
--
--
-- -- DESVIOS AO PLANO (a validar) -----------------------------------------------
--
--  a) O fecho da assinatura e um gatilho e nao uma troca de texto em
--     rpc_hr_documento_assinar e no registo externo: cobre tambem o portal e
--     nao recria funcoes vivas. Consequencia: a assinatura externa SEM
--     ficheiro continua a responder a mensagem dela ("Anexa primeiro o
--     ficheiro assinado antes de confirmar.", P0001), porque essa verificacao
--     corre antes do UPDATE; e a mensagem que o ecra de src/components/hr ja
--     conhece. Com ficheiro, o conteudo e sempre real, por isso o registo
--     externo nunca chega ao HRA62. rpc_hr_documento_assinar responde HRA62.
--  b) O acesso sensivel regista-se pela versao de 5 argumentos com p_auth_uid
--     NULL (= auth.uid()): essa versao recusa um p_auth_uid preenchido por
--     quem nao e service_role (HR911), e estas RPCs correm como authenticated.
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo; nenhum novo) --------------------------
--   42501 insufficient_privilege (sem sessao; utilizador sem anew_users)
--   HRA31 nao_encontrado (documento inexistente, oculto ou sem permissao)
--   HRA37 motivo_invalido
--   HRA38 estado_invalido (nao e rascunho nem a_aguardar_assinatura; ou o
--         documento mudou entre a leitura e o lock)
--   HRA62 sem_ficheiro (assinar sem conteudo real; pelo gatilho)
--   42501 documento_anulado_imutavel, ocorrencia_imutavel (gatilhos)
--   documentos_anular_fora_de_transaccao (25000)
--   Os quatro HRA ja existem com este mesmo sentido (20270102240000); a guarda
--   G5 confirma no catalogo que nenhuma funcao os usa com outra mensagem.
--
--
-- -- O QUE MUDA PARA AS ORGANIZACOES DA BASE RH -------------------------------
--   So os gatilhos de assinar e de anulado actuam sobre o que ja existe: um
--   documento sem conteudo real deixa de poder ser assinado (contados a 9/11:
--   0), e um anulado deixa de poder ser alterado (so ocultado). O resto so
--   actua quando o cliente chamar rpc_hr_documento_anular. ADD CONSTRAINT e
--   CREATE TRIGGER trancam pessoas_documentos ate ao fim da transaccao (13
--   linhas; a prova e curta).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: largar
-- rpc_hr_documento_anular, hr_documento_retirar_envio_activo,
-- hr_documento_ocorrencia_registar e hr_documento_motivo (so depois de
-- 20270111810000 deixar de as usar), os dois gatilhos de pessoas_documentos e
-- as funcoes deles, e o CHECK pessoas_documentos_anulado_completo. A tabela
-- pessoas_documentos_ocorrencias e historico: exportar antes de a largar.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'documentos_anular_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Os corpos de que esta entrega depende, para as guardas md5 --------------
-- hr_convite_avaliar_assinaturas(uuid), de 20270102240000 (nunca recriada).
CREATE TEMP TABLE tmp_e1_avaliar (corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_e1_avaliar (corpo) VALUES ($old$
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
$old$);

-- hr_documento_corpo_visivel(text, uuid), de 20270104700000 (a regra D2).
CREATE TEMP TABLE tmp_e1_visivel (corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_e1_visivel (corpo) VALUES ($old$
  SELECT coalesce(btrim(p_corpo_html) <> ''
                  AND NOT (p_modelo_id IS NULL
                           AND p_corpo_html = E'— documento anexado directamente, sem modelo; ver ficheiro anexo —'),
                  false)
$old$);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista  text;
  v_n      integer;
  v_src    text;
  v_antigo text;
  v_cod    text;
BEGIN
  -- G0. Quem aplica passa a RLS (tabela nova FORCE; as RPCs definer correm como o dono).
  IF NOT EXISTS (SELECT 1 FROM pg_roles ro
                  WHERE ro.rolname::text = current_user::text AND (ro.rolsuper OR ro.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS.', current_user::text;
  END IF;

  -- G1. Funcoes de que dependemos, com as assinaturas exactas.
  SELECT string_agg(f, ', ') INTO v_lista
    FROM unnest(ARRAY['public.has_anew_permission_in_org(uuid, text, uuid)',
                      'public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid)',
                      'public.hr_portal_evento(uuid, uuid, uuid, text, uuid, text, text, uuid, inet, text)',
                      'public.hr_convite_avaliar_assinaturas(uuid)',
                      'public.hr_documento_corpo_visivel(text, uuid)',
                      'public.hr_pessoa_do_utilizador(uuid, uuid)',
                      'public.rpc_hr_documento_assinar(uuid)',
                      'public.rpc_hr_documento_registar_assinatura_externa(uuid)',
                      'public.rpc_hr_documento_upload_assinado_criar(uuid, uuid, text, text)',
                      'public.rpc_hr_portal_documento_enviar(uuid, uuid, boolean)',
                      'public.rpc_hr_documento_ver_conteudo(uuid)',
                      'auth.uid()']) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: faltam funcoes: %.', v_lista;
  END IF;
  -- A versao de 5 argumentos usa auth.uid() quando p_auth_uid e NULL (e assim que se chama aqui).
  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.hr_registar_acesso_sensivel(uuid, uuid, text, text, uuid)')::oid;
  IF position('coalesce(p_auth_uid, auth.uid())' IN coalesce(v_src, '')) = 0 THEN
    RAISE EXCEPTION 'G1: hr_registar_acesso_sensivel (5 args) ja nao usa coalesce(p_auth_uid, auth.uid()). Reler antes de aplicar.';
  END IF;

  -- G2. Tabelas e colunas lidas/escritas.
  IF to_regclass('public.pessoas_documentos') IS NULL OR to_regclass('public.pessoas_portal_envios') IS NULL
     OR to_regclass('public.pessoas_portal_eventos') IS NULL OR to_regclass('public.pessoas_convites_admissao') IS NULL
     OR to_regclass('public.pessoas_acessos_sensiveis') IS NULL THEN
    RAISE EXCEPTION 'G2: falta pessoas_documentos, pessoas_portal_envios, pessoas_portal_eventos, pessoas_convites_admissao ou pessoas_acessos_sensiveis.';
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('pessoas_documentos', 'estado'), ('pessoas_documentos', 'anulado_em'),
                 ('pessoas_documentos', 'anulado_por'), ('pessoas_documentos', 'anulado_motivo'),
                 ('pessoas_documentos', 'deleted_at'), ('pessoas_documentos', 'deleted_by'),
                 ('pessoas_documentos', 'updated_by'), ('pessoas_documentos', 'ficheiro_caminho'),
                 ('pessoas_documentos', 'corpo_html'), ('pessoas_documentos', 'modelo_id'),
                 ('pessoas_documentos', 'pessoa_id'), ('pessoas_documentos', 'organization_id'),
                 ('pessoas_portal_envios', 'documento_id'), ('pessoas_portal_envios', 'convite_id'),
                 ('pessoas_portal_envios', 'retirado_em'), ('pessoas_portal_envios', 'retirado_por'),
                 ('pessoas_portal_envios', 'retirado_motivo'), ('pessoas_portal_envios', 'sms_codigo_hmac'),
                 ('pessoas_portal_envios', 'sms_codigo_expira_em'),
                 ('anew_users', 'id'), ('anew_users', 'auth_user_id')) AS x(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || x.tabela)
                    AND a.attname::text = x.coluna AND NOT a.attisdropped);
  IF v_n <> 21 THEN
    RAISE EXCEPTION 'G2: faltam colunas esperadas em pessoas_documentos/pessoas_portal_envios/anew_users (% de 21).', v_n;
  END IF;
  -- O CHECK dos estados tem os cinco de 20270102240000.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_documentos')
                    AND c.conname::text = 'pessoas_documentos_estado_valido' AND c.contype::text = 'c'
                    AND pg_get_constraintdef(c.oid) LIKE '%entregue%' AND pg_get_constraintdef(c.oid) LIKE '%anulado%') THEN
    RAISE EXCEPTION 'G2: pessoas_documentos_estado_valido nao e o de 20270102240000 (com entregue e anulado).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas')
                    AND c.conname::text = 'pessoas_id_org_key' AND c.contype::text = 'u') THEN
    RAISE EXCEPTION 'G2: pessoas nao tem UNIQUE (id, organization_id): a FK composta da ocorrencia falharia.';
  END IF;

  -- G3. Nomes novos livres (os de 20270111810000 tambem).
  IF to_regclass('public.pessoas_documentos_ocorrencias') IS NOT NULL THEN
    RAISE EXCEPTION 'G3: pessoas_documentos_ocorrencias ja existe. Ler o que la esta.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('rpc_hr_documento_anular', 'hr_documento_retirar_envio_activo', 'hr_documento_motivo',
                             'hr_documento_ocorrencia_registar', 'hr_documentos_anulado_imutavel',
                             'hr_documentos_assinar_exige_conteudo', 'hr_documentos_ocorrencias_imutavel',
                             'rpc_hr_documento_ocultar', 'rpc_hr_documento_repor', 'rpc_hr_documentos_ocultados',
                             'rpc_hr_documento_historico');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G3: ja existem funcoes com nomes desta entrega: %.', v_lista;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = to_regclass('public.pessoas_documentos')
                AND t.tgname::text IN ('trg_pessoas_documentos_anulado_imutavel',
                                       'trg_pessoas_documentos_assinar_exige_conteudo')) THEN
    RAISE EXCEPTION 'G3: um dos gatilhos desta entrega ja existe em pessoas_documentos.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint c
              WHERE c.conrelid = to_regclass('public.pessoas_documentos')
                AND c.conname::text = 'pessoas_documentos_anulado_completo') THEN
    RAISE EXCEPTION 'G3: pessoas_documentos_anulado_completo ja existe.';
  END IF;

  -- G4. Os corpos de que dependemos sao os lidos (md5 sem \r dos dois lados).
  SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.hr_convite_avaliar_assinaturas(uuid)')::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_e1_avaliar t;
  IF md5(v_src) IS DISTINCT FROM md5(v_antigo) THEN
    RAISE EXCEPTION 'G4: hr_convite_avaliar_assinaturas no remoto (md5 sem \r %) nao e a de 20270102240000 transcrita aqui (md5 %). Reler antes de aplicar.',
      md5(v_src), md5(v_antigo);
  END IF;
  SELECT replace(p.prosrc, chr(13), '') INTO v_src FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.hr_documento_corpo_visivel(text, uuid)')::oid;
  SELECT replace(t.corpo, chr(13), '') INTO v_antigo FROM tmp_e1_visivel t;
  IF md5(v_src) IS DISTINCT FROM md5(v_antigo) THEN
    RAISE EXCEPTION 'G4: hr_documento_corpo_visivel no remoto (md5 sem \r %) nao e a de 20270104700000 transcrita aqui (md5 %). Reler antes de aplicar.',
      md5(v_src), md5(v_antigo);
  END IF;

  -- G5. Os codigos reutilizados tem, em TODAS as funcoes que os levantam, a
  --     mesma mensagem (o mesmo sentido) que aqui.
  SELECT string_agg(DISTINCT p.oid::regprocedure::text || ' (' || m[2] || ' = ' || m[1] || ')', ', ') INTO v_lista
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL regexp_matches(p.prosrc, '''([a-z_]+)''\s+USING\s+ERRCODE\s*=\s*''(HRA31|HRA37|HRA38|HRA62)''', 'g') AS m
   WHERE n.nspname::text = 'public'
     AND (m[2], m[1]) NOT IN (VALUES ('HRA31', 'nao_encontrado'), ('HRA37', 'motivo_invalido'),
                                     ('HRA38', 'estado_invalido'), ('HRA62', 'sem_ficheiro'));
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G5: HRA31/37/38/62 ja sao usados com outro sentido: %. Escolher codigos livres.', v_lista;
  END IF;

  -- G6. Permissoes usadas.
  FOREACH v_cod IN ARRAY ARRAY['hr.pessoas.documentos.anular', 'hr.pessoas.documentos.emitir',
                               'hr.pessoas.documentos.view', 'hr.pessoas.documentos.view.own'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G6: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G7. Dados: nenhum anulado violaria o CHECK novo (lido a 9/11: 0).
  SELECT count(*) INTO v_n
    FROM public.pessoas_documentos d
   WHERE d.estado = 'anulado'
     AND NOT (d.anulado_em IS NOT NULL AND d.anulado_por IS NOT NULL AND d.anulado_motivo IS NOT NULL
              AND length(btrim(d.anulado_motivo)) BETWEEN 3 AND 2000);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G7: % documento(s) anulado(s) sem data, autor ou motivo de 3 a 2000: o CHECK pessoas_documentos_anulado_completo nao validaria. Decidir antes de aplicar.', v_n;
  END IF;

  -- Informativo: o que fica por tratar a mao (nao bloqueia).
  SELECT count(*) INTO v_n
    FROM public.pessoas_documentos d
    JOIN public.pessoas_portal_envios e ON e.documento_id = d.id AND e.retirado_em IS NULL
   WHERE d.estado = 'anulado';
  RAISE NOTICE 'Guardas: % documento(s) anulado(s) ainda com envio activo no portal (retirar com rpc_hr_portal_envio_retirar; 20270111810000 esconde-os do portal).', v_n;
  SELECT count(*) INTO v_n
    FROM public.pessoas_documentos d
   WHERE d.estado = 'a_aguardar_assinatura' AND d.ficheiro_caminho IS NULL
     AND NOT public.hr_documento_corpo_visivel(d.corpo_html, d.modelo_id);
  RAISE NOTICE 'Guardas: % documento(s) a aguardar assinatura sem conteudo real (deixam de poder ser assinados: anexar o ficheiro ou anular).', v_n;
END;
$guardas$;


-- ==============================================================================
-- 1. O motivo (interna)
-- ==============================================================================
CREATE FUNCTION public.hr_documento_motivo(p_motivo text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN x.m IS NOT NULL
               AND length(x.m) BETWEEN 3 AND 2000
               AND x.m !~ '[\x01-\x09\x0b-\x1f\x7f-\x9f​-‏ -‮⁠-⁩﻿]'
              THEN x.m END
    FROM (SELECT btrim(p_motivo, E' \n') AS m) AS x
$$;

COMMENT ON FUNCTION public.hr_documento_motivo(text) IS
'INTERNA (sem EXECUTE para ninguem). O motivo de anular/ocultar/repor um documento sem espacos nem mudancas de linha nas pontas, se tiver 3 a 2000 caracteres e nenhum caractere de controlo (a mudanca de linha e aceite) nem invisivel; senao NULL (motivo_invalido, HRA37). A mesma regra esta no CHECK de pessoas_documentos_ocorrencias. Desde 20270111800000.';


-- ==============================================================================
-- 2. O historico: pessoas_documentos_ocorrencias (so de acrescentar)
-- ==============================================================================
CREATE TABLE public.pessoas_documentos_ocorrencias (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  pessoa_id          uuid NOT NULL,
  documento_id       uuid NOT NULL,
  accao              text NOT NULL,
  motivo             text NOT NULL,
  estado_documento   text NOT NULL,
  actor_auth_uid     uuid NOT NULL,
  actor_anew_user_id uuid,
  envio_retirado_id  uuid,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  -- Ordem monotona: now() e o mesmo instante numa transaccao, e o id e aleatorio.
  seq                bigint GENERATED ALWAYS AS IDENTITY,

  CONSTRAINT pessoas_documentos_ocorrencias_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_documentos_ocorrencias_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id) REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_documentos_ocorrencias_documento_fkey
    FOREIGN KEY (documento_id) REFERENCES public.pessoas_documentos (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_documentos_ocorrencias_envio_fkey
    FOREIGN KEY (envio_retirado_id) REFERENCES public.pessoas_portal_envios (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_documentos_ocorrencias_accao_valida
    CHECK (accao IN ('anulado', 'ocultado', 'reposto')),
  CONSTRAINT pessoas_documentos_ocorrencias_motivo_valido
    CHECK (motivo = btrim(motivo, E' \n')
           AND length(motivo) BETWEEN 3 AND 2000
           AND motivo !~ '[\x01-\x09\x0b-\x1f\x7f-\x9f​-‏ -‮⁠-⁩﻿]'),
  CONSTRAINT pessoas_documentos_ocorrencias_estado_valido
    CHECK (estado_documento IN ('rascunho', 'a_aguardar_assinatura', 'assinado', 'entregue', 'anulado')),
  CONSTRAINT pessoas_documentos_ocorrencias_envio_so_ao_esconder
    CHECK (envio_retirado_id IS NULL OR accao IN ('anulado', 'ocultado'))
);

CREATE INDEX idx_pessoas_documentos_ocorrencias_documento
  ON public.pessoas_documentos_ocorrencias (documento_id, criado_em, seq);
CREATE INDEX idx_pessoas_documentos_ocorrencias_pessoa
  ON public.pessoas_documentos_ocorrencias (pessoa_id, organization_id);
CREATE INDEX idx_pessoas_documentos_ocorrencias_envio
  ON public.pessoas_documentos_ocorrencias (envio_retirado_id) WHERE envio_retirado_id IS NOT NULL;

COMMENT ON TABLE public.pessoas_documentos_ocorrencias IS
'Historico so de acrescentar das accoes sobre documentos de RH: anulado, ocultado, reposto. Motivo (hr_documento_motivo), estado do documento ANTES da accao, quem (auth uid obrigatorio; anew_users.id sem FK, para um utilizador apagado nao reescrever o historico) e o envio do portal que a accao retirou. RLS forcada, politica RESTRICTIVE que nega tudo e nenhum privilegio para PUBLIC/anon/authenticated/service_role: so as RPCs SECURITY DEFINER de documentos escrevem e leem (rpc_hr_documento_historico). UPDATE, DELETE e TRUNCATE recusados por gatilho. Desde 20270111800000.';
COMMENT ON COLUMN public.pessoas_documentos_ocorrencias.estado_documento IS
'O estado do documento ANTES da accao (anular: rascunho ou a_aguardar_assinatura; ocultar: assinado, entregue ou anulado). Desde 20270111800000.';

CREATE FUNCTION public.hr_documentos_ocorrencias_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'ocorrencia_imutavel' USING ERRCODE = '42501',
    DETAIL = 'O historico de documentos so se acrescenta: nao se altera nem se apaga.';
END;
$$;

COMMENT ON FUNCTION public.hr_documentos_ocorrencias_imutavel() IS
'INTERNA (gatilho de pessoas_documentos_ocorrencias). Recusa UPDATE, DELETE e TRUNCATE (ocorrencia_imutavel, 42501), tambem ao dono e a service_role. Desde 20270111800000.';

CREATE TRIGGER trg_pessoas_documentos_ocorrencias_sem_alterar
  BEFORE UPDATE OR DELETE ON public.pessoas_documentos_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.hr_documentos_ocorrencias_imutavel();
CREATE TRIGGER trg_pessoas_documentos_ocorrencias_sem_truncate
  BEFORE TRUNCATE ON public.pessoas_documentos_ocorrencias
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_documentos_ocorrencias_imutavel();

ALTER TABLE public.pessoas_documentos_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas_documentos_ocorrencias FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pessoas_documentos_ocorrencias FROM PUBLIC, anon, authenticated, service_role;
-- RESTRICTIVE: mesmo que um dia alguem acrescente uma politica permissiva e um
-- GRANT, esta continua a negar tudo a quem nao tem BYPASSRLS.
CREATE POLICY pessoas_documentos_ocorrencias_fechada ON public.pessoas_documentos_ocorrencias
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);


-- ==============================================================================
-- 3. Anulado e final; assinar exige conteudo real; o CHECK do anulado completo
-- ==============================================================================
-- 'anulado' e final como 'assinado' e 'entregue': so as colunas de ocultacao e
-- de actualizacao mudam (comparacao por to_jsonb, que cobre colunas futuras).
CREATE FUNCTION public.hr_documentos_anulado_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.estado = 'anulado'
     AND (to_jsonb(NEW) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'updated_by')
         IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'updated_by') THEN
    RAISE EXCEPTION 'documento_anulado_imutavel' USING ERRCODE = '42501',
      DETAIL = 'Um documento anulado nao se altera; so se oculta ou repoe.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_documentos_anulado_imutavel() IS
'INTERNA (gatilho BEFORE UPDATE de pessoas_documentos). Um documento anulado e imutavel (documento_anulado_imutavel, 42501), excepto deleted_at, deleted_by, updated_at e updated_by -- a mesma folga de hr_documentos_assinado_imutavel e hr_documentos_entregue_imutavel. Vale tambem para o dono e service_role. Desde 20270111800000.';

CREATE TRIGGER trg_pessoas_documentos_anulado_imutavel
  BEFORE UPDATE ON public.pessoas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.hr_documentos_anulado_imutavel();

-- Nunca se assina um documento sem conteudo real (D2). SECURITY DEFINER para
-- poder chamar hr_documento_corpo_visivel (sem EXECUTE para ninguem) quando a
-- escrita vem de service_role; nao le nada alem da propria linha.
CREATE FUNCTION public.hr_documentos_assinar_exige_conteudo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM 'assinado' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = 'assinado' THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.ficheiro_caminho IS NULL
     AND NOT public.hr_documento_corpo_visivel(NEW.corpo_html, NEW.modelo_id) THEN
    RAISE EXCEPTION 'sem_ficheiro' USING ERRCODE = 'HRA62',
      DETAIL = 'O documento nao tem ficheiro nem texto: anexe o ficheiro ou anule o documento.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_documentos_assinar_exige_conteudo() IS
'INTERNA (gatilho BEFORE INSERT OR UPDATE OF estado de pessoas_documentos). Passar a assinado (ou nascer assinado) exige conteudo real: ficheiro_caminho preenchido OU hr_documento_corpo_visivel(corpo_html, modelo_id) -- o texto fixo do upload sem modelo nao conta. Senao sem_ficheiro (HRA62). Cobre a assinatura interna, a externa e a do portal sem recriar nenhuma delas. Desde 20270111800000.';

CREATE TRIGGER trg_pessoas_documentos_assinar_exige_conteudo
  BEFORE INSERT OR UPDATE OF estado ON public.pessoas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.hr_documentos_assinar_exige_conteudo();

ALTER TABLE public.pessoas_documentos ADD CONSTRAINT pessoas_documentos_anulado_completo
  CHECK (estado <> 'anulado'
         OR (anulado_em IS NOT NULL AND anulado_por IS NOT NULL AND anulado_motivo IS NOT NULL
             AND length(btrim(anulado_motivo)) BETWEEN 3 AND 2000));

COMMENT ON CONSTRAINT pessoas_documentos_anulado_completo ON public.pessoas_documentos IS
'Um documento anulado tem data, autor (anew_users.id) e motivo de 3 a 2000 caracteres. Completa pessoas_documentos_anulado_consistente, que so vale no outro sentido. Desde 20270111800000.';


-- ==============================================================================
-- 4. Internas: retirar o envio activo e registar a ocorrencia
-- ==============================================================================
CREATE FUNCTION public.hr_documento_retirar_envio_activo(p_uid uuid, p_documento_id uuid, p_motivo text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_envio   uuid;
  v_convite uuid;
  v_env     record;
  v_outro   uuid;
BEGIN
  IF p_uid IS NULL OR p_documento_id IS NULL OR p_motivo IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- O envio activo (no maximo um: idx_pessoas_portal_envios_documento_activo),
  -- lido sem lock; o convite de um envio nunca muda (hr_portal_envio_coerencia).
  SELECT e.id, e.convite_id INTO v_envio, v_convite
    FROM public.pessoas_portal_envios e
   WHERE e.documento_id = p_documento_id AND e.retirado_em IS NULL;

  -- A ordem de locks do portal: processo -> envio -> documento.
  IF v_convite IS NOT NULL THEN
    PERFORM 1 FROM public.pessoas_convites_admissao c WHERE c.id = v_convite FOR UPDATE;
  END IF;
  IF v_envio IS NOT NULL THEN
    SELECT e.id, e.organization_id, e.pessoa_id, e.convite_id INTO v_env
      FROM public.pessoas_portal_envios e
     WHERE e.id = v_envio AND e.retirado_em IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
      v_envio := NULL;
    END IF;
  END IF;
  PERFORM 1 FROM public.pessoas_documentos d WHERE d.id = p_documento_id FOR UPDATE;

  -- Um envio activo que nao e o trancado (criado entre a leitura e o lock do
  -- documento): o processo dele nao ficou trancado na ordem certa. Recusa; o
  -- RH volta a tentar.
  SELECT e.id INTO v_outro
    FROM public.pessoas_portal_envios e
   WHERE e.documento_id = p_documento_id AND e.retirado_em IS NULL
     AND e.id IS DISTINCT FROM v_envio
   LIMIT 1;
  IF v_outro IS NOT NULL THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38',
      DETAIL = 'O documento foi enviado ao portal entretanto; tente de novo.';
  END IF;

  IF v_envio IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.pessoas_portal_envios
     SET retirado_em = now(), retirado_por = p_uid, retirado_motivo = p_motivo,
         sms_codigo_hmac = NULL, sms_codigo_expira_em = NULL
   WHERE id = v_envio;

  PERFORM public.hr_portal_evento(v_env.organization_id, v_env.pessoa_id, v_env.convite_id, 'envio', v_envio,
                                  'retirado', 'rh', p_uid);
  IF v_env.convite_id IS NOT NULL THEN
    PERFORM public.hr_convite_avaliar_assinaturas(v_env.convite_id);
  END IF;
  RETURN v_envio;
END;
$$;

COMMENT ON FUNCTION public.hr_documento_retirar_envio_activo(uuid, uuid, text) IS
'INTERNA (sem EXECUTE para ninguem). Tranca processo -> envio -> documento (a ordem do portal), retira o envio activo do documento com o motivo (retirado_por = p_uid, o auth uid de quem pediu, como rpc_hr_portal_envio_retirar), apaga o codigo SMS, regista o evento retirado (actor rh) e reavalia o processo (hr_convite_avaliar_assinaturas). Devolve o id do envio retirado ou NULL. Quem chama TEM de ter verificado a permissao e o motivo. HRA38 se aparecer um envio activo novo entre a leitura e o lock. Desde 20270111800000.';

CREATE FUNCTION public.hr_documento_ocorrencia_registar(
  p_uid uuid, p_anew uuid, p_documento_id uuid, p_accao text, p_motivo text, p_estado text, p_envio uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.pessoas_documentos_ocorrencias
    (organization_id, pessoa_id, documento_id, accao, motivo, estado_documento,
     actor_auth_uid, actor_anew_user_id, envio_retirado_id)
  SELECT d.organization_id, d.pessoa_id, d.id, p_accao, p_motivo, p_estado, p_uid, p_anew, p_envio
    FROM public.pessoas_documentos d
   WHERE d.id = p_documento_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.hr_documento_ocorrencia_registar(uuid, uuid, uuid, text, text, text, uuid) IS
'INTERNA (sem EXECUTE para ninguem). Acrescenta uma linha a pessoas_documentos_ocorrencias com a organizacao e a pessoa lidas do proprio documento. Desde 20270111800000.';


-- ==============================================================================
-- 5. rpc_hr_documento_anular
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_documento_anular(p_documento_id uuid, p_motivo text)
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

  -- 1. Permissao ANTES de qualquer lock (leitura simples). Inexistente, oculto
  --    ou sem permissao: o mesmo nao_encontrado.
  SELECT d.id, d.organization_id, d.pessoa_id, d.estado, d.deleted_at INTO v_doc
    FROM public.pessoas_documentos d
   WHERE d.id = p_documento_id;
  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL
     OR NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.documentos.anular', v_doc.organization_id), false) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- 2. O motivo.
  v_motivo := public.hr_documento_motivo(p_motivo);
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;

  -- 3. So o que ainda nao e final.
  IF v_doc.estado NOT IN ('rascunho', 'a_aguardar_assinatura') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 4. Tranca processo -> envio -> documento e retira o envio activo.
  v_envio := public.hr_documento_retirar_envio_activo(v_uid, v_doc.id, v_motivo);

  -- 5. De novo, ja com o documento trancado: pode ter mudado entretanto.
  SELECT d.estado, d.deleted_at INTO v_trc
    FROM public.pessoas_documentos d
   WHERE d.id = v_doc.id
   FOR UPDATE;
  IF v_trc.deleted_at IS NOT NULL OR v_trc.estado NOT IN ('rascunho', 'a_aguardar_assinatura') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  UPDATE public.pessoas_documentos
     SET estado = 'anulado', anulado_em = now(), anulado_por = v_anew, anulado_motivo = v_motivo,
         updated_by = v_anew
   WHERE id = v_doc.id;

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'alterar', NULL::uuid);
  PERFORM public.hr_documento_ocorrencia_registar(v_uid, v_anew, v_doc.id, 'anulado', v_motivo, v_trc.estado, v_envio);

  RETURN jsonb_build_object('estado', 'anulado', 'envio_retirado', v_envio IS NOT NULL);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_documento_anular(uuid, text) IS
'Anula um documento de RH em rascunho ou a aguardar assinatura. Exige hr.pessoas.documentos.anular na organizacao do documento, verificada antes de qualquer lock (sem sessao 42501; inexistente, oculto ou sem permissao: nao_encontrado HRA31). Motivo de 3 a 2000 caracteres sem controlo nem invisiveis (motivo_invalido HRA37); outros estados estado_invalido (HRA38). Retira o envio activo do portal com o mesmo motivo (e reavalia o processo de admissao), grava anulado_em/anulado_por/anulado_motivo, regista o acesso sensivel (documento, alterar) e a ocorrencia. O ficheiro fica guardado. O motivo e visivel ao proprio colaborador (anulado_motivo). Devolve {estado, envio_retirado}. Desde 20270111800000.';


-- ==============================================================================
-- 6. Privilegios: internas sem EXECUTE; a RPC so para authenticated
-- ==============================================================================
REVOKE ALL ON FUNCTION public.hr_documento_motivo(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_documentos_ocorrencias_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_documentos_anulado_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_documentos_assinar_exige_conteudo() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_documento_retirar_envio_activo(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_documento_ocorrencia_registar(uuid, uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_anular(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_anular(uuid, text) TO authenticated;


-- ==============================================================================
-- 7. Conferir: estrutura e privilegios; depois a prova na nike, DESFEITA
-- ==============================================================================

-- Ajudantes da prova (temporarios: so existem nesta sessao e largam-se no fim).
-- A chamada e a verificacao ficam sempre em comandos separados.
CREATE FUNCTION pg_temp.e1_chamar(p_auth uuid, p_sql text)
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

CREATE FUNCTION pg_temp.e1_ok(p_auth uuid, p_sql text, p_rotulo text)
RETURNS text
LANGUAGE plpgsql
AS $f$
DECLARE
  v_res text := pg_temp.e1_chamar(p_auth, p_sql);
BEGIN
  IF v_res LIKE 'ERRO:%' THEN
    RAISE EXCEPTION 'Conferir [%]: devia passar; deu %', p_rotulo, left(v_res, 400);
  END IF;
  RETURN v_res;
END;
$f$;

CREATE FUNCTION pg_temp.e1_erro(p_auth uuid, p_sql text, p_codigo text, p_rotulo text)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  v_res text := pg_temp.e1_chamar(p_auth, p_sql);
BEGIN
  IF v_res NOT LIKE 'ERRO:' || p_codigo || ':%' THEN
    RAISE EXCEPTION 'Conferir [%]: esperava o erro %, veio %', p_rotulo, p_codigo, left(coalesce(v_res, ''), 400);
  END IF;
END;
$f$;

-- Escrita directa como dono (o caminho que nenhuma RPC tem): devolve o SQLSTATE ou 'ok'.
CREATE FUNCTION pg_temp.e1_directo(p_sql text)
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

DO $conferir$
DECLARE
  k_nike     constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_motivo   constant text := 'prova da migracao 20270111800000';
  k_titulo   constant text := 'prova 20270111800000';
  k_rpc      constant text := 'public.rpc_hr_documento_anular(uuid, text)';
  k_internas constant text[] := ARRAY['public.hr_documento_motivo(text)',
                                      'public.hr_documentos_ocorrencias_imutavel()',
                                      'public.hr_documentos_anulado_imutavel()',
                                      'public.hr_documentos_assinar_exige_conteudo()',
                                      'public.hr_documento_retirar_envio_activo(uuid, uuid, text)',
                                      'public.hr_documento_ocorrencia_registar(uuid, uuid, uuid, text, text, text, uuid)'];
  v_fn       text;
  v_grant    text;
  v_n        integer;
  v_n2       integer;
  v_res      text;
  v_j        jsonb;
  v_st       text;
  v_tag      text := replace(gen_random_uuid()::text, '-', '');
  v_uid      uuid;
  v_anew     uuid;
  v_uid_own  uuid;
  v_p_own    uuid;
  v_p        uuid;
  v_q        uuid;
  v_conv     uuid;
  v_doc_a    uuid;
  v_doc_b    uuid;
  v_doc_c    uuid;
  v_doc_c2   uuid;
  v_d1       uuid;
  v_d2       uuid;
  v_envio1   uuid;
  v_envio2   uuid;
  v_estado   text;
  v_prova_adm  text;
  v_prova_rpc  text;
BEGIN
  -- 7.1 Estrutura da tabela: RLS ligada e forcada, so a politica RESTRICTIVE,
  --     nenhum privilegio para PUBLIC/anon/authenticated/service_role.
  IF NOT EXISTS (SELECT 1 FROM pg_class c
                  WHERE c.oid = to_regclass('public.pessoas_documentos_ocorrencias')
                    AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'Conferir: pessoas_documentos_ocorrencias devia ter RLS ligada e forcada.';
  END IF;
  IF (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid = to_regclass('public.pessoas_documentos_ocorrencias')) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policy pol
                     WHERE pol.polrelid = to_regclass('public.pessoas_documentos_ocorrencias')
                       AND pol.polname::text = 'pessoas_documentos_ocorrencias_fechada' AND NOT pol.polpermissive) THEN
    RAISE EXCEPTION 'Conferir: pessoas_documentos_ocorrencias devia ter so a politica RESTRICTIVE fechada.';
  END IF;
  SELECT string_agg(DISTINCT (CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END) || ':' || a.privilege_type, ',')
    INTO v_grant
    FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = to_regclass('public.pessoas_documentos_ocorrencias')
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
  IF v_grant IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: pessoas_documentos_ocorrencias tem privilegios para "%".', v_grant;
  END IF;

  -- 7.2 Gatilhos ligados. tgtype: 1 ROW, 2 BEFORE, 4 INSERT, 8 DELETE, 16 UPDATE, 32 TRUNCATE.
  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgenabled::text <> 'D'
     AND ((t.tgrelid = to_regclass('public.pessoas_documentos_ocorrencias')
           AND t.tgname::text = 'trg_pessoas_documentos_ocorrencias_sem_alterar'
           AND (t.tgtype::integer & 63) = 27)
       OR (t.tgrelid = to_regclass('public.pessoas_documentos_ocorrencias')
           AND t.tgname::text = 'trg_pessoas_documentos_ocorrencias_sem_truncate'
           AND (t.tgtype::integer & 63) = 34)
       OR (t.tgrelid = to_regclass('public.pessoas_documentos')
           AND t.tgname::text = 'trg_pessoas_documentos_anulado_imutavel'
           AND (t.tgtype::integer & 63) = 19)
       OR (t.tgrelid = to_regclass('public.pessoas_documentos')
           AND t.tgname::text = 'trg_pessoas_documentos_assinar_exige_conteudo'
           AND (t.tgtype::integer & 63) = 23));
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Conferir: esperavam-se 4 gatilhos novos ligados com os eventos certos; ha %.', v_n;
  END IF;

  -- 7.3 O CHECK do anulado completo esta validado.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_documentos')
                    AND c.conname::text = 'pessoas_documentos_anulado_completo'
                    AND c.contype::text = 'c' AND c.convalidated) THEN
    RAISE EXCEPTION 'Conferir: pessoas_documentos_anulado_completo nao existe ou nao esta validado.';
  END IF;

  -- 7.4 Funcoes: search_path vazio; so o gatilho de conteudo e a RPC sao definer;
  --     internas sem EXECUTE; a RPC so para authenticated.
  FOREACH v_fn IN ARRAY k_internas LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao % nao existe.', v_fn;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid
                      AND p.prosecdef = (v_fn = 'public.hr_documentos_assinar_exige_conteudo()')
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % devia ter search_path vazio (e so o gatilho de conteudo e SECURITY DEFINER).', v_fn;
    END IF;
    SELECT string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ',')
      INTO v_grant
      FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.privilege_type::text = 'EXECUTE'
       AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
    IF v_grant IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: a interna % tem EXECUTE para "%".', v_fn, v_grant;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(k_rpc)::oid AND p.prosecdef
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']
                    AND pg_get_function_result(p.oid) = 'jsonb') THEN
    RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER, search_path vazio, RETURNS jsonb.', k_rpc;
  END IF;
  SELECT string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ',')
    INTO v_grant
    FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = to_regprocedure(k_rpc)::oid AND a.privilege_type::text = 'EXECUTE'
     AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
  IF coalesce(v_grant, '') IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'Conferir: EXECUTE em % devia ser so "authenticated", e "%".', k_rpc, coalesce(v_grant, '');
  END IF;

  -- 7.5 O motivo, com valores fixos.
  IF public.hr_documento_motivo(NULL) IS NOT NULL
     OR public.hr_documento_motivo('ab') IS NOT NULL
     OR public.hr_documento_motivo('   ab   ') IS NOT NULL
     OR public.hr_documento_motivo(repeat('a', 2001)) IS NOT NULL
     OR public.hr_documento_motivo('abc' || chr(1)) IS NOT NULL
     OR public.hr_documento_motivo('abc' || chr(9) || 'd') IS NOT NULL
     OR public.hr_documento_motivo('abc' || chr(8203) || 'd') IS NOT NULL
     OR public.hr_documento_motivo('abc' || chr(8238) || 'd') IS NOT NULL
     OR public.hr_documento_motivo('abc' || chr(65279) || 'd') IS NOT NULL
     OR public.hr_documento_motivo('  Erro no valor  ') IS DISTINCT FROM 'Erro no valor'
     OR public.hr_documento_motivo('linha 1' || chr(10) || 'linha 2') IS DISTINCT FROM 'linha 1' || chr(10) || 'linha 2'
     OR public.hr_documento_motivo('Retribuição errada') IS DISTINCT FROM 'Retribuição errada'
     OR public.hr_documento_motivo(repeat('a', 2000)) IS NULL THEN
    RAISE EXCEPTION 'Conferir: hr_documento_motivo nao da os valores esperados.';
  END IF;

  -- 7.6 Prova na nike, DESFEITA no fim (sentinela HDA00).
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- Quem anula, cria e envia: membro activo da nike com anular e emitir.
    -- Toda a consulta leva a organizacao da nike.
    SELECT au.auth_user_id, au.id INTO v_uid, v_anew
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND am.role_is_client IS NOT TRUE
       AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.documentos.anular', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.documentos.emitir', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um membro activo com hr.pessoas.documentos.anular e .emitir.';
    END IF;

    -- Uma pessoa da nike para os documentos simples, e (se houver) uma sem
    -- nenhum processo de admissao, para o caso com processo.
    SELECT p.id INTO v_p
      FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL
     ORDER BY p.id
     LIMIT 1;
    IF v_p IS NULL THEN
      RAISE EXCEPTION 'Conferir: a nike nao tem nenhuma pessoa nao apagada.';
    END IF;
    SELECT p.id INTO v_q
      FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_convites_admissao c
                        WHERE c.pessoa_id = p.id AND c.organization_id = k_nike)
     ORDER BY p.id
     LIMIT 1;

    -- a) Recusas antes de qualquer escrita: sem sessao, inexistente, sem
    --    permissao (utilizador que nao existe), motivo invalido.
    v_doc_a := pg_temp.e1_ok(v_uid, format(
      'SELECT public.rpc_hr_documento_upload_assinado_criar(%L::uuid, NULL::uuid, %L, %L)::text',
      v_p, 'contrato', k_titulo || ' A'), 'criar A')::uuid;
    PERFORM pg_temp.e1_erro(NULL, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_doc_a, k_motivo),
                            '42501', 'sem sessao');
    PERFORM pg_temp.e1_erro(v_uid, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', gen_random_uuid(), k_motivo),
                            'HRA31', 'documento inexistente');
    PERFORM pg_temp.e1_erro(gen_random_uuid(), format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_doc_a, k_motivo),
                            'HRA31', 'sem permissao');
    PERFORM pg_temp.e1_erro(v_uid, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_doc_a, 'ab'),
                            'HRA37', 'motivo curto');
    PERFORM pg_temp.e1_erro(v_uid, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_doc_a, 'abc' || chr(1) || 'def'),
                            'HRA37', 'motivo com controlo');
    IF (SELECT d.estado FROM public.pessoas_documentos d WHERE d.id = v_doc_a) IS DISTINCT FROM 'a_aguardar_assinatura'
       OR EXISTS (SELECT 1 FROM public.pessoas_documentos_ocorrencias o WHERE o.documento_id = v_doc_a) THEN
      RAISE EXCEPTION 'Conferir: uma recusa deixou o documento A alterado ou uma ocorrencia escrita.';
    END IF;

    -- b) Anular A (sem envio).
    SELECT count(*) INTO v_n FROM public.pessoas_acessos_sensiveis s
     WHERE s.pessoa_id = v_p AND s.organization_id = k_nike AND s.campo = 'documento' AND s.accao = 'alterar'
       AND s.auth_user_id = v_uid;
    v_res := pg_temp.e1_ok(v_uid, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_doc_a, '  ' || k_motivo || '  '),
                           'anular A');
    v_j := v_res::jsonb;
    IF v_j IS DISTINCT FROM jsonb_build_object('estado', 'anulado', 'envio_retirado', false) THEN
      RAISE EXCEPTION 'Conferir: anular A devia devolver {estado: anulado, envio_retirado: false}; deu %.', v_res;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_documentos d
                    WHERE d.id = v_doc_a AND d.estado = 'anulado' AND d.anulado_em IS NOT NULL
                      AND d.anulado_por = v_anew AND d.anulado_motivo = k_motivo AND d.updated_by = v_anew
                      AND d.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Conferir: A devia ficar anulado com data, autor e o motivo sem espacos nas pontas.';
    END IF;
    IF (SELECT count(*) FROM public.pessoas_documentos_ocorrencias o
         WHERE o.documento_id = v_doc_a AND o.accao = 'anulado' AND o.motivo = k_motivo
           AND o.estado_documento = 'a_aguardar_assinatura' AND o.actor_auth_uid = v_uid
           AND o.actor_anew_user_id = v_anew AND o.envio_retirado_id IS NULL
           AND o.organization_id = k_nike AND o.pessoa_id = v_p) <> 1 THEN
      RAISE EXCEPTION 'Conferir: anular A devia escrever uma ocorrencia completa.';
    END IF;
    SELECT count(*) INTO v_n2 FROM public.pessoas_acessos_sensiveis s
     WHERE s.pessoa_id = v_p AND s.organization_id = k_nike AND s.campo = 'documento' AND s.accao = 'alterar'
       AND s.auth_user_id = v_uid;
    IF v_n2 <> v_n + 1 THEN
      RAISE EXCEPTION 'Conferir: anular A devia registar um acesso sensivel (documento, alterar) de quem anulou (% -> %).', v_n, v_n2;
    END IF;

    -- c) Anular de novo: HRA38. Alteracao directa a um anulado: recusada.
    PERFORM pg_temp.e1_erro(v_uid, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_doc_a, k_motivo),
                            'HRA38', 'anular de novo');
    v_st := pg_temp.e1_directo(format('UPDATE public.pessoas_documentos SET titulo = %L WHERE id = %L::uuid',
                                      k_titulo || ' reescrito', v_doc_a));
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: alterar directamente um anulado devia dar 42501 (deu %).', v_st;
    END IF;
    v_st := pg_temp.e1_directo(format('UPDATE public.pessoas_documentos SET estado = %L, anulado_em = NULL WHERE id = %L::uuid',
                                      'a_aguardar_assinatura', v_doc_a));
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: desfazer directamente a anulacao devia dar 42501 (deu %).', v_st;
    END IF;

    -- d) A ocorrencia nao se altera nem se apaga (tambem como dono).
    v_st := pg_temp.e1_directo(format('UPDATE public.pessoas_documentos_ocorrencias SET motivo = %L WHERE documento_id = %L::uuid',
                                      'outro motivo', v_doc_a));
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: alterar uma ocorrencia devia dar 42501 (deu %).', v_st;
    END IF;
    v_st := pg_temp.e1_directo(format('DELETE FROM public.pessoas_documentos_ocorrencias WHERE documento_id = %L::uuid', v_doc_a));
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: apagar uma ocorrencia devia dar 42501 (deu %).', v_st;
    END IF;
    v_st := pg_temp.e1_directo('TRUNCATE public.pessoas_documentos_ocorrencias');
    IF v_st IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'Conferir: TRUNCATE das ocorrencias devia dar 42501 (deu %).', v_st;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_documentos_ocorrencias o WHERE o.documento_id = v_doc_a) THEN
      RAISE EXCEPTION 'Conferir: a ocorrencia de A desapareceu.';
    END IF;

    -- e) B com ficheiro, assinado por fora: anular B da HRA38.
    v_doc_b := pg_temp.e1_ok(v_uid, format(
      'SELECT public.rpc_hr_documento_upload_assinado_criar(%L::uuid, NULL::uuid, %L, %L)::text',
      v_p, 'contrato', k_titulo || ' B'), 'criar B')::uuid;
    v_st := pg_temp.e1_directo(format(
      'UPDATE public.pessoas_documentos SET ficheiro_caminho = %L, ficheiro_hash_sha256 = %L, ficheiro_anexado_em = now(), ficheiro_anexado_por = %L::uuid WHERE id = %L::uuid',
      k_nike::text || '/' || v_p::text || '/' || v_doc_b::text || '/' || gen_random_uuid()::text || '.pdf',
      repeat('a', 64), v_anew, v_doc_b));
    IF v_st IS DISTINCT FROM 'ok' THEN
      RAISE EXCEPTION 'Conferir: anexar o ficheiro de teste a B falhou (%).', v_st;
    END IF;
    PERFORM pg_temp.e1_ok(v_uid, format('SELECT %L FROM public.rpc_hr_documento_registar_assinatura_externa(%L::uuid)', 'ok', v_doc_b),
                          'assinar B por fora (com ficheiro)');
    IF (SELECT d.estado FROM public.pessoas_documentos d WHERE d.id = v_doc_b) IS DISTINCT FROM 'assinado' THEN
      RAISE EXCEPTION 'Conferir: B com ficheiro devia ficar assinado (o gatilho de conteudo nao o devia recusar).';
    END IF;
    PERFORM pg_temp.e1_erro(v_uid, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_doc_b, k_motivo),
                            'HRA38', 'anular um assinado');

    -- f) C sem conteudo real (texto fixo, sem ficheiro): assinar recusado.
    v_doc_c := pg_temp.e1_ok(v_uid, format(
      'SELECT public.rpc_hr_documento_upload_assinado_criar(%L::uuid, NULL::uuid, %L, %L)::text',
      v_p, 'contrato', k_titulo || ' C'), 'criar C')::uuid;
    v_st := pg_temp.e1_directo(format(
      'UPDATE public.pessoas_documentos SET estado = %L, assinado_em = now(), assinatura_origem = %L WHERE id = %L::uuid',
      'assinado', 'externa', v_doc_c));
    IF v_st IS DISTINCT FROM 'HRA62' THEN
      RAISE EXCEPTION 'Conferir: passar a assinado um documento sem conteudo devia dar HRA62 (deu %).', v_st;
    END IF;
    -- O registo externo sem ficheiro continua com a sua mensagem (verificacao anterior ao UPDATE).
    v_res := pg_temp.e1_chamar(v_uid, format('SELECT %L FROM public.rpc_hr_documento_registar_assinatura_externa(%L::uuid)', 'ok', v_doc_c));
    IF v_res NOT LIKE 'ERRO:P0001:Anexa primeiro%' THEN
      RAISE EXCEPTION 'Conferir: o registo externo sem ficheiro devia continuar a dar "Anexa primeiro..."; deu %.', left(v_res, 300);
    END IF;
    -- Pela RPC de assinatura interna, se a nike tiver uma conta ligada a uma ficha.
    SELECT au.auth_user_id, public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) INTO v_uid_own, v_p_own
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.documentos.view.own', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid_own IS NULL THEN
      v_prova_rpc := 'nao provado pela RPC: a nike nao tem conta ligada a uma ficha com view.own (provado pelo UPDATE directo)';
    ELSE
      v_doc_c2 := pg_temp.e1_ok(v_uid, format(
        'SELECT public.rpc_hr_documento_upload_assinado_criar(%L::uuid, NULL::uuid, %L, %L)::text',
        v_p_own, 'contrato', k_titulo || ' C2'), 'criar C2')::uuid;
      PERFORM pg_temp.e1_erro(v_uid_own, format('SELECT %L FROM public.rpc_hr_documento_assinar(%L::uuid)', 'ok', v_doc_c2),
                              'HRA62', 'assinar documento vazio pela RPC');
      IF (SELECT d.estado FROM public.pessoas_documentos d WHERE d.id = v_doc_c2) IS DISTINCT FROM 'a_aguardar_assinatura' THEN
        RAISE EXCEPTION 'Conferir: o documento vazio nao devia ter mudado de estado.';
      END IF;
      v_prova_rpc := 'provado pela RPC rpc_hr_documento_assinar';
    END IF;

    -- g) Com envio activo (e processo de admissao, se a preparacao for possivel):
    --    anular retira o envio e reavalia o processo.
    IF v_q IS NOT NULL THEN
      BEGIN
        INSERT INTO public.pessoas_convites_admissao (pessoa_id, organization_id, token_hash, email_destino, valid_until)
        VALUES (v_q, k_nike, encode(sha256(convert_to('prova-20270111800000-' || v_tag, 'UTF8')), 'hex'),
                'prova.20270111800000@example.invalid', now() + interval '1 day')
        RETURNING id INTO v_conv;
        BEGIN
          UPDATE public.pessoas_convites_admissao c SET estado = 'aprovada' WHERE c.id = v_conv;
        EXCEPTION WHEN OTHERS THEN
          -- So para a preparacao (tudo desfeito no fim): sem os gatilhos de transicao.
          SET LOCAL session_replication_role = replica;
          UPDATE public.pessoas_convites_admissao c SET estado = 'aprovada' WHERE c.id = v_conv;
          SET LOCAL session_replication_role = origin;
        END;
      EXCEPTION WHEN OTHERS THEN
        v_conv := NULL;
        v_prova_adm := 'nao provado com processo (preparacao: ' || SQLSTATE || ' ' || left(SQLERRM, 160) || ')';
      END;
    ELSE
      v_prova_adm := 'nao provado com processo (a nike nao tem pessoa sem processo de admissao)';
      v_q := v_p;
    END IF;

    v_d1 := pg_temp.e1_ok(v_uid, format(
      'SELECT public.rpc_hr_documento_upload_assinado_criar(%L::uuid, NULL::uuid, %L, %L)::text',
      v_q, 'contrato', k_titulo || ' D1'), 'criar D1')::uuid;
    v_d2 := pg_temp.e1_ok(v_uid, format(
      'SELECT public.rpc_hr_documento_upload_assinado_criar(%L::uuid, NULL::uuid, %L, %L)::text',
      v_q, 'adenda', k_titulo || ' D2'), 'criar D2')::uuid;
    v_st := pg_temp.e1_directo(format(
      'UPDATE public.pessoas_documentos SET ficheiro_caminho = %L || id::text || %L, ficheiro_hash_sha256 = %L, ficheiro_anexado_em = now(), ficheiro_anexado_por = %L::uuid WHERE id IN (%L::uuid, %L::uuid)',
      k_nike::text || '/' || v_q::text || '/', '/' || gen_random_uuid()::text || '.pdf', repeat('b', 64), v_anew, v_d1, v_d2));
    IF v_st IS DISTINCT FROM 'ok' THEN
      RAISE EXCEPTION 'Conferir: anexar os ficheiros de teste a D1/D2 falhou (%).', v_st;
    END IF;
    v_envio1 := pg_temp.e1_ok(v_uid, format('SELECT public.rpc_hr_portal_documento_enviar(%L::uuid, %L::uuid, true)::text', v_d1, v_conv),
                              'enviar D1 ao portal')::uuid;
    v_envio2 := pg_temp.e1_ok(v_uid, format('SELECT public.rpc_hr_portal_documento_enviar(%L::uuid, %L::uuid, true)::text', v_d2, v_conv),
                              'enviar D2 ao portal')::uuid;
    IF v_conv IS NOT NULL THEN
      SELECT c.estado INTO v_estado FROM public.pessoas_convites_admissao c WHERE c.id = v_conv;
      IF v_estado IS DISTINCT FROM 'a_aguardar_assinaturas' THEN
        RAISE EXCEPTION 'Conferir: enviar D1/D2 para assinar devia por o processo em a_aguardar_assinaturas (esta %).', v_estado;
      END IF;
    END IF;
    PERFORM pg_temp.e1_ok(v_uid, format('SELECT %L FROM public.rpc_hr_documento_registar_assinatura_externa(%L::uuid)', 'ok', v_d2),
                          'assinar D2 por fora');
    IF v_conv IS NOT NULL THEN
      SELECT c.estado INTO v_estado FROM public.pessoas_convites_admissao c WHERE c.id = v_conv;
      IF v_estado IS DISTINCT FROM 'a_aguardar_assinaturas' THEN
        RAISE EXCEPTION 'Conferir: com D1 por assinar o processo devia continuar a_aguardar_assinaturas (esta %).', v_estado;
      END IF;
    END IF;

    v_res := pg_temp.e1_ok(v_uid, format('SELECT public.rpc_hr_documento_anular(%L::uuid, %L)::text', v_d1, k_motivo), 'anular D1');
    v_j := v_res::jsonb;
    IF v_j IS DISTINCT FROM jsonb_build_object('estado', 'anulado', 'envio_retirado', true) THEN
      RAISE EXCEPTION 'Conferir: anular D1 devia devolver {estado: anulado, envio_retirado: true}; deu %.', v_res;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_portal_envios e
                    WHERE e.id = v_envio1 AND e.retirado_em IS NOT NULL AND e.retirado_por = v_uid
                      AND e.retirado_motivo = k_motivo AND e.sms_codigo_hmac IS NULL AND e.sms_codigo_expira_em IS NULL) THEN
      RAISE EXCEPTION 'Conferir: o envio de D1 devia ficar retirado por quem anulou, com o motivo e sem codigo SMS.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_portal_eventos ev
                    WHERE ev.entidade = 'envio' AND ev.entidade_id = v_envio1 AND ev.evento = 'retirado'
                      AND ev.actor = 'rh' AND ev.actor_auth_uid = v_uid AND ev.organization_id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: faltou o evento retirado do envio de D1.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_documentos_ocorrencias o
                    WHERE o.documento_id = v_d1 AND o.accao = 'anulado' AND o.envio_retirado_id = v_envio1) THEN
      RAISE EXCEPTION 'Conferir: a ocorrencia de D1 devia apontar o envio retirado.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_portal_envios e WHERE e.id = v_envio2 AND e.retirado_em IS NULL) THEN
      RAISE EXCEPTION 'Conferir: o envio de D2 (assinado) nao devia ter sido tocado.';
    END IF;
    IF v_conv IS NOT NULL THEN
      SELECT c.estado INTO v_estado FROM public.pessoas_convites_admissao c WHERE c.id = v_conv;
      IF v_estado IS DISTINCT FROM 'assinaturas_concluidas' THEN
        RAISE EXCEPTION 'Conferir: depois de anular D1 o processo devia passar a assinaturas_concluidas (esta %).', v_estado;
      END IF;
      v_prova_adm := 'provado com processo (a_aguardar_assinaturas -> assinaturas_concluidas)';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE NOTICE 'Conferir 20270111800000: prova na nike; assinatura vazia: %; envio e processo: %.',
      v_prova_rpc, coalesce(v_prova_adm, 'provado so com envio sem processo');
    RAISE EXCEPTION 'teste_documentos_anular_ok' USING ERRCODE = 'HDA00';
  EXCEPTION
    WHEN SQLSTATE 'HDA00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.pessoas_documentos_ocorrencias)
     OR EXISTS (SELECT 1 FROM public.pessoas_documentos d WHERE d.titulo LIKE k_titulo || '%')
     OR EXISTS (SELECT 1 FROM public.pessoas_convites_admissao c WHERE c.email_destino = 'prova.20270111800000@example.invalid')
     OR EXISTS (SELECT 1 FROM public.pessoas_portal_envios e WHERE e.retirado_motivo = k_motivo) THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido 20270111800000: ocorrencias fechadas (RLS forcada, RESTRICTIVE, sem privilegios, so acrescenta); anular recusa sem sessao (42501), inexistente e sem permissao (HRA31), motivo invalido (HRA37), anulado e assinado (HRA38); anula com data, autor e motivo, acesso sensivel e ocorrencia; anulado imutavel; assinar sem conteudo HRA62; com envio activo retira-o e reavalia o processo.';
END;
$conferir$;

DROP FUNCTION pg_temp.e1_ok(uuid, text, text);
DROP FUNCTION pg_temp.e1_erro(uuid, text, text, text);
DROP FUNCTION pg_temp.e1_chamar(uuid, text);
DROP FUNCTION pg_temp.e1_directo(text);

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): pendentes so
--    este e 20270111810000.
-- 2. Prova na nike ANTES do push: correr o ficheiro numa transaccao terminada
--    por um RAISE EXCEPTION (desfaz tudo); as guardas confirmam os corpos de
--    que depende, o conferir prova o resto (NOTICE com o que ficou por provar).
-- 3. Cliente (E2/E4) publicado no mesmo envio: ver o relatorio da entrega.
-- ==============================================================================
