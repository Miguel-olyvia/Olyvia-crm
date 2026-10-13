import { Button, Card } from "./ui";
import { Euro, Plus } from "./icons";
import { haQuantoTempo, type ObraPorCriar } from "../lib/financeiroObra";

/**
 * "Obras por criar" — no topo da lista Obras. O Financeiro validou o 1.º
 * pagamento destes contratos e ainda não há obra. Cada linha abre a "Nova
 * obra" já no contrato; a obra nasce "planeada" (o plano por aprovar).
 */
export function ObrasPorCriar({
  lista,
  aoCriar,
}: {
  lista: ObraPorCriar[];
  aoCriar: (contratoId: string) => void;
}) {
  if (lista.length === 0) return null;
  return (
    <Card className="border-l-4 border-l-emerald-500 p-4">
      <div className="flex items-start gap-2">
        <Euro width={16} height={16} className="mt-0.5 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">
            {lista.length === 1 ? "1 obra por criar" : `${lista.length} obras por criar`}
          </h2>
          <p className="text-xs text-slate-500">
            O cliente já pagou a 1.ª fatura. Cria a obra: fica com o plano por aprovar.
          </p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {lista.map((o) => (
          <li key={o.contrato_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{o.cliente_nome}</p>
              <p className="text-xs text-slate-500">
                <span className="font-mono tabular">{o.numero}</span> · pago {haQuantoTempo(o.pago_em)}
              </p>
            </div>
            <Button size="sm" onClick={() => aoCriar(o.contrato_id)} aria-label={`Criar obra de ${o.cliente_nome}`}>
              <Plus width={14} height={14} /> Criar obra
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
