-- Fase 5.4A do plano de inventário (plano-fornecedores-multi-stock-execucao.md,
-- secção "Fase 5.4 — Contagem física de Inventário (Stocktake)"): fundação de
-- dados + RPCs da Contagem Física de Inventário ("Stocktake"). Sem UI/ecrã —
-- isso é StockCounts.tsx, passo seguinte desta mesma fase.
--
-- Distinção de negócio (confirmada pelo utilizador, base desta fase): "Stocks"
-- = gestão contínua (entradas/saídas/planeamento, já coberto pela Fase 4).
-- "Inventário" = listagem e contagem física detalhada de tudo o que existe,
-- comparada com o sistema — uma diferença é sinal de anomalia a resolver,
-- nunca um dado neutro a só substituir.
--
-- NOTA DE TIMESTAMP: o plano previa 20261115220000 para esta migration, mas
-- `supabase migration list` (corrido antes de escrever este ficheiro) mostrou
-- essa versão — e também 20261116010000 — já aplicadas ao remoto por outra
-- sessão em paralelo (migrations órfãs, sem ficheiro local: "gatilho_orcamento_
-- usa_o_segredo_que_ja_existe" e "corrigir_email_bloqueado_pela_rls_das_
-- propostas", ambas do módulo de Propostas/Orçamentos, sem relação com
-- inventário). Mesmo tipo de incidente já registado 2x no plano ("Pendências
-- à parte" / "Novo tipo de incidente"). Escolhido o próximo timestamp livre:
-- 20261116020000. Os ficheiros órfãos NÃO foram recuperados aqui (fora do
-- âmbito desta tarefa — só esta migration deve ser tocada).
--
-- O que esta migration cria
-- --------------------------
--   1. public.inventory_counts       — cabeçalho de uma sessão de contagem.
--   2. public.inventory_count_lines  — 1 linha por produto contado nessa sessão.
--   3. fn_next_inventory_count_number — INV-NNNN por organização (MAX+1,
--      NUNCA sequência global — mesma cautela de fn_next_stock_document_number,
--      20261113270000).
--   4. Permissão nova `inventory.count` (contar/preencher quantidades, pedir
--      recontagem) — backfill aditivo: todo o papel com `inventory.edit` hoje
--      fica também com `inventory.count`, zero mudança de comportamento
--      (mesmo padrão exato da Fase 4E, 20261113290000).
--   5. RPCs: rpc_create_inventory_count, rpc_update_inventory_count_line_quantity,
--      rpc_resolve_inventory_count_line, rpc_finalize_inventory_count.
--   6. RLS completa nas 2 tabelas novas — reaproveita inventory.view/.count/.edit
--      (nenhuma permissão de leitura nova). UPDATE/DELETE bloqueados sem
--      exceção (RESTRICTIVE USING false) — escrita só através das RPCs
--      (SECURITY DEFINER, correm com os privilégios do dono da função/tabela,
--      que bypassam RLS por definição do Postgres; a RLS aqui serve para
--      bloquear escrita DIRETA via PostgREST/frontend, mesmo padrão já
--      documentado em stock_movements, 20261113260000).
--   7. Audit triggers: fn_generic_entity_audit() (Strategy A) em
--      inventory_counts (tem organization_id direto); função dedicada
--      fn_audit_inventory_count_lines_via_parent() em inventory_count_lines
--      (sem organization_id próprio — resolvido via o cabeçalho, mesmo padrão
--      de fn_audit_purchase_order_items_via_parent, 20260717010000).
--
-- Decisões tomadas que não estavam 100% explícitas na arquitetura do plano
-- (documentadas aqui para confirmação do utilizador):
--
--   D1. UNIQUE (organization_id, document_number) em inventory_counts. O
--       plano só dizia "MAX+1 por organização, nunca sequência global" (igual
--       a fn_next_stock_document_number) mas não falava de unicidade. Ao
--       contrário de stock_movements (onde o mesmo document_number aparece
--       DE PROPÓSITO em 2 linhas de uma transferência, por isso nunca teve
--       UNIQUE), aqui cada document_number representa exatamente 1 sessão —
--       mais parecido com purchase_orders.order_number (que tem UNIQUE por
--       organização). Adicionado UNIQUE para transformar uma eventual colisão
--       rara de MAX+1 num erro claro em vez de duas sessões a partilhar
--       silenciosamente o mesmo "INV-0007".
--
--   D2. rpc_update_inventory_count_line_quantity limpa sempre
--       discrepancy_resolution/resolution_notes/stock_movement_id ao gravar
--       uma nova contagem numa linha que já tinha sido resolvida antes. O
--       plano não descreve este caso (recontar uma linha já resolvida fora do
--       fluxo de "recontagem_pedida"); sem isto, rpc_finalize_inventory_count
--       poderia deixar passar uma linha com uma resolução desatualizada face
--       ao novo valor contado.
--
--   D3. moved_during_count é cumulativo (OR lógico), não recalculado do zero
--       a cada gravação — uma vez assinalado que o saldo mudou durante a
--       contagem, mantém-se assinalado mesmo que o saldo ao vivo volte
--       entretanto a coincidir com o snapshot original. Interpretação de
--       "sinaliza possível timing" (plano) como um facto ocorrido, não um
--       estado instantâneo.
--
--   D4. rpc_resolve_inventory_count_line com p_resolution='recontagem_pedida'
--       limpa também counted_by/counted_at/moved_during_count, além de
--       counted_quantity/discrepancy_resolution/resolution_notes/
--       stock_movement_id explicitamente citados no plano — reset completo da
--       linha ao estado "nunca contada", para não deixar metadados
--       inconsistentes (ex: counted_at de uma contagem entretanto anulada).
--
--   D5. O ajuste de stock gerado por 'ajustado' usa
--       fn_next_stock_document_number(v_org, 'ajuste') — o mesmo gerador de
--       NE-A-NNNN já usado por rpc_adjust_stock — e NÃO reaproveita o
--       document_number da própria contagem (INV-NNNN) como document_number
--       do movimento. O texto do plano ("nota a identificar a sessão, ex:
--       'Contagem física INV-0007', tal como já faz rpc_adjust_stock") foi
--       lido como: o movimento segue a numeração NE-A-NNNN normal de
--       rpc_adjust_stock, e o campo counterparty (onde rpc_adjust_stock grava
--       o motivo/p_reason) leva o texto "Contagem física INV-NNNN" — o INV
--       fica rastreável via reference_id (aponta para a linha da contagem) e
--       via este texto, não substitui a numeração NE-A- própria do ledger.
--
--   D6. category_id (filtro) não é validado contra a organização do chamador
--       — é usado só como filtro de leitura em products.category_id no
--       momento de semear as linhas, nunca escrito. product_categories tem
--       organization_id nullable (categorias partilhadas/globais existem no
--       schema), por isso validar org aqui rejeitaria filtros legítimos por
--       categoria global. Só se valida que a categoria existe.
--
--   D7. Nenhum "is_system_admin_user(...) OR (...)" nas policies (padrão que
--       existe em item_suppliers, 20261112110000) — seguido antes o padrão
--       mais recente e mais próximo em espírito (stock_movements,
--       20261113260000: só organization_id + has_anew_permission), conforme
--       instrução explícita da tarefa para replicar esse ficheiro. Se o
--       utilizador preferir paridade com item_suppliers, é um ajuste pequeno
--       a acrescentar depois.
--
--   D8. CHECK constraint em inventory_count_lines (além da validação da RPC)
--       a exigir resolution_notes não-vazio quando discrepancy_resolution =
--       'aceite_sem_ajuste' — "cinto e suspensórios": a validação da RPC é a
--       garantia real (pedida explicitamente no enunciado), o CHECK é só uma
--       rede de segurança extra ao nível da tabela, sem alterar o
--       comportamento pedido.
--
-- Prerequisitos: 20260615130000 (products, warehouses, stocks, anew_organizations,
-- anew_users, has_anew_permission, get_user_visible_org_ids,
-- current_business_user_id, update_updated_at_column, anew_permissions,
-- anew_role_permissions, protect_system_role_permissions),
-- 20260625010000 + 20261015010000 (fn_generic_entity_audit),
-- 20260717010000 (padrão fn_audit_*_via_parent),
-- 20261108010000 (stocks.deleted_at),
-- 20261113260000 (stock_movements, fn_stock_movements_apply, rpc_decrement_stock),
-- 20261113270000 (fn_next_stock_document_number, rpc_adjust_stock),
-- 20261113290000 (padrão de permissão nova + backfill aditivo replicado aqui).
--
-- Confirmado ao vivo antes de escrever esta migration (supabase db query --linked):
--   · anew_role_permissions com permission_code='inventory.edit': 130 linhas
--     (contagem esperada pós-backfill para 'inventory.count').
--   · inventory.edit em anew_permissions: category='inventory', is_dangerous=false,
--     scope='organization', display_order=0 — mesmos valores replicados aqui
--     para inventory.count.
--   · stocks tem UNIQUE (product_id, warehouse_id) — "unique_product_warehouse".


-- ============================================================
-- 1. public.inventory_counts — cabeçalho de uma sessão de contagem.
-- ============================================================

CREATE TABLE public.inventory_counts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
    warehouse_id    uuid NOT NULL REFERENCES public.warehouses(id),
    category_id     uuid REFERENCES public.product_categories(id),
    document_number text NOT NULL,
    status          text NOT NULL DEFAULT 'em_contagem' CHECK (status IN (
                        'em_contagem', 'finalizada', 'cancelada'
                    )),
    started_at      timestamptz NOT NULL DEFAULT now(),
    finalized_at    timestamptz,
    created_by      uuid NOT NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
    finalized_by    uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_counts_org_document_unique UNIQUE (organization_id, document_number)
);

COMMENT ON TABLE public.inventory_counts IS
  'Cabeçalho de uma sessão de contagem física de inventário (Stocktake, Fase 5.4). '
  '1 sessão = 1 armazém (+ categoria opcional como filtro). document_number '
  '(INV-NNNN) gerado por fn_next_inventory_count_number(), MAX+1 por organização, '
  'nunca sequência global. Escrita só através das RPCs rpc_create_inventory_count/'
  'rpc_finalize_inventory_count — RLS bloqueia UPDATE/DELETE diretos (ver secção 5).';
COMMENT ON COLUMN public.inventory_counts.category_id IS
  'Filtro opcional usado só no momento de semear as linhas (rpc_create_inventory_count) '
  '— não restringe nada depois de criada a sessão.';
COMMENT ON COLUMN public.inventory_counts.status IS
  'em_contagem (default) -> finalizada (rpc_finalize_inventory_count, bloqueada se '
  'sobrar discrepância sem discrepancy_resolution) ou cancelada (fora do âmbito '
  'desta migration — sem RPC de cancelamento ainda).';

CREATE INDEX idx_inventory_counts_org        ON public.inventory_counts (organization_id);
CREATE INDEX idx_inventory_counts_warehouse  ON public.inventory_counts (warehouse_id);
CREATE INDEX idx_inventory_counts_status     ON public.inventory_counts (organization_id, status);

DROP TRIGGER IF EXISTS trg_inventory_counts_updated_at ON public.inventory_counts;
CREATE TRIGGER trg_inventory_counts_updated_at
  BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 2. public.inventory_count_lines — 1 linha por produto contado.
-- ============================================================

CREATE TABLE public.inventory_count_lines (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_count_id        uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
    product_id                uuid NOT NULL REFERENCES public.products(id),
    system_quantity_at_start  integer NOT NULL,
    counted_quantity          integer,
    counted_by                uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
    counted_at                timestamptz,
    discrepancy_resolution    text CHECK (discrepancy_resolution IN (
                                  'ajustado', 'aceite_sem_ajuste', 'recontagem_pedida'
                              )),
    resolution_notes          text,
    moved_during_count        boolean NOT NULL DEFAULT false,
    stock_movement_id         uuid REFERENCES public.stock_movements(id),
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_count_lines_unique_product UNIQUE (inventory_count_id, product_id),
    CONSTRAINT inventory_count_lines_notes_required_check CHECK (
        discrepancy_resolution IS DISTINCT FROM 'aceite_sem_ajuste'
        OR (resolution_notes IS NOT NULL AND btrim(resolution_notes) <> '')
    )
);

COMMENT ON TABLE public.inventory_count_lines IS
  'Linhas de uma sessão de contagem (public.inventory_counts). Semeadas '
  'automaticamente por rpc_create_inventory_count a partir de stocks no momento '
  'da criação (system_quantity_at_start = snapshot imutável). counted_quantity '
  'preenchido por rpc_update_inventory_count_line_quantity (permissão '
  'inventory.count). Diferenças resolvidas linha a linha por '
  'rpc_resolve_inventory_count_line (permissão inventory.edit). Escrita só '
  'através das RPCs — RLS bloqueia UPDATE/DELETE diretos (ver secção 5).';
COMMENT ON COLUMN public.inventory_count_lines.system_quantity_at_start IS
  'Snapshot de stocks.quantity no momento em que a linha foi semeada — nunca '
  'atualizado depois. Usado só como referência informativa; a resolução '
  '''ajustado'' lê o saldo AO VIVO de stocks, não este snapshot.';
COMMENT ON COLUMN public.inventory_count_lines.moved_during_count IS
  'true assim que o saldo ao vivo de stocks divergir do snapshot original em '
  'qualquer momento entre a criação da sessão e a resolução da linha — '
  'cumulativo (nunca volta a false sozinho). Sinaliza possível timing '
  '(produto vendido/comprado durante a contagem); a decisão final continua '
  'humana via discrepancy_resolution.';
COMMENT ON COLUMN public.inventory_count_lines.stock_movement_id IS
  'Preenchido só quando discrepancy_resolution=''ajustado'' e o ajuste gerou '
  'de facto um movimento (diferença != 0 face ao saldo ao vivo no momento da '
  'resolução). NULL para aceite_sem_ajuste/recontagem_pedida ou quando o '
  'saldo ao vivo já coincidia com a contagem.';

CREATE INDEX idx_inventory_count_lines_count    ON public.inventory_count_lines (inventory_count_id);
CREATE INDEX idx_inventory_count_lines_product  ON public.inventory_count_lines (product_id);
CREATE INDEX idx_inventory_count_lines_pending  ON public.inventory_count_lines (inventory_count_id)
  WHERE discrepancy_resolution IS NULL AND counted_quantity IS NOT NULL;

DROP TRIGGER IF EXISTS trg_inventory_count_lines_updated_at ON public.inventory_count_lines;
CREATE TRIGGER trg_inventory_count_lines_updated_at
  BEFORE UPDATE ON public.inventory_count_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 3. fn_next_inventory_count_number — INV-NNNN por organização (MAX+1,
--    nunca sequência global — mesmo padrão de fn_next_stock_document_number,
--    20261113270000).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_next_inventory_count_number(
    p_organization_id uuid
) RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      WHEN document_number ~ '^INV-[0-9]+$'
      THEN substring(document_number FROM 5)::integer
      ELSE 0
    END
  ), 0) + 1
  INTO v_next
  FROM public.inventory_counts
  WHERE organization_id = p_organization_id;

  RETURN 'INV-' || lpad(v_next::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.fn_next_inventory_count_number IS
  'Próximo número de documento de contagem (INV-NNNN), calculado por organização '
  '— mesmo padrão de fn_next_stock_document_number() (20261113270000) e de '
  'generate_po_number() (20261110310000): MAX+1 por organização, nunca uma '
  'sequência Postgres global partilhada entre tenants. Colisão rara sob '
  'concorrência extrema é possível em teoria, mas fica protegida por '
  'inventory_counts_org_document_unique (UNIQUE), que rejeita com erro claro em '
  'vez de silenciosamente duplicar o número.';


-- ============================================================
-- 4. Permissão nova `inventory.count` + backfill aditivo (mesmo padrão exato
--    da Fase 4E, 20261113290000).
-- ============================================================

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope)
VALUES (
  'inventory.count',
  'Contar inventário físico',
  'Permite preencher quantidades contadas numa sessão de contagem física de inventário e pedir recontagem de uma linha, sem poder resolver diferenças (ajustar stock ou aceitar sem ajuste) nem finalizar a sessão — isso continua a exigir inventory.edit.',
  'inventory', NULL, 0, false, 'organization'
)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT role_id, 'inventory.count'
  FROM public.anew_role_permissions
  WHERE permission_code = 'inventory.edit'
  ON CONFLICT (role_id, permission_code) DO NOTHING;
END $$;


-- ============================================================
-- 5. RLS — reaproveita inventory.view/.count/.edit (nenhuma permissão de
--    leitura nova). UPDATE/DELETE bloqueados sem exceção (RESTRICTIVE
--    USING false) — escrita só através das RPCs (SECURITY DEFINER, bypassam
--    RLS por serem donas da tabela), mesmo padrão de stock_movements
--    (20261113260000, secção 4).
-- ============================================================

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_counts_select_policy ON public.inventory_counts
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    AND has_anew_permission((SELECT auth.uid()), 'inventory.view')
  );

CREATE POLICY inventory_counts_insert_policy ON public.inventory_counts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    AND (
      has_anew_permission((SELECT auth.uid()), 'inventory.count')
      OR has_anew_permission((SELECT auth.uid()), 'inventory.edit')
    )
  );

CREATE POLICY inventory_counts_no_update ON public.inventory_counts
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY inventory_counts_no_delete ON public.inventory_counts
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_count_lines_select_policy ON public.inventory_count_lines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_counts ic
      WHERE ic.id = inventory_count_lines.inventory_count_id
        AND ic.organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    )
    AND has_anew_permission((SELECT auth.uid()), 'inventory.view')
  );

CREATE POLICY inventory_count_lines_insert_policy ON public.inventory_count_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventory_counts ic
      WHERE ic.id = inventory_count_lines.inventory_count_id
        AND ic.organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    )
    AND (
      has_anew_permission((SELECT auth.uid()), 'inventory.count')
      OR has_anew_permission((SELECT auth.uid()), 'inventory.edit')
    )
  );

CREATE POLICY inventory_count_lines_no_update ON public.inventory_count_lines
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY inventory_count_lines_no_delete ON public.inventory_count_lines
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);


-- ============================================================
-- 6. Audit triggers.
-- ============================================================

DROP TRIGGER IF EXISTS trg_audit_inventory_counts ON public.inventory_counts;
CREATE TRIGGER trg_audit_inventory_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- inventory_count_lines não tem organization_id próprio (Strategy A da função
-- genérica falharia) nem entity_id (Strategy B/C também falhariam) — mesmo
-- problema já resolvido para purchase_order_items em
-- fn_audit_purchase_order_items_via_parent() (20260717010000). Réplica direta
-- do mesmo padrão, trocando o pai para inventory_counts.

CREATE OR REPLACE FUNCTION public.fn_audit_inventory_count_lines_via_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_parent_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
BEGIN

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );
  v_parent_id := COALESCE(
    (to_jsonb(NEW) ->> 'inventory_count_id')::uuid,
    (to_jsonb(OLD) ->> 'inventory_count_id')::uuid
  );

  IF v_parent_id IS NOT NULL THEN
    SELECT ic.organization_id
    INTO   v_org_id
    FROM   public.inventory_counts ic
    WHERE  ic.id = v_parent_id
    LIMIT 1;
  END IF;

  -- Não consegue determinar a organização (ex: cabeçalho já eliminado por
  -- CASCADE) — sai em silêncio, sem bloquear o DML de origem.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_record         := to_jsonb(NEW);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record         := to_jsonb(OLD);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_inventory_count_lines_via_parent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_inventory_count_lines_via_parent() TO service_role;

DROP TRIGGER IF EXISTS trg_audit_inventory_count_lines ON public.inventory_count_lines;
CREATE TRIGGER trg_audit_inventory_count_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_count_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_inventory_count_lines_via_parent();


-- ============================================================
-- 7. rpc_create_inventory_count — cria o cabeçalho + semeia linhas a partir
--    de stocks (filtro warehouse_id + category_id opcional via join a
--    products). Requer inventory.count OU inventory.edit.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_inventory_count(
    p_organization_id uuid,
    p_warehouse_id    uuid,
    p_category_id     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_count_id     uuid;
  v_doc          text;
  v_lines_seeded integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (
       public.has_anew_permission(auth.uid(), 'inventory.count')
       OR public.has_anew_permission(auth.uid(), 'inventory.edit')
     ) THEN
    RAISE EXCEPTION 'Sem permissão para criar contagens de inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = p_organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_categories WHERE id = p_category_id
  ) THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'check_violation';
  END IF;

  v_doc := public.fn_next_inventory_count_number(p_organization_id);

  INSERT INTO public.inventory_counts (
    organization_id, warehouse_id, category_id, document_number, status, started_at, created_by
  ) VALUES (
    p_organization_id, p_warehouse_id, p_category_id, v_doc, 'em_contagem', now(), v_actor
  )
  RETURNING id INTO v_count_id;

  INSERT INTO public.inventory_count_lines (
    inventory_count_id, product_id, system_quantity_at_start
  )
  SELECT v_count_id, s.product_id, s.quantity
  FROM public.stocks s
  JOIN public.products p ON p.id = s.product_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND p.is_deleted = false
    AND (p_category_id IS NULL OR p.category_id = p_category_id);

  GET DIAGNOSTICS v_lines_seeded = ROW_COUNT;

  RETURN jsonb_build_object(
    'id', v_count_id,
    'document_number', v_doc,
    'status', 'em_contagem',
    'lines_seeded', v_lines_seeded
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_create_inventory_count IS
  'Cria uma sessão de contagem física (inventory_counts, status=em_contagem) e '
  'semeia inventory_count_lines a partir do saldo ATUAL de stocks (não '
  'histórico) para o armazém indicado, filtrado por categoria se fornecida. '
  'system_quantity_at_start fica congelado no momento desta chamada. Exige '
  'inventory.count OU inventory.edit.';

REVOKE ALL ON FUNCTION public.rpc_create_inventory_count FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_inventory_count TO authenticated;


-- ============================================================
-- 8. rpc_update_inventory_count_line_quantity — só contagem em si (sem
--    resolução). Exige só inventory.count.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_inventory_count_line_quantity(
    p_line_id          uuid,
    p_counted_quantity integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid;
  v_org        uuid;
  v_status     text;
  v_product_id uuid;
  v_warehouse_id uuid;
  v_snapshot   integer;
  v_live_qty   integer;
  v_had_resolution boolean;
  v_moved      boolean;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
    RAISE EXCEPTION 'Quantidade contada tem de ser um número não negativo' USING ERRCODE = 'check_violation';
  END IF;

  SELECT ic.organization_id, ic.status, ic.warehouse_id,
         icl.product_id, icl.system_quantity_at_start,
         (icl.discrepancy_resolution IS NOT NULL)
  INTO v_org, v_status, v_warehouse_id, v_product_id, v_snapshot, v_had_resolution
  FROM public.inventory_count_lines icl
  JOIN public.inventory_counts ic ON ic.id = icl.inventory_count_id
  WHERE icl.id = p_line_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Linha de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.count') THEN
    RAISE EXCEPTION 'Sem permissão para contar inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'Esta sessão de contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT quantity INTO v_live_qty
  FROM public.stocks
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

  v_moved := (COALESCE(v_live_qty, 0) IS DISTINCT FROM v_snapshot);

  -- D2: recontar uma linha já resolvida limpa a resolução anterior — evita
  -- que rpc_finalize_inventory_count aceite uma resolução desatualizada face
  -- ao novo valor contado.
  UPDATE public.inventory_count_lines
  SET counted_quantity   = p_counted_quantity,
      counted_by         = v_actor,
      counted_at         = now(),
      -- D3: cumulativo, nunca volta a false sozinho.
      moved_during_count = moved_during_count OR v_moved,
      discrepancy_resolution = CASE WHEN v_had_resolution THEN NULL ELSE discrepancy_resolution END,
      resolution_notes        = CASE WHEN v_had_resolution THEN NULL ELSE resolution_notes END,
      stock_movement_id       = CASE WHEN v_had_resolution THEN NULL ELSE stock_movement_id END
  WHERE id = p_line_id
  RETURNING moved_during_count INTO v_moved;

  RETURN jsonb_build_object(
    'id', p_line_id,
    'counted_quantity', p_counted_quantity,
    'system_quantity_at_start', v_snapshot,
    'moved_during_count', v_moved,
    'resolution_cleared', v_had_resolution
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_update_inventory_count_line_quantity IS
  'Regista a quantidade contada de uma linha (sem resolver diferenças). Marca '
  'moved_during_count=true (cumulativo) se o saldo ao vivo de stocks já '
  'divergir do snapshot original neste momento. Limpa qualquer resolução '
  'anterior da linha (decisão D2, ver cabeçalho da migration). Exige só '
  'inventory.count — resolver/finalizar continua a exigir inventory.edit.';

REVOKE ALL ON FUNCTION public.rpc_update_inventory_count_line_quantity FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_inventory_count_line_quantity TO authenticated;


-- ============================================================
-- 9. rpc_resolve_inventory_count_line — ajustado / aceite_sem_ajuste /
--    recontagem_pedida. Exige inventory.edit.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_resolve_inventory_count_line(
    p_line_id   uuid,
    p_resolution text,
    p_notes      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor          uuid;
  v_org            uuid;
  v_status         text;
  v_document_number text;
  v_product_id     uuid;
  v_warehouse_id   uuid;
  v_counted_qty    integer;
  v_live_qty       integer;
  v_diff           integer;
  v_direction      text;
  v_doc            text;
  v_movement_id    uuid;
  v_balance        integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_resolution NOT IN ('ajustado', 'aceite_sem_ajuste', 'recontagem_pedida') THEN
    RAISE EXCEPTION 'Resolução desconhecida: %', p_resolution USING ERRCODE = 'check_violation';
  END IF;

  SELECT ic.organization_id, ic.status, ic.document_number, ic.warehouse_id,
         icl.product_id, icl.counted_quantity
  INTO v_org, v_status, v_document_number, v_warehouse_id, v_product_id, v_counted_qty
  FROM public.inventory_count_lines icl
  JOIN public.inventory_counts ic ON ic.id = icl.inventory_count_id
  WHERE icl.id = p_line_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Linha de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para resolver discrepâncias de inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'Esta sessão de contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  IF p_resolution = 'recontagem_pedida' THEN
    -- D4: reset completo da linha ao estado "nunca contada".
    UPDATE public.inventory_count_lines
    SET counted_quantity       = NULL,
        counted_by             = NULL,
        counted_at             = NULL,
        discrepancy_resolution = NULL,
        resolution_notes       = NULL,
        stock_movement_id      = NULL,
        moved_during_count     = false
    WHERE id = p_line_id;

    RETURN jsonb_build_object('id', p_line_id, 'discrepancy_resolution', NULL, 'reset', true);
  END IF;

  IF v_counted_qty IS NULL THEN
    RAISE EXCEPTION 'Não é possível resolver uma linha que ainda não foi contada' USING ERRCODE = 'check_violation';
  END IF;

  IF p_resolution = 'aceite_sem_ajuste' THEN
    IF p_notes IS NULL OR btrim(p_notes) = '' THEN
      RAISE EXCEPTION 'Motivo é obrigatório para aceitar a diferença sem ajuste' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.inventory_count_lines
    SET discrepancy_resolution = 'aceite_sem_ajuste',
        resolution_notes       = p_notes,
        stock_movement_id      = NULL
    WHERE id = p_line_id;

    RETURN jsonb_build_object('id', p_line_id, 'discrepancy_resolution', 'aceite_sem_ajuste', 'stock_movement_id', NULL);
  END IF;

  -- p_resolution = 'ajustado' — lê o saldo AO VIVO (não o snapshot), gera o
  -- movimento de ajuste reaproveitando fn_next_stock_document_number (mesma
  -- numeração NE-A-NNNN de rpc_adjust_stock, decisão D5).
  SELECT quantity INTO v_live_qty
  FROM public.stocks
  WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id
  FOR UPDATE;

  IF v_live_qty IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  v_diff := v_counted_qty - v_live_qty;

  IF v_diff = 0 THEN
    -- O saldo ao vivo já coincide com a contagem (ex: outro movimento entretanto
    -- corrigiu a diferença) — nada a ajustar, mas a linha fica resolvida.
    UPDATE public.inventory_count_lines
    SET discrepancy_resolution = 'ajustado',
        resolution_notes       = p_notes,
        stock_movement_id      = NULL
    WHERE id = p_line_id;

    RETURN jsonb_build_object('id', p_line_id, 'discrepancy_resolution', 'ajustado', 'stock_movement_id', NULL, 'adjusted_quantity', 0);
  END IF;

  v_direction := CASE WHEN v_diff > 0 THEN 'positivo' ELSE 'negativo' END;
  v_doc := public.fn_next_stock_document_number(v_org, 'ajuste');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, reference_id, notes, created_by
  ) VALUES (
    v_org, v_product_id, v_warehouse_id, 'ajuste_' || v_direction, abs(v_diff),
    v_doc, 'ajuste', 'Contagem física ' || v_document_number, p_line_id, p_notes, v_actor
  )
  RETURNING id, balance_after INTO v_movement_id, v_balance;

  UPDATE public.inventory_count_lines
  SET discrepancy_resolution = 'ajustado',
      resolution_notes       = p_notes,
      stock_movement_id      = v_movement_id
  WHERE id = p_line_id;

  RETURN jsonb_build_object(
    'id', p_line_id,
    'discrepancy_resolution', 'ajustado',
    'stock_movement_id', v_movement_id,
    'adjusted_quantity', abs(v_diff),
    'balance_after', v_balance
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_resolve_inventory_count_line IS
  'Resolve uma linha com diferença: ajustado (gera stock_movement de ajuste a '
  'partir do saldo AO VIVO, reference_id=linha da contagem, mesma numeração '
  'NE-A-NNNN de rpc_adjust_stock), aceite_sem_ajuste (resolution_notes '
  'obrigatório no servidor) ou recontagem_pedida (reset completo da linha). '
  'Exige inventory.edit — separado de inventory.count (rpc_update_inventory_'
  'count_line_quantity), que só regista a quantidade contada.';

REVOKE ALL ON FUNCTION public.rpc_resolve_inventory_count_line FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_inventory_count_line TO authenticated;


-- ============================================================
-- 10. rpc_finalize_inventory_count — bloqueia se sobrar diferença sem
--     resolução; permite finalizar com linhas nunca contadas (devolve
--     quantas). Exige inventory.edit.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_finalize_inventory_count(
    p_inventory_count_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_org          uuid;
  v_status       text;
  v_warehouse_id uuid;
  v_document_number text;
  v_unresolved   integer;
  v_uncounted    integer;
  v_counted      integer;
  v_total        integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT organization_id, status, warehouse_id, document_number
  INTO v_org, v_status, v_warehouse_id, v_document_number
  FROM public.inventory_counts
  WHERE id = p_inventory_count_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sessão de contagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para finalizar contagens de inventário nesta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'em_contagem' THEN
    RAISE EXCEPTION 'Esta sessão de contagem já não está em curso (estado atual: %)', v_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_unresolved
  FROM public.inventory_count_lines
  WHERE inventory_count_id = p_inventory_count_id
    AND counted_quantity IS NOT NULL
    AND counted_quantity <> system_quantity_at_start
    AND discrepancy_resolution IS NULL;

  IF v_unresolved > 0 THEN
    RAISE EXCEPTION 'Existem % linha(s) com diferença por resolver antes de finalizar a contagem %', v_unresolved, v_document_number
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) FILTER (WHERE counted_quantity IS NULL),
         count(*) FILTER (WHERE counted_quantity IS NOT NULL),
         count(*)
  INTO v_uncounted, v_counted, v_total
  FROM public.inventory_count_lines
  WHERE inventory_count_id = p_inventory_count_id;

  -- Fecha o gap da Fase 4: stocks.last_counted passa a ser escrito para todos
  -- os pares (product_id, warehouse_id) contados nesta sessão.
  UPDATE public.stocks
  SET last_counted = now()
  WHERE warehouse_id = v_warehouse_id
    AND product_id IN (
      SELECT product_id FROM public.inventory_count_lines
      WHERE inventory_count_id = p_inventory_count_id
        AND counted_quantity IS NOT NULL
    );

  UPDATE public.inventory_counts
  SET status = 'finalizada',
      finalized_at = now(),
      finalized_by = v_actor
  WHERE id = p_inventory_count_id;

  RETURN jsonb_build_object(
    'id', p_inventory_count_id,
    'document_number', v_document_number,
    'status', 'finalizada',
    'lines_total', v_total,
    'lines_counted', v_counted,
    'lines_uncounted', v_uncounted
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_finalize_inventory_count IS
  'Finaliza uma sessão de contagem. Bloqueia (RAISE EXCEPTION) se sobrar '
  'alguma linha contada com diferença e sem discrepancy_resolution. Permite '
  'finalizar com linhas nunca contadas (devolve quantas em lines_uncounted). '
  'Atualiza stocks.last_counted=now() para todos os pares (product_id, '
  'warehouse_id) contados nesta sessão. Exige inventory.edit.';

REVOKE ALL ON FUNCTION public.rpc_finalize_inventory_count FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_inventory_count TO authenticated;


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. inventory.count existe em anew_permissions (category='inventory',
--    is_dangerous=false, scope='organization') e o backfill deu exatamente
--    130 linhas em anew_role_permissions (mesma contagem de inventory.edit
--    confirmada ao vivo antes desta migration).
--
-- 2. rpc_create_inventory_count: cria o cabeçalho com document_number
--    INV-0001 (1ª sessão da organização) e semeia 1 linha por stock ativo
--    do armazém (respeitando o filtro de categoria quando fornecido);
--    system_quantity_at_start bate certo com stocks.quantity no momento.
--
-- 3. rpc_update_inventory_count_line_quantity: grava counted_quantity;
--    moved_during_count fica true se stocks.quantity mudar entre a criação
--    da sessão e esta chamada; limpa uma resolução anterior se existir.
--
-- 4. rpc_resolve_inventory_count_line:
--    - 'aceite_sem_ajuste' sem p_notes é rejeitado.
--    - 'ajustado' gera 1 linha em stock_movements (NE-A-NNNN), com
--      reference_id=id da linha e counterparty='Contagem física INV-NNNN',
--      e atualiza stocks.quantity para bater certo com counted_quantity.
--    - 'recontagem_pedida' limpa a linha por completo (volta a poder ser
--      recontada).
--
-- 5. rpc_finalize_inventory_count: rejeita finalizar com alguma diferença
--    por resolver; aceita finalizar com linhas nunca contadas e devolve
--    lines_uncounted correto; stocks.last_counted atualizado só para as
--    linhas contadas nesta sessão.
--
-- 6. RLS: um utilizador sem inventory.view não lê nenhuma das duas tabelas;
--    tentativa de UPDATE/DELETE direto (fora das RPCs) em qualquer uma das
--    duas tabelas é sempre rejeitada (RESTRICTIVE USING false), mesmo por
--    quem tem inventory.edit.
