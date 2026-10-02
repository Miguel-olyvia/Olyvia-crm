import { Badge } from "./ui";
import { ROTULO_ESTADO_OBRA, ROTULO_ESTADO_TAREFA_OBRA, type EstadoObra, type EstadoTarefaObra } from "../domain/obras";

/** As cores encodam o estado, como em ui.tsx: cinzento espera, roxo anda, âmbar parou, verde acabou. */
const COR_OBRA: Record<EstadoObra, string> = {
  planeada: "bg-sky-50 text-sky-700 ring-sky-200",
  em_curso: "bg-brand-50 text-brand-800 ring-brand-200",
  suspensa: "bg-amber-50 text-amber-800 ring-amber-200",
  concluida: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelada: "bg-slate-100 text-slate-500 ring-slate-200 line-through",
};

const COR_TAREFA: Record<EstadoTarefaObra, string> = {
  por_fazer: "bg-slate-50 text-slate-600 ring-slate-200",
  em_curso: "bg-brand-50 text-brand-800 ring-brand-200",
  feita: "bg-sky-50 text-sky-700 ring-sky-200",
  validada: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejeitada: "bg-red-50 text-red-700 ring-red-200",
};

export function ObraEstadoBadge({ estado }: { estado: EstadoObra }) {
  return <Badge className={COR_OBRA[estado]}>{ROTULO_ESTADO_OBRA[estado]}</Badge>;
}

export function ObraTarefaEstadoBadge({ estado }: { estado: EstadoTarefaObra }) {
  return <Badge className={COR_TAREFA[estado]}>{ROTULO_ESTADO_TAREFA_OBRA[estado]}</Badge>;
}
