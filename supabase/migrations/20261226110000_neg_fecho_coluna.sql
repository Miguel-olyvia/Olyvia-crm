-- ============================================================
-- 20261226110000_neg_fecho_coluna  (Fase N, migration A)
-- ============================================================
-- Desenho: vault ficheiros/crm/negocios-fecho-por-tipo-desenho.md (v4),
--   secções 3, 11 e 16.1 (linha A).
--
-- O que faz
--   1. negocios ganha cinco colunas:
--        fecho                text NOT NULL DEFAULT 'contrato'  ('proposta' | 'contrato')
--        decisao_origem_tipo  text  ('proposta' | 'contrato'; nulo numa decisão manual)
--        decisao_origem_id    uuid  (o documento que decidiu; nulo numa decisão manual)
--        alerta_codigo        text  (o alerta em aberto, da lista fechada abaixo)
--        alerta_em            timestamptz (escrito pela base)
--      Sem chave estrangeira em decisao_origem_id (aponta para proposals ou
--      client_contracts conforme o tipo).
--   2. A guarda (fn_negocios_guardar_alteracao) passa a:
--      - exigir o caminho das funções (app.neg_via_funcao) também para mudar
--        fecho e alerta_codigo (guarda 1b);
--      - quando o estado muda: copiar a origem das variáveis locais
--        app.neg_origem_tipo / app.neg_origem_id (só para ganho e perdido;
--        a reabrir fica nula) e limpar o alerta, salvo se a mesma escrita
--        o mudar;
--      - sem mudança de estado: a origem fica a que estava;
--      - alerta_em é sempre da base (now() quando o código muda; nulo sem código).
--   3. fn_negocios_preparar_insercao: um negócio nasce sem origem e sem alerta.
--   4. neg_criar_negocio: DROP da versão de 10 argumentos, CREATE da de 11
--      (p_fecho text DEFAULT 'contrato', no fim). Valida p_fecho (NG009) e
--      grava-o. As ligações que recusem com NG023 ou NG024 (migration D) vão
--      para «recusados», como já acontece com NG004 e NG014.
--   5. neg_mudar_fecho(p_negocio_id, p_fecho, p_confirmar DEFAULT false)
--      NOVA, INVOKER (pessoas.edit e âmbito pela RLS de negocios, via
--      fn_neg_negocio_editavel). Regras da secção 3:
--        - ganho ou perdido: NG022 (reabrir ou anular a perda primeiro);
--        - contrato -> proposta: NG022 se houver contrato activo ligado
--          (não apagado, não substituído) em pending_signature, signed,
--          assinado ou active;
--        - proposta -> contrato: NG022 se houver proposta ligada aceite;
--        - se a mudança tornar decisivo um documento positivo já ligado,
--          devolve {mudou:false, precisa_confirmar:true} sem mudar nada, e
--          só muda com p_confirmar = true.
--      Nesta migration a função NÃO dá o ganho depois de confirmar: a
--      reavaliação com prova chega na migration D, que recria esta função.
--      O evento fecho_mudou é escrito pelo gatilho de eventos (migration B).
--
-- Tabelas: só negocios (não é partilhada: 0 linhas em todas as organizações,
--   0 na Mudelar, lido a 20/10). Nenhuma tabela da Mudelar é tocada.
-- Autorização: normal (desenho, 16.1).
-- Impacto na Mudelar: nenhum. A Mudelar não tem negócios nem linha em
--   negocio_workflow_config; as funções alteradas são só da página Pessoas.
--   neg_criar_negocio passa a ter EXECUTE só para authenticated (a versão
--   anterior tinha também service_role; nenhum código do servidor a chama).
--
-- O que o ecrã tem de fazer junto
--   - «Novo negócio»: a pergunta «Como fecha este negócio?» («Na proposta
--     (venda directa)» / «No contrato»), enviada como p_fecho.
--   - Editar negócio: mudar o tipo por neg_mudar_fecho; com
--     precisa_confirmar:true, pedir confirmação e repetir com
--     p_confirmar:true. Traduzir NG022.
--   - Regenerar os tipos do Supabase (neg_criar_negocio tem um argumento a
--     mais; negocios tem cinco colunas a mais).
--
-- Pré-condição: md5 lido no remoto a 20/10 de cada função recriada e das de
--   que dependem; as colunas novas não existem; uma só sobrecarga de
--   neg_criar_negocio; os gatilhos de negocios são os cinco lidos.
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226110000_neg_fecho_coluna.sql), e só depois de
--   reverter B, D, E e F. Apaga as cinco colunas (perde o tipo de fecho, a
--   origem e o alerta de cada negócio).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição
DO $pre$
DECLARE
  v_txt text;
  v_n   int;
