import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Contexto de empresa ativa do PORTAL DO CLIENTE.
 *
 * Nada a ver com `src/contexts/CompanyContext.tsx`: esse resolve as empresas de
 * TRABALHO de um utilizador do CRM (RPC `get_user_work_orgs`, memberships,
 * papéis) e uma conta de portal não tem work-orgs nenhuma. Aqui o âmbito vem
 * exclusivamente das linhas de `client_portal_users` do próprio utilizador
 * autenticado.
 *
 * Porquê: `client_portal_users` tem UNIQUE (auth_user_id, organization_id), ou
 * seja, o mesmo email pode ter acesso ao portal de várias empresas do grupo.
 * Até aqui o portal misturava os documentos de todas numa lista só, com o logo
 * de uma delas à sorte (primeira linha devolvida, sem `order by`). Passa a
 * haver uma empresa ATIVA e tudo — branding, contagens e listas — é filtrado
 * por ela.
 *
 * REGRA DE FILTRAGEM: a unidade é sempre o PAR (organization_id, entity_id) da
 * linha escolhida. O `entity_id` pode ser diferente de organização para
 * organização para o mesmo utilizador, por isso dois `.in()` independentes
 * (um para orgs, outro para entidades) produzem um produto cartesiano e podem
 * mostrar combinações que nunca foram concedidas. Filtrar sempre `.eq` + `.eq`.
 *
 * Isto é apresentação/filtragem. Quem garante a segurança continua a ser a RLS.
 */

// Chave POR UTILIZADOR: num tablet partilhado, a escolha de uma conta não pode
// ser herdada pela seguinte.
const STORAGE_KEY_PREFIX = "portalActiveOrgId";
const storageKeyFor = (userId: string) => `${STORAGE_KEY_PREFIX}:${userId}`;

/** Chave da query das empresas do portal — exportada para quem precise de a invalidar. */
export const PORTAL_ORGS_QUERY_KEY = "portal-orgs";

/** Constante para o estado "ainda sem dados": um `[]` novo a cada render mudaria a identidade do contexto sem necessidade. */
const EMPTY_ORGS: PortalOrg[] = [];

export interface PortalOrg {
  /** id da linha de `client_portal_users` (chave das concessões em `client_portal_documents`) */
  portalUserId: string;
  organizationId: string;
  /** entidade do cliente NESTA organização — pode diferir entre organizações */
  entityId: string | null;
  clientId: string | null;
  name: string;
  logoUrl: string | null;
  createdAt: string;
  firstLogin: boolean;
  // Colunas legadas: guardam apenas o ÚLTIMO documento partilhado por este
  // canal (a create-client-portal-access faz update da mesma linha). Servem de
  // complemento às queries por entidade, nunca de filtro único.
  proposalId: string | null;
  contractId: string | null;
  quoteId: string | null;
  directSaleId: string | null;
}

interface PortalCompanyContextType {
  portalOrgs: PortalOrg[];
  activeOrg: PortalOrg | null;
  setActiveOrg: (organizationId: string) => void;
  hasMultiple: boolean;
  isLoading: boolean;
  /**
   * A query falhou. Tem de ser distinguido de "esta conta não tem empresas":
   * o provider é uma rota-layout que fica montada, por isso mudar de separador
   * NÃO volta a tentar — quem consome mostra erro com "Tentar novamente" em vez
   * de um portal vazio.
   */
  isError: boolean;
  /** Há um pedido em curso (inclui as novas tentativas depois de um erro, em que o estado continua `error`). */
  isFetching: boolean;
  refetchPortalOrgs: () => void;
}

const PortalCompanyContext = createContext<PortalCompanyContextType | undefined>(undefined);

/** localStorage pode não existir (modo privado, iframe com cookies bloqueados) — nunca rebentar por causa disto. */
function readStoredOrgId(userId: string): string | null {
  try {
    return localStorage.getItem(storageKeyFor(userId));
  } catch {
    return null;
  }
}

function writeStoredOrgId(userId: string, organizationId: string | null) {
  try {
    if (organizationId) localStorage.setItem(storageKeyFor(userId), organizationId);
    else localStorage.removeItem(storageKeyFor(userId));
  } catch {
    // escolha não persistida — a sessão continua a funcionar na mesma
  }
}

/**
 * Empresa por omissão: a linha de portal mais recente.
 *
 * Não a primeira por ordem alfabética — quem tem tudo na "Zeta" e uma linha
 * antiga na "Alfa" aterrava na empresa vazia e lia "Ainda não tem propostas".
 * A ordem alfabética continua a ser a da LISTA do seletor.
 */
function pickDefaultOrg(orgs: PortalOrg[]): PortalOrg | null {
  if (orgs.length === 0) return null;
  return orgs.reduce((best, o) =>
    new Date(o.createdAt).getTime() > new Date(best.createdAt).getTime() ? o : best,
  );
}

