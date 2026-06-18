import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building, MapPin, FileText, X, FolderTree, Sparkles, ChevronDown } from "lucide-react";
import { AdministrativeDivision } from "@/hooks/useAdministrativeDivisions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { MultiAddressForm, AddressFormData, emptyAddress } from "./MultiAddressForm";

interface OrgTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  is_active: boolean;
  is_system: boolean;
}

interface TemplateNode {
  id: string;
  template_id: string;
  parent_node_id: string | null;
  name: string;
  type: string;
  sort_order: number;
}

// Business sectors
const SECTORS = [
  { value: "services", label: "Serviços", icon: "🛠️" },
  { value: "retail", label: "Retalho", icon: "🛒" },
  { value: "tech", label: "Tecnologia", icon: "💻" },
  { value: "corporate", label: "Corporativo", icon: "🏢" },
  { value: "healthcare", label: "Saúde", icon: "🏥" },
  { value: "education", label: "Educação", icon: "🎓" },
  { value: "hospitality", label: "Hotelaria", icon: "🏨" },
  { value: "logistics", label: "Logística", icon: "🚚" },
  { value: "general", label: "Geral", icon: "📁" },
];

// Suggested organization types
const SUGGESTED_TYPES = [
  { name: "empresa", label: "Empresa" },
  { name: "departamento", label: "Departamento" },
  { name: "equipa", label: "Equipa" },
  { name: "holding", label: "Holding" },
  { name: "filial", label: "Filial" },
  { name: "projeto", label: "Projeto" },
  { name: "divisao", label: "Divisão" },
];

// Re-export from MultiAddressForm for backwards compatibility
export type { AddressFormData } from "./MultiAddressForm";
export { emptyAddress } from "./MultiAddressForm";

export interface AddressData {
  street: string;
  number: string;
  floor: string;
  unit: string;
  postal_code: string;
  city: string;
  city_id: string;
  district: string;
  district_id: string;
  country: string;
  extra: string;
}

export interface OrganizationFormData {
  name: string;
  type: string;
  customType: string;
  description: string;
  status: string;
  parentId: string;
  sector: string;
  phone: string;
  isFiscal: boolean;
  nif: string;
  commercialName: string;
  addresses: AddressFormData[];
  // Legacy - kept for backwards compatibility
  address: AddressData;
  fiscalAddressOption: 'same' | 'new';
  fiscalAddress: AddressData;
}

interface Organization {
  id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
}

export interface OrganizationFormProps {
  formData: OrganizationFormData;
  setFormData: React.Dispatch<React.SetStateAction<OrganizationFormData>>;
  organizations: Organization[];
  countries: { code: string; name: string }[];
  districts: AdministrativeDivision[];
  municipalities: AdministrativeDivision[];
  onDistrictChange: (districtId: string | null) => void;
  // Fiscal address cascading selects
  fiscalDistricts?: AdministrativeDivision[];
  fiscalMunicipalities?: AdministrativeDivision[];
  onFiscalDistrictChange?: (districtId: string | null) => void;
  selectedOrg: Organization | null;
  isEdit?: boolean;
  t: (key: string) => string;
  getTypeLabel: (type: string) => string;
  onSave: () => void;
  isSaving?: boolean;
  onCancel: () => void;
  onUseTemplate?: (templateId: string, templateName: string) => void;
  selectedTemplateId?: string | null;
  selectedTemplateName?: string | null;
  onClearTemplate?: () => void;
  title?: string;
}

