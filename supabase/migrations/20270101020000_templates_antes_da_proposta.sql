-- RASCUNHO, NADA APLICADO. Base RH (uetjghdkwbywbftedtth). Não é uma migration até ser revista (ecc:database-reviewer e ecc:security-reviewer)
-- e copiada para supabase/migrations com este mesmo nome (20270101020000_templates_antes_da_proposta.sql).
-- Desenho: NOVO-20270101020000_templates_antes_da_proposta.DESENHO.md
--
-- O problema: na ficha do negócio, escolher o template da proposta antes de a proposta existir dava NE007 («A proposta ainda não existe:
-- nasce quando o orçamento é enviado»). A proposta só nasce no envio (neg_guardar_negocio) e o contrato só depois da aceitação; a escolha
-- tem de poder ser feita antes e ficar guardada.
--
-- O que faz:
--   1. Tabela nova negocio_templates (1 para 1 com negocios): a escolha pendente do negócio (template do orçamento, da proposta, minuta,
--      respostas e texto do contrato). Tabela à parte e não colunas em negocios: não passa pelos gatilhos de negocios (eventos, fechado só
--      leitura, updated_at), não aparece em leituras do Ben que leiam a linha inteira, e não arrasta 1 MB de texto para cada leitura de negocios.
--   2. neg_definir_templates_negocio grava SEMPRE no negócio (deixa de haver NE007) e, se o documento já existir, também nele, como antes.
--      NE008 mantém-se: documento existente e já decidido/enviado para assinatura. neg_ler_templates_negocio devolve as mesmas chaves:
--      com documento, o valor do documento; sem documento, a escolha pendente (e *_editavel = true).
--   3. Ao nascer: gatilhos BEFORE INSERT em quotes, proposals e client_contracts copiam a escolha pendente para o documento, se ele vier sem
--      template, ANTES do gatilho que congela o snapshot. Ordem (os gatilhos disparam por nome, ordem de bytes):
--        quotes:            trg_negocios_10_herdar < trg_negocios_20_validar_ins < trg_negocios_25_template_pendente
--        proposals:         trg_negocios_10_herdar < trg_negocios_20_validar_ins < trg_negocios_25_template_pendente < trg_proposals_freeze_template_snapshot
--        client_contracts:  trg_contracts_05_template_pendente < trg_contracts_freeze_template < ... < trg_negocios_10_herdar
--      No contrato o congelamento corre ANTES da herança do negócio (trg_c < trg_n), por isso o gatilho novo só vê o negocio_id que vem no
--      próprio INSERT. É o caso de neg_guardar_negocio (insere o contrato com negocio_id). Um contrato que só herda o negócio (CRM) não leva
--      a escolha pendente.
--
-- NÃO MEXE em neg_guardar_negocio, neg_ler_negocios, fn_neg_ler_*, nos gatilhos de congelamento nem em migrations existentes.
-- Muda fn_neg_templates_estado (privada, da 20261231999800) e as duas RPCs; fn_neg_templates_uuid fica como está.
--
-- ORDEM OBRIGATÓRIA: testes contra o remoto ainda sem isto (o vermelho é agora: escolher o template da proposta num negócio sem proposta
-- dá NE007); migration list --linked (pendente só este ficheiro); db push --linked --dry-run; db push --linked; nunca na Mudelar.
-- O que muda para a Mudelar: os três gatilhos correm em todos os INSERT de quotes, proposals e client_contracts de todas as organizações;
-- sem linha em negocio_templates (todas as orgs hoje) cada um faz no máximo uma leitura por chave primária e não altera nada.
-- Os documentos do CRM (sem negocio_id) saem logo na primeira condição.
--
-- Versões de partida, confirmadas em 29/10 por pg_get_functiondef no remoto (a guarda recusa correr se alguma tiver mudado).

SET lock_timeout = '5s';

