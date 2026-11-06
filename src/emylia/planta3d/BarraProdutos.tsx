// Protótipo (visualizador 3D): a barra de PRODUTOS DO CATÁLOGO para pôr na planta. Não é uma lista fixa: vêm do catálogo (v2/catalogoModelo.ts),
// com produtos de demonstração «(demo)» onde o catálogo não tem o tipo, separados por grupos (sanitas, bidés, banheiras, espelhos…) e com pesquisa.
// As FAMÍLIAS (torneiras, lava-loiças, placas, tampos…) aparecem uma só vez, com bolinhas de cor para os acabamentos e um selector de medida; os
// CONJUNTOS (bancada, duche, móvel de lavatório) põem as peças ligadas de uma vez. Arrasta-se para a planta (ou toca-se, ou Enter, e fica ao meio).
import { useMemo, useState, type PointerEvent as RPointerEvent } from "react";
import { GRUPOS_ESPACO, ROTULO_ESPACO, SO_COM_MODELO_HTML, produtosDoGrupo, sem, temModeloHtml, type ProdutoModelo3D } from "./catalogo3d";
import { CONJUNTOS, type Conjunto } from "./conjuntos";
import { CATEGORIAS_FAMILIA, acabamentosDaMedida, familiasDaCategoria, modeloDaFamilia, resolverVariante, variantesDe, type Familia } from "./familias";
import type { TipoEspaco } from "./modelo";

const INP = "h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const CHIP = "inline-flex min-h-11 touch-none select-none items-center gap-1.5 rounded-full border border-input bg-background px-4 py-2 text-left text-[15px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const TAB = "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const PASSO_VISIVEIS = 24;
const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export interface BarraProdutosProps {
  produtos: readonly ProdutoModelo3D[];
  espaco: TipoEspaco;
  onEspaco: (t: TipoEspaco) => void;
  onPegar: (e: RPointerEvent<HTMLButtonElement>, m: ProdutoModelo3D) => void;
  onMover: (e: RPointerEvent<HTMLButtonElement>) => void;
  onLargar: (e: RPointerEvent<HTMLButtonElement>) => void;
  onCancelar: () => void;
  onJuntar: (m: ProdutoModelo3D) => void;
  onConjunto: (c: Conjunto) => void;
  /** Põe a bancada composta (bancada.ts) na planta, encostada à parede. */
  onBancada: () => void;
}

/** O cartão de uma família: UM produto no ecrã, com as variantes (acabamento e medida) escolhidas à parte. */
function CartaoFamilia({ f, escolha, onEscolha, onPegar, onMover, onLargar, onCancelar, onJuntar }: {
  f: Familia; escolha: { med?: string; acab?: string }; onEscolha: (e: { med?: string; acab?: string }) => void;
} & Pick<BarraProdutosProps, "onPegar" | "onMover" | "onLargar" | "onCancelar" | "onJuntar">) {
  const v = resolverVariante(f, escolha.med, escolha.acab);
  const acabs = acabamentosDaMedida(f, v.medida.id);
  const modelo = modeloDaFamilia(f, v.medida.id, v.acabamento.id);
  const todas = variantesDe(f), desde = Math.min(...todas.map((x) => x.preco));
  return (
    <li className="w-full max-w-sm rounded-2xl border border-border bg-card p-3 sm:w-80">
      <p className="text-[15px] font-semibold">{f.nome}</p>
      <p className="text-sm text-muted-foreground">{f.marca} · {todas.length} {todas.length === 1 ? "variante" : "variantes"} · desde {eur(desde)}</p>
      <div role="group" aria-label={`Acabamento de ${f.nome}`} className="mt-2 flex flex-wrap gap-1">
        {acabs.map((a) => (
          <button key={a.id} type="button" aria-label={`Acabamento ${a.nome}`} aria-pressed={a.id === v.acabamento.id} title={a.nome} onClick={() => onEscolha({ med: v.medida.id, acab: a.id })}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}>
            <span className={`block h-7 w-7 rounded-full border-2 ${a.id === v.acabamento.id ? "border-primary ring-2 ring-primary/30" : "border-border"}`} style={{ background: a.cor }} />
          </button>
        ))}
      </div>
      <p className="text-sm">{v.acabamento.nome}</p>
      {f.medidas.length > 1 && (
        <label className="mt-1 grid gap-1 text-sm font-medium">Medida
          <select className={INP} value={v.medida.id} onChange={(e) => onEscolha({ med: e.target.value, acab: acabamentosDaMedida(f, e.target.value).some((a) => a.id === v.acabamento.id) ? v.acabamento.id : undefined })}>
            {f.medidas.map((m) => <option key={m.id} value={m.id}>{m.rotulo} · {m.ref}</option>)}
          </select>
        </label>
      )}
      <p className="mt-1 text-sm text-muted-foreground">SKU {v.sku} · {eur(v.preco)}</p>
      <button type="button" className={`${CHIP} mt-2`} onPointerDown={(e) => onPegar(e, modelo)} onPointerMove={onMover} onPointerUp={onLargar} onPointerCancel={onCancelar}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJuntar(modelo); } }}
        aria-label={`Família ${v.nome}, acabamento ${v.acabamento.nome}, SKU ${v.sku}, ${eur(v.preco)}. Arraste para a planta, ou Enter.`}>
        Pôr na planta: {Math.round(modelo.dimensoes.larguraCm)}×{Math.round(modelo.dimensoes.profundidadeCm)} cm
      </button>
    </li>
  );
}

