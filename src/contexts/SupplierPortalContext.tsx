import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isNoSupplierAccess,
  spMyCompanies,
  spWhoami,
  type SpCompany,
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
    const whoami = await spWhoami();
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
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      loadedForUserRef.current = user?.id ?? null;
      void load();
    });

    // Outra conta na mesma aba (sair/entrar) → recarregar. Re-emissões do
    // mesmo utilizador (foco no separador, refresh do token) são ignoradas.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      if (event === "SIGNED_OUT") {
        loadedForUserRef.current = null;
        requestRef.current += 1;
        setState({ ...INITIAL, loading: false });
        return;
      }
      if (uid && uid !== loadedForUserRef.current) {
        loadedForUserRef.current = uid;
        setState(INITIAL);
        void load();
      }
    });

    return () => {
      cancelled = true;
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
