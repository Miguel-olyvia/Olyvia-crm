-- ============================================================
-- 20261214110000_area_custos
-- ============================================================
-- Área de custos (plano de 06/10, etapa 2) e margem mínima por linha de
-- serviço com aprovação da Direção (decisão do Ruben, 13/10/2026).
--
-- Decisões que este ficheiro aplica:
--   • a margem conta SOBRE O PREÇO: (preço − custo) ÷ preço;
--   • a margem mínima é POR LINHA DE SERVIÇO (service_categories: WC,
--     Cozinha…), por organização; a linha que não tem valor próprio herda a
--     da categoria-mãe e, no fim, a margem mínima geral dos parâmetros;
--   • abaixo do mínimo a proposta fica à espera da aprovação da Direção
--     (permissão margins.approve); abaixo do custo bloqueia SEMPRE;
--   • os salários só os vê quem tem costs.salaries.view. A tabela
--     cost_profiles só se lê com essa permissão; o resto da plataforma lê o
--     custo/hora por rpc_custos_perfis, que devolve o salário a NULL.
--
-- Contas (espelhadas em src/lib/custos/, com testes vitest):
--   custo/mês do perfil = salário × meses/12 × (1 + TSU)
--                         + subsídio de alimentação × dias + seguro/mês
--   custo/hora          = custo/mês ÷ horas produtivas/mês × (1 + encargos)
--                         (ou o custo/hora manual do perfil, quando existe)
--   equipamento €/h     = (compra − residual) ÷ vida útil (h)
--                         + manutenção anual ÷ horas de uso por ano
--   estrutura €/h       = Σ valor mensal (ativos) ÷ horas produtivas da empresa/mês
--   custo por medida    = Σ horas × €/h (mão de obra) + Σ horas × €/h (equip.)
--                         + Σ quantidade × preço (consumíveis)
--                         [+ horas × estrutura €/h, se somar_estrutura]
--
-- Idempotente: pode correr-se duas vezes (validado em
-- tools/validar-custos-crm.mjs com PGlite). Não altera nenhuma tabela
-- existente; só lê services, service_categories, service_prices,
-- catalog_items, quotes e quote_lines.
--
-- Pré-requisitos: as funções do núcleo get_user_visible_org_ids,
-- has_anew_permission e current_business_user_id (baseline).

-- ============================================================
-- 1. Permissões (categoria 'costs')
-- ============================================================

INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('costs.view',
   'Ver a área de custos',
   'Permite abrir a página Custos (/custos): parâmetros, custo/hora dos perfis (sem salários), equipamentos, estrutura, margens por linha de serviço e receitas dos serviços.',
   'costs', NULL, 0, false, 'organization', false),
  ('costs.edit',
   'Editar a área de custos',
   'Permite mudar parâmetros, perfis (sem o salário), equipamentos, custos de estrutura e as receitas dos serviços.',
   'costs', 'costs.view', 1, false, 'organization', false),
  ('costs.salaries.view',
   'Ver e mudar salários',
   'Permite ver e mudar o salário base dos perfis de custo. Sem esta permissão só se vê o custo/hora.',
   'costs', 'costs.view', 2, true, 'organization', false),
  ('margins.approve',
   'Aprovar margens abaixo do mínimo (Direção)',
   'Permite aprovar ou recusar os orçamentos com margem abaixo do mínimo da linha de serviço, e definir as margens mínima e alvo de cada linha. Abaixo do custo nunca se aprova.',
   'costs', NULL, 3, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- Atribuição inicial (DECISÃO PENDENTE do Ruben: confirmar quem é a Direção
-- em cada organização e ajustar no ecrã de Funções):
--   • costs.view                 → quem já vê custos de serviços ou de orçamentos
--                                  (services.view_cost, quotes.view_costs) e quem
--                                  administra funções (roles.edit);
--   • costs.edit                 → quem gere preços de serviços
--                                  (services.manage_prices) e roles.edit;
--   • costs.salaries.view e margins.approve → só quem administra funções
--                                  (roles.edit), que é a administração.
-- DISABLE TRIGGER USER pelo mesmo motivo de 20261210130000: o gatilho
-- trg_protect_system_role_perms recusa escritas em papéis is_system fora de
-- service_role. Junta anew_roles (deleted_at IS NULL) para não criar órfãs.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, 'costs.view', NULL::uuid
FROM public.anew_roles ro
WHERE ro.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
              WHERE rp.role_id = ro.id
                AND rp.permission_code IN ('services.view_cost', 'quotes.view_costs', 'roles.edit'))
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, 'costs.edit', NULL::uuid
FROM public.anew_roles ro
WHERE ro.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
              WHERE rp.role_id = ro.id
                AND rp.permission_code IN ('services.manage_prices', 'roles.edit'))
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, c.code, NULL::uuid
FROM public.anew_roles ro
CROSS JOIN (VALUES ('costs.salaries.view'), ('margins.approve')) AS c(code)
WHERE ro.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
              WHERE rp.role_id = ro.id AND rp.permission_code = 'roles.edit')
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================
-- 2. Tabelas
-- ============================================================

-- 2.1 Parâmetros: uma linha por organização. Os valores por omissão são os do
-- Método de Orçamentação BMG (TSU 23,75%, overhead 7,5%, subsídio 6,15 €/dia,
-- 22 dias, 173,33 h/mês, margem mínima 28% e alvo 35%).
CREATE TABLE IF NOT EXISTS public.cost_parameters (
  organization_id          uuid PRIMARY KEY REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  meses_salario            numeric(5,2)  NOT NULL DEFAULT 14     CHECK (meses_salario > 0),
  tsu_pct                  numeric(6,3)  NOT NULL DEFAULT 23.75  CHECK (tsu_pct >= 0),
  encargos_pct             numeric(6,3)  NOT NULL DEFAULT 7.5    CHECK (encargos_pct >= 0),
  subsidio_alimentacao_dia numeric(8,2)  NOT NULL DEFAULT 6.15   CHECK (subsidio_alimentacao_dia >= 0),
  dias_subsidio_mes        numeric(5,2)  NOT NULL DEFAULT 22     CHECK (dias_subsidio_mes >= 0),
  seguro_mes               numeric(10,2) NOT NULL DEFAULT 0      CHECK (seguro_mes >= 0),
  horas_produtivas_mes     numeric(8,2)  NOT NULL DEFAULT 173.33 CHECK (horas_produtivas_mes > 0),
  horas_empresa_mes        numeric(10,2) NOT NULL DEFAULT 0      CHECK (horas_empresa_mes >= 0),
  somar_estrutura          boolean       NOT NULL DEFAULT false,
  meses_desatualizado      integer       NOT NULL DEFAULT 6      CHECK (meses_desatualizado BETWEEN 1 AND 60),
  margem_minima_padrao     numeric(5,2)  NOT NULL DEFAULT 28     CHECK (margem_minima_padrao BETWEEN 0 AND 99),
  margem_alvo_padrao       numeric(5,2)  NOT NULL DEFAULT 35     CHECK (margem_alvo_padrao BETWEEN 0 AND 99),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  updated_by               uuid
);
COMMENT ON TABLE public.cost_parameters IS 'Área de custos: parâmetros de cálculo por organização (encargos, tempo, margens por omissão).';
COMMENT ON COLUMN public.cost_parameters.encargos_pct IS 'Overhead sobre o custo da mão de obra (seguro de acidentes + formação), em %.';
COMMENT ON COLUMN public.cost_parameters.seguro_mes IS '€ por pessoa e por mês somados ao custo do perfil (seguros, medicina, fardamento).';
COMMENT ON COLUMN public.cost_parameters.horas_produtivas_mes IS 'Horas produtivas de UM técnico por mês: divide o custo/mês do perfil.';
COMMENT ON COLUMN public.cost_parameters.horas_empresa_mes IS 'Horas produtivas da EMPRESA por mês (todos os técnicos): divide a estrutura. 0 = estrutura não calculada.';
COMMENT ON COLUMN public.cost_parameters.somar_estrutura IS 'true: o custo dos serviços soma horas × estrutura €/h. false (método BMG): a estrutura fica paga pela margem.';