/** O modelo 3D do HTML que o produto usa (o mesmo do catálogo 3D), para se ver na lista antes de o pôr na planta. */
function rotuloModelo(m: ProdutoModelo3D): { curto: string; titulo: string } | null {
  const pr = m.mockup3d.params;
  if (pr && "html" in pr && pr.html) return pr.html.exacto === false ? { curto: "3D parecido", titulo: `O HTML não tem este produto: usa o modelo ${pr.html.modelo}` } : { curto: "3D do catálogo", titulo: `Modelo ${pr.html.modelo} · ${pr.html.acab}` };
  if (pr?.k === "chapa") return { curto: "3D do catálogo", titulo: `Chapa ${pr.series} · ${pr.tone}` };
  return null;
}

/** As famílias que a lista mostra: com SO_COM_MODELO_HTML, só as que têm o modelo do HTML. */
const familiasVisiveis = (c: Familia["categoria"]): Familia[] => familiasDaCategoria(c).filter((f) => !SO_COM_MODELO_HTML || !!f.htmlModelo);

export function BarraProdutos({ produtos: todosProdutos, espaco, onEspaco, onPegar, onMover, onLargar, onCancelar, onJuntar, onConjunto, onBancada }: BarraProdutosProps) {
  const [q, setQ] = useState("");
  const [grupoEscolhido, setGrupo] = useState<string>("");
  const [quantos, setQuantos] = useState(PASSO_VISIVEIS);
  const [escolhas, setEscolhas] = useState<Record<string, { med?: string; acab?: string }>>({});
  // protótipo: só os produtos com o modelo 3D do HTML (catalogo3d.ts, SO_COM_MODELO_HTML); separadores, contagens e pesquisa contam só esses
  // o catálogo 3D do HTML é de cozinha: os tampos Coverlam de cozinha não aparecem na casa de banho, no quarto nem na sala
  const produtos = useMemo(() => (!SO_COM_MODELO_HTML ? todosProdutos : espaco === "cozinha" || espaco === "outro" ? todosProdutos.filter(temModeloHtml) : []), [todosProdutos, espaco]);
  const grupos = useMemo(() => GRUPOS_ESPACO[espaco].map((g) => ({ g, n: produtosDoGrupo(produtos, g).length })).filter((x) => x.n > 0), [produtos, espaco]);
  // o separador «Bancadas» tem a bancada composta (que é o modelo do HTML), mesmo sem famílias de tampo visíveis
  const categorias = useMemo(() => CATEGORIAS_FAMILIA.filter((c) => c.espacos.includes(espaco)).map((c) => ({ c, n: c.id === "tampos" ? 1 : familiasVisiveis(c.id).length })).filter((x) => x.n > 0), [espaco]);
  const conjuntos = useMemo(() => (SO_COM_MODELO_HTML ? [] : CONJUNTOS.filter((c) => c.espacos.includes(espaco))), [espaco]);
  const vazio = grupos.length === 0 && categorias.length === 0 && conjuntos.length === 0;
  // o separador de omissão: a cozinha abre nas famílias (torneiras), o resto no primeiro grupo do catálogo
  const omissao = espaco === "cozinha" && categorias[0] ? `fam:${categorias[0].c.id}` : grupos[0]?.g.id ?? "todos";
  const ativo = grupoEscolhido || omissao;
  const ehFamilia = ativo.startsWith("fam:"), ehConjuntos = ativo === "conjuntos";
  const atual = grupos.find((x) => x.g.id === ativo) ?? null;
  const familias = useMemo(() => {
    if (!ehFamilia) return [];
    const s = sem(q.trim());
    return familiasVisiveis(ativo.slice(4) as Familia["categoria"]).filter((f) => !s || sem(`${f.nome} ${f.marca}`).includes(s));
  }, [ehFamilia, ativo, q]);
  const lista = useMemo(() => {
    if (ehFamilia || ehConjuntos) return [];
    const s = sem(q.trim());
    const base = atual ? produtosDoGrupo(produtos, atual.g) : produtos;
    return base.filter((m) => !s || sem(`${m.nome} ${m.marca ?? ""} ${m.categoria}`).includes(s));
  }, [produtos, atual, q, ehFamilia, ehConjuntos]);
  const escolher = (id: string) => { setGrupo(id); setQuantos(PASSO_VISIVEIS); };
  const tab = (id: string, rotulo: string) => (
    <button key={id} type="button" role="tab" aria-selected={ativo === id} className={`${TAB} ${ativo === id ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent"}`} onClick={() => escolher(id)}>{rotulo}</button>
  );

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
      {vazio ? (
        <p role="status" className="rounded-xl border border-border bg-muted/30 p-3 text-[15px]">Ainda sem produtos com modelo 3D neste espaço.</p>
      ) : (
        <div role="tablist" aria-label="Grupos de produtos" className="flex flex-wrap gap-2">
          {conjuntos.length > 0 && tab("conjuntos", `Conjuntos (${conjuntos.length})`)}
          {categorias.map(({ c, n }) => tab(`fam:${c.id}`, `${c.rotulo} (${n})`))}
          {grupos.map(({ g, n }) => tab(g.id, `${g.rotulo} (${n})`))}
          {produtos.length > 0 && tab("todos", `Todos (${produtos.length})`)}
        </div>
      )}

      {ehConjuntos && (
        <ul className="flex flex-wrap gap-3" aria-label="Conjuntos">
          {conjuntos.map((c) => (
            <li key={c.id} className="w-full max-w-sm rounded-2xl border border-border bg-card p-3 sm:w-80">
              <p className="text-[15px] font-semibold">{c.nome}</p>
              <p className="text-sm text-muted-foreground">{c.descricao} Cada componente também se vende à parte.</p>
              <ul className="mt-1 list-disc pl-5 text-sm">{c.componentes.map((k) => <li key={k.papel}>{k.rotulo}{k.obrigatorio ? "" : " (opcional)"}</li>)}</ul>
              <button type="button" className={`${CHIP} mt-2`} onClick={() => onConjunto(c)} aria-label={`Pôr o conjunto ${c.nome} na planta`}>Pôr o conjunto na planta</button>
            </li>
          ))}
        </ul>
      )}
      {ativo === "fam:tampos" && (
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-3">
          <p className="text-[15px] font-semibold">Bancada Coverlam Top 12 mm (composição)</p>
          <p className="text-sm text-muted-foreground">Como a aba «Bancadas» do catálogo 3D: série, tom e acabamento da chapa, comprimento e profundidade, lava-loiça (por baixo ou por cima), placa e torneira, posição dos equipamentos em cm e rodatampo. Cada parte vende-se à parte.</p>
          <button type="button" className={`${CHIP} mt-2`} onClick={onBancada} aria-label="Pôr a bancada composta na planta">Pôr a bancada na planta</button>
        </div>
      )}
      {ehFamilia && ativo !== "fam:tampos" && (
        <ul className="flex flex-wrap gap-3" aria-label="Famílias de produtos">
          {familias.map((f) => (
            <CartaoFamilia key={f.id} f={f} escolha={escolhas[f.id] ?? {}} onEscolha={(e) => setEscolhas({ ...escolhas, [f.id]: e })} onPegar={onPegar} onMover={onMover} onLargar={onLargar} onCancelar={onCancelar} onJuntar={onJuntar} />
          ))}
          {familias.length === 0 && <li className="text-[15px] text-muted-foreground">Nenhuma família serve este filtro.</li>}
        </ul>
      )}
      {!vazio && !ehFamilia && !ehConjuntos && (
        <>
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
                    {(() => { const r = rotuloModelo(m); return r ? <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground" title={r.titulo}>{r.curto}</span> : null; })()}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lista.length > quantos && (
            <button type="button" className="min-h-11 text-sm underline underline-offset-2" onClick={() => setQuantos(quantos + PASSO_VISIVEIS)}>Mostrar mais ({lista.length - quantos} por mostrar)</button>
          )}
        </>
      )}
    </div>
  );
}
