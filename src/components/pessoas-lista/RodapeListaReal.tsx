import type { RefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";

const R = "pessoasPagina.real.";

interface RodapeListaRealProps {
  lista: ListaPessoas;
  /** O botão «Carregar mais» (fica montado durante o carregamento, com aria-disabled). */
  botaoMaisRef: RefObject<HTMLButtonElement>;
  /** O botão «Tentar de novo» do erro ao carregar mais. */
  repetirRef: RefObject<HTMLButtonElement>;
  /** Chamado quando o utilizador usa um dos botões: pede que o foco acompanhe o resultado. */
  aoPedirMais: () => void;
}

/** «Carregar mais», ou o erro ao carregar mais com «Tentar de novo». Nada com a lista anterior ou sem linhas. */
export function RodapeListaReal({ lista, botaoMaisRef, repetirRef, aoPedirMais }: RodapeListaRealProps) {
  const { t } = useTranslation();
  if (lista.erroSemDados || lista.aMostrarAnterior || lista.linhas.length === 0) return null;
  if (lista.erroAoCarregarMais) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <p>{t(`${R}loadMoreError`)}</p>
        <Button
          ref={repetirRef} type="button" variant="outline" className={`min-h-11 ${FOCO}`}
          onClick={() => { aoPedirMais(); lista.carregarMais(); }}
        >
          {t(`${R}retry`)}
        </Button>
      </div>
    );
  }
  if (!lista.haMais) return null;
  // aria-disabled (e não disabled) mantém o botão focável: o foco não se perde enquanto carrega.
  return (
    <Button
      ref={botaoMaisRef} type="button" variant="outline" className={`min-h-11 ${FOCO}`}
      aria-disabled={lista.isFetchingMore ? "true" : undefined}
      onClick={() => {
        if (lista.isFetchingMore) return;
        aoPedirMais();
        lista.carregarMais();
      }}
    >
      {lista.isFetchingMore ? t(`${R}loadingMore`) : t(`${R}loadMore`)}
    </Button>
  );
}
