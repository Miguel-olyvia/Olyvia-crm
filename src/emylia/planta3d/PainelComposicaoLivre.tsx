// Protótipo (visualizador 3D): o painel da COMPOSIÇÃO LIVRE. Lista de partes (nome, variante, SKU, preço, remover), «Juntar produto» (uma família com
// medida e acabamento, ou um produto do catálogo pela pesquisa), o total e «Pôr a composição na planta». Estado só no ecrã; a lógica está em composicaoLivre.ts.
import { useMemo, useRef, useState } from "react";
import { sem, type ProdutoModelo3D } from "./catalogo3d";
import { juntarParte, linhasDaComposicaoLivre, parteDeFamilia, parteDeProduto, removerParte, totalDaComposicao, type ParteLivre } from "./composicaoLivre";
import { CATEGORIAS_FAMILIA, acabamentosDaMedida, familiasDaCategoria, resolverVariante, type CategoriaFam, type Familia } from "./familias";

const INP = "h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-full border border-input bg-background px-4 py-2 text-[15px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARIO = "inline-flex min-h-11 items-center justify-center rounded-full border border-primary bg-primary px-4 py-2 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";
const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const CATEGORIAS_LIVRES: CategoriaFam[] = ["lavaloicas", "torneiras", "placas"];
const MAX_RESULTADOS = 8;

export interface PainelComposicaoLivreProps {
  /** Os produtos do catálogo que a pesquisa oferece (os mesmos da barra). */
  produtos: readonly ProdutoModelo3D[];
  /** Põe as partes, por ordem, na planta (a primeira é a âncora). */
  onPor: (partes: ParteLivre[]) => void;
}

