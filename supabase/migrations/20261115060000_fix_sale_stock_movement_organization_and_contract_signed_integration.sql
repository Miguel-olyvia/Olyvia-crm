-- ============================================================
-- Fase 5.0 do plano de inventário (plano-fornecedores-multi-stock-execucao.md,
-- secção "Fase 5.0 — Venda a stock fixo"): correção de design encontrada
-- ANTES de aplicar a Fase 5.0B ao remoto, seguida da própria Fase 5.0B já
-- corrigida desde a origem.
--
-- Nem 20261115040000 (Fase 5.0A, já aplicada ao remoto) nem a versão anterior
-- desta integração (rascunho local 20261115050000, nunca aplicado — ver nota
-- abaixo) alguma vez chegaram a produção com o bug descrito a seguir; esta
-- migration substitui inteiramente esse rascunho, que é removido do diretório
-- (nunca esteve no git, nunca foi aplicado a nenhum ambiente).
--
-- Bug corrigido: organization_id do PRODUTO em vez de organization_id de QUEM
-- VENDE
-- ------------------------------------------------------------------------
-- rpc_register_sale_stock_movement (20261115040000) resolvia a organização
-- do movimento assim:
--   SELECT organization_id INTO v_org FROM public.products WHERE id = p_product_id;
--   IF v_org IS NULL THEN RAISE EXCEPTION 'Produto não encontrado ou sem
--     organização associada' ...
-- Isto está errado por dois motivos que colidem no mesmo ponto:
--   1. products.organization_id pode ser NULL — confirmado ao vivo: o produto
--      4e58e00a-c1f6-4374-a685-6d7634fc0cf4 (sku '1457') tem organization_id
--      NULL hoje em produção. Um produto partilhado entre organizações (via
--      product_organizations, já suportado pelo resto do projeto) fica
--      indistinguível de "produto não encontrado" — a função rejeita a venda
--      com a mensagem errada.
--   2. Mesmo quando products.organization_id NÃO é NULL, a organização
--      correta para um movimento de venda é sempre a de QUEM ESTÁ A VENDER —
--      a organização do Contrato (ou, na Fase 5.0C, da Proposta) — nunca a
--      organização "dona" do produto. Um produto partilhado vendido por uma
--      organização B que não é a sua organização primária ficaria com o
--      movimento gravado (e o armazém validado) contra a organização errada.
-- Correção: rpc_register_sale_stock_movement passa a receber p_organization_id
-- como parâmetro explícito (acrescentado no FIM da lista de argumentos, com
-- DEFAULT NULL, para que CREATE OR REPLACE FUNCTION substitua verdadeiramente
-- a função já aplicada em 20261115040000 — mesmo OID, mesmas GRANTs — em vez
-- de criar uma sobrecarga nova; mesma técnica já usada por
-- rpc_create_product/rpc_update_product em 20260817010000 e documentada no
-- cabeçalho de 20261115040000). O armazém passa a ser validado contra
-- p_organization_id (não contra a organização do produto), e p_organization_id
-- é o valor gravado em stock_movements.organization_id. O único chamador
-- (fn_contract_stock_deduction, abaixo) passa sempre NEW.organization_id — a
-- organização do contrato que está a vender.
-- rpc_register_sale_stock_movement continua sem nenhum chamador em produção
-- (0 movimentos 'venda' existem na BD), por isso esta é uma alteração de
-- assinatura segura.
--
-- Nota técnica corrigida durante o desenvolvimento desta migration: adicionar
-- um parâmetro no fim da lista de argumentos (mesmo com DEFAULT) e usar
-- CREATE OR REPLACE FUNCTION NÃO substitui a função existente — cria uma
-- SEGUNDA função (overload), porque a identidade de uma função em Postgres é
-- (nome, lista ordenada de tipos de argumento), e essa lista mudou. Isto foi
-- confirmado ao vivo, e é já um bug pré-existente em produção não introduzido
-- por esta migration: rpc_create_product e rpc_update_product
-- (20260817010000, depois 20261115040000) têm hoje CADA UM 2 overloads no
-- remoto (com e sem p_manages_stock) — a versão antiga nunca foi removida, e
-- mantém as GRANTs da sua migration original (não cobertas pelos REVOKE/GRANT
-- reemitidos, que especificam a lista de argumentos nova). Fora do âmbito
-- desta migration corrigir esses dois RPCs; aqui, para
-- rpc_register_sale_stock_movement, evita-se repetir o problema com um DROP
-- FUNCTION explícito da assinatura antiga (8 argumentos) antes do CREATE da
-- nova (9 argumentos) — seguro porque, como já documentado, este RPC não tem
-- nenhum chamador real hoje (0 movimentos 'venda' na BD).
--
-- Fase 5.0B — integração ao ASSINAR CONTRATO
-- ------------------------------------------------------------------------
-- Liga o momento "Contrato assinado" (o valor por omissão de
-- organization_inventory_settings.stock_deduction_trigger) ao motor de venda.
-- Ainda por fazer depois desta migration:
--   · Fase 5.0C — mesmo mecanismo, disparado por "Proposta aceite"
--     (stock_deduction_trigger='proposal_accepted'), a partir de
--     accept_proposal_atomic / proposal_quote_selections. Esta migration NÃO
--     faz nada quando uma organização escolheu esse modo — ver o guard
--     explícito em fn_contract_stock_deduction() abaixo.
--   · Fase 5.0D — tornar visíveis ao utilizador os avisos que esta migration
--     já regista em workflow_execution_log (was_insufficient, sem armazém
--     resolvido, linha saltada por quantidade fracionária) — hoje ficam só
--     rastreáveis na BD, sem toast/notificação nenhuma.
--   · Fase 5.0E — UI: toggle products.manages_stock em Products.tsx, ecrã de
--     definições da organização para organization_inventory_settings.
--
-- Porque são 3 triggers independentes (uma para o "estorno", duas para a
-- dedução) em vez de uma função só a fazer tudo:
--   1. fn_contract_signed_convert_to_client() (20261112340000 e seguintes) já
--      existe e já é best-effort (cria/ativa anew_clients, fecha leads). Uma
--      falha na lógica de STOCK nunca deve impedir a conversão do cliente, e
--      vice-versa — são responsabilidades de negócio completamente distintas
--      (CRM vs. Inventário) que só coincidem por dispararem no mesmo evento
--      (UPDATE OF status). Com 3 triggers independentes, o Postgres corre
--      cada uma no seu próprio contexto de EXCEPTION — a pior falha possível
--      numa delas é essa trigger não fazer nada, nunca arrasta as outras.
--   2. fn_contract_stock_deduction() (dedução ao assinar) e
--      fn_contract_cancelled_stock_reversal() (estorno ao cancelar/rejeitar)
--      são, elas próprias, duas responsabilidades distintas (criar vs.
--      reverter movimento) sobre transições de status diferentes — mantidas
--      separadas pelo mesmo motivo, e porque assim cada uma tem a sua guarda
--      de transição isolada.
--
-- fn_contract_cancelled_stock_reversal() reage a status IN ('cancelled',
-- 'rejected'), não só 'cancelled'
-- ------------------------------------------------------------------------
-- O caminho normal de anulação é status='cancelled', via
-- cancel_and_replace_contract (só staff). Mas client-portal-action (ação
-- reject_contract, disponível ao cliente no portal) grava status='rejected' e
-- NÃO valida no servidor que o contrato ainda não foi assinado — a UI do
-- portal só esconde o botão "Rejeitar" quando status IN ('draft','pending',
-- 'sent'), o que é apenas uma proteção de cliente, não uma validação de
-- servidor. Este é um gap pré-existente do módulo de Contratos, fora do
-- âmbito para corrigir aqui, mas significa que, em teoria, um contrato já
-- assinado (com movimento de venda já gerado) pode acabar em
-- status='rejected' em vez de 'cancelled'. Por defesa em profundidade contra
-- esse gap, a trigger de estorno também reage a 'rejected' — a lógica de
-- reversão em si não muda, só a condição de entrada.
-- Deliberadamente NÃO acrescentado: 'expired' nem 'renewed' — são estados de
-- fim de vida natural do contrato (o contrato cumpriu o prazo ou foi
-- renovado); nesses casos a mercadoria já foi legitimamente entregue e a
-- venda não deve ser revertida.
--
-- Prerequisitos: 20261113190000 (fn_contract_signed_convert_to_client, padrão
-- replicado aqui: alias de "signed", OLD IS DISTINCT FROM NEW, BEGIN/EXCEPTION
-- best-effort com log em workflow_execution_log), 20261115040000 (fundação de
-- dados desta fase: products.manages_stock, organization_inventory_settings,
-- stock_movements.sale_source_type/sale_source_id, rpc_register_sale_stock_
-- movement, movement_type 'venda'/'estorno_venda').
-- ============================================================


