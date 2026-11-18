// Customer portal texts, in English (`pc.*` keys, one part per page: `pc.inicio.*`, `pc.propostas.*`...).
// Keep this file under 400 lines: put each new page/area in its own `clienteEn.<theme>.ts` exporting a
// `Record<string, string>` and spread it here. Every key must also exist in `clientePt.ts` (and vice versa).
export const clienteEn: Record<string, string> = {
  // Layout
  "pc.layout.titulo": "Customer Portal",
  "pc.layout.menu.inicio": "Home",
  "pc.layout.menu.propostas": "Proposals",
  "pc.layout.menu.contratos": "Contracts",
  "pc.layout.menu.documentos": "Documents",

  // Documents
  "pc.documentos.titulo": "Documents",

  // Home
  "pc.inicio.saudacao": "Hello, {nome}!",
  "pc.inicio.validaAte": "Valid until {data}",

  // Plurals (use with tn)
  "pc.propostas.pendentes.um": "{n} pending proposal",
  "pc.propostas.pendentes.varios": "{n} pending proposals",

  // Contracts
  "pc.contratos.assinadoEm": "Signed on {data}",
  "pc.contratos.anuladoEm": "Cancelled on {data}",
};
