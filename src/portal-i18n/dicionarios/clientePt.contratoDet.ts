// Portal do cliente, detalhe do contrato (ClientPortalContractDetail.tsx), em português.
export const clientePtContratoDet: Record<string, string> = {
  "pc.contratoDet.assinadoEm": "Assinado em {data}",
  "pc.contratoDet.anuladoEm": "Anulado em {data}",
  "pc.contratoDet.voltar": "Voltar",
  "pc.contratoDet.naoEncontrado": "Contrato não encontrado.",
  "pc.contratoDet.erro": "Erro",

  // Estado do contrato
  "pc.contratoDet.estado.draft": "Rascunho",
  "pc.contratoDet.estado.pending": "A aguardar decisão",
  "pc.contratoDet.estado.sent": "A aguardar decisão",
  "pc.contratoDet.estado.active": "Ativo",
  "pc.contratoDet.estado.signed": "Contrato assinado",
  "pc.contratoDet.estado.rejected": "Contrato rejeitado",
  "pc.contratoDet.estado.expired": "Expirado",
  "pc.contratoDet.estado.cancelled": "Anulado",

  // Motivos de rejeição (só a etiqueta: o valor gravado na base é sempre o texto português)
  "pc.contratoDet.motivo.condicoes": "Condições não adequadas",
  "pc.contratoDet.motivo.precoAlto": "Preço alto",
  "pc.contratoDet.motivo.alternativa": "Encontrei alternativa",
  "pc.contratoDet.motivo.adiar": "Vou adiar",
  "pc.contratoDet.motivo.outro": "Outro",

  // Faixas de estado
  "pc.contratoDet.banner.decisaoTitulo": "Contrato aguarda a sua decisão",
  "pc.contratoDet.banner.decisaoTexto": "Reveja o contrato abaixo, aceite ou peça alterações.",
  "pc.contratoDet.banner.assinado": "✅ Contrato assinado",
  "pc.contratoDet.banner.assinadoPor": "Assinado por:",
  "pc.contratoDet.banner.ip": "IP: {ip} • Verificação por SMS OTP",
  "pc.contratoDet.banner.rejeitado": "❌ Contrato rejeitado",
  "pc.contratoDet.banner.anulado": "🚫 Contrato anulado",
  "pc.contratoDet.banner.motivo": "Motivo: {motivo}",
  "pc.contratoDet.banner.anuladoTexto":
    "Este contrato deixou de estar em vigor. Se lhe for enviado um contrato substituto, encontrará essa notificação separadamente.",

  // Dados do contrato
  "pc.contratoDet.dados.titulo": "Contrato {numero}",
  "pc.contratoDet.dados.numero": "Número",
  "pc.contratoDet.dados.valor": "Valor",
  "pc.contratoDet.dados.inicio": "Início",
  "pc.contratoDet.dados.fim": "Fim",

  // Corpo do contrato e PDF
  "pc.contratoDet.corpo.titulo": "Corpo do Contrato",
  "pc.contratoDet.corpo.descarregarPdf": "Descarregar PDF",
  "pc.contratoDet.corpo.aGerar": "A gerar…",
  // Seletor de versão (só quando o contrato tem mais de um idioma): nome acessível do grupo PT | EN
  "pc.contratoDet.idioma.rotulo": "Idioma do contrato",
  "pc.contratoDet.pdf.nomePadrao": "Contrato",
  "pc.contratoDet.pdf.naoGerar": "Não foi possível gerar o PDF",
  "pc.contratoDet.pdf.semOrganizacao": "Contrato sem organização associada.",
  "pc.contratoDet.pdf.semConteudo": "Este contrato ainda não tem conteúdo.",
  "pc.contratoDet.pdf.erroTitulo": "Erro ao gerar o PDF",
  "pc.contratoDet.pdf.tenteNovamente": "Tente novamente.",

  // Anexos
  "pc.contratoDet.anexos.titulo": "Documentos Anexos",
  "pc.contratoDet.anexos.descarregar": "Descarregar",
  "pc.contratoDet.anexos.erroDescarregar": "Erro ao descarregar",

  // Verificação por SMS
  "pc.contratoDet.sms.titulo": "Verificação por SMS",
  "pc.contratoDet.sms.descricao": "Para aceitar este contrato, enviaremos um código de verificação por SMS para o seu telemóvel.",
  "pc.contratoDet.sms.enviarCodigo": "Enviar código SMS",
  "pc.contratoDet.sms.aEnviar": "A enviar código SMS...",
  "pc.contratoDet.sms.codigoEnviadoPara": "Código enviado para",
  "pc.contratoDet.sms.validade": "Válido por 5 minutos",
  "pc.contratoDet.sms.reenviar": "Reenviar código",
  "pc.contratoDet.otp.aguarde": "Aguarde 1 minuto antes de pedir um novo código.",
  "pc.contratoDet.sms.verificar": "Verificar",
  "pc.contratoDet.sms.aVerificar": "A verificar código e assinar contrato...",
  "pc.contratoDet.sms.verificado": "Código verificado! Contrato assinado com sucesso.",
  "pc.contratoDet.sms.semTelefone": "Não foi encontrado um número de telefone associado à sua conta. Contacte o comercial.",
  "pc.contratoDet.sms.enviadoTitulo": "Código SMS enviado",
  "pc.contratoDet.sms.enviadoTexto": "Enviámos um código para {telefone}",
  "pc.contratoDet.sms.erroEnviar": "Erro ao enviar SMS",
  "pc.contratoDet.sms.codigoInvalido": "Código inválido",
  "pc.contratoDet.assinatura.sucessoTitulo": "Contrato assinado com sucesso! 🎉",
  "pc.contratoDet.assinatura.sucessoTexto": "Obrigado pela sua confirmação.",
  "pc.contratoDet.assinatura.erroTitulo": "Erro ao assinar",

  // Botões de decisão
  "pc.contratoDet.decisao.titulo": "Pronto para avançar?",
  "pc.contratoDet.decisao.texto": "Aceite o contrato via SMS ou solicite alterações.",
  "pc.contratoDet.decisao.duvidas": "💬 Tenho dúvidas",
  "pc.contratoDet.decisao.rejeitar": "✕ Rejeitar",
  "pc.contratoDet.decisao.aceitar": "Aceitar e Assinar",

  // Diálogo de rejeição
  "pc.contratoDet.rejeitar.titulo": "Rejeitar Contrato",
  "pc.contratoDet.rejeitar.descricao": "Indique o motivo da rejeição.",
  "pc.contratoDet.rejeitar.motivo": "Motivo",
  "pc.contratoDet.rejeitar.motivoPlaceholder": "Selecione um motivo",
  "pc.contratoDet.rejeitar.comentario": "Comentário (opcional)",
  "pc.contratoDet.rejeitar.comentarioPlaceholder": "Adicione um comentário...",
  "pc.contratoDet.rejeitar.cancelar": "Cancelar",
  "pc.contratoDet.rejeitar.confirmar": "Confirmar Rejeição",
  "pc.contratoDet.rejeitar.feitoTitulo": "Contrato rejeitado",
  "pc.contratoDet.rejeitar.feitoTexto": "Obrigado pelo seu feedback.",

  // Diálogo de dúvida
  "pc.contratoDet.duvida.titulo": "💬 Tenho dúvidas",
  "pc.contratoDet.duvida.descricao": "Envie a sua dúvida ao comercial responsável.",
  "pc.contratoDet.duvida.placeholder": "Escreva a sua dúvida...",
  "pc.contratoDet.duvida.cancelar": "Cancelar",
  "pc.contratoDet.duvida.enviar": "Enviar Dúvida",
  "pc.contratoDet.duvida.enviadaTitulo": "Dúvida enviada!",
  "pc.contratoDet.duvida.enviadaTexto": "O comercial será notificado e entrará em contacto.",
};
