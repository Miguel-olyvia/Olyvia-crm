// 23/11: as variáveis dos textos do template de proposta ({{condicoes_pagamento}}, …; src/lib/textoDaProposta.ts), no editor de
// templates (ProposalTemplateEditor.tsx). Módulo próprio, juntado em `tabelaFundida.ts`. Só en/pt: nas outras línguas cai para en.
export const proposalTemplateVariaveisTranslations: Record<string, Record<string, string>> = {
  en: {
    "proposalTemplateEditor.variaveis.titulo": "Variables from the deal",
    "proposalTemplateEditor.variaveis.ajuda": "Filled in with the deal's data in the portal, the deal's Proposal step and the PDF. Without a deal they are left empty.",
    "proposalTemplateEditor.variaveis.inserir": "Insert {variavel} into the terms",
    "proposalTemplateEditor.variaveis.condicoes_pagamento": "The instalments chosen in the deal's «Payment terms» (e.g. 50% - Adjudicação / 50% - Fim da obra)",
    "proposalTemplateEditor.variaveis.validade": "The date until which the proposal is valid",
    "proposalTemplateEditor.variaveis.prazo": "The works duration (e.g. 12 dias úteis)",
    "proposalTemplateEditor.variaveis.garantia": "The works warranty",
    "proposalTemplateEditor.variaveis.cliente_nome": "The client's name (the tax name, if any)",
    "proposalTemplateEditor.variaveis.avisoFixo": "The payment terms are typed by hand in these terms (for example «50% - Adjudicação / 25% …»): they will be the same in every proposal, whatever the deal's «Payment terms». You can replace them with {variavel}.",
    "proposalTemplateEditor.variaveis.trocar": "Replace with {variavel}",
  },
  pt: {
    "proposalTemplateEditor.variaveis.titulo": "Variáveis do negócio",
    "proposalTemplateEditor.variaveis.ajuda": "Preenchem-se com os dados do negócio no portal, no passo «Proposta» do negócio e no PDF. Sem negócio, ficam vazias.",
    "proposalTemplateEditor.variaveis.inserir": "Inserir {variavel} nos termos",
    "proposalTemplateEditor.variaveis.condicoes_pagamento": "As prestações escolhidas nas «Condições de pagamento» do negócio (ex.: 50% - Adjudicação / 50% - Fim da obra)",
    "proposalTemplateEditor.variaveis.validade": "Até quando a proposta é válida",
    "proposalTemplateEditor.variaveis.prazo": "O prazo da obra (ex.: 12 dias úteis)",
    "proposalTemplateEditor.variaveis.garantia": "A garantia da obra",
    "proposalTemplateEditor.variaveis.cliente_nome": "O nome do cliente (o fiscal, se houver)",
    "proposalTemplateEditor.variaveis.avisoFixo": "As condições de pagamento estão escritas à mão nestes termos (por exemplo «50% - Adjudicação / 25% …»): ficam iguais em todas as propostas, seja qual for a escolha nas «Condições de pagamento» do negócio. Pode trocá-las por {variavel}.",
    "proposalTemplateEditor.variaveis.trocar": "Trocar por {variavel}",
  },
};
