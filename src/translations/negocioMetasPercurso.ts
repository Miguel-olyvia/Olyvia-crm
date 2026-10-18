// Textos do percurso do negócio (contactos, visitas e resultado, levantamento, orçamentos, proposta, contrato e perda, por ordem cronológica) e do
// funil da abordagem (`funnel.*`, no Dashboard).
// Juntam-se aos de `negocioMetas.ts`; todas as chaves levam o prefixo `businessGoals.journey.`, posto aqui. Só en/pt. Os estados de uma visita, de um
// orçamento, da proposta e do contrato, e os resultados de uma chamada, reutilizam os textos que já existem.
const PREFIXO = "businessGoals.journey.";

const comPrefixo = (textos: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(textos).map(([chave, texto]) => [PREFIXO + chave, texto]));

const pt: Record<string, string> = {
  'title': 'Percurso do negócio',
  'empty': 'Ainda não há nada neste percurso.',
  'noDate': 'Sem data',
  'type.contacto': 'Contacto',
  'type.visita': 'Visita',
  'type.levantamento': 'Levantamento',
  'type.orcamento': 'Orçamento',
  'type.proposta': 'Proposta',
  'type.contrato': 'Contrato',
  'type.perda': 'Perdido',
  'visitResult.interessado': 'Interessada',
  'visitResult.aPensar': 'A pensar',
  'visitResult.semInteresse': 'Sem interesse',
  'visitResult.obraInviavel': 'Obra inviável',
  'survey.lines.zero': 'Feito por {who}, sem linhas',
  'survey.lines.one': 'Feito por {who}, 1 linha',
  'survey.lines.many': 'Feito por {who}, {n} linhas',
  'funnel.title': 'Abordagem',
  'funnel.note': 'Conta à parte: as metas só contam a partir do Orçamento.',
  'funnel.porContactar': 'Por contactar',
  'funnel.contactado': 'Contactado',
  'funnel.visita': 'Visita',
  'funnel.levantamento': 'Levantamento',
};

const en: Record<string, string> = {
  'title': 'Deal journey',
  'empty': 'Nothing in this journey yet.',
  'noDate': 'No date',
  'type.contacto': 'Contact',
  'type.visita': 'Visit',
  'type.levantamento': 'Survey',
  'type.orcamento': 'Quote',
  'type.proposta': 'Proposal',
  'type.contrato': 'Contract',
  'type.perda': 'Lost',
  'visitResult.interessado': 'Interested',
  'visitResult.aPensar': 'Thinking about it',
  'visitResult.semInteresse': 'Not interested',
  'visitResult.obraInviavel': 'Job not feasible',
  'survey.lines.zero': 'Done by {who}, no lines',
  'survey.lines.one': 'Done by {who}, 1 line',
  'survey.lines.many': 'Done by {who}, {n} lines',
  'funnel.title': 'Outreach',
  'funnel.note': 'Counted separately: goals only count from the Quote stage.',
  'funnel.porContactar': 'To contact',
  'funnel.contactado': 'Contacted',
  'funnel.visita': 'Visit',
  'funnel.levantamento': 'Survey',
};

export const negocioMetasPercursoTranslations: Record<"en" | "pt", Record<string, string>> = {
  en: comPrefixo(en),
  pt: comPrefixo(pt),
};
