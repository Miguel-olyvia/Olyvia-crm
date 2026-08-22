import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface OrgOption {
  id: string;
  name: string;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  /** anew_users.id — o "business user" do sistema Olyvia (mesmo user). */
  businessUserId: string | null;
  userName: string | null;
  userEmail: string | null;
  orgs: OrgOption[];
  activeOrgId: string | null;
  setActiveOrgId: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const ACTIVE_ORG_KEY = "duc-app-active-org";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [businessUserId, setBusinessUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_ORG_KEY)
  );

  const setActiveOrgId = useCallback((id: string) => {
    setActiveOrgIdState(id);
    localStorage.setItem(ACTIVE_ORG_KEY, id);
  }, []);

  const loadProfile = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setBusinessUserId(null);
      setUserName(null);
      setOrgs([]);
      return;
    }

    // Resolve o anew_users (mesmo user do sistema Olyvia) pelo auth_user_id.
    const { data: anewUser, error: userErr } = await supabase
      .from("anew_users")
      .select("id, name")
      .eq("auth_user_id", currentSession.user.id)
      .maybeSingle();

    // Não engolir erros: uma falha de RLS/rede aqui deixa o utilizador sem orgs e
    // com o "Novo DUC" morto — pelo menos regista o motivo para ser diagnosticável.
    if (userErr) {
      // eslint-disable-next-line no-console
      console.error("[DUC] erro a resolver o utilizador (anew_users):", userErr);
    }

    if (!anewUser) {
      setBusinessUserId(null);
      setUserName(null);
      setOrgs([]);
      return;
    }

    setBusinessUserId(anewUser.id as string);
    setUserName((anewUser.name as string) ?? currentSession.user.email ?? null);

    // Organizações onde o user é membro ativo.
    const { data: memberships, error: membErr } = await supabase
      .from("anew_memberships")
      .select("organization_id")
      .eq("user_id", anewUser.id as string)
      .eq("status", "active");
    if (membErr) {
      // eslint-disable-next-line no-console
      console.error("[DUC] erro a carregar as organizações do utilizador:", membErr);
    }

    const orgIds = Array.from(
      new Set((memberships ?? []).map((m) => m.organization_id as string).filter(Boolean))
    );

    if (orgIds.length === 0) {
      setOrgs([]);
      return;
    }

    const { data: orgRows } = await supabase
      .from("anew_organizations")
      .select("id, name")
      .in("id", orgIds);

    const options: OrgOption[] = (orgRows ?? []).map((o) => ({
      id: o.id as string,
      name: (o.name as string) ?? "Organização",
    }));
    setOrgs(options);

    setActiveOrgIdState((prev) => {
      if (prev && options.some((o) => o.id === prev)) return prev;
      const first = options[0]?.id ?? null;
      if (first) localStorage.setItem(ACTIVE_ORG_KEY, first);
      return first;
    });
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session);
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      void loadProfile(newSession);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setBusinessUserId(null);
    setOrgs([]);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      businessUserId,
      userName,
      userEmail: session?.user.email ?? null,
      orgs,
      activeOrgId,
      setActiveOrgId,
      refresh,
      signOut,
    }),
    [loading, session, businessUserId, userName, orgs, activeOrgId, setActiveOrgId, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
