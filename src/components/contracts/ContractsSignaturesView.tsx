import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, CheckCircle } from "lucide-react";

interface Contract {
  id: string;
  contract_number?: string;
  status: string;
  total_value?: number;
  created_at: string;
  updated_at?: string;
  _clientName?: string;
  [key: string]: any;
}

interface ContractsSignaturesViewProps {
  contracts: Contract[];
  onAction?: (action: string, contract: Contract) => void;
}

const fmt = (v: number) => { const f = Math.abs(v).toFixed(2); const [i, d] = f.split('.'); return (v < 0 ? '-' : '') + '€' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };

export function ContractsSignaturesView({ contracts, onAction }: ContractsSignaturesViewProps) {
  const now = new Date();
  const pending = contracts
    .filter(c => c.status === "draft" || c.status === "pending_signature")
    .map(c => {
      const sent = new Date(c.updated_at || c.created_at);
      const daysSince = Math.ceil((now.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24));
      return { ...c, daysSince };
    })
    .sort((a, b) => b.daysSince - a.daysSince);

  if (pending.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-400" />
        <p className="text-lg font-medium">Todos os contratos estão assinados!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pending.map(c => (
        <div key={c.id} className="flex items-center justify-between border rounded-lg p-4 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
              {(c._clientName || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold">{c.contract_number}</p>
              <p className="text-xs text-muted-foreground">{c._clientName}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-primary">{fmt(c.total_value || 0)}</p>
          </div>
          <div>
            <Badge variant="outline" className={c.status === "draft" ? "border-yellow-300 text-yellow-600" : "border-blue-300 text-blue-600"}>
              {c.status === "draft" ? "Não enviado" : `Enviado há ${c.daysSince}d`}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {c.status === "draft" ? (
              <Button size="sm" onClick={() => onAction?.("send_signature", c)}>
                <Send className="h-3 w-3 mr-1" /> Enviar
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onAction?.("resend", c)}>
                <Send className="h-3 w-3 mr-1" /> Reenviar
              </Button>
            )}
            <Button size="sm" variant="outline" className="border-green-400 text-green-600" onClick={() => onAction?.("mark_signed", c)}>
              <CheckCircle className="h-3 w-3 mr-1" /> Assinado
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
