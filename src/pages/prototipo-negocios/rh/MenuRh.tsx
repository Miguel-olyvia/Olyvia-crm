// O grupo RECURSOS HUMANOS do menu lateral do protótipo (como MenuFrota): um botão com o ícone e um chevron que abre as entradas, em dois grupos
// (gestão e "A minha área"). Abre sozinho ao entrar no RH e recolhe quando se sai. Só dados de teste: ver RhPagina.
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ABAS_RH, GRUPO_RH, ICONE_RH, TITULO_RH, idioma, type AbaRh, type GrupoRh } from "./abas";

const SUB = "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
const GRUPOS: readonly GrupoRh[] = ["gestao", "eu"];

interface Props { aba: AbaRh | null; aoIr: (a: AbaRh) => void; iniciarAberto?: boolean }
/** `aba` é o ecrã aberto (null quando se está noutra página do protótipo). */
export default function MenuRh({ aba, aoIr, iniciarAberto = false }: Props) {
  const lg = idioma();
  const dentro = aba !== null;
  const [aberto, setAberto] = useState(dentro || iniciarAberto);
  const lista = useId();
  // abre ao entrar no RH e recolhe ao sair (não na montagem: o estado inicial já o diz)
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    if (dentro) setAberto(true); else if (!iniciarAberto) setAberto(false);
  }, [dentro, iniciarAberto]);
  return (
    <div data-testid="menu-rh">
      <button type="button" aria-expanded={aberto} aria-controls={lista} onClick={() => setAberto(!aberto)}
        className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", dentro ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground")}>
        <ICONE_RH className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span className="flex-1">{TITULO_RH[lg]}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
      </button>
      {aberto ? (
        <nav id={lista} aria-label={TITULO_RH[lg]} className="ml-[21px] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
          {GRUPOS.map((g) => (
            <div key={g} role="group" aria-labelledby={`${lista}-${g}`} className="flex flex-col gap-0.5">
              <p id={`${lista}-${g}`} className="px-3 pb-0.5 pt-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{GRUPO_RH[g][lg]}</p>
              {ABAS_RH.filter((a) => a.grupo === g).map((a) => (
                <button key={a.k} type="button" aria-current={aba === a.k ? "page" : undefined} onClick={() => aoIr(a.k)}
                  className={cn(SUB, aba === a.k ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground")}>
                  <a.icone className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">{a.rotulo[lg]}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
