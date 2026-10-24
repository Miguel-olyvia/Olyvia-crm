-- Venda Direta — Fase 1: base de dados.
-- Módulos: Proposals (simplificado), Client Portal (leitura, Fase 3), Client Orders
--
-- Contexto
-- --------
-- Hoje o único caminho para uma venda de produtos/serviços a um cliente é o
-- fluxo pesado Orçamento -> Proposta -> Contrato (template + assinatura),
-- pensado para obras com diagnóstico, margens por linha e contrato jurídico.
-- Nem todos os negócios precisam disso: por vezes basta uma proposta simples
-- de produtos/serviços que vai ao portal do cliente, o cliente aceita, e a
-- venda segue. Esta migration cria a base de dados de um fluxo alternativo,
-- "Venda Direta":
--
--   direct_sales (proposta simples) --cliente aceita--> proforma (documento
--   NÃO fiscal, emitido a partir dos próprios campos de direct_sales) --depois,
--   noutra fase--> Encomenda de Clientes, reutilizando client_contracts tal
--   como rpc_create_manual_client_order já faz para encomendas manuais
--   (20261130200000).
--
-- Esta migration é Fase 1 (estrutura): cria só as tabelas, numeração,
-- permissões, RLS interna e índices. NÃO cria nenhuma RPC de escrita
-- (rpc_save_direct_sale, aceitação, geração de proforma), nem políticas de
-- portal de cliente, nem a ligação real a client_contracts — ver secção
-- "Fica para as fases seguintes" no fim deste ficheiro.
--
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration.
--
-- Padrões seguidos (ficheiros lidos integralmente antes de escrever esta
-- migration, confirmados por leitura direta do schema — não por adivinhação):
--   20261130200000_rpc_create_manual_client_order.sql
--     -> convenção client_id (anew_clients.id) + entity_id (anew_entities.id)
--        para referenciar o cliente; client_contracts como o "destino" de uma
--        venda depois de aceite.
--   20261130130000_service_technical_sheet_materials.sql
--     -> padrão completo de tabela nova: soft delete via deleted_at/deleted_by,
--        índices parciais ativo/trash, RLS com is_system_admin_user() bypass +
--        get_user_visible_org_ids() + has_anew_permission(), DELETE bloqueado
--        por completo com policy RESTRICTIVE, update_updated_at_column(),
--        sem GRANT explícito de tabela (privilégios de schema já cobrem
--        `authenticated`).
--   20261119140000_fase1_diagnostico_orcamento_regras_e_ia_fallback.sql
--     -> RLS simples de tabela nova com get_user_visible_org_ids(auth.uid()).
--   20261130080000_supplier_sla_and_client_order_permissions.sql +
--   20261113120000_proposals_contracts_export_permissions.sql
--     -> como se criam permissões novas (INSERT ... ON CONFLICT DO NOTHING) e
--        como se sincronizam com os papéis de sistema (System Admin,
--        Super Admin): ALTER TABLE ... DISABLE TRIGGER trg_protect_system_role_perms,
--        INSERT direto para os 2 role_id fixos, ALTER TABLE ... ENABLE TRIGGER.
--   20260615130000_baseline_new_database.sql
--     -> generate_client_contract_number()/set_client_contract_number() e
--        generate_quote_number()/set_quote_number() (padrão de numeração
--        anual por regex); estrutura de quotes/quote_lines (colunas
--        espelhadas em direct_sales/direct_sale_lines); client_contracts
--        (client_id/entity_id/organization_id/root_organization_id,
--        nullability e ON DELETE de cada FK); proposals (sent_at/accepted_at/
--        rejected_at/acceptance_ip/signature_image); anew_permissions.
--
-- ATENÇÃO — única exceção ao "zero ALTER a tabelas existentes": esta migration
-- faz `ALTER TABLE public.anew_role_permissions DISABLE/ENABLE TRIGGER
-- trg_protect_system_role_perms`, estritamente para poder inserir as 4
-- permissões novas nos 2 papéis de sistema (ver secção 4). É o mesmo padrão,
-- linha a linha, de 20261113120000 e 20261130080000/20261130110000 — nunca
-- desativa outros triggers, nunca toca noutras tabelas, e reativa o trigger
-- de imediato a seguir ao INSERT.

-- ============================================================
-- 1. public.direct_sales — cabeçalho da venda direta
-- ============================================================

