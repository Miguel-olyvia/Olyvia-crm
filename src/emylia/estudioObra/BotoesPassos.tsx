// 23/11 (Rúben: «botões de undo e voltar para a frente para todas as alterações feitas»): ↶ Anular e ↷ Refazer no topo do Estúdio da obra,
// cada um a dizer o que vai fazer, e a lista dos últimos passos para voltar a um ponto. Os passos que não se anulam dizem porquê.
import { useEffect, useRef, useState } from "react";
import { Check, History, Lock, Redo2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Passo } from "./passosObra";

/** O que os botões leem de um passo (24/11: só o tipo alargado, para o novo Inventário também os usar; o Estúdio passa Passo). */
export type PassoBotao = Pick<Passo, "n" | "texto" | "pode" | "porque">;

export function BotoesPassos({ L, pos, anular, refazer, voltarAte }: { L: PassoBotao[]; pos: number; anular: () => void; refazer: () => void; voltarAte: (k: number) => void }) {
  const [lista, setLista] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!lista) return;
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setLista(false); };
    window.addEventListener("pointerdown", fora);
    return () => window.removeEventListener("pointerdown", fora);
  }, [lista]);
  const ant = L[pos - 1], prox = L[pos];
  const tAnular = ant ? (ant.pode ? `Anular: ${ant.texto}` : `Não se anula: ${ant.texto}`) : "Nada para anular";
  const tRefazer = prox ? `Refazer: ${prox.texto}` : "Nada para refazer";
  const botao = "grid h-11 w-11 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div ref={caixa} className="relative inline-flex items-center rounded-xl border border-input bg-background" role="group" aria-label="Anular e refazer">
      <button type="button" className={botao} disabled={!ant} onClick={anular} aria-label={`${tAnular} (Ctrl+Z)`} title={`${tAnular} (Ctrl+Z)`}>
        {ant && !ant.pode ? <Lock className="h-4 w-4 text-amber-600" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}
      </button>
      <button type="button" className={botao} disabled={!prox} onClick={refazer} aria-label={`${tRefazer} (Ctrl+Shift+Z)`} title={`${tRefazer} (Ctrl+Shift+Z)`}>
        <Redo2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" className={cn(botao, "w-auto gap-1 px-2 text-xs tabular-nums")} disabled={!L.length} aria-expanded={lista} aria-label={`Os passos (${L.length})`} onClick={() => setLista((x) => !x)}>
        <History className="h-4 w-4" aria-hidden="true" />{L.length > 0 && <span>{L.length}</span>}
      </button>
      {lista && L.length > 0 && (
        <div role="dialog" aria-label="Os passos" className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,90vw)] rounded-2xl border border-border bg-card p-2 shadow-xl">
          <p className="px-2 py-1 text-xs text-muted-foreground">Os passos desta sessão, do mais recente. Toque num para voltar até ele.</p>
          <ol className="max-h-80 space-y-0.5 overflow-y-auto">
            <li>
              <button type="button" onClick={() => { voltarAte(L.length - 1); setLista(false); }} disabled={pos === L.length} className="w-full rounded-lg px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted disabled:hidden">Refazer tudo</button>
            </li>
            {[...L].map((x, k) => ({ x, k })).reverse().map(({ x, k }) => {
              const feito = k < pos;
              return (
                <li key={x.n}>
                  <button type="button" onClick={() => { voltarAte(k); setLista(false); }} title={x.pode ? undefined : x.porque}
                    className={cn("flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted", !feito && "text-muted-foreground line-through decoration-muted-foreground/50", k === pos - 1 && "bg-primary/[0.06]")}>
                    <span aria-hidden="true" className="mt-0.5 shrink-0">{!x.pode ? <Lock className="h-3.5 w-3.5 text-amber-600" /> : k === pos - 1 ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="block h-3.5 w-3.5" />}</span>
                    <span className="min-w-0">
                      <span className="block">{x.texto}</span>
                      {!x.pode && <span className="block text-xs text-amber-800 no-underline dark:text-amber-300">{x.porque}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => { voltarAte(-1); setLista(false); }} disabled={pos === 0} className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40">Como estava ao abrir</button>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
