import { useState } from "react";
import type { Acompanhamento, FaseCliente, FotoCliente } from "../lib/acompanhamento";
import { cx } from "./ui";
import { AlertTriangle, Check, Clock, MapPin, X } from "./icons";

/**
 * O que o cliente vê da sua obra. Só apresentação: os dados já chegam
 * filtrados pela base (rpc_ops_acompanhar / rpc_ops_obra_acompanhamento_previa).
 * Usada pela página pública e pela pré-visualização da equipa — por isso o
 * que a equipa vê na pré-visualização é exatamente o que o cliente vê.
 */

const ESTADO_OBRA: Record<Acompanhamento["obra"]["estado"], { rotulo: string; classe: string }> = {
  planeada: { rotulo: "Por começar", classe: "bg-white/15 text-white" },
  em_curso: { rotulo: "Em curso", classe: "bg-emerald-400/20 text-emerald-100" },
  suspensa: { rotulo: "Em pausa", classe: "bg-amber-400/20 text-amber-100" },
  concluida: { rotulo: "Concluída", classe: "bg-emerald-400/25 text-emerald-50" },
  cancelada: { rotulo: "Cancelada", classe: "bg-white/10 text-white/70" },
};

/** 'AAAA-MM-DD' (ou ISO completo) → data local, sem o fuso a puxar um dia para trás. */
function paraData(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dataCurta(iso: string | null | undefined): string {
  const d = paraData(iso);
  return d ? d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" }).replace(".", "") : "—";
}

function dataLonga(iso: string | null | undefined): string {
  const d = paraData(iso);
  return d
    ? d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })
    : "por marcar";
}

function intervalo(f: FaseCliente): string {
  if (!f.inicio && !f.fim) return "datas por marcar";
  if (f.inicio && f.fim && f.inicio !== f.fim) return `${dataCurta(f.inicio)} – ${dataCurta(f.fim)}`;
  return dataCurta(f.inicio ?? f.fim);
}

function Anel({ percentagem }: { percentagem: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, percentagem));
  return (
    <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`${p} % da obra feita`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#anel)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          style={{ transition: "stroke-dashoffset 900ms ease-out" }}
        />
        <defs>
          <linearGradient id="anel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular text-white">{p}%</span>
        <span className="text-[11px] uppercase tracking-wider text-white/60">feito</span>
      </div>
    </div>
  );
}

function PontoFase({ estado }: { estado: FaseCliente["estado"] }) {
  if (estado === "concluida") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
        <Check width={14} height={14} />
      </span>
    );
  }
  if (estado === "em_curso") {
    return (
      <span className="relative flex h-7 w-7 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/30" />
        <span className="relative h-4 w-4 rounded-full bg-brand ring-4 ring-brand-100" />
      </span>
    );
  }
  return <span className="h-7 w-7 rounded-full border-2 border-slate-200 bg-white" />;
}

