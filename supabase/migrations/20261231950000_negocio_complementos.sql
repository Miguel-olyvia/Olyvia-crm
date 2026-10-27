-- Negócio (Fase 2.2): o fluxo da Emylia sobre as tabelas que já existem (decisão 13) e os ajustes decididos a 27/10/2026.
-- Plano: Olyvia2.0 docs/14-plano-migracao-olyvia.md, decisões 10 a 16.
--
-- Orçamento = quotes/quote_lines · proposta = proposals · contrato = client_contracts · visitas = schedule_items.
-- O que a Emylia guarda e estas tabelas não têm entra em colunas novas e em tabelas-filhas (quote_*, client_contract_*), sem JSON.
-- As tabelas de orçamento, contrato, visita e adenda da 20261231940000 (orcamentos, orcamento_*, contratos, contrato_*, visitas,
-- adendas, adenda_*, assinaturas) ficam sem uso e saem na limpeza.
--
-- Ajustes a lógica que já existe (com o ok do Rúben, 27/10):
--   16. A nike passa a ter uma subscrição de teste (plano 'internal', ativa, sem Stripe) e o plano 'internal' fica sem limite de
--       orçamentos, propostas e contratos: sem isto as quotas recusam qualquer documento (a base RH não tem planos).
--   14. organization_inventory_settings.stock_deduction_trigger aceita 'manual': os gatilhos de stock e de pedido ao fornecedor não
--       fazem nada no contrato nem na proposta. A nike fica em 'manual' (o pedido ao fornecedor é emitido à mão, depois de validada a
--       encomenda de cliente, como na v2). As outras organizações ficam como estão.
--   15. fn_neg_prova_contrato ganha a prova P4: assinatura por SMS ou Chave Móvel Digital com a referência. P1 a P3 não mudam.
--   12. Na nike, o negócio ganha-se com o contrato assinado (negocio_workflow_config.momento_ganho = 'contrato_assinado').

SET lock_timeout = '5s';

-- ------------------------------------------------------------------ 16. subscrição de teste da nike (só nesta base; sem Stripe)
DO $do$
DECLARE v_org uuid := 'b6ffce4f-f630-4933-833a-008649757a33'; v_user uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM anew_organizations WHERE id = v_org) THEN
    SELECT m.user_id INTO v_user FROM anew_memberships m WHERE m.organization_id = v_org ORDER BY m.created_at LIMIT 1;
    INSERT INTO organization_subscriptions (organization_id, plan, status, created_by)
    VALUES (v_org, 'internal', 'active', v_user) ON CONFLICT (organization_id) DO NOTHING;
    INSERT INTO plan_limits (plan, limit_type, limit_value, reset_cadence)
    VALUES ('internal', 'quotes', NULL, 'none'), ('internal', 'proposals', NULL, 'none'), ('internal', 'contracts', NULL, 'none')
    ON CONFLICT (plan, limit_type) DO NOTHING;
  END IF;
END $do$;

-- ------------------------------------------------------------------ 14. stock e pedido ao fornecedor: a opção 'manual'
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_inventory_settings_stock_deduction_trigger_check'
             AND pg_get_constraintdef(oid) NOT LIKE '%manual%') THEN
    ALTER TABLE public.organization_inventory_settings DROP CONSTRAINT organization_inventory_settings_stock_deduction_trigger_check;
    ALTER TABLE public.organization_inventory_settings ADD CONSTRAINT organization_inventory_settings_stock_deduction_trigger_check
      CHECK (stock_deduction_trigger = ANY (ARRAY['contract_signed','proposal_accepted','manual']));
  END IF;
END $do$;
COMMENT ON COLUMN public.organization_inventory_settings.stock_deduction_trigger IS
  'Quando se desconta o stock e se pede ao fornecedor: no contrato assinado, na proposta aceite, ou manual (nada automático: a encomenda de cliente valida-se e a encomenda a fornecedor emite-se à mão, como na Emylia).';
DO $do$
DECLARE v_org uuid := 'b6ffce4f-f630-4933-833a-008649757a33'; v_user uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM anew_organizations WHERE id = v_org) THEN
    SELECT m.user_id INTO v_user FROM anew_memberships m WHERE m.organization_id = v_org ORDER BY m.created_at LIMIT 1;
    INSERT INTO organization_inventory_settings (organization_id, stock_deduction_trigger, created_by)
    VALUES (v_org, 'manual', v_user) ON CONFLICT (organization_id) DO NOTHING;
    -- 12. o negócio ganha-se com o contrato assinado
    UPDATE negocio_workflow_config SET momento_ganho = 'contrato_assinado', updated_at = now()
    WHERE organization_id = v_org AND momento_ganho = 'manual';
  END IF;
