import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, ArrowLeft, Star, Palette, Copy } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { PermissionGate } from "@/components/PermissionGate";
import { ProposalTemplateEditor } from "@/components/ProposalTemplateEditor";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface ProposalTemplate {
  id: string;
  name: string;
  description: string | null;
  template_type: "proposal" | "quote";
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  is_default: boolean;
  is_active: boolean;
  company_id: string | null; // mapped from organization_id
  created_at: string;
}

interface Company {
  id: string;
  name: string;
}

export default function ProposalTemplates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, companies } = useCompany();

  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (activeCompany?.id) {
      setFilterCompany(activeCompany.id);
    }
  }, [activeCompany]);

  useEffect(() => {
    fetchTemplates();
  }, [filterCompany]);

  const fetchTemplates = async () => {
    try {
      let query = supabase.from("proposal_templates").select("*").order("name") as any;
      if (filterCompany !== "all") {
        query = query.eq("organization_id", filterCompany);
      } else {
        // restrict to companies the user has access to
        const ids = companies.map(c => c.id);
        if (ids.length > 0) query = query.in("organization_id", ids);
      }
      const { data, error } = await query;
      if (error) throw error;
      setTemplates((data || []) as unknown as ProposalTemplate[]);
    } catch (error: any) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };



  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from("proposal_templates").delete().eq("id", deletingId);
      if (error) throw error;
      toast({ title: "Template eliminado" });
      fetchTemplates();
    } catch (error: any) {
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (templateId: string) => {
    setDuplicatingId(templateId);
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      const { data: original, error: fetchError } = await (supabase.from("proposal_templates") as any)
        .select("*")
        .eq("id", templateId)
        .single();

      if (fetchError) throw fetchError;
      if (!original) throw new Error("Template não encontrado");

      const { id, created_at, updated_at, is_default, ...copyData } = original;
      const duplicatePayload = {
        ...copyData,
        name: `${original.name} — Cópia`,
        is_default: false,
        is_active: true,
        created_by: businessUserId,
      };

      const { error: insertError } = await (supabase.from("proposal_templates") as any)
        .insert(duplicatePayload);

      if (insertError) throw insertError;

      toast({ title: "Template duplicado" });
      fetchTemplates();
    } catch (error: any) {
      toast({ title: "Erro ao duplicar", description: error.message, variant: "destructive" });
    } finally {
      setDuplicatingId(null);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Show editor if active
  if (showEditor) {
    return (
      <ProposalTemplateEditor 
        templateId={editingTemplateId} 
        onClose={() => {
          setShowEditor(false);
          setEditingTemplateId(null);
          fetchTemplates();
        }}
      />
    );
  }

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/proposals")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Templates de Propostas</h1>
              <p className="text-muted-foreground">Configurar design e estilo das propostas</p>
            </div>
          </div>
          <PermissionGate permission="proposals.manage">
            <Button onClick={() => { setEditingTemplateId(null); setShowEditor(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Template
            </Button>
          </PermissionGate>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px] max-w-md">
            <Input placeholder="Pesquisar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="w-[200px]">
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Empresas</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cores</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">A carregar...</TableCell></TableRow>
              ) : filteredTemplates.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum template</TableCell></TableRow>
              ) : (
                filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Palette className="h-4 w-4 text-primary" />
                        <span className="font-medium">{template.name}</span>
                        {template.is_default && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {template.template_type === "quote" ? "Orçamento" : "Proposta"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <div className="w-6 h-6 rounded border" style={{ backgroundColor: template.primary_color }} />
                        <div className="w-6 h-6 rounded border" style={{ backgroundColor: template.secondary_color }} />
                        <div className="w-6 h-6 rounded border" style={{ backgroundColor: template.accent_color }} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.is_active ? "default" : "secondary"}>
                        {template.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(template.created_at), "dd/MM/yyyy", { locale: pt })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PermissionGate permission="proposals.manage">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingTemplateId(template.id); setShowEditor(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" disabled={duplicatingId === template.id} onClick={() => handleDuplicate(template.id)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setDeletingId(template.id); setDeleteDialogOpen(true); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </PermissionGate>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar Template</AlertDialogTitle>
              <AlertDialogDescription>Tem a certeza? Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
