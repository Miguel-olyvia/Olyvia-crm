// O "?" de ajuda da V2: um botão pequeno (alvo de 44 px) que abre o texto de ajuda logo por baixo,
// na própria página (sem diálogo). Usa-se junto a um título: <Ajuda titulo="Margens">…</Ajuda>.
// O texto fica num elemento à parte (`AjudaTexto`) para poder ir para a linha de baixo do título.
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface EstadoAjuda { aberta: boolean; alternar: () => void; id: string; titulo: string }
const Ctx = createContext<EstadoAjuda | null>(null);

/** Junta o botão e o texto: o botão vai onde se quiser (no título), o texto onde estiver `AjudaTexto`. */
export function ComAjuda({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const id = useId();
  return <Ctx.Provider value={{ aberta, alternar: () => setAberta((v) => !v), id, titulo }}>{children}</Ctx.Provider>;
}

export function AjudaBotao({ className }: { className?: string }) {
  const a = useContext(Ctx);
  if (!a) return null;
  return (
    <button type="button" aria-expanded={a.aberta} aria-controls={a.id} aria-label={`Ajuda: ${a.titulo}`} onClick={a.alternar}
      className={cn("inline-grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground", className)}>
      <HelpCircle className="h-5 w-5 text-primary" aria-hidden="true" />
    </button>
  );
}

export function AjudaTexto({ children, className }: { children: ReactNode; className?: string }) {
  const a = useContext(Ctx);
  if (!a) return null;
  return (
    <div id={a.id} hidden={!a.aberta} className={cn("mt-2 border-l-2 border-primary/40 pl-4 text-[15px] text-muted-foreground", className)}>
      {children}
    </div>
  );
}

/** A forma mais simples: o botão e, por baixo, o texto. */
export function Ajuda({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <ComAjuda titulo={titulo}>
      <div className={className}>
        <AjudaBotao />
        <AjudaTexto>{children}</AjudaTexto>
      </div>
    </ComAjuda>
  );
}