END $do$;

-- ------------------------------------------------------------------ 15. contratos: a assinatura da Emylia e a prova P4
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS signature_method text CHECK (signature_method IS NULL OR signature_method IN ('sms','digital','desenho'));
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS signature_reference text;
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS signature_phone_masked text;
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS revisto_por text;
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS revisto_em timestamptz;
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS versao smallint CHECK (versao IS NULL OR versao > 0);
COMMENT ON COLUMN public.client_contracts.signature_method IS 'Como o cliente assinou: sms (código por SMS, sms-otp), digital (Chave Móvel Digital) ou desenho (só os antigos).';
COMMENT ON COLUMN public.client_contracts.signature_reference IS 'A referência da assinatura (o código do SMS validado ou o identificador da Chave Móvel Digital). É a prova P4.';

CREATE OR REPLACE FUNCTION public.fn_neg_prova_contrato(p_contract_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cc public.client_contracts;
BEGIN
  SELECT cc.* INTO v_cc FROM public.client_contracts cc WHERE cc.id = p_contract_id;
  IF NOT FOUND OR v_cc.status IS NULL OR v_cc.status NOT IN ('signed', 'assinado', 'active') THEN
    RETURN NULL;
  END IF;
  -- P1: assinatura do cliente no portal.
  IF v_cc.signature_date IS NOT NULL
     AND NULLIF(btrim(v_cc.signed_by_name), '') IS NOT NULL
     AND NULLIF(btrim(v_cc.signature_image), '') IS NOT NULL THEN
    RETURN 'P1';
  END IF;
  -- P2: todas as partes signatárias assinaram (validate-contract-signature).
  IF EXISTS (SELECT 1 FROM public.client_contract_parties pp
             WHERE pp.contract_id = v_cc.id AND pp.is_signatory = true)
     AND NOT EXISTS (SELECT 1 FROM public.client_contract_parties pp
                     WHERE pp.contract_id = v_cc.id AND pp.is_signatory = true
                       AND (pp.status IS DISTINCT FROM 'signed' OR pp.signed_at IS NULL)) THEN
    RETURN 'P2';
  END IF;
  -- P3: «Marcar como Assinado» (assinatura da empresa).
  IF v_cc.company_signature_date IS NOT NULL AND v_cc.company_signed_by_id IS NOT NULL THEN
    RETURN 'P3';
  END IF;
  -- P4 (20261231950000): assinatura do cliente por SMS (sms-otp) ou com a Chave Móvel Digital, com a referência.
  IF v_cc.signature_date IS NOT NULL
     AND NULLIF(btrim(v_cc.signed_by_name), '') IS NOT NULL
     AND v_cc.signature_method IN ('sms', 'digital')
     AND NULLIF(btrim(v_cc.signature_reference), '') IS NOT NULL THEN
    RETURN 'P4';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.client_contract_clausulas (
  organization_id uuid NOT NULL,
  contract_id     uuid NOT NULL REFERENCES public.client_contracts(id) ON DELETE CASCADE,
  titulo          text NOT NULL CHECK (length(btrim(titulo)) > 0),
  texto           text NOT NULL,
  PRIMARY KEY (contract_id, titulo)
);
COMMENT ON TABLE public.client_contract_clausulas IS 'As cláusulas que o Jurídico reescreveu neste contrato (pelo título); as outras são as do modelo.';
CREATE TABLE IF NOT EXISTS public.client_contract_pedidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contract_id     uuid NOT NULL REFERENCES public.client_contracts(id) ON DELETE CASCADE,
  ordem           smallint NOT NULL DEFAULT 0,
  clausula        text NOT NULL,
  nota            text NOT NULL,
  pedido_em       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.client_contract_pedidos IS 'O que o cliente pediu mudar numa cláusula (no portal), à espera da revisão do Jurídico.';

-- ------------------------------------------------------------------ orçamento: quotes e quote_lines com o que a Emylia guarda
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS versao smallint CHECK (versao IS NULL OR versao > 0);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS desconto_fracao numeric(9,6) CHECK (desconto_fracao IS NULL OR desconto_fracao BETWEEN 0 AND 1);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS venda_direta boolean NOT NULL DEFAULT false;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS inicio_obra date;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS equipa smallint CHECK (equipa IS NULL OR equipa BETWEEN 1 AND 4);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS verificado_em timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS aprovacao text CHECK (aprovacao IS NULL OR aprovacao IN ('pedida','aprovada','recusada'));
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS aprovacao_por uuid REFERENCES public.anew_users(id) ON DELETE SET NULL;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS aprovacao_em timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS justificacao_margem text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS motivos_versao text[];
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS nota_versao text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS onde_refeita text CHECK (onde_refeita IS NULL OR onde_refeita IN ('orcamento','visita'));
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS pedido_cliente_motivos text[];
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS pedido_cliente_nota text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS pedido_cliente_em timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS recusa_motivos text[];
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS recusa_nota text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS recusada_em timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS enviado_em timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS substituido_em timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS aceite_antes_em timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS preco_final numeric(14,2);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS total_com_iva numeric(14,2);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS prestacoes_por_fases boolean NOT NULL DEFAULT false;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS sem_demolicao boolean NOT NULL DEFAULT false;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS fluxo_emylia boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.quotes.versao IS 'Emylia: a versão da proposta (1, 2…). A atual é a não substituída; as anteriores ficam com estado ''substituido''.';
COMMENT ON COLUMN public.quotes.desconto_fracao IS 'Emylia: o desconto como fração (0,05 = 5 %), sem arredondar; desconto_global_percent fica com o mesmo valor em %.';
COMMENT ON COLUMN public.quotes.fluxo_emylia IS 'O orçamento é do fluxo da Emylia (linhas, custos congelados, zonas e prestações nas tabelas quote_*).';
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quotes'::regclass AND conname = 'quotes_id_org_key') THEN
    ALTER TABLE public.quotes ADD CONSTRAINT quotes_id_org_key UNIQUE (id, organization_id);
  END IF;
END $do$;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_negocio_versao_key ON public.quotes (negocio_id, versao) WHERE fluxo_emylia AND deleted_at IS NULL;

ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS tipo_emylia text CHECK (tipo_emylia IS NULL OR tipo_emylia IN ('servico','materiais_modelo','produto','livre'));
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS quantidade_exata numeric(12,3);
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS preco_un_exato numeric(14,4);
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS custo_un_exato numeric(14,4);
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS iva_explicita boolean NOT NULL DEFAULT false;
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS custo_manual boolean NOT NULL DEFAULT false;
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS fornecedor text;
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS qtd_origem numeric(12,3);
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS preco_un_origem numeric(14,4);
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS custo_un_origem numeric(14,4);
COMMENT ON COLUMN public.quote_lines.quantidade_exata IS 'Emylia: a quantidade sem arredondar (qt guarda 2 casas). preco_un_exato e custo_un_exato o mesmo para o preço e o custo por unidade.';
COMMENT ON COLUMN public.quote_lines.qtd_origem IS 'Emylia, linhas de materiais livres ou de produto: a quantidade, o preço e o custo por unidade mostrados (a linha guarda o total).';

-- quote_lines não tem organização: as filhas guardam-na (para a RLS) e ligam-se pelo id da linha.
CREATE TABLE IF NOT EXISTS public.quote_line_custos (
  organization_id uuid NOT NULL,
  quote_line_id   uuid PRIMARY KEY REFERENCES public.quote_lines(id) ON DELETE CASCADE,
  congelado       boolean NOT NULL DEFAULT false,
  congelado_em    timestamptz,
  horas_un        numeric(10,4) NOT NULL DEFAULT 0,
  mao_obra_un     numeric(14,4) NOT NULL DEFAULT 0,
  equipamentos_un numeric(14,4) NOT NULL DEFAULT 0,
  consumiveis_un  numeric(14,4) NOT NULL DEFAULT 0,
  estrutura_hora  numeric(14,4) NOT NULL DEFAULT 0,
  estrutura_un    numeric(14,4) NOT NULL DEFAULT 0,
  ajuste_un       numeric(14,4) NOT NULL DEFAULT 0
);
COMMENT ON TABLE public.quote_line_custos IS 'Emylia: o custo de uma unidade de serviço congelado no envio (horas, mão de obra, equipamento, consumíveis, estrutura, ajuste). Só quotes.view_costs.';
CREATE TABLE IF NOT EXISTS public.quote_line_oficios (
  organization_id uuid NOT NULL,
  quote_line_id   uuid NOT NULL REFERENCES public.quote_lines(id) ON DELETE CASCADE,
  ordem           smallint NOT NULL,
  perfil_chave    text NOT NULL,
  nome            text NOT NULL,
  horas_un        numeric(10,4) NOT NULL DEFAULT 0,
  custo_hora      numeric(14,4) NOT NULL DEFAULT 0,
  tecnicos        text[],
  PRIMARY KEY (quote_line_id, ordem)
);
CREATE TABLE IF NOT EXISTS public.quote_zonas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  quote_id        uuid NOT NULL,
  ordem           smallint NOT NULL,
  nome            text NOT NULL CHECK (btrim(nome) <> ''),
  FOREIGN KEY (quote_id, organization_id) REFERENCES public.quotes(id, organization_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS quote_zonas_nome ON public.quote_zonas (quote_id, lower(btrim(nome)));
CREATE TABLE IF NOT EXISTS public.quote_line_zonas (
  organization_id uuid NOT NULL,
  quote_line_id   uuid NOT NULL REFERENCES public.quote_lines(id) ON DELETE CASCADE,
  zona_id         uuid NOT NULL REFERENCES public.quote_zonas(id) ON DELETE CASCADE,
  ordem           smallint NOT NULL DEFAULT 0,
  quantidade      numeric(12,3) NOT NULL CHECK (quantidade > 0),
  valor           numeric(14,2) CHECK (valor >= 0),
  PRIMARY KEY (quote_line_id, zona_id)
);
CREATE TABLE IF NOT EXISTS public.quote_prazo (
  organization_id uuid NOT NULL,
  quote_id        uuid NOT NULL,
  tarefa          text NOT NULL,
  dias            numeric(6,1) NOT NULL CHECK (dias > 0 AND dias * 2 = round(dias * 2)),
  PRIMARY KEY (quote_id, tarefa),
  FOREIGN KEY (quote_id, organization_id) REFERENCES public.quotes(id, organization_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.quote_prestacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  quote_id        uuid NOT NULL,
  ordem           smallint NOT NULL,
  rotulo          text NOT NULL,
  pct             numeric(9,6) NOT NULL CHECK (pct > 0 AND pct <= 1),
  marco           text NOT NULL CHECK (marco IN ('adjudicacao','antes','fase','fim')),
  fase            smallint CHECK (fase BETWEEN 1 AND 4),
  UNIQUE (quote_id, ordem),
  FOREIGN KEY (quote_id, organization_id) REFERENCES public.quotes(id, organization_id) ON DELETE CASCADE,
  CHECK ((marco = 'fase') = (fase IS NOT NULL))
);
CREATE OR REPLACE FUNCTION public.fn_quote_prestacoes_cem() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_q uuid := coalesce(NEW.quote_id, OLD.quote_id); v_soma numeric;
BEGIN
  SELECT sum(pct) INTO v_soma FROM public.quote_prestacoes WHERE quote_id = v_q;
  IF v_soma IS NOT NULL AND abs(v_soma - 1) > 0.0001 THEN
    RAISE EXCEPTION 'As prestações do orçamento somam % %% e têm de somar 100 %%.', round(v_soma * 100, 2) USING ERRCODE = 'NE002';
  END IF;
  RETURN NULL;
END $$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_quote_prestacoes_cem' AND tgrelid = 'public.quote_prestacoes'::regclass) THEN
    CREATE CONSTRAINT TRIGGER trg_quote_prestacoes_cem AFTER INSERT OR UPDATE OR DELETE ON public.quote_prestacoes
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fn_quote_prestacoes_cem();
  END IF;
END $do$;
CREATE TABLE IF NOT EXISTS public.quote_avisos_vistos (
  organization_id uuid NOT NULL,
  quote_id        uuid NOT NULL,
  chave           text NOT NULL,
  visto_em        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quote_id, chave),
  FOREIGN KEY (quote_id, organization_id) REFERENCES public.quotes(id, organization_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.quote_precos_manuais (
  organization_id uuid NOT NULL,
  quote_id        uuid NOT NULL,
  descricao       text NOT NULL,
  preco           numeric(14,2) NOT NULL CHECK (preco >= 0),
  PRIMARY KEY (quote_id, descricao),
  FOREIGN KEY (quote_id, organization_id) REFERENCES public.quotes(id, organization_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.quote_versao_produtos (
  organization_id uuid NOT NULL,
  quote_id        uuid NOT NULL,
  ordem           integer NOT NULL,
  produto_id      uuid NOT NULL,
  nome            text,
  unidade         text,
  custo_un        numeric(14,4),
  pvp_un          numeric(14,4),
  categoria_id    uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  quantidade      numeric(12,3) NOT NULL CHECK (quantidade > 0),
  cliente_fornece boolean NOT NULL DEFAULT false,
  servico_id      uuid,
  fator           numeric(10,4),
  sem_instalacao  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (quote_id, ordem),
  FOREIGN KEY (quote_id, organization_id) REFERENCES public.quotes(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (produto_id, organization_id) REFERENCES public.products(id, organization_id),
  FOREIGN KEY (servico_id, organization_id) REFERENCES public.services(id, organization_id)
);
CREATE TABLE IF NOT EXISTS public.quote_versao_partes (
  organization_id uuid NOT NULL,
  quote_id        uuid NOT NULL,
  parte           text NOT NULL,
  PRIMARY KEY (quote_id, parte),
  FOREIGN KEY (quote_id, organization_id) REFERENCES public.quotes(id, organization_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------ visitas: o número da visita da Emylia na agenda
ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS visita_numero smallint CHECK (visita_numero IS NULL OR visita_numero > 0);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_items_negocio_visita_key ON public.schedule_items (negocio_id, visita_numero) WHERE visita_numero IS NOT NULL AND negocio_id IS NOT NULL;
COMMENT ON COLUMN public.schedule_items.visita_numero IS 'Emylia: o número da visita do negócio (1.ª, 2.ª…); os campos dela estão em negocio_respostas (v<n>_…).';

-- ------------------------------------------------------------------ o que a visita decide e a fatura única do motor (tabelas da 940000)
ALTER TABLE public.negocio_medidas ADD COLUMN IF NOT EXISTS fotos_total smallint NOT NULL DEFAULT 0 CHECK (fotos_total >= 0);
CREATE TABLE IF NOT EXISTS public.negocio_partes_fora (
  organization_id uuid NOT NULL,
  negocio_id      uuid NOT NULL,
  parte           text NOT NULL CHECK (length(btrim(parte)) > 0),
  PRIMARY KEY (negocio_id, parte),
  FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios(id, organization_id) ON DELETE CASCADE
);
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS custo_un numeric(14,4) CHECK (custo_un IS NULL OR custo_un >= 0);
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS pvp_un numeric(14,4) CHECK (pvp_un IS NULL OR pvp_un >= 0);
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;
ALTER TABLE public.negocio_produtos ADD COLUMN IF NOT EXISTS fator numeric(10,4) CHECK (fator IS NULL OR fator > 0);
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS fatura_numero text;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS fatura_em timestamptz;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS fatura_paga boolean NOT NULL DEFAULT false;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS recibo_numero text;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS recibo_em timestamptz;
COMMENT ON COLUMN public.negocios.fatura_numero IS 'A fatura única do motor da Emylia (o passo "Emitir fatura"); as faturas por prestação estão em faturas.';

-- faturas (tabela nova da 940000, ainda vazia): passam a ligar-se às prestações do orçamento (quote_prestacoes)
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS quote_prestacao_id uuid REFERENCES public.quote_prestacoes(id);
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS chave text;
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS referencia text;
DO $do$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.faturas'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%num_nonnulls(prestacao_id, adenda_id)%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.faturas DROP CONSTRAINT %I', c);
    ALTER TABLE public.faturas ADD CONSTRAINT faturas_um_destino CHECK (num_nonnulls(prestacao_id, adenda_id, quote_prestacao_id) = 1);
  END IF;
END $do$;
CREATE UNIQUE INDEX IF NOT EXISTS faturas_uma_por_quote_prestacao ON public.faturas (quote_prestacao_id) WHERE estado <> 'anulada' AND quote_prestacao_id IS NOT NULL;

-- ------------------------------------------------------------------ segurança das tabelas novas
DO $do$
DECLARE t text; v_perm text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_contract_clausulas','client_contract_pedidos','quote_line_custos','quote_line_oficios','quote_zonas',
    'quote_line_zonas','quote_prazo','quote_prestacoes','quote_avisos_vistos','quote_precos_manuais','quote_versao_produtos',
    'quote_versao_partes','negocio_partes_fora'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    v_perm := CASE WHEN t IN ('quote_line_custos','quote_line_oficios') THEN 'quotes.view_costs'
                   WHEN t LIKE 'client_contract_%' OR t LIKE 'quote_%' THEN 'pessoas.view' ELSE 'pessoas.view' END;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_ler') THEN
      EXECUTE format($p$CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated
        USING (public.is_system_admin_user((SELECT auth.uid())) OR public.has_anew_permission_in_org((SELECT auth.uid()), %L, organization_id))$p$,
        t || '_ler', t, v_perm);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $do$;

RESET lock_timeout;
