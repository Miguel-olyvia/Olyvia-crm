// Minutas de contrato com versões por idioma (editor de minutas e escolha de idioma ao gerar).
//
// Módulo de traduções próprio, no mesmo padrão de `today.ts` e `directSales.ts`: o `index.ts` é enorme e
// está a ser editado em paralelo; o merge é feito em `useTranslation.ts`. Prefixo do módulo:
// `contractTemplates.versoes.*`. Só en/pt — o `t()` cai para `en` quando o idioma ativo não tem a chave.
export const versoesTemplatesTranslations: Record<string, Record<string, string>> = {
  en: {
    'contractTemplates.versoes.seletor.rotulo': 'Document language',

    'contractTemplates.versoes.barra.rotulo': 'Template languages',
    'contractTemplates.versoes.barra.base': '(base)',
    'contractTemplates.versoes.barra.porTraduzir': '{n} to translate',
    'contractTemplates.versoes.barra.adicionar': 'Add language',
    'contractTemplates.versoes.barra.remover': 'Remove this version',
    'contractTemplates.versoes.barra.desatualizado': 'base text changed',

    'contractTemplates.versoes.adicionar.titulo': 'Add a language version',
    'contractTemplates.versoes.adicionar.escolha': 'Language of the new version',
    'contractTemplates.versoes.adicionar.copiar': 'Start with a copy of the {base} text',
    'contractTemplates.versoes.adicionar.copiarAjuda': 'It shows as “to translate” until the text is different from the {base} one.',
    'contractTemplates.versoes.adicionar.confirmar': 'Add version',
    'contractTemplates.versoes.adicionar.cancelar': 'Cancel',
    'contractTemplates.versoes.adicionar.semIdiomas': 'Every available language has already been added.',

    'contractTemplates.versoes.remover.titulo': 'Remove the {nome} version?',
    'contractTemplates.versoes.remover.descricao': 'The text, header and footer of this version will be deleted when you save. The {base} version is not affected.',
    'contractTemplates.versoes.remover.confirmar': 'Remove',
    'contractTemplates.versoes.remover.cancelar': 'Cancel',

    'contractTemplates.versoes.comum.nota': 'Common to all languages — change it in the {base} version.',
    'contractTemplates.versoes.rodape.semTexto': 'No text in this language: the {base} text is used.',
    'contractTemplates.versoes.corpo.rotulo': 'Template text in {nome}',

    'contractTemplates.versoes.desatualizado.aviso': 'The {base} text has changed since this version was written. Review the translation.',
    'contractTemplates.versoes.desatualizado.revisto': 'Mark as reviewed',

    'contractTemplates.versoes.checklist.titulo': 'What is left to translate',
    'contractTemplates.versoes.checklist.completo': 'Everything is translated.',
    'contractTemplates.versoes.checklist.mostrarBase': 'Show the {base} text',
    'contractTemplates.versoes.checklist.esconderBase': 'Hide the {base} text',
    'contractTemplates.versoes.checklist.corpo': 'Template text',
    'contractTemplates.versoes.checklist.titulo_cabecalho': 'Header title',
    'contractTemplates.versoes.checklist.rodape': 'Footer',
    'contractTemplates.versoes.checklist.tabela': 'Items table title',
    'contractTemplates.versoes.checklist.rotulos': 'Other header labels',
    'contractTemplates.versoes.checklist.traduzido': 'Translated',
    'contractTemplates.versoes.checklist.igual': 'Same as {base}',
    'contractTemplates.versoes.checklist.falta': 'Missing',

    'contractTemplates.versoes.cartao.idiomas': 'Languages: {lista}',
    'contractTemplates.versoes.cartao.incompleto': '{codigo} incomplete',

    'contractTemplates.versoes.guardar.conflitoTitulo': 'This template was changed by someone else',
    'contractTemplates.versoes.guardar.conflitoDescricao': 'Someone saved changes after you opened it. Your text is still in the editor. You can save over their changes or cancel and copy what you need.',
    'contractTemplates.versoes.guardar.substituir': 'Save over their changes',
    'contractTemplates.versoes.guardar.cancelar': 'Cancel',
  },
  pt: {
    'contractTemplates.versoes.seletor.rotulo': 'Idioma do documento',

    'contractTemplates.versoes.barra.rotulo': 'Idiomas da minuta',
    'contractTemplates.versoes.barra.base': '(base)',
    'contractTemplates.versoes.barra.porTraduzir': '{n} por traduzir',
    'contractTemplates.versoes.barra.adicionar': 'Adicionar idioma',
    'contractTemplates.versoes.barra.remover': 'Remover esta versão',
    'contractTemplates.versoes.barra.desatualizado': 'texto base mudou',

    'contractTemplates.versoes.adicionar.titulo': 'Adicionar uma versão de idioma',
    'contractTemplates.versoes.adicionar.escolha': 'Idioma da nova versão',
    'contractTemplates.versoes.adicionar.copiar': 'Começar com uma cópia do texto em {base}',
    'contractTemplates.versoes.adicionar.copiarAjuda': 'Aparece «por traduzir» até o texto ser diferente do texto em {base}.',
    'contractTemplates.versoes.adicionar.confirmar': 'Adicionar versão',
    'contractTemplates.versoes.adicionar.cancelar': 'Cancelar',
    'contractTemplates.versoes.adicionar.semIdiomas': 'Já foram adicionados todos os idiomas disponíveis.',

    'contractTemplates.versoes.remover.titulo': 'Remover a versão {nome}?',
    'contractTemplates.versoes.remover.descricao': 'O texto, o cabeçalho e o rodapé desta versão são apagados quando guardar. A versão em {base} não é afetada.',
    'contractTemplates.versoes.remover.confirmar': 'Remover',
    'contractTemplates.versoes.remover.cancelar': 'Cancelar',

    'contractTemplates.versoes.comum.nota': 'Comum a todos os idiomas — altere na versão em {base}.',
    'contractTemplates.versoes.rodape.semTexto': 'Sem texto neste idioma: usa-se o texto em {base}.',
    'contractTemplates.versoes.corpo.rotulo': 'Texto da minuta em {nome}',

    'contractTemplates.versoes.desatualizado.aviso': 'O texto em {base} mudou desde que esta versão foi escrita. Reveja a tradução.',
    'contractTemplates.versoes.desatualizado.revisto': 'Marcar como revisto',

    'contractTemplates.versoes.checklist.titulo': 'O que falta traduzir',
    'contractTemplates.versoes.checklist.completo': 'Está tudo traduzido.',
    'contractTemplates.versoes.checklist.mostrarBase': 'Mostrar o texto em {base}',
    'contractTemplates.versoes.checklist.esconderBase': 'Esconder o texto em {base}',
    'contractTemplates.versoes.checklist.corpo': 'Corpo da minuta',
    'contractTemplates.versoes.checklist.titulo_cabecalho': 'Título do cabeçalho',
    'contractTemplates.versoes.checklist.rodape': 'Rodapé',
    'contractTemplates.versoes.checklist.tabela': 'Título da tabela de artigos',
    'contractTemplates.versoes.checklist.rotulos': 'Outros rótulos do cabeçalho',
    'contractTemplates.versoes.checklist.traduzido': 'Traduzido',
    'contractTemplates.versoes.checklist.igual': 'Igual ao {base}',
    'contractTemplates.versoes.checklist.falta': 'Em falta',

    'contractTemplates.versoes.cartao.idiomas': 'Idiomas: {lista}',
    'contractTemplates.versoes.cartao.incompleto': '{codigo} incompleto',

    'contractTemplates.versoes.guardar.conflitoTitulo': 'Esta minuta foi alterada por outra pessoa',
    'contractTemplates.versoes.guardar.conflitoDescricao': 'Alguém guardou alterações depois de a abrir. O seu texto continua no editor. Pode guardar por cima das alterações dessa pessoa ou cancelar e copiar o que precisa.',
    'contractTemplates.versoes.guardar.substituir': 'Guardar por cima',
    'contractTemplates.versoes.guardar.cancelar': 'Cancelar',
  },
};
