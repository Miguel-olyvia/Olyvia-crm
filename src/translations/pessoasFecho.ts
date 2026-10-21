// Textos do tipo de fecho do negócio na ficha real das Pessoas (pt e en): a pergunta ao criar («Como fecha este negócio?»), a etiqueta, a mudança
// com confirmação e a nota dos negócios de venda directa. Juntam-se aos de `pessoasPagina.ts`, por isso as chaves são `pessoasPagina.neg.fecho.*`.
// Os erros (NG022, NG023 e NG024) estão em `pessoasErros.ts`. Sem aconselhamento jurídico: só o que o ecrã faz.
const N = "pessoasPagina.neg.fecho.";

const pt: Record<string, string> = {
  [`${N}question`]: "Como fecha este negócio?",
  [`${N}hint`]: "Escolha agora; pode mudar depois, enquanto o negócio estiver aberto.",
  [`${N}option.contrato`]: "No contrato",
  [`${N}option.proposta`]: "Na proposta (venda directa)",
  [`${N}tag.contrato`]: "Fecha no contrato",
  [`${N}tag.proposta`]: "Fecha na proposta (venda directa)",
  [`${N}note.proposta`]: "Este negócio fecha na proposta (venda directa): os contratos não se usam aqui, por isso não se criam nem se ligam.",
  [`${N}change.button`]: "Mudar o tipo de fecho",
  [`${N}change.title`]: "Mudar o tipo de fecho",
  [`${N}change.description`]: "Como deve fechar o negócio {work} de {name}? O tipo só se muda com o negócio aberto.",
  [`${N}change.to.proposta`]: "Passar a fechar na proposta",
  [`${N}change.to.contrato`]: "Passar a fechar no contrato",
  [`${N}change.cancel`]: "Cancelar",
  [`${N}confirm.proposta`]: "A proposta que já está aceite passa a decidir este negócio. Se confirmar, o negócio pode ficar ganho.",
  [`${N}confirm.contrato`]: "O contrato que já está assinado passa a decidir este negócio. Se confirmar, o negócio pode ficar ganho.",
  [`${N}confirm.button`]: "Confirmar a mudança",
  [`${N}done.proposta`]: "{name}: o negócio {work} passa a fechar na proposta.",
  [`${N}done.contrato`]: "{name}: o negócio {work} passa a fechar no contrato.",
  [`${N}unchanged`]: "O negócio {work} já fechava assim.",
};

const en: Record<string, string> = {
  [`${N}question`]: "How does this deal close?",
  [`${N}hint`]: "Choose now; you can change it later, while the deal is open.",
  [`${N}option.contrato`]: "On the contract",
  [`${N}option.proposta`]: "On the proposal (direct sale)",
  [`${N}tag.contrato`]: "Closes on the contract",
  [`${N}tag.proposta`]: "Closes on the proposal (direct sale)",
  [`${N}note.proposta`]: "This deal closes on the proposal (direct sale): contracts are not used here, so they are neither created nor linked.",
  [`${N}change.button`]: "Change the closing type",
  [`${N}change.title`]: "Change the closing type",
  [`${N}change.description`]: "How should the deal {work} for {name} close? The type can only be changed while the deal is open.",
  [`${N}change.to.proposta`]: "Close on the proposal instead",
  [`${N}change.to.contrato`]: "Close on the contract instead",
  [`${N}change.cancel`]: "Cancel",
  [`${N}confirm.proposta`]: "The proposal that is already accepted will decide this deal. If you confirm, the deal may become won.",
  [`${N}confirm.contrato`]: "The contract that is already signed will decide this deal. If you confirm, the deal may become won.",
  [`${N}confirm.button`]: "Confirm the change",
  [`${N}done.proposta`]: "{name}: the deal {work} now closes on the proposal.",
  [`${N}done.contrato`]: "{name}: the deal {work} now closes on the contract.",
  [`${N}unchanged`]: "The deal {work} already closed this way.",
};

export const pessoasFechoTranslations: Record<"en" | "pt", Record<string, string>> = { en, pt };
