-- Documentos de produto (fichas técnicas, certificados, manuais).
--
-- A tabela `documents` já suporta tudo o que é preciso — só a restrição de
-- `entity_type` é que não previa produtos. As políticas RLS são por
-- organização (`get_user_visible_org_ids`), não por tipo de entidade, por isso
-- não é preciso criar nem alterar política nenhuma.
--
-- SEGURANÇA — as duas barreiras que impedem um cliente do portal de ver estes
-- documentos continuam a funcionar sozinhas, e é de propósito que não se
-- mexe em nenhuma delas:
--
--   1. `portal_user_can_see_doc(entity_type, entity_id)`, usada na política
--      "Portal users can view their entity documents", só tem ramos para
--      'contract', 'proposal' e 'quote'. Para 'product' devolve false.
--   2. A política de storage `portal_users_can_read_documents` exige que o
--      segundo segmento do caminho seja 'contract', 'proposal' ou 'quote'. O
--      DocumentsTab grava em `${org}/${entityType}/${entityId}/...`, logo um
--      documento de produto fica em `.../product/...` e não passa.
--
-- Ou seja: acrescentar 'product' abre o upload para uso interno sem abrir
-- nada do lado do cliente.

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_entity_type_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_entity_type_check
  CHECK (entity_type = ANY (ARRAY['quote'::text, 'proposal'::text, 'contract'::text, 'product'::text]));
