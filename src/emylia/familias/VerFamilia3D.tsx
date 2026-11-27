// 26/11: a vista da família com 3D (/catalogo/produtos/familias/:id). O 3D grande (Previa3DProduto, o MESMO da ficha, com a altura nova), as escolhas (bolinhas de cor e botões,
// só com valores que existem na família), o produto real que corresponde à escolha, as outras medidas do mesmo modelo de catálogo e a escolha no endereço (?cor=&textura=).
// Uma combinação que não existe nunca se mostra: ao escolher um valor cuja combinação com o resto não existe, passa-se ao produto existente mais próximo e avisa-se numa linha.
// Só lê (não escreve nada) e não leva custo nenhum. A textura escolhe o produto; quando a opção tem foto, o 3D aplica-a ao corpo tingida pela cor.
// Teclado e leitor de ecrã: o cartão do produto vem antes de «Outras medidas» na ordem do DOM (no telemóvel fica preso ao fundo por `order`); o aviso de troca anuncia-se
// numa região viva que nasce vazia; ao chegar de uma mudança de medida (`focarTitulo`) o foco vai para o título; o separador diz «<família> · Famílias».
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { CAMINHO_FAMILIAS } from "../catalogoRotas";
import { Previa3DProduto } from "../Previa3DProduto";
import { useGlbDoProduto } from "../glbDoProduto";
import type { NoCat } from "../planta3d/catalogo3d";
import { CartaoProdutoFamilia } from "./CartaoProdutoFamilia";
import {
  eixosEscolhiveis, escolhaInicial, escolherValor, fraseDoAviso, nomeParaMostrar, opcoesDoEixo, parametrosDaEscolha, pedidoDosParametros, produtoDaEscolha, tipoDoEixo,
  type Escolha, type EixoVista, type FamiliaVista, type ProdutoVista, type ResultadoEscolha,
} from "./escolhaVariacao";
import { OutrasMedidas } from "./OutrasMedidas";
import { noDoProduto, previaDoProduto } from "./previaDoProduto";
import { SeletorBotoes, SeletorCor } from "./SeletoresVariacao";

/** O 3D grande: 45% da altura do ecrã no telemóvel (com um mínimo), e mais alto ao lado das escolhas. A omissão da ficha (h-64 sm:h-80) fica como está. */
const ALTURA_3D = "h-[45vh] min-h-64 lg:h-[min(34rem,70vh)]";
const CODIGO_TEXTURA = "textura";

export interface VerFamilia3DProps {
  familia: FamiliaVista;
  /** A árvore de categorias leve (a mesma da ficha): sem ela um revestimento cairia na caixa. null: ainda a ler (o 3D diz «A preparar o 3D…», as escolhas já se usam). */
  arvore: readonly NoCat[] | null;
  /** Os nós de categoria de produto com o id da base (`origem`), para achar o nó do produto. */
  categoriasProduto: readonly { id: string; origem?: string }[];
  /** Verdade quando se chegou de uma mudança de medida ou de «Tentar de novo»: o botão ou a ligação que tinham o foco desapareceram, por isso o foco vai para o título. */
  focarTitulo?: boolean;
  /** 27/11: a organização, para o 3D procurar o GLB próprio do Modelo, da subcategoria ou da categoria do produto (glbDoProduto.ts). Sem ela, o 3D é o de sempre. */
  org?: string | null;
}
const SEM_ARVORE: readonly NoCat[] = [];

/** Uma região viva que nasce vazia e só depois recebe o texto: assim o leitor de ecrã anuncia também o aviso que já existe ao abrir (a mesma técnica do Previa3DProduto). */
function RegiaoViva({ texto, className }: { texto: string; className: string }) {
  const [lido, setLido] = useState("");
  useEffect(() => { setLido(texto); }, [texto]);
  return <p role="status" className={className}>{lido}</p>;
}

/** A escolha como texto: os nomes dos valores do produto, pela ordem dos eixos, separados por « · » (Antracita · Liso). */
function etiquetaDa(p: ProdutoVista, eixos: readonly EixoVista[], produtos: readonly ProdutoVista[]): string {
  return eixos.map((e) => nomeParaMostrar(p.valores[e.atributoId]?.nome ?? "", tipoDoEixo(e, produtos) === "cor")).filter(Boolean).join(" · ");
}