-- ============================================================
-- 0. Limpeza da Fase 5.0A — remove os overloads antigos (sem
--    p_manages_stock) de rpc_create_product/rpc_update_product que ficaram
--    por engano em 20261115040000, pela mesma razão técnica documentada no
--    cabeçalho: CREATE OR REPLACE com um parâmetro novo no fim NÃO substitui
--    a função, cria uma segunda. Confirmado ao vivo (pg_proc): as duas
--    versões de cada RPC estão hoje na BD. Seguro remover a antiga — a que
--    fica tem p_manages_stock DEFAULT false, por isso os chamadores atuais
--    (frontend, que não passam esse argumento) continuam a funcionar
--    exatamente como antes, sem qualquer alteração de comportamento.
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_create_product(
  text, text, text, boolean, boolean, uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid[], jsonb, jsonb
);

DROP FUNCTION IF EXISTS public.rpc_update_product(
  uuid, uuid, text, text, text, boolean, boolean, uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid[], jsonb, uuid[], jsonb
);


-- ============================================================
-- 1. rpc_register_sale_stock_movement — DROP da assinatura antiga (8
--    argumentos, 20261115040000) seguido de CREATE da nova (9 argumentos,
--    p_organization_id acrescentado no fim). Ver nota técnica no cabeçalho
--    desta migration: um simples CREATE OR REPLACE com argumento novo criaria
--    uma segunda função (overload) em vez de substituir — o DROP evita isso.
--    Resto do comportamento inalterado: idempotência por (sale_source_type,
--    sale_source_id, reference_id=quote_line_id), 'venda' nunca rejeitada por
--    saldo insuficiente (fn_stock_movements_apply, inalterado nesta
--    migration), resolução de created_by com fallback para quotes.created_by.
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_register_sale_stock_movement(
  uuid, uuid, integer, uuid, text, uuid, text, numeric
);

