-- Venda Direta — paridade de colunas com Proposals + histórico de envios.
-- Módulos: Venda Direta, Client Portal
--
-- Contexto
-- --------
-- Decisão de produto: "as vendas diretas têm assigned_to, e é tudo igual às
-- propostas normais; a diferença é que aceitar e assinar via OTP gera uma
-- proforma/fatura". direct_sales (20261130230000) já tem a estrutura base
-- (cabeçalho, linhas, numeração, RLS interna, permissões) e o portal de
-- leitura (20261201100000 + 20261201110000), mas falta paridade de colunas
-- com public.proposals e falta o histórico de envios ao portal
-- (equivalente a public.proposal_sends). Esta migration fecha essas duas
-- lacunas.
--
-- Todas as colunas novas em direct_sales são ADD COLUMN IF NOT EXISTS,
-- nullable — a tabela está vazia em produção, é seguro. Tipo, default e FK de
-- cada coluna foram confirmados por leitura direta de information_schema e
-- pg_constraint em public.proposals na base de dados viva (não a partir de
-- migrations antigas) — ver relatório da tarefa para o detalhe coluna a
-- coluna.
--
-- Colunas explicitamente pedidas mas que NÃO são criadas aqui (pertencem ao
-- fluxo pesado de propostas, que a Venda Direta existe para evitar):
-- deal_id, value, value_sem_iva, proposal_number, template_id,
-- template_snapshot, published_snapshot*, has_unpublished_changes,
-- decided_snapshot*, public_token, public_link_enabled, tracking_token,
-- stage_id, probability, request_date, delivered_at, delivery_time_hours,
-- is_deleted.
--
-- Padrões seguidos (ficheiros lidos integralmente antes de escrever esta
-- migration, confirmados por leitura direta do schema vivo):
--   public.proposals — colunas assigned_to (FK -> anew_users, ON DELETE SET
--     NULL), acceptance_user_agent, rejection_reason/rejection_reason_code/
--     rejection_notes (text, sem FK), rejection_reason_id (uuid, SEM FK viva
--     — confirmado por pg_constraint, zero linhas), viewed_at/
--     last_viewed_at/view_count, description, valid_until (date), currency
--     (default 'EUR'), document_url. Índice idx_proposals_assigned_to
--     (btree simples, não parcial).
--   public.proposals_search_text_trigger() / proposals_compute_search_text()
--     — trigger trg_proposals_search_text (BEFORE INSERT OR UPDATE OF
--     title, entity_id, deal_id) confirmado em pg_trigger. A função de
--     cálculo usa apenas title + título do deal (p_entity_id é um parâmetro
--     morto — nunca lido no corpo da função, confirmado por leitura direta).
--     direct_sales não tem deal_id; o pedido desta tarefa é usar
--     sale_number, title, description e o nome do cliente. Como
--     proposals_compute_search_text não junta o nome do cliente (apesar de
--     receber entity_id), o padrão real mais próximo do que foi pedido é
--     public.quotes_compute_search_text(quote_number, title, entity_id,
--     deal_id), que resolve o entity_id (direto ou via deal) e junta
--     anew_entities.search_text (nome + email + telefone). A função nova
--     direct_sales_compute_search_text() segue esse padrão: sale_number +
--     title + description + anew_entities.search_text do entity_id
--     (resolvido diretamente, ou, na ausência de entity_id, via
--     anew_clients.entity_id a partir de client_id — direct_sales tem as
--     duas colunas, quotes só tem entity_id). Adaptação sinalizada no
--     relatório.
--   Ordem de disparo dos triggers BEFORE em Postgres é alfabética pelo nome
--   do trigger. trigger_set_direct_sale_number (20261130230000) já existe e
--   preenche NEW.sale_number só em BEFORE INSERT. Para o trigger novo de
--   search_text poder ler NEW.sale_number já preenchido também no INSERT
--   (e não só no UPDATE), tem de correr DEPOIS desse — daí o nome
--   trigger_update_direct_sale_search_text ("...update..." > "...set..."
--   alfabeticamente), em vez do padrão trg_* usado por proposals/quotes.
--   Sem esta escolha de nome, o search_text da primeira gravação ficaria
--   sempre sem o número da venda.
--   public.proposal_sends — colunas, índices, RLS, triggers e grants lidos
--     diretamente da BD viva (information_schema + pg_indexes + pg_trigger +
--     pg_policies + role_table_grants). Replicados coluna a coluna,
--     trocando proposal_id por direct_sale_id (FK -> direct_sales,
--     ON DELETE CASCADE). Adaptações necessárias, sinalizadas no relatório:
--     (1) fn_audit_proposal_send() está codificada para a tabela
--     proposal_sends (coluna proposal_id, junção a public.proposals para
--     resolver entity_id) — não é reutilizável tal e qual; criada
--     fn_audit_direct_sale_send() com a mesma lógica (redação de PII,
--     colunas de ruído excluídas do diff, bypass app.audit_bypass),
--     trocando proposal_id/proposals por direct_sale_id/direct_sales.
--     (2) As políticas RLS vivas de proposal_sends (org_select_proposal_sends
--     / org_insert_proposal_sends) NÃO usam has_anew_permission nenhum — só
--     comparam organization_id a get_user_visible_org_ids(); não têm bypass
--     de is_system_admin_user(). O pedido desta tarefa foi explícito em usar
--     direct_sales.view como permissão de leitura, por isso a policy SELECT
--     de direct_sale_sends acrescenta esse has_anew_permission(...,
--     'direct_sales.view') e o bypass is_system_admin_user() — mesmo padrão
--     já usado em todas as políticas internas de direct_sales/
--     direct_sale_lines (20261130230000), para consistência dentro da
--     própria feature. A policy INSERT segue "o que a original usar para
--     escrita": mesma condição de organização, mais o bypass de
--     is_system_admin_user() (superset estritamente aditivo do que já existe
--     em proposal_sends — nunca bloqueia nada que já funcionava, só dá
--     acesso extra a admins de sistema, já concedido em toda a restante RLS
--     desta feature). Sem policy UPDATE/DELETE, tal como o original — as
--     colunas de tracking (open_count, last_opened_at, ...) são escritas via
--     service_role numa edge function futura, que ignora RLS, tal como
--     proposal_sends já faz hoje.
--     (3) Sem GRANT explícito de tabela — os únicos grants vistos em
--     proposal_sends para anon são REFERENCES/TRIGGER/TRUNCATE (sem SELECT/
--     INSERT/UPDATE/DELETE), que são os privilégios por omissão do schema
--     public já concedidos a qualquer tabela nova (mesmo comportamento
--     documentado em 20261130230000 para direct_sales/direct_sale_lines:
--     "sem GRANT explícito de tabela — privilégios de schema já cobrem
--     authenticated"). Nada a replicar aqui manualmente.
--
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration.


-- ============================================================
-- A. Paridade de colunas — public.direct_sales
-- ============================================================

-- ------------------------------------------------------------
-- A.1 assigned_to — comercial responsável (pedido explícito do utilizador)
-- ------------------------------------------------------------
ALTER TABLE public.direct_sales
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.anew_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.direct_sales.assigned_to IS
  'Comercial responsável pela Venda Direta. Mesmo tipo/FK/ON DELETE de proposals.assigned_to (anew_users, SET NULL). Ao contrário de proposals, esta migration não cria nenhum trigger equivalente a set_proposal_assigned_to() — a atribuição fica a cargo do frontend/RPC de escrita desta fase, fora do âmbito desta migration.';

CREATE INDEX IF NOT EXISTS idx_direct_sales_assigned_to ON public.direct_sales(assigned_to);


-- ------------------------------------------------------------
-- A.2 Rejeição — espelha proposals (texto livre + código + notas + FK a
-- motivo estruturado, quando existir)
-- ------------------------------------------------------------
ALTER TABLE public.direct_sales
  ADD COLUMN IF NOT EXISTS acceptance_user_agent text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejection_reason_code text,
  ADD COLUMN IF NOT EXISTS rejection_notes text,
  ADD COLUMN IF NOT EXISTS rejection_reason_id uuid;

COMMENT ON COLUMN public.direct_sales.acceptance_user_agent IS
  'User-Agent do browser/dispositivo que aceitou a venda direta no portal. Mesmo tipo de proposals.acceptance_user_agent. Escrita prevista para a edge function de aceitação (fase seguinte), tal como acceptance_ip já criado em 20261130230000.';

COMMENT ON COLUMN public.direct_sales.rejection_reason_id IS
  'Referência a um motivo de rejeição estruturado. Sem FK: proposals.rejection_reason_id também não tem nenhuma foreign key viva (confirmado em pg_constraint) — replicado tal e qual, coluna solta.';


-- ------------------------------------------------------------
-- A.3 Métricas de visualização — espelha proposals
-- ------------------------------------------------------------
ALTER TABLE public.direct_sales
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;

COMMENT ON COLUMN public.direct_sales.viewed_at IS
  'Primeira visualização da venda direta pelo cliente no portal. Mesma semântica de proposals.viewed_at. Escrita prevista para a edge function do portal (fase seguinte).';

COMMENT ON COLUMN public.direct_sales.view_count IS
  'Número de visualizações da venda direta pelo cliente no portal. Mesmo default (0) de proposals.view_count.';


-- ------------------------------------------------------------
-- A.4 Campos de conteúdo/documento — espelha proposals
-- ------------------------------------------------------------
ALTER TABLE public.direct_sales
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS document_url text;

COMMENT ON COLUMN public.direct_sales.description IS
  'Descrição livre da venda direta, mostrada ao cliente. Mesmo tipo de proposals.description. Também usada em direct_sales_compute_search_text() (ver secção A.5).';

COMMENT ON COLUMN public.direct_sales.valid_until IS
  'Data-limite de validade da proposta simples (venda direta). Mesmo tipo (date, sem hora) de proposals.valid_until.';

COMMENT ON COLUMN public.direct_sales.document_url IS
  'URL de um documento anexo à venda direta (ex.: PDF gerado externamente). Mesmo uso de proposals.document_url — distinto de invoice_pdf_url (fatura) e de proforma_number (numeração da proforma), já existentes desde 20261130230000.';


-- ------------------------------------------------------------
-- A.5 search_text — trigger equivalente ao de proposals
-- ------------------------------------------------------------
-- proposals tem trigger trg_proposals_search_text (BEFORE INSERT OR UPDATE
-- OF title, entity_id, deal_id) -> proposals_search_text_trigger() ->
-- proposals_compute_search_text(title, entity_id, deal_id), que na prática
-- só concatena title + título do deal (entity_id é parâmetro morto na
-- função viva — confirmado por leitura direta). direct_sales não tem
-- deal_id; adaptação (documentada no cabeçalho): sale_number + title +
-- description + nome do cliente (via anew_entities.search_text, resolvido
-- por entity_id ou, na ausência deste, por client_id -> anew_clients.entity_id),
-- seguindo o padrão real de quotes_compute_search_text() (que já resolve e
-- junta o nome do cliente, ao contrário de proposals_compute_search_text()).

ALTER TABLE public.direct_sales
  ADD COLUMN IF NOT EXISTS search_text text;

COMMENT ON COLUMN public.direct_sales.search_text IS
  'Texto concatenado para pesquisa (sale_number + title + description + nome/email/telefone do cliente), mantido por trigger_update_direct_sale_search_text. Mesmo propósito de proposals.search_text; fórmula adaptada — ver cabeçalho desta migration.';

CREATE OR REPLACE FUNCTION public.direct_sales_compute_search_text(
  p_sale_number text,
  p_title text,
  p_description text,
  p_entity_id uuid,
  p_client_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_resolved_entity_id uuid;
  v_entity_search_text text;
BEGIN
  v_resolved_entity_id := p_entity_id;

  IF v_resolved_entity_id IS NULL AND p_client_id IS NOT NULL THEN
    SELECT c.entity_id
      INTO v_resolved_entity_id
      FROM public.anew_clients c
     WHERE c.id = p_client_id;
  END IF;

  IF v_resolved_entity_id IS NOT NULL THEN
    SELECT e.search_text
      INTO v_entity_search_text
      FROM public.anew_entities e
     WHERE e.id = v_resolved_entity_id;
  END IF;

  RETURN NULLIF(trim(
    coalesce(p_sale_number, '') || ' ' ||
    coalesce(p_title, '') || ' ' ||
    coalesce(p_description, '') || ' ' ||
    coalesce(v_entity_search_text, '')
  ), '');
END;
$function$;

COMMENT ON FUNCTION public.direct_sales_compute_search_text(text, text, text, uuid, uuid) IS
  'Calcula direct_sales.search_text: sale_number + title + description + nome/email/telefone do cliente (anew_entities.search_text, resolvido via entity_id ou, na ausência deste, via client_id -> anew_clients.entity_id). Padrão adaptado de quotes_compute_search_text() — proposals_compute_search_text() não junta o nome do cliente. Ver cabeçalho da migration 20261201120000.';

CREATE OR REPLACE FUNCTION public.direct_sales_search_text_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  NEW.search_text := public.direct_sales_compute_search_text(
    NEW.sale_number, NEW.title, NEW.description, NEW.entity_id, NEW.client_id
  );
  RETURN NEW;
END;
$function$;

-- Nome escolhido de propósito para correr DEPOIS de
-- trigger_set_direct_sale_number na ordem alfabética de disparo BEFORE do
-- Postgres ("trigger_update..." > "trigger_set..."), para que
-- NEW.sale_number já esteja preenchido quando o search_text é calculado,
-- mesmo no INSERT. Ver cabeçalho desta migration.
DROP TRIGGER IF EXISTS trigger_update_direct_sale_search_text ON public.direct_sales;
CREATE TRIGGER trigger_update_direct_sale_search_text
  BEFORE INSERT OR UPDATE OF sale_number, title, description, entity_id, client_id
  ON public.direct_sales
  FOR EACH ROW EXECUTE FUNCTION public.direct_sales_search_text_trigger();

CREATE INDEX IF NOT EXISTS idx_direct_sales_search_text_trgm
  -- gin_trgm_ops tem de ser qualificado: a extensão pg_trgm vive no schema
  -- `extensions` (padrão Supabase) e o search_path do `supabase db push` não
  -- o inclui. Sem a qualificação falha com "operator class gin_trgm_ops does
  -- not exist" — os índices trgm já existentes na BD foram criados quando o
  -- search_path ainda continha `extensions`.
  ON public.direct_sales USING gin (search_text extensions.gin_trgm_ops);


-- ============================================================
-- B. public.direct_sale_sends — histórico de envios ao portal
-- ============================================================
-- Réplica de public.proposal_sends coluna a coluna, trocando proposal_id por
-- direct_sale_id (FK -> direct_sales, ON DELETE CASCADE). Nenhuma coluna
-- inventada além da troca de FK — ver cabeçalho para as adaptações de RLS e
-- de função de auditoria.

CREATE TABLE IF NOT EXISTS public.direct_sale_sends (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    direct_sale_id           uuid NOT NULL REFERENCES public.direct_sales(id) ON DELETE CASCADE,
    organization_id          uuid REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
    sent_by                  uuid,
    sent_at                  timestamptz NOT NULL DEFAULT now(),
    recipient_email          text DEFAULT '',
    recipient_name           text,
    subject                  text,
    message                  text,
    status                   text DEFAULT 'sent',
    first_opened_at          timestamptz,
    last_opened_at           timestamptz,
    open_count               integer DEFAULT 0,
    first_link_clicked_at    timestamptz,
    device_type              text,
    browser                  text,
    os                       text,
    ip_address               text,
    location_country         text,
    location_city            text,
    total_view_time_seconds  integer DEFAULT 0,
    created_at               timestamptz NOT NULL DEFAULT now(),
    channel                  text NOT NULL DEFAULT 'email'
);

COMMENT ON TABLE public.direct_sale_sends IS
  'Histórico de envios de uma Venda Direta (public.direct_sales) ao portal do cliente/por email, incluindo métricas de abertura/visualização. Réplica de public.proposal_sends, trocando proposal_id por direct_sale_id (ON DELETE CASCADE). organization_id nullable, sent_by sem FK — replicado tal e qual do original, não é uma omissão desta migration.';

COMMENT ON COLUMN public.direct_sale_sends.sent_by IS
  'anew_users.id de quem enviou, sem FK — proposal_sends.sent_by também não tem nenhuma foreign key viva (confirmado em pg_constraint); replicado tal e qual.';

COMMENT ON COLUMN public.direct_sale_sends.ip_address IS
  'PII do destinatário no momento da abertura. Redigida ("[REDACTED]") no log de auditoria por fn_audit_direct_sale_send() — mesmo tratamento de proposal_sends.ip_address em fn_audit_proposal_send().';

CREATE INDEX IF NOT EXISTS idx_direct_sale_sends_direct_sale
  ON public.direct_sale_sends(direct_sale_id);


-- ------------------------------------------------------------
-- B.1 RLS — public.direct_sale_sends
-- ------------------------------------------------------------
-- SELECT: organização + direct_sales.view (pedido explícito desta tarefa) +
-- bypass is_system_admin_user(), mesmo padrão já usado em toda a RLS interna
-- de direct_sales/direct_sale_lines (20261130230000). O original
-- (org_select_proposal_sends) só verifica organização, sem permissão nem
-- bypass — esta policy é um superset estritamente mais restritivo em
-- permissão (exige direct_sales.view) e mais permissivo em admin (bypass
-- extra), nunca mais aberto para quem já tinha acesso.
--
-- INSERT: mesma condição de organização do original
-- (org_insert_proposal_sends), mais o bypass is_system_admin_user() já usado
-- em todas as outras políticas desta feature — aditivo, nunca remove acesso
-- que já existia.
--
-- Sem policy de UPDATE/DELETE — tal como proposal_sends: as colunas de
-- tracking (open_count, last_opened_at, first_opened_at, ...) ficam para
-- serem escritas por uma edge function futura com client de service_role
-- (que ignora RLS), mesmo mecanismo que o portal já usa hoje para tracking
-- de proposal_sends.

ALTER TABLE public.direct_sale_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS direct_sale_sends_select_policy ON public.direct_sale_sends;
CREATE POLICY direct_sale_sends_select_policy ON public.direct_sale_sends
  FOR SELECT USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'direct_sales.view')
    )
  );

