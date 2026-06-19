import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Briefcase, UtensilsCrossed, Building2, Wrench, GraduationCap, ShoppingCart } from "lucide-react";
import type { PipelineTemplate } from "@/hooks/usePipelineConfig";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, UtensilsCrossed, Building2, Wrench, GraduationCap, ShoppingCart,
};

interface Props {
  templates: PipelineTemplate[];
  currentTemplateId: string | null;
  onApply: (template: PipelineTemplate) => void;
}

export function PipelineTemplatePicker({ templates, currentTemplateId, onApply }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-medium text-sm">Templates por Indústria</h4>
        <p className="text-xs text-muted-foreground">Escolha um template para configurar rapidamente o pipeline</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {templates.map(t => {
          const Icon = ICON_MAP[t.icon] || Briefcase;
          const isActive = currentTemplateId === t.id;
          const enabledCount = (t.modules || []).filter((m: any) => m.enabled).length;
          return (
            <Card
              key={t.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                isActive && "ring-2 ring-primary"
              )}
              onClick={() => onApply(t)}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  {isActive && <Check className="w-4 h-4 text-primary" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">{t.description}</p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {enabledCount} módulos
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
