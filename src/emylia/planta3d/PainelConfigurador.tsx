// Protótipo (visualizador 3D): o painel «Configurador de famílias», como assistente de 3 passos (um visível de cada vez), com os ACABAMENTOS POR PRODUTO:
// 1 Família (marca, nome, categoria e tipo, espaços), 2 Produtos e acabamentos (cada produto = uma medida/referência-base, e cada acabamento dele é uma variante-produto
// com SKU, preço e modelo 3D próprios), 3 Resumo e pré-visualização (tabela «N produtos = N referências», erros, cartão ao vivo e guardar).
// Na vida real uma lava-loiça com 9 variantes são 9 produtos diferentes: por isso não há uma lista global de acabamentos nem uma matriz cor × medida; a matriz passa a ser
// a consequência de cada produto ter os seus acabamentos. O modelo de dados (FamiliaCfg) não mudou. A lista é de quem usa o painel (a página guarda-a em familiasConfiguradas.ts); só em memória.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CartaoFamilia } from "./BarraProdutos";
import { ESPEC, ROTULO_ESPACO, tipoMockupDe } from "./catalogo3d";
import {
  TIPOS_DA_CATEGORIA, acabamentosDoProduto, alterarAcabamento, alterarVariante, aplicarAcabamentoATodos, categoriaSugerida, celulaKey, comNome, copiarAcabamentosParaOutros, criarFamiliaVazia, definirGlbDaVariante,
  exemploKeran, exemploLodyFrasa, familiaDeProdutos, ficheiroSugerido, ficheirosCompativeis, juntarAcabamentoAoProduto, juntarAcabamentoExistente, juntarProduto, linhasDeVariantes, palpiteDoProduto, paraFamilia,
  prepararParaEdicao, problemas, refDoProduto, resumoDeProdutos, skuDaCelula, sugerirFamilia, tirarAcabamentoDoProduto, tirarProduto, type AtribuicaoProduto, type FamiliaCfg, type MedidaCfg,
} from "./configurador";
import { BTN, BTN_PRIMARIO, CAMPO, INP, eur } from "./estilosPainel";
import { CATEGORIAS_FAMILIA, variantesDe, type CategoriaFam } from "./familias";
import { chaveFicheiro } from "./modelosHtml/ficheiros";
import type { TipoEspaco } from "./modelo";
import { PassoAtribuir, PassoEscolher, type CatalogoLido } from "./PassosCatalogo";
import { useCatalogo } from "../v2/catalogoStore";

/** Os passos «do zero» (o assistente original) e os de «juntar produtos do catálogo» (a escolha e a atribuição entram a seguir à pergunta do passo 1). */
const TITULOS_ZERO = ["Família", "Produtos e acabamentos", "Resumo e pré-visualização"] as const;
const TITULOS_CATALOGO = ["Família", "Escolher produtos", "Atribuir medidas e acabamentos", "Resumo e pré-visualização"] as const;
type Modo = "zero" | "catalogo";
const SEM_GLB = "";
const semAcao = () => undefined;

export interface PainelConfiguradorProps {
  /** As famílias configuradas nesta sessão (quem usa o painel guarda-as e regista-as). */
  familias: readonly FamiliaCfg[];
  onFamilias: (lista: FamiliaCfg[]) => void;
  /** O catálogo de onde se juntam produtos (só leitura). Sem ele, o do protótipo (useCatalogo). */
  catalogo?: CatalogoLido;
}

/** O passo do assistente onde se corrige um problema. «Do zero»: o grupo 1 (família) é o passo 1; os grupos 2, 3 e 4 (acabamentos, medidas, SKUs) são o passo 2 (por produto).
 * «Juntar produtos»: o nome, a marca e a categoria editam-se no passo 3 (junto da atribuição), por isso todos os problemas se corrigem lá. */
