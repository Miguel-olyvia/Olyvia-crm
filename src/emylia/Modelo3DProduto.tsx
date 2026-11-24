// 23/11: o corpo da secção «Modelo 3D» do formulário de produto (criar e ficha): uma frase, o botão «Ver em 3D» e, só depois de aberto, a pré-visualização.
// Começa fechado: o canvas e o three só arrancam ao clicar, e fechar desmonta o canvas (um só de cada vez). O título da secção é de quem o usa.
import { useId, useMemo, useState } from "react";
import { Box } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { Previa3DProduto } from "./Previa3DProduto";
import { urlDaFotoOpcao } from "./fotoOpcaoUrl";
import { corDosAtributos, fotoDosAtributos, medidaDosAtributos } from "./planta3d/previaProduto3d";
import { LADO_TEXTURA_CM } from "./planta3d/texturaProduto";
import type { NoCat } from "./planta3d/catalogo3d";
import { resolverDoNo, textoDaOrigem } from "./planta3d/modelos3dEscolha";
import { aplicacaoDosAtributos, medidaDoRevestimento } from "./planta3d/revestimentoPrevia";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

/** Espera depois da última tecla (no nome ou numa medida) antes de redesenhar o 3D (ms). */
const ESPERA_MS = 350;

export interface Modelo3DProdutoProps {
  nome: string; sub?: string | null; no: string | null; arvore: readonly NoCat[];
  /** Os atributos do produto e a lista deles: a Medida e a Cor entram no 3D. */
  attrs?: readonly AtributoProduto[]; defs?: readonly AtributoDef[];
  /** O «Modelo 3D» escolhido no próprio produto (a subcategoria e a categoria vêm da árvore): manda sobre o classificador. */
  modelo3d?: string | null;
}

/** O 3D aberto: nasce com o que há agora e, ao escrever o nome ou as medidas, espera um instante antes de se redesenhar. Só existe enquanto está aberto. */
function Aberto({ nome, sub, no, arvore, attrs, defs, modelo3d }: Modelo3DProdutoProps) {
  const nomeEspera = useDebounce(nome, ESPERA_MS);
  const attrsEspera = useDebounce(attrs, ESPERA_MS);
  const medida = useMemo(() => medidaDosAtributos(attrsEspera), [attrsEspera]);
  const cor = useMemo(() => corDosAtributos(attrsEspera, defs), [attrsEspera, defs]);
  // a foto da opção de cor escolhida (corpo > frente > cor) passa a textura do 3D; sem foto (ou sem URL do storage), a cor lisa de sempre
  const caminhoFoto = useMemo(() => fotoDosAtributos(attrsEspera, defs), [attrsEspera, defs]);
  const textura = useMemo(() => { const url = caminhoFoto ? urlDaFotoOpcao(caminhoFoto) : null; return url ? { url, ladoCm: LADO_TEXTURA_CM } : undefined; }, [caminhoFoto]);
  // 24/11: um revestimento lê a Medida sem os limites do modelo 3D (a espessura em mm de um laminado) e o atributo «Aplicação» (chão ou parede por omissão)
  const medidaRevestimento = useMemo(() => medidaDoRevestimento(attrsEspera), [attrsEspera]);
  const aplicacao = useMemo(() => aplicacaoDosAtributos(attrsEspera, defs), [attrsEspera, defs]);
  return <Previa3DProduto nome={nomeEspera} sub={sub} no={no} arvore={arvore} medida={medida} cor={cor} textura={textura} modelo3d={modelo3d} medidaRevestimento={medidaRevestimento} aplicacao={aplicacao} />;
}

export function Modelo3DProduto(props: Modelo3DProdutoProps) {
  const [aberto, setAberto] = useState(false);
  const idPainel = useId();
  // o modelo e de onde vem: do produto, da subcategoria, da categoria ou automático (pelo nome)
  const origem = resolverDoNo({ produto: props.modelo3d, arvore: props.arvore, no: props.no });
  return (
    <div className="grid gap-3">
      <p className="text-[15px] text-muted-foreground">Só para ver: o 3D que o catálogo daria a este produto, pelo modelo escolhido, pelo nome, pela subcategoria e pelas medidas. Não grava nada.</p>
      <p data-testid="modelo3d-origem" className="text-[15px]">Modelo: <span className="font-medium">{textoDaOrigem(origem)}</span></p>
      {/* o rótulo fica sempre «Ver em 3D» e quem diz se está aberto é o aria-expanded (o fundo também muda): um rótulo que muda E um aria-expanded diziam a mesma coisa duas vezes */}
      <button type="button" aria-expanded={aberto} aria-controls={idPainel} onClick={() => setAberto((v) => !v)}
        className={cn("inline-flex min-h-11 items-center gap-2 justify-self-start rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted aria-expanded:border-primary aria-expanded:bg-muted",
          "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25")}>
        <Box className="h-4 w-4 text-primary" aria-hidden="true" />Ver em 3D
      </button>
      <div id={idPainel}>
        {aberto && <Aberto {...props} />}
      </div>
    </div>
  );
}
