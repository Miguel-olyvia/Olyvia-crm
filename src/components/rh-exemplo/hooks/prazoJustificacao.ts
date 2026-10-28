/**
 * O prazo para justificar: as constantes e a janela dos desvios, de @/lib/hr, reexportadas para o resto do /rh-exemplo.
 * Fora de hooks/ nada importa de @/lib/hr (regra do semBase.test.ts), por isso o numero 5 e os limites 1 a 30 vivem num
 * so sitio (src/lib/hr/regrasAssiduidade.ts) e chegam aqui por este wrapper, sem React nem base.
 */
export {
  PRAZO_JUSTIFICACAO_MAX,
  PRAZO_JUSTIFICACAO_MIN,
  PRAZO_JUSTIFICACAO_OMISSAO,
  janelaDeDesviosDias,
  prazoJustificacaoValido,
} from "@/lib/hr/regrasAssiduidade";
