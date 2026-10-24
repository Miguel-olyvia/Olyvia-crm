import { useCallback, useEffect, useMemo, useState } from "react";
import type { QuestionarioEd, SeccaoEd } from "./questionario";
import { limparCondicoes } from "./questionarioEdicao";

export interface RascunhoHook {
  /** As secções a mostrar: o rascunho, ou o que a base tem enquanto não se mexeu em nada. */
  seccoes: SeccaoEd[];
  /** A versão do questionário em que as alterações começaram (a que se envia ao gravar); sem rascunho, a da base. */
  versao: number;
  /** Há alterações por gravar (o rascunho é diferente do que a base tem). */
  sujo: boolean;
  /** Existe um rascunho (alterou-se algo desde que se abriu ou descartou), mesmo que tenha voltado a ser igual ao que a base tem. Sem rascunho o ecrã mostra o que a base tem. */
  temRascunho: boolean;
  /** Muda o rascunho: a função recebe as secções atuais e devolve as novas. Sem dados ainda, não faz nada. */
  alterar: (f: (seccoes: SeccaoEd[]) => SeccaoEd[]) => void;
  /** Passa o rascunho para outra versão da base (depois de um NG021), sem perder o que se escreveu. */
  rebasear: (versao: number) => void;
  /** Deita fora o rascunho e volta a mostrar o que a base tem. */
  descartar: () => void;
}

interface Estado {
  seccoes: SeccaoEd[];
  versao: number;
}

/**
 * O rascunho do levantamento: o que o utilizador escreveu por cima do que a base tem. Vive no diálogo (e não no separador) para sobreviver à
 * troca de separador e para o diálogo saber se há alterações por gravar. Guarda a versão em que as alterações começaram: se outra pessoa gravar
 * entretanto, o ecrã continua a enviar a versão antiga e a base responde NG021, em vez de se gravar por cima sem querer. `habilitado` false
 * (diálogo fechado) apaga o rascunho.
 */
export function useRascunhoQuestionario(dados: QuestionarioEd | null, habilitado: boolean): RascunhoHook {
  const [estado, setEstado] = useState<Estado | null>(null);

  useEffect(() => {
    if (!habilitado) setEstado(null);
  }, [habilitado]);

  const alterar = useCallback((f: (seccoes: SeccaoEd[]) => SeccaoEd[]) => {
    setEstado((anterior) => {
      const base = anterior ?? (dados ? { seccoes: dados.seccoes, versao: dados.versao } : null);
      if (!base) return anterior;
      return { ...base, seccoes: limparCondicoes(f(base.seccoes)) };
    });
  }, [dados]);

  const rebasear = useCallback((versao: number) => {
    setEstado((anterior) => (anterior ? { ...anterior, versao } : anterior));
  }, []);
  const descartar = useCallback(() => setEstado(null), []);

  const sujo = useMemo(() => estado !== null && JSON.stringify(estado.seccoes) !== JSON.stringify(dados?.seccoes ?? null), [estado, dados]);

  return {
    seccoes: estado?.seccoes ?? dados?.seccoes ?? [],
    versao: estado?.versao ?? dados?.versao ?? 0,
    sujo,
    temRascunho: estado !== null,
    alterar,
    rebasear,
    descartar,
  };
}
