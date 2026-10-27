// Os avisos ao técnico (21/10/2026): quando o gestor cria ou muda uma tarefa dele (o dia, os dias, a fase, os materiais, ou a
// passa a outro), aparece aqui, no topo do Hoje, até ele tocar em "Visto". O gestor vê na tarefa se ele já viu (PlanoInterativo.tsx).
import { BellRing, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Ctx } from "./pecas";
import { avisosPorVer } from "./tarefasValidador";

export function AvisosDoTecnico({ ctx, eu }: { ctx: Ctx; eu: string }) {
  const { S, A, run } = ctx;
  const L = S.deals.flatMap((d) => (d.obra.plano ? avisosPorVer(d.obra.plano, eu).map((x) => ({ ...x, d })) : []));
  if (!L.length) return null;
  return (
    <section aria-labelledby="avisos-t" className="mt-6">
      <h2 id="avisos-t" className="flex items-center gap-2 text-lg font-semibold">
        <BellRing className="h-5 w-5 text-warning" aria-hidden="true" />{L.length === 1 ? "Uma novidade" : `${L.length} novidades`} do responsável
      </h2>
      <ul className="mt-3 space-y-2">
        {L.map(({ a, k, d }) => (
          <li key={d.id + ":" + k} className={cn("flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/[0.07] p-3.5 animate-in fade-in-0 slide-in-from-top-1 duration-300")}>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-snug">{a.t}</span>
              <span className="block text-sm text-muted-foreground">{d.nome} · {d.f.morada || d.local} · {a.q}</span>
            </span>
            <button type="button" onClick={() => run(() => A.avisoLido(d.id, k))}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-card px-3 text-[15px] font-medium shadow-sm hover:bg-muted">
              <Check className="h-4 w-4" aria-hidden="true" />Visto
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
