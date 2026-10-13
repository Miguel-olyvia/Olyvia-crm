-- ============================================================
-- 20261214100000_financeiro_faturas_recibos
-- ============================================================
-- Financeiro: REGISTAR as faturas do cliente (por tranche do contrato) e
-- VALIDAR o pagamento (sai o recibo). O 1.º pagamento validado de um
-- contrato põe a obra a andar: avisa as Operações ("Criar obra") e o
-- Armazém ("Materiais da obra"), e deixa um evento que a aplicação de
-- Operações lê (operacao-app/db/financeiro-obra.sql).
--
-- Decisões do Ruben (13/10/2026, docs/melhorias-v2-2026-10-13, 3a):
--   · A Olyvia NÃO emite faturas: em Portugal isso exige software
--     certificado pela AT. A fatura é emitida no PHC, Moloni, Eticadata…
--     e aqui só se regista: número, data, valor, tranche e, se houver, o
--     PDF e o ATCUD. (Mesmo princípio de rpc_register_direct_sale_invoice,
--     20261202020000.)
--   · Pode haver vários pagamentos por contrato (tranches: "Adiantamento
--     50%" + "Final 50%"). Sem plano gravado, o plano sai do texto de
--     client_contracts.payment_terms; se o texto não tiver percentagens que
--     somem 100, fica uma tranche "Única 100%".
--   · O 1.º pagamento validado dispara a obra (plano por aprovar) e a
--     encomenda de material. Aqui só se AVISA: a encomenda é da área do
--     Inventário e a obra é criada pelo gestor na app de Operações.
--   · Valida o pagamento quem tem finance.validate: a função nova
--     "Financeiro" e a Direção (administradores).
--
-- O que esta migration cria:
--   1. client_finance_settings   — a partir de que data se fatura aqui
--   2. client_payment_tranches   — o plano de pagamento de cada contrato
--   3. client_invoices           — as faturas registadas
--   4. client_receipts           — os pagamentos validados (o recibo)
--   5. client_finance_events     — "1.º pagamento recebido" (para Operações)
--   6. funções e RPCs rpc_fin_*  — escrita só por RPC (SECURITY DEFINER)
--   7. permissões finance.view / finance.register / finance.validate e a
--      função "Financeiro" em cada organização que tem Administrador.
--
-- Regras de desenho:
--   · RLS ligada em tudo, com leitura por organização visível + permissão;
--     NÃO há policies de escrita: tudo passa por rpc_fin_*.
--   · Não escreve em client_contracts nem em nenhuma tabela de propostas,
--     orçamentos ou inventário. Fora das tabelas novas só escreve avisos em
--     public.notifications (kind = 'notification', user_id = id de AUTH).
--   · Idempotente: corre duas vezes sem erro e sem duplicar nada.
--
-- Ordem: depois da baseline (client_contracts, notifications, anew_*).
-- Não depende do SQL de Operações; operacao-app/db/financeiro-obra.sql é que
-- depende DESTA migration (e de obras.sql).
-- ============================================================


-- ============================================================
-- 0. Quem pode o quê (uma função só, usada nas RPCs e nas policies)
-- ============================================================
-- Mesmo critério das RPCs vizinhas: a permissão do CRM é GLOBAL
-- (has_anew_permission), por isso a organização tem de ser visível ao
-- utilizador. Os administradores de sistema passam sempre.
CREATE OR REPLACE FUNCTION public.fin_pode(p_org uuid, p_perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_org IS NOT NULL AND (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      p_org IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), p_perm)
    )
  )
$$;

