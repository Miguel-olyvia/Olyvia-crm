-- ============================================================
-- 20261226120000_neg_fecho_config_eventos  (Fase N, migration B)
-- ============================================================
-- Desenho: vault ficheiros/crm/negocios-fecho-por-tipo-desenho.md (v4),
--   secções 4, 10 e 11, e 16.1 (linha B).
--
-- O que faz
--   1. negocio_workflow_config ganha a configuração do fecho (uma linha por
--      organização; hoje só a nike tem linha, a Mudelar 0):
--        conversao_ao_ganhar   nao_alterar | automatica | manual   (omissão automatica)
--        recusa_proposta       perder | manter_aberto              (omissão perder)
--        recusa_contrato       perder | manter_aberto              (omissão perder)
--        cancelamento_no_prazo perder | manter_ganho               (omissão perder)
--        reflexao_dias         1 a 365, ou nulo                    (omissão NULO: até o
--                              jurídico validar, não se fixa nenhum prazo no código)
--      momento_ganho fica como está e deixa de ser lido pelas funções novas
--      (D11; a limpeza é a migration G, mais tarde).
--   2. negocio_eventos ganha os tipos fecho_mudou, acompanhamento e alerta, e
--      as colunas detalhe, origem_tipo, origem_id, origem_estado, canal,
--      prova e conteudo_hash (histórico da origem do fecho, D9).
--   3. fn_negocios_registar_evento passa a:
--      - preencher as colunas novas a partir das variáveis locais
--        app.neg_origem_tipo / app.neg_origem_id (as mesmas que a guarda
--        lê, migration A) e app.neg_ev_origem_estado / app.neg_ev_canal /
--        app.neg_ev_prova / app.neg_ev_hash / app.neg_ev_detalhe, que só as
--        funções de decisão (migration D) põem; sem elas, canal = crm com
--        utilizador, sistema sem utilizador;
--      - registar fecho_mudou quando negocios.fecho muda.
--      O gatilho trg_negocios_eventos é recriado com fecho na lista de
--      colunas (é o único gatilho tocado, e é de negocios).
--   4. neg_guardar_config_negocios(p_organization_id, p_conversao_ao_ganhar,
--      p_recusa_proposta, p_recusa_contrato, p_cancelamento_no_prazo,
--      p_reflexao_dias) NOVA, no molde de neg_guardar_regras_qualificacao:
--      DEFINER; valores NG009; sessão 42501; organização do utilizador com
--      pessoas.view e linha de configuração NG008; pessoas.config 42501;
--      bloqueio consultivo por organização; só UPDATE da linha existente,
--      nunca INSERT. Devolve {antes, depois, mudou, aviso_conversao_contratos}:
--      o aviso é true quando Contratos tem convert_to_client activo para
--      «signed»/«assinado» (da organização ou, sem configuração própria, o
--      global, a mesma regra de fn_contract_signed_convert_to_client) e a
--      conversão escolhida é manual ou nao_alterar. Não toca em
--      contract_stage_actions.
--
-- Tabelas: negocio_workflow_config (1 linha, a nike), negocio_eventos (0
--   linhas, lido a 20/10). Nenhuma é partilhada com a Mudelar (0 linhas dela).
-- Autorização: normal (desenho, 16.1).
-- Impacto na Mudelar: nenhum. Sem linha de configuração, a função nova
--   recusa com NG008 antes de ler ou escrever o que quer que seja.
--
-- O que o ecrã tem de fazer junto
--   - Separador «Negócios» no botão Workflow de Pessoas, com os cinco
--     campos, gravado por neg_guardar_config_negocios; mostrar o aviso
--     quando aviso_conversao_contratos = true. Traduzir NG008, NG009, 42501.
--     A leitura continua pela tabela (política de SELECT existente).
--   - Linha do tempo do negócio: os tipos novos e as colunas novas
--     (origem, canal, prova, detalhe).
--   - Regenerar os tipos do Supabase.
--
-- Pré-condição: md5 lido no remoto a 20/10; as colunas novas não existem;
--   as restrições de negocio_eventos são as lidas; a migration A aplicada
--   (negocios.fecho); a permissão pessoas.config existe.
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226120000_neg_fecho_config_eventos.sql), só depois de
--   reverter C, D, E e F. Apaga as colunas novas e os eventos dos tipos novos.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição
DO $pre$
DECLARE
  v_txt text;
