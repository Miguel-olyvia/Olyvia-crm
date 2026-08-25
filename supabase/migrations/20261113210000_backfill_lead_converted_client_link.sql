-- 4 leads da Mudelar ficaram marcadas como convertidas, com data correta, mas
-- SEM converted_to_client_id. Origem apurada na auditoria: um UPDATE em massa
-- a 2026-08-19 11:05:35.182Z, sem autor, que gravou status e converted_at
-- (copiado de anew_clients.created_at, ao milissegundo) e nunca escreveu a
-- ligacao ao cliente. Nao veio de nenhum caminho da aplicacao.
--
-- Os caminhos que produziam o mesmo estado ja estao fechados:
--   - o gatilho de contrato assinado passa a fechar a lead (20261113190000)
--   - execute-workflow e ai-assistant deixaram de omitir converted_to_client_id
--
-- Esta migration corrige so o passado. Preenche exclusivamente a ligacao: o
-- status ja e 'converted' e o converted_at e preservado pelo COALESCE.
-- Idempotente: o WHERE exige converted_to_client_id IS NULL, portanto correr
-- duas vezes nao faz nada.
--
-- Rollback: UPDATE public.anew_leads SET converted_to_client_id = NULL
--   WHERE id IN (os 4 ids abaixo);
UPDATE public.anew_leads l
SET converted_to_client_id = cl.id,
    converted_at           = COALESCE(l.converted_at, cl.created_at),
    status                 = 'converted',
    updated_at             = now()
FROM public.anew_clients cl
WHERE cl.entity_id       = l.entity_id
  AND cl.organization_id = l.organization_id
  AND cl.status          = 'active'
  AND l.deleted_at IS NULL
  AND l.converted_to_client_id IS NULL
  AND l.id IN (
    '8ac7f3e4-8139-4498-bcbb-d18c1d01edf5',
    '1169bd28-b5a9-4c4a-a1ae-0ecae12d8e5b',
    'b98480dd-ee0b-407e-b197-ab95522ede74',
    '696e2e28-9edc-483c-a539-6c99abe67740'
  );
