-- ============================================================
-- 20261226210000_neg_recusa_orcamento_cadeia
-- ============================================================
-- *** APLICADA EM HORA DE PONTA POR ORDEM EXPRESSA DO UTILIZADOR A 21/10,
-- *** contra a regra de só mexer em quotes depois das 20h ou antes das 8h: a
-- *** guarda horária que esta migration tinha foi retirada a pedido dele.
-- *** Cria um gatilho em public.quotes, TABELA PARTILHADA COM A MUDELAR.
-- *** Bloqueio SHARE ROW EXCLUSIVE em quotes com NOWAIT (lock_timeout de 2 s
-- *** na transacção), até 10 tentativas de 0,5 s; sem ele, aborta sem fazer
-- *** nada, em vez de ficar na fila atrás de uma transacção longa.
-- *** Ordem dos bloqueios: quotes primeiro, só depois a pré-condição e
-- *** os ALTER TABLE (nenhum bloqueio de negocios fica retido à espera de
-- *** quotes; os gatilhos de quotes são relidos já com quotes bloqueada).
-- *** DEPENDE DE CÓDIGO NOVO para servir (ver «O que o ecrã tem de fazer»):
-- *** sem ele não parte nada, mas a configuração nova não tem ecrã.
--
-- Decisões do utilizador (21/10):
--   ponto 1  Orçamento recusado (fase global «perdido»): perde o negócio se for
--            o último documento vivo e não recusado do negócio; configurável.
--   ponto 2  A cadeia de documentos (orçamento aceite cria a proposta, proposta
--            aceite cria o contrato, contrato assinado não cria nada) grava-se
--            por uma função nossa, só com esses interruptores.
--
-- O que faz
--   1. negocio_workflow_config.recusa_orcamento, coluna NOVA:
--        text NOT NULL DEFAULT 'perder_se_ultimo',
--        CHECK (recusa_orcamento IN ('perder_se_ultimo', 'manter_aberto')).
--      Default constante: sem reescrita da tabela; as linhas existentes ficam
--      com 'perder_se_ultimo' (o CONFERIR confirma). O direito de SELECT de
--      authenticated é de tabela (não há direitos por coluna) e cobre-a.
--      NOTA: neg_guardar_config_negocios NÃO grava esta coluna (mudar-lhe a
--      assinatura está fora de questão: criaria uma segunda versão e o
--      PostgREST deixava de saber qual chamar). Até haver forma de a gravar
--      no ecrã, vale a omissão para todas as organizações.
--   2. Os CHECK de origem passam a aceitar 'orcamento':
--        negocios.negocios_decisao_origem_check
--        negocio_eventos.negocio_eventos_origem_check
--      (só alargam a lista; as linhas existentes continuam válidas). Sem isto a
--      perda automática por um orçamento falhava no CHECK.
--   3. fn_neg_decidir_negocio (versão de 20261226140000, lida no remoto a 21/10,
--      md5 do corpo d9797069dbb62d528db82c82c7cb90a3) passa a aceitar o tipo
--      'orcamento'. A assinatura, SECURITY DEFINER, search_path e privilégios
--      ficam (CREATE OR REPLACE). O resto da função fica igual, palavra por
--      palavra; só se acrescentam constantes, a releitura do orçamento e o
--      ramo 2b:
--        - só a ENTRADA num estado recusado decide (perdido, rejeitado,
--          rejeitada, recusado, recusada, rejected, declined, lost; o ecrã de
--          Orçamentos escreve 'perdido', o construtor, o portal e Propostas
--          escrevem 'rejeitado');
--        - negócio aberto: perde (fase 'orcamento', origem o orçamento) se não
--          houver no negócio outro documento vivo e não recusado nem
--          cancelado: outro orçamento (não apagado, não interno), uma proposta
--          (não apagada; um rascunho, uma enviada ou uma expirada contam como
--          vivas) ou um contrato (não apagado, não substituído); senão, ou com
--          recusa_orcamento = 'manter_aberto', fica um acompanhamento;
--        - se o orçamento pertence a uma proposta já recusada (a cascata de
--          Proposals.tsx, que passa os orçamentos de uma proposta recusada a
--          'rejeitado'), a recusa da proposta é que decidiu, segundo
--          recusa_proposta: o orçamento só anota. Sem isto, recusa_proposta =
--          'manter_aberto' seria anulado pela cascata dos orçamentos;
--        - negócio ganho: acompanhamento; negócio perdido: nada;
--        - um orçamento interno (is_internal, os sintéticos das encomendas
--          manuais) nunca decide nem conta como vivo;
--        - LIMITE ASSUMIDO: um orçamento recusado que volte a enviado ou
--          aceite NÃO reabre o negócio que ele próprio perdeu (propostas e
--          contratos têm reenvio e reabertura; o orçamento não). Reabre-se à
--          mão (neg_anular_perda). Acrescentar a reabertura é outra migration;
--        - POR DECIDIR COM O UTILIZADOR: uma proposta em rascunho ou expirada
--          e um contrato em rascunho contam como vivos, por isso travam a
--          perda (um rascunho esquecido impede o orçamento recusado de perder
--          o negócio). Mudar isto é só mexer em c_morto_pr / c_morto_cc.
--      negocios.fase_perda e negocio_eventos.fase já aceitam 'orcamento'
--      (negocios_fase_perda_check e negocio_eventos_fase_check, lidos no
--      remoto a 21/10); a perda leva sempre motivo (negocios_perda_coerente).
--   4. Gatilho de restrição adiado trg_negocios_fecho_orcamento em quotes
--      (DEFERRABLE INITIALLY DEFERRED, corre no COMMIT, como os de propostas e
--      contratos de 20261226160000):
--        AFTER UPDATE OF estado
--        WHEN (NEW.negocio_id IS NOT NULL AND NOT NEW.is_internal
--              AND OLD.estado IS DISTINCT FROM NEW.estado)
--      NOTA: quotes NÃO tem coluna status; o estado do orçamento é «estado».
--      Chama fn_neg_decidir_negocio('orcamento', ...). Todo o corpo corre em
--      BEGIN ... EXCEPTION: um erro fica em workflow_execution_log
--      (source_entity 'quote', action_type 'trigger:negocio_fecho', status
--      'error') e nunca faz falhar a gravação do orçamento. lock_timeout de 2 s
--      ao nível da função. Mesmos limites de 20261226160000: query_canceled não
--      é apanhado, e uma perda que falhou não se refaz sozinha.
--      Monitorização (só leitura, por organização): as falhas ficam em
--        SELECT w.created_at, w.source_record_id, w.target_record_id,
--               w.error_message FROM public.workflow_execution_log w
--        JOIN public.negocios n ON n.id = w.target_record_id
--        WHERE w.source_entity = 'quote'
--          AND w.action_type = 'trigger:negocio_fecho' AND w.status = 'error'
--          AND n.organization_id = <organização>;
--      Uma linha aqui é uma perda automática que não aconteceu.
--   5. neg_guardar_cadeia(p_orcamento_cria_proposta boolean,
--                         p_proposta_cria_contrato boolean,
--                         p_organization_id uuid DEFAULT NULL) -> jsonb, NOVA:
--      SECURITY DEFINER, search_path fixo, EXECUTE só para authenticated.
--      Organizações elegíveis: as organizações CRM activas de quem chama que
--      têm negocio_workflow_config, pessoas.view e pessoas.config com chave
--      de âmbito nessa organização. Nenhuma: NG008 (sem página Pessoas) ou
--      42501 (sem pessoas.config).
--      p_organization_id (como em neg_guardar_config_negocios): se vier, TEM
--      de ser uma das elegíveis, senão 42501 (nunca se escreve numa
--      organização só porque veio no parâmetro). Se vier nulo: a única
--      elegível; mais do que uma, NG026 (não se sabe qual configurar). Assim
--      uma segunda organização com Pessoas não bloqueia a gravação: o ecrã
--      passa a organização activa. A Mudelar não tem negocio_workflow_config,
--      por isso nunca é elegível.
--      Grava SÓ dois interruptores, por UPSERT de is_active na chave
--      (organização, fase, action_type), sem apagar linhas:
--        orçamento aceite cria a proposta: quote_stage_actions, fase GLOBAL
--          'aceite' de quote_workflow_stages (ab9b34fc na base partilhada),
--          action_type 'create_proposal';
--        proposta aceite cria o contrato: proposal_stage_actions, fase GLOBAL
--          'accepted' de proposal_workflow_stages (971bf5de: confirmado a
--          21/10 que é global, organization_id nulo, is_won), action_type
--          'create_contract'.
--      As tabelas não têm chave única nessa tripla (e não se cria uma: são
--      partilhadas e verificá-la exigiria ler as outras organizações): o
--      UPSERT é «UPDATE das linhas da organização que diferem; INSERT só se
--      não houver linha e o valor efectivo for outro», sob um bloqueio
--      consultivo por organização. Linhas repetidas ficam todas iguais.
--      «Contrato assinado não cria nada» NÃO se grava: contract_stage_actions
--      não é tocada (as duas linhas da nike, create_proposal inactiva e
--      convert_to_client activa, ficam). A função só o LÊ e devolve
--      (contrato_assinado_cria_nada). Devolve {organizacao, antes, depois,
--      mudou} com os valores EFECTIVOS como o motor os lê.
--
-- Organização própria vs. globais (como o motor execute-workflow lê, 21/10)
--   quote_stage_actions: por fase, só linhas activas da organização; sem
--     nenhuma activa nessa fase, as globais. MAS organization_id é NOT NULL
--     nesta tabela: não pode haver globais. Gravar uma linha da organização
--     não esconde nada.
--   proposal_stage_actions: o motor lê TODAS as linhas da organização (de
--     qualquer fase, activas ou não); se houver pelo menos uma, as globais
--     deixam de ser lidas em TODAS as fases dessa organização. A nike já tem
--     três linhas na fase 971bf5de (convert_to_client e create_quote
--     inactivas, create_contract activa), por isso já hoje não lê globais; e
--     há 0 linhas globais nesta tabela (lido a 21/10). Para a nike não muda
--     nada; para uma organização sem linhas, a primeira gravação deixaria de
--     ler as globais (hoje nenhuma). Se um dia se criarem globais aqui, quem
--     já gravou a cadeia não as vê. NÃO usar esta função numa organização
--     nova sem rever antes as globais de proposal_stage_actions.
--   created_by das linhas novas: fn_neg_actor() (id de anew_users). É o mesmo
--     espaço de identidade das 3 linhas da nike que já existem em
--     proposal_stage_actions (created_by = id de anew_users, não auth uid;
--     lido a 21/10). A função não deixa registo de auditoria próprio de quem
--     mudou a cadeia (updated_at nas linhas de orçamentos, só isso).
--   contract_stage_actions: por fase (signed/assinado), linhas activas da
--     organização; sem nenhuma activa, as globais. Não é tocada. Há uma global
--     convert_to_client activa: se a nike desactivar a sua convert_to_client e
--     ficar sem nenhuma activa, a global volta a converter.
--
-- Desempenho (medido na nike a 21/10, só leitura; ver o relatório): o WHEN é
--   avaliado em memória em cada UPDATE que inclua estado; na Mudelar
--   (negocio_id sempre nulo) pára no primeiro termo e a função nunca é
--   chamada. A decisão faz até três EXISTS pelos índices
--   idx_quotes_negocio_id, idx_proposals_negocio_id e
--   idx_client_contracts_negocio_id. Nenhuma leitura de catálogo no caminho
--   quente.
--
-- Impacto na Mudelar: nos dados e no comportamento, nenhum. 0 documentos com
--   negocio_id e 0 linhas de configuração fora da nike (medido pela migration
--   20261226160000 a 20/10); o WHEN é falso em todos os UPDATE da Mudelar.
--   Há um bloqueio curto de quotes durante a aplicação. quote_stage_actions e
--   proposal_stage_actions só são escritas por neg_guardar_cadeia, na
--   organização de quem chama.
--
-- O que o ecrã tem de fazer junto
--   - Configuração de Pessoas: um controlo para recusa_orcamento (e uma forma
--     de o gravar, que esta migration NÃO cria; ver a NOTA do ponto 1).
--   - A cadeia: chamar neg_guardar_cadeia(bool, bool, organização activa) em
--     vez de escrever nas tabelas *_stage_actions; traduzir NG026
--     (src/hooks/pessoas/errosNeg.ts e src/translations/pessoasErros.ts).
--   - Histórico e ficha: aceitar 'orcamento' em origem_tipo e
--     decisao_origem_tipo (adaptarNegociosFicha.ts e paramsNegocio.ts filtram
--     hoje para proposta/contrato: um 'orcamento' aparece sem origem, não
--     parte). neg_ficha_pessoa devolve decisao_origem_numero nulo para um
--     orçamento.
--   - Regenerar os tipos do Supabase.
--
-- ORDEM: depois de 20261226140000 (fn_neg_decidir_negocio) e de
--   20261226160000 (gatilhos de propostas e contratos). Independente de
--   20261226180000, 190000 e 200000. A 20261226220000 (migração de dados)
--   vem a seguir e aceita fn_neg_decidir_negocio nesta versão ou na de
--   20261226140000.
-- Pré-condições (lidas no remoto a 21/10): md5 do corpo de
--   fn_neg_decidir_negocio; colunas de negocio_workflow_config; os dois CHECK
--   de origem; todos os gatilhos de quotes; as fases globais únicas; nenhuma
--   das funções novas; NG026 livre.
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226210000_neg_recusa_orcamento_cadeia.sql). Também
--   mexe em quotes: exige a mesma autorização. Os estados,
--   eventos e linhas de *_stage_actions já escritos ficam. Se a 220000
--   também for revertida, reverte-se ela PRIMEIRO.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Bloqueio de quotes (partilhada) ANTES da pré-condição e dos ALTER TABLE:
-- NOWAIT, até 10 tentativas, sem reter outros bloqueios enquanto espera.
DO $bloqueio$
DECLARE
  v_i int;
