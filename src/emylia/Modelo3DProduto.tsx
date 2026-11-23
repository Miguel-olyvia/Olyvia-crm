// 23/11: o corpo da secção «Modelo 3D» do formulário de produto (criar e ficha): uma frase, o botão «Ver em 3D» e, só depois de aberto, a pré-visualização.
// Começa fechado: o canvas e o three só arrancam ao clicar, e fechar desmonta o canvas (um só de cada vez). O título da secção é de quem o usa.
import { useId, useMemo, useState } from "react";
import { Box } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { Previa3DProduto } from "./Previa3DProduto";
import { corDosAtributos, medidasDosAtributos } from "./planta3d/previaProduto3d";
import type { NoCat } from "./planta3d/catalogo3d";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

/** Espera depois de a última tecla no nome antes de redesenhar o 3D (ms). */
const ESPERA_NOME_MS = 350;

export interface Modelo3DProdutoProps {
  nome: string; sub?: string | null; no: string | null; arvore: readonly NoCat[];
  /** Os atributos do produto e a lista deles: a Medida e a Cor entram no 3D. */
  attrs?: readonly AtributoProduto[]; defs?: readonly AtributoDef[];
}

/** O 3D aberto: nasce com o nome de agora e, ao escrever, espera um instante antes de se redesenhar. Só existe enquanto está aberto. */
function Aberto({ nome, sub, no, arvore, attrs, defs }: Modelo3DProdutoProps) {
  const nomeEspera = useDebounce(nome, ESPERA_NOME_MS);
  const medidas = useMemo(() => medidasDosAtributos(attrs), [attrs]);
  const cor = useMemo(() => corDosAtributos(attrs, defs), [attrs, defs]);
  return <Previa3DProduto nome={nomeEspera} sub={sub} no={no} arvore={arvore} medidas={medidas} cor={cor} />;
}

export function Modelo3DProduto(props: Modelo3DProdutoProps) {
  const [aberto, setAberto] = useState(false);
  const idPainel = useId();
  return (
    <div className="grid gap-3">
      <p className="text-[15px] text-muted-foreground">Só para ver: o 3D que o catálogo daria a este produto, pelo nome, pela subcategoria e pelas medidas. Não grava nada.</p>
      <button type="button" aria-expanded={aberto} aria-controls={idPainel} onClick={() => setAberto((v) => !v)}
        className={cn("inline-flex min-h-11 items-center gap-2 justify-self-start rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted",
          "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25")}>
        <Box className="h-4 w-4 text-primary" aria-hidden="true" />{aberto ? "Fechar o 3D" : "Ver em 3D"}
      </button>
      <div id={idPainel}>
        {aberto && <Aberto {...props} />}
      </div>
    </div>
  );
}
