import { clienteDoRamo } from "./lib-ramo.mjs";
const sb = await clienteDoRamo();
const { data, error } = await sb.from("anew_roles")
  .select("id, code, name, organization_id, is_system")
  .or("name.ilike.%colaborador%,code.eq.worker,code.eq.client,is_system.eq.true")
  .order("code");
if (error) { console.log("ERRO:", error.message); process.exit(1); }
const orgIds = [...new Set((data??[]).map(r => r.organization_id).filter(Boolean))];
const { data: orgs } = orgIds.length
  ? await sb.from("anew_organizations").select("id, name").in("id", orgIds) : { data: [] };
const nomeOrg = Object.fromEntries((orgs ?? []).map(o => [o.id, o.name]));
console.log("code".padEnd(22) + "nome no ecra".padEnd(26) + "sistema".padEnd(9) + "organizacao");
for (const r of data ?? []) {
  console.log(
    (r.code ?? "-").padEnd(22) +
    (r.name ?? "-").padEnd(26) +
    (r.is_system ? "sim" : "nao").padEnd(9) +
    (r.organization_id ? (nomeOrg[r.organization_id] ?? r.organization_id) : "GLOBAL")
  );
}
