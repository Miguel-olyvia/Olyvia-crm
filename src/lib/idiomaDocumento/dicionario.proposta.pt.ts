// Rótulos fixos do PDF da proposta (QuotePDFDocument) em português — a LÍNGUA BASE e o fallback.
// Cada texto daqui é o que o PDF já escrevia: NÃO se corrige sem uma decisão à parte (o português tem de sair
// igual). Marcadores: {nome}. Só palavras: o dinheiro (€ e duas casas) e as datas numéricas não dependem do idioma.

export const DICIONARIO_PROPOSTA_PT: Record<string, string> = {
  // Título do documento, do bloco de detalhes e do bloco de valor, por tipo de documento
  "doc.proposta.titulo.orcamento": "ORÇAMENTO",
  "doc.proposta.titulo.proposta": "PROPOSTA",
  "doc.proposta.titulo.vendaDireta": "VENDA DIRETA",
  "doc.proposta.detalhes.orcamento": "DETALHES DO ORÇAMENTO",
  "doc.proposta.detalhes.proposta": "DETALHES DA PROPOSTA",
  "doc.proposta.detalhes.vendaDireta": "DETALHES DA VENDA DIRETA",
  "doc.proposta.valor.orcamento": "VALOR DO ORÇAMENTO",
  "doc.proposta.valor.proposta": "VALOR DA PROPOSTA",
  "doc.proposta.valor.vendaDireta": "VALOR DA VENDA DIRETA",

  // Títulos de secção por omissão (e os de fábrica que o editor de modelos grava em português)
  "doc.proposta.seccao.empresa": "EMPRESA",
  "doc.proposta.seccao.cliente": "CLIENTE",
  "doc.proposta.seccao.notas": "NOTAS",
  "doc.proposta.seccao.condicoes": "CONDIÇÕES GERAIS",
  "doc.proposta.seccao.validade": "VALIDADE",
  "doc.proposta.seccao.outra": "SECÇÃO",
  "doc.proposta.seccao.geral": "Geral",

  // Cabeçalho e blocos de empresa e cliente
  "doc.proposta.data": "Data:",
  "doc.proposta.nome": "Nome:",
  "doc.proposta.nif": "NIF:",
  "doc.proposta.email": "Email:",
  "doc.proposta.telefone": "Telefone:",
  "doc.proposta.tel": "Tel:",
  "doc.proposta.morada": "Morada:",
  "doc.proposta.moradaFiscal": "Morada fiscal:",
  "doc.proposta.moradaEntrega": "Morada de entrega:",

  // Tabela de itens
  "doc.proposta.sku": "SKU",
  "doc.proposta.tabela.descricao": "Descrição",
  "doc.proposta.tabela.unid": "Unid.",
  "doc.proposta.tabela.qtd": "Qtd.",
  "doc.proposta.tabela.precoUnit": "P. Unit.",
  "doc.proposta.tabela.iva": "IVA",
  "doc.proposta.tabela.total": "Total",
  "doc.proposta.iva.mista": "Mista",
  "doc.proposta.qtdDoisPontos": "Qtd:",
  "doc.proposta.precoUnitDoisPontos": "P. Unit.:",
  "doc.proposta.ivaTaxa": "IVA {taxa}%",
  "doc.proposta.bundle.componentes": "Componentes do bundle:",
  "doc.proposta.bundle.semDetalhe":
    "Bundle sem detalhe de componentes guardado. Reabra o item no editor e volte a adicionar para gravar a composição.",
  "doc.proposta.caracteristicas": "Características selecionadas:",

  // Validade
  "doc.proposta.validade.vendaDireta": "Esta proposta de venda é válida até {data}.",
  "doc.proposta.validade.orcamento": "Este orçamento é válido por {dias} dias a partir da data de emissão.",

  // Totais
  "doc.proposta.total.subtotalProdutos": "Subtotal Produtos (sem IVA):",
  "doc.proposta.total.desconto": "Desconto Global",
  "doc.proposta.total.taxas": "Taxas de Serviço:",
  "doc.proposta.total.taxasIva": "Taxas de Serviço (IVA {taxa}):",
  "doc.proposta.total.taxaOmissao": "Taxa",
  "doc.proposta.total.subtotalSemIva": "SUBTOTAL (sem IVA):",
  "doc.proposta.total.iva": "IVA {taxa}%:",
  "doc.proposta.total.ivaTaxa": "IVA {taxa}% ({nome}):",
  "doc.proposta.total.ivaTotal": "IVA Total:",
  "doc.proposta.total.geral": "TOTAL GERAL (c/ IVA):",

  // Rodapé
  "doc.proposta.rodape.contacto": "CONTACTO",
  "doc.proposta.rodape.vendaDireta": "Venda Direta",
  "doc.proposta.rodape.orcamento": "Orçamento",

  // Estado do orçamento
  "doc.proposta.estado.rascunho": "Rascunho",
  "doc.proposta.estado.enviado": "Enviado",
  "doc.proposta.estado.aceite": "Aceite",
  "doc.proposta.estado.perdido": "Perdido",
};