CREATE TABLE IF NOT EXISTS public.direct_sales (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id        uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
    root_organization_id  uuid REFERENCES public.anew_organizations(id) ON DELETE SET NULL,

    sale_number           text,

    -- Cliente: mesma convenção de client_contracts/quotes — entity_id é a
    -- entidade genérica (anew_entities), client_id é a ficha de cliente
    -- scoped à organização (anew_clients). Nullable ao nível da coluna,
    -- validado como obrigatório pela RPC de escrita (fase seguinte), tal como
    -- client_contracts.client_id/entity_id.
    entity_id             uuid REFERENCES public.anew_entities(id) ON DELETE SET NULL,
    client_id             uuid REFERENCES public.anew_clients(id) ON DELETE SET NULL,

    status                text NOT NULL DEFAULT 'rascunho'
                          CHECK (status IN ('rascunho','enviada','aceite','rejeitada','cancelada')),

    title                 text,
    notes                 text,
    client_notes          text,

    subtotal              numeric(12,2) DEFAULT 0,
    total                 numeric(12,2) DEFAULT 0,
    iva_rate               numeric(5,2) DEFAULT 23,

    -- Aceitação — espelha proposals (sent_at/accepted_at/rejected_at/
    -- acceptance_ip/signature_image), preparação para o portal de cliente da
    -- Fase 3 (ainda sem policy de escrita/leitura para o portal aqui).
    sent_at                timestamptz,
    accepted_at            timestamptz,
    rejected_at            timestamptz,
    acceptance_ip          text,
    signature_image        text,

    -- Proforma — documento NÃO fiscal emitido a partir da venda direta aceite.
    proforma_number        text,
    proforma_issued_at     timestamptz,

    -- Fatura fiscal — hoje preenchida manualmente pela equipa depois de emitir
    -- a fatura noutro sistema; no futuro, escrita pelo módulo de faturação.
    invoice_number         text,
    invoice_issued_at      timestamptz,
    invoice_pdf_url        text,
    invoice_status         text NOT NULL DEFAULT 'pendente'
                          CHECK (invoice_status IN ('pendente','emitida')),

    -- Campos reservados para faturação certificada AT — criados agora para
    -- não obrigar a uma migration de schema quando esse módulo existir, mas
    -- NÃO usados nesta fase nem em nenhuma RPC atual.
    invoice_series         text,
    invoice_atcud          text,
    invoice_hash           text,
    external_invoice_id    text,

    -- Ponte para a Encomenda de Clientes: é aqui que a Fase 5 vai guardar o
    -- client_contracts sintético criado a partir desta venda direta aceite,
    -- reaproveitando a mesma "máquina" de rpc_create_manual_client_order
    -- (dedução de stock, pedido a fornecedor, PDF, listagem em Encomendas
    -- Clientes).
    client_contract_id     uuid REFERENCES public.client_contracts(id) ON DELETE SET NULL,

    created_by             uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    deleted_at             timestamptz,
    deleted_by             uuid,

    CONSTRAINT direct_sales_sale_number_key UNIQUE (sale_number)
);

COMMENT ON TABLE public.direct_sales IS
  'Venda Direta — proposta simples de produtos/serviços enviada ao portal do cliente. Fluxo alternativo, mais leve, ao Orçamento -> Proposta -> Contrato: quando aceite, gera uma proforma (documento não fiscal) e segue para a Encomenda de Clientes via client_contract_id, reutilizando client_contracts tal como rpc_create_manual_client_order (20261130200000). Fase 1 (esta migration): só estrutura — sem RPCs de escrita/aceitação, sem policy de portal de cliente.';

COMMENT ON COLUMN public.direct_sales.sale_number IS
  'Numeração automática VD-YYYY-NNNN, gerada por trigger BEFORE INSERT (set_direct_sale_number -> generate_direct_sale_number), mesmo padrão de generate_quote_number()/generate_client_contract_number(). Funções próprias — não reutiliza a numeração do orçamento.';

COMMENT ON COLUMN public.direct_sales.client_contract_id IS
  'Contrato sintético (client_contracts) criado a partir desta venda direta aceite, para aparecer em Encomendas Clientes com toda a automação existente (stock, fornecedor, PDF). NULL até essa ligação ser criada — implementação prevista para uma fase seguinte (fora do âmbito desta migration). ON DELETE SET NULL: apagar o contrato nunca deve apagar o histórico da venda direta.';