REVOKE ALL ON FUNCTION public.fin_pode(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_pode(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fin_pode(uuid, text) IS
  'Financeiro: true se quem chama tem a permissão (finance.*) e a organização lhe é visível, '
  'ou é administrador de sistema.';

-- ============================================================
-- 1. client_finance_settings — a partir de quando se fatura aqui
-- ============================================================
-- Sem isto, no dia em que entra o Financeiro, todos os contratos assinados
-- de sempre apareciam "por faturar" (já foram faturados lá fora). A lista
-- "Por faturar" só mostra contratos assinados a partir de faturar_desde.
-- Sem linha para a organização: mostra todos (organização nova).
CREATE TABLE IF NOT EXISTS public.client_finance_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  faturar_desde   date NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_finance_settings IS
  'Financeiro: a partir de que data de assinatura os contratos entram na lista "Por faturar". '
  'Semeada pela migration 20261214100000 com a data de aplicação menos 30 dias; ajustar à mão se preciso.';

-- Organizações que já existem: 30 dias para trás a partir de hoje.
INSERT INTO public.client_finance_settings (organization_id, faturar_desde)
SELECT o.id, current_date - 30
  FROM public.anew_organizations o
ON CONFLICT (organization_id) DO NOTHING;

-- ============================================================
-- 2. client_payment_tranches — o plano de pagamento do contrato
-- ============================================================
-- Uma linha por tranche. Grava-se ao registar a 1.ª fatura do contrato
-- (a partir do plano sugerido), para o plano não mudar debaixo das faturas
-- se alguém editar o texto payment_terms depois.
CREATE TABLE IF NOT EXISTS public.client_payment_tranches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  contract_id      uuid NOT NULL REFERENCES public.client_contracts(id) ON DELETE CASCADE,
  ordem            smallint NOT NULL CHECK (ordem BETWEEN 1 AND 20),
  descricao        text NOT NULL,
  percentagem      numeric(6,2) NOT NULL CHECK (percentagem > 0 AND percentagem <= 100),
  valor            numeric(12,2) NOT NULL CHECK (valor >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,                 -- → anew_users.id
  UNIQUE (contract_id, ordem)
);

CREATE INDEX IF NOT EXISTS client_payment_tranches_org_idx
  ON public.client_payment_tranches (organization_id);

COMMENT ON TABLE public.client_payment_tranches IS
  'Financeiro: tranches do plano de pagamento de um contrato (ex.: Adiantamento 50% + Final 50%). '
  'Sem linhas, o plano é o sugerido por fin_tranches_sugeridas(payment_terms, total_value).';

-- ============================================================
-- 3. client_invoices — as faturas registadas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  -- RESTRICT: uma fatura é registo fiscal; apagar o contrato não a leva.
  contract_id      uuid NOT NULL REFERENCES public.client_contracts(id) ON DELETE RESTRICT,
  tranche_id       uuid NOT NULL REFERENCES public.client_payment_tranches(id) ON DELETE RESTRICT,
  numero           text NOT NULL CHECK (btrim(numero) <> ''),
  data             date NOT NULL,
  valor            numeric(12,2) NOT NULL CHECK (valor > 0),
  invoice_source   text NOT NULL CHECK (invoice_source IN ('PHC','Moloni','Eticadata','Outro')),
  atcud            text,
  pdf_path         text,                 -- caminho no bucket `documents` (<org>/client_invoice/<contrato>/…)
  estado           text NOT NULL DEFAULT 'registada' CHECK (estado IN ('registada','paga','anulada')),
  motivo_anulacao  text,
  anulada_em       timestamptz,
  anulada_por      uuid,                 -- → anew_users.id
  created_by       uuid,                 -- → anew_users.id
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (estado <> 'anulada' OR (motivo_anulacao IS NOT NULL AND anulada_em IS NOT NULL))
);

-- Uma fatura ativa por tranche; o mesmo número não se regista duas vezes
-- na mesma organização (uma anulada deixa registar outra vez).
CREATE UNIQUE INDEX IF NOT EXISTS client_invoices_tranche_ativa_uidx
  ON public.client_invoices (tranche_id) WHERE estado <> 'anulada';
CREATE UNIQUE INDEX IF NOT EXISTS client_invoices_numero_ativo_uidx
  ON public.client_invoices (organization_id, lower(btrim(numero))) WHERE estado <> 'anulada';
CREATE INDEX IF NOT EXISTS client_invoices_contrato_idx
  ON public.client_invoices (contract_id);
CREATE INDEX IF NOT EXISTS client_invoices_org_estado_idx
  ON public.client_invoices (organization_id, estado);

COMMENT ON TABLE public.client_invoices IS
  'Financeiro: faturas de cliente REGISTADAS (emitidas num programa certificado: PHC, Moloni, Eticadata…). '
  'A Olyvia não emite faturas. Escrita só por rpc_fin_registar_fatura / rpc_fin_validar_pagamento / rpc_fin_anular_fatura.';

-- ============================================================
-- 4. client_receipts — o pagamento validado (o recibo)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_receipts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL REFERENCES public.client_invoices(id) ON DELETE RESTRICT,
  contract_id      uuid NOT NULL,
  data_pagamento   date NOT NULL,
  valor            numeric(12,2) NOT NULL CHECK (valor > 0),
  validado_por     uuid,                 -- → anew_users.id
  validado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id)                    -- hoje: um pagamento por fatura (sem pagamentos parciais)
);

CREATE INDEX IF NOT EXISTS client_receipts_contrato_idx
  ON public.client_receipts (contract_id);

COMMENT ON TABLE public.client_receipts IS
  'Financeiro: pagamento de uma fatura validado internamente (o recibo). Escrita só por rpc_fin_validar_pagamento.';

