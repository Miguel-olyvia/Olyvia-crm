import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Pencil, Trash2, Info, RotateCcw } from "lucide-react";
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
import { serviceSubcategorySchema } from "@/lib/validations";
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
  // path and description are nullable in the DB; coerced to string on load.
  path: string;
  description: string;
  is_active: boolean;
  is_deleted?: boolean;
  sort_order: number;
  parent_id: string;
  organization_id: string | null;
  parent_name?: string;
  parent_company_name?: string;
}

interface ParentCategory {
  id: string;
  name: string;
  organization_id: string | null;
  anew_organizations?: { name: string };
}

// Shape of raw rows returned by the subcategory SELECT query (CAT-ANY-001).
interface SubRow {
  id: string;
  name: string;
  slug: string;
  path: string | null;
  description: string | null;
  is_active: boolean;
  is_deleted?: boolean;
  sort_order: number;
  parent_id: string;
  organization_id: string | null;
}

export default function ServiceSubcategories() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, isLoading: contextLoading } = useCompany();
  const [subcategories, setSubcategories] = useState<ServiceSubcategory[]>([]);
  const [parentCategories, setParentCategories] = useState<ParentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      // Load parent categories (those without parent_id) - filtered by user's companies
      let parentsQuery = supabase
        .from("service_categories")
        .select("id, name, organization_id, anew_organizations!organization_id(name)")
        .is("parent_id", null)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .order("name");

      // ALWAYS filter by activeCompany - this applies to ALL users including admins
      if (!activeCompany?.id) {
        setParentCategories([]);
        setSubcategories([]);
        setLoading(false);
        return;
      }
      parentsQuery = parentsQuery.eq("organization_id", activeCompany.id);

      const { data: parents, error: parentsError } = await parentsQuery;

      if (parentsError) throw parentsError;
      setParentCategories((parents || []) as ParentCategory[]);

      // Load subcategories (those with parent_id).
      // Apply the org filter server-side for non-admin users to avoid transferring the
      // full service_categories table and relying on client-side filtering as the only
      // org-scope mechanism (SVC-CLIENT-SIDE-FILTER-UNSCOPED).
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
        .eq("is_deleted", showDeleted)
        .order("path");

      // ALWAYS filter by activeCompany - this applies to ALL users including admins
      subsQuery = subsQuery.eq("organization_id", activeCompany.id);

      const { data: subs, error: subsError } = await subsQuery;

      if (subsError) throw subsError;

      // Usar parentCategories já carregadas para enriquecer os dados
      const parentCategoriesData = (parents || []) as ParentCategory[];

      const filteredSubs: SubRow[] = (subs || []) as SubRow[];

      const formattedSubs = filteredSubs.map((sub: SubRow) => {
        const parentCat = parentCategoriesData.find(p => p.id === sub.parent_id);
        return {
          ...sub,
          // Coerce nullable DB fields to string to satisfy ServiceSubcategory interface.
          path: sub.path ?? "",
          description: sub.description ?? "",
          parent_name: parentCat?.name || "",
          parent_company_name: parentCat?.anew_organizations?.name || "",
          organization_id: sub.organization_id ?? parentCat?.organization_id ?? null,
        };
      });

      setSubcategories(formattedSubs);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      toast({
        title: t('serviceSubcategories.toast.loadError'),
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id, showDeleted, t, toast]);

  useEffect(() => {
    // Esperar que o contexto carregue antes de buscar dados
    if (contextLoading) return;
    loadData();
  }, [loadData, contextLoading]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = serviceSubcategorySchema.safeParse({
      name: formData.name,
      parent_id: formData.parent_id,
    });
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) errors[err.path[0].toString()] = err.message;
      });
      setFieldErrors(errors);
      toast({
        title: t('serviceSubcategories.toast.error'),
        description: validation.error.errors[0]?.message,
        variant: "destructive",
      });
      return;
    }
    setFieldErrors({});

    try {
      // resolveCurrentBusinessUserId() performs its own auth.getUser() internally and
      // handles the null case — a separate getUser() call here is redundant and creates
      // a divergent early-exit error path on transient auth failures (SVC-DEAD-AUTH-CALL-SUBMIT).
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        throw new Error("Perfil de utilizador não encontrado");
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
        const { error } = await supabase.rpc("rpc_update_service_subcategory", {
          p_id: editingSubcategory.id,
          p_name: formData.name,
          p_slug: slug,
          p_path: path,
          p_description: formData.description || null,
          p_parent_id: formData.parent_id,
          p_sort_order: formData.sort_order,
        });

        if (error) throw error;

        toast({
          title: t('serviceSubcategories.toast.updateSuccess'),
        });
      } else {
        const { error } = await supabase.rpc("rpc_create_service_subcategory", {
          p_name: formData.name,
          p_slug: slug,
          p_path: path,
          p_description: formData.description || null,
          p_parent_id: formData.parent_id,
          p_sort_order: formData.sort_order,
        });

        if (error) throw error;

        toast({
          title: t('serviceSubcategories.toast.createSuccess'),
        });
      }

      handleCloseDialog();
      await loadData();
    } catch (error: unknown) {
      toast({
        title: t('serviceSubcategories.toast.saveError'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!subcategoryToDelete) return;

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Sessão inválida.");

      const { error } = await supabase.rpc("rpc_delete_service_category", {
        p_id: subcategoryToDelete,
      });

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
      await loadData();
    } catch (error: unknown) {
      toast({
        title: t('serviceSubcategories.toast.deleteError'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setSubcategoryToDelete(null);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Sessão inválida.");

      const { error } = await supabase.rpc("rpc_restore_service_category", {
        p_id: id,
      });

      if (error) throw error;

      toast({
        title: t('serviceSubcategories.toast.restoreSuccess') || "Subcategoria restaurada com sucesso.",
      });

      await loadData();
    } catch (error: unknown) {
      toast({
        title: t('serviceSubcategories.toast.deleteError'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
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
          <div className="flex gap-2">
            <PermissionGate permission="service_subcategories.delete">
              <Button
                variant={showDeleted ? "secondary" : "outline"}
                onClick={() => setShowDeleted((prev) => !prev)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {showDeleted ? "Ver ativas" : "Ver eliminadas"}
              </Button>
            </PermissionGate>
            <PermissionGate permission="service_subcategories.create">
              <Button onClick={() => { resetForm(); setOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                {t('serviceSubcategories.addSubcategory')}
              </Button>
            </PermissionGate>
          </div>
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
                  {fieldErrors.parent_id && <p className="text-sm text-destructive">{fieldErrors.parent_id}</p>}
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
                    className={fieldErrors.name ? "border-destructive" : ""}
                  />
                  {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
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
                        {!showDeleted && (
                          <PermissionGate permission="service_subcategories.edit">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t('common.edit')}
                              onClick={() => openEditDialog(sub)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                        )}
                        <PermissionGate permission="service_subcategories.delete">
                          {showDeleted ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Restaurar"
                              onClick={() => handleRestore(sub.id)}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t('common.delete')}
                              onClick={() => openDeleteDialog(sub.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
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