COMMENT ON COLUMN public.direct_sales.proforma_number IS
  'Número da proforma (documento NÃO fiscal) emitida quando o cliente aceita a venda direta. Distinto de invoice_number — a proforma nunca é uma fatura fiscal.';

COMMENT ON COLUMN public.direct_sales.invoice_status IS
  'Estado da fatura fiscal real desta venda: "pendente" até alguém preencher manualmente invoice_number/invoice_issued_at/invoice_pdf_url (ou, no futuro, até o módulo de faturação os preencher automaticamente). Nunca gerado a partir desta migration.';

COMMENT ON COLUMN public.direct_sales.invoice_series IS
  'RESERVADO para faturação certificada AT (série de faturação). Coluna criada agora para não obrigar a alterar o schema mais tarde — não é lida nem escrita por nenhuma função desta migration.';

COMMENT ON COLUMN public.direct_sales.invoice_atcud IS
  'RESERVADO para faturação certificada AT (código único do documento, ATCUD). Não usado nesta fase.';

COMMENT ON COLUMN public.direct_sales.invoice_hash IS
  'RESERVADO para faturação certificada AT (hash de encadeamento do documento). Não usado nesta fase.';

COMMENT ON COLUMN public.direct_sales.external_invoice_id IS
  'RESERVADO para o id do documento no sistema de faturação externo/certificado, quando existir integração. Não usado nesta fase.';


-- ------------------------------------------------------------
-- Numeração — funções próprias (não reutiliza generate_quote_number()),
-- mesmo padrão de generate_client_contract_number()/set_client_contract_number().
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_direct_sale_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $_$
DECLARE
  year_part text;
  sequence_num integer;
BEGIN
  year_part := EXTRACT(YEAR FROM CURRENT_DATE)::text;

  SELECT COALESCE(MAX(
    CASE
      WHEN sale_number ~ '^VD-[0-9]{4}-[0-9]+$'
      THEN (regexp_match(sale_number, '^VD-[0-9]{4}-([0-9]+)$'))[1]::integer
      ELSE 0
    END
  ), 0) + 1
  INTO sequence_num
  FROM public.direct_sales
  WHERE sale_number LIKE 'VD-' || year_part || '-%';

  RETURN 'VD-' || year_part || '-' || LPAD(sequence_num::text, 4, '0');
END;
$_$;

REVOKE ALL ON FUNCTION public.generate_direct_sale_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_direct_sale_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_direct_sale_number() TO service_role;

COMMENT ON FUNCTION public.generate_direct_sale_number() IS
  'Gera o próximo sale_number no formato VD-YYYY-NNNN, por ano. Mesmo padrão de generate_quote_number()/generate_client_contract_number(); função própria de direct_sales, não partilhada.';

CREATE OR REPLACE FUNCTION public.set_direct_sale_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sale_number IS NULL THEN
    NEW.sale_number := public.generate_direct_sale_number();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_direct_sale_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_direct_sale_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_direct_sale_number() TO service_role;

DROP TRIGGER IF EXISTS trigger_set_direct_sale_number ON public.direct_sales;
CREATE TRIGGER trigger_set_direct_sale_number
  BEFORE INSERT ON public.direct_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_direct_sale_number();


-- ------------------------------------------------------------
-- updated_at
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS update_direct_sales_updated_at ON public.direct_sales;
CREATE TRIGGER update_direct_sales_updated_at
  BEFORE UPDATE ON public.direct_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ------------------------------------------------------------
-- Auditoria — fn_generic_entity_audit() (Strategy A, organization_id direto
-- na própria linha), mesmo padrão de client_contracts/quotes ao nível do
-- documento. As linhas (direct_sale_lines) não têm trigger próprio, tal como
-- quote_lines — a alteração em massa das linhas é auditada ao nível do
-- documento pai quando a RPC de escrita existir (fase seguinte).
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_direct_sales ON public.direct_sales;
CREATE TRIGGER trg_audit_direct_sales
  AFTER INSERT OR UPDATE OR DELETE ON public.direct_sales
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();


