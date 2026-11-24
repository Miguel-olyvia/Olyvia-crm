// 23/11: a pré-visualização 3D de um produto do catálogo (só para ver): o modelo que o classificador do catálogo 3D dá ao produto, numa divisão mínima.
// O three só se carrega (React.lazy) quando este componente monta, ou seja, quando alguém pede «Ver em 3D». Se qualquer coisa falhar (sem WebGL, um modelo que
// não abre, a própria conta do modelo), fica um texto com «Tentar outra vez» em vez do formulário partido.
import { Component, Suspense, lazy, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { ComandosVista } from "./planta3d/Visualizador3D";
import { cenaDoProduto, estadoDoModelo, modeloParaPrevia, type EstadoPrevia, type MedidaCm } from "./planta3d/previaProduto3d";
import type { NoCat } from "./planta3d/catalogo3d";
import type { TexturaModelo } from "./planta3d/texturaProduto";

const carregarVisualizador = () => import("./planta3d/Visualizador3D");
let Visualizador3D = lazy(carregarVisualizador);
/** Um `lazy` cuja carga falhou fica a falhar em cache para sempre: depois de um erro faz-se um novo, para fechar e abrir (ou «Tentar outra vez») voltarem a tentar. */
const renovarVisualizador = () => { Visualizador3D = lazy(carregarVisualizador); };

const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 1 });
const NOTA = "text-[15px] text-muted-foreground";
const SEM_ESCOLHA = () => {};
const MSG_FALHA = "Não foi possível mostrar o 3D neste dispositivo";

/** O aviso de cada estado: só a caixa e o desenho aproximado levam um (com o genérico e o modelo do HTML não há nada a avisar). */
const AVISO: Partial<Record<EstadoPrevia, string>> = {
  caixa: "Sem modelo 3D parecido: aparece uma caixa com as medidas.",
  aproximado: "Ainda não há um 3D igual a este produto: é um desenho aproximado do tipo de produto, com as medidas.",
};

/** Uma mensagem de estado para o leitor de ecrã: o parágrafo `role="status"` monta vazio e só depois recebe o texto (uma região viva que já nasce cheia não se anuncia). */
function Estado({ texto, className = NOTA }: { texto: string; className?: string }) {
  const [t, setT] = useState("");
  useEffect(() => { setT(texto); }, [texto]);
  return <p role="status" className={className}>{t}</p>;
}

/** Se qualquer coisa do 3D falhar, fica a alternativa em vez de partir o formulário. `onErro`: quem quer saber (para renovar o que ficou em cache a falhar). */
class Falha3D extends Component<{ alternativa: ReactNode; onErro?: () => void; children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  componentDidCatch(e: unknown) { console.warn("[catálogo] o 3D do produto falhou:", e); this.props.onErro?.(); }
  render() { return this.state.erro ? this.props.alternativa : this.props.children; }
}

export interface Previa3DProdutoProps {
  nome: string; sub?: string | null; no: string | null; arvore: readonly NoCat[];
  /** A medida dos atributos (cm); o que ela não diz vem do nome ou das omissões do tipo. */
  medida?: MedidaCm | null;
  /** A cor (hex) do atributo Cor. */
  cor?: string;
  /** A foto da opção de cor (URL público): vira a textura do corpo da peça; se a imagem falhar, fica a cor. */
  textura?: TexturaModelo;
  /** O «Modelo 3D» escolhido no próprio produto (a subcategoria e a categoria vêm da árvore): manda sobre o classificador. */
  modelo3d?: string | null;
}
/** O aviso de um revestimento escolhido: ainda não tem desenho próprio, cai na caixa com as medidas (a textura vem da foto da cor). */
const AVISO_REVESTIMENTO = "Os revestimentos ainda não têm desenho próprio: aparece uma caixa com as medidas.";

const BOTAO_ZOOM = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-input bg-card/95 text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
const MAIS = new Set(["+", "="]), MENOS = new Set(["-", "_"]);

/** A ajuda por baixo do 3D: a roda do rato só faz zoom depois de se clicar no 3D (senão a página rola); com o foco, as teclas + e − também. */
function textoDeAjuda(foco: boolean, dentro: boolean): string {
  if (!foco) return "Clique no 3D para usar a roda do rato.";
  return dentro ? "Roda do rato, ou as teclas + e −, para aproximar e afastar." : "Teclas + e − para aproximar e afastar.";
}

