import { supabase } from "@/integrations/supabase/client";

/**
 * Linha de `client_portal_users` com o mínimo necessário para resolver contratos.
 * Qualquer select que inclua `id` e `contract_id` serve.
 */
export interface PortalUserContractRef {
  id?: string | null;
  contract_id?: string | null;
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))));
}

/**
 * Resolve o conjunto COMPLETO de contratos a que uma conta de portal tem acesso.
 *
 * Existem duas fontes e é obrigatório unir as duas:
 *  - `client_portal_users.contract_id` (legado): guarda apenas o ÚLTIMO contrato
 *    enviado a este utilizador — um segundo envio sobrepõe o valor anterior;
 *  - `client_portal_documents` (mecanismo atual): a `create-client-portal-access`
 *    regista aqui cada contrato partilhado, com `is_visible` a controlar a revogação.
 *
 * Usar só a coluna legada faz desaparecer todos os contratos concedidos por
 * documento — foi exactamente essa a divergência entre o cartão "Contratos" da
 * página inicial e a lista "Os Meus Contratos". Esta função é a única fonte de
 * verdade: novos ecrãs do portal devem chamá-la em vez de recopiar a resolução.
 *
 * Nota de segurança: o filtro é por `portal_user_id` das contas do próprio
 * utilizador autenticado, pelo que não alarga o âmbito para além do que a RLS do
 * portal já permite — só deixa de esconder o que era legítimo mostrar.
 *
 * Se não houver contas de portal, nem sequer corre a query (um `.in()` com array
 * vazio devolveria zero linhas, mas continua a ser um round-trip inútil).
 */
export async function resolvePortalContractIds(
  portalUserIds: Array<string | null | undefined>,
  legacyContractIds: Array<string | null | undefined>,
): Promise<string[]> {
  const legacy = uniqueIds(legacyContractIds);
  const userIds = uniqueIds(portalUserIds);

  if (userIds.length === 0) return legacy;

  const { data: docs } = await supabase
    .from("client_portal_documents")
    .select("document_id")
    .in("portal_user_id", userIds)
    .eq("document_type", "contract")
    .eq("is_visible", true);

  // Falha na query (RLS, rede) devolve `data: null` — degrada para a fonte legada
  // em vez de esvaziar a lista de contratos do cliente.
  const grantedByDocument = (docs ?? []).map((d) => d.document_id);

  return uniqueIds([...legacy, ...grantedByDocument]);
}

/**
 * Atalho para quem já tem as linhas de `client_portal_users` em mão
 * (select com `id` e `contract_id`).
 */
export async function resolvePortalContractIdsForUsers(
  portalUsers: PortalUserContractRef[] | null | undefined,
): Promise<string[]> {
  const rows = portalUsers ?? [];
  return resolvePortalContractIds(
    rows.map((p) => p.id),
    rows.map((p) => p.contract_id),
  );
}
