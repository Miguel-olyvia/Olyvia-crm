import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Check, MapPin, CalendarDays, Building2, Briefcase, Target, FileText, Link2, Copy, CheckCheck, Star } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface FormData {
  name: string;
  description: string;
  type: string;
  status: string;
  start_date: string;
  end_date: string;
  budget: string;
  organization_id: string;
  country_code: string;
  source_id: string;
  selected_source_ids: string[];
  default_source_id: string;
  form_id: string;
  selected_org_ids: string[];
  selected_district_ids: string[];
  has_scheduling: boolean;
  scheduling_description_fields: string[];
  scheduling_default_duration: number;
  location_required: boolean;
  iframe_enabled: boolean;
}

interface FormOption {
  id: string;
  name: string;
  is_primary: boolean;
  form_type: string;
}

interface FormField {
  id: string;
  field_key: string;
  field_label: string;
}

interface Company {
  id: string;
  name: string;
}

interface ChildOrganization {
  id: string;
  name: string;
  type: string;
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

interface LeadSource {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface CampaignFormWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: FormData;
  setFormData: (data: FormData) => void;
  onSubmit: (e?: React.FormEvent) => void;
  isEditing: boolean;
  campaignId?: string;
  companies: Company[];
  childOrgs: ChildOrganization[];
  countries: Country[];
  districts: District[];
  leadSources: LeadSource[];
  forms: FormOption[];
  formFields: FormField[];
  onFormChange: (formId: string) => void;
}

interface StepConfig {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

export const CampaignFormWizard = ({
  open,
  onOpenChange,
  formData,
  setFormData,
  onSubmit,
  isEditing,
  campaignId,
  companies,
  childOrgs,
  countries,
  districts,
  leadSources,
  forms,
  formFields,
  onFormChange,
}: CampaignFormWizardProps) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = async () => {
    if (campaignId) {
      try {
        await navigator.clipboard.writeText(campaignId);
        setCopiedId(true);
        toast.success(t('common.copied') || 'Copiado!');
        setTimeout(() => setCopiedId(false), 2000);
      } catch (err) {
        toast.error(t('common.copyError') || 'Erro ao copiar');
      }
    }
  };

  // Group child orgs by type for dynamic rendering
  const orgsByType = useMemo(() => {
    const groups: Record<string, ChildOrganization[]> = {};
    childOrgs.forEach(org => {
      if (!groups[org.type]) groups[org.type] = [];
      groups[org.type].push(org);
    });
    return groups;
  }, [childOrgs]);