-- 2.2 Perfis de custo (categoria salarial). O salário só se lê com
-- costs.salaries.view (ver RLS e rpc_custos_perfis).
CREATE TABLE IF NOT EXISTS public.cost_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  nome              text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 120),
  salario_base      numeric(10,2) CHECK (salario_base IS NULL OR salario_base >= 0),
  encargos_pct      numeric(6,3)  CHECK (encargos_pct IS NULL OR encargos_pct >= 0),
  custo_hora_manual numeric(10,2) CHECK (custo_hora_manual IS NULL OR custo_hora_manual >= 0),
  ativo             boolean NOT NULL DEFAULT true,
  ordem             integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid
);
CREATE INDEX IF NOT EXISTS idx_cost_profiles_org ON public.cost_profiles (organization_id);
COMMENT ON TABLE public.cost_profiles IS 'Área de custos: perfis (categorias salariais). Salário visível só com costs.salaries.view.';
COMMENT ON COLUMN public.cost_profiles.encargos_pct IS 'Substitui o encargos_pct dos parâmetros só para este perfil (NULL = o dos parâmetros).';
COMMENT ON COLUMN public.cost_profiles.custo_hora_manual IS '€/h escrito à mão (ex.: subempreiteiro). Quando existe, manda sobre o calculado.';

-- 2.3 Equipamentos.
CREATE TABLE IF NOT EXISTS public.cost_equipment (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  nome              text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 120),
  compra            numeric(12,2) NOT NULL DEFAULT 0    CHECK (compra >= 0),
  vida_util_horas   numeric(10,2) NOT NULL DEFAULT 1500 CHECK (vida_util_horas > 0),
  residual          numeric(12,2) NOT NULL DEFAULT 0    CHECK (residual >= 0),
  manutencao_anual  numeric(12,2) NOT NULL DEFAULT 0    CHECK (manutencao_anual >= 0),
  uso_horas_ano     numeric(10,2) NOT NULL DEFAULT 600  CHECK (uso_horas_ano >= 0),
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cost_equipment_org ON public.cost_equipment (organization_id);
COMMENT ON TABLE public.cost_equipment IS 'Área de custos: equipamentos. €/h = (compra − residual) ÷ vida útil + manutenção anual ÷ uso por ano.';

-- 2.4 Estrutura (custos fixos do mês).
CREATE TABLE IF NOT EXISTS public.cost_structure_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  descricao        text NOT NULL CHECK (length(btrim(descricao)) BETWEEN 1 AND 160),
  categoria        text NOT NULL DEFAULT 'outro'
                   CHECK (categoria IN ('renda','viaturas','seguros','pessoal_nao_operacional','licencas_software','energia_agua','financeiro','outro')),
  valor_mensal     numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_mensal >= 0),
  ativo            boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cost_structure_items_org ON public.cost_structure_items (organization_id);
COMMENT ON TABLE public.cost_structure_items IS 'Área de custos: custos de estrutura mensais. Taxa €/h = Σ ativos ÷ horas produtivas da empresa.';

-- 2.5 Receita de um serviço: a medida e três listas (mão de obra,
-- equipamentos, consumíveis), cada uma por medida.
CREATE TABLE IF NOT EXISTS public.service_recipes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  service_id       uuid NOT NULL UNIQUE REFERENCES public.services(id) ON DELETE CASCADE,
  medida           text NOT NULL DEFAULT 'un' CHECK (length(btrim(medida)) BETWEEN 1 AND 30),
  notas            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_recipes_org ON public.service_recipes (organization_id);
COMMENT ON TABLE public.service_recipes IS 'Receita do serviço: medida (m², pt, un…) e as linhas de custo por medida.';

