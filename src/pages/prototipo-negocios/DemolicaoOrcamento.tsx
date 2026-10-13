// O detalhe da linha "Demolição e remoção de entulho…" no orçamento (13/10/2026): os artigos e as quantidades
// (o comercial escolhe), o fator de acesso que veio do levantamento, horas, m³, toneladas, o meio (big bags ou
// contentor) com a ocupação, e o preço. Cada valor pode ser mexido à mão ("ajustado", com "repor o cálculo").
// O custo, o custo/hora, o C_dep e o markup só se mostram à Direção.
import { useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, nfmt, type Negocio } from "./motor";
import { numero, type Ctx } from "./pecas";
import { useCatalogo } from "./v2/catalogoStore";
import { ARTIGOS_DEM0, PAR_DEM0, resumoDemolicao, type AjustesDem, type ChaveAjuste, type Meio, type Ocupacao } from "./entulho";

const COR: Record<Ocupacao["cor"], string> = { ok: "bg-success", aviso: "bg-warning", mau: "bg-destructive" };
const TXT: Record<Ocupacao["cor"], string> = { ok: "text-success", aviso: "text-warning", mau: "text-destructive" };

/** A ocupação dos big bags ou contentores: uma barra por cada um, com a cor. */
export function OcupacaoMeio({ oc }: { oc: Ocupacao }) {
  return (
    <div className="space-y-2" aria-label="Ocupação">
      <div className="flex flex-wrap gap-2">
        {oc.vol.map((v, k) => {
          const p = Math.max(v, oc.peso[k]);
          return (
            <span key={k} className="w-16" title={`${oc.meio === "contentor" ? "Contentor" : "Big bag"} ${k + 1}: ${p}%`}>
              <span className="block h-2 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full", COR[p > 100 ? "mau" : p > 80 ? "aviso" : "ok"])} style={{ width: `${Math.min(100, p)}%` }} /></span>
              <span className="mt-0.5 block text-center text-xs tabular-nums text-muted-foreground">{p}%</span>
            </span>
          );
        })}
      </div>
      <p className={cn("text-sm font-medium", TXT[oc.cor])}>{oc.texto}</p>
      {oc.falta && <p className="text-sm font-medium text-destructive">{oc.falta.charAt(0).toUpperCase() + oc.falta.slice(1)}.</p>}
      {oc.sugestao && <p className="text-sm text-muted-foreground">{oc.sugestao.charAt(0).toUpperCase() + oc.sugestao.slice(1)}.</p>}
    </div>
  );
}

