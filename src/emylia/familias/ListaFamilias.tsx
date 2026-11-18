// Famílias (interface): a lista das famílias criadas nesta sessão (só em memória), com Editar e Apagar. Os botões têm id (`editar-<família>`, `apagar-<família>`) para a página
// devolver o foco depois de guardar, cancelar ou apagar.
import { Button } from "@/components/ui/button";
import { NOTA } from "../pecasForm";
import type { FamiliaGuardada } from "./derivarFamilia";
import { BTN, geram, idApagarFamilia, idEditarFamilia } from "./estilosFamilias";

export interface ListaFamiliasProps {
  familias: readonly FamiliaGuardada[];
  onEditar: (f: FamiliaGuardada) => void; onApagar: (f: FamiliaGuardada) => void;
}

export function ListaFamilias({ familias, onEditar, onApagar }: ListaFamiliasProps) {
  if (familias.length === 0) return <p className={NOTA}>Ainda não há famílias nesta sessão.</p>;
  return (
    <ul aria-label="Famílias criadas" className="grid gap-2">
      {familias.map((g) => {
        const f = g.familia;
        return (
          <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-base font-semibold">{f.nome}</p>
              <p className="text-[15px] text-muted-foreground">{[f.marca || "Sem marca", f.categoria].filter(Boolean).join(" · ")}</p>
              <p className="text-[15px]">{geram(g.produtos.length, f.variantes.length)}</p>
            </div>
            <Button type="button" id={idEditarFamilia(f.id)} variant="outline" className={BTN} aria-label={`Editar ${f.nome}`} onClick={() => onEditar(g)}>Editar</Button>
            <Button type="button" id={idApagarFamilia(f.id)} variant="outline" className={BTN} aria-label={`Apagar ${f.nome}`} onClick={() => onApagar(g)}>Apagar</Button>
          </li>
        );
      })}
    </ul>
  );
}
