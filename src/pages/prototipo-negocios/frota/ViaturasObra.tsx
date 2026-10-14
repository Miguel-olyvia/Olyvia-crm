// As viaturas da obra, na página da obra (v2/ObraV2.tsx): as que a Frota reservou para a obra ou que levaram o técnico a uma tarefa do plano,
// com o custo por km real (o que substitui os 0,40 €/km fixos na deslocação). "Abrir na Frota" só na V2, onde a Frota existe.
import { Truck } from "lucide-react";
import { fDataC, fEur } from "./base";
import { useFrota } from "./loja";
import { pedirFrota, useMolduraFrota } from "./pontes";
import { custoKmDeslocacao, viaturasDaObra } from "./regras";

export function ViaturasObra({ obra }: { obra: number }) {
  const F = useFrota();
  const comFrota = useMolduraFrota(); // só quando a moldura do protótipo consegue mesmo abrir a Frota
  const l = viaturasDaObra(F, obra);
  if (!l.length) return null;
  return (
    <div className="mt-3 text-[15px]" aria-label="Viaturas da obra" role="group">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
        <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
        <span>Viaturas:</span>
        {l.map((x, i) => (
          <span key={x.v.id} className="inline-flex items-center gap-1">
            {comFrota
              ? <button type="button" className="min-h-11 font-medium text-primary underline-offset-4 hover:underline" onClick={() => pedirFrota({ aba: "viaturas", vid: x.v.id })} title="Abrir na Frota">{x.v.mat}</button>
              : <span className="font-medium text-foreground">{x.v.mat}</span>}
            <span>({x.quem}{x.oQue.length ? `, ${x.oQue.join(", ")}` : ""}{x.datas.length ? `, ${x.datas.map(fDataC).join(" e ")}` : ""}; {fEur(custoKmDeslocacao(F, x.v.id))}/km){i < l.length - 1 ? " ·" : ""}</span>
          </span>
        ))}
      </p>
    </div>
  );
}
