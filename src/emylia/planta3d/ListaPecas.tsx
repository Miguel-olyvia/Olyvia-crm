// Protótipo (visualizador 3D): a lista visível «Peças na divisão», por baixo da planta: UMA linha por peça, com os botões Remover, Rodar e Duplicar
// (alvos de 44 px, com o nome da peça no aria-label). É a forma de mexer numa peça sem acertar num alvo pequeno na planta. Os conjuntos têm uma
// linha própria («Remover conjunto») e os componentes «Retirar do conjunto».
import { Copy, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PECAS, type PecaPlanta, type Planta } from "../planta";
import { conjuntoPorId } from "./conjuntos";
import { familiaPorId, resolverVariante } from "./familias";
import { ehAbertura, ehDeParede } from "./pecas3d";

/** O nome mostrado de uma peça: o do produto (com a variante, se for de família) ou o do tipo antigo. */
export function nomeDaPeca(p: PecaPlanta): string {
  const f = p.fam ? familiaPorId(p.fam) : undefined;
  return (f ? resolverVariante(f, p.med, p.acab).nome : p.nome) ?? PECAS[p.tipo].n;
}
/** Uma linha de texto com o acabamento, as medidas e, nas de parede, a altura ao chão. */
export function descricaoDaPeca(p: PecaPlanta): string {
  const f = p.fam ? familiaPorId(p.fam) : undefined;
  const partes = [f ? resolverVariante(f, p.med, p.acab).acabamento.nome : null, `${Math.round(p.w * 10) / 10}×${Math.round(p.h * 10) / 10} cm`];
  if (ehDeParede(p) && !ehAbertura(p)) partes.push(`na parede a ${Math.round(p.alt ?? 0)} cm do chão`);
  else if ((p.alt ?? 0) > 0 && p.conj) partes.push(`a ${Math.round(p.alt ?? 0)} cm do chão`);
  if (p.esp) partes.push("espelhada");
  return partes.filter(Boolean).join(" · ");
}

export interface ListaPecasProps {
  planta: Planta; sel: string | null;
  onSel: (id: string) => void; onRemover: (id: string) => void; onRodar: (id: string) => void; onDuplicar: (id: string) => void;
  onRemoverConjunto: (conj: string) => void; onRetirar: (id: string) => void; onRepor: (id: string) => void;
}
const BTN = "min-h-11 min-w-11";

export function ListaPecas({ planta, sel, onSel, onRemover, onRodar, onDuplicar, onRemoverConjunto, onRetirar, onRepor }: ListaPecasProps) {
  const soltas = planta.pecas.filter((p) => !p.conj);
  const conjuntos = [...new Set(planta.pecas.filter((p) => p.conj).map((p) => p.conj as string))];
  if (planta.pecas.length === 0) return <p className="text-[15px] text-muted-foreground">Ainda sem peças na divisão.</p>;
  const linha = (p: PecaPlanta, noConjunto: boolean) => {
    const nome = nomeDaPeca(p);
    return (
      <li key={p.id} className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2", sel === p.id && "border-primary bg-primary/[0.05]", p.ret && "opacity-70")}>
        <button type="button" className="min-h-11 min-w-0 flex-1 text-left" aria-pressed={sel === p.id} aria-label={`Escolher ${nome}`} onClick={() => onSel(p.id)}>
          <span className={cn("block text-[15px] font-medium", p.ret && "line-through")}>{nome}</span>
          <span className="block text-sm text-muted-foreground">{descricaoDaPeca(p)}{p.ret ? " · retirado do conjunto" : ""}</span>
        </button>
        {p.ret ? (
          <Button type="button" variant="outline" className={BTN} aria-label={`Repor ${nome}`} onClick={() => onRepor(p.id)}>Repor</Button>
        ) : (
          <>
            {!ehAbertura(p) && !p.semGeo && (!noConjunto || p.ancora) && (
              <Button type="button" variant="outline" className={BTN} aria-label={`Rodar ${nome}`} onClick={() => onRodar(p.id)}><RotateCw className="mr-1 h-4 w-4" aria-hidden="true" />Rodar</Button>
            )}
            {!noConjunto && (
              <Button type="button" variant="outline" className={BTN} aria-label={`Duplicar ${nome}`} onClick={() => onDuplicar(p.id)}><Copy className="mr-1 h-4 w-4" aria-hidden="true" />Duplicar</Button>
            )}
            {noConjunto && !p.ancora ? (
              <Button type="button" variant="outline" className={BTN} aria-label={`Retirar ${nome} do conjunto`} onClick={() => onRetirar(p.id)}><Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />Retirar do conjunto</Button>
            ) : !noConjunto ? (
              <Button type="button" variant="ghost" className={BTN} aria-label={`Remover ${nome}`} onClick={() => onRemover(p.id)}><Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />Remover</Button>
            ) : null}
          </>
        )}
      </li>
    );
  };
  return (
    <ul className="space-y-2" aria-label="Peças na divisão">
      {soltas.map((p) => linha(p, false))}
      {conjuntos.map((id) => {
        const membros = planta.pecas.filter((p) => p.conj === id), def = membros[0]?.conjId ? conjuntoPorId(membros[0].conjId) : undefined;
        const nome = def?.nome ?? "Conjunto";
        return (
          <li key={id} className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.03] p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 px-1 text-[15px] font-semibold">Conjunto: {nome}</span>
              <Button type="button" variant="outline" className={BTN} aria-label={`Remover conjunto ${nome}`} onClick={() => onRemoverConjunto(id)}><Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />Remover conjunto</Button>
            </div>
            <ul className="space-y-2" aria-label={`Componentes de ${nome}`}>{membros.map((p) => linha(p, true))}</ul>
          </li>
        );
      })}
    </ul>
  );
}