-- -----------------------------------------------------------------------------
-- 0. Guarda de partida
-- -----------------------------------------------------------------------------
DO $guarda$
DECLARE
  r     record;
  v_def text;
  v_n   integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- as que esta migration substitui (as da 20261231999800, tal como estão no remoto)
    ('public.neg_definir_templates_negocio(uuid,jsonb)',                        '2892a6303529a8d07f739d76909a6e0d'),
    ('public.neg_ler_templates_negocio(uuid)',                                  'bde236f40c8a27d0cc4a02c20713fde0'),
    ('public.fn_neg_templates_estado(uuid)',                                    '966cda4bf5905584210b137164413f30'),
    -- as de que depende e não toca
    ('public.fn_neg_templates_uuid(jsonb,text)',                                '61945ed7c87766720b50d27eedf6749b'),
    ('public.fn_cat_exigir(uuid,text)',                                         '98ee70b0095aed371e0a1095ddfb0e2e'),
    ('public.fn_neg_docs_crm(uuid)',                                            'a4b981e9a260aebc502759fe938bea28'),
    ('public.proposal_freeze_template_snapshot()',                              '2fa58ee3866b7be1a453bfed978aea61'),
    ('public.contract_freeze_template_snapshot()',                              'bc0992ddeb603c7c44e99d1f435ae16c'),
    ('public.fn_neg_herdar_orcamento()',                                        '724bbe7fc019909ee0d37dc4fce7edc8'),
    ('public.fn_neg_herdar_proposta()',                                         'c9ace1898c40cf4afb851f2bf1eb24c1'),
    ('public.fn_neg_herdar_contrato()',                                         '5a18d69293c321eaf1e54b49126cec3b'),
    -- as do Ben: não se tocam (a proposta e o contrato nascem nelas, com negocio_id no INSERT)
    ('public.neg_guardar_negocio(uuid,uuid,jsonb)',                             'ec25f9be524abe3757b6f186423c61e4'),
    ('public.neg_ler_negocios(uuid)',                                           '9d3721c03973fa2beda8100957435eec')
  ) AS t(assinatura, h) LOOP
    IF to_regprocedure(r.assinatura) IS NULL THEN
      RAISE EXCEPTION 'Guarda: % não existe.', r.assinatura;
    END IF;
    v_def := pg_get_functiondef(to_regprocedure(r.assinatura));
    IF md5(v_def) <> r.h THEN
      RAISE EXCEPTION 'Guarda: % mudou desde 29/10 (md5 %); rever este rascunho contra o texto vivo.', r.assinatura, md5(v_def);
    END IF;
  END LOOP;

  -- os gatilhos de que depende a ordem, nas tabelas certas, BEFORE INSERT por linha
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal
    AND (t.tgrelid::regclass, t.tgname::text) IN (
      ('public.proposals'::regclass,        'trg_proposals_freeze_template_snapshot'),
      ('public.client_contracts'::regclass, 'trg_contracts_freeze_template'),
      ('public.quotes'::regclass,           'trg_negocios_10_herdar'),
      ('public.proposals'::regclass,        'trg_negocios_10_herdar'),
      ('public.client_contracts'::regclass, 'trg_negocios_10_herdar'))
    AND (t.tgtype & 1) <> 0 AND (t.tgtype & 2) <> 0 AND (t.tgtype & 4) <> 0;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'Guarda: os gatilhos de congelamento/herança não estão como em 29/10 (encontrados %/5).', v_n;
  END IF;

  -- as colunas de que depende, com o tipo esperado
  SELECT count(*) INTO v_n
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND (c.table_name::text, c.column_name::text, c.data_type::text) IN (
      ('quotes', 'template_id', 'uuid'),
      ('quotes', 'fluxo_emylia', 'boolean'),
      ('quotes', 'adenda_id', 'uuid'),
      ('proposals', 'template_id', 'uuid'),
      ('proposals', 'template_snapshot', 'jsonb'),
      ('proposals', 'is_deleted', 'boolean'),
      ('client_contracts', 'contract_template_id', 'uuid'),
      ('client_contracts', 'prompt_values', 'jsonb'),
      ('client_contracts', 'contract_body_html', 'text'),
      ('client_contracts', 'template_snapshot', 'jsonb'),
      ('client_contracts', 'versao', 'smallint'),
      ('client_contracts', 'adenda_id', 'uuid'),
      ('proposal_templates', 'template_type', 'text'),
      ('proposal_templates', 'is_active', 'boolean'),
      ('client_contract_templates', 'is_active', 'boolean'));
  IF v_n <> 15 THEN
    RAISE EXCEPTION 'Guarda: faltam colunas esperadas (encontradas %/15).', v_n;
  END IF;

  -- a chave (id, organization_id) de negocios, para a chave estrangeira composta
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k
                 WHERE k.conrelid = 'public.negocios'::regclass AND k.contype::text IN ('p', 'u')
                   AND pg_get_constraintdef(k.oid) = 'UNIQUE (id, organization_id)') THEN
    RAISE EXCEPTION 'Guarda: negocios sem UNIQUE (id, organization_id).';
  END IF;

  -- os objectos novos: ou não existem, ou são desta migration (re-execução)
  IF to_regclass('public.negocio_templates') IS NOT NULL
     AND position('20270101020000' IN coalesce(pg_catalog.obj_description(pg_catalog.to_regclass('public.negocio_templates'), 'pg_class'), '')) = 0 THEN
    RAISE EXCEPTION 'Guarda: já existe public.negocio_templates e não é desta migration.';
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname::text IN ('fn_neg_templates_aplicar_orcamento', 'fn_neg_templates_aplicar_proposta', 'fn_neg_templates_aplicar_contrato')
    AND position('20270101020000' IN coalesce(pg_catalog.obj_description(p.oid, 'pg_proc'), '')) = 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: já existe uma função com o nome de uma das novas que não é desta migration.';
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal
    AND t.tgname::text IN ('trg_negocios_25_template_pendente', 'trg_contracts_05_template_pendente')
    AND t.tgfoid NOT IN (SELECT p.oid FROM pg_catalog.pg_proc p
                         WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text LIKE 'fn_neg_templates_aplicar_%');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: já existe um gatilho com o nome de um dos novos que não é desta migration.';
  END IF;
END
$guarda$;

