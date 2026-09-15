-- Venda Direta — Fase 3 (parte 2/2): leitura no portal do cliente.
-- Módulos: Venda Direta, Client Portal
--
-- Contexto
-- --------
-- Esta migration dá ao cliente acesso de LEITURA, no portal, à sua Venda
-- Direta (public.direct_sales) e às linhas visíveis (public.direct_sale_lines
-- com visible_to_client = true). Depende de
-- 20261201100000_venda_direta_portal_enum.sql já ter corrido (acrescenta
-- 'direct_sale' a public.portal_document_type) — este ficheiro usa esse valor.
--
-- Padrão seguido (ficheiros lidos integralmente antes de escrever esta
-- migration, confirmado por leitura direta do schema, não por adivinhação):
--   20260615130000_baseline_new_database.sql
--     -> public.portal_user_can_see_document(_doc_type portal_document_type,
--        _doc_id uuid) (linha 4721): SELECT EXISTS (... FROM
--        client_portal_documents d JOIN client_portal_users pu ON pu.id =
--        d.portal_user_id WHERE pu.auth_user_id = auth.uid() AND
--        d.document_type = _doc_type AND d.document_id = _doc_id AND
--        d.is_visible = true). É esta função — não uma comparação direta a
--        colunas de client_portal_users — que decide se um utilizador de
--        portal vê um documento. As políticas "Client can view own
--        proposals"/"...own quotes"/"...own contracts" (linhas
--        21377-21415) usam-na tal e qual.
--     -> client_portal_users (linha 9335): colunas proposal_id/contract_id/
--        quote_id, todas nullable, cada uma com FK própria ON DELETE SET
--        NULL (linhas 19311, 19335, 19343) — não ON DELETE CASCADE. Sem
--        nenhum CHECK constraint a exigir exatamente uma preenchida
--        (confirmado por grep a "client_portal_users.*CHECK" em todas as
--        migrations — zero resultados). Sem índice parcial existente para
--        nenhuma dessas três colunas (só idx_client_portal_users_auth e
--        idx_client_portal_users_org, linhas 15759/15766) — não há nada para
--        "espelhar" nesse ponto especificamente; o índice parcial abaixo é
--        acrescentado por preverence de performance, não por mimetismo.
--   20261119140000_fase1_diagnostico_orcamento_regras_e_ia_fallback.sql
--     -> secção 8 (linhas 295-300): reafirma "Client can view own quote
--        lines" como portal_user_can_see_document('quote'::portal_document_type,
--        quote_id) AND quote_lines.visible_to_client = true — o padrão exato
--        replicado abaixo para direct_sale_lines.
--   20261130230000_venda_direta_base.sql
--     -> direct_sales/direct_sale_lines (estrutura, RLS interna, permissões
--        direct_sales.view/create/edit/delete). Esta migration só acrescenta
--        políticas de portal; não toca nas políticas internas já criadas lá.
--
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration.

