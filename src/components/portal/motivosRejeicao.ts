// Motivos de rejeição de propostas e contratos no portal do cliente.
// `valor` é o que se grava na base (proposals.rejection_reason_code / reason_code do contrato) e aparece nas
// notificações do CRM: é SEMPRE o texto português de sempre, em qualquer idioma do portal.
// `chave` é só a etiqueta visível, traduzida por idioma.
export interface MotivoDeRejeicao {
  valor: string;
  chave: string;
}

export const MOTIVOS_REJEICAO_PROPOSTA: readonly MotivoDeRejeicao[] = [
  { valor: "Preço alto", chave: "pc.propostaDet.motivo.precoAlto" },
  { valor: "Encontrei alternativa", chave: "pc.propostaDet.motivo.alternativa" },
  { valor: "Já não preciso", chave: "pc.propostaDet.motivo.naoPreciso" },
  { valor: "Prazo não serve", chave: "pc.propostaDet.motivo.prazo" },
  { valor: "Vou adiar", chave: "pc.propostaDet.motivo.adiar" },
  { valor: "Outro", chave: "pc.propostaDet.motivo.outro" },
];

export const MOTIVOS_REJEICAO_CONTRATO: readonly MotivoDeRejeicao[] = [
  { valor: "Condições não adequadas", chave: "pc.contratoDet.motivo.condicoes" },
  { valor: "Preço alto", chave: "pc.contratoDet.motivo.precoAlto" },
  { valor: "Encontrei alternativa", chave: "pc.contratoDet.motivo.alternativa" },
  { valor: "Vou adiar", chave: "pc.contratoDet.motivo.adiar" },
  { valor: "Outro", chave: "pc.contratoDet.motivo.outro" },
];