function Vista({ familia, arvore, categoriasProduto, org }: VerFamilia3DProps) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { produtos } = familia;
  const eixos = useMemo(() => eixosEscolhiveis(familia.eixos, produtos), [familia.eixos, produtos]);
  const [estado, setEstado] = useState<ResultadoEscolha>(() => escolhaInicial(produtos, eixos, pedidoDosParametros(params, eixos)));
  const [anuncio, setAnuncio] = useState("");
  const produto = useMemo(() => produtoDaEscolha(produtos, estado.escolha), [produtos, estado.escolha]);
  const previa = useMemo(() => (produto ? previaDoProduto(produto, eixos, produtos) : null), [produto, eixos, produtos]);
  const glb = useGlbDoProduto({ org, modeloId: produto?.modeloId ?? null, no: produto ? noDoProduto(produto, categoriasProduto) : null, arvore: arvore ?? SEM_ARVORE });
  const opcoes = useMemo(() => new Map(eixos.map((e) => [e.atributoId, opcoesDoEixo(produtos, e.atributoId)] as const)), [eixos, produtos]);

  const escolher = (atributoId: string, valor: string) => {
    const r = escolherValor(produtos, eixos, estado.escolha, atributoId, valor);
    setEstado(r);
    const p = produtoDaEscolha(produtos, r.escolha);
    const escolha = p ? etiquetaDa(p, eixos, produtos) : "";
    setAnuncio(!p ? "" : p.pvp !== null ? t("catFamiliaVer.anuncioPreco", { escolha, sku: p.sku, preco: p.pvp.toLocaleString("pt-PT", { style: "currency", currency: "EUR" }) }) : t("catFamiliaVer.anuncio", { escolha, sku: p.sku }));
    setParams(parametrosDaEscolha(r.escolha, eixos), { replace: true });
  };

  const parametros = parametrosDaEscolha(estado.escolha, eixos);
  const medida = produto?.medida?.texto ?? null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
      <div className="relative min-w-0 lg:col-start-1 lg:row-span-3 lg:row-start-1">
        {arvore === null && (
          <div className={cn("grid place-items-center rounded-xl border border-border bg-muted/50", ALTURA_3D)}>
            <p role="status" className="text-[15px] text-muted-foreground">{t("catFamiliaVer.cena.preparar")}</p>
          </div>
        )}
        {arvore !== null && produto && previa && (
          <>
            <Previa3DProduto nome={produto.nome} sub={produto.subcategoria} no={noDoProduto(produto, categoriasProduto)} arvore={arvore} medida={previa.medida} cor={previa.cor}
              textura={previa.textura} medidaRevestimento={previa.medidaRevestimento} aplicacao={previa.aplicacao} alturaClasse={ALTURA_3D} glbProprio={glb?.url ?? null} />
            {/* a escolha atual por cima do 3D, por baixo do interruptor das medidas (decorativa: o leitor de ecrã ouve o anúncio e o cartão) */}
            <p data-testid="etiqueta-escolha" aria-hidden="true" className="pointer-events-none absolute left-2 top-14 max-w-[calc(100%-1rem)] rounded-md bg-card/95 px-2.5 py-1 text-[15px] font-medium text-foreground shadow-sm">
              {etiquetaDa(produto, eixos, produtos)}
            </p>
          </>
        )}
      </div>

      <div className="grid min-w-0 gap-5 lg:col-start-2 lg:row-start-1">
        {eixos.map((e) => {
          const tipo = tipoDoEixo(e, produtos), ops = opcoes.get(e.atributoId) ?? [], valor = estado.escolha[e.atributoId] ?? "";
          if (ops.length === 0) return null;
          return tipo === "cor"
            ? <SeletorCor key={e.atributoId} rotulo={e.rotulo} opcoes={ops} valor={valor} aoEscolher={(v) => escolher(e.atributoId, v)} />
            : <SeletorBotoes key={e.atributoId} rotulo={e.rotulo} opcoes={ops} valor={valor} aoEscolher={(v) => escolher(e.atributoId, v)}
                nota={e.code.toLowerCase() === CODIGO_TEXTURA ? t("catFamiliaVer.texturaNota") : undefined} />;
        })}
        {/* regiões vivas: existem sempre (vazias) e só o texto muda, para a mudança se anunciar */}
        <RegiaoViva texto={estado.aviso ? fraseDoAviso(estado.aviso, t) : ""} className="text-[15px] font-medium text-foreground" />
        <p role="status" className="sr-only">{anuncio}</p>
        {medida && <p className="text-[15px]">{t("catFamiliaVer.medida.desta", { medida })}</p>}
      </div>

      {/* o cartão vem a seguir às escolhas no DOM (teclado e leitor de ecrã chegam ao preço sem passar pelas medidas); no telemóvel `order-last` põe-no ao fim e preso ao fundo
          do ecrã, para estar sempre à vista (os controlos têm `scroll-mb` para ele não os tapar); ao lado das escolhas segue o fluxo. `key`: o estado «copiada» não passa ao produto seguinte. */}
      <div className="max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:order-last max-lg:-mx-4 max-lg:border-t max-lg:border-border max-lg:bg-background max-lg:px-4 max-lg:py-3 lg:col-start-2 lg:row-start-2">
        <CartaoProdutoFamilia key={produto?.id ?? "sem-produto"} produto={produto} />
      </div>

      <div className="min-w-0 lg:col-start-2 lg:row-start-3">
        <OutrasMedidas outras={familia.outrasMedidas} parametros={parametros} modelo={produto?.modelo ?? produtos.find((p) => p.modelo)?.modelo ?? null} />
      </div>
    </div>
  );
}

export function VerFamilia3D(props: VerFamilia3DProps) {
  const { t } = useTranslation();
  const { familia, focarTitulo = false } = props, n = familia.produtos.length;
  const titulo = useRef<HTMLHeadingElement>(null);
  const rotuloLista = t("catFamiliaVer.voltar");
  useEffect(() => { if (focarTitulo) titulo.current?.focus(); }, [focarTitulo]);
  useEffect(() => {
    const antes = document.title;
    document.title = `${familia.nome} · ${rotuloLista}`;
    return () => { document.title = antes; };
  }, [familia.nome, rotuloLista]);
  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <Link to={CAMINHO_FAMILIAS} className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-lg text-[15px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />{t("catFamiliaVer.voltar")}
        </Link>
        <h1 ref={titulo} tabIndex={-1} className="break-words text-2xl font-semibold tracking-tight">{familia.nome}</h1>
        <p className="text-[15px] text-muted-foreground">{t(n === 1 ? "catFamiliaVer.produtos.one" : "catFamiliaVer.produtos.other", { count: n })}</p>
      </header>
      {n === 0 ? <p role="status" className="text-[15px] text-muted-foreground">{t("catFamiliaVer.vazia")}</p> : <Vista {...props} />}
    </div>
  );
}

export type { Escolha };
