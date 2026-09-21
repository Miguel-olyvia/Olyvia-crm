-- Anexos (documents) — controlo por documento de visibilidade no portal do cliente.
--
-- Contexto
-- --------
-- A política viva de leitura do portal sobre `documents` autoriza pela
-- ENTIDADE PAI, não pelo documento em si:
--
--   CREATE POLICY "Portal users can view their entity documents" ON "public"."documents"
--     FOR SELECT USING ("public"."portal_user_can_see_doc"("entity_type", "entity_id"));
--
--   (baseline 20260615130000_baseline_new_database.sql:21530 — confirmado por leitura
--   de todas as migrations posteriores que mencionam `documents` ou
--   `portal_user_can_see_doc`: nenhuma volta a fazer CREATE POLICY/DROP POLICY sobre
--   esta policy nem CREATE OR REPLACE de portal_user_can_see_doc. É esta a definição
--   viva na BD.)
--
-- Consequência: anexar QUALQUER documento a um contrato/proposta/orçamento visível no
-- portal expõe-o ao cliente de imediato — ex.: uma fatura de fornecedor anexada a um
-- contrato para referência interna fica visível ao cliente sem ninguém dar por isso.
-- Não há hoje forma de dizer "este anexo é só para uso interno".
--
-- Esta migration acrescenta `documents.visible_to_client`, para permitir essa decisão
-- documento a documento, e propaga-a à ÚNICA policy de leitura do portal sobre
-- `documents` que existe na BD viva.
--
-- Decisão do default (NÃO ALTERAR): DEFAULT true
-- ------------------------------------------------
-- Preserva, para todos os anexos já existentes, o comportamento anterior a esta
-- migration — hoje todos são visíveis ao portal (sujeitos apenas a
-- portal_user_can_see_doc), e continuam a sê-lo depois de aplicada. Mesma decisão, e
-- pelo mesmo motivo, que quote_lines.visible_to_client tomou em
-- 20261119140000_fase1_diagnostico_orcamento_regras_e_ia_fallback.sql:154
-- ("Default true preserva o comportamento anterior a esta migration para todas as
-- linhas já existentes."). A segurança dos documentos NOVOS fica a cargo do
-- frontend, que passa a escrever `false` explicitamente ao anexar algo que não deve
-- ir para o portal (ex.: fatura de fornecedor); a revisão dos anexos antigos que hoje
-- já estão indevidamente visíveis é trabalho à parte, fora do âmbito desta migration.
--
-- O que esta migration NÃO faz
-- -----------------------------
--   - Não toca em `portal_user_can_see_doc(entity_type, entity_id)` — só seria
--     recriada a partir do ficheiro onde foi definida originalmente, arriscando
--     apagar correções feitas depois. A policy continua a chamá-la sem alterações,
--     só com uma condição AND adicional.
--   - Não altera nenhuma outra policy de `documents` (as 4 policies "Visible org
--     members can .../documents" são internas, por organização, e não têm nada a
--     ver com o portal — ficam como estão).
--   - Não migra dados nem apaga nada.
--   - Não mexe em `documents_entity_type_check` (20261201130000_documents_allow_product.sql)
--     nem em `documents_validate_entity` — a nova coluna não é entity_type/entity_id/
--     organization_id, o trigger BEFORE INSERT OR UPDATE OF (...) nem dispara por
--     causa dela.
--
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration.

-- ============================================================
-- 1. documents.visible_to_client
-- ============================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.documents.visible_to_client IS
  'Quando false, o documento existe no CRM mas é ocultado do portal de cliente autenticado (policy "Portal users can view their entity documents"). Default true preserva o comportamento anterior a esta migration para todos os documentos já existentes — a revisão dos anexos antigos indevidamente visíveis é trabalho à parte. Documentos com entity_type = ''product'' nunca chegam ao portal de qualquer forma, independentemente deste campo: portal_user_can_see_doc() não tem ramo para ''product'' e devolve false (ver 20261201130000_documents_allow_product.sql).';

-- ============================================================
-- 2. Propagar visible_to_client à policy de portal existente
-- ============================================================
-- Redefinição EXATA da policy da baseline (20260615130000_baseline_new_database.sql:21530),
-- só com "AND visible_to_client" acrescentado no fim. portal_user_can_see_doc não é
-- tocada.

DROP POLICY IF EXISTS "Portal users can view their entity documents" ON public.documents;

CREATE POLICY "Portal users can view their entity documents" ON public.documents
  FOR SELECT USING (public.portal_user_can_see_doc(entity_type, entity_id) AND visible_to_client);

-- ============================================================
-- 3. Índice — decisão: NÃO criar
-- ============================================================
-- A query do portal filtra por entity_type + entity_id (via portal_user_can_see_doc)
-- e agora também por visible_to_client. O índice que serve essa seletividade,
-- idx_documents_entity (entity_type, entity_id) — baseline, linha 15857 — já existe e
-- não muda: o volume de documentos por entidade (anexos de um único contrato/
-- proposta/orçamento) é tipicamente pequeno, e filtrar visible_to_client nas poucas
-- linhas devolvidas por esse índice é um filtro trivial em memória, não uma segunda
-- pesquisa. Um índice adicional só se justificaria para uma query que varresse
-- `documents` inteira à procura de visible_to_client = false/true entre organizações
-- ou entidades — padrão que não existe hoje no portal nem no CRM. Se esse padrão vier
-- a existir (ex.: um dashboard interno "anexos ocultos do cliente"), criar nessa
-- altura um índice parcial `WHERE visible_to_client = false`, à semelhança de
-- idx_quote_lines_visible_to_client em
-- 20261119140000_fase1_diagnostico_orcamento_regras_e_ia_fallback.sql:168.

-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Coluna criada, NOT NULL, default true:
--      SELECT column_default, is_nullable
--      FROM information_schema.columns
--      WHERE table_name = 'documents' AND column_name = 'visible_to_client';
--
-- 2. Todos os documentos existentes continuam visible_to_client = true:
--      SELECT count(*) FROM public.documents WHERE visible_to_client IS NOT true;
--      -- Esperado: 0.
--
-- 3. Policy redefinida exatamente como a original mais a condição nova:
--      SELECT pg_get_expr(qual, polrelid) FROM pg_policy
--      WHERE polrelid = 'public.documents'::regclass
--        AND polname = 'Portal users can view their entity documents';
--      -- Esperado: portal_user_can_see_doc(entity_type, entity_id) AND visible_to_client
--
-- 4. portal_user_can_see_doc não foi alterada:
--      SELECT pg_get_functiondef('public.portal_user_can_see_doc(text, uuid)'::regprocedure);
--      -- Esperado: idêntico a antes desta migration.
--
-- 5. Um documento com visible_to_client = false deixa de aparecer para um portal user
--    que antes o via (mesma entidade, mesmo entity_id), sem afetar a vista interna
--    (policies "Visible org members can view documents" continuam a mostrá-lo à
--    equipa).
--
-- 6. Documentos entity_type = 'product' continuam invisíveis no portal
--    independentemente de visible_to_client (portal_user_can_see_doc devolve false
--    para 'product' — nenhuma alteração de comportamento aqui).
--
-- 7. Migration corre duas vezes sem erro (ADD COLUMN IF NOT EXISTS + DROP POLICY IF
--    EXISTS / CREATE POLICY).
--
--
-- ============================================================
-- Fica para trabalho à parte (fora do âmbito desta migration)
-- ============================================================
-- - Frontend: escrever visible_to_client = false explicitamente ao anexar documentos
--   que não devem ir para o portal (ex.: faturas de fornecedor, notas internas).
-- - Auditoria/limpeza dos anexos já existentes que hoje estão indevidamente visíveis
--   ao portal (herdaram default true) — decisão de produto, não técnica.
