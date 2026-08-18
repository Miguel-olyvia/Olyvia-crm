// Lista partilhada de motivos usada sempre que um orçamento é marcado como
// Perdido ou Rejeitado (ação individual em Quotes.tsx, alteração de estado em
// massa em Quotes.tsx, e o QuoteBuilder ao gravar estado = "rejeitado").
// Centralizada aqui para nunca duplicar a lista entre os vários pontos de uso.
export const QUOTE_LOST_REASONS = [
  "Preço elevado",
  "Concorrência",
  "Sem resposta",
  "Desistência do cliente",
  "Outro",
] as const;
