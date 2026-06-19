import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Pencil, Trash2, Info } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useCompany } from "@/contexts/CompanyContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ServiceSubcategory {
  id: string;
  name: string;
  slug: string;
  path: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  parent_id: string;
  parent_name?: string;
  parent_company_name?: string;
}

interface ParentCategory {
  id: string;
  name: string;
  organization_id: string | null;
  anew_organizations?: { name: string };
}

export default function ServiceSubcategories() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { companies: userCompanies, userType, isLoading: contextLoading } = useCompany();
  const [subcategories, setSubcategories] = useState<ServiceSubcategory[]>([]);
  const [parentCategories, setParentCategories] = useState<ParentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subcategoryToDelete, setSubcategoryToDelete] = useState<string | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<ServiceSubcategory | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    parent_id: "",
    sort_order: 0,
  });

  const isSystemAdmin = userType === "system_admin";

  useEffect(() => {
    // Esperar que o contexto carregue antes de buscar dados
    if (contextLoading) return;
    loadData();
  }, [userCompanies, isSystemAdmin, contextLoading]);

  const loadData = async () => {
    try {
      // Load parent categories (those without parent_id) - filtered by user's companies
      let parentsQuery = supabase
        .from("service_categories")
        .select("id, name, organization_id, anew_organizations!organization_id(name)")
        .is("parent_id", null)
        .eq("is_active", true)
        .order("name");

      // Filter by user's companies if not system admin
      if (!isSystemAdmin && userCompanies.length > 0) {
        const companyIds = userCompanies.map(c => c.id);
        parentsQuery = parentsQuery.in("organization_id", companyIds);
      }

      const { data: parents, error: parentsError } = await parentsQuery;

      if (parentsError) throw parentsError;
      setParentCategories((parents || []) as ParentCategory[]);

      // Load subcategories (those with parent_id) - query simples sem self-join
      let subsQuery = supabase
        .from("service_categories")
        .select(`
          id,
          name,
          slug,
          path,
          description,
          is_active,
          sort_order,
          parent_id,
           organization_id
        `)
        .not("parent_id", "is", null)
        .order("path");

      const { data: subs, error: subsError } = await subsQuery;

      if (subsError) throw subsError;

      // Usar parentCategories já carregadas para enriquecer os dados
      const parentCategoriesData = (parents || []) as ParentCategory[];

      // Filter subcategories by company scope if not system admin
      let filteredSubs = subs || [];
      if (!isSystemAdmin && userCompanies.length > 0) {
        const companyIds = userCompanies.map((c) => c.id);
        filteredSubs = filteredSubs.filter((sub: any) => {
          const parentCat = parentCategoriesData.find(p => p.id === sub.parent_id);
          const companyId = sub.organization_id || parentCat?.organization_id;
          return companyId && companyIds.includes(companyId);
        });
      }

      const formattedSubs = filteredSubs.map((sub: any) => {
        const parentCat = parentCategoriesData.find(p => p.id === sub.parent_id);
        return {
          ...sub,
          parent_name: parentCat?.name || "",
          parent_company_name: parentCat?.anew_organizations?.name || "",
          organization_id: sub.organization_id || parentCat?.organization_id,
        };
      });

      setSubcategories(formattedSubs);
    } catch (error: any) {
      toast({
        title: t('serviceSubcategories.toast.loadError'),
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

    if (!formData.parent_id) {
      toast({
        title: t('serviceSubcategories.toast.parentRequired'),
        description: t('serviceSubcategories.toast.selectParent'),
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('serviceSubcategories.toast.notAuthenticated'));

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Sessão inválida.", variant: "destructive" });
        return;
      }

      // Validar que a categoria pai existe
      const parentCategory = parentCategories.find(c => c.id === formData.parent_id);
      if (!parentCategory) {
        toast({
          title: t('serviceSubcategories.toast.error'),
          description: t('serviceSubcategories.toast.parentNotFound'),
          variant: "destructive",
        });
        return;
      }

      // Validar que a categoria pai tem organization_id
      if (!parentCategory.organization_id) {
        toast({
          title: t('serviceSubcategories.toast.error'),
          description: t('serviceSubcategories.toast.parentNoCompany'),
          variant: "destructive",
        });
        return;
      }

      // Gerar slug com prefixo do pai para evitar conflitos
      const parentSlug = generateSlug(parentCategory.name);
      const baseSlug = formData.slug || generateSlug(formData.name);
      const slug = `${parentSlug}-${baseSlug}`;
      const path = `${parentCategory.name.toLowerCase()}/${baseSlug}`;

      if (editingSubcategory) {
        const { error } = await supabase
          .from("service_categories")
          .update({
            name: formData.name,
            slug,
            path,
            description: formData.description || null,
            sort_order: formData.sort_order,
            parent_id: formData.parent_id,
            organization_id: parentCategory.organization_id,
          })
          .eq("id", editingSubcategory.id);

        if (error) throw error;

        toast({
          title: t('serviceSubcategories.toast.updateSuccess'),
        });
      } else {
        const { error } = await supabase.from("service_categories").insert({
          name: formData.name,
          slug,
          path,
          description: formData.description || null,
          parent_id: formData.parent_id,
          sort_order: formData.sort_order,
          is_active: true,
          created_by: businessUserId,
          organization_id: parentCategory.organization_id,
        });

        if (error) throw error;

        toast({
          title: t('serviceSubcategories.toast.createSuccess'),
        });
      }

      handleCloseDialog();
      loadData();
    } catch (error: any) {
      toast({
        title: t('serviceSubcategories.toast.saveError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!subcategoryToDelete) return;

    try {
      // Limpar referências em serviços soft-deleted (não bloqueiam de forma legítima)
      await supabase
        .from("services")
        .update({ service_subcategory_id: null })
        .eq("service_subcategory_id", subcategoryToDelete)
        .not("deleted_at", "is", null);

      const { error } = await supabase
        .from("service_categories")
        .delete()
        .eq("id", subcategoryToDelete);

      if (error) {
        // Check if it's a foreign key constraint error
        if (error.code === "23503") {
          toast({
            title: t('serviceSubcategories.toast.cannotDelete'),
            description: t('serviceSubcategories.toast.inUseError'),
            variant: "destructive",
          });
          setDeleteDialogOpen(false);
          setSubcategoryToDelete(null);
          return;
        }
        throw error;
      }

      toast({
        title: t('serviceSubcategories.toast.deleteSuccess'),
      });
      
      setDeleteDialogOpen(false);
      setSubcategoryToDelete(null);
      loadData();
    } catch (error: any) {
      toast({
        title: t('serviceSubcategories.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setSubcategoryToDelete(null);
    }
  };

  const openEditDialog = (subcategory: ServiceSubcategory) => {
    setEditingSubcategory(subcategory);
    setFormData({
      name: subcategory.name,
      slug: subcategory.slug,
      description: subcategory.description || "",
      parent_id: subcategory.parent_id,
      sort_order: subcategory.sort_order,
    });
    setOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      description: "",
      parent_id: "",
      sort_order: 0,
    });
    setEditingSubcategory(null);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    resetForm();
  };

  const openDeleteDialog = (id: string) => {
    setSubcategoryToDelete(id);
    setDeleteDialogOpen(true);
  };

  const filteredSubcategories = subcategories.filter((sub) =>
    sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.parent_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get selected parent's company name for display
  const selectedParent = parentCategories.find(c => c.id === formData.parent_id);
  const selectedParentCompanyName = selectedParent?.anew_organizations?.name;

  return (
    <>
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">{t('serviceSubcategories.title')}</h1>
            <p className="text-muted-foreground">{t('serviceSubcategories.subtitle')}</p>
          </div>
          <PermissionGate permission="service_subcategories.create">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('serviceSubcategories.addSubcategory')}
                </Button>
              </DialogTrigger>
            </Dialog>
          </PermissionGate>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingSubcategory ? t('serviceSubcategories.dialog.editTitle') : t('serviceSubcategories.dialog.newTitle')}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="parent_id">{t('serviceSubcategories.form.parentCategory')}</Label>
                  <Select
                    value={formData.parent_id}
                    onValueChange={(value) => setFormData({ ...formData, parent_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('serviceSubcategories.form.selectParent')} />
                    </SelectTrigger>
                    <SelectContent>
                      {parentCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name} {cat.anew_organizations?.name ? `(${cat.anew_organizations.name})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.parent_id && selectedParentCompanyName && (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {t('serviceSubcategories.form.inheritedCompany')}: <strong>{selectedParentCompanyName}</strong>
                    </span>
                  </div>
                )}

                <div>
                  <Label htmlFor="name">{t('serviceSubcategories.form.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('serviceSubcategories.form.namePlaceholder')}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="slug">{t('serviceSubcategories.form.slug')}</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder={t('serviceSubcategories.form.slugPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="description">{t('serviceSubcategories.form.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('serviceSubcategories.form.descriptionPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="sort_order">{t('serviceSubcategories.form.sortOrder')}</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    {t('serviceSubcategories.form.cancel')}
                  </Button>
                  <Button type="submit">
                    {editingSubcategory ? t('serviceSubcategories.form.update') : t('serviceSubcategories.form.create')}
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
              placeholder={t('serviceSubcategories.searchPlaceholder')}
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
                <TableHead>{t('serviceSubcategories.table.name')}</TableHead>
                <TableHead>{t('serviceSubcategories.table.parentCategory')}</TableHead>
                <TableHead>{t('serviceSubcategories.table.company')}</TableHead>
                <TableHead>{t('serviceSubcategories.table.slug')}</TableHead>
                <TableHead>{t('serviceSubcategories.table.status')}</TableHead>
                <TableHead>{t('serviceSubcategories.table.sortOrder')}</TableHead>
                <TableHead className="text-right">{t('serviceSubcategories.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    {t('serviceSubcategories.loading')}
                  </TableCell>
                </TableRow>
              ) : filteredSubcategories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    {t('serviceSubcategories.noSubcategories')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSubcategories.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.name}</TableCell>
                    <TableCell>{sub.parent_name}</TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1">
                              {sub.parent_company_name || "-"}
                              {sub.parent_company_name && (
                                <Info className="w-3 h-3 text-muted-foreground" />
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('serviceSubcategories.inheritedFromParent')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{sub.slug}</TableCell>
                    <TableCell>
                      <Badge variant={sub.is_active ? "default" : "secondary"}>
                        {sub.is_active ? t('serviceSubcategories.status.active') : t('serviceSubcategories.status.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>{sub.sort_order}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PermissionGate permission="service_subcategories.edit">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(sub)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate permission="service_subcategories.delete">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(sub.id)}
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
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('serviceSubcategories.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('serviceSubcategories.delete.message')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSubcategoryToDelete(null)}>
              {t('serviceSubcategories.delete.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('serviceSubcategories.delete.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
