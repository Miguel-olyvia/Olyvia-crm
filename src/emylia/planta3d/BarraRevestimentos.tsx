// Protótipo (visualizador 3D): «Pavimentos» e «Revestimentos de parede» como produtos (revestimentosCatalogo.ts): cada produto com a amostra,
// as variantes de cor, a textura e o preço por m²; aplica-se ao chão, a todas as paredes, ou só a uma parede (parede de destaque).
import { useState } from "react";
import { PRODUTOS_REV, revestimentoDoCatalogo, type ProdutoRev } from "./revestimentosCatalogo";
import type { Revestimentos } from "./modelo";

const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const CHIP = "min-h-11 rounded-full border border-input bg-background px-3 text-[14px] hover:bg-accent";
/** A amostra (swatch): a cor com um desenho CSS que lembra a textura (juntas, tábuas, riscas…). */
function amostra(p: ProdutoRev, cor: string, junta?: string): React.CSSProperties {
  const j = junta ?? "rgba(0,0,0,0.25)";
  const desenho: Partial<Record<ProdutoRev["textura"], string>> = {
    azulejo: `linear-gradient(${j} 2px, transparent 2px) 0 0/20px 20px, linear-gradient(90deg, ${j} 2px, transparent 2px) 0 0/20px 20px`,
    metro: `linear-gradient(${j} 2px, transparent 2px) 0 0/20px 8px`,
    madeira: "repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 10px)",
    espinha: "repeating-linear-gradient(45deg, rgba(0,0,0,0.15) 0 2px, transparent 2px 9px)",
    riscas: `repeating-linear-gradient(90deg, ${j} 0 6px, transparent 6px 16px)`,
    ripado: "repeating-linear-gradient(90deg, rgba(0,0,0,0.4) 0 2px, transparent 2px 8px)",
    pedra: `linear-gradient(${j} 2px, transparent 2px) 0 0/24px 24px, linear-gradient(90deg, ${j} 2px, transparent 2px) 0 0/24px 24px`,
  };
  return { background: `${desenho[p.textura] ? desenho[p.textura] + ", " : ""}${cor}` };
}

export interface BarraRevestimentosProps {
  rev: Revestimentos; paredes: { id: string; nome: string }[]; areaChao: number; areaParedes: number;
  onPavimento: (id: string) => void; onParedes: (id: string) => void; onParede: (paredeId: string, id: string | null) => void;
}

export function BarraRevestimentos({ rev, paredes, areaChao, areaParedes, onPavimento, onParedes, onParede }: BarraRevestimentosProps) {
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [parede, setParede] = useState(paredes[0]?.id ?? "");
  const atual = (s: "pavimento" | "parede") => revestimentoDoCatalogo(s === "pavimento" ? rev.pavimento : rev.parede);
  const grupo = (s: "pavimento" | "parede", titulo: string) => (
    <section aria-label={titulo} className="space-y-2">
      <h4 className="text-[15px] font-semibold">{titulo} <span className="font-normal text-muted-foreground">{s === "pavimento" ? `· chão ${areaChao.toFixed(2)} m²` : `· paredes ${areaParedes.toFixed(2)} m²`}{atual(s) ? ` · agora: ${atual(s)?.nome}` : ""}</span></h4>
      <ul className="flex flex-wrap gap-3">
        {PRODUTOS_REV.filter((p) => p.superficie === s).map((p) => {
          const v = p.variantes.find((x) => x.id === escolha[p.id]) ?? p.variantes[0], id = `${p.id}:${v.id}`, area = s === "pavimento" ? areaChao : areaParedes;
          return (
            <li key={p.id} className="w-64 rounded-2xl border border-border bg-card p-3">
              <div className="h-14 w-full rounded-lg border border-border" style={amostra(p, v.cor, v.junta)} aria-hidden="true" />
              <p className="mt-2 text-[15px] font-medium">{p.nome}</p>
              <p className="text-sm text-muted-foreground">{v.nome} · {eur(p.precoM2)}/m² · ≈ {eur(p.precoM2 * area)}</p>
              <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Cores de ${p.nome}`}>
                {p.variantes.map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={x.id === v.id} aria-label={`Cor ${x.nome}`} title={x.nome} onClick={() => setEscolha((e) => ({ ...e, [p.id]: x.id }))}
                    className={`h-8 w-8 rounded-full border-2 ${x.id === v.id ? "border-primary" : "border-border"}`} style={{ background: x.cor }} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {s === "pavimento" ? <button type="button" className={CHIP} onClick={() => onPavimento(id)}>Aplicar ao chão</button> : (
                  <>
                    <button type="button" className={CHIP} onClick={() => onParedes(id)}>Todas as paredes</button>
                    <button type="button" className={CHIP} disabled={!parede} onClick={() => onParede(parede, id)}>Só a parede {paredes.find((x) => x.id === parede)?.nome ?? ""}</button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
  return (
    <div className="space-y-4">
      {grupo("pavimento", "Pavimentos")}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[15px]">Parede de destaque
          <select className="h-11 rounded-md border border-input bg-background px-2" value={parede} onChange={(e) => setParede(e.target.value)}>
            {paredes.map((w) => <option key={w.id} value={w.id}>{w.nome}{rev.porParede?.[w.id] ? ` · ${revestimentoDoCatalogo(rev.porParede[w.id])?.nome ?? ""}` : ""}</option>)}
          </select>
        </label>
        {rev.porParede?.[parede] && <button type="button" className={CHIP} onClick={() => onParede(parede, null)}>Esta parede volta ao de todas</button>}
      </div>
      {grupo("parede", "Revestimentos de parede")}
    </div>
  );
}
