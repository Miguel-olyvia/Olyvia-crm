// O endereço da página "Pessoas": ?separador=submissoes escolhe o separador e ?open=<pessoaId>
// abre a ficha (ver `useParametroOpen`). O separador por defeito (Pessoas) não deixa marca no endereço.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useParametroOpen } from "@/components/negocio-metas/useParametroOpen";

export type SeparadorPagina = "pessoas" | "submissoes";

export function usePessoasUrl(podeVerSubmissoes: boolean) {
  const [params, setParams] = useSearchParams();
  const aberta = useParametroOpen();
  const separador: SeparadorPagina = podeVerSubmissoes && params.get("separador") === "submissoes" ? "submissoes" : "pessoas";
  const mudar = useCallback(
    (alterar: (p: URLSearchParams) => void) =>
      setParams((atual) => {
        const novo = new URLSearchParams(atual);
        alterar(novo);
        return novo;
      }, { replace: true }),
    [setParams],
  );
  const negocioId = params.get("negocio");
  return {
    separador,
    abertaId: aberta.id,
    /** O negócio a abrir dentro da ficha (`?negocio=`); só vale com uma ficha aberta. */
    negocioId: aberta.id === null ? null : negocioId,
    /** Abre a ficha da pessoa; com `negocioId`, abre-a já com esse negócio aberto. */
    abrir: useCallback((pessoaId: string, negocioId?: string) => aberta.abrir(pessoaId, { negocio: negocioId ?? null }), [aberta]),
    fechar: aberta.fechar,
    limpar: aberta.limpar,
    mudarSeparador: useCallback(
      (s: SeparadorPagina) => mudar((p) => (s === "submissoes" ? p.set("separador", "submissoes") : p.delete("separador"))),
      [mudar],
    ),
    /** Fecha a ficha e vai ao separador de submissões, numa só mudança de endereço. */
    irParaSubmissoes: useCallback(() => mudar((p) => { p.set("separador", "submissoes"); p.delete("open"); }), [mudar]),
  };
}