CREATE FUNCTION public.rpc_register_sale_stock_movement(
    p_product_id       uuid,
    p_warehouse_id     uuid,
    p_quantity         integer,
    p_quote_line_id    uuid,
    p_sale_source_type text,
    p_sale_source_id   uuid,
    p_document_number  text,
    p_unit_cost_at_time numeric DEFAULT NULL,
    p_organization_id  uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_movement_id uuid;
  v_balance     integer;
BEGIN
  IF p_sale_source_type NOT IN ('contract', 'proposal') THEN
    RAISE EXCEPTION 'sale_source_type inválido: %', p_sale_source_type USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_quote_line_id IS NULL OR p_sale_source_id IS NULL THEN
    RAISE EXCEPTION 'quote_line_id e sale_source_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  IF nullif(trim(p_document_number), '') IS NULL THEN
    RAISE EXCEPTION 'document_number é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261115060000): a organização não é deduzida do produto — é
  -- sempre a de quem está a vender (Contrato/Proposta), fornecida pelo
  -- chamador. products.organization_id pode ser NULL (produto partilhado via
  -- product_organizations) sem que isso seja um erro.
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Idempotência: uma linha de orçamento só gera 1 movimento de venda por
  --    origem — uma segunda chamada (ex. trigger disparada de novo por um
  --    UPDATE que não devia repetir o efeito) é ignorada, nunca duplica.
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE sale_source_type = p_sale_source_type
      AND sale_source_id = p_sale_source_id
      AND reference_id = p_quote_line_id
      AND movement_type = 'venda'
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_registered');
  END IF;

  -- NOVO (20261115060000): validação de existência do produto isolada da
  -- resolução de organização (que já não depende do produto).
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- NOVO (20261115060000): armazém validado contra p_organization_id (quem
  -- vende), não contra a organização do produto.
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = p_organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- ── created_by: este RPC não é chamado pelo frontend (ver GRANT abaixo),
  --    só por triggers internas da Fase 5.0B/5.0C que podem correr sem
  --    sessão de staff presente (ex. assinatura via portal do cliente).
  --    current_business_user_id() cobre o caso "staff assina no admin"; se
  --    NULL, cai para o criador do próprio orçamento (mesmo padrão de
  --    fallback já usado por client-portal-action/index.ts para ações sem
  --    staff presente). quotes.created_by é NOT NULL, por isso este
  --    fallback está sempre disponível quando p_quote_line_id é válido.
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    SELECT q.created_by INTO v_actor
    FROM public.quote_lines ql
    JOIN public.quotes q ON q.id = ql.quote_id
    WHERE ql.id = p_quote_line_id;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o autor do movimento de venda' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, unit_cost_at_time,
    sale_source_type, sale_source_id, reference_id, notes, created_by
  ) VALUES (
    p_organization_id, p_product_id, p_warehouse_id, 'venda', p_quantity,
    p_document_number, 'venda', p_unit_cost_at_time,
    p_sale_source_type, p_sale_source_id, p_quote_line_id,
    format('Venda registada a partir de %s %s (linha de orçamento %s)',
           p_sale_source_type, p_sale_source_id, p_quote_line_id),
    v_actor
  )
  RETURNING id, balance_after INTO v_movement_id, v_balance;

  RETURN jsonb_build_object(
    'skipped',         false,
    'movement_id',     v_movement_id,
    'balance_after',   v_balance,
    'was_insufficient', v_balance < 0
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_register_sale_stock_movement IS
  'Fase 5.0A/5.0B: motor do movimento de venda (movement_type=''venda''), nunca '
  'rejeitado por saldo insuficiente (fn_stock_movements_apply trata a exceção). '
  'Idempotente por (sale_source_type, sale_source_id, reference_id=quote_line_id). '
  'p_organization_id (20261115060000) é sempre a organização de quem vende '
  '(Contrato/Proposta), nunca deduzida de products.organization_id — corrige o bug '
  'em que um produto partilhado (products.organization_id NULL, via '
  'product_organizations) era tratado como "não encontrado". NÃO É CHAMÁVEL PELO '
  'FRONTEND nesta fase — só GRANT a service_role. Invocado por '
  'fn_contract_stock_deduction (Fase 5.0B) e, futuramente, pela Fase 5.0C '
  '(Proposta aceite).';

REVOKE ALL ON FUNCTION public.rpc_register_sale_stock_movement(
  uuid, uuid, integer, uuid, text, uuid, text, numeric, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_sale_stock_movement(
  uuid, uuid, integer, uuid, text, uuid, text, numeric, uuid
) TO service_role;


-- ============================================================
-- 2. fn_contract_stock_deduction() / trg_contract_stock_deduction
--    AFTER UPDATE OF status ON client_contracts — dedução de stock ao
--    assinar o contrato, quando a organização usa o modo 'contract_signed'
--    (o valor por omissão).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_contract_stock_deduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
  v_trigger_mode         text;
  v_default_warehouse_id uuid;
  v_resolved_warehouse   uuid;
  v_active_warehouse_cnt integer;
  v_line                 record;
  v_qty_int              integer;
  v_result               jsonb;
  v_lines_processed      integer := 0;
  v_lines_skipped        integer := 0;
BEGIN
  -- Only ever react to a transition into the signed stage — exact same gate
  -- as fn_contract_signed_convert_to_client() (20261113190000), replicated
  -- here on purpose (not a new style).
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_signed_aliases)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed', no default warehouse). ───────
    SELECT stock_deduction_trigger, default_warehouse_id
    INTO v_trigger_mode, v_default_warehouse_id
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
      v_default_warehouse_id := NULL;
    END IF;

    -- ── 2. This organization chose "deduct on proposal acceptance" instead
    --      — that is Fase 5.0C, not implemented yet. Do nothing here. ──────
    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN NEW;
    END IF;

    -- ── 3. No quote attached to this contract — nothing to deduct. ────────
    IF NEW.quote_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- ── 4. Resolve the warehouse: settings default, else exactly-one-active
    --      -warehouse fallback, else no movement at all (never guess). ─────
    v_resolved_warehouse := v_default_warehouse_id;

    IF v_resolved_warehouse IS NULL THEN
      SELECT count(*) INTO v_active_warehouse_cnt
      FROM public.warehouses
      WHERE organization_id = NEW.organization_id
        AND deleted_at IS NULL;

      IF v_active_warehouse_cnt = 1 THEN
        SELECT id INTO v_resolved_warehouse
        FROM public.warehouses
        WHERE organization_id = NEW.organization_id
          AND deleted_at IS NULL;
      ELSE
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'stock_movement', NULL,
          'trigger:contract_stock_deduction_no_warehouse', 'warning',
          jsonb_build_object(
            'reason', 'No default_warehouse_id configured and organization does not have exactly one active warehouse',
            'active_warehouse_count', v_active_warehouse_cnt
          )
        );
        RETURN NEW;
      END IF;
    END IF;

    -- ── 5. One sale stock movement per quote line whose product has
    --      manages_stock=true. Bundle-expanded lines (bundle_id set) are NOT
    --      excluded — they are already real product lines (plan decision 4:
    --      BundleSelectionTab already expands a bundle into individual
    --      quote_lines at quote-creation time). A line with a fractional
    --      quantity is skipped with a warning log — it must never abort the
    --      remaining lines of the same contract. Likewise, any other
    --      unexpected failure on a single line (caught per-line below) never
    --      stops the loop. ─────────────────────────────────────────────────
    FOR v_line IN
      SELECT ql.id, ql.product_id, ql.qt
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = NEW.quote_id
        AND ql.product_id IS NOT NULL
        AND p.manages_stock = true
    LOOP
      IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      IF v_line.qt <> floor(v_line.qt) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      v_qty_int := v_line.qt::integer;

      -- Per-line guard: a failure registering one line's movement (e.g. an
      -- unexpected RPC-level rejection) must never abort the remaining lines
      -- of the same contract.
      BEGIN
        v_result := public.rpc_register_sale_stock_movement(
          p_product_id        => v_line.product_id,
          p_warehouse_id       => v_resolved_warehouse,
          p_quantity           => v_qty_int,
          p_quote_line_id      => v_line.id,
          p_sale_source_type   => 'contract',
          p_sale_source_id     => NEW.id,
          p_document_number    => NEW.contract_number,
          p_unit_cost_at_time  => NULL,
          -- NOVO (20261115060000): organização de quem vende (o contrato),
          -- nunca deduzida do produto.
          p_organization_id    => NEW.organization_id
        );

        v_lines_processed := v_lines_processed + 1;

        -- Traceable for Fase 5.0D (user-visible alerts, not implemented
        -- here) — nunca bloqueia nem impede o resto do fluxo.
        IF COALESCE((v_result ->> 'was_insufficient')::boolean, false) THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'contract', NEW.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
            'trigger:contract_stock_deduction_insufficient', 'warning',
            jsonb_build_object('quote_line_id', v_line.id, 'product_id', v_line.product_id, 'result', v_result)
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_error', 'error', SQLERRM,
          jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', NEW.id, 'stock_movement', NULL,
      'trigger:contract_stock_deduction', 'success',
      jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_resolved_warehouse)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'stock_movement', NULL,
        'trigger:contract_stock_deduction', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      -- Even the error-log insert must never propagate.
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_contract_stock_deduction() IS
  'Fase 5.0B: gera movimentos de stock (movement_type=venda) para as linhas de '
  'quote_lines do orçamento ligado a um contrato, na transição para assinado, '
  'quando organization_inventory_settings.stock_deduction_trigger=contract_signed '
  '(o valor por omissão) e o produto de cada linha tem manages_stock=true. Passa '
  'NEW.organization_id (a organização do contrato, quem vende) a '
  'rpc_register_sale_stock_movement — nunca deduzida do produto (20261115060000). '
  'Best-effort (BEGIN/EXCEPTION), nunca bloqueia o UPDATE de client_contracts; '
  'toda a atividade (sucesso, avisos de armazém em falta, linha saltada por '
  'quantidade fracionária ou inválida, venda com stock insuficiente) fica '
  'registada em workflow_execution_log. Independente de '
  'fn_contract_signed_convert_to_client() (CRM) e de '
  'fn_contract_cancelled_stock_reversal() (estorno) — ver cabeçalho da migration '
  '20261115060000 para o porquê de serem 3 triggers separadas.';

