// Textos da aba «Registos» do painel «Novo negócio»: ligar registos da pessoa (chamadas e visitas) ao negócio e escolher o que fazer ao
// levantamento. Juntam-se aos de `negocioMetasNovo.ts`; todas as chaves levam o prefixo `businessGoals.new.`, posto aqui. Só en/pt.
const PREFIXO = "businessGoals.new.";

const comPrefixo = (textos: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(textos).map(([chave, texto]) => [PREFIXO + chave, texto]));

const pt: Record<string, string> = {
  'tab.records': 'Registos',
  'tab.records.count': ', {n} a ligar',
  'tab.records.count.one': ', 1 a ligar',
  'link.title': 'Ligar registos',
  'link.hint': 'Escolhe os registos da pessoa que passam a fazer parte deste negócio. Nada se copia: cada registo liga-se a um só negócio, e podes desfazer a ligação enquanto o negócio está aberto.',
  'link.pickPerson': 'Escolhe primeiro a pessoa, na aba Geral: os registos são os dela.',
  'link.none': 'Esta pessoa não tem registos por ligar.',
  'link.calls': 'Chamadas',
  'link.visits': 'Visitas',
  'link.call': 'Chamada de {date} · {result}',
  'link.visit': 'Visita de {date}{time} · {state}',
  'link.visit.time': ' às {time}',
  'link.result.atendeuInteressado': 'Atendeu, interessado',
  'link.result.atendeuMaisTarde': 'Atendeu, ligar mais tarde',
  'link.result.naoAtendeu': 'Não atendeu',
  'link.result.semInteresse': 'Sem interesse',
  'link.result.numeroErrado': 'Número errado',
  'link.visitState.porFazer': 'Por fazer',
  'link.visitState.feita': 'Feita',
  'link.visitState.cancelada': 'Cancelada',
  'link.survey.legend': 'O que fazer ao levantamento',
  'link.survey.optional': 'O levantamento é opcional.',
  'link.survey.existing': 'Usar um que já existe',
  'link.survey.existingNone': 'Não há nenhum levantamento por ligar.',
  'link.survey.list': 'Levantamentos por ligar',
  'link.survey.item': 'Levantamento de {date} · feito por {who}',
  'link.survey.new': 'Fazer um novo',
  'link.survey.newHint': 'O negócio fica em Levantamento até o levantamento estar feito e ligado a ele.',
  'link.survey.skip': 'Dispensar',
  'link.survey.skipHint': 'O negócio segue para Orçamento sem levantamento.',
};

const en: Record<string, string> = {
  'tab.records': 'Records',
  'tab.records.count': ', {n} to link',
  'tab.records.count.one': ', 1 to link',
  'link.title': 'Link records',
  'link.hint': 'Choose the person\'s records that become part of this deal. Nothing is copied: each record links to one deal only, and you can undo the link while the deal is open.',
  'link.pickPerson': 'Choose the person first, in the General tab: the records are theirs.',
  'link.none': 'This person has no records left to link.',
  'link.calls': 'Calls',
  'link.visits': 'Visits',
  'link.call': 'Call on {date} · {result}',
  'link.visit': 'Visit on {date}{time} · {state}',
  'link.visit.time': ' at {time}',
  'link.result.atendeuInteressado': 'Answered, interested',
  'link.result.atendeuMaisTarde': 'Answered, call back later',
  'link.result.naoAtendeu': 'No answer',
  'link.result.semInteresse': 'No interest',
  'link.result.numeroErrado': 'Wrong number',
  'link.visitState.porFazer': 'To do',
  'link.visitState.feita': 'Done',
  'link.visitState.cancelada': 'Cancelled',
  'link.survey.legend': 'What to do about the survey',
  'link.survey.optional': 'The survey is optional.',
  'link.survey.existing': 'Use one that already exists',
  'link.survey.existingNone': 'There is no survey left to link.',
  'link.survey.list': 'Surveys left to link',
  'link.survey.item': 'Survey of {date} · done by {who}',
  'link.survey.new': 'Do a new one',
  'link.survey.newHint': 'The deal stays in Survey until the survey is done and linked to it.',
  'link.survey.skip': 'Skip it',
  'link.survey.skipHint': 'The deal goes straight to Quote, without a survey.',
};

export const negocioMetasRegistosTranslations: Record<"en" | "pt", Record<string, string>> = {
  en: comPrefixo(en),
  pt: comPrefixo(pt),
};
