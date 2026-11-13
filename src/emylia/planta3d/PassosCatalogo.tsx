// Protótipo (visualizador 3D): os passos «Escolher produtos» e «Atribuir atributos» do Configurador de famílias, para criar uma família A PARTIR DE
// PRODUTOS QUE JÁ EXISTEM no catálogo (só leitura: nada se escreve no catalogoStore). O assistente (PainelConfigurador.tsx) guarda o estado; aqui só se desenha.
// A escolha tem filtros (marca, categoria, preço, família) por cima da lista: a lógica pura está em filtrosCatalogo.ts e o bloco de filtros em FiltrosEscolher.tsx.
import { useDeferredValue, useId, useMemo, useState } from "react";
import type { No, Produto } from "../v2/catalogoModelo";
import { ALVO_PROTO, corDoAcabamento, erroNomeAtributo, ficheirosCompativeis, refDoProduto, type AtribuicaoProduto, type FamiliaCfg } from "./configurador";
import { BTN, CAMPO, INP, eur } from "./estilosPainel";
import { FiltrosEscolher } from "./FiltrosEscolher";
import {
  MAX_SELECAO, aplicarFiltros, chipsDe, comParecidos, contarFiltrosAtivos, facetasDe, indexarCatalogo, semChip, type FiltrosCatalogo,
} from "./filtrosCatalogo";
import { chaveFicheiro } from "./modelosHtml/ficheiros";

/** O máximo de produtos desenhados de cada vez (o catálogo de exemplo tem milhares): «Mostrar mais» acrescenta outros tantos. */
export const MAX_LISTA = 100;
const NOMES_DIM = ["Largura", "Profundidade", "Altura"] as const;
const numero = (v: string): number => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

export interface CatalogoLido { produtos: readonly Produto[]; arvore: readonly No[] }

export interface PassoEscolherProps {
  catalogo: CatalogoLido; escolhidos: readonly string[];
  /** os produtos já agrupados noutras famílias da sessão */
  ocupados: ReadonlySet<string>;
  filtros: FiltrosCatalogo; onFiltros: (f: FiltrosCatalogo) => void;
  onAlternar: (id: string) => void; onSelecionar: (ids: readonly string[]) => void; onLimpar: () => void;
}