-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_direct_sales_org         ON public.direct_sales(organization_id);
CREATE INDEX IF NOT EXISTS idx_direct_sales_status       ON public.direct_sales(status);
CREATE INDEX IF NOT EXISTS idx_direct_sales_created_at   ON public.direct_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_direct_sales_entity        ON public.direct_sales(entity_id);
CREATE INDEX IF NOT EXISTS idx_direct_sales_client         ON public.direct_sales(client_id);
CREATE INDEX IF NOT EXISTS idx_direct_sales_client_contract ON public.direct_sales(client_contract_id)
  WHERE client_contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_direct_sales_active
  ON public.direct_sales(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_direct_sales_trash
  ON public.direct_sales(organization_id) WHERE deleted_at IS NOT NULL;


-- ============================================================
-- 2. public.direct_sale_lines — linhas de produto/serviço da venda direta
-- ============================================================
-- Espelha quote_lines nas colunas que fazem sentido para uma venda direta
-- (produto/serviço + preço + IVA/desconto, sem secções nem categorias de
-- obra, que não existem neste fluxo). Nomes e tipos copiados de quote_lines
-- coluna a coluna — nada inventado. Inclui também total_sem_iva/total_com_iva/
-- total_com_desconto (não pedidos explicitamente, mas necessários para somar
-- direct_sales.subtotal/total — mesmos nomes já usados em quote_lines,
-- sinalizado no relatório final).
--
-- Sem organization_id próprio, alinhado com quote_lines: a organização deriva
-- sempre do cabeçalho (direct_sales.organization_id) via direct_sale_id. Evita
-- um campo denormalizado que pode dessincronizar do pai, e faz com que a RLS
-- das linhas seja obrigatoriamente ancorada na organização do cabeçalho.

CREATE TABLE IF NOT EXISTS public.direct_sale_lines (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    direct_sale_id        uuid NOT NULL REFERENCES public.direct_sales(id) ON DELETE CASCADE,

    product_id            uuid REFERENCES public.products(id),
    service_id            uuid REFERENCES public.services(id),

    descricao_snapshot    text NOT NULL,
    qt                    numeric(10,2) DEFAULT 0,
    unidade                text,

    cost_price             numeric DEFAULT 0,
    retail_price_unit      numeric(10,2),
    margem_percent          numeric(5,2) DEFAULT 20,
    iva_percent             numeric(5,2) DEFAULT 23,
    discount_percent       numeric DEFAULT 0,

    total_sem_iva          numeric(10,2) DEFAULT 0,
    total_com_iva           numeric(10,2) DEFAULT 0,
    total_com_desconto      numeric(10,2) DEFAULT 0,

    ordem                   integer DEFAULT 0,
    visible_to_client       boolean NOT NULL DEFAULT true,

    created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.direct_sale_lines IS
  'Linhas de produto/serviço de uma Venda Direta (public.direct_sales). Espelha quote_lines nas colunas equivalentes (descricao_snapshot, qt, unidade, retail_price_unit, cost_price, iva_percent, discount_percent, margem_percent, ordem, product_id, service_id, visible_to_client), sem secções/categorias de obra, que não existem neste fluxo. Escrita direta (INSERT/UPDATE/DELETE) autorizada por direct_sales.create/edit nesta fase — sem RPC dedicada ainda.';

COMMENT ON COLUMN public.direct_sale_lines.visible_to_client IS
  'Quando false, a linha existe na venda direta interna mas não é mostrada ao cliente (mesma semântica de quote_lines.visible_to_client) — preparação para o portal de cliente da Fase 3, sem policy de leitura de portal ainda.';


-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_direct_sale_lines_sale     ON public.direct_sale_lines(direct_sale_id);
CREATE INDEX IF NOT EXISTS idx_direct_sale_lines_product      ON public.direct_sale_lines(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_direct_sale_lines_service         ON public.direct_sale_lines(service_id) WHERE service_id IS NOT NULL;


-- ============================================================
-- 3. RLS — public.direct_sales e public.direct_sale_lines
-- ============================================================
-- Leitura com direct_sales.view, escrita com direct_sales.create/edit,
-- sempre dentro de get_user_visible_org_ids(auth.uid()), com bypass total
-- para is_system_admin_user() — mesmo padrão de service_materials
-- (20261130130000). AINDA SEM políticas para o portal do cliente (anon nem
-- client_portal_users) — isso é a Fase 3, fora do âmbito desta migration.
--
-- DELETE em direct_sales é bloqueado por completo (RESTRICTIVE): é um
-- documento com histórico de aceitação/proforma/fatura, nunca deve
-- desaparecer fisicamente — soft delete (deleted_at/deleted_by) fica para a
-- RPC de uma fase seguinte, tal como o padrão de service_materials/
-- item_suppliers. direct_sale_lines, ao contrário, tem DELETE normal
-- (gated por direct_sales.edit): sem soft delete próprio, precisa de poder
-- ser apagada/reinserida ao editar uma venda direta em rascunho, mesmo
-- padrão funcional de quote_fees.

ALTER TABLE public.direct_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS direct_sales_select_policy ON public.direct_sales;
CREATE POLICY direct_sales_select_policy ON public.direct_sales
  FOR SELECT USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'direct_sales.view')
    )
  );

