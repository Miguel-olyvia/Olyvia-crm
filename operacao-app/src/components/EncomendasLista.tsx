import { Link } from "react-router-dom";
import { ROTULO_ENCOMENDA, type EstadoEncomenda, type LinhaEncomenda } from "../domain/encomendas";
import { data } from "../lib/formatar";
import { cx } from "./ui";

const COR: Record<EstadoEncomenda, string> = {
  em_atraso: "bg-red-50 text-red-700 ring-red-200",
  chega_tarde: "bg-red-50 text-red-700 ring-red-200",
  esta_semana: "bg-amber-50 text-amber-800 ring-amber-200",
  sem_prazo: "bg-slate-100 text-slate-600 ring-slate-200",
  mais_tarde: "bg-white text-slate-600 ring-slate-200",
  encomendado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const qtd = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 });

/** Uma linha por material e tarefa: o quê, para quando, e até quando encomendar. */
export default function EncomendasLista({
  linhas,
  mostrarObra = false,
}: {
  linhas: LinhaEncomenda[];
  mostrarObra?: boolean;
}) {
  return (
    <ul className="divide-y divide-slate-100" data-testid="encomendas-lista">
      {linhas.map((l) => (
        <li
          key={`${l.tarefa_id}:${l.produto_id}`}
          className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3"
          data-estado={l.estado}
        >
          <span
            className={cx(
              "w-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset sm:w-24 sm:text-center",
              COR[l.estado]
            )}
          >
            {ROTULO_ENCOMENDA[l.estado]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-sm text-slate-800">
              {l.produto_nome}
              {l.quantidade !== null && (
                <span className="text-slate-500">
                  {" "}
                  · {qtd.format(l.quantidade)} {l.unidade ?? ""}
                </span>
              )}
            </span>
            <span className="block text-xs text-slate-500">
              {mostrarObra && (
                <>
                  <Link to={`/obras/${l.obra_codigo}`} className="font-medium text-violet-700 hover:underline">
                    {l.obra_codigo}
                  </Link>{" "}
                  ·{" "}
                </>
              )}
              {l.tarefa_nome} a {data(l.inicio_planeado)} · {l.detalhe}
            </span>
          </span>
          {l.encomendar_ate && l.estado !== "encomendado" && (
            <span className="shrink-0 text-right text-xs tabular-nums text-slate-600">
              até <span className="font-semibold text-slate-800">{data(l.encomendar_ate)}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
