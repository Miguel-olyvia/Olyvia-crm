import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface FieldDefinition {
  id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  options?: { options?: string[] } | null;
  placeholder?: string;
  help_text?: string;
  display_style?: string;
}

interface DynamicFormFieldProps {
  field: FieldDefinition;
  value: any;
  onChange: (value: any) => void;
  campaignId?: string; // Optional campaign ID to filter districts
}

export function DynamicFormField({ field, value, onChange, campaignId }: DynamicFormFieldProps) {
  const [districtOptions, setDistrictOptions] = useState<{ id: string; name: string }[]>([]);

  // Load districts if field type is ref_district
  useEffect(() => {
    if (field.field_type === 'ref_district') {
      loadDistricts();
    }
  }, [field.field_type, campaignId]);

  const loadDistricts = async () => {
    // If campaignId is provided, first try to get campaign-specific districts
    if (campaignId) {
      const { data: campaignDistricts } = await supabase
        .from('campaign_districts')
        .select(`
          district_id,
          administrative_divisions!district_id (id, name)
        `)
        .eq('campaign_id', campaignId);
      
      if (campaignDistricts && campaignDistricts.length > 0) {
        const districts = campaignDistricts
          .filter((cd: any) => cd.administrative_divisions)
          .map((cd: any) => ({
            id: cd.administrative_divisions.id,
            name: cd.administrative_divisions.name
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        
        // Remove duplicates by name
        const unique = districts.reduce((acc: { id: string; name: string }[], curr) => {
          if (!acc.find(d => d.name === curr.name)) {
            acc.push(curr);
          }
          return acc;
        }, []);
        
        setDistrictOptions(unique);
        return;
      }
    }

    // Fallback: load all districts if no campaign or no campaign districts configured
    const { data } = await supabase
      .from('administrative_divisions')
      .select('id, name')
      .eq('admin_level', 1)
      .eq('country_code', 'PT')
      .order('name');
    
    // Remove duplicates by name
    const unique = (data || []).reduce((acc: { id: string; name: string }[], curr) => {
      if (!acc.find(d => d.name === curr.name)) {
        acc.push(curr);
      }
      return acc;
    }, []);
    
    setDistrictOptions(unique);
  };

  const options = field.options?.options || [];
  const displayStyle = field.display_style || 'dropdown';

  // Checkbox/Multi-select style
  if (field.field_type === 'select' && displayStyle === 'checkbox' && options.length > 0) {
    const selectedValues = Array.isArray(value) ? value : (value ? [value] : []);
    
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {field.is_required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {options.map((opt: string) => (
            <label key={opt} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-muted/50">
              <Checkbox
                checked={selectedValues.includes(opt)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange([...selectedValues, opt]);
                  } else {
                    onChange(selectedValues.filter((v: string) => v !== opt));
                  }
                }}
              />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  // Dropdown select
  if (field.field_type === 'select' && options.length > 0) {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {field.is_required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={field.placeholder || "Selecionar..."} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt: string) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  // District reference dropdown
  if (field.field_type === 'ref_district') {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {field.is_required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Selecionar distrito..." />
          </SelectTrigger>
          <SelectContent>
            {districtOptions.map((district) => (
              <SelectItem key={district.id} value={district.name}>{district.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  // Textarea
  if (field.field_type === 'textarea') {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {field.is_required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <textarea
          className="w-full mt-1 p-2 border rounded-md resize-none min-h-[80px]"
          rows={3}
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  // Boolean/Switch
  if (field.field_type === 'boolean') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>
            {field.field_label}
            {field.is_required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <Switch
            checked={value || false}
            onCheckedChange={onChange}
          />
        </div>
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  // Date field
  if (field.field_type === 'date') {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {field.is_required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Input
          type="date"
          className="mt-1"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
        />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  // Email field
  if (field.field_type === 'email') {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {field.is_required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Input
          type="email"
          className="mt-1"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || "email@exemplo.pt"}
        />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  // Phone field
  if (field.field_type === 'phone') {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {field.is_required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Input
          type="tel"
          className="mt-1"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || "912345678"}
        />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  // Number field
  if (field.field_type === 'number') {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {field.is_required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Input
          type="number"
          className="mt-1"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
        {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      </div>
    );
  }

  // Default: text input
  return (
    <div className="space-y-2">
      <Label>
        {field.field_label}
        {field.is_required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Input
        type="text"
        className="mt-1"
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
    </div>
  );
}
