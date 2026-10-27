// O grupo INVENTÁRIO do menu lateral único do protótipo: um item como os outros (ícone, chevron) que se abre para Hoje, Compras e Armazém com os contadores do mockup.
// Abre sozinho ao entrar em qualquer ecrã do inventário e recolhe quando se sai; o chevron abre e fecha à mão. Só existe na V2 (quem a monta decide); os contadores vêm da base em memória.
import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AbaInv } from "./ctxInv";
import { GRUPOS, ICONE_HOJE, ICONE_INVENTARIO, grupoDe, pilulas, totalFila, type Pilula, type TomPilula } from "./menuInv";
import { podePerfil, usePerfil } from "./perfil";
import { useInventario } from "./loja";

const TOM: Record<TomPilula, string> = { "": "bg-muted text-muted-foreground", warn: "bg-warning text-warning-foreground", bad: "bg-accent text-accent-foreground" };
const PILULA = "pill grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums";
const Pil = ({ p }: { p?: Pilula }) => (p && p.n > 0
  ? <span className={cn(PILULA, TOM[p.tom])} title={p.dica} aria-label={`${p.n}: ${p.dica}`}>{p.n}</span> : null);
const SUB = "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[14px] transition-colors";
const estiloSub = (ativo: boolean): string => cn(SUB, ativo ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground");

interface Props {
  aba: AbaInv | null; aoIr: (a: AbaInv) => void; iniciarAberto?: boolean;
  /** 23/10: aberto controlado por quem monta o menu (um grupo aberto de cada vez); sem isto, o grupo gere-se sozinho */
  aberto?: boolean; aoAlternar?: (abrir: boolean) => void;
}
/** `aba` é o ecrã aberto (null quando se está noutra página do protótipo). */
export default function MenuInventario({ aba, aoIr, iniciarAberto = false, aberto: abertoFora, aoAlternar }: Props) {
  const db = useInventario();
  const perfil = usePerfil();
  const pil = pilulas(db);
  const total = totalFila(db);
  const dentro = aba !== null;
  const ativo = aba ? grupoDe(aba)?.id : undefined;
  const [abertoLocal, setAbertoLocal] = useState(dentro || iniciarAberto);
  const aberto = abertoFora ?? abertoLocal;
  const setAberto = (v: boolean): void => { if (aoAlternar) aoAlternar(v); else setAbertoLocal(v); };
  const lista = useId();
  useEffect(() => { if (aoAlternar) return; if (dentro) setAbertoLocal(true); else if (!iniciarAberto) setAbertoLocal(false); }, [dentro, iniciarAberto, aoAlternar]);
  // Um perfil que não vê o ecrã aberto volta ao Hoje.
  useEffect(() => {
    const item = GRUPOS.flatMap((g) => g.itens).find((i) => i.aba === aba);
    if (item && !podePerfil(perfil, item.perm)) aoIr("hoje");
  }, [aba, perfil, aoIr]);
  const sub = (a: AbaInv, texto: string, novo?: boolean) => (
    <button key={a} type="button" className={estiloSub(aba === a)} aria-current={aba === a ? "page" : undefined} onClick={() => aoIr(a)}>
      <span className="flex-1">{texto}{novo ? <> <span className="ml-1 rounded-md bg-accent/10 px-1.5 text-[10.5px] font-bold text-accent">Novo</span></> : null}</span><Pil p={pil[a]} />
    </button>
  );
  return (
    <div data-testid="menu-inventario">
      <button type="button" aria-expanded={aberto} aria-controls={lista} onClick={() => setAberto(!aberto)}
        className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors", dentro ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground")}>
        <ICONE_INVENTARIO className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span className="flex-1">Inventário</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
      </button>
      {aberto ? (
        <div id={lista} className="ml-[21px] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
          <button type="button" className={estiloSub(aba === "hoje")} aria-current={aba === "hoje" ? "page" : undefined} onClick={() => aoIr("hoje")}>
            <ICONE_HOJE className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">Hoje</span>
            {total ? <span className={cn(PILULA, TOM.bad)} title="Itens na fila de trabalho" aria-label={`${total}: itens na fila de trabalho`}>{total}</span> : null}
          </button>
          {GRUPOS.map((g) => {
            const itens = g.itens.filter((i) => podePerfil(perfil, i.perm));
            if (!itens.length) return null;
            const Ic = g.icone;
            return (
              <div key={g.id} role="group" aria-label={g.t}>
                <button type="button" className={cn(SUB, "font-medium", ativo === g.id ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                  onClick={() => aoIr(ativo === g.id && aba ? aba : itens[0].aba)}><Ic className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{g.t}</span></button>
                <div className="ml-4 flex flex-col gap-0.5 border-l border-border pl-2">{itens.map((i) => sub(i.aba, i.t, i.novo))}</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