BEGIN
  FOR v_i IN 1..10 LOOP
    BEGIN
      LOCK TABLE public.quotes IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(0.5);
    END;
  END LOOP;
  RAISE EXCEPTION 'BLOQUEIO: a tabela quotes está ocupada (10 tentativas); nada feito. Tentar fora da hora de ponta.';
END
$bloqueio$;

-- Pré-condição (com quotes já bloqueada: os gatilhos lidos não mudam até ao COMMIT)
DO $pre$
DECLARE
  v_txt text;
BEGIN
  IF pg_catalog.to_regprocedure('public.fn_neg_decidir_negocio(text,uuid,text,text,uuid,uuid)') IS NULL
     OR (SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_catalog.pg_proc p
         WHERE p.oid = pg_catalog.to_regprocedure('public.fn_neg_decidir_negocio(text,uuid,text,text,uuid,uuid)'))
        <> 'd9797069dbb62d528db82c82c7cb90a3' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: fn_neg_decidir_negocio não é a versão de 20261226140000; nada feito.';
  END IF;

  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_neg_anotar(uuid,text,text,text,text,uuid,text,text,text,text)'),
              ('public.fn_neg_mudar_estado(uuid,text,text,text,text,text,uuid,text,text,text,text,text)'),
              ('public.fn_neg_canal(uuid,text)'),
              ('public.fn_negocios_actor()'),
              ('public.fn_neg_actor()'),
              ('public.get_user_crm_org_ids(uuid)'),
              ('public.crm_scope_keys(text)'),
              ('public.has_anew_permission(uuid,text)')
            ) AS e(sig)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam funções: %; nada feito.', v_txt;
  END IF;

  IF (SELECT md5(string_agg(a.attname::text || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod), ','
                            ORDER BY a.attnum))
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.negocio_workflow_config'::regclass AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM '4c4168611921b04b1f91cef1ad12d5ab' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: as colunas de negocio_workflow_config mudaram desde 21/10; nada feito.';
  END IF;

  v_txt := (SELECT string_agg(e.n, ', ')
            FROM (VALUES
              ('negocios_decisao_origem_check', 'public.negocios', '6ef645353e8c80fb6ac2c2d118c02116'),
              ('negocio_eventos_origem_check', 'public.negocio_eventos', 'a8e54ef79caaffb715b310c421c901fd')
            ) AS e(n, tbl, h)
            WHERE (SELECT md5(pg_catalog.pg_get_constraintdef(c.oid)) FROM pg_catalog.pg_constraint c
                   WHERE c.conrelid = e.tbl::regclass AND c.conname::text = e.n) IS DISTINCT FROM e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: os CHECK de origem mudaram desde 21/10: %; nada feito.', v_txt;
  END IF;

  -- Todos os gatilhos de quotes (os trg_negocios_* incluídos) iguais aos de 21/10.
  IF (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                            ORDER BY t.tgname::text))
      FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.quotes'::regclass AND NOT t.tgisinternal)
     IS DISTINCT FROM 'e022f47307c32864e48b8de57c55ae6a' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: os gatilhos de quotes mudaram desde 21/10; nada feito.';
  END IF;

  v_txt := (SELECT string_agg(e.c, ', ')
            FROM (VALUES ('estado'), ('negocio_id'), ('is_internal'), ('lost_reason'), ('proposal_id'),
                         ('deleted_at'), ('organization_id'), ('entity_id')) AS e(c)
            WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                              WHERE a.attrelid = 'public.quotes'::regclass AND a.attname::text = e.c
                                AND a.attnum > 0 AND NOT a.attisdropped));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam colunas em quotes: %; nada feito.', v_txt;
  END IF;

  IF (SELECT count(*) FROM public.quote_workflow_stages s
      WHERE s.organization_id IS NULL AND s.name = 'aceite') <> 1
     OR (SELECT count(*) FROM public.proposal_workflow_stages s
         WHERE s.organization_id IS NULL AND s.name::text = 'accepted') <> 1 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: as fases globais aceite (orçamentos) e accepted (propostas) não são únicas; nada feito.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname::text IN ('neg_guardar_cadeia', 'fn_neg_fecho_orcamento_trg')) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_guardar_cadeia ou fn_neg_fecho_orcamento_trg já existem; nada feito.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%NG026%') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: o código NG026 já está em uso; nada feito.';
  END IF;
