import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

const DEFAULT_CONDITIONS = `Este orçamento é válido por 30 dias. Os preços incluem IVA à taxa legal em vigor. Qualquer alteração ao âmbito do trabalho será objecto de orçamento adicional.`;

interface QuoteConditionsProps {
  clientNotes: string;
  onClientNotesChange: (value: string) => void;
  conditions: string;
  onConditionsChange: (value: string) => void;
}

export function QuoteConditions({
  clientNotes,
  onClientNotesChange,
  conditions,
  onConditionsChange,
}: QuoteConditionsProps) {
  const [editingConditions, setEditingConditions] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">📝 Condições e Notas para o Cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Notas visíveis no PDF do cliente</Label>
          <Textarea
            value={clientNotes}
            onChange={(e) => onClientNotesChange(e.target.value)}
            placeholder="Prazo estimado de execução: 10 dias úteis após aprovação.&#10;Pagamento: 50% no início, 50% na conclusão.&#10;Garantia: 5 anos sobre mão de obra."
            rows={4}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-muted-foreground">Condições gerais (template)</Label>
          </div>
          {editingConditions ? (
            <Textarea
              value={conditions || DEFAULT_CONDITIONS}
              onChange={(e) => onConditionsChange(e.target.value)}
              rows={3}
              autoFocus
              onBlur={() => setEditingConditions(false)}
            />
          ) : (
            <div className="p-3 bg-muted/30 rounded-md border text-sm text-muted-foreground">
              {conditions || DEFAULT_CONDITIONS}
            </div>
          )}
          <Button variant="link" size="sm" className="p-0 h-auto text-primary" onClick={() => {
            if (!conditions) onConditionsChange(DEFAULT_CONDITIONS);
            setEditingConditions(true);
          }}>
            <Pencil className="h-3 w-3 mr-1" /> Editar condições gerais
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
