import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import {
  Card,
  Badge,
  EmptyState,
  Spinner,
  Input,
  Skeleton,
  cx,
} from "../components/ui";
import { Search, Check, AlertTriangle, FileText, Settings } from "../components/icons";

/* ------------------------------------------------------------------ Tipos -- */

/** Uma linha de email_logs (só os campos que o feed usa). */
interface EmailLog {
  to_email: string | null;
  from_email: string | null;
  subject: string | null;
  status: string | null;
  sent_at: string | null;
}

/** Filtro de estado (chips/segmented). */
type StatusFilter = "all" | "sent" | "failed";

/** Chave de agrupamento por proximidade temporal. */
type DayBucket = "today" | "yesterday" | "week" | "older";

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

/**
 * Deteta se o assunto se refere ao FECHO de uma etapa (vs. entrada). O DUC usa
 * "fechada" para fecho e "ativa" para entrada; robusto a null.
 */
function isClosingSubject(subject: string | null): boolean {
  return (subject ?? "").toLowerCase().includes("fechada");
}

/** Início do dia (00:00 local) para um dado timestamp. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Classifica um ISO num balde temporal; inválidos caem em "older". */
function bucketOf(iso: string | null): DayBucket {
  if (!iso) return "older";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "older";

  const today = startOfDay(Date.now());
  const day = startOfDay(t);
  const oneDay = 86_400_000;

  if (day === today) return "today";
  if (day === today - oneDay) return "yesterday";
  if (day > today - 7 * oneDay) return "week";
  return "older";
}

/** Etiqueta legível de cada balde. */
const BUCKET_LABEL: Record<DayBucket, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  week: "Esta semana",
  older: "Mais antigas",
};

/** Ordem de apresentação dos baldes. */
const BUCKET_ORDER: DayBucket[] = ["today", "yesterday", "week", "older"];

/* ----------------------------------------------------------------- Página -- */

