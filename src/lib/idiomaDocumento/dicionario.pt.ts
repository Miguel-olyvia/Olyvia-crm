// Palavras dos documentos (contrato e proposta) em português — a LÍNGUA BASE e o fallback de todas as outras.
// Cada texto daqui é o que o contrato já escrevia: NÃO se corrige (nem o «1 meses») sem uma decisão à parte.
// Marcadores: {nome}. Só palavras: o formato do dinheiro e dos números não depende do idioma.

export const DICIONARIO_PT: Record<string, string> = {
  // Tabela de itens do orçamento
  "doc.tabela.descricao": "Descrição",
  "doc.tabela.qtd": "Qtd",
  "doc.tabela.un": "Un.",
  "doc.tabela.precoUnit": "Preço Unit.",
  "doc.tabela.total": "Total",
  "doc.tabela.subtotal": "Subtotal",
  "doc.tabela.valor": "Valor",
  "doc.tabela.orcamento": "Orçamento",
  "doc.tabela.ref": "Ref.",
  "doc.tabela.tituloArtigos": "Artigos do Orçamento",

  // Tabela de signatários
  "doc.signatarios.titulo": "Signatários",
  "doc.signatarios.ordem": "#",
  "doc.signatarios.nome": "Nome",
  "doc.signatarios.papel": "Papel",
  "doc.signatarios.email": "Email",

  // Campos em falta: «[Nome do cliente em falta]»
  "doc.emFalta": "{rotulo} em falta",
  "doc.rotulo.empresaNome": "Nome da empresa",
  "doc.rotulo.empresaNif": "NIF da empresa",
  "doc.rotulo.empresaMorada": "Morada da empresa",
  "doc.rotulo.clienteNome": "Nome do cliente",
  "doc.rotulo.clienteNif": "NIF do cliente",
  "doc.rotulo.clienteMorada": "Morada do cliente",
  "doc.rotulo.clienteEmail": "Email do cliente",
  "doc.rotulo.clienteTelefone": "Telefone do cliente",
  "doc.rotulo.clienteLocalidade": "Localidade",
  "doc.rotulo.comercialNome": "Nome do comercial",
  "doc.rotulo.comercialEmail": "Email do comercial",
  "doc.rotulo.comercialTelefone": "Telefone do comercial",
  "doc.rotulo.contratoNumero": "Nº do contrato",
  "doc.rotulo.contratoValor": "Valor do contrato",
  "doc.rotulo.contratoValorExtenso": "Valor por extenso",
  "doc.rotulo.contratoDataInicio": "Data de início",
  "doc.rotulo.contratoDataFim": "Data de fim",
  "doc.rotulo.contratoDuracao": "Duração",
  "doc.rotulo.propostaNumero": "Nº da proposta",
  "doc.rotulo.propostaValor": "Valor da proposta",
  "doc.rotulo.propostaData": "Data da proposta",
  "doc.rotulo.itensOrcamento": "Itens do orçamento",

  // Cabeçalho do contrato
  "doc.cabecalho.titulo": "CONTRATO",
  "doc.cabecalho.numero": "CONTRATO Nº",
  "doc.cabecalho.data": "Data:",
  "doc.cabecalho.comercial": "Comercial:",
  "doc.cabecalho.nif": "NIF:",
  "doc.cabecalho.tel": "Tel:",

  // Carimbo da assinatura
  "doc.carimbo.assinadoOtp": "Assinado via SMS OTP",
  "doc.carimbo.ip": "IP:",
  "doc.carimbo.assinado": "Assinado",

  // Numeração das páginas
  "doc.pagina": "Página {x} de {y}",

  // Duração (o plural de «1 meses» e «1 dias» é o de hoje; no inglês o singular está certo)
  "doc.duracao.meses": "{n} meses",
  "doc.duracao.mesUm": "{n} meses",
  "doc.duracao.dias": "{n} dias",
  "doc.duracao.diaUm": "{n} dias",

  // Datas por extenso: «13 de Março de 2026»
  "doc.data": "{dia} de {mes} de {ano}",
  "doc.mes.1": "Janeiro",
  "doc.mes.2": "Fevereiro",
  "doc.mes.3": "Março",
  "doc.mes.4": "Abril",
  "doc.mes.5": "Maio",
  "doc.mes.6": "Junho",
  "doc.mes.7": "Julho",
  "doc.mes.8": "Agosto",
  "doc.mes.9": "Setembro",
  "doc.mes.10": "Outubro",
  "doc.mes.11": "Novembro",
  "doc.mes.12": "Dezembro",

  // Nomes dos idiomas (em minúsculas, para entrar em frases)
  "doc.idioma.pt": "português",
  "doc.idioma.en": "inglês",
  "doc.idioma.es": "espanhol",
  "doc.idioma.fr": "francês",

  // Listas («português e em inglês», «português, em inglês e em espanhol»)
  "doc.lista.sep": ", em ",
  "doc.lista.ultimo": " e em ",

  // Assinatura única quando o contrato sai em vários idiomas
  "doc.assinaturaUnica": "Esta assinatura vale para as versões em {idiomas}.",
  "doc.assinaturaUnicaN": "Esta assinatura vale para as versões em {idiomas}.",
};