-- ============================================================
-- 5. client_finance_events — o que as Operações leem
-- ============================================================
-- UNIQUE (contract_id, tipo): é o que garante "só o PRIMEIRO pagamento
-- avisa", mesmo com dois pagamentos validados ao mesmo tempo.
CREATE TABLE IF NOT EXISTS public.client_finance_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  contract_id      uuid NOT NULL REFERENCES public.client_contracts(id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('primeiro_pagamento')),
  invoice_id       uuid,
  receipt_id       uuid,
  cliente_nome     text,
  created_by       uuid,                 -- → anew_users.id
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, tipo)
);

CREATE INDEX IF NOT EXISTS client_finance_events_org_idx
  ON public.client_finance_events (organization_id, tipo);

COMMENT ON TABLE public.client_finance_events IS
  'Financeiro → Operações: "1.º pagamento recebido" por contrato (uma vez). '
  'Lido por rpc_ops_obras_por_criar (operacao-app/db/financeiro-obra.sql).';

-- ============================================================
-- 6. RLS — leitura por organização + permissão; escrita só por RPC
-- ============================================================
ALTER TABLE public.client_finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payment_tranches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_receipts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_finance_events   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_finance_settings_select ON public.client_finance_settings;
CREATE POLICY client_finance_settings_select ON public.client_finance_settings
  FOR SELECT TO authenticated USING (public.fin_pode(organization_id, 'finance.view'));

DROP POLICY IF EXISTS client_payment_tranches_select ON public.client_payment_tranches;
CREATE POLICY client_payment_tranches_select ON public.client_payment_tranches
  FOR SELECT TO authenticated USING (public.fin_pode(organization_id, 'finance.view'));

DROP POLICY IF EXISTS client_invoices_select ON public.client_invoices;
CREATE POLICY client_invoices_select ON public.client_invoices
  FOR SELECT TO authenticated USING (public.fin_pode(organization_id, 'finance.view'));

DROP POLICY IF EXISTS client_receipts_select ON public.client_receipts;
CREATE POLICY client_receipts_select ON public.client_receipts
  FOR SELECT TO authenticated USING (public.fin_pode(organization_id, 'finance.view'));

-- O evento também é lido por quem planeia obras (o resto chega-lhe pela RPC).
DROP POLICY IF EXISTS client_finance_events_select ON public.client_finance_events;
CREATE POLICY client_finance_events_select ON public.client_finance_events
  FOR SELECT TO authenticated USING (
    public.fin_pode(organization_id, 'finance.view')
    OR public.fin_pode(organization_id, 'operations.orders.create'));

REVOKE ALL ON public.client_finance_settings, public.client_payment_tranches, public.client_invoices,
              public.client_receipts, public.client_finance_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_finance_settings, public.client_payment_tranches,
              public.client_invoices, public.client_receipts, public.client_finance_events FROM authenticated;
GRANT SELECT ON public.client_finance_settings, public.client_payment_tranches, public.client_invoices,
              public.client_receipts, public.client_finance_events TO authenticated;
GRANT ALL ON public.client_finance_settings, public.client_payment_tranches, public.client_invoices,
              public.client_receipts, public.client_finance_events TO service_role;

-- ============================================================
-- 7. Funções de apoio (sem permissões próprias: só as RPCs as chamam)
-- ============================================================

