// Demolição e entulho nas Definições da V2 (13/10/2026): os parâmetros e a tabela de artigos da especificação
// da Mudelar. Só a Direção muda (os outros papéis veem os valores, sem os mexer); cada mudança fica no
// histórico (quem, quando, valor antigo → novo). Vive no Catálogo (catalogoStore), que o motor lê.
import { History, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, eur, nfmt, type Estado } from "../motor";
import { numero } from "../pecas";
import {
  ARTIGOS_DEM0, CAMPOS_PAR, PAR_DEM0, UNS_DEM, registarMudanca, vSoltoDe, type ArtigoDem, type MudancaDem, type ParDem,
} from "../entulho";
import { mudarCatalogo, useCatalogo } from "./catalogoStore";
import { CARTAO, LINHA } from "./pecasDefinicoes";

const CAMPO = "h-10 rounded-lg border border-input bg-card px-2 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:bg-muted/40";
const agora = () => { const t = new Date(); return `${t.toLocaleDateString("pt-PT")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };

export function DemolicaoV2({ S, mudarPapel }: { S: Estado; mudarPapel: () => void }) {
  const K = useCatalogo();
  const P = K.parDem ?? PAR_DEM0, artigos = K.artigosDem ?? ARTIGOS_DEM0, hist = K.histDem ?? [];
  const direcao = S.role === "direcao", quem = PAPEIS[S.role].nome;

  const mudarPar = (rot: string, fn: (P: ParDem) => void, antes: unknown, depois: unknown) => mudarCatalogo((k) => {
    const p = structuredClone(k.parDem ?? PAR_DEM0); fn(p); k.parDem = p;
    k.histDem = registarMudanca(antes, depois, rot, k.histDem ?? [], quem, agora());
  });
  const mudarArtigo = (codigo: string, campo: keyof ArtigoDem, rot: string, v: ArtigoDem[keyof ArtigoDem]) => mudarCatalogo((k) => {
    const lista = structuredClone(k.artigosDem ?? ARTIGOS_DEM0), a = lista.find((x) => x.codigo === codigo)!;
    const antes = a[campo];
    if (v === undefined) delete a[campo]; else (a as unknown as Record<string, unknown>)[campo] = v;
    k.artigosDem = lista;
    k.histDem = registarMudanca(antes, v, `${codigo} · ${rot}`, k.histDem ?? [], quem, agora());
  });
  const novoArtigo = () => mudarCatalogo((k) => {
    const lista = structuredClone(k.artigosDem ?? ARTIGOS_DEM0);
    const codigo = `DEM-NOV-${String(lista.filter((a) => a.codigo.startsWith("DEM-NOV-")).length + 1).padStart(2, "0")}`;
    lista.push({ codigo, descricao: "Artigo novo", unidade: "un", tempo: 1, vSolto: 0.1, cons: 0, ativo: true });
    k.artigosDem = lista;
    k.histDem = registarMudanca("—", codigo, "Artigo novo", k.histDem ?? [], quem, agora());
  });
  const numCel = (rot: string, v: number | undefined, onSet: (n: number | undefined) => void, w = "w-20", opcional = false) => (
    <input key={rot + String(v)} type="text" inputMode="decimal" aria-label={rot} disabled={!direcao} defaultValue={v == null ? "" : String(v).replace(".", ",")}
      placeholder={opcional ? "—" : undefined} className={cn(CAMPO, w, "text-right tabular-nums")}
      onBlur={(e) => { const t = e.target.value.trim(); if (!t && opcional) { if (v != null) onSet(undefined); return; } const n = numero(t); if (!isNaN(n) && n >= 0 && n !== v) onSet(n); else e.target.value = v == null ? "" : String(v).replace(".", ","); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );

  return (
    <div className="space-y-6">
      <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3 text-[15px]", direcao ? "border-success/30 bg-success/[0.06]" : "border-warning/40 bg-warning/[0.06]")}>
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{direcao ? "Está a ver como Direção: pode mudar estes valores. Cada mudança fica no histórico." : "Só a Direção muda estes valores. O comercial só vê o preço no orçamento."}</span>
        {!direcao && <Button variant="outline" size="sm" onClick={mudarPapel}>Ver como Direção</Button>}
      </div>

      {/* parâmetros */}
      <div className={CARTAO} aria-label="Parâmetros da demolição">
        {CAMPOS_PAR.map((c) => (
          <label key={c.k} className={cn(LINHA, "justify-between")}>
            <span className="text-[15px] font-medium">{c.rot}</span>
            <span className="flex items-center gap-2">
              {numCel(c.rot, c.ler(P), (n) => { if (n != null) mudarPar(c.rot, (p) => c.por(p, n), c.ler(P), n); })}
              <span className="w-12 text-sm text-muted-foreground">{c.k === "cDep" ? `€/${P.unDep}` : c.un}</span>
            </span>
          </label>
        ))}
        <div className={cn(LINHA, "justify-between")} role="group" aria-label="Unidade da deposição">
          <span className="text-[15px] font-medium">O operador cobra a deposição</span>
          <span className="flex gap-2">
            {(["m³", "t"] as const).map((u) => (
              <button key={u} type="button" disabled={!direcao} aria-pressed={P.unDep === u} onClick={() => mudarPar("Unidade da deposição", (p) => { p.unDep = u; }, P.unDep, u)}
                className={cn("min-h-10 rounded-full border px-3 text-sm disabled:opacity-60", P.unDep === u ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{u === "m³" ? "por m³" : "à tonelada"}</button>
            ))}
          </span>
        </div>
        <div className={cn(LINHA, "justify-between")} role="group" aria-label="Como se chega ao preço">
          <span className="text-[15px] font-medium">Preço</span>
          <span className="flex gap-2">
            {(["markup", "margem"] as const).map((m) => (
              <button key={m} type="button" disabled={!direcao} aria-pressed={P.modoPreco === m} onClick={() => mudarPar("Preço", (p) => { p.modoPreco = m; }, P.modoPreco, m)}
                className={cn("min-h-10 rounded-full border px-3 text-sm disabled:opacity-60", P.modoPreco === m ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{m === "markup" ? "custo × (1 + markup)" : "custo ÷ (1 − margem)"}</button>
            ))}
          </span>
        </div>
        <label className={cn(LINHA, "justify-between")}>
          <span className="text-[15px] font-medium">Propor contentor (quando sair mais barato do que os big bags)</span>
          <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" disabled={!direcao} checked={P.contentor.ativo}
            onChange={(e) => { const v = e.target.checked; mudarPar("Propor contentor", (p) => { p.contentor.ativo = v; }, P.contentor.ativo, v); }} />
        </label>
      </div>

      {/* artigos */}
      <div>
        <h4 className="text-[15px] font-semibold">Artigos de demolição</h4>
        <p className="text-sm text-muted-foreground">V solto = V in situ × empolamento, ou o indicado. Sem peso, o peso sai do volume × densidade.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-border text-left text-sm text-muted-foreground">
                <th className="px-2 py-2 font-medium">Código</th><th className="px-2 py-2 font-medium">Descrição</th><th className="px-2 py-2 font-medium">Un.</th>
                <th className="px-2 py-2 text-right font-medium">h/un</th><th className="px-2 py-2 text-right font-medium">V in situ</th><th className="px-2 py-2 text-right font-medium">Empol.</th>
                <th className="px-2 py-2 text-right font-medium">V solto</th><th className="px-2 py-2 text-right font-medium">kg/un</th><th className="px-2 py-2 text-right font-medium">Cons. €</th><th className="px-2 py-2 font-medium">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {artigos.map((a) => (
                <tr key={a.codigo} className="border-b border-border">
                  <td className="px-2 py-1.5 text-sm tabular-nums text-muted-foreground">{a.codigo}</td>
                  <td className="px-2 py-1.5">
                    <input key={a.descricao} type="text" aria-label={`Descrição de ${a.codigo}`} disabled={!direcao} defaultValue={a.descricao} className={cn(CAMPO, "w-full min-w-56")}
                      onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== a.descricao) mudarArtigo(a.codigo, "descricao", "descrição", t); }} />
                  </td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`Unidade de ${a.codigo}`} disabled={!direcao} value={a.unidade} className={CAMPO} onChange={(e) => mudarArtigo(a.codigo, "unidade", "unidade", e.target.value)}>
                      {UNS_DEM.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right">{numCel(`Tempo de ${a.codigo}`, a.tempo, (n) => mudarArtigo(a.codigo, "tempo", "tempo padrão", n ?? 0), "w-16")}</td>
                  <td className="px-2 py-1.5 text-right">{numCel(`Volume in situ de ${a.codigo}`, a.vInsitu, (n) => mudarArtigo(a.codigo, "vInsitu", "volume in situ", n), "w-20", true)}</td>
                  <td className="px-2 py-1.5 text-right">{numCel(`Empolamento de ${a.codigo}`, a.fEmp, (n) => mudarArtigo(a.codigo, "fEmp", "empolamento", n), "w-16", true)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {numCel(`Volume solto de ${a.codigo}`, a.vSolto, (n) => mudarArtigo(a.codigo, "vSolto", "volume solto", n), "w-20", true)}
                    {a.vSolto == null && <span className="block text-xs text-muted-foreground">= {nfmt(Math.round(vSoltoDe(a) * 1000) / 1000)}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right">{numCel(`Peso de ${a.codigo}`, a.peso, (n) => mudarArtigo(a.codigo, "peso", "peso", n), "w-16", true)}</td>
                  <td className="px-2 py-1.5 text-right">{numCel(`Consumíveis de ${a.codigo}`, a.cons, (n) => mudarArtigo(a.codigo, "cons", "consumíveis", n ?? 0), "w-16")}</td>
                  <td className="px-2 py-1.5"><input type="checkbox" aria-label={`${a.codigo} ativo`} disabled={!direcao} checked={a.ativo} className="h-5 w-5 accent-[hsl(var(--primary))]" onChange={(e) => mudarArtigo(a.codigo, "ativo", "ativo", e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {direcao && <Button variant="outline" className="mt-2 min-h-11" onClick={novoArtigo}><Plus className="h-4 w-4" aria-hidden="true" />Novo artigo</Button>}
      </div>

      {/* histórico */}
      <div>
        <h4 className="flex items-center gap-2 text-[15px] font-semibold"><History className="h-4 w-4" aria-hidden="true" />Histórico de alterações</h4>
        {hist.length ? (
          <ol className="mt-2 space-y-1 text-sm">
            {hist.slice(0, 20).map((h: MudancaDem, i) => (
              <li key={i}><span className="text-muted-foreground">{h.quando} · {h.quem}:</span> {h.campo} <span className="tabular-nums">{h.antes} → {h.depois}</span></li>
            ))}
          </ol>
        ) : <p className="mt-1 text-sm text-muted-foreground">Ainda sem alterações: os valores são os de teste da especificação ({eur(PAR_DEM0.custoHora)} €/h, {eur(PAR_DEM0.cDep)} €/m³, markup {Math.round(PAR_DEM0.markup * 100)}%).</p>}
      </div>
    </div>
  );
}
