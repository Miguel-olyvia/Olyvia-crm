// 25/11 (Rúben: «substituir em todo o lado»). Nas Operações: passa as microtarefas de todas as obras por acabar às da ficha de cada
// serviço (ou às tarefas da Mudelar no Infraspeak). Só mudam nomes e juntam-se as novas: os ids ficam, o que o técnico marcou fica e nada
// se apaga (microtarefas.ts: porFixar). Primeiro diz quantas obras e tarefas mudam; fica no histórico de cada obra.
import { useState } from "react";
import { ListChecks, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { porFixar } from "../microtarefas";
import { podeNeg } from "../permissoes";

/** As obras por acabar com tarefas cujas microtarefas mudam, e quantas. */
export function obrasPorAtualizar(S: Ctx["S"], obras: Negocio[]): { d: Negocio; n: number }[] {
  return obras.flatMap((d) => {
    const p = d.obra.plano;
    if (!p || p.estado === "concluída") return [];
    const n = p.tasks.filter((t) => !!porFixar(t, S, p)?.length).length;
    return n ? [{ d, n }] : [];
  });
}

export function AtualizarMicrotarefas({ ctx, obras }: { ctx: Ctx; obras: Negocio[] }) {
  const { S, A, run } = ctx;
  const [feito, setFeito] = useState<{ obras: number; tarefas: number } | null>(null);
  if (!podeNeg(S.role, "obra.planear")) return null;
  const L = obrasPorAtualizar(S, obras);
  if (!L.length && !feito) return null;
  const tarefas = L.reduce((a, x) => a + x.n, 0);
  const atualizar = () => {
    let o = 0, t = 0;
    run(() => { for (const x of L) { const n = A.fixarMicrotarefas(x.d.id, true); if (n) { o++; t += n; } } });
    setFeito({ obras: o, tarefas: t });
  };
  return (
    <section aria-label="Microtarefas das obras" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[17px] font-semibold"><ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />Microtarefas das obras</p>
        <p role="status" className="text-[15px] text-muted-foreground">
          {L.length ? `${L.length} ${L.length === 1 ? "obra" : "obras"} e ${tarefas} ${tarefas === 1 ? "tarefa podem" : "tarefas podem"} passar às microtarefas do Catálogo. Só mudam os nomes e juntam-se as novas; o que o técnico marcou fica.`
            : `Feito: ${feito!.tarefas} ${feito!.tarefas === 1 ? "tarefa atualizada" : "tarefas atualizadas"} em ${feito!.obras} ${feito!.obras === 1 ? "obra" : "obras"}. Fica no histórico de cada uma.`}
        </p>
      </div>
      {L.length > 0 && <Button type="button" variant="outline" className="min-h-10" onClick={atualizar}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Atualizar as microtarefas das obras</Button>}
    </section>
  );
}
