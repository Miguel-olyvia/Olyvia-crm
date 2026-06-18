import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconGallery, LucideIcon, normalizeLucideIconName } from "./IconGallery";
import { Image, Sparkles, Palette } from "lucide-react";

interface FieldDefinition {
  id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  options?: { options?: string[] };
  option_icon_names?: Record<string, string>;
  display_style?: string;
}

interface FieldOptionIconsProps {
  field: FieldDefinition;
  onUpdate: () => void;
}

export function FieldOptionIcons({ field, onUpdate }: FieldOptionIconsProps) {
  const { toast } = useToast();
  const [iconGalleryOpen, setIconGalleryOpen] = useState(false);
  const [currentOption, setCurrentOption] = useState<string | null>(null);
  const [optionIcons, setOptionIcons] = useState<Record<string, string>>(
    field.option_icon_names || {}
  );

  const options = field.options?.options || [];
  
  if (options.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center bg-muted rounded-lg">
        Este campo não tem opções definidas.
      </div>
    );
  }

  const handleSelectIcon = (iconName: string) => {
    if (!currentOption) return;

    const newIcons = { ...optionIcons };
    const normalizedIconName = normalizeLucideIconName(iconName);
    if (normalizedIconName) {
      newIcons[currentOption] = normalizedIconName;
    } else {
      delete newIcons[currentOption];
    }
    setOptionIcons(newIcons);
  };

  const handleSave = async () => {
    const { error: leadFieldError } = await supabase
      .from("lead_field_definitions")
      .update({ option_icon_names: optionIcons })
      .eq("id", field.id);

    const { error: formFieldError } = await supabase
      .from("form_fields")
      .update({ option_icon_names: optionIcons })
      .eq("id", field.id);

    const error = leadFieldError ?? formFieldError;

    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ícones guardados" });
      onUpdate();
    }
  };

  const hasChanges = JSON.stringify(optionIcons) !== JSON.stringify(field.option_icon_names || {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium flex items-center gap-2">
            <Palette className="h-4 w-4" />
            {field.field_label}
          </h4>
          <p className="text-xs text-muted-foreground">
            Estilo: {field.display_style || 'dropdown'}
          </p>
        </div>
        {hasChanges && (
          <Button size="sm" onClick={handleSave}>
            Guardar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => {
          const iconName = optionIcons[option];
          return (
            <Card 
              key={option} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => {
                setCurrentOption(option);
                setIconGalleryOpen(true);
              }}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${iconName ? 'bg-primary/10' : 'bg-muted border-2 border-dashed'}`}>
                    {iconName ? (
                      <LucideIcon name={iconName} className="h-5 w-5 text-primary" />
                    ) : (
                      <Image className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{option}</p>
                    {iconName && (
                      <Badge variant="secondary" className="text-xs mt-1">
                        {iconName}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <IconGallery
        open={iconGalleryOpen}
        onOpenChange={setIconGalleryOpen}
        onSelect={handleSelectIcon}
        selectedIcon={currentOption ? optionIcons[currentOption] : undefined}
      />
    </div>
  );
}
