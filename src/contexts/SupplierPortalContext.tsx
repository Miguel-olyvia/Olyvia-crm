import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isNoSupplierAccess,
  spMyCompanies,
  spWhoamiStrict,
  type SpCompany,
  type SpWhoami,
  type SpWhoamiAccount,
  type SpWhoamiUser,
} from "@/lib/supplierPortal/spRpc";

/**
 * Portal do Fornecedor (F3.1): identidade da conta e empresas com acesso.
 * Chama sp_whoami e sp_my_companies uma vez por utilizador (e em `refresh`).
 * Montado uma só vez para todas as rotas /supplier-portal/* (ver App.tsx).
 *
 * Sem leituras diretas a tabelas: só RPCs sp_*.
 */
interface SupplierPortalContextValue {
  loading: boolean;
  /** sp_whoami falhou (rede/JWT/servidor): não se sabe se há acesso. */
  loadError: boolean;
  /** Utilizador do portal ativo, com conta ativa e pelo menos um acesso ativo. */
  active: boolean;
  firstLogin: boolean;
  canManageCatalog: boolean;
  user: SpWhoamiUser | null;
  account: SpWhoamiAccount | null;
  companies: SpCompany[];
  companiesError: boolean;
  /** Volta a ler sp_whoami/sp_my_companies (p.ex. depois de um no_supplier_access). */
  refresh: () => Promise<void>;
  /** Depois de definir a password no modal de primeiro acesso. */
  markPasswordChanged: () => void;
}

const SupplierPortalContext = createContext<SupplierPortalContextValue | undefined>(undefined);

interface State {
  loading: boolean;
  loadError: boolean;
  active: boolean;
  firstLogin: boolean;
  canManageCatalog: boolean;
  user: SpWhoamiUser | null;
  account: SpWhoamiAccount | null;
  companies: SpCompany[];
  companiesError: boolean;
}

const INITIAL: State = {
  loading: true,
  loadError: false,
  active: false,
  firstLogin: false,
  canManageCatalog: false,
  user: null,
  account: null,
  companies: [],
  companiesError: false,
};

export function SupplierPortalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(INITIAL);
  const requestRef = useRef(0);
  const loadedForUserRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    // "Tentar de novo" a partir do ecrã de erro volta ao loader; um refresh
    // normal (páginas) mantém o ecrã enquanto recarrega.
    setState((s) => (s.loadError ? INITIAL : s));
    let whoami: SpWhoami;
    try {
      whoami = await spWhoamiStrict();
    } catch {
      // Rede/JWT/servidor: não se sabe se tem acesso → erro com "Tentar de novo",
      // nunca "Sem acesso ativo".
      if (requestId !== requestRef.current) return;
      setState({ ...INITIAL, loading: false, loadError: true });
      return;
    }
    if (requestId !== requestRef.current) return;

    if (!whoami.is_supplier || !whoami.active || !whoami.account) {
      setState({ ...INITIAL, loading: false, user: whoami.is_supplier ? whoami.user : null });
      return;
    }

    let companies: SpCompany[] = [];
    let companiesError = false;
    let active = true;
    try {
      companies = await spMyCompanies();
    } catch (err) {
      // Acesso revogado entre as duas chamadas → sem acesso ativo.
      if (isNoSupplierAccess(err)) active = false;
      else companiesError = true;
    }
    if (requestId !== requestRef.current) return;

    setState({
      loading: false,
      loadError: false,
      active,
      firstLogin: whoami.first_login,
      canManageCatalog: active && whoami.can_manage_catalog,
      user: whoami.user,
      account: active ? whoami.account : null,
      companies,
      companiesError,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Só onAuthStateChange: o INITIAL_SESSION faz a primeira carga (antes havia
    // também um getUser() em paralelo e a carga corria duas vezes). Outra conta
    // na mesma aba (sair/entrar) → recarregar; re-emissões do mesmo utilizador
    // (foco no separador, refresh do token) são ignoradas. A carga sai do
    // callback (setTimeout) para não chamar o supabase dentro do lock de auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !uid)) {
        loadedForUserRef.current = null;
        requestRef.current += 1;
        setState({ ...INITIAL, loading: false });
        return;
      }
      if (uid && uid !== loadedForUserRef.current) {
        loadedForUserRef.current = uid;
        setState(INITIAL);
        setTimeout(() => {
          if (!cancelled) void load();
        }, 0);
      }
    });

    return () => {
      cancelled = true;
      // StrictMode volta a subscrever: o INITIAL_SESSION seguinte tem de carregar.
      loadedForUserRef.current = null;
      subscription.unsubscribe();
    };
  }, [load]);

  const markPasswordChanged = useCallback(() => {
    setState((s) => ({ ...s, firstLogin: false }));
  }, []);

  const value = useMemo<SupplierPortalContextValue>(
    () => ({ ...state, refresh: load, markPasswordChanged }),
    [state, load, markPasswordChanged],
  );

  return <SupplierPortalContext.Provider value={value}>{children}</SupplierPortalContext.Provider>;
}

export function useSupplierPortal(): SupplierPortalContextValue {
  const ctx = useContext(SupplierPortalContext);
  if (!ctx) throw new Error("useSupplierPortal tem de ser usado dentro de <SupplierPortalProvider>");
  return ctx;
}
