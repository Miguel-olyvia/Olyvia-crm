// Supplier portal, layout (sp.layout.*): header, menu, roles, footer and access/error screens.
// The keys sp.layout.titulo and sp.layout.menu.{inicio,encomendas,catalogo} live in fornecedorEn.ts.
export const fornecedorEnLayout: Record<string, string> = {
  "sp.layout.menu.meusDados": "My details",
  "sp.layout.aCarregar": "Loading…",
  "sp.layout.clientes": "Customers: {lista}",
  "sp.layout.sair": "Sign out",
  "sp.layout.mudarParaCliente": "Switch to Client Portal",
  "sp.layout.papel.owner": "Primary user",
  "sp.layout.papel.member": "View only",
  "sp.layout.porConfirmar": "{n} to confirm",

  "sp.layout.semAcesso.titulo": "No active access",
  "sp.layout.semAcesso.texto":
    "Your account does not have any active access to the portal. Please contact the company that invited you.",
  "sp.layout.semAcesso.sessao": "Signed in as {email}",

  "sp.layout.erroCarregar.titulo": "Could not load the portal",
  "sp.layout.erroCarregar.texto": "Check your internet connection and try again.",
};