DROP POLICY IF EXISTS direct_sale_sends_insert_policy ON public.direct_sale_sends;
CREATE POLICY direct_sale_sends_insert_policy ON public.direct_sale_sends
  FOR INSERT WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );


-- ------------------------------------------------------------
-- B.2 Auditoria — fn_audit_direct_sale_send() (adaptada de
-- fn_audit_proposal_send(), que está codificada para proposal_sends/
-- proposals e não é reutilizável tal e qual)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit_direct_sale_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY[
    'updated_at', 'created_at',
    'open_count', 'last_opened_at', 'first_opened_at', 'total_view_time_seconds'
  ];
  v_pii_cols       text[] := ARRAY[
    'ip_address', 'location_country', 'location_city'
  ];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_direct_sale_id uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve record_id (the audited row's own PK) ────────────────────────
  v_record_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── organization_id is direct on the row ─────────────────────────────────
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );

  -- Cannot determine org — skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── entity_id resolved via parent direct_sale ────────────────────────────
  v_direct_sale_id := COALESCE(
    (to_jsonb(NEW) ->> 'direct_sale_id')::uuid,
    (to_jsonb(OLD) ->> 'direct_sale_id')::uuid
  );

  IF v_direct_sale_id IS NOT NULL THEN
    SELECT ds.entity_id
    INTO   v_entity_id
    FROM   public.direct_sales ds
    WHERE  ds.id = v_direct_sale_id
    LIMIT  1;
  END IF;
  -- entity_id may be NULL if the parent direct sale has no entity_id set yet.
  -- The audit row is still written — org context is sufficient.

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_record := to_jsonb(NEW);
    FOR v_key IN SELECT unnest(v_pii_cols)
    LOOP
      IF v_record ? v_key THEN
        v_record := jsonb_set(v_record, ARRAY[v_key], '"[REDACTED]"'::jsonb);
      END IF;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record := to_jsonb(OLD);
    FOR v_key IN SELECT unnest(v_pii_cols)
    LOOP
      IF v_record ? v_key THEN
        v_record := jsonb_set(v_record, ARRAY[v_key], '"[REDACTED]"'::jsonb);
      END IF;
    END LOOP;
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
        IF v_key = ANY(v_pii_cols) THEN
          v_changed_fields := v_changed_fields || jsonb_build_object(
            v_key,
            jsonb_build_object('old', '"[REDACTED]"'::jsonb, 'new', '"[REDACTED]"'::jsonb)
          );
        ELSE
          v_changed_fields := v_changed_fields || jsonb_build_object(
            v_key,
            jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
          );
        END IF;
      END IF;
    END LOOP;

    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ──────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, record_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       v_record_id,
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
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_audit_direct_sale_send() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_audit_direct_sale_send() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_audit_direct_sale_send() TO service_role;

