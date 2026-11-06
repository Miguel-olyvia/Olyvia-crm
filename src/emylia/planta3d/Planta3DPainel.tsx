// Protótipo (visualizador 3D): o painel «Ver em 3D» por baixo da planta. Converte o desenho (planta.ts) para o modelo genérico, escolhe a vista,
// os revestimentos e o tecto, mostra a lista em texto (paredes e peças com medidas) e, no telemóvel, abre em ecrã inteiro. O three só se carrega
// (React.lazy) quando este painel abre.
import { Suspense, lazy, useMemo, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Planta } from "../planta";
import { modeloDoProduto, type NoCat, type ProdutoCat, type ProdutoModelo3D } from "./catalogo3d";
import { deLegado } from "./ligacao";
import { TOPO_BANCADA_MM, VISTAS_BANCADA, presetDaVista, type VistaBancada } from "./bancada";
import { areaPavimento, areaParedes, descreverEspaco, type TipoEspaco } from "./modelo";
import { REVESTIMENTOS, type Superficie } from "./revestimentos";
import type { Vista3D } from "./Visualizador3D";

const Visualizador3D = lazy(() => import("./Visualizador3D"));
const SEL = "h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const VISTAS: { v: Vista3D; n: string }[] = [{ v: "cima", n: "Vista de cima" }, { v: "3d", n: "Vista 3D" }, { v: "pessoa", n: "Primeira pessoa" }];
const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

export interface Planta3DPainelProps {
  planta: Planta; tipo: TipoEspaco; nome: string; peDireito: number;
  produtos: readonly ProdutoCat[]; arvore: readonly NoCat[];
  rev: { pavimento: string; parede: string }; onRev: (s: Superficie, id: string) => void;
  teto: boolean; onTeto: (t: boolean) => void;
  /** a peça escolhida, a mesma da planta */
  selecionada: string | null; onSelecionar: (id: string | null) => void;
  /** Botões da peça escolhida (Remover, Rodar…), mostrados por cima do 3D. */
  acoes?: ReactNode;
}

