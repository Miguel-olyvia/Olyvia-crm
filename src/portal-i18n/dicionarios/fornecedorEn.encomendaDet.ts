// Supplier portal, order detail (sp.encomendaDet.*) and confirmation dialog (sp.encomendaDet.confirmar.*).
export const fornecedorEnEncomendaDet: Record<string, string> = {
  "sp.encomendaDet.aCarregar": "Loading order…",
  "sp.encomendaDet.naoDisponivel.titulo": "Order not available",
  "sp.encomendaDet.naoDisponivel.texto":
    "This order does not exist, was withdrawn from the portal by the company, or you no longer have access to it.",
  "sp.encomendaDet.naoAbre": "The order could not be opened",
  "sp.encomendaDet.voltarLista": "Back to orders",
  "sp.encomendaDet.voltar": "Orders",
  "sp.encomendaDet.titulo": "Order {numero}",

  "sp.encomendaDet.descarregarPdf": "Download PDF",
  "sp.encomendaDet.aGerarPdf": "Generating PDF…",
  "sp.encomendaDet.confirmar": "Confirm order",
  "sp.encomendaDet.expedir": "Ship order",
  "sp.encomendaDet.pdfErro": "The PDF could not be generated",
  "sp.encomendaDet.tenteNovamente": "Please try again.",

  "sp.encomendaDet.alterada.titulo": "The order has changed",
  "sp.encomendaDet.alterada.toast": "The company changed the order. Review it before confirming.",
  "sp.encomendaDet.alterada.texto":
    "The company changed the order while you were confirming it. Review the lines below before confirming.",
  "sp.encomendaDet.versao":
    "The company has updated this order (version {n}, sent on {data}). Review the lines before confirming.",

  "sp.encomendaDet.confirmadaEm": "Confirmed on {data}",
  "sp.encomendaDet.confirmadaPor": " by {nome}",
  "sp.encomendaDet.entregaPrevistaAviso": " · expected delivery {data}",
  "sp.encomendaDet.comentario": "Comment: {texto}",
  "sp.encomendaDet.dataAceite": "The company accepted the expected delivery date.",
  "sp.encomendaDet.jaRecebida": "This order has already been received by the company.",
  "sp.encomendaDet.jaCancelada": "This order was cancelled by the company.",

  "sp.encomendaDet.sla.ultrapassado": "Delivery deadline (SLA) exceeded",
  "sp.encomendaDet.sla.atrasoSemContrato": "The deadline was {data} · {dias} late compared with the date you gave.",
  "sp.encomendaDet.sla.atrasoComContrato":
    "The deadline was {data} ({origem}) · {dias} late. The breach is recorded in the SLA of the contract with the company.",
  "sp.encomendaDet.sla.risco": "Attention: this order is close to missing its delivery deadline (SLA)",
  "sp.encomendaDet.sla.riscoHoje": "Deadline: {data} · expires today ({origem}).",
  "sp.encomendaDet.sla.riscoFaltam": "Deadline: {data} · {dias} left ({origem}).",

  "sp.encomendaDet.cartao.encomenda": "Order",
  "sp.encomendaDet.campo.numero": "Number",
  "sp.encomendaDet.campo.dataEncomenda": "Order date",
  "sp.encomendaDet.campo.entregaPedida": "Requested delivery",
  "sp.encomendaDet.campo.enviadaEm": "Sent on",
  "sp.encomendaDet.campo.vistaEm": "Viewed on",
  "sp.encomendaDet.campo.responsavel": "Contact person",
  "sp.encomendaDet.cartao.empresa": "Company",
  "sp.encomendaDet.campo.nome": "Name",
  "sp.encomendaDet.campo.nif": "Tax ID",
  "sp.encomendaDet.campo.morada": "Address",
  "sp.encomendaDet.campo.telefone": "Phone",
  "sp.encomendaDet.notas": "Notes from the company",

  "sp.encomendaDet.linhas": "Lines ({n})",
  "sp.encomendaDet.coluna.referencia": "Reference",
  "sp.encomendaDet.coluna.descricao": "Description",
  "sp.encomendaDet.coluna.qtd": "Qty.",
  "sp.encomendaDet.coluna.precoUnit": "Unit price",
  "sp.encomendaDet.coluna.iva": "VAT",
  "sp.encomendaDet.coluna.total": "Total",
  "sp.encomendaDet.coluna.recebido": "Received",
  "sp.encomendaDet.nossaRef": "Our ref.: {ref}",
  "sp.encomendaDet.subtotal": "Subtotal (excl. VAT)",
  "sp.encomendaDet.iva": "VAT",
  "sp.encomendaDet.total": "Total",

  "sp.encomendaDet.expedicoesErro": "The shipments could not be read",

  // Shipping: messages after shipping
  "sp.encomendaDet.expedida.jaRegistada": "Shipment already recorded",
  "sp.encomendaDet.expedida.titulo": "Order shipped",
  "sp.encomendaDet.expedida.guia.um": "Delivery note {guia} · {n} line.",
  "sp.encomendaDet.expedida.guia.varios": "Delivery note {guia} · {n} lines.",
  "sp.encomendaDet.expedida.anexado": "Delivery note file attached",
  "sp.encomendaDet.expedida.anexoFalhou": "The delivery note was recorded, but the file was not attached",
  "sp.encomendaDet.expedida.anexoTente": "Try attaching it again.",
  "sp.encomendaDet.expedirErro.stale": "Order updated by the company",
  "sp.encomendaDet.expedirErro.guiaRepetida": "Duplicate delivery note",
  "sp.encomendaDet.expedirErro.fechada": "Shipping is no longer possible",
  "sp.encomendaDet.expedirErro.geral": "The order could not be shipped",

  // Confirmation: messages after confirming
  "sp.encomendaDet.confirmada.jaEstava": "Order was already confirmed",
  "sp.encomendaDet.confirmada.titulo": "Order confirmed",
  "sp.encomendaDet.confirmada.entregaPrevista": "Expected delivery: {data}.",
  "sp.encomendaDet.confirmada.empresaAvisada": "The company has been notified.",
  "sp.encomendaDet.confirmarErro.stale": "Order updated by the company",
  "sp.encomendaDet.confirmarErro.fechada": "Confirming is no longer possible",
  "sp.encomendaDet.confirmarErro.geral": "The order could not be confirmed",

  // Confirmation dialog
  "sp.encomendaDet.confirmar.titulo": "Confirm order {numero}",
  "sp.encomendaDet.confirmar.descricao":
    "{empresa} is notified of the confirmation. Once confirmed, the date and the comment can no longer be changed here.",
  "sp.encomendaDet.confirmar.data": "Expected delivery date (optional)",
  "sp.encomendaDet.confirmar.dataInvalida": "Invalid date.",
  "sp.encomendaDet.confirmar.dataAntes": "The date cannot be earlier than {data}.",
  "sp.encomendaDet.confirmar.dataDepois": "The date cannot be later than {data}.",
  "sp.encomendaDet.confirmar.empresaPediu": "The company asked for delivery by {data}.",
  "sp.encomendaDet.confirmar.empresaNaoIndicou": "The company did not give a delivery date.",
  "sp.encomendaDet.confirmar.comentario": "Comment (optional)",
  "sp.encomendaDet.confirmar.comentarioPlaceholder": "E.g. delivery in two parts, item X with a longer lead time…",
  "sp.encomendaDet.confirmar.cancelar": "Cancel",
  "sp.encomendaDet.confirmar.botao": "Confirm order",
};