BEGIN
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_negocios_registar_evento()',         '0d31c9a16c16caa89a0dc33cfa3431d1'),
              ('public.fn_negocios_actor()',                   '26296535afef27c393ab0c932995e3cb'),
              ('public.fn_neg_exigir_config(uuid)',            '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_tem_permissao_org(uuid,text)',   '05943a6cfb0382a07322870262170c8d'),
              ('public.fn_neg_actor()',                        '01c906dd40875e72a5e63bdc10200359'),
              ('public.crm_scope_keys(text)',                  '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',        '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',            '29782031244dd3b0842ca43b271e2bf1')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 20/10: %; nada feito.', v_txt;
  END IF;

  IF pg_catalog.to_regprocedure('public.neg_guardar_config_negocios(uuid,text,text,text,text,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_guardar_config_negocios já existe; nada feito.';
  END IF;

  -- A migration A tem de estar aplicada.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                 WHERE a.attrelid = 'public.negocios'::regclass AND a.attname::text = 'fecho'
                   AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta negocios.fecho (aplicar antes 20261226110000); nada feito.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
             WHERE a.attnum > 0 AND NOT a.attisdropped
               AND ((a.attrelid = 'public.negocio_workflow_config'::regclass
                     AND a.attname::text IN ('conversao_ao_ganhar', 'recusa_proposta', 'recusa_contrato',
                                             'cancelamento_no_prazo', 'reflexao_dias'))
                 OR (a.attrelid = 'public.negocio_eventos'::regclass
                     AND a.attname::text IN ('detalhe', 'origem_tipo', 'origem_id', 'origem_estado',
                                             'canal', 'prova', 'conteudo_hash')))) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: alguma das colunas novas já existe; nada feito.';
  END IF;

  IF (SELECT pg_catalog.pg_get_constraintdef(k.oid) FROM pg_catalog.pg_constraint k
      WHERE k.conrelid = 'public.negocio_eventos'::regclass AND k.conname::text = 'negocio_eventos_tipo_check')
     IS DISTINCT FROM 'CHECK ((tipo = ANY (ARRAY[''perdeu''::text, ''reabriu''::text, ''ganhou''::text, ''apagado''::text, ''restaurado''::text])))' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: negocio_eventos_tipo_check mudou desde 20/10; nada feito.';
  END IF;
  IF md5((SELECT pg_catalog.pg_get_constraintdef(k.oid) FROM pg_catalog.pg_constraint k
          WHERE k.conrelid = 'public.negocio_eventos'::regclass AND k.conname::text = 'negocio_eventos_coerente'))
     IS DISTINCT FROM md5('CHECK ((((tipo = ''perdeu''::text) AND (fase IS NOT NULL) AND (motivo IS NOT NULL)) OR ((tipo = ''ganhou''::text) AND (fase IS NULL) AND (motivo IS NULL)) OR (tipo = ''reabriu''::text) OR ((tipo = ANY (ARRAY[''apagado''::text, ''restaurado''::text])) AND (fase IS NULL) AND (motivo IS NULL))))') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: negocio_eventos_coerente mudou desde 20/10; nada feito.';
  END IF;

  IF (SELECT pg_catalog.pg_get_triggerdef(t.oid) FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.negocios'::regclass AND t.tgname::text = 'trg_negocios_eventos')
     IS DISTINCT FROM 'CREATE TRIGGER trg_negocios_eventos AFTER INSERT OR UPDATE OF estado, fase_perda, motivo_perda, deleted_at ON public.negocios FOR EACH ROW EXECUTE FUNCTION fn_negocios_registar_evento()' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: trg_negocios_eventos mudou desde 20/10; nada feito.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = 'pessoas.config') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta a permissão pessoas.config; nada feito.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
                 WHERE c.oid = 'public.negocio_workflow_config'::regclass
                   AND pg_catalog.pg_get_userbyid(c.relowner)::text = 'postgres'
                   AND c.relrowsecurity AND NOT c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: negocio_workflow_config mudou de dono ou de RLS; nada feito.';
  END IF;
END
$pre$;

-- 1. Configuração do fecho
ALTER TABLE public.negocio_workflow_config
  ADD COLUMN conversao_ao_ganhar text NOT NULL DEFAULT 'automatica',
  ADD COLUMN recusa_proposta text NOT NULL DEFAULT 'perder',
  ADD COLUMN recusa_contrato text NOT NULL DEFAULT 'perder',
  ADD COLUMN cancelamento_no_prazo text NOT NULL DEFAULT 'perder',
  ADD COLUMN reflexao_dias integer;

