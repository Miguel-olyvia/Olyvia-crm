// Port 1:1 of src/lib/permissionAliases.ts — edge equivalent.
// Mantém apenas pares alias bi-direccionais X.edit ↔ X.update.
// NÃO inclui wildcards, hierarquia por role, nem expansão por "manage" — esses
// não existem no frontend hoje. Se alguma vez forem introduzidos lá, têm de
// ser portados aqui no mesmo PR para manter paridade.

const ALIASES: [string, string][] = [
  ["users.edit", "users.update"],
  ["settings.edit", "settings.update"],
  ["organizations.edit", "organizations.update"],
  ["products.edit", "products.update"],
  ["services.edit", "services.update"],
  ["clients.edit", "clients.update"],
  ["contacts.edit", "contacts.update"],
  ["leads.edit", "leads.update"],
  ["deals.edit", "deals.update"],
  ["quotes.edit", "quotes.update"],
  ["proposals.edit", "proposals.update"],
  ["campaigns.edit", "campaigns.update"],
  ["employees.edit", "employees.update"],
  ["suppliers.edit", "suppliers.update"],
  ["roles.edit", "roles.update"],
];

const aliasMap = new Map<string, Set<string>>();
for (const [a, b] of ALIASES) {
  if (!aliasMap.has(a)) aliasMap.set(a, new Set([a]));
  if (!aliasMap.has(b)) aliasMap.set(b, new Set([b]));
  aliasMap.get(a)!.add(b);
  aliasMap.get(b)!.add(a);
}

export function expandPermissions(codes: string[]): Set<string> {
  const expanded = new Set(codes);
  for (const code of codes) {
    const aliases = aliasMap.get(code);
    if (aliases) for (const alias of aliases) expanded.add(alias);
  }
  return expanded;
}

export function permissionSetHas(permSet: Set<string>, code: string): boolean {
  if (permSet.has(code)) return true;
  const aliases = aliasMap.get(code);
  if (aliases) {
    for (const alias of aliases) if (permSet.has(alias)) return true;
  }
  return false;
}
