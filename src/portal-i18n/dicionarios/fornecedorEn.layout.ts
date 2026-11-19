// Supplier portal, frame (sp.layout.*): header, menu, roles, footer and the access/error screens.
// The keys sp.layout.titulo and sp.layout.menu.{inicio,encomendas,catalogo} are in fornecedorEn.ts.
export const fornecedorEnLayout: Record<string, string> = {
  "sp.layout.menu.contrato": "Contract",
  "sp.layout.menu.meusDados": "My details",
  "sp.layout.aCarregar": "Loading…",
  "sp.layout.clientes": "Customers: {lista}",
  "sp.layout.sair": "Sign out",
  "sp.layout.mudarParaCliente": "Switch to Customer Portal",
  "sp.layout.papel.owner": "Main user",
  "sp.layout.papel.member": "View only",
  "sp.layout.porConfirmar": "{n} to confirm",
  "sp.layout.contratoPorAssinar": "contract awaiting signature",

  "sp.layout.semAcesso.titulo": "No active access",
  "sp.layout.semAcesso.texto":
    "Your account has no active access to the portal. Please contact the company that invited you.",
  "sp.layout.semAcesso.sessao": "Signed in as {email}",

  "sp.layout.erroCarregar.titulo": "The portal could not be loaded",
  "sp.layout.erroCarregar.texto": "Check your internet connection and try again.",
};