ALTER TABLE public.negocio_workflow_config
  ADD CONSTRAINT negocio_workflow_config_conversao_check
    CHECK (conversao_ao_ganhar IN ('nao_alterar', 'automatica', 'manual')),
  ADD CONSTRAINT negocio_workflow_config_recusa_proposta_check
    CHECK (recusa_proposta IN ('perder', 'manter_aberto')),
  ADD CONSTRAINT negocio_workflow_config_recusa_contrato_check
    CHECK (recusa_contrato IN ('perder', 'manter_aberto')),
  ADD CONSTRAINT negocio_workflow_config_cancelamento_check
    CHECK (cancelamento_no_prazo IN ('perder', 'manter_ganho')),
  ADD CONSTRAINT negocio_workflow_config_reflexao_check
    CHECK (reflexao_dias IS NULL OR reflexao_dias BETWEEN 1 AND 365);

COMMENT ON COLUMN public.negocio_workflow_config.conversao_ao_ganhar IS
  'Ao ganhar um negócio: automatica (converte a pessoa em cliente), manual (a ficha oferece «Converter em cliente») ou nao_alterar. 20261226120000.';
COMMENT ON COLUMN public.negocio_workflow_config.recusa_proposta IS
  'Proposta recusada sem outro positivo activo: perder o negócio ou manter_aberto. 20261226120000.';
COMMENT ON COLUMN public.negocio_workflow_config.recusa_contrato IS
  'Contrato recusado ou cancelado antes de assinado: perder o negócio ou manter_aberto. 20261226120000.';
COMMENT ON COLUMN public.negocio_workflow_config.cancelamento_no_prazo IS
  'Contrato que deu o ganho cancelado dentro do prazo de reflexão: perder ou manter_ganho. 20261226120000.';
COMMENT ON COLUMN public.negocio_workflow_config.reflexao_dias IS
  'Prazo de reflexão em dias (1 a 365). NULO até o jurídico validar: com nulo, um cancelamento depois de assinado deixa o negócio ganho com o alerta prazo_por_configurar. 20261226120000.';

-- 2. Eventos: tipos e colunas novas
ALTER TABLE public.negocio_eventos
  ADD COLUMN detalhe text,
  ADD COLUMN origem_tipo text,
  ADD COLUMN origem_id uuid,
  ADD COLUMN origem_estado text,
  ADD COLUMN canal text,
  ADD COLUMN prova text,
  ADD COLUMN conteudo_hash text;

ALTER TABLE public.negocio_eventos
  DROP CONSTRAINT negocio_eventos_tipo_check,
  DROP CONSTRAINT negocio_eventos_coerente;

ALTER TABLE public.negocio_eventos
  ADD CONSTRAINT negocio_eventos_tipo_check
    CHECK (tipo IN ('perdeu', 'reabriu', 'ganhou', 'apagado', 'restaurado',
                    'fecho_mudou', 'acompanhamento', 'alerta')),
  ADD CONSTRAINT negocio_eventos_coerente
    CHECK ((tipo = 'perdeu' AND fase IS NOT NULL AND motivo IS NOT NULL)
        OR (tipo = 'ganhou' AND fase IS NULL AND motivo IS NULL)
        OR (tipo = 'reabriu')
        OR (tipo IN ('apagado', 'restaurado') AND fase IS NULL AND motivo IS NULL)
        OR (tipo IN ('fecho_mudou', 'acompanhamento', 'alerta') AND fase IS NULL AND motivo IS NULL)),
  ADD CONSTRAINT negocio_eventos_detalhe_check
    CHECK (detalhe IS NULL OR char_length(detalhe) <= 1000),
  ADD CONSTRAINT negocio_eventos_origem_check
    CHECK ((origem_tipo IS NULL OR origem_tipo IN ('proposta', 'contrato'))
           AND ((origem_tipo IS NULL) = (origem_id IS NULL))),
  ADD CONSTRAINT negocio_eventos_origem_estado_check
    CHECK (origem_estado IS NULL OR char_length(origem_estado) <= 60),
  ADD CONSTRAINT negocio_eventos_canal_check
    CHECK (canal IS NULL OR canal IN ('crm', 'portal', 'assinatura', 'sistema')),
  ADD CONSTRAINT negocio_eventos_prova_check
    CHECK (prova IS NULL OR prova IN ('P1', 'P2', 'P3', 'utilizador')),
  ADD CONSTRAINT negocio_eventos_conteudo_hash_check
    CHECK (conteudo_hash IS NULL OR conteudo_hash ~ '^[0-9a-f]{32}$');

