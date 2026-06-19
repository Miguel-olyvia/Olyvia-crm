import { Sparkles, Phone, Mail, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import DOMPurify from "dompurify";

interface SuggestionClient {
  name: string;
  value: number;
  detail: string;
}

interface ClientSmartSuggestionProps {
  vipAtRisk: SuggestionClient[];
  expiringContracts: SuggestionClient[];
  upsellCount: number;
  upsellValue: number;
  onCallVip?: () => void;
  onRenewContract?: () => void;
  onViewUpsell?: () => void;
}

export function ClientSmartSuggestion({
  vipAtRisk, expiringContracts, upsellCount, upsellValue,
  onCallVip, onRenewContract, onViewUpsell,
}: ClientSmartSuggestionProps) {
  if (vipAtRisk.length === 0 && expiringContracts.length === 0 && upsellCount === 0) return null;

  const parts: string[] = [];
  if (vipAtRisk.length > 0) {
    const v = vipAtRisk[0];
    parts.push(`**${v.name}** é VIP com ${formatCurrency(v.value)} mas ${v.detail} — risco de churn alto.`);
  }
  if (expiringContracts.length > 0) {
    const e = expiringContracts[0];
    parts.push(`A **${e.name}** tem contrato de ${formatCurrency(e.value)} ${e.detail} — enviar renovação agora aumenta **3×** a taxa de renovação.`);
  }
  if (upsellCount > 0) {
    parts.push(`E tens **${upsellCount} clientes** com apenas 1 contrato — potencial de upselling de ${formatCurrency(upsellValue)}.`);
  }

  return (
    <div className="bg-gradient-to-r from-purple-50 to-orange-50 dark:from-purple-950/20 dark:to-orange-950/20 border border-purple-200/50 dark:border-purple-800/50 rounded-xl p-4 flex items-start gap-3">
      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center shrink-0">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed" dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(parts.join(' ').replace(/\*\*(.*?)\*\*/g, '<strong class="text-purple-700 dark:text-purple-400">$1</strong>'))
        }} />
      </div>
      <div className="flex gap-2 shrink-0 flex-wrap">
        {vipAtRisk.length > 0 && (
          <Button size="sm" variant="destructive" onClick={onCallVip} className="gap-1.5">
            <Phone className="w-3.5 h-3.5" />Ligar à {vipAtRisk[0].name.split(' ')[0]}
          </Button>
        )}
        {expiringContracts.length > 0 && (
          <Button size="sm" variant="outline" onClick={onRenewContract} className="gap-1.5">
            <Mail className="w-3.5 h-3.5" />Renovar {expiringContracts[0].name.split(' ')[0]}
          </Button>
        )}
        {upsellCount > 0 && (
          <Button size="sm" variant="outline" onClick={onViewUpsell} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" />Ver upselling
          </Button>
        )}
      </div>
    </div>
  );
}
