// O grupo FROTA do menu lateral único do protótipo (como MenuInventario): um item com o ícone do camião e um chevron, que se abre para os dez ecrãs
// da Frota com os contadores do protótipo HTML. Abre sozinho ao entrar na Frota e recolhe quando se sai. Só existe na V2 (quem a monta decide).
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInventario } from "../inventario/loja";
import { useFrota, type AbaFrota } from "./loja";
import { ICONE_FROTA, MENU_FROTA, contagem, type TomCont } from "./itensMenuFrota";
import { usePerfilFrota } from "./perfil";
import { stockCarrinha } from "./pontesInv";

const TOM: Record<TomCont, string> = { "": "bg-muted text-muted-foreground", warn: "bg-warning text-warning-foreground", bad: "bg-accent text-accent-foreground" };
const PILULA = "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums";
const SUB = "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[14px] transition-colors";

interface Props {
  aba: AbaFrota | null; aoIr: (a: AbaFrota) => void; iniciarAberto?: boolean;
  /** 23/10: aberto controlado por quem monta o menu (um grupo aberto de cada vez); sem isto, o grupo gere-se sozinho */
  aberto?: boolean; aoAlternar?: (abrir: boolean) => void;
}
/** `aba` é o ecrã aberto (null quando se está noutra página do protótipo). */
export default function MenuFrota({ aba, aoIr, iniciarAberto = false, aberto: abertoFora, aoAlternar }: Props) {
  const F = useFrota();
  const inv = useInventario();
  const perfil = usePerfilFrota();
  const dentro = aba !== null;
  const [abertoLocal, setAbertoLocal] = useState(dentro || iniciarAberto);
  const aberto = abertoFora ?? abertoLocal;
  const setAberto = (v: boolean): void => { if (aoAlternar) aoAlternar(v); else setAbertoLocal(v); };
  const lista = useId();
  // abre ao entrar na Frota e recolhe ao sair (não na montagem: o estado inicial já o diz, e um clique feito antes do efeito não se perde)
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    if (aoAlternar) return; if (dentro) setAbertoLocal(true); else if (!iniciarAberto) setAbertoLocal(false);
  }, [dentro, iniciarAberto, aoAlternar]);
  const stock = (vid: string) => stockCarrinha(inv, F.viaturas.find((v) => v.id === vid)?.armazemId);
  return (
    <div data-testid="menu-frota">
      <button type="button" aria-expanded={aberto} aria-controls={lista} onClick={() => setAberto(!aberto)}
        className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors", dentro ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground")}>
        <ICONE_FROTA className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span className="flex-1">Frota</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
      </button>
      {aberto ? (
        <div id={lista} className="ml-[21px] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
          {MENU_FROTA.map(([k, t, Ic]) => {
            const c = contagem(F, perfil, k, stock);
            return (
              <button key={k} type="button" aria-current={aba === k ? "page" : undefined} onClick={() => aoIr(k)}
                className={cn(SUB, aba === k ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground")}>
                <Ic className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">{t}</span>
                {c ? (c.tom ? <span className={cn(PILULA, TOM[c.tom])} title={c.dica} aria-label={`${c.n}: ${c.dica}`}>{c.n}</span>
                  : <span className="text-[13px] tabular-nums text-muted-foreground" aria-label={`${c.n}: ${c.dica}`}>{c.n}</span>) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
