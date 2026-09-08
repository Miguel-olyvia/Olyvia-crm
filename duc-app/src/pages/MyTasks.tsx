import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Badge, Card, Spinner, cx } from "../components/ui";
import { CheckCircle, ChevronRight, Clock, AlertTriangle } from "../components/icons";
import { fetchMyTasks, type MyTask } from "../lib/tasks";

/** Dias desde que a etapa ficou ativa (base do "à espera há…"). */
function daysOpen(enteredAt: string | null): number {
  if (!enteredAt) return 0;
  const t = new Date(enteredAt).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export default function MyTasks() {
  const { businessUserId, userName } = useAuth();
  const [tasks, setTasks] = useState<MyTask[] | null>(null);

  const load = useCallback(() => {
    if (!businessUserId) {
      setTasks([]);
      return;
    }
    setTasks(null);
    void fetchMyTasks(businessUserId).then(setTasks);
  }, [businessUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const staleCount = useMemo(
    () => (tasks ?? []).filter((t) => daysOpen(t.enteredAt) >= 7).length,
    [tasks]
  );

  if (tasks === null) return <Spinner label="A carregar as tuas tarefas…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            As minhas tarefas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Etapas em curso atribuídas a{" "}
            <span className="font-medium text-slate-600">{userName ?? "ti"}</span>, em todos os DUCs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-brand-50 text-brand-800 ring-brand-100">
            {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
          </Badge>
          {staleCount > 0 && (
            <Badge className="bg-amber-100 text-amber-700 ring-amber-200">
              <AlertTriangle width={12} height={12} /> {staleCount} parada(s)
            </Badge>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <CheckCircle width={26} height={26} />
          </span>
          <p className="text-sm font-medium text-slate-700">Sem tarefas pendentes</p>
          <p className="max-w-sm text-xs text-slate-400">
            Quando uma etapa te for atribuída e ficar ativa, aparece aqui. Fecha a tua e passa a
            bola à etapa seguinte.
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((t) => {
            const d = daysOpen(t.enteredAt);
            const stale = d >= 7;
            return (
              <Link
                key={t.ducId}
                to={`/duc/${t.ducId}`}
                className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-bold tabular-nums text-white ring-1 ring-inset ring-brand">
                  {t.stageNo}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{t.stageTitle}</p>
                  <p className="truncate text-xs text-slate-500">
                    <span className="font-mono text-slate-400">{t.ducNumber ?? "DUC"}</span>
                    {t.clientName ? ` · ${t.clientName}` : ""}
                    {t.responsible ? ` · ${t.responsible}` : ""}
                  </p>
                </div>
                <span
                  className={cx(
                    "hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex",
                    stale
                      ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100"
                      : "bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-100"
                  )}
                >
                  <Clock width={12} height={12} />
                  {d === 0 ? "hoje" : `há ${d}d`}
                </span>
                <ChevronRight
                  width={18}
                  height={18}
                  className="shrink-0 text-slate-300 transition-colors group-hover:text-brand"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
