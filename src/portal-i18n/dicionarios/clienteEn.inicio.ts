// Customer portal, home page (ClientPortal.tsx), in English. The keys `pc.inicio.saudacao` and
// `pc.inicio.validaAte` live in clienteEn.ts.
export const clienteEnInicio: Record<string, string> = {
  "pc.inicio.ola": "Hello, {nome} 👋",
  "pc.inicio.clienteSemNome": "Customer",

  // Pending actions banner (plural: tn)
  "pc.inicio.banner.um": "You have {n} pending action",
  "pc.inicio.banner.varios": "You have {n} pending actions",
  "pc.inicio.banner.verProposta": "View proposal",
  "pc.inicio.banner.verContrato": "View contract",

  // Summary cards
  "pc.inicio.cartao.propostas": "Proposals",
  "pc.inicio.cartao.contratos": "Contracts",
  "pc.inicio.cartao.documentos": "Documents",
  "pc.inicio.cartao.aguardamDecisao": "{n} awaiting decision",
  "pc.inicio.cartao.ativos.um": "{n} active",
  "pc.inicio.cartao.ativos.varios": "{n} active",

  // Pending actions
  "pc.inicio.acoes.titulo": "Pending Actions",
  "pc.inicio.acoes.vazio": "You have no pending actions at the moment.",
  "pc.inicio.acoes.propostaSemTitulo": "Untitled proposal",
  "pc.inicio.acoes.contratoSemTitulo": "Untitled contract",
  "pc.inicio.acoes.tipoProposta": "Proposal",
  "pc.inicio.acoes.tipoContrato": "Contract",
  "pc.inicio.acoes.verEDecidir": "View and decide",

  // Your proposals
  "pc.inicio.propostas.titulo": "Your Proposals",
  "pc.inicio.propostas.verTodas": "View all",
  "pc.inicio.propostas.vazio": "No proposals available.",
  "pc.inicio.propostas.trocarEmpresa": "If you were expecting to see others, switch company using the selector at the top of the page.",

  // Recent activity
  "pc.inicio.atividade.titulo": "Recent Activity",
  "pc.inicio.atividade.vazio": "No recent activity.",
  "pc.inicio.atividade.propostaAceite": "Proposal \"{titulo}\" accepted",
  "pc.inicio.atividade.propostaDisponibilizada": "Proposal \"{titulo}\" made available",
  "pc.inicio.atividade.contratoGerado": "Contract generated from the proposal",
  "pc.inicio.atividade.documentos.um": "{n} document available",
  "pc.inicio.atividade.documentos.varios": "{n} documents available",
  "pc.inicio.atividade.contaCriada": "Portal access account created",

  // Your sales contact
  "pc.inicio.comercial.titulo": "Your Sales Contact",
  "pc.inicio.comercial.semNome": "Sales contact",
  "pc.inicio.comercial.cargo": "Sales Manager",
  "pc.inicio.comercial.ligar": "Call",
  "pc.inicio.comercial.email": "Email",
  "pc.inicio.comercial.indisponivel": "Sales contact information unavailable.",

  // Information
  "pc.inicio.faq.titulo": "Information",
  "pc.inicio.faq.comoFunciona.pergunta": "How does the portal work?",
  "pc.inicio.faq.comoFunciona.resposta":
    "Here you can view your proposals, accept or reject them, and see the related contracts and documents.",
  "pc.inicio.faq.duvidas.pergunta": "Have any questions?",
  "pc.inicio.faq.duvidas.resposta":
    "Contact your sales contact directly, or send a question from any proposal or contract.",
  "pc.inicio.faq.expiram.pergunta": "Do proposals expire?",
  "pc.inicio.faq.expiram.resposta":
    "Yes, each proposal has an expiry date. After that date, the proposal expires automatically.",

  // Company
  "pc.inicio.empresa.titulo": "Company",
  "pc.inicio.empresa.contacteComercial": "Contact your sales contact for more information.",
};
