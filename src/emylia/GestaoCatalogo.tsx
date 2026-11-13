// 13/11: o ecrã de GESTÃO do Catálogo, com três separadores: «Categorias» (categoria → subcategorias dos produtos), «Marcas» e «Atributos»
// (a gestão dos atributos de GestaoAtributos, embutida). Abre no lugar da lista, na página real. O separador escolhido vive no endereço
// (CatalogoV1: ?atributos=categorias|marcas|1; «1» é o endereço antigo e abre os Atributos). Só o separador escolhido está montado e lê da base.
import { useId, useRef, type KeyboardEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTA } from "./pecasForm";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { GestaoAtributos } from "./GestaoAtributos";
import { GestaoCategorias } from "./GestaoCategorias";
import { GestaoMarcas } from "./GestaoMarcas";

export type SeparadorGestao = "categorias" | "marcas" | "atributos";
const SEPARADORES: readonly (readonly [SeparadorGestao, string])[] = [["categorias", "Categorias"], ["marcas", "Marcas"], ["atributos", "Atributos"]];

export function GestaoCatalogo({ real, separador, onSeparador, voltar, anunciar }: {
  real: FichaProdutoReal; separador: SeparadorGestao; onSeparador: (s: SeparadorGestao) => void; voltar: () => void; anunciar: (msg: string) => void;
}) {
  const id = useId();
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const idTab = (s: SeparadorGestao) => `${id}-tab-${s}`;
  const idPainel = `${id}-painel`;
  // setas, Home e End: movem e escolhem (separadores com ativação automática; o painel só lê quando é escolhido)
  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = SEPARADORES.length;
    const para = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (para < 0) return;
    e.preventDefault();
    const [s] = SEPARADORES[para];
    onSeparador(s);
    tabs.current[s]?.focus();
  };
  return (
    <div className="grid gap-5">
      <div>
        <button type="button" onClick={voltar} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[15px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar ao Catálogo
        </button>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gestão do Catálogo</h1>
        <p className={cn(NOTA, "mt-1")}>Categorias, marcas e atributos dos produtos. Valem para toda a organização.</p>
      </div>
      <div role="tablist" aria-label="Gestão do Catálogo" className="flex flex-wrap gap-2">
        {SEPARADORES.map(([s, rot], i) => {
          const on = s === separador;
          return (
            <button key={s} ref={(el) => { tabs.current[s] = el; }} id={idTab(s)} type="button" role="tab" aria-selected={on} aria-controls={on ? idPainel : undefined} tabIndex={on ? 0 : -1}
              onClick={() => onSeparador(s)} onKeyDown={(e) => aoTeclar(e, i)}
              className={cn("inline-flex min-h-11 items-center rounded-lg border px-4 text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {rot}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={idPainel} aria-labelledby={idTab(separador)}>
        {separador === "categorias" && <GestaoCategorias real={real} anunciar={anunciar} />}
        {separador === "marcas" && <GestaoMarcas real={real} anunciar={anunciar} />}
        {separador === "atributos" && <GestaoAtributos real={real} voltar={voltar} anunciar={anunciar} embutido />}
      </div>
    </div>
  );
}
