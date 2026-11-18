// Customer portal, proposal detail (ClientPortalProposalDetail.tsx), in English.
export const clienteEnPropostaDet: Record<string, string> = {
  "pc.propostaDet.voltar": "Back",
  "pc.propostaDet.naoEncontrada": "Proposal not found.",

  // Proposal status
  "pc.propostaDet.estado.aguardaDecisao": "Awaiting your decision",
  "pc.propostaDet.estado.rascunho": "Draft",
  "pc.propostaDet.estado.aceite": "Proposal accepted",
  "pc.propostaDet.estado.rejeitada": "Proposal rejected",
  "pc.propostaDet.estado.expirada": "Proposal expired",

  // Rejection reasons (label only: the value stored in the database is always the Portuguese text)
  "pc.propostaDet.motivo.precoAlto": "Price too high",
  "pc.propostaDet.motivo.alternativa": "I found an alternative",
  "pc.propostaDet.motivo.naoPreciso": "I no longer need it",
  "pc.propostaDet.motivo.prazo": "Timeline does not suit me",
  "pc.propostaDet.motivo.adiar": "I will postpone",
  "pc.propostaDet.motivo.outro": "Other",

  // Attachments
  "pc.propostaDet.anexos.titulo": "Attached documents ({n})",
  "pc.propostaDet.anexos.descarregar": "Download",
  "pc.propostaDet.anexos.erroDescarregar": "Download failed",

  // Quotes
  "pc.propostaDet.orcamento.aceiteTitulo": "Quote accepted",
  "pc.propostaDet.orcamento.aceiteTexto": "The quote was accepted successfully.",
  "pc.propostaDet.orcamento.rejeitadoTitulo": "Quote rejected",
  "pc.propostaDet.orcamento.aceitePeloMenosUmTitulo": "Accept at least 1 quote",
  "pc.propostaDet.orcamento.aceitePeloMenosUmTexto": "Before signing the proposal, please accept at least one quote.",

  // SMS code and signature
  "pc.propostaDet.sms.semTelefone": "No phone number was found linked to your account. Please contact your sales representative.",
  "pc.propostaDet.sms.enviadoTitulo": "SMS code sent",
  "pc.propostaDet.sms.enviadoTexto": "We sent a code to {telefone}",
  "pc.propostaDet.sms.erroEnviar": "Could not send the SMS",
  "pc.propostaDet.sms.codigoInvalidoTentar": "Invalid code. Please try again.",
  "pc.propostaDet.sms.codigoInvalido": "Invalid code",
  "pc.propostaDet.assinatura.erroGenerico": "An error occurred while signing the proposal. Please try again.",
  "pc.propostaDet.assinatura.sucessoTitulo": "Proposal signed successfully! 🎉",
  "pc.propostaDet.assinatura.sucessoComercial": "Thank you! Your sales representative {nome} will be in touch shortly.",
  "pc.propostaDet.assinatura.sucessoGenerico": "Thank you! We will be in touch shortly.",
  "pc.propostaDet.assinatura.erroTitulo": "Could not sign",

  // PDF
  "pc.propostaDet.pdf.formatoInesperado": "The server response came in an unexpected format. Please contact support.",
  "pc.propostaDet.pdf.semConteudoTitulo": "Nothing to generate the PDF from",
  "pc.propostaDet.pdf.semConteudoTexto": "This proposal has no quotes attached.",
  "pc.propostaDet.pdf.erroTitulo": "Could not generate the PDF",

  // Generic error
  "pc.propostaDet.erro": "Error",

  // Rejection dialog
  "pc.propostaDet.rejeitar.titulo": "Reject proposal",
  "pc.propostaDet.rejeitar.descricao": "Please tell us why you are rejecting it, to help us improve.",
  "pc.propostaDet.rejeitar.motivo": "Reason",
  "pc.propostaDet.rejeitar.motivoPlaceholder": "Select a reason",
  "pc.propostaDet.rejeitar.comentario": "Comment (optional)",
  "pc.propostaDet.rejeitar.comentarioPlaceholder": "Add a comment...",
  "pc.propostaDet.rejeitar.cancelar": "Cancel",
  "pc.propostaDet.rejeitar.confirmar": "Confirm rejection",
  "pc.propostaDet.rejeitar.feitaTitulo": "Proposal rejected",
  "pc.propostaDet.rejeitar.feitaTexto": "We are sorry to hear that. Thank you for your feedback.",

  // Question dialog
  "pc.propostaDet.duvida.titulo": "💬 I have questions",
  "pc.propostaDet.duvida.descricao":
    "Send your question to your sales representative. They will be notified and will get in touch with you.",
  "pc.propostaDet.duvida.placeholder": "Write your question or request for clarification...",
  "pc.propostaDet.duvida.cancelar": "Cancel",
  "pc.propostaDet.duvida.enviar": "Send question",
  "pc.propostaDet.duvida.enviadaTitulo": "Question sent!",
  "pc.propostaDet.duvida.enviadaTexto": "Your sales representative will be notified and will get in touch.",
};
