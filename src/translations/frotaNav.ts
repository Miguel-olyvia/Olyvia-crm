// Menu da Frota de exemplo (/frota/*) e o selo "Dados de exemplo". Módulo próprio, no mesmo padrão de `inventoryNav.ts`:
// o merge é feito em `useTranslation.ts`. Apenas en/pt — o `t()` cai para `en` quando o idioma ativo não tem a chave.
// Os textos dos ecrãs estão em português no próprio ecrã (como os do Inventário), até a Frota ter tabelas.
export const frotaNavTranslations: Record<string, Record<string, string>> = {
  en: {
    'sidebar.frotaExemplo': 'Fleet (example)',
    'sidebar.frotaHoje': 'Today',
    'sidebar.frotaViaturas': 'Vehicles',
    'sidebar.frotaAtribuicoes': 'Assignments',
    'sidebar.frotaCondutores': 'Drivers',
    'sidebar.frotaManutencao': 'Maintenance',
    'sidebar.frotaCustos': 'Fuel and costs',
    'sidebar.frotaOcorrencias': 'Incidents',
    'sidebar.frotaDocumentos': 'Documents',
    'sidebar.frotaRelatorios': 'Reports',
    'sidebar.frotaAtividade': 'Activity',
    'sidebar.frotaLigacoes': 'Connections',
    'frotaExemplo.selo': 'Example data',
    'frotaExemplo.selo.ajuda': 'The fleet has no database tables yet: these screens show made-up data, saved only in this browser. Nothing here touches real data.',
  },
  pt: {
    'sidebar.frotaExemplo': 'Frota (exemplo)',
    'sidebar.frotaHoje': 'Hoje',
    'sidebar.frotaViaturas': 'Viaturas',
    'sidebar.frotaAtribuicoes': 'Atribuições',
    'sidebar.frotaCondutores': 'Condutores',
    'sidebar.frotaManutencao': 'Manutenção',
    'sidebar.frotaCustos': 'Abastecimentos e custos',
    'sidebar.frotaOcorrencias': 'Ocorrências',
    'sidebar.frotaDocumentos': 'Documentos',
    'sidebar.frotaRelatorios': 'Relatórios',
    'sidebar.frotaAtividade': 'Atividade',
    'sidebar.frotaLigacoes': 'Ligações',
    'frotaExemplo.selo': 'Dados de exemplo',
    'frotaExemplo.selo.ajuda': 'A Frota ainda não tem tabelas na base de dados: estes ecrãs mostram dados inventados, guardados só neste navegador. Nada aqui toca em dados reais.',
  },
};
