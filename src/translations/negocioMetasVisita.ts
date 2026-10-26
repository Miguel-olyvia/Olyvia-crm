// Textos das abas Qualificação e Visita de "Novo negócio" (pt e en). Os das perguntas, blocos, secções e opções saem das
// listas em `components/negocio-metas/qualificacaoExemplo.ts` e `visitaExemplo.ts`, para haver uma só fonte; os de
// interface estão aqui. Todas as chaves levam o prefixo `businessGoals.new.`.
import { BLOCO_QUALIFICACAO } from "@/components/negocio-metas/qualificacaoExemplo";
import { chaveSeccao, textosDosBlocos } from "@/components/negocio-metas/respostasVisita";
import { BLOCO_ESCOLHAS_VISITA, SECCOES_VISITA } from "@/components/negocio-metas/visitaExemplo";
import { negocioMetasListaVisitasTranslations } from "./negocioMetasListaVisitas";
import { negocioMetasQuestionarioTranslations } from "./negocioMetasQuestionario";

const PREFIXO = "businessGoals.new.";

const pt: Record<string, string> = {
  'tab.qualification': 'Qualificação',
  'tab.qualification.count': ', {n} respostas',
  'tab.qualification.count.one': ', 1 resposta',
  'tab.visit': 'Visita',
  'tab.visit.count': ', {n} respostas',
  'tab.visit.count.one': ', 1 resposta',
  'qual.help': 'Todas as perguntas são opcionais: toca numa opção para a escolher e toca de novo para a retirar.',
  'qual.questions': 'Qualificação',
  'qual.request': 'O que o cliente pediu',
  'qual.request.help': 'Com as palavras do cliente. Fica no negócio e pode alterar-se.',
  'qual.request.count': '{n} de {m} caracteres',
  'qual.noDeal': 'A qualificação grava-se no negócio. Crie primeiro o negócio para responder às perguntas e registar o que o cliente pediu.',
  'answered': '{n} de {m} respondidas',
  'answered.lines': '{n} linhas',
  'answered.lines.one': '1 linha',
  'address.title': 'Morada da obra',
  'address.note': 'A 1.ª morada do cliente é a fiscal. A da obra pode ser outra, e é dela que sai a distância ao armazém.',
  'address.street': 'Rua e número',
  'address.postal': 'Código postal',
  'address.postal.placeholder': '0000-000',
  'address.postal.hint': 'Formato: 4 dígitos, hífen e 3 dígitos, por exemplo 1000-001.',
  'address.city': 'Localidade',
  'address.unit': 'Andar / fração',
  'address.unit.placeholder': '3.º Esq.',
  'address.useContact': 'Usar a morada do contacto',
  'address.useContact.empty': 'A aba Geral ainda não tem morada.',
  'address.useContact.done': 'Morada do contacto usada na morada da obra.',
  'address.fromEntity': 'Preencher com os dados da entidade',
  'address.fromEntity.empty': 'A entidade ainda não tem morada.',
  'address.fromEntity.done': 'Morada da entidade copiada. Pode alterá-la à vontade.',
  'address.here': 'Estou no local',
  'address.here.busy': 'A procurar a morada…',
  'address.here.done': 'Morada preenchida pela localização (± {m} m). Confirme o número da porta e o andar.',
  'address.here.weak': 'A localização é pouco precisa (± {m} m). Confirme a rua e o número.',
  'address.here.err.semSuporte': 'Este dispositivo não dá a localização. Escreva a morada à mão.',
  'address.here.err.negada': 'Sem autorização para usar a localização. Pode ativá-la nas definições do browser, ou escrever a morada à mão.',
  'address.here.err.posicao': 'Não foi possível obter a localização. Tente outra vez, ou escreva a morada à mão.',
  'address.here.err.servico': 'O serviço de moradas não está disponível neste momento. Escreva a morada à mão.',
  'address.here.err.semMorada': 'Não foi possível saber a morada deste ponto. Escreva-a à mão.',
  'address.origin.entidade': 'Origem da morada: copiada da entidade.',
  'address.origin.manual': 'Origem da morada: escrita à mão.',
  'address.origin.localizacao': 'Origem da morada: localização do dispositivo.',
  'address.fromVisit.same': 'Preenchida a partir da visita · igual à morada da lead.',
  'address.fromVisit.other': 'Preenchida a partir da visita · outra morada (diferente da que a lead indicou).',
  'error.postal.invalido': 'O código postal tem o formato 0000-000, por exemplo 1000-001.',
  'visit.sections.label': 'Secções da visita',
  'visit.step': 'Passo {x} de {y} · faltam {n} respostas',
  'visit.step.one': 'Passo {x} de {y} · falta 1 resposta',
  'visit.step.done': 'Passo {x} de {y} · tudo respondido',
  'visit.section.done': 'feita',
  'visit.section.todo': 'por fazer',
  'visit.help': 'As respostas são opcionais e vão para o negócio.',
  'visit.measures.help': 'As medidas dão as quantidades dos serviços: acrescenta uma linha por trabalho a fazer.',
  'visit.title': 'Visita',
  'qual.title': 'Qualificação',
};

