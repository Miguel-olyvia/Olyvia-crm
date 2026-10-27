// "Novo fornecedor" = convidá-lo para o portal (NovoFornecedorDialogo do Olyvia 2.0).
// Lógica sem ecrã do diálogo NewSupplierDialog:
//   • supplierNifKey — a mesma regra da BD (public.fn_nif_key), que é a que
//     rpc_supplier_portal_invite_prepare usa para recusar o convite
//     (invalid_nif). Validar aqui evita criar o fornecedor e só depois o
//     convite falhar pelo NIF.
//   • validateNewSupplier — campos obrigatórios para convidar / criar sem portal.
//   • createSupplierRecord — o mesmo insert do formulário de sempre
//     (Suppliers.tsx: suppliers + withAuditContext + created_by), a devolver o id.
//   • sendSupplierPortalInvite — o convite do separador Portal da ficha
//     (edge function create-supplier-portal-access, action "invite"), sem
//     nada de novo do lado do servidor.
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";
import {
  describeAccessError,
  invokePortalAccess,
  type PortalAccessError,
  type PortalAccessResponse,
} from "@/components/supplier-portal-crm/types";

export interface NewSupplierInput {
  organizationId: string;
  name: string;
  taxId: string;
  email: string;
  contactName: string;
}

export type NewSupplierField = keyof NewSupplierInput;
export type NewSupplierErrors = Partial<Record<NewSupplierField, string>>;

const EU_PREFIXES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU", "IE",
  "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI",
]);

/**
 * Chave do NIF como na BD (public.fn_nif_key): 9 dígitos = NIF português com
 * dígito de controlo; ou prefixo de país da UE + 2 a 13 carateres. Inválido → null.
 */
export function supplierNifKey(nif: string | null | undefined): string | null {
  const s = String(nif ?? "").replace(/[\s.\-/ ]/g, "").toUpperCase();
  if (!s) return null;
  let cc: string;
  let body: string;
  if (/^[0-9]{9}$/.test(s)) {
    cc = "PT";
    body = s;
  } else if (/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(s)) {
    cc = s.slice(0, 2);
    body = s.slice(2);
    if (cc === "GR") cc = "EL";
    if (!EU_PREFIXES.has(cc)) return null;
  } else {
    return null;
  }
  if (cc === "PT") {
    if (!/^[1-9][0-9]{8}$/.test(body)) return null;
    let tot = 0;
    for (let i = 0; i < 8; i++) tot += Number(body[i]) * (9 - i);
    const r = tot % 11;
    const chk = r < 2 ? 0 : 11 - r;
    if (chk !== Number(body[8])) return null;
  }
  return cc + body;
}

// O mesmo critério do separador Portal (z.string().email()) sem puxar o zod.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const NIF_INVALID_MESSAGE =
  "NIF inválido. Para fornecedores estrangeiros use o prefixo do país (ex.: ESB12345678).";

/**
 * Erros por campo. Para convidar: empresa, nome, NIF válido, email e nome do
 * contacto. Sem portal: empresa e nome (o resto preenche-se na ficha); o email,
 * se vier, tem de ser válido.
 */
export function validateNewSupplier(d: NewSupplierInput, forInvite: boolean): NewSupplierErrors {
  const e: NewSupplierErrors = {};
  if (!d.organizationId) e.organizationId = "Escolha a empresa.";
  const name = d.name.trim();
  if (!name) e.name = "O nome é obrigatório.";
  else if (name.length > 200) e.name = "O nome deve ter menos de 200 caracteres.";
  const email = d.email.trim();
  if (forInvite) {
    if (!d.taxId.trim()) e.taxId = "O NIF é obrigatório para convidar.";
    else if (!supplierNifKey(d.taxId)) e.taxId = NIF_INVALID_MESSAGE;
    if (!email) e.email = "O email é obrigatório para convidar.";
    if (!d.contactName.trim()) e.contactName = "O nome do contacto é obrigatório para convidar.";
  }
  if (email && (!EMAIL_RE.test(email) || email.length > 255)) e.email = "Formato de email inválido.";
  if (d.taxId.trim().length > 50) e.taxId = "O NIF deve ter menos de 50 caracteres.";
  if (d.contactName.trim().length > 200) e.contactName = "O contacto deve ter menos de 200 caracteres.";
  return e;
}

export const firstError = (e: NewSupplierErrors): string | null => {
  const order: NewSupplierField[] = ["organizationId", "name", "taxId", "email", "contactName"];
  for (const k of order) if (e[k]) return e[k] as string;
  return null;
};

/** Insere o fornecedor como o formulário de sempre (ativo, auditado) e devolve o id. */
export async function createSupplierRecord(d: NewSupplierInput): Promise<{ id: string; name: string }> {
  const businessUserId = await resolveCurrentBusinessUserId();
  if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");
  const { data, error } = await withAuditContext(supabase, businessUserId, () =>
    supabase
      .from("suppliers")
      .insert({
        name: d.name.trim(),
        contact_person: d.contactName.trim() || null,
        email: d.email.trim().toLowerCase() || null,
        tax_id: d.taxId.trim() || null,
        is_active: true,
        organization_id: d.organizationId,
        created_by: businessUserId,
      })
      .select("id, name")
      .single(),
  );
  if (error) throw error;
  if (!data) throw new Error("O fornecedor não foi criado.");
  return { id: data.id, name: data.name };
}

export type InviteOutcome =
  | { ok: true; response: PortalAccessResponse }
  | { ok: false; error: PortalAccessError; message: string };

/** O convite do separador Portal (edge function create-supplier-portal-access). */
export async function sendSupplierPortalInvite(args: {
  organizationId: string;
  supplierId: string;
  email: string;
  contactName: string;
}): Promise<InviteOutcome> {
  const { data, error } = await invokePortalAccess({
    action: "invite",
    organization_id: args.organizationId,
    supplier_id: args.supplierId,
    email: args.email.trim().toLowerCase(),
    name: args.contactName.trim() || undefined,
  });
  if (error || !data) {
    const err: PortalAccessError = error ?? { error: "unknown", message: "Não foi possível enviar o acesso ao portal." };
    return { ok: false, error: err, message: describeAccessError(err) };
  }
  return { ok: true, response: data };
}
