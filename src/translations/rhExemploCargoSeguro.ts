// rh-exemplo › Cargos › seguro de acidentes de trabalho por cargo (`hr_cargos.seguro_acidentes_pct`).
// Módulo próprio, no mesmo padrão de `rhOficiosObra.ts`: o merge é feito em `useTranslation.ts`. Apenas en/pt: o `t()` cai para `en`.
export const rhExemploCargoSeguroTranslations: Record<string, Record<string, string>> = {
  en: {
    'hr.cargos.seguro.rotulo': 'Work accident insurance (%)',
    'hr.cargos.seguro.ajuda': 'Percentage of the base salary. Leave empty if this role has no insurance.',
    'hr.cargos.seguro.coluna': 'Accident insurance',
    'hr.cargos.seguro.valor': '{valor} % of base salary',
    'hr.cargos.seguro.semSeguro': 'No insurance',
    'hr.cargos.seguro.invalido': 'Enter a percentage from 0 to 100 with at most 2 decimal places, or leave it empty.',
    'hr.cargos.seguro.erroGravar': 'The role was saved, but the work accident insurance was not. {motivo} You can try again.',
    'hr.cargos.seguro.erro.naoEncontrado': 'This role no longer exists or is not in your organisation.',
    'hr.cargos.seguro.erro.semPermissao': 'You do not have permission to change the insurance of a role.',
    'hr.cargos.seguro.erro.invalida': 'The percentage is not valid: it must be from 0 to 100 with at most 2 decimal places.',
  },
  pt: {
    'hr.cargos.seguro.rotulo': 'Seguro de acidentes de trabalho (%)',
    'hr.cargos.seguro.ajuda': 'Percentagem sobre o salário base. Deixe vazio se este cargo não tem seguro.',
    'hr.cargos.seguro.coluna': 'Seguro de acidentes',
    'hr.cargos.seguro.valor': '{valor} % do salário base',
    'hr.cargos.seguro.semSeguro': 'Sem seguro',
    'hr.cargos.seguro.invalido': 'Indique uma percentagem entre 0 e 100, com no máximo 2 casas decimais, ou deixe o campo vazio.',
    'hr.cargos.seguro.erroGravar': 'O cargo foi gravado, mas o seguro de acidentes de trabalho não. {motivo} Pode tentar de novo.',
    'hr.cargos.seguro.erro.naoEncontrado': 'Este cargo já não existe ou não pertence à sua organização.',
    'hr.cargos.seguro.erro.semPermissao': 'Não tem permissão para alterar o seguro de um cargo.',
    'hr.cargos.seguro.erro.invalida': 'A percentagem não é válida: tem de estar entre 0 e 100, com no máximo 2 casas decimais.',
  },
};
