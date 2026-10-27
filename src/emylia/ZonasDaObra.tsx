// As zonas da obra no orçamento (26/10/2026): a lista das zonas (a casa, a casa de banho da suite, a cozinha…) e, em cada linha, a
// zona onde fica ou a repartição por várias (a quantidade e, nos materiais, o valor de cada zona). A proposta agrupa por zona.
// Nasceu do caso real P-2026-0109 (zonasOrcamento.ts).
import { Fragment, useId, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nfmt, qtdLinhaOrc, type Negocio } from "./motor";
import { numero, type Ctx } from "./pecas";
import { erroZonasLinha, type ZonaLinha } from "./zonasOrcamento";

const INPUT = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const REPARTIR = "__repartir";
const MUDAR = "__mudar__";

/** As zonas da obra: o botão "Zonas da obra" e, aberto, os nomes, um por linha. */
export function ZonasDaObra({ ctx, d }: { ctx: Pick<Ctx, "A" | "run">; d: Negocio }) {
  const { A, run } = ctx;
  const o = d.orc!, zonas = o.zonas ?? [];
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(zonas.join("\n"));
  const id = useId();
  if (o.enviada) return null; // 27/10: as zonas já estão nos filtros da lista (uma pastilha por zona)
  if (!aberto) return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => { setTexto(zonas.join("\n")); setAberto(true); }}>
        <MapPin className="h-4 w-4" aria-hidden="true" />{zonas.length ? "Mudar as zonas da obra" : "Separar por zonas da obra"}
      </Button>
      {zonas.length > 0 && <span className="text-sm text-muted-foreground">{zonas.join(", ")}</span>}
    </div>
  );
  const guardar = () => { run(() => { A.zonasOrc(d.id, texto.split("\n")); }); setAberto(false); };
  return (
    <section aria-labelledby={`${id}-t`} className="mb-3 grid gap-3 rounded-2xl border border-border bg-card p-4">
      <h3 id={`${id}-t`} className="text-[15px] font-semibold">Zonas da obra</h3>
      <label className="grid gap-1">
        <span className="text-sm font-medium">Uma zona por linha, pela ordem da proposta</span>
        <textarea autoFocus rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Geral\nCasa de banho suite\nCozinha"}
          className={cn(INPUT, "h-auto py-2")} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 text-[15px]" onClick={guardar}>Guardar as zonas</Button>
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => setAberto(false)}>Cancelar</Button>
      </div>
    </section>
  );
}