export function PainelComposicaoLivre({ produtos, onPor }: PainelComposicaoLivreProps) {
  const grupos = useMemo(() => CATEGORIAS_LIVRES.map((id) => ({ id, rotulo: CATEGORIAS_FAMILIA.find((c) => c.id === id)?.rotulo ?? id, familias: familiasDaCategoria(id).filter((f) => !!f.htmlModelo) })).filter((g) => g.familias.length > 0), []);
  const todas: Familia[] = grupos.flatMap((g) => g.familias);
  const [partes, setPartes] = useState<ParteLivre[]>([]);
  const [famId, setFamId] = useState<string>(todas[0]?.id ?? "");
  const [esc, setEsc] = useState<{ med?: string; acab?: string }>({});
  const [q, setQ] = useState("");
  const contador = useRef(0);
  const novoUid = () => `parte${++contador.current}`;

  const fam = todas.find((f) => f.id === famId);
  const v = fam ? resolverVariante(fam, esc.med, esc.acab) : null;
  const acabs = fam && v ? acabamentosDaMedida(fam, v.medida.id) : [];
  const linhas = linhasDaComposicaoLivre(partes), { total, semPreco } = totalDaComposicao(partes);
  const achados = useMemo(() => {
    const s = sem(q.trim());
    return s ? produtos.filter((m) => m.tipo !== "porta" && m.tipo !== "janela" && sem(`${m.nome} ${m.marca ?? ""} ${m.categoria}`).includes(s)) : [];
  }, [produtos, q]);

  const juntarFamilia = () => {
    if (!fam || !v) return;
    const p = parteDeFamilia(novoUid(), fam.id, v.medida.id, v.acabamento.id);
    if (p) setPartes((l) => juntarParte(l, p));
  };
  const juntarProduto = (m: ProdutoModelo3D) => {
    const p = parteDeProduto(novoUid(), m);
    if (p) setPartes((l) => juntarParte(l, p));
  };

  return (
    <section aria-label="Composição livre" className="w-full max-w-2xl space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-3">
      <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Protótipo: composição só no ecrã, não é guardada na base</p>

      <div>
        <p className="text-[15px] font-semibold">Partes da composição ({partes.length})</p>
        {partes.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem partes. Junta um produto abaixo.</p>}
        <ul aria-label="Partes da composição" className="mt-1 space-y-2">
          {linhas.map((l, i) => (
            <li key={l.uid} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
              <div className="min-w-0 flex-1 text-[15px]">
                <p className="font-medium">{i + 1}. {l.nome}{i === 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">(ponto de ancoragem)</span>}</p>
                <p className="text-sm text-muted-foreground">{l.variante}{l.sku ? ` · SKU ${l.sku}` : ""}</p>
              </div>
              {l.semPreco ? <span className="rounded bg-muted px-2 py-0.5 text-sm text-muted-foreground">sem preço</span> : <span className="text-[15px] tabular-nums">{eur(l.preco ?? 0)}</span>}
              <button type="button" className={BTN} aria-label={`Remover ${l.nome}`} onClick={() => setPartes((p) => removerParte(p, l.uid))}>Remover</button>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex flex-wrap items-baseline gap-2 text-[15px] font-semibold"><span>Total: {eur(total)}</span>{semPreco > 0 && <span className="text-sm font-normal text-muted-foreground">({semPreco} sem preço, fora da soma)</span>}</p>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <p className="text-[15px] font-semibold">Juntar produto</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium">Família
            <select className={INP} value={famId} onChange={(e) => { setFamId(e.target.value); setEsc({}); }}>
              {grupos.map((g) => <optgroup key={g.id} label={g.rotulo}>{g.familias.map((f) => <option key={f.id} value={f.id}>{f.nome} · {f.marca}</option>)}</optgroup>)}
            </select>
          </label>
          {fam && fam.medidas.length > 1 && v && (
            <label className="grid gap-1 text-sm font-medium">Medida
              <select className={INP} value={v.medida.id} onChange={(e) => setEsc({ med: e.target.value, acab: acabamentosDaMedida(fam, e.target.value).some((a) => a.id === v.acabamento.id) ? v.acabamento.id : undefined })}>
                {fam.medidas.map((m) => <option key={m.id} value={m.id}>{m.rotulo} · {m.ref}</option>)}
              </select>
            </label>
          )}
          {v && (
            <label className="grid gap-1 text-sm font-medium">Acabamento
              <select className={INP} value={v.acabamento.id} onChange={(e) => setEsc({ med: v.medida.id, acab: e.target.value })}>
                {acabs.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </label>
          )}
        </div>
        {v && <p className="text-sm text-muted-foreground">SKU {v.sku} · {eur(v.preco)}</p>}
        <button type="button" className={BTN} disabled={!v} aria-label={v ? `Juntar a família ${v.nome}, ${v.acabamento.nome}, ${eur(v.preco)}` : "Juntar a família"} onClick={juntarFamilia}>Juntar esta variante</button>

        <label className="grid gap-1 pt-1 text-sm font-medium">Procurar produto do catálogo
          <input type="search" className={INP} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca ou categoria" />
        </label>
        {q.trim() !== "" && achados.length === 0 && <p role="status" className="text-sm text-muted-foreground">Nenhum produto serve a pesquisa.</p>}
        {achados.length > 0 && (
          <ul aria-label="Resultados da pesquisa" className="flex flex-wrap gap-2">
            {achados.slice(0, MAX_RESULTADOS).map((m) => (
              <li key={m.produtoId}><button type="button" className={BTN} aria-label={`Juntar produto ${m.nome}`} onClick={() => juntarProduto(m)}><span className="max-w-64 truncate">{m.nome}</span></button></li>
            ))}
          </ul>
        )}
        {achados.length > MAX_RESULTADOS && <p className="text-sm text-muted-foreground">Mostram-se {MAX_RESULTADOS} de {achados.length}: afina a pesquisa.</p>}
      </div>

      <button type="button" className={BTN_PRIMARIO} disabled={partes.length === 0} aria-label="Pôr a composição na planta" onClick={() => onPor(partes)}>Pôr a composição na planta</button>
    </section>
  );
}
