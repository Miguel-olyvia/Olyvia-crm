// 23/11: o corpo do passo «Proposta» que a Emylia monta (PaginaNegocio.tsx, passosDaFase: as perguntas da proposta, a folha dentro de
// «Partilhar» e o «Refazer a proposta») com a folha trocada por outro documento. A Emylia não se edita: troca-se o elemento
// <Partilhar> (o da folha da proposta) onde estiver, até três níveis abaixo. Não o encontrando, devolve-se o corpo como veio.
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Partilhar } from "@/emylia/DocsCliente";

const PROFUNDIDADE = 3;

function trocar(no: ReactNode, novo: ReactNode, nivel: number): { no: ReactNode; trocou: boolean } {
  if (!isValidElement(no)) return { no, trocou: false };
  const el = no as ReactElement<{ children?: ReactNode; tipo?: string }>;
  if (el.type === Partilhar && el.props.tipo === "proposta") return { no: novo, trocou: true };
  if (nivel >= PROFUNDIDADE || el.props.children === undefined) return { no, trocou: false };
  let trocou = false;
  const filhos = Children.map(el.props.children, (f) => {
    if (trocou) return f;
    const r = trocar(f, novo, nivel + 1);
    trocou = r.trocou;
    return r.no;
  });
  return trocou ? { no: cloneElement(el, undefined, filhos), trocou } : { no, trocou: false };
}

/** O corpo com a folha da proposta trocada por `novo`; `trocou` diz se a encontrou. */
export function trocarFolhaDaProposta(corpo: ReactNode, novo: ReactNode): { corpo: ReactNode; trocou: boolean } {
  const r = trocar(corpo, novo, 0);
  return { corpo: r.no, trocou: r.trocou };
}
