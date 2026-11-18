// As peças que as listas do Catálogo partilham (CatalogoV1.tsx e ProdutosPagina.tsx): classes, a caixa de pesquisa, o «Vazio» e o selo «Novo».
import type { ReactNode } from "react";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ENTRADA } from "./PainelCatalogo";
import { CAMPO } from "./pecasForm";

export const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
export const NOTA = "text-[15px] text-muted-foreground";
// Os valores à direita da linha (preço, custo, margem). No telemóvel passam para uma linha própria por baixo do nome, lado a lado,
// para o nome não ficar espremido numa coluna estreita; a partir de sm voltam a ser a coluna da direita.
export const VALORES = "flex basis-full flex-wrap items-baseline gap-x-3 sm:block sm:basis-auto sm:shrink-0 sm:text-right";
// 27/10: o que se acabou de criar (CriarNoCatalogo) vai para o topo da lista, realçado, com o selo «Novo»
export const REALCE = cn("-mx-4 rounded-xl bg-primary/5 px-4 ring-1 ring-primary/30 sm:-mx-5 sm:px-5", ENTRADA);

export function Procurar({ v, onChange, rotulo, ph, className }: { v: string; onChange: (s: string) => void; rotulo: string; ph: string; className?: string }) {
  return (
    <label className={cn("relative block w-full max-w-xl", className)}>
      <span className="sr-only">{rotulo}</span>
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" value={v} onChange={(e) => onChange(e.target.value)} placeholder={ph}
        className={cn(CAMPO, "pl-10 pr-3")} />
    </label>
  );
}
export const Vazio = ({ children }: { children: ReactNode }) => <li className={cn(NOTA, "py-4")}>{children}</li>;
export const Novo = () => <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 align-middle text-xs font-semibold text-primary-foreground"><Sparkles className="h-3 w-3" aria-hidden="true" />Novo</span>;