/** A zona de uma linha: uma só (a escolha) ou repartida por várias (abre o formulário com a quantidade e o valor de cada zona). */
/** `compacto` (27/10): dentro da fila da linha, no computador: só a caixa, sem o rótulo; a repartição abre por baixo da fila. */
export function ZonaDaLinha({ ctx, d, i, nome, compacto }: { ctx: Pick<Ctx, "A" | "run">; d: Negocio; i: number; nome: string; compacto?: boolean }) {
  const { A, run } = ctx;
  const o = d.orc!, l = o.linhas[i], zonas = o.zonas ?? [];
  const [repartir, setRepartir] = useState(false);
  const [erro, setErro] = useState("");
  const q = qtdLinhaOrc(d, l), zs = l.zonas ?? [];
  const [linhas, setLinhas] = useState<Record<string, { q: string; v: string }>>({});
  if (!zonas.length) return null;
  const resumo = zs.map((x) => `${x.z} ${nfmt(x.q)}`).join(" · ");
  if (o.enviada) return compacto ? <span className="w-40 shrink-0 truncate text-sm text-muted-foreground" title={resumo}>{resumo || "Sem zona"}</span>
    : zs.length ? <p className="ml-[52px] mt-1 text-sm text-muted-foreground">{resumo}</p> : null;
  const abrir = () => {
    setLinhas(Object.fromEntries(zonas.map((z) => { const x = zs.find((y) => y.z === z); return [z, { q: x ? nfmt(x.q) : "", v: x?.preco != null ? nfmt(x.preco) : "" }]; })));
    setErro(""); setRepartir(true);
  };
  if (repartir) {
    const guardar = () => {
      const lista: ZonaLinha[] = zonas.filter((z) => (linhas[z]?.q ?? "").trim()).map((z) => {
        const v = (linhas[z]?.v ?? "").trim();
        return { z, q: numero(linhas[z].q), ...(l.t === "mat" && v ? { preco: numero(v) } : {}) };
      });
      const e = erroZonasLinha(l, lista, zonas, q);
      if (e) { setErro(e); return; }
      run(() => { A.zonasLinha(d.id, i, lista); });
      setRepartir(false);
    };
    // 27/10 (Rúben): uma grelha, com os títulos das colunas uma vez em cima (cada caixa tinha o seu rótulo, de largura diferente,
    // e as caixas ficavam desalinhadas); a soma por baixo, enquanto se escreve
    const mat = l.t === "mat", cols = mat ? "grid-cols-[minmax(0,1fr)_7rem_8rem]" : "grid-cols-[minmax(0,1fr)_7rem]";
    const soma = zonas.reduce((a, z) => { const n = numero(linhas[z]?.q ?? ""); return a + (isNaN(n) ? 0 : n); }, 0);
    const certo = Math.abs(soma - q) < 0.005;
    return (
      <fieldset className={cn("mt-2 rounded-xl border border-border p-3", compacto ? "order-last basis-full" : "ml-[52px]")}>
        <legend className="px-1 text-sm font-medium">{nome}: repartir {nfmt(q)} pelas zonas</legend>
        <div className={cn("grid items-center gap-x-3 gap-y-2", cols)}>
          <span className="text-xs font-medium text-muted-foreground">Zona</span>
          <span className="text-right text-xs font-medium text-muted-foreground">Quantidade</span>
          {mat && <span className="text-right text-xs font-medium text-muted-foreground">Valor (€, opcional)</span>}
          {zonas.map((z) => (
            <Fragment key={z}>
              <span className="min-w-0 truncate text-[15px]" title={z}>{z}</span>
              <input inputMode="decimal" aria-label={`Quantidade em ${z}`} value={linhas[z]?.q ?? ""} onChange={(e) => setLinhas((v) => ({ ...v, [z]: { ...v[z], q: e.target.value } }))} className={cn(INPUT, "w-full text-right tabular-nums")} />
              {mat && <input inputMode="decimal" aria-label={`Valor em ${z} (€, opcional)`} value={linhas[z]?.v ?? ""} onChange={(e) => setLinhas((v) => ({ ...v, [z]: { ...v[z], v: e.target.value } }))} className={cn(INPUT, "w-full text-right tabular-nums")} />}
            </Fragment>
          ))}
          <span className="border-t border-border pt-2 text-sm text-muted-foreground">Soma</span>
          <span aria-live="polite" className={cn("border-t border-border pt-2 text-right text-sm font-medium tabular-nums", certo ? "text-success" : "text-warning")}>{nfmt(soma)} de {nfmt(q)}</span>
          {mat && <span className="border-t border-border pt-2" />}
        </div>
        {erro && <p role="alert" className="mt-2 text-[15px] text-destructive">{erro}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="min-h-11 text-[15px]" onClick={guardar}>Guardar a repartição</Button>
          <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => setRepartir(false)}>Cancelar</Button>
        </div>
      </fieldset>
    );
  }
  const valor = zs.length === 1 ? zs[0].z : zs.length > 1 ? REPARTIR : "";
  if (compacto) return (
    <label className="w-40 shrink-0">
      <span className="sr-only">Zona de {nome}</span>
      <select value={valor} className={cn(INPUT, "h-9 w-full text-sm")}
        onChange={(e) => { const v = e.target.value; if (v === REPARTIR || v === MUDAR) abrir(); else run(() => { A.zonaLinha(d.id, i, v || null); }); }}>
        <option value="">Sem zona</option>
        {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
        <option value={REPARTIR}>{zs.length > 1 ? `Várias: ${resumo}` : "Repartir por várias…"}</option>
        {zs.length > 1 && <option value={MUDAR}>Mudar a repartição…</option>}
      </select>
    </label>
  );
  return (
    <label className="ml-[52px] mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Zona</span>
      <select value={valor} aria-label={`Zona de ${nome}`} className={cn(INPUT, "h-10 w-auto")}
        onChange={(e) => { const v = e.target.value; if (v === REPARTIR) abrir(); else run(() => { A.zonaLinha(d.id, i, v || null); }); }}>
        <option value="">Sem zona</option>
        {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
        <option value={REPARTIR}>{zs.length > 1 ? `Várias: ${resumo}` : "Repartir por várias zonas…"}</option>
      </select>
      {zs.length > 1 && <button type="button" onClick={abrir} className="min-h-9 font-medium text-primary">Mudar a repartição</button>}
    </label>
  );
}
