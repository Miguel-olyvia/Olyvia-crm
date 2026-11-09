// 9/11 (Rúben, o fluxo novo: «… financeiro valida pagamento do cliente → operação valida plano de obra e ajusta + supervisor faz retificação
// de medidas aceite → contrato aceite → encomenda a fornecedor e ter tudo → início da obra (primeiro passo retificação de medidas pelo
// supervisor)»). O primeiro passo da Obra: o supervisor vai ao local e confirma as medidas da visita (o chão, as paredes, os pontos…). As
// medidas retificadas ficam ao lado das da visita, com a diferença; «Aceitar as medidas» fecha o passo e deixa as Operações aprovarem o
// plano (e só depois se assina o contrato). O orçamento aceite não muda: se as medidas mudarem o preço, faz-se uma adenda.
import { useState } from "react";
import { Check, RotateCcw, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, camposMedida, medida, nfmt, type Negocio } from "./motor";
import type { Ctx } from "./pecas";

const numero = (s: string) => Number(String(s).replace(",", "."));

export function RetificacaoMedidas({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const CM = camposMedida(LINHAS[d.linha]);
  const aceite = d.f.retif_aceite;
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CM.map(([k]) => [k, d.f[`retif_${k}`] ?? String(medida(d.visita.med, k) || "")])));
  const [notas, setNotas] = useState(d.f.retif_notas ?? "");
  const pode = !aceite && d.fin.pago;
  const mudadas = CM.filter(([k]) => { const v = numero(valores[k] ?? ""); return Number.isFinite(v) && Math.abs(v - medida(d.visita.med, k)) > 0.001; });

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Ruler className="h-5 w-5" /></span>
        <div className="min-w-0 text-[15px]">
          <p className="font-semibold">{aceite ? `Medidas aceites a ${aceite.split("-").reverse().join("/")}${d.f.retif_por ? `, por ${d.f.retif_por}` : ""}` : "O supervisor confirma as medidas no local"}</p>
          <p className="text-muted-foreground">{aceite
            ? "As Operações já podem aprovar o plano; depois assina-se o contrato."
            : d.fin.pago ? "Compare com as da visita e corrija o que for preciso. Ao aceitar, as Operações aprovam o plano e segue o contrato." : "Depois de o Financeiro validar o pagamento."}</p>
        </div>
      </div>

      {CM.length ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_8rem] gap-3 bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Medida</span><span className="text-right">Na visita</span><span>Retificada</span>
          </div>
          <ul className="divide-y divide-border">
            {CM.map(([k, l]) => {
              const antes = medida(d.visita.med, k), v = numero(valores[k] ?? ""), dif = Number.isFinite(v) ? v - antes : 0;
              return (
                <li key={k} className="grid grid-cols-[minmax(0,1fr)_6rem_8rem] items-center gap-3 px-4 py-2">
                  <span className="min-w-0 text-[15px]">{l}{Math.abs(dif) > 0.001 && <span className={cn("ml-2 rounded-full px-2 text-xs font-medium", dif > 0 ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-muted")}>{dif > 0 ? "+" : ""}{nfmt(dif)}</span>}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{nfmt(antes)}</span>
                  <input aria-label={`${l}, retificada`} type="number" min={0} step={0.5} value={valores[k] ?? ""} disabled={!pode}
                    onChange={(e) => setValores((x) => ({ ...x, [k]: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] tabular-nums disabled:opacity-70" />
                </li>
              );
            })}
          </ul>
        </div>
      ) : <p className="text-[15px] text-muted-foreground">Esta linha não tem medidas: o supervisor só confirma o local nas notas.</p>}

      {mudadas.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          {mudadas.length} {mudadas.length === 1 ? "medida mudou" : "medidas mudaram"} em relação à visita. O orçamento aceite fica como está: se o preço mudar, faça uma adenda.
        </p>
      )}

      <label className="grid gap-1.5 text-sm font-medium">Notas do supervisor (opcional)
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} disabled={!pode} rows={3} placeholder="Ex.: a parede do fundo tem 2,35 m até ao teto falso; a base de duche cabe com 5 cm de folga"
          className="rounded-lg border border-input bg-background px-3 py-2 text-[15px] disabled:opacity-70" />
      </label>

      <div className="flex flex-wrap gap-2">
        {!aceite ? (
          <Button type="button" className="min-h-11" disabled={!pode}
            onClick={() => ctx.run(() => ctx.A.retificarMedidas(d.id, Object.fromEntries(CM.map(([k]) => [k, numero(valores[k] ?? "")]).filter(([, v]) => Number.isFinite(v as number))), notas))}>
            <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Aceitar as medidas
          </Button>
        ) : d.obra.plano?.estado === "por aprovar" ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => ctx.run(() => ctx.A.campo(d.id, "retif_aceite", ""))}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Voltar a retificar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
