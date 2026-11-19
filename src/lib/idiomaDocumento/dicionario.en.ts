// Palavras dos documentos (contrato e proposta) em inglês. Mesmas chaves e mesmos marcadores {nome} que o
// português (há um teste de paridade). Só palavras: o formato do dinheiro e dos números não muda.

export const DICIONARIO_EN: Record<string, string> = {
  // Tabela de itens do orçamento
  "doc.tabela.descricao": "Description",
  "doc.tabela.qtd": "Qty",
  "doc.tabela.un": "Unit",
  "doc.tabela.precoUnit": "Unit price",
  "doc.tabela.total": "Total",
  "doc.tabela.subtotal": "Subtotal",
  "doc.tabela.valor": "Amount",
  "doc.tabela.orcamento": "Quote",
  "doc.tabela.ref": "Ref.",
  "doc.tabela.tituloArtigos": "Quote items",

  // Tabela de signatários
  "doc.signatarios.titulo": "Signatories",
  "doc.signatarios.ordem": "#",
  "doc.signatarios.nome": "Name",
  "doc.signatarios.papel": "Role",
  "doc.signatarios.email": "Email",

  // Campos em falta: «[Client name missing]»
  "doc.emFalta": "{rotulo} missing",
  "doc.rotulo.empresaNome": "Company name",
  "doc.rotulo.empresaNif": "Company tax ID",
  "doc.rotulo.empresaMorada": "Company address",
  "doc.rotulo.clienteNome": "Client name",
  "doc.rotulo.clienteNif": "Client tax ID",
  "doc.rotulo.clienteMorada": "Client address",
  "doc.rotulo.clienteEmail": "Client email",
  "doc.rotulo.clienteTelefone": "Client phone",
  "doc.rotulo.clienteLocalidade": "Locality",
  "doc.rotulo.comercialNome": "Sales rep name",
  "doc.rotulo.comercialEmail": "Sales rep email",
  "doc.rotulo.comercialTelefone": "Sales rep phone",
  "doc.rotulo.contratoNumero": "Contract No.",
  "doc.rotulo.contratoValor": "Contract value",
  "doc.rotulo.contratoValorExtenso": "Value in words",
  "doc.rotulo.contratoDataInicio": "Start date",
  "doc.rotulo.contratoDataFim": "End date",
  "doc.rotulo.contratoDuracao": "Duration",
  "doc.rotulo.propostaNumero": "Proposal No.",
  "doc.rotulo.propostaValor": "Proposal value",
  "doc.rotulo.propostaData": "Proposal date",
  "doc.rotulo.itensOrcamento": "Quote items",

  // Cabeçalho do contrato
  "doc.cabecalho.titulo": "CONTRACT",
  "doc.cabecalho.numero": "CONTRACT No.",
  "doc.cabecalho.data": "Date:",
  "doc.cabecalho.comercial": "Sales rep:",
  "doc.cabecalho.nif": "Tax ID:",
  "doc.cabecalho.tel": "Tel:",

  // Carimbo da assinatura
  "doc.carimbo.assinadoOtp": "Signed via SMS OTP",
  "doc.carimbo.ip": "IP:",
  "doc.carimbo.assinado": "Signed",

  // Numeração das páginas
  "doc.pagina": "Page {x} of {y}",

  // Duração
  "doc.duracao.meses": "{n} months",
  "doc.duracao.mesUm": "{n} month",
  "doc.duracao.dias": "{n} days",
  "doc.duracao.diaUm": "{n} day",

  // Datas por extenso: «13 March 2026»
  "doc.data": "{dia} {mes} {ano}",
  "doc.mes.1": "January",
  "doc.mes.2": "February",
  "doc.mes.3": "March",
  "doc.mes.4": "April",
  "doc.mes.5": "May",
  "doc.mes.6": "June",
  "doc.mes.7": "July",
  "doc.mes.8": "August",
  "doc.mes.9": "September",
  "doc.mes.10": "October",
  "doc.mes.11": "November",
  "doc.mes.12": "December",

  // Nomes dos idiomas
  "doc.idioma.pt": "Portuguese",
  "doc.idioma.en": "English",
  "doc.idioma.es": "Spanish",
  "doc.idioma.fr": "French",

  // Listas
  "doc.lista.sep": ", ",
  "doc.lista.ultimo": " and ",

  // Assinatura única quando o contrato sai em vários idiomas
  "doc.assinaturaUnica": "This signature applies to both the {idiomas} versions.",
  "doc.assinaturaUnicaN": "This signature applies to the {idiomas} versions.",
};
