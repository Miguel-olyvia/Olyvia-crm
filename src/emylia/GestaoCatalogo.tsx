// 13/11: o ecrã de GESTÃO do Catálogo, com cinco separadores: «Categorias» (categoria → subcategorias dos produtos), «Subcategorias» (lista plana), «Marcas», «Atributos»
// (a gestão dos atributos de GestaoAtributos, embutida) e «Referência (SKU)» (GestaoSku: a ordem da referência; categoria e subcategoria presas). Abre no lugar da lista,
// na página real. O separador escolhido vive no endereço
// (CatalogoV1: ?atributos=categorias|subcategorias|marcas|sku|1; «1» é o endereço antigo e abre os Atributos). Só o separador escolhido está montado e lê da base.
import { useId, useRef, type KeyboardEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTA } from "./pecasForm";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { GestaoAtributos } from "./GestaoAtributos";
import { GestaoCategorias } from "./GestaoCategorias";
import { GestaoMarcas } from "./GestaoMarcas";
import { GestaoSku } from "./GestaoSku";
import { GestaoSubcategorias } from "./GestaoSubcategorias";

export type SeparadorGestao = "categorias" | "subcategorias" | "marcas" | "atributos" | "sku";
const SEPARADORES: readonly (readonly [SeparadorGestao, string])[] = [["categorias", "Categorias"], ["subcategorias", "Subcategorias"], ["marcas", "Marcas"], ["atributos", "Atributos"], ["sku", "Referência (SKU)"]];

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
        <p className={cn(NOTA, "mt-1")}>Categorias, subcategorias, marcas, atributos e referência (SKU) dos produtos. Valem para toda a organização.</p>
      </div>
      <div role="tablist" aria-label="Gestão do Catálogo" className="flex flex-wrap gap-2">
        {SEPARADORES.map(([s, rot], i) => {
          const on = s === separador;
          return (
            <button key={s} ref={(el) => { tabs.current[s] = el; }} id={idTab(s)} type="button" role="tab" aria-selected={on} aria-controls={on ? idPainel : undefined} tabIndex={on ? 0 : -1}
              onClick={() => onSeparador(s)} onKeyDown={(e) => aoTeclar(e, i)}
              className={cn("inline-flex min-h-11 items-center rounded-lg border px-4 text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-foreground/40 bg-card text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {rot}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={idPainel} aria-labelledby={idTab(separador)}>
        {separador === "categorias" && <GestaoCategorias real={real} anunciar={anunciar} />}
        {separador === "subcategorias" && <GestaoSubcategorias real={real} anunciar={anunciar} />}
        {separador === "marcas" && <GestaoMarcas real={real} anunciar={anunciar} />}
        {separador === "atributos" && <GestaoAtributos real={real} voltar={voltar} anunciar={anunciar} embutido />}
        {separador === "sku" && <GestaoSku real={real} anunciar={anunciar} irPara={onSeparador} />}
      </div>
    </div>
  );
}
