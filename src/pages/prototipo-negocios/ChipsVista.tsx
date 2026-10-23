// Os chips de vista rápida de Negócios e de Pessoas: uma só linha, cada chip com a contagem; o ativo fica realçado e carregar nele liga ou desliga o filtro.
// O número é o da lista depois de aplicar o filtro (quem usa calcula-o). Os chips são os de FiltrosPopover, por isso têm o aspeto dos outros.
import { CHIP } from "./FiltrosPopover";
import "./blocosPagina.css";

export interface ItemVista { id: string; n: number; titulo: string; ativo: boolean }

interface ChipsProps { nome: string; itens: readonly ItemVista[]; aoAlternar: (id: string) => void }

export function ChipsVista({ nome, itens, aoAlternar }: ChipsProps) {
  return (
    <div role="group" aria-label={nome} className="flex flex-wrap items-center gap-2">
      {itens.map((i) => (
        <button key={i.id} type="button" aria-pressed={i.ativo} onClick={() => aoAlternar(i.id)} className={CHIP(i.ativo)}>
          {i.titulo} <span className="tabular-nums opacity-70">{i.n}</span>
        </button>
      ))}
    </div>
  );
}
