// Rótulos fixos do PDF da proposta (QuotePDFDocument) em inglês. Mesmas chaves e mesmos marcadores {nome} que o
// português (há um teste de paridade). Só palavras: o dinheiro (€ e duas casas) e as datas numéricas não mudam.

export const DICIONARIO_PROPOSTA_EN: Record<string, string> = {
  // Título do documento, do bloco de detalhes e do bloco de valor, por tipo de documento
  "doc.proposta.titulo.orcamento": "QUOTE",
  "doc.proposta.titulo.proposta": "PROPOSAL",
  "doc.proposta.titulo.vendaDireta": "DIRECT SALE",
  "doc.proposta.detalhes.orcamento": "QUOTE DETAILS",
  "doc.proposta.detalhes.proposta": "PROPOSAL DETAILS",
  "doc.proposta.detalhes.vendaDireta": "DIRECT SALE DETAILS",
  "doc.proposta.valor.orcamento": "QUOTE VALUE",
  "doc.proposta.valor.proposta": "PROPOSAL VALUE",
  "doc.proposta.valor.vendaDireta": "DIRECT SALE VALUE",

  // Títulos de secção por omissão (e os de fábrica que o editor de modelos grava em português)
  "doc.proposta.seccao.empresa": "COMPANY",
  "doc.proposta.seccao.cliente": "CUSTOMER",
  "doc.proposta.seccao.notas": "NOTES",
  "doc.proposta.seccao.condicoes": "GENERAL TERMS",
  "doc.proposta.seccao.validade": "VALIDITY",
  "doc.proposta.seccao.outra": "SECTION",
  "doc.proposta.seccao.geral": "General",

  // Cabeçalho e blocos de empresa e cliente
  "doc.proposta.data": "Date:",
  "doc.proposta.nome": "Name:",
  "doc.proposta.nif": "Tax ID:",
  "doc.proposta.email": "Email:",
  "doc.proposta.telefone": "Phone:",
  "doc.proposta.tel": "Tel:",
  "doc.proposta.morada": "Address:",
  "doc.proposta.moradaFiscal": "Tax address:",
  "doc.proposta.moradaEntrega": "Delivery address:",

  // Tabela de itens
  "doc.proposta.sku": "SKU",
  "doc.proposta.tabela.descricao": "Description",
  "doc.proposta.tabela.unid": "Unit",
  "doc.proposta.tabela.qtd": "Qty.",
  "doc.proposta.tabela.precoUnit": "Unit price",
  "doc.proposta.tabela.iva": "VAT",
  "doc.proposta.tabela.total": "Total",
  "doc.proposta.iva.mista": "Mixed",
  "doc.proposta.qtdDoisPontos": "Qty:",
  "doc.proposta.precoUnitDoisPontos": "Unit price:",
  "doc.proposta.ivaTaxa": "VAT {taxa}%",
  "doc.proposta.bundle.componentes": "Bundle components:",
  "doc.proposta.bundle.semDetalhe":
    "Bundle without saved component details. Reopen the item in the editor and add it again to save the composition.",
  "doc.proposta.caracteristicas": "Selected features:",

  // Validade
  "doc.proposta.validade.vendaDireta": "This sales proposal is valid until {data}.",
  "doc.proposta.validade.orcamento": "This quote is valid for {dias} days from the date of issue.",

  // Totais
  "doc.proposta.total.subtotalProdutos": "Products subtotal (excl. VAT):",
  "doc.proposta.total.desconto": "Global discount",
  "doc.proposta.total.taxas": "Service fees:",
  "doc.proposta.total.taxasIva": "Service fees (VAT {taxa}):",
  "doc.proposta.total.taxaOmissao": "Fee",
  "doc.proposta.total.subtotalSemIva": "SUBTOTAL (excl. VAT):",
  "doc.proposta.total.iva": "VAT {taxa}%:",
  "doc.proposta.total.ivaTaxa": "VAT {taxa}% ({nome}):",
  "doc.proposta.total.ivaTotal": "Total VAT:",
  "doc.proposta.total.geral": "GRAND TOTAL (incl. VAT):",

  // Rodapé
  "doc.proposta.rodape.contacto": "CONTACT",
  "doc.proposta.rodape.vendaDireta": "Direct Sale",
  "doc.proposta.rodape.orcamento": "Quote",

  // Estado do orçamento
  "doc.proposta.estado.rascunho": "Draft",
  "doc.proposta.estado.enviado": "Sent",
  "doc.proposta.estado.aceite": "Accepted",
  "doc.proposta.estado.perdido": "Lost",
};