COMMENT ON FUNCTION public.fn_audit_direct_sale_send() IS
  'Auditoria de public.direct_sale_sends para public.entity_audit_log — adaptada de fn_audit_proposal_send() (proposal_sends/proposals) trocando direct_sale_id/direct_sales. Redige ip_address/location_country/location_city no snapshot e no diff; ignora updated_at/created_at/open_count/last_opened_at/first_opened_at/total_view_time_seconds no diff de UPDATE. EXECUTE restrito a authenticated/service_role, tal como o original.';

DROP TRIGGER IF EXISTS trg_audit_direct_sale_sends ON public.direct_sale_sends;
CREATE TRIGGER trg_audit_direct_sale_sends
  AFTER INSERT OR UPDATE OR DELETE ON public.direct_sale_sends
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_direct_sale_send();


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Colunas novas em direct_sales, com o mesmo tipo/default de proposals:
--      SELECT column_name, data_type, column_default FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='direct_sales'
--        AND column_name IN ('assigned_to','acceptance_user_agent','rejection_reason',
--          'rejection_reason_code','rejection_notes','rejection_reason_id','viewed_at',
--          'last_viewed_at','view_count','description','valid_until','currency',
--          'document_url','search_text')
--      ORDER BY column_name;
--
-- 2. FK de assigned_to (anew_users, SET NULL) e índice:
--      SELECT confrelid::regclass, confdeltype FROM pg_constraint
--      WHERE conrelid='public.direct_sales'::regclass AND conname LIKE '%assigned_to%';
--      SELECT indexname FROM pg_indexes WHERE tablename='direct_sales' AND indexname='idx_direct_sales_assigned_to';
--
-- 3. search_text populado corretamente, incluindo sale_number, logo no INSERT
--    (confirma a ordem de disparo dos dois triggers BEFORE INSERT):
--      INSERT INTO direct_sales (organization_id, entity_id, title, description)
--      VALUES ('<org>', '<entity>', 'Teste', 'Descrição teste') RETURNING sale_number, search_text;
--      -- Esperado: search_text começa por "VD-2026-NNNN Teste Descrição teste ..."
--
-- 4. direct_sale_sends criada, com FK CASCADE para direct_sales:
--      SELECT confrelid::regclass, confdeltype FROM pg_constraint
--      WHERE conrelid='public.direct_sale_sends'::regclass AND contype='f';
--
-- 5. RLS de direct_sale_sends — só SELECT/INSERT, sem UPDATE/DELETE:
--      SELECT policyname, cmd FROM pg_policies WHERE tablename='direct_sale_sends' ORDER BY cmd;
--
-- 6. Auditoria: um INSERT/UPDATE/DELETE em direct_sale_sends produz uma linha
--    em entity_audit_log com ip_address/location_country/location_city
--    redigidos:
--      SELECT full_record->'ip_address', changed_fields->'ip_address'
--      FROM entity_audit_log WHERE table_name='direct_sale_sends' ORDER BY created_at DESC LIMIT 5;
--
--
-- ============================================================
-- Fica para as fases seguintes (fora do âmbito desta migration)
-- ============================================================
-- - RPC/edge function que escreve assigned_to, viewed_at/last_viewed_at/
--   view_count, rejection_*, e que insere linhas em direct_sale_sends ao
--   enviar a venda direta ao portal (equivalente ao que já existe para
--   proposals) — nada disto é escrito por nenhuma função desta migration.
-- - Tracking de abertura/cliques em direct_sale_sends (open_count,
--   first_opened_at, ..., device_type/browser/os/ip_address/location_*) via
--   edge function com service_role, mesmo mecanismo que proposal_sends já
--   usa hoje — sem policy de UPDATE para authenticated, de propósito.