END
$pre$;

-- 1. Configuração: recusa de orçamento.
ALTER TABLE public.negocio_workflow_config
  ADD COLUMN recusa_orcamento text NOT NULL DEFAULT 'perder_se_ultimo'
    CONSTRAINT negocio_workflow_config_recusa_orcamento_check
    CHECK (recusa_orcamento = ANY (ARRAY['perder_se_ultimo'::text, 'manter_aberto'::text]));

COMMENT ON COLUMN public.negocio_workflow_config.recusa_orcamento IS
  'Orçamento recusado: perder_se_ultimo (omissão) perde o negócio aberto se o orçamento era o último documento vivo e não recusado nem cancelado do negócio; manter_aberto só anota. 20261226210000.';

-- 2. Origem: aceitar o orçamento.
ALTER TABLE public.negocios
  DROP CONSTRAINT negocios_decisao_origem_check,
  ADD CONSTRAINT negocios_decisao_origem_check
    CHECK (((decisao_origem_tipo IS NULL)
            OR (decisao_origem_tipo = ANY (ARRAY['proposta'::text, 'contrato'::text, 'orcamento'::text])))
           AND ((decisao_origem_tipo IS NULL) = (decisao_origem_id IS NULL)));

ALTER TABLE public.negocio_eventos
  DROP CONSTRAINT negocio_eventos_origem_check,
  ADD CONSTRAINT negocio_eventos_origem_check
    CHECK (((origem_tipo IS NULL)
            OR (origem_tipo = ANY (ARRAY['proposta'::text, 'contrato'::text, 'orcamento'::text])))
           AND ((origem_tipo IS NULL) = (origem_id IS NULL)));

