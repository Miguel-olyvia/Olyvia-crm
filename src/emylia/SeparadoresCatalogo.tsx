// 17/11 (correção do utilizador): os separadores de dentro das páginas Produtos (Lista, Categorias, Subcategorias, Modelos, Marcas, Atributos,
// Referência) e Serviços (Lista, Equipamentos, Consumíveis, Técnicos, Ligações). O desenho é o da barra do Catálogo (CatalogoV1) e o teclado o da
// gestão (GestaoCatalogo: setas, Início e Fim escolhem). Cada separador é uma rota: quem monta a página diz como navegar (`ir`).
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { SEPARADORES_CATALOGO, idSeparadorCatalogo, type GrupoCatalogo } from "./catalogoRotas";

export function SeparadoresCatalogo({ grupo, ativo, ir, painelId }: { grupo: GrupoCatalogo; ativo: string; ir: (caminho: string) => void; painelId: string }) {
  const lista = SEPARADORES_CATALOGO[grupo];
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = lista.length;
    const para = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (para < 0) return;
    e.preventDefault();
    const { chave, to } = lista[para];
    ir(to);
    // a rota nova pode montar a página de novo: o foco vai quando o separador já estiver no ecrã
    requestAnimationFrame(() => (tabs.current[chave] ?? document.getElementById(idSeparadorCatalogo(chave)))?.focus());
  };
  return (
    <div role="tablist" aria-label={grupo === "produtos" ? "Separadores dos Produtos" : "Separadores dos Serviços"}
      className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]">
      {lista.map(({ chave, rotulo, to }, i) => {
        const on = chave === ativo;
        return (
          <button key={chave} ref={(el) => { tabs.current[chave] = el; }} id={idSeparadorCatalogo(chave)} type="button" role="tab" aria-selected={on}
            aria-controls={on ? painelId : undefined} tabIndex={on ? 0 : -1} onClick={() => ir(to)} onKeyDown={(e) => aoTeclar(e, i)}
            className={cn("min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}