export function Planta3DPainel({ planta, tipo, nome, peDireito, produtos, arvore, rev, onRev, teto, onTeto, selecionada, onSelecionar, acoes }: Planta3DPainelProps) {
  const [vista, setVista] = useState<Vista3D>("3d");
  const [etiquetas, setEtiquetas] = useState(true);
  const [cheio, setCheio] = useState(false);

  // as vistas da bancada escolhida (como no catálogo 3D): perspetiva ¾, perfil, frente, traseira, de cima, detalhe da bica
  const [vistaBanc, setVistaBanc] = useState<{ peca: string; v: VistaBancada; n: number } | null>(null);
  const banc = planta.pecas.find((x) => x.id === selecionada && x.banc) ?? null;
  const camara = useMemo(() => {
    if (!banc?.banc || !vistaBanc || vistaBanc.peca !== banc.id) return null;
    const pr = presetDaVista(banc.banc, vistaBanc.v), a = ((banc.rot ?? 0) * Math.PI) / 180, cx = (banc.x + banc.w / 2) / 100, cz = (banc.y + banc.h / 2) / 100;
    // do referencial da bancada (mm, topo da chapa em y = 0) para o mundo (m), com a rotação da peça
    const mundo = ([x, y, z]: [number, number, number]): [number, number, number] => [cx + (x * Math.cos(a) + z * Math.sin(a)) / 1000, TOPO_BANCADA_MM / 1000 + y / 1000, cz + (-x * Math.sin(a) + z * Math.cos(a)) / 1000];
    return { chave: `${banc.id}-${vistaBanc.v}-${vistaBanc.n}`, pos: mundo(pr.p), alvo: mundo(pr.t) };
  }, [banc, vistaBanc]);
  const res = useMemo(() => {
    const usados = new Set(planta.pecas.map((p) => p.produto).filter((x): x is string => !!x));
    const modelos: Record<string, ProdutoModelo3D> = {};
    for (const p of produtos) if (usados.has(p.id)) modelos[p.id] = modeloDoProduto(p, arvore);
    return deLegado(planta, { tipo, nome, peDireito, produtos: modelos, revestimentos: rev });
  }, [planta, tipo, nome, peDireito, produtos, arvore, rev]);

  if (!res.ok) return <p role="status" className="rounded-xl border border-border bg-muted/30 p-4 text-[15px]">{res.erro}</p>;
  const { espaco, modelos } = res;
  const linhas = descreverEspaco(espaco, (id) => modelos[id]?.nome ?? id);
  const descricao = `Vista 3D do espaço: ${nf(areaPavimento(espaco))} m² de chão, ${espaco.paredes.length} paredes, ${espaco.pecas.length} peças.`;

  return (
    <section aria-label="Ver em 3D" className={cn("space-y-3", cheio && "fixed inset-0 z-50 flex flex-col overflow-auto bg-background p-3")}>
      <div className="flex flex-wrap items-center gap-2">
        {VISTAS.map((x) => (
          <Button key={x.v} type="button" variant={vista === x.v ? "default" : "outline"} className="min-h-11" aria-pressed={vista === x.v} onClick={() => setVista(x.v)}>{x.n}</Button>
        ))}
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setCheio(!cheio)} aria-pressed={cheio}>
          {cheio ? <Minimize2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Maximize2 className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          {cheio ? "Sair do ecrã inteiro" : "Ecrã inteiro"}
        </Button>
      </div>

      {acoes}
      {banc && vista === "3d" && (
        <div role="group" aria-label="Vistas da bancada" className="flex flex-wrap gap-2">
          {VISTAS_BANCADA.map((x) => (
            <Button key={x.id} type="button" variant={camara && vistaBanc?.v === x.id ? "default" : "outline"} className="min-h-11" aria-pressed={!!camara && vistaBanc?.v === x.id}
              onClick={() => setVistaBanc({ peca: banc.id, v: x.id, n: (vistaBanc?.n ?? 0) + 1 })}>{x.nome}</Button>
          ))}
          {camara && <Button type="button" variant="ghost" className="min-h-11" onClick={() => setVistaBanc(null)}>Ver a divisão</Button>}
        </div>
      )}
      <div className={cn("overflow-hidden rounded-2xl border border-border bg-muted", cheio ? "min-h-[60vh] flex-1" : "h-[420px]")}>
        <Suspense fallback={<p role="status" className="p-4 text-[15px] text-muted-foreground">A carregar o visualizador 3D…</p>}>
          <Visualizador3D espaco={espaco} modelos={modelos} vista={vista} teto={teto} etiquetas={etiquetas} descricao={descricao} selecionada={selecionada} onSelecionar={onSelecionar} camara={camara} />
        </Suspense>
      </div>
      <p className="text-sm text-muted-foreground">
        Portas e janelas só abrem a parede em 3D se estiverem encostadas a ela (a menos de 40 cm). Clique numa peça para a escolher. {vista === "pessoa" ? "Arraste para olhar à volta (a câmara está a 1,6 m)." : vista === "cima" ? "Arraste para deslocar, roda do rato ou pinça para aproximar." : "Arraste para rodar, roda do rato ou pinça para aproximar."}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        {(["pavimento", "parede"] as Superficie[]).map((s) => (
          <label key={s} className="grid gap-1 text-sm font-medium">{s === "pavimento" ? "Revestimento do pavimento" : "Revestimento das paredes"}
            <select className={SEL} value={rev[s]} onChange={(e) => onRev(s, e.target.value)}>
              {REVESTIMENTOS[s].map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </label>
        ))}
        <label className="flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={teto} onChange={(e) => onTeto(e.target.checked)} />Tecto</label>
        <label className="flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={etiquetas} onChange={(e) => setEtiquetas(e.target.checked)} />Etiquetas das peças</label>
      </div>

      <details className="rounded-xl border border-border p-3" open>
        <summary className="min-h-11 cursor-pointer content-center text-[15px] font-medium">Lista de paredes e peças (texto)</summary>
        <p className="pt-2 text-sm text-muted-foreground">Pé-direito {nf(espaco.peDireito)} m. Chão {nf(areaPavimento(espaco))} m², paredes {nf(areaParedes(espaco))} m².</p>
        <ul className="list-disc space-y-1 pl-5 pt-2 text-[15px]">{linhas.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </section>
  );
}