DROP POLICY IF EXISTS direct_sales_insert_policy ON public.direct_sales;
CREATE POLICY direct_sales_insert_policy ON public.direct_sales
  FOR INSERT WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'direct_sales.create')
    )
  );

DROP POLICY IF EXISTS direct_sales_update_policy ON public.direct_sales;
CREATE POLICY direct_sales_update_policy ON public.direct_sales
  FOR UPDATE USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'direct_sales.edit')
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'direct_sales.edit')
    )
  );

DROP POLICY IF EXISTS direct_sales_no_delete ON public.direct_sales;
CREATE POLICY direct_sales_no_delete ON public.direct_sales
  AS RESTRICTIVE FOR DELETE USING (false);


ALTER TABLE public.direct_sale_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS direct_sale_lines_select_policy ON public.direct_sale_lines;
CREATE POLICY direct_sale_lines_select_policy ON public.direct_sale_lines
  FOR SELECT USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'direct_sales.view')
      AND EXISTS (
        SELECT 1 FROM public.direct_sales ds
        WHERE ds.id = direct_sale_lines.direct_sale_id
          AND ds.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      )
    )
  );

DROP POLICY IF EXISTS direct_sale_lines_insert_policy ON public.direct_sale_lines;
CREATE POLICY direct_sale_lines_insert_policy ON public.direct_sale_lines
  FOR INSERT WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'direct_sales.create')
      AND EXISTS (
        SELECT 1 FROM public.direct_sales ds
        WHERE ds.id = direct_sale_lines.direct_sale_id
          AND ds.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      )
    )
  );

DROP POLICY IF EXISTS direct_sale_lines_update_policy ON public.direct_sale_lines;
CREATE POLICY direct_sale_lines_update_policy ON public.direct_sale_lines
  FOR UPDATE USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'direct_sales.edit')
      AND EXISTS (
        SELECT 1 FROM public.direct_sales ds
        WHERE ds.id = direct_sale_lines.direct_sale_id
          AND ds.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'direct_sales.edit')
      AND EXISTS (
        SELECT 1 FROM public.direct_sales ds
        WHERE ds.id = direct_sale_lines.direct_sale_id
          AND ds.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      )
    )
  );

DROP POLICY IF EXISTS direct_sale_lines_delete_policy ON public.direct_sale_lines;
CREATE POLICY direct_sale_lines_delete_policy ON public.direct_sale_lines
  FOR DELETE USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'direct_sales.edit')
      AND EXISTS (
        SELECT 1 FROM public.direct_sales ds
        WHERE ds.id = direct_sale_lines.direct_sale_id
          AND ds.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      )
    )
  );


