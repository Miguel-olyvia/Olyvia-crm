// Os estados que o formulário de uma encomenda de compra oferece. A base recusa criar com outro estado que não «pendente»
// («Uma encomenda nasce pendente…»; encomendada só com purchase_orders.approve, e isso faz-se por «Aprovar e enviar»),
// por isso «Cancelada» é só de edição. Os restantes seguem o que o formulário já fazia.
export interface PoStatusOption {
  value: string;
  disabled: boolean;
}

export interface PoStatusOptionsInput {
  /** `editingId` não nulo. */
  editing: boolean;
  /** O estado que está no formulário. */
  currentStatus: string;
  /** O estado gravado da encomenda em edição (null ao criar). */
  savedStatus: string | null;
}

export function poStatusOptions({ editing, currentStatus, savedStatus }: PoStatusOptionsInput): PoStatusOption[] {
  const options: PoStatusOption[] = [{ value: "pending", disabled: false }];
  if (!editing) return options;
  // «Encomendada» passa só por «Aprovar e enviar»; continua visível (desativada) quando já está encomendada.
  if (savedStatus === "ordered") options.push({ value: "ordered", disabled: true });
  // «Recebida» passa pela receção; «parcialmente recebida» deriva das receções e nunca é manual.
  if (currentStatus === "received") options.push({ value: "received", disabled: false });
  if (currentStatus === "partially_received") options.push({ value: "partially_received", disabled: true });
  options.push({ value: "cancelled", disabled: false });
  return options;
}
