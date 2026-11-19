// Customer portal texts, in English: "My Projects" (the list), a project in detail (SMS code, notices), the project
// steps (bar and "Step n of 5" card) and the conversation with the team. `pc.negocios.*` keys. Every key must also
// exist in clientePt.negocios.ts. Server messages, messages written by people and the V1 screen (src/emylia) stay as they come.
export const clienteEnNegocios: Record<string, string> = {
  // List
  "pc.negocios.lista.titulo": "My Projects",
  "pc.negocios.lista.vazio": "You have no projects available.",
  "pc.negocios.lista.vazioOutros": "If you were expecting to see others, switch company using the selector at the top of the page.",
  "pc.negocios.lista.abrir": "Open",
  "pc.negocios.lista.abrirNegocio": "Open {titulo}",
  "pc.negocios.lista.passoAria": "Step {passo} of {total}: {nome}",
  "pc.negocios.lista.novas.um": "{n} new message",
  "pc.negocios.lista.novas.varios": "{n} new messages",

  // Steps (bar and card)
  "pc.negocios.passos.lista": "Project steps",
  "pc.negocios.passos.feito": "(done)",
  "pc.negocios.passos.atual": "(current step)",
  "pc.negocios.passos.passoDe": "Step {passo} of {total}",
  "pc.negocios.passos.totalComIva": "Total, incl. VAT",
  "pc.negocios.passos.prazo": "Deadline",
  "pc.negocios.passos.1.nome": "Review the proposal",
  "pc.negocios.passos.1.titulo": "Review your proposal",
  "pc.negocios.passos.1.texto": "It is all below: what we will do, phase by phase, the materials, the price and the terms.",
  "pc.negocios.passos.2.nome": "Accept",
  "pc.negocios.passos.2.titulo": "Accept the proposal",
  "pc.negocios.passos.2.texto": "If you agree, accept it with the code we send you by SMS. If you would like to change something, request changes.",
  "pc.negocios.passos.3.nome": "Sign the contract",
  "pc.negocios.passos.3.titulo": "Sign the contract",
  "pc.negocios.passos.3.texto": "The proposal has been accepted. Read the contract and sign it with the code we send you by SMS.",
  "pc.negocios.passos.4.nome": "Follow the service",
  "pc.negocios.passos.4.titulo": "Your project is under way",
  "pc.negocios.passos.4.texto": "The contract is signed. The team keeps you informed here and by direct contact at every step forward.",
  "pc.negocios.passos.5.nome": "Receive the service",
  "pc.negocios.passos.5.titulo": "Receive the service",
  "pc.negocios.passos.5.texto": "At the end of the project we confirm with you that everything is as agreed.",

  // Conversation with the team
  "pc.negocios.conversa.titulo": "Conversation with the team",
  "pc.negocios.conversa.aCarregar": "Loading the conversation…",
  "pc.negocios.conversa.erroLer": "We could not load the conversation. Please try again in a moment.",
  "pc.negocios.conversa.erroAtualizar": "We could not refresh the conversation; trying again…",
  "pc.negocios.conversa.erroEnviar": "We could not send the message.",
  "pc.negocios.conversa.respostaInesperada": "Unexpected response from the server: the message may have gone through, please check the conversation.",
  "pc.negocios.conversa.vazio": "No messages yet. Write to the team: we reply here. If there is a problem on site, attach photos.",

  // A project in detail: notices
  "pc.negocios.detalhe.avisoSemAcao": "This cannot be done here yet. Write to us in the conversation and we will take care of it.",
  "pc.negocios.detalhe.propostaIndisponivel": "The proposal is not available yet. Please try again shortly.",

  // Receiving the service (acceptance report) and addendum: the SMS code
  "pc.negocios.receber.subtitulo": "Receive the service · report {n}",
  "pc.negocios.receber.titulo": "Sign the acceptance report",
  "pc.negocios.receber.comReservas": "Your remark is recorded: \"{reservas}\".",
  "pc.negocios.receber.semReservas": "It says everything is fine.",
  "pc.negocios.receber.acao": "Sign the report",
  "pc.negocios.receber.voltar": "Back to the report",
  "pc.negocios.adenda.subtitulo": "Additional work · addendum {ref}",
  "pc.negocios.adenda.voltar": "Back to the addendum",
  "pc.negocios.sms.confirmar": "To confirm, we will send a code by SMS to your mobile phone.",
  "pc.negocios.sms.enviar": "Send the code by SMS",
  "pc.negocios.sms.aEnviar": "Sending the code…",
  "pc.negocios.sms.codigo": "Code you received",
  "pc.negocios.sms.codigoEm": "Code you received on {tel}",
  "pc.negocios.sms.aConfirmar": "Confirming…",
  "pc.negocios.sms.outro": "Send another code",
  "pc.negocios.sms.erroEnvio": "We could not send the code.",
  "pc.negocios.sms.erroCodigo": "Invalid code.",
};