BEGIN
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_negocios_guardar_alteracao()',                     '33ba01c6e0f8a1ed54651773baa5e97b'),
              ('public.fn_negocios_preparar_insercao()',                     '8bb6cc9c238067c8c0a009c227a2d523'),
              ('public.neg_criar_negocio(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,boolean)', 'a84fc0d7821e53751b1b90325bee9a33'),
              ('public.neg_ligar_registo(uuid,text,uuid)',                   '5ed5cf7c02dffd6d4943a98b7b10d0e8'),
              ('public.fn_neg_negocio_editavel(uuid,text[])',                '05b8dd6fd7e952c1d02dadff8e529f25'),
              ('public.fn_neg_exigir_config(uuid)',                          '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',                     '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_escolher_lead(uuid,uuid,uuid,text)',           'c90baaf27ba54677161e4bc94c1b5895'),
              ('public.fn_neg_lead_aberta(text)',                            'cb988326544ed75840624bfb78e55b7f'),
              ('public.fn_neg_mudar_abordagem(uuid,uuid,uuid,text,text,text)', 'ad65ef03cf301444914f4a9dcf4f864b'),
              ('public.fn_negocios_ref_utilizador_apagado(uuid,uuid)',       '6e45bfff81ab95e812b44d126cc3d75a'),
              ('public.fn_negocios_exigir_permissao_lixo(uuid,uuid,uuid)',   'd25d294c90a76ac1d863a8cbaeb97edb'),
              ('public.fn_negocios_actor()',                                 '26296535afef27c393ab0c932995e3cb'),
              ('public.resolve_root_organization_id(uuid)',                  '0fd01d82d04202e94fecbc638af746a0')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 20/10: %; nada feito.', v_txt;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('neg_criar_negocio', 'neg_mudar_fecho');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: % função(ões) neg_criar_negocio/neg_mudar_fecho (esperado 1: a de 10 argumentos); nada feito.', v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
             WHERE a.attrelid = 'public.negocios'::regclass AND a.attnum > 0 AND NOT a.attisdropped
               AND a.attname::text IN ('fecho', 'decisao_origem_tipo', 'decisao_origem_id',
                                       'alerta_codigo', 'alerta_em')) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: negocios já tem alguma das colunas novas; nada feito.';
  END IF;

  IF (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                            ORDER BY t.tgname::text))
      FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.negocios'::regclass AND NOT t.tgisinternal)
     IS DISTINCT FROM 'b7b001b474fc0155238d5469bad87d93' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: os gatilhos de negocios mudaram desde 20/10; nada feito.';
  END IF;
END
$pre$;

-- 1. Colunas
ALTER TABLE public.negocios
  ADD COLUMN fecho text NOT NULL DEFAULT 'contrato',
  ADD COLUMN decisao_origem_tipo text,
  ADD COLUMN decisao_origem_id uuid,
  ADD COLUMN alerta_codigo text,
  ADD COLUMN alerta_em timestamptz;

ALTER TABLE public.negocios
  ADD CONSTRAINT negocios_fecho_check
    CHECK (fecho IN ('proposta', 'contrato')),
  ADD CONSTRAINT negocios_decisao_origem_check
    CHECK ((decisao_origem_tipo IS NULL OR decisao_origem_tipo IN ('proposta', 'contrato'))
           AND ((decisao_origem_tipo IS NULL) = (decisao_origem_id IS NULL))),
  ADD CONSTRAINT negocios_alerta_check
    CHECK ((alerta_codigo IS NULL OR alerta_codigo IN (
              'sem_prova', 'positivo_depois_perda', 'prazo_por_configurar',
              'mudanca_sem_efeito', 'recusa_depois_aceite', 'reenvio_sem_reabrir',
              'conversao_falhou'))
           AND ((alerta_codigo IS NULL) = (alerta_em IS NULL)));

