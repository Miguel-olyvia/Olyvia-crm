// Customer portal, proposal detail (ClientPortalProposalDetail.tsx), in English.
export const clienteEnPropostaDet: Record<string, string> = {
  "pc.propostaDet.voltar": "Back",
  "pc.propostaDet.naoEncontrada": "Proposal not found.",
  "pc.propostaDet.erro": "Error",

  // Proposal status
  "pc.propostaDet.estado.aguardaDecisao": "Awaiting decision",
  "pc.propostaDet.estado.rascunho": "Draft",
  "pc.propostaDet.estado.aceite": "Proposal accepted",
  "pc.propostaDet.estado.rejeitada": "Proposal rejected",
  "pc.propostaDet.estado.expirada": "Proposal expired",

  // Rejection reasons (label only: the value saved in the database is always the Portuguese text)
  "pc.propostaDet.motivo.precoAlto": "Price too high",
  "pc.propostaDet.motivo.alternativa": "I found an alternative",
  "pc.propostaDet.motivo.naoPreciso": "I no longer need it",
  "pc.propostaDet.motivo.prazo": "The timeframe doesn't suit me",
  "pc.propostaDet.motivo.adiar": "I'll postpone",
  "pc.propostaDet.motivo.outro": "Other",

  // Attachments
  "pc.propostaDet.anexos.titulo": "Attached documents ({n})",
  "pc.propostaDet.anexos.descarregar": "Download",
  "pc.propostaDet.anexos.erroDescarregar": "Error downloading",

  // Quotes
  "pc.propostaDet.orcamento.aceiteTitulo": "Quote accepted",
  "pc.propostaDet.orcamento.aceiteTexto": "The quote was accepted successfully.",
  "pc.propostaDet.orcamento.rejeitadoTitulo": "Quote rejected",
  "pc.propostaDet.orcamento.aceitePeloMenosUmTitulo": "Accept at least 1 quote",
  "pc.propostaDet.orcamento.aceitePeloMenosUmTexto": "Before signing the proposal, accept at least one quote.",

  // SMS code
  "pc.propostaDet.sms.semTelefone": "No phone number was found linked to your account. Please contact your sales contact.",
  "pc.propostaDet.sms.enviadoTitulo": "SMS code sent",
  "pc.propostaDet.sms.enviadoTexto": "We sent a code to {telefone}",
  "pc.propostaDet.sms.erroEnviar": "Error sending SMS",
  "pc.propostaDet.sms.codigoInvalidoTentar": "Invalid code. Please try again.",
  "pc.propostaDet.sms.codigoInvalido": "Invalid code",

  // Signature
  "pc.propostaDet.assinatura.sucessoTitulo": "Proposal signed successfully! 🎉",
  "pc.propostaDet.assinatura.sucessoComercial": "Thank you! Your sales contact {nome} will be in touch shortly.",
  "pc.propostaDet.assinatura.sucessoGenerico": "Thank you! We will be in touch shortly.",
  "pc.propostaDet.assinatura.erroTitulo": "Error signing",
  "pc.propostaDet.assinatura.erroGenerico": "An error occurred while signing the proposal. Please try again.",

  // Rejection dialog
  "pc.propostaDet.rejeitar.titulo": "Reject Proposal",
  "pc.propostaDet.rejeitar.descricao": "Please tell us why you are rejecting it, to help us improve.",
  "pc.propostaDet.rejeitar.motivo": "Reason",
  "pc.propostaDet.rejeitar.motivoPlaceholder": "Select a reason",
  "pc.propostaDet.rejeitar.comentario": "Comment (optional)",
  "pc.propostaDet.rejeitar.comentarioPlaceholder": "Add a comment...",
  "pc.propostaDet.rejeitar.cancelar": "Cancel",
  "pc.propostaDet.rejeitar.confirmar": "Confirm Rejection",
  "pc.propostaDet.rejeitar.feitaTitulo": "Proposal rejected",
  "pc.propostaDet.rejeitar.feitaTexto": "We're sorry to hear that. Thank you for your feedback.",

  // Question dialog
  "pc.propostaDet.duvida.titulo": "💬 I have questions",
  "pc.propostaDet.duvida.descricao":
    "Send your question to the sales contact in charge. They will be notified and will get in touch with you.",
  "pc.propostaDet.duvida.placeholder": "Write your question or request for clarification...",
  "pc.propostaDet.duvida.cancelar": "Cancel",
  "pc.propostaDet.duvida.enviar": "Send Question",
  "pc.propostaDet.duvida.enviadaTitulo": "Question sent!",
  "pc.propostaDet.duvida.enviadaTexto": "Your sales contact will be notified and will get in touch.",

  // PDF
  "pc.propostaDet.pdf.formatoInesperado": "The server's response came in an unexpected format. Please contact support.",
  "pc.propostaDet.pdf.semConteudoTitulo": "No content to generate the PDF",
  "pc.propostaDet.pdf.semConteudoTexto": "This proposal has no associated quotes.",
  "pc.propostaDet.pdf.erroTitulo": "Error generating PDF",
};
