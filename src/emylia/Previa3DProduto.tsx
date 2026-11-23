// 23/11: a pré-visualização 3D de um produto do catálogo (só para ver): o modelo que o classificador do catálogo 3D dá ao produto, numa divisão mínima.
// O three só se carrega (React.lazy) quando este componente monta, ou seja, quando alguém pede «Ver em 3D»; se falhar (sem WebGL, um modelo que não
// abre), fica um texto em vez do ecrã partido.
import { Component, Suspense, lazy, useMemo, type ReactNode } from "react";
import { cenaDoProduto, estadoDoModelo, modeloParaPrevia, type EstadoPrevia, type MedidasParciais } from "./planta3d/previaProduto3d";
import type { NoCat } from "./planta3d/catalogo3d";

const Visualizador3D = lazy(() => import("./planta3d/Visualizador3D"));

const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 1 });
const NOTA = "text-[15px] text-muted-foreground";
const SEM_ESCOLHA = () => {};

/** O aviso de cada estado: só a caixa e o desenho aproximado levam um (com o genérico e o modelo do HTML não há nada a avisar). */
const AVISO: Partial<Record<EstadoPrevia, string>> = {
  caixa: "Sem modelo 3D parecido: aparece uma caixa com as medidas.",
  aproximado: "Ainda não há um 3D igual a este produto: é um desenho aproximado do tipo de produto, com as medidas.",
};

/** Se o 3D falhar (sem WebGL, um modelo que não abre), fica o texto alternativo em vez de partir o formulário. */
class Falha3D extends Component<{ alternativa: ReactNode; children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  componentDidCatch(e: unknown) { console.warn("[catálogo] o 3D do produto falhou:", e); }
  render() { return this.state.erro ? this.props.alternativa : this.props.children; }
}

export interface Previa3DProdutoProps {
  nome: string; sub?: string | null; no: string | null; arvore: readonly NoCat[];
  /** As medidas dos atributos (cm); o que faltar vem do nome ou das omissões do tipo. */
  medidas?: MedidasParciais | null;
  /** A cor (hex) do atributo Cor. */
  cor?: string;
}

export function Previa3DProduto({ nome, sub, no, arvore, medidas, cor }: Previa3DProdutoProps) {
  const modelo = useMemo(() => modeloParaPrevia({ nome, sub: sub ?? undefined, no, arvore, medidas, cor }), [nome, sub, no, arvore, medidas, cor]);
  const cena = useMemo(() => cenaDoProduto(modelo), [modelo]);
  const aviso = AVISO[estadoDoModelo(modelo)];
  const d = modelo.dimensoes;
  const descricao = `${modelo.nome || "Produto sem nome"}: ${nf(d.larguraCm)} por ${nf(d.profundidadeCm)} por ${nf(d.alturaCm)} cm (largura, profundidade e altura).`;
  const alternativa = <p role="status" className={NOTA}>Não foi possível mostrar o 3D neste dispositivo</p>;
  return (
    <div className="grid gap-2">
      <div className="h-64 overflow-hidden rounded-xl border border-border bg-muted/50 sm:h-80">
        <Falha3D alternativa={<div className="grid h-full place-items-center p-4 text-center">{alternativa}</div>}>
          <Suspense fallback={<div className="grid h-full place-items-center"><p role="status" className={NOTA}>A carregar o 3D…</p></div>}>
            <Visualizador3D espaco={cena.espaco} modelos={cena.modelos} vista="3d" teto={false} etiquetas={false} descricao={descricao}
              selecionada={null} onSelecionar={SEM_ESCOLHA} camara={cena.camara} />
          </Suspense>
        </Falha3D>
      </div>
      {aviso && <p role="status" className={NOTA}>{aviso}</p>}
    </div>
  );
}
