// Protótipo (visualizador 3D): a barra de PRODUTOS DO CATÁLOGO para pôr na planta. Não é uma lista fixa: vêm do catálogo (v2/catalogoModelo.ts),
// filtrados pelo tipo de espaço escolhido, com as dimensões reais de cada produto. Arrasta-se para a planta (ou toca-se, ou Enter, e fica ao meio).
import { useMemo, useState, type PointerEvent as RPointerEvent } from "react";
import { MAPA_ESPACO, ROTULO_ESPACO, sem, type ProdutoModelo3D, type TipoMockup } from "./catalogo3d";
import type { TipoEspaco } from "./modelo";

const INP = "h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const CHIP = "inline-flex min-h-11 touch-none select-none items-center gap-1.5 rounded-full border border-input bg-background px-4 py-2 text-left text-[15px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const ROTULO_TIPO: Record<TipoMockup, string> = {
  base_duche: "Bases de duche", banheira: "Banheiras", sanita: "Sanitas", bide: "Bidés", lavatorio: "Lavatórios", movel: "Móveis", roupeiro: "Roupeiros",
  cama: "Camas", bancada: "Bancadas", eletro: "Eletrodomésticos", caixa: "Outros", porta: "Portas", janela: "Janelas",
};
const MAX_VISIVEIS = 24;

export interface BarraProdutosProps {
  produtos: readonly ProdutoModelo3D[];
  espaco: TipoEspaco;
  onEspaco: (t: TipoEspaco) => void;
  onPegar: (e: RPointerEvent<HTMLButtonElement>, m: ProdutoModelo3D) => void;
  onMover: (e: RPointerEvent<HTMLButtonElement>) => void;
  onLargar: (e: RPointerEvent<HTMLButtonElement>) => void;
  onCancelar: () => void;
  onJuntar: (m: ProdutoModelo3D) => void;
}

export function BarraProdutos({ produtos, espaco, onEspaco, onPegar, onMover, onLargar, onCancelar, onJuntar }: BarraProdutosProps) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<TipoMockup | "">("");
  const tipos = MAPA_ESPACO[espaco];
  const lista = useMemo(() => {
    const s = sem(q.trim());
    return produtos.filter((m) => (!tipo || m.tipo === tipo) && (!s || sem(`${m.nome} ${m.marca ?? ""} ${m.categoria}`).includes(s)));
  }, [produtos, q, tipo]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium">Espaço
          <select className={INP} value={espaco} onChange={(e) => { onEspaco(e.target.value as TipoEspaco); setTipo(""); }}>
            {(Object.keys(ROTULO_ESPACO) as TipoEspaco[]).map((t) => <option key={t} value={t}>{ROTULO_ESPACO[t]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Tipo de peça
          <select className={INP} value={tipo} onChange={(e) => setTipo(e.target.value as TipoMockup | "")}>
            <option value="">Todas</option>
            {tipos.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </select>
        </label>
        <label className="grid min-w-40 flex-1 gap-1 text-sm font-medium">Procurar no catálogo
          <input type="search" className={INP} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca ou categoria" />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Produtos do catálogo para {ROTULO_ESPACO[espaco].toLowerCase()}: {lista.length}. Arraste para a planta (ou toque, e fica ao meio), com a medida real do produto.
      </p>
      {lista.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">Nenhum produto do catálogo serve este espaço com este filtro.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Produtos do catálogo">
          {lista.slice(0, MAX_VISIVEIS).map((m) => (
            <li key={m.produtoId}>
              <button type="button" className={CHIP} onPointerDown={(e) => onPegar(e, m)} onPointerMove={onMover} onPointerUp={onLargar} onPointerCancel={onCancelar}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJuntar(m); } }}
                aria-label={`Produto ${m.nome}, ${Math.round(m.dimensoes.larguraCm)} por ${Math.round(m.dimensoes.profundidadeCm)} cm${m.dimensoes.deNome ? "" : " (medida habitual)"}`}>
                <span className="max-w-64 truncate">{m.nome}</span>
                <span className="text-sm text-muted-foreground">{Math.round(m.dimensoes.larguraCm)}×{Math.round(m.dimensoes.profundidadeCm)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length > MAX_VISIVEIS && <p className="text-sm text-muted-foreground">Mostra {MAX_VISIVEIS} de {lista.length}: afine a procura.</p>}
    </div>
  );
}
