import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Copy, 
  Check, 
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Zap,
  ExternalLink,
  Terminal,
  FileCode,
  Layout as LayoutIcon,
  AlertCircle,
  CheckCircle2,
  Info,
  Play,
  Send,
  Loader2,
  TestTube2,
  User,
  Mail,
  Phone,
  Clock,
  Home,
  Utensils,
  Bath,
  Wrench,
  HelpCircle,
  MapPin
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { HelpButton } from "@/components/HelpButton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface CampaignToken {
  id: string;
  campaign_id: string;
  campaign_name: string;
  token: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  usage_count: number;
}

const BASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;
const APP_URL = window.location.origin;

// Helper to render Lucide icons dynamically
const DynamicIcon = ({ name, className = "h-4 w-4", style }: { name: string; className?: string; style?: React.CSSProperties }) => {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[name];
  if (!Icon || typeof Icon !== 'function') return null;
  return <Icon className={className} style={style} />;
};

// Get icon for field type
const getFieldTypeIcon = (fieldType: string, fieldKey: string) => {
  const lowerKey = fieldKey.toLowerCase();
  if (fieldType === 'email' || lowerKey.includes('email')) return <Mail className="h-5 w-5 text-muted-foreground" />;
  if (fieldType === 'phone' || lowerKey.includes('phone') || lowerKey.includes('telefone') || lowerKey.includes('telemovel')) return <Phone className="h-5 w-5 text-muted-foreground" />;
  if (lowerKey.includes('nome') || lowerKey.includes('name')) return <User className="h-5 w-5 text-muted-foreground" />;
  return null;
};

