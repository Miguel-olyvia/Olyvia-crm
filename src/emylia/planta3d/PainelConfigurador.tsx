// Protótipo (visualizador 3D): o painel «Configurador de famílias», como assistente de 3 passos (um visível de cada vez).
// UMA FAMÍLIA É SEMPRE UM AGRUPAMENTO DE PRODUTOS QUE JÁ EXISTEM NO CATÁLOGO (produtos iguais que só mudam nos atributos: medida, cor/acabamento e atributos extra livres):
// 1 Escolher produtos, 2 Atribuir atributos (o valor de cada atributo em cada produto; a combinação não pode repetir-se),
// 3 Resumo e pré-visualização (nome, marca e tipo sugeridos pelos produtos e editáveis, tabela «N produtos = N variantes», erros, cartão ao vivo e guardar).
// O SKU e o preço de cada variante vêm do produto do catálogo (só leitura). A família é DERIVADA dos produtos e das atribuições (`familiaDeProdutos`); só em memória.
// A lista é de quem usa o painel (a página guarda-a em familiasConfiguradas.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CartaoFamilia } from "./BarraProdutos";
import { ESPEC, ROTULO_ESPACO, tipoMockupDe } from "./catalogo3d";
import {
  TIPOS_DA_CATEGORIA, atribuicoesDaFamilia, categoriaSugerida, comNome, criarFamiliaVazia, familiaDeProdutos, ficheiroSugerido, linhasDeVariantes, palpiteDoProduto, paraFamilia, problemas,
  refDoProduto, resumoDeProdutos, sugerirFamilia, type AtribuicaoProduto, type FamiliaCfg,
} from "./configurador";
import { BTN, BTN_PRIMARIO, CAMPO, INP, eur } from "./estilosPainel";
import { CATEGORIAS_FAMILIA, variantesDe, type CategoriaFam } from "./familias";
import type { TipoEspaco } from "./modelo";
import { filtrosIniciais, idsEmFamilias, type FiltrosCatalogo } from "./filtrosCatalogo";
import { PassoAtribuir, PassoEscolher, type CatalogoLido } from "./PassosCatalogo";
import { useCatalogo } from "../v2/catalogoStore";

const TITULOS = ["Escolher produtos", "Atribuir atributos", "Resumo e pré-visualização"] as const;
const TOTAL = TITULOS.length, PASSO_ESCOLHER = 1, PASSO_ATRIBUIR = 2;
const semAcao = () => undefined;

export interface PainelConfiguradorProps {
  /** As famílias configuradas nesta sessão (quem usa o painel guarda-as e regista-as). */
  familias: readonly FamiliaCfg[];
  onFamilias: (lista: FamiliaCfg[]) => void;
  /** O catálogo de onde se juntam produtos (só leitura). Sem ele, o do protótipo (useCatalogo). */
  catalogo?: CatalogoLido;
}

/** O passo onde se corrige um problema: o grupo 1 (nome, marca, espaços) no resumo; os outros (acabamentos, medidas, SKUs, repetidos) na atribuição de cada produto. */
const passoDoProblema = (grupo: 1 | 2 | 3 | 4): number => (grupo === 1 ? TOTAL : PASSO_ATRIBUIR);
const atribuicaoInicial = (p: CatalogoLido["produtos"][number], arvore: CatalogoLido["arvore"]): AtribuicaoProduto => {
  const tipo = tipoMockupDe(p, arvore), pal = palpiteDoProduto(p.n, { sub: p.sub, tipo }), glb = ficheiroSugerido(tipo, p.n, pal);
  return { produtoId: p.id, medida: pal.medida, dim: pal.dim, acabamento: pal.acabamento, cor: pal.cor, codigo: pal.codigo, metalness: pal.metalness, roughness: pal.roughness, ...(glb ? { glb } : {}) };
};
const ehVelar = (nome: string): boolean => /\bvelar\b/i.test(nome) && /lava/i.test(nome);

