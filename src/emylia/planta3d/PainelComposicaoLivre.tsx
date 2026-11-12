// Protótipo (visualizador 3D): o painel da COMPOSIÇÃO LIVRE, como assistente de 4 passos (um visível de cada vez):
// 1 Escolher o produto (família ou pesquisa no catálogo), 2 Medida e acabamento, 3 Rever a composição, 4 Pôr na planta.
// Estado só no ecrã (não se perde ao andar para trás); a lógica está em composicaoLivre.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { sem, type ProdutoModelo3D } from "./catalogo3d";
import { juntarParte, linhasDaComposicaoLivre, parteDeFamilia, parteDeProduto, removerParte, totalDaComposicao, type ParteLivre } from "./composicaoLivre";
import { CATEGORIAS_FAMILIA, acabamentosDaMedida, familiasDaCategoria, resolverVariante, type CategoriaFam } from "./familias";

const INP = "h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-full border border-input bg-background px-4 py-2 text-[15px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_ON = "inline-flex min-h-11 items-center justify-center rounded-full border border-primary bg-primary/10 px-4 py-2 text-[15px] font-medium text-foreground transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const BTN_PRIMARIO = "inline-flex min-h-11 items-center justify-center rounded-full border border-primary bg-primary px-4 py-2 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";
const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const CATEGORIAS_LIVRES: CategoriaFam[] = ["lavaloicas", "torneiras", "placas"];
const MAX_RESULTADOS = 8;
const TITULOS = ["Escolher o produto", "Medida e acabamento", "Rever a composição", "Pôr na planta"] as const;
const TOTAL_PASSOS = TITULOS.length;

type Escolha = { tipo: "grupo"; id: CategoriaFam } | { tipo: "produto"; produto: ProdutoModelo3D };

export interface PainelComposicaoLivreProps {
  /** Os produtos do catálogo que a pesquisa oferece (os mesmos da barra). */
  produtos: readonly ProdutoModelo3D[];
  /** Põe as partes, por ordem, na planta (a primeira é a âncora). */
  onPor: (partes: ParteLivre[]) => void;
}

