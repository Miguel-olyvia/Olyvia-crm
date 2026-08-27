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
import { Badge, Spinner, cx } from "../components/ui";
import { DucMark, Check, Clock } from "../components/icons";

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
    <table className="mt-1 w-full text-sm">
      <thead className="text-left text-[11px] uppercase tracking-wide text-slate-400">
        <tr>
          <th className="py-1 pr-3">Fase</th>
          <th className="py-1 pr-3">%</th>
          <th className="py-1 pr-3">Valor</th>
          <th className="py-1 pr-3">Vencimento</th>
          <th className="py-1">Nota</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {phases.map((p, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-3 font-medium text-slate-700">{p.label || `Fase ${i + 1}`}</td>
            <td className="py-1.5 pr-3 tabular-nums text-slate-600">{p.percent || "—"}</td>
            <td className="py-1.5 pr-3 tabular-nums text-slate-600">{p.amount || "—"}</td>
            <td className="py-1.5 pr-3 text-slate-600">{p.due ? fmtDate(p.due) : "—"}</td>
            <td className="py-1.5 text-slate-500">{p.note || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
  return s.trim() ? (
    <span className="whitespace-pre-wrap">{s}</span>
  ) : (
    <span className="text-slate-400">—</span>
  );
}

/* -------------------------------------------------------------------- página -- */

export default function PublicDuc() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicDucData | null | undefined>(undefined);

  useEffect(() => {
    // Não indexar (reforça o global do index.html).
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
  const doneNos = new Set(
    (duc.tracking ?? []).filter((t) => t.state === "done").map((t) => t.stage)
  );
  const totalStages = stages.length || 1;
  const donePct = Math.round((doneNos.size / totalStages) * 100);

  return (
    <div className="app-canvas min-h-screen py-6 sm:py-10">
      <div className="mx-auto max-w-3xl px-4">
        {/* Banner público */}
        <div className="mb-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            <DucMark width={13} height={13} className="text-brand" /> Documento Único de Cliente ·
            visualização pública (só leitura)
          </span>
        </div>

        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
          {/* Cabeçalho */}
          <header className="border-b border-slate-100 bg-gradient-to-br from-brand-50 via-white to-teal-50/40 px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">{duc.duc_number}</span>
                  <Badge className="bg-brand-50 text-brand-800 ring-brand-100">
                    {VARIANT_LABELS[variant] ?? variant}
                  </Badge>
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {client_name ?? duc.title ?? "DUC"}
                </h1>
              </div>
              <Badge className="bg-slate-50 text-slate-600 ring-slate-200">
                {STATUS_LABELS[duc.status] ?? duc.status}
              </Badge>
            </div>
            {/* Progresso */}
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${donePct}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-slate-500">
                {doneNos.size}/{totalStages} etapas
              </span>
            </div>
          </header>

          {/* Etapas */}
          <div className="space-y-8 px-6 py-6 sm:px-8">
            {stages.map((stage) => {
              const fields = fieldsForVariant(stage.fields, variant);
              const sections = sectionsForVariant(stage, variant);
              const block = duc.blocks?.[stage.key] ?? {};
              const done = doneNos.has(stage.no);
              return (
                <section key={stage.key}>
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-base font-semibold text-slate-800">
                      <span className="mr-2 text-brand">{stage.no}</span>
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
                            (field.type === "textarea" ||
                              field.type === "phases" ||
                              field.type === "address") &&
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
                      <div key={section.section} className="mt-4">
                        <h3 className="mb-1.5 text-sm font-semibold text-slate-700">
                          {section.title}
                        </h3>
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
                                  <td
                                    colSpan={section.columns.length}
                                    className="px-2.5 py-3 text-center text-xs text-slate-400"
                                  >
                                    Sem linhas.
                                  </td>
                                </tr>
                              ) : (
                                rows.map((r, ri) => (
                                  <tr key={ri}>
                                    {section.columns.map((c) => {
                                      const own = ["label", "description", "qty", "unit", "included"].includes(
                                        c.field
                                      );
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
            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-800">Rastreio das etapas</h2>
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

          <footer className="border-t border-slate-100 px-6 py-4 text-center text-[11px] text-slate-400 sm:px-8">
            Documento Único de Cliente · gerado em {fmtDate(duc.updated_at)} · só leitura
          </footer>
        </article>
      </div>
    </div>
  );
}
