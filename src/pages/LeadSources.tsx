import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Plus, Globe, Phone, Users, Mail, Calendar, Search as SearchIcon, User, Loader2, Pencil, Trash2 } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { HelpButton } from "@/components/HelpButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
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
import { PermissionGate } from "@/components/PermissionGate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface LeadSource {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  organization_id: string | null;
  created_at: string;
  utm_aliases?: string[] | null;
  anew_organizations?: { name: string } | null;
}

// Defesa contra CSS injection via valores guardados na BD.
const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const sanitizeColor = (value: unknown, fallback = "#3B82F6"): string =>
  typeof value === "string" && COLOR_RE.test(value.trim()) ? value.trim() : fallback;

const UTM_ALIAS_RE = /^[a-z0-9_-]+$/;
const MAX_ALIASES = 20;

const LeadSources = () => {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<LeadSource | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const iconOptions = [
    { value: "globe", label: t('leadSources.icons.website'), icon: Globe },
    { value: "phone", label: t('leadSources.icons.phone'), icon: Phone },
    { value: "users", label: t('leadSources.icons.referral'), icon: Users },
    { value: "mail", label: t('leadSources.icons.email'), icon: Mail },
    { value: "calendar", label: t('leadSources.icons.event'), icon: Calendar },
    { value: "search", label: t('leadSources.icons.search'), icon: SearchIcon },
    { value: "user", label: t('leadSources.icons.direct'), icon: User },
  ];

  const colorOptions = [
    { value: "#3B82F6", label: t('leadSources.colors.blue') },
    { value: "#10B981", label: t('leadSources.colors.green') },
    { value: "#F59E0B", label: t('leadSources.colors.yellow') },
    { value: "#EF4444", label: t('leadSources.colors.red') },
    { value: "#8B5CF6", label: t('leadSources.colors.purple') },
    { value: "#EC4899", label: t('leadSources.colors.pink') },
    { value: "#6B7280", label: t('leadSources.colors.gray') },
    { value: "#1877F2", label: t('leadSources.colors.facebook') },
    { value: "#E4405F", label: t('leadSources.colors.instagram') },
  ];

  const getIconComponent = (iconName: string | null) => {
    const found = iconOptions.find(o => o.value === iconName);
    return found ? found.icon : Globe;
  };

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "globe",
    color: "#3B82F6",
    is_active: true,
    organization_id: "",
    utm_aliases: [] as string[],
  });
  const [aliasInput, setAliasInput] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [sourcesRes, organizationsRes] = await Promise.all([
        supabase
          .from("lead_sources")
          .select("*, anew_organizations(name)")
          .order("name"),
        supabase.from("anew_organizations").select("id, name").in("type", ["empresa", "holding"]),
      ]);

      if (sourcesRes.error) throw sourcesRes.error;
      if (organizationsRes.error) throw organizationsRes.error;

      setSources(sourcesRes.data || []);
      setOrganizations(organizationsRes.data || []);
    } catch (error: any) {
      toast({
        title: t('leadSources.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('leadSources.toast.validationError'),
        description: t('leadSources.toast.nameRequired'),
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('leadSources.toast.userNotAuthenticated'));
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      // Cross-source duplicate alias validation (same org or globals visible to this org).
      const myOrgId = formData.organization_id || null;
      const conflicts: { alias: string; sourceName: string }[] = [];
      for (const a of formData.utm_aliases) {
        for (const s of sources) {
          if (editingSource && s.id === editingSource.id) continue;
          const sameScope =
            (s.organization_id ?? null) === myOrgId || s.organization_id == null || myOrgId == null;
          if (!sameScope) continue;
          if ((s.utm_aliases || []).includes(a)) {
            conflicts.push({ alias: a, sourceName: s.name });
          }
        }
      }
      if (conflicts.length > 0) {
        toast({
          title: t('leadSources.toast.validationError'),
          description: `Aliases já usados: ${conflicts.map(c => `"${c.alias}" → ${c.sourceName}`).join(", ")}`,
          variant: "destructive",
        });
        return;
      }

      const sourceData: any = {
        name: formData.name,
        description: formData.description || null,
        icon: formData.icon,
        color: formData.color,
        is_active: formData.is_active,
        organization_id: formData.organization_id || null,
        utm_aliases: formData.utm_aliases,
      };

      if (editingSource) {
        const { error } = await supabase
          .from("lead_sources")
          .update(sourceData)
          .eq("id", editingSource.id);

        if (error) throw error;
        toast({ title: t('leadSources.toast.updateSuccess') });
      } else {
        const { error } = await supabase
          .from("lead_sources")
          .insert({ ...sourceData, created_by: businessUserId } as any);

        if (error) throw error;
        toast({ title: t('leadSources.toast.createSuccess') });
      }

      handleCloseDialog();
      loadData();
    } catch (error: any) {
      toast({
        title: t('leadSources.toast.saveError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!sourceToDelete) return;

    try {
      const { error } = await supabase
        .from("lead_sources")
        .delete()
        .eq("id", sourceToDelete);

      if (error) throw error;
      toast({ title: t('leadSources.toast.deleteSuccess') });
      setDeleteDialogOpen(false);
      setSourceToDelete(null);
      loadData();
    } catch (error: any) {
      toast({
        title: t('leadSources.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (source: LeadSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      description: source.description || "",
      icon: source.icon || "globe",
      color: sanitizeColor(source.color),
      is_active: source.is_active,
      organization_id: source.organization_id || "",
      utm_aliases: Array.isArray(source.utm_aliases) ? source.utm_aliases : [],
    });
    setAliasInput("");
    setOpen(true);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingSource(null);
    setFormData({
      name: "",
      description: "",
      icon: "globe",
      color: "#3B82F6",
      is_active: true,
      organization_id: "",
      utm_aliases: [],
    });
    setAliasInput("");
  };

  const addAlias = (raw: string) => {
    const normalized = raw.toLowerCase().trim();
    if (!normalized) return;
    if (!UTM_ALIAS_RE.test(normalized)) {
      toast({
        title: t('leadSources.toast.validationError'),
        description: `Alias inválido: "${raw}". Usa apenas a-z, 0-9, _ ou -.`,
        variant: "destructive",
      });
      return;
    }
    if (formData.utm_aliases.includes(normalized)) {
      setAliasInput("");
      return;
    }
    if (formData.utm_aliases.length >= MAX_ALIASES) {
      toast({
        title: t('leadSources.toast.validationError'),
        description: `Máximo de ${MAX_ALIASES} aliases por Source.`,
        variant: "destructive",
      });
      return;
    }
    setFormData({ ...formData, utm_aliases: [...formData.utm_aliases, normalized] });
    setAliasInput("");
  };

  const removeAlias = (alias: string) => {
    setFormData({ ...formData, utm_aliases: formData.utm_aliases.filter((a) => a !== alias) });
  };


  const openDeleteDialog = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSourceToDelete(id);
    setDeleteDialogOpen(true);
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

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6">
          <div><h1 className="text-2xl font-bold text-foreground">{t('leadSources.title')}</h1><p className="text-muted-foreground">{t('leadSources.subtitle')}</p></div>
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
              <h1 className="text-2xl font-bold text-foreground">{t('leadSources.title')}</h1>
              <HelpButton pageKey="marketing.sources" />
            </div>
            <p className="text-muted-foreground">
              {t('leadSources.subtitle')}
            </p>
          </div>
          <PermissionGate permission="channels.create">
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('leadSources.newSource')}
            </Button>
          </PermissionGate>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <OlyviaLoader size={40} />
          </div>
        ) : sources.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-lg border border-border">
            <Globe className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {t('leadSources.noSources')}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t('leadSources.noSourcesDesc')}
            </p>
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('leadSources.createSource')}
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('leadSources.table.name')}</TableHead>
                  <TableHead>{t('leadSources.table.description')}</TableHead>
                  <TableHead>Aliases UTM</TableHead>
                  <TableHead>{t('leadSources.table.company')}</TableHead>
                  <TableHead>{t('leadSources.table.status')}</TableHead>
                  <TableHead className="text-right">{t('leadSources.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => {
                  const IconComponent = getIconComponent(source.icon);
                  const aliases = Array.isArray(source.utm_aliases) ? source.utm_aliases : [];
                  return (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: sanitizeColor(source.color) }}
                          >
                            <IconComponent className="w-4 h-4 text-white" />
                          </div>
                          <span className="font-medium">{source.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {source.description || "-"}
                      </TableCell>
                      <TableCell>
                        {aliases.length === 0 ? (
                          <span className="text-muted-foreground text-sm">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {aliases.slice(0, 3).map((a) => (
                              <Badge key={a} variant="secondary" className="font-mono text-xs">{a}</Badge>
                            ))}
                            {aliases.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{aliases.length - 3}</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {source.anew_organizations?.name || (
                          <Badge variant="outline">{t('leadSources.scope.global')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={source.is_active ? "default" : "secondary"}>
                          {source.is_active ? t('leadSources.status.active') : t('leadSources.status.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <PermissionGate permission="channels.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(source)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="channels.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => openDeleteDialog(source.id, e)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </PermissionGate>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={open} onOpenChange={(o) => !o && handleCloseDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSource ? t('leadSources.editSource') : t('leadSources.newSource')}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('leadSources.form.name')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('leadSources.form.namePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('leadSources.form.description')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('leadSources.form.descriptionPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('leadSources.form.icon')}</Label>
                  <Select
                    value={formData.icon}
                    onValueChange={(v) => setFormData({ ...formData, icon: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {iconOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <opt.icon className="w-4 h-4" />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('leadSources.form.color')}</Label>
                  <Select
                    value={formData.color}
                    onValueChange={(v) => setFormData({ ...formData, color: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {colorOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: opt.value }}
                            />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('leadSources.form.company')}</Label>
                <Select
                  value={formData.organization_id}
                  onValueChange={(v) => setFormData({ ...formData, organization_id: v === "global" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('leadSources.form.companyPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">{t('leadSources.form.companyPlaceholder')}</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(c) => setFormData({ ...formData, is_active: c })}
                />
                <Label htmlFor="is_active">{t('leadSources.form.active')}</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="utm_alias_input">Aliases UTM (match automático)</Label>
                <p className="text-xs text-muted-foreground">
                  Leads com <code className="font-mono">utm_source</code> igual a um destes valores são atribuídos a esta Source quando não houver Canal mapeado. Apenas a-z, 0-9, _ e -.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="utm_alias_input"
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addAlias(aliasInput);
                      }
                    }}
                    placeholder="ex: mailchimp, newsletter, qr..."
                  />
                  <Button type="button" variant="outline" onClick={() => addAlias(aliasInput)}>
                    Adicionar
                  </Button>
                </div>
                {formData.utm_aliases.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {formData.utm_aliases.map((a) => (
                      <Badge key={a} variant="secondary" className="font-mono text-xs gap-1">
                        {a}
                        <button
                          type="button"
                          onClick={() => removeAlias(a)}
                          className="ml-1 hover:text-destructive"
                          aria-label={`Remover alias ${a}`}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>


              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  {t('leadSources.form.cancel')}
                </Button>
                <Button type="submit">
                  {editingSource ? t('leadSources.form.save') : t('leadSources.form.create')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('leadSources.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('leadSources.delete.description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('leadSources.delete.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                {t('leadSources.delete.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
};

export default LeadSources;
