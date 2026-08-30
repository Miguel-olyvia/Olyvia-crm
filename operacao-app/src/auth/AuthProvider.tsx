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
import type { Funcao } from "../domain/tipos";

export interface OrgOption {
  id: string;
  name: string;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  /** anew_users.id — o "business user" do sistema Olyvia (o mesmo utilizador). */
  businessUserId: string | null;
  userName: string | null;
  userEmail: string | null;
  orgs: OrgOption[];
  activeOrgId: string | null;
  /** Função dentro de Operações. `null` = sem perfil no módulo. */
  funcao: Funcao | null;
  setActiveOrgId: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const ACTIVE_ORG_KEY = "operacao-app-active-org";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [businessUserId, setBusinessUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [funcao, setFuncao] = useState<Funcao | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_ORG_KEY);
    } catch {
      return null;
    }
  });

  const setActiveOrgId = useCallback((id: string) => {
    setActiveOrgIdState(id);
    try {
      localStorage.setItem(ACTIVE_ORG_KEY, id);
    } catch {
      /* ignora */
    }
  }, []);

  const loadProfile = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setBusinessUserId(null);
      setUserName(null);
      setFuncao(null);
      setOrgs([]);
      return;
    }

    // Resolve o anew_users (o mesmo utilizador do sistema Olyvia) pelo auth_user_id.
    const { data: anewUser, error: userErr } = await supabase
      .from("anew_users")
      .select("id, name")
      .eq("auth_user_id", currentSession.user.id)
      .maybeSingle();

    // Não engolir o erro: uma falha de RLS ou de rede aqui deixa o utilizador
    // sem organizações e sem perceber porquê.
    if (userErr) {
      // eslint-disable-next-line no-console
      console.error("[Operações] erro a resolver o utilizador (anew_users):", userErr);
    }

    if (!anewUser) {
      setBusinessUserId(null);
      setUserName(currentSession.user.email ?? null);
      setFuncao(null);
      setOrgs([]);
      return;
    }

    const uid = anewUser.id as string;
    setBusinessUserId(uid);
    setUserName((anewUser.name as string) ?? currentSession.user.email ?? null);

    // Organizações onde é membro ativo.
    const { data: memberships, error: membErr } = await supabase
      .from("anew_memberships")
      .select("organization_id")
      .eq("user_id", uid)
      .eq("status", "active");
    if (membErr) {
      // eslint-disable-next-line no-console
      console.error("[Operações] erro a carregar as organizações:", membErr);
    }

    const orgIds = Array.from(
      new Set(
        (memberships ?? [])
          .map((m) => m.organization_id as string)
          .filter(Boolean)
      )
    );

    let options: OrgOption[] = [];
    if (orgIds.length > 0) {
      const { data: orgRows } = await supabase
        .from("anew_organizations")
        .select("id, name")
        .in("id", orgIds);
      options = (orgRows ?? []).map((o) => ({
        id: o.id as string,
        name: (o.name as string) ?? "Organização",
      }));
    }
    setOrgs(options);

    let orgAtiva: string | null = null;
    setActiveOrgIdState((prev) => {
      if (prev && options.some((o) => o.id === prev)) {
        orgAtiva = prev;
        return prev;
      }
      const primeira = options[0]?.id ?? null;
      orgAtiva = primeira;
      if (primeira) {
        try {
          localStorage.setItem(ACTIVE_ORG_KEY, primeira);
        } catch {
          /* ignora */
        }
      }
      return primeira;
    });

    // Função dentro de Operações. Lida da vista, que não expõe custo_hora.
    // Sem perfil, o utilizador entra mas não faz nada — e o ecrã diz-lho.
    const { data: perfil } = await supabase
      .from("ops_v_equipa")
      .select("funcao")
      .eq("utilizador_id", uid)
      .eq("ativo", true)
      .maybeSingle();
    setFuncao((perfil?.funcao as Funcao | undefined) ?? null);
    void orgAtiva;
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
    setFuncao(null);
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
      funcao,
      setActiveOrgId,
      refresh,
      signOut,
    }),
    [
      loading,
      session,
      businessUserId,
      userName,
      orgs,
      activeOrgId,
      funcao,
      setActiveOrgId,
      refresh,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
