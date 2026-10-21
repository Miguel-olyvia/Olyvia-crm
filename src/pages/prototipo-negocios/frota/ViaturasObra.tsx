// As viaturas da obra, na página da obra (v2/ObraV2.tsx e, na Atual, ObraOperacoes.tsx): as que a Frota reservou para a obra ou que levaram o técnico a uma tarefa do plano,
// com o custo por km real (o que substitui os 0,40 €/km fixos na deslocação). "Abrir na Frota" onde a Frota existe (Atual e V2).
import { Truck } from "lucide-react";
import { fDataC, fEur } from "./base";
import { useFrota } from "./loja";
import { pedirFrota, useMolduraFrota } from "./pontes";
import { custoKmDeslocacao, viaturasDaObra } from "./regras";
import { useInventario } from "../inventario/loja";
import { fasesTransporte, faltaParaCarregar, ligacoesObra } from "./transporteObra";

/** 16/10: a viatura ligada à obra (Frota › Ligações › Operações) e o estado do transporte de cada fase: por carregar / na carrinha / entregue. */
function ViaturaLigada({ obra, ec, estado }: { obra: number; ec?: string | null; estado?: string }) {
  const F = useFrota(), inv = useInventario();
  const comFrota = useMolduraFrota();
  const lig = ligacoesObra(F, obra);
  if (!lig.length) return null;
  const o = { ec: ec ?? null, estado: estado ?? "" };
  const fases = fasesTransporte(inv, o), falta = faltaParaCarregar(inv, o);
  return (
    <div className="mt-3 text-[15px]" role="group" aria-label="Viatura ligada à obra">
      {lig.map((x) => {
        const v = F.viaturas.find((y) => y.id === x.vid);
        if (!v) return null;
        return (
          <p key={x.vid} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">Viatura ligada:</span>
            {comFrota ? <button type="button" className="min-h-11 font-medium text-primary underline-offset-4 hover:underline" onClick={() => pedirFrota({ aba: "viaturas", vid: v.id })}>{v.mat}</button> : <span className="font-medium">{v.mat}</span>}
            <span className="text-muted-foreground">{v.marca} {v.modelo}{falta.length ? ` · carregar quando houver ${falta.join(" e ")}` : ""}</span>
          </p>
        );
      })}
      {fases.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Transporte por fases">
          {fases.map((f) => <li key={f.fase}>Fase {f.fase} · {f.nome}: <span className={f.estado === "entregue" ? "text-success" : f.estado === "na carrinha" ? "text-primary" : "text-muted-foreground"}>{f.estado}</span></li>)}
        </ul>
      )}
    </div>
  );
}

export function ViaturasObra({ obra, ec, estado }: { obra: number; ec?: string | null; estado?: string }) {
  const F = useFrota();
  const comFrota = useMolduraFrota(); // só quando a moldura do protótipo consegue mesmo abrir a Frota
  const l = viaturasDaObra(F, obra);
  if (!l.length) return <ViaturaLigada obra={obra} ec={ec} estado={estado} />;
  // 21/10: uma linha por viatura (matrícula e quem a leva; o que se fez e quando por baixo; o custo por km à direita), sem texto corrido
  return (<>
    <div className="mt-3" aria-label="Viaturas da obra" role="group">
      <p className="text-sm text-muted-foreground">Viaturas</p>
      <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {l.map((x) => (
          <li key={x.v.id} className="flex items-center gap-3 px-3 py-2">
            <Truck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
                {comFrota
                  ? <button type="button" className="min-h-9 font-semibold tabular-nums text-primary underline-offset-4 hover:underline" onClick={() => pedirFrota({ aba: "viaturas", vid: x.v.id })} title="Abrir na Frota">{x.v.mat}</button>
                  : <span className="font-semibold tabular-nums">{x.v.mat}</span>}
                <span>{x.quem}</span>
              </p>
              {(x.oQue.length > 0 || x.datas.length > 0) && (
                <p className="text-sm text-muted-foreground">{[x.oQue.join(", "), x.datas.map(fDataC).join(" e ")].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground"><b className="font-semibold text-foreground">{fEur(custoKmDeslocacao(F, x.v.id))}</b>/km</span>
          </li>
        ))}
      </ul>
    </div>
    <ViaturaLigada obra={obra} ec={ec} estado={estado} />
  </>);
}