CREATE TABLE IF NOT EXISTS public.service_recipe_labor (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  recipe_id         uuid NOT NULL REFERENCES public.service_recipes(id) ON DELETE CASCADE,
  perfil_id         uuid NOT NULL REFERENCES public.cost_profiles(id) ON DELETE RESTRICT,
  descricao         text,
  horas_por_medida  numeric(10,4) NOT NULL DEFAULT 0 CHECK (horas_por_medida >= 0),
  ordem             integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_recipe_labor_recipe ON public.service_recipe_labor (recipe_id);
CREATE INDEX IF NOT EXISTS idx_service_recipe_labor_perfil ON public.service_recipe_labor (perfil_id);

CREATE TABLE IF NOT EXISTS public.service_recipe_equipment (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  recipe_id         uuid NOT NULL REFERENCES public.service_recipes(id) ON DELETE CASCADE,
  equipamento_id    uuid NOT NULL REFERENCES public.cost_equipment(id) ON DELETE RESTRICT,
  horas_por_medida  numeric(10,4) NOT NULL DEFAULT 0 CHECK (horas_por_medida >= 0),
  ordem             integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_recipe_equipment_recipe ON public.service_recipe_equipment (recipe_id);
CREATE INDEX IF NOT EXISTS idx_service_recipe_equipment_equip ON public.service_recipe_equipment (equipamento_id);

CREATE TABLE IF NOT EXISTS public.service_recipe_consumables (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  recipe_id              uuid NOT NULL REFERENCES public.service_recipes(id) ON DELETE CASCADE,
  catalog_item_id        uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  descricao              text,
  unidade                text,
  quantidade_por_medida  numeric(12,4) NOT NULL DEFAULT 0 CHECK (quantidade_por_medida >= 0),
  preco_unitario         numeric(12,4) CHECK (preco_unitario IS NULL OR preco_unitario >= 0),
  preco_atualizado_em    timestamptz,
  ordem                  integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_recipe_consumables_recipe ON public.service_recipe_consumables (recipe_id);
COMMENT ON COLUMN public.service_recipe_consumables.preco_unitario IS 'Preço próprio da receita. NULL = catalog_items.custo_material.';
COMMENT ON COLUMN public.service_recipe_consumables.preco_atualizado_em IS 'Data do preço próprio (posta pelo gatilho). Sem preço próprio conta catalog_items.updated_at.';

-- 2.6 Margem mínima e alvo por linha de serviço (service_categories).
CREATE TABLE IF NOT EXISTS public.service_line_margins (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  service_category_id  uuid NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  margem_minima        numeric(5,2) NOT NULL CHECK (margem_minima BETWEEN 0 AND 99),
  margem_alvo          numeric(5,2) NOT NULL CHECK (margem_alvo BETWEEN 0 AND 99),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid,
  UNIQUE (organization_id, service_category_id),
  CHECK (margem_alvo >= margem_minima)
);
COMMENT ON TABLE public.service_line_margins IS 'Margem mínima e alvo (sobre o preço, %) por linha de serviço. Sem linha própria herda da categoria-mãe e depois dos parâmetros.';

-- 2.7 Pedidos de aprovação de margem (Direção).
CREATE TABLE IF NOT EXISTS public.margin_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  quote_id          uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  pedida_por        uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  pedida_em         timestamptz NOT NULL DEFAULT now(),
  margem            numeric(7,2),
  margem_linha_min  numeric(7,2),
  margem_minima     numeric(5,2),
  alertas           jsonb NOT NULL DEFAULT '[]'::jsonb,
  motivo            text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 5 AND 1000),
  estado            text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','aprovada','recusada','anulada')),
  decidida_por      uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  decidida_em       timestamptz,
  motivo_decisao    text CHECK (motivo_decisao IS NULL OR length(motivo_decisao) <= 1000)
);
CREATE INDEX IF NOT EXISTS idx_margin_approvals_org_estado ON public.margin_approvals (organization_id, estado);
CREATE INDEX IF NOT EXISTS idx_margin_approvals_quote ON public.margin_approvals (quote_id, pedida_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_margin_approvals_pendente ON public.margin_approvals (quote_id) WHERE estado = 'pendente';
COMMENT ON TABLE public.margin_approvals IS 'Pedidos de aprovação de orçamentos com margem abaixo do mínimo da linha. Escrita só por rpc_margem_pedir_aprovacao / rpc_margem_decidir. "anulada" = substituída por um pedido novo.';

-- ============================================================
-- 3. Gatilhos
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_custos_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cost_parameters_touch ON public.cost_parameters;
CREATE TRIGGER trg_cost_parameters_touch BEFORE UPDATE ON public.cost_parameters
  FOR EACH ROW EXECUTE FUNCTION public.fn_custos_touch();
DROP TRIGGER IF EXISTS trg_cost_profiles_touch ON public.cost_profiles;
CREATE TRIGGER trg_cost_profiles_touch BEFORE UPDATE ON public.cost_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_custos_touch();
DROP TRIGGER IF EXISTS trg_cost_equipment_touch ON public.cost_equipment;
CREATE TRIGGER trg_cost_equipment_touch BEFORE UPDATE ON public.cost_equipment
  FOR EACH ROW EXECUTE FUNCTION public.fn_custos_touch();
DROP TRIGGER IF EXISTS trg_cost_structure_items_touch ON public.cost_structure_items;
CREATE TRIGGER trg_cost_structure_items_touch BEFORE UPDATE ON public.cost_structure_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_custos_touch();
DROP TRIGGER IF EXISTS trg_service_recipes_touch ON public.service_recipes;
CREATE TRIGGER trg_service_recipes_touch BEFORE UPDATE ON public.service_recipes
  FOR EACH ROW EXECUTE FUNCTION public.fn_custos_touch();
DROP TRIGGER IF EXISTS trg_service_line_margins_touch ON public.service_line_margins;
CREATE TRIGGER trg_service_line_margins_touch BEFORE UPDATE ON public.service_line_margins
  FOR EACH ROW EXECUTE FUNCTION public.fn_custos_touch();

-- A data do preço próprio de um consumível muda quando o preço muda.
CREATE OR REPLACE FUNCTION public.fn_custos_consumivel_data()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.preco_unitario IS NULL THEN
    NEW.preco_atualizado_em := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.preco_atualizado_em := COALESCE(NEW.preco_atualizado_em, now());
  ELSIF NEW.preco_unitario IS DISTINCT FROM OLD.preco_unitario
        AND NEW.preco_atualizado_em IS NOT DISTINCT FROM OLD.preco_atualizado_em THEN
    NEW.preco_atualizado_em := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_recipe_consumables_data ON public.service_recipe_consumables;
CREATE TRIGGER trg_service_recipe_consumables_data BEFORE INSERT OR UPDATE ON public.service_recipe_consumables
  FOR EACH ROW EXECUTE FUNCTION public.fn_custos_consumivel_data();

-- ============================================================
-- 4. RLS
-- ============================================================
-- Ler: organização visível + costs.view. Escrever: + costs.edit.
-- cost_profiles: ler a tabela só com costs.salaries.view; escrever só por RPC.
-- service_line_margins: escrever exige também margins.approve (Direção).
-- margin_approvals: ler com margins.approve, quotes.view ou sendo quem pediu;
--                   escrever só por RPC.

ALTER TABLE public.cost_parameters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_equipment             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_structure_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_recipes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_recipe_labor       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_recipe_equipment   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_recipe_consumables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_line_margins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.margin_approvals           ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cost_parameters, public.cost_profiles, public.cost_equipment,
              public.cost_structure_items, public.service_recipes, public.service_recipe_labor,
              public.service_recipe_equipment, public.service_recipe_consumables,
              public.service_line_margins, public.margin_approvals FROM anon;

-- Tabelas simples (parâmetros, equipamentos, estrutura, receita).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cost_parameters','cost_equipment','cost_structure_items','service_recipes',
                           'service_recipe_labor','service_recipe_equipment','service_recipe_consumables']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
             AND public.has_anew_permission((SELECT auth.uid()), 'costs.view'))$p$, t || '_select', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
             AND public.has_anew_permission((SELECT auth.uid()), 'costs.edit'))$p$, t || '_delete', t);
  END LOOP;
END $$;

-- INSERT/UPDATE: as filhas da receita têm de ficar na mesma organização da
-- receita, e a receita na organização do serviço.
DO $$
DECLARE
  t text;
  extra text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cost_parameters','cost_equipment','cost_structure_items','service_recipes',
                           'service_recipe_labor','service_recipe_equipment','service_recipe_consumables']
  LOOP
    -- Qualificar com o nome da tabela: dentro do EXISTS, um organization_id
    -- solto resolvia para a tabela do subselect, e a verificação passava sempre.
    extra := CASE t
      WHEN 'service_recipes' THEN
        ' AND EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_recipes.service_id AND s.organization_id = service_recipes.organization_id)'
      WHEN 'service_recipe_labor' THEN
        ' AND EXISTS (SELECT 1 FROM public.service_recipes r WHERE r.id = service_recipe_labor.recipe_id AND r.organization_id = service_recipe_labor.organization_id)'
        || ' AND EXISTS (SELECT 1 FROM public.cost_profiles p WHERE p.id = service_recipe_labor.perfil_id AND p.organization_id = service_recipe_labor.organization_id)'
      WHEN 'service_recipe_equipment' THEN
        ' AND EXISTS (SELECT 1 FROM public.service_recipes r WHERE r.id = service_recipe_equipment.recipe_id AND r.organization_id = service_recipe_equipment.organization_id)'
        || ' AND EXISTS (SELECT 1 FROM public.cost_equipment e WHERE e.id = service_recipe_equipment.equipamento_id AND e.organization_id = service_recipe_equipment.organization_id)'
      WHEN 'service_recipe_consumables' THEN
        ' AND EXISTS (SELECT 1 FROM public.service_recipes r WHERE r.id = service_recipe_consumables.recipe_id AND r.organization_id = service_recipe_consumables.organization_id)'
      ELSE '' END;
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
                  AND public.has_anew_permission((SELECT auth.uid()), 'costs.edit')%s)$p$, t || '_insert', t, extra);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
             AND public.has_anew_permission((SELECT auth.uid()), 'costs.edit'))
      WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
                  AND public.has_anew_permission((SELECT auth.uid()), 'costs.edit')%s)$p$, t || '_update', t, extra);
  END LOOP;
END $$;

-- cost_profiles: a tabela (com o salário) só se lê com costs.salaries.view.
DROP POLICY IF EXISTS cost_profiles_select ON public.cost_profiles;
CREATE POLICY cost_profiles_select ON public.cost_profiles FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND public.has_anew_permission((SELECT auth.uid()), 'costs.view')
         AND public.has_anew_permission((SELECT auth.uid()), 'costs.salaries.view'));
REVOKE INSERT, UPDATE, DELETE ON public.cost_profiles FROM authenticated;

-- service_line_margins: ler com costs.view; escrever com costs.edit + margins.approve.
DROP POLICY IF EXISTS service_line_margins_select ON public.service_line_margins;
DROP POLICY IF EXISTS service_line_margins_insert ON public.service_line_margins;
DROP POLICY IF EXISTS service_line_margins_update ON public.service_line_margins;
DROP POLICY IF EXISTS service_line_margins_delete ON public.service_line_margins;
CREATE POLICY service_line_margins_select ON public.service_line_margins FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND (public.has_anew_permission((SELECT auth.uid()), 'costs.view')
              OR public.has_anew_permission((SELECT auth.uid()), 'margins.approve')));
CREATE POLICY service_line_margins_insert ON public.service_line_margins FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              AND public.has_anew_permission((SELECT auth.uid()), 'margins.approve')
              AND EXISTS (SELECT 1 FROM public.service_categories c
                          WHERE c.id = service_line_margins.service_category_id
                            AND c.organization_id = service_line_margins.organization_id));