const passoDoProblema = (modo: Modo, grupo: 1 | 2 | 3 | 4): number => (modo === "catalogo" ? 3 : grupo === 1 ? 1 : 2);
const nomeProduto = (m: MedidaCfg): string => m.rotulo.trim() || m.ref.trim() || m.id;
const atribuicaoInicial = (p: CatalogoLido["produtos"][number], arvore: CatalogoLido["arvore"]): AtribuicaoProduto => {
  const tipo = tipoMockupDe(p, arvore), pal = palpiteDoProduto(p.n, { sub: p.sub, tipo }), glb = ficheiroSugerido(tipo, p.n, pal);
  return { produtoId: p.id, medida: pal.medida, dim: pal.dim, acabamento: pal.acabamento, cor: pal.cor, codigo: pal.codigo, metalness: pal.metalness, roughness: pal.roughness, ...(glb ? { glb } : {}) };
};
const ehVelar = (nome: string): boolean => /\bvelar\b/i.test(nome) && /lava/i.test(nome);

export function PainelConfigurador({ familias, onFamilias, catalogo }: PainelConfiguradorProps) {
  const [base, setBase] = useState<FamiliaCfg | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [passo, setPasso] = useState(1);
  const [escolha, setEscolha] = useState<{ med?: string; acab?: string }>({});
  // «juntar produtos do catálogo»: o modo, se se pergunta como criar (só nas famílias novas), os produtos escolhidos (pela ordem) e a atribuição de cada um
  const [modo, setModo] = useState<Modo>("zero");
  const [pergunta, setPergunta] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [atribuicoes, setAtribuicoes] = useState<Record<string, AtribuicaoProduto>>({});
  const ultimaSugestao = useRef<{ nome: string; marca: string; categoria: CategoriaFam; tipo: FamiliaCfg["tipo"] } | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null), primeiraVez = useRef(true);
  const lido = useCatalogo(), cat: CatalogoLido = catalogo ?? lido;
  const porId = useMemo(() => new Map(cat.produtos.map((p) => [p.id, p] as const)), [cat.produtos]);
  const produtosEscolhidos = useMemo(() => escolhidos.flatMap((id) => { const p = porId.get(id); return p ? [p] : []; }), [escolhidos, porId]);
  const velares = useMemo(() => cat.produtos.filter((p) => ehVelar(p.n)), [cat.produtos]);
  // em «juntar produtos» a família é DERIVADA dos produtos e das atribuições (`base` só guarda o nome, a marca, a categoria, o tipo e os espaços)
  const derivado = useMemo(
    () => (modo === "catalogo" && base ? familiaDeProdutos(base, produtosEscolhidos.map((p) => refDoProduto(p)), produtosEscolhidos.flatMap((p) => (atribuicoes[p.id] ? [atribuicoes[p.id]] : []))) : null),
    [modo, base, produtosEscolhidos, atribuicoes],
  );
  const rascunho = derivado ? derivado.familia : base;
  const emLista = base === null;
  const titulos = modo === "catalogo" ? TITULOS_CATALOGO : TITULOS_ZERO, total = titulos.length;
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    tituloRef.current?.focus();
  }, [passo, emLista]);

  const reiniciarCatalogo = (ids: readonly string[]) => {
    ultimaSugestao.current = null;
    setEscolhidos([...ids]);
    setAtribuicoes(Object.fromEntries(ids.flatMap((id) => { const p = porId.get(id); return p ? [[id, atribuicaoInicial(p, cat.arvore)] as const] : []; })));
  };
  const abrir = (f: FamiliaCfg, idOriginal: string | null, nova = false) => {
    setBase(prepararParaEdicao(f)); setOriginal(idOriginal); setPasso(1); setEscolha({});
    setModo("zero"); setPergunta(nova); reiniciarCatalogo([]);
  };
  const abrirExemploVelar = () => {
    abrir(criarFamiliaVazia(), null, true);
    setModo("catalogo"); reiniciarCatalogo(velares.map((p) => p.id)); setPasso(2);
  };
  const fechar = () => { setBase(null); setOriginal(null); reiniciarCatalogo([]); setModo("zero"); setPergunta(false); };
  const guardarLista = (lista: FamiliaCfg[]) => onFamilias(lista);
  // em «juntar produtos» só o cabeçalho da família se edita à mão: as medidas, os acabamentos e as células saem sempre dos produtos
  const mudar = (f: FamiliaCfg) => setBase(modo === "catalogo" && base ? { ...base, id: f.id, nome: f.nome, marca: f.marca, categoria: f.categoria, tipo: f.tipo, espacos: f.espacos } : f);
  const alternar = (id: string) => {
    const p = porId.get(id);
    if (!p) return;
    setEscolhidos((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    setAtribuicoes((a) => (a[id] ? a : { ...a, [id]: atribuicaoInicial(p, cat.arvore) }));
  };
  const atribuir = (id: string, patch: Partial<AtribuicaoProduto>) => setAtribuicoes((a) => (a[id] ? { ...a, [id]: { ...a[id], ...patch } } : a));
  /** Ao sair da escolha propõe o nome, a marca e a categoria pelos produtos, sem pisar o que o utilizador já escreveu. */
  const sugerir = () => {
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
        <p className="text-sm text-muted-foreground">Crie uma família de produtos: cada produto (uma medida com a sua referência) tem os seus acabamentos, e cada acabamento é uma variante com o seu preço e o seu SKU. Pode criá-la do zero ou juntando produtos que já existem no catálogo. Depois de guardada, aparece na barra de produtos, na categoria que escolheu.</p>
        {familias.length === 0
          ? <p role="status" className="text-[15px]">Ainda sem famílias configuradas.</p>
          : (
            <ul aria-label="Famílias configuradas" className="grid gap-2">
              {familias.map((f) => {
                const fam = paraFamilia(f), n = variantesDe(fam).length;
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
                    <div className="min-w-0 flex-1"><p className="break-words text-[15px] font-semibold">{f.nome}</p><p className="text-sm text-muted-foreground">{f.marca || "Sem marca"} · {CATEGORIAS_FAMILIA.find((c) => c.id === f.categoria)?.rotulo} · {n} {n === 1 ? "variante" : "variantes"}</p></div>
                    <button type="button" className={BTN} aria-label={`Editar ${f.nome}`} onClick={() => abrir(f, f.id)}>Editar</button>
                    <button type="button" className={BTN} aria-label={`Remover ${f.nome}`} onClick={() => guardarLista(familias.filter((x) => x.id !== f.id))}>Remover</button>
                  </li>
                );
              })}
            </ul>
          )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_PRIMARIO} onClick={() => abrir(criarFamiliaVazia(), null, true)}>Nova família</button>
          <button type="button" className={BTN} onClick={() => abrir(exemploKeran(), null)}>Começar pelo exemplo</button>
          <button type="button" className={BTN} onClick={() => abrir(exemploLodyFrasa(), null)}>Exemplo: Lody, FRASA (9 produtos)</button>
          {velares.length >= 2 && <button type="button" className={BTN} onClick={abrirExemploVelar}>Exemplo: agrupar as lava-loiças Velar do catálogo</button>}
        </div>
      </section>
    );
  }

  const outrosIds = familias.filter((x) => x.id !== original).map((x) => x.id);
  const todos: { passo: number; msg: string }[] = [
    ...problemas(rascunho, outrosIds).map((x) => ({ passo: passoDoProblema(modo, x.passo), msg: x.msg })),
    ...(derivado?.conflitos ?? []).map((msg) => ({ passo: 3, msg })),
  ];
  const doPasso = todos.filter((x) => x.passo === passo);
  const semProdutos = modo === "catalogo" && passo === 2 && produtosEscolhidos.length === 0;
  const motivo = semProdutos ? "Para continuar: escolha pelo menos um produto do catálogo." : passo < total && doPasso.length > 0 ? `Para continuar: ${doPasso[0].msg}` : "";
  const seguinte = () => {
    if (motivo) return;
    if (modo === "catalogo" && passo === 2) sugerir();
    setPasso((p) => Math.min(total, p + 1));
  };
  const anterior = () => setPasso((p) => Math.max(1, p - 1));
  const guardar = () => {
    if (todos.length > 0) return;
    const lista = original ? familias.map((x) => (x.id === original ? rascunho : x)) : [...familias, rascunho];
    guardarLista(lista);
    fechar();
  };
  const tirarDaFamilia = (id: string) => {
    const resto = escolhidos.filter((x) => x !== id);
    setEscolhidos(resto);
    if (resto.length === 0) setPasso(2);
  };
  const emCatalogo = modo === "catalogo";

  return (
    <section aria-label="Configurador de famílias (protótipo)" className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-3"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); if (passo > 1) anterior(); } }}>
      {aviso}
      <div>
        <p role="status" className="text-sm font-medium text-muted-foreground">Passo {passo} de {total} · {titulos[passo - 1]}</p>
        <ol aria-label="Passos do configurador" className="mt-1 flex gap-1.5">
          {titulos.map((t, i) => {
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
        <h3 ref={tituloRef} tabIndex={-1} className="text-[15px] font-semibold outline-none">{titulos[passo - 1]}</h3>
        {passo === 1 && pergunta && <ComoCriar modo={modo} onModo={setModo} />}
        {passo === 1 && !emCatalogo && <PassoFamilia f={rascunho} onMudar={mudar} />}
        {passo === 1 && emCatalogo && <p className="text-sm text-muted-foreground">No passo seguinte escolhe os produtos do catálogo. O nome, a marca e a categoria da família sugerem-se a partir deles e podem corrigir-se.</p>}
        {passo === 2 && !emCatalogo && <PassoProdutos f={rascunho} onMudar={mudar} erros={doPasso.map((x) => x.msg)} />}
        {passo === 2 && emCatalogo && <PassoEscolher catalogo={cat} escolhidos={escolhidos} onAlternar={alternar} onLimpar={() => setEscolhidos([])} />}
        {passo === 3 && emCatalogo && (
          <>
            <PassoFamilia f={rascunho} onMudar={mudar} />
            <Erros erros={doPasso.filter((x) => !(derivado?.conflitos ?? []).includes(x.msg)).map((x) => x.msg)} />
            <PassoAtribuir familia={rascunho} produtos={produtosEscolhidos} atribuicoes={atribuicoes} conflitos={derivado?.conflitos ?? []} onAtribuir={atribuir} onTirar={tirarDaFamilia} />
          </>
        )}
        {passo === total && <PassoResumo f={rascunho} erros={todos.map((x) => x.msg)} escolha={escolha} onEscolha={setEscolha} />}
      </div>

      <div role="group" aria-label="Navegação do configurador" className="flex flex-wrap items-center gap-2">
        {motivo && <p id="motivo-seguinte" className="w-full text-sm text-muted-foreground">{motivo}</p>}
        {passo === total && todos.length > 0 && <p className="w-full text-sm text-muted-foreground">Para guardar: corrija primeiro os erros indicados.</p>}
        <button type="button" className={BTN} disabled={passo === 1} onClick={anterior}>Anterior</button>
        {passo < total
          ? <button type="button" className={BTN_PRIMARIO} disabled={!!motivo} aria-describedby={motivo ? "motivo-seguinte" : undefined} onClick={seguinte}>Seguinte</button>
          : <button type="button" className={BTN_PRIMARIO} disabled={todos.length > 0} onClick={guardar}>Guardar na sessão</button>}
        <button type="button" className={BTN} onClick={fechar}>Cancelar</button>
      </div>
    </section>
  );
}

/** A pergunta do passo 1 de uma família nova: «Como quer criar a família?». */
function ComoCriar({ modo, onModo }: { modo: Modo; onModo: (m: Modo) => void }) {
  const opcao = (m: Modo, rotulo: string, ajuda: string) => (
    <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-[15px] ${modo === m ? "border-primary bg-primary/10" : "border-input bg-background hover:bg-accent"}`}>
      <input type="radio" name="como-criar" aria-label={rotulo} className="mt-1 h-5 w-5 shrink-0" checked={modo === m} onChange={() => onModo(m)} />
      <span className="min-w-0"><span className="block font-medium">{rotulo}</span><span className="block text-sm text-muted-foreground">{ajuda}</span></span>
    </label>
  );
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-1 text-sm font-medium">Como quer criar a família?</legend>
      {opcao("zero", "Do zero", "Escreve as medidas, os acabamentos, as referências e os preços.")}
      {opcao("catalogo", "Juntar produtos do catálogo", "Escolhe produtos que já existem; cada um traz a sua referência e o seu preço.")}
    </fieldset>
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

interface PassoProps { f: FamiliaCfg; onMudar: (f: FamiliaCfg) => void }

function PassoFamilia({ f, onMudar }: PassoProps) {
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
        <select className={INP} value={f.tipo} onChange={(e) => onMudar({ ...f, tipo: e.target.value as FamiliaCfg["tipo"], glb: {} })}>
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

const numero = (v: string): number => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const NOMES_DIM = ["Largura", "Profundidade", "Altura"] as const;

function PassoProdutos({ f, onMudar, erros }: PassoProps & { erros: readonly string[] }) {
  const [reuso, setReuso] = useState<Record<string, string>>({});
  const ficheiros = ficheirosCompativeis(f.tipo);
  const alterarProduto = (id: string, p: Partial<MedidaCfg>) => onMudar({ ...f, medidas: f.medidas.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const dim = (m: MedidaCfg, i: 0 | 1 | 2, v: string) => alterarProduto(m.id, { dim: m.dim.map((x, j) => (j === i ? numero(v) : x)) as [number, number, number] });
  const autoSku = (mid: string, aid: string) => skuDaCelula({ ...f, regraSku: { ...f.regraSku, modo: "auto" } }, mid, aid);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Cada produto é uma medida com a sua referência-base, e cada acabamento dele é um produto diferente, com o seu SKU e o seu preço. Escreva só o que muda: o SKU vem de referência + código e o preço, se ficar vazio, é o preço base do produto.</p>
      <label className={`${CAMPO} w-32`}>Separador do SKU<input aria-label="Separador do SKU" maxLength={3} className={INP} value={f.regraSku.sep} onChange={(e) => onMudar({ ...f, regraSku: { ...f.regraSku, sep: e.target.value } })} /></label>
      <Erros erros={erros} />
      {f.medidas.map((m, i) => {
        const p = i + 1, acabs = acabamentosDoProduto(f, m.id), disponiveis = f.acabamentos.filter((a) => !acabs.some((x) => x.id === a.id));
        const escolhido = disponiveis.find((a) => a.id === reuso[m.id])?.id ?? disponiveis[0]?.id ?? "";
        return (
          <fieldset key={m.id} className="grid min-w-0 gap-3 rounded-xl border border-border p-2">
            <legend className="px-1 text-sm font-semibold">Produto {p}: {nomeProduto(m)} · base {eur(m.preco)}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className={CAMPO}>Rótulo<input aria-label={`Rótulo do produto ${p}`} className={INP} value={m.rotulo} onChange={(e) => alterarProduto(m.id, { rotulo: e.target.value })} /></label>
              <label className={CAMPO}>Referência base<input aria-label={`Referência do produto ${p}`} className={INP} value={m.ref} onChange={(e) => alterarProduto(m.id, { ref: e.target.value })} /></label>
              <label className={CAMPO}>Preço base (€)<input aria-label={`Preço base do produto ${p} (€)`} type="number" min="0" step="0.01" inputMode="decimal" className={INP} defaultValue={m.preco || ""} onChange={(e) => alterarProduto(m.id, { preco: numero(e.target.value) })} /></label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {NOMES_DIM.map((n, j) => (
                <label key={n} className={CAMPO}>{n} (cm)<input aria-label={`${n} do produto ${p} (cm)`} type="number" min="0" step="0.1" inputMode="decimal" className={INP} defaultValue={m.dim[j]} onChange={(e) => dim(m, j as 0 | 1 | 2, e.target.value)} /></label>
              ))}
            </div>

            <div role="group" aria-label={`Acabamentos do produto ${p}`} className="grid gap-2">
              {acabs.length === 0 && <p className="text-sm text-muted-foreground">O produto {p} ainda não tem acabamentos: junte um abaixo.</p>}
              {acabs.map((a, j) => {
                const q = j + 1, c = f.celulas[celulaKey(m.id, a.id)] ?? { ativo: true }, lugar = `do produto ${p}`, nome = `acabamento ${q} ${lugar}`;
                const v = f.glb?.[celulaKey(m.id, a.id)] ?? SEM_GLB, mudaCelula = (patch: Parameters<typeof alterarVariante>[3]) => onMudar(alterarVariante(f, m.id, a.id, patch));
                return (
                  <div key={a.id} role="group" aria-label={`Acabamento ${q} ${lugar}`} className={`grid min-w-0 gap-2 rounded-lg border p-2 ${c.ativo ? "border-border" : "border-dashed border-border bg-muted/40"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span aria-hidden="true" className="block h-5 w-5 shrink-0 rounded-full border border-border" style={{ background: a.cor }} />
                      <label className="inline-flex min-h-11 items-center gap-2 text-[15px]">
                        <input type="checkbox" aria-label={`Ativo: ${nome}`} checked={c.ativo} onChange={(e) => mudaCelula({ ativo: e.target.checked })} />Ativo
                      </label>
                      {!c.ativo && <span className="text-sm text-muted-foreground">(desligado neste produto: não entra no resumo)</span>}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className={CAMPO}>Acabamento<input aria-label={`Nome do ${nome}`} className={INP} value={a.nome} onChange={(e) => onMudar(alterarAcabamento(f, a.id, { nome: e.target.value }))} /></label>
                      <label className={CAMPO}>Código<input aria-label={`Código do ${nome}`} className={INP} value={a.codigo} onChange={(e) => onMudar(alterarAcabamento(f, a.id, { codigo: e.target.value }))} /></label>
                      <label className={CAMPO}>Cor<input aria-label={`Cor do ${nome}`} type="color" className="h-11 w-16 rounded-lg border border-input bg-card p-1" value={a.cor} onChange={(e) => onMudar(alterarAcabamento(f, a.id, { cor: e.target.value }))} /></label>
                      <label className={CAMPO}>SKU<input aria-label={`SKU do ${nome}`} className={INP} disabled={!c.ativo || !!c.produtoId} placeholder={autoSku(m.id, a.id)} value={c.sku ?? autoSku(m.id, a.id)} onChange={(e) => mudaCelula({ sku: e.target.value })} /></label>
                      <label className={CAMPO}>Preço (€)<input aria-label={`Preço do ${nome} (€)`} type="number" min="0" step="0.01" inputMode="decimal" className={INP} disabled={!c.ativo || !!c.produtoId} placeholder={String(m.preco)} defaultValue={c.preco ?? ""} onChange={(e) => mudaCelula({ preco: e.target.value === "" ? undefined : numero(e.target.value) })} /></label>
                      {c.produtoId && <p className="text-sm text-muted-foreground sm:col-span-2">O SKU e o preço: vem do produto do catálogo «{c.produtoNome || c.produtoId}»; mudam-se no catálogo, não aqui.</p>}
                      {ficheiros.length === 0
                        ? <p className="self-end text-sm text-muted-foreground">Modelo genérico: este tipo de produto não tem 3D do fabricante.</p>
                        : (
                          <label className={CAMPO}>Modelo 3D
                            <select aria-label={`Modelo 3D do ${nome}`} className={INP} disabled={!c.ativo} value={v} onChange={(e) => onMudar(definirGlbDaVariante(f, m.id, a.id, e.target.value))}>
                              <option value={SEM_GLB}>Modelo genérico</option>
                              {ficheiros.map((x) => <option key={x.ficheiro} value={chaveFicheiro(x.familia, x.modelo, x.acab)}>{x.marca} · {x.modelo} · {x.acab}</option>)}
                            </select>
                          </label>
                        )}
                    </div>
                    {ficheiros.length > 0 && <p><span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">{v === SEM_GLB ? "Modelo genérico" : "3D do fabricante"}</span></p>}
                    <div className="flex flex-wrap gap-2">
                      {f.medidas.length > 1 && <button type="button" className={BTN} aria-label={`Aplicar o ${nome} a todos os produtos`} onClick={() => onMudar(aplicarAcabamentoATodos(f, a.id))}>Aplicar a todos os produtos</button>}
                      <button type="button" className={BTN} aria-label={`Remover o ${nome}`} onClick={() => onMudar(tirarAcabamentoDoProduto(f, m.id, a.id))}>Remover</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <button type="button" className={BTN} aria-label={`Adicionar acabamento ao produto ${p}`} onClick={() => onMudar(juntarAcabamentoAoProduto(f, m.id))}>Adicionar acabamento</button>
              {disponiveis.length > 0 && (
                <>
                  <label className={`${CAMPO} min-w-40 flex-1`}>Já existe na família
                    <select aria-label={`Acabamento da família a juntar ao produto ${p}`} className={INP} value={escolhido} onChange={(e) => setReuso({ ...reuso, [m.id]: e.target.value })}>
                      {disponiveis.map((a) => <option key={a.id} value={a.id}>{a.nome} ({a.codigo})</option>)}
                    </select>
                  </label>
                  <button type="button" className={BTN} aria-label={`Juntar acabamento existente ao produto ${p}`} onClick={() => onMudar(juntarAcabamentoExistente(f, m.id, escolhido))}>Juntar</button>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {f.medidas.length > 1 && <button type="button" className={BTN} aria-label={`Copiar os acabamentos do produto ${p} para os outros`} onClick={() => onMudar(copiarAcabamentosParaOutros(f, m.id))}>Copiar os acabamentos para os outros produtos</button>}
              <button type="button" className={BTN} aria-label={`Remover o produto ${p}`} onClick={() => onMudar(tirarProduto(f, m.id))}>Remover o produto</button>
            </div>
          </fieldset>
        );
      })}
      <div><button type="button" className={BTN} onClick={() => onMudar(juntarProduto(f))}>Adicionar produto</button></div>
    </div>
  );
}

function PassoResumo({ f, erros, escolha, onEscolha }: { f: FamiliaCfg; erros: readonly string[]; escolha: { med?: string; acab?: string }; onEscolha: (e: { med?: string; acab?: string }) => void }) {
  const linhas = linhasDeVariantes(f), resumo = resumoDeProdutos(f), doCatalogo = linhas.some((l) => !!l.produtoId);
  return (
    <div className="grid gap-3">
      <Erros erros={erros} />
      <p className="text-[15px] font-semibold">{resumo.texto}</p>
      <p className="text-sm text-muted-foreground">Cada linha é um produto com a sua referência (SKU) e o seu preço. Para mudar uma linha, volte ao passo anterior.</p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <caption className="px-2 py-1 text-left text-sm font-medium">Variantes geradas</caption>
          <thead>
            <tr className="border-y border-border bg-muted/40"><th scope="col" className="px-2 py-1.5">Produto</th><th scope="col" className="px-2 py-1.5">Acabamento</th><th scope="col" className="px-2 py-1.5">SKU</th><th scope="col" className="px-2 py-1.5">Preço</th><th scope="col" className="px-2 py-1.5">3D do fabricante</th>{doCatalogo && <th scope="col" className="px-2 py-1.5">Origem</th>}</tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5">{l.produto}</td><td className="px-2 py-1.5">{l.acabamento}</td><td className="break-all px-2 py-1.5">{l.sku}</td><td className="whitespace-nowrap px-2 py-1.5">{eur(l.preco)}</td><td className="px-2 py-1.5">{l.tem3d ? "Sim" : "Não"}</td>{doCatalogo && <td className="px-2 py-1.5">{l.produtoId ? "Produto do catálogo" : "Criado aqui"}</td>}
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
