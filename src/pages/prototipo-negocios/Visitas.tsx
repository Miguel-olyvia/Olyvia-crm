// As visitas de um negócio: pode haver várias (levantamento, medição técnica,
// escolha de materiais, revisita), cada uma com os seus campos. Um cartão por
// visita; a que está marcada abre logo, as outras mostram o resumo.
import { useState } from "react";
import { CalendarClock, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { grupoVisita, emFalta } from "./campos";
import { Campos, aValidar } from "./CamposFase";
import { campoVisita, visitaFeita, visitas, type Negocio } from "./motor";
import type { Ctx } from "./pecas";

const COR_ESTADO: Record<string, string> = {
  Marcada: "bg-sky-100 text-sky-800", Feita: "bg-emerald-100 text-emerald-800", Cancelada: "bg-muted text-muted-foreground",
};
const diaCurto = (iso: string) => {
  if (!iso) return "dia por marcar";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" });
};

export function VisitasLista({ ctx, d, simples }: { ctx: Ctx; d: Negocio; simples?: boolean }) {
  const { A, run } = ctx;
  const vs = visitas(d), ro = d.visita.fechada;
  const primeiraAberta = [...vs].reverse().find((n) => campoVisita(d, n, "estado") !== "Feita") ?? vs[vs.length - 1];
  const [abertas, setAbertas] = useState<number[]>(primeiraAberta ? [primeiraAberta] : []);
  const alternar = (n: number) => setAbertas((a) => (a.includes(n) ? a.filter((x) => x !== n) : [...a, n]));

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-[15px] text-muted-foreground">
        Um negócio pode ter várias visitas: o levantamento, uma medição técnica, a escolha de materiais… Para fechar a fase, pelo menos uma tem de estar feita.
      </p>
      {aValidar(d, "visitas") && !visitaFeita(d) && <p className="text-[15px] font-medium text-destructive">Marque como feita pelo menos uma visita.</p>}

      {vs.map((n) => {
        const g = grupoVisita(n), aberta = abertas.includes(n);
        const tipo = campoVisita(d, n, "tipo") || "Visita", estado = campoVisita(d, n, "estado") || "Marcada";
        const falta = aValidar(d, g.titulo) ? emFalta([g], d.f).length : 0;
        return (
          <section key={n} className={cn("overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-sm)] animate-in fade-in-0 slide-in-from-top-1", falta ? "border-destructive/50" : "border-border")}>
            <button type="button" onClick={() => alternar(n)} aria-expanded={aberta}
              className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/40 sm:px-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-700" aria-hidden="true"><CalendarClock className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">Visita {vs.indexOf(n) + 1} · {tipo}</span>
                <span className="block text-[15px] text-muted-foreground">
                  {diaCurto(campoVisita(d, n, "data"))}{campoVisita(d, n, "hora") ? ` · ${campoVisita(d, n, "hora")}` : ""} · {campoVisita(d, n, "quem").split(" (")[0] || "por atribuir"}
                </span>
                {falta > 0 && <span className="block text-sm font-medium text-destructive">falta{falta > 1 ? "m" : ""} {falta}</span>}
              </span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-sm font-medium", COR_ESTADO[estado] || COR_ESTADO.Marcada)}>{estado}</span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300", aberta && "rotate-180")} aria-hidden="true" />
            </button>
            <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", aberta ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="min-h-0 overflow-hidden">
                {aberta && (
                  <div className="space-y-4 border-t border-border px-4 pb-5 pt-2 sm:px-5">
                    <Campos grupo={g} d={d} A={A} run={run} ro={ro} simples={simples} plano />
                    {!ro && vs.length > 1 && (
                      <Button variant="ghost" className="text-muted-foreground" onClick={() => run(() => { A.apagarVisita(d.id, n); })}>
                        <Trash2 className="mr-1.5 h-4 w-4" />Apagar esta visita
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {!ro && (
        <button type="button" onClick={() => run(() => { const n = A.novaVisita(d.id); setAbertas([n]); })}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-[15px] font-medium text-primary transition-colors hover:border-primary hover:bg-primary/[0.04]">
          <Plus className="h-5 w-5" aria-hidden="true" />Marcar outra visita
        </button>
      )}
    </div>
  );
}
