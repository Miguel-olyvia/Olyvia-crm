// Customer portal, contract detail (ClientPortalContractDetail.tsx), in English.
export const clienteEnContratoDet: Record<string, string> = {
  "pc.contratoDet.assinadoEm": "Signed on {data}",
  "pc.contratoDet.anuladoEm": "Cancelled on {data}",
  "pc.contratoDet.voltar": "Back",
  "pc.contratoDet.naoEncontrado": "Contract not found.",
  "pc.contratoDet.erro": "Error",
  "pc.contratoDet.tituloPadrao": "Contract",

  // Contract status (codes come from the database; only the label is translated)
  "pc.contratoDet.estado.draft": "Draft",
  "pc.contratoDet.estado.pending": "Awaiting decision",
  "pc.contratoDet.estado.sent": "Awaiting decision",
  "pc.contratoDet.estado.active": "Active",
  "pc.contratoDet.estado.signed": "Contract signed",
  "pc.contratoDet.estado.rejected": "Contract rejected",
  "pc.contratoDet.estado.expired": "Expired",
  "pc.contratoDet.estado.cancelled": "Cancelled",

  // Rejection reasons (label only: the value saved in the database is always the Portuguese text)
  "pc.contratoDet.motivo.condicoes": "Terms not suitable",
  "pc.contratoDet.motivo.precoAlto": "Price too high",
  "pc.contratoDet.motivo.alternativa": "I found an alternative",
  "pc.contratoDet.motivo.adiar": "I'll postpone",
  "pc.contratoDet.motivo.outro": "Other",

  // Status banners
  "pc.contratoDet.banner.decisaoTitulo": "Contract awaiting your decision",
  "pc.contratoDet.banner.decisaoTexto": "Review the contract below, then accept it or ask for changes.",
  "pc.contratoDet.banner.assinado": "✅ Contract signed",
  "pc.contratoDet.banner.assinadoPor": "Signed by:",
  "pc.contratoDet.banner.ip": "IP: {ip} • SMS OTP verification",
  "pc.contratoDet.banner.rejeitado": "❌ Contract rejected",
  "pc.contratoDet.banner.anulado": "🚫 Contract cancelled",
  "pc.contratoDet.banner.motivo": "Reason: {motivo}",
  "pc.contratoDet.banner.anuladoTexto":
    "This contract is no longer in force. If a replacement contract is sent to you, you will receive that notification separately.",

  // Contract details
  "pc.contratoDet.dados.titulo": "Contract {numero}",
  "pc.contratoDet.dados.numero": "Number",
  "pc.contratoDet.dados.valor": "Value",
  "pc.contratoDet.dados.inicio": "Start",
  "pc.contratoDet.dados.fim": "End",

  // Contract body and PDF
  "pc.contratoDet.corpo.titulo": "Contract Body",
  "pc.contratoDet.corpo.descarregarPdf": "Download PDF",
  "pc.contratoDet.corpo.aGerar": "Generating…",
  "pc.contratoDet.pdf.naoGerar": "Could not generate the PDF",
  "pc.contratoDet.pdf.semOrganizacao": "Contract with no associated organisation.",
  "pc.contratoDet.pdf.semConteudo": "This contract has no content yet.",
  "pc.contratoDet.pdf.erroTitulo": "Error generating the PDF",
  "pc.contratoDet.pdf.tenteNovamente": "Please try again.",

  // Attachments
  "pc.contratoDet.anexos.titulo": "Attached Documents",
  "pc.contratoDet.anexos.descarregar": "Download",
  "pc.contratoDet.anexos.erroDescarregar": "Error downloading",

  // SMS verification
  "pc.contratoDet.sms.titulo": "SMS Verification",
  "pc.contratoDet.sms.descricao": "To accept this contract, we will send a verification code by SMS to your mobile phone.",
  "pc.contratoDet.sms.enviarCodigo": "Send SMS code",
  "pc.contratoDet.sms.aEnviar": "Sending SMS code...",
  "pc.contratoDet.sms.codigoEnviadoPara": "Code sent to",
  "pc.contratoDet.sms.validade": "Valid for 5 minutes",
  "pc.contratoDet.sms.reenviar": "Resend code",
  "pc.contratoDet.otp.aguarde": "Please wait 1 minute before requesting a new code.",
  "pc.contratoDet.sms.verificar": "Verify",
  "pc.contratoDet.sms.aVerificar": "Verifying code and signing contract...",
  "pc.contratoDet.sms.verificado": "Code verified! Contract signed successfully.",
  "pc.contratoDet.sms.semTelefone": "No phone number was found linked to your account. Please contact your sales contact.",
  "pc.contratoDet.sms.enviadoTitulo": "SMS code sent",
  "pc.contratoDet.sms.enviadoTexto": "We sent a code to {telefone}",
  "pc.contratoDet.sms.erroEnviar": "Error sending SMS",
  "pc.contratoDet.sms.codigoInvalido": "Invalid code",
  "pc.contratoDet.assinatura.sucessoTitulo": "Contract signed successfully! 🎉",
  "pc.contratoDet.assinatura.sucessoTexto": "Thank you for your confirmation.",
  "pc.contratoDet.assinatura.erroTitulo": "Error signing",

  // Read and accept (before the code)
  "pc.contratoDet.leitura.titulo": "Have you read the contract and do you accept its terms?",
  "pc.contratoDet.leitura.descricao":
    "By signing, you accept contract {numero} as written above. Next we will send a code by SMS to confirm the signature.",
  "pc.contratoDet.leitura.caixa": "I have read the contract and accept its terms and conditions.",
  "pc.contratoDet.leitura.voltar": "Back to the contract",
  "pc.contratoDet.leitura.assinar": "Sign and receive the code",

  // Decision buttons
  "pc.contratoDet.decisao.titulo": "Ready to go ahead?",
  "pc.contratoDet.decisao.texto": "Accept the contract by SMS or ask for changes.",
  "pc.contratoDet.decisao.duvidas": "💬 I have questions",
  "pc.contratoDet.decisao.rejeitar": "✕ Reject",
  "pc.contratoDet.decisao.aceitar": "Accept and Sign",

  // Rejection dialog
  "pc.contratoDet.rejeitar.titulo": "Reject Contract",
  "pc.contratoDet.rejeitar.descricao": "Please tell us why you are rejecting it.",
  "pc.contratoDet.rejeitar.motivo": "Reason",
  "pc.contratoDet.rejeitar.motivoPlaceholder": "Select a reason",
  "pc.contratoDet.rejeitar.comentario": "Comment (optional)",
  "pc.contratoDet.rejeitar.comentarioPlaceholder": "Add a comment...",
  "pc.contratoDet.rejeitar.cancelar": "Cancel",
  "pc.contratoDet.rejeitar.confirmar": "Confirm Rejection",
  "pc.contratoDet.rejeitar.feitoTitulo": "Contract rejected",
  "pc.contratoDet.rejeitar.feitoTexto": "Thank you for your feedback.",

  // Question dialog
  "pc.contratoDet.duvida.titulo": "💬 I have questions",
  "pc.contratoDet.duvida.descricao": "Send your question to the sales contact in charge.",
  "pc.contratoDet.duvida.placeholder": "Write your question...",
  "pc.contratoDet.duvida.cancelar": "Cancel",
  "pc.contratoDet.duvida.enviar": "Send Question",
  "pc.contratoDet.duvida.enviadaTitulo": "Question sent!",
  "pc.contratoDet.duvida.enviadaTexto": "Your sales contact will be notified and will get in touch.",
};
