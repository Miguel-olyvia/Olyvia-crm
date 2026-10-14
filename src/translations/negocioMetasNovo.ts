// Textos do botão "Novo negócio" e do seu diálogo ("Negócio e metas"). Juntam-se aos de `negocioMetas.ts`. Apenas en/pt,
// como o resto da página. As chaves daqui levam o prefixo `businessGoals.new.`, posto por `comPrefixo`.
const PREFIXO = "businessGoals.new.";

const comPrefixo = (textos: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(textos).map(([chave, texto]) => [PREFIXO + chave, texto]));

const pt: Record<string, string> = {
  'open': 'Novo negócio',
  'title': 'Novo negócio',
  'description': 'Só exemplo: o negócio fica nesta página e perde-se ao recarregar.',
  'person': 'Pessoa',
  'person.placeholder': 'Escolhe uma pessoa',
  'service': 'Serviço',
  'service.hint': 'Escolhe uma sugestão ou escreve o serviço.',
  'salesperson': 'Comercial',
  'first': 'Primeiro passo',
  'first.text': 'O negócio começa em Orçamento: o primeiro passo é fazer o levantamento.',
  'cancel': 'Cancelar',
  'submit': 'Criar negócio',
  'required': 'obrigatório',
  'error.person.obrigatorio': 'Escolhe a pessoa do negócio.',
  'error.service.obrigatorio': 'Indica o serviço do negócio.',
  'error.service.comprido': 'O serviço é demasiado comprido: usa até 60 caracteres.',
  'created': 'Negócio criado (exemplo)',
  'announce': 'Negócio criado (exemplo): {nome}, {servico}. O painel do negócio está aberto.',
};

const en: Record<string, string> = {
  'open': 'New deal',
  'title': 'New deal',
  'description': 'Sample only: the deal stays on this page and is lost on reload.',
  'person': 'Person',
  'person.placeholder': 'Choose a person',
  'service': 'Service',
  'service.hint': 'Pick a suggestion or type the service.',
  'salesperson': 'Salesperson',
  'first': 'First step',
  'first.text': 'The deal starts in Quote: the first step is to survey the site.',
  'cancel': 'Cancel',
  'submit': 'Create deal',
  'required': 'required',
  'error.person.obrigatorio': 'Choose the person for the deal.',
  'error.service.obrigatorio': 'Enter the deal’s service.',
  'error.service.comprido': 'The service is too long: use up to 60 characters.',
  'created': 'Deal created (sample)',
  'announce': 'Deal created (sample): {nome}, {servico}. The deal panel is open.',
};

export const negocioMetasNovoTranslations: Record<"en" | "pt", Record<string, string>> = {
  en: comPrefixo(en),
  pt: comPrefixo(pt),
};
