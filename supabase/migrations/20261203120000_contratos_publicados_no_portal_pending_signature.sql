-- Correcção de dados: contratos já publicados no Portal do Cliente que ficaram
-- presos em 'draft'.
-- 2026-12-03 | Módulo: Contratos — client_contracts / Portal do Cliente
-- Migração forward-only. Não dobrar na baseline.
--
-- Problema que esta migração corrige — confirmado em produção
-- -----------------------------------------------------------
-- Enviar um contrato para o Portal do Cliente publicava-o
-- (client_portal_documents.is_visible = true) mas NUNCA mudava o estado do
-- contrato. Nada em todo o codebase alguma vez escreveu
-- status = 'pending_signature': todas as referências a esse estado são
-- LEITURAS — rpc_client_contracts_list_metrics (20261115010000 /
-- 20261115050000 / 20261130220000), dashboards, alertas, notificações,
-- exportações e filtros. Os 11 contratos que estão nesse estado são todos de
-- Junho a Agosto de 2026; desde Setembro, zero.
--
-- Consequências, para lá do que o cliente vê:
--   • O cliente abre o portal e lê "Rascunho" num contrato que lhe foi
--     enviado precisamente para assinar.
--   • O contador "Enviado", os alertas de contratos à espera de assinatura e
--     a taxa de conversão enviado→assinado estão permanentemente a zero,
--     porque o denominador (sent_count) nunca é preenchido.
--
-- A causa está corrigida do lado de quem escreve, na edge function
-- create-client-portal-access: depois de publicar o documento, o ramo do
-- contrato passa-o de 'draft' para 'pending_signature' (guarda .eq("status",
-- "draft") no próprio UPDATE, fail-soft). Esta migração trata apenas do
-- passivo já acumulado.
--
-- O que esta migração toca, e o que NÃO toca
-- ------------------------------------------
-- Só contratos que estão simultaneamente em 'draft' E já publicados e
-- visíveis no portal — ou seja, contratos que o cliente consegue mesmo abrir.
-- A condição é escrita de forma geral (EXISTS em client_portal_documents com
-- document_type = 'contract' e is_visible), nunca por número de contrato.
-- À data de escrita isto corresponde a 1 único registo (CC-2026-0259).
--
-- Os restantes 127 contratos em 'draft' NUNCA foram enviados a ninguém (39
-- deles com mais de 30 dias). São rascunhos legítimos e ficam intocados — o
-- EXISTS exclui-os por construção.
--
-- Contratos apagados (deleted_at IS NOT NULL) ficam também de fora: não estão
-- acessíveis a ninguém e mexer-lhes no estado só sujaria o histórico.
--
-- Os contratos sintéticos (is_manual_order: venda directa / encomenda de
-- cliente manual) não são afectados por acidente — publicam-se no portal como
-- document_type = 'direct_sale', não 'contract', e nascem draft→signed na
-- mesma transacção, pelo que nunca satisfazem cc.status = 'draft' aqui.
--
-- status_changed_at recebe o published_at da publicação no portal (coluna NOT
-- NULL DEFAULT now() desde a baseline), não now(): o momento em que o
-- contrato passou a estar à espera de assinatura foi o momento do envio, não
-- o momento em que esta migração corre. Quando há várias publicações do mesmo
-- contrato (republicações), vale a mais antiga visível — foi aí que o
-- contrato deixou de ser rascunho.
--
-- status_changed_by fica como está (NULL). Esta transição é uma reparação de
-- dados, não um acto de um utilizador; quem publicou já está registado em
-- client_portal_documents.published_by e inventar aqui um autor tornaria o
-- histórico menos verdadeiro, não mais.
--
-- Porque é que esta transição é segura
-- ------------------------------------
-- Os três gatilhos AFTER UPDATE OF status ON client_contracts saem de
-- imediato a menos que o estado novo esteja nos aliases de assinatura ou de
-- anulação, e 'pending_signature' não está em nenhum:
--   • fn_contract_stock_deduction    (20261115060000) — v_signed_aliases
--     ARRAY['signed','assinado']; não deduz stock.
--   • fn_contract_supplier_request   (20261120160000 / 20261120180000) —
--     mesmos aliases; não gera pedido a fornecedor.
--   • fn_contract_cancelled_stock_reversal (20261115060000) —
--     v_reversal_aliases; não reverte nada.
-- Idem para trg_contract_signed_convert_to_client (20261112340000),
-- fn_contract_signed_close_lead (20261113190000) e a variante de origem de
-- marketing (20261112363000): todos exigem 'signed'/'assinado'.
--
-- Dois gatilhos reagem de facto, ambos de forma desejada:
--   • fn_contract_timeline_history (20261202050000) já tinha um ramo
--     'contract_pending_signature' à espera de um evento que até hoje nunca
--     chegava — passa a escrever a linha na timeline da entidade.
--   • fn_mark_lead_pipeline_dirty (20261110510000) marca a lead para
--     recálculo de etapa. O motor de etapas trata 'pending_signature' ao
--     mesmo nível de 'draft' e 'signed' como contrato confirmado
--     (20261110500000), logo nenhuma lead recua de etapa.
--
-- O gatilho de auditoria trg_audit_client_contracts (20260629000000) regista
-- a alteração em entity_audit_log e nunca bloqueia o DML (tem EXCEPTION WHEN
-- OTHERS a devolver NEW), pelo que não há risco de a migração abortar por
-- causa dele.

UPDATE public.client_contracts cc
SET status            = 'pending_signature',
    status_changed_at = COALESCE(
      (
        SELECT min(cpd.published_at)
        FROM public.client_portal_documents cpd
        WHERE cpd.document_id = cc.id
          AND cpd.document_type = 'contract'::public.portal_document_type
          AND cpd.is_visible
      ),
      now()
    )
WHERE cc.status = 'draft'
  AND cc.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.client_portal_documents cpd
    WHERE cpd.document_id = cc.id
      AND cpd.document_type = 'contract'::public.portal_document_type
      AND cpd.is_visible
  );
