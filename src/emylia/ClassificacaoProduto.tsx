// 13/11: marca, categoria e subcategoria do produto no Catálogo. Três dropdowns com pesquisa em texto (ComboPesquisa), nunca listas soltas.
// A subcategoria só mostra as da categoria escolhida e fica desativada até haver categoria. «Nova marca/categoria/subcategoria…» escolhe um
// nome novo: nada se grava aqui; a base cria-o pelo nome quando o produto é gravado (cat_guardar_produto_tabelas, real/gravarCatalogo.ts).
// Os campos servem a criação (CriarNoCatalogo) e a ficha (ClassificacaoFicha, que grava direto, como o PVP e os atributos).
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NOTA, Campo } from "./pecasForm";
import { ComboPesquisa, NovoNome, semAcentos, type ItemCombo } from "./ComboPesquisa";
import { categoriasDe, nomesDoRamo, ramoDe, subcategoriasDe, type RamoEscolhido } from "./ramoProduto";
import { gravarClassificacao, type FichaProdutoReal } from "./fichaProdutoDados";
import type { No } from "./v2/catalogoModelo";

const NOVA = "__nova__";
const DICA_NOVA = "É nova: cria-se quando o produto for gravado.";
const DESATIVADA = "Já existe e está desativada: reative-a na Gestão.";
const juntar = (t: string) => t.trim().replace(/\s+/g, " ");

/** Devolve o foco a um campo depois de o seu formulário «Nova …» fechar. */
function useFoco(): { registar: (el: HTMLInputElement | null) => void; devolver: () => void } {
  const el = useRef<HTMLInputElement | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => { if (n) el.current?.focus(); }, [n]);
  return { registar: useCallback((x: HTMLInputElement | null) => { el.current = x; }, []), devolver: useCallback(() => setN((v) => v + 1), []) };
}