export function OrganizationForm({
  formData,
  setFormData,
  organizations,
  countries,
  districts,
  municipalities,
  onDistrictChange,
  fiscalDistricts = [],
  fiscalMunicipalities = [],
  onFiscalDistrictChange,
  selectedOrg,
  isEdit = false,
  t,
  getTypeLabel,
  onSave,
  isSaving = false,
  onCancel,
  onUseTemplate,
  selectedTemplateId,
  selectedTemplateName,
  onClearTemplate,
  title,
}: OrganizationFormProps) {
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Fetch templates based on selected sector
  const { data: templates = [] } = useQuery({
    queryKey: ['anew-org-templates', formData.sector],
    queryFn: async () => {
      if (!formData.sector) return [];
      const { data, error } = await (supabase as any)
        .from('anew_org_templates')
        .select('*')
        .eq('is_active', true)
        .eq('category', formData.sector)
        .order('name');
      if (error) throw error;
      return data as OrgTemplate[];
    },
    enabled: !!formData.sector && !isEdit
  });

  // Fetch template nodes
  const { data: templateNodes = [] } = useQuery({
    queryKey: ['anew-org-template-nodes', templates.map(t => t.id)],
    queryFn: async () => {
      if (templates.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('anew_org_template_nodes')
        .select('*')
        .in('template_id', templates.map(t => t.id))
        .order('sort_order');
      if (error) throw error;
      return data as TemplateNode[];
    },
    enabled: templates.length > 0
  });

  // Auto-open templates when sector changes and has templates
  useEffect(() => {
    if (templates.length > 0 && !isEdit) {
      setTemplatesOpen(true);
    }
  }, [templates.length, isEdit]);
  const updateAddress = (field: keyof AddressData, value: string) => {
    setFormData(prev => ({
      ...prev,
      address: { ...prev.address, [field]: value }
    }));
  };

  const handleDistrictChange = (districtId: string) => {
    const district = districts.find(d => d.id === districtId);
    setFormData(prev => ({
      ...prev,
      address: { 
        ...prev.address, 
        district_id: districtId,
        district: district?.name || "",
        city_id: "",
        city: ""
      }
    }));
    onDistrictChange(districtId);
  };

  const handleCityChange = (cityId: string) => {
    const city = municipalities.find(m => m.id === cityId);
    setFormData(prev => ({
      ...prev,
      address: { 
        ...prev.address, 
        city_id: cityId,
        city: city?.name || ""
      }
    }));
  };

  const handleCountryChange = (countryCode: string) => {
    setFormData(prev => ({
      ...prev,
      address: { 
        ...prev.address, 
        country: countryCode,
        district_id: "",
        district: "",
        city_id: "",
        city: ""
      }
    }));
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">
          {title || (isEdit ? t("organizations.edit") : t("organizations.create"))}
        </h2>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form Content */}
      <ScrollArea className="flex-1 min-h-0 p-4">
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="general" className="gap-2 px-2 py-2 text-xs sm:text-sm">
              <Building className="w-4 h-4 shrink-0" />
              <span className="truncate">{t("common.general")}</span>
            </TabsTrigger>
            <TabsTrigger value="address" className="gap-2 px-2 py-2 text-xs sm:text-sm">
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="truncate">{t("addresses.title")}</span>
            </TabsTrigger>
            <TabsTrigger value="fiscal" className="gap-2 px-2 py-2 text-xs sm:text-sm">
              <FileText className="w-4 h-4 shrink-0" />
              <span className="truncate">{t("organizations.fiscal")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("common.name")} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t("organizations.namePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">{t("organizations.type")} *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("organizations.selectType")} />
                </SelectTrigger>
                <SelectContent>
                  {SUGGESTED_TYPES.map((type) => (
                    <SelectItem key={type.name} value={type.name}>
                      {getTypeLabel(type.name)}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">{t("common.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === "other" && (
              <div className="space-y-2">
                <Label htmlFor="customType">{t("organizations.customType")}</Label>
                <Input
                  id="customType"
                  value={formData.customType}
                  onChange={(e) => setFormData(prev => ({ ...prev, customType: e.target.value }))}
                  placeholder={t("organizations.customTypePlaceholder")}
                />
              </div>
            )}

            {!formData.parentId && (
              <div className="space-y-2">
                <Label htmlFor="sector">{t("organizations.sector")}</Label>
                <Select
                  value={formData.sector || "__none__"}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, sector: value === "__none__" ? "" : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("organizations.selectSector")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("organizations.noSector")}</SelectItem>
                    {SECTORS.map((sector) => (
                      <SelectItem key={sector.value} value={sector.value}>
                        <span className="flex items-center gap-2">
                          <span>{sector.icon}</span>
                          <span>{t(`orgTemplates.categories.${sector.value}`) || sector.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("organizations.sectorHint")}</p>
              </div>
            )}

            {/* Selected template indicator */}
            {!isEdit && selectedTemplateId && selectedTemplateName && (
              <div className="flex items-center gap-2 p-3 rounded-lg border-2 border-primary bg-primary/5">
                <FolderTree className="h-4 w-4 text-primary shrink-0" />
                <span className="flex-1 text-sm font-medium text-primary">
                  Template: {selectedTemplateName}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => onClearTemplate?.()}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Templates suggestions */}
            {!isEdit && templates.length > 0 && !selectedTemplateId && (
              <Collapsible open={templatesOpen} onOpenChange={setTemplatesOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 w-full p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-sm">
                    <FolderTree className="h-4 w-4 text-primary" />
                    <span className="flex-1 text-left font-medium text-primary">
                      {t("organizations.templatesAvailable")} ({templates.length})
                    </span>
                    <ChevronDown className={cn("h-4 w-4 text-primary transition-transform", templatesOpen && "rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("organizations.templatesHint")}
                  </p>
                  {templates.map((template) => {
                    const nodes = templateNodes.filter(n => n.template_id === template.id);
                    return (
                      <div
                        key={template.id}
                        className={cn(
                          "p-3 border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-colors cursor-pointer group",
                          selectedTemplateId === template.id && "border-primary bg-primary/5"
                        )}
                        onClick={() => onUseTemplate?.(template.id, template.name)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{template.name}</span>
                              {template.is_system && (
                                <Badge variant="outline" className="text-xs py-0 h-5">
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  Sistema
                                </Badge>
                              )}
                            </div>
                            {template.description && (
                              <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                            )}
                            {nodes.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {nodes.length} {t("organizations.nodes")}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUseTemplate?.(template.id, template.name);
                            }}
                          >
                            {t("organizations.useTemplate")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">{t("common.description")}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t("organizations.descriptionPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+351 912 345 678"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("common.status")}</Label>
              <RadioGroup
                value={formData.status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="draft" id="status-draft" />
                  <Label htmlFor="status-draft" className="font-normal cursor-pointer">{t("common.draft")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="active" id="status-active" />
                  <Label htmlFor="status-active" className="font-normal cursor-pointer">{t("common.active")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="inactive" id="status-inactive" />
                  <Label htmlFor="status-inactive" className="font-normal cursor-pointer">{t("common.inactive")}</Label>
                </div>
              </RadioGroup>
            </div>
          </TabsContent>

          <TabsContent value="address" className="space-y-4 mt-4">
            <MultiAddressForm
              addresses={formData.addresses}
              onChange={(addresses) => setFormData(prev => ({ ...prev, addresses }))}
              countries={countries}
              districts={districts}
              municipalities={municipalities}
              onDistrictChange={(index, districtId) => onDistrictChange(districtId)}
              t={t}
            />
          </TabsContent>

          <TabsContent value="fiscal" className="space-y-4 mt-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label>{t("organizations.isFiscal")}</Label>
                <p className="text-xs text-muted-foreground">{t("organizations.isFiscalHint")}</p>
              </div>
              <Switch
                checked={formData.isFiscal}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isFiscal: checked }))}
              />
            </div>

            {formData.isFiscal && (
              <>
                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium text-sm">{t("organizations.fiscalData")}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nif">{t("organizations.nif")} *</Label>
                      <Input
                        id="nif"
                        value={formData.nif}
                        onChange={(e) => setFormData(prev => ({ ...prev, nif: e.target.value }))}
                        placeholder={t("organizations.nifPlaceholder")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commercialName">{t("organizations.commercialName")}</Label>
                      <Input
                        id="commercialName"
                        value={formData.commercialName}
                        onChange={(e) => setFormData(prev => ({ ...prev, commercialName: e.target.value }))}
                        placeholder={t("organizations.commercialNamePlaceholder")}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium text-sm">{t("organizations.fiscalAddress")}</h4>
                  <RadioGroup
                    value={formData.fiscalAddressOption}
                    onValueChange={(value: 'same' | 'new') => setFormData(prev => ({ ...prev, fiscalAddressOption: value }))}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50">
                      <RadioGroupItem value="same" id="fiscal-same" />
                      <Label htmlFor="fiscal-same" className="font-normal cursor-pointer flex-1">
                        {t("organizations.fiscalAddressSame")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50">
                      <RadioGroupItem value="new" id="fiscal-new" />
                      <Label htmlFor="fiscal-new" className="font-normal cursor-pointer flex-1">
                        {t("organizations.fiscalAddressNew")}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {formData.fiscalAddressOption === 'new' && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-medium text-sm">{t("organizations.fiscalAddressDetails")}</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <Label>{t("addresses.street")}</Label>
                        <Input
                          value={formData.fiscalAddress.street}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            fiscalAddress: { ...prev.fiscalAddress, street: e.target.value } 
                          }))}
                          placeholder={t("addresses.streetPlaceholder")}
                        />
                      </div>
                      <div>
                        <Label>{t("addresses.number")}</Label>
                        <Input
                          value={formData.fiscalAddress.number}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            fiscalAddress: { ...prev.fiscalAddress, number: e.target.value } 
                          }))}
                          placeholder="10B"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>{t("addresses.floor")}</Label>
                        <Input
                          value={formData.fiscalAddress.floor}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            fiscalAddress: { ...prev.fiscalAddress, floor: e.target.value } 
                          }))}
                          placeholder="3º"
                        />
                      </div>
                      <div>
                        <Label>{t("addresses.unit")}</Label>
                        <Input
                          value={formData.fiscalAddress.unit}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            fiscalAddress: { ...prev.fiscalAddress, unit: e.target.value } 
                          }))}
                          placeholder="Esq."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>{t("addresses.country")}</Label>
                        <Select
                          value={formData.fiscalAddress.country}
                          onValueChange={(value) => {
                            setFormData(prev => ({ 
                              ...prev, 
                              fiscalAddress: { ...prev.fiscalAddress, country: value, district_id: "", district: "", city_id: "", city: "" } 
                            }));
                            onFiscalDistrictChange?.(null);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("addresses.selectCountry")} />
                          </SelectTrigger>
                          <SelectContent>
                            {countries.map((country) => (
                              <SelectItem key={country.code} value={country.code}>
                                {country.name} ({country.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("addresses.district")}</Label>
                        {fiscalDistricts.length > 0 ? (
                          <Select
                            value={formData.fiscalAddress.district_id || "__none__"}
                            onValueChange={(value) => {
                              const districtId = value === "__none__" ? "" : value;
                              const district = fiscalDistricts.find(d => d.id === districtId);
                              setFormData(prev => ({ 
                                ...prev, 
                                fiscalAddress: { 
                                  ...prev.fiscalAddress, 
                                  district_id: districtId,
                                  district: district?.name || "",
                                  city_id: "",
                                  city: ""
                                } 
                              }));
                              onFiscalDistrictChange?.(districtId || null);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t("common.select")}>
                                {formData.fiscalAddress.district_id 
                                  ? fiscalDistricts.find(d => d.id === formData.fiscalAddress.district_id)?.name || t("common.select")
                                  : t("common.select")}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{t("common.select")}</SelectItem>
                              {fiscalDistricts.map((district) => (
                                <SelectItem key={district.id} value={district.id}>
                                  {district.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={formData.fiscalAddress.district}
                            onChange={(e) => setFormData(prev => ({ 
                              ...prev, 
                              fiscalAddress: { ...prev.fiscalAddress, district: e.target.value } 
                            }))}
                            placeholder={t("addresses.districtPlaceholder")}
                          />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>{t("addresses.city")}</Label>
                        {fiscalMunicipalities.length > 0 ? (
                          <Select
                            value={formData.fiscalAddress.city_id || "__none__"}
                            onValueChange={(value) => {
                              const cityId = value === "__none__" ? "" : value;
                              const city = fiscalMunicipalities.find(m => m.id === cityId);
                              setFormData(prev => ({ 
                                ...prev, 
                                fiscalAddress: { 
                                  ...prev.fiscalAddress, 
                                  city_id: cityId,
                                  city: city?.name || ""
                                } 
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t("common.select")}>
                                {formData.fiscalAddress.city_id 
                                  ? fiscalMunicipalities.find(m => m.id === formData.fiscalAddress.city_id)?.name || t("common.select")
                                  : t("common.select")}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{t("common.select")}</SelectItem>
                              {fiscalMunicipalities.map((city) => (
                                <SelectItem key={city.id} value={city.id}>
                                  {city.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={formData.fiscalAddress.city}
                            onChange={(e) => setFormData(prev => ({ 
                              ...prev, 
                              fiscalAddress: { ...prev.fiscalAddress, city: e.target.value } 
                            }))}
                            placeholder="Lisboa"
                          />
                        )}
                      </div>
                      <div>
                        <Label>{t("addresses.postalCode")}</Label>
                        <Input
                          value={formData.fiscalAddress.postal_code}
                          onChange={(e) => setFormData(prev => ({ 
                            ...prev, 
                            fiscalAddress: { ...prev.fiscalAddress, postal_code: e.target.value } 
                          }))}
                          placeholder="1000-001"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {!formData.isFiscal && (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                {t("organizations.fiscalDisabledMessage")}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ScrollArea>

      {/* Footer with actions */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 p-4 border-t bg-muted/30">
        <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">
          {t("common.cancel")}
        </Button>
        <Button onClick={onSave} disabled={isSaving} className="w-full sm:w-auto">
          {isSaving ? "A criar..." : (isEdit ? t("common.save") : t("common.create"))}
        </Button>
      </div>
    </Card>
  );
}

export default OrganizationForm;
