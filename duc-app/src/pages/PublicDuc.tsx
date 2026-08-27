import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicDuc, type PublicDucData } from "../lib/publicShare";
import { stagesForVariant } from "../lib/ducConfig";
import {
  STATUS_LABELS,
  VARIANT_LABELS,
  fieldsForVariant,
  sectionsForVariant,
  type DucField,
  type PaymentPhase,
  type AddressValue,
} from "../lib/ducSchema";
import type { DucVariant } from "../lib/types";
import { Badge, Button, Spinner, cx } from "../components/ui";
import { DucMark, Check, Clock, Printer, ChevronRight } from "../components/icons";

/* --- CSS de impressão: "Guardar em PDF" gera um documento A4 limpo --- */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .duc-doc { box-shadow: none !important; border: none !important; border-radius: 0 !important; }
  .duc-hero { background: #fff !important; border-bottom: 1px solid #e2e8f0 !important; }
  .duc-stage { break-inside: avoid; }
  .duc-section-table { break-inside: avoid; }
}
`;

/* --------------------------------------------------------- renderers de valor -- */

function fmtDate(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("pt-PT");
}

function AddressValueView({ v }: { v: unknown }) {
  const a = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Partial<AddressValue>;
  const line1 = [a.street, a.number].filter(Boolean).join(", ");
  const line2 = [a.postal, a.city].filter(Boolean).join(" ");
  const all = [line1, line2].filter(Boolean).join(" · ");
  if (typeof v === "string" && v.trim()) return <span>{v}</span>;
  return <span>{all || "—"}</span>;
}

function PhasesView({ v }: { v: unknown }) {
  const phases = (Array.isArray(v) ? v : []) as PaymentPhase[];
  if (phases.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-2.5 py-1.5">Fase</th>
            <th className="px-2.5 py-1.5">%</th>
            <th className="px-2.5 py-1.5">Valor</th>
            <th className="px-2.5 py-1.5">Vencimento</th>
            <th className="px-2.5 py-1.5">Nota</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {phases.map((p, i) => (
            <tr key={i}>
              <td className="px-2.5 py-1.5 font-medium text-slate-700">{p.label || `Fase ${i + 1}`}</td>
              <td className="px-2.5 py-1.5 tabular-nums text-slate-600">{p.percent || "—"}</td>
              <td className="px-2.5 py-1.5 tabular-nums text-slate-600">{p.amount || "—"}</td>
              <td className="px-2.5 py-1.5 text-slate-600">{p.due ? fmtDate(p.due) : "—"}</td>
              <td className="px-2.5 py-1.5 text-slate-500">{p.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldValue({ field, value }: { field: DucField; value: unknown }) {
  if (field.type === "checkbox") {
    const on = value === true;
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
          on ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200"
        )}
      >
        {on && <Check width={11} height={11} />} {on ? "Sim" : "Não"}
      </span>
    );
  }
  if (field.type === "phases") return <PhasesView v={value} />;
  if (field.type === "address") return <AddressValueView v={value} />;
  if (field.type === "date") return <span>{fmtDate(value)}</span>;
  const s = typeof value === "string" ? value : value == null ? "" : String(value);
  return s.trim() ? <span className="whitespace-pre-wrap">{s}</span> : <span className="text-slate-400">—</span>;
}

/* -------------------------------------------------------------------- página -- */

export default function PublicDuc() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicDucData | null | undefined>(undefined);

  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex, nofollow";
    document.head.appendChild(m);
    if (token) void getPublicDuc(token).then((d) => setData(d));
    else setData(null);
    return () => {
      document.head.removeChild(m);
    };
  }, [token]);

  if (data === undefined) {
    return (
      <div className="app-canvas flex min-h-screen items-center justify-center">
        <Spinner label="A carregar documento…" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="app-canvas flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <DucMark width={24} height={24} />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Link indisponível</h1>
          <p className="mt-1 text-sm text-slate-500">
            Este link público não existe, foi revogado ou expirou.
          </p>
        </div>
      </div>
    );
  }

  const { duc, client_name, items } = data;
  const variant = duc.variant as DucVariant;
  const stages = stagesForVariant(variant);
  const doneNos = new Set((duc.tracking ?? []).filter((t) => t.state === "done").map((t) => t.stage));
  const totalStages = stages.length || 1;
  const donePct = Math.round((doneNos.size / totalStages) * 100);

  const meta: Array<{ label: string; value: string }> = [
    { label: "Número", value: duc.duc_number ?? "—" },
    { label: "Estado", value: STATUS_LABELS[duc.status] ?? duc.status },
    { label: "Variante", value: VARIANT_LABELS[variant] ?? variant },
    { label: "Criado", value: fmtDate(duc.created_at) },
    { label: "Atualizado", value: fmtDate(duc.updated_at) },
    { label: "Progresso", value: `${doneNos.size}/${totalStages} etapas` },
  ];

  return (
    <div className="app-canvas min-h-screen py-6 sm:py-10">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto max-w-3xl px-3 pb-24 sm:px-4 md:pb-0">
        {/* Barra: só-leitura + guardar PDF */}
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
            <DucMark width={13} height={13} className="text-brand" /> Documento público · só leitura
          </span>
          <Button onClick={() => window.print()} className="hidden sm:inline-flex">
            <Printer /> Guardar em PDF
          </Button>
        </div>

        <article className="duc-doc overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
          {/* Cabeçalho */}
          <header className="duc-hero border-b border-slate-100 bg-gradient-to-br from-brand-50 via-white to-teal-50/40 px-5 py-6 sm:px-9 sm:py-8">
            <div className="flex items-center gap-2 text-brand">
              <DucMark width={22} height={22} />
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                Documento Único de Cliente
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {client_name ?? duc.title ?? "DUC"}
              </h1>
              <Badge className="bg-white text-slate-600 ring-slate-200">
                {STATUS_LABELS[duc.status] ?? duc.status}
              </Badge>
            </div>

            {/* Meta grid */}
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {meta.map((m) => (
                <div key={m.label}>
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    {m.label}
                  </dt>
                  <dd className="text-sm font-medium text-slate-700">{m.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${donePct}%` }} />
              </div>
              <span className="text-xs font-medium tabular-nums text-slate-500">{donePct}%</span>
            </div>
          </header>

          {/* Etapas */}
          <div className="space-y-8 px-4 py-6 sm:px-9 sm:py-7">
            {stages.map((stage) => {
              const fields = fieldsForVariant(stage.fields, variant);
              const sections = sectionsForVariant(stage, variant);
              const block = duc.blocks?.[stage.key] ?? {};
              const done = doneNos.has(stage.no);
              return (
                <section key={stage.key} id={`sec-${stage.no}`} className="duc-stage scroll-mt-4">
                  <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2">
                    <h2 className="text-base font-semibold text-slate-800">
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-800 ring-1 ring-brand-100">
                        {stage.no}
                      </span>
                      {stage.title}
                    </h2>
                    {done ? (
                      <Badge className="bg-emerald-100 text-emerald-700 ring-emerald-200">
                        <Check width={12} height={12} /> Fechada
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">{stage.responsible}</span>
                    )}
                  </div>

                  {fields.length > 0 && (
                    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                      {fields.map((field) => (
                        <div
                          key={field.key}
                          className={cx(
                            "rounded-lg border border-slate-100 bg-slate-50/40 px-3 py-2",
                            (field.type === "textarea" || field.type === "phases" || field.type === "address") &&
                              "sm:col-span-2"
                          )}
                        >
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            {field.label}
                          </dt>
                          <dd className="mt-0.5 text-sm text-slate-700">
                            <FieldValue field={field} value={block[field.key]} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {sections.map((section) => {
                    const rows = items.filter((i) => i.section === section.section);
                    return (
                      <div key={section.section} className="duc-section-table mt-4">
                        <h3 className="mb-1.5 text-sm font-semibold text-slate-700">{section.title}</h3>
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                              <tr>
                                {section.columns.map((c) => (
                                  <th key={c.field} className="px-2.5 py-2">
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {rows.length === 0 ? (
                                <tr>
                                  <td colSpan={section.columns.length} className="px-2.5 py-3 text-center text-xs text-slate-400">
                                    Sem linhas.
                                  </td>
                                </tr>
                              ) : (
                                rows.map((r, ri) => (
                                  <tr key={ri}>
                                    {section.columns.map((c) => {
                                      const own = ["label", "description", "qty", "unit", "included"].includes(c.field);
                                      const raw = own
                                        ? (r as unknown as Record<string, unknown>)[c.field]
                                        : r.meta?.[c.field];
                                      const val =
                                        c.type === "checkbox"
                                          ? raw
                                            ? "Sim"
                                            : "Não"
                                          : raw == null || raw === ""
                                            ? "—"
                                            : String(raw);
                                      return (
                                        <td key={c.field} className="px-2.5 py-1.5 text-slate-600">
                                          {val}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}

            {/* Rastreio */}
            <section id="sec-rastreio" className="duc-stage scroll-mt-4">
              <h2 className="mb-3 border-b border-slate-100 pb-2 text-base font-semibold text-slate-800">
                Rastreio das etapas
              </h2>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {stages.map((stage) => {
                  const t = (duc.tracking ?? []).find((x) => x.stage === stage.no);
                  const done = t?.state === "done";
                  return (
                    <li key={stage.no} className="flex items-center gap-3 px-3 py-2.5">
                      <span
                        className={cx(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {done ? <Check width={13} height={13} /> : stage.no}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        {stage.title.split(" — ")[0]}
                      </span>
                      {done ? (
                        <span className="text-xs text-slate-400">
                          {t?.signed_by ? `por ${t.signed_by}` : ""}
                          {t?.date ? ` · ${fmtDate(t.date)}` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Clock width={12} height={12} /> pendente
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <footer className="border-t border-slate-100 px-6 py-4 text-center text-[11px] text-slate-400 sm:px-9">
            Documento Único de Cliente · {duc.duc_number ?? ""} · gerado em {fmtDate(duc.updated_at)} · só
            leitura
          </footer>
        </article>

        <p className="no-print mt-4 text-center text-[11px] text-slate-400">
          Este documento é de acesso público por link e não é indexado em motores de busca.
        </p>
      </div>

      {/* Barra fixa (só mobile): saltar para secção + Guardar PDF */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <div className="relative flex-1">
            <select
              defaultValue=""
              onChange={(e) => {
                const el = document.getElementById(e.target.value);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
                e.currentTarget.selectedIndex = 0;
              }}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm text-slate-700 outline-none focus:border-brand"
            >
              <option value="" disabled>
                Ir para secção…
              </option>
              {stages.map((s) => (
                <option key={s.no} value={`sec-${s.no}`}>
                  {s.no}. {s.title.split(" — ")[0]}
                </option>
              ))}
              <option value="sec-rastreio">Rastreio das etapas</option>
            </select>
            <ChevronRight
              width={15}
              height={15}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-slate-400"
            />
          </div>
          <Button onClick={() => window.print()} className="shrink-0 px-4 py-2.5">
            <Printer /> PDF
          </Button>
        </div>
      </nav>
    </div>
  );
}
