// Protótipo (visualizador 3D): o bloco de filtros do passo «Escolher produtos» (marca e categoria com contagem, «só com preço», «ainda sem família», «só os escolhidos»).
// Em ecrã estreito fica num bloco recolhível «Filtros (n)» (aria-expanded); a partir de md está sempre visível. A lógica vive em filtrosCatalogo.ts; aqui só se desenha.
import { useId, useState } from "react";
import { sem } from "./catalogo3d";
import { BTN, INP } from "./estilosPainel";
import type { Faceta, FiltrosCatalogo } from "./filtrosCatalogo";

/** Acima deste número de valores a faceta ganha uma pesquisa própria. */
const LIMITE_PESQUISA_FACETA = 12;
const LINHA = "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-[15px] hover:bg-accent";

function FacetaLista({ titulo, itens, onAlternar }: { titulo: string; itens: readonly Faceta[]; onAlternar: (valor: string) => void }) {
  const [q, setQ] = useState("");
  const termo = sem(q.trim());
  const visiveis = termo ? itens.filter((x) => x.marcada || sem(x.rotulo).includes(termo)) : itens;
  return (
    <fieldset className="grid min-w-0 gap-1 rounded-xl border border-border p-2">
      <legend className="px-1 text-sm font-semibold">{titulo}</legend>
      {itens.length > LIMITE_PESQUISA_FACETA && (
        <input type="search" aria-label={`Procurar ${titulo.toLowerCase()}`} placeholder={`Procurar ${titulo.toLowerCase()}`} className={INP} value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {visiveis.length === 0
        ? <p className="px-2 text-sm text-muted-foreground">Nenhum valor com «{q.trim()}».</p>
        : (
          <ul className="max-h-48 overflow-y-auto">
            {visiveis.map((x) => (
              <li key={x.valor}>
                <label className={LINHA}>
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={x.marcada} onChange={() => onAlternar(x.valor)} />
                  <span className="min-w-0 break-words">{`${x.rotulo} (${x.n})`}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
    </fieldset>
  );
}

const alternarEm = (lista: readonly string[], v: string): string[] => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

export interface FiltrosEscolherProps {
  filtros: FiltrosCatalogo; onFiltros: (f: FiltrosCatalogo) => void;
  marcas: readonly Faceta[]; categorias: readonly Faceta[];
  /** o catálogo tem mais de uma marca / categoria? Com um só valor a faceta não filtra nada e não se mostra */
  comMarcas: boolean; comCategorias: boolean;
  /** quantos filtros (fora a pesquisa) estão ativos: vai no rótulo do botão */
  nAtivos: number;
}
export function FiltrosEscolher({ filtros, onFiltros, marcas, categorias, comMarcas, comCategorias, nAtivos }: FiltrosEscolherProps) {
  const [aberto, setAberto] = useState(false), idPainel = useId();
  const interruptor = (rotulo: string, chave: "soComPreco" | "semFamilia" | "soEscolhidos") => (
    <label className={LINHA}>
      <input type="checkbox" className="h-5 w-5 shrink-0" checked={filtros[chave]} onChange={() => onFiltros({ ...filtros, [chave]: !filtros[chave] })} />
      {rotulo}
    </label>
  );
  return (
    <div className="grid gap-2">
      <button type="button" className={`${BTN} cursor-pointer justify-between md:hidden`} aria-expanded={aberto} aria-controls={idPainel} onClick={() => setAberto((v) => !v)}>
        <span>{`Filtros (${nAtivos})`}</span><span aria-hidden="true">{aberto ? "▴" : "▾"}</span>
      </button>
      <div id={idPainel} className={`${aberto ? "grid" : "hidden"} gap-2 md:grid md:grid-cols-2`}>
        {comMarcas && <FacetaLista titulo="Marca" itens={marcas} onAlternar={(v) => onFiltros({ ...filtros, marcas: alternarEm(filtros.marcas, v) })} />}
        {comCategorias && <FacetaLista titulo="Categoria" itens={categorias} onAlternar={(v) => onFiltros({ ...filtros, categorias: alternarEm(filtros.categorias, v) })} />}
        <fieldset className="grid min-w-0 gap-1 rounded-xl border border-border p-2 md:col-span-2">
          <legend className="px-1 text-sm font-semibold">Mais filtros</legend>
          <div className="grid gap-x-3 sm:grid-cols-3">
            {interruptor("Só com preço de venda", "soComPreco")}
            {interruptor("Ainda sem família", "semFamilia")}
            {interruptor("Só os escolhidos", "soEscolhidos")}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
