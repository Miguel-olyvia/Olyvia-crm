// Proposal document texts (ProposalPortalDocument), in English. `pc.docProposta.*` keys.
// Every key must also exist in `clientePt.docProposta.ts`, with the same {placeholders}.
// Content written by the organisation (terms, footer, description, custom section titles) never goes through here.
export const clienteEnDocProposta: Record<string, string> = {
  // Default status and general labels
  "pc.docProposta.estadoOmissao": "Awaiting decision",
  "pc.docProposta.baixarPdf": "Download PDF",
  "pc.docProposta.itens": "Items",
  "pc.docProposta.taxaServico": "Service fee",

  // Default sections (only when the template does not set the title)
  "pc.docProposta.secao.cabecalho": "Header",
  "pc.docProposta.secao.tituloProposta": "PROPOSAL",
  "pc.docProposta.secao.empresa": "Company",
  "pc.docProposta.secao.infoEmpresa": "Company info",
  "pc.docProposta.secao.cliente": "Customer",
  "pc.docProposta.secao.detalhes": "Quote details",
  "pc.docProposta.secao.condicoes": "General terms",
  "pc.docProposta.secao.rodape": "Footer",
  "pc.docProposta.secao.descricao": "Description of the work",
  "pc.docProposta.secao.notas": "Notes",
  "pc.docProposta.secao.validade": "Validity",
  "pc.docProposta.secao.validadeAte": "Valid until",
  "pc.docProposta.validadeTexto": "Proposal valid until <strong>{data}</strong>.",

  // Line table
  "pc.docProposta.tabela.item": "Item",
  "pc.docProposta.tabela.qtd": "QTY",
  "pc.docProposta.tabela.precoUnit": "Unit price",
  "pc.docProposta.tabela.total": "Total",

  // Subtotals, discounts and VAT
  "pc.docProposta.totais.subtotal": "Subtotal",
  "pc.docProposta.totais.subtotalTodasSecoes": "Subtotal (all sections)",
  "pc.docProposta.totais.subtotalSemIva": "Subtotal (excl. VAT)",
  "pc.docProposta.totais.descontoGlobal": "Global discount ({percentagem}%)",
  "pc.docProposta.totais.iva": "VAT ({taxa}%)",
  "pc.docProposta.totais.ivaTaxa": "VAT {taxa}%",
  "pc.docProposta.totais.ivaTaxaTraco": "VAT ({taxa}%) — {nome}",
  "pc.docProposta.totais.ivaTaxaParenteses": "VAT {taxa}% ({nome})",
  "pc.docProposta.totais.ivaTotal": "Total VAT",
  "pc.docProposta.totais.totalGeral": "Grand total (incl. VAT)",
  "pc.docProposta.totais.totalOrcamento": "Quote total {numero}",

  // Quotes and sections (selection)
  "pc.docProposta.orcamento.titulo": "Quote {numero}",
  "pc.docProposta.orcamento.selecionado": "✓ Quote selected",
  "pc.docProposta.orcamento.selecionar": "Select this quote",
  "pc.docProposta.orcamento.selecionadoParaAceitar": "✓ Selected for acceptance",
  "pc.docProposta.orcamento.desmarcarParaExcluir": "Untick to exclude this quote",
  "pc.docProposta.orcamento.aceite": "✅ Quote accepted",
  "pc.docProposta.orcamento.rejeitado": "❌ Quote rejected",
  "pc.docProposta.secaoSelecionada": "✓ Selected",
  "pc.docProposta.secaoNaoSelecionada": "Not selected",

  // Decision banners
  "pc.docProposta.decisao.titulo": "Proposal awaiting your decision",
  "pc.docProposta.decisao.texto": "Review the quotes below, then accept or request changes.",
  "pc.docProposta.decisao.validaAte": "Proposal valid until",
  "pc.docProposta.aceite.titulo": "✅ Proposal accepted",
  "pc.docProposta.aceite.em": "Accepted on {data}",
  "pc.docProposta.aceite.ip": "IP: {ip} • Verified by SMS OTP",
  "pc.docProposta.rejeitada.titulo": "❌ Proposal rejected",
  "pc.docProposta.rejeitada.em": "Rejected on {data}",

  // Proposal card
  "pc.docProposta.cartao.titulo": "Proposal — {titulo}",
  "pc.docProposta.cartao.criada": "{numero} · Created on {data}",
  "pc.docProposta.cartao.valorTotal": "Total value",
  "pc.docProposta.cartao.subtotalSemIva": "Subtotal (excl. VAT)",
  "pc.docProposta.cartao.validaAte": "Valid until",
  "pc.docProposta.cartao.comercial": "Sales representative",

  // SMS verification
  "pc.docProposta.otp.titulo": "SMS verification",
  "pc.docProposta.otp.intro": "To accept this proposal, we will send a verification code by SMS to your mobile phone.",
  "pc.docProposta.otp.enviar": "Send SMS code",
  "pc.docProposta.otp.aEnviar": "Sending SMS code...",
  "pc.docProposta.otp.enviadoPara": "Code sent to",
  "pc.docProposta.otp.validade": "Valid for 5 minutes",
  "pc.docProposta.otp.reenviar": "Resend code",
  "pc.docProposta.otp.aguarde": "Please wait 1 minute before requesting a new code.",
  "pc.docProposta.otp.verificar": "Verify",
  "pc.docProposta.otp.aVerificar": "Verifying code and signing the proposal...",
  "pc.docProposta.otp.verificado": "Code verified! Proposal accepted successfully.",

  // Actions at the bottom
  "pc.docProposta.acao.pronto": "Ready to move forward?",
  "pc.docProposta.acao.selecioneOrcamentos": "Select the quotes you want to accept and confirm via SMS.",
  "pc.docProposta.acao.orcamentosSelecionados": "{n} of {total} quotes selected",
  "pc.docProposta.acao.secoesSelecionadas": "{n} of {total} sections selected",
  "pc.docProposta.acao.aceiteOuAltere": "Accept the proposal via SMS or request changes.",
  "pc.docProposta.acao.duvidas": "💬 I have questions",
  "pc.docProposta.acao.rejeitar": "✕ Reject",
  "pc.docProposta.acao.aceitarAssinar": "Accept and Sign",
  "pc.docProposta.acao.selecionePeloMenos": "Select at least one {tipo} to be able to accept the proposal.",
  "pc.docProposta.acao.tipoSecao": "section",
  "pc.docProposta.acao.tipoOrcamento": "quote",

  // Footer
  "pc.docProposta.rodape.enviadaPor": "Proposal sent by",
  "pc.docProposta.rodape.duvidas": "Questions? Contact {nome}",
  "pc.docProposta.preview.aviso": "The action buttons are disabled in this preview.",
};
