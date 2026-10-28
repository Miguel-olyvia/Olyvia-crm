// O contexto da Emylia (ctx) com os efeitos configurados do levantamento: cada ação corre como sempre (o motor não se altera) e, logo a seguir e antes de
// o armazém gravar, refazem-se as linhas «Levantamento · …» configuradas (aplicarEfeitos.ts). Sem o questionário lido (a carregar, em erro, ou o de exemplo do
// código): o de exemplo não aplica nada; com o questionário a carregar ou em erro as ações ficam BLOQUEADAS (o motor apagaria as linhas «Levantamento · » configuradas
// e gravaria o orçamento sem elas), e quem usa mostra o estado e o «Tentar outra vez» (AvisoQuestionario). Precisa do QuestionarioFormularioProvider por cima.
import { useMemo } from "react";
import type { Ctx } from "@/emylia/pecas";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { aplicarEfeitosConfigurados } from "./aplicarEfeitos";

export function useCtxComEfeitos(ctx: Ctx | null): Ctx | null {
  const { questionario, estado } = useQuestionario();
  return useMemo(() => {
    if (!ctx) return ctx;
    if (estado !== "pronto") {
      const parada = (): void => {};
      return { ...ctx, run: parada, go: () => parada };
    }
    if (questionario.semBase) return ctx;
    const run = (fn: () => void): void => ctx.run(() => {
      fn();
      const d = ctx.S.deals.find((x) => x.id === ctx.S.deal);
      if (d) aplicarEfeitosConfigurados(d, questionario);
    });
    return { ...ctx, run, go: (fn: () => void) => () => run(fn) };
  }, [ctx, questionario, estado]);
}
