-- Leitura dos ficheiros do bucket `documents` para membros da organização.
--
-- O bucket tinha política de INSERT e de DELETE para membros da organização,
-- mas nunca teve a de SELECT. Resultado: dava para carregar e apagar, não dava
-- para descarregar. Verificado contra as políticas reais, a simular um
-- utilizador interno autenticado: 18 ficheiros no bucket, 0 visíveis.
--
-- Afetava todos os documentos (contratos, propostas, orçamentos), não só os de
-- produto. Passou despercebido porque os documentos de contrato mais antigos
-- estão no bucket `contract-documents`, que tem política de leitura própria.
--
-- O critério é exatamente o mesmo das políticas de INSERT e DELETE já
-- existentes para este bucket: o primeiro segmento do caminho tem de ser uma
-- organização visível ao utilizador. Não se abre acesso a nada que estes
-- utilizadores já não pudessem carregar e apagar.
--
-- A política do portal (`portal_users_can_read_documents`) NÃO é tocada: os
-- clientes continuam limitados a caminhos com 'contract', 'proposal' ou
-- 'quote' no segundo segmento, por isso documentos de produto continuam fora
-- do alcance deles.

DROP POLICY IF EXISTS "Visible org members can view documents" ON storage.objects;

CREATE POLICY "Visible org members can view documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT (org_id.org_id)::text
    FROM get_user_visible_org_ids(auth.uid()) org_id(org_id)
  )
);
