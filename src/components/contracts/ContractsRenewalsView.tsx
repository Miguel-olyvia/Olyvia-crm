import { Button } from "@/components/ui/button";
import { Phone, Mail, CheckCircle, PenTool } from "lucide-react";

interface Contract {
  id: string;
  contract_number?: string;
  status: string;
  total_value?: number;
  end_date?: string;
  _clientName?: string;
  [key: string]: any;
}

interface ContractsRenewalsViewProps {
  contracts: Contract[];
  onAction?: (action: string, contract: Contract) => void;
}

const fmt = (v: number) => { const f = Math.abs(v).toFixed(2); const [i, d] = f.split('.'); return (v < 0 ? '-' : '') + '€' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };

export function ContractsRenewalsView({ contracts, onAction }: ContractsRenewalsViewProps) {
  const now = new Date();

  const renewalContracts = contracts
    .filter(c => c.end_date && c.status !== "cancelled" && c.status !== "draft")
    .map(c => {
      const end = new Date(c.end_date!);
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { ...c, daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const totalExpiringYear = renewalContracts
    .filter(c => c.daysLeft > 0 && c.daysLeft <= 365)
    .reduce((s, c) => s + (c.total_value || 0), 0);

  const totalExpired = renewalContracts
    .filter(c => c.daysLeft <= 0)
    .reduce((s, c) => s + (c.total_value || 0), 0);

  const getCardColor = (daysLeft: number) => {
    if (daysLeft <= 0) return "border-red-300 bg-red-50 dark:bg-red-950/20";
    if (daysLeft <= 90) return "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20";
    return "border-green-300 bg-green-50 dark:bg-green-950/20";
  };

  const getDaysColor = (daysLeft: number) => {
    if (daysLeft <= 0) return "text-red-600";
    if (daysLeft <= 90) return "text-orange-600";
    return "text-green-600";
  };

  const getAction = (c: typeof renewalContracts[0]) => {
    const isSigned = c.status === "signed" || c.status === "active";
    if (c.daysLeft <= 0) {
      return (
        <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => onAction?.("contact", c)}>
          <Phone className="h-3 w-3 mr-1" /> Contactar
        </Button>
      );
    }
    if (c.daysLeft <= 90) {
      return (
        <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => onAction?.("send_renewal", c)}>
          <Mail className="h-3 w-3 mr-1" /> Enviar renovação
        </Button>
      );
    }
    if (!isSigned) {
      return (
        <Button size="sm" variant="outline" className="border-primary text-primary" onClick={() => onAction?.("sign_first", c)}>
          <PenTool className="h-3 w-3 mr-1" /> Assinar primeiro
        </Button>
      );
    }
    return (
      <Button size="sm" variant="outline" className="border-green-400 text-green-600">
        <CheckCircle className="h-3 w-3 mr-1" /> OK
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {renewalContracts.map(c => (
          <div key={c.id} className={`border-2 rounded-xl p-4 ${getCardColor(c.daysLeft)} flex flex-col gap-3`}>
            <div className="flex items-start justify-between">
              <div>
                <span className={`text-3xl font-black ${getDaysColor(c.daysLeft)}`}>
                  {c.daysLeft <= 0 ? c.daysLeft : c.daysLeft}d
                </span>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  {c.daysLeft <= 0 ? "EXPIRADO" : "ATÉ EXPIRAR"}
                </p>
              </div>
              <span className="text-lg font-bold text-primary">{fmt(c.total_value || 0)}</span>
            </div>
            <div>
              <p className="text-sm font-semibold">{c.contract_number} — {c._clientName}</p>
              <p className="text-xs text-muted-foreground">
                Expira {new Date(c.end_date!).toLocaleDateString("pt-PT")}
              </p>
            </div>
            <div className="mt-auto">{getAction(c)}</div>
          </div>
        ))}
      </div>

      {(totalExpiringYear > 0 || totalExpired > 0) && (
        <div className="rounded-xl bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 p-4 text-center">
          <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
            🔥 {fmt(totalExpiringYear)} em contratos a expirar nos próximos 12 meses
            {totalExpired > 0 && ` · ${fmt(totalExpired)} já expirado e não renovado`}
          </span>
        </div>
      )}
    </div>
  );
}