function Galeria({ fotos, urls }: { fotos: readonly FotoCliente[]; urls: ReadonlyMap<string, string> }) {
  const [aVer, setAVer] = useState<FotoCliente | null>(null);
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fotos.map((f, i) => (
          <li key={f.id} className={cx(i === 0 && fotos.length > 2 && "col-span-2 row-span-2")}>
            <button
              type="button"
              onClick={() => setAVer(f)}
              className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-slate-100"
            >
              {urls.get(f.caminho) ? (
                <img
                  src={urls.get(f.caminho)}
                  alt={f.legenda ?? f.tarefa ?? "Foto da obra"}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-xs text-slate-400">a carregar…</span>
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-left text-[11px] font-medium text-white">
                {f.legenda ?? f.fase ?? ""}
                <span className="block font-normal text-white/75">{dataCurta(f.data)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {aVer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Foto"
          onClick={() => setAVer(null)}
        >
          <button
            type="button"
            aria-label="Fechar"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setAVer(null)}
          >
            <X width={20} height={20} />
          </button>
          <figure className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {urls.get(aVer.caminho) && (
              <img src={urls.get(aVer.caminho)} alt={aVer.legenda ?? "Foto da obra"} className="max-h-[80vh] rounded-xl" />
            )}
            <figcaption className="mt-3 text-center text-sm text-white/80">
              {[aVer.legenda, aVer.fase, dataLonga(aVer.data)].filter(Boolean).join(" · ")}
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}

export default function AcompanhamentoVista({
  dados,
  urls,
  previa = false,
}: {
  dados: Acompanhamento;
  urls: ReadonlyMap<string, string>;
  /** Na pré-visualização da equipa, uma faixa a dizê-lo. */
  previa?: boolean;
}) {
  const { obra, empresa, progresso, fases, fase_atual, proxima_fase, fotos, atrasos, supervisor } = dados;
  const estado = ESTADO_OBRA[obra.estado] ?? ESTADO_OBRA.planeada;
  const mudouFim = !!obra.fim && !!obra.fim_original && obra.fim !== obra.fim_original;
  const concluida = obra.estado === "concluida";

  return (
    <div className="min-h-full bg-slate-50">
      {previa && (
        <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">
          Pré-visualização — é isto que o cliente vê no link.
        </div>
      )}

      {/* Cabeçalho de marca */}
      <header className="relative overflow-hidden bg-gradient-to-br from-sidebar via-brand-900 to-brand-700 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-5 pb-8 pt-6 sm:px-8 sm:pt-8">
          <div className="flex items-center justify-between gap-3">
            {empresa.logo_url ? (
              <img src={empresa.logo_url} alt={empresa.nome ?? "Empresa"} className="h-8 max-w-[10rem] object-contain" />
            ) : (
              <span className="text-sm font-semibold tracking-wide text-white/90">{empresa.nome ?? "A sua obra"}</span>
            )}
            <span className={cx("rounded-full px-3 py-1 text-xs font-medium backdrop-blur", estado.classe)}>{estado.rotulo}</span>
          </div>

          <div className="mt-6 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <Anel percentagem={progresso.percentagem} />
            <div className="min-w-0">
              <p className="font-mono text-xs tracking-wider text-white/60">{obra.codigo}</p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl">{obra.titulo}</h1>
              {obra.morada && (
                <p className="mt-1.5 flex items-start gap-1.5 text-sm text-white/75">
                  <MapPin width={14} height={14} className="mt-0.5 shrink-0" /> {obra.morada}
                </p>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-white/55">Início</dt>
                  <dd className="font-medium">{dataCurta(obra.inicio)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-white/55">
                    {concluida ? "Concluída" : "Conclusão prevista"}
                  </dt>
                  <dd className="font-medium">
                    {dataCurta(concluida ? obra.concluida_em : obra.fim)}
                    {mudouFim && !concluida && (
                      <span className="ml-1.5 text-xs font-normal text-white/60 line-through">{dataCurta(obra.fim_original)}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-3xl space-y-4 px-4 pb-10 sm:px-8">
        {/* Agora / a seguir */}
        {!concluida && (fase_atual || proxima_fase) && (
          <section className="grid gap-3 sm:grid-cols-2">
            {fase_atual && (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
                  {fase_atual.estado === "em_curso" ? "Agora" : "A seguir"}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{fase_atual.nome}</p>
                <p className="mt-0.5 text-sm text-slate-500">{intervalo(fase_atual)}</p>
                {fase_atual.n > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand to-fuchsia-500"
                        style={{ width: `${Math.round((100 * fase_atual.feitas) / fase_atual.n)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {fase_atual.feitas} de {fase_atual.n} trabalhos feitos
                    </p>
                  </div>
                )}
              </div>
            )}
            {proxima_fase && (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Depois</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{proxima_fase.nome}</p>
                <p className="mt-0.5 text-sm text-slate-500">{intervalo(proxima_fase)}</p>
              </div>
            )}
          </section>
        )}

        {/* Atualizações (atrasos já comunicados) */}
        {atrasos.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <h2 className="text-sm font-semibold text-slate-900">Atualizações</h2>
            <ul className="mt-3 space-y-3">
              {atrasos.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <AlertTriangle width={15} height={15} />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-800">
                      {a.motivo}
                      {a.fase && <span className="font-normal text-slate-500"> · {a.fase}</span>}
                    </p>
                    {a.nota && <p className="mt-0.5 text-slate-600">{a.nota}</p>}
                    <p className="mt-0.5 text-xs text-slate-400">
                      {dataCurta(a.data)}
                      {a.novo_fim && <> · nova data: <span className="font-medium text-slate-600">{dataCurta(a.novo_fim)}</span></>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* As fases */}
        {fases.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900">As etapas da obra</h2>
            <ol className="mt-4">
              {fases.map((f, i) => (
                <li key={f.ordem} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < fases.length - 1 && (
                    <span
                      className={cx(
                        "absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5",
                        f.estado === "concluida" ? "bg-emerald-300" : "bg-slate-200"
                      )}
                    />
                  )}
                  <PontoFase estado={f.estado} />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p
                        className={cx(
                          "font-medium",
                          f.estado === "por_fazer" ? "text-slate-500" : "text-slate-900"
                        )}
                      >
                        {f.nome}
                      </p>
                      <p className="text-xs text-slate-400">{intervalo(f)}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {f.estado === "concluida" ? "Concluída" : f.estado === "em_curso" ? "Em curso" : "Por começar"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Fotos */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Fotos da obra</h2>
          {fotos.length > 0 ? (
            <div className="mt-3">
              <Galeria fotos={fotos} urls={urls} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">As fotos do trabalho vão aparecer aqui à medida que a obra avança.</p>
          )}
        </section>

        {/* Contacto */}
        {(supervisor?.nome || empresa.telefone) && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900">Alguma dúvida?</h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand to-fuchsia-500 text-base font-semibold text-white">
                  {(supervisor?.nome ?? empresa.nome ?? "?").trim().charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-medium text-slate-900">{supervisor?.nome ?? empresa.nome}</p>
                  <p className="text-xs text-slate-500">{supervisor?.nome ? "Responsável pela sua obra" : "Equipa da obra"}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {(supervisor?.telefone || empresa.telefone) && (
                  <a
                    href={`tel:${(supervisor?.telefone || empresa.telefone || "").replace(/\s+/g, "")}`}
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-dark"
                  >
                    Ligar
                  </a>
                )}
                {supervisor?.email && (
                  <a
                    href={`mailto:${supervisor.email}?subject=${encodeURIComponent(`Obra ${obra.codigo}`)}`}
                    className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                  >
                    Email
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        <footer className="flex flex-col items-center gap-1 pt-2 text-center text-[11px] text-slate-400">
          <p className="inline-flex items-center gap-1">
            <Clock width={11} height={11} /> Atualizado{" "}
            {new Date(dados.gerado_em).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {dados.link_expira_em && <> · link válido até {dataCurta(dados.link_expira_em)}</>}
          </p>
          <p>
            Acompanhamento de obra por <span className="font-medium text-slate-500">Olyvia</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
