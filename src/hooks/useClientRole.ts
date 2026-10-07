import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getSessionContext,
  setSessionContext,
  clearSessionContext,
  type SessionContext,
} from "@/lib/auth/sessionContext";
import { spWhoami } from "@/lib/supplierPortal/spRpc";

export type ClientAccessKind =
  | "loading"
  | "anonymous"
  | "client_only"
  | "crm_user"
  | "hybrid"
  | "no_profile"
  // Portal do Fornecedor (F3.1): conta Auth SEM anew_users que sp_whoami
  // reconhece como utilizador do portal do fornecedor. Nunca entra no CRM nem
  // no portal do cliente (o gatilho trg_anew_users_00_block_supplier_accounts
  // impede que estas contas recebam um anew_users).
  | "supplier_only"
  // Cliente do portal (anew_users + memberships ativas SÓ de cliente) que é
  // também utilizador ATIVO do Portal do Fornecedor (sp_whoami). Entra nos dois
  // portais; nunca no CRM. Utilizadores do sistema (qualquer membership
  // interna) nunca chegam aqui: para eles o sp_whoami nem é chamado.
  | "client_supplier";
export type { SessionContext };

// ─── Escolha de portal de uma conta client_supplier ─────────────────────────
// Como a escolha CRM/portal do hybrid (src/lib/auth/sessionContext.ts), mas
// numa chave própria: os valores são outros ("portal" | "supplier") e não se
// quer que uma escolha de uma superfície seja lida como a da outra. É só UX —
// quem decide o acesso são os guards (pelo accessKind) e a BD (RLS/RPCs sp_*).
export type ClientSupplierSurface = "portal" | "supplier";

const CS_SURFACE_KEY = "olyvia-client-supplier-surface";

export function getClientSupplierSurface(authUserId: string | null | undefined): ClientSupplierSurface | null {
  if (!authUserId) return null;
  try {
    const raw = localStorage.getItem(CS_SURFACE_KEY);
    if (!raw) return null;
    const sep = raw.indexOf(":");
    if (sep < 0) return null;
    if (raw.slice(0, sep) !== authUserId) return null;
    const surface = raw.slice(sep + 1);
    return surface === "portal" || surface === "supplier" ? surface : null;
  } catch {
    return null;
  }
}

function setClientSupplierSurface(authUserId: string, surface: ClientSupplierSurface): void {
  try {
    localStorage.setItem(CS_SURFACE_KEY, `${authUserId}:${surface}`);
  } catch {
    // Armazenamento bloqueado: a pessoa volta a escolher no próximo login.
  }
}

function clearClientSupplierSurface(): void {
  try {
    localStorage.removeItem(CS_SURFACE_KEY);
  } catch {
    // no-op
  }
}

/** Rota de entrada de uma conta client_supplier, pela escolha guardada. */
export function clientSupplierHome(surface: ClientSupplierSurface | null): string {
  return surface === "supplier" ? "/supplier-portal" : surface === "portal" ? "/client-portal" : "/escolher-acesso";
}

// ─── Último tipo de conta resolvido (partilhado entre instâncias) ───────────
// Cada useClientRole() resolve o seu próprio tipo; os layouts dos portais
// (ClientPortalLayout remonta a cada página) só precisam de saber se a conta é
// client_supplier para mostrar o botão "Mudar para…", e o guard que os envolve
// já o resolveu. Ler este instantâneo evita mais um sp_whoami por navegação.
let accessSnapshot: { uid: string | null; kind: ClientAccessKind } = { uid: null, kind: "loading" };
const snapshotListeners = new Set<() => void>();

function publishAccessSnapshot(uid: string | null, kind: ClientAccessKind) {
  if (accessSnapshot.uid === uid && accessSnapshot.kind === kind) return;
  accessSnapshot = { uid, kind };
  snapshotListeners.forEach((l) => l());
}

