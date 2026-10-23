// Textos das ações que mudam um negócio em memória (pt e en): criar um orçamento e ganhar ou perder um passo do
// Workflow. As chaves levam o prefixo `businessGoals.act.`. Juntam-se aos de `negocioMetas.ts`.
const P = "businessGoals.act.";

const pt: Record<string, string> = {
  "quote.title": "Criar orçamento",
  "quote.description": "Orçamento para {name}. Só exemplo: fica em memória e perde-se ao recarregar a página.",
  "quote.value": "Valor (€)",
  "quote.value.hint": "Por exemplo 1 500 ou 1 500,50",
  "quote.desc": "Descrição (opcional)",
  "quote.desc.placeholder": "Por exemplo: Remodelação da casa de banho",
  "quote.state": "Estado",
  "quote.cancel": "Cancelar",
  "quote.submit": "Criar orçamento",
  "quote.error.valorVazio": "Escreva o valor do orçamento.",
  "quote.error.valorInvalido": "O valor tem de ser um número maior que zero, com até duas casas decimais.",
  "quote.error.valorGrande": "O valor não pode passar de 10 000 000 €.",
  "quote.error.descricaoComprida": "A descrição não pode ter mais de 80 caracteres.",
  "quote.created": "Orçamento criado (exemplo)",
  "quote.announce": "Orçamento de {valor} criado para {name}.",
  "event.aceitarOrcamento": "Orçamento aceite",
  "event.perderOrcamento": "Orçamento recusado",
  "event.aceitarProposta": "Proposta aceite",
  "event.perderProposta": "Proposta recusada",
  "event.assinarContrato": "Contrato assinado",
  "event.perderContrato": "Contrato perdido",
  "state.description": "{name}. Só exemplo: a mudança fica em memória.",
  "state.result": "O que acontece: {resultado}",
  "state.ask": "O que fazer a seguir?",
  "state.reason": "Motivo da perda",
  "state.reason.placeholder": "Escolha um motivo",
  "state.cancel": "Cancelar",
  "state.confirm": "Confirmar",
  "state.done.ganho": "Negócio ganho (exemplo)",
  "state.done.perdido": "Negócio perdido (exemplo)",
  "state.done.curso": "Negócio passou a {fase} (exemplo)",
};

const en: Record<string, string> = {
  "quote.title": "Create quote",
  "quote.description": "Quote for {name}. Sample only: kept in memory and lost when the page reloads.",
  "quote.value": "Amount (€)",
  "quote.value.hint": "For example 1,500 or 1500.50",
  "quote.desc": "Description (optional)",
  "quote.desc.placeholder": "For example: Bathroom renovation",
  "quote.state": "Status",
  "quote.cancel": "Cancel",
  "quote.submit": "Create quote",
  "quote.error.valorVazio": "Enter the quote amount.",
  "quote.error.valorInvalido": "The amount must be a number above zero, with up to two decimal places.",
  "quote.error.valorGrande": "The amount cannot be above €10,000,000.",
  "quote.error.descricaoComprida": "The description cannot be longer than 80 characters.",
  "quote.created": "Quote created (sample)",
  "quote.announce": "Quote of {valor} created for {name}.",
  "event.aceitarOrcamento": "Quote accepted",
  "event.perderOrcamento": "Quote declined",
  "event.aceitarProposta": "Proposal accepted",
  "event.perderProposta": "Proposal declined",
  "event.assinarContrato": "Contract signed",
  "event.perderContrato": "Contract lost",
  "state.description": "{name}. Sample only: the change is kept in memory.",
  "state.result": "What happens: {resultado}",
  "state.ask": "What should happen next?",
  "state.reason": "Reason for losing",
  "state.reason.placeholder": "Choose a reason",
  "state.cancel": "Cancel",
  "state.confirm": "Confirm",
  "state.done.ganho": "Deal won (sample)",
  "state.done.perdido": "Deal lost (sample)",
  "state.done.curso": "Deal moved to {fase} (sample)",
};

const comPrefixo = (textos: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(textos).map(([chave, texto]) => [P + chave, texto]));

export const negocioMetasAcoesTranslations: Record<"en" | "pt", Record<string, string>> = {
  en: comPrefixo(en),
  pt: comPrefixo(pt),
};