-- O plano sugerido a partir do texto do contrato ("50% na adjudicação, 50%
-- no fim"). Percentagens que somam 100 → uma tranche por percentagem; senão
-- "Única 100%". A última tranche leva o resto, para a soma bater com o total.
CREATE OR REPLACE FUNCTION public.fin_tranches_sugeridas(p_terms text, p_total numeric)
RETURNS TABLE (ordem integer, descricao text, percentagem numeric, valor numeric)
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pcts  numeric[];
  v_n     integer;
  v_total numeric := round(COALESCE(p_total, 0), 2);
  v_acum  numeric := 0;
  i       integer;
BEGIN
  SELECT array_agg(replace(r.m[1], ',', '.')::numeric ORDER BY r.ord)
    INTO v_pcts
    FROM regexp_matches(COALESCE(p_terms, ''), '(\d+(?:[.,]\d+)?)\s*%', 'g') WITH ORDINALITY AS r(m, ord);
  v_n := COALESCE(array_length(v_pcts, 1), 0);

  IF v_n < 2 OR v_n > 20
     OR (SELECT sum(x) FROM unnest(v_pcts) x) <> 100
     OR EXISTS (SELECT 1 FROM unnest(v_pcts) x WHERE x <= 0) THEN
    ordem := 1; descricao := 'Única 100%'; percentagem := 100; valor := v_total;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR i IN 1..v_n LOOP
    ordem := i;
    percentagem := v_pcts[i];
    descricao := CASE WHEN i = 1 THEN 'Adiantamento'
                      WHEN i = v_n THEN 'Final'
                      WHEN v_n = 3 THEN 'A meio'
                      ELSE i || '.ª tranche' END
                 || ' ' || replace(trim_scale(v_pcts[i])::text, '.', ',') || '%';
    IF i = v_n THEN
      valor := v_total - v_acum;
    ELSE
      valor := round(v_total * v_pcts[i] / 100, 2);
      v_acum := v_acum + valor;
    END IF;
    RETURN NEXT;
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION public.fin_tranches_sugeridas(text, numeric) TO authenticated, service_role;

-- O plano de um contrato: o gravado, ou o sugerido (tranche_id NULL).
CREATE OR REPLACE FUNCTION public.fin_plano_do_contrato(p_contract_id uuid)
RETURNS TABLE (tranche_id uuid, ordem integer, descricao text, percentagem numeric, valor numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.client_payment_tranches t WHERE t.contract_id = p_contract_id) THEN
    RETURN QUERY
      SELECT t.id, t.ordem::integer, t.descricao, t.percentagem, t.valor
        FROM public.client_payment_tranches t
       WHERE t.contract_id = p_contract_id
       ORDER BY t.ordem;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT NULL::uuid, s.ordem, s.descricao, s.percentagem, s.valor
      FROM public.client_contracts c
     CROSS JOIN LATERAL public.fin_tranches_sugeridas(c.payment_terms, c.total_value) s
     WHERE c.id = p_contract_id
     ORDER BY s.ordem;
END
$$;

REVOKE ALL ON FUNCTION public.fin_plano_do_contrato(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_plano_do_contrato(uuid) TO service_role;

-- O nome do cliente do contrato (anew_clients não tem nome: vive em
-- anew_entities.display_name). Sem cliente → o número do contrato.
CREATE OR REPLACE FUNCTION public.fin_nome_cliente(p_contract_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
           nullif(btrim(ec.display_name), ''),
           nullif(btrim(ed.display_name), ''),
           'Contrato ' || COALESCE(c.contract_number, 's/ número'))
    FROM public.client_contracts c
    LEFT JOIN public.anew_clients cl ON cl.id = c.client_id
    LEFT JOIN public.anew_entities ec ON ec.id = cl.entity_id
    LEFT JOIN public.anew_entities ed ON ed.id = c.entity_id
   WHERE c.id = p_contract_id
$$;

REVOKE ALL ON FUNCTION public.fin_nome_cliente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_nome_cliente(uuid) TO service_role;

-- Avisos no sino do CRM quando chega o 1.º pagamento. Um aviso aberto por
-- (pessoa, tipo, contrato). Nunca rebenta: um aviso que falha não desfaz a
-- validação do pagamento (o evento fica gravado e as Operações veem-no na
-- mesma). Devolve quantos avisos novos escreveu.
--   financeiro_criar_obra       → quem cria obras (operations.orders.create)
--   financeiro_materiais_obra   → quem encomenda (purchase_orders.create)
CREATE OR REPLACE FUNCTION public.fin_avisar_primeiro_pagamento(
  p_org uuid, p_contract_id uuid, p_cliente text, p_fatura text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  n integer := 0;
  k integer;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN 0;
  END IF;

  WITH destino(tipo, perm, titulo, mensagem, link) AS (
    VALUES
      ('financeiro_criar_obra', 'operations.orders.create',
       'Criar obra: ' || p_cliente,
       'Pagamento recebido (fatura ' || p_fatura || '). Crie a obra: fica com o plano por aprovar.',
       '/operacao/obras?criar=' || p_contract_id::text),
      ('financeiro_materiais_obra', 'purchase_orders.create',
       'Materiais da obra: ' || p_cliente,
       'Pagamento recebido (fatura ' || p_fatura || '). Confirme os materiais da obra e encomende o que faltar.',
       '/purchase-orders')
  ),
  pessoas AS (
    SELECT DISTINCT d.tipo, d.titulo, d.mensagem, d.link, au.auth_user_id
      FROM destino d
      JOIN public.anew_role_permissions rp ON rp.permission_code = d.perm
      JOIN public.anew_memberships m ON m.role_id = rp.role_id
                                     AND m.organization_id = p_org AND m.status = 'active'
      JOIN public.anew_users au ON au.id = m.user_id AND au.auth_user_id IS NOT NULL
  )
  INSERT INTO public.notifications
    (user_id, organization_id, kind, type, title, message, link, entity_type, entity_id, priority, data)
  SELECT p.auth_user_id, p_org, 'notification', p.tipo, p.titulo, p.mensagem, p.link,
         'client_contract', p_contract_id, 'high',
         jsonb_build_object('modulo', 'financeiro', 'contract_id', p_contract_id)
    FROM pessoas p
   WHERE NOT EXISTS (
     SELECT 1 FROM public.notifications x
      WHERE x.user_id = p.auth_user_id AND x.type = p.tipo
        AND x.entity_id = p_contract_id AND NOT x.is_resolved);
  GET DIAGNOSTICS k = ROW_COUNT;
  n := n + k;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Avisos do 1.º pagamento não enviados: %', SQLERRM;
  RETURN 0;
END
$$;

REVOKE ALL ON FUNCTION public.fin_avisar_primeiro_pagamento(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_avisar_primeiro_pagamento(uuid, uuid, text, text) TO service_role;

-- ============================================================
-- 8. RPCs
-- ============================================================

-- 8.1 Registar uma fatura emitida no programa certificado.
CREATE OR REPLACE FUNCTION public.rpc_fin_registar_fatura(
  p_contract_id    uuid,
  p_tranche_ordem  integer,
  p_numero         text,
  p_data           date,
  p_valor          numeric,
  p_origem         text,
  p_atcud          text DEFAULT NULL,
  p_pdf_path       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor    uuid;
  v_c        record;
  v_tranche  record;
  v_existe   text;
  v_numero   text := nullif(btrim(COALESCE(p_numero, '')), '');
  v_pdf      text := nullif(btrim(COALESCE(p_pdf_path, '')), '');
  v_inv      public.client_invoices;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT c.id, c.organization_id, c.status
    INTO v_c
    FROM public.client_contracts c
   WHERE c.id = p_contract_id AND c.deleted_at IS NULL
     FOR UPDATE;
  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.fin_pode(v_c.organization_id, 'finance.register') THEN
    RAISE EXCEPTION 'Sem permissão para registar faturas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_c.status NOT IN ('signed', 'assinado', 'active') THEN
    RAISE EXCEPTION 'Só se fatura um contrato assinado (este está "%")', v_c.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'Falta o número da fatura' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Falta a data da fatura' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data > current_date THEN
    RAISE EXCEPTION 'A data da fatura não pode ser no futuro' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'O valor tem de ser maior do que zero' USING ERRCODE = 'check_violation';
  END IF;
  IF p_origem IS NULL OR p_origem NOT IN ('PHC', 'Moloni', 'Eticadata', 'Outro') THEN
    RAISE EXCEPTION 'Escolha o programa onde a fatura foi emitida' USING ERRCODE = 'check_violation';
  END IF;
  -- O PDF tem de estar na pasta desta organização (não se aponta para o de outra).
  IF v_pdf IS NOT NULL AND v_pdf NOT LIKE v_c.organization_id::text || '/client_invoice/%' THEN
    RAISE EXCEPTION 'Caminho do PDF inválido' USING ERRCODE = 'check_violation';
  END IF;

  -- Grava o plano sugerido na 1.ª fatura do contrato (a partir daqui o
  -- plano não muda se alguém editar o texto das condições de pagamento).
  IF NOT EXISTS (SELECT 1 FROM public.client_payment_tranches WHERE contract_id = v_c.id) THEN
    INSERT INTO public.client_payment_tranches
      (organization_id, contract_id, ordem, descricao, percentagem, valor, created_by)
    SELECT v_c.organization_id, v_c.id, s.ordem, s.descricao, s.percentagem, s.valor, v_actor
      FROM public.fin_plano_do_contrato(v_c.id) s
    ON CONFLICT (contract_id, ordem) DO NOTHING;
  END IF;

  SELECT t.id, t.descricao INTO v_tranche
    FROM public.client_payment_tranches t
   WHERE t.contract_id = v_c.id AND t.ordem = p_tranche_ordem;
  IF v_tranche.id IS NULL THEN
    RAISE EXCEPTION 'Essa tranche não está no plano de pagamento do contrato' USING ERRCODE = 'check_violation';
  END IF;

  SELECT numero INTO v_existe FROM public.client_invoices
   WHERE tranche_id = v_tranche.id AND estado <> 'anulada' LIMIT 1;
  IF v_existe IS NOT NULL THEN
    RAISE EXCEPTION 'A tranche "%" já tem a fatura %', v_tranche.descricao, v_existe USING ERRCODE = 'unique_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_invoices
              WHERE organization_id = v_c.organization_id AND estado <> 'anulada'
                AND lower(btrim(numero)) = lower(v_numero)) THEN
    RAISE EXCEPTION 'A fatura % já está registada', v_numero USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.client_invoices
    (organization_id, contract_id, tranche_id, numero, data, valor, invoice_source, atcud, pdf_path, created_by)
  VALUES
    (v_c.organization_id, v_c.id, v_tranche.id, v_numero, p_data, round(p_valor, 2), p_origem,
     nullif(btrim(COALESCE(p_atcud, '')), ''), v_pdf, v_actor)
  RETURNING * INTO v_inv;

  RETURN to_jsonb(v_inv) || jsonb_build_object('tranche_descricao', v_tranche.descricao);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_fin_registar_fatura(uuid, integer, text, date, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fin_registar_fatura(uuid, integer, text, date, numeric, text, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_fin_registar_fatura(uuid, integer, text, date, numeric, text, text, text) IS
  'Financeiro: regista uma fatura emitida num programa certificado (a Olyvia não emite), numa tranche do '
  'plano de pagamento do contrato. Exige finance.register, contrato assinado e organização visível.';

-- 8.2 Validar o pagamento de uma fatura (sai o recibo). O 1.º do contrato
-- grava o evento e avisa Operações e Armazém — uma vez só.
CREATE OR REPLACE FUNCTION public.rpc_fin_validar_pagamento(
  p_invoice_id      uuid,
  p_data_pagamento  date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor    uuid;
  v_inv      public.client_invoices;
  v_rec      public.client_receipts;
  v_evento   uuid;
  v_cliente  text;
  v_avisos   integer := 0;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_inv FROM public.client_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Fatura não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.fin_pode(v_inv.organization_id, 'finance.validate') THEN
    RAISE EXCEPTION 'Sem permissão para validar pagamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_inv.estado = 'paga' THEN
    RAISE EXCEPTION 'O pagamento da fatura % já foi validado', v_inv.numero USING ERRCODE = 'check_violation';
  END IF;
  IF v_inv.estado = 'anulada' THEN
    RAISE EXCEPTION 'A fatura % está anulada', v_inv.numero USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_pagamento IS NULL THEN
    RAISE EXCEPTION 'Falta a data do pagamento' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_pagamento > current_date THEN
    RAISE EXCEPTION 'A data do pagamento não pode ser no futuro' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.client_receipts
    (organization_id, invoice_id, contract_id, data_pagamento, valor, validado_por)
  VALUES
    (v_inv.organization_id, v_inv.id, v_inv.contract_id, p_data_pagamento, v_inv.valor, v_actor)
  RETURNING * INTO v_rec;

  UPDATE public.client_invoices SET estado = 'paga', updated_at = now() WHERE id = v_inv.id;

  -- O 1.º pagamento validado do contrato (a UNIQUE decide, mesmo em corrida).
  v_cliente := public.fin_nome_cliente(v_inv.contract_id);
  INSERT INTO public.client_finance_events
    (organization_id, contract_id, tipo, invoice_id, receipt_id, cliente_nome, created_by)
  VALUES
    (v_inv.organization_id, v_inv.contract_id, 'primeiro_pagamento', v_inv.id, v_rec.id, v_cliente, v_actor)
  ON CONFLICT (contract_id, tipo) DO NOTHING
  RETURNING id INTO v_evento;

  IF v_evento IS NOT NULL THEN
    v_avisos := public.fin_avisar_primeiro_pagamento(v_inv.organization_id, v_inv.contract_id, v_cliente, v_inv.numero);
  END IF;

  RETURN jsonb_build_object(
    'receipt_id', v_rec.id,
    'invoice_id', v_inv.id,
    'contract_id', v_inv.contract_id,
    'valor', v_rec.valor,
    'primeiro_pagamento', v_evento IS NOT NULL,
    'avisos', v_avisos);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_fin_validar_pagamento(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fin_validar_pagamento(uuid, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_fin_validar_pagamento(uuid, date) IS
  'Financeiro: valida o pagamento de uma fatura registada (cria o recibo e marca a fatura paga). O 1.º pagamento '
  'validado do contrato grava client_finance_events (primeiro_pagamento) e avisa Operações e Armazém, uma vez só. '
  'Exige finance.validate.';

-- 8.3 Anular uma fatura registada por engano (ainda não paga).
CREATE OR REPLACE FUNCTION public.rpc_fin_anular_fatura(
  p_invoice_id  uuid,
  p_motivo      text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor   uuid;
  v_inv     public.client_invoices;
  v_motivo  text := nullif(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_inv FROM public.client_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Fatura não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.fin_pode(v_inv.organization_id, 'finance.register') THEN
    RAISE EXCEPTION 'Sem permissão para anular faturas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_inv.estado = 'anulada' THEN
    RAISE EXCEPTION 'A fatura % já está anulada', v_inv.numero USING ERRCODE = 'check_violation';
  END IF;
  -- Uma fatura paga tem recibo: corrige-se com nota de crédito no programa
  -- certificado, não aqui.
  IF v_inv.estado = 'paga' THEN
    RAISE EXCEPTION 'A fatura % já está paga: corrija com uma nota de crédito no programa de faturação', v_inv.numero
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'Escreva o motivo da anulação' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.client_invoices
     SET estado = 'anulada', motivo_anulacao = v_motivo, anulada_em = now(), anulada_por = v_actor, updated_at = now()
   WHERE id = v_inv.id
  RETURNING * INTO v_inv;

  RETURN to_jsonb(v_inv);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_fin_anular_fatura(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fin_anular_fatura(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_fin_anular_fatura(uuid, text) IS
  'Financeiro: anula uma fatura registada e ainda não paga (exige motivo e finance.register). '
  'A tranche volta a ficar por faturar.';

-- 8.4 As duas listas do ecrã /financeiro.
--   por_faturar  — tranches de contratos assinados sem fatura ativa
--   por_validar  — faturas registadas à espera do pagamento
CREATE OR REPLACE FUNCTION public.rpc_fin_fila(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_desde        date;
  v_por_faturar  jsonb;
  v_por_validar  jsonb;
BEGIN
  IF NOT public.fin_pode(p_org, 'finance.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver o Financeiro' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT faturar_desde INTO v_desde FROM public.client_finance_settings WHERE organization_id = p_org;

  WITH contratos AS (
    SELECT c.id, c.contract_number, c.payment_terms, c.total_value,
           COALESCE(c.signature_date, c.company_signature_date, c.accepted_at, c.status_changed_at, c.created_at) AS assinado_em,
           EXISTS (SELECT 1 FROM public.client_finance_events e
                    WHERE e.contract_id = c.id AND e.tipo = 'primeiro_pagamento') AS ja_pago
      FROM public.client_contracts c
     WHERE c.organization_id = p_org
       AND c.deleted_at IS NULL
       AND c.status IN ('signed', 'assinado', 'active')
       AND (v_desde IS NULL
            OR COALESCE(c.signature_date, c.company_signature_date, c.accepted_at, c.status_changed_at, c.created_at)::date >= v_desde)
  ),
  linhas AS (
    SELECT ct.*, p.tranche_id, p.ordem, p.descricao, p.percentagem, p.valor,
           count(*) OVER (PARTITION BY ct.id) AS n_tranches
      FROM contratos ct
     CROSS JOIN LATERAL public.fin_plano_do_contrato(ct.id) p
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'contract_id', l.id,
           'contrato_numero', l.contract_number,
           'cliente_nome', public.fin_nome_cliente(l.id),
           'contrato_valor', l.total_value,
           'condicoes_pagamento', l.payment_terms,
           'assinado_em', l.assinado_em,
           'tranche_ordem', l.ordem,
           'tranche_descricao', l.descricao,
           'percentagem', l.percentagem,
           'valor_sugerido', l.valor,
           'n_tranches', l.n_tranches,
           'dispara_obra', NOT l.ja_pago)
         ORDER BY l.assinado_em, l.id, l.ordem), '[]'::jsonb)
    INTO v_por_faturar
    FROM linhas l
   WHERE l.tranche_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.client_invoices i
                      WHERE i.tranche_id = l.tranche_id AND i.estado <> 'anulada');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'invoice_id', i.id,
           'numero', i.numero,
           'data', i.data,
           'valor', i.valor,
           'origem', i.invoice_source,
           'atcud', i.atcud,
           'pdf_path', i.pdf_path,
           'contract_id', i.contract_id,
           'contrato_numero', c.contract_number,
           'cliente_nome', public.fin_nome_cliente(i.contract_id),
           'tranche_descricao', t.descricao,
           'dispara_obra', NOT EXISTS (SELECT 1 FROM public.client_finance_events e
                                        WHERE e.contract_id = i.contract_id AND e.tipo = 'primeiro_pagamento'))
         ORDER BY i.data, i.created_at), '[]'::jsonb)
    INTO v_por_validar
    FROM public.client_invoices i
    JOIN public.client_contracts c ON c.id = i.contract_id
    JOIN public.client_payment_tranches t ON t.id = i.tranche_id
   WHERE i.organization_id = p_org AND i.estado = 'registada';

  RETURN jsonb_build_object('por_faturar', v_por_faturar, 'por_validar', v_por_validar, 'faturar_desde', v_desde);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_fin_fila(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fin_fila(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_fin_fila(uuid) IS
  'Financeiro: as duas listas do ecrã /financeiro — tranches por faturar (contratos assinados desde '
  'client_finance_settings.faturar_desde) e faturas por validar pagamento. Exige finance.view.';

-- ============================================================
-- 9. Permissões (categoria 'finance') e atribuição
-- ============================================================
INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('finance.view',
   'Ver o Financeiro',
   'Permite abrir o ecrã Financeiro: tranches por faturar dos contratos assinados e faturas à espera do pagamento.',
   'finance', NULL, 0, false, 'organization', false),
  ('finance.register',
   'Registar faturas',
   'Permite registar as faturas emitidas no programa de faturação certificado (número, data, valor, tranche, PDF) e anular uma fatura registada por engano que ainda não foi paga. A Olyvia não emite faturas.',
   'finance', NULL, 1, false, 'organization', false),
  ('finance.validate',
   'Validar pagamentos',
   'Permite validar o pagamento de uma fatura (sai o recibo). O 1.º pagamento validado de um contrato avisa as Operações para criar a obra e o Armazém para os materiais.',
   'finance', NULL, 2, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- DISABLE TRIGGER USER: trg_protect_system_role_perms recusa escritas em
-- papéis is_system fora de service_role; os gatilhos de auditoria ficam
-- também desligados, como em 20261205000000 e 20261210130000.
ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;
ALTER TABLE public.anew_roles DISABLE TRIGGER USER;

-- A função "Financeiro" em cada organização que já tem Administrador
-- (org_admin): é aí que vivem as funções da empresa.
INSERT INTO public.anew_roles (code, name, description, organization_id, is_system, is_default, can_sign_contracts, created_by)
SELECT 'financeiro', 'Financeiro',
       'Regista as faturas emitidas no programa certificado e valida os pagamentos.',
       adm.organization_id, false, false, false, NULL::uuid
  FROM (SELECT DISTINCT r.organization_id
          FROM public.anew_roles r
         WHERE r.code = 'org_admin' AND r.organization_id IS NOT NULL AND r.deleted_at IS NULL) adm
 WHERE NOT EXISTS (
   SELECT 1 FROM public.anew_roles x
    WHERE x.code = 'financeiro' AND x.organization_id = adm.organization_id AND x.deleted_at IS NULL);

-- Financeiro: as três, mais ver contratos e clientes (para saber o que fatura).
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, c.code, NULL::uuid
  FROM public.anew_roles ro
 CROSS JOIN (VALUES ('finance.view'), ('finance.register'), ('finance.validate'),
                    ('client_contracts.view'), ('clients.view')) AS c(code)
 WHERE ro.code = 'financeiro' AND ro.deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c.code)
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Direção: System Admin, Super Admin, Administrador (org_admin) e as funções
-- cujo nome começa por "Dire" (Direção, Direcção, Diretor…).
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, c.code, NULL::uuid
  FROM public.anew_roles ro
 CROSS JOIN (VALUES ('finance.view'), ('finance.register'), ('finance.validate')) AS c(code)
 WHERE ro.deleted_at IS NULL
   AND (ro.code IN ('system_admin', 'super_admin', 'org_admin') OR ro.name ILIKE 'dire%')
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_roles ENABLE TRIGGER USER;
ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================
-- 10. CONFERIR
-- ============================================================
DO $conferir$
DECLARE
  v_missing text;
  v_count   integer;
BEGIN
  SELECT string_agg(c.code, ', ') INTO v_missing
    FROM (VALUES ('finance.view'), ('finance.register'), ('finance.validate')) AS c(code)
   WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c.code AND p.category = 'finance');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: permissões em falta no catálogo: %', v_missing;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.anew_roles ro
   WHERE ro.deleted_at IS NULL AND ro.code = 'org_admin'
     AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                      WHERE rp.role_id = ro.id AND rp.permission_code = 'finance.validate');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'CONFERIR: % Administrador(es) sem finance.validate', v_count;
  END IF;

  RAISE NOTICE 'Financeiro instalado: % função(ões) Financeiro, % organização(ões) com faturar_desde.',
    (SELECT count(*) FROM public.anew_roles WHERE code = 'financeiro' AND deleted_at IS NULL),
    (SELECT count(*) FROM public.client_finance_settings);
END
$conferir$;