/* ------------------------------------------------------------------ marca */
/** `original`: a marca que o produto já tem. A leitura só traz as marcas ativas: se a do produto não vem, está desativada («X (desativada)», não é «nova»). */
export function CampoMarca({ marcas, marca, onChange, original = "" }: { marcas: readonly string[]; marca: string; onChange: (marca: string) => void; original?: string }) {
  const [novo, setNovo] = useState<string | null>(null);
  const foco = useFoco();
  const itens = useMemo<ItemCombo[]>(() => [...new Set(marcas.map(juntar).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt")).map((m) => ({ id: m, nome: m })), [marcas]);
  const naLista = itens.some((x) => semAcentos(x.nome) === semAcentos(juntar(marca)));
  const desativada = !!marca.trim() && !naLista && juntar(marca) === juntar(original);
  const atual: ItemCombo | null = marca.trim() ? { id: marca, nome: marca, ...(desativada ? { inativo: true } : {}) } : null;
  const eNova = !!atual && !naLista && !desativada;
  const fechar = () => { setNovo(null); foco.devolver(); };
  return (
    <>
      <Campo rot="Marca" dica={eNova ? DICA_NOVA : undefined}>{(id) => (
        <ComboPesquisa id={id} rotulo="Marca" itens={itens} atual={atual} onEscolher={(i) => onChange(i.id)} semValor="Sem marca"
          onNova={(t) => setNovo(t)} textoNova="Nova marca…" registar={foco.registar} />
      )}</Campo>
      {novo !== null && (
        <NovoNome rotulo="Nova marca" rotuloCampo="Nome da nova marca" inicial={novo}
          onCriar={(nome) => { const ja = itens.find((x) => semAcentos(x.nome) === semAcentos(nome)); onChange(ja ? ja.id : nome); fechar(); }} onCancelar={fechar} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ categoria e subcategoria */
export const RAMO_VAZIO: RamoEscolhido = { cat: "", sub: "", catNova: null, subNova: null };
/** O ramo de um produto que já existe, como escolha (sem nomes novos). */
export const ramoInicial = (A: readonly No[], no: string | null | undefined): RamoEscolhido => ({ ...ramoDe(A, no), catNova: null, subNova: null });

/** A subcategoria atual: «(desativada)» só se ela própria o está (numa categoria desativada continua a mostrar-se normal). */
function subAtualDe(subs: readonly ItemCombo[], arvore: readonly No[], id: string): ItemCombo | null {
  const x = subs.find((s) => s.id === id);
  return x ? { id: x.id, nome: x.nome, ...(arvore.find((n) => n.id === id)?.inativa ? { inativo: true } : {}) } : null;
}

export function CamposRamo({ arvore, ramo, onChange }: { arvore: readonly No[]; ramo: RamoEscolhido; onChange: (r: RamoEscolhido) => void }) {
  const [novo, setNovo] = useState<{ t: "cat" | "sub"; nome: string } | null>(null);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const fCat = useFoco(), fSub = useFoco();
  // as desativadas não se escolhem (ComboPesquisa tira da lista os `inativo`); a que o produto já tem continua à vista, «X (desativada)»
  const catInativa = !!arvore.find((x) => x.id === ramo.cat)?.inativa;
  const cats = useMemo(() => categoriasDe(arvore).map((x): ItemCombo => ({ id: x.id, nome: x.n, ...(x.inativa ? { inativo: true } : {}) })), [arvore]);
  // numa categoria desativada também não se escolhe subcategoria nova (a base recusa)
  const subs = useMemo(() => subcategoriasDe(arvore, ramo.cat).map((x): ItemCombo => ({ id: x.id, nome: x.n, ...(x.inativa || catInativa ? { inativo: true } : {}) })), [arvore, ramo.cat, catInativa]);
  const temCat = !!ramo.cat || !!ramo.catNova;
  const catAtual: ItemCombo | null = ramo.catNova ? { id: NOVA, nome: ramo.catNova } : ramo.cat ? cats.find((x) => x.id === ramo.cat) ?? null : null;
  const subAtual: ItemCombo | null = ramo.subNova ? { id: NOVA, nome: ramo.subNova } : ramo.sub ? subAtualDe(subs, arvore, ramo.sub) : null;
  const fechar = () => { const t = novo?.t; setNovo(null); setErroNovo(null); (t === "sub" ? fSub : fCat).devolver(); };
  // um nome novo que já existe (sem acentos nem maiúsculas) escolhe o que existe; se existe mas está desativada, avisa no momento (a base recusa-a)
  const criarCat = (nome: string) => {
    const ja = cats.find((x) => semAcentos(x.nome) === semAcentos(nome));
    if (ja?.inativo) { setErroNovo(DESATIVADA); return; }
    onChange(ja ? { cat: ja.id, sub: "", catNova: null, subNova: null } : { cat: "", sub: "", catNova: nome, subNova: null });
    fechar();
  };
  const criarSub = (nome: string) => {
    const ja = subs.find((x) => semAcentos(x.nome) === semAcentos(nome));
    if (ja?.inativo) { setErroNovo(DESATIVADA); return; }
    onChange(ja ? { ...ramo, sub: ja.id, subNova: null } : { ...ramo, sub: "", subNova: nome });
    fechar();
  };
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rot="Categoria" dica={ramo.catNova ? DICA_NOVA : undefined}>{(id) => (
          <ComboPesquisa id={id} rotulo="Categoria" itens={cats} atual={catAtual} semValor="Sem categoria" textoNova="Nova categoria…" registar={fCat.registar}
            onEscolher={(i) => onChange({ cat: i.id, sub: "", catNova: null, subNova: null })} onNova={(t) => setNovo({ t: "cat", nome: t })} />
        )}</Campo>
        <Campo rot="Subcategoria" dica={!temCat ? "Escolha primeiro a categoria." : ramo.subNova ? DICA_NOVA : undefined}>{(id) => (
          <ComboPesquisa id={id} rotulo="Subcategoria" itens={subs} atual={subAtual} desativado={!temCat} semValor="Sem subcategoria" textoNova="Nova subcategoria…" registar={fSub.registar}
            onEscolher={(i) => onChange({ ...ramo, sub: i.id, subNova: null })} onNova={catInativa ? undefined : (t) => setNovo({ t: "sub", nome: t })} />
        )}</Campo>
      </div>
      {novo?.t === "cat" && <NovoNome rotulo="Nova categoria" rotuloCampo="Nome da nova categoria" inicial={novo.nome} erro={erroNovo} onCriar={criarCat} onCancelar={fechar} />}
      {novo?.t === "sub" && <NovoNome rotulo="Nova subcategoria" rotuloCampo="Nome da nova subcategoria" inicial={novo.nome} erro={erroNovo} onCriar={criarSub} onCancelar={fechar} />}
    </>
  );
}

/* ------------------------------------------------------------------ a ficha */
/** Na ficha (secção «Classificação»): grava direto por cat_guardar_produto_tabelas e relê o Catálogo. Sem products.edit só se lê. */
export function ClassificacaoFicha({ p, arvore, marcas, real, anunciar }: {
  p: { id: string; n: string; un: string; marca: string; no: string | null }; arvore: readonly No[]; marcas: readonly string[]; real: FichaProdutoReal; anunciar: (msg: string) => void;
}) {
  const atuais = useMemo(() => nomesDoRamo(arvore, p.no), [arvore, p.no]);
  const [marca, setMarca] = useState(p.marca);
  const [ramo, setRamo] = useState<RamoEscolhido>(() => ramoInicial(arvore, p.no));
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const estado = useRef<HTMLParagraphElement>(null), ocupado = useRef(false);
  const rz = useId();
  // o Catálogo relê depois de gravar e o produto muda: o que se vê acompanha-o (sem remontar, para o estado e o foco ficarem)
  useEffect(() => { setMarca(p.marca); setRamo(ramoInicial(arvore, p.no)); }, [p.id, p.marca, p.no]); // eslint-disable-line react-hooks/exhaustive-deps
  // depois de guardar, o foco vai para o estado (o botão não desaparece, mas o resultado ouve-se logo)
  useEffect(() => { if (aviso) estado.current?.focus(); }, [aviso]);
  if (!real.podeEditar) {
    const linha = (rot: string, v: string | null, sem: string) => <li>{rot}: {v ? <span className="font-medium">{v}</span> : <span className="text-muted-foreground">{sem}</span>}</li>;
    return (
      <ul className="mt-3 grid gap-1.5 text-[15px]">
        {linha("Marca", p.marca.trim() || null, "sem marca")}
        {linha("Categoria", atuais.categoria, "sem categoria")}
        {linha("Subcategoria", atuais.subcategoria, "sem subcategoria")}
      </ul>
    );
  }
  const nomeDe = (id: string) => arvore.find((x) => x.id === id)?.n ?? null;
  const categoria = ramo.catNova ?? nomeDe(ramo.cat);
  const subcategoria = categoria ? ramo.subNova ?? nomeDe(ramo.sub) : null;
  const mudou = juntar(marca) !== juntar(p.marca) || categoria !== atuais.categoria || subcategoria !== atuais.subcategoria;
  const gravar = async () => {
    if (ocupado.current) return; // guarda de reentrada (um segundo toque antes de o estado mudar)
    ocupado.current = true;
    setAGravar(true); setErro(null); setAviso("");
    try {
      const r = await gravarClassificacao(real.org, p.id, { marca: juntar(marca) || null, unidade: p.un, categoria, subcategoria });
      // relê SEMPRE, também em falha: o ecrã não pode ficar a mentir
      try { await real.recarregar(); } catch { /* fica o que está */ }
      if (!r.ok) { setErro(r.erro); return; }
      anunciar(`Classificação de ${p.n} guardada.`);
      setAviso("Classificação guardada.");
    } finally { ocupado.current = false; setAGravar(false); }
  };
  // nada de disabled: o botão perderia o foco a gravar; aria-disabled, razão ligada e clique sem efeito
  const razao = aGravar ? "A guardar a classificação…" : !mudou ? "Mude a marca, a categoria ou a subcategoria para guardar." : null;
  return (
    <div className="mt-4 grid gap-4">
      <CampoMarca marcas={marcas} marca={marca} original={p.marca} onChange={(m) => { setMarca(m); setErro(null); }} />
      <CamposRamo arvore={arvore} ramo={ramo} onChange={(r) => { setRamo(r); setErro(null); }} />
      <div>
        <Button className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-disabled={razao ? true : undefined} aria-describedby={razao ? rz : undefined} onClick={razao ? undefined : () => void gravar()}>
          {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Guardar classificação
        </Button>
      </div>
      {razao && <p id={rz} className={cn(NOTA, "-mt-2", (aGravar || erro) && "sr-only")}>{razao}</p>}
      <p ref={estado} role="status" tabIndex={-1} className={cn("outline-none", aviso ? cn(NOTA, "-mt-2") : "sr-only")}>{aviso}</p>
      {erro && <p className="text-[15px] text-destructive" role="alert">{erro}</p>}
    </div>
  );
}