-- -----------------------------------------------------------------------------
-- 1. A escolha pendente do negócio. Uma linha por negócio, só quando alguém escolhe. NULL = nenhum template escolhido.
--    Escreve-a só neg_definir_templates_negocio (SECURITY DEFINER); lê-se com pessoas.view, como as irmãs (negocio_respostas).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.negocio_templates (
  negocio_id            uuid        NOT NULL PRIMARY KEY,
  organization_id       uuid        NOT NULL,
  template_orcamento_id uuid        REFERENCES public.proposal_templates(id) ON DELETE SET NULL,
  template_proposta_id  uuid        REFERENCES public.proposal_templates(id) ON DELETE SET NULL,
  minuta_id             uuid        REFERENCES public.client_contract_templates(id) ON DELETE SET NULL,
  minuta_respostas      jsonb       CHECK (minuta_respostas IS NULL OR jsonb_typeof(minuta_respostas) = 'object'),
  contrato_corpo_html   text,
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE
);
-- para o ON DELETE SET NULL não varrer a tabela quando se apaga um template
CREATE INDEX IF NOT EXISTS negocio_templates_tpl_orcamento_idx ON public.negocio_templates (template_orcamento_id) WHERE template_orcamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS negocio_templates_tpl_proposta_idx  ON public.negocio_templates (template_proposta_id)  WHERE template_proposta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS negocio_templates_minuta_idx        ON public.negocio_templates (minuta_id)             WHERE minuta_id IS NOT NULL;