export function PassoEscolher({ catalogo, escolhidos, ocupados, filtros, onFiltros, onAlternar, onSelecionar, onLimpar }: PassoEscolherProps) {
  const [limite, setLimite] = useState(MAX_LISTA);
  const indice = useMemo(() => indexarCatalogo(catalogo.produtos, catalogo.arvore), [catalogo]);
  const ctx = useMemo(() => ({ ocupados, escolhidos: new Set(escolhidos) }), [ocupados, escolhidos]);
  // a pesquisa usa o valor adiado: escrever não bloqueia o campo enquanto a lista e as contagens se refazem
  const qAdiado = useDeferredValue(filtros.q);
  const efetivos = useMemo(() => ({ ...filtros, q: qAdiado }), [filtros, qAdiado]);
  const achados = useMemo(() => aplicarFiltros(indice, efetivos, ctx), [indice, efetivos, ctx]);
  const facetas = useMemo(() => facetasDe(indice, efetivos, ctx), [indice, efetivos, ctx]);
  const chips = chipsDe(indice, filtros);
  const nomes = useMemo(() => new Map(catalogo.produtos.map((p) => [p.id, p.n] as const)), [catalogo.produtos]);
  const n = escolhidos.length, total = catalogo.produtos.length, nAtivos = contarFiltrosAtivos({ ...filtros, q: "" }), q = filtros.q.trim();
  const mudar = (f: FiltrosCatalogo) => { setLimite(MAX_LISTA); onFiltros(f); };
  const paraSelecionar = achados.slice(0, MAX_SELECAO).map((x) => x.p.id);
  const todosJaEscolhidos = paraSelecionar.every((id) => ctx.escolhidos.has(id));
  const rotuloSelecionar = achados.length > MAX_SELECAO ? `Selecionar os primeiros ${MAX_SELECAO} dos ${achados.length} resultados` : achados.length === 1 ? "Selecionar o resultado" : `Selecionar os ${achados.length} resultados`;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Escolha os produtos que já existem no catálogo e que fazem parte desta família (por exemplo, as nove lava-loiças de um modelo). Nada se altera no catálogo: só se lê.</p>
      <label className={CAMPO}>Procurar produtos do catálogo
        <input type="search" className={INP} value={filtros.q} onChange={(e) => mudar({ ...filtros, q: e.target.value })} placeholder="Nome, marca, referência ou categoria" />
      </label>
      <FiltrosEscolher filtros={filtros} onFiltros={mudar} marcas={facetas.marcas} categorias={facetas.categorias} comMarcas={indice.marcas.size > 1} comCategorias={indice.categorias.size > 1} nAtivos={nAtivos} />
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" aria-label="Resultados" className="text-sm font-medium">{achados.length} de {total} produtos</p>
        <p role="status" aria-label="Produtos escolhidos" className="text-[15px] font-semibold">{n === 0 ? "Nenhum produto escolhido" : plural(n, "escolhido", "escolhidos")}</p>
      </div>
      {chips.length > 0 && achados.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <ul aria-label="Filtros ativos" className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <li key={c.id} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-input bg-background pl-3 text-sm">
                <span className="break-words">{c.texto}</span>
                <button type="button" aria-label={`Remover filtro ${c.texto}`} className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" onClick={() => mudar(semChip(filtros, c.id))}><span aria-hidden="true">✕</span></button>
              </li>
            ))}
          </ul>
          <button type="button" className={`${BTN} cursor-pointer`} onClick={() => mudar({ ...filtros, q: "", marcas: [], categorias: [], soComPreco: false, semFamilia: false, soEscolhidos: false })}>Limpar filtros</button>
        </div>
      )}
      {achados.length === 0
        ? (
          <div className="grid gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-[15px]">
              {total === 0 ? "O catálogo não tem produtos." : `Nenhum produto do catálogo corresponde${q ? ` a «${q}»` : ""}${nAtivos > 0 ? " com os filtros ativos" : ""}.`}
            </p>
            {chips.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">Experimente largar um filtro ou procurar por outras palavras (nome, marca ou referência):</p>
                <ul aria-label="Remover filtros" className="flex flex-wrap gap-2">
                  {chips.map((c) => <li key={c.id}><button type="button" className={`${BTN} cursor-pointer`} aria-label={`Remover filtro ${c.texto}`} onClick={() => mudar(semChip(filtros, c.id))}>Remover filtro {c.texto}</button></li>)}
                </ul>
                <div><button type="button" className={`${BTN} cursor-pointer`} onClick={() => mudar({ ...filtros, q: "", marcas: [], categorias: [], soComPreco: false, semFamilia: false, soEscolhidos: false })}>Limpar filtros</button></div>
              </>
            )}
          </div>
        )
        : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={`${BTN} cursor-pointer`} disabled={todosJaEscolhidos} onClick={() => onSelecionar(paraSelecionar)}>{rotuloSelecionar}</button>
              {n > 0 && <button type="button" className={`${BTN} cursor-pointer`} onClick={onLimpar}>Limpar seleção</button>}
            </div>
            {achados.length > MAX_SELECAO && <p className="text-sm text-muted-foreground">Só se selecionam {MAX_SELECAO} de cada vez: afine os filtros ou a pesquisa para escolher os restantes.</p>}
            <ul aria-label="Produtos do catálogo" className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {achados.slice(0, limite).map(({ p }) => {
                const r = refDoProduto(p), marcado = ctx.escolhidos.has(p.id);
                return (
                  <li key={p.id} className={`flex items-stretch ${marcado ? "bg-primary/10" : ""}`}>
                    <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 px-3 py-2 text-[15px] hover:bg-accent">
                      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={marcado} onChange={() => onAlternar(p.id)} />
                      <span className="min-w-0 break-words">
                        <span className="block font-medium">{p.n}</span>{" "}
                        <span className="block text-sm text-muted-foreground">SKU {r.sku} · {p.marca || "sem marca"} · {r.preco > 0 ? eur(r.preco) : "sem preço de venda"}{r.semPvp && r.preco > 0 ? " (sem PVP: custo + margem)" : ""}{p.sub ? ` · ${p.sub}` : ""}{ocupados.has(p.id) ? " · já está noutra família" : ""}</span>
                      </span>
                    </label>
                    <button type="button" aria-label={`Ver parecidos com ${p.n}`} className="my-1 mr-1 inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full px-3 text-sm text-primary underline-offset-2 hover:bg-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" onClick={() => mudar(comParecidos(p.n))}>Ver parecidos</button>
                  </li>
                );
              })}
            </ul>
            {achados.length > limite && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground">A mostrar {limite} de {achados.length} produtos.</p>
                <button type="button" className={`${BTN} cursor-pointer`} onClick={() => setLimite((l) => l + MAX_LISTA)}>Mostrar mais {Math.min(MAX_LISTA, achados.length - limite)}</button>
              </div>
            )}
          </>
        )}
      {n > 0 && (
        <section aria-label={`Escolhidos (${n})`} className="sticky bottom-0 z-10 grid gap-1 rounded-xl border border-primary/40 bg-card p-2 shadow-md">
          <h4 className="text-sm font-semibold">{`Escolhidos (${n})`}</h4>
          <ul className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {escolhidos.map((id) => {
              const nome = nomes.get(id) ?? id;
              return (
                <li key={id} className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full border border-input bg-background pl-3 text-sm">
                  <span className="min-w-0 break-words">{nome}</span>
                  <button type="button" aria-label={`Remover ${nome} dos escolhidos`} className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" onClick={() => onAlternar(id)}><span aria-hidden="true">✕</span></button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

export function PassoAtribuir({ familia, produtos, atribuicoes, conflitos, atributos, onAtribuir, onTirar, onAcrescentarAtributo, onTirarAtributo }: {
  familia: FamiliaCfg; produtos: readonly Produto[]; atribuicoes: Readonly<Record<string, AtribuicaoProduto>>; conflitos: readonly string[]; atributos: readonly string[];
  onAtribuir: (id: string, p: Partial<AtribuicaoProduto>) => void; onTirar: (id: string) => void; onAcrescentarAtributo: (nome: string) => void; onTirarAtributo: (nome: string) => void;
}) {
  const ficheiros = ficheirosCompativeis(familia.tipo), idLista = useId();
  const [novo, setNovo] = useState(""), [erroNovo, setErroNovo] = useState("");
  const acrescentar = () => {
    const erro = erroNomeAtributo(novo, atributos);
    setErroNovo(erro);
    if (erro) return;
    onAcrescentarAtributo(novo.trim()); setNovo("");
  };
  /** os valores que já foram usados num atributo (sugestões para os outros produtos) */
  const usados = (nome: string): string[] => [...new Set(Object.values(atribuicoes).map((x) => x.extras?.[nome]?.trim() ?? "").filter(Boolean))];
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Os produtos de uma família são iguais e só mudam nos atributos. Diga o valor de cada atributo em cada produto: a medida e a cor/acabamento (a sugestão vem do nome) e os atributos extra que acrescentar. Cada produto fica definido pela combinação dos seus valores, que não pode repetir-se. O SKU e o preço são os do catálogo e não se editam aqui.</p>
      <fieldset className="grid min-w-0 gap-2 rounded-xl border border-border p-2">
        <legend className="px-1 text-sm font-semibold">Atributos extra da família</legend>
        {atributos.length === 0
          ? <p className="text-sm text-muted-foreground">Sem atributos extra: cada produto só tem medida e cor/acabamento. Acrescente, por exemplo, «Nº de cubas», «Material» ou «Acabamento da aresta».</p>
          : (
            <ul aria-label="Atributos extra" className="flex flex-wrap gap-2">
              {atributos.map((n) => (
                <li key={n} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-background pl-4 pr-1 text-[15px]">
                  <span className="break-words">{n}</span>
                  <button type="button" className={BTN} aria-label={`Remover o atributo ${n}`} onClick={() => onTirarAtributo(n)}>Remover</button>
                </li>
              ))}
            </ul>
          )}
        <div className="flex flex-wrap items-end gap-2">
          <label className={`${CAMPO} min-w-40 flex-1`}>Nome do novo atributo
            <input className={INP} value={novo} onChange={(e) => { setNovo(e.target.value); setErroNovo(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); acrescentar(); } }} placeholder="Por exemplo, Nº de cubas" />
          </label>
          <button type="button" className={BTN} onClick={acrescentar}>Acrescentar atributo</button>
        </div>
        {erroNovo && <p role="alert" className="text-sm text-destructive">Erro: {erroNovo}</p>}
      </fieldset>
      <div className="sticky top-0 z-10 grid gap-2 bg-card py-1">
        <p role="status" aria-label="Resumo da atribuição" className="text-[15px] font-semibold">{plural(produtos.length, "produto", "produtos")} = {plural(familia.medidas.length, "medida", "medidas")} × {plural(familia.acabamentos.length, "acabamento", "acabamentos")}</p>
        {conflitos.length > 0 && (
          <ul role="alert" className="grid gap-1 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {conflitos.map((c) => <li key={c}>Erro: {c}</li>)}
          </ul>
        )}
      </div>
      {produtos.map((p, i) => {
        const a = atribuicoes[p.id];
        if (!a) return null;
        const n = i + 1, r = refDoProduto(p), nome = `produto ${n}`;
        return (
          <fieldset key={p.id} className="grid min-w-0 gap-2 rounded-xl border border-border p-2">
            <legend className="max-w-full break-words px-1 text-sm font-semibold">Produto {n}: {p.n}</legend>
            <p className="break-words text-sm text-muted-foreground">SKU {r.sku} · {p.marca || "sem marca"} · {r.preco > 0 ? eur(r.preco) : "preço em falta"}{r.semPvp && r.preco > 0 ? ` (sem PVP: custo + margem de ${ALVO_PROTO} %)` : ""} · vem do produto do catálogo</p>
            {r.preco <= 0 && <p className="text-sm font-medium text-destructive"><span aria-hidden="true">⚠ </span>Erro: sem preço de venda no catálogo (sem PVP nem custo): não pode entrar na família.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={CAMPO}>Medida (rótulo)<input aria-label={`Medida do ${nome}`} className={INP} value={a.medida} onChange={(e) => onAtribuir(p.id, { medida: e.target.value })} /></label>
              <div className="grid grid-cols-3 gap-2">
                {NOMES_DIM.map((d, j) => (
                  <label key={d} className={CAMPO}>{d} (cm)
                    <input aria-label={`${d} do ${nome} (cm)`} type="number" min="0" step="0.1" inputMode="decimal" className={INP} defaultValue={a.dim[j]}
                      onChange={(e) => onAtribuir(p.id, { dim: a.dim.map((x, k) => (k === j ? numero(e.target.value) : x)) as [number, number, number] })} />
                  </label>
                ))}
              </div>
              <label className={CAMPO}>Acabamento (cor)<input aria-label={`Acabamento do ${nome}`} className={INP} value={a.acabamento} onChange={(e) => { const d = corDoAcabamento(e.target.value); onAtribuir(p.id, { acabamento: e.target.value, cor: d.cor, metalness: d.metalness, roughness: d.roughness }); }} /></label>
              <label className={CAMPO}>Código do acabamento<input aria-label={`Código do acabamento do ${nome}`} className={INP} value={a.codigo} onChange={(e) => onAtribuir(p.id, { codigo: e.target.value })} /></label>
              <AmostraDeCor acabamento={a.acabamento} />
              {atributos.map((x, k) => (
                <label key={x} className={CAMPO}>{x}
                  <input aria-label={`${x} do ${nome}`} className={INP} list={`${idLista}-${k}`} value={a.extras?.[x] ?? ""} onChange={(e) => onAtribuir(p.id, { extras: { ...a.extras, [x]: e.target.value } })} />
                  <datalist id={`${idLista}-${k}`}>{usados(x).map((v) => <option key={v} value={v} />)}</datalist>
                </label>
              ))}
              {ficheiros.length === 0
                ? <p className="self-end text-sm text-muted-foreground">Modelo genérico: este tipo de produto não tem 3D do fabricante.</p>
                : (
                  <label className={CAMPO}>Modelo 3D
                    <select aria-label={`Modelo 3D do ${nome}`} className={INP} value={a.glb ?? ""} onChange={(e) => onAtribuir(p.id, { glb: e.target.value })}>
                      <option value="">Modelo genérico</option>
                      {ficheiros.map((x) => <option key={x.ficheiro} value={chaveFicheiro(x.familia, x.modelo, x.acab)}>{x.marca} · {x.modelo} · {x.acab}</option>)}
                    </select>
                  </label>
                )}
            </div>
            {ficheiros.length > 0 && <p><span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">{a.glb ? "3D do fabricante (proposto pelo nome, pode mudar)" : "Modelo genérico"}</span></p>}
            <div><button type="button" className={BTN} aria-label={`Tirar o ${nome} da família`} onClick={() => onTirar(p.id)}>Tirar da família</button></div>
          </fieldset>
        );
      })}
    </div>
  );
}

/** A cor do acabamento NÃO se escolhe: deriva do nome (corDoAcabamento). Mostra-se só como amostra, sempre com o nome ao lado (não só cor). */
function AmostraDeCor({ acabamento }: { acabamento: string }) {
  const nome = acabamento.trim() || "Padrão", d = corDoAcabamento(nome);
  return (
    <div className={CAMPO}>
      <span>Cor (definida pelo produto)</span>
      <p className="flex min-h-11 flex-wrap items-center gap-2 text-[15px] font-normal">
        <span role="img" aria-label={d.conhecido ? `Cor: ${nome}, definida pelo produto` : `Cor: ${nome}, não definida no produto`} style={{ backgroundColor: d.cor }} className="h-6 w-6 shrink-0 rounded-full border border-border" />
        <span className="break-words">{nome}</span>
        {!d.conhecido && <span className="text-sm text-muted-foreground">cor não definida no produto</span>}
      </p>
    </div>
  );
}
