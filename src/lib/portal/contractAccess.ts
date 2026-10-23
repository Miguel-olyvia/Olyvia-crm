import { supabase } from "@/integrations/supabase/client";

/**
 * Linha de `client_portal_users` com o mínimo necessário para resolver contratos.
 * Qualquer select que inclua `id` e `contract_id` serve.
 */
export interface PortalUserContractRef {
  id?: string | null;
  contract_id?: string | null;
}

/**
 * Empresa ativa do portal (ver src/contexts/PortalCompanyContext.tsx).
 *
 * O par (organização, entidade) anda sempre junto: o `entity_id` do cliente
 * pode ser diferente de organização para organização, por isso filtrar cada um
 * por si produziria combinações nunca concedidas.
 */
export interface PortalOrgScope {
  organizationId: string;
  entityId?: string | null;
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))));
}

/**
 * Estreita um conjunto de contratos já resolvido à empresa ativa.
 *
 * Remove APENAS os ids confirmadamente de outra organização (ou de outra
 * entidade dentro da mesma organização). Tudo o que a query não devolver fica:
 * a RLS de `client_contracts` é por concessão (`client_portal_documents`)
 * enquanto a de `documents` é pela coluna legada
 * (`client_portal_users.contract_id`) — são fontes diferentes, e um contrato
 * legado (ou cujo `publishPortalDocument` falhou em fail-soft) pode não vir
 * nesta leitura apesar de os seus anexos serem legitimamente visíveis. Filtrar
 * por ausência faria desaparecer esses documentos de "Os Meus Documentos".
 *
 * Pela mesma razão, uma falha da query devolve o conjunto original: mostrar
 * contratos de mais do que uma empresa é um problema de apresentação, esconder
 * os contratos do cliente é um problema a sério.
 *
 * Contratos sem `entity_id` (dados antigos) ficam — foram concedidos
 * explicitamente e a RLS já os autoriza.
 */
async function narrowToOrgScope(contractIds: string[], scope: PortalOrgScope): Promise<string[]> {
  if (contractIds.length === 0) return contractIds;

  const { data: rows, error } = await supabase
    .from("client_contracts")
    .select("id, organization_id, entity_id")
    .in("id", contractIds);

  if (error || !rows) return contractIds;

  const fromAnotherScope = new Set(
    rows
      .filter(
        (c) =>
          (c.organization_id && c.organization_id !== scope.organizationId) ||
          (Boolean(scope.entityId) && Boolean(c.entity_id) && c.entity_id !== scope.entityId),
      )
      .map((c) => c.id),
  );

  return contractIds.filter((id) => !fromAnotherScope.has(id));
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
 *
 * `orgScope` (opcional) limita o resultado à empresa ativa do portal. Sem ele o
 * comportamento é o de sempre: todos os contratos concedidos a esta conta.
 */
export async function resolvePortalContractIds(
  portalUserIds: Array<string | null | undefined>,
  legacyContractIds: Array<string | null | undefined>,
  orgScope?: PortalOrgScope | null,
): Promise<string[]> {
  const legacy = uniqueIds(legacyContractIds);
  const userIds = uniqueIds(portalUserIds);

  if (userIds.length === 0) {
    return orgScope ? narrowToOrgScope(legacy, orgScope) : legacy;
  }

  const { data: docs } = await supabase
    .from("client_portal_documents")
    .select("document_id")
    .in("portal_user_id", userIds)
    .eq("document_type", "contract")
    .eq("is_visible", true);

  // Falha na query (RLS, rede) devolve `data: null` — degrada para a fonte legada
  // em vez de esvaziar a lista de contratos do cliente.
  const grantedByDocument = (docs ?? []).map((d) => d.document_id);

  const all = uniqueIds([...legacy, ...grantedByDocument]);

  return orgScope ? narrowToOrgScope(all, orgScope) : all;
}

/**
 * Atalho para quem já tem as linhas de `client_portal_users` em mão
 * (select com `id` e `contract_id`).
 *
 * Quando há empresa ativa, passar só a linha dessa organização E o `orgScope`:
 * a primeira coisa limita as concessões de `client_portal_documents` à conta
 * dessa empresa, a segunda garante que nenhum contrato de outra organização
 * escapa pela coluna legada.
 */
export async function resolvePortalContractIdsForUsers(
  portalUsers: PortalUserContractRef[] | null | undefined,
  orgScope?: PortalOrgScope | null,
): Promise<string[]> {
  const rows = portalUsers ?? [];
  return resolvePortalContractIds(
    rows.map((p) => p.id),
    rows.map((p) => p.contract_id),
    orgScope,
  );
}
