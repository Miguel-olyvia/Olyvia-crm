/**
 * Cobertura de campos base por campos de campanha/formulário.
 *
 * O diálogo "Nova Lead" mostra os campos base (email, telefone, nome, ...) e,
 * quando há campanha escolhida, mostra também os campos extra dessa campanha.
 * Um campo base cujo valor a campanha já recolhe noutro campo é escondido do
 * ecrã para não pedir a mesma informação duas vezes.
 *
 * Esconder não chega: a escolha da campanha acontece DEPOIS de a caixa base já
 * poder estar preenchida (escrita pela pessoa ou preenchida automaticamente
 * pelo browser). O campo desaparecia do ecrã mas o valor ficava em memória e
 * era gravado na mesma. Em produção isto produziu uma lead com o email e o
 * telefone de uma cliente ao lado do `po_email`/`po_telefone` de outro — os
 * campos base sobreviveram porque a campanha usa chaves diferentes (`po_*`) e
 * só declara o mapeamento, sem escrever por cima.
 *
 * Por isso a regra vive aqui: uma só definição, usada na renderização e outra
 * vez na gravação, sem depender da ordem em que a pessoa mexe no formulário.
 */

/** Qualquer definição de campo de campanha/formulário com os mapeamentos relevantes. */
export interface CampaignFieldMappingLike {
  field_key?: string | null;
  contact_field_mapping?: string | null;
  client_field_mapping?: string | null;
}

/** Qualquer definição de campo base com a chave que identifica o valor. */
export interface BaseFieldKeyLike {
  field_key: string;
}

const normalize = (value: string | null | undefined): string => (value || "").toLowerCase();

/**
 * Um campo base está coberto quando algum campo de campanha o mapeia — por
 * `contact_field_mapping`, por `client_field_mapping` ou por usar exactamente a
 * mesma `field_key`. Comparação insensível a maiúsculas/minúsculas.
 */
export function isBaseFieldCoveredByCampaignFields(
  baseFieldKey: string,
  campaignFields: readonly CampaignFieldMappingLike[],
): boolean {
  if (campaignFields.length === 0) return false;
  const baseKey = normalize(baseFieldKey);
  if (!baseKey) return false;
  return campaignFields.some(
    (campaignField) =>
      normalize(campaignField.contact_field_mapping) === baseKey ||
      normalize(campaignField.client_field_mapping) === baseKey ||
      normalize(campaignField.field_key) === baseKey,
  );
}

/**
 * Devolve uma cópia dos valores sem as chaves base que a campanha já cobre.
 * Só remove chaves que pertencem aos campos base: chaves internas (ex.:
 * `_assigned_to`) e chaves exclusivas da campanha passam intactas.
 *
 * Quando o campo da campanha usa exactamente a mesma `field_key` do campo base
 * (o caso do `first_name`), os dois partilham o mesmo slot de valores e é o
 * campo da campanha, visível, que lá escreve — apagar a chave deitaria fora o
 * que a pessoa escreveu. Nesse caso o valor fica.
 */
export function stripCampaignCoveredBaseValues<TValue>(
  values: Readonly<Record<string, TValue>>,
  baseFields: readonly BaseFieldKeyLike[],
  campaignFields: readonly CampaignFieldMappingLike[],
): Record<string, TValue> {
  if (campaignFields.length === 0) return { ...values };

  const campaignOwnKeys = new Set(campaignFields.map((campaignField) => normalize(campaignField.field_key)));
  const coveredKeys = new Set(
    baseFields
      .filter((baseField) => isBaseFieldCoveredByCampaignFields(baseField.field_key, campaignFields))
      .filter((baseField) => !campaignOwnKeys.has(normalize(baseField.field_key)))
      .map((baseField) => baseField.field_key),
  );
  if (coveredKeys.size === 0) return { ...values };

  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !coveredKeys.has(key)),
  ) as Record<string, TValue>;
}
