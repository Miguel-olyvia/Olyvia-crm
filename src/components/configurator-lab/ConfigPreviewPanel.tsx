import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import type { CBlock, CSlot, CSlotOption } from "./hooks/useConfigTemplate";

interface Props {
  blocks: CBlock[];
  slots: CSlot[];
  options: CSlotOption[];
}

export function ConfigPreviewPanel({ blocks, slots, options }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preview estrutural</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          Sem cálculo de preço nem validação de regras (Fase 3).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {blocks.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            Sem blocos para mostrar.
          </div>
        ) : (
          blocks.map((b) => {
            const blockSlots = slots.filter((s) => s.block_id === b.id);
            return (
              <div key={b.id} className="border rounded-md p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-sm">{b.label}</div>
                  {b.is_required && <Badge variant="outline" className="text-xs">obrigatório</Badge>}
                </div>
                {blockSlots.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem slots</div>
                ) : (
                  blockSlots.map((s) => {
                    const slotOpts = options.filter((o) => o.slot_id === s.id);
                    return (
                      <div key={s.id} className="ml-2 border-l-2 border-muted pl-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="text-sm">{s.label}</div>
                          <Badge variant="secondary" className="text-xs">{s.slot_type}</Badge>
                          {s.required && <Badge variant="outline" className="text-xs">obrig.</Badge>}
                        </div>
                        {slotOpts.length === 0 ? (
                          <div className="text-xs text-muted-foreground">Sem opções</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {slotOpts.map((o) => (
                              <Badge
                                key={o.id}
                                variant={o.is_enabled ? "default" : "outline"}
                                className="text-xs font-normal"
                              >
                                {o.label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