/** O 3D: a conta do modelo e da cena, o aviso e o visualizador (lazy). Corre dentro do Falha3D, por isso uma excepção aqui também fica na alternativa. */
function Corpo({ nome, sub, no, arvore, medida, cor, textura, modelo3d }: Previa3DProdutoProps) {
  // o zoom: botões (sempre), pinça (toque), e roda do rato e teclas + e − só com o 3D focado (e a roda só com o rato lá dentro), para a página continuar a rolar
  const comandos = useRef<ComandosVista | null>(null), idAjuda = useId();
  const [foco, setFoco] = useState(false), [dentro, setDentro] = useState(false);
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (MAIS.has(e.key)) { e.preventDefault(); comandos.current?.aproximar(); }
    else if (MENOS.has(e.key)) { e.preventDefault(); comandos.current?.afastar(); }
  };
  const modelo = useMemo(() => modeloParaPrevia({ nome, sub: sub ?? undefined, no, arvore, medida, cor, textura, modelo3d }), [nome, sub, no, arvore, medida, cor, textura, modelo3d]);
  const cena = useMemo(() => cenaDoProduto(modelo), [modelo]);
  // a caixa escolhida à mão não leva o aviso de «sem modelo parecido»; os revestimentos dizem que ainda não têm desenho
  const escolhido = modelo.escolha?.modelo;
  const aviso = escolhido?.startsWith("revestimento_") ? AVISO_REVESTIMENTO : escolhido === "caixa" ? undefined : AVISO[estadoDoModelo(modelo)];
  const d = modelo.dimensoes;
  const descricao = `${modelo.nome || "Produto sem nome"}: ${nf(d.larguraCm)} por ${nf(d.profundidadeCm)} por ${nf(d.alturaCm)} cm (largura, profundidade e altura).`;
  return (
    <div className="grid gap-2">
      <div className="relative h-64 overflow-hidden rounded-xl border border-border bg-muted/50 sm:h-80">
        <div role="group" aria-label="Pré-visualização 3D do produto" aria-describedby={idAjuda} tabIndex={0} onKeyDown={aoTeclar}
          onFocus={() => setFoco(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFoco(false); }}
          onPointerEnter={() => setDentro(true)} onPointerLeave={() => setDentro(false)} onPointerDown={(e) => { setDentro(true); e.currentTarget.focus(); }}
          className="h-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40">
          <Suspense fallback={<div className="grid h-full place-items-center"><Estado texto="A carregar o 3D…" /></div>}>
            <Visualizador3D espaco={cena.espaco} modelos={cena.modelos} vista="3d" teto={false} etiquetas={false} descricao={descricao}
              selecionada={null} onSelecionar={SEM_ESCOLHA} camara={cena.camara} rolarPagina zoomRoda={foco && dentro} comandos={comandos} />
          </Suspense>
        </div>
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button type="button" aria-label="Afastar" title="Afastar" onClick={() => comandos.current?.afastar()} className={BOTAO_ZOOM}><Minus className="h-5 w-5" aria-hidden="true" /></button>
          <button type="button" aria-label="Aproximar" title="Aproximar" onClick={() => comandos.current?.aproximar()} className={BOTAO_ZOOM}><Plus className="h-5 w-5" aria-hidden="true" /></button>
          <button type="button" aria-label="Repor vista" title="Repor vista" onClick={() => comandos.current?.repor()} className={BOTAO_ZOOM}><RotateCcw className="h-5 w-5" aria-hidden="true" /></button>
        </div>
      </div>
      <p id={idAjuda} className={NOTA}>{textoDeAjuda(foco, dentro)}</p>
      {aviso && <Estado texto={aviso} />}
    </div>
  );
}

export function Previa3DProduto(props: Previa3DProdutoProps) {
  const [tentativa, setTentativa] = useState(0);
  const alternativa = (
    <div className="grid h-64 place-items-center content-center gap-2 rounded-xl border border-border bg-muted/50 p-4 text-center sm:h-80">
      <Estado texto={MSG_FALHA} />
      <button type="button" onClick={() => setTentativa((n) => n + 1)}
        className="inline-flex min-h-11 items-center rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25">
        Tentar outra vez
      </button>
    </div>
  );
  return <Falha3D key={tentativa} onErro={renovarVisualizador} alternativa={alternativa}><Corpo {...props} /></Falha3D>;
}
