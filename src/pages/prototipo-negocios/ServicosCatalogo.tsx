// "Serviços necessários" na visita: o que a obra leva sai do Catálogo.
// Em cima, os serviços do pacote (as quantidades vêm das medidas); a seguir,
// os juntados do Catálogo; no fim, a pesquisa no Catálogo, por nome ou ofício,
// com os mais pedidos desta linha à mão.
import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATALOGO, OFICIOS, normal, type ItemCatalogo } from "./catalogo";
import { aValidar } from "./CamposFase";
import { LINHAS, eur, garantirServico, nfmt, r2, type Negocio, type SvcId } from "./motor";
import { numero, type Ctx } from "./pecas";

const MAX = 8;

/** Os serviços que vão para o orçamento, tirados da visita. */
export function orcLinhas(d: Negocio, S: Ctx["S"]): SvcId[] {
  const L = LINHAS[d.linha], v = d.visita;
  return [
    ...L.map.filter(([sid, k]) => v.med[k] > 0 && !v.off.includes(sid)).map(([sid]) => sid),
    ...Object.keys(v.extra).filter((sid) => (v.extra[sid] || 0) > 0 && (!!S.svc[sid] || CATALOGO.some((c) => c.id === sid))),
  ];
}

export function ServicosCatalogo({ S, A, run, d, simples }: Ctx & { d: Negocio; simples?: boolean }) {
  const L = LINHAS[d.linha], v = d.visita, ro = v.fechada;
  const [q, setQ] = useState("");
  const [oficio, setOficio] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const t = simples ? "text-[15px]" : "text-sm";

  // quantidade sugerida ao juntar: das medidas quando faz sentido, senão a habitual nos orçamentos
  const sugestao = (c: ItemCatalogo) => {
    const n = normal(c.n);
    if (c.id === "eletr") return Number(d.f.diag_pontos_eletricos) || c.qm;
    if (c.un === "m²" && n.includes("pavimento") && v.med.pav) return v.med.pav;
    if (c.un === "m²" && (n.includes("revestimento") || n.includes("pintura")) && v.med.par) return v.med.par;
    return c.qm;
  };

  const resultados = useMemo(() => {
    const qq = normal(q.trim());
    let r = CATALOGO.filter((c) => c.linhas.includes(d.linha));
    if (oficio) r = r.filter((c) => c.cat === oficio);
    if (qq) r = CATALOGO.filter((c) => (!oficio || c.cat === oficio) && (normal(c.n).includes(qq) || normal(c.cat).includes(qq)));
    return [...r].sort((a, b) => b.usos - a.usos);
  }, [q, oficio, d.linha]);
  const mostrados = todos ? resultados : resultados.slice(0, MAX);

  let total = 0;
  const pacote = L.map.map(([sid, k]) => {
    const s = S.svc[sid], qt = v.med[k] || 0, on = qt > 0 && !v.off.includes(sid);
    if (on) total += qt * s.preco;
    return { sid, s, qt, on, k };
  });
  const juntados = Object.entries(v.extra).filter(([, qt]) => (qt || 0) > 0).map(([sid, qt]) => {
    const s = S.svc[sid] || garantirServicoLeitura(S, sid);
    if (s) total += (qt || 0) * s.preco;
    return { sid, s, qt: qt || 0 };
  });

  const titulo = simples ? "text-base font-semibold" : "text-sm font-semibold";
  const linha = "flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 py-3";

  return (
    <div className="max-w-3xl space-y-8">
      {aValidar(d, "nec") && !juntados.length && !pacote.some((x) => x.on) && (
        <p className="text-[15px] font-medium text-destructive">Marque pelo menos um serviço.</p>
      )}

      <section aria-labelledby={`pac-${d.id}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={`pac-${d.id}`} className={titulo}>Do pacote "{L.modelo}"</h3>
          <span className="text-sm text-muted-foreground">quantidades das medidas</span>
        </div>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {pacote.map(({ sid, s, qt, on }) => (
            <li key={sid} className={linha}>
              <input id={`pac-${sid}-${d.id}`} type="checkbox" checked={on} disabled={ro || !(qt > 0)} className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                onChange={() => run(() => A.servico(d.id, sid))} />
              <label htmlFor={`pac-${sid}-${d.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className={cn("block", t, on ? "text-foreground" : "text-muted-foreground")}>{s.n}</span>
                <span className="block text-sm text-muted-foreground">{qt > 0 ? `${nfmt(qt)} ${s.un} · ${s.perfil}` : "falta a medida"}</span>
              </label>
              <span className={cn("w-24 text-right tabular-nums", t)}>{on ? eur(qt * s.preco) + " €" : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`jun-${d.id}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={`jun-${d.id}`} className={titulo}>Do Catálogo</h3>
          <span className="text-sm text-muted-foreground">{juntados.length ? `${juntados.length} juntado${juntados.length > 1 ? "s" : ""}` : "nenhum ainda"}</span>
        </div>
        {juntados.length > 0 ? (
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {juntados.map(({ sid, s, qt }) => s && (
              <li key={sid} className={cn(linha, "animate-in fade-in-0 slide-in-from-top-1 duration-300")}>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-foreground", t)}>{s.n}</span>
                  <span className="block text-sm text-muted-foreground">{s.perfil} · {nfmt(s.h)} h/{s.un} na receita · {eur(s.preco)} €/{s.un}</span>
                </span>
                {ro ? <span className={t}>{nfmt(qt)} {s.un}</span> : (
                  <span className="flex items-center gap-2">
                    <label htmlFor={`q-${sid}-${d.id}`} className="sr-only">Quantidade de {s.n}</label>
                    <input id={`q-${sid}-${d.id}`} key={sid + qt} type="number" min="0" step="any" inputMode="decimal" defaultValue={qt}
                      className="h-10 w-20 rounded-lg border border-input bg-card px-2 text-right text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
                      onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n !== qt) run(() => A.extra(d.id, sid, Math.max(0, n))); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    <span className="w-6 text-sm text-muted-foreground">{s.un}</span>
                  </span>
                )}
                <span className={cn("w-24 text-right tabular-nums", t)}>{eur(qt * s.preco)} €</span>
                {!ro && (
                  <button type="button" onClick={() => run(() => A.extra(d.id, sid, 0))} aria-label={`Retirar ${s.n}`}
                    className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={cn("mt-2 text-muted-foreground", t)}>Junte abaixo o que a obra leva além do pacote: nichos, toalheiro, resguardo, pontos de gás…</p>
        )}
      </section>

      {!ro && (
        <section aria-labelledby={`cat-${d.id}`} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h3 id={`cat-${d.id}`} className={titulo}>Juntar do Catálogo</h3>
          <label className="relative mt-3 block">
            <span className="sr-only">Procurar no Catálogo</span>
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setTodos(false); }} placeholder="Procurar: nicho, toalheiro, gás, resguardo…"
              className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Ofício">
            {[null, ...OFICIOS].map((o) => (
              <button key={o || "todos"} type="button" aria-pressed={oficio === o} onClick={() => { setOficio(o); setTodos(false); }}
                className={cn("min-h-9 rounded-full border px-3 text-sm transition-colors",
                  oficio === o ? "border-primary bg-primary text-primary-foreground" : "border-input text-foreground hover:border-foreground/40")}>
                {o || "Todos"}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
            {q.trim() ? `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}` : `Mais pedidos em ${L.n.toLowerCase()}${oficio ? " · " + oficio : ""}`}
          </p>
          <ul className="mt-2 divide-y divide-border">
            {mostrados.map((c) => {
              const ja = (v.extra[c.id] || 0) > 0;
              return (
                <li key={c.id} className="flex min-h-14 items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-foreground", t)}>{c.n}</span>
                    <span className="block text-sm text-muted-foreground">
                      {c.cat} · {c.un}{c.usos ? ` · em ${c.usos} orçamentos` : ""}
                    </span>
                  </span>
                  <button type="button" disabled={ja} onClick={() => run(() => A.extra(d.id, c.id, sugestao(c)))}
                    className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                      ja ? "border-transparent text-success" : "border-input text-foreground hover:border-primary hover:text-primary")}>
                    {ja ? <><Check className="h-4 w-4" aria-hidden="true" />Juntado</> : <><Plus className="h-4 w-4" aria-hidden="true" />Juntar</>}
                  </button>
                </li>
              );
            })}
            {!mostrados.length && <li className="py-3 text-[15px] text-muted-foreground">Nada no Catálogo com esse nome.</li>}
          </ul>
          {resultados.length > MAX && !todos && (
            <button type="button" onClick={() => setTodos(true)} className="mt-2 min-h-10 text-sm font-medium text-primary underline-offset-4 hover:underline">
              Ver os {resultados.length}
            </button>
          )}
        </section>
      )}

      <p className={cn("flex justify-between", simples ? "text-base" : "text-sm")}>
        <span className="text-muted-foreground">Mão de obra, a preço de tabela</span>
        <span className="font-semibold tabular-nums">{eur(r2(total))} €</span>
      </p>
    </div>
  );
}

// Só para mostrar: um serviço do Catálogo ainda sem ficha em S.svc (não grava nada).
function garantirServicoLeitura(S: Ctx["S"], sid: SvcId) {
  const copia = { ...S, svc: { ...S.svc } };
  return garantirServico(copia, sid);
}
