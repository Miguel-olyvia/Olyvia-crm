import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { Card, Badge, EmptyState, Spinner, Input, cx } from "../components/ui";
import { Search, Check, AlertTriangle, FileText } from "../components/icons";

/* ------------------------------------------------------------------ Tipos -- */

/** Uma linha de email_logs (só os campos que o feed usa). */
interface EmailLog {
  to_email: string | null;
  from_email: string | null;
  subject: string | null;
  status: string | null;
  sent_at: string | null;
}

/* --------------------------------------------------------------- Helpers -- */

/**
 * Hora relativa simples em pt-PT a partir de um ISO. Sem dependências: cobre
 * "agora", minutos, horas, "ontem" e dias. Datas inválidas devolvem "".
 */
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;

  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;

  const months = Math.floor(days / 30);
  if (months === 1) return "há 1 mês";
  if (months < 12) return `há ${months} meses`;

  const years = Math.floor(months / 12);
  return years === 1 ? "há 1 ano" : `há ${years} anos`;
}

/** Considera "enviado" o estado "sent" (case-insensitive); resto é falha. */
function isSent(status: string | null): boolean {
  return (status ?? "").toLowerCase() === "sent";
}

/* ----------------------------------------------------------------- Página -- */

export default function Notifications() {
  const { activeOrgId } = useAuth();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Recarrega sempre que a organização ativa muda.
  useEffect(() => {
    if (!activeOrgId) {
      setLogs([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error: err } = await supabase
        .from("email_logs")
        .select("to_email, from_email, subject, status, sent_at")
        .eq("organization_id", activeOrgId)
        .ilike("subject", "DUC %")
        .order("sent_at", { ascending: false })
        .limit(100);

      if (cancelled) return;
      if (err) {
        setError("Não foi possível carregar as notificações.");
        setLogs([]);
      } else {
        setLogs((data ?? []) as EmailLog[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  // Filtro client-side por assunto ou destinatário.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        (l.subject ?? "").toLowerCase().includes(q) ||
        (l.to_email ?? "").toLowerCase().includes(q)
    );
  }, [logs, query]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      {/* Cabeçalho + contagem */}
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-800">Notificações</h1>
          <Badge className="bg-brand-50 text-brand-800 ring-brand-100">
            {filtered.length}
          </Badge>
        </div>
        <p className="text-sm text-slate-400">
          Emails de notificação enviados pelo DUC nesta organização.
        </p>
      </header>

      {/* Pesquisa */}
      <div className="relative">
        <Search
          width={16}
          height={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar por assunto ou destinatário…"
          className="pl-9"
        />
      </div>

      {/* Estados: a carregar / erro / vazio / feed */}
      {loading ? (
        <Spinner label="A carregar notificações…" />
      ) : error ? (
        <Card className="p-6">
          <EmptyState
            icon={<AlertTriangle width={22} height={22} />}
            title="Ocorreu um erro"
            description={error}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<FileText width={22} height={22} />}
            title="Ainda não há notificações."
            description={
              query
                ? "Nenhuma notificação corresponde à pesquisa."
                : "Assim que forem enviados emails do DUC, aparecem aqui."
            }
          />
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((log, i) => {
            const sent = isSent(log.status);
            return (
              <li key={`${log.sent_at ?? "?"}-${log.to_email ?? "?"}-${i}`}>
                <Card
                  className={cx(
                    // Acento de cor à esquerda consoante o estado + hover subtil.
                    "group relative overflow-hidden pl-4 pr-4 py-3.5 transition-colors hover:border-slate-300",
                    "before:absolute before:inset-y-0 before:left-0 before:w-1",
                    sent ? "before:bg-emerald-400" : "before:bg-red-400"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Ícone de estado */}
                    <div
                      className={cx(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                        sent
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-red-50 text-red-600"
                      )}
                    >
                      {sent ? (
                        <Check width={16} height={16} />
                      ) : (
                        <AlertTriangle width={16} height={16} />
                      )}
                    </div>

                    {/* Conteúdo */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {log.subject ?? "(sem assunto)"}
                        </p>
                        {sent ? (
                          <Badge className="shrink-0 bg-emerald-50 text-emerald-700 ring-emerald-200">
                            Enviado
                          </Badge>
                        ) : (
                          <Badge className="shrink-0 bg-red-50 text-red-700 ring-red-200">
                            <AlertTriangle width={12} height={12} />
                            Falhou
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                        <span className="truncate">
                          Para{" "}
                          <span className="text-slate-600">
                            {log.to_email ?? "—"}
                          </span>
                        </span>
                        <span aria-hidden>·</span>
                        <span className="shrink-0" title={log.sent_at ?? undefined}>
                          {relativeTime(log.sent_at) || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
