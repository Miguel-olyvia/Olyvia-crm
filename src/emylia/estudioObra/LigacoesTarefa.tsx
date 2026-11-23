// 23/11 (Rúben: «criar dependências… nos detalhes laterais também, e ter isso visual»): no painel da tarefa, as ligações dela: de que
// depende e o que espera por ela, com um mini-diagrama, para tirar cada uma e para juntar outra (escolhida pelas fases da obra). Pôr ou
// tirar abre a pré-visualização do impacto (o fim, as tarefas que mudam, os técnicos) antes de aplicar.
import { useState } from "react";
import { ArrowRight, Link2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Plano } from "../motor";
import { COR_FASE } from "../fasesObra";
import { dataCurta } from "../planoObra";
import { nomeTec } from "../AcompanhamentoObra";
import { EscolherTarefa, ICONE_DA_FASE } from "./CaminhoCritico";
import { ligacoesDaTarefa, nomeCurtoTarefa, porqueNaoLigar, type Ligacao } from "./planoVivo";

export function LigacoesDaTarefa({ p, ti, dias, mexe, pedir, abrir }: {
  p: Plano; ti: number; dias: Date[]; mexe: boolean;
  /** pôr (ligar) ou tirar «para só começa quando de acaba»: abre a pré-visualização */ pedir: (para: number, de: number, ligar: boolean) => void;
  abrir: (ti: number) => void;
}) {
  const [juntar, setJuntar] = useState<null | "depende" | "antes">(null);
  const T = p.tasks, t = T[ti];
  const { depende, antes } = ligacoesDaTarefa(T, ti);
  const quando = (k: number) => (dias[k] ? dataCurta(dias[k]) : `dia ${k + 1}`);
  const Chip = ({ j }: { j: number }) => {
    const x = T[j], Ic = ICONE_DA_FASE[x.fase ?? 1], cor = COR_FASE[x.fase ?? 1];
    return (
      <button type="button" onClick={() => abrir(j)} title={x.nome} className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-left text-xs hover:border-primary/40">
        <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white" style={{ background: cor }}>{Ic && <Ic className="h-3 w-3" />}</span>
        <span className="truncate">{nomeCurtoTarefa(x.nome)}</span>
      </button>
    );
  };
  const Linha = ({ l, outra, tirar }: { l: Ligacao; outra: number; tirar: () => void }) => {
    const x = T[outra], cor = COR_FASE[x.fase ?? 1], Ic = ICONE_DA_FASE[x.fase ?? 1];
    return (
      <li className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-muted/60">
        <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white" style={{ background: cor }}>{Ic && <Ic className="h-3.5 w-3.5" />}</span>
        <button type="button" onClick={() => abrir(outra)} title={x.nome} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium">{nomeCurtoTarefa(x.nome)}</span>
          <span className="block text-xs text-muted-foreground">{(nomeTec(x.tec) || "sem técnico").split(" ")[0]} · {quando(x.dia)}{x.dur > 1 ? ` a ${quando(x.dia + x.dur - 1)}` : ""} · {l.mao ? "ligada à mão" : "pelas datas do plano"}</span>
        </button>
        {mexe && <Button type="button" size="sm" variant="ghost" className="h-9 w-9 shrink-0 rounded-full p-0" aria-label={`Tirar a ligação com ${nomeCurtoTarefa(x.nome)}`} onClick={tirar}><X className="h-4 w-4" /></Button>}
      </li>
    );
  };
  // as que se podem ligar (sem ciclos, sem repetir, sem mexer nas começadas)
  const possiveis = (modo: "depende" | "antes") => T.map((_, j) => j).filter((j) => j !== ti && (modo === "depende" ? porqueNaoLigar(p, ti, j) : porqueNaoLigar(p, j, ti)) == null);
  return (
    <section aria-label="As ligações da tarefa" className="space-y-3 rounded-2xl border border-border p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" aria-hidden="true" />Ligações</p>
      {/* o mini-diagrama: o que vem antes, esta, o que vem depois */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-1.5" role="img" aria-label={`${nomeCurtoTarefa(t.nome)}: depende de ${depende.length}, ${antes.length} esperam por ela`}>
        <div className="flex min-w-0 flex-col items-end gap-1">{depende.length ? depende.map((l) => <Chip key={l.de} j={l.de} />) : <span className="text-xs text-muted-foreground">nada antes</span>}</div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="max-w-[9rem] truncate rounded-lg px-2 py-1 text-xs font-semibold text-white" style={{ background: COR_FASE[t.fase ?? 1] }} title={t.nome}>{nomeCurtoTarefa(t.nome)}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div className="flex min-w-0 flex-col items-start gap-1">{antes.length ? antes.map((l) => <Chip key={l.para} j={l.para} />) : <span className="text-xs text-muted-foreground">nada depois</span>}</div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Depende de (só começa quando acabarem)</p>
        {depende.length ? <ul>{depende.map((l) => <Linha key={l.de} l={l} outra={l.de} tirar={() => pedir(ti, l.de, false)} />)}</ul> : <p className="text-sm text-muted-foreground">De nenhuma.</p>}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Antes de (esperam por esta)</p>
        {antes.length ? <ul>{antes.map((l) => <Linha key={l.para} l={l} outra={l.para} tirar={() => pedir(l.para, ti, false)} />)}</ul> : <p className="text-sm text-muted-foreground">Nenhuma.</p>}
      </div>
      {mexe && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={juntar === "depende" ? "default" : "outline"} className="min-h-9 rounded-full" onClick={() => setJuntar(juntar === "depende" ? null : "depende")}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />Depende de…</Button>
            <Button type="button" size="sm" variant={juntar === "antes" ? "default" : "outline"} className="min-h-9 rounded-full" onClick={() => setJuntar(juntar === "antes" ? null : "antes")}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />Antes de…</Button>
          </div>
          {juntar && (
            <div className={cn("rounded-xl bg-muted/40 p-2")}>
              <p className="mb-2 text-xs text-muted-foreground">{juntar === "depende" ? `Escolha a tarefa que tem de acabar antes de «${nomeCurtoTarefa(t.nome)}» começar.` : `Escolha a tarefa que só começa quando «${nomeCurtoTarefa(t.nome)}» acabar.`} As que fariam um ciclo não aparecem.</p>
              <EscolherTarefa compacto p={p} rotulo={juntar === "depende" ? "Depende de" : "Antes de"} sel={null} tis={possiveis(juntar)}
                escolher={(j) => { if (j == null) return; setJuntar(null); if (juntar === "depende") pedir(ti, j, true); else pedir(j, ti, true); }} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