const en: Record<string, string> = {
  'tab.qualification': 'Qualification',
  'tab.qualification.count': ', {n} answers',
  'tab.qualification.count.one': ', 1 answer',
  'tab.visit': 'Visit',
  'tab.visit.count': ', {n} answers',
  'tab.visit.count.one': ', 1 answer',
  'qual.help': 'Every question is optional: tap an option to choose it and tap again to clear it.',
  'qual.questions': 'Qualification',
  'qual.request': 'What the client asked for',
  'qual.request.help': 'In the client words. It stays on the deal and can be changed.',
  'qual.request.count': '{n} of {m} characters',
  'qual.noDeal': 'Qualification is saved on the deal. Create the deal first to answer the questions and note what the client asked for.',
  'answered': '{n} of {m} answered',
  'answered.lines': '{n} lines',
  'answered.lines.one': '1 line',
  'address.title': 'Work address',
  'address.note': "The client's first address is the billing one. The work address can be another, and the distance to the warehouse comes from it.",
  'address.street': 'Street and number',
  'address.postal': 'Postal code',
  'address.postal.placeholder': '0000-000',
  'address.postal.hint': 'Format: 4 digits, a hyphen and 3 digits, for example 1000-001.',
  'address.city': 'City',
  'address.unit': 'Floor / unit',
  'address.unit.placeholder': '3rd Left',
  'address.useContact': 'Use the contact address',
  'address.useContact.empty': 'The General tab has no address yet.',
  'address.useContact.done': 'The contact address was used as the work address.',
  'address.fromEntity': 'Fill in with the entity details',
  'address.fromEntity.empty': 'The entity has no address yet.',
  'address.fromEntity.done': 'The entity address was copied. You can change it freely.',
  'address.here': 'I am on site',
  'address.here.busy': 'Looking for the address…',
  'address.here.done': 'Address filled in from the location (± {m} m). Check the door number and the floor.',
  'address.here.weak': 'The location is not very accurate (± {m} m). Check the street and the number.',
  'address.here.err.semSuporte': 'This device cannot give its location. Type the address by hand.',
  'address.here.err.negada': 'Location permission was denied. You can allow it in the browser settings, or type the address by hand.',
  'address.here.err.posicao': 'The location could not be read. Try again, or type the address by hand.',
  'address.here.err.servico': 'The address service is not available right now. Type the address by hand.',
  'address.here.err.semMorada': 'The address of this point could not be found. Type it by hand.',
  'address.origin.entidade': 'Address source: copied from the entity.',
  'address.origin.manual': 'Address source: typed by hand.',
  'address.origin.localizacao': 'Address source: device location.',
  'address.fromVisit.same': 'Filled in from the visit · same as the lead address.',
  'address.fromVisit.other': 'Filled in from the visit · another address (different from the one the lead gave).',
  'error.postal.invalido': 'The postal code has the format 0000-000, for example 1000-001.',
  'visit.sections.label': 'Visit sections',
  'visit.step': 'Step {x} of {y} · {n} answers missing',
  'visit.step.one': 'Step {x} of {y} · 1 answer missing',
  'visit.step.done': 'Step {x} of {y} · all answered',
  'visit.section.done': 'done',
  'visit.section.todo': 'to do',
  'visit.help': 'Answers are optional and go to the deal.',
  'visit.measures.help': 'Measurements give the service quantities: add one line for each job to do.',
  'visit.title': 'Visit',
  'qual.title': 'Qualification',
};

const blocos = [BLOCO_QUALIFICACAO, BLOCO_ESCOLHAS_VISITA, ...SECCOES_VISITA.flatMap((s) => s.blocos)];

function dosPares(lingua: 0 | 1): Record<string, string> {
  const textos = Object.entries(textosDosBlocos(blocos)).map(([chave, par]) => [chave, par[lingua]] as const);
  const seccoes = SECCOES_VISITA.map((s) => [chaveSeccao(s.id), s.titulo[lingua]] as const);
  return Object.fromEntries([...textos, ...seccoes]);
}

const comPrefixo = (textos: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(textos).map(([chave, texto]) => [PREFIXO + chave, texto]));

export const negocioMetasVisitaTranslations: Record<"en" | "pt", Record<string, string>> = {
  en: { ...comPrefixo({ ...dosPares(1), ...en, ...negocioMetasListaVisitasTranslations.en }), ...negocioMetasQuestionarioTranslations.en },
  pt: { ...comPrefixo({ ...dosPares(0), ...pt, ...negocioMetasListaVisitasTranslations.pt }), ...negocioMetasQuestionarioTranslations.pt },
};
