// Protótipo (visualizador 3D): os passos «Escolher produtos» e «Atributos dos produtos» do Configurador de famílias, para criar uma família A PARTIR DE
// PRODUTOS QUE JÁ EXISTEM no catálogo (só leitura: nada se escreve no catalogoStore). O assistente (PainelConfigurador.tsx) guarda o estado; aqui só se desenha.
// O segundo passo («Atributos dos produtos») é só de leitura: os atributos vêm de `atributosDoProduto`; o utilizador só escolhe eixos e exclui produtos.
// A escolha tem filtros (marca, categoria, preço, família) por cima da lista: a lógica pura está em filtrosCatalogo.ts e o bloco de filtros em FiltrosEscolher.tsx.
import { useDeferredValue, useId, useMemo, useState } from "react";
import type { No, Produto } from "../v2/catalogoModelo";
import { ALVO_PROTO, corDoAcabamento, refDoProduto, textoSemValor, type EixosCfg } from "./configurador";
import { BTN, CAMPO, INP, eur } from "./estilosPainel";
import { FiltrosEscolher } from "./FiltrosEscolher";
import {
  MAX_SELECAO, aplicarFiltros, chipsDe, comParecidos, contarFiltrosAtivos, facetasDe, indexarCatalogo, semChip, type FiltrosCatalogo,
} from "./filtrosCatalogo";

/** O máximo de produtos desenhados de cada vez (o catálogo de exemplo tem milhares): «Mostrar mais» acrescenta outros tantos. */
export const MAX_LISTA = 100;
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

export interface PassoAtributosProps {
  produtos: readonly Produto[];
  /** os atributos de cada produto (vêm de `atributosDoProduto`; só se leem) e os nomes dos atributos que existem nestes produtos */
  atributosPor: ReadonlyMap<string, Readonly<Record<string, string>>>; nomes: readonly string[];
  eixos: EixosCfg; onEixos: (e: EixosCfg) => void; onExcluir: (id: string) => void;
  /** o resumo («N produtos = M medidas × K acabamentos») e os avisos que bloqueiam (combinações repetidas, produtos sem valor) */
  resumo: string; avisos: readonly string[];
}

/** O passo «Atributos dos produtos»: SÓ DE LEITURA. Mostra os atributos que cada produto já tem, o SKU e o preço; o utilizador apenas escolhe que atributo faz as bolinhas de
 * cor/acabamento, que atributos compõem o seletor de medida e que produtos ficam na família. Nada se escreve: o que falta corrige-se no produto do catálogo. */