async function fetchPortalOrgs(userId: string): Promise<PortalOrg[]> {
  const { data: rows, error } = await supabase
    .from("client_portal_users")
    .select(
      "id, organization_id, entity_id, client_id, created_at, first_login, proposal_id, contract_id, quote_id, direct_sale_id",
    )
    .eq("auth_user_id", userId);

  // Erro aqui (RLS, rede) não pode passar por "esta conta não tem empresas":
  // deixa o useQuery tratá-lo como erro em vez de devolver lista vazia.
  if (error) throw error;

  const portalRows = rows ?? [];
  if (portalRows.length === 0) return [];

  const orgIds = Array.from(new Set(portalRows.map((r) => r.organization_id).filter(Boolean)));

  // Segunda query em vez de join: `anew_organizations` é global (sem
  // organization_id) e o embed pelo FK obrigaria a nomear a constraint.
  const { data: orgs } = await supabase
    .from("anew_organizations")
    .select("id, name, logo_url")
    .in("id", orgIds);

  const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));

  // UNIQUE (auth_user_id, organization_id) garante uma linha por organização;
  // o Map é só defesa contra duplicados inesperados.
  const byOrg = new Map<string, PortalOrg>();
  portalRows.forEach((r) => {
    if (!r.organization_id || byOrg.has(r.organization_id)) return;
    const org = orgById.get(r.organization_id);
    byOrg.set(r.organization_id, {
      portalUserId: r.id,
      organizationId: r.organization_id,
      entityId: r.entity_id ?? null,
      clientId: r.client_id ?? null,
      name: org?.name || "Empresa",
      logoUrl: org?.logo_url ?? null,
      createdAt: r.created_at,
      firstLogin: Boolean(r.first_login),
      proposalId: r.proposal_id ?? null,
      contractId: r.contract_id ?? null,
      quoteId: r.quote_id ?? null,
      directSaleId: r.direct_sale_id ?? null,
    });
  });

  // Ordem por nome: determinística. A ordem "natural" do PostgREST não é, e era
  // por isso que o logo do portal podia mudar entre recargas.
  return Array.from(byOrg.values()).sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

export function PortalCompanyProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  // Mesmo padrão de sessão das páginas do portal: subscrever primeiro, depois
  // ler a sessão existente.
  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // A escolha guardada é lida ao saber-se QUEM está autenticado (a chave é por
  // utilizador) e descartada ao trocar de conta.
  useEffect(() => {
    setActiveOrgId(userId ? readStoredOrgId(userId) : null);
  }, [userId]);

  const { data: portalOrgs = EMPTY_ORGS, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: [PORTAL_ORGS_QUERY_KEY, userId],
    queryFn: () => fetchPortalOrgs(userId!),
    enabled: Boolean(userId),
    // Acima do retry: 1 global. Falhar aqui deixa o portal inteiro sem âmbito,
    // e o provider fica montado (mudar de separador não volta a tentar).
    retry: 3,
  });

  // Acesso revogado (ou conta diferente no mesmo dispositivo): o valor guardado
  // deixa de existir na lista — cai para a empresa por omissão e limpa o
  // inválido.
  useEffect(() => {
    if (!userId || portalOrgs.length === 0) return;
    const stillValid = activeOrgId && portalOrgs.some((o) => o.organizationId === activeOrgId);
    if (stillValid) return;
    const fallback = pickDefaultOrg(portalOrgs);
    if (!fallback) return;
    setActiveOrgId(fallback.organizationId);
    writeStoredOrgId(userId, fallback.organizationId);
  }, [portalOrgs, activeOrgId, userId]);

  // O `?? pickDefaultOrg(...)` evita um piscar de branding errado entre a
  // chegada dos dados e o efeito acima.
  const activeOrg = useMemo(
    () => portalOrgs.find((o) => o.organizationId === activeOrgId) ?? pickDefaultOrg(portalOrgs),
    [portalOrgs, activeOrgId],
  );

  /** Ignora organizações fora da lista concedida — trocar para uma org sem acesso não é uma opção válida. */
  const setActiveOrg = useCallback(
    (organizationId: string) => {
      if (!userId) return;
      if (!portalOrgs.some((o) => o.organizationId === organizationId)) return;
      setActiveOrgId(organizationId);
      writeStoredOrgId(userId, organizationId);
    },
    [portalOrgs, userId],
  );

  const refetchPortalOrgs = useCallback(() => {
    void refetch();
  }, [refetch]);

  const value = useMemo(
    () => ({
      portalOrgs,
      activeOrg,
      setActiveOrg,
      hasMultiple: portalOrgs.length > 1,
      isLoading: !authReady || (Boolean(userId) && isPending),
      isError,
      isFetching,
      refetchPortalOrgs,
    }),
    [portalOrgs, activeOrg, setActiveOrg, authReady, userId, isPending, isError, isFetching, refetchPortalOrgs],
  );

  return <PortalCompanyContext.Provider value={value}>{children}</PortalCompanyContext.Provider>;
}

export function usePortalCompany() {
  const context = useContext(PortalCompanyContext);
  if (context === undefined) {
    throw new Error("usePortalCompany tem de ser usado dentro de um PortalCompanyProvider");
  }
  return context;
}

/**
 * Alinha a empresa ativa com a do documento aberto (páginas de detalhe).
 *
 * O cliente pode chegar a uma proposta/contrato/venda direta por link de email,
 * de uma empresa diferente da que tem selecionada. Esconder o documento seria o
 * pior dos mundos — o correto é trocar a empresa ativa para a dele, ficando o
 * cabeçalho e as listas coerentes com o que está a ver.
 *
 * `setActiveOrg` ignora organizações fora da lista concedida (e a sua
 * identidade muda quando a lista chega), por isso isto nunca alarga o âmbito
 * nem se perde se o documento carregar antes das empresas.
 */
export function useSyncActiveOrgWithDocument(organizationId: string | null | undefined) {
  const { activeOrg, setActiveOrg } = usePortalCompany();

  useEffect(() => {
    if (!organizationId) return;
    if (activeOrg?.organizationId === organizationId) return;
    setActiveOrg(organizationId);
  }, [organizationId, activeOrg, setActiveOrg]);
}