export function DemolicaoOrcamento({ S, A, run, d }: Pick<Ctx, "S" | "A" | "run"> & { d: Negocio }) {
  const K = useCatalogo();
  const o = d.orc!, dem = o.demolicao!, r = dem.r, fechado = !!o.enviada, direcao = S.role === "direcao";
  const artigos = K.artigosDem ?? ARTIGOS_DEM0, P = K.parDem ?? PAR_DEM0;
  const [novo, setNovo] = useState("");
  if (!r) return null;
  const aj = (k: ChaveAjuste) => r.ajustados.includes(k);
  const ajustar = <C extends ChaveAjuste>(k: C, v: AjustesDem[C] | null) => run(() => A.demolicaoAjuste(d.id, k, v));
  const Repor = ({ k }: { k: ChaveAjuste }) => (aj(k) && !fechado ? (
    <button type="button" onClick={() => ajustar(k, null)} className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary">
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />repor o cálculo
    </button>
  ) : null);
  const Marca = ({ k }: { k: ChaveAjuste }) => (aj(k) ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">ajustado</span> : null);
  const Numero = ({ k, v, rot, un, passo = 0.1 }: { k: "horas" | "toneladas" | "preco" | "precoContentor"; v: number; rot: string; un: string; passo?: number }) => (
    <label className="flex flex-wrap items-center gap-2 text-[15px]">
      <span className="min-w-36">{rot}</span>
      <input key={k + v} type="number" inputMode="decimal" min="0" step={passo} defaultValue={v} disabled={fechado}
        className="h-10 w-28 rounded-lg border border-input bg-card px-2 text-right tabular-nums outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
        onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n >= 0 && n !== v) ajustar(k, n); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      <span className="text-sm text-muted-foreground">{un}</span><Marca k={k} /><Repor k={k} />
    </label>
  );

  return (
    <section aria-label="Demolição e entulho: detalhe" className="mt-3 space-y-5 rounded-2xl border border-border bg-muted/30 p-4">
      <p className="text-sm text-muted-foreground">{resumoDemolicao(r)} · fator de acesso {nfmt(r.fAcesso)} ({r.origemAcesso})</p>

      {/* os artigos */}
      <div>
        <h4 className="text-[15px] font-semibold">Artigos de demolição</h4>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
          {dem.itens.map((it) => {
            const a = artigos.find((x) => x.codigo === it.codigo), c = r.artigos.find((x) => x.codigo === it.codigo);
            return (
              <li key={it.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{a?.descricao ?? it.codigo}</span>
                  <span className="block text-xs text-muted-foreground">{it.codigo}{c ? ` · ${nfmt(c.horas)} h · ${nfmt(Math.round(c.m3 * 1000) / 1000)} m³ · ${nfmt(Math.round(c.t * 1000) / 1000)} t` : ""}{it.de ? " · do serviço" : " · posto à mão"}</span>
                </span>
                {!fechado && (
                  <span className="inline-flex items-center rounded-lg border border-input bg-card p-0.5" role="group" aria-label={`Quantidade de ${a?.descricao ?? it.codigo}`}>
                    <button type="button" aria-label="Menos" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" onClick={() => run(() => A.demolicaoItem(d.id, it.codigo, Math.max(0, it.q - 1)))}><Minus className="h-4 w-4" /></button>
                    <output className="w-12 text-center tabular-nums">{nfmt(it.q)}</output>
                    <button type="button" aria-label="Mais" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" onClick={() => run(() => A.demolicaoItem(d.id, it.codigo, it.q + 1))}><Plus className="h-4 w-4" /></button>
                  </span>
                )}
                <span className="w-10 text-sm text-muted-foreground">{a?.unidade}</span>
              </li>
            );
          })}
        </ul>
        {!fechado && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select aria-label="Juntar artigo de demolição" value={novo} onChange={(e) => setNovo(e.target.value)}
              className="h-10 rounded-lg border border-input bg-card px-2 text-[15px]">
              <option value="">Juntar artigo…</option>
              {artigos.filter((a) => a.ativo && !dem.itens.some((x) => x.codigo === a.codigo)).map((a) => <option key={a.codigo} value={a.codigo}>{a.descricao} ({a.unidade})</option>)}
            </select>
            <button type="button" disabled={!novo} onClick={() => { run(() => A.demolicaoItem(d.id, novo, 1)); setNovo(""); }}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-input px-3 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-50">
              <Plus className="h-4 w-4" aria-hidden="true" />Juntar
            </button>
          </div>
        )}
      </div>

      {/* o meio */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-36 text-[15px]">Meio</span>
          {(["bigbag", "contentor", "nenhum"] as Meio[]).map((m) => (
            <button key={m} type="button" disabled={fechado} aria-pressed={r.meio === m} onClick={() => ajustar("meio", m)}
              className={cn("min-h-10 rounded-full border px-3 text-sm transition-colors disabled:opacity-60", r.meio === m ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-foreground/40")}>
              {m === "bigbag" ? "Big bags" : m === "contentor" ? "Contentor" : "Nenhum (o cliente tem)"}
            </button>
          ))}
          <Marca k="meio" /><Repor k="meio" />
        </div>
        {r.meio !== "nenhum" && (
          <div className="flex flex-wrap items-center gap-2 text-[15px]">
            <span className="min-w-36">N.º de {r.meio === "contentor" ? "contentores" : "big bags"}</span>
            {!fechado && <span className="inline-flex items-center rounded-lg border border-input bg-card p-0.5" role="group" aria-label="Número">
              <button type="button" aria-label="Menos" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" onClick={() => ajustar("n", Math.max(1, r.n - 1))}><Minus className="h-4 w-4" /></button>
              <output className="w-10 text-center tabular-nums">{r.n}</output>
              <button type="button" aria-label="Mais" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" onClick={() => ajustar("n", r.n + 1)}><Plus className="h-4 w-4" /></button>
            </span>}
            {fechado && <span className="tabular-nums">{r.n}</span>}
            <Marca k="n" /><Repor k="n" />
          </div>
        )}
        {r.meio === "contentor" && <Numero k="precoContentor" v={r.n ? Math.round((r.deposicao / r.n) * 100) / 100 : P.contentor.preco} rot="Preço do contentor" un="€" passo={10} />}
        {r.ocupacao && <OcupacaoMeio oc={r.ocupacao} />}
        {r.propostaContentor && <p className="text-sm text-muted-foreground">Proposta: {r.propostaContentor}.</p>}
      </div>

      {/* horas, toneladas e preço */}
      <div className="space-y-2">
        <Numero k="horas" v={Math.round((r.horas - r.horasCarga) * 100) / 100} rot="Horas de demolição" un={`h (+ ${nfmt(r.horasCarga)} h de carga)`} />
        <Numero k="toneladas" v={r.t} rot="Toneladas" un={`t · ${nfmt(r.m3)} m³`} passo={0.05} />
        <Numero k="preco" v={r.preco} rot="Preço" un="€" passo={1} />
      </div>

      {/* só a Direção vê o custo */}
      {direcao ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {([["Demolição", r.demolicao], ["Carga", r.carga], ["Deposição", r.deposicao], ["Consumíveis", r.consumiveis], ["Proteção e limpeza", r.protecao], ["Custo", r.custo]] as [string, number][]).map(([t, v]) => (
            <div key={t}><dt className="text-muted-foreground">{t}</dt><dd className="tabular-nums">{eur(v)} €</dd></div>
          ))}
          <div className="col-span-full text-xs text-muted-foreground">
            {eur(P.custoHora)} €/h · C_dep {eur(P.cDep)} €/{P.unDep} · {P.modoPreco === "markup" ? `markup ${Math.round(P.markup * 100)}%` : `margem ${Math.round(P.margem * 100)}%`} · preço calculado {eur(r.precoCalc)} €
          </div>
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">O custo/hora, a deposição e a margem são definidos pela Direção.</p>
      )}
    </section>
  );
}
