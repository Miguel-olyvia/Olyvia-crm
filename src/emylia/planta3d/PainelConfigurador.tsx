// Protótipo (visualizador 3D): o painel «Configurador de famílias», como assistente de 3 passos (um visível de cada vez).
// UMA FAMÍLIA SÓ AGRUPA PRODUTOS QUE JÁ EXISTEM NO CATÁLOGO e NADA SE ESCREVE À MÃO: os atributos de cada produto vêm de `atributosDoProduto` (atributosProduto.ts), e o nome,
// a marca, a categoria, o tipo e os espaços da família são DERIVADOS dos produtos.
// 1 Escolher produtos, 2 Atributos dos produtos (só leitura: o utilizador escolhe que atributo faz as bolinhas de cor e quais compõem o seletor de medida, e exclui produtos),
// 3 Resumo e pré-visualização (dados derivados em texto, tabela «N produtos = N variantes», erros, cartão ao vivo e guardar).
// O SKU e o preço de cada variante vêm do produto do catálogo (só leitura). A família é DERIVADA dos produtos e dos eixos (`familiaPorEixos`); só em memória.
// A lista é de quem usa o painel (a página guarda-a em familiasConfiguradas.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CartaoFamilia } from "./BarraProdutos";
import { ESPEC, ROTULO_ESPACO, tipoMockupDe } from "./catalogo3d";
import { atributosDoProduto } from "./atributosProduto";
import {
  NOME_MEDIDA, categoriaSugerida, comNome, criarFamiliaVazia, eixosValidos, familiaPorEixos, ficheiroSugerido, idsDaFamilia, linhasDeVariantes, marcaDaFamilia, nomesDosAtributos,
  palpiteDoProduto, paraFamilia, problemas, produtosSemValor, refDoProduto, resumoDeProdutos, sugerirFamilia, type EixosCfg, type FamiliaCfg, type ItemEixos,
} from "./configurador";
import { BTN, BTN_PRIMARIO, eur } from "./estilosPainel";
import { CATEGORIAS_FAMILIA, variantesDe } from "./familias";
import { filtrosIniciais, idsEmFamilias, type FiltrosCatalogo } from "./filtrosCatalogo";
import { PassoAtributos, PassoEscolher, type CatalogoLido } from "./PassosCatalogo";
import { useCatalogo } from "../v2/catalogoStore";

const TITULOS = ["Escolher produtos", "Atributos dos produtos", "Resumo e pré-visualização"] as const;
const TOTAL = TITULOS.length, PASSO_ESCOLHER = 1, PASSO_ATRIBUIR = 2;
const semAcao = () => undefined;

export interface PainelConfiguradorProps {
  /** As famílias configuradas nesta sessão (quem usa o painel guarda-as e regista-as). */
  familias: readonly FamiliaCfg[];
  onFamilias: (lista: FamiliaCfg[]) => void;
  /** O catálogo de onde se juntam produtos (só leitura). Sem ele, o do protótipo (useCatalogo). */
  catalogo?: CatalogoLido;
}

/** O passo onde se corrige um problema: o grupo 1 (nome, marca, espaços: derivados) mostra-se no resumo; os outros (acabamentos, medidas, SKUs, repetidos) nos atributos dos produtos. */
const passoDoProblema = (grupo: 1 | 2 | 3 | 4): number => (grupo === 1 ? TOTAL : PASSO_ATRIBUIR);
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;
const ehVelar = (nome: string): boolean => /\bvelar\b/i.test(nome) && /lava/i.test(nome);

