// process-scheduled-emails: decide se um email agendado deve ser cancelado
// antes do envio. Sem imports remotos (testavel no vitest).
//
// entity_type 'leads': o id e o da ENTIDADE (lead = entidade sem client_since).
// So se cancela se a entidade deixou de existir (apagada ou fora da
// organizacao do email); uma entidade nao tem fase de lead para comparar com
// o trigger_phase do template. Uma leitura falhada lanca (o email fica
// "failed" e visivel) em vez de cancelar em silencio.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export async function checkIfShouldCancel(
  supabase: SupabaseLike,
  // deno-lint-ignore no-explicit-any
  email: any,
): Promise<boolean> {
  if (!email.template_id) return false;

  const { data: template, error: templateError } = await supabase
    .from("email_templates")
    .select("trigger_phase, module")
    .eq("id", email.template_id)
    .maybeSingle();
  if (templateError) throw new Error(`leitura do template falhou: ${templateError.message}`);

  if (!template || !template.trigger_phase) return false;

  const { entity_type, entity_id } = email;

  if (entity_type === "proposals") {
    const { data: proposal } = await supabase.from("proposals").select("stage_id").eq("id", entity_id).maybeSingle();
    if (!proposal) return true;
    if (proposal.stage_id) {
      const { data: stage } = await supabase.from("proposal_workflow_stages").select("name").eq("id", proposal.stage_id).maybeSingle();
      if (stage?.name && stage.name !== template.trigger_phase) return true;
    }
  } else if (entity_type === "quotes") {
    const { data: quote } = await supabase.from("quotes").select("estado").eq("id", entity_id).maybeSingle();
    if (!quote) return true;
    if (quote.estado !== template.trigger_phase) return true;
  } else if (entity_type === "leads") {
    // O id e o da ENTIDADE (lead = entidade sem client_since).
    const { data: entity, error: entityError } = await supabase
      .from("anew_entities")
      .select("id")
      .eq("id", entity_id)
      .eq("organization_id", email.organization_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (entityError) throw new Error(`leitura da entidade falhou: ${entityError.message}`);
    if (!entity) return true;
  } else if (entity_type === "contracts") {
    const { data: contract } = await supabase.from("client_contracts").select("status").eq("id", entity_id).maybeSingle();
    if (!contract) return true;
    if (contract.status !== template.trigger_phase) return true;
  }

  return false;
}
