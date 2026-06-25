import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Megaphone, Loader2, DollarSign, Users, Pencil, Trash2, Search, X, Building2, Briefcase, MapPin, CalendarDays, Settings2, Eye, GitBranch, Link2, Copy, Check, Palette } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { HelpButton } from "@/components/HelpButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";
import { PermissionGate } from "@/components/PermissionGate";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/hooks/useTranslation";
import { CampaignFieldsConfig } from "@/components/campaigns/CampaignFieldsConfig";
import { CampaignFormWizard } from "@/components/campaigns/CampaignFormWizard";
import { CampaignFormPreview } from "@/components/campaigns/CampaignFormPreview";
import { CampaignRoutingRules } from "@/components/campaigns/CampaignRoutingRules";
import { CampaignBrandingConfig } from "@/components/campaigns/CampaignBrandingConfig";
import { CampaignFormBuilder } from "@/components/campaigns/CampaignFormBuilder";

interface LeadSource {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface ChildOrganization {
  id: string;
  name: string;
  type: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  organization_id: string | null;
  country_code: string | null;
  source_id: string | null;
  organization: { name: string } | null;
  lead_sources?: { id: string; name: string; icon: string | null; color: string | null } | null;
  channels_count?: number;
  created_at: string;
  child_orgs?: ChildOrganization[];
  districts?: { id: string; name: string }[];
  has_scheduling: boolean;
  iframe_enabled?: boolean;
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

const PAGE_SIZE = 10;

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

const Campaigns = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [childOrgs, setChildOrgs] = useState<ChildOrganization[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  const [fieldsConfigOpen, setFieldsConfigOpen] = useState(false);
  const [fieldsConfigCampaign, setFieldsConfigCampaign] = useState<Campaign | null>(null);
  const [formPreviewOpen, setFormPreviewOpen] = useState(false);
  const [formPreviewCampaign, setFormPreviewCampaign] = useState<Campaign | null>(null);
  const [routingRulesOpen, setRoutingRulesOpen] = useState(false);
  const [routingRulesCampaign, setRoutingRulesCampaign] = useState<Campaign | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [brandingCampaign, setBrandingCampaign] = useState<Campaign | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [organizationFilter, setOrganizationFilter] = useState<string>("all");
  // Dynamic org type filters
  const [orgTypeFilters, setOrgTypeFilters] = useState<Record<string, string>>({});
  
  // Pagination state
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  
  // Wizard mode
  const [useWizard, setUseWizard] = useState(true);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "email",
    status: "draft",
    start_date: "",
    end_date: "",
    budget: "",
    organization_id: "",
    country_code: "",
    source_id: "",
    selected_source_ids: [] as string[],
    default_source_id: "",
    form_id: "",
    selected_org_ids: [] as string[],
    selected_district_ids: [] as string[],
    has_scheduling: false,
    scheduling_description_fields: [] as string[],
    scheduling_default_duration: 60,
    location_required: false,
    iframe_enabled: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { activeCompany, isLoading: companyLoading } = useCompany();

  // Load districts when country_code changes
  useEffect(() => {
    const loadDistricts = async () => {
      if (!formData.country_code) {
        setDistricts([]);
        return;
      }
      const { data } = await supabase
        .from('administrative_divisions')
        .select('id, name, country_code')
        .eq('country_code', formData.country_code)
        .eq('admin_level', 1)
        .eq('is_active', true)
        .order('name');
      setDistricts((data || []).map(d => ({ id: d.id, name: d.name, country_code: d.country_code })));
    };
    loadDistricts();
  }, [formData.country_code]);

  // Get distinct org types for dynamic filters
  const orgTypes = useMemo(() => {
    const types = [...new Set(childOrgs.map(o => o.type))];
    return types;
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

  const loadData = useCallback(async () => {
    try {
      if (!activeCompany?.id) {
        setCampaigns([]);
        setLoading(false);
        return;
      }

      let campaignsQuery = supabase
        .from("campaigns")
        .select("*, organization:anew_organizations!campaigns_organization_id_anew_fkey(name), lead_sources(id, name, icon, color), forms(id, name)")
        .eq("organization_id", activeCompany.id);

      let sourcesQuery = supabase
        .from("lead_sources")
        .select("id, name, icon, color")
        .eq("is_active", true)
        .order("name");

      sourcesQuery = sourcesQuery.or(`organization_id.eq.${activeCompany.id},organization_id.is.null`);

      const [campaignsRes, organizationsRes, childOrgsRes, countriesRes, sourcesRes, formsRes] = await Promise.all([
        campaignsQuery.order("created_at", { ascending: false }),
        Promise.resolve({ data: [{ id: activeCompany.id, name: activeCompany.name }], error: null }),
        supabase.from("anew_hierarchy").select("child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, type)").eq("parent_org_id", activeCompany.id).then(res => ({
            data: (res.data || []).map((h: any) => ({ id: (h as any).anew_organizations?.id, name: (h as any).anew_organizations?.name, type: (h as any).anew_organizations?.type || '' })).filter((d: any) => d.id),
            error: res.error
          })),
        supabase.from("administrative_divisions").select("country_code").eq("admin_level", 1),
        sourcesQuery,
        supabase.from("forms").select("id, name, is_primary, form_type").eq("is_active", true).eq("organization_id", activeCompany.id).order("is_primary", { ascending: false }),
      ]);

      if (campaignsRes.error) throw campaignsRes.error;
      if (organizationsRes.error) throw organizationsRes.error;

      // Get unique countries from administrative divisions
      const uniqueCountryCodes = [...new Set((countriesRes.data || []).map((d: any) => d.country_code))];
      const countryList: Country[] = uniqueCountryCodes.map((code: string) => ({
        code,
        name: code === 'PT' ? 'Portugal' : code === 'ES' ? 'Espanha' : code === 'BR' ? 'Brasil' : code,
      }));

      // Batch fetch junction data for all campaigns (eliminates N+1)
      const allCampaignIds = (campaignsRes.data || []).map(c => c.id);

      const [allChannelsRes, allOrgsRes, allDistrictsRes, allSourcesRes] = allCampaignIds.length > 0
        ? await Promise.all([
            supabase.from("channels").select("campaign_id").in("campaign_id", allCampaignIds),
            supabase.from("campaign_organizations").select("campaign_id, organization_id, anew_organizations(id, name, type)").in("campaign_id", allCampaignIds),
            supabase.from("campaign_districts").select("campaign_id, district_id, administrative_divisions(id, name)").in("campaign_id", allCampaignIds),
            supabase.from("campaign_sources").select("campaign_id, source_id, is_default, lead_sources(id, name)").in("campaign_id", allCampaignIds),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

      // Group by campaign_id
      const channelCountMap: Record<string, number> = {};
      (allChannelsRes.data || []).forEach((c: any) => {
        channelCountMap[c.campaign_id] = (channelCountMap[c.campaign_id] || 0) + 1;
      });

      const orgsMap: Record<string, ChildOrganization[]> = {};
      (allOrgsRes.data || []).forEach((o: any) => {
        if (!o.anew_organizations) return;
        if (!orgsMap[o.campaign_id]) orgsMap[o.campaign_id] = [];
        orgsMap[o.campaign_id].push(o.anew_organizations);
      });

      const districtsMap: Record<string, { id: string; name: string }[]> = {};
      ((allDistrictsRes.data || []) as any[]).forEach((d: any) => {
        if (!d.administrative_divisions) return;
        if (!districtsMap[d.campaign_id]) districtsMap[d.campaign_id] = [];
        districtsMap[d.campaign_id].push(d.administrative_divisions);
      });

      const sourcesMap: Record<string, any[]> = {};
      ((allSourcesRes.data || []) as any[]).forEach((s: any) => {
        if (!sourcesMap[s.campaign_id]) sourcesMap[s.campaign_id] = [];
        sourcesMap[s.campaign_id].push(s);
      });

      const campaignsWithRelations = (campaignsRes.data || []).map((campaign) => {
        const campaignSources = sourcesMap[campaign.id] || [];
        const defaultSource = campaignSources.find((s: any) => s.is_default);
        const orgData = campaign.organization;
        const resolvedOrg = Array.isArray(orgData) ? orgData[0] : orgData;

        return {
          ...campaign,
          organization: resolvedOrg || null,
          channels_count: channelCountMap[campaign.id] || 0,
          child_orgs: orgsMap[campaign.id] || [],
          districts: districtsMap[campaign.id] || [],
          selected_source_ids: campaignSources.map((s: any) => s.source_id),
          default_source_id: defaultSource?.source_id || "",
          campaign_sources: campaignSources.map((s: any) => s.lead_sources).filter(Boolean),
        };
      });

      setCampaigns(campaignsWithRelations);
      setOrganizations(organizationsRes.data || []);
      setChildOrgs((childOrgsRes.data || []) as ChildOrganization[]);
      setCountries(countryList);
      setLeadSources(sourcesRes.data || []);
      setForms(formsRes.data || []);
    } catch (error: any) {
      toast({
        title: t('campaigns.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeCompany, toast, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadFormFields = async (formId: string) => {
    if (!formId) {
      setFormFields([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("form_fields")
        .select("id, field_key, field_label")
        .eq("form_id", formId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      
      if (error) throw error;
      setFormFields(data || []);
    } catch (error: any) {
      toast({
        title: t('campaigns.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
      setFormFields([]);
    }
  };

  const handleFormChange = (formId: string) => {
    setFormData(prev => ({ ...prev, form_id: formId, scheduling_description_fields: [] }));
    loadFormFields(formId);
  };

  const [savingCampaign, setSavingCampaign] = useState(false);
  const submitLockRef = useRef(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submitLockRef.current) return;

    if (!formData.name) {
      setFieldErrors({ name: t('campaigns.toast.nameRequired') });
      toast({
        title: t('campaigns.toast.validationError'),
        description: t('campaigns.toast.nameRequired'),
        variant: "destructive",
      });
      return;
    }
    setFieldErrors({});
    submitLockRef.current = true;
    setSavingCampaign(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const campaignData = {
        name: formData.name,
        description: formData.description || null,
        type: formData.type,
        status: formData.status,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        budget: formData.budget ? parseFloat(formData.budget) : null,
        organization_id: formData.organization_id || null,
        country_code: formData.country_code || null,
        source_id: formData.default_source_id || formData.source_id || null,
        form_id: formData.form_id || null,
        has_scheduling: formData.has_scheduling,
        scheduling_description_fields: formData.scheduling_description_fields,
        scheduling_default_duration: formData.scheduling_default_duration,
        location_required: formData.location_required,
        iframe_enabled: formData.iframe_enabled,
      };

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador. Faça login novamente.", variant: "destructive" });
        return;
      }

      let campaignId: string;

      if (editingCampaign) {
        const { error } = await supabase
          .from("campaigns")
          .update(campaignData)
          .eq("id", editingCampaign.id);

        if (error) throw error;
        campaignId = editingCampaign.id;

        // Delete existing relations
        await Promise.all([
          supabase.from("campaign_organizations").delete().eq("campaign_id", campaignId),
          supabase.from("campaign_districts").delete().eq("campaign_id", campaignId),
          supabase.from("campaign_sources").delete().eq("campaign_id", campaignId),
        ]);
      } else {
        const { data, error } = await supabase.from("campaigns").insert({
          ...campaignData,
          created_by: businessUserId,
        }).select("id").single();

        if (error) throw error;
        campaignId = data.id;
      }

      // Insert campaign organizations (unified)
      if (formData.selected_org_ids.length > 0) {
        await supabase.from("campaign_organizations").insert(
          formData.selected_org_ids.map((orgId) => ({
            campaign_id: campaignId,
            organization_id: orgId,
          }))
        );
      }

      if (formData.selected_district_ids.length > 0) {
        await supabase.from("campaign_districts").insert(
          formData.selected_district_ids.map((districtId) => ({
            campaign_id: campaignId,
            district_id: districtId,
          }))
        );
      }

      // Insert campaign sources
      if (formData.selected_source_ids.length > 0) {
        await supabase.from("campaign_sources").insert(
          formData.selected_source_ids.map((sourceId) => ({
            campaign_id: campaignId,
            source_id: sourceId,
            is_default: sourceId === formData.default_source_id,
            created_by: businessUserId,
          }))
        );
      }

      toast({
        title: editingCampaign ? t('campaigns.toast.updateSuccess') : t('campaigns.toast.createSuccess'),
      });

      handleCloseDialog();
      void loadData();
    } catch (error: any) {
      toast({
        title: editingCampaign ? t('campaigns.toast.updateError') : t('campaigns.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      submitLockRef.current = false;
      setSavingCampaign(false);
    }
  };

  const handleDelete = async () => {
    if (!campaignToDelete) return;

    try {
      const { error } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", campaignToDelete);

      if (error) throw error;

      toast({
        title: t('campaigns.toast.deleteSuccess'),
      });

      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
      void loadData();
    } catch (error: any) {
      toast({
        title: t('campaigns.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    const formId = (campaign as any).form_id || "";
    setFormData({
      name: campaign.name,
      description: campaign.description || "",
      type: campaign.type,
      status: campaign.status,
      start_date: campaign.start_date || "",
      end_date: campaign.end_date || "",
      budget: campaign.budget?.toString() || "",
      organization_id: campaign.organization_id || "",
      country_code: campaign.country_code || "",
      source_id: campaign.source_id || "",
      selected_source_ids: (campaign as any).selected_source_ids || [],
      default_source_id: (campaign as any).default_source_id || "",
      form_id: formId,
      selected_org_ids: campaign.child_orgs?.map((o) => o.id) || [],
      selected_district_ids: campaign.districts?.map((d) => d.id) || [],
      has_scheduling: campaign.has_scheduling || false,
      scheduling_description_fields: (campaign as any).scheduling_description_fields || [],
      scheduling_default_duration: (campaign as any).scheduling_default_duration || 60,
      location_required: (campaign as any).location_required || false,
      iframe_enabled: (campaign as any).iframe_enabled || false,
    });
    if (formId) loadFormFields(formId);
    setOpen(true);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingCampaign(null);
    setFormFields([]);
    setFormData({
      name: "",
      description: "",
      type: "email",
      status: "draft",
      start_date: "",
      end_date: "",
      budget: "",
      organization_id: "",
      country_code: "",
      source_id: "",
      selected_source_ids: [],
      default_source_id: "",
      form_id: "",
      selected_org_ids: [],
      selected_district_ids: [],
      has_scheduling: false,
      scheduling_description_fields: [],
      scheduling_default_duration: 60,
      location_required: false,
      iframe_enabled: false,
    });
  };

  const openDeleteDialog = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCampaignToDelete(id);
    setDeleteDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-muted text-muted-foreground",
      active: "bg-success/10 text-success",
      paused: "bg-warning/10 text-warning",
      completed: "bg-info/10 text-info",
    };
    return colors[status] || colors.draft;
  };

  const getTypeLabel = (type: string) => {
    const typeKey = `campaigns.type.${type}` as const;
    return t(typeKey) || type;
  };

  const getStatusLabel = (status: string) => {
    const statusKey = `campaigns.status.${status}` as const;
    return t(statusKey) || status;
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setOrganizationFilter("all");
    setOrgTypeFilters({});
    setVisibleCount(PAGE_SIZE);
  };

  const hasActiveFilters = searchQuery || statusFilter !== "all" || typeFilter !== "all" || 
    organizationFilter !== "all" || Object.values(orgTypeFilters).some(v => v !== "all");

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, statusFilter, typeFilter, organizationFilter, orgTypeFilters]);

  const filteredCampaigns = useMemo(() => campaigns
    .filter((campaign) => {
      const matchesSearch = !searchQuery ||
        campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        campaign.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      const matchesType = typeFilter === "all" || campaign.type === typeFilter;
      const matchesOrganization = organizationFilter === "all" || campaign.organization_id === organizationFilter;

      // Dynamic org type filters
      const matchesOrgTypes = Object.entries(orgTypeFilters).every(([type, filterId]) => {
        if (filterId === "all" || !filterId) return true;
        return campaign.child_orgs?.some((o) => o.id === filterId && o.type === type);
      });

      return matchesSearch && matchesStatus && matchesType && matchesOrganization && matchesOrgTypes;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  [campaigns, searchQuery, statusFilter, typeFilter, organizationFilter, orgTypeFilters]);

  const paginatedCampaigns = filteredCampaigns.slice(0, visibleCount);
  const hasMore = visibleCount < filteredCampaigns.length;

  const loadMore = () => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredCampaigns.length));
  };

  const toggleOrgSelection = (orgId: string) => {
    setFormData((prev) => ({
      ...prev,
      selected_org_ids: prev.selected_org_ids.includes(orgId)
        ? prev.selected_org_ids.filter((id) => id !== orgId)
        : [...prev.selected_org_ids, orgId],
    }));
  };

  const toggleDistrictSelection = (districtId: string) => {
    setFormData((prev) => ({
      ...prev,
      selected_district_ids: prev.selected_district_ids.includes(districtId)
        ? prev.selected_district_ids.filter((id) => id !== districtId)
        : [...prev.selected_district_ids, districtId],
    }));
  };

  const copyLink = (campaignId: string) => {
    const url = `${window.location.origin}/lead-form/${campaignId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLinkId(campaignId);
      setTimeout(() => setCopiedLinkId(null), 2000);
      toast({ title: t('campaigns.toast.linkCopied') });
    });
  };

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-12">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6">
          <div><h1 className="text-2xl font-bold text-foreground">{t('campaigns.title')}</h1><p className="text-muted-foreground">{t('campaigns.subtitle')}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{t('campaigns.title')}</h1>
              <HelpButton pageKey="marketing.campaigns" />
            </div>
            <p className="text-muted-foreground">
              {t('campaigns.subtitle')}
            </p>
          </div>
          <PermissionGate permission="campaigns.create">
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('campaigns.newCampaign')}
            </Button>
          </PermissionGate>
        </div>

        {/* Wizard or Classic dialog */}
        {useWizard ? (
          <CampaignFormWizard
            open={open}
            onOpenChange={(o) => !o ? handleCloseDialog() : setOpen(o)}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            isEditing={!!editingCampaign}
            campaignId={editingCampaign?.id}
            companies={organizations}
            childOrgs={childOrgs}
            countries={countries}
            districts={districts}
            leadSources={leadSources}
            forms={forms}
            formFields={formFields}
            onFormChange={handleFormChange}
          />
        ) : (
          <Dialog open={open} onOpenChange={(o) => !o && handleCloseDialog()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingCampaign ? t('campaigns.editCampaign') : t('campaigns.newCampaign')}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('campaigns.form.name')} *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('campaigns.form.namePlaceholder')}
                    className={fieldErrors.name ? "border-destructive" : ""}
                  />
                  {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={savingCampaign}>
                    {savingCampaign ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('common.creating')}</>
                    ) : (
                      editingCampaign ? t('campaigns.form.update') : t('campaigns.form.create')
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder={t('campaigns.filter.search')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('campaigns.filter.status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('campaigns.filter.allStatus')}</SelectItem>
                  <SelectItem value="draft">{t('campaigns.status.draft')}</SelectItem>
                  <SelectItem value="active">{t('campaigns.status.active')}</SelectItem>
                  <SelectItem value="paused">{t('campaigns.status.paused')}</SelectItem>
                  <SelectItem value="completed">{t('campaigns.status.completed')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('campaigns.filter.type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('campaigns.filter.allTypes')}</SelectItem>
                  <SelectItem value="email">{t('campaigns.type.email')}</SelectItem>
                  <SelectItem value="sms">{t('campaigns.type.sms')}</SelectItem>
                  <SelectItem value="social">{t('campaigns.type.social')}</SelectItem>
                  <SelectItem value="mixed">{t('campaigns.type.mixed')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={organizationFilter} onValueChange={setOrganizationFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder={t('campaigns.filter.company')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('campaigns.filter.allCompanies')}</SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Dynamic filters by org type */}
              {orgTypes.map((type) => {
                const orgsOfType = childOrgs.filter(o => o.type === type);
                if (orgsOfType.length === 0) return null;
                return (
                  <Select
                    key={type}
                    value={orgTypeFilters[type] || "all"}
                    onValueChange={(v) => setOrgTypeFilters(prev => ({ ...prev, [type]: v }))}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder={getOrgTypeLabel(type)} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('common.all')}</SelectItem>
                      {orgsOfType.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })}

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1" />
                  {t('campaigns.filter.clear')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results count */}
        <div className="text-sm text-muted-foreground">
          {t('campaigns.found', { count: filteredCampaigns.length })}
        </div>

        {filteredCampaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Megaphone className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                {hasActiveFilters ? t('campaigns.noMatchFilters') : t('campaigns.noCampaigns')}
              </p>
              {!hasActiveFilters && (
                <PermissionGate permission="campaigns.create">
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('campaigns.createFirst')}
                  </Button>
                </PermissionGate>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('campaigns.table.name')}</TableHead>
                  <TableHead>{t('campaigns.table.type')}</TableHead>
                  <TableHead>{t('campaigns.table.status')}</TableHead>
                  <TableHead>{t('campaigns.table.scope')}</TableHead>
                  <TableHead>{t('campaigns.table.period')}</TableHead>
                  <TableHead>{t('campaigns.table.budget')}</TableHead>
                  <TableHead>{t('campaigns.table.source')}</TableHead>
                  <TableHead className="text-right">{t('campaigns.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCampaigns.map((campaign) => (
                  <TableRow 
                    key={campaign.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/campaigns/${campaign.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Megaphone className="w-4 h-4 text-primary" />
                        <div>
                          <div className="font-medium">{campaign.name}</div>
                          {campaign.description && (
                            <div className="text-sm text-muted-foreground line-clamp-1">
                              {campaign.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTypeLabel(campaign.type)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(campaign.status)}>
                        {getStatusLabel(campaign.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1 text-sm">
                        {campaign.organization?.name && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {campaign.organization.name}
                          </Badge>
                        )}
                        {campaign.child_orgs && campaign.child_orgs.length > 0 && (
                          <>
                            {/* Group by type and show badges */}
                            {Object.entries(
                              campaign.child_orgs.reduce((acc, org) => {
                                if (!acc[org.type]) acc[org.type] = [];
                                acc[org.type].push(org);
                                return acc;
                              }, {} as Record<string, ChildOrganization[]>)
                            ).map(([type, orgs]) => (
                              <Badge key={type} variant="outline" className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {orgs.length === 1 
                                  ? orgs[0].name 
                                  : `${orgs.length} ${getOrgTypeLabel(type)}`}
                              </Badge>
                            ))}
                          </>
                        )}
                        {!campaign.organization?.name && 
                         (!campaign.child_orgs || campaign.child_orgs.length === 0) && (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {campaign.start_date && (
                          <span>{new Date(campaign.start_date).toLocaleDateString()}</span>
                        )}
                        {campaign.start_date && campaign.end_date && <span> - </span>}
                        {campaign.end_date && (
                          <span>{new Date(campaign.end_date).toLocaleDateString()}</span>
                        )}
                        {!campaign.start_date && !campaign.end_date && <span className="text-muted-foreground">-</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {campaign.budget ? (
                        <span className="font-medium">€{Number(campaign.budget).toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {campaign.lead_sources ? (
                        <Badge variant="outline" style={{ borderColor: campaign.lead_sources.color || undefined }}>
                          {campaign.lead_sources.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <PermissionGate permission="campaigns.edit">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setRoutingRulesCampaign(campaign);
                                  setRoutingRulesOpen(true);
                                }}
                              >
                                <GitBranch className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('campaigns.tooltip.routingRules')}</TooltipContent>
                          </Tooltip>
                        </PermissionGate>
                        <PermissionGate permission="campaigns.edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); openEditDialog(campaign); }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate permission="campaigns.delete">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => openDeleteDialog(campaign.id, e)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {hasMore && (
              <div className="flex justify-center py-4 border-t">
                <Button variant="outline" onClick={loadMore}>
                  {t('campaigns.loadMore')} ({paginatedCampaigns.length} {t('common.of')} {filteredCampaigns.length})
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('campaigns.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('campaigns.delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCampaignToDelete(null)}>
              {t('campaigns.delete.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('campaigns.delete.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {fieldsConfigCampaign && (
        <CampaignFormBuilder
          open={fieldsConfigOpen}
          onOpenChange={setFieldsConfigOpen}
          campaignId={fieldsConfigCampaign.id}
          campaignName={fieldsConfigCampaign.name}
          companyId={fieldsConfigCampaign.organization_id || ""}
        />
      )}

      {formPreviewCampaign && (
        <CampaignFormPreview
          open={formPreviewOpen}
          onOpenChange={setFormPreviewOpen}
          campaignId={formPreviewCampaign.id}
          campaignName={formPreviewCampaign.name}
        />
      )}

      {routingRulesCampaign && (
        <CampaignRoutingRules
          open={routingRulesOpen}
          onOpenChange={setRoutingRulesOpen}
          campaignId={routingRulesCampaign.id}
          campaignName={routingRulesCampaign.name}
          companyId={routingRulesCampaign.organization_id || ""}
        />
      )}

      {brandingCampaign && (
        <CampaignBrandingConfig
          open={brandingOpen}
          onOpenChange={setBrandingOpen}
          campaignId={brandingCampaign.id}
          campaignName={brandingCampaign.name}
        />
      )}
    </>
  );
};

export default Campaigns;
