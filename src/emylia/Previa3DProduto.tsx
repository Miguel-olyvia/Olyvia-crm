// 23/11: a pré-visualização 3D de um produto do catálogo (só para ver): o modelo que o classificador do catálogo 3D dá ao produto, numa divisão mínima.
// O three só se carrega (React.lazy) quando este componente monta, ou seja, quando alguém pede «Ver em 3D». Se qualquer coisa falhar (sem WebGL, um modelo que
// não abre, a própria conta do modelo), fica um texto com «Tentar outra vez» em vez do formulário partido.
import { Component, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { cenaDoProduto, estadoDoModelo, modeloParaPrevia, type EstadoPrevia, type MedidaCm } from "./planta3d/previaProduto3d";
import type { NoCat } from "./planta3d/catalogo3d";

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
}

/** O 3D: a conta do modelo e da cena, o aviso e o visualizador (lazy). Corre dentro do Falha3D, por isso uma excepção aqui também fica na alternativa. */
function Corpo({ nome, sub, no, arvore, medida, cor }: Previa3DProdutoProps) {
  const modelo = useMemo(() => modeloParaPrevia({ nome, sub: sub ?? undefined, no, arvore, medida, cor }), [nome, sub, no, arvore, medida, cor]);
  const cena = useMemo(() => cenaDoProduto(modelo), [modelo]);
  const aviso = AVISO[estadoDoModelo(modelo)];
  const d = modelo.dimensoes;
  const descricao = `${modelo.nome || "Produto sem nome"}: ${nf(d.larguraCm)} por ${nf(d.profundidadeCm)} por ${nf(d.alturaCm)} cm (largura, profundidade e altura).`;
  return (
    <div className="grid gap-2">
      <div className="h-64 overflow-hidden rounded-xl border border-border bg-muted/50 sm:h-80">
        <Suspense fallback={<div className="grid h-full place-items-center"><Estado texto="A carregar o 3D…" /></div>}>
          <Visualizador3D espaco={cena.espaco} modelos={cena.modelos} vista="3d" teto={false} etiquetas={false} descricao={descricao}
            selecionada={null} onSelecionar={SEM_ESCOLHA} camara={cena.camara} rolarPagina />
        </Suspense>
      </div>
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
