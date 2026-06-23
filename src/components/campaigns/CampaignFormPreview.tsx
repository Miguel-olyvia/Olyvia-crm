import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { FormLocaleSwitcher } from "@/components/forms/FormLocaleSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ChevronLeft, Check, Zap, Clock, Home, Utensils, Bath, Wrench, HelpCircle, Info, AlertTriangle, CheckCircle, AlertCircle, User, Mail, Phone } from "lucide-react";
import * as LucideIcons from "lucide-react";
// import { cn } from "@/lib/utils";

// Helper to render Lucide icons dynamically
const DynamicIcon = ({ name, className = "h-4 w-4", style }: { name: string; className?: string; style?: React.CSSProperties }) => {
  // Ignore invalid icon names (URLs, empty strings, paths, etc.)
  if (!name || typeof name !== 'string' || name.startsWith('http') || name.startsWith('/') || name.startsWith('data:') || name.includes('.')) {
    return null;
  }
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[name];
  if (!Icon) return null;
  return <Icon className={className} style={style} />;
};

// Get icon for field type (considers both key and label)
const getFieldTypeIcon = (fieldType: string, fieldKey: string, fieldLabel?: string) => {
  const haystack = `${fieldKey || ""} ${fieldLabel || ""}`.toLowerCase();
  if (fieldType === 'email' || haystack.includes('email')) return <Mail className="h-5 w-5 text-muted-foreground" />;
  if (fieldType === 'phone' || haystack.includes('phone') || haystack.includes('telefone') || haystack.includes('telemovel')) return <Phone className="h-5 w-5 text-muted-foreground" />;
  if (haystack.includes('nome') || haystack.includes('name')) return <User className="h-5 w-5 text-muted-foreground" />;
  return null;
};

interface FormStep {
  step_number: number;
  step_title: string;
  step_description: string | null;
  step_subtitle?: string | null;
  next_button_text?: string | null;
  previous_button_text?: string | null;
  submit_button_text?: string | null;
  fields: FormField[];
  info_blocks?: InfoBlock[];
  sections?: FormSection[];
}

interface InfoBlock {
  id: string;
  title: string;
  content: string;
  icon_type: string;
  sort_order: number;
}

interface FormSection {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

interface EntityOption {
  id: string;
  name: string;
  label: string;
  description?: string;
  price?: number;
}

interface FormField {
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_multi_select?: boolean;
  options?: { options?: string[]; entity_ids?: string[] } | string[] | null;
  default_value: string | null;
  system_entity_type?: string;
  entity_options?: EntityOption[];
  display_style?: "dropdown" | "radio" | "buttons" | "checkbox" | "cards" | "icon_cards";
  option_icons?: Record<string, string>;
  option_icon_names?: Record<string, string>;
  section_id?: string;
  placeholder?: string | null;
  help_text?: string | null;
  field_icon?: string | null;
  max_length?: number | null;
}

interface Branding {
  logo_url?: string;
  background_image_url?: string;
  primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  text_color?: string;
  button_text_color?: string;
  accent_color?: string;
  font_family?: string;
  heading_font_family?: string;
  form_title?: string;
  form_subtitle?: string;
  submit_button_text?: string;
  next_button_text?: string;
  previous_button_text?: string;
  show_step_titles?: boolean;
  progress_indicator_style?: string;
  step_counter_style?: string;
  card_style?: string;
  border_radius?: string;
  step_text?: string;
  of_text?: string;
  icon_color?: string;
  icon_selected_color?: string;
  step_loading_text?: string;
  // Back button styling
  back_button_bg_color?: string;
  back_button_text_color?: string;
  back_button_border_color?: string;
  back_button_hover_bg_color?: string;
  // Radio button color
  radio_button_color?: string;
  show_form_title?: boolean;
}

interface CampaignFormPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
}