CREATE INDEX idx_negocio_eventos_origem
  ON public.negocio_eventos (negocio_id, origem_id, created_at DESC)
  WHERE origem_id IS NOT NULL;

COMMENT ON COLUMN public.negocio_eventos.detalhe IS 'Texto do acompanhamento, do alerta ou da mudança de fecho. 20261226120000.';
COMMENT ON COLUMN public.negocio_eventos.origem_tipo IS 'Documento que causou o evento: proposta ou contrato. 20261226120000.';
COMMENT ON COLUMN public.negocio_eventos.origem_id IS 'Identificador do documento que causou o evento. 20261226120000.';
COMMENT ON COLUMN public.negocio_eventos.origem_estado IS 'Estado do documento no momento do evento. 20261226120000.';
COMMENT ON COLUMN public.negocio_eventos.canal IS 'Por onde veio: crm (com utilizador), portal, assinatura (validate-contract-signature) ou sistema. 20261226120000.';
COMMENT ON COLUMN public.negocio_eventos.prova IS 'Prova de assinatura ou aceitação: P1 (portal), P2 (todas as partes), P3 (assinatura da empresa) ou utilizador (proposta aceite com sessão). 20261226120000.';
COMMENT ON COLUMN public.negocio_eventos.conteudo_hash IS 'md5 do conteúdo do documento no momento da decisão (proposta: compute_proposal_business_hash; contrato: fn_neg_contrato_hash). Serve para saber se um reenvio ou reabertura teve alterações. 20261226120000.';

-- 3. Registo de eventos com origem, e fecho_mudou
CREATE OR REPLACE FUNCTION public.fn_negocios_registar_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tipo        text;
  v_fase        text;
  v_motivo      text;
  v_motivo_reab text;
  v_lixo        text;
  v_actor       uuid := public.fn_negocios_actor();
  v_or_tipo     text := NULLIF(current_setting('app.neg_origem_tipo', true), '');
  v_or_id       uuid := NULLIF(current_setting('app.neg_origem_id', true), '')::uuid;
  v_or_estado   text := NULLIF(current_setting('app.neg_ev_origem_estado', true), '');
  v_canal       text := NULLIF(current_setting('app.neg_ev_canal', true), '');
  v_prova       text := NULLIF(current_setting('app.neg_ev_prova', true), '');
  v_hash        text := NULLIF(current_setting('app.neg_ev_hash', true), '');
  v_detalhe     text := NULLIF(current_setting('app.neg_ev_detalhe', true), '');
