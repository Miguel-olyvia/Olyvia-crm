// O separador Hoje da V2 funcional de Negócios: quatro listas recolhíveis (Orçamentos por enviar, Propostas à espera do cliente, Contratos por assinar,
// A faturar), cada negócio uma só vez, com a pessoa, o serviço, o valor e o tempo parado em texto. Ações: Ver pessoa, Abrir, Ligar e WhatsApp.
// Dentro de cada lista ordena-se pelo tempo parado ou pelo valor. Nenhuma ação muda a fase (isso fica para uma fase seguinte).
import { MessageCircle, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { eur } from "./motor";
import { semPaginaPropria } from "./negociosApp";
import type { LinhaN } from "./filtrosNegocios";
import { paradoTexto, type GrupoHojeN, type IdGrupoN, type OrdemHojeN } from "./funcNegocios";
import { contactosDe } from "./FuncAcoes";
import { CHIP } from "./FiltrosPopover";
import { DicaAtalhos, GrupoRecolhivel } from "./FuncGrupo";

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const ICONE = "min-h-11 min-w-11 px-0";

export interface HojeNProps {
  grupos: readonly GrupoHojeN[];
  ordem: OrdemHojeN;
  setOrdem: (o: OrdemHojeN) => void;
  fechados: ReadonlySet<IdGrupoN>;
  alternar: (g: IdGrupoN) => void;
  /** Abre o negócio: o da seed na página dele, o de exemplo no painel. */
  abrir: (l: LinhaN, el: HTMLElement) => void;
  verPessoa: (nome: string) => void;
  ajuda: () => void;
}

function Icone({ rotulo, children }: { rotulo: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="calma">{rotulo}</TooltipContent>
    </Tooltip>
  );
}

function LinhaHojeN({ l, abrir, verPessoa }: { l: LinhaN; abrir: HojeNProps["abrir"]; verPessoa: (nome: string) => void }) {
  const n = l.negocio, c = contactosDe({ telefone: n.deal.tel, email: "" }), exemplo = semPaginaPropria(n);
  return (
    <li className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1 py-1.5 hover:bg-muted/60 focus-within:bg-muted/60">
      <button type="button" data-linha-func="" onClick={(e) => abrir(l, e.currentTarget)} aria-label={`Abrir ${n.titulo} de ${n.nome}`}
        className={cn("flex min-h-11 min-w-0 flex-1 basis-72 cursor-pointer flex-col items-start rounded-md text-left", FOCO)}>
        <span className="flex flex-wrap items-center gap-x-2 font-semibold leading-5">{n.nome}{exemplo && <span className="text-[15px] font-normal text-muted-foreground">exemplo</span>}</span>
        <span className="text-[15px] text-muted-foreground">{n.titulo}{l.nOrc > 1 ? ` · ${l.nOrc} orçamentos` : ""}{l.valor !== null ? ` · ${eur(l.valor)} €` : ""}</span>
        <span className="text-[15px] font-medium text-foreground">{paradoTexto(l)}</span>
      </button>
      <div role="group" aria-label={`Ações rápidas: ${n.titulo} de ${n.nome}`} className="flex shrink-0 items-center gap-0.5 lg:[@media(hover:hover)]:opacity-0 lg:[@media(hover:hover)]:group-hover:opacity-100 lg:[@media(hover:hover)]:group-focus-within:opacity-100">
        <Icone rotulo={`Ver a pessoa: ${n.nome}`}><Button type="button" variant="ghost" className={ICONE} aria-label={`Ver a pessoa: ${n.nome}`} onClick={() => verPessoa(n.nome)}><UserRound className="h-5 w-5" aria-hidden="true" /></Button></Icone>
        {c.tel && <Icone rotulo={`Ligar a ${n.nome}`}><Button asChild variant="ghost" className={ICONE}><a href={c.tel} aria-label={`Ligar a ${n.nome}`}><Phone className="h-5 w-5" aria-hidden="true" /></a></Button></Icone>}
        {c.wa && <Icone rotulo={`WhatsApp para ${n.nome}`}><Button asChild variant="ghost" className={ICONE}><a href={c.wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp para ${n.nome} (abre noutro separador)`}><MessageCircle className="h-5 w-5" aria-hidden="true" /></a></Button></Icone>}
      </div>
    </li>
  );
}

function Ordenar({ ordem, setOrdem }: Pick<HojeNProps, "ordem" | "setOrdem">) {
  const opcoes: [OrdemHojeN, string][] = [["parado", "Mais parados"], ["valor", "Maior valor"]];
  return (
    <div role="group" aria-label="Ordenar dentro de cada lista" className="flex flex-wrap gap-2">
      {opcoes.map(([id, nome]) => <button key={id} type="button" aria-pressed={ordem === id} onClick={() => setOrdem(id)} className={CHIP(ordem === id)}>{nome}</button>)}
    </div>
  );
}

export function HojeNegocios({ grupos, ordem, setOrdem, fechados, alternar, abrir, verPessoa, ajuda }: HojeNProps) {
  const total = grupos.reduce((a, g) => a + g.linhas.length, 0);
  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Ordenar ordem={ordem} setOrdem={setOrdem} />
        <DicaAtalhos abrir={ajuda} />
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="text-[15px] text-muted-foreground">{total === 1 ? "1 negócio para tratar" : `${total} negócios para tratar`} · hoje é 10/10</p>
      {grupos.map((g) => (
        <GrupoRecolhivel key={g.id} titulo={g.nome} n={g.linhas.length} vazio={g.vazio} aberto={!fechados.has(g.id)} alternar={() => alternar(g.id)}>
          <ul className="grid gap-0.5" aria-label={g.nome}>{g.linhas.map((l) => <LinhaHojeN key={l.id} l={l} abrir={abrir} verPessoa={verPessoa} />)}</ul>
        </GrupoRecolhivel>
      ))}
      <p className="border-t border-border pt-3 text-[15px] text-muted-foreground">Para mudar a fase, abre o negócio. As ações do Hoje não mudam nada no negócio.</p>
    </div>
  );
}
