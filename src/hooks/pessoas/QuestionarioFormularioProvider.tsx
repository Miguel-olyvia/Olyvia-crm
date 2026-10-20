import { useMemo, type ReactNode } from "react";
import { QuestionarioContext, type ValorQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { aplicarGravadas, type RespostaGravada } from "@/components/negocio-metas/respostasQuestionario";
import { useQuestionarioFormulario } from "./useQuestionarioFormulario";

interface Props {
  /**
   * As respostas já gravadas do levantamento que se abre (com o snapshot): o formulário mostra o texto gravado, não o atual, e as respostas a
   * perguntas ou opções entretanto desativadas continuam visíveis (D5).
   */
  gravadas?: readonly RespostaGravada[];
  children: ReactNode;
}

/** Dá aos formulários do levantamento as perguntas da base (ou o catálogo do código fora do modo real), com o estado e o «Repetir». */
export function QuestionarioFormularioProvider({ gravadas, children }: Props) {
  const lido = useQuestionarioFormulario();
  const valor = useMemo((): ValorQuestionario => {
    // Só com o questionário carregado: sem ele não há onde pôr as respostas antigas, e o formulário mostra o estado de carregamento ou o erro.
    if (lido.estado !== "pronto" || !gravadas || gravadas.length === 0) return lido;
    return { ...lido, questionario: aplicarGravadas(lido.questionario, gravadas) };
  }, [lido, gravadas]);
  return <QuestionarioContext.Provider value={valor}>{children}</QuestionarioContext.Provider>;
}