BEGIN
  IF (v_or_tipo IS NULL) <> (v_or_id IS NULL) THEN
    v_or_tipo := NULL;
    v_or_id := NULL;
  END IF;
  v_canal := COALESCE(v_canal, CASE WHEN v_actor IS NOT NULL THEN 'crm' ELSE 'sistema' END);

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'perdido' THEN
      v_tipo := 'perdeu';  v_fase := NEW.fase_perda;  v_motivo := NEW.motivo_perda;
    ELSIF NEW.estado = 'ganho' THEN
      v_tipo := 'ganhou';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      IF NEW.estado = 'perdido' THEN
        v_tipo := 'perdeu';  v_fase := NEW.fase_perda;  v_motivo := NEW.motivo_perda;
      ELSIF NEW.estado = 'ganho' THEN
        v_tipo := 'ganhou';
      ELSE
        -- Reabrir: guarda a perda desfeita (nula se vinha de ganho) e a
        -- razão, se a função de reabrir a deixou na variável local.
        v_tipo := 'reabriu'; v_fase := OLD.fase_perda; v_motivo := OLD.motivo_perda;
        v_motivo_reab := NULLIF(btrim(current_setting('app.negocio_motivo_reabertura', true)), '');
        PERFORM set_config('app.negocio_motivo_reabertura', '', true);
      END IF;
    ELSIF NEW.estado = 'perdido'
          AND (NEW.fase_perda IS DISTINCT FROM OLD.fase_perda
               OR NEW.motivo_perda IS DISTINCT FROM OLD.motivo_perda) THEN
      -- Correcção da fase ou do motivo de uma perda já registada.
      v_tipo := 'perdeu';  v_fase := NEW.fase_perda;  v_motivo := NEW.motivo_perda;
    END IF;

    -- Lixo: só a passagem vivo <-> lixo (o valor é escrito pela base).
    IF (OLD.deleted_at IS NULL) IS DISTINCT FROM (NEW.deleted_at IS NULL) THEN
      v_lixo := CASE WHEN NEW.deleted_at IS NOT NULL THEN 'apagado' ELSE 'restaurado' END;
    END IF;
  END IF;

  -- Estado primeiro, depois o tipo de fecho, depois o lixo.
  -- Não engole erros: sem evento, sem alteração.
  IF v_tipo IS NOT NULL THEN
    INSERT INTO public.negocio_eventos
      (negocio_id, organization_id, root_organization_id, tipo, fase, motivo,
       motivo_reabertura, created_by, detalhe, origem_tipo, origem_id, origem_estado,
       canal, prova, conteudo_hash)
    VALUES
      (NEW.id, NEW.organization_id, NEW.root_organization_id, v_tipo, v_fase, v_motivo,
       v_motivo_reab, v_actor, v_detalhe, v_or_tipo, v_or_id,
       CASE WHEN v_or_id IS NOT NULL THEN v_or_estado END,
       v_canal,
       CASE WHEN v_or_id IS NOT NULL THEN v_prova END,
       CASE WHEN v_or_id IS NOT NULL THEN v_hash END);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.fecho IS DISTINCT FROM OLD.fecho THEN
    INSERT INTO public.negocio_eventos
      (negocio_id, organization_id, root_organization_id, tipo, created_by, detalhe, canal)
    VALUES
      (NEW.id, NEW.organization_id, NEW.root_organization_id, 'fecho_mudou', v_actor,
       'Fecho: de ' || OLD.fecho || ' para ' || NEW.fecho, v_canal);
  END IF;

  IF v_lixo IS NOT NULL THEN
    INSERT INTO public.negocio_eventos
      (negocio_id, organization_id, root_organization_id, tipo, created_by, canal)
    VALUES
      (NEW.id, NEW.organization_id, NEW.root_organization_id, v_lixo, v_actor, v_canal);
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER trg_negocios_eventos ON public.negocios;
CREATE TRIGGER trg_negocios_eventos
  AFTER INSERT OR UPDATE OF estado, fase_perda, motivo_perda, deleted_at, fecho
  ON public.negocios
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocios_registar_evento();

-- 4. Gravar a configuração do fecho
CREATE FUNCTION public.neg_guardar_config_negocios(
  p_organization_id uuid,
  p_conversao_ao_ganhar text,
  p_recusa_proposta text,
  p_recusa_contrato text,
  p_cancelamento_no_prazo text,
  p_reflexao_dias integer)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_keys_pes text[];
  v_antes    public.negocio_workflow_config;
  v_depois   jsonb;
  v_antes_j  jsonb;
  v_conv     boolean;
  v_aviso    boolean;