function subscribeAccessSnapshot(listener: () => void) {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

function getAccessSnapshot() {
  return accessSnapshot;
}

/**
 * Para os layouts dos portais: se a conta é client_supplier, devolve a função
 * que guarda a nova escolha (o chamador navega para clientSupplierHome).
 * `available` é false para qualquer outro tipo de conta.
 */
export function useClientSupplierSwitch() {
  const snap = useSyncExternalStore(subscribeAccessSnapshot, getAccessSnapshot, getAccessSnapshot);
  const available = snap.kind === "client_supplier" && snap.uid !== null;
  const switchTo = (surface: ClientSupplierSurface) => {
    if (available && snap.uid) setClientSupplierSurface(snap.uid, surface);
    return clientSupplierHome(surface);
  };
  return { available, switchTo };
}

// Portal vs CRM is decided by presence/absence of the `client` role.
// Any other role grants CRM access; per-page granularity is enforced by
// usePermissions/ProtectedRoute. Do NOT reintroduce a hard-coded CRM role
// whitelist — it silently locks out every functional role created later.

/**
 * Resolves a user's access kind from the anew_users → anew_memberships →
 * anew_roles chain. Single source of truth shared by the hook and the static
 * login helper. Supabase surfaces failures as `error` (not throws); missing
 * data is treated conservatively, matching the previous inline behaviour.
 *
 * - no auth id            → "anonymous"
 * - no anew_users profile → "supplier_only" if sp_whoami says is_supplier,
 *                            otherwise "no_profile"
 * - profile, no memberships → "crm_user" (self-registration onboarding)
 * - only `client` role    → "client_supplier" if sp_whoami says is_supplier
 *                            AND active, otherwise "client_only" (also when
 *                            sp_whoami fails — the client is never blocked)
 * - `client` + other role → "hybrid"   (sp_whoami is never called)
 * - only other roles      → "crm_user" (sp_whoami is never called)
 */
export async function fetchAccessKind(authUserId: string | null | undefined): Promise<ClientAccessKind> {
  if (!authUserId) return "anonymous";

  const { data: anewUser } = await (supabase as any)
    .from("anew_users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!anewUser?.id) {
    // Só contas SEM anew_users chegam aqui: utilizadores do CRM e clientes do
    // portal têm sempre perfil e nunca são classificados como fornecedor.
    // sp_whoami nunca dá erro (devolve { is_supplier: false } para qualquer
    // outra conta); se a chamada falhar, mantém-se o "no_profile" de sempre.
    // spWhoami devolve { is_supplier: false } em qualquer falha.
    const whoami = await spWhoami();
    return whoami.is_supplier === true ? "supplier_only" : "no_profile";
  }

  const { data: memberships } = await supabase
    .from("anew_memberships")
    .select("role_id")
    .eq("user_id", anewUser.id)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) return "crm_user";

  const roleIds = memberships.map((m) => m.role_id);
  const { data: roles } = await supabase
    .from("anew_roles")
    .select("id, code")
    .in("id", roleIds);

  const roleCodes = (roles || []).map((r) => r.code).filter(Boolean) as string[];
  const hasClientRole = roleCodes.includes("client");
  const hasNonClientRole = roleCodes.some((code) => code !== "client");

  if (hasClientRole && !hasNonClientRole) {
    // Cliente do portal que pode ser também fornecedor. O sp_whoami só é
    // chamado se TODAS as memberships ativas forem, comprovadamente, de
    // cliente: cada role_id distinto tem de ter sido lido e ter o código
    // `client`. Se algum papel não foi lido (RLS, erro), não se arrisca —
    // fica "client_only" como sempre e um utilizador do sistema nunca passa
    // a ser tratado como fornecedor.
    const distinctRoleIds = new Set(roleIds.filter(Boolean));
    const resolvedRoles = roles || [];
    const allMembershipsAreClient =
      distinctRoleIds.size > 0 &&
      resolvedRoles.length === distinctRoleIds.size &&
      resolvedRoles.every((r) => r.code === "client" && distinctRoleIds.has(r.id));
    if (!allMembershipsAreClient) return "client_only";

    // spWhoami devolve { is_supplier: false } em qualquer falha → client_only.
    // Só conta acesso ATIVO: sem ele o cliente não teria nada a fazer no
    // portal do fornecedor e o ecrã de escolha seria só um obstáculo.
    const whoami = await spWhoami();
    // (mesmo critério do SupplierPortalContext: active + conta presente).
    return whoami.is_supplier === true && whoami.active === true && whoami.account
      ? "client_supplier"
      : "client_only";
  }
  if (hasClientRole && hasNonClientRole) return "hybrid";
  if (hasNonClientRole) return "crm_user";
  return "no_profile";
}

