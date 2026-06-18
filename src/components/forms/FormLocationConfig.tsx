import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FormLocationConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
  currentCountryCode?: string;
  currentLocationRequired?: boolean;
  onSave: () => void;
}

interface District {
  id: string;
  name: string;
  country_code: string;
}

interface Country {
  code: string;
  name: string;
}

export function FormLocationConfig({ 
  open, 
  onOpenChange, 
  formId, 
  formName,
  currentCountryCode,
  currentLocationRequired,
  onSave
}: FormLocationConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedCountry, setSelectedCountry] = useState(currentCountryCode || "");
  const [locationRequired, setLocationRequired] = useState(currentLocationRequired || false);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, formId]);

  useEffect(() => {
    if (selectedCountry) {
      loadDistricts(selectedCountry);
    } else {
      setDistricts([]);
      setSelectedDistricts([]);
    }
  }, [selectedCountry]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load countries
      const { data: countryData } = await supabase
        .from("administrative_divisions")
        .select("country_code")
        .eq("admin_level", 1);

      const uniqueCountryCodes = [...new Set((countryData || []).map(d => d.country_code))];
      const countryList: Country[] = uniqueCountryCodes.map((code: string) => ({
        code,
        name: code === 'PT' ? 'Portugal' : code === 'ES' ? 'Espanha' : code === 'BR' ? 'Brasil' : code,
      }));
      setCountries(countryList);

      // Load existing form districts
      const { data: formDistricts } = await supabase
        .from("form_districts")
        .select("district_id")
        .eq("form_id", formId);

      setSelectedDistricts((formDistricts || []).map(d => d.district_id));

      // Load form data
      const { data: formData } = await supabase
        .from("forms")
        .select("country_code, location_required")
        .eq("id", formId)
        .single();

      if (formData) {
        setSelectedCountry(formData.country_code || "");
        setLocationRequired(formData.location_required || false);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDistricts = async (countryCode: string) => {
    const { data } = await supabase
      .from("administrative_divisions")
      .select("id, name, country_code")
      .eq("country_code", countryCode)
      .eq("admin_level", 1)
      .order("name");

    setDistricts(data || []);
  };

  const toggleDistrict = (districtId: string) => {
    setSelectedDistricts(prev => 
      prev.includes(districtId)
        ? prev.filter(id => id !== districtId)
        : [...prev, districtId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update form
      const { error: formError } = await supabase
        .from("forms")
        .update({
          country_code: selectedCountry || null,
          location_required: selectedDistricts.length > 0 ? locationRequired : false,
        })
        .eq("id", formId);

      if (formError) throw formError;

      // Delete existing districts
      await supabase
        .from("form_districts")
        .delete()
        .eq("form_id", formId);

      // Insert new districts
      if (selectedDistricts.length > 0) {
        const { error: districtError } = await supabase
          .from("form_districts")
          .insert(
            selectedDistricts.map(districtId => ({
              form_id: formId,
              district_id: districtId,
            }))
          );

        if (districtError) throw districtError;
      }

      toast.success("Localização guardada");
      onSave();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving location:", error);
      toast.error("Erro ao guardar localização");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Localização - {formName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>País</Label>
              <Select
                value={selectedCountry}
                onValueChange={(value) => {
                  setSelectedCountry(value === "none" ? "" : value);
                  setSelectedDistricts([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar país" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem país</SelectItem>
                  {countries.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCountry && districts.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Distritos
                  </Label>
                  <ScrollArea className="h-64 border rounded-lg p-3">
                    <div className="space-y-2">
                      {districts.map((district) => (
                        <div key={district.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`district-${district.id}`}
                            checked={selectedDistricts.includes(district.id)}
                            onCheckedChange={() => toggleDistrict(district.id)}
                          />
                          <label
                            htmlFor={`district-${district.id}`}
                            className="text-sm cursor-pointer"
                          >
                            {district.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  {selectedDistricts.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedDistricts.length} distrito(s) selecionado(s)
                    </p>
                  )}
                </div>

                {selectedDistricts.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                    <div className="space-y-0.5">
                      <Label htmlFor="location_required" className="cursor-pointer text-sm font-medium">
                        Localização Obrigatória
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Se ativo, o formulário público só aceita leads dos distritos selecionados
                      </p>
                    </div>
                    <Switch
                      id="location_required"
                      checked={locationRequired}
                      onCheckedChange={setLocationRequired}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