CREATE POLICY service_line_margins_update ON public.service_line_margins FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND public.has_anew_permission((SELECT auth.uid()), 'margins.approve'))
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              AND public.has_anew_permission((SELECT auth.uid()), 'margins.approve'));
CREATE POLICY service_line_margins_delete ON public.service_line_margins FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND public.has_anew_permission((SELECT auth.uid()), 'margins.approve'));

-- margin_approvals: só leitura direta.
DROP POLICY IF EXISTS margin_approvals_select ON public.margin_approvals;
CREATE POLICY margin_approvals_select ON public.margin_approvals FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
         AND (public.has_anew_permission((SELECT auth.uid()), 'margins.approve')
              OR public.has_anew_permission((SELECT auth.uid()), 'quotes.view')
              OR pedida_por = public.current_business_user_id()));
REVOKE INSERT, UPDATE, DELETE ON public.margin_approvals FROM authenticated;

-- ============================================================
-- 5. Funções de cálculo (puras e internas)
-- ============================================================

-- 5.1 Custo/hora a partir do salário (pura; espelho: src/lib/custos/custoHora.ts).
CREATE OR REPLACE FUNCTION public.fn_custo_hora_calc(
  p_salario numeric, p_meses numeric, p_tsu_pct numeric, p_subsidio_dia numeric,
  p_dias numeric, p_seguro_mes numeric, p_horas_mes numeric, p_encargos_pct numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE
    WHEN p_salario IS NULL OR COALESCE(p_horas_mes, 0) <= 0 THEN NULL
    ELSE ( p_salario * COALESCE(p_meses, 14) / 12 * (1 + COALESCE(p_tsu_pct, 0) / 100)
           + COALESCE(p_subsidio_dia, 0) * COALESCE(p_dias, 0)
           + COALESCE(p_seguro_mes, 0) )
         / p_horas_mes * (1 + COALESCE(p_encargos_pct, 0) / 100)
  END
$$;

-- 5.2 €/h de um equipamento (pura; espelho: src/lib/custos/amortizacao.ts).
CREATE OR REPLACE FUNCTION public.fn_custo_hora_equipamento(
  p_compra numeric, p_vida_horas numeric, p_residual numeric, p_manutencao_anual numeric, p_uso_horas_ano numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT (CASE WHEN COALESCE(p_vida_horas, 0) > 0
               THEN GREATEST(COALESCE(p_compra, 0) - COALESCE(p_residual, 0), 0) / p_vida_horas ELSE 0 END)
       + (CASE WHEN COALESCE(p_uso_horas_ano, 0) > 0
               THEN COALESCE(p_manutencao_anual, 0) / p_uso_horas_ano ELSE 0 END)
$$;

-- 5.3 Os parâmetros de uma organização (os valores por omissão, se não houver
-- linha — os mesmos DEFAULT da tabela).
CREATE OR REPLACE FUNCTION public.fn_custos_parametros(p_org uuid)
RETURNS public.cost_parameters LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE r public.cost_parameters;
BEGIN
  SELECT * INTO r FROM public.cost_parameters WHERE organization_id = p_org;
  IF NOT FOUND THEN
    r.organization_id := p_org;
    r.meses_salario := 14; r.tsu_pct := 23.75; r.encargos_pct := 7.5;
    r.subsidio_alimentacao_dia := 6.15; r.dias_subsidio_mes := 22; r.seguro_mes := 0;
    r.horas_produtivas_mes := 173.33; r.horas_empresa_mes := 0; r.somar_estrutura := false;
    r.meses_desatualizado := 6; r.margem_minima_padrao := 28; r.margem_alvo_padrao := 35;
  END IF;
  RETURN r;
END $$;

-- 5.4 Custo/hora de um perfil (manual, ou calculado com os parâmetros).
CREATE OR REPLACE FUNCTION public.fn_custo_hora_perfil(p_perfil_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  p public.cost_profiles;
  par public.cost_parameters;
BEGIN
  SELECT * INTO p FROM public.cost_profiles WHERE id = p_perfil_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p.custo_hora_manual IS NOT NULL THEN RETURN p.custo_hora_manual; END IF;
  par := public.fn_custos_parametros(p.organization_id);
  RETURN public.fn_custo_hora_calc(p.salario_base, par.meses_salario, par.tsu_pct, par.subsidio_alimentacao_dia,
                                   par.dias_subsidio_mes, par.seguro_mes, par.horas_produtivas_mes,
                                   COALESCE(p.encargos_pct, par.encargos_pct));
END $$;

-- 5.5 Custo/hora médio dos perfis ativos com custo (usado quando um perfil não tem).
CREATE OR REPLACE FUNCTION public.fn_custos_media_hora(p_org uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT AVG(h) FROM (
    SELECT public.fn_custo_hora_perfil(id) AS h FROM public.cost_profiles
    WHERE organization_id = p_org AND ativo) x
  WHERE h IS NOT NULL
$$;

-- 5.6 Estrutura €/h (espelho: src/lib/custos/estruturaHora.ts).
CREATE OR REPLACE FUNCTION public.fn_custo_estrutura_hora(p_org uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  par public.cost_parameters := public.fn_custos_parametros(p_org);
  v_total numeric;
BEGIN
  IF COALESCE(par.horas_empresa_mes, 0) <= 0 THEN RETURN 0; END IF;
  SELECT COALESCE(SUM(valor_mensal), 0) INTO v_total
  FROM public.cost_structure_items WHERE organization_id = p_org AND ativo;
  RETURN v_total / par.horas_empresa_mes;
END $$;

-- 5.7 Margem mínima e alvo de uma linha de serviço: a da categoria, senão a da
-- categoria-mãe mais próxima, senão a dos parâmetros.
CREATE OR REPLACE FUNCTION public.fn_margem_linha(p_org uuid, p_categoria uuid)
RETURNS TABLE (margem_minima numeric, margem_alvo numeric, categoria_id uuid, origem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE par public.cost_parameters := public.fn_custos_parametros(p_org);
BEGIN
  IF p_categoria IS NOT NULL THEN
    RETURN QUERY
      WITH RECURSIVE sobe(id, parent_id, nivel) AS (
        SELECT c.id, c.parent_id, 0 FROM public.service_categories c WHERE c.id = p_categoria
        UNION ALL
        SELECT c.id, c.parent_id, s.nivel + 1
        FROM public.service_categories c JOIN sobe s ON c.id = s.parent_id
        WHERE s.nivel < 10)
      SELECT m.margem_minima, m.margem_alvo, m.service_category_id,
             CASE WHEN s.nivel = 0 THEN 'linha' ELSE 'linha_mae' END
      FROM sobe s JOIN public.service_line_margins m
        ON m.service_category_id = s.id AND m.organization_id = p_org
      ORDER BY s.nivel LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
  RETURN QUERY SELECT par.margem_minima_padrao::numeric, par.margem_alvo_padrao::numeric, NULL::uuid, 'geral'::text;
END $$;

-- 5.8 Custo de um serviço pela receita (espelho: src/lib/custos/custoServico.ts).
-- Devolve jsonb com o detalhe, o custo por medida, o preço de tabela
-- (service_prices 'retail' em vigor), a margem e os avisos.
CREATE OR REPLACE FUNCTION public.fn_custo_servico_calc(p_service_id uuid, p_quantidade numeric DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  s record;
  rec public.service_recipes;
  par public.cost_parameters;
  v_media numeric;
  v_estr_h numeric;
  v_h numeric := 0; v_mo numeric := 0; v_eq numeric := 0; v_cons numeric := 0; v_estr numeric := 0;
  v_total numeric; v_preco numeric; v_margem numeric;
  v_qt numeric := COALESCE(p_quantidade, 1);
  l record;
  v_eh numeric;
  v_mo_l jsonb := '[]'::jsonb; v_eq_l jsonb := '[]'::jsonb; v_cons_l jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_sem_ch text[] := ARRAY[]::text[];
  v_velhos text[] := ARRAY[]::text[];
  v_sem_preco text[] := ARRAY[]::text[];
  v_limite date;
  m record;
BEGIN
  SELECT sv.id, sv.name, sv.organization_id, sv.service_category_id INTO s
  FROM public.services sv WHERE sv.id = p_service_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  par := public.fn_custos_parametros(s.organization_id);
  SELECT * INTO m FROM public.fn_margem_linha(s.organization_id, s.service_category_id);

  SELECT sp.price INTO v_preco FROM public.service_prices sp
  WHERE sp.service_id = p_service_id AND sp.price_type = 'retail'
    AND (sp.valid_from IS NULL OR sp.valid_from <= now())
    AND (sp.valid_to IS NULL OR sp.valid_to >= now())
  ORDER BY sp.valid_from DESC NULLS LAST, sp.created_at DESC NULLS LAST LIMIT 1;

  SELECT * INTO rec FROM public.service_recipes WHERE service_id = p_service_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'service_id', s.id, 'servico', s.name, 'tem_receita', false, 'medida', NULL,
      'quantidade', v_qt, 'custo_por_medida', NULL, 'custo_total', NULL,
      'preco_tabela', v_preco, 'margem', NULL,
      'margem_minima', m.margem_minima, 'margem_alvo', m.margem_alvo, 'origem_margem', m.origem,
      'avisos', jsonb_build_array(jsonb_build_object('tipo', 'sem_receita', 'nivel', 'aviso',
                 'mensagem', 'Serviço sem receita na área de custos: custo desconhecido.')));
  END IF;

  v_media  := public.fn_custos_media_hora(s.organization_id);
  v_estr_h := CASE WHEN par.somar_estrutura THEN public.fn_custo_estrutura_hora(s.organization_id) ELSE 0 END;
  v_limite := (current_date - make_interval(months => par.meses_desatualizado))::date;

  FOR l IN
    SELECT rl.id, rl.descricao, rl.horas_por_medida, p.id AS perfil_id, p.nome AS perfil
    FROM public.service_recipe_labor rl JOIN public.cost_profiles p ON p.id = rl.perfil_id
    WHERE rl.recipe_id = rec.id ORDER BY rl.ordem, rl.created_at
  LOOP
    v_eh := public.fn_custo_hora_perfil(l.perfil_id);
    IF v_eh IS NULL THEN
      IF NOT (l.perfil = ANY (v_sem_ch)) THEN v_sem_ch := v_sem_ch || l.perfil; END IF;
      v_eh := COALESCE(v_media, 0);
    END IF;
    v_h  := v_h + l.horas_por_medida;
    v_mo := v_mo + l.horas_por_medida * v_eh;
    v_mo_l := v_mo_l || jsonb_build_object('id', l.id, 'perfil_id', l.perfil_id, 'perfil', l.perfil,
      'descricao', l.descricao, 'horas', l.horas_por_medida, 'custo_hora', round(v_eh, 4),
      'custo', round(l.horas_por_medida * v_eh, 4));
  END LOOP;

  FOR l IN
    SELECT re.id, re.horas_por_medida, e.id AS equipamento_id, e.nome,
           public.fn_custo_hora_equipamento(e.compra, e.vida_util_horas, e.residual, e.manutencao_anual, e.uso_horas_ano) AS eh
    FROM public.service_recipe_equipment re JOIN public.cost_equipment e ON e.id = re.equipamento_id
    WHERE re.recipe_id = rec.id ORDER BY re.ordem, re.created_at
  LOOP
    v_eq := v_eq + l.horas_por_medida * l.eh;
    v_eq_l := v_eq_l || jsonb_build_object('id', l.id, 'equipamento_id', l.equipamento_id, 'equipamento', l.nome,
      'horas', l.horas_por_medida, 'custo_hora', round(l.eh, 4), 'custo', round(l.horas_por_medida * l.eh, 4));
  END LOOP;

  FOR l IN
    SELECT rc.id, rc.quantidade_por_medida, rc.unidade, rc.catalog_item_id,
           COALESCE(rc.descricao, ci.descricao) AS nome,
           COALESCE(rc.preco_unitario, ci.custo_material) AS preco,
           CASE WHEN rc.preco_unitario IS NOT NULL THEN rc.preco_atualizado_em ELSE ci.updated_at END AS data_preco
    FROM public.service_recipe_consumables rc
    LEFT JOIN public.catalog_items ci ON ci.id = rc.catalog_item_id
    WHERE rc.recipe_id = rec.id ORDER BY rc.ordem, rc.created_at
  LOOP
    IF l.preco IS NULL THEN v_sem_preco := v_sem_preco || COALESCE(l.nome, '?'); END IF;
    IF l.data_preco IS NOT NULL AND l.data_preco::date < v_limite THEN
      v_velhos := v_velhos || (COALESCE(l.nome, '?') || ' (' || to_char(l.data_preco, 'DD/MM/YYYY') || ')');
    END IF;
    v_cons := v_cons + l.quantidade_por_medida * COALESCE(l.preco, 0);
    v_cons_l := v_cons_l || jsonb_build_object('id', l.id, 'catalog_item_id', l.catalog_item_id, 'consumivel', l.nome,
      'unidade', l.unidade, 'quantidade', l.quantidade_por_medida, 'preco', l.preco,
      'data_preco', l.data_preco, 'custo', round(l.quantidade_por_medida * COALESCE(l.preco, 0), 4));
  END LOOP;

  v_estr  := v_h * v_estr_h;
  v_total := v_mo + v_eq + v_cons + v_estr;
  v_margem := CASE WHEN COALESCE(v_preco, 0) > 0 THEN (v_preco - v_total) / v_preco * 100 END;

  IF array_length(v_sem_ch, 1) > 0 THEN
    v_avisos := v_avisos || jsonb_build_object('tipo', 'sem_custo_hora', 'nivel', 'aviso',
      'mensagem', 'Perfil sem custo/hora: ' || array_to_string(v_sem_ch, ', ') || '. Usou-se o custo médio dos perfis.');
  END IF;
  IF array_length(v_velhos, 1) > 0 THEN
    v_avisos := v_avisos || jsonb_build_object('tipo', 'custo_desatualizado', 'nivel', 'aviso',
      'mensagem', 'Preço com mais de ' || par.meses_desatualizado || ' meses: ' || array_to_string(v_velhos, '; ') || '.');
  END IF;
  IF array_length(v_sem_preco, 1) > 0 THEN
    v_avisos := v_avisos || jsonb_build_object('tipo', 'consumivel_sem_preco', 'nivel', 'aviso',
      'mensagem', 'Consumível sem preço: ' || array_to_string(v_sem_preco, ', ') || '.');
  END IF;

  RETURN jsonb_build_object(
    'service_id', s.id, 'servico', s.name, 'tem_receita', true, 'medida', rec.medida,
    'quantidade', v_qt,
    'horas', round(v_h, 4),
    'mao_obra', round(v_mo, 4), 'equipamentos', round(v_eq, 4), 'consumiveis', round(v_cons, 4),
    'estrutura', round(v_estr, 4), 'estrutura_hora', round(v_estr_h, 4), 'somar_estrutura', par.somar_estrutura,
    'custo_por_medida', round(v_total, 4),
    'custo_total', round(v_total * v_qt, 2),
    'preco_tabela', v_preco,
    'margem', round(v_margem, 2),
    'margem_minima', m.margem_minima, 'margem_alvo', m.margem_alvo, 'origem_margem', m.origem,
    'preco_sugerido', CASE WHEN m.margem_alvo < 100 THEN round(v_total / (1 - m.margem_alvo / 100), 2) END,
    'linhas', jsonb_build_object('mao_obra', v_mo_l, 'equipamentos', v_eq_l, 'consumiveis', v_cons_l),
    'avisos', v_avisos);
END $$;

-- 5.9 Verificação de margem de um orçamento (espelho: src/lib/custos/verificarMargem.ts).
-- Para cada linha: receita da linha = total_sem_iva × (1 − desconto global);
-- custo = (custo_material_unit + custo_mao_obra_unit, ou cost_price) × qt.
--   • preço abaixo do custo           → bloqueio  'abaixo_custo'
--   • margem abaixo do mínimo da linha → aprovacao 'abaixo_minimo' (ou
--     'desconto_come_margem', quando só o desconto global a põe abaixo)
--   • linha sem custo                  → aviso     'sem_custo'
--   • receita do serviço: perfil sem €/h, preços desatualizados → aviso
-- No total: margem total abaixo da mínima geral → aprovacao 'margem_total'
-- (só se nenhuma linha já pedir aprovação).
CREATE OR REPLACE FUNCTION public.fn_margem_verificar_calc(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  q record;
  l record;
  m record;
  g record;
  v_fator numeric;
  v_rev_bruto numeric; v_rev numeric; v_unit numeric; v_custo numeric; v_margem numeric; v_margem_bruta numeric;
  v_tot_rev numeric := 0; v_tot_custo numeric := 0;
  v_margem_total numeric;
  v_linha_min numeric;
  v_min_exigida numeric;
  v_alertas jsonb := '[]'::jsonb;
  v_bloqueio boolean := false; v_aprovacao boolean := false;
  v_servicos uuid[] := ARRAY[]::uuid[];
  v_calc jsonb;
  v_av jsonb;
  ap record;
  v_estado text;
  v_nome text;
BEGIN
  SELECT id, organization_id, quote_number, title, COALESCE(desconto_global_percent, 0) AS desconto
    INTO q FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_fator := 1 - q.desconto / 100;

  FOR l IN
    SELECT ql.id, ql.qt, ql.total_sem_iva, ql.custo_material_unit, ql.custo_mao_obra_unit, ql.cost_price,
           ql.descricao_snapshot, ql.service_id, sv.service_category_id, sv.name AS servico
    FROM public.quote_lines ql LEFT JOIN public.services sv ON sv.id = ql.service_id
    WHERE ql.quote_id = p_quote_id
    ORDER BY ql.ordem NULLS LAST, ql.created_at
  LOOP
    v_nome := COALESCE(NULLIF(btrim(l.descricao_snapshot), ''), l.servico, 'Linha');
    v_rev_bruto := COALESCE(l.total_sem_iva, 0);
    v_rev := v_rev_bruto * v_fator;
    v_unit := COALESCE(l.custo_material_unit, 0) + COALESCE(l.custo_mao_obra_unit, 0);
    IF v_unit <= 0 THEN v_unit := COALESCE(l.cost_price, 0); END IF;
    v_custo := v_unit * COALESCE(l.qt, 1);
    SELECT * INTO m FROM public.fn_margem_linha(q.organization_id, l.service_category_id);

    -- avisos da receita do serviço (uma vez por serviço)
    IF l.service_id IS NOT NULL AND NOT (l.service_id = ANY (v_servicos)) THEN
      v_servicos := v_servicos || l.service_id;
      v_calc := public.fn_custo_servico_calc(l.service_id, 1);
      FOR v_av IN SELECT * FROM jsonb_array_elements(COALESCE(v_calc -> 'avisos', '[]'::jsonb)) LOOP
        IF v_av ->> 'tipo' <> 'sem_receita' OR v_unit <= 0 THEN
          v_alertas := v_alertas || (v_av || jsonb_build_object('linha_id', l.id, 'linha', v_nome));
        END IF;
      END LOOP;
    END IF;

    IF v_unit <= 0 THEN
      IF v_rev_bruto > 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_alertas) a
                                          WHERE a ->> 'linha_id' = l.id::text AND a ->> 'tipo' = 'sem_receita') THEN
        v_alertas := v_alertas || jsonb_build_object('tipo', 'sem_custo', 'nivel', 'aviso', 'linha_id', l.id, 'linha', v_nome,
          'mensagem', v_nome || ': custo desconhecido.');
      END IF;
      CONTINUE;
    END IF;

    v_tot_rev := v_tot_rev + v_rev;
    v_tot_custo := v_tot_custo + v_custo;

    IF v_rev < v_custo THEN
      v_bloqueio := true;
      v_alertas := v_alertas || jsonb_build_object('tipo', 'abaixo_custo', 'nivel', 'bloqueio', 'linha_id', l.id, 'linha', v_nome,
        'preco', round(v_rev, 2), 'custo', round(v_custo, 2),
        'margem', CASE WHEN v_rev > 0 THEN round((v_rev - v_custo) / v_rev * 100, 2) END,
        'mensagem', v_nome || ': o preço (' || to_char(round(v_rev, 2), 'FM999G999G990D00') || ' €) não cobre o custo ('
                    || to_char(round(v_custo, 2), 'FM999G999G990D00') || ' €). Não se envia assim.');
      CONTINUE;
    END IF;

    v_margem := (v_rev - v_custo) / v_rev * 100;
    v_linha_min := LEAST(COALESCE(v_linha_min, v_margem), v_margem);
    IF v_margem < m.margem_minima THEN
      v_aprovacao := true;
      v_min_exigida := GREATEST(COALESCE(v_min_exigida, 0), m.margem_minima);
      v_margem_bruta := CASE WHEN v_rev_bruto > 0 THEN (v_rev_bruto - v_custo) / v_rev_bruto * 100 END;
      IF v_fator < 1 AND v_margem_bruta >= m.margem_minima THEN
        v_alertas := v_alertas || jsonb_build_object('tipo', 'desconto_come_margem', 'nivel', 'aprovacao', 'linha_id', l.id, 'linha', v_nome,
          'preco', round(v_rev, 2), 'custo', round(v_custo, 2), 'margem', round(v_margem, 2), 'margem_minima', m.margem_minima,
          'mensagem', 'O desconto de ' || trim(to_char(q.desconto, 'FM990D##')) || '% deixa ' || v_nome || ' com '
                      || trim(to_char(round(v_margem, 1), 'FM990D0')) || '% de margem (mínimo ' || trim(to_char(m.margem_minima, 'FM990D##')) || '%).');
      ELSE
        v_alertas := v_alertas || jsonb_build_object('tipo', 'abaixo_minimo', 'nivel', 'aprovacao', 'linha_id', l.id, 'linha', v_nome,
          'preco', round(v_rev, 2), 'custo', round(v_custo, 2), 'margem', round(v_margem, 2), 'margem_minima', m.margem_minima,
          'mensagem', v_nome || ': margem de ' || trim(to_char(round(v_margem, 1), 'FM990D0')) || '%, abaixo do mínimo de '
                      || trim(to_char(m.margem_minima, 'FM990D##')) || '% da linha de serviço. Precisa da aprovação da Direção.');
      END IF;
    END IF;
  END LOOP;

  v_margem_total := CASE WHEN v_tot_rev > 0 THEN (v_tot_rev - v_tot_custo) / v_tot_rev * 100 END;
  SELECT * INTO g FROM public.fn_margem_linha(q.organization_id, NULL);
  IF v_margem_total IS NOT NULL AND NOT v_aprovacao AND NOT v_bloqueio AND v_margem_total < g.margem_minima THEN
    v_aprovacao := true;
    v_min_exigida := g.margem_minima;
    v_alertas := v_alertas || jsonb_build_object('tipo', 'margem_total', 'nivel', 'aprovacao',
      'margem', round(v_margem_total, 2), 'margem_minima', g.margem_minima,
      'mensagem', 'Margem total de ' || trim(to_char(round(v_margem_total, 1), 'FM990D0')) || '%, abaixo do mínimo geral de '
                  || trim(to_char(g.margem_minima, 'FM990D##')) || '%.');
  END IF;

  SELECT * INTO ap FROM public.margin_approvals
  WHERE quote_id = p_quote_id AND estado <> 'anulada'
  ORDER BY pedida_em DESC LIMIT 1;

  v_estado := CASE
    WHEN v_bloqueio THEN 'bloqueado'
    WHEN NOT v_aprovacao THEN 'ok'
    WHEN ap.id IS NULL THEN 'precisa_aprovacao'
    WHEN ap.estado = 'pendente' THEN 'aguarda_aprovacao'
    WHEN ap.estado = 'aprovada'
         AND COALESCE(v_margem_total, 0) >= COALESCE(ap.margem, 0) - 0.01
         AND COALESCE(v_linha_min, 100) >= COALESCE(ap.margem_linha_min, -1000) - 0.01 THEN 'aprovado'
    WHEN ap.estado = 'recusada' THEN 'recusado'
    ELSE 'precisa_aprovacao' -- aprovada, mas a margem desceu depois da aprovação
  END;

  RETURN jsonb_build_object(
    'quote_id', q.id, 'quote_number', q.quote_number, 'organization_id', q.organization_id,
    'estado', v_estado,
    'pode_enviar', v_estado IN ('ok', 'aprovado'),
    'precisa_aprovacao', v_aprovacao AND NOT v_bloqueio,
    'bloqueado', v_bloqueio,
    'preco_total', round(v_tot_rev, 2), 'custo_total', round(v_tot_custo, 2),
    'margem_total', round(v_margem_total, 2),
    'margem_linha_min', round(v_linha_min, 2),
    'margem_minima', v_min_exigida,
    'desconto_global', q.desconto,
    'aprovacao', CASE WHEN ap.id IS NULL THEN NULL ELSE jsonb_build_object(
       'id', ap.id, 'estado', ap.estado, 'margem', ap.margem, 'motivo', ap.motivo,
       'pedida_em', ap.pedida_em, 'decidida_em', ap.decidida_em, 'motivo_decisao', ap.motivo_decisao) END,
    'alertas', v_alertas);
END $$;

-- ============================================================
-- 6. RPCs (a API para o ecrã e para o envio da proposta)
-- ============================================================

-- 6.1 Perfis sem salário (o salário vem a NULL sem costs.salaries.view).
CREATE OR REPLACE FUNCTION public.rpc_custos_perfis(p_org uuid)
RETURNS TABLE (id uuid, nome text, salario_base numeric, encargos_pct numeric, custo_hora_manual numeric,
               custo_hora numeric, ativo boolean, ordem integer, servicos_em_uso integer, salario_visivel boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_sal boolean;
BEGIN
  IF p_org IS NULL OR p_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'costs.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver os custos desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_sal := public.has_anew_permission(auth.uid(), 'costs.salaries.view');
  RETURN QUERY
    SELECT p.id, p.nome,
           CASE WHEN v_sal THEN p.salario_base END,
           p.encargos_pct, p.custo_hora_manual,
           round(public.fn_custo_hora_perfil(p.id), 4),
           p.ativo, p.ordem,
           (SELECT count(DISTINCT rl.recipe_id)::int FROM public.service_recipe_labor rl WHERE rl.perfil_id = p.id),
           v_sal
    FROM public.cost_profiles p
    WHERE p.organization_id = p_org
    ORDER BY p.ordem, p.nome;
END $$;

-- 6.2 Criar ou mudar um perfil. O salário só muda com costs.salaries.view
-- (p_mudar_salario = false deixa o salário como está).
CREATE OR REPLACE FUNCTION public.rpc_custos_perfil_guardar(
  p_org uuid, p_id uuid, p_nome text, p_salario numeric DEFAULT NULL, p_mudar_salario boolean DEFAULT false,
  p_encargos_pct numeric DEFAULT NULL, p_custo_hora_manual numeric DEFAULT NULL, p_ativo boolean DEFAULT true,
  p_ordem integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_id uuid;
  v_org uuid;
BEGIN
  IF p_org IS NULL OR p_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'costs.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar custos desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_mudar_salario AND NOT public.has_anew_permission(auth.uid(), 'costs.salaries.view') THEN
    RAISE EXCEPTION 'Só a Direção pode mudar salários' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_nome IS NULL OR length(btrim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Indique o nome do perfil' USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.cost_profiles (organization_id, nome, salario_base, encargos_pct, custo_hora_manual, ativo, ordem, updated_by)
    VALUES (p_org, btrim(p_nome), CASE WHEN p_mudar_salario THEN p_salario END, p_encargos_pct, p_custo_hora_manual,
            COALESCE(p_ativo, true),
            COALESCE(p_ordem, (SELECT COALESCE(max(ordem), 0) + 1 FROM public.cost_profiles WHERE organization_id = p_org)),
            public.current_business_user_id())
    RETURNING id INTO v_id;
  ELSE
    SELECT organization_id INTO v_org FROM public.cost_profiles WHERE id = p_id;
    IF v_org IS DISTINCT FROM p_org THEN
      RAISE EXCEPTION 'Perfil não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    UPDATE public.cost_profiles SET
      nome = btrim(p_nome),
      salario_base = CASE WHEN p_mudar_salario THEN p_salario ELSE salario_base END,
      encargos_pct = p_encargos_pct,
      custo_hora_manual = p_custo_hora_manual,
      ativo = COALESCE(p_ativo, ativo),
      ordem = COALESCE(p_ordem, ordem),
      updated_by = public.current_business_user_id()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- 6.3 Apagar um perfil (recusa se uma receita o usa).
CREATE OR REPLACE FUNCTION public.rpc_custos_perfil_apagar(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.cost_profiles WHERE id = p_id;
  IF v_org IS NULL OR v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'costs.edit') THEN
    RAISE EXCEPTION 'Sem permissão para apagar este perfil' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_recipe_labor WHERE perfil_id = p_id) THEN
    RAISE EXCEPTION 'Este perfil está em uso numa receita: retire-o primeiro das receitas' USING ERRCODE = 'foreign_key_violation';
  END IF;
  DELETE FROM public.cost_profiles WHERE id = p_id;
END $$;

-- 6.4 Resumo: estrutura €/h, custo/hora médio.
CREATE OR REPLACE FUNCTION public.rpc_custos_resumo(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE par public.cost_parameters;
BEGIN
  IF p_org IS NULL OR p_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'costs.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver os custos desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  par := public.fn_custos_parametros(p_org);
  RETURN jsonb_build_object(
    'estrutura_mensal', (SELECT COALESCE(SUM(valor_mensal), 0) FROM public.cost_structure_items WHERE organization_id = p_org AND ativo),
    'estrutura_hora', round(public.fn_custo_estrutura_hora(p_org), 4),
    'custo_hora_medio', round(public.fn_custos_media_hora(p_org), 4),
    'parametros', to_jsonb(par));
END $$;

-- 6.5 Custo de um serviço (para a página da receita e para o orçamento).
CREATE OR REPLACE FUNCTION public.rpc_custo_servico(p_service_id uuid, p_quantidade numeric DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.services WHERE id = p_service_id;
  IF v_org IS NULL OR v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (public.has_anew_permission(auth.uid(), 'costs.view')
             OR public.has_anew_permission(auth.uid(), 'quotes.view_costs')
             OR public.has_anew_permission(auth.uid(), 'quotes.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para ver o custo deste serviço' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.fn_custo_servico_calc(p_service_id, p_quantidade);
END $$;

-- 6.6 Verificar a margem de um orçamento antes de enviar a proposta.
CREATE OR REPLACE FUNCTION public.rpc_margem_verificar(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL;
  IF v_org IS NULL OR v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (public.has_anew_permission(auth.uid(), 'quotes.view')
             OR public.has_anew_permission(auth.uid(), 'proposals.view')
             OR public.has_anew_permission(auth.uid(), 'costs.view')) THEN
    RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN public.fn_margem_verificar_calc(p_quote_id);
END $$;

-- 6.7 Pedir a aprovação da Direção.
CREATE OR REPLACE FUNCTION public.rpc_margem_pedir_aprovacao(p_quote_id uuid, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_org uuid;
  v_ver jsonb;
  v_id uuid;
  v_actor uuid := public.current_business_user_id();
  v_num text;
BEGIN
  SELECT organization_id, quote_number INTO v_org, v_num FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL;
  IF v_org IS NULL OR v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (public.has_anew_permission(auth.uid(), 'quotes.edit')
             OR public.has_anew_permission(auth.uid(), 'quotes.manage')
             OR public.has_anew_permission(auth.uid(), 'proposals.edit')
             OR public.has_anew_permission(auth.uid(), 'proposals.manage')) THEN
    RAISE EXCEPTION 'Sem permissão para pedir aprovação deste orçamento' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Escreva o motivo (pelo menos 5 letras)' USING ERRCODE = 'check_violation';
  END IF;

  v_ver := public.fn_margem_verificar_calc(p_quote_id);
  IF (v_ver ->> 'bloqueado')::boolean THEN
    RAISE EXCEPTION 'Há linhas abaixo do custo: corrija o preço. Abaixo do custo não se aprova.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (v_ver ->> 'precisa_aprovacao')::boolean THEN
    RAISE EXCEPTION 'A margem cumpre o mínimo: não precisa de aprovação' USING ERRCODE = 'check_violation';
  END IF;
  IF v_ver ->> 'estado' = 'aprovado' THEN
    RAISE EXCEPTION 'Este orçamento já está aprovado com esta margem' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.margin_approvals SET estado = 'anulada'
  WHERE quote_id = p_quote_id AND estado = 'pendente';

  INSERT INTO public.margin_approvals (organization_id, quote_id, pedida_por, margem, margem_linha_min, margem_minima, alertas, motivo)
  VALUES (v_org, p_quote_id, v_actor, (v_ver ->> 'margem_total')::numeric, (v_ver ->> 'margem_linha_min')::numeric,
          (v_ver ->> 'margem_minima')::numeric, COALESCE(v_ver -> 'alertas', '[]'::jsonb), btrim(p_motivo))
  RETURNING id INTO v_id;

  -- Avisar a Direção no sino (se a tabela de notificações não aceitar, o pedido fica na mesma).
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, link, organization_id, entity_type, entity_id, priority, kind)
    SELECT DISTINCT au.auth_user_id, 'margin_approval', 'Margem por aprovar',
           'O orçamento ' || COALESCE(v_num, '') || ' tem margem de '
             || COALESCE(trim(to_char((v_ver ->> 'margem_total')::numeric, 'FM990D0')), '?') || '%, abaixo do mínimo.',
           '/custos#aprovacoes', v_org, 'quote', p_quote_id, 'high', 'notification'
    FROM public.anew_memberships am
    JOIN public.anew_users au ON au.id = am.user_id AND au.auth_user_id IS NOT NULL
    JOIN public.anew_role_permissions rp ON rp.role_id = am.role_id AND rp.permission_code = 'margins.approve'
    WHERE am.organization_id = v_org AND am.status = 'active';
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN v_id;
END $$;

-- 6.8 Decidir (só a Direção: margins.approve).
CREATE OR REPLACE FUNCTION public.rpc_margem_decidir(p_aprovacao_id uuid, p_decisao text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  a public.margin_approvals;
  v_auth uuid;
BEGIN
  SELECT * INTO a FROM public.margin_approvals WHERE id = p_aprovacao_id;
  IF NOT FOUND OR a.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Pedido de aprovação não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_anew_permission(auth.uid(), 'margins.approve') THEN
    RAISE EXCEPTION 'Só a Direção pode aprovar ou recusar margens' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decisao NOT IN ('aprovada', 'recusada') THEN
    RAISE EXCEPTION 'Decisão inválida: use aprovada ou recusada' USING ERRCODE = 'check_violation';
  END IF;
  IF a.estado <> 'pendente' THEN
    RAISE EXCEPTION 'Este pedido já foi decidido (%)', a.estado USING ERRCODE = 'check_violation';
  END IF;
  IF p_decisao = 'recusada' AND (p_motivo IS NULL OR length(btrim(p_motivo)) < 3) THEN
    RAISE EXCEPTION 'Para recusar, escreva o motivo' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.margin_approvals SET
    estado = p_decisao,
    decidida_por = public.current_business_user_id(),
    decidida_em = now(),
    motivo_decisao = NULLIF(btrim(COALESCE(p_motivo, '')), '')
  WHERE id = p_aprovacao_id
  RETURNING * INTO a;

  BEGIN
    SELECT auth_user_id INTO v_auth FROM public.anew_users WHERE id = a.pedida_por;
    IF v_auth IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, organization_id, entity_type, entity_id, priority, kind)
      VALUES (v_auth, 'margin_approval',
              CASE WHEN p_decisao = 'aprovada' THEN 'Margem aprovada' ELSE 'Margem recusada' END,
              CASE WHEN p_decisao = 'aprovada' THEN 'A Direção aprovou a margem do orçamento. Já pode enviar a proposta.'
                   ELSE 'A Direção recusou a margem do orçamento: ' || COALESCE(a.motivo_decisao, '') END,
              '/quotes', a.organization_id, 'quote', a.quote_id, 'normal', 'notification');
    END IF;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN to_jsonb(a);
END $$;

-- 6.9 Lista de pedidos (para a secção "Aprovações pendentes").
CREATE OR REPLACE FUNCTION public.rpc_margem_aprovacoes(p_org uuid, p_estado text DEFAULT 'pendente')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF p_org IS NULL OR p_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT (public.has_anew_permission(auth.uid(), 'margins.approve')
             OR public.has_anew_permission(auth.uid(), 'costs.view')) THEN
    RAISE EXCEPTION 'Sem permissão para ver as aprovações desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'quote_id', a.quote_id, 'quote_number', q.quote_number, 'titulo', q.title,
      'total', q.total, 'margem', a.margem, 'margem_minima', a.margem_minima, 'margem_linha_min', a.margem_linha_min,
      'motivo', a.motivo, 'estado', a.estado, 'pedida_em', a.pedida_em, 'pedida_por', pu.name,
      'decidida_em', a.decidida_em, 'decidida_por', du.name, 'motivo_decisao', a.motivo_decisao,
      'alertas', a.alertas) ORDER BY a.pedida_em DESC)
    FROM public.margin_approvals a
    JOIN public.quotes q ON q.id = a.quote_id
    LEFT JOIN public.anew_users pu ON pu.id = a.pedida_por
    LEFT JOIN public.anew_users du ON du.id = a.decidida_por
    WHERE a.organization_id = p_org AND (p_estado IS NULL OR a.estado = p_estado)), '[]'::jsonb);
END $$;

-- ============================================================
-- 7. Privilégios das funções
-- ============================================================
-- Internas (fn_*): só o dono (as RPCs SECURITY DEFINER chamam-nas). As
-- puras de cálculo podem ser chamadas por qualquer utilizador autenticado.
REVOKE ALL ON FUNCTION public.fn_custos_parametros(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_custo_hora_perfil(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_custos_media_hora(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_custo_estrutura_hora(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_margem_linha(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_custo_servico_calc(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_margem_verificar_calc(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_custo_hora_calc(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_custo_hora_equipamento(numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_custo_hora_calc(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_custo_hora_equipamento(numeric, numeric, numeric, numeric, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_custos_perfis(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_custos_perfil_guardar(uuid, uuid, text, numeric, boolean, numeric, numeric, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_custos_perfil_apagar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_custos_resumo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_custo_servico(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_margem_verificar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_margem_pedir_aprovacao(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_margem_decidir(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_margem_aprovacoes(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_custos_perfis(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_custos_perfil_guardar(uuid, uuid, text, numeric, boolean, numeric, numeric, boolean, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_custos_perfil_apagar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_custos_resumo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_custo_servico(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_margem_verificar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_margem_pedir_aprovacao(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_margem_decidir(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_margem_aprovacoes(uuid, text) TO authenticated, service_role;

-- O gatilho e as funções de tabela não precisam de EXECUTE para ninguém.
REVOKE ALL ON FUNCTION public.fn_custos_touch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_custos_consumivel_data() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
