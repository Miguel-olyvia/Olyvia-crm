import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Ruler, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CSlot } from "./hooks/useConfigTemplate";

interface PriceRange {
  id: string;
  range_type: string;
  min_value: number | null;
  max_value: number | null;
  min_width: number | null;
  max_width: number | null;
  min_height: number | null;
  max_height: number | null;
  min_depth: number | null;
  max_depth: number | null;
  price_per_unit: number;
}

interface AttrInfo {
  label: string;
  unit: string | null;
  pricing_type: string | null;
}

function formatRange(r: PriceRange): string {
  if (r.range_type === "linear" || r.min_value != null || r.max_value != null) {
    const min = r.min_value ?? 0;
    const max = r.max_value;
    return max != null ? `${min} – ${max}` : `≥ ${min}`;
  }
  const parts: string[] = [];
  if (r.min_width != null || r.max_width != null) {
    parts.push(`L: ${r.min_width ?? 0}–${r.max_width ?? "∞"}`);
  }
  if (r.min_height != null || r.max_height != null) {
    parts.push(`A: ${r.min_height ?? 0}–${r.max_height ?? "∞"}`);
  }
  if (r.min_depth != null || r.max_depth != null) {
    parts.push(`P: ${r.min_depth ?? 0}–${r.max_depth ?? "∞"}`);
  }
  return parts.join(" · ") || "—";
}

export function MeasureSlotPanel({ slot }: { slot: CSlot }) {
  const [ranges, setRanges] = useState<PriceRange[]>([]);
  const [attr, setAttr] = useState<AttrInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slot.attribute_id) return;
    setLoading(true);
    (async () => {
      const [{ data: a }, { data: rs }] = await Promise.all([
        supabase
          .from("product_attributes")
          .select("label, unit, pricing_type")
          .eq("id", slot.attribute_id!)
          .maybeSingle(),
        supabase
          .from("product_attribute_price_ranges")
          .select("id, range_type, min_value, max_value, min_width, max_width, min_height, max_height, min_depth, max_depth, price_per_unit")
          .eq("attribute_id", slot.attribute_id!)
          .order("min_value", { ascending: true }),
      ]);
      if (a) setAttr(a as unknown as AttrInfo);
      setRanges((rs ?? []) as unknown as PriceRange[]);
      setLoading(false);
    })();
  }, [slot.attribute_id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Ruler className="h-4 w-4" /> Medida — "{slot.label}"
        </CardTitle>
        <CardDescription>
          O cliente introduz uma medida. O preço é calculado a partir dos intervalos definidos no atributo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!slot.attribute_id ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Sem atributo de medida associado</AlertTitle>
            <AlertDescription className="text-xs">
              Edite esta escolha (lápis) e associe um atributo do tipo medida/intervalo.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="rounded-md border p-3 bg-muted/30 text-sm">
              <div className="text-xs text-muted-foreground">Atributo</div>
              <div className="font-medium">
                {attr?.label ?? "—"}
                {attr?.unit ? <span className="text-muted-foreground font-normal"> · {attr.unit}</span> : null}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-2">
                Intervalos de preço definidos no atributo
              </div>
              <div className="border rounded-md divide-y">
                {loading ? (
                  <div className="p-3 text-sm text-muted-foreground">A carregar…</div>
                ) : ranges.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    Este atributo ainda não tem intervalos. Defina-os em <strong>Atributos</strong>.
                  </div>
                ) : (
                  ranges.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-mono text-xs">{formatRange(r)}</span>
                      <span className="font-medium">{r.price_per_unit.toFixed(2)} €</span>
                    </div>
                  ))
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Para alterar os intervalos ou preços, vá ao módulo <strong>Atributos</strong>.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
