// Protótipo (visualizador 3D): a barra de PRODUTOS DO CATÁLOGO para pôr na planta. Não é uma lista fixa: vêm do catálogo (v2/catalogoModelo.ts),
// com produtos de demonstração «(demo)» onde o catálogo não tem o tipo, separados por grupos (sanitas, bidés, banheiras, espelhos…) e com pesquisa.
// Arrasta-se para a planta (ou toca-se, ou Enter, e fica ao meio), com a medida real do produto.
import { useMemo, useState, type PointerEvent as RPointerEvent } from "react";
import { GRUPOS_ESPACO, ROTULO_ESPACO, produtosDoGrupo, sem, type ProdutoModelo3D } from "./catalogo3d";
import type { TipoEspaco } from "./modelo";

const INP = "h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const CHIP = "inline-flex min-h-11 touch-none select-none items-center gap-1.5 rounded-full border border-input bg-background px-4 py-2 text-left text-[15px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const TAB = "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const PASSO_VISIVEIS = 24;

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
  const [grupoEscolhido, setGrupo] = useState<string>("");
  const [quantos, setQuantos] = useState(PASSO_VISIVEIS);
  const grupos = useMemo(() => GRUPOS_ESPACO[espaco].map((g) => ({ g, n: produtosDoGrupo(produtos, g).length })).filter((x) => x.n > 0), [produtos, espaco]);
  const atual = grupos.find((x) => x.g.id === grupoEscolhido) ?? (grupoEscolhido === "todos" ? null : grupos[0] ?? null);
  const lista = useMemo(() => {
    const s = sem(q.trim());
    const base = atual ? produtosDoGrupo(produtos, atual.g) : produtos;
    return base.filter((m) => !s || sem(`${m.nome} ${m.marca ?? ""} ${m.categoria}`).includes(s));
  }, [produtos, atual, q]);
  const escolher = (id: string) => { setGrupo(id); setQuantos(PASSO_VISIVEIS); };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium">Espaço
          <select className={INP} value={espaco} onChange={(e) => { onEspaco(e.target.value as TipoEspaco); escolher(""); }}>
            {(Object.keys(ROTULO_ESPACO) as TipoEspaco[]).map((t) => <option key={t} value={t}>{ROTULO_ESPACO[t]}</option>)}
          </select>
        </label>
        <label className="grid min-w-40 flex-1 gap-1 text-sm font-medium">Procurar no catálogo
          <input type="search" className={INP} value={q} onChange={(e) => { setQ(e.target.value); setQuantos(PASSO_VISIVEIS); }} placeholder="Nome, marca ou categoria" />
        </label>
      </div>
      <div role="tablist" aria-label="Grupos de produtos" className="flex flex-wrap gap-2">
        {grupos.map(({ g, n }) => (
          <button key={g.id} type="button" role="tab" aria-selected={atual?.g.id === g.id} className={`${TAB} ${atual?.g.id === g.id ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent"}`} onClick={() => escolher(g.id)}>
            {g.rotulo} ({n})
          </button>
        ))}
        <button type="button" role="tab" aria-selected={!atual} className={`${TAB} ${!atual ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent"}`} onClick={() => escolher("todos")}>
          Todos ({produtos.length})
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        {atual ? atual.g.rotulo : "Todos os produtos"} para {ROTULO_ESPACO[espaco].toLowerCase()}: {lista.length}. Arraste para a planta (ou toque, e fica ao meio), com a medida real do produto; as peças de parede encostam-se sozinhas à parede. «(demo)» é um produto de demonstração.
      </p>
      {lista.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">Nenhum produto serve este espaço com este filtro.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Produtos do catálogo">
          {lista.slice(0, quantos).map((m) => (
            <li key={m.produtoId}>
              <button type="button" className={CHIP} onPointerDown={(e) => onPegar(e, m)} onPointerMove={onMover} onPointerUp={onLargar} onPointerCancel={onCancelar}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJuntar(m); } }}
                aria-label={`Produto ${m.nome}, ${Math.round(m.dimensoes.larguraCm)} por ${Math.round(m.dimensoes.profundidadeCm)} cm${m.dimensoes.deNome ? "" : " (medida habitual)"}${m.montagem === "parede" ? ", de parede" : ""}`}>
                <span className="max-w-64 truncate">{m.nome}</span>
                <span className="text-sm text-muted-foreground">{Math.round(m.dimensoes.larguraCm)}×{Math.round(m.dimensoes.profundidadeCm)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length > quantos && (
        <button type="button" className="min-h-11 text-sm underline underline-offset-2" onClick={() => setQuantos(quantos + PASSO_VISIVEIS)}>Mostrar mais ({lista.length - quantos} por mostrar)</button>
      )}
    </div>
  );
}