BEGIN
  -- 1. Valores
  IF p_organization_id IS NULL
     OR p_conversao_ao_ganhar IS NULL OR p_conversao_ao_ganhar NOT IN ('nao_alterar', 'automatica', 'manual')
     OR p_recusa_proposta IS NULL OR p_recusa_proposta NOT IN ('perder', 'manter_aberto')
     OR p_recusa_contrato IS NULL OR p_recusa_contrato NOT IN ('perder', 'manter_aberto')
     OR p_cancelamento_no_prazo IS NULL OR p_cancelamento_no_prazo NOT IN ('perder', 'manter_ganho')
     OR (p_reflexao_dias IS NOT NULL AND (p_reflexao_dias < 1 OR p_reflexao_dias > 365)) THEN
    RAISE EXCEPTION 'Configuração de negócios inválida.' USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view e com configuração.
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 4. Permissão própria do Workflow de Pessoas, nesta organização.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.config') THEN
    RAISE EXCEPTION 'Sem permissão para configurar o workflow de Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5. Linha da organização, em exclusivo até ao fim da transacção.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('neg_guardar_config_negocios:' || p_organization_id::text, 0));

  SELECT c.* INTO v_antes
  FROM public.negocio_workflow_config c
  WHERE c.organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  v_antes_j := jsonb_build_object(
    'conversao_ao_ganhar', v_antes.conversao_ao_ganhar,
    'recusa_proposta', v_antes.recusa_proposta,
    'recusa_contrato', v_antes.recusa_contrato,
    'cancelamento_no_prazo', v_antes.cancelamento_no_prazo,
    'reflexao_dias', v_antes.reflexao_dias);
  v_depois := jsonb_build_object(
    'conversao_ao_ganhar', p_conversao_ao_ganhar,
    'recusa_proposta', p_recusa_proposta,
    'recusa_contrato', p_recusa_contrato,
    'cancelamento_no_prazo', p_cancelamento_no_prazo,
    'reflexao_dias', p_reflexao_dias);

  -- Aviso: Contratos converte ao assinar e aqui a conversão não é automática.
  IF EXISTS (SELECT 1 FROM public.contract_stage_actions a
             WHERE a.organization_id = p_organization_id
               AND a.stage_id IN ('signed', 'assinado') AND a.is_active = true) THEN
    v_conv := EXISTS (SELECT 1 FROM public.contract_stage_actions a
                      WHERE a.organization_id = p_organization_id
                        AND a.stage_id IN ('signed', 'assinado') AND a.is_active = true
                        AND a.action_type = 'convert_to_client');
  ELSE
    v_conv := EXISTS (SELECT 1 FROM public.contract_stage_actions a
                      WHERE a.organization_id IS NULL
                        AND a.stage_id IN ('signed', 'assinado') AND a.is_active = true
                        AND a.action_type = 'convert_to_client');
  END IF;
  v_aviso := v_conv AND p_conversao_ao_ganhar IN ('manual', 'nao_alterar');

  IF v_antes_j = v_depois THEN
    RETURN jsonb_build_object('antes', v_antes_j, 'depois', v_antes_j, 'mudou', false,
                              'aviso_conversao_contratos', v_aviso);
  END IF;

  -- 6. Escrita, só na linha da organização validada acima (nunca INSERT).
  UPDATE public.negocio_workflow_config c
  SET conversao_ao_ganhar   = p_conversao_ao_ganhar,
      recusa_proposta       = p_recusa_proposta,
      recusa_contrato       = p_recusa_contrato,
      cancelamento_no_prazo = p_cancelamento_no_prazo,
      reflexao_dias         = p_reflexao_dias
  WHERE c.organization_id = p_organization_id;

  RETURN jsonb_build_object('antes', v_antes_j, 'depois', v_depois, 'mudou', true,
                            'aviso_conversao_contratos', v_aviso);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_config_negocios(uuid, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_guardar_config_negocios(uuid, text, text, text, text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.neg_guardar_config_negocios(uuid, text, text, text, text, integer) IS
  'Pessoas, Workflow, Negócios: grava a configuração do fecho da organização (conversão ao ganhar, recusa da proposta e do contrato, cancelamento no prazo, prazo de reflexão) e devolve {antes, depois, mudou, aviso_conversao_contratos}. Só UPDATE da linha existente. NG009 valores; 42501 sem sessão ou sem pessoas.config; NG008 sem Pessoas. 20261226120000.';

-- CONFERIR
DO $conferir$
DECLARE
  v_oid oid := pg_catalog.to_regprocedure('public.neg_guardar_config_negocios(uuid,text,text,text,text,integer)');
  v_n   int;
BEGIN
  -- 1. Colunas da configuração e valores da linha existente (as omissões).
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.negocio_workflow_config'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND ((a.attname::text IN ('conversao_ao_ganhar', 'recusa_proposta', 'recusa_contrato', 'cancelamento_no_prazo')
          AND a.atttypid = 'text'::regtype AND a.attnotnull)
      OR (a.attname::text = 'reflexao_dias' AND a.atttypid = 'int4'::regtype AND NOT a.attnotnull));
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'CONFERIR: % de 5 colunas novas na configuração', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.negocio_workflow_config c
  WHERE c.conversao_ao_ganhar <> 'automatica' OR c.recusa_proposta <> 'perder'
     OR c.recusa_contrato <> 'perder' OR c.cancelamento_no_prazo <> 'perder'
     OR c.reflexao_dias IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % linha(s) de configuração sem as omissões', v_n;
  END IF;

  -- 2. Eventos: colunas, restrições, índice
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.negocio_eventos'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND NOT a.attnotnull
    AND a.attname::text IN ('detalhe', 'origem_tipo', 'origem_id', 'origem_estado', 'canal', 'prova', 'conteudo_hash');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'CONFERIR: % de 7 colunas novas em negocio_eventos', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_constraint k
  WHERE k.convalidated AND k.contype::text = 'c'
    AND ((k.conrelid = 'public.negocio_eventos'::regclass
          AND k.conname::text IN ('negocio_eventos_tipo_check', 'negocio_eventos_coerente',
                                  'negocio_eventos_detalhe_check', 'negocio_eventos_origem_check',
                                  'negocio_eventos_origem_estado_check', 'negocio_eventos_canal_check',
                                  'negocio_eventos_prova_check', 'negocio_eventos_conteudo_hash_check'))
      OR (k.conrelid = 'public.negocio_workflow_config'::regclass
          AND k.conname::text IN ('negocio_workflow_config_conversao_check',
                                  'negocio_workflow_config_recusa_proposta_check',
                                  'negocio_workflow_config_recusa_contrato_check',
                                  'negocio_workflow_config_cancelamento_check',
                                  'negocio_workflow_config_reflexao_check')));
  IF v_n <> 13 THEN
    RAISE EXCEPTION 'CONFERIR: % de 13 restrições válidas', v_n;
  END IF;
  IF pg_catalog.to_regclass('public.idx_negocio_eventos_origem') IS NULL THEN
    RAISE EXCEPTION 'CONFERIR: falta idx_negocio_eventos_origem';
  END IF;

  -- 3. O gatilho de eventos tem fecho na lista; a função mudou e mantém DEFINER.
  IF (SELECT pg_catalog.pg_get_triggerdef(t.oid) FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.negocios'::regclass AND t.tgname::text = 'trg_negocios_eventos')
     NOT LIKE '%AFTER INSERT OR UPDATE OF estado, fase_perda, motivo_perda, deleted_at, fecho ON public.negocios FOR EACH ROW EXECUTE FUNCTION %fn_negocios_registar_evento()' THEN
    RAISE EXCEPTION 'CONFERIR: trg_negocios_eventos não ficou como esperado';
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.negocios'::regclass AND NOT t.tgisinternal AND t.tgenabled::text = 'O';
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'CONFERIR: negocios tem % gatilhos activos (esperado 5)', v_n;
  END IF;
  IF md5(pg_catalog.pg_get_functiondef('public.fn_negocios_registar_evento()'::regprocedure)) = '0d31c9a16c16caa89a0dc33cfa3431d1'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                    WHERE p.oid = 'public.fn_negocios_registar_evento()'::regprocedure AND p.prosecdef
                      AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
                      AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'CONFERIR: fn_negocios_registar_evento não ficou como esperado';
  END IF;

  -- 4. A função de gravar: DEFINER, VOLATILE, dono postgres, search_path, só authenticated.
  IF v_oid IS NULL OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid = v_oid AND p.prosecdef AND p.provolatile::text = 'v'
         AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
         AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]) THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_config_negocios sem DEFINER, VOLATILE, dono postgres ou search_path fixo';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
             WHERE p.oid = v_oid AND a.grantee = 0)
     OR pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: privilégios de neg_guardar_config_negocios não são só authenticated';
  END IF;

  -- 5. Sem sessão a função recusa (42501) sem escrever.
  BEGIN
    PERFORM public.neg_guardar_config_negocios(
      'b6ffce4f-f630-4933-833a-008649757a33'::uuid, 'automatica', 'perder', 'perder', 'perder', NULL);
    RAISE EXCEPTION 'CONFERIR: neg_guardar_config_negocios aceitou uma chamada sem sessão';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  -- e valores inválidos dão NG009 antes de tudo.
  BEGIN
    PERFORM public.neg_guardar_config_negocios(
      'b6ffce4f-f630-4933-833a-008649757a33'::uuid, 'automatica', 'perder', 'perder', 'perder', 0);
    RAISE EXCEPTION 'CONFERIR: neg_guardar_config_negocios aceitou reflexao_dias = 0';
  EXCEPTION WHEN SQLSTATE 'NG009' THEN
    NULL;
  END;
END
$conferir$;

COMMIT;
