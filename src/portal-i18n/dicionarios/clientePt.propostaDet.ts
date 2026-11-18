// Portal do cliente, detalhe da proposta (ClientPortalProposalDetail.tsx), em português.
export const clientePtPropostaDet: Record<string, string> = {
  "pc.propostaDet.voltar": "Voltar",
  "pc.propostaDet.naoEncontrada": "Proposta não encontrada.",

  // Estado da proposta
  "pc.propostaDet.estado.aguardaDecisao": "A aguardar decisão",
  "pc.propostaDet.estado.rascunho": "Rascunho",
  "pc.propostaDet.estado.aceite": "Proposta aceite",
  "pc.propostaDet.estado.rejeitada": "Proposta rejeitada",
  "pc.propostaDet.estado.expirada": "Proposta expirada",

  // Motivos de rejeição (só a etiqueta: o valor gravado na base é sempre o texto português)
  "pc.propostaDet.motivo.precoAlto": "Preço alto",
  "pc.propostaDet.motivo.alternativa": "Encontrei alternativa",
  "pc.propostaDet.motivo.naoPreciso": "Já não preciso",
  "pc.propostaDet.motivo.prazo": "Prazo não serve",
  "pc.propostaDet.motivo.adiar": "Vou adiar",
  "pc.propostaDet.motivo.outro": "Outro",

  // Anexos
  "pc.propostaDet.anexos.titulo": "Documentos anexos ({n})",
  "pc.propostaDet.anexos.descarregar": "Descarregar",
  "pc.propostaDet.anexos.erroDescarregar": "Erro ao descarregar",

  // Orçamentos
  "pc.propostaDet.orcamento.aceiteTitulo": "Orçamento aceite",
  "pc.propostaDet.orcamento.aceiteTexto": "O orçamento foi aceite com sucesso.",
  "pc.propostaDet.orcamento.rejeitadoTitulo": "Orçamento rejeitado",
  "pc.propostaDet.orcamento.aceitePeloMenosUmTitulo": "Aceite pelo menos 1 orçamento",
  "pc.propostaDet.orcamento.aceitePeloMenosUmTexto": "Antes de assinar a proposta, aceite pelo menos um orçamento.",

  // Código SMS e assinatura
  "pc.propostaDet.sms.semTelefone": "Não foi encontrado um número de telefone associado à sua conta. Contacte o comercial.",
  "pc.propostaDet.sms.enviadoTitulo": "Código SMS enviado",
  "pc.propostaDet.sms.enviadoTexto": "Enviámos um código para {telefone}",
  "pc.propostaDet.sms.erroEnviar": "Erro ao enviar SMS",
  "pc.propostaDet.sms.codigoInvalidoTentar": "Código inválido. Tente novamente.",
  "pc.propostaDet.sms.codigoInvalido": "Código inválido",
  "pc.propostaDet.assinatura.erroGenerico": "Ocorreu um erro ao assinar a proposta. Tente novamente.",
  "pc.propostaDet.assinatura.sucessoTitulo": "Proposta assinada com sucesso! 🎉",
  "pc.propostaDet.assinatura.sucessoComercial": "Obrigado! O comercial {nome} irá contactá-lo brevemente.",
  "pc.propostaDet.assinatura.sucessoGenerico": "Obrigado! Entraremos em contacto brevemente.",
  "pc.propostaDet.assinatura.erroTitulo": "Erro ao assinar",

  // PDF
  "pc.propostaDet.pdf.formatoInesperado": "A resposta do servidor veio num formato inesperado. Contacta o suporte.",
  "pc.propostaDet.pdf.semConteudoTitulo": "Sem conteúdo para gerar o PDF",
  "pc.propostaDet.pdf.semConteudoTexto": "Esta proposta não tem orçamentos associados.",
  "pc.propostaDet.pdf.erroTitulo": "Erro ao gerar PDF",

  // Erro genérico
  "pc.propostaDet.erro": "Erro",

  // Diálogo de rejeição
  "pc.propostaDet.rejeitar.titulo": "Rejeitar Proposta",
  "pc.propostaDet.rejeitar.descricao": "Indique o motivo da rejeição para nos ajudar a melhorar.",
  "pc.propostaDet.rejeitar.motivo": "Motivo",
  "pc.propostaDet.rejeitar.motivoPlaceholder": "Selecione um motivo",
  "pc.propostaDet.rejeitar.comentario": "Comentário (opcional)",
  "pc.propostaDet.rejeitar.comentarioPlaceholder": "Adicione um comentário...",
  "pc.propostaDet.rejeitar.cancelar": "Cancelar",
  "pc.propostaDet.rejeitar.confirmar": "Confirmar Rejeição",
  "pc.propostaDet.rejeitar.feitaTitulo": "Proposta rejeitada",
  "pc.propostaDet.rejeitar.feitaTexto": "Lamentamos. Obrigado pelo seu feedback.",

  // Diálogo de dúvida
  "pc.propostaDet.duvida.titulo": "💬 Tenho dúvidas",
  "pc.propostaDet.duvida.descricao": "Envie a sua dúvida ao comercial responsável. Será notificado e entrará em contacto consigo.",
  "pc.propostaDet.duvida.placeholder": "Escreva a sua dúvida ou pedido de esclarecimento...",
  "pc.propostaDet.duvida.cancelar": "Cancelar",
  "pc.propostaDet.duvida.enviar": "Enviar Dúvida",
  "pc.propostaDet.duvida.enviadaTitulo": "Dúvida enviada!",
  "pc.propostaDet.duvida.enviadaTexto": "O comercial será notificado e entrará em contacto.",
};