/** O que o configurador sabe de um produto escolhido, tudo LIDO do produto: preço/SKU, atributos (atributosDoProduto), dimensões para o 3D e o GLB que o nome propõe. */
function itemDoProduto(p: CatalogoLido["produtos"][number], arvore: CatalogoLido["arvore"]): ItemEixos {
  const tipo = tipoMockupDe(p, arvore), pal = palpiteDoProduto(p.n, { sub: p.sub, tipo }), glb = ficheiroSugerido(tipo, p.n, pal);
  return { ref: refDoProduto(p), atributos: atributosDoProduto(p), dim: pal.dim, ...(glb ? { glb } : {}) };
}
/** O cabeçalho da família, DERIVADO dos produtos: nome (parte comum dos nomes sem os atributos; senão o do primeiro produto sem eles), marca comum («Várias marcas» se diferem), categoria, tipo e espaços. */
function cabecalhoDe(produtos: CatalogoLido["produtos"], itens: readonly ItemEixos[], arvore: CatalogoLido["arvore"]): { base: FamiliaCfg; variasMarcas: boolean } {
  const refs = itens.map((i) => i.ref), nome = sugerirFamilia(refs).nome.trim() || refs[0]?.n.trim() || "", m = marcaDaFamilia(refs);
  const contagem = new Map<string, number>();
  for (const p of produtos) { const t = tipoMockupDe(p, arvore); contagem.set(t, (contagem.get(t) ?? 0) + 1); }
  const tipoComum = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as FamiliaCfg["tipo"] | undefined, c = categoriaSugerida(tipoComum ?? "caixa");
  const espacos = [...(CATEGORIAS_FAMILIA.find((x) => x.id === c.categoria)?.espacos ?? ["outro" as const])];
  return { base: { ...comNome(criarFamiliaVazia(), nome), marca: m.marca, categoria: c.categoria, tipo: c.tipo, espacos }, variasMarcas: m.varias };
}

