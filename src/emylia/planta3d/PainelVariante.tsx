// Protótipo (visualizador 3D): o painel da variante de uma peça de família (acabamento, medida, outra família do mesmo tipo, montagem do lava-loiça)
// e o painel do conjunto a que a peça pertence (componentes, retirar, repor, trocar, preço do conjunto contra a soma), mais a lista de peças vendáveis.
import type { PecaPlanta, Planta } from "../planta";
import type { OpcoesPeca } from "./modelo";
import { conjuntoPorId, familiasSubstitutas, linhasVendaveis, precoConjunto, totalDasLinhas } from "./conjuntos";
import { acabamentosDaMedida, familiaPorId, resolverVariante } from "./familias";
import { Button } from "@/components/ui/button";

const SEL = "h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

export interface PainelVarianteProps {
  peca: PecaPlanta;
  onMudar: (familiaId: string, medidaId?: string, acabId?: string) => void;
  onMontagem: (m: "baixo" | "cima") => void;
  /** as opções do modelo detalhado (rotação e extracção da bica, tampas dos ralos, escorredor reverso, articulação) */
  onOpcao?: (parcial: Partial<OpcoesPeca>) => void;
}
/** Escolher a variante: o acabamento muda a cor e o material na hora no 3D; a medida muda o tamanho, o SKU e o preço. */
export function PainelVariante({ peca, onMudar, onMontagem, onOpcao }: PainelVarianteProps) {
  const f = peca.fam ? familiaPorId(peca.fam) : undefined;
  if (!f) return null;
  const v = resolverVariante(f, peca.med, peca.acab), acabs = acabamentosDaMedida(f, v.medida.id), subs = familiasSubstitutas(peca);
  return (
    <div role="group" aria-label="Variante da peça" className="w-full space-y-2 rounded-xl border border-border bg-card p-3">
      <p className="text-[15px] font-medium">{v.nome}</p>
      <p className="text-sm text-muted-foreground">SKU {v.sku} · {eur(v.preco)}{v.acabamento.delta ? ` (acabamento ${v.acabamento.delta > 0 ? "+" : ""}${eur(v.acabamento.delta)})` : ""}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Acabamento" className="flex flex-wrap items-center gap-1">
          {acabs.map((a) => (
            <button key={a.id} type="button" aria-label={`Acabamento ${a.nome}`} aria-pressed={a.id === v.acabamento.id} title={a.nome} onClick={() => onMudar(f.id, v.medida.id, a.id)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <span className={`block h-7 w-7 rounded-full border-2 ${a.id === v.acabamento.id ? "border-primary ring-2 ring-primary/30" : "border-border"}`} style={{ background: a.cor }} />
            </button>
          ))}
        </div>
        {f.medidas.length > 1 && (
          <label className="grid gap-1 text-sm font-medium">Medida
            <select className={SEL} value={v.medida.id} onChange={(e) => onMudar(f.id, e.target.value, v.acabamento.id)}>{f.medidas.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}</select>
          </label>
        )}
        {subs.length > 1 && (
          <label className="grid gap-1 text-sm font-medium">Trocar por
            <select className={SEL} value={f.id} onChange={(e) => onMudar(e.target.value)}>{subs.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
          </label>
        )}
        {onOpcao && f.opcoes?.includes("bica") && (
          <label className="grid gap-1 text-sm font-medium">Rodar a bica: {peca.opc?.bica ?? 0}°
            <input type="range" min={0} max={360} step={5} value={peca.opc?.bica ?? 0} aria-label="Rodar a bica, em graus" className="h-11 w-40" onChange={(e) => onOpcao({ bica: Number(e.target.value) })} />
          </label>
        )}
        {onOpcao && f.opcoes?.includes("extraida") && (
          <label className="flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={!!peca.opc?.extraido} onChange={(e) => onOpcao({ extraido: e.target.checked })} />Bica extraída (com o flexível)</label>
        )}
        {onOpcao && f.opcoes?.includes("tampas") && (
          <label className="flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={!!peca.opc?.tampas} onChange={(e) => onOpcao({ tampas: e.target.checked })} />Retirar as tampas dos ralos</label>
        )}
        {f.tipo === "lava_loica" && (
          <label className="grid gap-1 text-sm font-medium">Montagem
            <select className={SEL} value={peca.opc?.montagem ?? "baixo"} onChange={(e) => onMontagem(e.target.value === "cima" ? "cima" : "baixo")}>
              <option value="baixo">Por baixo</option><option value="cima">Por cima</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

export interface PainelConjuntoProps {
  planta: Planta; peca: PecaPlanta;
  onEscolher: (id: string) => void; onRetirar: (id: string) => void; onRepor: (id: string) => void;
}
/** O conjunto de uma peça: cada componente com a sua variante, retirar ou repor, e o preço do conjunto contra a soma. */
export function PainelConjunto({ planta, peca, onEscolher, onRetirar, onRepor }: PainelConjuntoProps) {
  const def = peca.conjId ? conjuntoPorId(peca.conjId) : undefined, preco = peca.conj ? precoConjunto(planta, peca.conj) : null;
  if (!def || !preco) return null;
  const membros = planta.pecas.filter((p) => p.conj === peca.conj);
  return (
    <section aria-label={`Conjunto ${def.nome}`} className="w-full space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
      <p className="text-[15px] font-semibold">{def.nome}</p>
      <ul className="space-y-1">
        {def.componentes.map((c) => {
          const p = membros.find((m) => m.papel === c.papel);
          if (!p) return null;
          const f = p.fam ? familiaPorId(p.fam) : undefined, v = f ? resolverVariante(f, p.med, p.acab) : null;
          return (
            <li key={c.papel} className="flex flex-wrap items-center gap-2 text-[15px]">
              <span className={p.ret ? "text-muted-foreground line-through" : ""}>{c.rotulo}: {v ? `${v.nome} · ${v.acabamento.nome} · ${eur(v.preco)}` : p.nome}</span>
              {p.ret && <span className="text-sm text-amber-800">retirado do conjunto</span>}
              {!p.ret && <Button type="button" variant="ghost" className="min-h-11" aria-pressed={p.id === peca.id} onClick={() => onEscolher(p.id)}>Escolher</Button>}
              {p.ret ? <Button type="button" variant="outline" className="min-h-11" onClick={() => onRepor(p.id)}>Repor {c.rotulo.toLowerCase()}</Button>
                : !p.ancora && <Button type="button" variant="outline" className="min-h-11" onClick={() => onRetirar(p.id)}>Retirar {c.rotulo.toLowerCase()}</Button>}
            </li>
          );
        })}
      </ul>
      <p className="text-[15px]">Soma das peças {eur(preco.soma)} · conjunto <b>{eur(preco.total)}</b>{preco.poupanca > 0 ? ` (poupa ${eur(preco.poupanca)})` : ""}.</p>
      {!preco.completo && <p className="text-sm text-amber-800">Sem {preco.faltam.join(", ").toLowerCase()}: o conjunto fica sem desconto (cada peça vende-se à parte).</p>}
    </section>
  );
}

/** A lista de peças do espaço como linhas vendáveis: cada componente de um conjunto é uma linha por si, com a indicação do conjunto. */
export function ListaVendavel({ planta }: { planta: Planta }) {
  const linhas = linhasVendaveis(planta);
  if (linhas.length === 0) return null;
  return (
    <details className="rounded-xl border border-border p-3">
      <summary className="min-h-11 cursor-pointer content-center text-[15px] font-medium">Lista de peças para venda ({linhas.filter((l) => !l.retirado).length})</summary>
      <ul className="space-y-1 pt-2 text-[15px]">
        {linhas.map((l) => (
          <li key={l.id} className={l.retirado ? "text-muted-foreground line-through" : ""}>
            {l.nome}{l.sku ? ` · SKU ${l.sku}` : ""}{l.preco !== undefined ? ` · ${eur(l.preco)}` : ""}
            {l.conjNome ? ` · faz parte do conjunto ${l.conjNome}` : ""}{l.retirado ? " · retirado do conjunto" : ""} · vende-se à parte
          </li>
        ))}
      </ul>
      <p className="pt-2 text-[15px]">Total com preços de família: <b>{eur(totalDasLinhas(planta))}</b> (os conjuntos completos com o desconto do conjunto).</p>
    </details>
  );
}
