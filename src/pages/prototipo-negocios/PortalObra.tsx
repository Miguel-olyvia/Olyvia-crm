// A obra no portal do cliente (21/10/2026): não são só checklists. O cliente acompanha tudo:
// · as novidades (os ajustes ao plano de que foi avisado, com a data de fim);
// · cada trabalho da fase, com o estado e, num toque, todas as fotografias e descrições que os técnicos enviaram;
// · o diário da obra: os registos dos técnicos, do mais recente para o mais antigo, com as fotografias.
// Sem horas, sem custos, sem os pedidos de correção internos (trabalhoObra.ts, AcompanhamentoObra.tsx).
import { useState } from "react";
import { BellRing, Camera, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Negocio, Plano, Tarefa } from "./motor";
import { COR_FASE } from "./planoObra";
import { estadoDe, progresso } from "./obraOps";
import { enviosDe, type Envio } from "./trabalhoObra";
import { ChipEstado, EnvioItem, HistoricoTarefa } from "./AcompanhamentoObra";

const visiveis = (t: Tarefa) => enviosDe(t).filter((e) => e.k !== "correcao");
const nFotos = (t: Tarefa) => visiveis(t).reduce((a, e) => a + (e.fotos?.length ?? 0), 0);

/** Os avisos de ajustes ao plano e o progresso. */
export function NovidadesPortal({ d, p }: { d: Negocio; p: Plano }) {
  const L = (d.obra.alteracoes ?? []).filter((a) => a.cliente && a.avisoCliente);
  const prog = progresso(p), feitas = p.tasks.filter((t) => p.estado === "concluída" || estadoDe(t) === "validada").length;
  return (
    <div className="space-y-3">
      {(p.estado === "em curso" || p.estado === "concluída") && (
        <div>
          <div className="flex items-baseline justify-between text-[15px]"><span className="font-medium">A obra vai em</span><span className="text-xl font-semibold tabular-nums">{Math.round(prog * 100)}%</span></div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-[#5a36bf] transition-[width] duration-700" style={{ width: `${Math.round(prog * 100)}%` }} /></div>
          <p className="mt-1 text-sm text-slate-500">{feitas} de {p.tasks.length} trabalhos concluídos e verificados pelo responsável de obra</p>
        </div>
      )}
      {L.map((a, k) => (
        <p key={k} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[15px] text-slate-800 animate-in fade-in-0">
          <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>{a.avisoCliente} <span className="block text-sm text-slate-500">{a.q.startsWith("hoje") ? "Hoje" : a.q}</span></span>
        </p>
      ))}
    </div>
  );
}

/** Os trabalhos de uma fase: o estado e, num toque, as fotografias e as notas dos técnicos. */
export function TrabalhosDaFase({ p, ts }: { p: Plano; ts: Tarefa[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <ul className="mt-2 space-y-2">
      {ts.map((t) => {
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

/** O diário da obra: tudo o que os técnicos enviaram, do mais recente para o mais antigo. */
export function DiarioPortal({ p }: { p: Plano }) {
  const L: { t: Tarefa; e: Envio; ordem: number }[] = [];
  p.tasks.forEach((t) => visiveis(t).forEach((e, k) => L.push({ t, e, ordem: e.dia * 100 + k })));
  L.sort((a, b) => b.ordem - a.ordem);
  const [todos, setTodos] = useState(false);
  if (!L.length) return null;
  const V = todos ? L : L.slice(0, 4);
  return (
    <section aria-labelledby="diario-portal-t" className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 id="diario-portal-t" className="text-base font-semibold">O diário da sua obra</h2>
      <p className="text-sm text-slate-500">As fotografias e as notas da equipa, dia a dia.</p>
      <ol className="mt-4 space-y-4">
        {V.map(({ t, e }, k) => (
          <li key={k} className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t.fase ? COR_FASE[t.fase] : "#7c5ce0" }} aria-hidden="true" />{t.nome}</p>
            <ol><EnvioItem e={e} p={p} cliente ultimo /></ol>
          </li>
        ))}
      </ol>
      {L.length > 4 && <button type="button" onClick={() => setTodos(!todos)} className="mt-3 min-h-11 text-[15px] font-medium text-[#5a36bf] underline-offset-4 hover:underline">{todos ? "Ver menos" : `Ver todo o diário (${L.length})`}</button>}
    </section>
  );
}