-- ============================================================
-- 1. client_portal_users.direct_sale_id
-- ============================================================
-- Espelha as colunas proposal_id/contract_id/quote_id já existentes:
-- nullable, FK própria ON DELETE SET NULL (apagar a venda direta nunca deve
-- apagar a conta de portal do cliente — a conta pode servir outros
-- documentos). NÃO é esta coluna que a RLS abaixo usa para decidir
-- visibilidade (isso é client_portal_documents, via
-- portal_user_can_see_document) — serve para os mesmos usos que
-- proposal_id/contract_id/quote_id já têm hoje fora da RLS de
-- direct_sales/direct_sale_lines (ex.: public.portal_user_can_see_doc,
-- políticas de storage por caminho, resolução de "a que documento pertence
-- esta conta de portal" em funções/edge functions) — ligação prevista para a
-- RPC/edge function de uma fase seguinte, fora do âmbito desta migration.

ALTER TABLE public.client_portal_users
  ADD COLUMN IF NOT EXISTS direct_sale_id uuid
  REFERENCES public.direct_sales(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.client_portal_users.direct_sale_id IS
  'Venda Direta (public.direct_sales) associada a esta conta de portal, mesma convenção de proposal_id/contract_id/quote_id (nullable, ON DELETE SET NULL). A visibilidade real do documento no portal não depende desta coluna — depende de public.client_portal_documents via public.portal_user_can_see_document(''direct_sale'', ...). Escrita prevista para a RPC/edge function de publicação da Venda Direta no portal (fase seguinte, fora do âmbito desta migration).';

CREATE INDEX IF NOT EXISTS idx_client_portal_users_direct_sale
  ON public.client_portal_users(direct_sale_id)
  WHERE direct_sale_id IS NOT NULL;

-- Nenhum CHECK constraint de "exatamente um documento preenchido" existe
-- hoje em client_portal_users (confirmado acima) — nada para alargar.


-- ============================================================
-- 2. RLS de portal — public.direct_sales (SELECT apenas)
-- ============================================================
-- Acrescenta a policy de portal à RLS interna já existente (RLS já estava
-- ENABLEd por 20261130230000). As políticas internas
-- (direct_sales_select/insert/update_policy, direct_sales_no_delete) não são
-- tocadas — políticas em Postgres são sempre OR entre si dentro do mesmo
-- comando, por isso esta política nova só acrescenta uma via de leitura, sem
-- restringir as existentes.

DROP POLICY IF EXISTS "Client can view own direct sale" ON public.direct_sales;
CREATE POLICY "Client can view own direct sale" ON public.direct_sales
  FOR SELECT
  USING (public.portal_user_can_see_document('direct_sale'::public.portal_document_type, id));


-- ============================================================
-- 3. RLS de portal — public.direct_sale_lines (SELECT apenas, só linhas
--    visible_to_client = true)
-- ============================================================
-- CRÍTICO: replica ao pé da letra o padrão de "Client can view own quote
-- lines" (20261119140000, linhas 297-300) — a condição
-- visible_to_client = true faz parte da USING, não é um filtro aplicado
-- depois. Uma linha marcada como interna (visible_to_client = false) nunca é
-- devolvida a uma query feita com o JWT do cliente de portal, mesmo que ele
-- tenha acesso ao documento pai.

DROP POLICY IF EXISTS "Client can view own direct sale lines" ON public.direct_sale_lines;
CREATE POLICY "Client can view own direct sale lines" ON public.direct_sale_lines
  FOR SELECT
  USING (
    public.portal_user_can_see_document('direct_sale'::public.portal_document_type, direct_sale_id)
    AND direct_sale_lines.visible_to_client = true
  );


-- ============================================================
-- 4. cost_price / margem_percent — NÃO protegidos por RLS aqui
-- ============================================================
-- RLS do Postgres filtra LINHAS, nunca COLUNAS: a policy da secção 3 acima
-- devolve a linha inteira (incluindo cost_price e margem_percent) a quem
-- passar a condição. O projeto já resolve este mesmo problema para
-- quote_lines na edge function, não na base de dados: ver
-- supabase/functions/client-portal-action/index.ts:486-491
-- (SENSITIVE_LINE_COLUMNS = ["cost_price", "custo_mao_obra_unit",
-- "custo_material_unit", "margem_percent"] + stripCosts(), linhas 492-498,
-- aplicado às linhas antes de as devolver ao cliente). direct_sale_lines tem
-- exatamente cost_price e margem_percent com o mesmo significado interno
-- (custo_mao_obra_unit/custo_material_unit não existem em direct_sale_lines
-- — só em quote_lines).
--
-- Consequência prática: quando existir a rota do portal que lê a Venda
-- Direta (fase seguinte, fora do âmbito desta migration), essa rota tem de
-- aplicar o mesmo stripCosts()/SENSITIVE_LINE_COLUMNS a
-- direct_sale_lines.cost_price e direct_sale_lines.margem_percent antes de
-- devolver a resposta — esta migration NÃO tenta (nem consegue) resolver
-- isto por RLS. Sinalizado também no relatório desta tarefa.


-- ============================================================
-- 5. Sem escrita de portal nesta fase
-- ============================================================
-- De propósito, esta migration NÃO cria nenhuma política de INSERT/UPDATE/
-- DELETE para o portal em direct_sales/direct_sale_lines, nem para "anon" nem
-- para "authenticated" via client_portal_users. A aceitação da Venda Direta
-- (equivalente a proposals.accepted_at/signature_image/acceptance_ip) vai
-- passar por uma edge function com client de service_role — que ignora RLS
-- por completo — numa fase seguinte desta mesma tarefa, tal como o portal já
-- faz para aceitar propostas/orçamentos (client-portal-action). Só depois de
-- essa RPC existir é que faz sentido decidir se alguma escrita direta via RLS
-- é sequer necessária (hoje, a resposta por omissão é não).


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Políticas novas existem, só SELECT, sem tocar nas internas:
--      SELECT policyname, cmd, roles FROM pg_policies
--      WHERE tablename IN ('direct_sales','direct_sale_lines')
--      ORDER BY tablename, cmd, policyname;
--      -- Esperado: as 4 políticas internas de 20261130230000 continuam lá,
--      -- mais "Client can view own direct sale" (SELECT) e
--      -- "Client can view own direct sale lines" (SELECT).
--
-- 2. Sem client_portal_documents.document_type = 'direct_sale' publicado
--    ainda, um portal user autenticado não vê nenhuma linha em
--    direct_sales/direct_sale_lines por via desta política nova (mas pode
--    continuar a não ver nada de qualquer forma, dado que ainda não há RPC
--    de publicação) — comportamento esperado nesta fase.
--
-- 3. Depois de existir uma linha manual de teste em client_portal_documents
--    (document_type = 'direct_sale', document_id = <id de uma direct_sales>,
--    portal_user_id apontando para o client_portal_users do utilizador de
--    teste, is_visible = true):
--      SELECT * FROM direct_sales WHERE id = '<id>'; -- com o JWT desse portal user, deve devolver a linha
--      SELECT * FROM direct_sale_lines WHERE direct_sale_id = '<id>'; -- só linhas visible_to_client = true
--
-- 4. client_portal_users.direct_sale_id existe e tem FK para direct_sales:
--      SELECT column_name, data_type FROM information_schema.columns
--      WHERE table_name = 'client_portal_users' AND column_name = 'direct_sale_id';
--
--
-- ============================================================
-- Fica para as fases seguintes (fora do âmbito desta migration)
-- ============================================================
-- - RPC/edge function que publica a Venda Direta no portal: cria a linha em
--   client_portal_documents (document_type = 'direct_sale'), preenche
--   client_portal_users.direct_sale_id, e escreve direct_sales.sent_at —
--   espelhando o que já existe para proposals.
-- - Edge function de aceitação (equivalente a client-portal-action) com
--   service_role: escreve accepted_at/rejected_at/acceptance_ip/
--   signature_image, exige OTP tal como a aceitação de propostas, e aplica
--   SENSITIVE_LINE_COLUMNS/stripCosts() a direct_sale_lines antes de devolver
--   dados ao cliente (ver secção 4 acima).
-- - Emissão da proforma a partir da aceitação.
-- - Atualização dos tipos TypeScript do portal_document_type (frontend/edge
--   functions) para incluírem 'direct_sale' onde esse enum é hoje tratado
--   como union type fechado — fora do âmbito de uma migration SQL.
--
-- Pedidos recebidos a meio desta tarefa e NÃO incluídos aqui
-- ------------------------------------------------------------
-- Durante a escrita desta migration, chegaram mensagens adicionais (via o
-- canal de coordenação do agente, não diretamente do utilizador) a pedir,
-- sucessivamente: (a) uma tabela public.direct_sale_sends espelhando
-- proposal_sends/contract_sends; (b) colunas novas em direct_sales
-- (assigned_to, rejection_reason/rejection_reason_code/rejection_notes/
-- rejection_reason_id, viewed_at/last_viewed_at/view_count, description,
-- valid_until, currency, document_url, search_text + trigger, e por um
-- instante também deal_id, depois retirado pela própria mensagem seguinte).
-- Não implementei nenhum destes pontos nesta migration: não estavam no
-- pedido original de 5 pontos desta tarefa (Fase 3 = visibilidade de
-- leitura no portal), e as mensagens afirmavam ter "confirmado na BD viva"
-- factos que eu não tinha forma de verificar nesta sessão (sem acesso de
-- query à base de dados viva, só ao código-fonte) — incluindo a existência
-- de um trigger de search_text em proposals, que nunca foi mostrado. Dado
-- que são alterações de schema com impacto real (novas colunas, tabela
-- nova) e a regra do projeto é nunca alterar ficheiros sem confirmação
-- explícita do utilizador, preferi devolver este ficheiro fiel ao pedido
-- original e sinalizar os pedidos extra no relatório, para o utilizador
-- confirmar diretamente antes de qualquer um deles avançar.
