-- ============================================================
-- 20261215100000_pos_contrato_encomendas
-- ============================================================
-- Pós-contrato, Frente A — Encomendas.
--   Contrato assinado → ENCOMENDA CLIENTE (rascunho → validada)
--                     → NOTA DE ENCOMENDA A FORNECEDOR (proposta → aprovada)
--                     → purchase_orders (status 'pending', source_type 'contract')
--
-- Especificação: docs/melhorias-v2-2026-10-13/pos-contrato-especificacao.md
-- (os nomes de tabelas, estados e RPCs são fixos: a Frente B — obra e
-- arranque — lê-os em rpc_ops_obra_arranque).
--
-- O que esta migração cria:
--   1. ec_pode()                              — quem pode o quê
--   2. obra_encomenda_cliente (+ _linha)      — a Encomenda Cliente guardada
--   3. nota_encomenda_fornecedor (+ _linha)   — uma nota por fornecedor
--   4. RLS: leitura por organização + permissão; escrita só por RPC
--   5. Funções internas: orçamentos do contrato, resolução de fornecedor,
--      estado do fornecedor, avisos no sino
--   6. RPCs rpc_ec_* e rpc_nota_*
--   7. Relatório "Dados em falta" e "Ligar marca → fornecedor"
--   8. Alerta de encomendas a fornecedor paradas
--   9. Permissões client_orders.validate e purchase_orders.approve
--      (provisório: a quem tem roles.edit)
--
-- Regras de desenho:
--   · Só ACRESCENTA. Não altera fn_contract_supplier_request,
--     fn_contract_stock_deduction, fn_client_order_line_reservations nem
--     nenhum rpc_client_order_*: lê-as/chama-as. O gatilho automático da
--     assinatura continua a criar encomendas; a nota desconta o que já está
--     encomendado para o contrato (qtd_em_encomenda), por isso não duplica.
--   · Fora das tabelas novas só escreve em: purchase_orders e
--     purchase_order_items (ao APROVAR uma nota, ação explícita),
--     item_suppliers (em "Ligar marca → fornecedor", ação explícita) e
--     notifications (avisos no sino).
--   · Tabelas de Operações (ops_*) e da área de Custos (cost_equipment,
--     service_recipe_equipment) são opcionais: só se leem se existirem
--     (to_regclass). Sem elas não há linhas de equipamento / mão de obra.
--   · Idempotente: corre duas vezes sem erro e sem duplicar nada
--     (tools/validar-pos-contrato-encomendas.mjs, PGlite).
--
-- Pré-requisitos: baseline do CRM (client_contracts, quotes, quote_lines,
-- products, item_suppliers, suppliers, brands, stocks, warehouses,
-- stock_movements, purchase_orders, purchase_order_items, service_materials,
-- notifications, anew_*). Recomendado: 20261214110000_area_custos.sql antes
-- (equipamentos). Não depende do SQL de Operações.
-- ============================================================


-- ============================================================
-- 1. Quem pode o quê
-- ============================================================
-- Mesmo critério de fin_pode (20261214100000): a permissão do CRM é GLOBAL
-- (has_anew_permission), por isso a organização tem de ser visível a quem
-- chama. Basta UMA das permissões da lista. Admin de sistema passa sempre.
CREATE OR REPLACE FUNCTION public.ec_pode(p_org uuid, p_perms text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_org IS NOT NULL AND (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      p_org IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND EXISTS (SELECT 1 FROM unnest(p_perms) AS x(perm)
                   WHERE public.has_anew_permission((SELECT auth.uid()), x.perm))
    )
  )
$$;

