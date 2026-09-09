import { supabase } from "./supabase";

export interface DucCollaborator {
  id: string;
  duc_id: string;
  organization_id: string;
  email: string;
  role: "viewer" | "editor";
  invited_at?: string;
  accepted_at?: string | null;
}

/** Colaboradores externos ativos de um DUC. */
export async function fetchCollaborators(ducId: string): Promise<DucCollaborator[]> {
  const { data } = await supabase
    .from("anew_client_duc_collaborators")
    .select("id, duc_id, organization_id, email, role, invited_at, accepted_at")
    .eq("duc_id", ducId)
    .is("revoked_at", null)
    .order("invited_at", { ascending: true });
  return (data ?? []) as DucCollaborator[];
}

/** Convida um externo (insere a linha). O acesso efetivo depende da RLS §9. */
export async function addCollaborator(
  ducId: string,
  orgId: string,
  email: string,
  role: "viewer" | "editor",
  invitedBy: string | null
): Promise<string | null> {
  const { error } = await supabase.from("anew_client_duc_collaborators").insert({
    duc_id: ducId,
    organization_id: orgId,
    email: email.trim().toLowerCase(),
    role,
    invited_by: invitedBy,
  });
  return error ? error.message : null;
}

/** Revoga (soft) um colaborador. */
export async function removeCollaborator(id: string): Promise<void> {
  await supabase
    .from("anew_client_duc_collaborators")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Envia um MAGIC LINK para o email entrar (Supabase Auth). Ao clicar, o externo
 * fica autenticado e — se for colaborador — a RLS dá-lhe acesso ao(s) DUC(s).
 */
export async function sendMagicLink(email: string, redirectTo: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  return error ? error.message : null;
}

/**
 * Ao entrar, marca os convites deste email como aceites e guarda o auth_user_id
 * (para o acesso passar a resolver também por id). Best-effort.
 */
export async function acceptCollaboratorInvites(authUserId: string, email: string): Promise<void> {
  await supabase
    .from("anew_client_duc_collaborators")
    .update({ auth_user_id: authUserId, accepted_at: new Date().toISOString() })
    .is("auth_user_id", null)
    .ilike("email", email);
}