DROP TRIGGER IF EXISTS trg_contract_stock_deduction ON public.client_contracts;

CREATE TRIGGER trg_contract_stock_deduction
AFTER UPDATE OF status ON public.client_contracts
FOR EACH ROW
EXECUTE FUNCTION public.fn_contract_stock_deduction();


-- ============================================================
-- 3. fn_contract_cancelled_stock_reversal() /
--    trg_contract_cancelled_stock_reversal — AFTER UPDATE OF status ON
--    client_contracts. Reverte (estorno_venda) cada movimento 'venda' ainda
--    não revertido, gerado a partir deste contrato, quando o contrato passa a
--    'cancelled' OU 'rejected' (ver cabeçalho desta migration: 'rejected' é
--    defesa em profundidade contra o gap de client-portal-action, não o
--    caminho normal). 'expired'/'renewed' NÃO disparam esta trigger — a
--    mercadoria já foi legitimamente entregue nesses casos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_contract_cancelled_stock_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reversal_aliases text[] := ARRAY['cancelled', 'rejected'];
  v_staff_actor    uuid;
  v_actor          uuid;
  v_mov            record;
  v_reversed_count integer := 0;
BEGIN
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_reversal_aliases)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    v_staff_actor := public.current_business_user_id();

    FOR v_mov IN
      SELECT sm.*
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = NEW.id
        AND sm.movement_type = 'venda'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = sm.id
        )
    LOOP
      -- Per-movement guard: a failure reversing one movement must never
      -- abort the reversal of the remaining movements of the same contract.
      BEGIN
        -- v_mov.created_by is guaranteed to satisfy the FK to anew_users
        -- (it already exists on the original movement row) — safe final
        -- fallback when there is no staff session present (e.g. cancellation
        -- triggered from a service_role context without auth.uid()).
        v_actor := COALESCE(v_staff_actor, v_mov.created_by);

        INSERT INTO public.stock_movements (
          organization_id, product_id, warehouse_id, movement_type, quantity,
          document_number, document_type, reversal_of_movement_id,
          reference_id, sale_source_type, sale_source_id, notes, created_by
        ) VALUES (
          v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'estorno_venda', v_mov.quantity,
          v_mov.document_number, 'venda', v_mov.id,
          v_mov.reference_id, 'contract', NEW.id,
          format('Estorno automático da venda %s (contrato %s, status %s)', v_mov.id, NEW.contract_number, NEW.status),
          v_actor
        );

        v_reversed_count := v_reversed_count + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', NEW.id, 'stock_movement', v_mov.id,
          'trigger:contract_stock_reversal_line_error', 'error', SQLERRM,
          jsonb_build_object('movement_id', v_mov.id, 'product_id', v_mov.product_id)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', NEW.id, 'stock_movement', NULL,
      'trigger:contract_stock_reversal', 'success',
      jsonb_build_object('reversed_count', v_reversed_count, 'status', NEW.status)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'stock_movement', NULL,
        'trigger:contract_stock_reversal', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_contract_cancelled_stock_reversal() IS
  'Fase 5.0B: quando um contrato passa a cancelled OU rejected, gera um '
  'movimento estorno_venda (mesma quantidade, reversal_of_movement_id apontado '
  'ao movimento original) para cada stock_movements venda desse contrato ainda '
  'sem reversão. ''rejected'' incluído por defesa em profundidade: '
  'client-portal-action (reject_contract) não valida no servidor que o contrato '
  'ainda não foi assinado, então um contrato assinado pode, em teoria, acabar em '
  'rejected em vez de cancelled — ver cabeçalho da migration 20261115060000. '
  '''expired''/''renewed'' NÃO disparam esta trigger (mercadoria já entregue '
  'legitimamente). Nunca edita o movimento original — append-only, como o resto '
  'do ledger. Best-effort (BEGIN/EXCEPTION), nunca bloqueia o UPDATE de '
  'client_contracts; falhas por movimento ficam em workflow_execution_log sem '
  'abortar a reversão dos restantes movimentos do mesmo contrato.';

DROP TRIGGER IF EXISTS trg_contract_cancelled_stock_reversal ON public.client_contracts;

CREATE TRIGGER trg_contract_cancelled_stock_reversal
AFTER UPDATE OF status ON public.client_contracts
FOR EACH ROW
EXECUTE FUNCTION public.fn_contract_cancelled_stock_reversal();


-- ============================================================
-- Verification notes (para revisão humana / testes em transação com
-- ROLLBACK — não executadas nesta migration; ver relatório do agente para os
-- resultados reais)
-- ============================================================
--
-- 1. Organização sem organization_inventory_settings, produto manages_stock=
--    true numa quote ligada a um contrato: assinar o contrato (UPDATE
--    client_contracts SET status='signed') gera stock_movements
--    movement_type=venda, stocks.quantity desce, balance_after correto.
-- 2. Mesmo cenário com manages_stock=false: nenhum movimento gerado.
-- 3. organization_inventory_settings.stock_deduction_trigger='proposal_
--    accepted': assinar contrato não gera movimento (fica para a Fase 5.0C).
-- 4. Assinar o mesmo contrato uma 2ª vez (re-UPDATE para o mesmo status, ou
--    para outro campo que não status): não duplica o movimento.
-- 5. Produto manages_stock=true sem stock (0 ou inexistente): o movimento é
--    gerado na mesma, saldo fica negativo, o UPDATE a client_contracts nunca
--    falha.
-- 6. Cancelar um contrato assinado que gerou movimento: gera estorno_venda
--    com a mesma quantidade, saldo volta a subir.
-- 7. fn_contract_signed_convert_to_client() continua a funcionar em paralelo
--    (cliente criado/ativado) — as 3 triggers não interferem entre si.
-- 8. Organização com 2+ armazéns ativos e sem default configurado: nenhum
--    movimento gerado, só o aviso em workflow_execution_log.
-- 9. Quantidade fracionária numa quote_line: linha saltada com aviso em
--    workflow_execution_log, sem abortar as restantes linhas do contrato.
-- 10. Produto com products.organization_id = NULL associado a uma quote de um
--     contrato de uma organização real: FUNCIONA corretamente (usa a
--     organização do contrato via p_organization_id, não falha por o produto
--     não ter organização própria) — este é o bug corrigido nesta migration.
-- 11. Contrato assinado (com movimento venda já gerado) que transita para
--     status='rejected' (simulando o gap de client-portal-action): também
--     gera estorno_venda corretamente, igual ao cenário 6 (cancelled).
