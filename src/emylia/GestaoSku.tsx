// 16/11: o separador «Referência (SKU)» da Gestão do Catálogo (ao lado de «Atributos»): a ordem dos atributos na referência (OrdemSku) e, por cima,
// a escolha de uma categoria, uma subcategoria e um MODELO de exemplo (as três estão sempre presas à referência): a pré-visualização usa as siglas reais
// e o número do modelo escolhido (o NNNN; sem chamar a base). Só o que este separador precisa é lido: os atributos (cat_ler_atributos_gestao), as
// categorias com a sigla (cat_ler_categorias_gestao) e os modelos (cat_ler_modelos_gestao). Só com products.edit se grava.
import { useEffect,useMemo, useRef, useState } from "react";
import { ComboPesquisa, type ItemCombo } from "./ComboPesquisa";
import { NOTA, Campo } from "./pecasForm";
import { lerAtributosGestao } from "./atributosGestao";
import { lerCategoriasGestao, type CategoriaGestao } from "./categoriasMarcasGestao";
import { guardarSkuConfig, type ItemSku } from "./skuDados";
import { lerModelosGestao, rotuloModelo, type ModeloGestao } from "./modelosDados";
import { AINDA_NAO } from "./fichaProdutoDados";
import { EstadoLeitura, useGestaoLista } from "./gestaoPecas";
import { OrdemSku } from "./OrdemSku";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const SEM_PERMISSAO = "Não tem permissão para ver os atributos.";