  const getOrgTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      holding: t('common.holdings'),
      empresa: t('common.companies'),
      filial: t('common.branches'),
      departamento: t('common.departments'),
      area: t('common.areas'),
      equipa: t('common.teams'),
      divisao: t('common.divisions'),
      projeto: t('common.projects'),
    };
    return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  const steps: StepConfig[] = [
    {
      id: 0,
      title: t('campaigns.wizard.step1.title') || "Informações Básicas",
      description: t('campaigns.wizard.step1.desc') || "Nome e tipo da campanha",
      icon: <Target className="w-5 h-5" />,
    },
    {
      id: 1,
      title: t('campaigns.wizard.step2.title') || "Âmbito",
      description: t('campaigns.wizard.step2.desc') || "Empresa e unidades",
      icon: <Building2 className="w-5 h-5" />,
    },
    {
      id: 2,
      title: t('campaigns.wizard.step3.title') || "Localização",
      description: t('campaigns.wizard.step3.desc') || "País e distritos",
      icon: <MapPin className="w-5 h-5" />,
    },
    {
      id: 3,
      title: t('campaigns.wizard.step4.title') || "Detalhes",
      description: t('campaigns.wizard.step4.desc') || "Datas e orçamento",
      icon: <FileText className="w-5 h-5" />,
    },
  ];

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};

    switch (step) {
      case 0:
        if (!formData.name.trim()) {
          errors.name = t('campaigns.toast.nameRequired') || "Nome é obrigatório";
        } else if (formData.name.trim().length < 3) {
          errors.name = t('campaigns.validation.nameMinLength') || "Nome deve ter pelo menos 3 caracteres";
        } else if (formData.name.trim().length > 100) {
          errors.name = t('campaigns.validation.nameMaxLength') || "Nome deve ter no máximo 100 caracteres";
        }
        if ((formData.selected_source_ids?.length || 0) > 0 && !formData.default_source_id) {
          errors.sources = t('campaigns.validation.defaultSourceRequired') || "Selecione uma fonte primária";
        }
        break;
      case 1:
        break;
      case 2:
        break;
      case 3:
        if (formData.start_date && formData.end_date) {
          if (new Date(formData.end_date) < new Date(formData.start_date)) {
            errors.end_date = t('campaigns.validation.endDateAfterStart') || "Data final deve ser após data inicial";
          }
        }
        if (formData.budget && parseFloat(formData.budget) < 0) {
          errors.budget = t('campaigns.validation.budgetPositive') || "Orçamento deve ser positivo";
        }
        break;
    }

    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        onSubmit();
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setStepErrors({});
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (targetStep: number) => {
    if (targetStep === currentStep) return;

    if (targetStep < currentStep) {
      setStepErrors({});
      setCurrentStep(targetStep);
      return;
    }

    for (let s = currentStep; s < targetStep; s++) {
      const ok = validateStep(s);
      if (!ok) {
        setCurrentStep(s);
        return;
      }
    }

    setStepErrors({});
    setCurrentStep(targetStep);
  };

  const handleClose = () => {
    setCurrentStep(0);
    setStepErrors({});
    onOpenChange(false);
  };

  const toggleOrgSelection = (orgId: string) => {
    const isSelected = formData.selected_org_ids.includes(orgId);
    setFormData({
      ...formData,
      selected_org_ids: isSelected
        ? formData.selected_org_ids.filter((id) => id !== orgId)
        : [...formData.selected_org_ids, orgId],
    });
  };

  const toggleDistrictSelection = (districtId: string) => {
    setFormData({
      ...formData,
      selected_district_ids: formData.selected_district_ids.includes(districtId)
        ? formData.selected_district_ids.filter((id) => id !== districtId)
        : [...formData.selected_district_ids, districtId],
    });
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('campaigns.form.name')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('campaigns.form.namePlaceholder')}
                className={stepErrors.name ? "border-destructive" : ""}
                maxLength={100}
              />
              {stepErrors.name && (
                <p className="text-sm text-destructive">{stepErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">{t('campaigns.form.status')}</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t('campaigns.status.draft')}</SelectItem>
                  <SelectItem value="active">{t('campaigns.status.active')}</SelectItem>
                  <SelectItem value="paused">{t('campaigns.status.paused')}</SelectItem>
                  <SelectItem value="completed">{t('campaigns.status.completed')}</SelectItem>
                </SelectContent>
            </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">{t('campaigns.form.type')} *</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">{t('campaigns.type.email')}</SelectItem>
                  <SelectItem value="sms">{t('campaigns.type.sms')}</SelectItem>
                  <SelectItem value="social">{t('campaigns.type.social')}</SelectItem>
                  <SelectItem value="mixed">{t('campaigns.type.mixed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Multiple Sources Selection */}
            <div className="space-y-2">
              <Label>{t('campaigns.form.sources') || 'Fontes'} *</Label>
              <div className={cn(
                "border rounded-md p-3 space-y-1 max-h-48 overflow-y-auto",
                stepErrors.sources && "border-destructive"
              )}>
                {leadSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('campaigns.form.noSourcesAvailable') || 'Nenhuma fonte disponível'}
                  </p>
                ) : (
                  leadSources.map((source) => {
                    const isSelected = formData.selected_source_ids?.includes(source.id);
                    const isDefault = formData.default_source_id === source.id;
                    
                    return (
                      <div 
                        key={source.id} 
                        className={cn(
                          "flex items-center justify-between gap-2 py-2 px-2 rounded-md transition-colors",
                          isDefault && "bg-primary/10 border border-primary/30"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`source-${source.id}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              const newSelected = checked
                                ? [...(formData.selected_source_ids || []), source.id]
                                : (formData.selected_source_ids || []).filter((id) => id !== source.id);
                              
                              let newDefault = formData.default_source_id;
                              if (checked && newSelected.length === 1) {
                                newDefault = source.id;
                              } else if (!checked && isDefault) {
                                newDefault = newSelected[0] || "";
                              }
                              
                              setFormData({ 
                                ...formData, 
                                selected_source_ids: newSelected,
                                default_source_id: newDefault,
                              });
                            }}
                          />
                          <label
                            htmlFor={`source-${source.id}`}
                            className={cn(
                              "text-sm cursor-pointer flex items-center gap-2",
                              isDefault && "font-medium"
                            )}
                          >
                            {isDefault && (
                              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                            )}
                            {source.name}
                          </label>
                        </div>
                        {isSelected && (
                          <Button
                            type="button"
                            variant={isDefault ? "secondary" : "ghost"}
                            size="sm"
                            className={cn(
                              "h-7 text-xs px-2",
                              isDefault && "bg-primary text-primary-foreground hover:bg-primary/90"
                            )}
                            onClick={() => setFormData({ ...formData, default_source_id: source.id })}
                            disabled={isDefault}
                          >
                            {isDefault ? (
                              <>
                                <Star className="h-3 w-3 mr-1 fill-current" />
                                {t('campaigns.form.primarySource') || 'Primário'}
                              </>
                            ) : (
                              t('campaigns.form.setAsPrimary') || 'Definir como primário'
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              {stepErrors.sources && (
                <p className="text-xs text-destructive">{stepErrors.sources}</p>
              )}
              {(formData.selected_source_ids?.length || 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formData.selected_source_ids.length} {t('campaigns.form.sourcesSelected') || 'fonte(s) selecionada(s)'}
                  {formData.default_source_id && ` • ${t('campaigns.form.defaultSourceNote') || 'A fonte primária é usada quando nenhuma fonte é especificada na API'}`}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('campaigns.form.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('campaigns.form.descriptionPlaceholder')}
                maxLength={1000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="form_id">Formulário Associado *</Label>
              <Select 
                value={formData.form_id || "none"} 
                onValueChange={(value) => onFormChange(value === "none" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar formulário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem formulário</SelectItem>
                  {forms.map((form) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.name} {form.is_primary && "(Principal)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O formulário define os campos que serão exibidos aos utilizadores
              </p>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('campaigns.form.company')}</Label>
              <Select
                value={formData.organization_id || "none"}
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  organization_id: value === "none" ? "" : value,
                  selected_org_ids: [],
                })}
              >
                <SelectTrigger className={stepErrors.organization_id ? "border-destructive" : ""}>
                  <SelectValue placeholder={t('campaigns.form.selectCompany')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('campaigns.form.noCompany')}</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {stepErrors.organization_id && (
                <p className="text-sm text-destructive">{stepErrors.organization_id}</p>
              )}
            </div>

            {/* Dynamic org groups by type */}
            {formData.organization_id && Object.entries(orgsByType).map(([type, orgs]) => (
              <div key={type} className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  {getOrgTypeLabel(type)}
                </Label>
                <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                  {orgs.map((org) => (
                    <div key={org.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`wizard-org-${org.id}`}
                        checked={formData.selected_org_ids.includes(org.id)}
                        onCheckedChange={() => toggleOrgSelection(org.id)}
                      />
                      <label htmlFor={`wizard-org-${org.id}`} className="text-sm cursor-pointer">
                        {org.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {formData.selected_org_ids.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {formData.selected_org_ids.length} {t('common.selected') || 'selecionado(s)'}
              </p>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('campaigns.form.country') || 'País'}</Label>
              <Select
                value={formData.country_code || "none"}
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  country_code: value === "none" ? "" : value,
                  selected_district_ids: []
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('campaigns.form.selectCountry') || 'Selecionar país'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('campaigns.form.noCountry') || 'Sem país'}</SelectItem>
                  {countries.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.country_code && districts.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {t('campaigns.form.districts') || 'Distritos'}
                </Label>
                <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                  {districts.map((district) => (
                    <div key={district.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`wizard-district-${district.id}`}
                        checked={formData.selected_district_ids.includes(district.id)}
                        onCheckedChange={() => toggleDistrictSelection(district.id)}
                      />
                      <label htmlFor={`wizard-district-${district.id}`} className="text-sm cursor-pointer">
                        {district.name}
                      </label>
                    </div>
                  ))}
                </div>
                {formData.selected_district_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formData.selected_district_ids.length} distrito(s) selecionado(s)
                  </p>
                )}
                
                {formData.selected_district_ids.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg border p-4 mt-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="location_required" className="cursor-pointer font-medium">
                        Localização Obrigatória
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Se ativo, o formulário público só aceita leads dos distritos selecionados
                      </p>
                    </div>
                    <Switch
                      id="location_required"
                      checked={formData.location_required}
                      onCheckedChange={(checked) => setFormData({ ...formData, location_required: checked })}
                    />
                  </div>
                )}
              </div>
            )}

            {!formData.country_code && (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('campaigns.wizard.selectCountryFirst') || 'Selecione um país para ver os distritos'}</p>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">{t('campaigns.form.startDate')}</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">{t('campaigns.form.endDate')}</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className={stepErrors.end_date ? "border-destructive" : ""}
                />
                {stepErrors.end_date && (
                  <p className="text-sm text-destructive">{stepErrors.end_date}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">{t('campaigns.form.budget')} (€)</Label>
              <Input
                id="budget"
                type="number"
                step="0.01"
                min="0"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                placeholder="0.00"
                className={stepErrors.budget ? "border-destructive" : ""}
              />
              {stepErrors.budget && (
                <p className="text-sm text-destructive">{stepErrors.budget}</p>
              )}
            </div>

            {/* Scheduling */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="has_scheduling" className="cursor-pointer font-medium">
                  <CalendarDays className="w-4 h-4 inline mr-2" />
                  {t('campaigns.form.scheduling') || 'Agendamento'}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('campaigns.form.schedulingDesc') || 'Ativar agendamento de visitas para leads desta campanha'}
                </p>
              </div>
              <Switch
                id="has_scheduling"
                checked={formData.has_scheduling}
                onCheckedChange={(checked) => setFormData({ ...formData, has_scheduling: checked })}
              />
            </div>

            {formData.has_scheduling && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                <div className="space-y-2">
                  <Label>{t('campaigns.form.schedulingDuration') || 'Duração padrão (min)'}</Label>
                  <Input
                    type="number"
                    min="15"
                    step="15"
                    value={formData.scheduling_default_duration}
                    onChange={(e) => setFormData({ ...formData, scheduling_default_duration: parseInt(e.target.value) || 60 })}
                  />
                </div>

                {formFields.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t('campaigns.form.schedulingFields') || 'Campos para descrição do agendamento'}</Label>
                    <div className="border rounded-md p-3 space-y-2 max-h-32 overflow-y-auto">
                      {formFields.map((field) => (
                        <div key={field.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`sched-field-${field.field_key}`}
                            checked={formData.scheduling_description_fields.includes(field.field_key)}
                            onCheckedChange={(checked) => {
                              const newFields = checked
                                ? [...formData.scheduling_description_fields, field.field_key]
                                : formData.scheduling_description_fields.filter((k) => k !== field.field_key);
                              setFormData({ ...formData, scheduling_description_fields: newFields });
                            }}
                          />
                          <label htmlFor={`sched-field-${field.field_key}`} className="text-sm cursor-pointer">
                            {field.field_label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* iFrame embed */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="iframe_enabled" className="cursor-pointer font-medium">
                  <Link2 className="w-4 h-4 inline mr-2" />
                  {t('campaigns.form.iframeEmbed') || 'Embed via iFrame'}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('campaigns.form.iframeEmbedDesc') || 'Permitir incorporar o formulário em sites externos'}
                </p>
              </div>
              <Switch
                id="iframe_enabled"
                checked={formData.iframe_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, iframe_enabled: checked })}
              />
            </div>

            {/* Campaign ID display for editing */}
            {isEditing && campaignId && (
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Campaign ID</p>
                    <p className="text-sm font-mono">{campaignId}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyId}
                  >
                    {copiedId ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o ? handleClose() : onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('campaigns.editCampaign') : t('campaigns.newCampaign')}
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-4">
          <Progress value={progress} className="h-2" />
          
          {/* Step indicators */}
          <div className="flex justify-between">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => goToStep(index)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                  currentStep === index
                    ? "bg-primary/10 text-primary font-medium"
                    : currentStep > index
                    ? "text-primary/60 hover:bg-muted"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs",
                  currentStep === index
                    ? "bg-primary text-primary-foreground"
                    : currentStep > index
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {currentStep > index ? <Check className="w-4 h-4" /> : index + 1}
                </div>
                <span className="hidden md:inline">{step.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={currentStep === 0 ? handleClose : handlePrevious}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {currentStep === 0 ? t('common.cancel') : t('common.previous')}
          </Button>
          
          <Button type="button" onClick={handleNext}>
            {currentStep === steps.length - 1 ? (
              <>
                <Check className="w-4 h-4 mr-1" />
                {isEditing ? t('campaigns.form.update') : t('campaigns.form.create')}
              </>
            ) : (
              <>
                {t('common.next')}
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