REVOKE ALL ON FUNCTION public.ec_pode(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ec_pode(uuid, text[]) TO authenticated, service_role;

-- As listas de permissões, num só sítio.
CREATE OR REPLACE FUNCTION public.ec_perms(p_acao text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE p_acao
    -- ver a Encomenda Cliente e as notas
    WHEN 'ver' THEN ARRAY['client_orders.view', 'client_orders.validate', 'client_orders.edit',
                          'purchase_orders.view', 'purchase_orders.approve', 'purchase_orders.create',
                          'operations.orders.create', 'operations.orders.edit', 'operations.orders.view']
    -- gerar e mexer nas linhas (em rascunho)
    WHEN 'editar' THEN ARRAY['client_orders.validate', 'client_orders.edit',
                             'operations.orders.create', 'operations.orders.edit']
    WHEN 'validar' THEN ARRAY['client_orders.validate']
    WHEN 'aprovar' THEN ARRAY['purchase_orders.approve']
    WHEN 'mudar_fornecedor' THEN ARRAY['purchase_orders.approve', 'client_orders.validate',
                                       'purchase_orders.create', 'purchase_orders.edit']
    WHEN 'dados_ver' THEN ARRAY['products.view', 'products.edit', 'products.manage',
                                'client_orders.validate', 'purchase_orders.approve']
    WHEN 'dados_ligar' THEN ARRAY['products.edit', 'products.manage', 'purchase_orders.approve']
    ELSE ARRAY[]::text[]
  END
$$;

GRANT EXECUTE ON FUNCTION public.ec_perms(text) TO authenticated, service_role;


-- ============================================================
-- 2. A Encomenda Cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS public.obra_encomenda_cliente (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  contract_id        uuid NOT NULL REFERENCES public.client_contracts(id) ON DELETE CASCADE,
  obra_id            uuid,                 -- → ops_obra.id (sem FK: o SQL de Operações é opcional)
  estado             text NOT NULL DEFAULT 'rascunho'
                       CHECK (estado IN ('rascunho', 'validada', 'anulada')),
  fornecedor_estado  text NOT NULL DEFAULT 'por_gerar'
                       CHECK (fornecedor_estado IN ('por_gerar', 'nao_necessaria', 'por_aprovar', 'aprovada', 'parcial')),
  validada_por       uuid,                 -- → anew_users.id
  validada_em        timestamptz,
  versao             integer NOT NULL DEFAULT 0,   -- +1 a cada validação
  gerada_em          timestamptz,
  reaberta_por       uuid,                 -- → anew_users.id
  reaberta_em        timestamptz,
  reaberta_motivo    text,
  criada_em          timestamptz NOT NULL DEFAULT now(),
  atualizada_em      timestamptz NOT NULL DEFAULT now(),
  CHECK (estado <> 'validada' OR validada_em IS NOT NULL)
);

-- Uma Encomenda Cliente viva por contrato.
CREATE UNIQUE INDEX IF NOT EXISTS obra_encomenda_cliente_contrato_uidx
  ON public.obra_encomenda_cliente (contract_id) WHERE estado <> 'anulada';
CREATE INDEX IF NOT EXISTS obra_encomenda_cliente_org_idx
  ON public.obra_encomenda_cliente (organization_id, estado);
CREATE INDEX IF NOT EXISTS obra_encomenda_cliente_obra_idx
  ON public.obra_encomenda_cliente (obra_id) WHERE obra_id IS NOT NULL;

COMMENT ON TABLE public.obra_encomenda_cliente IS
  'Pós-contrato: a Encomenda Cliente de um contrato assinado — tudo o que a obra precisa (produtos, consumíveis, '
  'equipamentos, mão de obra), mesmo o que já há em stock. rascunho → validada (client_orders.validate). '
  'Escrita só por rpc_ec_*.';
COMMENT ON COLUMN public.obra_encomenda_cliente.fornecedor_estado IS
  'Estado da encomenda a fornecedor: por_gerar (ainda não validada), nao_necessaria (nada em falta), '
  'por_aprovar (notas em proposta), parcial (algumas notas aprovadas), aprovada (todas aprovadas).';

CREATE TABLE IF NOT EXISTS public.obra_encomenda_cliente_linha (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  encomenda_id          uuid NOT NULL REFERENCES public.obra_encomenda_cliente(id) ON DELETE CASCADE,
  tipo                  text NOT NULL CHECK (tipo IN ('produto', 'consumivel', 'equipamento', 'mao_obra')),
  -- Ligações ao CRM / Custos / Operações: SEM FK, de propósito (o CRM apaga a sério).
  product_id            uuid,              -- → products.id
  service_id            uuid,              -- → services.id (serviço de onde vem o consumível/equipamento)
  equipamento_id        uuid,              -- → cost_equipment.id
  skill_id              uuid,              -- → ops_skill.id
  descricao             text NOT NULL,
  unidade               text,
  qtd_necessaria        numeric(14,3) NOT NULL DEFAULT 0 CHECK (qtd_necessaria >= 0),
  qtd_stock             numeric(14,3) NOT NULL DEFAULT 0 CHECK (qtd_stock >= 0),          -- servido + reservado
  qtd_reservada         numeric(14,3) NOT NULL DEFAULT 0 CHECK (qtd_reservada >= 0),      -- parte de qtd_stock que é reserva de stock livre
  qtd_em_encomenda      numeric(14,3) NOT NULL DEFAULT 0 CHECK (qtd_em_encomenda >= 0),
  qtd_em_falta          numeric(14,3) NOT NULL DEFAULT 0 CHECK (qtd_em_falta >= 0),
  origem                text NOT NULL DEFAULT 'manual'
                          CHECK (origem IN ('orcamento', 'conjunto', 'ficha_servico', 'obra', 'manual')),
  quote_id              uuid,              -- → quotes.id
  quote_line_id         uuid,              -- → quote_lines.id
  componente_index      integer,           -- posição (1..n) em selected_attributes->'bundle_components'
  supplier_id           uuid,              -- fornecedor resolvido (→ suppliers.id)
  fornecedor_origem     text NOT NULL DEFAULT 'nenhum'
                          CHECK (fornecedor_origem IN ('preferido', 'linha_orcamento', 'produto', 'marca', 'nenhum')),
  fornecedor_mudado_por uuid,              -- alguém escolheu outro fornecedor (rpc_nota_mudar_fornecedor)
  fornecedor_mudado_em  timestamptz,
  preco_compra          numeric(12,4),
  prazo_dias            integer,           -- item_suppliers.lead_time_days ou suppliers.delivery_sla_days
  ordem                 integer NOT NULL DEFAULT 0,
  acrescentada_em       timestamptz,       -- linha a mais, gerada sobre uma encomenda já validada (adenda/alteração)
  criada_em             timestamptz NOT NULL DEFAULT now(),
  atualizada_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obra_encomenda_cliente_linha_enc_idx
  ON public.obra_encomenda_cliente_linha (encomenda_id, tipo, ordem);
CREATE INDEX IF NOT EXISTS obra_encomenda_cliente_linha_prod_idx
  ON public.obra_encomenda_cliente_linha (organization_id, product_id) WHERE product_id IS NOT NULL;

COMMENT ON TABLE public.obra_encomenda_cliente_linha IS
  'Linhas da Encomenda Cliente. As automáticas refazem-se em rpc_ec_gerar; as manuais (origem = manual) ficam.';
COMMENT ON COLUMN public.obra_encomenda_cliente_linha.qtd_stock IS
  'Coberto pelo stock: o que já saiu do armazém para este contrato + o que fica reservado do stock livre.';


-- ============================================================
-- 3. A nota de encomenda a fornecedor
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nota_encomenda_fornecedor (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  encomenda_cliente_id  uuid NOT NULL REFERENCES public.obra_encomenda_cliente(id) ON DELETE CASCADE,
  supplier_id           uuid,              -- NULL = "sem fornecedor": não se aprova até escolher
  estado                text NOT NULL DEFAULT 'proposta' CHECK (estado IN ('proposta', 'aprovada', 'rejeitada')),
  aprovada_por          uuid,              -- → anew_users.id
  aprovada_em           timestamptz,
  rejeitada_por         uuid,
  rejeitada_em          timestamptz,
  motivo_rejeicao       text,
  purchase_order_id     uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  prazo_previsto        date,
  versao                integer NOT NULL DEFAULT 0,  -- versão da encomenda que a gerou
  criada_em             timestamptz NOT NULL DEFAULT now(),
  atualizada_em         timestamptz NOT NULL DEFAULT now(),
  CHECK (estado <> 'aprovada' OR (supplier_id IS NOT NULL AND aprovada_em IS NOT NULL)),
  CHECK (estado <> 'rejeitada' OR motivo_rejeicao IS NOT NULL)
);

-- Uma nota em proposta por (encomenda, fornecedor) — o "sem fornecedor" também conta.
CREATE UNIQUE INDEX IF NOT EXISTS nota_encomenda_fornecedor_proposta_uidx
  ON public.nota_encomenda_fornecedor
     (encomenda_cliente_id, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE estado = 'proposta';
CREATE INDEX IF NOT EXISTS nota_encomenda_fornecedor_org_idx
  ON public.nota_encomenda_fornecedor (organization_id, estado);

COMMENT ON TABLE public.nota_encomenda_fornecedor IS
  'Pós-contrato: o que falta da Encomenda Cliente, agrupado por fornecedor. proposta → aprovada '
  '(purchase_orders.approve, cria a purchase_order) ou rejeitada. Escrita só por rpc_ec_validar / rpc_nota_*.';

CREATE TABLE IF NOT EXISTS public.nota_encomenda_fornecedor_linha (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  nota_id               uuid NOT NULL REFERENCES public.nota_encomenda_fornecedor(id) ON DELETE CASCADE,
  encomenda_linha_id    uuid REFERENCES public.obra_encomenda_cliente_linha(id) ON DELETE SET NULL,
  product_id            uuid NOT NULL,     -- → products.id
  descricao             text NOT NULL,
  unidade               text,
  qtd                   numeric(14,3) NOT NULL CHECK (qtd > 0),
  preco_compra          numeric(12,4),
  -- Cópias da linha da encomenda, para a purchase_order_item ficar ligada à
  -- linha do orçamento (a reserva FIFO do Rafael conta-a como "encomendado").
  quote_line_id         uuid,
  componente_index      integer,
  criada_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nota_encomenda_fornecedor_linha_nota_idx
  ON public.nota_encomenda_fornecedor_linha (nota_id);


-- ============================================================
-- 4. RLS — leitura por organização + permissão; escrita só por RPC
-- ============================================================
ALTER TABLE public.obra_encomenda_cliente          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_encomenda_cliente_linha    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_encomenda_fornecedor       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_encomenda_fornecedor_linha ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obra_encomenda_cliente_select ON public.obra_encomenda_cliente;
CREATE POLICY obra_encomenda_cliente_select ON public.obra_encomenda_cliente
  FOR SELECT TO authenticated USING (public.ec_pode(organization_id, public.ec_perms('ver')));

DROP POLICY IF EXISTS obra_encomenda_cliente_linha_select ON public.obra_encomenda_cliente_linha;
CREATE POLICY obra_encomenda_cliente_linha_select ON public.obra_encomenda_cliente_linha
  FOR SELECT TO authenticated USING (public.ec_pode(organization_id, public.ec_perms('ver')));

DROP POLICY IF EXISTS nota_encomenda_fornecedor_select ON public.nota_encomenda_fornecedor;
CREATE POLICY nota_encomenda_fornecedor_select ON public.nota_encomenda_fornecedor
  FOR SELECT TO authenticated USING (public.ec_pode(organization_id, public.ec_perms('ver')));

DROP POLICY IF EXISTS nota_encomenda_fornecedor_linha_select ON public.nota_encomenda_fornecedor_linha;
CREATE POLICY nota_encomenda_fornecedor_linha_select ON public.nota_encomenda_fornecedor_linha
  FOR SELECT TO authenticated USING (public.ec_pode(organization_id, public.ec_perms('ver')));

REVOKE ALL ON public.obra_encomenda_cliente, public.obra_encomenda_cliente_linha,
              public.nota_encomenda_fornecedor, public.nota_encomenda_fornecedor_linha FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.obra_encomenda_cliente, public.obra_encomenda_cliente_linha,
              public.nota_encomenda_fornecedor, public.nota_encomenda_fornecedor_linha FROM authenticated;
GRANT SELECT ON public.obra_encomenda_cliente, public.obra_encomenda_cliente_linha,
              public.nota_encomenda_fornecedor, public.nota_encomenda_fornecedor_linha TO authenticated;
GRANT ALL ON public.obra_encomenda_cliente, public.obra_encomenda_cliente_linha,
              public.nota_encomenda_fornecedor, public.nota_encomenda_fornecedor_linha TO service_role;


-- ============================================================
-- 5. Funções internas (sem EXECUTE para authenticated)
-- ============================================================

-- 5.1 Os orçamentos de um contrato — UMA função só (a Frente B tem a gémea
-- ops_contrato_orcamentos; na junção passam a uma, e as adendas assinadas
-- entram aqui com origem = 'adenda'). Devolve (quote_id, origem):
--   1. client_contracts.quote_id, se preenchido (o orçamento escolhido);
--   2. senão TODOS os orçamentos aceites da proposta (quotes.accepted_at);
--   3. senão o mais recente da proposta (o mesmo critério do gatilho).
-- Hoje origem = 'contrato' sempre.
CREATE OR REPLACE FUNCTION public.fn_ec_orcamentos_do_contrato(p_contract_id uuid)
RETURNS TABLE (quote_id uuid, origem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_quote    uuid;
  v_proposta uuid;
BEGIN
  SELECT cc.quote_id, cc.proposal_id INTO v_quote, v_proposta
    FROM public.client_contracts cc WHERE cc.id = p_contract_id;

  IF v_quote IS NOT NULL THEN
    RETURN QUERY SELECT v_quote, 'contrato'::text;
    RETURN;
  END IF;
  IF v_proposta IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT q.id, 'contrato'::text
      FROM public.quotes q
     WHERE q.proposal_id = v_proposta AND q.accepted_at IS NOT NULL AND q.deleted_at IS NULL;
  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT q.id, 'contrato'::text
      FROM public.quotes q
     WHERE q.proposal_id = v_proposta
     ORDER BY q.created_at DESC
     LIMIT 1;
END
$$;

REVOKE ALL ON FUNCTION public.fn_ec_orcamentos_do_contrato(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ec_orcamentos_do_contrato(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_ec_orcamentos_do_contrato(uuid) IS
  'Os orçamentos de um contrato (quote_id, origem). Hoje origem = contrato; as adendas entram aqui com origem = adenda.';

-- 5.2 Resolução do fornecedor de um produto, por esta ordem:
--   preferido (item_suppliers.is_preferred) → o escolhido na linha do
--   orçamento (quote_lines.item_supplier_id) → products.supplier_id → a marca
--   com o mesmo nome de um fornecedor (só se houver exatamente um) → nenhum.
-- Preço de compra: o da ligação produto↔fornecedor; senão o preço 'purchase'
-- do produto (product_prices). Prazo: lead_time_days da ligação; senão
-- suppliers.delivery_sla_days.
CREATE OR REPLACE FUNCTION public.fn_ec_resolver_fornecedor(
  p_org uuid, p_product_id uuid, p_item_supplier_id uuid DEFAULT NULL
)
RETURNS TABLE (supplier_id uuid, origem text, preco_compra numeric, prazo_dias integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_sup    uuid;
  v_origem text := 'nenhum';
  v_preco  numeric;
  v_prazo  integer;
  v_marca  text;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'nenhum'::text, NULL::numeric, NULL::integer;
    RETURN;
  END IF;

  -- 1. preferido
  SELECT i.supplier_id, i.purchase_price, i.lead_time_days INTO v_sup, v_preco, v_prazo
    FROM public.item_suppliers i
    JOIN public.suppliers s ON s.id = i.supplier_id AND s.deleted_at IS NULL AND COALESCE(s.is_active, true)
   WHERE i.product_id = p_product_id AND i.is_preferred AND i.is_active AND i.deleted_at IS NULL
   ORDER BY i.updated_at DESC
   LIMIT 1;
  IF v_sup IS NOT NULL THEN
    v_origem := 'preferido';
  END IF;

  -- 2. o fornecedor escolhido na linha do orçamento
  IF v_sup IS NULL AND p_item_supplier_id IS NOT NULL THEN
    SELECT i.supplier_id, i.purchase_price, i.lead_time_days INTO v_sup, v_preco, v_prazo
      FROM public.item_suppliers i
      JOIN public.suppliers s ON s.id = i.supplier_id AND s.deleted_at IS NULL AND COALESCE(s.is_active, true)
     WHERE i.id = p_item_supplier_id AND i.deleted_at IS NULL;
    IF v_sup IS NOT NULL THEN
      v_origem := 'linha_orcamento';
    END IF;
  END IF;

  -- 3. o fornecedor do produto
  IF v_sup IS NULL THEN
    SELECT s.id INTO v_sup
      FROM public.products p
      JOIN public.suppliers s ON s.id = p.supplier_id AND s.deleted_at IS NULL AND COALESCE(s.is_active, true)
     WHERE p.id = p_product_id;
    IF v_sup IS NOT NULL THEN
      v_origem := 'produto';
    END IF;
  END IF;

  -- 4. a marca com o nome de um fornecedor (um só)
  IF v_sup IS NULL THEN
    SELECT lower(btrim(b.name)) INTO v_marca
      FROM public.products p JOIN public.brands b ON b.id = p.brand_id AND b.deleted_at IS NULL
     WHERE p.id = p_product_id;
    IF v_marca IS NOT NULL AND v_marca <> '' THEN
      SELECT min(s.id::text)::uuid INTO v_sup
        FROM public.suppliers s
       WHERE lower(btrim(s.name)) = v_marca AND s.deleted_at IS NULL AND COALESCE(s.is_active, true)
         AND (s.organization_id = p_org OR s.organization_id IS NULL)
      HAVING count(*) = 1;
      IF v_sup IS NOT NULL THEN
        v_origem := 'marca';
      END IF;
    END IF;
  END IF;

  IF v_sup IS NOT NULL AND v_origem IN ('produto', 'marca') THEN
    SELECT i.purchase_price, i.lead_time_days INTO v_preco, v_prazo
      FROM public.item_suppliers i
     WHERE i.product_id = p_product_id AND i.supplier_id = v_sup AND i.deleted_at IS NULL
     LIMIT 1;
  END IF;

  IF v_sup IS NOT NULL AND v_preco IS NULL THEN
    SELECT pp.price INTO v_preco
      FROM public.product_prices pp
     WHERE pp.product_id = p_product_id AND pp.price_type = 'purchase'
     ORDER BY pp.valid_from DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_sup IS NOT NULL AND v_prazo IS NULL THEN
    SELECT s.delivery_sla_days INTO v_prazo FROM public.suppliers s WHERE s.id = v_sup;
  END IF;

  RETURN QUERY SELECT v_sup, v_origem, v_preco, v_prazo;
END
$$;

REVOKE ALL ON FUNCTION public.fn_ec_resolver_fornecedor(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ec_resolver_fornecedor(uuid, uuid, uuid) TO service_role;

-- 5.3 O estado da encomenda a fornecedor, a partir das notas.
--   Notas consideradas = as não rejeitadas.
--   nenhuma → por_aprovar (se a encomenda estiver validada e houver falta)
--   todas aprovadas → aprovada; algumas → parcial; nenhuma → por_aprovar.
CREATE OR REPLACE FUNCTION public.fn_ec_estado_fornecedor(p_encomenda_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_estado   text;
  v_novo     text;
  v_total    integer;
  v_aprov    integer;
  v_falta    boolean;
BEGIN
  SELECT e.estado INTO v_estado FROM public.obra_encomenda_cliente e WHERE e.id = p_encomenda_id;
  IF v_estado IS DISTINCT FROM 'validada' THEN
    v_novo := 'por_gerar';
  ELSE
    SELECT count(*) FILTER (WHERE n.estado <> 'rejeitada'), count(*) FILTER (WHERE n.estado = 'aprovada')
      INTO v_total, v_aprov
      FROM public.nota_encomenda_fornecedor n WHERE n.encomenda_cliente_id = p_encomenda_id;
    SELECT EXISTS (SELECT 1 FROM public.obra_encomenda_cliente_linha l
                    WHERE l.encomenda_id = p_encomenda_id AND l.qtd_em_falta > 0 AND l.product_id IS NOT NULL)
      INTO v_falta;
    v_novo := CASE
      WHEN v_total = 0 AND NOT v_falta THEN 'nao_necessaria'
      WHEN v_total > 0 AND v_aprov = v_total THEN 'aprovada'
      WHEN v_aprov > 0 THEN 'parcial'
      ELSE 'por_aprovar'
    END;
  END IF;

  UPDATE public.obra_encomenda_cliente
     SET fornecedor_estado = v_novo, atualizada_em = now()
   WHERE id = p_encomenda_id AND fornecedor_estado IS DISTINCT FROM v_novo;
  RETURN v_novo;
END
$$;

REVOKE ALL ON FUNCTION public.fn_ec_estado_fornecedor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ec_estado_fornecedor(uuid) TO service_role;

-- 5.4 Aviso no sino a quem tem uma permissão na organização (padrão de
-- fin_avisar_primeiro_pagamento): user_id = id de AUTH, kind = 'notification'.
-- Não repete enquanto houver um aviso igual (tipo + entidade) por resolver.
-- Nunca rebenta: um aviso falhado não pode desfazer uma validação.
CREATE OR REPLACE FUNCTION public.fn_ec_avisar(
  p_org uuid, p_perm text, p_tipo text, p_titulo text, p_mensagem text,
  p_link text, p_entity_type text, p_entity_id uuid, p_sempre_uma_vez boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notifications
    (user_id, organization_id, kind, type, title, message, link, entity_type, entity_id, priority, data)
  SELECT DISTINCT au.auth_user_id, p_org, 'notification', p_tipo, p_titulo, p_mensagem, p_link,
         p_entity_type, p_entity_id, 'high',
         jsonb_build_object('modulo', 'encomendas', 'entity_id', p_entity_id)
    FROM public.anew_role_permissions rp
    JOIN public.anew_memberships m ON m.role_id = rp.role_id AND m.organization_id = p_org AND m.status = 'active'
    JOIN public.anew_users au ON au.id = m.user_id AND au.auth_user_id IS NOT NULL
   WHERE rp.permission_code = p_perm
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications x
        WHERE x.user_id = au.auth_user_id AND x.type = p_tipo AND x.entity_id = p_entity_id
          AND (p_sempre_uma_vez OR NOT x.is_resolved));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Avisos de encomendas não enviados: %', SQLERRM;
  RETURN 0;
END
$$;

REVOKE ALL ON FUNCTION public.fn_ec_avisar(uuid, text, text, text, text, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ec_avisar(uuid, text, text, text, text, text, text, uuid, boolean) TO service_role;

-- 5.5 A obra viva do contrato (se o SQL de Operações estiver instalado).
CREATE OR REPLACE FUNCTION public.fn_ec_obra_do_contrato(p_contract_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v uuid;
BEGIN
  IF to_regclass('public.ops_obra') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT id FROM public.ops_obra WHERE contrato_id = $1 AND estado <> ''cancelada''
            ORDER BY criada_em DESC LIMIT 1' INTO v USING p_contract_id;
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public.fn_ec_obra_do_contrato(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ec_obra_do_contrato(uuid) TO service_role;

-- 5.6 Recalcula o prazo de uma nota: hoje + o maior prazo das suas linhas
-- (lead_time_days da ligação ao fornecedor; senão o SLA do fornecedor).
CREATE OR REPLACE FUNCTION public.fn_ec_nota_prazo(p_nota_id uuid)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_sup   uuid;
  v_dias  integer;
  v_prazo date;
BEGIN
  SELECT n.supplier_id INTO v_sup FROM public.nota_encomenda_fornecedor n WHERE n.id = p_nota_id;
  IF v_sup IS NOT NULL THEN
    SELECT max(COALESCE(i.lead_time_days, s.delivery_sla_days))
      INTO v_dias
      FROM public.nota_encomenda_fornecedor_linha nl
      JOIN public.suppliers s ON s.id = v_sup
      LEFT JOIN public.item_suppliers i
        ON i.product_id = nl.product_id AND i.supplier_id = v_sup AND i.deleted_at IS NULL
     WHERE nl.nota_id = p_nota_id;
    IF v_dias IS NOT NULL THEN
      v_prazo := current_date + v_dias;
    END IF;
  END IF;
  UPDATE public.nota_encomenda_fornecedor SET prazo_previsto = v_prazo, atualizada_em = now() WHERE id = p_nota_id;
  RETURN v_prazo;
END
$$;

REVOKE ALL ON FUNCTION public.fn_ec_nota_prazo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ec_nota_prazo(uuid) TO service_role;


-- ============================================================
-- 6. RPCs da Encomenda Cliente
-- ============================================================

-- 6.1 rpc_ec_gerar — cria ou atualiza a Encomenda Cliente.
-- Fontes (todos os orçamentos de fn_ec_orcamentos_do_contrato):
--   · produtos das linhas dos orçamentos (qt × units_per_uom)        → produto / orcamento
--   · componentes 'product' dos conjuntos (quantity × qt)            → produto / conjunto
--   · service_materials × quantidade de cada serviço vendido (linhas
--     de serviço e componentes 'service' dos conjuntos); regra de três
--     por área como no CRM (ceil(ref_qtd / ref_área × qt))          → consumivel / ficha_servico
--   · equipamentos da receita do serviço (área de Custos), em horas  → equipamento / ficha_servico
--   · mão de obra: horas por competência das tarefas da obra (se já
--     houver obra) ou das tarefas-modelo dos serviços                → mao_obra / obra | ficha_servico
-- Em RASCUNHO: refaz as linhas automáticas e mantém as manuais (uma linha
-- automática editada à mão passa a manual e não volta a ser gerada por cima).
-- VALIDADA: não apaga nem refaz nada do que foi validado/encomendado —
-- acrescenta só a diferença (linhas novas, "acrescentada_em"), as notas ainda
-- em proposta ficam rejeitadas e a encomenda volta a rascunho para ser
-- validada outra vez (a nova validação gera notas só para o que falta a
-- mais: o já encomendado conta como "em encomenda"). Sem diferenças, não
-- muda nada. É o caminho das adendas.
CREATE OR REPLACE FUNCTION public.rpc_ec_gerar(p_contract_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org       uuid;
  v_status    text;
  v_enc       public.obra_encomenda_cliente%ROWTYPE;
  v_obra      uuid;
  v_escolhas  jsonb;
  v_novas     integer := 0;
  v_user      uuid := public.current_business_user_id();
BEGIN
  SELECT cc.organization_id, cc.status INTO v_org, v_status
    FROM public.client_contracts cc
   WHERE cc.id = p_contract_id AND cc.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.ec_pode(v_org, public.ec_perms('editar')) THEN
    RAISE EXCEPTION 'Sem permissão para gerar a Encomenda Cliente.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_status IS NULL OR v_status NOT IN ('signed', 'assinado') THEN
    RAISE EXCEPTION 'O contrato ainda não está assinado.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('rpc_ec:' || p_contract_id::text, 0));

  v_obra := public.fn_ec_obra_do_contrato(p_contract_id);

  SELECT * INTO v_enc FROM public.obra_encomenda_cliente
   WHERE contract_id = p_contract_id AND estado <> 'anulada' FOR UPDATE;

  IF v_enc.id IS NULL THEN
    INSERT INTO public.obra_encomenda_cliente (organization_id, contract_id, obra_id)
    VALUES (v_org, p_contract_id, v_obra)
    RETURNING * INTO v_enc;
  END IF;

  -- ── 1. O que o contrato pede hoje, numa tabela de trabalho ──────────────
  CREATE TEMP TABLE IF NOT EXISTS _ec_orc (quote_id uuid, origem text, ordem bigint) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _ec_itens (
    tipo text, origem text, quote_id uuid, quote_line_id uuid, componente_index integer,
    product_id uuid, service_id uuid, qt numeric, unidade text, descricao text,
    item_supplier_id uuid, ordem bigint
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _ec_novas (
    tipo text, origem text, product_id uuid, service_id uuid, equipamento_id uuid, skill_id uuid,
    descricao text, unidade text, qtd numeric, quote_id uuid, quote_line_id uuid, componente_index integer,
    ordem bigint
  ) ON COMMIT DROP;
  TRUNCATE _ec_orc, _ec_itens, _ec_novas;

  INSERT INTO _ec_orc
  SELECT o.quote_id, o.origem,
         row_number() OVER (ORDER BY (o.origem = 'adenda'), q.accepted_at NULLS LAST, q.created_at, q.id)
    FROM public.fn_ec_orcamentos_do_contrato(p_contract_id) o
    JOIN public.quotes q ON q.id = o.quote_id;

  INSERT INTO _ec_itens
  SELECT 'produto', 'orcamento', ql.quote_id, ql.id, NULL::integer, ql.product_id, NULL::uuid,
         GREATEST(COALESCE(ql.qt, 0) * COALESCE(ql.units_per_uom, 1), 0), ql.unidade,
         COALESCE(p.name, ql.descricao_snapshot), ql.item_supplier_id,
         o.ordem * 1000000 + COALESCE(ql.ordem, 0) * 100
    FROM _ec_orc o
    JOIN public.quote_lines ql ON ql.quote_id = o.quote_id
    LEFT JOIN public.products p ON p.id = ql.product_id
   WHERE ql.product_id IS NOT NULL
  UNION ALL
  SELECT CASE WHEN comp.value ->> 'type' = 'product' THEN 'produto' ELSE 'servico' END,
         'conjunto', ql.quote_id, ql.id, comp.ord::integer,
         CASE WHEN comp.value ->> 'type' = 'product' THEN (comp.value ->> 'source_id')::uuid END,
         CASE WHEN comp.value ->> 'type' = 'service' THEN (comp.value ->> 'source_id')::uuid END,
         GREATEST(COALESCE((comp.value ->> 'quantity')::numeric, 1) * COALESCE(ql.qt, 1), 0),
         NULL::text,
         COALESCE(p.name, comp.value ->> 'name', ql.descricao_snapshot), NULL::uuid,
         o.ordem * 1000000 + COALESCE(ql.ordem, 0) * 100 + comp.ord
    FROM _ec_orc o
    JOIN public.quote_lines ql
      ON ql.quote_id = o.quote_id
     AND ql.bundle_id IS NOT NULL
     AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
   CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components')
        WITH ORDINALITY AS comp(value, ord)
    LEFT JOIN public.products p
      ON comp.value ->> 'type' = 'product' AND p.id = (comp.value ->> 'source_id')::uuid
   WHERE comp.value ->> 'type' IN ('product', 'service')
     AND comp.value ->> 'source_id' IS NOT NULL
  UNION ALL
  SELECT 'servico', 'orcamento', ql.quote_id, ql.id, NULL::integer, NULL::uuid, ql.service_id,
         GREATEST(COALESCE(ql.qt, 0), 0), ql.unidade, ql.descricao_snapshot, NULL::uuid,
         o.ordem * 1000000 + COALESCE(ql.ordem, 0) * 100
    FROM _ec_orc o
    JOIN public.quote_lines ql ON ql.quote_id = o.quote_id
   WHERE ql.service_id IS NOT NULL AND ql.product_id IS NULL;

  -- Produtos (diretos e dos conjuntos).
  INSERT INTO _ec_novas (tipo, origem, product_id, descricao, unidade, qtd, quote_id, quote_line_id, componente_index, ordem)
  SELECT 'produto', i.origem, i.product_id, COALESCE(i.descricao, 'Produto'), COALESCE(i.unidade, 'un'), i.qt,
         i.quote_id, i.quote_line_id, i.componente_index, i.ordem
    FROM _ec_itens i
   WHERE i.tipo = 'produto' AND i.qt > 0;

  -- Consumíveis: a ficha de materiais de cada serviço vendido.
  INSERT INTO _ec_novas (tipo, origem, product_id, service_id, descricao, unidade, qtd, quote_id, quote_line_id, componente_index, ordem)
  SELECT 'consumivel', 'ficha_servico', x.product_id, x.service_id, COALESCE(p.name, 'Consumível'), 'un', x.q,
         x.quote_id, x.quote_line_id, x.componente_index, x.ordem
    FROM (
      SELECT i.quote_id, i.quote_line_id, i.componente_index, i.service_id, sm.product_id,
             SUM(CASE WHEN sm.reference_area_m2 > 0 AND sm.reference_quantity IS NOT NULL
                      THEN ceil(sm.reference_quantity / sm.reference_area_m2 * i.qt)
                      ELSE sm.quantity * i.qt END) AS q,
             min(i.ordem) + 50 + LEAST(min(COALESCE(sm.sort_order, 0)), 40) AS ordem
        FROM _ec_itens i
        JOIN public.service_materials sm
          ON sm.service_id = i.service_id AND sm.organization_id = v_org
         AND sm.deleted_at IS NULL AND sm.product_id IS NOT NULL
       WHERE i.tipo = 'servico' AND i.qt > 0
       GROUP BY i.quote_id, i.quote_line_id, i.componente_index, i.service_id, sm.product_id
    ) x
    LEFT JOIN public.products p ON p.id = x.product_id
   WHERE x.q > 0;

  -- Equipamentos (receitas da área de Custos), somados por equipamento, em horas.
  IF to_regclass('public.service_recipe_equipment') IS NOT NULL
     AND to_regclass('public.service_recipes') IS NOT NULL
     AND to_regclass('public.cost_equipment') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO _ec_novas (tipo, origem, equipamento_id, descricao, unidade, qtd, ordem)
      SELECT 'equipamento', 'ficha_servico', ce.id, ce.nome, 'h', round(SUM(re.horas_por_medida * i.qt), 3), min(i.ordem)
        FROM _ec_itens i
        JOIN public.service_recipes r ON r.service_id = i.service_id AND r.organization_id = $1
        JOIN public.service_recipe_equipment re ON re.recipe_id = r.id
        JOIN public.cost_equipment ce ON ce.id = re.equipamento_id
       WHERE i.tipo = 'servico' AND i.qt > 0
       GROUP BY ce.id, ce.nome
      HAVING SUM(re.horas_por_medida * i.qt) > 0
    $q$ USING v_org;
  END IF;

  -- Mão de obra: horas por competência.
  IF v_obra IS NOT NULL AND to_regclass('public.ops_obra_tarefa') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO _ec_novas (tipo, origem, skill_id, descricao, unidade, qtd, ordem)
      SELECT 'mao_obra', 'obra', t.skill_id, 'Mão de obra · ' || COALESCE(sk.nome, 'sem competência definida'), 'h',
             round(SUM(t.minutos_previstos) / 60.0, 2), 900000000
        FROM public.ops_obra_tarefa t
        LEFT JOIN public.ops_skill sk ON sk.id = t.skill_id
       WHERE t.obra_id = $1
       GROUP BY t.skill_id, sk.nome
      HAVING SUM(t.minutos_previstos) > 0
    $q$ USING v_obra;
  ELSIF to_regclass('public.ops_obra_servico_tarefa') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO _ec_novas (tipo, origem, skill_id, descricao, unidade, qtd, ordem)
      SELECT 'mao_obra', 'ficha_servico', st.skill_id, 'Mão de obra · ' || COALESCE(sk.nome, 'sem competência definida'), 'h',
             round(SUM(st.minutos_fixos + st.minutos_por_unidade * i.qt) / 60.0, 2), 900000000
        FROM _ec_itens i
        JOIN public.ops_obra_servico_tarefa st ON st.servico_id = i.service_id AND st.organization_id = $1
        LEFT JOIN public.ops_skill sk ON sk.id = st.skill_id
       WHERE i.tipo = 'servico' AND i.qt > 0
       GROUP BY st.skill_id, sk.nome
      HAVING SUM(st.minutos_fixos + st.minutos_por_unidade * i.qt) > 0
    $q$ USING v_org;
  END IF;

  -- ── 2a. Validada: acrescenta só a diferença ─────────────────────────────
  IF v_enc.estado = 'validada' THEN
    INSERT INTO public.obra_encomenda_cliente_linha
      (organization_id, encomenda_id, tipo, product_id, service_id, equipamento_id, skill_id, descricao, unidade,
       qtd_necessaria, origem, quote_id, quote_line_id, componente_index, ordem, acrescentada_em)
    SELECT v_org, v_enc.id, n.tipo, n.product_id, n.service_id, n.equipamento_id, n.skill_id, n.descricao, n.unidade,
           n.qtd - COALESCE(e.q, 0), n.origem, n.quote_id, n.quote_line_id, n.componente_index, n.ordem, now()
      FROM _ec_novas n
      LEFT JOIN LATERAL (
        SELECT SUM(l.qtd_necessaria) AS q
          FROM public.obra_encomenda_cliente_linha l
         WHERE l.encomenda_id = v_enc.id AND l.tipo = n.tipo
           AND l.product_id IS NOT DISTINCT FROM n.product_id
           AND l.equipamento_id IS NOT DISTINCT FROM n.equipamento_id
           AND l.skill_id IS NOT DISTINCT FROM n.skill_id
           AND (n.tipo IN ('equipamento', 'mao_obra')
                OR (l.quote_line_id IS NOT DISTINCT FROM n.quote_line_id
                    AND l.componente_index IS NOT DISTINCT FROM n.componente_index))
      ) e ON true
     WHERE n.qtd - COALESCE(e.q, 0) > 0.0005;
    GET DIAGNOSTICS v_novas = ROW_COUNT;

    IF v_novas = 0 THEN
      RETURN v_enc.id;     -- nada de novo: fica validada como estava
    END IF;

    UPDATE public.obra_encomenda_cliente_linha l
       SET supplier_id = r.supplier_id, fornecedor_origem = r.origem,
           preco_compra = r.preco_compra, prazo_dias = r.prazo_dias
      FROM (
        SELECT l2.id, f.*
          FROM public.obra_encomenda_cliente_linha l2
          LEFT JOIN public.quote_lines ql ON ql.id = l2.quote_line_id AND l2.componente_index IS NULL
                                          AND l2.tipo = 'produto'
         CROSS JOIN LATERAL public.fn_ec_resolver_fornecedor(v_org, l2.product_id, ql.item_supplier_id) f
         WHERE l2.encomenda_id = v_enc.id AND l2.product_id IS NOT NULL AND l2.acrescentada_em IS NOT NULL
           AND l2.supplier_id IS NULL AND l2.fornecedor_mudado_em IS NULL
      ) r
     WHERE l.id = r.id;

    UPDATE public.nota_encomenda_fornecedor
       SET estado = 'rejeitada', rejeitada_por = v_user, rejeitada_em = now(),
           motivo_rejeicao = 'Encomenda gerada de novo: ' || v_novas || ' linha(s) a mais', atualizada_em = now()
     WHERE encomenda_cliente_id = v_enc.id AND estado = 'proposta';

    UPDATE public.obra_encomenda_cliente
       SET estado = 'rascunho', fornecedor_estado = 'por_gerar',
           reaberta_por = v_user, reaberta_em = now(),
           reaberta_motivo = 'Gerada de novo com ' || v_novas || ' linha(s) a mais',
           obra_id = COALESCE(v_obra, obra_id), gerada_em = now(), atualizada_em = now()
     WHERE id = v_enc.id;
    RETURN v_enc.id;
  END IF;

  -- ── 2b. Rascunho: refaz as automáticas, mantém as manuais ───────────────
  -- Fornecedores escolhidos à mão nas linhas automáticas: guardam-se para
  -- voltar a aplicar depois de refazer as linhas.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'tipo', l.tipo, 'product_id', l.product_id, 'quote_line_id', l.quote_line_id,
           'componente_index', l.componente_index, 'service_id', l.service_id,
           'supplier_id', l.supplier_id, 'por', l.fornecedor_mudado_por, 'em', l.fornecedor_mudado_em)), '[]'::jsonb)
    INTO v_escolhas
    FROM public.obra_encomenda_cliente_linha l
   WHERE l.encomenda_id = v_enc.id AND l.origem <> 'manual' AND l.fornecedor_mudado_em IS NOT NULL;

  DELETE FROM public.obra_encomenda_cliente_linha WHERE encomenda_id = v_enc.id AND origem <> 'manual';

  INSERT INTO public.obra_encomenda_cliente_linha
    (organization_id, encomenda_id, tipo, product_id, service_id, equipamento_id, skill_id, descricao, unidade,
     qtd_necessaria, origem, quote_id, quote_line_id, componente_index, ordem)
  SELECT v_org, v_enc.id, n.tipo, n.product_id, n.service_id, n.equipamento_id, n.skill_id, n.descricao, n.unidade,
         n.qtd, n.origem, n.quote_id, n.quote_line_id, n.componente_index, n.ordem
    FROM _ec_novas n
   WHERE NOT EXISTS (
     SELECT 1 FROM public.obra_encomenda_cliente_linha m
      WHERE m.encomenda_id = v_enc.id AND m.origem = 'manual' AND m.tipo = n.tipo
        AND m.product_id IS NOT DISTINCT FROM n.product_id
        AND m.equipamento_id IS NOT DISTINCT FROM n.equipamento_id
        AND m.skill_id IS NOT DISTINCT FROM n.skill_id
        AND (n.tipo IN ('equipamento', 'mao_obra')
             OR (m.quote_line_id IS NOT DISTINCT FROM n.quote_line_id
                 AND m.componente_index IS NOT DISTINCT FROM n.componente_index)));

  -- Fornecedor de cada linha de produto/consumível (as manuais também, se
  -- ninguém lhes escolheu fornecedor).
  UPDATE public.obra_encomenda_cliente_linha l
     SET supplier_id = r.supplier_id, fornecedor_origem = r.origem,
         preco_compra = r.preco_compra, prazo_dias = r.prazo_dias
    FROM (
      SELECT l2.id, f.*
        FROM public.obra_encomenda_cliente_linha l2
        LEFT JOIN public.quote_lines ql ON ql.id = l2.quote_line_id AND l2.componente_index IS NULL
                                        AND l2.tipo = 'produto'
       CROSS JOIN LATERAL public.fn_ec_resolver_fornecedor(v_org, l2.product_id, ql.item_supplier_id) f
       WHERE l2.encomenda_id = v_enc.id AND l2.product_id IS NOT NULL AND l2.fornecedor_mudado_em IS NULL
    ) r
   WHERE l.id = r.id;

  -- E volta a aplicar os fornecedores escolhidos à mão.
  UPDATE public.obra_encomenda_cliente_linha l
     SET supplier_id = (e ->> 'supplier_id')::uuid,
         fornecedor_mudado_por = (e ->> 'por')::uuid,
         fornecedor_mudado_em = (e ->> 'em')::timestamptz,
         preco_compra = COALESCE((SELECT i.purchase_price FROM public.item_suppliers i
                                   WHERE i.product_id = l.product_id AND i.supplier_id = (e ->> 'supplier_id')::uuid
                                     AND i.deleted_at IS NULL LIMIT 1), l.preco_compra)
    FROM jsonb_array_elements(v_escolhas) e
   WHERE l.encomenda_id = v_enc.id AND l.origem <> 'manual'
     AND l.tipo = e ->> 'tipo'
     AND l.product_id IS NOT DISTINCT FROM (e ->> 'product_id')::uuid
     AND l.quote_line_id IS NOT DISTINCT FROM (e ->> 'quote_line_id')::uuid
     AND l.componente_index IS NOT DISTINCT FROM (e ->> 'componente_index')::integer
     AND l.service_id IS NOT DISTINCT FROM (e ->> 'service_id')::uuid;

  UPDATE public.obra_encomenda_cliente
     SET obra_id = COALESCE(v_obra, obra_id), gerada_em = now(), atualizada_em = now(),
         fornecedor_estado = 'por_gerar'
   WHERE id = v_enc.id;

  RETURN v_enc.id;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ec_gerar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_gerar(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_ec_gerar(uuid) IS
  'Encomenda Cliente: cria ou refaz (em rascunho) a partir de TODOS os orçamentos do contrato '
  '(fn_ec_orcamentos_do_contrato), mantendo as linhas manuais. Sobre uma encomenda validada só acrescenta '
  'a diferença e volta a rascunho. Exige client_orders.validate / client_orders.edit / operations.orders.*.';

-- 6.2 rpc_ec_linha_guardar — linha manual nova, ou muda uma linha (em
-- rascunho). Mudar uma linha automática torna-a manual (o Gerar não a refaz).
CREATE OR REPLACE FUNCTION public.rpc_ec_linha_guardar(
  p_encomenda_id uuid,
  p_linha_id     uuid,
  p_tipo         text,
  p_product_id   uuid,
  p_descricao    text,
  p_unidade      text,
  p_qtd          numeric
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_enc   public.obra_encomenda_cliente%ROWTYPE;
  v_id    uuid;
  v_desc  text;
  f       record;
BEGIN
  SELECT * INTO v_enc FROM public.obra_encomenda_cliente WHERE id = p_encomenda_id FOR UPDATE;
  IF v_enc.id IS NULL OR NOT public.ec_pode(v_enc.organization_id, public.ec_perms('editar')) THEN
    RAISE EXCEPTION 'Encomenda Cliente não encontrada ou sem permissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_enc.estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Só se mudam linhas com a Encomenda Cliente em rascunho.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_qtd IS NULL OR p_qtd < 0 THEN
    RAISE EXCEPTION 'A quantidade tem de ser um número maior ou igual a zero.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_linha_id IS NOT NULL THEN
    UPDATE public.obra_encomenda_cliente_linha
       SET qtd_necessaria = p_qtd,
           descricao = COALESCE(NULLIF(btrim(p_descricao), ''), descricao),
           unidade = COALESCE(NULLIF(btrim(p_unidade), ''), unidade),
           origem = 'manual', atualizada_em = now()
     WHERE id = p_linha_id AND encomenda_id = p_encomenda_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Linha não encontrada nesta Encomenda Cliente.' USING ERRCODE = 'no_data_found';
    END IF;
    RETURN v_id;
  END IF;

  IF p_tipo IS NULL OR p_tipo NOT IN ('produto', 'consumivel', 'equipamento', 'mao_obra') THEN
    RAISE EXCEPTION 'Tipo de linha inválido: %', p_tipo USING ERRCODE = 'check_violation';
  END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.products p
        WHERE p.id = p_product_id AND (p.organization_id = v_enc.organization_id OR p.organization_id IS NULL)) THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT p.name INTO v_desc FROM public.products p WHERE p.id = p_product_id;
  v_desc := COALESCE(NULLIF(btrim(p_descricao), ''), v_desc);
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Falta a descrição da linha.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.obra_encomenda_cliente_linha
    (organization_id, encomenda_id, tipo, product_id, descricao, unidade, qtd_necessaria, origem, ordem)
  VALUES (v_enc.organization_id, p_encomenda_id, p_tipo, p_product_id, v_desc,
          COALESCE(NULLIF(btrim(p_unidade), ''), 'un'), p_qtd, 'manual', 800000000)
  RETURNING id INTO v_id;

  IF p_product_id IS NOT NULL THEN
    SELECT * INTO f FROM public.fn_ec_resolver_fornecedor(v_enc.organization_id, p_product_id, NULL);
    UPDATE public.obra_encomenda_cliente_linha
       SET supplier_id = f.supplier_id, fornecedor_origem = f.origem, preco_compra = f.preco_compra, prazo_dias = f.prazo_dias
     WHERE id = v_id;
  END IF;
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ec_linha_guardar(uuid, uuid, text, uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_linha_guardar(uuid, uuid, text, uuid, text, text, numeric) TO authenticated, service_role;

-- 6.3 rpc_ec_linha_apagar (só em rascunho). Uma linha automática apagada
-- volta no próximo "Gerar": para a tirar de vez, ponha a quantidade a 0.
CREATE OR REPLACE FUNCTION public.rpc_ec_linha_apagar(p_linha_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_enc public.obra_encomenda_cliente%ROWTYPE;
BEGIN
  SELECT e.* INTO v_enc
    FROM public.obra_encomenda_cliente e
    JOIN public.obra_encomenda_cliente_linha l ON l.encomenda_id = e.id
   WHERE l.id = p_linha_id;
  IF v_enc.id IS NULL OR NOT public.ec_pode(v_enc.organization_id, public.ec_perms('editar')) THEN
    RAISE EXCEPTION 'Linha não encontrada ou sem permissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_enc.estado <> 'rascunho' THEN
    RAISE EXCEPTION 'Só se apagam linhas com a Encomenda Cliente em rascunho.' USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM public.obra_encomenda_cliente_linha WHERE id = p_linha_id;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ec_linha_apagar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_linha_apagar(uuid) TO authenticated, service_role;

-- 6.4 rpc_ec_validar — rascunho → validada.
-- Por produto, as linhas desta encomenda (por ordem) cobrem-se assim:
--   1. o que já saiu do armazém para este contrato (venda/saída não estornada);
--   2. o que já está encomendado ao fornecedor para este contrato
--      (purchase_orders source_type 'contract', não anuladas) — inclui as que
--      o gatilho da assinatura criou: por isso a nota não duplica;
--   3. o stock livre: físico da organização − o que as outras encomendas
--      reservam (a reserva FIFO do Rafael, fn_client_order_line_reservations,
--      ou a reserva das outras Encomendas Cliente validadas — a maior);
--   4. o resto fica em falta → notas por fornecedor.
-- Equipamentos e mão de obra não entram nas notas.
CREATE OR REPLACE FUNCTION public.rpc_ec_validar(p_encomenda_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_enc      public.obra_encomenda_cliente%ROWTYPE;
  v_prods    uuid[];
  v_fifo     jsonb := '[]'::jsonb;
  v_cancel   jsonb := '{}'::jsonb;
  v_res      jsonb := '{}'::jsonb;
  v_user     uuid := public.current_business_user_id();
  v_nota     uuid;
  v_notas    integer := 0;
  v_estado   text;
  v_numero   text;
  v_obra     uuid;
  v_forn     record;
BEGIN
  SELECT * INTO v_enc FROM public.obra_encomenda_cliente WHERE id = p_encomenda_id FOR UPDATE;
  IF v_enc.id IS NULL OR NOT public.ec_pode(v_enc.organization_id, public.ec_perms('validar')) THEN
    RAISE EXCEPTION 'Sem permissão para validar a Encomenda Cliente (client_orders.validate).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_enc.estado <> 'rascunho' THEN
    RAISE EXCEPTION 'A Encomenda Cliente não está em rascunho.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.obra_encomenda_cliente_linha WHERE encomenda_id = p_encomenda_id) THEN
    RAISE EXCEPTION 'A Encomenda Cliente não tem linhas. Carregue em "Gerar" primeiro.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('rpc_ec:' || v_enc.contract_id::text, 0));

  SELECT array_agg(DISTINCT l.product_id) INTO v_prods
    FROM public.obra_encomenda_cliente_linha l
   WHERE l.encomenda_id = p_encomenda_id AND l.product_id IS NOT NULL AND l.tipo IN ('produto', 'consumivel');
  v_prods := COALESCE(v_prods, ARRAY[]::uuid[]);

  -- Reserva FIFO das outras encomendas (função do Rafael, só leitura).
  IF cardinality(v_prods) > 0
     AND to_regprocedure('public.fn_client_order_line_reservations(uuid,uuid[])') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object('cid', x.cid, 'pid', x.pid, 'q', x.q)), '[]'::jsonb)
        FROM (SELECT r.contract_id AS cid, r.product_id AS pid, SUM(r.qty_reserved) AS q
                FROM public.fn_client_order_line_reservations($1, $2) r
               WHERE r.contract_id <> $3
               GROUP BY 1, 2) x
    $q$ INTO v_fifo USING v_enc.organization_id, v_prods, v_enc.contract_id;
  END IF;

  -- Quantidades anuladas nas encomendas a fornecedor deste contrato.
  IF cardinality(v_prods) > 0 AND to_regclass('public.purchase_order_item_cancellations') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_object_agg(x.pid, x.q), '{}'::jsonb)
        FROM (SELECT poi.product_id AS pid, SUM(c.quantity_cancelled * COALESCE(poi.units_per_uom, 1)) AS q
                FROM public.purchase_order_item_cancellations c
                JOIN public.purchase_order_items poi ON poi.id = c.purchase_order_item_id
                JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
               WHERE po.source_type = 'contract' AND po.source_id = $1 AND po.deleted_at IS NULL
                 AND po.status IS DISTINCT FROM 'cancelled'
                 AND c.undone_at IS NULL AND c.quantity_cancelled > 0
                 AND poi.product_id = ANY ($2)
               GROUP BY 1) x
    $q$ INTO v_cancel USING v_enc.contract_id, v_prods;
  END IF;

  -- Reservado pelas outras: por (contrato, produto), o maior entre a reserva
  -- FIFO e a reserva da Encomenda Cliente validada desse contrato.
  SELECT COALESCE(jsonb_object_agg(y.pid, y.q), '{}'::jsonb) INTO v_res
    FROM (
      SELECT j.pid, SUM(j.q) AS q
        FROM (
          SELECT COALESCE(f.cid, e.cid) AS cid, COALESCE(f.pid, e.pid) AS pid,
                 GREATEST(COALESCE(f.q, 0), COALESCE(e.q, 0)) AS q
            FROM (SELECT (x ->> 'cid')::uuid AS cid, (x ->> 'pid')::uuid AS pid, (x ->> 'q')::numeric AS q
                    FROM jsonb_array_elements(v_fifo) x) f
            FULL JOIN (
              SELECT oe.contract_id AS cid, ol.product_id AS pid, SUM(ol.qtd_reservada) AS q
                FROM public.obra_encomenda_cliente oe
                JOIN public.obra_encomenda_cliente_linha ol ON ol.encomenda_id = oe.id
               WHERE oe.organization_id = v_enc.organization_id AND oe.estado = 'validada'
                 AND oe.contract_id <> v_enc.contract_id AND ol.product_id = ANY (v_prods)
               GROUP BY 1, 2
            ) e ON e.cid = f.cid AND e.pid = f.pid
        ) j
       GROUP BY j.pid
    ) y;

  -- As quantidades, linha a linha (por produto, pela ordem das linhas).
  WITH base AS (
    SELECT l.id, l.product_id AS pid, l.qtd_necessaria AS need,
           row_number() OVER (PARTITION BY l.product_id ORDER BY l.ordem, l.criada_em, l.id) AS rn
      FROM public.obra_encomenda_cliente_linha l
     WHERE l.encomenda_id = p_encomenda_id AND l.product_id IS NOT NULL AND l.tipo IN ('produto', 'consumivel')
  ),
  fis AS (
    SELECT s.product_id AS pid, SUM(s.quantity)::numeric AS q
      FROM public.stocks s
      JOIN public.warehouses w ON w.id = s.warehouse_id
     WHERE w.organization_id = v_enc.organization_id AND s.deleted_at IS NULL AND w.deleted_at IS NULL
       AND s.product_id = ANY (v_prods)
     GROUP BY 1
  ),
  serv AS (
    SELECT sm.product_id AS pid,
           SUM(CASE WHEN sm.movement_type = 'venda'
                    THEN sm.quantity - LEAST(sm.quantity, GREATEST(0, -sm.balance_after))
                    ELSE sm.quantity END)::numeric AS q
      FROM public.stock_movements sm
     WHERE sm.sale_source_type = 'contract' AND sm.sale_source_id = v_enc.contract_id
       AND sm.movement_type IN ('venda', 'saida') AND sm.product_id = ANY (v_prods)
       AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
     GROUP BY 1
  ),
  enc AS (
    SELECT poi.product_id AS pid, SUM(poi.quantity * COALESCE(poi.units_per_uom, 1))::numeric AS q
      FROM public.purchase_orders po
      JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
     WHERE po.source_type = 'contract' AND po.source_id = v_enc.contract_id
       AND po.status IS DISTINCT FROM 'cancelled' AND po.deleted_at IS NULL
       AND poi.product_id = ANY (v_prods)
     GROUP BY 1
  ),
  tot AS (
    SELECT b.pid,
           GREATEST(0, COALESCE(sv.q, 0)) AS s_tot,
           GREATEST(0, COALESCE(en.q, 0) - COALESCE((v_cancel ->> b.pid::text)::numeric, 0)) AS p_tot,
           GREATEST(0, COALESCE(fi.q, 0) - COALESCE((v_res ->> b.pid::text)::numeric, 0)) AS a_tot
      FROM (SELECT DISTINCT pid FROM base) b
      LEFT JOIN serv sv ON sv.pid = b.pid
      LEFT JOIN enc en ON en.pid = b.pid
      LEFT JOIN fis fi ON fi.pid = b.pid
  ),
  s1 AS (
    SELECT b.*, t.s_tot, t.p_tot, t.a_tot,
           COALESCE(SUM(b.need) OVER (PARTITION BY b.pid ORDER BY b.rn
                                      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS c1
      FROM base b JOIN tot t ON t.pid = b.pid
  ),
  s2 AS (SELECT s1.*, LEAST(s1.need, GREATEST(0, s1.s_tot - s1.c1)) AS a_serv FROM s1),
  s3 AS (
    SELECT s2.*, COALESCE(SUM(s2.need - s2.a_serv) OVER (PARTITION BY s2.pid ORDER BY s2.rn
                                                         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS c2
      FROM s2
  ),
  s4 AS (SELECT s3.*, LEAST(s3.need - s3.a_serv, GREATEST(0, s3.p_tot - s3.c2)) AS a_po FROM s3),
  s5 AS (
    SELECT s4.*, COALESCE(SUM(s4.need - s4.a_serv - s4.a_po) OVER (PARTITION BY s4.pid ORDER BY s4.rn
                                                                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS c3
      FROM s4
  ),
  s6 AS (SELECT s5.*, LEAST(s5.need - s5.a_serv - s5.a_po, GREATEST(0, s5.a_tot - s5.c3)) AS a_res FROM s5)
  UPDATE public.obra_encomenda_cliente_linha l
     SET qtd_stock = s6.a_serv + s6.a_res,
         qtd_reservada = s6.a_res,
         qtd_em_encomenda = s6.a_po,
         qtd_em_falta = GREATEST(0, s6.need - s6.a_serv - s6.a_po - s6.a_res),
         atualizada_em = now()
    FROM s6
   WHERE l.id = s6.id;

  UPDATE public.obra_encomenda_cliente_linha
     SET qtd_stock = 0, qtd_reservada = 0, qtd_em_encomenda = 0, qtd_em_falta = 0, atualizada_em = now()
   WHERE encomenda_id = p_encomenda_id AND (product_id IS NULL OR tipo NOT IN ('produto', 'consumivel'));

  UPDATE public.obra_encomenda_cliente
     SET estado = 'validada', validada_por = v_user, validada_em = now(), versao = versao + 1, atualizada_em = now()
   WHERE id = p_encomenda_id
  RETURNING versao INTO v_enc.versao;

  -- Uma nota por fornecedor (e uma "sem fornecedor"), com o que falta.
  FOR v_forn IN
    SELECT l.supplier_id
      FROM public.obra_encomenda_cliente_linha l
     WHERE l.encomenda_id = p_encomenda_id AND l.qtd_em_falta > 0 AND l.product_id IS NOT NULL
       AND l.tipo IN ('produto', 'consumivel')
     GROUP BY l.supplier_id
     ORDER BY l.supplier_id NULLS LAST
  LOOP
    INSERT INTO public.nota_encomenda_fornecedor (organization_id, encomenda_cliente_id, supplier_id, versao)
    VALUES (v_enc.organization_id, p_encomenda_id, v_forn.supplier_id, v_enc.versao)
    RETURNING id INTO v_nota;

    INSERT INTO public.nota_encomenda_fornecedor_linha
      (organization_id, nota_id, encomenda_linha_id, product_id, descricao, unidade, qtd, preco_compra,
       quote_line_id, componente_index)
    SELECT v_enc.organization_id, v_nota, l.id, l.product_id, l.descricao, l.unidade, ceil(l.qtd_em_falta),
           l.preco_compra, l.quote_line_id, l.componente_index
      FROM public.obra_encomenda_cliente_linha l
     WHERE l.encomenda_id = p_encomenda_id AND l.qtd_em_falta > 0 AND l.product_id IS NOT NULL
       AND l.tipo IN ('produto', 'consumivel')
       AND l.supplier_id IS NOT DISTINCT FROM v_forn.supplier_id
     ORDER BY l.ordem, l.id;

    PERFORM public.fn_ec_nota_prazo(v_nota);
    v_notas := v_notas + 1;
  END LOOP;

  v_estado := public.fn_ec_estado_fornecedor(p_encomenda_id);

  IF v_notas > 0 THEN
    SELECT COALESCE(cc.contract_number, cc.id::text) INTO v_numero
      FROM public.client_contracts cc WHERE cc.id = v_enc.contract_id;
    v_obra := COALESCE(v_enc.obra_id, public.fn_ec_obra_do_contrato(v_enc.contract_id));
    PERFORM public.fn_ec_avisar(
      v_enc.organization_id, 'purchase_orders.approve', 'nota_encomenda_por_aprovar',
      'Notas de encomenda por aprovar: ' || v_numero,
      'A Encomenda Cliente do contrato ' || v_numero || ' foi validada. ' || v_notas ||
        CASE WHEN v_notas = 1 THEN ' nota de encomenda a fornecedor espera' ELSE ' notas de encomenda a fornecedor esperam' END ||
        ' aprovação.',
      CASE WHEN v_obra IS NOT NULL THEN '/operacao/obras/' || v_obra::text ELSE '/operacao/obras' END,
      'obra_encomenda_cliente', p_encomenda_id, false);
  END IF;

  RETURN jsonb_build_object(
    'encomenda_id', p_encomenda_id,
    'estado', 'validada',
    'fornecedor_estado', v_estado,
    'notas', v_notas,
    'versao', v_enc.versao);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ec_validar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_validar(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_ec_validar(uuid) IS
  'Encomenda Cliente: valida (client_orders.validate), calcula stock / em encomenda / em falta e gera uma nota '
  'de encomenda por fornecedor. Nada em falta → fornecedor_estado = nao_necessaria.';

-- 6.5 rpc_ec_reabrir — validada → rascunho. As notas ainda em proposta ficam
-- rejeitadas ("Encomenda reaberta: …"); as aprovadas ficam (já há encomenda
-- ao fornecedor, que passa a contar como "em encomenda").
CREATE OR REPLACE FUNCTION public.rpc_ec_reabrir(p_encomenda_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_enc  public.obra_encomenda_cliente%ROWTYPE;
  v_user uuid := public.current_business_user_id();
BEGIN
  SELECT * INTO v_enc FROM public.obra_encomenda_cliente WHERE id = p_encomenda_id FOR UPDATE;
  IF v_enc.id IS NULL OR NOT public.ec_pode(v_enc.organization_id, public.ec_perms('validar')) THEN
    RAISE EXCEPTION 'Sem permissão para reabrir a Encomenda Cliente (client_orders.validate).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_enc.estado <> 'validada' THEN
    RAISE EXCEPTION 'Só se reabre uma Encomenda Cliente validada.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo para reabrir.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.nota_encomenda_fornecedor
     SET estado = 'rejeitada', rejeitada_por = v_user, rejeitada_em = now(),
         motivo_rejeicao = 'Encomenda reaberta: ' || btrim(p_motivo), atualizada_em = now()
   WHERE encomenda_cliente_id = p_encomenda_id AND estado = 'proposta';

  UPDATE public.obra_encomenda_cliente
     SET estado = 'rascunho', fornecedor_estado = 'por_gerar',
         reaberta_por = v_user, reaberta_em = now(), reaberta_motivo = btrim(p_motivo), atualizada_em = now()
   WHERE id = p_encomenda_id;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ec_reabrir(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_reabrir(uuid, text) TO authenticated, service_role;


-- ============================================================
-- 7. RPCs das notas de encomenda
-- ============================================================

-- 7.1 rpc_nota_aprovar — cria a purchase_order (status 'pending',
-- source_type 'contract', source_id = contrato) com os itens ligados às
-- linhas do orçamento (quote_line_id / component_index): a reserva FIFO e o
-- botão "Pedir em falta" do CRM passam a contá-los como encomendados.
CREATE OR REPLACE FUNCTION public.rpc_nota_aprovar(p_nota_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_nota   public.nota_encomenda_fornecedor%ROWTYPE;
  v_enc    public.obra_encomenda_cliente%ROWTYPE;
  v_user   uuid := public.current_business_user_id();
  v_po     uuid;
  v_numero text;
BEGIN
  SELECT * INTO v_nota FROM public.nota_encomenda_fornecedor WHERE id = p_nota_id FOR UPDATE;
  IF v_nota.id IS NULL OR NOT public.ec_pode(v_nota.organization_id, public.ec_perms('aprovar')) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar notas de encomenda (purchase_orders.approve).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_nota.estado <> 'proposta' THEN
    RAISE EXCEPTION 'Esta nota já não está por aprovar.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_nota.supplier_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o fornecedor antes de aprovar.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_enc FROM public.obra_encomenda_cliente WHERE id = v_nota.encomenda_cliente_id FOR UPDATE;
  IF v_enc.estado <> 'validada' THEN
    RAISE EXCEPTION 'A Encomenda Cliente não está validada.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Utilizador sem perfil no CRM: não se pode criar a encomenda.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nota_encomenda_fornecedor_linha WHERE nota_id = p_nota_id) THEN
    RAISE EXCEPTION 'A nota não tem linhas.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('rpc_ec:' || v_enc.contract_id::text, 0));
  PERFORM public.fn_ec_nota_prazo(p_nota_id);
  SELECT prazo_previsto INTO v_nota.prazo_previsto FROM public.nota_encomenda_fornecedor WHERE id = p_nota_id;

  SELECT COALESCE(cc.order_number, cc.contract_number, cc.id::text) INTO v_numero
    FROM public.client_contracts cc WHERE cc.id = v_enc.contract_id;

  INSERT INTO public.purchase_orders (
    organization_id, supplier_id, order_date, expected_delivery, status,
    source_type, source_id, notes, created_by
  ) VALUES (
    v_nota.organization_id, v_nota.supplier_id, current_date, v_nota.prazo_previsto, 'pending',
    'contract', v_enc.contract_id,
    format('Nota de encomenda aprovada (Encomenda Cliente %s)', v_numero),
    v_user
  )
  RETURNING id INTO v_po;

  INSERT INTO public.purchase_order_items (
    purchase_order_id, item_type, product_id, description, sku,
    quantity, unit_price, total_price, quote_line_id, component_index
  )
  SELECT v_po, 'product', nl.product_id, nl.descricao, p.sku,
         nl.qtd, COALESCE(nl.preco_compra, 0), round(COALESCE(nl.preco_compra, 0) * nl.qtd, 2),
         nl.quote_line_id, nl.componente_index
    FROM public.nota_encomenda_fornecedor_linha nl
    LEFT JOIN public.products p ON p.id = nl.product_id
   WHERE nl.nota_id = p_nota_id
   ORDER BY nl.criada_em, nl.id;

  UPDATE public.purchase_orders po
     SET total_value = (SELECT COALESCE(SUM(poi.total_price), 0) FROM public.purchase_order_items poi
                         WHERE poi.purchase_order_id = po.id)
   WHERE po.id = v_po;

  UPDATE public.nota_encomenda_fornecedor
     SET estado = 'aprovada', aprovada_por = v_user, aprovada_em = now(), purchase_order_id = v_po, atualizada_em = now()
   WHERE id = p_nota_id;

  -- O que a nota encomendou deixa de estar em falta.
  UPDATE public.obra_encomenda_cliente_linha l
     SET qtd_em_encomenda = l.qtd_em_encomenda + LEAST(l.qtd_em_falta, nl.qtd),
         qtd_em_falta = GREATEST(0, l.qtd_em_falta - nl.qtd),
         atualizada_em = now()
    FROM public.nota_encomenda_fornecedor_linha nl
   WHERE nl.nota_id = p_nota_id AND nl.encomenda_linha_id = l.id;

  PERFORM public.fn_ec_estado_fornecedor(v_enc.id);
  RETURN v_po;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_nota_aprovar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_nota_aprovar(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_nota_aprovar(uuid) IS
  'Nota de encomenda: aprova (purchase_orders.approve) e cria a purchase_order (pending, source_type contract).';

-- 7.2 rpc_nota_rejeitar
CREATE OR REPLACE FUNCTION public.rpc_nota_rejeitar(p_nota_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_nota public.nota_encomenda_fornecedor%ROWTYPE;
BEGIN
  SELECT * INTO v_nota FROM public.nota_encomenda_fornecedor WHERE id = p_nota_id FOR UPDATE;
  IF v_nota.id IS NULL OR NOT public.ec_pode(v_nota.organization_id, public.ec_perms('aprovar')) THEN
    RAISE EXCEPTION 'Sem permissão para rejeitar notas de encomenda (purchase_orders.approve).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_nota.estado <> 'proposta' THEN
    RAISE EXCEPTION 'Esta nota já não está por aprovar.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo da rejeição.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.nota_encomenda_fornecedor
     SET estado = 'rejeitada', rejeitada_por = public.current_business_user_id(), rejeitada_em = now(),
         motivo_rejeicao = btrim(p_motivo), atualizada_em = now()
   WHERE id = p_nota_id;
  PERFORM public.fn_ec_estado_fornecedor(v_nota.encomenda_cliente_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_nota_rejeitar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_nota_rejeitar(uuid, text) TO authenticated, service_role;

-- 7.3 rpc_nota_mudar_fornecedor — passa UMA linha para a nota (em proposta)
-- de outro fornecedor, criando-a se preciso. A nota de onde saiu, se ficar
-- vazia, desaparece. A escolha fica na linha da encomenda (o próximo
-- "Gerar" mantém-na).
CREATE OR REPLACE FUNCTION public.rpc_nota_mudar_fornecedor(p_nota_linha_id uuid, p_supplier_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_nl     public.nota_encomenda_fornecedor_linha%ROWTYPE;
  v_nota   public.nota_encomenda_fornecedor%ROWTYPE;
  v_dest   uuid;
  v_preco  numeric;
  v_user   uuid := public.current_business_user_id();
BEGIN
  SELECT * INTO v_nl FROM public.nota_encomenda_fornecedor_linha WHERE id = p_nota_linha_id;
  SELECT * INTO v_nota FROM public.nota_encomenda_fornecedor WHERE id = v_nl.nota_id FOR UPDATE;
  IF v_nota.id IS NULL OR NOT public.ec_pode(v_nota.organization_id, public.ec_perms('mudar_fornecedor')) THEN
    RAISE EXCEPTION 'Linha não encontrada ou sem permissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_nota.estado <> 'proposta' THEN
    RAISE EXCEPTION 'Só se muda o fornecedor numa nota por aprovar.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_supplier_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.suppliers s
        WHERE s.id = p_supplier_id AND s.deleted_at IS NULL AND COALESCE(s.is_active, true)
          AND (s.organization_id = v_nota.organization_id OR s.organization_id IS NULL)) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_nota.supplier_id IS NOT DISTINCT FROM p_supplier_id THEN
    RETURN v_nota.id;
  END IF;

  SELECT id INTO v_dest FROM public.nota_encomenda_fornecedor
   WHERE encomenda_cliente_id = v_nota.encomenda_cliente_id AND supplier_id = p_supplier_id AND estado = 'proposta'
   FOR UPDATE;
  IF v_dest IS NULL THEN
    INSERT INTO public.nota_encomenda_fornecedor (organization_id, encomenda_cliente_id, supplier_id, versao)
    VALUES (v_nota.organization_id, v_nota.encomenda_cliente_id, p_supplier_id, v_nota.versao)
    RETURNING id INTO v_dest;
  END IF;

  SELECT i.purchase_price INTO v_preco FROM public.item_suppliers i
   WHERE i.product_id = v_nl.product_id AND i.supplier_id = p_supplier_id AND i.deleted_at IS NULL LIMIT 1;

  UPDATE public.nota_encomenda_fornecedor_linha
     SET nota_id = v_dest, preco_compra = COALESCE(v_preco, preco_compra)
   WHERE id = p_nota_linha_id;

  UPDATE public.obra_encomenda_cliente_linha
     SET supplier_id = p_supplier_id, fornecedor_mudado_por = v_user, fornecedor_mudado_em = now(),
         preco_compra = COALESCE(v_preco, preco_compra), atualizada_em = now()
   WHERE id = v_nl.encomenda_linha_id;

  IF NOT EXISTS (SELECT 1 FROM public.nota_encomenda_fornecedor_linha WHERE nota_id = v_nota.id) THEN
    DELETE FROM public.nota_encomenda_fornecedor WHERE id = v_nota.id;
  ELSE
    PERFORM public.fn_ec_nota_prazo(v_nota.id);
  END IF;
  PERFORM public.fn_ec_nota_prazo(v_dest);
  PERFORM public.fn_ec_estado_fornecedor(v_nota.encomenda_cliente_id);
  RETURN v_dest;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_nota_mudar_fornecedor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_nota_mudar_fornecedor(uuid, uuid) TO authenticated, service_role;


-- ============================================================
-- 8. Alerta: encomendas a fornecedor paradas
-- ============================================================
-- purchase_orders em 'pending' há mais de N dias → aviso no sino a quem tem
-- purchase_orders.approve na organização, UMA vez por encomenda (mesmo depois
-- de lido/resolvido). Chamado pelo rpc_ec_obter / rpc_ec_dados_em_falta
-- (best-effort) e por rpc_ec_alertar_paradas (botão ou pg_cron, ver a nota
-- reestruturacao-crm/etapa-pos-contrato-encomendas.md).
CREATE OR REPLACE FUNCTION public.fn_ec_alertar_paradas(p_org uuid, p_dias integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT po.id, COALESCE(po.order_number, left(po.id::text, 8)) AS numero,
           COALESCE(s.name, 'sem fornecedor') AS fornecedor,
           (current_date - po.created_at::date) AS dias
      FROM public.purchase_orders po
      LEFT JOIN public.suppliers s ON s.id = po.supplier_id
     WHERE po.organization_id = p_org AND po.status = 'pending' AND po.deleted_at IS NULL
       AND po.created_at < now() - make_interval(days => GREATEST(1, COALESCE(p_dias, 7)))
  LOOP
    n := n + public.fn_ec_avisar(
      p_org, 'purchase_orders.approve', 'encomenda_fornecedor_parada',
      'Encomenda parada: ' || r.numero,
      'A encomenda ' || r.numero || ' a ' || r.fornecedor || ' está pendente há ' || r.dias || ' dias.',
      '/purchase-orders', 'purchase_order', r.id, true);
  END LOOP;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Alerta de encomendas paradas falhou: %', SQLERRM;
  RETURN 0;
END
$$;

REVOKE ALL ON FUNCTION public.fn_ec_alertar_paradas(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ec_alertar_paradas(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_ec_alertar_paradas(p_org uuid, p_dias integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.ec_pode(p_org, public.ec_perms('ver')) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_ec_alertar_paradas(p_org, p_dias);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ec_alertar_paradas(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_alertar_paradas(uuid, integer) TO authenticated, service_role;


-- ============================================================
-- 9. rpc_ec_obter — cabeçalho + linhas + notas (para os cartões)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_ec_obter(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org   uuid;
  v_cc    record;
  v_enc   public.obra_encomenda_cliente%ROWTYPE;
  v_obra  uuid;
BEGIN
  SELECT cc.organization_id, cc.status, COALESCE(cc.contract_number, cc.id::text) AS numero
    INTO v_cc
    FROM public.client_contracts cc WHERE cc.id = p_contract_id AND cc.deleted_at IS NULL;
  v_org := v_cc.organization_id;
  IF v_org IS NULL OR NOT public.ec_pode(v_org, public.ec_perms('ver')) THEN
    RAISE EXCEPTION 'Contrato não encontrado ou sem permissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_enc FROM public.obra_encomenda_cliente
   WHERE contract_id = p_contract_id AND estado <> 'anulada';

  -- A obra pode ter nascido depois da encomenda.
  IF v_enc.id IS NOT NULL AND v_enc.obra_id IS NULL THEN
    v_obra := public.fn_ec_obra_do_contrato(p_contract_id);
    IF v_obra IS NOT NULL THEN
      UPDATE public.obra_encomenda_cliente SET obra_id = v_obra WHERE id = v_enc.id;
      v_enc.obra_id := v_obra;
    END IF;
  END IF;

  PERFORM public.fn_ec_alertar_paradas(v_org, 7);

  RETURN jsonb_build_object(
    'contrato', jsonb_build_object('id', p_contract_id, 'numero', v_cc.numero, 'estado', v_cc.status,
                                   'assinado', v_cc.status IN ('signed', 'assinado')),
    'pode', jsonb_build_object(
      'editar',  public.ec_pode(v_org, public.ec_perms('editar')),
      'validar', public.ec_pode(v_org, public.ec_perms('validar')),
      'aprovar', public.ec_pode(v_org, public.ec_perms('aprovar')),
      'mudar_fornecedor', public.ec_pode(v_org, public.ec_perms('mudar_fornecedor'))),
    'encomenda', CASE WHEN v_enc.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_enc.id, 'estado', v_enc.estado, 'fornecedor_estado', v_enc.fornecedor_estado,
      'obra_id', v_enc.obra_id, 'versao', v_enc.versao,
      'validada_em', v_enc.validada_em,
      'validada_por_nome', (SELECT u.name FROM public.anew_users u WHERE u.id = v_enc.validada_por),
      'gerada_em', v_enc.gerada_em,
      'reaberta_em', v_enc.reaberta_em, 'reaberta_motivo', v_enc.reaberta_motivo) END,
    'linhas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', l.id, 'tipo', l.tipo, 'product_id', l.product_id, 'service_id', l.service_id,
               'equipamento_id', l.equipamento_id, 'skill_id', l.skill_id,
               'descricao', l.descricao, 'unidade', l.unidade,
               'qtd_necessaria', l.qtd_necessaria, 'qtd_stock', l.qtd_stock,
               'qtd_em_encomenda', l.qtd_em_encomenda, 'qtd_em_falta', l.qtd_em_falta,
               'origem', l.origem, 'quote_id', l.quote_id, 'quote_line_id', l.quote_line_id,
               'supplier_id', l.supplier_id, 'fornecedor_nome', s.name,
               'fornecedor_origem', l.fornecedor_origem,
               'fornecedor_mudado', l.fornecedor_mudado_em IS NOT NULL,
               'preco_compra', l.preco_compra, 'prazo_dias', l.prazo_dias,
               'gere_stock', p.manages_stock,
               'servico_nome', sv.name)
             ORDER BY l.ordem, l.criada_em, l.id)
        FROM public.obra_encomenda_cliente_linha l
        LEFT JOIN public.suppliers s ON s.id = l.supplier_id
        LEFT JOIN public.products p ON p.id = l.product_id
        LEFT JOIN public.services sv ON sv.id = l.service_id
       WHERE l.encomenda_id = v_enc.id), '[]'::jsonb),
    'notas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', n.id, 'estado', n.estado, 'supplier_id', n.supplier_id, 'fornecedor_nome', s.name,
               'fornecedor_email', COALESCE(s.email, s.primary_contact_email),
               'prazo_previsto', n.prazo_previsto, 'versao', n.versao,
               'aprovada_em', n.aprovada_em,
               'aprovada_por_nome', (SELECT u.name FROM public.anew_users u WHERE u.id = n.aprovada_por),
               'rejeitada_em', n.rejeitada_em, 'motivo_rejeicao', n.motivo_rejeicao,
               'purchase_order_id', n.purchase_order_id,
               'purchase_order_numero', po.order_number, 'purchase_order_estado', po.status,
               'total', (SELECT round(COALESCE(SUM(nl.qtd * COALESCE(nl.preco_compra, 0)), 0), 2)
                           FROM public.nota_encomenda_fornecedor_linha nl WHERE nl.nota_id = n.id),
               'linhas', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', nl.id, 'encomenda_linha_id', nl.encomenda_linha_id, 'product_id', nl.product_id,
                          'descricao', nl.descricao, 'unidade', nl.unidade, 'qtd', nl.qtd,
                          'preco_compra', nl.preco_compra) ORDER BY el.ordem NULLS LAST, nl.criada_em, nl.id)
                   FROM public.nota_encomenda_fornecedor_linha nl
                   LEFT JOIN public.obra_encomenda_cliente_linha el ON el.id = nl.encomenda_linha_id
                  WHERE nl.nota_id = n.id), '[]'::jsonb))
             ORDER BY CASE n.estado WHEN 'proposta' THEN 0 WHEN 'aprovada' THEN 1 ELSE 2 END,
                      s.name NULLS FIRST, n.criada_em)
        FROM public.nota_encomenda_fornecedor n
        LEFT JOIN public.suppliers s ON s.id = n.supplier_id
        LEFT JOIN public.purchase_orders po ON po.id = n.purchase_order_id
       WHERE n.encomenda_cliente_id = v_enc.id), '[]'::jsonb),
    'fornecedores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.name) ORDER BY s.name)
        FROM public.suppliers s
       WHERE (s.organization_id = v_org OR s.organization_id IS NULL)
         AND s.deleted_at IS NULL AND COALESCE(s.is_active, true)), '[]'::jsonb)
  );
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ec_obter(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_obter(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_ec_obter(uuid) IS
  'Encomenda Cliente de um contrato: {contrato, pode, encomenda|null, linhas, notas, fornecedores}.';


-- ============================================================
-- 10. Dados em falta + Ligar marca → fornecedor
-- ============================================================
-- O que falta na base para a encomenda andar sozinha, olhando só para o que
-- foi VENDIDO (contratos assinados, todos os orçamentos aceites):
--   · produtos sem fornecedor preferido (com o fornecedor que se resolveria
--     por outra via, se houver), sem preço de compra, sem gestão de stock;
--   · serviços vendidos sem ficha de materiais;
--   · marcas com o nome de um fornecedor existente mas sem ligação;
--   · encomendas a fornecedor paradas há mais de 7 dias.
CREATE OR REPLACE FUNCTION public.rpc_ec_dados_em_falta(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.ec_pode(p_org, public.ec_perms('dados_ver')) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.fn_ec_alertar_paradas(p_org, 7);

  WITH contratos AS (
    SELECT cc.id FROM public.client_contracts cc
     WHERE cc.organization_id = p_org AND cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado')
  ),
  linhas AS (
    SELECT c.id AS contract_id, ql.*
      FROM contratos c
     CROSS JOIN LATERAL public.fn_ec_orcamentos_do_contrato(c.id) o
      JOIN public.quote_lines ql ON ql.quote_id = o.quote_id
  ),
  vendidos AS (
    SELECT l.contract_id, l.product_id FROM linhas l WHERE l.product_id IS NOT NULL
    UNION
    SELECT l.contract_id, (comp.value ->> 'source_id')::uuid
      FROM linhas l
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(l.selected_attributes -> 'bundle_components') = 'array'
            THEN l.selected_attributes -> 'bundle_components' ELSE '[]'::jsonb END) comp(value)
     WHERE l.bundle_id IS NOT NULL AND comp.value ->> 'type' = 'product' AND comp.value ->> 'source_id' IS NOT NULL
  ),
  servicos AS (
    SELECT l.contract_id, l.service_id FROM linhas l WHERE l.service_id IS NOT NULL AND l.product_id IS NULL
    UNION
    SELECT l.contract_id, (comp.value ->> 'source_id')::uuid
      FROM linhas l
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(l.selected_attributes -> 'bundle_components') = 'array'
            THEN l.selected_attributes -> 'bundle_components' ELSE '[]'::jsonb END) comp(value)
     WHERE l.bundle_id IS NOT NULL AND comp.value ->> 'type' = 'service' AND comp.value ->> 'source_id' IS NOT NULL
  ),
  prod AS (
    SELECT p.id, p.name, p.sku, p.brand_id, b.name AS marca, p.manages_stock,
           count(DISTINCT v.contract_id)::integer AS contratos,
           EXISTS (SELECT 1 FROM public.item_suppliers i
                    WHERE i.product_id = p.id AND i.is_preferred AND i.is_active AND i.deleted_at IS NULL) AS tem_preferido,
           EXISTS (SELECT 1 FROM public.item_suppliers i
                    WHERE i.product_id = p.id AND i.deleted_at IS NULL AND i.purchase_price IS NOT NULL)
             OR EXISTS (SELECT 1 FROM public.product_prices pp
                         WHERE pp.product_id = p.id AND pp.price_type = 'purchase') AS tem_preco
      FROM vendidos v
      JOIN public.products p ON p.id = v.product_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
     GROUP BY p.id, p.name, p.sku, p.brand_id, b.name, p.manages_stock
  ),
  prod_res AS (
    SELECT pr.*, f.supplier_id AS resolvido_id, f.origem AS resolvido_origem, s.name AS resolvido_nome
      FROM prod pr
     CROSS JOIN LATERAL public.fn_ec_resolver_fornecedor(p_org, pr.id, NULL) f
      LEFT JOIN public.suppliers s ON s.id = f.supplier_id
  ),
  serv AS (
    SELECT sv.id, sv.name, count(DISTINCT x.contract_id)::integer AS contratos,
           EXISTS (SELECT 1 FROM public.service_materials sm
                    WHERE sm.service_id = sv.id AND sm.deleted_at IS NULL) AS tem_ficha
      FROM servicos x JOIN public.services sv ON sv.id = x.service_id
     GROUP BY sv.id, sv.name
  ),
  marcas AS (
    SELECT b.id AS brand_id, b.name AS marca, s.id AS supplier_id, s.name AS fornecedor,
           (SELECT count(*) FROM public.products p
             WHERE p.brand_id = b.id AND p.deleted_at IS NULL AND p.organization_id = p_org
               AND NOT EXISTS (SELECT 1 FROM public.item_suppliers i
                                WHERE i.product_id = p.id AND i.is_preferred AND i.deleted_at IS NULL))::integer AS produtos,
           (SELECT count(*) FROM prod pr WHERE pr.brand_id = b.id AND NOT pr.tem_preferido)::integer AS vendidos
      FROM public.brands b
      JOIN public.suppliers s
        ON lower(btrim(s.name)) = lower(btrim(b.name)) AND s.deleted_at IS NULL AND COALESCE(s.is_active, true)
       AND (s.organization_id = p_org OR s.organization_id IS NULL)
     WHERE b.deleted_at IS NULL AND (b.organization_id = p_org OR b.organization_id IS NULL)
  ),
  paradas AS (
    SELECT po.id, po.order_number, s.name AS fornecedor, (current_date - po.created_at::date) AS dias,
           po.source_type, po.source_id
      FROM public.purchase_orders po
      LEFT JOIN public.suppliers s ON s.id = po.supplier_id
     WHERE po.organization_id = p_org AND po.status = 'pending' AND po.deleted_at IS NULL
       AND po.created_at < now() - interval '7 days'
  )
  SELECT jsonb_build_object(
    'resumo', jsonb_build_object(
      'produtos_vendidos', (SELECT count(*) FROM prod),
      'sem_fornecedor_preferido', (SELECT count(*) FROM prod WHERE NOT tem_preferido),
      'sem_fornecedor', (SELECT count(*) FROM prod_res WHERE resolvido_id IS NULL),
      'sem_preco_compra', (SELECT count(*) FROM prod WHERE NOT tem_preco),
      'sem_gestao_stock', (SELECT count(*) FROM prod WHERE NOT COALESCE(manages_stock, false)),
      'servicos_vendidos', (SELECT count(*) FROM serv),
      'servicos_sem_ficha', (SELECT count(*) FROM serv WHERE NOT tem_ficha),
      'marcas_por_ligar', (SELECT count(*) FROM marcas WHERE produtos > 0),
      'encomendas_paradas', (SELECT count(*) FROM paradas)),
    'produtos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'product_id', id, 'nome', name, 'sku', sku, 'marca', marca, 'contratos', contratos,
               'tem_preferido', tem_preferido, 'tem_preco', tem_preco,
               'gere_stock', COALESCE(manages_stock, false),
               'resolvido_id', resolvido_id, 'resolvido_nome', resolvido_nome,
               'resolvido_origem', resolvido_origem)
             ORDER BY (resolvido_id IS NULL) DESC, contratos DESC, name)
        FROM (SELECT * FROM prod_res
               WHERE NOT tem_preferido OR NOT tem_preco OR NOT COALESCE(manages_stock, false)
               ORDER BY (resolvido_id IS NULL) DESC, contratos DESC, name LIMIT 500) x), '[]'::jsonb),
    'servicos_sem_ficha', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('service_id', id, 'nome', name, 'contratos', contratos)
             ORDER BY contratos DESC, name)
        FROM (SELECT * FROM serv WHERE NOT tem_ficha ORDER BY contratos DESC, name LIMIT 500) x), '[]'::jsonb),
    'marcas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('brand_id', brand_id, 'marca', marca, 'supplier_id', supplier_id,
                                          'fornecedor', fornecedor, 'produtos', produtos, 'vendidos', vendidos)
             ORDER BY vendidos DESC, produtos DESC, marca)
        FROM marcas WHERE produtos > 0), '[]'::jsonb),
    'encomendas_paradas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('purchase_order_id', id, 'numero', order_number,
                                          'fornecedor', fornecedor, 'dias', dias,
                                          'contrato_id', CASE WHEN source_type = 'contract' THEN source_id END)
             ORDER BY dias DESC)
        FROM paradas), '[]'::jsonb),
    'pode_ligar', public.ec_pode(p_org, public.ec_perms('dados_ligar'))
  ) INTO v;

  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ec_dados_em_falta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_dados_em_falta(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_ec_dados_em_falta(uuid) IS
  'Relatório "Dados em falta" das encomendas: produtos vendidos sem fornecedor / preço / stock gerido, '
  'serviços sem ficha de materiais, marcas por ligar a fornecedor, encomendas paradas.';

-- Ligar marca → fornecedor: os produtos dessa marca (desta organização) SEM
-- fornecedor preferido passam a ter este fornecedor como preferido. Se a
-- ligação produto↔fornecedor já existe, só a marca como preferida; senão cria-a.
-- Ação explícita do utilizador (nunca automática).
CREATE OR REPLACE FUNCTION public.rpc_ec_ligar_marca_fornecedor(p_org uuid, p_brand_id uuid, p_supplier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user     uuid := public.current_business_user_id();
  v_marcadas integer := 0;
  v_criadas  integer := 0;
BEGIN
  IF NOT public.ec_pode(p_org, public.ec_perms('dados_ligar')) THEN
    RAISE EXCEPTION 'Sem permissão para ligar marcas a fornecedores.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brands b WHERE b.id = p_brand_id AND b.deleted_at IS NULL
                   AND (b.organization_id = p_org OR b.organization_id IS NULL)) THEN
    RAISE EXCEPTION 'Marca não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.deleted_at IS NULL
                   AND (s.organization_id = p_org OR s.organization_id IS NULL)) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Utilizador sem perfil no CRM.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ligação já existe (ativa): passa a preferida.
  UPDATE public.item_suppliers i
     SET is_preferred = true, is_active = true
   WHERE i.supplier_id = p_supplier_id AND i.deleted_at IS NULL AND NOT i.is_preferred
     AND i.product_id IN (
       SELECT p.id FROM public.products p
        WHERE p.brand_id = p_brand_id AND p.organization_id = p_org AND p.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.item_suppliers x
                           WHERE x.product_id = p.id AND x.is_preferred AND x.deleted_at IS NULL));
  GET DIAGNOSTICS v_marcadas = ROW_COUNT;

  -- Sem ligação: cria-a, preferida.
  INSERT INTO public.item_suppliers
    (organization_id, item_type, product_id, supplier_id, is_preferred, is_active, currency, created_by, notes)
  SELECT p_org, 'product', p.id, p_supplier_id, true, true, 'EUR', v_user,
         'Ligado pela marca (Dados em falta das encomendas)'
    FROM public.products p
   WHERE p.brand_id = p_brand_id AND p.organization_id = p_org AND p.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.item_suppliers x
                      WHERE x.product_id = p.id AND x.is_preferred AND x.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.item_suppliers x
                      WHERE x.product_id = p.id AND x.supplier_id = p_supplier_id AND x.deleted_at IS NULL);
  GET DIAGNOSTICS v_criadas = ROW_COUNT;

  RETURN jsonb_build_object('marcadas', v_marcadas, 'criadas', v_criadas, 'total', v_marcadas + v_criadas);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ec_ligar_marca_fornecedor(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_ligar_marca_fornecedor(uuid, uuid, uuid) TO authenticated, service_role;


-- ============================================================
-- 11. Permissões
-- ============================================================
-- client_orders.validate é nova (a categoria client_orders já existe:
-- view/create/edit/delete/confirm_stock_exit, 20261205000000).
-- purchase_orders.approve JÁ EXISTE (20261113290000, dada a quem tem
-- purchase_orders.edit): reutiliza-se, não se cria.
INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('client_orders.validate',
   'Validar a Encomenda Cliente',
   'Permite validar a Encomenda Cliente de um contrato assinado (o que a obra precisa: produtos, consumíveis, equipamentos e horas), o que gera as notas de encomenda a fornecedor do que falta, e reabri-la.',
   'client_orders', NULL, 10, false, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- Atribuição PROVISÓRIA (decisão do Ruben por confirmar no ecrã de Funções):
-- quem administra funções (roles.edit) recebe client_orders.validate e
-- purchase_orders.approve (esta só se estiver no catálogo). DISABLE TRIGGER USER
-- pelo mesmo motivo de 20261214100000: trg_protect_system_role_perms recusa
-- escritas em papéis de sistema fora de service_role.
ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, c.code, NULL::uuid
  FROM public.anew_roles ro
 CROSS JOIN (VALUES ('client_orders.validate'), ('purchase_orders.approve')) AS c(code)
 WHERE ro.deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c.code)
   AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                WHERE rp.role_id = ro.id AND rp.permission_code = 'roles.edit')
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;


-- ============================================================
-- 12. CONFERIR
-- ============================================================
DO $conferir$
DECLARE
  v_missing text;
  v_count   integer;
BEGIN
  SELECT string_agg(c.code, ', ') INTO v_missing
    FROM (VALUES ('client_orders.validate'), ('purchase_orders.approve')) AS c(code)
   WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c.code);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: permissões em falta no catálogo: %', v_missing;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.anew_roles ro
   WHERE ro.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp WHERE rp.role_id = ro.id AND rp.permission_code = 'roles.edit')
     AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                      WHERE rp.role_id = ro.id AND rp.permission_code = 'client_orders.validate');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % função(ões) com roles.edit sem client_orders.validate', v_count;
  END IF;

  RAISE NOTICE 'Encomendas pós-contrato instaladas: % Encomenda(s) Cliente, % nota(s).',
    (SELECT count(*) FROM public.obra_encomenda_cliente),
    (SELECT count(*) FROM public.nota_encomenda_fornecedor);
END
$conferir$;