/**
 * Hardened against tab refocus: Supabase re-emits SIGNED_IN and TOKEN_REFRESHED
 * when the browser tab regains focus. Reacting to those events with
 * setLoading(true) would collapse the route guard into a spinner, remount the
 * current page, and discard in-memory state (e.g. unsaved QuoteBuilder edits).
 * We therefore (a) ignore TOKEN_REFRESHED with a valid session, (b) ignore
 * SIGNED_IN when the user id has not changed, and (c) revalidate silently
 * without toggling `loading` outside the first load and real user changes.
 */
export function useClientRole() {
  const [accessKind, setAccessKind] = useState<ClientAccessKind>("loading");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  // Bumped by chooseContext/switchContext so a hybrid's stored choice is
  // re-read on the next render (getSessionContext runs fresh each render).
  const [contextVersion, setContextVersion] = useState(0);

  // Refs (not state) so the onAuthStateChange callback never reads stale values.
  const lastCheckedUserIdRef = useRef<string | null>(null);
  const lastResolvedAccessKindRef = useRef<ClientAccessKind | null>(null);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function applyKind(next: ClientAccessKind, uid: string | null) {
      if (cancelled) return;
      publishAccessSnapshot(uid, next);
      if (lastResolvedAccessKindRef.current !== next) {
        lastResolvedAccessKindRef.current = next;
        setAccessKind(next);
      }
    }

    async function check(uid: string | null) {
      const isFirstLoad = !initialLoadDoneRef.current;
      const isUserChange = uid !== lastCheckedUserIdRef.current;
      const shouldShowLoading = isFirstLoad || isUserChange;

      try {
        if (!uid) {
          lastCheckedUserIdRef.current = null;
          if (!cancelled) setUserId(null);
          applyKind("anonymous", null);
          if (!cancelled) {
            initialLoadDoneRef.current = true;
            setLoading(false);
          }
          return;
        }

        if (shouldShowLoading && !cancelled) setLoading(true);

        const kind = await fetchAccessKind(uid);

        lastCheckedUserIdRef.current = uid;
        if (!cancelled) setUserId(uid);
        applyKind(kind, uid);
        if (!cancelled) {
          initialLoadDoneRef.current = true;
          if (shouldShowLoading) setLoading(false);
        }
      } catch {
        // Don't flip an already-resolved access kind to "no_profile" because of
        // a transient revalidation error on tab refocus.
        if (shouldShowLoading) {
          lastCheckedUserIdRef.current = uid;
          if (!cancelled) setUserId(uid);
          applyKind("no_profile", uid);
          if (!cancelled) {
            initialLoadDoneRef.current = true;
            setLoading(false);
          }
        }
      }
    }

    supabase.auth.getUser().then(({ data: { user } }) => check(user?.id ?? null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUid = session?.user?.id ?? null;

      if (event === "SIGNED_OUT") {
        lastCheckedUserIdRef.current = null;
        lastResolvedAccessKindRef.current = "anonymous";
        // Drop any surface choice so the next login asks again ("sair e voltar").
        clearSessionContext();
        clearClientSupplierSurface();
        publishAccessSnapshot(null, "anonymous");
        if (!cancelled) {
          setUserId(null);
          setAccessKind("anonymous");
          setLoading(false);
        }
        return;
      }

      if (event === "TOKEN_REFRESHED" && session) {
        // Identity unchanged — ignore. Avoids spinner cascade on tab refocus.
        return;
      }

      if (event === "SIGNED_IN") {
        // Same-user re-emit on tab refocus → no-op.
        if (nextUid && nextUid === lastCheckedUserIdRef.current && initialLoadDoneRef.current) {
          return;
        }
        check(nextUid);
        return;
      }

      if (event === "USER_UPDATED") {
        // Revalidate silently (no spinner) for the same user; treat as user
        // change only if id differs.
        check(nextUid);
        return;
      }

      // INITIAL_SESSION and other events: revalidate without forcing spinner
      // beyond the first-load gate inside check().
      check(nextUid);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const isClientOnly = accessKind === "client_only";
  const isCrmAllowed = accessKind === "crm_user" || accessKind === "hybrid";
  const isAuthenticated = accessKind !== "anonymous" && accessKind !== "loading";

  // Context picker (Option 2). Only a `hybrid` user has a choice to make; every
  // other kind has a single, fixed surface. `contextVersion` is referenced so
  // the choice is re-read after chooseContext/switchContext.
  void contextVersion;
  const chosenContext = accessKind === "hybrid" ? getSessionContext(userId) : null;
  const activeContext: SessionContext | null =
    accessKind === "client_only"
      ? "portal"
      : accessKind === "crm_user"
        ? "crm"
        : accessKind === "hybrid"
          ? chosenContext
          : null;
  const needsContextChoice = accessKind === "hybrid" && chosenContext === null;
  const isClientSupplier = accessKind === "client_supplier";
  // client_supplier entra no portal do cliente e no do fornecedor seja qual for
  // a escolha guardada (a escolha só decide para onde vai ao entrar), por isso
  // os guards nunca o mandam de um portal para o outro — sem ciclos.
  const portalAllowed =
    accessKind === "client_only" || isClientSupplier || (accessKind === "hybrid" && chosenContext === "portal");
  const crmAllowed = accessKind === "crm_user" || (accessKind === "hybrid" && chosenContext === "crm");
  // Portal do Fornecedor: supplier_only e client_supplier. Para ambos
  // activeContext fica null (não são superfícies CRM/portal do hybrid).
  const supplierAllowed = accessKind === "supplier_only" || isClientSupplier;
  // Escolha de entrada de um client_supplier (null = ainda não escolheu).
  const clientSupplierSurface = isClientSupplier ? getClientSupplierSurface(userId) : null;

  const chooseContext = (ctx: SessionContext) => {
    if (userId) setSessionContext(userId, ctx);
    setContextVersion((v) => v + 1);
  };
  const chooseClientSupplierSurface = (surface: ClientSupplierSurface) => {
    if (userId && isClientSupplier) setClientSupplierSurface(userId, surface);
    setContextVersion((v) => v + 1);
  };
  const switchContext = () => {
    clearSessionContext();
    clearClientSupplierSurface();
    setContextVersion((v) => v + 1);
  };

  return {
    accessKind,
    isClient: isClientOnly,
    isClientOnly,
    isCrmAllowed,
    isAuthenticated,
    loading,
    // Option 2 — surface picker for hybrid (CRM + client) accounts.
    activeContext,
    needsContextChoice,
    portalAllowed,
    crmAllowed,
    supplierAllowed,
    chooseContext,
    switchContext,
    // client_supplier — escolha entre portal do cliente e do fornecedor.
    isClientSupplier,
    clientSupplierSurface,
    chooseClientSupplierSurface,
  };
}

/**
 * Lightweight static check — call once after login to decide redirect.
 * Kept for callers that only need the client/not-client bit; hybrid users are
 * NOT client-only, so they resolve to `false` here and are routed by the
 * context picker instead (see fetchAccessKind + getSessionContext).
 */
export async function checkIsClientRole(authUserId: string): Promise<boolean> {
  try {
    // client_supplier também é cliente sem CRM.
    const kind = await fetchAccessKind(authUserId);
    return kind === "client_only" || kind === "client_supplier";
  } catch {
    return false;
  }
}
