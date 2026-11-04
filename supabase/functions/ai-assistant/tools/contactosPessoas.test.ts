// 04/11/2026 (aprovado): os contactos vivem em Pessoas — as ferramentas de contactos do assistente pedem pessoas.view/create/edit
// em vez de contacts.view/create/edit. Comportamento igual; só muda o código verificado. Os papéis que tinham contacts.* já têm o
// pessoas.* equivalente (verificado na base do ramo; a migração 20270106710000 concede-o a quem faltar).
// Run: deno test supabase/functions/ai-assistant/tools/contactosPessoas.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ExecCtx, Handler } from "../shared/types.ts";
import { handlers as crm } from "./crm.ts";
import { handlers as entities } from "./entities.ts";
import { handlers as users } from "./users.ts";
import { handlers as activities } from "./activities.ts";

const UUID = "11111111-1111-4111-8111-111111111111";

/** Supabase falso: qualquer cadeia from(...).x().y() resolve; anew_contacts devolve um contacto ativo, o resto vem vazio. */
function supabaseFalso(): any {
  const resultado = (tabela: string) =>
    tabela === "anew_contacts"
      ? { data: [{ id: UUID, status: "active" }], error: null, count: 0 }
      : { data: [], error: null, count: 0 };
  const cadeia = (tabela: string): any =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return (ok: (v: unknown) => void) => ok(resultado(tabela));
        return () => cadeia(tabela);
      },
      apply() {
        return cadeia(tabela);
      },
    });
  return {
    from: (tabela: string) => cadeia(tabela),
    rpc: () => cadeia("rpc"),
    functions: { invoke: async () => ({ data: null, error: { message: "parar" } }) },
  };
}

function ctx(perms: string[]): ExecCtx {
  return {
    supabase: supabaseFalso(),
    authUid: "auth-1",
    businessUserId: UUID,
    organizationId: UUID,
    visibleOrgIds: [UUID],
    userContext: {},
    permissions: perms,
    memberships: [],
    isSystemAdmin: false,
    authHeader: "",
  } as ExecCtx;
}

const ARGS = {
  id: UUID, contact_id: UUID, entity_id: UUID, lead_id: UUID, record_id: UUID, email_id: UUID, phone_id: UUID, tag_id: UUID,
  entity_type: "contact", assignee_user_id: null, to_contact: true, confirm: true,
  display_name: "Ana Teste", name: "Ana Teste", email: "ana@exemplo.pt", phone: "912345678", tag: "vip", notes: "nota",
  address: "Rua 1", city: "Lisboa", postal_code: "1000-001",
};

const RECUSA = /Não tens permissão|Sem permissão/;

async function correr(h: Handler, perms: string[]): Promise<string> {
  try {
    const r = await h(ctx(perms), { ...ARGS });
    return String((r as any)?.message ?? "");
  } catch (e) {
    return `erro: ${String((e as Error)?.message ?? e)}`; // passou a guarda e foi à base falsa
  }
}

const CASOS: [string, Handler, string, string[]][] = [
  ["create_contact", crm.create_contact, "pessoas.create", []],
  ["update_contact", crm.update_contact, "pessoas.edit", []],
  ["convert_lead (to_contact)", crm.convert_lead, "pessoas.create", ["leads.edit"]],
  ["get_contact_details", crm.get_contact_details, "pessoas.view", []],
  ["update_contact_notes", crm.update_contact_notes, "pessoas.edit", []],
  ["delete_contact", crm.delete_contact, "pessoas.edit", []],
  ...(["add_entity_email", "delete_entity_email", "set_primary_email", "add_entity_phone", "delete_entity_phone", "set_primary_phone",
    "set_entity_address", "add_contact_tag", "remove_contact_tag", "restore_contact"] as const)
    .map((n): [string, Handler, string, string[]] => [n, entities[n], "pessoas.edit", []]),
  ["assign_crm_record (contact)", users.assign_crm_record, "pessoas.edit", []],
  ["add_note (entidade é contacto)", activities.add_note, "pessoas.edit", []],
];

for (const [nome, h, codigo, extra] of CASOS) {
  const legado = codigo.replace("pessoas.", "contacts.");
  Deno.test(`${nome}: com ${codigo} passa a guarda`, async () => {
    assert(h, `handler ${nome} existe`);
    const msg = await correr(h, [codigo, ...extra]);
    assert(!RECUSA.test(msg), `${nome} recusou com ${codigo}: ${msg}`);
  });
  Deno.test(`${nome}: sem ${codigo} é recusado (o antigo ${legado} sozinho já não chega)`, async () => {
    assert(RECUSA.test(await correr(h, [...extra])), `${nome} sem permissão devia recusar`);
    assert(RECUSA.test(await correr(h, [legado, ...extra])), `${nome} só com ${legado} devia recusar`);
  });
}

Deno.test("nenhuma ferramenta pede contacts.view/create/edit/delete", async () => {
  for (const f of ["crm.ts", "entities.ts", "users.ts", "activities.ts"]) {
    const texto = await Deno.readTextFile(new URL(`./${f}`, import.meta.url));
    const usos = texto.split("\n").filter((l) => !l.trim().startsWith("//") && /contacts\.(view|create|edit|delete)\b|contacts\.\$\{/.test(l));
    assertEquals(usos, [], f);
  }
});