-- 3. Decisão: o tipo 'orcamento'.
CREATE OR REPLACE FUNCTION public.fn_neg_decidir_negocio(p_tipo text, p_doc_id uuid, p_status_antes text, p_status_depois text, p_negocio_antes uuid, p_negocio_depois uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_pos_pr  CONSTANT text[] := ARRAY['accepted'];
  c_neg_pr  CONSTANT text[] := ARRAY['rejected'];
  c_pos_cc  CONSTANT text[] := ARRAY['signed', 'assinado', 'active'];
  c_neg_cc  CONSTANT text[] := ARRAY['cancelled', 'cancelado', 'rejected', 'recusado'];
  -- 20261226210000: orçamentos. Recusado (decide) e documentos que já não contam.
  c_neg_qt   CONSTANT text[] := ARRAY['perdido', 'rejeitado', 'rejeitada', 'recusado', 'recusada',
                                     'rejected', 'declined', 'lost'];
  c_recusa_pr CONSTANT text[] := ARRAY['rejeitado', 'rejeitada', 'recusado', 'recusada',
                                      'rejected', 'declined', 'lost'];
  c_morto_qt CONSTANT text[] := ARRAY['perdido', 'rejeitado', 'rejeitada', 'recusado', 'recusada',
                                     'rejected', 'declined', 'lost', 'cancelado', 'cancelada', 'cancelled'];
  c_morto_pr CONSTANT text[] := ARRAY['rejeitado', 'rejeitada', 'recusado', 'recusada', 'rejected',
                                     'declined', 'lost', 'cancelado', 'cancelada', 'cancelled'];
  c_morto_cc CONSTANT text[] := ARRAY['cancelled', 'cancelado', 'cancelada', 'rejected', 'recusado',
                                     'recusada', 'rejeitado', 'rejeitada'];
  v_actor     uuid := public.fn_negocios_actor();
  v_neg       public.negocios;
  v_cfg       public.negocio_workflow_config;
  v_org       uuid;
  v_entity    uuid;
  v_status    text;
  v_neg_doc   uuid;
  v_apagado   boolean;
  v_subst     boolean := false;
  v_motivo_cl text;
  v_cls_antes text;
  v_cls_dep   text;
  v_ligacao   boolean := p_negocio_antes IS DISTINCT FROM p_negocio_depois;
  v_decisivo  boolean;
  v_origem    boolean;
  v_classe    text;
  v_prova     text;
  v_hash      text;
  v_canal     text;
  v_nome      text := CASE WHEN p_tipo = 'proposta' THEN 'Proposta'
                           WHEN p_tipo = 'orcamento' THEN 'Orçamento' ELSE 'Contrato' END;
  v_momento   timestamptz;
  v_prop_qt   uuid;
BEGIN
  IF p_tipo NOT IN ('proposta', 'contrato', 'orcamento') OR p_doc_id IS NULL OR p_negocio_depois IS NULL THEN
    RETURN;
  END IF;

  -- 1. Reler o documento. Idempotente: só age se o documento ainda está no
  --    estado e no negócio deste evento (um evento posterior trata o resto).
  IF p_tipo = 'proposta' THEN
    SELECT pr.organization_id, pr.entity_id, pr.status, pr.negocio_id,
           (pr.deleted_at IS NOT NULL OR pr.is_deleted IS TRUE),
           COALESCE(NULLIF(btrim(pr.rejection_notes), ''), NULLIF(btrim(pr.rejection_reason), ''))
      INTO v_org, v_entity, v_status, v_neg_doc, v_apagado, v_motivo_cl
    FROM public.proposals pr WHERE pr.id = p_doc_id;
  ELSIF p_tipo = 'orcamento' THEN
    SELECT q.organization_id, q.entity_id, q.estado, q.negocio_id,
           (q.deleted_at IS NOT NULL OR q.is_internal IS TRUE),
           NULLIF(btrim(q.lost_reason), ''), q.proposal_id
      INTO v_org, v_entity, v_status, v_neg_doc, v_apagado, v_motivo_cl, v_prop_qt
    FROM public.quotes q WHERE q.id = p_doc_id;
  ELSE
    SELECT cc.organization_id, cc.entity_id, cc.status, cc.negocio_id,
           (cc.deleted_at IS NOT NULL), (cc.replaced_by_contract_id IS NOT NULL),
           NULLIF(btrim(cc.cancellation_reason), '')
      INTO v_org, v_entity, v_status, v_neg_doc, v_apagado, v_subst, v_motivo_cl
    FROM public.client_contracts cc WHERE cc.id = p_doc_id;
  END IF;
  IF NOT FOUND OR v_neg_doc IS DISTINCT FROM p_negocio_depois
     OR v_status IS DISTINCT FROM p_status_depois THEN
    RETURN;
  END IF;

  -- 2. Sai sem fazer nada nos casos da secção 9.
  SELECT n.* INTO v_neg FROM public.negocios n
  WHERE n.id = p_negocio_depois AND n.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT c.* INTO v_cfg FROM public.negocio_workflow_config c
  WHERE c.organization_id = v_neg.organization_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_org IS DISTINCT FROM v_neg.organization_id OR v_entity IS DISTINCT FROM v_neg.entity_id
     OR v_apagado THEN
    RETURN;
  END IF;
  IF p_tipo = 'contrato' AND v_neg.fecho = 'proposta' THEN
    RETURN;
  END IF;

  -- 2b. Orçamento (20261226210000). Só a ENTRADA em recusado decide; uma
  --     ligação, um aceite ou outra mudança de estado não fazem nada aqui.
  --     Perde o negócio aberto se este era o último documento vivo e não
  --     recusado nem cancelado do negócio (orçamento, proposta ou contrato),
  --     salvo recusa_orcamento = 'manter_aberto'. Se o orçamento pertence a
  --     uma proposta já recusada (a cascata de Proposals.tsx), quem decidiu
  --     foi a recusa da proposta, segundo recusa_proposta: aqui só se anota.
  IF p_tipo = 'orcamento' THEN
    IF v_ligacao
       OR NOT COALESCE(lower(btrim(p_status_depois)) = ANY (c_neg_qt), false)
       OR COALESCE(lower(btrim(p_status_antes)) = ANY (c_neg_qt), false) THEN
      RETURN;
    END IF;
    v_canal := public.fn_neg_canal(v_actor, NULL);
    IF v_neg.estado = 'aberto' THEN
      IF v_prop_qt IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.proposals pr
                     WHERE pr.id = v_prop_qt
                       AND lower(btrim(COALESCE(pr.status::text, ''))) = ANY (c_recusa_pr)) THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
          'Orçamento recusado com a proposta: a recusa da proposta é que decide.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
      ELSIF v_cfg.recusa_orcamento = 'manter_aberto'
         OR EXISTS (SELECT 1 FROM public.quotes q
                    WHERE q.negocio_id = v_neg.id AND q.id <> p_doc_id
                      AND q.deleted_at IS NULL AND q.is_internal IS NOT TRUE
                      AND NOT (lower(btrim(COALESCE(q.estado, ''))) = ANY (c_morto_qt)))
         OR EXISTS (SELECT 1 FROM public.proposals pr
                    WHERE pr.negocio_id = v_neg.id
                      AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
                      AND NOT (lower(btrim(COALESCE(pr.status::text, ''))) = ANY (c_morto_pr)))
         OR EXISTS (SELECT 1 FROM public.client_contracts cc
                    WHERE cc.negocio_id = v_neg.id
                      AND cc.deleted_at IS NULL AND cc.replaced_by_contract_id IS NULL
                      AND NOT (lower(btrim(COALESCE(cc.status::text, ''))) = ANY (c_morto_cc))) THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Orçamento recusado.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
      ELSE
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'orcamento',
          'Automático: orçamento recusado' || COALESCE(': ' || v_motivo_cl, ''), NULL,
          p_tipo, p_doc_id, v_status, v_canal, NULL, NULL,
          'Orçamento recusado (era o último documento vivo do negócio)');
      END IF;
    ELSIF v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Orçamento recusado num negócio ganho.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
    END IF;
    RETURN;
  END IF;

  -- 3. Classes de estado.
  v_cls_antes := CASE
    WHEN p_tipo = 'proposta' AND p_status_antes = ANY (c_pos_pr) THEN 'positivo'
    WHEN p_tipo = 'proposta' AND p_status_antes = ANY (c_neg_pr) THEN 'negativo'
    WHEN p_tipo = 'contrato' AND p_status_antes = ANY (c_pos_cc) THEN 'positivo'
    WHEN p_tipo = 'contrato' AND p_status_antes = ANY (c_neg_cc) THEN 'negativo'
    ELSE 'neutro' END;
  v_cls_dep := CASE
    WHEN p_tipo = 'proposta' AND p_status_depois = ANY (c_pos_pr) THEN 'positivo'
    WHEN p_tipo = 'proposta' AND p_status_depois = ANY (c_neg_pr) THEN 'negativo'
    WHEN p_tipo = 'contrato' AND p_status_depois = ANY (c_pos_cc) THEN 'positivo'
    WHEN p_tipo = 'contrato' AND p_status_depois = ANY (c_neg_cc) THEN 'negativo'
    ELSE 'neutro' END;
  v_decisivo := (p_tipo = v_neg.fecho);
  v_origem := (v_neg.decisao_origem_id IS NOT DISTINCT FROM p_doc_id);

  -- 4. Classe da transição (9.1).
  IF v_ligacao THEN
    -- T11: uma ligação só conta se o documento já for positivo. A prova é a
    -- das colunas: quem liga não é quem aceitou (decisão 1 da v3, adiada).
    IF v_cls_dep <> 'positivo' THEN
      RETURN;
    END IF;
    v_prova := CASE WHEN p_tipo = 'proposta' THEN public.fn_neg_prova_proposta(p_doc_id, NULL)
                    ELSE public.fn_neg_prova_contrato(p_doc_id) END;
    v_classe := CASE WHEN v_prova IS NOT NULL THEN 'positivo' ELSE 'positivo_sem_prova' END;
  ELSIF v_cls_dep = 'positivo' AND v_cls_antes <> 'positivo' THEN
    v_prova := CASE WHEN p_tipo = 'proposta' THEN public.fn_neg_prova_proposta(p_doc_id, v_actor)
                    ELSE public.fn_neg_prova_contrato(p_doc_id) END;
    v_classe := CASE WHEN v_prova IS NOT NULL THEN 'positivo' ELSE 'positivo_sem_prova' END;
  ELSIF v_cls_dep = 'positivo' THEN
    RETURN;                                               -- T2
  ELSIF v_cls_dep = 'negativo' AND v_cls_antes <> 'negativo' THEN
    IF p_tipo = 'proposta' THEN
      v_classe := CASE WHEN v_cls_antes = 'positivo' THEN 'recusa_depois_aceite' ELSE 'recusa_proposta' END;
    ELSIF v_subst THEN
      v_classe := 'substituicao';
    ELSIF v_cls_antes = 'positivo' THEN
      v_classe := 'cancelamento_assinado';
    ELSE
      v_classe := 'recusa_contrato';
    END IF;
  ELSIF v_cls_antes = 'positivo' AND v_cls_dep = 'neutro' THEN
    v_classe := CASE WHEN v_actor IS NOT NULL AND public.fn_neg_houve_alteracoes(v_neg.id, p_tipo, p_doc_id)
                     THEN 'reabertura' ELSE 'sem_efeito' END;
  ELSIF v_cls_antes = 'negativo' AND v_cls_dep = 'neutro' THEN
    v_classe := CASE WHEN v_actor IS NOT NULL AND public.fn_neg_houve_alteracoes(v_neg.id, p_tipo, p_doc_id)
                     THEN 'reenviado' ELSE 'reenviado_sem_alteracoes' END;
  ELSE
    RETURN;
  END IF;

  -- Retrato do conteúdo nas decisões positivas e negativas (10.4).
  IF v_classe IN ('positivo', 'positivo_sem_prova', 'recusa_proposta', 'recusa_contrato',
                  'recusa_depois_aceite', 'cancelamento_assinado') THEN
    v_hash := public.fn_neg_conteudo_hash(p_tipo, p_doc_id);
  END IF;
  v_canal := public.fn_neg_canal(v_actor, v_prova);

  -- 5. Efeito no negócio (9.2).
  IF v_classe = 'positivo' THEN
    IF NOT v_decisivo THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
        'Proposta aceite; o negócio fecha no contrato.',
        p_tipo, p_doc_id, v_status, v_canal, v_prova, v_hash);
    ELSIF v_neg.estado = 'aberto' THEN
      PERFORM public.fn_neg_ganhar_interno(v_neg.id, p_tipo, p_doc_id, v_status, v_canal, v_prova, v_hash,
        CASE WHEN p_tipo = 'proposta' THEN 'Proposta aceite' ELSE 'Contrato assinado' END);
    ELSIF v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
        v_nome || ' positivo num negócio já ganho.',
        p_tipo, p_doc_id, v_status, v_canal, v_prova, v_hash);
    ELSE
      PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'positivo_depois_perda',
        v_nome || ' aceite ou assinado depois da perda.',
        p_tipo, p_doc_id, v_status, v_canal, v_prova, v_hash);
    END IF;

  ELSIF v_classe = 'positivo_sem_prova' THEN
    IF NOT v_decisivo OR v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
        v_nome || ' aceite ou assinado sem prova.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    ELSE
      PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'sem_prova',
        'Assinado ou aceite sem prova.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    END IF;

  ELSIF v_classe = 'recusa_proposta' THEN
    -- A recusa só perde se não houver outro documento positivo ativo (proposta
    -- aceite, ou contrato assinado no fecho no contrato). Outra proposta em
    -- rascunho ou enviada não trava a perda (decisão do utilizador).
    IF v_neg.estado = 'aberto' THEN
      IF public.fn_neg_tem_positivo_activo(v_neg, p_doc_id) OR v_cfg.recusa_proposta = 'manter_aberto' THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Proposta recusada.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      ELSE
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'proposta',
          'Automático: proposta recusada' || COALESCE(': ' || v_motivo_cl, ''), NULL,
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Proposta recusada');
      END IF;
    ELSIF v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Proposta recusada num negócio ganho.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    END IF;

  ELSIF v_classe = 'recusa_contrato' THEN
    IF v_neg.estado = 'aberto' THEN
      IF v_cfg.recusa_contrato = 'manter_aberto' THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Contrato recusado ou cancelado antes de assinado.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      ELSE
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'contrato',
          CASE WHEN v_status IN ('cancelled', 'cancelado')
               THEN 'Automático: contrato cancelado antes de assinado'
               ELSE 'Automático: contrato recusado' END || COALESCE(': ' || v_motivo_cl, ''), NULL,
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Contrato recusado ou cancelado');
      END IF;
    ELSIF v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Contrato recusado ou cancelado num negócio ganho.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    END IF;

  ELSIF v_classe = 'substituicao' THEN
    IF v_neg.estado = 'ganho' AND v_origem THEN
      PERFORM public.fn_neg_mudar_estado(v_neg.id, 'aberto', NULL, NULL,
        'Contrato substituído: aguarda assinatura da nova versão',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL, 'Contrato substituído');
    ELSE
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Contrato substituído por uma nova versão.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
    END IF;

  ELSIF v_classe = 'cancelamento_assinado' THEN
    IF v_neg.estado = 'ganho' AND v_origem THEN
      v_momento := public.fn_neg_momento_assinatura(p_doc_id, v_neg.ganho_em);
      IF v_cfg.reflexao_dias IS NULL THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'prazo_por_configurar',
          'Contrato cancelado depois de assinado; o prazo de reflexão não está configurado: o negócio continua ganho.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      ELSIF v_momento IS NOT NULL AND now() <= v_momento + make_interval(days => v_cfg.reflexao_dias) THEN
        IF v_cfg.cancelamento_no_prazo = 'perder' THEN
          PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'contrato',
            'Desistência dentro do prazo' || COALESCE(': ' || v_motivo_cl, ''), NULL,
            p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Desistência dentro do prazo');
        ELSE
          PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
            'Contrato cancelado dentro do prazo; a configuração mantém o ganho.',
            p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
        END IF;
      ELSE
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Cancelado depois do prazo.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      END IF;
    ELSIF v_neg.estado <> 'perdido' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Contrato cancelado depois de assinado.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    END IF;

  ELSIF v_classe = 'reabertura' THEN
    IF v_neg.estado = 'ganho' AND v_origem THEN
      PERFORM public.fn_neg_mudar_estado(v_neg.id, 'aberto', NULL, NULL,
        v_nome || ' reaberto com alterações',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL, v_nome || ' reaberto com alterações');
    END IF;

  ELSIF v_classe = 'sem_efeito' THEN
    IF v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'mudanca_sem_efeito',
        v_nome || ' saiu de aceite ou assinado sem alterações: o negócio continua ganho.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
    END IF;

  ELSIF v_classe = 'recusa_depois_aceite' THEN
    IF v_neg.estado = 'aberto' THEN
      IF public.fn_neg_tem_positivo_activo(v_neg, p_doc_id) OR v_cfg.recusa_proposta = 'manter_aberto' THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Proposta recusada depois de aceite.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      ELSE
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'proposta',
          'Automático: proposta recusada depois de aceite' || COALESCE(': ' || v_motivo_cl, ''), NULL,
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Proposta recusada depois de aceite');
      END IF;
    ELSIF v_neg.estado = 'ganho' THEN
      IF v_origem AND v_actor IS NOT NULL THEN
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'aberto', NULL, NULL,
          'Proposta recusada depois de aceite',
          p_tipo, p_doc_id, v_status, v_canal, NULL, NULL, 'Proposta recusada depois de aceite');
        SELECT n.* INTO v_neg FROM public.negocios n WHERE n.id = v_neg.id;
        IF v_cfg.recusa_proposta = 'perder' AND NOT public.fn_neg_tem_positivo_activo(v_neg, p_doc_id) THEN
          PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'proposta',
            'Automático: proposta recusada depois de aceite' || COALESCE(': ' || v_motivo_cl, ''), NULL,
            p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Proposta recusada depois de aceite');
        END IF;
      ELSE
        PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'recusa_depois_aceite',
          'Proposta recusada depois de aceite: o negócio continua ganho.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      END IF;
    END IF;

  ELSIF v_classe = 'reenviado' THEN
    IF v_neg.estado = 'perdido' THEN
      IF v_origem THEN
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'aberto', NULL, NULL,
          v_nome || ' reenviado com alterações',
          p_tipo, p_doc_id, v_status, v_canal, NULL, NULL, v_nome || ' reenviado com alterações');
      ELSE
        PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'reenvio_sem_reabrir',
          v_nome || ' reenviado com alterações, mas a perda não veio dele (ou foi manual): o negócio continua perdido.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
      END IF;
    END IF;

  ELSIF v_classe = 'reenviado_sem_alteracoes' THEN
    IF v_neg.estado = 'perdido' AND v_origem THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
        v_nome || ' reenviado sem alterações: não reabre o negócio.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
    END IF;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.fn_neg_decidir_negocio(text, uuid, text, text, uuid, uuid) IS
  'Pessoas, Fase N: decide o negócio a partir de uma proposta, de um contrato ou (20261226210000) de um orçamento recusado. Chamada só pelos gatilhos adiados trg_negocios_fecho_*. 20261226140000, 20261226210000.';

