// Textos do formulário do levantamento lido da base (as perguntas da organização): estado de carregamento, erro com «Repetir», limites dos
// números, erros das respostas e o aviso de «o questionário mudou». As chaves levam o prefixo `businessGoals.new.` (o de «Novo negócio»).
// O texto das próprias perguntas e respostas NÃO está aqui: é da organização, vem da base e vê-se tal como foi escrito.
const PREFIXO = "businessGoals.new.";

const comPrefixo = (textos: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(textos).map(([chave, texto]) => [PREFIXO + chave, texto]));

const pt: Record<string, string> = {
  'qform.loading': 'A carregar as perguntas do levantamento…',
  'qform.error': 'Não foi possível carregar as perguntas do levantamento.',
  'qform.error.blocked': 'Não é possível guardar enquanto não carregarem.',
  'qform.retry': 'Repetir',
  'qform.notReady': 'As perguntas do levantamento ainda não carregaram. Repita o carregamento e guarde de novo.',
  'qform.changed': 'As perguntas do levantamento foram alteradas entretanto. O levantamento ficou guardado e as perguntas foram recarregadas: confirme as respostas.',
  'qform.changedReloadFailed': 'As perguntas do levantamento foram alteradas entretanto. O levantamento ficou guardado, mas não foi possível recarregar as perguntas: feche e volte a abrir antes de continuar.',
  'qform.error.ng008': 'Esta organização ainda não tem o levantamento configurável ativo, por isso não é possível guardar.',
  'qform.error.permission': 'Não tem acesso ao levantamento desta organização, por isso não é possível guardar.',
  'qform.multi.hint': 'Pode escolher várias opções.',
  'qform.number.range': 'Entre {min} e {max}',
  'qform.number.min': 'Mínimo {min}',
  'qform.number.max': 'Máximo {max}',
  'qform.error.fora': 'O valor está fora dos limites.',
  'qform.error.casas': 'Use no máximo {casas} casas decimais.',
  'qform.error.invalido': 'Escreva um número, por exemplo 12,5.',
  'qform.error.comprido': 'O texto é demasiado comprido.',
  'qform.invalid': 'Corrija as respostas assinaladas antes de guardar.',
  'qform.loaded': 'As perguntas do levantamento foram carregadas.',
  'qform.qualEmpty': 'Não há perguntas de qualificação ativas.',
  'qform.visitEmpty': 'Não há secções de visita ativas.',
};

const en: Record<string, string> = {
  'qform.loading': 'Loading the survey questions…',
  'qform.error': 'The survey questions could not be loaded.',
  'qform.error.blocked': 'Saving is not possible until they load.',
  'qform.retry': 'Retry',
  'qform.notReady': 'The survey questions have not loaded yet. Retry loading and save again.',
  'qform.changed': 'The survey questions were changed in the meantime. The survey was saved and the questions were reloaded: check the answers.',
  'qform.changedReloadFailed': 'The survey questions were changed in the meantime. The survey was saved, but the questions could not be reloaded: close and reopen before continuing.',
  'qform.error.ng008': 'This organization does not have the configurable survey active yet, so saving is not possible.',
  'qform.error.permission': 'You do not have access to the survey of this organization, so saving is not possible.',
  'qform.multi.hint': 'You can choose several options.',
  'qform.number.range': 'Between {min} and {max}',
  'qform.number.min': 'At least {min}',
  'qform.number.max': 'At most {max}',
  'qform.error.fora': 'The value is outside the limits.',
  'qform.error.casas': 'Use at most {casas} decimal places.',
  'qform.error.invalido': 'Enter a number, for example 12.5.',
  'qform.error.comprido': 'The text is too long.',
  'qform.invalid': 'Fix the highlighted answers before saving.',
  'qform.loaded': 'The survey questions have been loaded.',
  'qform.qualEmpty': 'There are no active qualification questions.',
  'qform.visitEmpty': 'There are no active visit sections.',
};

export const negocioMetasQuestionarioTranslations: Record<"en" | "pt", Record<string, string>> = {
  en: comPrefixo(en),
  pt: comPrefixo(pt),
};
