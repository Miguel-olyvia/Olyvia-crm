import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Settings, Pencil, Trash2, Copy, Filter } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Badge } from "@/components/ui/badge";
import { QuoteTemplateEditor } from "@/components/QuoteTemplateEditor";

interface QuoteTemplate {
  id: string;
  name: string;
  codigo: string;
  description: string | null;
  active: boolean;
  created_at: string;
  organization_id: string | null;
  item_count?: number;
  companies: {
    name: string;
  } | null;
  organization_name?: string;
}


export default function QuoteModels() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { t } = useTranslation();
  const { activeCompany } = useCompany();

  // Redirect to dashboard if no view permission
  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasPermission("quote_templates.view")) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, navigate, activeCompany]);

  // Reload templates when active company changes
  useEffect(() => {
    setTemplates([]);
    fetchTemplates();
  }, [activeCompany?.id]);


  const fetchTemplates = async () => {
    // Only fetch if we have an active company
    if (!activeCompany?.id) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from("quote_templates")
        .select("id, name, codigo, description, active, created_at, organization_id, updated_at, created_by, quote_template_items(id)")
        .eq("organization_id", activeCompany.id)
        .order("codigo", { ascending: true });

      if (error) throw error;

      // Resolve organization name
      const { data: orgData } = await (supabase as any)
        .from("anew_organizations")
        .select("id, name")
        .eq("id", activeCompany.id)
        .single();

      const templatesWithCount = (data || []).map((template: any) => ({
        ...template,
        item_count: Array.isArray(template.quote_template_items) ? template.quote_template_items.length : 0,
        companies: orgData ? { name: orgData.name } : null,
        organization_name: orgData?.name || null,
      }));

      setTemplates(templatesWithCount as QuoteTemplate[]);
    } catch (error: any) {
      toast({
        title: t('quoteTemplates.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTemplateId) return;

    try {
      const { error } = await supabase
        .from("quote_templates")
        .delete()
        .eq("id", deleteTemplateId);

      if (error) throw error;

      toast({
        title: t('quoteTemplates.toast.deleteSuccess'),
        description: t('quoteTemplates.toast.deleteSuccessDesc'),
      });

      fetchTemplates();
    } catch (error: any) {
      toast({
        title: t('quoteTemplates.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteTemplateId(null);
    }
  };

  const handleDuplicate = async (templateId: string) => {
    try {
      // Get template data
      const { data: template, error: templateError } = await supabase
        .from("quote_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (templateError) throw templateError;

      // Get template items
      const { data: items, error: itemsError } = await supabase
        .from("quote_template_items")
        .select("*")
        .eq("template_id", templateId);

      if (itemsError) throw itemsError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador. Faça login novamente.", variant: "destructive" });
        return;
      }

      // Create new template
      const { data: newTemplate, error: newTemplateError } = await supabase
        .from("quote_templates")
        .insert({
          name: `${template.name} (Copy)`,
          codigo: `${template.codigo}_copy_${Date.now()}`,
          description: template.description,
          active: false,
          created_by: businessUserId,
        })
        .select()
        .single();

      if (newTemplateError) throw newTemplateError;

      // Copy template items
      if (items && items.length > 0) {
        const newItems = items.map(item => ({
          template_id: newTemplate.id,
          product_id: item.product_id,
          service_id: item.service_id,
          item_type: item.item_type,
          default_qt: item.default_qt,
          required: item.required,
          ordem: item.ordem,
        }));

        const { error: insertError } = await supabase
          .from("quote_template_items")
          .insert(newItems);

        if (insertError) throw insertError;
      }

      toast({
        title: t('quoteTemplates.toast.duplicateSuccess'),
        description: t('quoteTemplates.toast.duplicateSuccessDesc'),
      });

      fetchTemplates();
    } catch (error: any) {
      toast({
        title: t('quoteTemplates.toast.duplicateError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (showEditor) {
    return (
      <QuoteTemplateEditor
        templateId={selectedTemplate}
        onClose={() => {
          setShowEditor(false);
          setSelectedTemplate(null);
          fetchTemplates();
        }}
      />
    );
  }

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('quoteTemplates.title')}</h1>
            <p className="text-muted-foreground">
              {t('quoteTemplates.subtitle')}
            </p>
          </div>
          <PermissionGate permission="quote_templates.create">
            <Button
              onClick={() => {
                setSelectedTemplate(null);
                setShowEditor(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('quoteTemplates.newTemplate')}
            </Button>
          </PermissionGate>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px] max-w-md">
            <Input
              placeholder={t('common.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {activeCompany && (
            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm">
              <span className="text-muted-foreground">{t('common.company')}:</span>
              <span className="font-medium">{activeCompany.name}</span>
            </div>
          )}
        </div>

        <Card>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('quoteTemplates.loading')}
            </div>
          ) : (() => {
            // Apply client-side search filter
            const filteredTemplates = templates.filter(template => {
              if (!searchTerm.trim()) return true;
              const search = searchTerm.toLowerCase();
              return (
                template.name.toLowerCase().includes(search) ||
                template.codigo.toLowerCase().includes(search) ||
                (template.description?.toLowerCase().includes(search)) ||
                (template.companies?.name?.toLowerCase().includes(search))
              );
            });

            if (filteredTemplates.length === 0) {
              return (
                <div className="p-8 text-center space-y-4">
                  <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    {t('quoteTemplates.empty')}
                  </p>
                  <PermissionGate permission="quote_templates.create">
                    <Button onClick={() => setShowEditor(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('quoteTemplates.createFirst')}
                    </Button>
                  </PermissionGate>
                </div>
              );
            }

            return (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('quoteTemplates.table.code')}</TableHead>
                  <TableHead>{t('quoteTemplates.table.name')}</TableHead>
                  <TableHead>{t('quoteTemplates.table.company')}</TableHead>
                  <TableHead>{t('quoteTemplates.table.description')}</TableHead>
                  <TableHead>{t('quoteTemplates.table.items')}</TableHead>
                  <TableHead>{t('quoteTemplates.table.status')}</TableHead>
                  <TableHead>{t('quoteTemplates.table.created')}</TableHead>
                  <TableHead className="text-right">{t('quoteTemplates.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">
                      {template.codigo}
                    </TableCell>
                    <TableCell>{template.name}</TableCell>
                    <TableCell>
                      {template.companies?.name || t('quoteTemplates.noCompany')}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {template.description || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t('quoteTemplates.itemsCount', { count: template.item_count || 0 })}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {template.active ? (
                        <Badge variant="default">{t('quoteTemplates.active')}</Badge>
                      ) : (
                        <Badge variant="outline">{t('quoteTemplates.inactive')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(template.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PermissionGate permission="quote_templates.duplicate">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDuplicate(template.id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate permission="quote_templates.edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedTemplate(template.id);
                              setShowEditor(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate permission="quote_templates.delete">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTemplateId(template.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </PermissionGate>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            );
          })()}
        </Card>
      </div>

      <AlertDialog
        open={deleteTemplateId !== null}
        onOpenChange={(open) => !open && setDeleteTemplateId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('quoteTemplates.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('quoteTemplates.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('quoteTemplates.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('quoteTemplates.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
