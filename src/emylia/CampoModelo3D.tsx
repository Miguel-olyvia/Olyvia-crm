// O seletor «Modelo 3D» (produto, subcategoria e categoria): a primeira opção é «Automático (herda: …)» (vazio herda do nível de cima: produto > subcategoria >
// categoria > automático), depois a lista agrupada (planta3d/modelos3dEscolha.ts). Por baixo, uma frase diz de onde vem o modelo («Herdado da subcategoria X: Y»).
// Só escolhe: quem usa decide quando grava (a ficha grava logo; criar e gerir categorias gravam com o resto). É o dropdown com pesquisa do Catálogo
// (ComboPesquisa: são 45 modelos, e a pesquisa aparece sozinha), com os modelos agrupados por cabeçalhos.
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";
import { NOTA, Campo } from "./pecasForm";
import { ComboPesquisa, type ItemCombo } from "./ComboPesquisa";
import {
  GRUPOS_MODELO, MODELOS_ESCOLHA, escolhaPorId, rotuloAutomatico, rotuloDoModelo3D, type ResolvidoNo,
} from "./planta3d/modelos3dEscolha";

export type NivelModelo3D = "produto" | "subcategoria" | "categoria";
const ONDE: Record<NivelModelo3D, string> = { produto: "neste produto", subcategoria: "nesta subcategoria", categoria: "nesta categoria" };
/** Os modelos por grupo, na ordem dos grupos (o ComboPesquisa põe o cabeçalho antes do primeiro de cada grupo). */
const ITENS: readonly ItemCombo[] = GRUPOS_MODELO.flatMap((g) => MODELOS_ESCOLHA.filter((m) => m.grupo === g).map((m): ItemCombo => ({ id: m.id, nome: m.rotulo, grupo: g })));

/** A frase por baixo do seletor: o que foi escolhido aqui, o que se herda (e de onde), ou que nada foi escolhido. */
function fraseDoModelo3D(valor: string | null, heranca: ResolvidoNo, nivel: NivelModelo3D): string {
  if (valor) return `Escolhido ${ONDE[nivel]}: ${rotuloDoModelo3D(valor)}.`;
  if (heranca.modelo) return `Herdado da ${heranca.origem === "subcategoria" ? "subcategoria" : "categoria"}${heranca.de ? ` ${heranca.de}` : ""}: ${rotuloDoModelo3D(heranca.modelo)}`;
  return "Sem escolha: o 3D usa o classificador, pelo nome e pela subcategoria.";
}

interface Props {
  /** O modelo escolhido neste nível (null: herda). */
  valor: string | null;
  /** O que este nível herdaria se não escolhesse nada (resolverDoNo com `soHerdado`, ou herdadoDe). */
  heranca: ResolvidoNo;
  onChange: (valor: string | null) => void;
  nivel?: NivelModelo3D;
  desativado?: boolean;
  erro?: string | null;
  className?: string;
}

export function CampoModelo3D({ valor, heranca, onChange, nivel = "produto", desativado, erro, className }: Props) {
  const idFrase = useId(), idErro = useId();
  const automatico = rotuloAutomatico(heranca);
  // um id que a base tem e a lista não conhece (a base não tem lista fechada) continua visível e escolhido: nunca se perde em silêncio
  const atual = useMemo<ItemCombo | null>(() => {
    if (!valor) return null;
    const m = escolhaPorId(valor);
    return { id: valor, nome: m ? m.rotulo : `${valor} (modelo desconhecido)` };
  }, [valor]);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Campo rot="Modelo 3D">
        {(id) => (
          <ComboPesquisa id={id} rotulo="Modelo 3D" itens={ITENS} atual={atual} semValor={automatico} semValorComoValor desativado={desativado} onEscolher={(i) => onChange(i.id || null)} />
        )}
      </Campo>
      <p id={idFrase} aria-live="polite" className={NOTA}>{fraseDoModelo3D(valor, heranca, nivel)}</p>
      {erro && <p id={idErro} role="alert" className="text-[15px] text-red-700 dark:text-red-400">{erro}</p>}
    </div>
  );
}
