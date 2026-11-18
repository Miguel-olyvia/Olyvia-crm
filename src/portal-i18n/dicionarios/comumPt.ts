// Textos comuns ao portal de cliente e de fornecedor, em português (chaves `pt.*`).
// Mantém este ficheiro abaixo das 400 linhas: para crescer, cria `comumPt.<tema>.ts` com um
// `export const comumPtTema: Record<string, string> = {...}` e junta-o aqui com `...comumPtTema`.
// Ao acrescentar uma chave, acrescenta a mesma em `comumEn.ts` (o teste de paridade falha se faltar).
export const comumPt: Record<string, string> = {
  // Ações
  "pt.sair": "Sair",
  "pt.fechar": "Fechar",
  "pt.cancelar": "Cancelar",
  "pt.tentarNovamente": "Tentar de novo",
  "pt.dialogo.fechar": "Fechar",

  // Estados
  "pt.aCarregar": "A carregar…",
  "pt.semResultados": "Sem resultados",

  // Erros genéricos
  "pt.erro.generico": "Algo correu mal. Tenta outra vez.",
  "pt.erro.rede": "Não foi possível ligar ao servidor. Verifica a ligação e tenta de novo.",
  "pt.erro.semPermissao": "Não tens permissão para ver esta página.",

  // Meses (1 = janeiro)
  "pt.mes.1": "janeiro",
  "pt.mes.2": "fevereiro",
  "pt.mes.3": "março",
  "pt.mes.4": "abril",
  "pt.mes.5": "maio",
  "pt.mes.6": "junho",
  "pt.mes.7": "julho",
  "pt.mes.8": "agosto",
  "pt.mes.9": "setembro",
  "pt.mes.10": "outubro",
  "pt.mes.11": "novembro",
  "pt.mes.12": "dezembro",
};
