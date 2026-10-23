// Textos de perder um negócio (em qualquer fase, com motivo) e de anular a perda. Juntam-se aos de `negocioMetas.ts`; todas as chaves levam o
// prefixo `businessGoals.lose.`, posto aqui. O motivo vem da lista do Workflow mais «Outro» com texto livre. Só en/pt.
const PREFIXO = "businessGoals.lose.";

const comPrefixo = (textos: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(textos).map(([chave, texto]) => [PREFIXO + chave, texto]));

const pt: Record<string, string> = {
  'button': 'Perder negócio',
  'title': 'Perder o negócio',
  'description': '{name} · {work}. O negócio perde-se na fase {phase}, com o motivo que escolher. Pode anular a perda enquanto quiser.',
  'reason': 'Motivo da perda',
  'reason.placeholder': 'Escolha um motivo',
  'reason.other': 'Outro',
  'reason.otherLabel': 'Escreva o motivo',
  'error.motivoVazio': 'Escolha o motivo da perda.',
  'error.outroVazio': 'Escreva o motivo.',
  'cancel': 'Cancelar',
  'confirm': 'Confirmar a perda',
  'done': 'Negócio perdido: {name} ({work}). Motivo: {reason}.',
  'undo': 'Anular perda',
  'undo.hint': 'O negócio volta ao quadro, na fase em que estava.',
  'undo.done': 'Perda anulada: o negócio de {name} voltou a {phase}.',
  'lostIn': 'Perdido em {phase}: {reason}',
  'phase.levantamento': 'Levantamento',
  'phase.orcamento': 'Orçamento',
  'phase.proposta': 'Proposta',
  'phase.contrato': 'Contrato',
};

const en: Record<string, string> = {
  'button': 'Lose deal',
  'title': 'Lose the deal',
  'description': '{name} · {work}. The deal is lost in the {phase} stage, with the reason you choose. You can undo the loss at any time.',
  'reason': 'Reason for losing',
  'reason.placeholder': 'Choose a reason',
  'reason.other': 'Other',
  'reason.otherLabel': 'Write the reason',
  'error.motivoVazio': 'Choose the reason for losing.',
  'error.outroVazio': 'Write the reason.',
  'cancel': 'Cancel',
  'confirm': 'Confirm the loss',
  'done': 'Deal lost: {name} ({work}). Reason: {reason}.',
  'undo': 'Undo loss',
  'undo.hint': 'The deal goes back on the board, in the stage it was in.',
  'undo.done': 'Loss undone: the deal of {name} is back in {phase}.',
  'lostIn': 'Lost in {phase}: {reason}',
  'phase.levantamento': 'Survey',
  'phase.orcamento': 'Quote',
  'phase.proposta': 'Proposal',
  'phase.contrato': 'Contract',
};

export const negocioMetasPerdaTranslations: Record<"en" | "pt", Record<string, string>> = {
  en: comPrefixo(en),
  pt: comPrefixo(pt),
};
