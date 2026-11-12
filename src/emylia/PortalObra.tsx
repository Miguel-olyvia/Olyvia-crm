// A obra no portal do cliente (21/10/2026): cada trabalho da fase, com o estado e, num toque, todas as fotografias e descrições que os
// técnicos enviaram. 12/11: o progresso, os avisos e o diário passaram para ObraNoPortal.tsx (o progresso e todo o histórico da obra).
// Sem horas, sem custos, sem os pedidos de correção internos (trabalhoObra.ts, AcompanhamentoObra.tsx).
import { useState } from "react";
import { Camera, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plano, Tarefa } from "./motor";
import { estadoDe } from "./obraOps";
import { enviosDe } from "./trabalhoObra";
import { ChipEstado, HistoricoTarefa } from "./AcompanhamentoObra";

const visiveis = (t: Tarefa) => enviosDe(t).filter((e) => e.k !== "correcao");
const nFotos = (t: Tarefa) => visiveis(t).reduce((a, e) => a + (e.fotos?.length ?? 0), 0);

/** Os trabalhos de uma fase: o estado e, num toque, as fotografias e as notas dos técnicos. */
export function TrabalhosDaFase({ p, ts }: { p: Plano; ts: Tarefa[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <ul className="mt-2 space-y-2">
      {ts.filter((t) => t.corrige == null).map((t) => {
        const n = visiveis(t).length, f = nFotos(t), on = aberto === t.nome;
        return (
          <li key={t.nome} className="rounded-xl border border-slate-200">
            <button type="button" disabled={!n} onClick={() => setAberto(on ? null : t.nome)} aria-expanded={on}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left disabled:cursor-default">
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">{t.nome}</span>
                <span className="block text-sm text-slate-500">{n ? <><Camera className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{f} {f === 1 ? "fotografia" : "fotografias"} · {n} {n === 1 ? "registo" : "registos"}</> : "Ainda sem registos"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <ChipEstado e={p.estado === "concluída" ? "validada" : estadoDe(t)} cliente />
                {n > 0 && <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", on && "rotate-180")} aria-hidden="true" />}
              </span>
            </button>
            {on && <div className="border-t border-slate-200 px-3 py-3 animate-in fade-in-0 slide-in-from-top-1"><HistoricoTarefa t={t} p={p} cliente /></div>}
          </li>
        );
      })}
    </ul>
  );
}