export function PainelComposicaoLivre({ produtos, onPor }: PainelComposicaoLivreProps) {
  const grupos = useMemo(() => CATEGORIAS_LIVRES.map((id) => ({ id, rotulo: CATEGORIAS_FAMILIA.find((c) => c.id === id)?.rotulo ?? id, familias: familiasDaCategoria(id).filter((f) => !!f.htmlModelo) })).filter((g) => g.familias.length > 0), []);
  const [passo, setPasso] = useState(1);
  const [partes, setPartes] = useState<ParteLivre[]>([]);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [famId, setFamId] = useState<string>("");
  const [esc, setEsc] = useState<{ med?: string; acab?: string }>({});
  const [q, setQ] = useState("");
  const contador = useRef(0);
  const novoUid = () => `parte${++contador.current}`;
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    tituloRef.current?.focus();
  }, [passo]);

  const grupo = escolha?.tipo === "grupo" ? grupos.find((g) => g.id === escolha.id) : undefined;
  const fam = grupo?.familias.find((f) => f.id === famId) ?? grupo?.familias[0];
  const v = fam ? resolverVariante(fam, esc.med, esc.acab) : null;
  const acabs = fam && v ? acabamentosDaMedida(fam, v.medida.id) : [];
  const produtoEscolhido = escolha?.tipo === "produto" ? escolha.produto : undefined;
  const linhas = linhasDaComposicaoLivre(partes), { total, semPreco } = totalDaComposicao(partes);
  const achados = useMemo(() => {
    const s = sem(q.trim());
    return s ? produtos.filter((m) => m.tipo !== "porta" && m.tipo !== "janela" && sem(`${m.nome} ${m.marca ?? ""} ${m.categoria}`).includes(s)) : [];
  }, [produtos, q]);

  const escolherGrupo = (id: CategoriaFam) => {
    if (escolha?.tipo === "grupo" && escolha.id === id) return;
    setEscolha({ tipo: "grupo", id });
    setFamId(grupos.find((g) => g.id === id)?.familias[0]?.id ?? "");
    setEsc({});
  };
  const juntarFamilia = () => {
    if (!fam || !v) return;
    const p = parteDeFamilia(novoUid(), fam.id, v.medida.id, v.acabamento.id);
    if (p) { setPartes((l) => juntarParte(l, p)); setPasso(3); }
  };
  const juntarProduto = (m: ProdutoModelo3D) => {
    const p = parteDeProduto(novoUid(), m);
    if (p) { setPartes((l) => juntarParte(l, p)); setPasso(3); }
  };
  const juntarMais = () => { setEscolha(null); setQ(""); setEsc({}); setPasso(1); };

  const motivo = passo === 1 && !escolha ? "Escolha um produto"
    : passo === 2 && partes.length === 0 ? "Junte a variante para continuar"
    : passo === 3 && partes.length === 0 ? "Junte pelo menos um produto"
    : "";
  const seguinte = () => { if (!motivo) setPasso((p) => Math.min(TOTAL_PASSOS, p + 1)); };
  const anterior = () => setPasso((p) => Math.max(1, p - 1));

  return (
    <section aria-label="Composição livre" className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-3"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); if (passo > 1) anterior(); } }}>
      <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Protótipo: composição só no ecrã, não é guardada na base</p>

      <div>
        <p role="status" className="text-sm font-medium text-muted-foreground">Passo {passo} de {TOTAL_PASSOS} · {TITULOS[passo - 1]}</p>
        <ol aria-label="Passos da composição" className="mt-1 flex gap-1.5">
          {TITULOS.map((t, i) => {
            const n = i + 1, atual = n === passo;
            return (
              <li key={t} aria-current={atual ? "step" : undefined} aria-label={`Passo ${n}: ${t}${n < passo ? " (feito)" : atual ? " (atual)" : ""}`}
                className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-full border px-2 text-xs ${atual ? "border-primary bg-primary font-semibold text-primary-foreground" : n < passo ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground"}`}>
                <span aria-hidden="true">{n < passo ? "✓" : n}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <h3 ref={tituloRef} tabIndex={-1} className="rounded text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{TITULOS[passo - 1]}</h3>

        {passo === 1 && (
          <>
            <div role="group" aria-label="Famílias de produtos" className="flex flex-wrap gap-2">
              {grupos.map((g) => {
                const on = escolha?.tipo === "grupo" && escolha.id === g.id;
                return <button key={g.id} type="button" className={on ? BTN_ON : BTN} aria-pressed={on} onClick={() => escolherGrupo(g.id)}>{g.rotulo}</button>;
              })}
            </div>
            <label className="grid gap-1 pt-1 text-sm font-medium">Procurar produto do catálogo
              <input type="search" className={INP} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca ou categoria" />
            </label>
            {q.trim() !== "" && achados.length === 0 && <p role="status" className="text-sm text-muted-foreground">Nenhum produto serve a pesquisa.</p>}
            {achados.length > 0 && (
              <ul aria-label="Resultados da pesquisa" className="flex flex-wrap gap-2">
                {achados.slice(0, MAX_RESULTADOS).map((m) => {
                  const on = produtoEscolhido?.produtoId === m.produtoId;
                  return <li key={m.produtoId}><button type="button" className={on ? BTN_ON : BTN} aria-pressed={on} aria-label={`Escolher produto ${m.nome}`} onClick={() => setEscolha({ tipo: "produto", produto: m })}><span className="max-w-64 truncate">{m.nome}</span></button></li>;
                })}
              </ul>
            )}
            {achados.length > MAX_RESULTADOS && <p className="text-sm text-muted-foreground">Mostram-se {MAX_RESULTADOS} de {achados.length}: afina a pesquisa.</p>}
          </>
        )}

        {passo === 2 && grupo && fam && v && (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium">Família
                <select className={INP} value={fam.id} onChange={(e) => { setFamId(e.target.value); setEsc({}); }}>
                  {grupo.familias.map((f) => <option key={f.id} value={f.id}>{f.nome} · {f.marca}</option>)}
                </select>
              </label>
              {fam.medidas.length > 1 && (
                <label className="grid gap-1 text-sm font-medium">Medida
                  <select className={INP} value={v.medida.id} onChange={(e) => setEsc({ med: e.target.value, acab: acabamentosDaMedida(fam, e.target.value).some((a) => a.id === v.acabamento.id) ? v.acabamento.id : undefined })}>
                    {fam.medidas.map((m) => <option key={m.id} value={m.id}>{m.rotulo} · {m.ref}</option>)}
                  </select>
                </label>
              )}
              <label className="grid gap-1 text-sm font-medium">Acabamento
                <select className={INP} value={v.acabamento.id} onChange={(e) => setEsc({ med: v.medida.id, acab: e.target.value })}>
                  {acabs.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </label>
            </div>
            <p className="text-sm text-muted-foreground">SKU {v.sku} · {eur(v.preco)}</p>
            <button type="button" className={BTN} aria-label={`Juntar a família ${v.nome}, ${v.acabamento.nome}, ${eur(v.preco)}`} onClick={juntarFamilia}>Juntar esta variante</button>
          </>
        )}
        {passo === 2 && produtoEscolhido && (
          <>
            <p className="text-[15px]">{produtoEscolhido.nome}{produtoEscolhido.marca ? ` · ${produtoEscolhido.marca}` : ""}</p>
            <p className="text-sm text-muted-foreground">Produto do catálogo: não tem medida nem acabamento a escolher aqui.</p>
            <button type="button" className={BTN} aria-label={`Juntar produto ${produtoEscolhido.nome}`} onClick={() => juntarProduto(produtoEscolhido)}>Juntar este produto</button>
          </>
        )}

        {passo === 3 && (
          <>
            {partes.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem partes. Junte um produto.</p>}
            <ul aria-label="Partes da composição" className="space-y-2">
              {linhas.map((l, i) => (
                <li key={l.uid} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-2">
                  <div className="min-w-0 flex-1 text-[15px]">
                    <p className="font-medium">{i + 1}. {l.nome}{i === 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">(ponto de ancoragem)</span>}</p>
                    <p className="text-sm text-muted-foreground">{l.variante}{l.sku ? ` · SKU ${l.sku}` : ""}</p>
                  </div>
                  {l.semPreco ? <span className="rounded bg-muted px-2 py-0.5 text-sm text-muted-foreground">sem preço</span> : <span className="text-[15px] tabular-nums">{eur(l.preco ?? 0)}</span>}
                  <button type="button" className={BTN} aria-label={`Remover ${l.nome}`} onClick={() => setPartes((p) => removerParte(p, l.uid))}>Remover</button>
                </li>
              ))}
            </ul>
            <button type="button" className={BTN} onClick={juntarMais}>Juntar mais um produto</button>
          </>
        )}

        {passo === 4 && (
          <p className="text-[15px]">{partes.length === 1 ? "1 parte" : `${partes.length} partes`} na composição. A primeira é o ponto de ancoragem; as outras ficam ligadas lado a lado e movem-se como uma peça.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {passo >= 3 && (
          <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2 text-[15px] font-semibold"><span>Total: {eur(total)}</span>{semPreco > 0 && <span className="text-sm font-normal text-muted-foreground">({semPreco} sem preço, fora da soma)</span>}</p>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {motivo && <p id="motivo-seguinte" className="text-sm text-muted-foreground">{motivo}</p>}
          <button type="button" className={BTN} disabled={passo === 1} onClick={anterior}>Anterior</button>
          {passo < TOTAL_PASSOS
            ? <button type="button" className={BTN_PRIMARIO} disabled={!!motivo} aria-describedby={motivo ? "motivo-seguinte" : undefined} onClick={seguinte}>Seguinte</button>
            : <button type="button" className={BTN_PRIMARIO} disabled={partes.length === 0} aria-label="Pôr a composição na planta" onClick={() => onPor(partes)}>Pôr a composição na planta</button>}
        </div>
      </div>
    </section>
  );
}