export function PainelConfigurador({ familias, onFamilias, catalogo }: PainelConfiguradorProps) {
  const [aberto, setAberto] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  const [passo, setPasso] = useState(PASSO_ESCOLHER);
  const [escolha, setEscolha] = useState<{ med?: string; acab?: string }>({});
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  /** os eixos escolhidos pelo utilizador; sem escolha vale a omissão (cor = «Cor», medida = Medida e o que varia) */
  const [escolhaEixos, setEscolhaEixos] = useState<EixosCfg | null>(null);
  const [filtros, setFiltros] = useState<FiltrosCatalogo>(filtrosIniciais);
  const tituloRef = useRef<HTMLHeadingElement>(null), primeiraVez = useRef(true);
  const lido = useCatalogo(), cat: CatalogoLido = catalogo ?? lido;
  const porId = useMemo(() => new Map(cat.produtos.map((p) => [p.id, p] as const)), [cat.produtos]);
  const produtosEscolhidos = useMemo(() => escolhidos.flatMap((id) => { const p = porId.get(id); return p ? [p] : []; }), [escolhidos, porId]);
  const ocupados = useMemo(() => idsEmFamilias(familias, original), [familias, original]);
  const velares = useMemo(() => cat.produtos.filter((p) => ehVelar(p.n)), [cat.produtos]);
  // tudo o que vem a seguir é DERIVADO dos produtos escolhidos e dos eixos: nada se escreve
  const itens = useMemo(() => produtosEscolhidos.map((p) => itemDoProduto(p, cat.arvore)), [produtosEscolhidos, cat.arvore]);
  const atributos = useMemo(() => itens.map((i) => i.atributos), [itens]);
  const atributosPor = useMemo(() => new Map(produtosEscolhidos.map((p, i) => [p.id, itens[i].atributos] as const)), [produtosEscolhidos, itens]);
  const nomes = useMemo(() => nomesDosAtributos(atributos), [atributos]);
  const eixos = useMemo(() => eixosValidos(escolhaEixos, atributos), [escolhaEixos, atributos]);
  const cab = useMemo(() => cabecalhoDe(produtosEscolhidos, itens, cat.arvore), [produtosEscolhidos, itens, cat.arvore]);
  const derivado = useMemo(() => familiaPorEixos(cab.base, itens, eixos), [cab, itens, eixos]);
  const faltas = useMemo(() => produtosSemValor(itens, eixos), [itens, eixos]);
  const rascunho = derivado.familia;
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    tituloRef.current?.focus();
  }, [passo, aberto]);

  const abrir = (ids: readonly string[], idOriginal: string | null, eixosGuardados: EixosCfg | null) => {
    setAberto(true); setOriginal(idOriginal); setPasso(PASSO_ESCOLHER); setEscolha({}); setFiltros(filtrosIniciais());
    setEscolhidos(ids.filter((id) => porId.has(id))); setEscolhaEixos(eixosGuardados);
  };
  const abrirNova = () => abrir([], null, null);
  const abrirExemploVelar = () => abrir(velares.map((p) => p.id), null, null);
  const fechar = () => { setAberto(false); setOriginal(null); setEscolhidos([]); setEscolhaEixos(null); };
  const alternar = (id: string) => { if (porId.has(id)) setEscolhidos((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])); };
  /** «Selecionar os N resultados»: junta de uma vez os que ainda não estão escolhidos (a ordem da escolha mantém-se). */
  const selecionar = (ids: readonly string[]) => setEscolhidos((l) => [...l, ...ids.filter((id) => porId.has(id) && !l.includes(id))]);

  const aviso = (
    <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Protótipo: só dura nesta sessão; nada é guardado. Uma peça posta na planta com uma família configurada perde-se ao recarregar.
    </p>
  );

  if (!aberto) {
    return (
      <section aria-label="Configurador de famílias (protótipo)" className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-3">
        {aviso}
        <p className="text-sm text-muted-foreground">Uma família junta produtos que já existem no catálogo e são iguais, mudando só nos atributos (medida, cor, nº de cubas, material…). Escolha os produtos e que atributos fazem o seletor de cor e o de medida: nada se escreve, tudo vem dos produtos (SKU e preço incluídos). Depois de guardada, a família aparece na barra de produtos, na categoria que os produtos indicam.</p>
        {familias.length === 0
          ? (
            <div className="grid gap-2 rounded-xl border border-dashed border-border bg-card p-4">
              <p role="status" className="text-[15px] font-semibold">Ainda sem famílias configuradas.</p>
              <p className="text-sm text-muted-foreground">Comece por juntar os produtos do catálogo que são iguais e só mudam nos atributos.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_PRIMARIO} onClick={abrirNova}>Nova família (juntar produtos do catálogo)</button>
                {velares.length >= 2 && <button type="button" className={BTN} onClick={abrirExemploVelar}>Exemplo: agrupar as lava-loiças Velar do catálogo</button>}
              </div>
            </div>
          )
          : (
            <>
              <ul aria-label="Famílias configuradas" className="grid gap-2">
                {familias.map((f) => {
                  const n = variantesDe(paraFamilia(f)).length;
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words text-base font-semibold">{f.nome}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium">{`${n} ${n === 1 ? "produto" : "produtos"}`}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{f.marca || "Sem marca"} · {CATEGORIAS_FAMILIA.find((c) => c.id === f.categoria)?.rotulo} · {n} {n === 1 ? "variante" : "variantes"}</p>
                      </div>
                      <button type="button" className={`${BTN} cursor-pointer`} aria-label={`Editar ${f.nome}`} onClick={() => abrir(idsDaFamilia(f), f.id, f.eixos ?? null)}>Editar</button>
                      <button type="button" className={`${BTN} cursor-pointer`} aria-label={`Remover ${f.nome}`} onClick={() => onFamilias(familias.filter((x) => x.id !== f.id))}>Remover</button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_PRIMARIO} onClick={abrirNova}>Nova família (juntar produtos do catálogo)</button>
                {velares.length >= 2 && <button type="button" className={BTN} onClick={abrirExemploVelar}>Exemplo: agrupar as lava-loiças Velar do catálogo</button>}
              </div>
            </>
          )}
      </section>
    );
  }

  const outrosIds = familias.filter((x) => x.id !== original).map((x) => x.id);
  const todos: { passo: number; msg: string }[] = [
    ...problemas(rascunho, outrosIds).map((x) => ({ passo: passoDoProblema(x.passo), msg: x.msg })),
    ...faltas.map((x) => ({ passo: PASSO_ATRIBUIR, msg: x.msg })),
    ...derivado.conflitos.map((msg) => ({ passo: PASSO_ATRIBUIR, msg })),
  ];
  const doPasso = todos.filter((x) => x.passo === passo);
  const semProdutos = passo === PASSO_ESCOLHER && produtosEscolhidos.length === 0;
  const motivo = semProdutos ? "Para continuar: escolha pelo menos um produto do catálogo."
    : passo < TOTAL && doPasso.length > 0 ? `Para continuar: ${doPasso[0].msg}`
      : passo === TOTAL && todos.length > 0 ? `Para guardar: ${todos[0].msg}` : "";
  const seguinte = () => { if (!motivo) setPasso((p) => Math.min(TOTAL, p + 1)); };
  const anterior = () => setPasso((p) => Math.max(1, p - 1));
  const guardar = () => {
    if (todos.length > 0) return;
    onFamilias(original ? familias.map((x) => (x.id === original ? rascunho : x)) : [...familias, rascunho]);
    fechar();
  };
  const tirarDaFamilia = (id: string) => {
    const resto = escolhidos.filter((x) => x !== id);
    setEscolhidos(resto);
    if (resto.length === 0) setPasso(PASSO_ESCOLHER);
  };
  const avisosAtributos = [...faltas.map((x) => x.msg), ...derivado.conflitos];

  return (
    <section aria-label="Configurador de famílias (protótipo)" className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-3"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); if (passo > 1) anterior(); } }}>
      {aviso}
      <div>
        <p role="status" className="text-sm font-medium text-muted-foreground">Passo {passo} de {TOTAL} · {TITULOS[passo - 1]}</p>
        <ol aria-label="Passos do configurador" className="mt-1 flex gap-1.5">
          {TITULOS.map((t, i) => {
            const n = i + 1, atual = n === passo;
            return (
              <li key={t} aria-current={atual ? "step" : undefined} aria-label={`Passo ${n}: ${t}${n < passo ? " (feito)" : atual ? " (atual)" : ""}`}
                className={`flex h-8 min-w-0 flex-1 items-center justify-center rounded-full border px-2 text-xs ${atual ? "border-primary bg-primary font-semibold text-primary-foreground" : n < passo ? "border-primary/40 bg-primary/10" : "border-border bg-muted/40 text-muted-foreground"}`}>
                <span aria-hidden="true">{n < passo ? "✓" : n}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <h3 ref={tituloRef} tabIndex={-1} className="text-[15px] font-semibold outline-none">{TITULOS[passo - 1]}</h3>
        {passo === PASSO_ESCOLHER && (
          <PassoEscolher catalogo={cat} escolhidos={escolhidos} ocupados={ocupados} filtros={filtros} onFiltros={setFiltros} onAlternar={alternar} onSelecionar={selecionar} onLimpar={() => setEscolhidos([])} />
        )}
        {passo === PASSO_ATRIBUIR && (
          <>
            <Erros erros={doPasso.map((x) => x.msg).filter((m) => !avisosAtributos.includes(m))} />
            <PassoAtributos produtos={produtosEscolhidos} atributosPor={atributosPor} nomes={nomes} eixos={eixos} onEixos={setEscolhaEixos} onExcluir={tirarDaFamilia} avisos={avisosAtributos}
              resumo={`${plural(produtosEscolhidos.length, "produto", "produtos")} = ${plural(rascunho.medidas.length, "medida", "medidas")} × ${plural(rascunho.acabamentos.length, "acabamento", "acabamentos")}`} />
          </>
        )}
        {passo === TOTAL && (
          <>
            <Erros erros={todos.map((x) => x.msg)} />
            <PassoFamilia f={rascunho} variasMarcas={cab.variasMarcas} />
            <PassoResumo f={rascunho} erros={todos.map((x) => x.msg)} escolha={escolha} onEscolha={setEscolha} />
          </>
        )}
      </div>

      <div role="group" aria-label="Navegação do configurador" className="flex flex-wrap items-center gap-2">
        {motivo && <p id="motivo-seguinte" className="w-full text-sm text-muted-foreground">{motivo}</p>}
        <button type="button" className={BTN} disabled={passo === 1} onClick={anterior}>Anterior</button>
        {passo < TOTAL
          ? <button type="button" className={BTN_PRIMARIO} disabled={!!motivo} aria-describedby={motivo ? "motivo-seguinte" : undefined} onClick={seguinte}>Seguinte</button>
          : <button type="button" className={BTN_PRIMARIO} disabled={todos.length > 0} aria-describedby={motivo ? "motivo-seguinte" : undefined} onClick={guardar}>Guardar na sessão</button>}
        <button type="button" className={BTN} onClick={fechar}>Cancelar</button>
      </div>
    </section>
  );
}

function Erros({ erros }: { erros: readonly string[] }): ReactNode {
  if (erros.length === 0) return null;
  return (
    <ul role="alert" className="grid gap-1 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {erros.map((e) => <li key={e}>Erro: {e}</li>)}
    </ul>
  );
}

/** O nome, a marca, a categoria, o tipo e os espaços da família: DERIVADOS dos produtos e só de leitura (texto, sem campos). */
function PassoFamilia({ f, variasMarcas }: { f: FamiliaCfg; variasMarcas: boolean }) {
  const dados: [string, string][] = [
    ["Nome da família", f.nome || "—"], ["Marca", f.marca || "Sem marca"], ["Categoria", CATEGORIAS_FAMILIA.find((c) => c.id === f.categoria)?.rotulo ?? f.categoria],
    ["Tipo de produto", ESPEC[f.tipo].rotulo], ["Espaços onde aparece", f.espacos.map((t) => ROTULO_ESPACO[t]).join(", ") || "—"], ["Identificador", f.id],
  ];
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">O nome, a marca, a categoria, o tipo e os espaços saem dos produtos escolhidos: não se escrevem aqui.</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {dados.map(([rotulo, valor]) => (
          <div key={rotulo} className="grid min-w-0 gap-0.5">
            <dt className="text-sm font-medium text-muted-foreground">{rotulo}</dt>
            <dd className="break-words text-[15px]">{valor}</dd>
          </div>
        ))}
      </dl>
      {variasMarcas && <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><span aria-hidden="true">⚠ </span>Aviso: os produtos escolhidos têm marcas diferentes, por isso a família fica como «Várias marcas». Se não era o esperado, exclua os produtos de outra marca.</p>}
    </div>
  );
}