-- ============================================================
-- 4. Permissões — direct_sales.view/create/edit/delete
-- ============================================================
-- Categoria nova ('direct_sales'), display_order 0..3. Sem backfill
-- automático para papéis normais (comportamento restritivo por omissão,
-- mesmo padrão de 20261130080000) — mas, ao contrário dessa migration,
-- concede-se explicitamente a System Admin e Super Admin no mesmo ficheiro,
-- seguindo a recomendação deixada em 20261130110000 ("sempre que se criar
-- uma permissão nova, replicar também para System Admin e Super Admin no
-- mesmo ficheiro de migration, para não repetir este gap") e o padrão já
-- usado em 20261113120000 (DISABLE/ENABLE de trg_protect_system_role_perms
-- só à volta do INSERT necessário).

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope)
VALUES
  (
    'direct_sales.view',
    'Ver vendas diretas',
    'Permite ver a listagem e o detalhe de Vendas Diretas (propostas simples de produtos/serviços) e o respetivo histórico de proforma/fatura.',
    'direct_sales', NULL, 0, false, 'organization'
  ),
  (
    'direct_sales.create',
    'Criar vendas diretas',
    'Permite criar uma Venda Direta nova (rascunho) e as suas linhas de produto/serviço.',
    'direct_sales', NULL, 1, false, 'organization'
  ),
  (
    'direct_sales.edit',
    'Editar vendas diretas',
    'Permite editar uma Venda Direta existente e as suas linhas, incluindo estado, notas e campos de proforma/fatura.',
    'direct_sales', NULL, 2, false, 'organization'
  ),
  (
    'direct_sales.delete',
    'Eliminar vendas diretas',
    'Permite eliminar (soft delete, via RPC de uma fase seguinte) uma Venda Direta. Ação sensível — pode envolver uma venda já aceite ou faturada.',
    'direct_sales', NULL, 3, true, 'organization'
  )
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.role_id, p.code
FROM (VALUES
  ('03a43423-9b3c-4640-9dbe-31687f829869'::uuid), -- System Admin
  ('e91ef94e-a5e6-415c-9985-0c2b7594720b'::uuid)  -- Super Admin
) AS r(role_id)
CROSS JOIN (VALUES
  ('direct_sales.view'),
  ('direct_sales.create'),
  ('direct_sales.edit'),
  ('direct_sales.delete')
) AS p(code)
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Tabelas e trigger de numeração criados:
--      SELECT table_name FROM information_schema.tables
--      WHERE table_schema = 'public' AND table_name IN ('direct_sales','direct_sale_lines');
--      SELECT generate_direct_sale_number(); -- 'VD-2026-0001' na primeira chamada
--
-- 2. RLS: um utilizador sem direct_sales.view não vê nenhuma linha em
--    direct_sales/direct_sale_lines, mesmo dentro do seu âmbito de
--    organização; um utilizador com direct_sales.create mas sem
--    direct_sales.edit não consegue fazer UPDATE nem DELETE de linhas:
--      SELECT policyname, cmd FROM pg_policies
--      WHERE tablename IN ('direct_sales','direct_sale_lines') ORDER BY tablename, cmd;
--
-- 3. DELETE direto em direct_sales está sempre bloqueado (RESTRICTIVE),
--    mesmo para quem tem direct_sales.delete — essa permissão só produz
--    efeito quando existir a RPC de soft delete (fase seguinte):
--      DELETE FROM direct_sales WHERE id = '...'; -- deve falhar sempre
--
-- 4. Permissões novas existem e System Admin/Super Admin ficam com as 4:
--      SELECT code FROM anew_permissions WHERE category = 'direct_sales';
--      SELECT permission_code FROM anew_role_permissions
--      WHERE role_id IN ('03a43423-9b3c-4640-9dbe-31687f829869','e91ef94e-a5e6-415c-9985-0c2b7594720b')
--        AND permission_code LIKE 'direct_sales.%';
--      -- Esperado: 4 linhas por role_id.
--
-- 5. trg_protect_system_role_perms volta a ficar ativo ('O') depois desta
--    migration:
--      SELECT tgenabled FROM pg_trigger
--      WHERE tgrelid = 'public.anew_role_permissions'::regclass
--        AND tgname = 'trg_protect_system_role_perms';
--
--
-- ============================================================
-- Fica para as fases seguintes (fora do âmbito desta migration)
-- ============================================================
-- - RPC de escrita (rpc_save_direct_sale, ou equivalente) — hoje não há
--   nenhum caminho de aplicação que valide "produto XOR serviço por linha"
--   nem que recalcule subtotal/total; a RLS permite INSERT/UPDATE direto nas
--   duas tabelas, mas fica a cargo do frontend/RPC futura garantir a
--   consistência dos valores.
-- - Envio ao portal do cliente + aceitação (sent_at/accepted_at/rejected_at/
--   acceptance_ip/signature_image só têm as colunas; nenhuma RPC os escreve).
-- - Políticas de RLS para o portal do cliente (client_portal_users / anon)
--   em direct_sales/direct_sale_lines — Fase 3.
-- - Emissão da proforma (proforma_number/proforma_issued_at) — hoje só
--   colunas, sem geração de PDF nem numeração própria.
-- - Ligação real a client_contracts: nenhuma função cria ainda o contrato
--   sintético nem escreve direct_sales.client_contract_id — Fase 5, prevista
--   para reutilizar o padrão de rpc_create_manual_client_order (20261130200000).
-- - Faturação fiscal real: invoice_number/invoice_issued_at/invoice_pdf_url
--   continuam a ser preenchidos à mão; invoice_series/invoice_atcud/
--   invoice_hash/external_invoice_id ficam reservados e por usar até existir
--   integração com faturação certificada AT.
