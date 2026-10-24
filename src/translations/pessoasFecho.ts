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
  [`${N}contract.linked`]: "Este contrato fica ligado ao negócio «{work}».",
  [`${N}contract.linked.noTitle`]: "Este contrato fica ligado ao negócio.",
  [`${N}replace.reopens`]: "Este contrato deu o negócio como ganho. Ao gerar o substituto, o negócio reabre e fica à espera de nova assinatura; o substituto fica ligado a ele.",
  [`${N}replace.lost`]: "O negócio está perdido: o substituto não fica ligado a ele.",
  [`${N}replace.noPermission`]: "Sem permissão para editar este negócio, o substituto não se pode gerar daqui: ficaria sem negócio.",
  [`${N}replace.checking`]: "A verificar o negócio deste contrato. Só se pode anular com substituto quando a verificação terminar.",
  [`${N}replace.unavailable`]: "Não foi possível verificar o negócio deste contrato. Desmarque o substituto para anular, ou tente de novo.",
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
  [`${N}contract.linked`]: "This contract will be linked to the deal \"{work}\".",
  [`${N}contract.linked.noTitle`]: "This contract will be linked to the deal.",
  [`${N}replace.reopens`]: "This contract won the deal. Generating the replacement reopens the deal until the new one is signed; the replacement stays linked to it.",
  [`${N}replace.lost`]: "The deal is lost: the replacement will not be linked to it.",
  [`${N}replace.noPermission`]: "Without permission to edit this deal, the replacement cannot be generated from here: it would have no deal.",
  [`${N}replace.checking`]: "Checking the deal for this contract. You can only cancel with a replacement once the check finishes.",
  [`${N}replace.unavailable`]: "The deal for this contract could not be checked. Untick the replacement to cancel, or try again.",
};

export const pessoasFechoTranslations: Record<"en" | "pt", Record<string, string>> = { en, pt };