function PassoResumo({ f, erros, escolha, onEscolha }: { f: FamiliaCfg; erros: readonly string[]; escolha: { med?: string; acab?: string }; onEscolha: (e: { med?: string; acab?: string }) => void }) {
  const linhas = linhasDeVariantes(f), resumo = resumoDeProdutos(f), cel = "px-2 py-1.5", cabecalho = `sticky top-0 bg-muted ${cel}`;
  // com eixos: as colunas da medida são os atributos escolhidos (pela ordem escolhida) e a cor é o atributo das bolinhas; famílias antigas: Medida + extras
  const colunas = f.eixos ? f.eixos.medida : [NOME_MEDIDA, ...(f.atributos ?? [])], nomeCor = f.eixos?.cor ?? "Cor";
  const valorDe = (l: (typeof linhas)[number], n: string): string => l.valores[n] ?? (n === NOME_MEDIDA ? l.medida : "—");
  return (
    <div className="grid gap-3">
      <p className="text-[15px] font-semibold">{resumo.texto}</p>
      <p className="text-sm text-muted-foreground">Cada linha é um produto do catálogo, com os seus valores em cada atributo. O SKU e o preço vêm do produto e só se leem. Para mudar uma linha, volte ao passo anterior ou corrija o produto no catálogo.</p>
      <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-lg border border-border">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <caption className="px-2 py-1 text-left text-sm font-medium">Variantes geradas</caption>
          <thead>
            <tr className="border-y border-border">
              <th scope="col" className={cabecalho}>Produto</th>
              {colunas.map((x) => <th key={x} scope="col" className={cabecalho}>{x}</th>)}
              <th scope="col" className={cabecalho}>{nomeCor}</th>
              <th scope="col" className={cabecalho}>SKU</th><th scope="col" className={cabecalho}>Preço</th><th scope="col" className={cabecalho}>3D do fabricante</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-b border-border last:border-0">
                <td className={`break-words ${cel}`}>{l.produto}</td>
                {colunas.map((x) => <td key={x} className={cel}>{valorDe(l, x)}</td>)}
                <td className={cel}>{l.acabamento}</td>
                <td className={`break-all ${cel}`}>{l.sku}</td><td className={`whitespace-nowrap ${cel}`}>{eur(l.preco)}</td><td className={cel}>{l.tem3d ? "Sim" : "Não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erros.length === 0 && (
        <>
          <p className="text-sm text-muted-foreground">É assim que o cartão aparece na barra de produtos. «Guardar na sessão» põe-na lá, na categoria {CATEGORIAS_FAMILIA.find((c) => c.id === f.categoria)?.rotulo}; depois arrasta-se para a planta como as outras.</p>
          <ul aria-label="Pré-visualização da família" className="flex flex-wrap gap-3">
            <CartaoFamilia f={paraFamilia(f)} escolha={escolha} onEscolha={onEscolha} onPegar={semAcao} onMover={semAcao} onLargar={semAcao} onCancelar={semAcao} onJuntar={semAcao} />
          </ul>
        </>
      )}
    </div>
  );
}
