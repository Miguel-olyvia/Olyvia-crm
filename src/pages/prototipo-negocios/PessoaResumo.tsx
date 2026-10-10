// O resumo de cada separador da lista de Pessoas numa só linha, e o que a ficha mostra quando a lista está vazia.
import { Plus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Estado } from "./motor";
import { resumoLinha } from "./perfilDocs";
import type { SeparadorLista } from "./pessoasDocs";
import { BORDA_CTRL } from "./PessoaLinha";

/** O resumo do separador em duas linhas curtas (cabem a 340 px), com "exemplo" quando a última tem um valor de exemplo. */
export function LinhaResumo({ S, aba }: { S: Estado; aba: SeparadorLista }) {
  const r = resumoLinha(S, aba), ultima = r.linhas.length - 1;
  return (
    <p className="text-[15px] text-foreground">
      {r.linhas.map((l, i) => <span key={l} className="block">{l}{i === ultima && r.exemplo && <span className="ml-1.5 text-muted-foreground">exemplo</span>}</span>)}
    </p>
  );
}

interface VazioProps {
  /** Há pessoas neste separador, mas os filtros ou a pesquisa escondem-nas todas. */
  haPessoas: boolean;
  limpar: () => void;
  novaLead: () => void;
}

/** A direita só fica sem ficha quando a lista não tem ninguém: diz porquê e o que fazer, sem repetir números. */
export function PainelVazio({ haPessoas, limpar, novaLead }: VazioProps) {
  const botao = cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL);
  return (
    <div className="px-6 py-10 lg:px-10">
      <p className="flex items-center gap-2 text-[15px] text-muted-foreground"><UsersRound className="h-4 w-4" aria-hidden="true" />Sem ninguém para mostrar</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Escolhe uma pessoa</h2>
      <p className="mt-2 max-w-prose text-base text-muted-foreground">
        {haPessoas ? "Nenhuma pessoa passa os filtros ou a pesquisa. Tira os filtros para voltar a ver a lista, ou cria uma lead nova." : "Ainda não há ninguém neste separador. Cria uma lead para começar."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {haPessoas && <Button type="button" variant="outline" className={botao} onClick={limpar}>Limpar filtros</Button>}
        <Button type="button" variant="outline" className={botao} onClick={novaLead}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova lead</Button>
      </div>
    </div>
  );
}
