// 19/11 (auditoria): «Registar chamada» pede o resultado no próprio botão, sem valor por omissão (antes ficava sempre «Atendeu · interessado»
// e o próximo passo era sempre marcar a visita). Com «Não atendeu» ou «Ligar mais tarde» pede também o dia para voltar a ligar.
import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { proximoDiaUtil, type Negocio } from "./motor";
import { RES_PERDA, RES_RELIGAR, RESULTADOS_CHAMADA } from "./campos";
import { isoDoDia } from "./vagaData";
import type { Ctx } from "./pecas";

export function RegistarChamada({ ctx, d, tamanho = "lg" }: { ctx: Ctx; d: Negocio; tamanho?: "lg" | "default" }) {
  const id = useId();
  const [resultado, setResultado] = useState("");
  const [religar, setReligar] = useState(() => proximoDiaUtil());
  const pedeDia = RES_RELIGAR.includes(resultado);
  const registar = ctx.go(() => ctx.A.contactar(d.id, resultado, pedeDia ? religar : undefined));
  return (
    <div className="grid w-full gap-4 text-left">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-2 text-[15px] font-medium">Como correu a chamada?</legend>
        <div className="flex flex-wrap gap-2">
          {RESULTADOS_CHAMADA.map((r) => (
            <label key={r} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[15px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40",
              resultado === r ? "border-primary bg-primary/[0.08] font-medium text-foreground" : "border-input bg-card hover:border-primary/60")}>
              <input type="radio" name={`resultado-${id}`} value={r} checked={resultado === r} onChange={() => setResultado(r)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      {pedeDia && (
        <label className="grid max-w-xs gap-1.5 text-[15px] font-medium">
          Voltar a ligar em
          <input type="date" value={religar} min={isoDoDia(new Date())} onChange={(e) => e.target.value && setReligar(e.target.value)}
            className="min-h-11 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
      )}
      {RES_PERDA.includes(resultado) && <p className="text-[15px] text-muted-foreground">Depois de registar, o próximo passo propõe marcar o negócio como perdido.</p>}
      <div>
        <Button size={tamanho} disabled={!resultado} aria-describedby={resultado ? undefined : `${id}-falta`} onClick={registar}>
          Registar chamada<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
        {!resultado && <p id={`${id}-falta`} className="mt-1 text-sm text-muted-foreground">Escolha primeiro como correu a chamada.</p>}
      </div>
    </div>
  );
}