ALTER TABLE public.negocio_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS negocio_templates_ler ON public.negocio_templates;
CREATE POLICY negocio_templates_ler ON public.negocio_templates
  FOR SELECT TO authenticated
  USING (is_system_admin_user((SELECT auth.uid())) OR has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view'::text, organization_id));
REVOKE ALL ON TABLE public.negocio_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.negocio_templates TO authenticated;
GRANT ALL ON TABLE public.negocio_templates TO service_role;
COMMENT ON TABLE public.negocio_templates IS 'Negócio, templates: a escolha pendente (template do orçamento, da proposta, minuta, respostas e texto do contrato), aplicada aos documentos quando nascem. Escreve só neg_definir_templates_negocio. 20270101020000.';

-- -----------------------------------------------------------------------------
-- 2. Privada: o estado. Com documento, o valor do documento (é o que se congela); sem documento, a escolha pendente, e *_editavel = true.
--    Mesmas chaves da 20261231999800.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_neg_templates_estado(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT q.id, q.versao, q.estado, q.template_id
    FROM quotes q
    WHERE q.negocio_id = p_negocio_id AND q.fluxo_emylia AND q.deleted_at IS NULL AND q.adenda_id IS NULL
      AND q.estado <> 'substituido'
    ORDER BY q.versao DESC NULLS LAST
    LIMIT 1
  ), p AS (
    SELECT p.id, p.status, p.template_id, p.template_snapshot
    FROM proposals p
    WHERE p.negocio_id = p_negocio_id AND coalesce(p.is_deleted, false) = false
    ORDER BY p.created_at
    LIMIT 1
  ), c AS (
    SELECT c.id, c.versao, c.status, c.contract_template_id, c.prompt_values, c.contract_body_html
    FROM client_contracts c
    WHERE c.negocio_id = p_negocio_id AND c.versao IS NOT NULL AND c.adenda_id IS NULL AND c.deleted_at IS NULL
    ORDER BY c.versao DESC
    LIMIT 1
  ), t AS (
    SELECT t.template_orcamento_id, t.template_proposta_id, t.minuta_id, t.minuta_respostas, t.contrato_corpo_html
    FROM negocio_templates t
    WHERE t.negocio_id = p_negocio_id
  ), e AS (
    SELECT EXISTS (SELECT 1 FROM q) AS ha_q, EXISTS (SELECT 1 FROM p) AS ha_p, EXISTS (SELECT 1 FROM c) AS ha_c
  )
  SELECT jsonb_build_object(
    'negocio_id',                 p_negocio_id,
    'orcamento_id',               (SELECT q.id FROM q),
    'orcamento_versao',           (SELECT q.versao FROM q),
    'orcamento_editavel',         CASE WHEN e.ha_q THEN coalesce((SELECT q.estado NOT IN ('aceite', 'rejeitado', 'recusado') FROM q), false) ELSE true END,
    'template_orcamento_id',      CASE WHEN e.ha_q THEN (SELECT q.template_id FROM q) ELSE (SELECT t.template_orcamento_id FROM t) END,
    'proposta_id',                (SELECT p.id FROM p),
    'proposta_editavel',          CASE WHEN e.ha_p THEN coalesce((SELECT coalesce(p.status, '') IN ('draft', 'sent', 'viewed') FROM p), false) ELSE true END,
    'template_proposta_id',       CASE WHEN e.ha_p THEN (SELECT p.template_id FROM p) ELSE (SELECT t.template_proposta_id FROM t) END,
    'template_proposta_snapshot', (SELECT p.template_snapshot FROM p),
    'contrato_id',                (SELECT c.id FROM c),
    'contrato_versao',            (SELECT c.versao FROM c),
    'contrato_editavel',          CASE WHEN e.ha_c THEN coalesce((SELECT c.status IN ('draft', 'changes_requested') FROM c), false) ELSE true END,
    'minuta_id',                  CASE WHEN e.ha_c THEN (SELECT c.contract_template_id FROM c) ELSE (SELECT t.minuta_id FROM t) END,
    'minuta_respostas',           CASE WHEN e.ha_c THEN (SELECT c.prompt_values FROM c) ELSE (SELECT t.minuta_respostas FROM t) END,
    'contrato_corpo_html',        CASE WHEN e.ha_c THEN (SELECT c.contract_body_html FROM c) ELSE (SELECT t.contrato_corpo_html FROM t) END)
  FROM e;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_templates_estado(uuid) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.fn_neg_templates_estado(uuid) IS 'Negócio, templates: o estado (orçamento, proposta, contrato actuais e os templates de cada um; sem documento, a escolha pendente de negocio_templates). Sem verificação de permissão: só para neg_ler_templates_negocio e neg_definir_templates_negocio. 20261231999800, 20270101020000.';

-- -----------------------------------------------------------------------------
-- 3. Ler (pessoas.view). Corpo igual ao da 20261231999800; recria-se só para o comentário dizer a versão.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_ler_templates_negocio(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT n.organization_id INTO v_org FROM negocios n WHERE n.id = p_negocio_id AND n.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(v_org, 'pessoas.view');
  RETURN public.fn_neg_templates_estado(p_negocio_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_ler_templates_negocio(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_ler_templates_negocio(uuid) TO authenticated;
COMMENT ON FUNCTION public.neg_ler_templates_negocio(uuid) IS 'Negócio, templates: lê o template do orçamento, o da proposta (com o snapshot congelado) e a minuta, respostas e texto do contrato actuais; sem documento, a escolha pendente. pessoas.view. 20261231999800, 20270101020000.';

-- -----------------------------------------------------------------------------
-- 4. Gravar (pessoas.edit). p_dados: objecto só com as chaves a mudar (as ausentes ficam como estão):
--      template_orcamento_id  uuid | null   proposal_templates do tipo 'quote', activo, da organização
--      template_proposta_id   uuid | null   proposal_templates do tipo 'proposal', activo, da organização
--      minuta_id              uuid | null   client_contract_templates activa, da organização
--      minuta_respostas       objeto | null { chave: texto }, chaves como {{chave}} (a-z, A-Z, 0-9, _)
--      contrato_corpo_html    texto | null  o texto final do contrato (compõe-o a aplicação)
--    Grava SEMPRE em negocio_templates; se o documento já existir, grava também nele (quotes.template_id da versão actual,
--    proposals.template_id, client_contracts.contract_template_id/prompt_values/contract_body_html da versão actual).
--    Na primeira gravação a linha pendente nasce com o que os documentos já têm (fica um espelho completo).
--    Erros: CT001 sem permissão ou negócio desconhecido; NE005 negócio do CRM; NE006 dados inválidos;
--           NE008 o documento existe e já não se pode mudar (decidido, enviado para assinatura ou assinado); NE009 template inválido.
--    NE007 deixa de existir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_definir_templates_negocio(p_negocio_id uuid, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_chaves     CONSTANT text[] := ARRAY['template_orcamento_id', 'template_proposta_id', 'minuta_id', 'minuta_respostas', 'contrato_corpo_html'];
  c_max_corpo  CONSTANT integer := 1048576;
  c_max_resp   CONSTANT integer := 262144;
  c_max_chaves CONSTANT integer := 200;
  c_max_valor  CONSTANT integer := 5000;
  v_org        uuid;
  v_neg        negocios;
  v_e          jsonb;
  v_k          text;
  v_id         uuid;
  v_resp       jsonb;
  v_corpo      text;
  v_tem_minuta boolean;
  v_tem_resp   boolean;
  v_tem_corpo  boolean;
  v_x          record;
  v_p          negocio_templates;
BEGIN
  -- 1. Permissão primeiro (antes de bloquear o que quer que seja); negócio desconhecido = a mesma mensagem.
  SELECT n.organization_id INTO v_org FROM negocios n WHERE n.id = p_negocio_id AND n.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(v_org, 'pessoas.edit');

  -- 2. Forma dos dados (NE006).
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'Dados inválidos: tem de ser um objecto.' USING ERRCODE = 'NE006';
  END IF;
  FOR v_k IN SELECT k.chave FROM jsonb_object_keys(p_dados) AS k(chave) LOOP
    IF NOT (v_k = ANY (c_chaves)) THEN
      RAISE EXCEPTION 'Dados inválidos: chave desconhecida (%).', left(v_k, 60) USING ERRCODE = 'NE006';
    END IF;
  END LOOP;

  v_tem_minuta := p_dados ? 'minuta_id';
  v_tem_resp   := p_dados ? 'minuta_respostas';
  v_tem_corpo  := p_dados ? 'contrato_corpo_html';

  IF v_tem_resp THEN
    v_resp := NULLIF(p_dados -> 'minuta_respostas', 'null'::jsonb);
    IF v_resp IS NOT NULL THEN
      IF jsonb_typeof(v_resp) <> 'object' OR octet_length(v_resp::text) > c_max_resp THEN
        RAISE EXCEPTION 'Dados inválidos: as respostas da minuta são um objecto { chave: texto } (até 256 KB).' USING ERRCODE = 'NE006';
      END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(v_resp)) > c_max_chaves THEN
        RAISE EXCEPTION 'Dados inválidos: até 200 respostas na minuta.' USING ERRCODE = 'NE006';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each(v_resp) AS e(chave, valor)
                 WHERE e.chave !~ '^[a-zA-Z0-9_]{1,80}$'
                    OR jsonb_typeof(e.valor) <> 'string'
                    OR char_length(e.valor #>> '{}') > c_max_valor) THEN
        RAISE EXCEPTION 'Dados inválidos: cada resposta da minuta tem uma chave {{chave}} e um texto (até 5000 caracteres).' USING ERRCODE = 'NE006';
      END IF;
    END IF;
  END IF;

  IF v_tem_corpo THEN
    IF jsonb_typeof(p_dados -> 'contrato_corpo_html') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Dados inválidos: o texto do contrato é texto ou null.' USING ERRCODE = 'NE006';
    END IF;
    v_corpo := p_dados ->> 'contrato_corpo_html';
    IF v_corpo IS NOT NULL AND octet_length(v_corpo) > c_max_corpo THEN
      RAISE EXCEPTION 'Dados inválidos: o texto do contrato tem no máximo 1 MB.' USING ERRCODE = 'NE006';
    END IF;
  END IF;

  -- 3. O negócio, bloqueado (o mesmo bloqueio que o UPDATE de neg_guardar_negocio toma primeiro: as duas gravações não se cruzam, e a
  --    ordem negócio, orçamento, proposta, contrato é a mesma dela). Serializa também a primeira gravação da linha pendente.
  SELECT n.* INTO v_neg FROM negocios n WHERE n.id = p_negocio_id AND n.organization_id = v_org AND n.deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  IF NOT coalesce(v_neg.fluxo_emylia, false) AND public.fn_neg_docs_crm(p_negocio_id) THEN
    RAISE EXCEPTION 'Este negócio é do CRM: abra-o em Contratos/Propostas.' USING ERRCODE = 'NE005';
  END IF;

  -- 4. Os documentos actuais, bloqueados, e o estado relido depois do bloqueio.
  v_e := public.fn_neg_templates_estado(p_negocio_id);
  PERFORM 1 FROM quotes q WHERE q.id = (v_e ->> 'orcamento_id')::uuid FOR UPDATE;
  PERFORM 1 FROM proposals p WHERE p.id = (v_e ->> 'proposta_id')::uuid FOR UPDATE;
  PERFORM 1 FROM client_contracts c WHERE c.id = (v_e ->> 'contrato_id')::uuid FOR UPDATE;
  v_e := public.fn_neg_templates_estado(p_negocio_id);

  -- 5. A escolha pendente; se ainda não há, nasce com o que os documentos (ou nada) têm hoje.
  SELECT t.* INTO v_p FROM negocio_templates t WHERE t.negocio_id = p_negocio_id FOR UPDATE;
  IF NOT FOUND THEN
    v_p.negocio_id            := p_negocio_id;
    v_p.organization_id       := v_org;
    v_p.template_orcamento_id := (v_e ->> 'template_orcamento_id')::uuid;
    v_p.template_proposta_id  := (v_e ->> 'template_proposta_id')::uuid;
    v_p.minuta_id             := (v_e ->> 'minuta_id')::uuid;
    IF jsonb_typeof(v_e -> 'minuta_respostas') = 'object' THEN
      v_p.minuta_respostas := v_e -> 'minuta_respostas';
    END IF;
    v_p.contrato_corpo_html   := v_e ->> 'contrato_corpo_html';
  END IF;

  -- 6. Template do tipo orçamento: no negócio e, se houver, na versão actual do orçamento.
  IF p_dados ? 'template_orcamento_id' THEN
    v_id := public.fn_neg_templates_uuid(p_dados -> 'template_orcamento_id', 'template_orcamento_id');
    IF v_e ->> 'orcamento_id' IS NOT NULL AND NOT (v_e ->> 'orcamento_editavel')::boolean THEN
      RAISE EXCEPTION 'O orçamento já foi decidido pelo cliente: o template não muda.' USING ERRCODE = 'NE008';
    END IF;
    IF v_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM proposal_templates t
         WHERE t.id = v_id AND t.organization_id = v_org AND t.template_type = 'quote' AND t.is_active IS TRUE) THEN
      RAISE EXCEPTION 'Template de orçamento desconhecido, inactivo ou de outra organização.' USING ERRCODE = 'NE009';
    END IF;
    IF v_e ->> 'orcamento_id' IS NOT NULL THEN
      UPDATE quotes q SET template_id = v_id
      WHERE q.id = (v_e ->> 'orcamento_id')::uuid AND q.template_id IS DISTINCT FROM v_id;
    END IF;
    v_p.template_orcamento_id := v_id;
  END IF;

  -- 7. Template do tipo proposta: no negócio e, se houver, na proposta (o snapshot escreve-o proposal_freeze_template_snapshot).
  IF p_dados ? 'template_proposta_id' THEN
    v_id := public.fn_neg_templates_uuid(p_dados -> 'template_proposta_id', 'template_proposta_id');
    IF v_e ->> 'proposta_id' IS NOT NULL AND NOT (v_e ->> 'proposta_editavel')::boolean THEN
      RAISE EXCEPTION 'A proposta já foi decidida pelo cliente: o template não muda.' USING ERRCODE = 'NE008';
    END IF;
    IF v_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM proposal_templates t
         WHERE t.id = v_id AND t.organization_id = v_org AND t.template_type = 'proposal' AND t.is_active IS TRUE) THEN
      RAISE EXCEPTION 'Template de proposta desconhecido, inactivo ou de outra organização.' USING ERRCODE = 'NE009';
    END IF;
    IF v_e ->> 'proposta_id' IS NOT NULL THEN
      UPDATE proposals p SET template_id = v_id
      WHERE p.id = (v_e ->> 'proposta_id')::uuid AND p.template_id IS DISTINCT FROM v_id;
    END IF;
    v_p.template_proposta_id := v_id;
  END IF;

  -- 8. Minuta, respostas e texto final: no negócio e, se houver, na versão actual do contrato (só em rascunho ou com alterações pedidas).
  IF v_tem_minuta OR v_tem_resp OR v_tem_corpo THEN
    v_id := NULL;
    IF v_tem_minuta THEN
      v_id := public.fn_neg_templates_uuid(p_dados -> 'minuta_id', 'minuta_id');
    END IF;
    IF v_e ->> 'contrato_id' IS NOT NULL AND NOT (v_e ->> 'contrato_editavel')::boolean THEN
      RAISE EXCEPTION 'O contrato já foi enviado para assinatura ou fechado: a minuta e o texto não mudam.' USING ERRCODE = 'NE008';
    END IF;
    IF v_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM client_contract_templates t
         WHERE t.id = v_id AND t.organization_id = v_org AND t.is_active IS TRUE) THEN
      RAISE EXCEPTION 'Minuta desconhecida, inactiva ou de outra organização.' USING ERRCODE = 'NE009';
    END IF;
    IF v_e ->> 'contrato_id' IS NOT NULL THEN
      SELECT c.contract_template_id, c.prompt_values, c.contract_body_html INTO v_x
      FROM client_contracts c WHERE c.id = (v_e ->> 'contrato_id')::uuid;
      IF v_tem_minuta THEN v_x.contract_template_id := v_id; END IF;
      IF v_tem_resp THEN v_x.prompt_values := v_resp; END IF;
      IF v_tem_corpo THEN v_x.contract_body_html := v_corpo; END IF;
      UPDATE client_contracts c
      SET contract_template_id = v_x.contract_template_id,
          prompt_values        = v_x.prompt_values,
          contract_body_html   = v_x.contract_body_html
      WHERE c.id = (v_e ->> 'contrato_id')::uuid
        AND (c.contract_template_id, c.prompt_values, c.contract_body_html)
            IS DISTINCT FROM (v_x.contract_template_id, v_x.prompt_values, v_x.contract_body_html);
    END IF;
    IF v_tem_minuta THEN v_p.minuta_id := v_id; END IF;
    IF v_tem_resp THEN v_p.minuta_respostas := v_resp; END IF;
    IF v_tem_corpo THEN v_p.contrato_corpo_html := v_corpo; END IF;
  END IF;

  -- 9. A escolha pendente, gravada (só se veio alguma chave e só se mudou).
  IF p_dados <> '{}'::jsonb THEN
    INSERT INTO negocio_templates AS t
      (negocio_id, organization_id, template_orcamento_id, template_proposta_id, minuta_id, minuta_respostas, contrato_corpo_html, atualizado_em)
    VALUES
      (p_negocio_id, v_org, v_p.template_orcamento_id, v_p.template_proposta_id, v_p.minuta_id, v_p.minuta_respostas, v_p.contrato_corpo_html, now())
    ON CONFLICT (negocio_id) DO UPDATE
      SET template_orcamento_id = EXCLUDED.template_orcamento_id,
          template_proposta_id  = EXCLUDED.template_proposta_id,
          minuta_id             = EXCLUDED.minuta_id,
          minuta_respostas      = EXCLUDED.minuta_respostas,
          contrato_corpo_html   = EXCLUDED.contrato_corpo_html,
          atualizado_em         = now()
      WHERE (t.template_orcamento_id, t.template_proposta_id, t.minuta_id, t.minuta_respostas, t.contrato_corpo_html)
            IS DISTINCT FROM
            (EXCLUDED.template_orcamento_id, EXCLUDED.template_proposta_id, EXCLUDED.minuta_id, EXCLUDED.minuta_respostas, EXCLUDED.contrato_corpo_html);
  END IF;

  RETURN public.fn_neg_templates_estado(p_negocio_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_definir_templates_negocio(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_definir_templates_negocio(uuid, jsonb) TO authenticated;
COMMENT ON FUNCTION public.neg_definir_templates_negocio(uuid, jsonb) IS 'Negócio, templates: grava a escolha no negócio (negocio_templates) e, se o documento já existir e for editável, também nele (quotes.template_id, proposals.template_id, client_contracts.contract_template_id/prompt_values/contract_body_html). Só as chaves enviadas; null = nenhum. pessoas.edit. 20261231999800, 20270101020000.';

-- -----------------------------------------------------------------------------
-- 5. Aplicar ao nascer. Três gatilhos BEFORE INSERT, um por tabela. Só agem se o documento vier sem template e o negócio tiver uma
--    escolha pendente válida (template activo, da mesma organização do documento, do tipo certo). Uma leitura por chave primária e uma
--    por template; sem ciclos nem escritas noutras tabelas. SECURITY DEFINER como os gatilhos irmãos, para o resultado não depender da RLS
--    de quem insere (portal sem sessão incluído); search_path fixo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_neg_templates_aplicar_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NEW.template_id IS NOT NULL OR NEW.negocio_id IS NULL OR NOT coalesce(NEW.fluxo_emylia, false) OR NEW.adenda_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT t.template_orcamento_id INTO v_id
  FROM public.negocio_templates t
  WHERE t.negocio_id = NEW.negocio_id AND t.organization_id = NEW.organization_id;
  IF v_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.proposal_templates pt
       WHERE pt.id = v_id AND pt.organization_id = NEW.organization_id AND pt.template_type = 'quote' AND pt.is_active IS TRUE) THEN
    NEW.template_id := v_id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_templates_aplicar_orcamento() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.fn_neg_templates_aplicar_orcamento() IS 'Negócio, templates: gatilho BEFORE INSERT em quotes; um orçamento da Emylia que nasce sem template leva o escolhido no negócio. 20270101020000.';

CREATE OR REPLACE FUNCTION public.fn_neg_templates_aplicar_proposta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- quem já traz template ou um snapshot próprio manda (o snapshot que trouxer ficaria a não bater com o template)
  IF NEW.template_id IS NOT NULL OR NEW.template_snapshot IS NOT NULL OR NEW.negocio_id IS NULL OR coalesce(NEW.is_deleted, false) THEN
    RETURN NEW;
  END IF;
  SELECT t.template_proposta_id INTO v_id
  FROM public.negocio_templates t
  WHERE t.negocio_id = NEW.negocio_id AND t.organization_id = NEW.organization_id;
  IF v_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.proposal_templates pt
       WHERE pt.id = v_id AND pt.organization_id = NEW.organization_id AND pt.template_type = 'proposal' AND pt.is_active IS TRUE) THEN
    NEW.template_id := v_id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_templates_aplicar_proposta() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.fn_neg_templates_aplicar_proposta() IS 'Negócio, templates: gatilho BEFORE INSERT em proposals, antes de trg_proposals_freeze_template_snapshot; a proposta que nasce sem template leva a escolhida no negócio. 20270101020000.';

CREATE OR REPLACE FUNCTION public.fn_neg_templates_aplicar_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_p public.negocio_templates;
BEGIN
  -- corre antes da herança (trg_negocios_10_herdar): só vê o negocio_id que vem no INSERT, como em neg_guardar_negocio
  IF NEW.negocio_id IS NULL OR NEW.versao IS NULL OR NEW.adenda_id IS NOT NULL OR NEW.template_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT t.* INTO v_p
  FROM public.negocio_templates t
  WHERE t.negocio_id = NEW.negocio_id AND t.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NEW.contract_template_id IS NULL AND v_p.minuta_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.client_contract_templates ct
       WHERE ct.id = v_p.minuta_id AND ct.organization_id = NEW.organization_id AND ct.is_active IS TRUE) THEN
    NEW.contract_template_id := v_p.minuta_id;
  END IF;
  -- respostas e texto são da minuta escolhida: só se copiam quando o contrato fica com essa mesma minuta (ou ambos sem nenhuma)
  IF NEW.contract_template_id IS NOT DISTINCT FROM v_p.minuta_id THEN
    IF NEW.prompt_values IS NULL THEN
      NEW.prompt_values := v_p.minuta_respostas;
    END IF;
    -- o texto final é composto pela aplicação com os dados da versão em que foi escrito: uma versão nova (que substitui outra) nasce sem ele
    IF NEW.contract_body_html IS NULL AND NEW.replaces_contract_id IS NULL THEN
      NEW.contract_body_html := v_p.contrato_corpo_html;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_templates_aplicar_contrato() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.fn_neg_templates_aplicar_contrato() IS 'Negócio, templates: gatilho BEFORE INSERT em client_contracts, antes de trg_contracts_freeze_template; a versão do contrato que nasce sem minuta leva a minuta, as respostas e o texto escolhidos no negócio. 20270101020000.';

CREATE OR REPLACE TRIGGER trg_negocios_25_template_pendente
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_templates_aplicar_orcamento();
CREATE OR REPLACE TRIGGER trg_negocios_25_template_pendente
  BEFORE INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_templates_aplicar_proposta();
CREATE OR REPLACE TRIGGER trg_contracts_05_template_pendente
  BEFORE INSERT ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_templates_aplicar_contrato();

-- -----------------------------------------------------------------------------
-- 6. Guarda final
-- -----------------------------------------------------------------------------
DO $final$
DECLARE
  r   record;
  v_n integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.neg_definir_templates_negocio(uuid,jsonb)', true, true),
    ('public.neg_ler_templates_negocio(uuid)',           true, true),
    ('public.fn_neg_templates_estado(uuid)',             true, false),
    ('public.fn_neg_templates_aplicar_orcamento()',      true, false),
    ('public.fn_neg_templates_aplicar_proposta()',       true, false),
    ('public.fn_neg_templates_aplicar_contrato()',       true, false)
  ) AS t(assinatura, definer, publica) LOOP
    IF to_regprocedure(r.assinatura) IS NULL THEN
      RAISE EXCEPTION 'Guarda final: % não ficou criada.', r.assinatura;
    END IF;
    IF (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(r.assinatura)) IS DISTINCT FROM r.definer THEN
      RAISE EXCEPTION 'Guarda final: % com SECURITY inesperado.', r.assinatura;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, unnest(p.proconfig) AS cfg(v)
                   WHERE p.oid = to_regprocedure(r.assinatura) AND cfg.v LIKE 'search_path=%') THEN
      RAISE EXCEPTION 'Guarda final: % sem search_path fixo.', r.assinatura;
    END IF;
    IF has_function_privilege('anon', to_regprocedure(r.assinatura), 'EXECUTE') THEN
      RAISE EXCEPTION 'Guarda final: anon executa %.', r.assinatura;
    END IF;
    IF has_function_privilege('authenticated', to_regprocedure(r.assinatura), 'EXECUTE') IS DISTINCT FROM r.publica THEN
      RAISE EXCEPTION 'Guarda final: privilégio de authenticated em % diferente do esperado.', r.assinatura;
    END IF;
  END LOOP;

  -- a tabela: RLS ligada, só a política de leitura, anon sem nada, authenticated só lê
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = 'public.negocio_templates'::regclass) THEN
    RAISE EXCEPTION 'Guarda final: negocio_templates sem RLS.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_policies pol WHERE pol.schemaname = 'public' AND pol.tablename = 'negocio_templates';
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies pol
                             WHERE pol.schemaname = 'public' AND pol.tablename = 'negocio_templates' AND pol.cmd = 'SELECT') THEN
    RAISE EXCEPTION 'Guarda final: negocio_templates devia ter só a política de leitura (tem %).', v_n;
  END IF;
  IF has_table_privilege('anon', 'public.negocio_templates', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.negocio_templates', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR NOT has_table_privilege('authenticated', 'public.negocio_templates', 'SELECT') THEN
    RAISE EXCEPTION 'Guarda final: privilégios de negocio_templates diferentes do esperado.';
  END IF;

  -- os gatilhos novos: BEFORE INSERT por linha, ligados, e na ordem certa (os gatilhos disparam por nome, ordem de bytes)
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal AND t.tgenabled::text = 'O'
    AND (t.tgtype & 1) <> 0 AND (t.tgtype & 2) <> 0 AND (t.tgtype & 4) <> 0 AND (t.tgtype & 16) = 0
    AND (t.tgrelid::regclass, t.tgname::text, t.tgfoid) IN (
      ('public.quotes'::regclass,           'trg_negocios_25_template_pendente',  'public.fn_neg_templates_aplicar_orcamento()'::regprocedure::oid),
      ('public.proposals'::regclass,        'trg_negocios_25_template_pendente',  'public.fn_neg_templates_aplicar_proposta()'::regprocedure::oid),
      ('public.client_contracts'::regclass, 'trg_contracts_05_template_pendente', 'public.fn_neg_templates_aplicar_contrato()'::regprocedure::oid));
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda final: os gatilhos novos não ficaram como esperado (%/3).', v_n;
  END IF;
  IF NOT ('trg_negocios_25_template_pendente' COLLATE "C" < 'trg_proposals_freeze_template_snapshot' COLLATE "C"
      AND 'trg_negocios_25_template_pendente' COLLATE "C" > 'trg_negocios_20_validar_ins' COLLATE "C"
      AND 'trg_contracts_05_template_pendente' COLLATE "C" < 'trg_contracts_freeze_template' COLLATE "C") THEN
    RAISE EXCEPTION 'Guarda final: a ordem dos gatilhos não é a esperada.';
  END IF;
  -- nenhum outro gatilho BEFORE INSERT da proposta ou do contrato mexe no template entre o novo e o congelamento (só os conhecidos)
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal AND (t.tgtype & 2) <> 0 AND (t.tgtype & 4) <> 0
    AND ((t.tgrelid = 'public.proposals'::regclass
          AND t.tgname::text COLLATE "C" > 'trg_negocios_25_template_pendente' COLLATE "C"
          AND t.tgname::text COLLATE "C" < 'trg_proposals_freeze_template_snapshot' COLLATE "C")
      OR (t.tgrelid = 'public.client_contracts'::regclass
          AND t.tgname::text COLLATE "C" > 'trg_contracts_05_template_pendente' COLLATE "C"
          AND t.tgname::text COLLATE "C" < 'trg_contracts_freeze_template' COLLATE "C"));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda final: há % gatilho(s) BEFORE INSERT entre o novo e o congelamento; rever.', v_n;
  END IF;

  -- o que não se tocou ficou exactamente como estava
  IF md5(pg_get_functiondef(to_regprocedure('public.neg_guardar_negocio(uuid,uuid,jsonb)'))) <> 'ec25f9be524abe3757b6f186423c61e4'
     OR md5(pg_get_functiondef(to_regprocedure('public.neg_ler_negocios(uuid)'))) <> '9d3721c03973fa2beda8100957435eec'
     OR md5(pg_get_functiondef(to_regprocedure('public.proposal_freeze_template_snapshot()'))) <> '2fa58ee3866b7be1a453bfed978aea61'
     OR md5(pg_get_functiondef(to_regprocedure('public.contract_freeze_template_snapshot()'))) <> 'bc0992ddeb603c7c44e99d1f435ae16c'
     OR md5(pg_get_functiondef(to_regprocedure('public.fn_neg_templates_uuid(jsonb,text)'))) <> '61945ed7c87766720b50d27eedf6749b' THEN
    RAISE EXCEPTION 'Guarda final: uma função que não se devia tocar mudou.';
  END IF;
END
$final$;
