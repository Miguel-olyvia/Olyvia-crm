// Ficha da pessoa do RH › Detalhes laborais › "Ofícios de obra" (PessoaOficiosObraCard, migration 20261231996000).
// Módulo próprio, no mesmo padrão de `frotaNav.ts`: o merge é feito em `useTranslation.ts`. Apenas en/pt: o `t()` cai para `en`.
export const rhOficiosObraTranslations: Record<string, Record<string, string>> = {
  en: {
    'hr.oficiosObra.titulo': 'Site trades',
    'hr.oficiosObra.ajuda': 'The trades this person does on site. Each trade’s hourly cost in the Catalogue and in quotes is the average of the people linked to it.',
    'hr.oficiosObra.semOficios': 'There are no trades in the Catalogue yet (Catalogue and costs › Labour profiles).',
    'hr.oficiosObra.custoHora': 'Hourly cost on site: {valor} € (from the current pay).',
    'hr.oficiosObra.semCusto': 'No current pay: this person is left out of the trade’s average until a pay is added.',
    'hr.oficiosObra.erroLer': 'Could not read the site trades.',
    'hr.oficiosObra.erroGravar': 'Could not save the site trades.',
  },
  pt: {
    'hr.oficiosObra.titulo': 'Ofícios de obra',
    'hr.oficiosObra.ajuda': 'Os ofícios que esta pessoa faz em obra. O custo/hora de cada ofício no Catálogo e nos orçamentos é a média das pessoas ligadas a ele.',
    'hr.oficiosObra.semOficios': 'Ainda não há ofícios no Catálogo (Catálogo e custos › Perfis de mão de obra).',
    'hr.oficiosObra.custoHora': 'Custo/hora em obra: {valor} € (da retribuição em vigor).',
    'hr.oficiosObra.semCusto': 'Sem retribuição em vigor: fica fora da média do ofício até ter retribuição.',
    'hr.oficiosObra.erroLer': 'Não foi possível ler os ofícios de obra.',
    'hr.oficiosObra.erroGravar': 'Não foi possível gravar os ofícios de obra.',
  },
};