export default function MarketingIntegration() {
  const { activeCompany } = useCompany();
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [tokens, setTokens] = useState<CampaignToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [newTokenName, setNewTokenName] = useState("");
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [newlyGeneratedToken, setNewlyGeneratedToken] = useState<string | null>(null);
  const [visibleTokens, setVisibleTokens] = useState<Set<string>>(new Set());
  
  // API Tester state
  const [apiEndpoint, setApiEndpoint] = useState<string>("get-campaign-form");
  const [apiMethod, setApiMethod] = useState<string>("GET");
  const [apiBody, setApiBody] = useState<string>("");
  const [apiResponse, setApiResponse] = useState<string>("");
  const [apiLoading, setApiLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<number | null>(null);
  
  // Form Preview state
  const [previewFormData, setPreviewFormData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCurrentStep, setPreviewCurrentStep] = useState(0);
  const [previewFormValues, setPreviewFormValues] = useState<Record<string, any>>({});
  const [previewValidationErrors, setPreviewValidationErrors] = useState<Record<string, string>>({});
  const [previewLocationRejected, setPreviewLocationRejected] = useState(false);

  useEffect(() => {
    if (activeCompany?.id) {
      fetchCampaigns();
      fetchTokens();
    }
  }, [activeCompany?.id]);

  const fetchCampaigns = async () => {
    const { data } = await (supabase as any)
      .from("campaigns")
      .select("id, name, status, iframe_enabled")
      .eq("organization_id", activeCompany?.id)
      .order("name");
    
    setCampaigns(data || []);
  };

  // Check if any campaign has iframe enabled
  const hasIframeEnabledCampaigns = campaigns.some(c => c.iframe_enabled && c.status === "active");
  const iframeEnabledCampaigns = campaigns.filter(c => c.iframe_enabled && c.status === "active");

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("scoped_api_tokens")
        .select(`
          id, 
          token_key, 
          token_name, 
          is_active, 
          created_at, 
          last_used_at, 
          usage_count,
          scopes,
          description
        `)
        .eq("organization_id", activeCompany?.id)
        .order("created_at", { ascending: false });

      const mappedTokens: CampaignToken[] = (data || []).map((t: any) => {
        // Extract campaign_id from scopes array (format: "campaign:uuid")
        const campaignScope = (t.scopes || []).find((s: string) => s.startsWith('campaign:'));
        const campaignId = campaignScope ? campaignScope.replace('campaign:', '') : "";
        
        return {
          id: t.id,
          campaign_id: campaignId,
          campaign_name: campaigns.find(c => c.id === campaignId)?.name || t.token_name || "N/A",
          token: t.token_key,
          is_active: t.is_active,
          created_at: t.created_at,
          last_used_at: t.last_used_at,
          usage_count: t.usage_count
        };
      });

      setTokens(mappedTokens);
    } catch (error) {
      console.error("Error fetching tokens:", error);
    }
    setLoading(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    toast.success("Copiado!");
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const generateToken = async () => {
    if (!selectedCampaign) {
      toast.error("Selecione uma campanha");
      return;
    }

    try {
      const campaignName = campaigns.find(c => c.id === selectedCampaign)?.name || "Campanha";
      const tokenName = newTokenName || `Token - ${campaignName}`;
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      
      const { data, error } = await supabase
        .from("scoped_api_tokens")
        .insert({
          organization_id: activeCompany?.id,
          token_name: tokenName,
          description: `Token de API para campanha: ${campaignName}`,
          scopes: [`campaign:${selectedCampaign}`, 'leads.write'],
          is_active: true,
          created_by: businessUserId
        })
        .select('token_key')
        .single();

      if (error) throw error;

      setNewlyGeneratedToken(data.token_key);
      await fetchTokens();
      toast.success("Token gerado com sucesso!");
    } catch (error: any) {
      console.error("Error generating token:", error);
      toast.error("Erro ao gerar token: " + (error.message || "Erro desconhecido"));
    }
  };

  const toggleToken = async (tokenId: string, isActive: boolean) => {
    try {
      await supabase
        .from("scoped_api_tokens")
        .update({ is_active: !isActive })
        .eq("id", tokenId);

      await fetchTokens();
      toast.success(isActive ? "Token desativado" : "Token ativado");
    } catch (error) {
      toast.error("Erro ao atualizar token");
    }
  };

  const deleteToken = async (tokenId: string) => {
    if (!confirm("Tem a certeza que deseja eliminar este token?")) return;

    try {
      await supabase
        .from("scoped_api_tokens")
        .delete()
        .eq("id", tokenId);

      await fetchTokens();
      toast.success("Token eliminado");
    } catch (error) {
      toast.error("Erro ao eliminar token");
    }
  };

  const toggleTokenVisibility = (tokenId: string) => {
    setVisibleTokens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tokenId)) {
        newSet.delete(tokenId);
      } else {
        newSet.add(tokenId);
      }
      return newSet;
    });
  };

  const maskToken = (token: string) => {
    if (token.length <= 12) return token;
    return `${token.slice(0, 8)}...${token.slice(-4)}`;
  };

  // API Tester functions
  const executeApiRequest = async () => {
    setApiLoading(true);
    setApiResponse("");
    setApiStatus(null);
    
    try {
      const url = new URL(`${BASE_URL}/${apiEndpoint}`);
      
      // Add query params for GET requests
      if (apiMethod === "GET" && selectedCampaign) {
        url.searchParams.set("campaign_id", selectedCampaign);
      }
      
      const activeToken = tokens.find(t => t.campaign_id === selectedCampaign && t.is_active)?.token;
      
      const options: RequestInit = {
        method: apiMethod,
        headers: {
          "Content-Type": "application/json",
          ...(activeToken ? { "X-API-Key": activeToken } : {})
        }
      };
      
      if (apiMethod !== "GET" && apiBody) {
        try {
          options.body = apiBody;
        } catch {
          toast.error("JSON inválido no body");
          setApiLoading(false);
          return;
        }
      }
      
      const response = await fetch(url.toString(), options);
      setApiStatus(response.status);
      
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        setApiResponse(JSON.stringify(json, null, 2));
      } catch {
        setApiResponse(text);
      }
    } catch (error: any) {
      setApiResponse(`Erro: ${error.message}`);
      setApiStatus(0);
    } finally {
      setApiLoading(false);
    }
  };

  const loadFormPreview = async () => {
    if (!selectedCampaign) {
      toast.error("Selecione uma campanha primeiro");
      return;
    }
    
    setPreviewLoading(true);
    setPreviewFormData(null);
    setPreviewCurrentStep(0);
    setPreviewFormValues({});
    
    try {
      const response = await fetch(`${BASE_URL}/get-campaign-form?campaign_id=${selectedCampaign}`);
      const data = await response.json();
      
      if (data.error) {
        toast.error(data.error);
        return;
      }
      
      setPreviewFormData(data);
    } catch (error: any) {
      toast.error("Erro ao carregar formulário: " + error.message);
    } finally {
      setPreviewLoading(false);
    }
  };


  // Get preview options for select fields - handles entity_options and regular options
  const getPreviewSelectOptions = (field: any): { value: string; label: string }[] => {
    // If has entity_options (ref_service, ref_district, etc.)
    if (field.entity_options && field.entity_options.length > 0) {
      const entityIds = field.options?.entity_ids;
      const filteredOptions = entityIds && entityIds.length > 0
        ? field.entity_options.filter((opt: any) => entityIds.includes(opt.id))
        : field.entity_options;
      return filteredOptions.map((opt: any) => ({ value: opt.id, label: opt.label || opt.name }));
    }
    // Regular options
    if (field.options) {
      if (Array.isArray(field.options)) {
        return field.options.map((opt: string) => ({ value: opt, label: opt }));
      }
      if (field.options.options && Array.isArray(field.options.options)) {
        return field.options.options.map((opt: string) => ({ value: opt, label: opt }));
      }
    }
    return [];
  };

  // Get icon for option in preview
  const getPreviewOptionIcon = (optLabel: string, optValue: string, isSelected: boolean, field: any) => {
    const branding = previewFormData?.branding;
    const iconColor = branding?.icon_color || '#000000';
    const iconSelectedColor = branding?.icon_selected_color || '#000000';
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

  // Check if a field is district-related
  const isDistrictField = (field: any): boolean => {
    const lowerKey = field.field_key.toLowerCase();
    return field.system_entity_type === 'districts' || 
           field.field_type === 'ref_district' ||
           lowerKey.includes('district') || 
           lowerKey.includes('distrito');
  };

  // Check location validity for preview
  const checkPreviewLocationValidity = (selectedDistrictId: string) => {
    if (!previewFormData?.location_required || !previewFormData?.allowed_districts?.length) {
      setPreviewLocationRejected(false);
      return;
    }
    const isAllowed = previewFormData.allowed_districts.some((d: any) => d.id === selectedDistrictId);
    setPreviewLocationRejected(!isAllowed);
  };

  // Handle multi-select change in preview
  const handlePreviewMultiSelectChange = (fieldKey: string, optionValue: string, checked: boolean) => {
    setPreviewFormValues(prev => {
      const currentValues = prev[fieldKey] || [];
      if (checked) {
        return { ...prev, [fieldKey]: [...currentValues, optionValue] };
      } else {
        return { ...prev, [fieldKey]: currentValues.filter((v: string) => v !== optionValue) };
      }
    });
  };

  // Validate current step in preview
  const validatePreviewCurrentStep = () => {
    if (!previewFormData) return true;
    const step = previewFormData.steps?.[previewCurrentStep];
    if (!step) return true;

    const errors: Record<string, string> = {};
    
    for (const field of step.fields || []) {
      const locationFieldRequired = previewFormData.location_required && isDistrictField(field);
      
      if (field.is_required || locationFieldRequired) {
        const value = previewFormValues[field.field_key];
        if (!value || (Array.isArray(value) && value.length === 0)) {
          errors[field.field_key] = `O campo "${field.field_label}" é obrigatório`;
        }
      }
    }
    
    setPreviewValidationErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return false;
    }
    
    if (previewLocationRejected) {
      toast.error("A localização selecionada não está disponível para esta campanha");
      return false;
    }
    
    return true;
  };

  // Handle preview input change with location check
  const handlePreviewInputChange = (fieldKey: string, value: any, field?: any) => {
    setPreviewFormValues(prev => ({ ...prev, [fieldKey]: value }));
    // Clear validation error when user types
    if (previewValidationErrors[fieldKey]) {
      setPreviewValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldKey];
        return newErrors;
      });
    }
    // Check location if this is a district field
    if (field && isDistrictField(field)) {
      checkPreviewLocationValidity(value);
    }
  };

  // Render a single field in preview (matching PublicLeadForm logic)
  const renderPreviewField = (field: any) => {
    const value = previewFormValues[field.field_key];
    const branding = previewFormData?.branding;
    const primaryColor = branding?.primary_color || '#85D3BE';
    const radioButtonColor = branding?.radio_button_color || primaryColor;
    const hasError = !!previewValidationErrors[field.field_key];

    const selectOptions = getPreviewSelectOptions(field);

    switch (field.field_type) {
      case "textarea":
        return (
          <div className="space-y-1">
            <Textarea
              value={value || ""}
              onChange={(e) => handlePreviewInputChange(field.field_key, e.target.value)}
              placeholder={field.placeholder || field.field_label}
              className={`min-h-[100px] ${hasError ? 'border-red-500' : ''}`}
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
        
        // Cards/Icon Cards style
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
                const icon = getPreviewOptionIcon(opt.label, opt.value, isSelected, field);
                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      if (field.is_multi_select) {
                        handlePreviewMultiSelectChange(field.field_key, opt.value, !isSelected);
                      } else {
                        handlePreviewInputChange(field.field_key, opt.value, field);
                      }
                    }}
                    className="relative flex flex-col items-center justify-center gap-3 p-6 min-h-[140px] border-2 rounded-2xl cursor-pointer transition-all hover:shadow-lg"
                    style={{
                      borderColor: isSelected ? primaryColor : 'hsl(var(--muted))',
                      backgroundColor: isSelected ? `${primaryColor}10` : undefined,
                      boxShadow: isSelected ? `0 0 0 2px ${primaryColor}33` : undefined,
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
                          ? 'shadow-lg' 
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
                      isSelected ? '' : 'text-foreground'
                    }`} style={isSelected ? { color: primaryColor } : undefined}>
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
                const icon = getPreviewOptionIcon(opt.label, opt.value, isChecked, field);
                return (
                  <div 
                    key={opt.value} 
                    className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-all"
                    style={{
                      borderColor: isChecked ? primaryColor : undefined,
                      backgroundColor: isChecked ? `${primaryColor}10` : undefined,
                      boxShadow: isChecked ? `0 0 0 1px ${primaryColor}` : undefined,
                    }}
                    onClick={() => handlePreviewMultiSelectChange(field.field_key, opt.value, !isChecked)}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => handlePreviewMultiSelectChange(field.field_key, opt.value, !!checked)}
                      style={{
                        borderColor: isChecked ? primaryColor : undefined,
                        backgroundColor: isChecked ? primaryColor : undefined,
                      }}
                    />
                    {icon && <span className="flex-shrink-0">{icon}</span>}
                    <span className="cursor-pointer flex-1 font-normal">
                      {opt.label}
                    </span>
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
                const icon = getPreviewOptionIcon(opt.label, opt.value, isSelected, field);
                return (
                  <div
                    key={opt.value}
                    className="flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all"
                    style={{
                      borderColor: isSelected ? primaryColor : undefined,
                      backgroundColor: isSelected ? `${primaryColor}10` : undefined,
                    }}
                    onClick={() => handlePreviewInputChange(field.field_key, opt.value, field)}
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
                const icon = getPreviewOptionIcon(opt.label, opt.value, isSelected, field);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handlePreviewInputChange(field.field_key, opt.value, field)}
                    className="flex items-center justify-center gap-3 p-4 border-2 rounded-xl transition-all text-base font-medium"
                    style={isSelected ? { 
                      backgroundColor: primaryColor,
                      borderColor: primaryColor,
                      color: branding?.button_text_color || '#fff'
                    } : {
                      borderColor: 'hsl(var(--muted))',
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
          <Select 
            value={value || ""} 
            onValueChange={(v) => handlePreviewInputChange(field.field_key, v, field)}
          >
            <SelectTrigger className={hasError ? 'border-red-500' : ''}>
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
              checked={!!value}
              onCheckedChange={(checked) => handlePreviewInputChange(field.field_key, checked)}
            />
            <Label>{field.field_label}</Label>
          </div>
        );

      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => handlePreviewInputChange(field.field_key, e.target.value)}
            placeholder={field.placeholder || field.field_label}
            className={hasError ? 'border-red-500' : ''}
          />
        );

      case "date":
        return (
          <Input
            type="date"
            value={value || ""}
            onChange={(e) => handlePreviewInputChange(field.field_key, e.target.value)}
            className={hasError ? 'border-red-500' : ''}
          />
        );

      case "email":
        return (
          <div className="space-y-1">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="email"
                value={value || ""}
                onChange={(e) => handlePreviewInputChange(field.field_key, e.target.value)}
                placeholder={field.placeholder || field.field_label}
                className={`pl-12 h-12 text-base rounded-xl ${hasError ? 'border-red-500' : ''}`}
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
                type="tel"
                value={value || ""}
                onChange={(e) => {
                  const numericValue = e.target.value.replace(/[^0-9]/g, '');
                  handlePreviewInputChange(field.field_key, numericValue);
                }}
                placeholder={field.placeholder || field.field_label}
                className={`pl-12 h-12 text-base rounded-xl ${hasError ? 'border-red-500' : ''}`}
              />
            </div>
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );

      default: {
        const fieldIcon = getFieldTypeIcon(field.field_type, field.field_key);
        const customIcon = field.field_icon ? <DynamicIcon name={field.field_icon} className="h-5 w-5 text-muted-foreground" /> : null;
        const icon = customIcon || fieldIcon;
        
        return (
          <div className="space-y-1">
            <div className="relative">
              {icon && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  {icon}
                </div>
              )}
              <Input
                type="text"
                value={value || ""}
                onChange={(e) => handlePreviewInputChange(field.field_key, e.target.value)}
                placeholder={field.placeholder || field.field_label}
                className={`h-12 text-base rounded-xl ${icon ? 'pl-12' : ''} ${hasError ? 'border-red-500' : ''}`}
              />
            </div>
            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
          </div>
        );
      }
    }
  };

  const getEndpointBodyTemplate = (endpoint: string): string => {
    const templates: Record<string, any> = {
      "create-lead": {
        campaign_id: selectedCampaign || "CAMPAIGN_ID",
        step_number: 1,
        field_values: {
          nome: "João Silva",
          email: "joao@example.com",
          telefone: "912345678"
        }
      },
      "update-lead": {
        lead_id: "LEAD_ID",
        campaign_id: selectedCampaign || "CAMPAIGN_ID",
        step_number: 2,
        field_values: {
          campo_adicional: "valor"
        }
      }
    };
    return templates[endpoint] ? JSON.stringify(templates[endpoint], null, 2) : "";
  };

  const getIframeCode = (campaignId: string) => {
    // Responsive iFrame snippet - 100% inline styles (no external CSS needed)
    return `<iframe
  src="${APP_URL}/form/${campaignId}"
  title="Formulário da campanha"
  loading="lazy"
  allowfullscreen
  style="width:100%; aspect-ratio:16/9; max-height:80vh; min-height:560px; border:0; border-radius:12px;"
></iframe>`;
  };

  const getJsEmbedCode = (campaignId: string, token: string) => {
    return `<div id="olyvia-form">
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;">
    <div class="olyvia-spinner"></div>
    <p style="color:#6b7280;margin:0;font-size:14px;">A carregar...</p>
  </div>
  <style>@keyframes olyvia-spin{to{transform:rotate(360deg)}}.olyvia-spinner{width:40px;height:40px;border:3px solid #e5e7eb;border-top-color:#85D3BE;border-radius:50%;animation:olyvia-spin 0.8s linear infinite;}</style>
</div>
<script>
(function() {
  var config = {
    campaignId: "${campaignId}",
    token: "${token}",
    container: "#olyvia-form",
    apiUrl: "${BASE_URL}",
    onSubmit: function(data) { console.log("Lead submitted:", data); },
    onError: function(error) {
      console.error("Form error:", error);
      var c = document.querySelector("#olyvia-form");
      if (c) c.innerHTML = '<div style="text-align:center;padding:48px;background:#fef2f2;border-radius:16px;"><h3 style="color:#dc2626;margin:0 0 12px;">Erro</h3><p style="color:#991b1b;margin:0;">Erro ao carregar formulário. Tente novamente.</p></div>';
    }
  };

  var icons = {
    user: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    mail: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>',
    phone: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    zap: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
    clock: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    home: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    utensils: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg>',
    bath: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"></path><line x1="10" x2="8" y1="5" y2="7"></line><line x1="2" x2="22" y1="12" y2="12"></line><line x1="7" x2="7" y1="19" y2="21"></line><line x1="17" x2="17" y1="19" y2="21"></line></svg>',
    wrench: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
    help: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" x2="12.01" y1="17" y2="17"></line></svg>',
    mapPin: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>'
  };

  fetch(config.apiUrl + "/get-campaign-form?campaign_id=" + config.campaignId)
    .then(function(r) { return r.json(); })
    .then(function(formData) {
      if (formData.error) { config.onError(new Error(formData.error)); return; }
      renderForm(formData, config);
    })
    .catch(config.onError);

  function renderForm(formData, config) {
    var container = document.querySelector(config.container);
    if (!container) return;
    if (!formData.steps || formData.steps.length === 0) {
      container.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">Formulário não configurado.</p>';
      return;
    }

    var currentStep = 0;
    var leadId = null;
    var formValues = {};
    var validationErrors = {};
    var locationRejected = false;
    
    // ALL styling from branding - 100% dynamic
    var b = formData.branding || {};
    var primaryColor = b.primary_color || '#85D3BE';
    var secondaryColor = b.secondary_color || '#f3f4f6';
    var backgroundColor = b.background_color || '#ffffff';
    var textColor = b.text_color || '#1f2937';
    var buttonTextColor = b.button_text_color || '#ffffff';
    var accentColor = b.accent_color || primaryColor;
    var radioButtonColor = b.radio_button_color || primaryColor;
    var iconColor = b.icon_color || '#6b7280';
    var iconSelectedColor = b.icon_selected_color || buttonTextColor;
    var fontFamily = b.font_family || 'system-ui, -apple-system, sans-serif';
    var headingFontFamily = b.heading_font_family || fontFamily;
    var borderRadius = b.border_radius || '12px';
    var backBtnBg = b.back_button_bg_color || '#f3f4f6';
    var backBtnText = b.back_button_text_color || '#374151';
    var backBtnBorder = b.back_button_border_color || '#e5e7eb';
    var backBtnHover = b.back_button_hover_bg_color || '#e5e7eb';
    
    // Granular element styling from branding
    var inputBorderRadius = b.input_border_radius || '10px';
    var inputBorderWidth = b.input_border_width || '1px';
    var inputBorderColor = b.input_border_color || '#e5e7eb';
    var inputFocusBorderColor = b.input_focus_border_color || primaryColor;
    var inputBgColor = b.input_background_color || backgroundColor;
    var inputPadding = b.input_padding || '12px 14px';
    var inputFontSize = b.input_font_size || '15px';
    
    var cardBorderRadius = b.card_border_radius || '16px';
    var cardBorderWidth = b.card_border_width || '2px';
    var cardBorderColor = b.card_border_color || '#e5e7eb';
    var cardIconSize = b.card_icon_size || '56px';
    var cardIconBorderRadius = b.card_icon_border_radius || '14px';
    var cardPadding = b.card_padding || '24px 16px';
    var cardMinHeight = b.card_min_height || '140px';
    
    var radioBorderRadius = b.radio_border_radius || '12px';
    var radioBorderWidth = b.radio_border_width || '2px';
    var radioCircleSize = b.radio_circle_size || '20px';
    var radioInnerSize = b.radio_inner_size || '10px';
    var radioPadding = b.radio_padding || '14px 16px';
    
    var checkboxBorderRadius = b.checkbox_border_radius || '10px';
    var checkboxBorderWidth = b.checkbox_border_width || '1px';
    var checkboxSize = b.checkbox_size || '20px';
    var checkboxPadding = b.checkbox_padding || '14px 16px';
    
    var buttonOptionBorderRadius = b.button_option_border_radius || '12px';
    var buttonOptionBorderWidth = b.button_option_border_width || '2px';
    var buttonOptionPadding = b.button_option_padding || '14px';
    
    var navButtonBorderRadius = b.nav_button_border_radius || '10px';
    var navButtonPadding = b.nav_button_padding || '14px 24px';
    var navButtonFontSize = b.nav_button_font_size || '15px';
    
    var stepBorderRadius = b.step_border_radius || '16px';
    var stepPadding = b.step_padding || '32px';
    var stepBorderWidth = b.step_border_width || '1px';
    var stepBorderColor = b.step_border_color || '#e5e7eb';
    var stepShadow = b.step_shadow || '0 1px 3px 0 rgb(0 0 0 / 0.1)';
    
    var infoBlockBorderRadius = b.info_block_border_radius || '12px';
    var infoBlockPadding = b.info_block_padding || '16px 20px';
    var infoBlockBgOpacity = b.info_block_background_opacity || '15';
    
    var progressBarHeight = b.progress_bar_height || '6px';
    var progressBarBorderRadius = b.progress_bar_border_radius || '3px';
    
    var selectBorderRadius = b.select_border_radius || '10px';
    var selectBorderWidth = b.select_border_width || '1px';
    
    var successIconSize = b.success_icon_size || '80px';
    var successBorderRadius = b.success_border_radius || '16px';
    
    // Load Google Fonts if specified
    function loadGoogleFont(fontName) {
      if (!fontName || fontName === 'inherit' || fontName.includes('system')) return;
      var cleanName = fontName.replace(/['"]/g, '').split(',')[0].trim();
      if (!cleanName) return;
      var linkId = 'olyvia-font-' + cleanName.replace(/\\s+/g, '-');
      if (document.getElementById(linkId)) return;
      var link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(cleanName) + ':wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
    loadGoogleFont(fontFamily);
    if (headingFontFamily !== fontFamily) loadGoogleFont(headingFontFamily);

    function getSelectOptions(field) {
      if (field.entity_options && field.entity_options.length > 0) {
        var entityIds = field.options && field.options.entity_ids;
        var filtered = entityIds && entityIds.length > 0
          ? field.entity_options.filter(function(opt) { return entityIds.includes(opt.id); })
          : field.entity_options;
        return filtered.map(function(opt) { return { value: opt.id, label: opt.label || opt.name }; });
      }
      if (!field.options) return [];
      if (Array.isArray(field.options)) return field.options.map(function(o) { return { value: o, label: o }; });
      if (field.options.options && Array.isArray(field.options.options)) {
        return field.options.options.map(function(o) { return { value: o, label: o }; });
      }
      return [];
    }



    function escapeHtml(value) {
      if (value === null || value === undefined) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function safeUrl(value) {
      if (!value) return '';
      try {
        var url = new URL(String(value), window.location.origin);
        if (['http:', 'https:', 'mailto:', 'tel:'].indexOf(url.protocol) === -1) return '';
        return escapeHtml(url.href);
      } catch (e) {
        return '';
      }
    }

    function getFieldIcon(fieldType, fieldKey) {
      var key = fieldKey.toLowerCase();
      if (fieldType === 'email' || key.includes('email')) return icons.mail;
      if (fieldType === 'phone' || key.includes('phone') || key.includes('telefone')) return icons.phone;
      if (key.includes('nome') || key.includes('name')) return icons.user;
      return null;
    }

    function getOptionIcon(label, isSelected, field) {
      var color = isSelected ? iconSelectedColor : iconColor;
      var iconSvg = null;

      // 1) Configured icon name from form builder (Lucide name).
      // The embedded script ships only a small SVG dictionary, so we map
      // configured names to the closest available SVG. Unknown names fall
      // back to the heuristic so the option is never iconless when the user
      // explicitly chose one.
      if (field && field.option_icon_names && typeof field.option_icon_names === 'object') {
        var configured = field.option_icon_names[label] || field.option_icon_names[String(label || '').trim()];
        if (configured) {
          var key = String(configured).toLowerCase();
          // direct hits in our dictionary
          if (icons[key]) iconSvg = icons[key];
          else if (key.indexOf('bath') !== -1 || key.indexOf('shower') !== -1) iconSvg = icons.bath;
          else if (key.indexOf('utensil') !== -1 || key.indexOf('chef') !== -1 || key.indexOf('cook') !== -1) iconSvg = icons.utensils;
          else if (key.indexOf('home') !== -1 || key.indexOf('house') !== -1 || key.indexOf('building') !== -1) iconSvg = icons.home;
          else if (key.indexOf('wrench') !== -1 || key.indexOf('hammer') !== -1 || key.indexOf('drill') !== -1 || key.indexOf('construction') !== -1) iconSvg = icons.wrench;
          else if (key.indexOf('clock') !== -1 || key.indexOf('timer') !== -1) iconSvg = icons.clock;
          else if (key.indexOf('zap') !== -1 || key.indexOf('bolt') !== -1) iconSvg = icons.zap;
        }
      }

      // 2) Heuristic fallback by label keyword
      if (!iconSvg) {
        var lowerLabel = String(label || '').toLowerCase();
        if (lowerLabel.includes('urgente') || lowerLabel.includes('urgent')) iconSvg = icons.zap;
        else if (lowerLabel.includes('normal') || lowerLabel.includes('prazo')) iconSvg = icons.clock;
        else if (lowerLabel.includes('cozinha') || lowerLabel.includes('kitchen')) iconSvg = icons.utensils;
        else if (lowerLabel.includes('banho') || lowerLabel.includes('bath')) iconSvg = icons.bath;
        else if (lowerLabel.includes('casa') || lowerLabel.includes('home')) iconSvg = icons.home;
        else if (lowerLabel.includes('reparação') || lowerLabel.includes('repair')) iconSvg = icons.wrench;
      }

      if (iconSvg) {
        return '<span style="color:' + color + '">' + iconSvg + '</span>';
      }
      return null;
    }

    function isDistrictField(field) {
      var key = field.field_key.toLowerCase();
      return field.system_entity_type === 'districts' || 
             field.field_type === 'ref_district' ||
             key.includes('district') || 
             key.includes('distrito');
    }

    function checkLocationValidity(value) {
      if (!formData.location_required || !formData.allowed_districts || !formData.allowed_districts.length) {
        locationRejected = false;
        updateLocationWarning();
        return;
      }
      var isAllowed = formData.allowed_districts.some(function(d) { return d.id === value; });
      locationRejected = !isAllowed;
      updateLocationWarning();
    }

    function updateLocationWarning() {
      var warning = container.querySelector('.olyvia-location-warning');
      if (locationRejected) {
        if (!warning) {
          var warningHtml = '<div class="olyvia-location-warning"><span>' + icons.mapPin + '</span><div><strong>' + 
            escapeHtml(b.location_not_available_title || 'Localização não disponível') + '</strong><p>' +
            escapeHtml(b.location_rejection_message || 'Infelizmente, não prestamos serviços na sua área de momento.') + '</p></div></div>';
          var form = container.querySelector('.olyvia-step');
          if (form) form.insertAdjacentHTML('afterbegin', warningHtml);
        }
      } else if (warning) {
        warning.remove();
      }
    }

    function validateCurrentStep() {
      var stepData = formData.steps[currentStep];
      if (!stepData) return true;
      
      validationErrors = {};
      var fields = stepData.fields || [];
      
      fields.forEach(function(field) {
        var isLocationField = formData.location_required && isDistrictField(field);
        if (field.is_required || isLocationField) {
          // Get value directly from DOM, not from formValues
          var value = getFieldValue(field);
          if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
            validationErrors[field.field_key] = 'Campo obrigatório';
          }
        }
      });
      
      updateValidationUI();
      
      if (Object.keys(validationErrors).length > 0) {
        return false;
      }
      
      if (locationRejected) {
        return false;
      }
      
      return true;
    }

    function updateValidationUI() {
      Object.keys(validationErrors).forEach(function(key) {
        var fieldEl = container.querySelector('[data-field="' + key + '"]');
        if (fieldEl) {
          fieldEl.classList.add('olyvia-field-error');
          var errorEl = fieldEl.querySelector('.olyvia-error-msg');
          if (!errorEl) {
            fieldEl.insertAdjacentHTML('beforeend', '<span class="olyvia-error-msg">' + escapeHtml(validationErrors[key]) + '</span>');
          }
        }
      });
    }

    function clearFieldError(fieldKey) {
      delete validationErrors[fieldKey];
      var fieldEl = container.querySelector('[data-field="' + fieldKey + '"]');
      if (fieldEl) {
        fieldEl.classList.remove('olyvia-field-error');
        var errorEl = fieldEl.querySelector('.olyvia-error-msg');
        if (errorEl) errorEl.remove();
      }
    }

    function showStepLoading() {
      var loadingHtml = '<div class="olyvia-step-loading">';
      loadingHtml += '<div class="olyvia-loading-spinner"></div>';
      loadingHtml += '<p>' + escapeHtml(b.step_loading_text || 'A processar...') + '</p>';
      loadingHtml += '</div>';
      container.innerHTML = loadingHtml;
    }

    function buildStep(stepData) {
      var totalSteps = formData.steps.length;
      var progress = ((currentStep + 1) / totalSteps) * 100;
      
      var html = '<div class="olyvia-step">';
      
      // Progress bar
      html += '<div class="olyvia-progress">';
      html += '<div class="olyvia-progress-header"><span>' + escapeHtml(b.step_text || 'Passo') + ' ' + (currentStep + 1) + ' ' + escapeHtml(b.of_text || 'de') + ' ' + totalSteps + '</span><span>' + Math.round(progress) + '%</span></div>';
      html += '<div class="olyvia-progress-bar"><div class="olyvia-progress-fill" style="width:' + progress + '%"></div></div>';
      html += '</div>';
      
      html += '<h2>' + escapeHtml(stepData.step_title || 'Passo ' + (currentStep + 1)) + '</h2>';
      
      if (stepData.step_description) {
        html += '<p class="olyvia-step-desc">' + escapeHtml(stepData.step_description) + '</p>';
      }

      // Info blocks
      if (stepData.info_blocks) {
        stepData.info_blocks.forEach(function(block) {
          html += '<div class="olyvia-info-block">';
          html += '<strong>' + escapeHtml(block.title) + '</strong><p>' + escapeHtml(block.content) + '</p></div>';
        });
      }

      var fields = stepData.fields || [];
      fields.forEach(function(field) {
        html += '<div class="olyvia-field" data-field="' + escapeHtml(field.field_key) + '">';
        html += '<label>' + escapeHtml(field.field_label) + (field.is_required ? ' <span class="olyvia-required">*</span>' : '') + '</label>';
        
        var fieldType = field.field_type || 'text';
        var displayStyle = field.display_style || 'dropdown';
        var selectOptions = getSelectOptions(field);
        
        // Handle select-like types with display styles
        if (['select', 'ref_service', 'ref_product', 'ref_business_unit', 'ref_department', 'ref_district'].includes(fieldType)) {
          
          // Cards / Icon Cards style
          if (displayStyle === 'cards' || displayStyle === 'icon_cards') {
            var cols = selectOptions.length === 2 ? 2 : (selectOptions.length === 3 ? 3 : 4);
            html += '<div class="olyvia-cards olyvia-cols-' + cols + '" data-name="' + escapeHtml(field.field_key) + '" data-multi="' + (field.is_multi_select ? 'true' : 'false') + '">';
            selectOptions.forEach(function(opt) {
              var icon = getOptionIcon(opt.label, false, field) || icons.help;
              html += '<div class="olyvia-card" data-value="' + escapeHtml(opt.value) + '">';
              html += '<div class="olyvia-card-check" style="background:' + primaryColor + '">' + icons.check + '</div>';
              html += '<div class="olyvia-card-icon">' + icon + '</div>';
              html += '<span>' + escapeHtml(opt.label) + '</span></div>';
            });
            html += '</div>';
          }
          // Checkbox style
          else if (field.is_multi_select || displayStyle === 'checkbox') {
            html += '<div class="olyvia-checkboxes" data-name="' + escapeHtml(field.field_key) + '">';
            selectOptions.forEach(function(opt) {
              var icon = getOptionIcon(opt.label, false, field);
              html += '<label class="olyvia-checkbox-item" data-value="' + escapeHtml(opt.value) + '">';
              html += '<input type="checkbox" name="' + escapeHtml(field.field_key) + '" value="' + escapeHtml(opt.value) + '" />';
              if (icon) html += icon;
              html += '<span>' + escapeHtml(opt.label) + '</span></label>';
            });
            html += '</div>';
          }
          // Radio style
          else if (displayStyle === 'radio') {
            var radioCols = selectOptions.length === 2 ? 2 : 1;
            html += '<div class="olyvia-radios olyvia-cols-' + radioCols + '" data-name="' + escapeHtml(field.field_key) + '">';
            selectOptions.forEach(function(opt) {
              var icon = getOptionIcon(opt.label, false, field);
              html += '<label class="olyvia-radio-item" data-value="' + escapeHtml(opt.value) + '">';
              html += '<span class="olyvia-radio-circle"></span>';
              if (icon) html += icon;
              html += '<span>' + escapeHtml(opt.label) + '</span></label>';
            });
            html += '</div>';
          }
          // Buttons style
          else if (displayStyle === 'buttons') {
            html += '<div class="olyvia-buttons-grid" data-name="' + escapeHtml(field.field_key) + '">';
            selectOptions.forEach(function(opt) {
              var icon = getOptionIcon(opt.label, false, field);
              html += '<button type="button" class="olyvia-btn-option" data-value="' + escapeHtml(opt.value) + '">';
              if (icon) html += icon;
              html += escapeHtml(opt.label) + '</button>';
            });
            html += '</div>';
          }
          // Default dropdown
          else {
            html += '<select name="' + escapeHtml(field.field_key) + '" ' + (field.is_required ? 'required' : '') + '>';
            html += '<option value="">' + escapeHtml(b.select_placeholder || 'Selecione...') + '</option>';
            selectOptions.forEach(function(opt) {
              html += '<option value="' + escapeHtml(opt.value) + '">' + escapeHtml(opt.label) + '</option>';
            });
            html += '</select>';
          }
        }
        // Email field with icon
        else if (fieldType === 'email') {
          html += '<div class="olyvia-input-icon">';
          html += '<span class="olyvia-icon">' + icons.mail + '</span>';
          html += '<input type="email" name="' + escapeHtml(field.field_key) + '" placeholder="' + escapeHtml(field.placeholder || '') + '" ' + (field.is_required ? 'required' : '') + ' />';
          html += '</div>';
        }
        // Phone field with icon
        else if (fieldType === 'phone') {
          html += '<div class="olyvia-input-icon">';
          html += '<span class="olyvia-icon">' + icons.phone + '</span>';
          html += '<input type="tel" name="' + escapeHtml(field.field_key) + '" placeholder="' + escapeHtml(field.placeholder || '') + '" ' + (field.is_required ? 'required' : '') + ' />';
          html += '</div>';
        }
        // Text field (check for name icon)
        else if (fieldType === 'text') {
          var textIcon = getFieldIcon('text', field.field_key);
          if (textIcon) {
            html += '<div class="olyvia-input-icon">';
            html += '<span class="olyvia-icon">' + textIcon + '</span>';
            html += '<input type="text" name="' + escapeHtml(field.field_key) + '" placeholder="' + escapeHtml(field.placeholder || '') + '" ' + (field.is_required ? 'required' : '') + ' />';
            html += '</div>';
          } else {
            html += '<input type="text" name="' + escapeHtml(field.field_key) + '" placeholder="' + escapeHtml(field.placeholder || '') + '" ' + (field.is_required ? 'required' : '') + ' />';
          }
        }
        // Textarea
        else if (fieldType === 'textarea') {
          html += '<textarea name="' + escapeHtml(field.field_key) + '" rows="4" placeholder="' + escapeHtml(field.placeholder || '') + '" ' + (field.is_required ? 'required' : '') + '></textarea>';
        }
        // Checkbox
        else if (fieldType === 'checkbox') {
          html += '<label class="olyvia-checkbox"><input type="checkbox" name="' + escapeHtml(field.field_key) + '" ' + (field.is_required ? 'required' : '') + ' /> ' + escapeHtml(field.placeholder || 'Sim') + '</label>';
        }
        // Date
        else if (fieldType === 'date') {
          html += '<input type="date" name="' + escapeHtml(field.field_key) + '" ' + (field.is_required ? 'required' : '') + ' />';
        }
        // Number
        else if (fieldType === 'number') {
          html += '<input type="number" name="' + escapeHtml(field.field_key) + '" placeholder="' + escapeHtml(field.placeholder || '') + '" ' + (field.is_required ? 'required' : '') + ' />';
        }
        // Default text
        else {
          html += '<input type="text" name="' + escapeHtml(field.field_key) + '" placeholder="' + escapeHtml(field.placeholder || '') + '" ' + (field.is_required ? 'required' : '') + ' />';
        }
        
        if (field.help_text) {
          html += '<small class="olyvia-help">' + escapeHtml(field.help_text) + '</small>';
        }
        html += '</div>';
      });

      html += '<div class="olyvia-nav-buttons">';
      if (currentStep > 0) {
        html += '<button type="button" class="olyvia-prev">' + escapeHtml(b.previous_button_text || 'Anterior') + '</button>';
      }
      var nextText = currentStep === formData.steps.length - 1 
        ? escapeHtml(b.submit_button_text || 'Enviar')
        : escapeHtml(b.next_button_text || 'Próximo');
      html += '<button type="submit" class="olyvia-next">' + nextText + '</button>';
      html += '</div>';
      
      // Footer with privacy and terms links
      if (b.footer_text || b.privacy_policy_url || b.terms_url) {
        html += '<div class="olyvia-footer">';
        if (b.footer_text) {
          html += '<p class="olyvia-footer-text">' + escapeHtml(b.footer_text) + '</p>';
        }
        if (b.privacy_policy_url || b.terms_url) {
          html += '<div class="olyvia-footer-links">';
          if (b.privacy_policy_url) {
            var privacyUrl = safeUrl(b.privacy_policy_url); if (privacyUrl) html += '<a href="' + privacyUrl + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(b.privacy_policy_label || 'Política de Privacidade') + '</a>';
          }
          if (b.privacy_policy_url && b.terms_url) {
            html += '<span class="olyvia-footer-separator">•</span>';
          }
          if (b.terms_url) {
            var termsUrl = safeUrl(b.terms_url); if (termsUrl) html += '<a href="' + termsUrl + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(b.terms_label || 'Termos de Uso') + '</a>';
          }
          html += '</div>';
        }
        html += '</div>';
      }
      
      html += '</div>';

      return html;
    }

    function getFieldValue(field) {
      var displayStyle = field.display_style || 'dropdown';
      var fieldType = field.field_type || 'text';
      
      // Cards
      var cardsContainer = container.querySelector('.olyvia-cards[data-name="' + escapeHtml(field.field_key) + '"]');
      if (cardsContainer) {
        var selected = cardsContainer.querySelectorAll('.olyvia-card.selected');
        var values = [];
        selected.forEach(function(card) { values.push(card.dataset.value); });
        return field.is_multi_select ? values : (values[0] || null);
      }
      
      // Checkboxes
      var checkboxContainer = container.querySelector('.olyvia-checkboxes[data-name="' + escapeHtml(field.field_key) + '"]');
      if (checkboxContainer) {
        var checked = checkboxContainer.querySelectorAll('input:checked');
        var vals = [];
        checked.forEach(function(cb) { vals.push(cb.value); });
        return vals;
      }
      
      // Radios
      var radioContainer = container.querySelector('.olyvia-radios[data-name="' + escapeHtml(field.field_key) + '"]');
      if (radioContainer) {
        var selectedRadio = radioContainer.querySelector('.olyvia-radio-item.selected');
        return selectedRadio ? selectedRadio.dataset.value : null;
      }
      
      // Buttons grid
      var buttonsContainer = container.querySelector('.olyvia-buttons-grid[data-name="' + escapeHtml(field.field_key) + '"]');
      if (buttonsContainer) {
        var selectedBtn = buttonsContainer.querySelector('.olyvia-btn-option.selected');
        return selectedBtn ? selectedBtn.dataset.value : null;
      }
      
      // Standard inputs
      var input = container.querySelector('[name="' + escapeHtml(field.field_key) + '"]');
      if (!input) return null;
      if (input.type === 'checkbox') return input.checked;
      return input.value;
    }

    function submitStep(stepData) {
      if (!validateCurrentStep()) {
        return Promise.reject(new Error('Preencha todos os campos obrigatórios'));
      }
      
      var stepValues = {};
      var fields = stepData.fields || [];
      fields.forEach(function(field) {
        var val = getFieldValue(field);
        if (val !== null && val !== undefined) {
          formValues[field.field_key] = val;
          stepValues[field.field_key] = val;
        }
      });

      var endpoint = leadId ? '/update-lead' : '/create-lead';
      var body = leadId 
        ? { lead_id: leadId, campaign_id: config.campaignId, step_number: currentStep + 1, field_values: stepValues }
        : { campaign_id: config.campaignId, step_number: 1, field_values: stepValues };

      return fetch(config.apiUrl + endpoint, {
        method: leadId ? 'PATCH' : 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Key': config.token
        },
        body: JSON.stringify(body)
      })
      .then(function(response) { return response.json(); })
      .then(function(result) {
        if (result.success) {
          if (!leadId) leadId = result.lead_id;
          if (result.is_complete) {
            var successHtml = '<div class="olyvia-success">';
            successHtml += '<div class="olyvia-success-icon">' + icons.check.replace('width="16"', 'width="32"').replace('height="16"', 'height="32"') + '</div>';
            successHtml += '<h3>' + escapeHtml(b.success_title || 'Obrigado!') + '</h3>';
            successHtml += '<p>' + escapeHtml(b.success_message || 'O seu pedido foi submetido com sucesso.') + '</p>';
            if (b.contact_soon_text) successHtml += '<p>' + escapeHtml(b.contact_soon_text) + '</p>';
            successHtml += '</div>';
            container.innerHTML = successHtml;
            if (config.onSubmit) config.onSubmit(formValues);
          } else {
            // Show step loading animation (matching PublicLeadForm)
            showStepLoading();
            setTimeout(function() {
              currentStep++;
              container.innerHTML = buildStep(formData.steps[currentStep]);
              attachEvents();
            }, 600);
          }
        } else {
          throw new Error(result.error || 'Erro ao submeter');
        }
      });
    }

    function attachEvents() {
      var prevBtn = container.querySelector('.olyvia-prev');
      var nextBtn = container.querySelector('.olyvia-next');

      // Previous button
      if (prevBtn) {
        prevBtn.onclick = function() {
          validationErrors = {};
          currentStep--;
          container.innerHTML = buildStep(formData.steps[currentStep]);
          attachEvents();
        };
      }

      // Next/Submit button
      if (nextBtn) {
        nextBtn.onclick = function(e) {
          e.preventDefault();
          submitStep(formData.steps[currentStep]).catch(function(err) {
            console.error(err);
          });
        };
      }

      // Cards click
      container.querySelectorAll('.olyvia-card').forEach(function(card) {
        card.onclick = function() {
          var cardsContainer = card.parentElement;
          var isMulti = cardsContainer.dataset.multi === 'true';
          var fieldKey = cardsContainer.dataset.name;
          
          if (isMulti) {
            card.classList.toggle('selected');
          } else {
            cardsContainer.querySelectorAll('.olyvia-card').forEach(function(c) { c.classList.remove('selected'); });
            card.classList.add('selected');
          }
          
          // Update icon colors
          var isSelected = card.classList.contains('selected');
          var iconContainer = card.querySelector('.olyvia-card-icon');
          if (iconContainer) {
            iconContainer.style.background = isSelected ? primaryColor : '#f3f4f6';
            iconContainer.style.color = isSelected ? (branding.button_text_color || '#fff') : iconColor;
          }
          
          clearFieldError(fieldKey);
          
          // Check location
          var field = formData.steps[currentStep].fields.find(function(f) { return f.field_key === fieldKey; });
          if (field && isDistrictField(field)) {
            checkLocationValidity(card.dataset.value);
          }
        };
      });

      // Checkbox items
      container.querySelectorAll('.olyvia-checkbox-item input').forEach(function(input) {
        input.onchange = function() {
          var item = input.closest('.olyvia-checkbox-item');
          var checkboxContainer = input.closest('.olyvia-checkboxes');
          var fieldKey = checkboxContainer.dataset.name;
          
          if (input.checked) {
            item.style.borderColor = primaryColor;
            item.style.background = primaryColor + '10';
          } else {
            item.style.borderColor = '';
            item.style.background = '';
          }
          
          clearFieldError(fieldKey);
        };
      });

      // Radio items
      container.querySelectorAll('.olyvia-radio-item').forEach(function(item) {
        item.onclick = function() {
          var radioContainer = item.closest('.olyvia-radios');
          var fieldKey = radioContainer.dataset.name;
          
          radioContainer.querySelectorAll('.olyvia-radio-item').forEach(function(r) {
            r.classList.remove('selected');
            r.style.borderColor = '';
            r.style.background = '';
          });
          item.classList.add('selected');
          item.style.borderColor = primaryColor;
          item.style.background = primaryColor + '10';
          
          clearFieldError(fieldKey);
          
          var field = formData.steps[currentStep].fields.find(function(f) { return f.field_key === fieldKey; });
          if (field && isDistrictField(field)) {
            checkLocationValidity(item.dataset.value);
          }
        };
      });

      // Button options
      container.querySelectorAll('.olyvia-btn-option').forEach(function(btn) {
        btn.onclick = function() {
          var btnContainer = btn.closest('.olyvia-buttons-grid');
          var fieldKey = btnContainer.dataset.name;
          
          btnContainer.querySelectorAll('.olyvia-btn-option').forEach(function(b) {
            b.classList.remove('selected');
            b.style.background = '';
            b.style.borderColor = '#e5e7eb';
            b.style.color = '';
          });
          btn.classList.add('selected');
          btn.style.background = primaryColor;
          btn.style.borderColor = primaryColor;
          btn.style.color = branding.button_text_color || '#fff';
          
          clearFieldError(fieldKey);
          
          var field = formData.steps[currentStep].fields.find(function(f) { return f.field_key === fieldKey; });
          if (field && isDistrictField(field)) {
            checkLocationValidity(btn.dataset.value);
          }
        };
      });

      // Standard inputs - clear error on input
      container.querySelectorAll('input, select, textarea').forEach(function(input) {
        input.oninput = function() {
          clearFieldError(input.name);
        };
        input.onchange = function() {
          clearFieldError(input.name);
          // Check location for select
          if (input.tagName === 'SELECT') {
            var field = formData.steps[currentStep].fields.find(function(f) { return f.field_key === input.name; });
            if (field && isDistrictField(field)) {
              checkLocationValidity(input.value);
            }
          }
        };
      });

      // Phone input - only numbers
      container.querySelectorAll('input[type="tel"]').forEach(function(input) {
        input.oninput = function(e) {
          input.value = input.value.replace(/[^0-9]/g, '');
          clearFieldError(input.name);
        };
      });
    }

    // No longer need borderRadiusMap fallback - using granular values directly

    // Apply 100% dynamic styles from branding - matching PublicLeadForm exactly
    var style = document.createElement('style');
    style.textContent = \`
      @keyframes olyvia-spin { to { transform: rotate(360deg); } }
      #olyvia-form { font-family: \${fontFamily}; max-width: 640px; margin: 0 auto; color: \${textColor}; line-height: 1.5; }
      .olyvia-step { padding: \${stepPadding}; background: \${backgroundColor}; border-radius: \${stepBorderRadius}; border: \${stepBorderWidth} solid \${stepBorderColor}; box-shadow: \${stepShadow}; }
      .olyvia-step h2 { margin: 0 0 4px; font-size: 1.75rem; font-weight: 600; font-family: \${headingFontFamily}; color: \${textColor}; line-height: 1.2; }
      .olyvia-step-desc { margin: 0 0 20px; color: \${textColor}80; font-size: 0.9rem; }
      .olyvia-progress { margin-bottom: 20px; }
      .olyvia-progress-header { display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 500; color: \${textColor}70; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.025em; }
      .olyvia-progress-bar { height: \${progressBarHeight}; background: #e5e7eb; border-radius: \${progressBarBorderRadius}; overflow: hidden; display: flex; gap: 4px; }
      .olyvia-progress-fill { height: 100%; transition: width 0.3s ease; border-radius: \${progressBarBorderRadius}; background: \${primaryColor}; }
      .olyvia-section-title { font-size: 1rem; font-weight: 600; color: \${textColor}; margin: 24px 0 4px; }
      .olyvia-section-desc { font-size: 0.85rem; color: \${textColor}70; margin: 0 0 16px; }
      .olyvia-info-block { background: \${primaryColor}\${infoBlockBgOpacity}; padding: \${infoBlockPadding}; border-radius: \${infoBlockBorderRadius}; margin-bottom: 24px; }
      .olyvia-info-block strong { display: block; margin-bottom: 8px; font-weight: 600; font-size: 0.95rem; color: \${textColor}; }
      .olyvia-info-block p { margin: 0; font-size: 0.875rem; color: \${textColor}90; line-height: 1.6; }
      .olyvia-field { margin-bottom: 20px; }
      .olyvia-field > label { display: block; margin-bottom: 8px; font-weight: 600; color: \${textColor}; font-size: 0.875rem; }
      .olyvia-required { color: #ef4444; margin-left: 2px; }
      .olyvia-field-error input, .olyvia-field-error select, .olyvia-field-error textarea { border-color: #ef4444 !important; }
      .olyvia-field-error .olyvia-checkbox-item, .olyvia-field-error .olyvia-radio-item, .olyvia-field-error .olyvia-card { border-color: #ef4444 !important; }
      .olyvia-error-msg { display: block; color: #ef4444; font-size: 0.75rem; margin-top: 6px; }
      .olyvia-input-icon { position: relative; display: block; }
      .olyvia-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: \${iconColor}; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0.6; z-index: 1; width: 20px; height: 20px; }
      .olyvia-icon svg { width: 18px; height: 18px; flex-shrink: 0; }
      .olyvia-field input[type="text"], .olyvia-field input[type="email"], .olyvia-field input[type="tel"], .olyvia-field input[type="number"], .olyvia-field input[type="date"], .olyvia-field textarea { width: 100%; padding: \${inputPadding}; border: \${inputBorderWidth} solid \${inputBorderColor}; border-radius: \${inputBorderRadius}; font-size: \${inputFontSize}; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; background: \${inputBgColor}; color: \${textColor}; font-family: \${fontFamily}; }
      .olyvia-field select { width: 100%; padding: \${inputPadding}; border: \${selectBorderWidth} solid \${inputBorderColor}; border-radius: \${selectBorderRadius}; font-size: \${inputFontSize}; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; background: \${inputBgColor}; color: \${textColor}; font-family: \${fontFamily}; }
      .olyvia-field .olyvia-input-icon input[type="text"], .olyvia-field .olyvia-input-icon input[type="email"], .olyvia-field .olyvia-input-icon input[type="tel"] { padding-left: 46px !important; }
      .olyvia-field input::placeholder, .olyvia-field textarea::placeholder { color: \${textColor}50; }
      .olyvia-field input:focus, .olyvia-field select:focus, .olyvia-field textarea:focus { outline: none; border-color: \${inputFocusBorderColor}; box-shadow: 0 0 0 3px \${inputFocusBorderColor}15; }
      .olyvia-field textarea { resize: vertical; min-height: 100px; }
      .olyvia-cards { display: grid; gap: 14px; }
      .olyvia-cols-2 { grid-template-columns: repeat(2, 1fr); }
      .olyvia-cols-3 { grid-template-columns: repeat(3, 1fr); }
      .olyvia-cols-4 { grid-template-columns: repeat(2, 1fr); }
      @media (min-width: 640px) { .olyvia-cols-3 { grid-template-columns: repeat(3, 1fr); } .olyvia-cols-4 { grid-template-columns: repeat(4, 1fr); } }
      .olyvia-card { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: \${cardPadding}; min-height: \${cardMinHeight}; border: \${cardBorderWidth} solid \${cardBorderColor}; border-radius: \${cardBorderRadius}; cursor: pointer; transition: all 0.2s; text-align: center; background: \${backgroundColor}; }
      .olyvia-card:hover { border-color: \${primaryColor}60; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
      .olyvia-card.selected { border-color: \${primaryColor}; background: \${primaryColor}08; box-shadow: 0 0 0 3px \${primaryColor}20; }
      .olyvia-card-check { position: absolute; top: 12px; right: 12px; width: 22px; height: 22px; border-radius: 50%; background: \${primaryColor}; display: none; align-items: center; justify-content: center; color: \${buttonTextColor}; }
      .olyvia-card.selected .olyvia-card-check { display: flex; }
      .olyvia-card-icon { width: \${cardIconSize}; height: \${cardIconSize}; border-radius: \${cardIconBorderRadius}; background: #f3f4f6; display: flex; align-items: center; justify-content: center; transition: all 0.2s; color: \${textColor}; }
      .olyvia-card.selected .olyvia-card-icon { background: \${primaryColor}; color: \${buttonTextColor}; }
      .olyvia-card span:last-child { font-weight: 600; font-size: 0.9rem; color: \${textColor}; }
      .olyvia-checkboxes { display: flex; flex-direction: column; gap: 8px; }
      .olyvia-checkbox-item { display: flex; align-items: center; gap: 12px; padding: \${checkboxPadding}; border: \${checkboxBorderWidth} solid #e5e7eb; border-radius: \${checkboxBorderRadius}; cursor: pointer; transition: all 0.15s; background: \${backgroundColor}; }
      .olyvia-checkbox-item:hover { border-color: \${primaryColor}50; background: \${primaryColor}05; }
      .olyvia-checkbox-item input[type="checkbox"] { width: \${checkboxSize}; height: \${checkboxSize}; accent-color: \${primaryColor}; cursor: pointer; flex-shrink: 0; border-radius: 4px; }
      .olyvia-checkbox-item span { font-weight: 500; color: \${textColor}; font-size: 0.9rem; }
      .olyvia-radios { display: grid; gap: 10px; }
      .olyvia-radios.olyvia-cols-2 { grid-template-columns: repeat(2, 1fr); }
      .olyvia-radio-item { display: flex; align-items: center; gap: 12px; padding: \${radioPadding}; border: \${radioBorderWidth} solid #e5e7eb; border-radius: \${radioBorderRadius}; cursor: pointer; transition: all 0.15s; background: \${backgroundColor}; }
      .olyvia-radio-item:hover { border-color: \${primaryColor}50; background: \${primaryColor}05; }
      .olyvia-radio-item.selected { border-color: \${primaryColor}; background: \${primaryColor}08; }
      .olyvia-radio-circle { width: \${radioCircleSize}; height: \${radioCircleSize}; border: 2px solid \${radioButtonColor}50; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
      .olyvia-radio-item.selected .olyvia-radio-circle { border-color: \${radioButtonColor}; }
      .olyvia-radio-item.selected .olyvia-radio-circle::after { content: ''; width: \${radioInnerSize}; height: \${radioInnerSize}; background: \${radioButtonColor}; border-radius: 50%; }
      .olyvia-radio-item span { font-weight: 500; color: \${textColor}; font-size: 0.9rem; }
      .olyvia-buttons-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .olyvia-btn-option { display: flex; align-items: center; justify-content: center; gap: 10px; padding: \${buttonOptionPadding}; border: \${buttonOptionBorderWidth} solid #e5e7eb; border-radius: \${buttonOptionBorderRadius}; cursor: pointer; font-size: 0.95rem; font-weight: 500; background: \${backgroundColor}; transition: all 0.15s; color: \${textColor}; font-family: \${fontFamily}; }
      .olyvia-btn-option:hover { border-color: \${primaryColor}60; background: \${primaryColor}08; }
      .olyvia-btn-option.selected { background: \${primaryColor}; border-color: \${primaryColor}; color: \${buttonTextColor}; }
      .olyvia-checkbox { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 8px 0; font-weight: normal; }
      .olyvia-checkbox input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: \${primaryColor}; }
      .olyvia-help { display: block; margin-top: 6px; font-size: 0.8rem; color: \${textColor}70; }
      .olyvia-nav-buttons { display: flex; gap: 12px; margin-top: 28px; }
      .olyvia-prev, .olyvia-next { padding: \${navButtonPadding}; border-radius: \${navButtonBorderRadius}; cursor: pointer; font-size: \${navButtonFontSize}; font-weight: 600; transition: all 0.15s; font-family: \${fontFamily}; }
      .olyvia-prev { background: \${backBtnBg}; color: \${backBtnText}; border: 1px solid \${backBtnBorder}; }
      .olyvia-prev:hover { background: \${backBtnHover}; }
      .olyvia-next { flex: 1; border: none; background: \${primaryColor}; color: \${buttonTextColor}; }
      .olyvia-next:hover { filter: brightness(0.95); }
      .olyvia-next:disabled { opacity: 0.5; cursor: not-allowed; }
      .olyvia-success { text-align: center; padding: 48px 28px; background: \${backgroundColor}; border-radius: \${successBorderRadius}; }
      .olyvia-success-icon { width: \${successIconSize}; height: \${successIconSize}; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; background: \${primaryColor}15; color: \${primaryColor}; }
      .olyvia-success h3 { color: \${primaryColor}; margin: 0 0 12px; font-size: 1.75rem; font-weight: 600; font-family: \${headingFontFamily}; }
      .olyvia-success p { color: \${textColor}80; margin: 0 0 8px; font-size: 1rem; line-height: 1.5; }
      .olyvia-step-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 16px; background: \${backgroundColor}; border-radius: \${stepBorderRadius}; border: \${stepBorderWidth} solid \${stepBorderColor}; box-shadow: \${stepShadow}; min-height: 300px; }
      .olyvia-loading-spinner { width: 40px; height: 40px; border: 3px solid \${stepBorderColor}; border-top-color: \${primaryColor}; border-radius: 50%; animation: olyvia-spin 0.8s linear infinite; }
      .olyvia-step-loading p { margin: 0; color: \${textColor}80; font-size: 0.9rem; }
      .olyvia-location-warning { display: flex; gap: 12px; padding: 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: \${inputBorderRadius}; margin-bottom: 20px; color: #dc2626; }
      .olyvia-location-warning strong { display: block; margin-bottom: 4px; }
      .olyvia-location-warning p { margin: 0; font-size: 0.85rem; color: #991b1b; }
      .olyvia-footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid \${stepBorderColor}; }
      .olyvia-footer-text { font-size: 0.75rem; color: \${textColor}60; margin: 0 0 8px; line-height: 1.5; }
      .olyvia-footer-links { display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 0.75rem; }
      .olyvia-footer-links a { color: \${primaryColor}; text-decoration: underline; transition: opacity 0.15s; }
      .olyvia-footer-links a:hover { opacity: 0.8; }
      .olyvia-footer-separator { color: \${textColor}40; }
      \${b.custom_css || ''}
    \`;
    document.head.appendChild(style);

    // Initial render
    container.innerHTML = buildStep(formData.steps[0]);
    attachEvents();
  }
})();
</script>`;
  };

  const getApiIntegrationCode = (campaignId: string, token: string) => {
    return `// 1. Obter estrutura do formulário
const formResponse = await fetch(
  "${BASE_URL}/get-campaign-form?campaign_id=${campaignId}"
);
const formData = await formResponse.json();

// 2. Criar lead (primeiro passo)
const createResponse = await fetch("${BASE_URL}/create-lead", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "${token}"
  },
  body: JSON.stringify({
    campaign_id: "${campaignId}",
    step_number: 1,
    field_values: {
      nome: "João Silva",
      email: "joao@email.com",
      telefone: "912345678"
    }
  })
});
const createResult = await createResponse.json();
const leadId = createResult.lead_id;

// 3. Atualizar lead (passos seguintes)
if (!createResult.is_complete) {
  const updateResponse = await fetch("${BASE_URL}/update-lead", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "${token}"
    },
    body: JSON.stringify({
      lead_id: leadId,
      step_number: 2,
      field_values: {
        distrito: "uuid-do-distrito",
        preferencia: "manha"
      }
    })
  });
  const updateResult = await updateResponse.json();
  console.log("Lead completo:", updateResult.is_complete);
}`;
  };

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Integração de Marketing</h1>
          <HelpButton pageKey="marketing.integration" />
        </div>
        <p className="text-muted-foreground">Configure tokens, iFrame, JavaScript ou API direta</p>
      </div>
      <Tabs defaultValue="tokens" className="space-y-6">
        <TabsList className={`grid w-full max-w-3xl ${hasIframeEnabledCampaigns ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <TabsTrigger value="tokens" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Tokens
          </TabsTrigger>
          {hasIframeEnabledCampaigns && (
            <TabsTrigger value="iframe" className="flex items-center gap-2">
              <LayoutIcon className="h-4 w-4" />
              iFrame
            </TabsTrigger>
          )}
          <TabsTrigger value="javascript" className="flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            JavaScript
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            API Direta
          </TabsTrigger>
          <TabsTrigger value="test" className="flex items-center gap-2">
            <TestTube2 className="h-4 w-4" />
            Testar
          </TabsTrigger>
        </TabsList>

        {/* Tab: Tokens */}
        <TabsContent value="tokens" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    Tokens de Campanha
                  </CardTitle>
                  <CardDescription>
                    Gere tokens de API para integrar campanhas específicas no seu site
                  </CardDescription>
                </div>
                <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Novo Token
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Gerar Novo Token</DialogTitle>
                      <DialogDescription>
                        Crie um token de API para integrar uma campanha
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Campanha</Label>
                        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma campanha" />
                          </SelectTrigger>
                          <SelectContent>
                            {campaigns.filter(c => c.status === "active").map(campaign => (
                              <SelectItem key={campaign.id} value={campaign.id}>
                                {campaign.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Nome do Token (opcional)</Label>
                        <Input 
                          placeholder="Ex: Website Principal"
                          value={newTokenName}
                          onChange={(e) => setNewTokenName(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowTokenDialog(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={generateToken}>
                        <Zap className="h-4 w-4 mr-2" />
                        Gerar Token
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {newlyGeneratedToken && (
                <Alert className="mb-6 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-600">Token Gerado com Sucesso!</AlertTitle>
                  <AlertDescription>
                    <p className="text-green-700 dark:text-green-300 mb-2">
                      Guarde este token num local seguro. Não será mostrado novamente.
                    </p>
                    <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-3 rounded border">
                      <code className="flex-1 text-sm font-mono break-all">{newlyGeneratedToken}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(newlyGeneratedToken, "new-token")}
                      >
                        {copiedItem === "new-token" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-3"
                      onClick={() => setNewlyGeneratedToken(null)}
                    >
                      Entendido
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {loading ? (
                <div className="text-center py-8 text-muted-foreground">A carregar...</div>
              ) : tokens.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum token criado ainda</p>
                  <p className="text-sm">Clique em "Novo Token" para começar</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Utilizações</TableHead>
                      <TableHead>Última Utilização</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map(token => (
                      <TableRow key={token.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                              {visibleTokens.has(token.id) ? token.token : maskToken(token.token)}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleTokenVisibility(token.id)}
                            >
                              {visibleTokens.has(token.id) ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => copyToClipboard(token.token, token.id)}
                            >
                              {copiedItem === token.id ? (
                                <Check className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {campaigns.find(c => c.id === token.campaign_id)?.name || "N/A"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={token.is_active}
                              onCheckedChange={() => toggleToken(token.id, token.is_active)}
                            />
                            <Badge variant={token.is_active ? "default" : "secondary"}>
                              {token.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{token.usage_count}</TableCell>
                        <TableCell>
                          {token.last_used_at 
                            ? new Date(token.last_used_at).toLocaleDateString("pt-PT")
                            : "Nunca"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => deleteToken(token.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: iFrame - Only shown if there are campaigns with iframe enabled */}
        {hasIframeEnabledCampaigns && (
          <TabsContent value="iframe" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutIcon className="h-5 w-5" />
                  Integração via iFrame
                </CardTitle>
                <CardDescription>
                  A forma mais simples de integrar um formulário no seu site. Basta copiar e colar o código.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Como funciona</AlertTitle>
                  <AlertDescription>
                    O iFrame carrega o formulário completo da campanha, incluindo todos os passos, validações e branding configurado.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <Label>Selecione a Campanha</Label>
                  <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="Selecione uma campanha" />
                    </SelectTrigger>
                    <SelectContent>
                      {iframeEnabledCampaigns.map(campaign => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCampaign && iframeEnabledCampaigns.some(c => c.id === selectedCampaign) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Código HTML</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(getIframeCode(selectedCampaign), "iframe")}
                      >
                        {copiedItem === "iframe" ? (
                          <Check className="h-4 w-4 mr-2 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4 mr-2" />
                        )}
                        Copiar
                      </Button>
                    </div>
                    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{getIframeCode(selectedCampaign)}</code>
                    </pre>

                    <div className="flex items-center gap-2 mt-4">
                      <Button variant="outline" asChild>
                        <a 
                          href={`${APP_URL}/form/${selectedCampaign}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Pré-visualizar Formulário
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Tab: JavaScript */}
        <TabsContent value="javascript" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                Integração via JavaScript
              </CardTitle>
              <CardDescription>
                Para maior controlo sobre a aparência e comportamento do formulário, use a integração JavaScript.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Requer Token de API</AlertTitle>
                <AlertDescription>
                  Esta integração requer um token de API válido. Crie um na aba "Tokens" primeiro.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Campanha</Label>
                  <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.filter(c => c.status === "active").map(campaign => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedCampaign && tokens.filter(t => t.campaign_id === selectedCampaign && t.is_active).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Código JavaScript Embed</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(
                        getJsEmbedCode(
                          selectedCampaign, 
                          tokens.find(t => t.campaign_id === selectedCampaign && t.is_active)?.token || ""
                        ), 
                        "js-embed"
                      )}
                    >
                      {copiedItem === "js-embed" ? (
                        <Check className="h-4 w-4 mr-2 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 mr-2" />
                      )}
                      Copiar
                    </Button>
                  </div>
                  <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-xs max-h-[500px]">
                    <code>{getJsEmbedCode(
                      selectedCampaign, 
                      tokens.find(t => t.campaign_id === selectedCampaign && t.is_active)?.token || "SEU_TOKEN"
                    )}</code>
                  </pre>
                </div>
              )}

              {selectedCampaign && tokens.filter(t => t.campaign_id === selectedCampaign && t.is_active).length === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Sem Token Ativo</AlertTitle>
                  <AlertDescription>
                    Esta campanha não tem tokens ativos. Crie um na aba "Tokens".
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: API Direta */}
        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Integração via API Direta
              </CardTitle>
              <CardDescription>
                Para integrações server-side ou aplicações personalizadas, use a API REST diretamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Campanha</Label>
                  <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.filter(c => c.status === "active").map(campaign => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedCampaign && tokens.filter(t => t.campaign_id === selectedCampaign && t.is_active).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Exemplo de Integração Completa</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(
                        getApiIntegrationCode(
                          selectedCampaign, 
                          tokens.find(t => t.campaign_id === selectedCampaign && t.is_active)?.token || ""
                        ), 
                        "api-code"
                      )}
                    >
                      {copiedItem === "api-code" ? (
                        <Check className="h-4 w-4 mr-2 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 mr-2" />
                      )}
                      Copiar
                    </Button>
                  </div>
                  <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-xs">
                    <code>{getApiIntegrationCode(
                      selectedCampaign, 
                      tokens.find(t => t.campaign_id === selectedCampaign && t.is_active)?.token || "SEU_TOKEN"
                    )}</code>
                  </pre>
                </div>
              )}

              <Card className="bg-muted/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Fluxo de Integração</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm">
                    <li className="flex items-start gap-3">
                      <Badge variant="outline" className="shrink-0">1</Badge>
                      <div>
                        <strong>GET /get-campaign-form</strong>
                        <p className="text-muted-foreground">Obtém a estrutura do formulário (passos, campos, validações)</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Badge variant="outline" className="shrink-0">2</Badge>
                      <div>
                        <strong>POST /create-lead</strong>
                        <p className="text-muted-foreground">Cria o lead com os dados do primeiro passo</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Badge variant="outline" className="shrink-0">3</Badge>
                      <div>
                        <strong>PATCH /update-lead</strong>
                        <p className="text-muted-foreground">Atualiza com dados dos passos seguintes até is_complete=true</p>
                      </div>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Testar */}
        <TabsContent value="test" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* API Tester - Postman Style */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  API Tester
                </CardTitle>
                <CardDescription>
                  Teste as APIs diretamente como no Postman
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Campanha</Label>
                    <Select value={selectedCampaign} onValueChange={(val) => {
                      setSelectedCampaign(val);
                      setApiResponse("");
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {campaigns.filter(c => c.status === "active").map(campaign => (
                          <SelectItem key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Método</Label>
                    <Select value={apiMethod} onValueChange={setApiMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Endpoint</Label>
                  <Select 
                    value={apiEndpoint} 
                    onValueChange={(val) => {
                      setApiEndpoint(val);
                      if (val === "get-campaign-form") {
                        setApiMethod("GET");
                        setApiBody("");
                      } else if (val === "create-lead") {
                        setApiMethod("POST");
                        setApiBody(getEndpointBodyTemplate("create-lead"));
                      } else if (val === "update-lead") {
                        setApiMethod("PATCH");
                        setApiBody(getEndpointBodyTemplate("update-lead"));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="get-campaign-form">GET /get-campaign-form</SelectItem>
                      <SelectItem value="create-lead">POST /create-lead</SelectItem>
                      <SelectItem value="update-lead">PATCH /update-lead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono break-all">
                  {BASE_URL}/{apiEndpoint}{apiMethod === "GET" && selectedCampaign ? `?campaign_id=${selectedCampaign}` : ""}
                </div>

                {apiMethod !== "GET" && (
                  <div className="space-y-2">
                    <Label>Body (JSON)</Label>
                    <Textarea 
                      value={apiBody}
                      onChange={(e) => setApiBody(e.target.value)}
                      placeholder='{"campo": "valor"}'
                      className="font-mono text-xs min-h-[120px]"
                    />
                  </div>
                )}

                <Button 
                  onClick={executeApiRequest} 
                  disabled={apiLoading || !selectedCampaign}
                  className="w-full"
                >
                  {apiLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Enviar Request
                </Button>

                {apiStatus !== null && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Resposta</Label>
                      <Badge variant={apiStatus >= 200 && apiStatus < 300 ? "default" : "destructive"}>
                        {apiStatus === 0 ? "Erro" : apiStatus}
                      </Badge>
                    </div>
                    <ScrollArea className="h-[300px] border rounded-lg">
                      <pre className="bg-zinc-900 text-zinc-100 p-4 text-xs min-h-[300px]">
                        <code>{apiResponse}</code>
                      </pre>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Form Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Preview do Formulário
                </CardTitle>
                <CardDescription>
                  Visualize como o formulário aparecerá no seu site
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Select value={selectedCampaign} onValueChange={setSelectedCampaign} >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione uma campanha" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.filter(c => c.status === "active").map(campaign => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={loadFormPreview} disabled={previewLoading || !selectedCampaign}>
                    {previewLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Location Rejection Warning */}
                {previewLocationRejected && previewFormData && (
                  <Alert variant="destructive">
                    <MapPin className="h-4 w-4" />
                    <AlertTitle>{previewFormData.branding?.location_not_available_title || "Localização não disponível"}</AlertTitle>
                    <AlertDescription>
                      {previewFormData.branding?.location_rejection_message || "Infelizmente, não prestamos serviços na sua área de momento."}
                    </AlertDescription>
                  </Alert>
                )}

                {previewFormData && (
                  <div 
                    className="border rounded-lg p-6 bg-background"
                    style={{
                      fontFamily: previewFormData.branding?.font_family || 'system-ui',
                      color: previewFormData.branding?.text_color || '#1F2937',
                    }}
                  >
                    {/* Progress Bar - always show */}
                    <div className="mb-6">
                      <div className="flex justify-between text-xs text-muted-foreground mb-2">
                        <span>{previewFormData.branding?.step_text || 'Passo'} {previewCurrentStep + 1} {previewFormData.branding?.of_text || 'de'} {previewFormData.steps?.length || 1}</span>
                        <span>{Math.round(((previewCurrentStep + 1) / (previewFormData.steps?.length || 1)) * 100)}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${((previewCurrentStep + 1) / (previewFormData.steps?.length || 1)) * 100}%`,
                            backgroundColor: previewFormData.branding?.primary_color || '#85D3BE'
                          }}
                        />
                      </div>
                    </div>

                    {/* Step Content */}
                    {previewFormData.steps?.[previewCurrentStep] && (
                      <div className="space-y-6">
                        <div>
                          <h3 
                            className="text-xl font-bold"
                            style={{ fontFamily: previewFormData.branding?.heading_font_family || previewFormData.branding?.font_family || undefined }}
                          >
                            {previewFormData.steps[previewCurrentStep].step_title || `Passo ${previewCurrentStep + 1}`}
                          </h3>
                          {previewFormData.steps[previewCurrentStep].step_description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {previewFormData.steps[previewCurrentStep].step_description}
                            </p>
                          )}
                        </div>

                        {/* Info Blocks */}
                        {previewFormData.steps[previewCurrentStep].info_blocks?.map((block: any) => (
                          <Alert key={block.id} className="border-l-4" style={{ borderLeftColor: previewFormData.branding?.primary_color || '#85D3BE' }}>
                            <Info className="h-4 w-4" />
                            <AlertTitle>{block.title}</AlertTitle>
                            <AlertDescription>{block.content}</AlertDescription>
                          </Alert>
                        ))}

                        {/* Fields */}
                        <div className="space-y-5">
                          {(previewFormData.steps[previewCurrentStep].fields || []).map((field: any, idx: number) => (
                            <div key={field.field_key || idx} className="space-y-2">
                              <Label className="text-sm font-medium flex items-center gap-1">
                                {field.field_label}
                                {field.is_required && <span className="text-red-500">*</span>}
                              </Label>
                              {renderPreviewField(field)}
                              {previewValidationErrors[field.field_key] && (
                                <p className="text-xs text-red-500">{previewValidationErrors[field.field_key]}</p>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Navigation Buttons */}
                        <div className="flex gap-3 pt-4">
                          {previewCurrentStep > 0 && (
                            <Button 
                              variant="outline"
                              onClick={() => {
                                setPreviewValidationErrors({});
                                setPreviewCurrentStep(prev => prev - 1);
                              }}
                              style={{
                                backgroundColor: previewFormData.branding?.back_button_bg_color || 'transparent',
                                color: previewFormData.branding?.back_button_text_color || undefined,
                                borderColor: previewFormData.branding?.back_button_border_color || undefined,
                              }}
                            >
                              {previewFormData.branding?.previous_button_text || 'Anterior'}
                            </Button>
                          )}
                          <Button 
                            className="flex-1"
                            disabled={previewLocationRejected}
                            style={{
                              backgroundColor: previewFormData.branding?.primary_color || '#85D3BE',
                              color: previewFormData.branding?.button_text_color || '#fff'
                            }}
                            onClick={() => {
                              if (!validatePreviewCurrentStep()) return;
                              
                              if (previewCurrentStep < (previewFormData.steps?.length || 1) - 1) {
                                setPreviewCurrentStep(prev => prev + 1);
                              } else {
                                toast.success("Preview: Formulário seria submetido aqui!");
                              }
                            }}
                          >
                            {previewCurrentStep === (previewFormData.steps?.length || 1) - 1 
                              ? (previewFormData.branding?.submit_button_text || 'Enviar')
                              : (previewFormData.branding?.next_button_text || 'Próximo')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!previewFormData && !previewLoading && (
                  <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                    <Eye className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Selecione uma campanha e clique no botão play</p>
                    <p className="text-sm">para visualizar o formulário</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
