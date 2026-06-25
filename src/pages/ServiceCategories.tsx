import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, FolderTree, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PermissionGate } from "@/components/PermissionGate";
import { useCompany } from "@/contexts/CompanyContext";

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  
  organization_id: string | null;
  is_active: boolean;
  sort_order: number;
  parent_category?: { name: string };
  anew_organizations?: { name: string };
}

export default function ServiceCategories() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { companies: userCompanies, userType, activeCompany } = useCompany();
  const [searchParams] = useSearchParams();
  const businessAreaId = searchParams.get("area");
  const [businessAreaName, setBusinessAreaName] = useState<string>("");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [allCompanies, setAllCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<ServiceCategory | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    parent_id: "",
    organization_id: "",
    sort_order: 0,
  });

  const isSystemAdmin = userType === "system_admin";

  // Get available companies based on user access
  const availableCompanies = isSystemAdmin ? allCompanies : userCompanies;

  useEffect(() => {
    loadCategories();
    if (businessAreaId) {
      loadBusinessAreaName();
    }
    if (isSystemAdmin) {
      loadAllCompanies();
    }
  }, [businessAreaId, isSystemAdmin, activeCompany?.id]);

  const loadAllCompanies = async () => {
    if (!activeCompany?.id) return;
    try {
      const { resolveOrgSubtree } = await import("@/lib/orgSubtree");
      const subtreeIds = await resolveOrgSubtree(activeCompany.id);
      const { data, error } = await supabase
        .from("anew_organizations")
        .select("id, name")
        .in("id", subtreeIds)
        .order("name");

      if (error) throw error;
      setAllCompanies(data || []);
    } catch (error: any) {
      console.error("Error loading companies:", error);
    }
  };

  const loadBusinessAreaName = async () => {
    if (!businessAreaId) return;
    
    try {
      const { data, error } = await supabase
        .from("anew_organizations")
        .select("name")
        .eq("id", businessAreaId)
        .single();
      
      if (error) throw error;
      setBusinessAreaName(data?.name || "");
    } catch (error: any) {
      console.error("Error loading business area:", error);
    }
  };

  const loadCategories = async () => {
    // Only load if we have an active company to scope to
    if (!activeCompany?.id) {
      setCategories([]);
      setLoading(false);
      return;
    }

    try {
      const { resolveOrgSubtree } = await import("@/lib/orgSubtree");
      const subtreeIds = await resolveOrgSubtree(activeCompany.id);

      const { data, error } = await supabase
        .from("service_categories")
        .select(`
          *,
          parent_category:service_categories!parent_id(name),
          anew_organizations!organization_id(name)
        `)
        .is("parent_id", null)
        .in("organization_id", subtreeIds)
        .order("name");

      if (error) throw error;

      setCategories((data || []) as unknown as ServiceCategory[]);
    } catch (error: any) {
      toast({
        title: t('serviceCategories.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.organization_id) {
      toast({
        title: t('serviceCategories.toast.companyRequired'),
        description: t('serviceCategories.toast.selectCompany'),
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Sessão inválida.", variant: "destructive" });
        return;
      }

      const slug = formData.slug || generateSlug(formData.name);

      if (editingCategory) {
        const { error } = await supabase
          .from("service_categories")
          .update({
            name: formData.name,
            description: formData.description || null,
            organization_id: formData.organization_id,
            sort_order: formData.sort_order,
          } as any)
          .eq("id", editingCategory.id)
          .eq("organization_id", editingCategory.organization_id ?? "");

        if (error) throw error;

        toast({
          title: t('serviceCategories.toast.updateSuccess'),
        });
      } else {
        const { error } = await supabase
          .from("service_categories")
          .insert({
            name: formData.name,
            slug,
            description: formData.description || null,
            parent_id: formData.parent_id || null,
            organization_id: formData.organization_id,
            sort_order: formData.sort_order,
            is_active: true,
            created_by: businessUserId,
          } as any);

        if (error) throw error;

        toast({
          title: t('serviceCategories.toast.createSuccess'),
        });
      }

      handleCloseDialog(false);
      loadCategories();
    } catch (error: any) {
      toast({
        title: editingCategory ? t('serviceCategories.toast.updateError') : t('serviceCategories.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openDeleteDialog = (category: ServiceCategory) => {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return;

    try {
      const { error } = await supabase
        .from("service_categories")
        .delete()
        .eq("id", categoryToDelete.id)
        .eq("organization_id", categoryToDelete.organization_id);

      if (error) throw error;

      toast({
        title: t('serviceCategories.toast.success'),
        description: t('serviceCategories.toast.deleteSuccess'),
      });

      loadCategories();
    } catch (error: any) {
      toast({
        title: t('serviceCategories.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    }
  };

  const openEditDialog = (category: ServiceCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      parent_id: category.parent_id || "",
      organization_id: category.organization_id || "",
      sort_order: category.sort_order,
    });
    setOpen(true);
  };

  const resetForm = () => {
    setEditingCategory(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      parent_id: "",
      organization_id: activeCompany?.id || "",
      sort_order: 0,
    });
  };

  const handleCloseDialog = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetForm();
    }
  };

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FolderTree className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('serviceCategories.title')}</h1>
              {businessAreaName && (
                <p className="text-sm text-muted-foreground mt-1">
                  {t('serviceCategories.businessArea')}: <span className="font-medium">{businessAreaName}</span>
                </p>
              )}
            </div>
          </div>
          <PermissionGate permission="service_categories.create">
            <Button onClick={() => { resetForm(); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {t('serviceCategories.addCategory')}
            </Button>
          </PermissionGate>
          <Dialog open={open} onOpenChange={handleCloseDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? t('serviceCategories.dialog.editTitle') : t('serviceCategories.dialog.newTitle')}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label id="org-select-label">{t('serviceCategories.form.company')}</Label>
                  <Select
                    value={formData.organization_id}
                    onValueChange={(value) => setFormData({ ...formData, organization_id: value })}
                  >
                    <SelectTrigger aria-labelledby="org-select-label">
                      <SelectValue placeholder={t('serviceCategories.form.selectCompany')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCompanies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t('serviceCategories.form.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">{t('serviceCategories.form.slug')}</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder={t('serviceCategories.form.slugPlaceholder')}
                    disabled={!!editingCategory}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('serviceCategories.form.slugHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('serviceCategories.form.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sort_order">{t('serviceCategories.form.sortOrder')}</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => handleCloseDialog(false)}>
                    {t('serviceCategories.form.cancel')}
                  </Button>
                  <Button type="submit">
                    {editingCategory ? t('serviceCategories.form.update') : t('serviceCategories.form.create')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('serviceCategories.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('serviceCategories.table.name')}</TableHead>
                <TableHead>{t('serviceCategories.table.company')}</TableHead>
                <TableHead>{t('serviceCategories.table.slug')}</TableHead>
                <TableHead>{t('serviceCategories.table.sortOrder')}</TableHead>
                <TableHead>{t('serviceCategories.table.status')}</TableHead>
                <TableHead className="text-right">{t('serviceCategories.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">{t('serviceCategories.loading')}</TableCell>
                </TableRow>
              ) : filteredCategories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">{t('serviceCategories.noCategories')}</TableCell>
                </TableRow>
              ) : (
                filteredCategories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>{category.anew_organizations?.name || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{category.slug}</TableCell>
                    <TableCell>{category.sort_order}</TableCell>
                    <TableCell>
                      <Badge variant={category.is_active ? "default" : "secondary"}>
                        {category.is_active ? t('serviceCategories.status.active') : t('serviceCategories.status.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PermissionGate permission="service_categories.edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(category)}
                            aria-label={t('serviceCategories.actions.edit')}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate permission="service_categories.delete">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(category)}
                            aria-label={t('serviceCategories.actions.delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('serviceCategories.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {categoryToDelete && (
                  <>
                    {t('serviceCategories.delete.message', { name: categoryToDelete.name })}
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('serviceCategories.delete.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {t('serviceCategories.delete.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
