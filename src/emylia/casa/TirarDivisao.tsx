// 28/11 (Rúben: «permitir apagar divisões, criei uma sem querer e não consigo apagar»). Tirar a divisão escolhida do negócio, com
// confirmação. Não se apaga nada: a planta, o projeto do Estúdio e as respostas dela ficam no negócio e voltam se ela voltar a entrar.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TirarDivisao({ nome, tirar }: { nome: string; tirar: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  if (!confirmar) return (
    <Button type="button" variant="ghost" className="min-h-11 text-muted-foreground hover:text-destructive" onClick={() => setConfirmar(true)}>
      <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Tirar {nome.toLowerCase()}
    </Button>
  );
  return (
    <div role="alertdialog" aria-label={`Tirar ${nome} do negócio`} className="flex w-full flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[15px]"><b className="font-semibold">Tirar {nome.toLowerCase()} do negócio?</b>{" "}
        <span className="text-muted-foreground">A planta e o que lá estiver ficam guardados e voltam se a juntar outra vez.</span></p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="destructive" className="min-h-11" onClick={() => { setConfirmar(false); tirar(); }}>Tirar</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmar(false)}>Cancelar</Button>
      </div>
    </div>
  );
}