export function PassoAtributos({ produtos, atributosPor, nomes, eixos, onEixos, onExcluir, resumo, avisos }: PassoAtributosProps) {
  const grupo = useId(), noSeletor = new Set(eixos.medida), cel = "px-2 py-1.5", cab = `sticky top-0 bg-muted ${cel}`;
  const escolherCor = (n: string | null) => onEixos({ cor: n, medida: eixos.medida.filter((x) => x !== n) });
  const alternarMedida = (n: string) => onEixos({ cor: eixos.cor, medida: noSeletor.has(n) ? eixos.medida.filter((x) => x !== n) : [...eixos.medida, n] });
  const exemplo = produtos.map((p) => eixos.medida.map((n) => atributosPor.get(p.id)?.[n]?.trim() ?? "").filter(Boolean).join(" · ")).find(Boolean) ?? "";
  const caixa = "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input bg-background px-4 text-[15px] hover:bg-accent";
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Os atributos vêm dos produtos do catálogo e só se leem aqui: nada se escreve. Escolha qual deles faz as bolinhas de cor/acabamento e quais compõem o seletor de medida, e que produtos ficam na família. Para mudar um valor, corrija-o no produto do catálogo ou exclua o produto. O SKU e o preço são os do catálogo.</p>
      {nomes.length === 0
        ? <p className="text-sm text-muted-foreground">Estes produtos não têm atributos reconhecidos: corrija-os no produto do catálogo.</p>
        : (
          <div className="grid gap-2 sm:grid-cols-2">
            <fieldset className="grid min-w-0 gap-2 rounded-xl border border-border p-2">
              <legend className="px-1 text-sm font-semibold">Atributo das bolinhas de cor/acabamento</legend>
              <div className="flex flex-wrap gap-2">
                {nomes.map((n) => (
                  <label key={n} className={`${caixa} ${eixos.cor === n ? "border-primary bg-primary/10" : ""}`}>
                    <input type="radio" name={`${grupo}-cor`} className="h-5 w-5" checked={eixos.cor === n} onChange={() => escolherCor(n)} />{n}
                  </label>
                ))}
                <label className={`${caixa} ${eixos.cor === null ? "border-primary bg-primary/10" : ""}`}>
                  <input type="radio" name={`${grupo}-cor`} className="h-5 w-5" checked={eixos.cor === null} onChange={() => escolherCor(null)} />Nenhum (sem bolinhas)
                </label>
              </div>
            </fieldset>
            <fieldset className="grid min-w-0 gap-2 rounded-xl border border-border p-2">
              <legend className="px-1 text-sm font-semibold">Atributos do seletor de medida</legend>
              <div className="flex flex-wrap gap-2">
                {nomes.filter((n) => n !== eixos.cor).map((n) => (
                  <label key={n} className={`${caixa} ${noSeletor.has(n) ? "border-primary bg-primary/10" : ""}`}>
                    <input type="checkbox" className="h-5 w-5" checked={noSeletor.has(n)} onChange={() => alternarMedida(n)} />{n}
                  </label>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{exemplo ? `O seletor mostra os valores juntos, por exemplo «${exemplo}».` : "Sem atributos escolhidos, o seletor de medida mostra «Única»."}</p>
            </fieldset>
          </div>
        )}
      <div className="sticky top-0 z-10 grid gap-2 bg-card py-1">
        <p role="status" aria-label="Resumo da atribuição" className="text-[15px] font-semibold">{resumo}</p>
        {avisos.length > 0 && (
          <ul role="alert" className="grid gap-1 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {avisos.map((c) => <li key={c}>Erro: {c}</li>)}
          </ul>
        )}
      </div>
      <div className="max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-border">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <caption className="px-2 py-1 text-left text-sm font-medium">Atributos dos produtos</caption>
          <thead>
            <tr className="border-y border-border">
              <th scope="col" className={cab}>Produto</th>
              {nomes.map((n) => (
                <th key={n} scope="col" className={cab}>{n}{eixos.cor === n ? <span className="block text-xs font-normal text-muted-foreground">bolinhas</span> : noSeletor.has(n) ? <span className="block text-xs font-normal text-muted-foreground">medida</span> : null}</th>
              ))}
              <th scope="col" className={cab}>SKU</th><th scope="col" className={cab}>Preço</th><th scope="col" className={cab}><span className="sr-only">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => {
              const r = refDoProduto(p), at = atributosPor.get(p.id) ?? {};
              const usados = [...eixos.medida, ...(eixos.cor ? [eixos.cor] : [])], falta = usados.filter((n) => !at[n]?.trim());
              return (
                <tr key={p.id} className="border-b border-border align-top last:border-0">
                  <th scope="row" className={`break-words text-left font-medium ${cel}`}>
                    {p.n}
                    {falta.map((n) => <span key={n} className="block text-sm font-normal text-destructive"><span aria-hidden="true">⚠ </span>{textoSemValor(n)}</span>)}
                    {r.preco <= 0 && <span className="block text-sm font-normal text-destructive"><span aria-hidden="true">⚠ </span>Erro: sem preço de venda no catálogo (sem PVP nem custo): não pode entrar na família.</span>}
                  </th>
                  {nomes.map((n) => <td key={n} className={`break-words ${cel}`}>{at[n]?.trim() ? (eixos.cor === n ? <AmostraDeCor acabamento={at[n]} /> : at[n]) : <span className="text-muted-foreground">sem valor</span>}</td>)}
                  <td className={`break-all ${cel}`}>{r.sku}</td>
                  <td className={cel}>{r.preco > 0 ? eur(r.preco) : "em falta"}{r.semPvp && r.preco > 0 ? <span className="block text-xs text-muted-foreground">{`sem PVP: custo + margem de ${ALVO_PROTO} %`}</span> : null}</td>
                  <td className={cel}><button type="button" className={`${BTN} cursor-pointer`} aria-label={`Excluir ${p.n} da família`} onClick={() => onExcluir(p.id)}>Excluir</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A cor da bolinha NÃO se escolhe: deriva do nome do acabamento do produto (corDoAcabamento). Mostra-se só como amostra, sempre com o nome ao lado (não só cor). */
function AmostraDeCor({ acabamento }: { acabamento: string }) {
  const nome = acabamento.trim(), d = corDoAcabamento(nome);
  return (
    <span className="inline-flex min-h-8 flex-wrap items-center gap-2">
      <span role="img" aria-label={d.conhecido ? `Cor: ${nome}, definida pelo produto` : `Cor: ${nome}, não definida no produto`} style={{ backgroundColor: d.cor }} className="h-6 w-6 shrink-0 rounded-full border border-border" />
      <span className="break-words">{nome}</span>
      {!d.conhecido && <span className="text-xs text-muted-foreground">cor não definida no produto</span>}
    </span>
  );
}
