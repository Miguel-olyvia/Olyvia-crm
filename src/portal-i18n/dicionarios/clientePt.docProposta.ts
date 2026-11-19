// Textos do documento da proposta (ProposalPortalDocument), em português. Chaves `pc.docProposta.*`.
// O português é IDÊNTICO ao que o componente sempre mostrou: o CRM (pré-visualização) usa-o por omissão.
// Conteúdo escrito pela organização (termos, rodapé, descrição, títulos de secção personalizados) não passa por aqui.
export const clientePtDocProposta: Record<string, string> = {
  // Estado por omissão e rótulos gerais
  "pc.docProposta.estadoOmissao": "A aguardar decisão",
  "pc.docProposta.baixarPdf": "Download PDF",
  "pc.docProposta.itens": "Itens",
  "pc.docProposta.taxaServico": "Taxa de Serviço",

  // Secções por omissão (só quando o template não define o título)
  "pc.docProposta.secao.cabecalho": "Cabeçalho",
  "pc.docProposta.secao.tituloProposta": "PROPOSTA",
  "pc.docProposta.secao.empresa": "Empresa",
  "pc.docProposta.secao.infoEmpresa": "Info da Empresa",
  "pc.docProposta.secao.cliente": "Cliente",
  "pc.docProposta.secao.detalhes": "Detalhes do Orçamento",
  "pc.docProposta.secao.condicoes": "Condições Gerais",
  "pc.docProposta.secao.rodape": "Rodapé",
  "pc.docProposta.secao.descricao": "Descrição do trabalho",
  "pc.docProposta.secao.notas": "Notas",
  "pc.docProposta.secao.validade": "Validade",
  "pc.docProposta.secao.validadeAte": "Válida até",
  "pc.docProposta.validadeTexto": "Proposta válida até <strong>{data}</strong>.",

  // Tabela de linhas
  "pc.docProposta.tabela.item": "Item",
  "pc.docProposta.tabela.qtd": "QTD",
  "pc.docProposta.tabela.precoUnit": "Preço Unit.",
  "pc.docProposta.tabela.total": "Total",

  // Subtotais, descontos e IVA
  "pc.docProposta.totais.subtotal": "Subtotal",
  "pc.docProposta.totais.subtotalTodasSecoes": "Subtotal (todas as secções)",
  "pc.docProposta.totais.subtotalSemIva": "Subtotal (sem IVA)",
  "pc.docProposta.totais.descontoGlobal": "Desconto global ({percentagem}%)",
  "pc.docProposta.totais.iva": "IVA ({taxa}%)",
  "pc.docProposta.totais.ivaTaxa": "IVA {taxa}%",
  "pc.docProposta.totais.ivaTaxaTraco": "IVA ({taxa}%) — {nome}",
  "pc.docProposta.totais.ivaTaxaParenteses": "IVA {taxa}% ({nome})",
  "pc.docProposta.totais.ivaTotal": "IVA Total",
  "pc.docProposta.totais.totalGeral": "Total Geral (c/ IVA)",
  "pc.docProposta.totais.totalOrcamento": "Total do Orçamento {numero}",

  // Orçamentos e secções (seleção)
  "pc.docProposta.orcamento.titulo": "Orçamento {numero}",
  "pc.docProposta.orcamento.selecionado": "✓ Orçamento selecionado",
  "pc.docProposta.orcamento.selecionar": "Selecionar este orçamento",
  "pc.docProposta.orcamento.selecionadoParaAceitar": "✓ Selecionado para aceitação",
  "pc.docProposta.orcamento.desmarcarParaExcluir": "Desmarque para excluir este orçamento",
  "pc.docProposta.orcamento.aceite": "✅ Orçamento aceite",
  "pc.docProposta.orcamento.rejeitado": "❌ Orçamento rejeitado",
  "pc.docProposta.secaoSelecionada": "✓ Selecionado",
  "pc.docProposta.secaoNaoSelecionada": "Não selecionado",

  // Faixas de decisão
  "pc.docProposta.decisao.titulo": "Proposta aguarda a sua decisão",
  "pc.docProposta.decisao.texto": "Reveja os orçamentos abaixo, aceite ou peça alterações.",
  "pc.docProposta.decisao.validaAte": "Proposta válida até",
  "pc.docProposta.aceite.titulo": "✅ Proposta aceite",
  "pc.docProposta.aceite.em": "Aceite em {data}",
  "pc.docProposta.aceite.ip": "IP: {ip} • Verificação por SMS OTP",
  "pc.docProposta.rejeitada.titulo": "❌ Proposta rejeitada",
  "pc.docProposta.rejeitada.em": "Rejeitada em {data}",

  // Cartão da proposta
  "pc.docProposta.cartao.titulo": "Proposta — {titulo}",
  "pc.docProposta.cartao.criada": "{numero} · Criada a {data}",
  "pc.docProposta.cartao.valorTotal": "Valor Total",
  "pc.docProposta.cartao.subtotalSemIva": "Subtotal (s/ IVA)",
  "pc.docProposta.cartao.validaAte": "Válida até",
  "pc.docProposta.cartao.comercial": "Comercial",

  // Verificação por SMS
  "pc.docProposta.otp.titulo": "Verificação por SMS",
  "pc.docProposta.otp.intro": "Para aceitar esta proposta, enviaremos um código de verificação por SMS para o seu telemóvel.",
  "pc.docProposta.otp.enviar": "Enviar código SMS",
  "pc.docProposta.otp.aEnviar": "A enviar código SMS...",
  "pc.docProposta.otp.enviadoPara": "Código enviado para",
  "pc.docProposta.otp.validade": "Válido por 5 minutos",
  "pc.docProposta.otp.reenviar": "Reenviar código",
  "pc.docProposta.otp.aguarde": "Aguarde 1 minuto antes de pedir um novo código.",
  "pc.docProposta.otp.verificar": "Verificar",
  "pc.docProposta.otp.aVerificar": "A verificar código e assinar proposta...",
  "pc.docProposta.otp.verificado": "Código verificado! Proposta aceite com sucesso.",

  // Ações no fundo
  "pc.docProposta.acao.pronto": "Pronto para avançar?",
  "pc.docProposta.acao.selecioneOrcamentos": "Selecione os orçamentos que pretende aceitar e confirme via SMS.",
  "pc.docProposta.acao.orcamentosSelecionados": "{n} de {total} orçamentos selecionados",
  "pc.docProposta.acao.secoesSelecionadas": "{n} de {total} secções selecionadas",
  "pc.docProposta.acao.aceiteOuAltere": "Aceite a proposta via SMS ou solicite alterações.",
  "pc.docProposta.acao.duvidas": "💬 Tenho dúvidas",
  "pc.docProposta.acao.rejeitar": "✕ Rejeitar",
  "pc.docProposta.acao.aceitarAssinar": "Aceitar e Assinar",
  "pc.docProposta.acao.selecionePeloMenos": "Selecione pelo menos um {tipo} para poder aceitar a proposta.",
  "pc.docProposta.acao.tipoSecao": "secção",
  "pc.docProposta.acao.tipoOrcamento": "orçamento",

  // Rodapé
  "pc.docProposta.rodape.enviadaPor": "Proposta enviada por",
  "pc.docProposta.rodape.duvidas": "Dúvidas? Contacte {nome}",
  "pc.docProposta.preview.aviso": "Os botões de ação estão desativados neste preview.",
};