COMMENT ON COLUMN public.negocios.fecho IS
  'Como fecha o negócio: proposta (venda directa: a proposta aceite com prova dá o ganho; os contratos são ignorados) ou contrato (o contrato assinado com prova dá o ganho). Muda só por neg_mudar_fecho. 20261226110000.';
COMMENT ON COLUMN public.negocios.decisao_origem_tipo IS
  'Tipo do documento que deu o ganho ou a perda automática (proposta ou contrato). Nulo numa decisão manual: é isto que distingue a perda automática da manual. Escrito pela guarda a partir de app.neg_origem_tipo. 20261226110000.';
COMMENT ON COLUMN public.negocios.decisao_origem_id IS
  'Identificador do documento de decisao_origem_tipo (proposals ou client_contracts). 20261226110000.';
COMMENT ON COLUMN public.negocios.alerta_codigo IS
  'Alerta em aberto (sem_prova, positivo_depois_perda, prazo_por_configurar, mudanca_sem_efeito, recusa_depois_aceite, reenvio_sem_reabrir, conversao_falhou). Limpo quando o estado muda. 20261226110000.';
COMMENT ON COLUMN public.negocios.alerta_em IS
  'Quando o alerta em aberto apareceu (escrito pela base). 20261226110000.';

-- 2. Inserção: sem origem e sem alerta à nascença.
CREATE OR REPLACE FUNCTION public.fn_negocios_preparar_insercao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.estado IS DISTINCT FROM 'aberto'
     AND COALESCE(current_setting('app.neg_via_funcao', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Um negócio é criado aberto; o estado só muda pelas acções da página Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.root_organization_id := public.resolve_root_organization_id(NEW.organization_id);

  IF NEW.created_by IS NULL THEN
    NEW.created_by := public.fn_negocios_actor();
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;
  NEW.perdido_em := CASE WHEN NEW.estado = 'perdido' THEN now() END;
  NEW.ganho_em   := CASE WHEN NEW.estado = 'ganho'   THEN now() END;

  -- Fase N: a origem e o alerta só aparecem por decisão posterior.
  NEW.decisao_origem_tipo := NULL;
  NEW.decisao_origem_id   := NULL;
  NEW.alerta_codigo       := NULL;
  NEW.alerta_em           := NULL;

  RETURN NEW;
END;
$function$;

-- 3. Guarda de alteração
CREATE OR REPLACE FUNCTION public.fn_negocios_guardar_alteracao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limpa_criador   boolean := public.fn_negocios_ref_utilizador_apagado(OLD.created_by, NEW.created_by);
  v_limpa_comercial boolean := public.fn_negocios_ref_utilizador_apagado(OLD.assigned_to, NEW.assigned_to);
  v_limpa_apagador  boolean := public.fn_negocios_ref_utilizador_apagado(OLD.deleted_by, NEW.deleted_by);
  v_ignorar         text[]  := ARRAY['created_by', 'assigned_to', 'deleted_by', 'updated_at'];
BEGIN
  -- 1. Imutáveis (created_by só pode ir a NULL se o utilizador foi apagado)
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Não é possível mudar o identificador de um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Não é possível mudar a organização de um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    RAISE EXCEPTION 'Não é possível mudar a pessoa de um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT v_limpa_criador THEN
    RAISE EXCEPTION 'Não é possível mudar quem criou um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 1b. O estado, o tipo de fecho e o alerta só mudam pelas funções da
  --     página Pessoas (e pelos gatilhos de decisão, que usam o mesmo caminho).
  IF (NEW.estado IS DISTINCT FROM OLD.estado
      OR NEW.fase_perda IS DISTINCT FROM OLD.fase_perda
      OR NEW.motivo_perda IS DISTINCT FROM OLD.motivo_perda
      OR NEW.fecho IS DISTINCT FROM OLD.fecho
      OR NEW.alerta_codigo IS DISTINCT FROM OLD.alerta_codigo)
     AND COALESCE(current_setting('app.neg_via_funcao', true), '') <> 'on' THEN
    RAISE EXCEPTION 'O estado do negócio só muda pelas acções da página Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. No lixo: só o restauro, ou a limpeza de um utilizador apagado
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL
     AND ((to_jsonb(NEW) - v_ignorar) IS DISTINCT FROM (to_jsonb(OLD) - v_ignorar)
          OR (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NOT v_limpa_comercial)
          OR (NEW.deleted_by IS DISTINCT FROM OLD.deleted_by AND NOT v_limpa_apagador)) THEN
    RAISE EXCEPTION 'Este negócio está no lixo: tem de ser restaurado antes de ser alterado.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Comercial novo tem de ser membro activo (só quando muda para alguém)
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NEW.assigned_to IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_memberships m
       WHERE m.user_id = NEW.assigned_to
         AND m.organization_id = NEW.organization_id
         AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'O comercial tem de ser membro activo da organização do negócio.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.root_organization_id := OLD.root_organization_id;
  NEW.created_at := OLD.created_at;

  -- 4. Datas de estado: now() ao entrar no estado, mantidas enquanto lá
  --    fica, limpas ao sair.
  NEW.perdido_em := CASE
    WHEN NEW.estado <> 'perdido' THEN NULL
    WHEN OLD.estado = 'perdido'  THEN OLD.perdido_em
    ELSE now() END;
  NEW.ganho_em := CASE
    WHEN NEW.estado <> 'ganho' THEN NULL
    WHEN OLD.estado = 'ganho'  THEN OLD.ganho_em
    ELSE now() END;

  -- 4b. Origem da decisão e alerta (Fase N).
  --     A origem só muda com o estado: vem das variáveis locais postas pela
  --     função que decide (nulas numa decisão manual) e só vale para ganho e
  --     perdido. Ao mudar de estado o alerta limpa-se, salvo se a mesma
  --     escrita o mudar. alerta_em é sempre da base.
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado IN ('ganho', 'perdido') THEN
      NEW.decisao_origem_tipo := NULLIF(current_setting('app.neg_origem_tipo', true), '');
      NEW.decisao_origem_id   := NULLIF(current_setting('app.neg_origem_id', true), '')::uuid;
      IF (NEW.decisao_origem_tipo IS NULL) <> (NEW.decisao_origem_id IS NULL) THEN
        NEW.decisao_origem_tipo := NULL;
        NEW.decisao_origem_id   := NULL;
      END IF;
    ELSE
      NEW.decisao_origem_tipo := NULL;
      NEW.decisao_origem_id   := NULL;
    END IF;
    IF NEW.alerta_codigo IS NOT DISTINCT FROM OLD.alerta_codigo THEN
      NEW.alerta_codigo := NULL;
    END IF;
  ELSE
    NEW.decisao_origem_tipo := OLD.decisao_origem_tipo;
    NEW.decisao_origem_id   := OLD.decisao_origem_id;
  END IF;
  NEW.alerta_em := CASE
    WHEN NEW.alerta_codigo IS NULL THEN NULL
    WHEN NEW.alerta_codigo IS DISTINCT FROM OLD.alerta_codigo THEN now()
    ELSE OLD.alerta_em END;

  -- 5. Lixo: só a passagem vivo <-> lixo conta; o valor é sempre da base.
  IF (OLD.deleted_at IS NULL) IS DISTINCT FROM (NEW.deleted_at IS NULL) THEN
    PERFORM public.fn_negocios_exigir_permissao_lixo(
      OLD.organization_id, OLD.assigned_to, OLD.created_by);

    IF NEW.deleted_at IS NOT NULL THEN
      NEW.deleted_at := now();
      NEW.deleted_by := public.fn_negocios_actor();
    ELSE
      NEW.deleted_by := NULL;
    END IF;
  ELSE
    NEW.deleted_at := OLD.deleted_at;
    NEW.deleted_by := CASE WHEN v_limpa_apagador THEN NULL ELSE OLD.deleted_by END;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. neg_criar_negocio com o tipo de fecho (DROP da de 10, CREATE da de 11)
DROP FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean);

CREATE FUNCTION public.neg_criar_negocio(
  p_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_titulo text,
  p_notas text DEFAULT NULL::text,
  p_assigned_to uuid DEFAULT NULL::uuid,
  p_registos jsonb DEFAULT '[]'::jsonb,
  p_levantamento_id uuid DEFAULT NULL::uuid,
  p_lead_id uuid DEFAULT NULL::uuid,
  p_reabrir_abordagem boolean DEFAULT false,
  p_fecho text DEFAULT 'contrato'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_titulo     text := btrim(p_titulo);
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_registos   jsonb := COALESCE(p_registos, '[]'::jsonb);
  v_lead       public.anew_leads;
  v_existente  public.negocios;
  v_reg        record;
  v_ligados    jsonb := '[]'::jsonb;
  v_recusados  jsonb := '[]'::jsonb;
  v_n          int;
BEGIN
  IF p_id IS NULL OR v_titulo IS NULL OR v_titulo = '' OR char_length(v_titulo) > 200
     OR char_length(v_notas) > 5000 THEN
    RAISE EXCEPTION 'Valor inválido: identificador, título (1 a 200) ou notas (até 5000).' USING ERRCODE = 'NG009';
  END IF;
  IF p_fecho IS NULL OR p_fecho NOT IN ('proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo de fecho (proposta ou contrato).' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(v_registos) <> 'array' THEN
    RAISE EXCEPTION 'Valor inválido: registos.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_registos) > 100 OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_registos) AS e(valor)
       WHERE jsonb_typeof(e.valor) <> 'object'
          OR (e.valor ->> 'tipo') IS NULL
          OR (e.valor ->> 'tipo') NOT IN ('contacto', 'visita', 'orcamento', 'proposta', 'contrato')
          OR (e.valor ->> 'id') IS NULL
          OR (e.valor ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Valor inválido: registos (até 100; tipo contacto, visita, orcamento, proposta ou contrato; id uuid).'
      USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- Reenvio do mesmo id: devolve-o como está, antes de qualquer outra regra.
  SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
  IF FOUND THEN
    IF v_existente.organization_id <> p_organization_id OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- A lead aberta a que o negócio corresponde (só informação; não se altera).
  SELECT * INTO v_lead FROM public.fn_neg_escolher_lead(p_organization_id, p_entity_id, p_lead_id, 'aberta');
  IF v_lead.id IS NOT NULL AND v_lead.closure_result IS NOT NULL
     AND NOT COALESCE(p_reabrir_abordagem, false) THEN
    RAISE EXCEPTION 'A abordagem desta pessoa está encerrada.' USING ERRCODE = 'NG002';
  END IF;

  -- Criar (RLS negocios_insert: pessoas.create na organização, pessoa ligada,
  -- comercial membro activo). Corrida com outro reenvio: devolve-o como está.
  INSERT INTO public.negocios (id, organization_id, entity_id, titulo, notas, assigned_to, fecho)
  VALUES (p_id, p_organization_id, p_entity_id, v_titulo, v_notas, p_assigned_to, p_fecho)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
    IF NOT FOUND OR v_existente.organization_id <> p_organization_id
       OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- Ligações (exigem pessoas.edit: NG001 aborta tudo; NG004, NG014, NG023 e
  -- NG024 vão para recusados).
  FOR v_reg IN
    SELECT e.valor ->> 'tipo' AS tipo, (e.valor ->> 'id')::uuid AS id
    FROM jsonb_array_elements(v_registos) AS e(valor)
    UNION ALL
    SELECT 'levantamento', p_levantamento_id WHERE p_levantamento_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.neg_ligar_registo(p_id, v_reg.tipo, v_reg.id);
      v_ligados := v_ligados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    EXCEPTION WHEN SQLSTATE 'NG004' OR SQLSTATE 'NG014' OR SQLSTATE 'NG023' OR SQLSTATE 'NG024' THEN
      v_recusados := v_recusados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    END;
  END LOOP;

  IF v_lead.id IS NOT NULL AND v_lead.closure_result IS NOT NULL THEN
    PERFORM public.fn_neg_mudar_abordagem(
      p_organization_id, p_entity_id, v_lead.id, NULL, NULL, 'Reaberta ao criar um negócio');
  END IF;

  RETURN jsonb_build_object('negocio_id', p_id, 'mudou', true, 'ligados', v_ligados,
                            'recusados', v_recusados,
                            'lead_escolhida', CASE WHEN public.fn_neg_lead_aberta(v_lead.status::text)
                                                   THEN v_lead.id END);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean, text)
  TO authenticated;

COMMENT ON FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean, text) IS
  'Pessoas: cria um negócio aberto com o tipo de fecho (p_fecho proposta ou contrato; omissão contrato) e liga os registos indicados. NG009 valores; NG008 sem Pessoas; NG003 pessoa; NG002 abordagem encerrada; NG004/NG014/NG023/NG024 vão para recusados. 20261226110000.';

-- 5. Mudar o tipo de fecho
CREATE FUNCTION public.neg_mudar_fecho(
  p_negocio_id uuid,
  p_fecho text,
  p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg      public.negocios;
  v_ganharia boolean := false;
BEGIN
  IF p_fecho IS NULL OR p_fecho NOT IN ('proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo de fecho (proposta ou contrato).' USING ERRCODE = 'NG009';
  END IF;

  -- Existe, não está no lixo, organização com Pessoas e pessoas.edit com
  -- âmbito (RLS de negocios no FOR NO KEY UPDATE).
  SELECT * INTO v_neg
  FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'ganho', 'perdido']);

  IF v_neg.estado <> 'aberto' THEN
    RAISE EXCEPTION 'O tipo de fecho só muda num negócio aberto: reabra o negócio ou anule a perda primeiro.'
      USING ERRCODE = 'NG022';
  END IF;

  IF v_neg.fecho = p_fecho THEN
    RETURN jsonb_build_object('mudou', false, 'fecho', v_neg.fecho, 'precisa_confirmar', false);
  END IF;

  IF p_fecho = 'proposta' THEN
    IF EXISTS (SELECT 1 FROM public.client_contracts cc
               WHERE cc.negocio_id = v_neg.id AND cc.deleted_at IS NULL
                 AND cc.replaced_by_contract_id IS NULL
                 AND cc.status IN ('pending_signature', 'signed', 'assinado', 'active')) THEN
      RAISE EXCEPTION 'Há um contrato assinado ou enviado para assinatura: o negócio não pode passar a fechar na proposta.'
        USING ERRCODE = 'NG022';
    END IF;
    v_ganharia := EXISTS (SELECT 1 FROM public.proposals pr
                          WHERE pr.negocio_id = v_neg.id AND pr.status = 'accepted'
                            AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE);
  ELSE
    IF EXISTS (SELECT 1 FROM public.proposals pr
               WHERE pr.negocio_id = v_neg.id AND pr.status = 'accepted'
                 AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE) THEN
      RAISE EXCEPTION 'Há uma proposta aceite: o negócio não pode passar a fechar no contrato.'
        USING ERRCODE = 'NG022';
    END IF;
    v_ganharia := EXISTS (SELECT 1 FROM public.client_contracts cc
                          WHERE cc.negocio_id = v_neg.id AND cc.deleted_at IS NULL
                            AND cc.replaced_by_contract_id IS NULL
                            AND cc.status IN ('signed', 'assinado', 'active'));
  END IF;

  IF v_ganharia AND NOT COALESCE(p_confirmar, false) THEN
    RETURN jsonb_build_object('mudou', false, 'fecho', v_neg.fecho, 'precisa_confirmar', true);
  END IF;

  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n SET fecho = p_fecho WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);

  RETURN jsonb_build_object('mudou', true, 'fecho', p_fecho, 'precisa_confirmar', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_mudar_fecho(uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_mudar_fecho(uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.neg_mudar_fecho(uuid, text, boolean) IS
  'Pessoas: muda o tipo de fecho de um negócio aberto (secção 3 do desenho v4). NG022 se ganho/perdido, se há contrato activo assinado ou em pending_signature (para proposta) ou proposta aceite (para contrato). Com um positivo que passaria a decidir, devolve precisa_confirmar e só muda com p_confirmar. NG009 valores. 20261226110000.';

-- CONFERIR
DO $conferir$
DECLARE
  v_criar oid := pg_catalog.to_regprocedure('public.neg_criar_negocio(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,boolean,text)');
  v_mudar oid := pg_catalog.to_regprocedure('public.neg_mudar_fecho(uuid,text,boolean)');
  v_n     int;
BEGIN
  -- 1. Colunas e restrições
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.negocios'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND ((a.attname::text = 'fecho' AND a.atttypid = 'text'::regtype AND a.attnotnull)
      OR (a.attname::text = 'decisao_origem_tipo' AND a.atttypid = 'text'::regtype AND NOT a.attnotnull)
      OR (a.attname::text = 'decisao_origem_id' AND a.atttypid = 'uuid'::regtype AND NOT a.attnotnull)
      OR (a.attname::text = 'alerta_codigo' AND a.atttypid = 'text'::regtype AND NOT a.attnotnull)
      OR (a.attname::text = 'alerta_em' AND a.atttypid = 'timestamptz'::regtype AND NOT a.attnotnull));
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'CONFERIR: % de 5 colunas novas com o tipo esperado', v_n;
  END IF;
  IF (SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
      FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_attribute a
        ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      WHERE d.adrelid = 'public.negocios'::regclass AND a.attname::text = 'fecho')
     IS DISTINCT FROM '''contrato''::text' THEN
    RAISE EXCEPTION 'CONFERIR: a omissão de negocios.fecho não é contrato';
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_constraint k
  WHERE k.conrelid = 'public.negocios'::regclass AND k.contype::text = 'c'
    AND k.conname::text IN ('negocios_fecho_check', 'negocios_decisao_origem_check', 'negocios_alerta_check')
    AND k.convalidated;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'CONFERIR: % de 3 restrições novas válidas', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.negocios n
  WHERE n.fecho <> 'contrato' OR n.decisao_origem_tipo IS NOT NULL OR n.alerta_codigo IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % negócio(s) com valores novos inesperados', v_n;
  END IF;

  -- 2. Funções: uma só sobrecarga de neg_criar_negocio, a nova; neg_mudar_fecho
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'neg_criar_negocio';
  IF v_n <> 1 OR v_criar IS NULL OR v_mudar IS NULL THEN
    RAISE EXCEPTION 'CONFERIR: neg_criar_negocio (% sobrecarga(s)) ou neg_mudar_fecho em falta', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.oid IN (v_criar, v_mudar)
               AND (p.prosecdef OR p.provolatile::text <> 'v'
                    OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
                    OR pg_catalog.pg_get_userbyid(p.proowner)::text <> 'postgres')) THEN
    RAISE EXCEPTION 'CONFERIR: neg_criar_negocio/neg_mudar_fecho sem INVOKER, VOLATILE, search_path fixo ou dono postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(p.proacl) a
             WHERE p.oid IN (v_criar, v_mudar) AND a.grantee = 0)
     OR pg_catalog.has_function_privilege('anon', v_criar, 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', v_mudar, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_criar, 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', v_mudar, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', v_criar, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', v_mudar, 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: privilégios de neg_criar_negocio/neg_mudar_fecho não são só authenticated';
  END IF;
  IF (SELECT pg_catalog.pg_get_function_arguments(v_criar)) NOT LIKE '%p_fecho text DEFAULT ''contrato''::text' THEN
    RAISE EXCEPTION 'CONFERIR: p_fecho não é o último argumento com omissão contrato';
  END IF;

  -- 3. As funções de gatilho foram de facto substituídas e mantêm DEFINER,
  --    search_path fixo e os privilégios que tinham.
  IF md5(pg_catalog.pg_get_functiondef('public.fn_negocios_guardar_alteracao()'::regprocedure)) = '33ba01c6e0f8a1ed54651773baa5e97b'
     OR md5(pg_catalog.pg_get_functiondef('public.fn_negocios_preparar_insercao()'::regprocedure)) = '8bb6cc9c238067c8c0a009c227a2d523' THEN
    RAISE EXCEPTION 'CONFERIR: as funções de gatilho de negocios não mudaram';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.oid IN ('public.fn_negocios_guardar_alteracao()'::regprocedure,
                             'public.fn_negocios_preparar_insercao()'::regprocedure)
               AND (NOT p.prosecdef
                    OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
                    OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                    OR pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'CONFERIR: funções de gatilho de negocios sem DEFINER, search_path fixo, ou com EXECUTE a mais';
  END IF;

  -- 4. Os gatilhos de negocios são os mesmos cinco.
  IF (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                            ORDER BY t.tgname::text))
      FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.negocios'::regclass AND NOT t.tgisinternal)
     IS DISTINCT FROM 'b7b001b474fc0155238d5469bad87d93' THEN
    RAISE EXCEPTION 'CONFERIR: os gatilhos de negocios mudaram';
  END IF;
END
$conferir$;

COMMIT;
