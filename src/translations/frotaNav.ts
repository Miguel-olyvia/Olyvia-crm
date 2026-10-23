// Menu da Frota (/frota/*) e o nome do quadro "Frota" da Agenda (schedule_boards.name_key = 'fleet.boardName', criado
// por fn_fleet_board). Módulo próprio, no mesmo padrão de `inventoryNav.ts`: o merge é feito em `useTranslation.ts`.
// Apenas en/pt — o `t()` cai para `en` quando o idioma ativo não tem a chave. Os textos dos ecrãs estão em português no
// próprio ecrã (como os do Inventário).
export const frotaNavTranslations: Record<string, Record<string, string>> = {
  en: {
    'sidebar.frota': 'Fleet',
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
    'fleet.boardName': 'Fleet',
  },
  pt: {
    'sidebar.frota': 'Frota',
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
    'fleet.boardName': 'Frota',
  },
};
