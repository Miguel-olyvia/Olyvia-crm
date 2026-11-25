// 23/11 (revisão: «Olyvia, o Elvis só pode na quinta → mostra o impacto e aplica com um toque, e entra no ↶ ↷»).
// Um controlo à vista no Plano: a pessoa, os dias da semana em que pode vir, e «Ver o impacto» (abre o «E se…?» com o plano replaneado).
// A Olyvia (comando por voz) lê o ecrã e usa estes mesmos controlos: escolhe o técnico, carrega no dia e em «Ver o impacto».
import { useEffect, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Plano } from "../motor";
import { nomeTec } from "../AcompanhamentoObra";
import { diasQuePode } from "../preparacaoObra";
import { estadoVivo } from "./planoVivo";

const DIAS: [number, string, string][] = [[1, "Seg", "Segunda"], [2, "Ter", "Terça"], [3, "Qua", "Quarta"], [4, "Qui", "Quinta"], [5, "Sex", "Sexta"]];

export function DiasDoTecnico({ p, pedir }: { p: Plano; pedir: (tec: string, dias: number[] | null) => void }) {
  // as pessoas com trabalho por fazer nesta obra (e as que já têm dias marcados)
  const tecs = [...new Set([
    ...p.tasks.filter((t) => t.tec && !["validada", "feita"].includes(estadoVivo(t, p))).map((t) => t.tec!),
    ...(p.restricoes ?? []).map((r) => r.tec),
  ])];
  const [tec, setTec] = useState(tecs[0] ?? "");
  const atual = p.restricoes?.find((r) => r.tec === tec)?.dias ?? null;
  const [dias, setDias] = useState<number[]>(atual ?? []);
  useEffect(() => { setDias(p.restricoes?.find((r) => r.tec === tec)?.dias ?? []); }, [tec, JSON.stringify(p.restricoes ?? [])]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tecs.length) return null;
  const igual = JSON.stringify([...dias].sort()) === JSON.stringify(atual ?? []);
  const todos = dias.length === 0 || dias.length === 5;
  return (
    <section aria-label="Os dias de um técnico" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarClock className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Um técnico só pode em certos dias</h3>
          <p className="text-sm text-muted-foreground">Escolha a pessoa e os dias em que pode vir. O plano replaneia as tarefas dela; vê o impacto antes de aplicar.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select aria-label="Técnico" value={tec} onChange={(e) => setTec(e.target.value)}
          className="min-h-11 max-w-full rounded-xl border border-input bg-background px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {tecs.map((id) => <option key={id} value={id}>{nomeTec(id) || id}</option>)}
        </select>
        <div role="group" aria-label="Dias em que pode" className="inline-flex flex-wrap gap-1">
          {DIAS.map(([k, curto, longo]) => {
            const on = dias.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} aria-label={longo} title={longo}
                onClick={() => setDias((L) => (L.includes(k) ? L.filter((x) => x !== k) : [...L, k].sort((a, b) => a - b)))}
                className={cn("min-h-11 min-w-11 rounded-xl border px-2.5 text-sm font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-foreground/40")}>{curto}</button>
            );
          })}
        </div>
        <Button type="button" className="min-h-11 rounded-full" disabled={!tec || igual || (todos && !atual)} onClick={() => pedir(tec, todos ? null : dias)}>Ver o impacto</Button>
      </div>
      {!!p.restricoes?.length && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Os dias marcados">
          {p.restricoes.map((r) => (
            <li key={r.tec} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary/[0.08] py-1 pl-3 pr-1 text-sm">
              <span><b className="font-medium">{(nomeTec(r.tec) || r.tec).split(" ")[0]}</b> só pode {diasQuePode(r.dias)}</span>
              <button type="button" aria-label={`Tirar a restrição de ${(nomeTec(r.tec) || r.tec).split(" ")[0]}`} onClick={() => pedir(r.tec, null)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-primary/15"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
