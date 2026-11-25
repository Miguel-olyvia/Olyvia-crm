// 25/11 (Obra Viva, etapa 3b): a conta robô «Olyvia (agentes)» sem palavra-passe. Ninguém escreve nem guarda uma palavra-passe:
//  · se a conta não existe, cria-se sem palavra-passe (email confirmado, nenhum email enviado) e associa-se à organização com o papel
//    escolhido (AGENTES_PAPEL, o «Supervisor de obra»), pela mesma função da app (rpc_finalize_user_profile_full), em nome de quem a
//    autorizou (AGENTES_ATOR, o id em anew_users de quem pode criar utilizadores);
//  · em cada volta, a sessão gera-se no servidor com a chave de serviço (um link de entrada de uso único, que nunca sai daqui) e troca-se
//    logo por uma sessão. A conta robô fica com as permissões do papel e mais nenhumas; para a parar, tira-se o acesso na app.
// deno-lint-ignore-file no-explicit-any
type Cliente = any;

export interface ConfigRobo { email: string; nome: string; orgs: string[]; papel: string; ator: string | null }

async function procurarPorEmail(admin: Cliente, email: string): Promise<{ id: string } | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const u = (data?.users ?? []).find((x: { email?: string }) => (x.email ?? "").toLowerCase() === email.toLowerCase());
    if (u) return { id: u.id };
    if ((data?.users ?? []).length < 200) return null;
  }
  return null;
}

/** Garante a conta robô com perfil e o papel em cada organização. Devolve o que fez (para o resumo). */
export async function garantirContaRobo(admin: Cliente, cfg: ConfigRobo): Promise<string[]> {
  const feito: string[] = [];
  let u = await procurarPorEmail(admin, cfg.email);
  if (!u) {
    const { data, error } = await admin.auth.admin.createUser({ email: cfg.email, email_confirm: true, user_metadata: { full_name: cfg.nome, admin_created: true } });
    if (error) throw new Error(`a conta robô não foi criada: ${error.message}`);
    u = { id: data.user.id };
    feito.push("conta criada");
  }
  // o perfil e as associações (só as que faltam)
  const { data: perfil } = await admin.from("anew_users").select("id").eq("auth_user_id", u.id).maybeSingle();
  const { data: socios } = perfil ? await admin.from("anew_memberships").select("organization_id").eq("user_id", perfil.id).eq("status", "active") : { data: [] };
  const ja = new Set((socios ?? []).map((m: { organization_id: string }) => m.organization_id));
  const faltam = cfg.orgs.filter((o) => !ja.has(o));
  if (faltam.length) {
    if (!cfg.ator) throw new Error("falta AGENTES_ATOR (quem autoriza a conta robô) para a associar à organização");
    if (!perfil) {
      const { error } = await admin.rpc("rpc_finalize_user_profile_full", {
        p_auth_user_id: u.id, p_actor_id: cfg.ator, p_name: cfg.nome, p_email: cfg.email, p_phone: null, p_status: "active", p_description: "A conta dos agentes da Olyvia (Obra Viva).",
        p_position: null, p_location: null, p_template_id: null, p_custom_attributes: null,
        p_memberships: faltam.map((o) => ({ organization_id: o, role_id: cfg.papel })), p_fiscal: null, p_addresses: [], p_additional_emails: [], p_additional_phones: [],
      });
      if (error) throw new Error(`o perfil da conta robô não ficou: ${error.message}`);
    } else {
      for (const o of faltam) {
        const { error } = await admin.rpc("rpc_hr_associar_conta_existente", { p_auth_user_id: u.id, p_actor_id: cfg.ator, p_organization_id: o, p_role_id: cfg.papel });
        if (error) throw new Error(`a conta robô não ficou na organização: ${error.message}`);
      }
    }
    feito.push(`papel dado em ${faltam.length} ${faltam.length === 1 ? "organização" : "organizações"}`);
  }
  return feito;
}

/** Uma sessão da conta robô, sem palavra-passe: um link de entrada gerado aqui e trocado logo (o token nunca sai da função). */
export async function entrarComoRobo(admin: Cliente, sb: Cliente, email: string): Promise<void> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`a sessão da conta robô não foi gerada: ${error.message}`);
  const hash = data?.properties?.hashed_token;
  if (!hash) throw new Error("a sessão da conta robô não foi gerada (sem token)");
  let r = await sb.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
  if (r.error) r = await sb.auth.verifyOtp({ token_hash: hash, type: "email" });
  if (r.error) throw new Error(`a conta robô não entrou: ${r.error.message}`);
}
