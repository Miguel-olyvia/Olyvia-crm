import { createContext, useContext } from "react";
import { QUESTIONARIO_CODIGO, type QuestionarioForm } from "./questionarioForm";

/** Onde está a leitura das perguntas: a carregar, pronta ou falhada. */
export type EstadoDoQuestionario = "a-carregar" | "pronto" | "erro";

/**
 * O que o formulário do levantamento sabe do questionário. Esta pasta não fala com a base: quem lê da base (`@/hooks/pessoas`) fornece
 * isto por contexto. Sem fornecedor vale o catálogo do código (o protótipo sem base), sempre pronto.
 */
export interface ValorQuestionario {
  questionario: QuestionarioForm;
  estado: EstadoDoQuestionario;
  /** O erro da leitura (um `ErroNeg` quando a base o explica); null se não houve. */
  erro: unknown;
  /** Só se pode gravar com o questionário carregado: a gravação valida as respostas contra a versão que a pessoa viu. */
  podeGuardar: boolean;
  /** Volta a pedir as perguntas (o botão «Repetir»). */
  repetir: () => void;
  /** Lê de novo ignorando a cache e devolve o que leu (null se falhou). */
  recarregar: () => Promise<QuestionarioForm | null>;
}

const SEM_FORNECEDOR: ValorQuestionario = {
  questionario: QUESTIONARIO_CODIGO, estado: "pronto", erro: null, podeGuardar: true, repetir: () => {}, recarregar: async () => QUESTIONARIO_CODIGO,
};

export const QuestionarioContext = createContext<ValorQuestionario>(SEM_FORNECEDOR);

export const useQuestionario = (): ValorQuestionario => useContext(QuestionarioContext);