-- 4. Gatilho de quotes (partilhada; o bloqueio foi tomado no início).
CREATE FUNCTION public.fn_neg_fecho_orcamento_trg()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  SET lock_timeout = '2s'
AS $function$
BEGIN
  BEGIN
    PERFORM public.fn_neg_decidir_negocio('orcamento', NEW.id, OLD.estado, NEW.estado,
                                          OLD.negocio_id, NEW.negocio_id);
  EXCEPTION WHEN OTHERS THEN
    -- Nunca faz falhar o COMMIT do orçamento: regista e segue.
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message, execution_data
      ) VALUES (
        'quote', NEW.id, 'negocio', NEW.negocio_id,
        'trigger:negocio_fecho', 'error', SQLERRM,
        jsonb_build_object('sqlstate', SQLSTATE, 'status_antes', OLD.estado,
                           'status_depois', NEW.estado, 'negocio_antes', OLD.negocio_id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_fecho_orcamento_trg() FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_negocios_fecho_orcamento
  AFTER UPDATE OF estado ON public.quotes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.negocio_id IS NOT NULL AND NOT NEW.is_internal
        AND OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION public.fn_neg_fecho_orcamento_trg();

COMMENT ON FUNCTION public.fn_neg_fecho_orcamento_trg() IS
  'Pessoas: gatilho adiado de quotes (estado); chama fn_neg_decidir_negocio com o tipo orcamento. Um erro vai para workflow_execution_log (trigger:negocio_fecho) e nunca faz falhar o COMMIT. 20261226210000.';

-- 5. A cadeia de documentos.
CREATE FUNCTION public.neg_guardar_cadeia(p_orcamento_cria_proposta boolean,
                                          p_proposta_cria_contrato boolean,
                                          p_organization_id uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_orgs      uuid[];
  v_keys      text[];
  v_org       uuid;
  v_fase_orc  uuid;
  v_fase_pr   uuid;
  v_n         integer;
  v_actor     uuid;
  v_orc_antes boolean;
  v_pr_antes  boolean;
  v_cc_nada   boolean;
  v_tem_org   boolean;
  v_mudou     boolean := false;
BEGIN
  -- 1. Valores
  IF p_orcamento_cria_proposta IS NULL OR p_proposta_cria_contrato IS NULL THEN
    RAISE EXCEPTION 'Cadeia de documentos inválida.' USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organizações elegíveis do utilizador: as organizações CRM activas
  --    dele com a página Pessoas (configuração) e pessoas.view.
  IF NOT public.has_anew_permission(v_uid, 'pessoas.view') THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  v_keys := public.crm_scope_keys('pessoas.view');
  SELECT array_agg(DISTINCT c.organization_id) INTO v_orgs
  FROM public.negocio_workflow_config c
  WHERE c.organization_id IN (SELECT public.get_user_crm_org_ids(v_uid))
    AND EXISTS (SELECT 1 FROM unnest(v_keys) AS k(scope_key)
                WHERE starts_with(k.scope_key, c.organization_id::text || ':'));
  IF v_orgs IS NULL THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- 4. Permissão própria do Workflow de Pessoas, nessa organização.
  IF NOT public.has_anew_permission(v_uid, 'pessoas.config') THEN
    RAISE EXCEPTION 'Sem permissão para configurar o workflow de Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_keys := public.crm_scope_keys('pessoas.config');
  SELECT array_agg(o.id) INTO v_orgs
  FROM unnest(v_orgs) AS o(id)
  WHERE EXISTS (SELECT 1 FROM unnest(v_keys) AS k(scope_key)
                WHERE starts_with(k.scope_key, o.id::text || ':'));
  IF v_orgs IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para configurar o workflow de Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- O parâmetro só escolhe entre as elegíveis; nunca alarga a lista.
  IF p_organization_id IS NOT NULL THEN
    IF NOT (p_organization_id = ANY (v_orgs)) THEN
      RAISE EXCEPTION 'Sem permissão para configurar o workflow de Pessoas.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_org := p_organization_id;
  ELSIF cardinality(v_orgs) > 1 THEN
    RAISE EXCEPTION 'Pertence a mais do que uma organização com a página Pessoas: não se sabe qual configurar.'
      USING ERRCODE = 'NG026';
  ELSE
    v_org := v_orgs[1];
  END IF;

  -- 5. Em exclusivo por organização até ao fim da transacção.
  PERFORM pg_advisory_xact_lock(hashtextextended('neg_guardar_cadeia:' || v_org::text, 0));

  -- 6. Fases globais (as que o motor usa).
  SELECT (array_agg(s.id))[1], count(*) INTO v_fase_orc, v_n
  FROM public.quote_workflow_stages s
  WHERE s.organization_id IS NULL AND s.name = 'aceite';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A fase aceite dos orçamentos não é única.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT (array_agg(s.id))[1], count(*) INTO v_fase_pr, v_n
  FROM public.proposal_workflow_stages s
  WHERE s.organization_id IS NULL AND s.name::text = 'accepted';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A fase aceite das propostas não é única.' USING ERRCODE = 'no_data_found';
  END IF;

  -- 7. Antes: o valor EFECTIVO, como o motor execute-workflow o lê.
  --    Orçamentos: linhas activas da organização nessa fase (não há globais:
  --    organization_id é NOT NULL).
  v_orc_antes := EXISTS (SELECT 1 FROM public.quote_stage_actions a
                         WHERE a.organization_id = v_org AND a.stage_id = v_fase_orc
                           AND a.action_type = 'create_proposal' AND a.is_active IS TRUE);
  --    Propostas: com alguma linha da organização (qualquer fase), só essas;
  --    senão as globais.
  v_tem_org := EXISTS (SELECT 1 FROM public.proposal_stage_actions a WHERE a.organization_id = v_org);
  v_pr_antes := EXISTS (SELECT 1 FROM public.proposal_stage_actions a
                        WHERE a.organization_id IS NOT DISTINCT FROM CASE WHEN v_tem_org THEN v_org END
                          AND a.stage_id = v_fase_pr
                          AND a.action_type = 'create_contract' AND a.is_active IS TRUE);
  --    Contratos (só leitura): linhas activas da organização em signed ou
  --    assinado; sem nenhuma, as globais. Nada criado = nenhuma acção que crie
  --    um documento (pedido, orçamento, proposta, contrato).
  v_tem_org := EXISTS (SELECT 1 FROM public.contract_stage_actions a
                       WHERE a.organization_id = v_org AND a.stage_id IN ('signed', 'assinado')
                         AND a.is_active IS TRUE);
  v_cc_nada := NOT EXISTS (SELECT 1 FROM public.contract_stage_actions a
                           WHERE a.organization_id IS NOT DISTINCT FROM CASE WHEN v_tem_org THEN v_org END
                             AND a.stage_id IN ('signed', 'assinado') AND a.is_active IS TRUE
                             AND a.action_type IN ('create_deal', 'create_quote', 'create_proposal',
                                                   'create_contract'));

  -- 8. Escrita, só nas linhas da organização validada acima. Nunca DELETE.
  v_actor := public.fn_neg_actor();

  UPDATE public.quote_stage_actions a
  SET is_active = p_orcamento_cria_proposta, updated_at = now()
  WHERE a.organization_id = v_org AND a.stage_id = v_fase_orc
    AND a.action_type = 'create_proposal'
    AND a.is_active IS DISTINCT FROM p_orcamento_cria_proposta;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_mudou := v_mudou OR v_n > 0;
  IF NOT EXISTS (SELECT 1 FROM public.quote_stage_actions a
                 WHERE a.organization_id = v_org AND a.stage_id = v_fase_orc
                   AND a.action_type = 'create_proposal')
     AND v_orc_antes IS DISTINCT FROM p_orcamento_cria_proposta THEN
    INSERT INTO public.quote_stage_actions
      (organization_id, stage_id, action_type, action_config, is_active, execution_order, created_by)
    VALUES (v_org, v_fase_orc, 'create_proposal', '{}'::jsonb, p_orcamento_cria_proposta, 0, v_actor);
    v_mudou := true;
  END IF;

  UPDATE public.proposal_stage_actions a
  SET is_active = p_proposta_cria_contrato
  WHERE a.organization_id = v_org AND a.stage_id = v_fase_pr
    AND a.action_type = 'create_contract'
    AND a.is_active IS DISTINCT FROM p_proposta_cria_contrato;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_mudou := v_mudou OR v_n > 0;
  IF NOT EXISTS (SELECT 1 FROM public.proposal_stage_actions a
                 WHERE a.organization_id = v_org AND a.stage_id = v_fase_pr
                   AND a.action_type = 'create_contract')
     AND v_pr_antes IS DISTINCT FROM p_proposta_cria_contrato THEN
    INSERT INTO public.proposal_stage_actions
      (organization_id, stage_id, action_type, action_config, is_active, execution_order, created_by)
    VALUES (v_org, v_fase_pr, 'create_contract', '{}'::jsonb, p_proposta_cria_contrato, 0, v_actor);
    v_mudou := true;
  END IF;

  RETURN jsonb_build_object(
    'organizacao', v_org,
    'antes',  jsonb_build_object('orcamento_cria_proposta', v_orc_antes,
                                 'proposta_cria_contrato', v_pr_antes,
                                 'contrato_assinado_cria_nada', v_cc_nada),
    'depois', jsonb_build_object('orcamento_cria_proposta', p_orcamento_cria_proposta,
                                 'proposta_cria_contrato', p_proposta_cria_contrato,
                                 'contrato_assinado_cria_nada', v_cc_nada),
    'mudou',  v_mudou);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_cadeia(boolean, boolean, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_guardar_cadeia(boolean, boolean, uuid) TO authenticated;

COMMENT ON FUNCTION public.neg_guardar_cadeia(boolean, boolean, uuid) IS
  'Pessoas: grava a cadeia de documentos de uma organização elegível de quem chama (p_organization_id só escolhe entre as elegíveis; nulo = a única): orçamento aceite cria a proposta (quote_stage_actions, fase global aceite, create_proposal) e proposta aceite cria o contrato (proposal_stage_actions, fase global accepted, create_contract). UPSERT de is_active, nunca apaga; contract_stage_actions só é lida. NG008, NG009, NG026, 42501. 20261226210000.';

-- ============================================================
-- CONFERIR (um bloco DO: é a única forma de falhar a transacção com uma
-- mensagem; só lê o catálogo e a linha de configuração da nike)
-- ============================================================
DO $conferir$
DECLARE
  v_n   int;
  v_txt text;
BEGIN
  -- 1. A coluna nova: tipo, NOT NULL, omissão, CHECK; a linha da nike com a omissão.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                 JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                 WHERE a.attrelid = 'public.negocio_workflow_config'::regclass
                   AND a.attname::text = 'recusa_orcamento' AND a.attnotnull
                   AND pg_catalog.format_type(a.atttypid, a.atttypmod) = 'text'
                   AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) = '''perder_se_ultimo''::text')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                    WHERE c.conrelid = 'public.negocio_workflow_config'::regclass
                      AND c.conname::text = 'negocio_workflow_config_recusa_orcamento_check'
                      AND c.contype::text = 'c' AND c.convalidated) THEN
    RAISE EXCEPTION 'CONFERIR: a coluna recusa_orcamento não ficou como desenhada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.negocio_workflow_config c
             WHERE c.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
               AND c.recusa_orcamento IS DISTINCT FROM 'perder_se_ultimo') THEN
    RAISE EXCEPTION 'CONFERIR: a configuração da nike não ficou com a omissão';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
             WHERE a.attrelid = 'public.negocio_workflow_config'::regclass AND a.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'CONFERIR: apareceram direitos por coluna em negocio_workflow_config';
  END IF;

  -- 2. Os CHECK de origem: validados e com as três origens.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_constraint c
  WHERE c.convalidated AND c.contype::text = 'c'
    AND ((c.conrelid = 'public.negocios'::regclass AND c.conname::text = 'negocios_decisao_origem_check')
      OR (c.conrelid = 'public.negocio_eventos'::regclass AND c.conname::text = 'negocio_eventos_origem_check'))
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%''proposta''::text%'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%''contrato''::text%'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%''orcamento''::text%';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: % de 2 CHECK de origem com o orçamento', v_n;
  END IF;

  -- 3. fn_neg_decidir_negocio: esta versão, DEFINER, search_path, dono, privilégios.
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_neg_decidir_negocio(text,uuid,text,text,uuid,uuid)', 'd4aedc5c55644d350e6e3ffa57ad638b',
               '{postgres=X/postgres}'),
              ('public.fn_neg_fecho_orcamento_trg()', 'c05f70da89454f32840005769588b7c1', '{postgres=X/postgres}'),
              ('public.neg_guardar_cadeia(boolean,boolean,uuid)', 'd9501d479d3fe5751165076356fed08e',
               '{postgres=X/postgres,authenticated=X/postgres}')
            ) AS e(sig, h, acl)
            LEFT JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR NOT p.prosecdef
               OR p.provolatile::text <> 'v'
               OR pg_catalog.pg_get_userbyid(p.proowner)::text <> 'postgres'
               OR md5(replace(p.prosrc, chr(13), '')) IS DISTINCT FROM e.h
               OR p.proacl::text IS DISTINCT FROM e.acl
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM
                  CASE WHEN p.proname::text = 'fn_neg_fecho_orcamento_trg'
                       THEN 'search_path=public, pg_temp,lock_timeout=2s'
                       ELSE 'search_path=public, pg_temp' END);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (versão, atributos ou privilégios): %', v_txt;
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname::text IN ('fn_neg_decidir_negocio', 'neg_guardar_cadeia', 'fn_neg_fecho_orcamento_trg')) <> 3 THEN
    RAISE EXCEPTION 'CONFERIR: há mais do que uma versão de uma das funções';
  END IF;

  -- 4. O gatilho: de restrição, adiado, activo, só UPDATE OF estado, com WHEN.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.quotes'::regclass AND NOT t.tgisinternal
    AND t.tgname::text = 'trg_negocios_fecho_orcamento'
    AND p.proname::text = 'fn_neg_fecho_orcamento_trg'
    AND t.tgconstraint <> 0 AND t.tgdeferrable AND t.tginitdeferred
    AND t.tgenabled::text = 'O' AND t.tgqual IS NOT NULL
    AND pg_catalog.pg_get_triggerdef(t.oid) LIKE '%AFTER UPDATE OF estado ON public.quotes%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR: o gatilho trg_negocios_fecho_orcamento não ficou como desenhado';
  END IF;

  -- 5. Os outros gatilhos de quotes ficaram intactos.
  IF (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                            ORDER BY t.tgname::text))
      FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.quotes'::regclass AND NOT t.tgisinternal
        AND t.tgname::text <> 'trg_negocios_fecho_orcamento')
     IS DISTINCT FROM 'e022f47307c32864e48b8de57c55ae6a' THEN
    RAISE EXCEPTION 'CONFERIR: os outros gatilhos de quotes mudaram';
  END IF;
END
$conferir$;

COMMIT;