export function PainelConfigurador({ familias, onFamilias, catalogo }: PainelConfiguradorProps) {
  // `base` só guarda o cabeçalho da família (nome, marca, categoria, tipo, espaços) e os nomes dos atributos extra; o resto sai dos produtos e das atribuições
  const [base, setBase] = useState<FamiliaCfg | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [passo, setPasso] = useState(PASSO_ESCOLHER);
  const [escolha, setEscolha] = useState<{ med?: string; acab?: string }>({});
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [atribuicoes, setAtribuicoes] = useState<Record<string, AtribuicaoProduto>>({});
  const [filtros, setFiltros] = useState<FiltrosCatalogo>(filtrosIniciais);
  const ultimaSugestao = useRef<{ nome: string; marca: string; categoria: CategoriaFam; tipo: FamiliaCfg["tipo"] } | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null), primeiraVez = useRef(true);
  const lido = useCatalogo(), cat: CatalogoLido = catalogo ?? lido;
  const porId = useMemo(() => new Map(cat.produtos.map((p) => [p.id, p] as const)), [cat.produtos]);
  const produtosEscolhidos = useMemo(() => escolhidos.flatMap((id) => { const p = porId.get(id); return p ? [p] : []; }), [escolhidos, porId]);
  const ocupados = useMemo(() => idsEmFamilias(familias, original), [familias, original]);
  const velares = useMemo(() => cat.produtos.filter((p) => ehVelar(p.n)), [cat.produtos]);
  const derivado = useMemo(
    () => (base ? familiaDeProdutos(base, produtosEscolhidos.map((p) => refDoProduto(p)), produtosEscolhidos.flatMap((p) => (atribuicoes[p.id] ? [atribuicoes[p.id]] : []))) : null),
    [base, produtosEscolhidos, atribuicoes],
  );
  const rascunho = derivado?.familia ?? null;
  const emLista = base === null;
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    tituloRef.current?.focus();
  }, [passo, emLista]);

  const abrir = (f: FamiliaCfg, idOriginal: string | null, atribs: readonly AtribuicaoProduto[]) => {
    const validas = atribs.filter((a) => porId.has(a.produtoId));
    ultimaSugestao.current = null;
    setBase(f); setOriginal(idOriginal); setPasso(PASSO_ESCOLHER); setEscolha({}); setFiltros(filtrosIniciais());
    setEscolhidos(validas.map((a) => a.produtoId)); setAtribuicoes(Object.fromEntries(validas.map((a) => [a.produtoId, a] as const)));
  };
  const abrirNova = () => abrir(criarFamiliaVazia(), null, []);
  const abrirExemploVelar = () => abrir(criarFamiliaVazia(), null, velares.map((p) => atribuicaoInicial(p, cat.arvore)));
  const fechar = () => { setBase(null); setOriginal(null); setEscolhidos([]); setAtribuicoes({}); ultimaSugestao.current = null; };
  // só o cabeçalho da família se edita à mão: as medidas, os acabamentos e as células saem sempre dos produtos
  const mudar = (f: FamiliaCfg) => setBase((b) => (b ? { ...b, id: f.id, nome: f.nome, marca: f.marca, categoria: f.categoria, tipo: f.tipo, espacos: f.espacos } : b));
  const alternar = (id: string) => {
    const p = porId.get(id);
    if (!p) return;
    setEscolhidos((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    setAtribuicoes((a) => (a[id] ? a : { ...a, [id]: atribuicaoInicial(p, cat.arvore) }));
  };
  /** «Selecionar os N resultados»: junta de uma vez os que ainda não estão escolhidos (a ordem da escolha mantém-se). */
  const selecionar = (ids: readonly string[]) => {
    const novos = ids.flatMap((id) => { const p = porId.get(id); return p ? [p] : []; });
    setEscolhidos((l) => [...l, ...novos.map((p) => p.id).filter((id) => !l.includes(id))]);
    setAtribuicoes((a) => ({ ...Object.fromEntries(novos.map((p) => [p.id, atribuicaoInicial(p, cat.arvore)] as const)), ...a }));
  };
  const atribuir = (id: string, patch: Partial<AtribuicaoProduto>) => setAtribuicoes((a) => (a[id] ? { ...a, [id]: { ...a[id], ...patch } } : a));
  const acrescentarAtributo = (nome: string) => setBase((b) => (b ? { ...b, atributos: [...(b.atributos ?? []), nome] } : b));
  const tirarAtributo = (nome: string) => {
    setBase((b) => (b ? { ...b, atributos: (b.atributos ?? []).filter((x) => x !== nome) } : b));
    setAtribuicoes((a) => Object.fromEntries(Object.entries(a).map(([id, x]) => [id, x.extras && nome in x.extras ? { ...x, extras: Object.fromEntries(Object.entries(x.extras).filter(([k]) => k !== nome)) } : x] as const)));
  };
  /** Ao sair da escolha propõe o nome, a marca e a categoria pelos produtos, sem pisar o que o utilizador já escreveu (nem numa família que se está a editar). */
  const sugerir = () => {
    if (original) return;
    const sug = sugerirFamilia(produtosEscolhidos.map((p) => refDoProduto(p)));
    const contagem = new Map<string, number>();
    for (const p of produtosEscolhidos) { const t = tipoMockupDe(p, cat.arvore); contagem.set(t, (contagem.get(t) ?? 0) + 1); }
    const tipoComum = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as FamiliaCfg["tipo"] | undefined;
    const c = categoriaSugerida(tipoComum ?? "caixa"), ult = ultimaSugestao.current;
    setBase((b) => {
      if (!b) return b;
      let n = b;
      if (b.nome.trim() === "" || b.nome === ult?.nome) n = comNome(n, sug.nome);
      if (b.marca.trim() === "" || b.marca === ult?.marca) n = { ...n, marca: sug.marca };
      if (!ult || (b.categoria === ult.categoria && b.tipo === ult.tipo)) n = { ...n, categoria: c.categoria, tipo: c.tipo, espacos: [...(CATEGORIAS_FAMILIA.find((x) => x.id === c.categoria)?.espacos ?? ["outro"])] };
      return n;
    });
    ultimaSugestao.current = { nome: sug.nome, marca: sug.marca, categoria: c.categoria, tipo: c.tipo };
  };

  const aviso = (
    <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Protótipo: só dura nesta sessão; nada é guardado. Uma peça posta na planta com uma família configurada perde-se ao recarregar.
    </p>
  );

  if (!base || !rascunho) {
    return (
      <section aria-label="Configurador de famílias (protótipo)" className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-3">
        {aviso}
        <p className="text-sm text-muted-foreground">Uma família junta produtos que já existem no catálogo e são iguais, mudando só nos atributos (medida, cor, nº de cubas, material…). Escolha os produtos e diga o valor de cada atributo em cada um: o SKU e o preço de cada variante vêm do produto. Depois de guardada, a família aparece na barra de produtos, na categoria que escolheu.</p>
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
                      <button type="button" className={`${BTN} cursor-pointer`} aria-label={`Editar ${f.nome}`} onClick={() => abrir(f, f.id, atribuicoesDaFamilia(f))}>Editar</button>
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
    ...(derivado?.conflitos ?? []).map((msg) => ({ passo: PASSO_ATRIBUIR, msg })),
  ];
  const doPasso = todos.filter((x) => x.passo === passo);
  const semProdutos = passo === PASSO_ESCOLHER && produtosEscolhidos.length === 0;
  const motivo = semProdutos ? "Para continuar: escolha pelo menos um produto do catálogo."
    : passo < TOTAL && doPasso.length > 0 ? `Para continuar: ${doPasso[0].msg}`
      : passo === TOTAL && todos.length > 0 ? `Para guardar: ${todos[0].msg}` : "";
  const seguinte = () => {
    if (motivo) return;
    if (passo === PASSO_ESCOLHER) sugerir();
    setPasso((p) => Math.min(TOTAL, p + 1));
  };
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
            <Erros erros={doPasso.map((x) => x.msg).filter((m) => !(derivado?.conflitos ?? []).includes(m))} />
            <PassoAtribuir familia={rascunho} produtos={produtosEscolhidos} atribuicoes={atribuicoes} conflitos={derivado?.conflitos ?? []} atributos={base.atributos ?? []}
            onAtribuir={atribuir} onTirar={tirarDaFamilia} onAcrescentarAtributo={acrescentarAtributo} onTirarAtributo={tirarAtributo} />
          </>
        )}
        {passo === TOTAL && (
          <>
            <Erros erros={todos.map((x) => x.msg)} />
            <PassoFamilia f={rascunho} onMudar={mudar} />
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

/** O nome, a marca, a categoria, o tipo e os espaços da família (sugeridos pelos produtos e editáveis). */
function PassoFamilia({ f, onMudar }: { f: FamiliaCfg; onMudar: (f: FamiliaCfg) => void }) {
  const tipos = TIPOS_DA_CATEGORIA[f.categoria];
  const escolherCategoria = (c: CategoriaFam) => onMudar({ ...f, categoria: c, tipo: TIPOS_DA_CATEGORIA[c][0], espacos: [...(CATEGORIAS_FAMILIA.find((x) => x.id === c)?.espacos ?? ["outro"])] });
  const espacosPossiveis = Object.keys(ROTULO_ESPACO) as TipoEspaco[];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={CAMPO}>Nome da família<input className={INP} value={f.nome} onChange={(e) => onMudar(comNome(f, e.target.value))} placeholder="Por exemplo, Lava-loiça Keran" /></label>
      <label className={CAMPO}>Marca<input className={INP} value={f.marca} onChange={(e) => onMudar({ ...f, marca: e.target.value })} /></label>
      <label className={CAMPO}>Categoria
        <select className={INP} value={f.categoria} onChange={(e) => escolherCategoria(e.target.value as CategoriaFam)}>
          {CATEGORIAS_FAMILIA.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </select>
      </label>
      <label className={CAMPO}>Tipo de produto
        <select className={INP} value={f.tipo} onChange={(e) => onMudar({ ...f, tipo: e.target.value as FamiliaCfg["tipo"] })}>
          {tipos.map((t) => <option key={t} value={t}>{ESPEC[t].rotulo}</option>)}
        </select>
      </label>
      <fieldset className="grid gap-1 sm:col-span-2">
        <legend className="text-sm font-medium">Espaços onde aparece</legend>
        <div className="flex flex-wrap gap-2">
          {espacosPossiveis.map((t) => (
            <label key={t} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-background px-4 text-[15px]">
              <input type="checkbox" checked={f.espacos.includes(t)} onChange={(e) => onMudar({ ...f, espacos: e.target.checked ? [...f.espacos, t] : f.espacos.filter((x) => x !== t) })} />
              {ROTULO_ESPACO[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="break-all text-sm text-muted-foreground sm:col-span-2">Identificador: {f.id}</p>
    </div>
  );
}

function PassoResumo({ f, erros, escolha, onEscolha }: { f: FamiliaCfg; erros: readonly string[]; escolha: { med?: string; acab?: string }; onEscolha: (e: { med?: string; acab?: string }) => void }) {
  const linhas = linhasDeVariantes(f), resumo = resumoDeProdutos(f), extras = f.atributos ?? [], cel = "px-2 py-1.5", cabecalho = `sticky top-0 bg-muted ${cel}`;
  return (
    <div className="grid gap-3">
      <p className="text-[15px] font-semibold">{resumo.texto}</p>
      <p className="text-sm text-muted-foreground">Cada linha é um produto do catálogo, com os seus valores em cada atributo. O SKU e o preço vêm do produto e só se leem. Para mudar uma linha, volte ao passo anterior.</p>
      <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-lg border border-border">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <caption className="px-2 py-1 text-left text-sm font-medium">Variantes geradas</caption>
          <thead>
            <tr className="border-y border-border">
              <th scope="col" className={cabecalho}>Produto</th><th scope="col" className={cabecalho}>Medida</th><th scope="col" className={cabecalho}>Cor</th>
              {extras.map((x) => <th key={x} scope="col" className={cabecalho}>{x}</th>)}
              <th scope="col" className={cabecalho}>SKU</th><th scope="col" className={cabecalho}>Preço</th><th scope="col" className={cabecalho}>3D do fabricante</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-b border-border last:border-0">
                <td className={`break-words ${cel}`}>{l.produto}</td><td className={cel}>{l.medida}</td><td className={cel}>{l.acabamento}</td>
                {extras.map((x) => <td key={x} className={cel}>{l.valores[x] ?? "—"}</td>)}
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