export default function Notifications() {
  const { activeOrgId } = useAuth();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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

  // Contagens globais (sobre tudo o que foi carregado, ignora filtros).
  const counts = useMemo(() => {
    let sent = 0;
    for (const l of logs) if (isSent(l.status)) sent += 1;
    return { total: logs.length, sent, failed: logs.length - sent };
  }, [logs]);

  // Filtro client-side por pesquisa + estado.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      // Estado
      if (statusFilter === "sent" && !isSent(l.status)) return false;
      if (statusFilter === "failed" && isSent(l.status)) return false;
      // Pesquisa
      if (!q) return true;
      return (
        (l.subject ?? "").toLowerCase().includes(q) ||
        (l.to_email ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, query, statusFilter]);

  // Agrupa o resultado filtrado por balde temporal, preservando a ordem.
  const groups = useMemo(() => {
    const map = new Map<DayBucket, EmailLog[]>();
    for (const l of filtered) {
      const b = bucketOf(l.sent_at);
      const arr = map.get(b);
      if (arr) arr.push(l);
      else map.set(b, [l]);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({
      bucket: b,
      label: BUCKET_LABEL[b],
      items: map.get(b) as EmailLog[],
    }));
  }, [filtered]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      {/* Hero com gradiente + resumo em mini-cartões */}
      <header className="overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-teal-50 to-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-800">Notificações</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Emails de notificação enviados pelo DUC nesta organização.
        </p>

        {/* Resumo: total / enviadas / falhadas */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <SummaryCard
            label="Total"
            value={counts.total}
            tone="slate"
          />
          <SummaryCard
            label="Enviadas"
            value={counts.sent}
            tone="emerald"
            icon={<Check width={13} height={13} />}
          />
          <SummaryCard
            label="Falhadas"
            value={counts.failed}
            tone="red"
            icon={<AlertTriangle width={13} height={13} />}
          />
        </div>

        {/* Explicador: aqui VÊS; para CRIAR/configurar, vai a Configurações */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/60 bg-white/70 p-3 text-sm backdrop-blur-sm">
          <Settings width={17} height={17} className="mt-0.5 shrink-0 text-brand-700" />
          <div>
            <p className="text-slate-600">
              Aqui <strong className="font-medium text-slate-700">vês</strong> as notificações
              enviadas. Para <strong className="font-medium text-slate-700">criar/configurar</strong>{" "}
              quem recebe email e quando, vai a Configurações e clica numa etapa.
            </p>
            <Link
              to="/config"
              className="mt-1 inline-flex items-center gap-1 font-medium text-brand-700 transition-colors hover:text-brand"
            >
              Configurar notificações por etapa →
            </Link>
          </div>
        </div>
      </header>

      {/* Barra de filtros: pesquisa + chips de estado */}
      <div className="space-y-3">
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

        {/* Chips segmentados por estado */}
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label="Todas"
            count={counts.total}
          />
          <FilterChip
            active={statusFilter === "sent"}
            onClick={() => setStatusFilter("sent")}
            label="Enviadas"
            count={counts.sent}
            tone="emerald"
          />
          <FilterChip
            active={statusFilter === "failed"}
            onClick={() => setStatusFilter("failed")}
            label="Falhadas"
            count={counts.failed}
            tone="red"
          />
        </div>
      </div>

      {/* Estados: a carregar / erro / vazio / feed */}
      {loading ? (
        <FeedSkeleton />
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
            title={
              query || statusFilter !== "all"
                ? "Sem resultados"
                : "Ainda não há notificações."
            }
            description={
              query || statusFilter !== "all"
                ? "Nenhuma notificação corresponde aos filtros aplicados."
                : "Assim que forem enviados emails do DUC, aparecem aqui."
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.bucket} className="space-y-2.5">
              {/* Separador de dia */}
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {group.label}
                </h2>
                <span className="h-px flex-1 bg-slate-100" aria-hidden />
                <span className="text-xs text-slate-300">{group.items.length}</span>
              </div>

              <ul className="space-y-2.5">
                {group.items.map((log, i) => (
                  <li key={`${group.bucket}-${log.sent_at ?? "?"}-${log.to_email ?? "?"}-${i}`}>
                    <NotificationRow log={log} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {/* Fallback silencioso: Spinner mantido para uso futuro/estados raros. */}
          <div className="hidden">
            <Spinner />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Subcomponentes -- */

/** Mini-cartão de resumo no hero. */
function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "slate" | "emerald" | "red";
  icon?: React.ReactNode;
}) {
  const tones: Record<typeof tone, string> = {
    slate: "text-slate-700",
    emerald: "text-emerald-600",
    red: "text-red-600",
  };
  return (
    <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon && <span className={tones[tone]}>{icon}</span>}
        <span>{label}</span>
      </div>
      <p className={cx("mt-0.5 text-xl font-semibold tabular-nums", tones[tone])}>
        {value}
      </p>
    </div>
  );
}

/** Chip/segmented de filtro por estado. */
function FilterChip({
  active,
  onClick,
  label,
  count,
  tone = "brand",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "brand" | "emerald" | "red";
}) {
  const activeTone: Record<typeof tone, string> = {
    brand: "border-brand bg-brand text-white",
    emerald: "border-emerald-500 bg-emerald-500 text-white",
    red: "border-red-500 bg-red-500 text-white",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? activeTone[tone]
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      {label}
      <span
        className={cx(
          "rounded-full px-1.5 py-px text-[11px] tabular-nums",
          active ? "bg-white/25" : "bg-slate-100 text-slate-500"
        )}
      >
        {count}
      </span>
    </button>
  );
}

/** Uma linha do feed: ícone por assunto, acento por estado, assunto, para, hora. */
function NotificationRow({ log }: { log: EmailLog }) {
  const sent = isSent(log.status);
  const closing = isClosingSubject(log.subject);

  return (
    <Card
      className={cx(
        // Acento de cor à esquerda consoante o estado + hover subtil.
        "group relative overflow-hidden py-3.5 pl-4 pr-4 transition-colors hover:border-slate-300",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        sent ? "before:bg-emerald-400" : "before:bg-red-400"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Ícone consoante o tipo de assunto (fecho vs. entrada) */}
        <div
          className={cx(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
            closing
              ? "bg-brand-50 text-brand-700"
              : "bg-teal-50 text-teal-600"
          )}
          title={closing ? "Fecho de etapa" : "Entrada em etapa"}
        >
          {closing ? (
            <Check width={16} height={16} />
          ) : (
            <FileText width={16} height={16} />
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
                <Check width={11} height={11} />
                Enviado
              </Badge>
            ) : (
              <Badge className="shrink-0 bg-red-50 text-red-700 ring-red-200">
                <AlertTriangle width={11} height={11} />
                Falhou
              </Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
            <span className="truncate">
              Para <span className="text-slate-600">{log.to_email ?? "—"}</span>
            </span>
            <span aria-hidden>·</span>
            <span className="shrink-0" title={log.sent_at ?? undefined}>
              {relativeTime(log.sent_at) || "—"}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Esqueleto de ~4 linhas para o estado de carregamento. */
function FeedSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="py-3.5 pl-4 pr-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