export function CampaignFormPreview({
  open,
  onOpenChange,
  campaignId,
  campaignName,
}: CampaignFormPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [stepLoading, setStepLoading] = useState(false);
  const [formData, setFormData] = useState<{
    campaign_id: string;
    campaign_name: string;
    campaign_description: string | null;
    total_steps: number;
    steps: FormStep[];
    branding?: Branding | null;
    default_locale?: string | null;
    enabled_locales?: string[] | null;
    resolved_locale?: string | null;
  } | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [previewLocale, setPreviewLocale] = useState<string | null>(null);

  const branding = formData?.branding;

  /**
   * Sanitizes a CSS value before interpolation into a <style> block.
   * Uses strict whitelists to prevent CSS injection / XSS breakout.
   */
  function sanitizeCSSValue(value: string, type: 'color' | 'font' | 'size' | 'generic'): string {
    const SAFE_COLOR_DEFAULTS: Record<string, string> = {
      color: '#85D3BE',
    };
    const SAFE_SIZE_DEFAULT = '0';
    const SAFE_FONT_DEFAULT = 'inherit';
    const SAFE_GENERIC_DEFAULT = '';

    if (typeof value !== 'string') {
      return type === 'color' ? SAFE_COLOR_DEFAULTS.color
           : type === 'size'  ? SAFE_SIZE_DEFAULT
           : type === 'font'  ? SAFE_FONT_DEFAULT
           : SAFE_GENERIC_DEFAULT;
    }

    const trimmed = value.trim();

    if (type === 'color') {
      // Hex shorthand (#RGB) or full (#RRGGBB) — case-insensitive.
      if (/^#[0-9A-Fa-f]{3}$/.test(trimmed) || /^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
        return trimmed;
      }
      // rgb() — digits and commas only inside, no expressions.
      if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(trimmed)) {
        return trimmed;
      }
      // rgba() — digits, commas and a decimal opacity only.
      if (/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/.test(trimmed)) {
        return trimmed;
      }
      // Small set of safe CSS named colours.
      const safeNamed = new Set(['transparent', 'white', 'black', 'inherit', 'currentColor']);
      if (safeNamed.has(trimmed.toLowerCase())) {
        return trimmed;
      }
      return SAFE_COLOR_DEFAULTS.color;
    }

    if (type === 'font') {
      // Block any character that could break out of a CSS string context.
      if (/[<>"';{}\\]/.test(trimmed)) {
        return SAFE_FONT_DEFAULT;
      }
      // Allow only printable ASCII (space included) and common Unicode letters — no control chars.
      if (/^[\w\s,\-]+$/.test(trimmed) && trimmed.length <= 200) {
        return trimmed;
      }
      return SAFE_FONT_DEFAULT;
    }

    if (type === 'size') {
      // Numbers optionally followed by a safe CSS unit.
      if (/^\d+(\.\d+)?(px|rem|em|%|vh|vw)?$/.test(trimmed)) {
        return trimmed;
      }
      return SAFE_SIZE_DEFAULT;
    }

    // 'generic': reject anything that contains CSS-escape characters.
    if (/[<>"';{}\\]/.test(trimmed)) {
      return SAFE_GENERIC_DEFAULT;
    }
    return trimmed;
  }

  const primaryColor = sanitizeCSSValue(branding?.primary_color || '#85D3BE', 'color');
  const radioButtonColor = branding?.radio_button_color || primaryColor;
  const iconColor = branding?.icon_color || '#000000';
  const iconSelectedColor = branding?.icon_selected_color || '#000000';

  useEffect(() => {
    if (open && campaignId) {
      setPreviewLocale(null);
      loadFormStructure(null);
      setCurrentStep(1);
      setFormValues({});
    }
  }, [open, campaignId]);

  useEffect(() => {
    if (!open) return;
    const cls = "campaign-form-preview-open";
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [open]);

  const loadFormStructure = async (langOverride?: string | null) => {
    setLoading(true);
    try {
      // Pass ?lang= so the backend resolves translations from forms.settings.i18n
      // (same code path used by the public form — no fallback duplication).
      const langSuffix = langOverride ? `&lang=${encodeURIComponent(langOverride)}` : "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-form-data?campaign_id=${campaignId}${langSuffix}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load form");
      }

      const formStructure = await response.json();
      setFormData(formStructure);
      setPreviewLocale(
        formStructure.resolved_locale ||
        formStructure.default_locale ||
        langOverride ||
        null,
      );
    } catch (error) {
      console.error("Error loading form structure:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewLocaleChange = (locale: string) => {
    setPreviewLocale(locale);
    loadFormStructure(locale);
  };

  const handleFieldChange = (fieldKey: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const handleMultiSelectChange = (fieldKey: string, optionValue: string, checked: boolean) => {
    setFormValues(prev => {
      const currentValues = prev[fieldKey] || [];
      if (checked) {
        return { ...prev, [fieldKey]: [...currentValues, optionValue] };
      } else {
        return { ...prev, [fieldKey]: currentValues.filter((v: string) => v !== optionValue) };
      }
    });
  };

  const getSelectOptions = (field: FormField): { value: string; label: string }[] => {
    if (field.entity_options && field.entity_options.length > 0) {
      const entityIds = (field.options as any)?.entity_ids;
      const filteredOptions = entityIds && entityIds.length > 0
        ? field.entity_options.filter(opt => entityIds.includes(opt.id))
        : field.entity_options;
      return filteredOptions.map(opt => ({ value: opt.id, label: opt.label || opt.name }));
    }
    const opts = field.options;
    if (opts) {
      if (Array.isArray(opts)) {
        return opts.map(opt => ({ value: opt, label: opt }));
      }
      if ((opts as any).options && Array.isArray((opts as any).options)) {
        return (opts as any).options.map((opt: string) => ({ value: opt, label: opt }));
      }
    }
    return [];
  };

  const getOptionIcon = (optLabel: string, optValue: string, isSelected: boolean, field: FormField) => {
    const currentColor = isSelected ? iconSelectedColor : iconColor;
    const iconStyle = { color: currentColor };

    const iconMap = (field.option_icon_names && typeof field.option_icon_names === "object")
      ? field.option_icon_names as Record<string, string>
      : null;
    if (iconMap) {
      const tryKeys = [optLabel, optValue, String(optLabel || "").trim(), String(optValue || "").trim()];
      let configured: string | undefined;
      for (const k of tryKeys) {
        if (k && iconMap[k]) { configured = iconMap[k]; break; }
      }
      if (!configured) {
        const norm = (s: string) => String(s || "").trim().toLowerCase();
        const target = norm(optLabel);
        const hit = Object.keys(iconMap).find(k => norm(k) === target);
        if (hit) configured = iconMap[hit];
      }
      if (configured) {
        return <DynamicIcon name={configured} className="h-5 w-5" style={iconStyle} />;
      }
    }
    // Fallback to heuristic icons
    const lowerLabel = optLabel.toLowerCase();
    if (lowerLabel.includes('urgente') || lowerLabel.includes('urgent')) return <Zap className="h-5 w-5" style={iconStyle} />;
    if (lowerLabel.includes('normal') || lowerLabel.includes('prazo')) return <Clock className="h-5 w-5" style={iconStyle} />;
    if (lowerLabel.includes('cozinha') || lowerLabel.includes('kitchen')) return <Utensils className="h-5 w-5" style={iconStyle} />;
    if (lowerLabel.includes('banho') || lowerLabel.includes('bath')) return <Bath className="h-5 w-5" style={iconStyle} />;
    if (lowerLabel.includes('casa') || lowerLabel.includes('home')) return <Home className="h-5 w-5" style={iconStyle} />;
    if (lowerLabel.includes('reparação') || lowerLabel.includes('repair')) return <Wrench className="h-5 w-5" style={iconStyle} />;
    return null;
  };

  const renderField = (field: FormField) => {
    const value = formValues[field.field_key] || field.default_value || "";
    const selectOptions = getSelectOptions(field);

    switch (field.field_type) {
      case "textarea":
        return (
          <div className="space-y-1">
            <Textarea
              id={field.field_key}
              value={value}
              onChange={(e) => handleFieldChange(field.field_key, e.target.value)}
              placeholder={field.placeholder || field.field_label}
              className="min-h-[100px]"
              maxLength={field.max_length || undefined}
            />
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );

      case "select":
      case "ref_service":
      case "ref_product":
      case "ref_business_unit":
      case "ref_department":
      case "ref_district": {
        const displayStyle = field.display_style || 'dropdown';
        
        // Cards style
        if (displayStyle === 'cards' || displayStyle === 'icon_cards') {
          const columnsClass = selectOptions.length === 2 
            ? "grid-cols-2" 
            : selectOptions.length === 3 
              ? "grid-cols-2 sm:grid-cols-3" 
              : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
          
          return (
            <div className={`grid ${columnsClass} gap-4`}>
              {selectOptions.map(opt => {
                const isSelected = field.is_multi_select 
                  ? (value || []).includes(opt.value)
                  : value === opt.value;
                const icon = getOptionIcon(opt.label, opt.value, isSelected, field);
                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      if (field.is_multi_select) {
                        handleMultiSelectChange(field.field_key, opt.value, !isSelected);
                      } else {
                        handleFieldChange(field.field_key, opt.value);
                      }
                    }}
                    className="relative flex flex-col items-center justify-center gap-3 p-6 min-h-[140px] border-2 rounded-2xl cursor-pointer transition-all hover:shadow-lg"
                    style={{
                      borderColor: isSelected ? primaryColor : 'hsl(var(--muted))',
                      backgroundColor: isSelected ? `${primaryColor}10` : undefined,
                      boxShadow: isSelected ? `0 0 0 2px ${primaryColor}33` : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = `${primaryColor}60`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = 'hsl(var(--muted))';
                      }
                    }}
                  >
                    {isSelected && (
                      <div 
                        className="absolute top-3 right-3 h-6 w-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                    
                    <div 
                      className={`h-16 w-16 rounded-2xl flex items-center justify-center transition-all ${
                        isSelected 
                          ? 'bg-primary text-primary-foreground shadow-lg' 
                          : 'bg-muted text-muted-foreground'
                      }`}
                      style={isSelected ? { 
                        backgroundColor: primaryColor, 
                        color: branding?.button_text_color || '#fff' 
                      } : undefined}
                    >
                      {icon ? (
                        <div className="h-8 w-8 [&>svg]:h-8 [&>svg]:w-8">{icon}</div>
                      ) : (
                        <HelpCircle className="h-8 w-8" />
                      )}
                    </div>
                    
                    <span className={`text-base font-semibold text-center leading-tight ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}>
                      {opt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        }
        
        // Checkbox style for multi-select
        if (field.is_multi_select || displayStyle === 'checkbox') {
          return (
            <div className="space-y-2">
              {selectOptions.map(opt => {
                const isChecked = (value || []).includes(opt.value);
                const icon = getOptionIcon(opt.label, opt.value, isChecked, field);
                return (
                  <div 
                    key={opt.value} 
                    className="checkbox-option flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-all"
                    style={{
                      borderColor: isChecked ? primaryColor : undefined,
                      backgroundColor: isChecked ? `${primaryColor}10` : undefined,
                      boxShadow: isChecked ? `0 0 0 1px ${primaryColor}` : undefined,
                    }}
                    onClick={() => handleMultiSelectChange(field.field_key, opt.value, !isChecked)}
                  >
                    <Checkbox
                      id={`${field.field_key}-${opt.value}`}
                      checked={isChecked}
                      onCheckedChange={(checked) => handleMultiSelectChange(field.field_key, opt.value, !!checked)}
                      style={{
                        borderColor: isChecked ? primaryColor : undefined,
                        backgroundColor: isChecked ? primaryColor : undefined,
                      }}
                    />
                    {icon && <span className="flex-shrink-0">{icon}</span>}
                    <Label htmlFor={`${field.field_key}-${opt.value}`} className="cursor-pointer flex-1 font-normal">
                      {opt.label}
                    </Label>
                  </div>
                );
              })}
              {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
            </div>
          );
        }

        // Radio button style
        if (displayStyle === 'radio') {
          const columnsClass = selectOptions.length === 2 ? "grid-cols-2" : "grid-cols-1";
          return (
            <div className={`grid ${columnsClass} gap-3`}>
              {selectOptions.map(opt => {
                const isSelected = value === opt.value;
                const icon = getOptionIcon(opt.label, opt.value, isSelected, field);
                return (
                  <div
                    key={opt.value}
                    className="radio-option flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all"
                    style={{
                      borderColor: isSelected ? primaryColor : undefined,
                      backgroundColor: isSelected ? `${primaryColor}10` : undefined,
                    }}
                    onClick={() => handleFieldChange(field.field_key, opt.value)}
                  >
                    <div 
                      className="h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ borderColor: isSelected ? radioButtonColor : radioButtonColor + '60' }}
                    >
                      {isSelected && (
                        <div 
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: radioButtonColor }}
                        />
                      )}
                    </div>
                    
                    {icon && <span className="flex-shrink-0">{icon}</span>}
                    <span className="font-medium text-foreground">
                      {opt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        }

        // Button style
        if (displayStyle === 'buttons') {
          const columnsClass = selectOptions.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2";
          return (
            <div className={`grid ${columnsClass} gap-3`}>
              {selectOptions.map(opt => {
                const isSelected = value === opt.value;
                const icon = getOptionIcon(opt.label, opt.value, isSelected, field);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleFieldChange(field.field_key, opt.value)}
                    className="flex items-center justify-center gap-3 p-4 border-2 rounded-xl transition-all text-base font-medium"
                    style={isSelected ? { 
                      backgroundColor: primaryColor,
                      borderColor: primaryColor,
                      color: branding?.button_text_color || '#fff'
                    } : {
                      borderColor: 'hsl(var(--muted))',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = `${primaryColor}80`;
                        e.currentTarget.style.backgroundColor = `${primaryColor}10`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = 'hsl(var(--muted))';
                        e.currentTarget.style.backgroundColor = '';
                      }
                    }}
                  >
                    {icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          );
        }
        
        // Default dropdown style
        return (
          <Select value={value || ""} onValueChange={(v) => handleFieldChange(field.field_key, v)}>
            <SelectTrigger>
              <SelectValue placeholder={`Selecione ${field.field_label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "checkbox":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.field_key}
              checked={!!value}
              onCheckedChange={(checked) => handleFieldChange(field.field_key, checked)}
            />
            <Label htmlFor={field.field_key}>{field.field_label}</Label>
          </div>
        );

      case "number":
        return (
          <Input
            id={field.field_key}
            type="number"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.field_key, e.target.value)}
            placeholder={field.field_label}
          />
        );

      case "date":
        return (
          <Input
            id={field.field_key}
            type="date"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.field_key, e.target.value)}
          />
        );

      case "email":
        return (
          <div className="space-y-1">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id={field.field_key}
                type="email"
                value={value || ""}
                onChange={(e) => handleFieldChange(field.field_key, e.target.value)}
                placeholder={field.placeholder || field.field_label}
                className="pl-12 h-12 text-base rounded-xl"
              />
            </div>
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );

      case "phone":
        return (
          <div className="space-y-1">
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id={field.field_key}
                type="tel"
                value={value || ""}
                onChange={(e) => {
                  const numericValue = e.target.value.replace(/[^0-9]/g, '');
                  handleFieldChange(field.field_key, numericValue);
                }}
                placeholder={field.placeholder || field.field_label}
                maxLength={field.max_length || undefined}
                className="pl-12 h-12 text-base rounded-xl"
              />
            </div>
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );

      default: {
        // Get fallback icon based on field type/key/label
        const fieldIcon = getFieldTypeIcon(field.field_type, field.field_key, field.field_label);
        // Check if there's a valid custom icon (DynamicIcon returns null for invalid names)
        const hasValidCustomIcon = field.field_icon && 
          typeof field.field_icon === 'string' && 
          !field.field_icon.startsWith('http') && 
          !field.field_icon.startsWith('/') && 
          !field.field_icon.startsWith('data:') && 
          !field.field_icon.includes('.');
        const customIcon = hasValidCustomIcon ? <DynamicIcon name={field.field_icon!} className="h-5 w-5 text-muted-foreground" /> : null;
        const icon = customIcon || fieldIcon;
        const hasIcon = icon !== null;
        
        return (
          <div className="space-y-1">
            <div className="relative">
              {hasIcon && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                  {icon}
                </div>
              )}
              <Input
                id={field.field_key}
                type="text"
                value={value || ""}
                onChange={(e) => handleFieldChange(field.field_key, e.target.value)}
                placeholder={field.placeholder || field.field_label}
                maxLength={field.max_length || undefined}
                className={`h-12 text-base rounded-xl ${hasIcon ? 'pl-12' : ''}`}
                // Some Tailwind class merges can keep the base `px-3`, so enforce left padding via style too.
                style={hasIcon ? { paddingLeft: '3rem' } : undefined}
              />
            </div>
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );
      }
    }
  };

  const currentStepData = formData?.steps.find((s) => s.step_number === currentStep);
  const totalSteps = formData?.total_steps || 1;

  // Card styling
  const containerStyle: React.CSSProperties = {
    backgroundColor: branding?.background_color || undefined,
    backgroundImage: branding?.background_image_url ? `url(${branding.background_image_url})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    fontFamily: branding?.font_family || undefined,
    color: branding?.text_color || undefined,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: branding?.background_color || "#ffffff",
    color: branding?.text_color || undefined,
  };

  const headingStyle: React.CSSProperties = {
    fontFamily: branding?.heading_font_family || branding?.font_family || undefined,
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: primaryColor,
    color: branding?.button_text_color || "#ffffff",
  };

  const getCardClassName = () => {
    const base = branding?.border_radius || "rounded-lg";
    const style = branding?.card_style || "elevated";
    
    let shadowClass = "";
    if (style === "elevated") shadowClass = "shadow-lg";
    else if (style === "outlined") shadowClass = "border-2";
    else if (style === "flat") shadowClass = "shadow-none";
    
    return `${base} ${shadowClass}`;
  };

  const handleNextStep = async () => {
    if (currentStep < totalSteps) {
      setStepLoading(true);
      await new Promise(resolve => setTimeout(resolve, 600));
      setStepLoading(false);
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Group fields by section
  const getFieldsGroupedBySections = (stepData: FormStep) => {
    const sections = stepData.sections || [];
    const fieldsWithoutSection = stepData.fields.filter(f => !f.section_id);
    const fieldsBySection = sections.map(section => ({
      section,
      fields: stepData.fields.filter(f => f.section_id === section.id)
    })).filter(group => group.fields.length > 0);
    
    return { fieldsWithoutSection, fieldsBySection };
  };

  const formTitle = branding?.form_title || formData?.campaign_name || campaignName;
  const formSubtitle = branding?.form_subtitle || formData?.campaign_description;

  // Dynamic CSS for primary color on all interactive elements
  const dynamicCSS = `
    .preview-form-card input:focus,
    .preview-form-card textarea:focus,
    .preview-form-card [data-radix-select-trigger]:focus,
    .preview-form-card button[role="combobox"]:focus {
      border-color: ${primaryColor} !important;
      box-shadow: 0 0 0 2px ${primaryColor}33 !important;
      outline: none !important;
    }

    .preview-form-card input:hover,
    .preview-form-card textarea:hover {
      border-color: ${primaryColor}80 !important;
    }

    /* Radix Select items are rendered in a Portal, so we scope to body when preview is open */
    body.campaign-form-preview-open [role="listbox"] [role="option"][data-highlighted],
    body.campaign-form-preview-open [role="listbox"] [role="option"]:focus,
    body.campaign-form-preview-open [role="listbox"] [role="option"]:hover {
      background-color: ${primaryColor}15 !important;
      color: inherit !important;
    }

    body.campaign-form-preview-open [role="listbox"] [role="option"][data-state="checked"] {
      background-color: ${primaryColor}25 !important;
      color: inherit !important;
      font-weight: 600 !important;
    }

    .preview-form-card .radio-option {
      padding: 14px 16px;
      border-radius: 12px;
      border-width: 2px;
    }

    .preview-form-card .radio-option:hover {
      border-color: ${primaryColor}80 !important;
      background-color: ${primaryColor}05 !important;
    }

    .preview-form-card .checkbox-option:hover {
      border-color: ${primaryColor}80 !important;
    }

    .preview-form-card input.pl-12 {
      padding-left: 48px !important;
    }

    .preview-form-card input[type="email"],
    .preview-form-card input[type="tel"] {
      padding-left: 48px !important;
    }
  `;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0" style={containerStyle}>
        <style dangerouslySetInnerHTML={{ __html: dynamicCSS }} />
        {/* Preview language switcher — only renders when the form has 2+ locales configured.
            Uses the same get-form-data?lang= path as the public form to avoid drift. */}
        {formData && (formData.enabled_locales?.length || 0) > 0 && (
          <div className="absolute right-12 top-3 z-10">
            <FormLocaleSwitcher
              defaultLocale={formData.default_locale}
              enabledLocales={formData.enabled_locales}
              currentLocale={previewLocale}
              onChange={handlePreviewLocaleChange}
            />
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
            <p className="text-muted-foreground">A carregar formulário...</p>
          </div>
        ) : !formData || formData.steps.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum formulário configurado para esta campanha.</p>
            <p className="text-sm mt-2">Configure os passos e campos primeiro.</p>
          </div>
        ) : (
          <Card className={`preview-form-card ${getCardClassName()} overflow-hidden border-0`} style={cardStyle}>
            {/* Header Section */}
            <CardHeader className="pb-6">
              {/* Step Counter */}
              {totalSteps > 1 && branding?.step_counter_style !== 'none' && (
                <div className="text-sm text-muted-foreground uppercase tracking-widest font-medium mb-2">
                  {branding?.step_text || "Passo"} {currentStep} {branding?.of_text || "de"} {totalSteps}
                </div>
              )}
              
              {/* Logo */}
              {branding?.logo_url && (
                <img src={branding.logo_url} alt="Logo" className="h-12 mb-4 object-contain" />
              )}
              
              {/* Title */}
              {branding?.show_form_title !== false && (
                <CardTitle className="text-3xl sm:text-4xl font-light tracking-tight" style={headingStyle}>
                  {formTitle}
                </CardTitle>
              )}
              
              {/* Subtitle */}
              {formSubtitle && (
                <CardDescription className="text-base mt-2" style={{ color: branding?.text_color ? `${branding.text_color}99` : undefined }}>
                  {formSubtitle}
                </CardDescription>
              )}
              
              {/* Progress bar - Segmented style */}
              {totalSteps > 1 && (branding?.progress_indicator_style !== 'none') && (
                <div className="flex gap-2 mt-6">
                  {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
                    <div
                      key={step}
                      className="h-1 flex-1 rounded-full transition-colors"
                      style={{
                        backgroundColor: step <= currentStep 
                          ? primaryColor
                          : 'hsl(var(--muted))'
                      }}
                    />
                  ))}
                </div>
              )}
            </CardHeader>

            <CardContent className="pt-0">
              {/* Step Loading Animation */}
              {stepLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
                  <p className="text-muted-foreground text-sm">
                    {branding?.step_loading_text || "A processar..."}
                  </p>
                </div>
              ) : currentStepData ? (
                <div className="space-y-8">
                  {/* Step Title - if multi-step */}
                  {(branding?.show_step_titles !== false) && currentStepData.step_title && totalSteps > 1 && (
                    <div className="pb-2">
                      <h3 className="font-semibold text-lg" style={headingStyle}>{currentStepData.step_title}</h3>
                      {(currentStepData.step_subtitle || currentStepData.step_description) && (
                        <p className="text-sm text-muted-foreground mt-1">{currentStepData.step_subtitle || currentStepData.step_description}</p>
                      )}
                    </div>
                  )}

                  {/* Render fields */}
                  {(() => {
                    const { fieldsWithoutSection, fieldsBySection } = getFieldsGroupedBySections(currentStepData);
                    
                    const renderFieldItem = (field: FormField) => {
                      const hideLabel = field.display_style === 'cards' || field.display_style === 'icon_cards';
                      
                      return (
                        <div key={field.field_key} className="space-y-3">
                          {field.field_type !== "checkbox" && !hideLabel && (
                            <Label htmlFor={field.field_key} className="text-base font-semibold">
                              {field.field_label}
                              {field.is_required && <span className="text-destructive ml-1">*</span>}
                            </Label>
                          )}
                          {hideLabel && (
                            <Label htmlFor={field.field_key} className="text-base font-semibold">
                              {field.field_label}
                              {field.is_required && <span className="text-orange-500 ml-1">*</span>}
                            </Label>
                          )}
                          {renderField(field)}
                        </div>
                      );
                    };

                    return (
                      <>
                        {fieldsWithoutSection.length > 0 && (
                          <div className="space-y-6">
                            {fieldsWithoutSection.map(renderFieldItem)}
                          </div>
                        )}
                        
                        {/* Info Blocks */}
                        {currentStepData.info_blocks && currentStepData.info_blocks.length > 0 && (
                          <div className="space-y-3">
                            {currentStepData.info_blocks.map((block) => {
                              const getBlockStyles = (iconType: string) => {
                                switch (iconType) {
                                  case 'warning': return { bg: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', text: 'text-amber-800' };
                                  case 'success': return { bg: 'bg-green-50 border-green-200', icon: 'text-green-600', text: 'text-green-800' };
                                  case 'alert': return { bg: 'bg-red-50 border-red-200', icon: 'text-red-600', text: 'text-red-800' };
                                  default: return { bg: 'bg-blue-50 border-blue-200', icon: 'text-blue-600', text: 'text-blue-800' };
                                }
                              };
                              const styles = getBlockStyles(block.icon_type);
                              const IconComponent = block.icon_type === 'warning' ? AlertTriangle 
                                : block.icon_type === 'success' ? CheckCircle 
                                : block.icon_type === 'alert' ? AlertCircle 
                                : Info;
                              
                              return (
                                <div key={block.id} className={`flex items-start gap-3 p-4 border rounded-xl ${styles.bg}`}>
                                  <IconComponent className={`h-5 w-5 mt-0.5 flex-shrink-0 ${styles.icon}`} />
                                  <div>
                                    <h4 className={`font-semibold text-sm ${styles.text}`}>{block.title}</h4>
                                    <p className={`text-sm mt-1 whitespace-pre-line ${styles.text}`}>{block.content}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Sectioned Fields */}
                        {fieldsBySection.map(({ section, fields }) => (
                          <div key={section.id} className="space-y-4">
                            <div>
                              <h4 className="font-semibold text-base">{section.title}</h4>
                              {section.description && (
                                <p className="text-sm text-muted-foreground">{section.description}</p>
                              )}
                            </div>
                            <div className="space-y-4">
                              {fields.map(renderFieldItem)}
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}

                  {/* Submit Button - Full width */}
                  <div className="pt-6 space-y-4">
                    <Button 
                      onClick={handleNextStep} 
                      disabled={currentStep === totalSteps}
                      className="w-full h-14 text-lg font-semibold rounded-xl"
                      style={buttonStyle}
                    >
                      {currentStep === totalSteps 
                        ? (currentStepData?.submit_button_text || branding?.submit_button_text || "Submeter") 
                        : (currentStepData?.next_button_text || branding?.next_button_text || "Continuar")}
                    </Button>
                    
                    {/* Back button - styled with branding colors */}
                    {currentStep > 1 && (
                      <Button
                        variant="outline"
                        onClick={handlePreviousStep}
                        className="w-full h-14 text-lg font-semibold rounded-xl border-2 transition-all"
                        style={{
                          backgroundColor: branding?.back_button_bg_color || 'transparent',
                          color: branding?.back_button_text_color || primaryColor,
                          borderColor: branding?.back_button_border_color || primaryColor,
                        }}
                        onMouseEnter={(e) => {
                          const hoverBg = branding?.back_button_hover_bg_color || `${primaryColor}15`;
                          e.currentTarget.style.backgroundColor = hoverBg;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = branding?.back_button_bg_color || 'transparent';
                        }}
                      >
                        <ChevronLeft className="h-5 w-5 mr-2" />
                        {currentStepData?.previous_button_text || branding?.previous_button_text || "Anterior"}
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Preview Notice */}
        <div className="bg-muted/50 p-3 text-center border-t">
          <p className="text-xs text-muted-foreground">
            🔍 Esta é uma pré-visualização. Os dados inseridos não são guardados.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