export function GestaoSku({ real, anunciar, irPara }: { real: FichaProdutoReal; anunciar: (msg: string) => void; irPara: (separador: "categorias" | "subcategorias") => void }) {
  const { org, podeEditar } = real;
  const o = useGestaoLista(real, lerAtributosGestao, anunciar, SEM_PERMISSAO);
  const { lista, aGravar, msg, correr } = o;

  // as categorias (com a sigla) para o exemplo; lê-se à parte porque só serve a escolha do exemplo
  const [cats, setCats] = useState<CategoriaGestao[] | null>(null);
  const [erroCats, setErroCats] = useState<string | null>(null);
  const orgAtual = useRef(org);
  orgAtual.current = org;
  useEffect(() => {
    setCats(null); setErroCats(null);
    const deste = org;
    void lerCategoriasGestao(org).then((r) => {
      if (orgAtual.current !== deste) return;
      if (r.ok) setCats(r.v); else setErroCats(r.codigo === "CT001" ? "Não tem permissão para ver as categorias." : r.erro);
    });
  }, [org]);

  // os modelos (o número deles é o NNNN); lê-se à parte e sem permissão ou sem a função na base o campo fica desativado
  const [modelos, setModelos] = useState<ModeloGestao[] | null>(null);
  const [erroModelos, setErroModelos] = useState<string | null>(null);
  useEffect(() => {
    setModelos(null); setErroModelos(null);
    const deste = org;
    void lerModelosGestao(org).then((r) => {
      if (orgAtual.current !== deste) return;
      if (r.ok) setModelos(r.v); else setErroModelos(r.codigo === "CT001" ? "Não tem permissão para ver os modelos." : r.erro);
    });
  }, [org]);

  const [catId, setCatId] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const cat = useMemo(() => cats?.find((c) => c.id === catId) ?? null, [cats, catId]);
  const sub = useMemo(() => cat?.subcategorias.find((s) => s.id === subId) ?? null, [cat, subId]);
  const itensCat = useMemo<ItemCombo[]>(() => (cats ?? []).map((c) => ({ id: c.id, nome: c.nome, inativo: !c.ativo })), [cats]);
  const itensSub = useMemo<ItemCombo[]>(() => (cat?.subcategorias ?? []).map((s) => ({ id: s.id, nome: s.nome, inativo: !s.ativo })), [cat]);
  // só os modelos da subcategoria escolhida; um desativado não se escolhe (mostra-se só se for o escolhido)
  const doSub = useMemo(() => (modelos ?? []).filter((m) => !!subId && m.subcategoria.id === subId), [modelos, subId]);
  const modelo = useMemo(() => doSub.find((m) => m.id === modeloId) ?? null, [doSub, modeloId]);
  const itensModelo = useMemo<ItemCombo[]>(() => doSub.map((m) => ({ id: m.id, nome: rotuloModelo(m), inativo: !m.ativo })), [doSub]);

  const gravar = (itens: ItemSku[]) => correr(() => guardarSkuConfig(org, itens), "Ordem da referência guardada.", "sku");

  const escolha = (
    <div className="grid gap-3 sm:grid-cols-3">
      <Campo rot="Categoria" dica="Escolha uma para ver o exemplo com a sigla dela.">{(id) => (
        <ComboPesquisa id={id} rotulo="Categoria" itens={itensCat} atual={cat ? { id: cat.id, nome: cat.nome, inativo: !cat.ativo } : null} semValor="Nenhuma (exemplo geral)"
          desativado={!cats} classeCampo="border-foreground/40" onEscolher={(i) => { setCatId(i.id || null); setSubId(null); setModeloId(null); }} />
      )}</Campo>
      <Campo rot="Subcategoria" dica={cat ? "As subcategorias da categoria escolhida." : "Escolha primeiro a categoria."}>{(id) => (
        <ComboPesquisa id={id} rotulo="Subcategoria" itens={itensSub} atual={sub ? { id: sub.id, nome: sub.nome, inativo: !sub.ativo } : null} semValor="Nenhuma"
          desativado={!cat} classeCampo="border-foreground/40" vazio="Esta categoria não tem subcategorias" onEscolher={(i) => { setSubId(i.id || null); setModeloId(null); }} />
      )}</Campo>
      <Campo rot="Modelo" dica={!modelos ? (erroModelos === AINDA_NAO ? AINDA_NAO : "A ler os modelos…") : sub ? "Os modelos da subcategoria escolhida: o número deles é o da referência." : "Escolha primeiro a subcategoria."}>{(id) => (
        <ComboPesquisa id={id} rotulo="Modelo" itens={itensModelo} atual={modelo ? { id: modelo.id, nome: rotuloModelo(modelo), inativo: !modelo.ativo } : null} semValor="Nenhum"
          desativado={!modelos || !sub} classeCampo="border-foreground/40" vazio="Esta subcategoria não tem modelos" onEscolher={(i) => setModeloId(i.id || null)} />
      )}</Campo>
      {erroCats && <p className="text-[15px] text-red-700 dark:text-red-400 sm:col-span-3" role="alert">{erroCats}</p>}
      {erroModelos && erroModelos !== AINDA_NAO && <p className="text-[15px] text-red-700 dark:text-red-400 sm:col-span-3" role="alert">{erroModelos}</p>}
    </div>
  );

  return (
    <div className="grid gap-5">
      <p className={NOTA}>A referência tem sempre a categoria, a subcategoria e o modelo (o número de 4 dígitos é o do modelo), que não se podem tirar. Aqui só se escolhe a ordem dos atributos que vêm a seguir.</p>
      {lista && !podeEditar && <p role="note" className={`${NOTA} rounded-xl bg-muted/50 p-3`}>Só de leitura: para mudar a ordem precisa da permissão de editar produtos.</p>}
      <EstadoLeitura o={o} lido={!!lista} nomes="a referência" />
      {lista && (
        <OrdemSku atributos={lista} podeEditar={podeEditar} aGravar={aGravar} erro={msg("sku")} onGuardar={gravar} anunciar={anunciar} escolha={escolha}
          base={{ categoria: cat ? { nome: cat.nome, sigla: cat.sigla } : null, subcategoria: sub ? { nome: sub.nome, sigla: sub.sigla } : null, modelo: modelo ? { nome: modelo.nome, numero: modelo.numero } : null, irPara }} />
      )}
    </div>
  );
}
