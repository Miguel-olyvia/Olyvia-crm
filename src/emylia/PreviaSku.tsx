// 16/11: a pré-visualização da referência (SKU) ao criar um produto: «Referência gerada: BC-TO-0001-AZ-…», com «a confirmar ao guardar»
// (o NNNN é o número do MODELO escolhido; sem modelo a referência ainda não existe) e as faltas em texto («Falta a sigla da categoria X»,
// «Escolha o modelo…»). Se a combinação modelo + atributos já é de outro produto, diz-o com a ligação para o abrir. Chama cat_prever_sku_modelo (só leitura)
// ~300 ms depois da última mudança, só na página real. A árvore do Catálogo mistura ids de serviços e de produtos, por isso a categoria
// e a subcategoria resolvem-se pelo NOME na lista da gestão (cat_ler_categorias_gestao), que traz os ids das categorias de produto.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { NOTA } from "./pecasForm";
import { valoresParaGravar } from "./atributosTexto";
import { lerCategoriasGestao, type CategoriaGestao } from "./categoriasMarcasGestao";
import { PREVER_AMBIGUO, descreverFaltas, preverSkuModelo, resolverCategoria, type ResultadoPrever } from "./skuDados";
import { ReferenciaDuplicada } from "./ReferenciaDuplicada";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const ESPERA_MS = 300;
type Estado =
  | { k: "nada" }
  | { k: "a-ler" }
  | { k: "pronto"; r: ResultadoPrever }
  | { k: "erro"; t: string }
  | { k: "ao-guardar" }
  | { k: "ambiguo" };

export interface PreviaSkuProps {
  real?: FichaProdutoReal;
  /** Os nomes escolhidos (null = nenhum). `categoriaNova`: a categoria ou a subcategoria escolhida ainda não existe (cria-se ao guardar). */
  categoria: string | null; subcategoria: string | null; categoriaNova: boolean;
  attrs: readonly AtributoProduto[]; defs?: readonly AtributoDef[];
  /** 16/11: o modelo escolhido (id em product_models; null = nenhum) e se é novo (por criar ao guardar). */
  modeloId?: string | null; modeloNovo?: boolean;
  /** O utilizador escreveu uma referência: essa é a que fica. */
  manual: boolean;
}

export function PreviaSku({ real, categoria, subcategoria, categoriaNova, attrs, defs, manual, modeloId = null, modeloNovo = false }: PreviaSkuProps) {
  const org = real?.org ?? null;
  const [estado, setEstado] = useState<Estado>({ k: "nada" });
  const lista = useRef<{ org: string; cats: CategoriaGestao[] } | null>(null);
  const pedido = useRef(0);
  const valores = JSON.stringify(valoresParaGravar(attrs));
  const pode = !!org && !manual && !!categoria && !categoriaNova && !modeloNovo;

  useEffect(() => {
    const meu = ++pedido.current;
    if (!pode || !org) { setEstado({ k: "nada" }); return undefined; }
    setEstado({ k: "a-ler" });
    const t = window.setTimeout(async () => {
      const vale = () => pedido.current === meu;
      let cats = lista.current?.org === org ? lista.current.cats : null;
      if (!cats) {
        const l = await lerCategoriasGestao(org);
        if (!vale()) return;
        if (!l.ok) { setEstado({ k: "erro", t: l.erro }); return; }
        cats = l.v;
        lista.current = { org, cats };
      }
      const ids = resolverCategoria(cats, categoria!, subcategoria);
      // não existe na base com este nome (a criar ao guardar): não há o que prever; com o nome repetido não se adivinha
      if (ids.k === "nao-existe") { setEstado({ k: "ao-guardar" }); return; }
      if (ids.k === "ambiguo") { setEstado({ k: "ambiguo" }); return; }
      const r = await preverSkuModelo(org, ids.categoria, ids.subcategoria, modeloId, JSON.parse(valores) as unknown[]);
      if (!vale()) return;
      setEstado(r.ok ? { k: "pronto", r: r.v } : { k: "erro", t: r.erro });
    }, ESPERA_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- é um contador, não um nó do DOM
    return () => { window.clearTimeout(t); pedido.current++; }; // ao desmontar ou mudar, o pedido em curso deixa de valer
  }, [pode, org, categoria, subcategoria, valores, modeloId]);

  if (!real) return null;
  const nomes = { categoria, subcategoria, atributos: Object.fromEntries((defs ?? []).map((d) => [d.codigo, d.nome])) };
  let corpo: string | null = null, faltas: string[] = [], quando = false, outro: string | null = null;
  if (manual) corpo = "Fica a referência que escreveu.";
  else if (!categoria) corpo = "Escolha a categoria para ver a referência que se gera.";
  else if (categoriaNova || estado.k === "ao-guardar") corpo = "A categoria ou subcategoria é nova: a referência gera-se ao guardar.";
  else if (modeloNovo) corpo = "O modelo é novo: a referência gera-se ao guardar.";
  else if (estado.k === "ambiguo") corpo = PREVER_AMBIGUO;
  else if (estado.k === "a-ler") corpo = "A calcular a referência…";
  else if (estado.k === "erro") corpo = estado.t;
  else if (estado.k === "pronto") {
    const { sku, faltas: f } = estado.r;
    const duplicado = f.includes("duplicado");
    faltas = descreverFaltas(f.filter((x) => x !== "duplicado"), nomes);
    // as faltas informativas (sigla/medida) deixam o fim por escrever; «duplicado» e «modelo» não são do fim: a referência não se gera
    const parcial = f.some((x) => x.startsWith("sigla:") || x.startsWith("medida:"));
    corpo = sku && !duplicado ? `Referência gerada: ${sku}${parcial ? "-…" : ""}` : "Referência gerada: ainda não";
    quando = !!sku && !duplicado;
    if (duplicado) outro = estado.r.outroProduto ?? "";
  }
  // a região está sempre montada (quem ouve ouve a mudança) e só diz o que muda
  return (
    <div role="status" aria-live="polite" className={cn("rounded-xl bg-muted/50 p-3", NOTA)}>
      {corpo && <p className={cn(estado.k === "pronto" && !manual && "font-medium text-foreground")}>{corpo}{quando && <span className="font-normal text-muted-foreground"> · a confirmar ao guardar</span>}</p>}
      {(faltas.length > 0 || outro !== null) && (
        <ul className="mt-1 list-disc pl-5">
          {faltas.map((f) => <li key={f}>{f}</li>)}
          {outro !== null && <li><ReferenciaDuplicada outro={outro} /></li>}
        </ul>
      )}
    </div>
  );
}
