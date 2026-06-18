import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { 
  Bug, 
  Lightbulb, 
  CheckCircle2, 
  Plus, 
  User, 
  Calendar,
  MessageSquare,
  Sparkles,
  Filter,
  Pencil,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { EntryComments } from "@/components/team-hub/EntryComments";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type EntryType = "bug" | "improvement" | "task" | "knowledge";
type EntryStatus = "pending" | "in_progress" | "done";
type EntryPriority = "low" | "medium" | "high";

interface TeamEntry {
  id: string;
  type: EntryType;
  title: string;
  description: string;
  author_id: string | null;
  author_name: string;
  status: EntryStatus;
  priority: EntryPriority;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const typeConfig = {
  bug: { icon: Bug, color: "text-destructive", bg: "bg-destructive/10", label: "Bug" },
  improvement: { icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-500/10", label: "Melhoria" },
  task: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Tarefa Feita" },
  knowledge: { icon: Sparkles, color: "text-primary", bg: "bg-primary/10", label: "Conhecimento" }
};

const statusConfig = {
  pending: { label: "Pendente", color: "bg-muted text-muted-foreground" },
  in_progress: { label: "Em Progresso", color: "bg-amber-500/20 text-amber-700" },
  done: { label: "Concluído", color: "bg-emerald-500/20 text-emerald-700" }
};

const priorityConfig = {
  low: { label: "Baixa", color: "bg-muted text-muted-foreground" },
  medium: { label: "Média", color: "bg-amber-500/20 text-amber-700" },
  high: { label: "Alta", color: "bg-destructive/20 text-destructive" }
};

export default function TeamHub() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<TeamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TeamEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    type: "bug" as EntryType,
    title: "",
    description: "",
    priority: "medium" as EntryPriority,
    status: "pending" as EntryStatus,
    tags: ""
  });

  // Fetch current user + admin status
  useEffect(() => {
    const fetchUser = async () => {
      setIsRoleLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setCurrentUserId(null);
        setCurrentUserName("");
        setIsAdmin(false);
        setIsRoleLoading(false);
        return;
      }

      const { data: anewUser } = await (supabase as any)
        .from("anew_users")
        .select("id, name")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      setCurrentUserId(anewUser?.id || null);
      setCurrentUserName(anewUser?.name || user.email || "Utilizador");

      let isAnewAdmin = false;
      if (anewUser?.id) {
        const { data: memberships } = await (supabase as any)
          .from("anew_memberships")
          .select("role_id")
          .eq("user_id", anewUser.id)
          .eq("status", "active");

        const roleIds = [...new Set((memberships || []).map((m: any) => m.role_id).filter(Boolean))];

        if (roleIds.length > 0) {
          const { data: roles } = await (supabase as any)
            .from("anew_roles")
            .select("code")
            .in("id", roleIds);

          const adminCodes = ["system_admin", "super_admin", "org_admin", "tenant_admin", "company_admin"];
          isAnewAdmin = (roles || []).some((role: any) => adminCodes.includes(role.code));
        }
      }

      setIsAdmin(isAnewAdmin);
      setIsRoleLoading(false);
    };

    fetchUser();
  }, []);

  // Fetch entries
  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("team_hub_entries")
      .select("id, type, title, description, author_id, author_name, status, priority, tags, created_at, updated_at")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast({ title: "Erro", description: "Não foi possível carregar as entradas", variant: "destructive" });
    } else {
      setEntries(data as TeamEntry[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("team_hub_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_hub_entries" },
        () => {
          fetchEntries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const resetForm = () => {
    setFormData({
      type: "bug",
      title: "",
      description: "",
      priority: "medium",
      status: "pending",
      tags: ""
    });
    setEditingEntry(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (entry: TeamEntry) => {
    setEditingEntry(entry);
    setFormData({
      type: entry.type,
      title: entry.title,
      description: entry.description,
      priority: entry.priority,
      status: entry.status,
      tags: entry.tags.join(", ")
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.description) {
      toast({ title: "Campos obrigatórios", description: "Preencha o título e a descrição.", variant: "destructive" });
      return;
    }

    const tags = formData.tags.split(",").map(t => t.trim()).filter(Boolean);
    const status = formData.type === "task" || formData.type === "knowledge" ? "done" : formData.status;

    if (editingEntry) {
      // Update
      const { data, error } = await supabase
        .from("team_hub_entries")
        .update({
          type: formData.type,
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          status: status,
          tags: tags
        })
        .eq("id", editingEntry.id)
        .select()
        .single();

      if (error) {
        console.error("[TeamHub] update error:", error);
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
        return;
      }
      // Update local state immediately
      setEntries(prev => prev.map(e => e.id === editingEntry.id ? data as TeamEntry : e));
      toast({ title: "Atualizado", description: "Entrada atualizada com sucesso!" });
    } else {
      // Guard: identity must be resolved before insert (RLS requires author_id = anew_users.id of caller)
      if (isRoleLoading) {
        toast({ title: "A carregar utilizador", description: "Aguarda um momento e tenta novamente.", variant: "destructive" });
        return;
      }
      if (!currentUserId) {
        toast({
          title: "Sem perfil ativo",
          description: "A tua conta não tem perfil de utilizador interno associado. Contacta um administrador.",
          variant: "destructive",
        });
        return;
      }

      // Create
      const { data, error } = await supabase
        .from("team_hub_entries")
        .insert({
          type: formData.type,
          title: formData.title,
          description: formData.description,
          author_id: currentUserId,
          author_name: currentUserName,
          priority: formData.priority,
          status: status,
          tags: tags
        })
        .select()
        .single();

      if (error) {
        console.error("[TeamHub] insert error:", error);
        toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
        return;
      }
      // Add to local state immediately
      setEntries(prev => [data as TeamEntry, ...prev]);
      toast({ title: "Criado", description: "Entrada criada com sucesso!" });
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deletingEntryId) return;

    const { error } = await supabase
      .from("team_hub_entries")
      .delete()
      .eq("id", deletingEntryId);

    if (error) {
      toast({ title: "Erro", description: "Não foi possível eliminar a entrada", variant: "destructive" });
    } else {
      // Remove from local state immediately
      setEntries(prev => prev.filter(e => e.id !== deletingEntryId));
      toast({ title: "Eliminado", description: "Entrada eliminada com sucesso!" });
    }
    setIsDeleteDialogOpen(false);
    setDeletingEntryId(null);
  };

  const confirmDelete = (id: string) => {
    setDeletingEntryId(id);
    setIsDeleteDialogOpen(true);
  };

  const filteredEntries = entries.filter(entry => {
    if (filterType !== "all" && entry.type !== filterType) return false;
    if (filterStatus !== "all" && entry.status !== filterStatus) return false;
    return true;
  });

  const stats = {
    bugs: entries.filter(e => e.type === "bug" && e.status !== "done").length,
    improvements: entries.filter(e => e.type === "improvement" && e.status !== "done").length,
    tasks: entries.filter(e => e.type === "task").length,
    knowledge: entries.filter(e => e.type === "knowledge").length
  };

  const canEditOrDelete = (entry: TeamEntry) => {
    if (isRoleLoading) return false;
    return isAdmin || entry.author_id === currentUserId;
  };

  const toggleComments = (entryId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Team Hub</h1>
            <p className="text-muted-foreground">
              Partilha bugs, melhorias, tarefas e conhecimento com a equipa
            </p>
          </div>
          
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Entrada
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-destructive/30">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Bug className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.bugs}</p>
                  <p className="text-xs text-muted-foreground">Bugs Pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-amber-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.improvements}</p>
                  <p className="text-xs text-muted-foreground">Melhorias Sugeridas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-emerald-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.tasks}</p>
                  <p className="text-xs text-muted-foreground">Tarefas Registadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-primary/30">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.knowledge}</p>
                  <p className="text-xs text-muted-foreground">Conhecimentos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filtros:</span>
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              <SelectItem value="bug">Bugs</SelectItem>
              <SelectItem value="improvement">Melhorias</SelectItem>
              <SelectItem value="task">Tarefas</SelectItem>
              <SelectItem value="knowledge">Conhecimento</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Estados</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="in_progress">Em Progresso</SelectItem>
              <SelectItem value="done">Concluído</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Entries List */}
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                <p className="text-muted-foreground mt-2">A carregar...</p>
              </CardContent>
            </Card>
          ) : filteredEntries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhuma entrada encontrada</p>
              </CardContent>
            </Card>
          ) : (
            filteredEntries.map((entry) => {
              const TypeIcon = typeConfig[entry.type].icon;
              return (
                <Card key={entry.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${typeConfig[entry.type].bg}`}>
                        <TypeIcon className={`h-5 w-5 ${typeConfig[entry.type].color}`} />
                      </div>
                      
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold">{entry.title}</h3>
                              <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wide">ID: {entry.id.slice(0, 8)}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {entry.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className={priorityConfig[entry.priority].color}>
                              {priorityConfig[entry.priority].label}
                            </Badge>
                            <Badge variant="outline" className={statusConfig[entry.status].color}>
                              {statusConfig[entry.status].label}
                            </Badge>
                            {canEditOrDelete(entry) && (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(entry)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => confirmDelete(entry.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {entry.author_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(entry.created_at).toLocaleDateString("pt-PT")}
                          </span>
                          {entry.tags.length > 0 && (
                            <div className="flex items-center gap-1">
                              {entry.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Comments toggle */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 mt-1 w-fit"
                          onClick={() => toggleComments(entry.id)}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Comentários
                          {expandedComments.has(entry.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>

                        {expandedComments.has(entry.id) && (
                          <EntryComments
                            entryId={entry.id}
                            entryAuthorId={entry.author_id}
                            entryAuthorName={entry.author_name}
                            currentUserId={currentUserId}
                            currentUserName={currentUserName}
                            isAdmin={isAdmin}
                          />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>{editingEntry ? "Editar Entrada" : "Criar Nova Entrada"}</DialogTitle>
              <DialogDescription>
                {editingEntry ? "Atualiza os detalhes da entrada" : "Reporta um bug, sugere uma melhoria, ou partilha conhecimento"}
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-1 overflow-y-auto pr-4">
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v as EntryType})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="bug">
                        <span className="flex items-center gap-2">
                          <Bug className="h-4 w-4 text-destructive" />
                          Bug - Algo não funciona
                        </span>
                      </SelectItem>
                      <SelectItem value="improvement">
                        <span className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-amber-500" />
                          Melhoria - Sugestão
                        </span>
                      </SelectItem>
                      <SelectItem value="task">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          Tarefa Feita - O que fiz
                        </span>
                      </SelectItem>
                      <SelectItem value="knowledge">
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          Conhecimento - Dica/Aprendizagem
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input 
                    placeholder="Resumo breve..."
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea 
                    placeholder="Descreve em detalhe..."
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                {(formData.type === "bug" || formData.type === "improvement") && (
                  <>
                    <div className="space-y-2">
                      <Label>Prioridade</Label>
                      <Select value={formData.priority} onValueChange={(v) => setFormData({...formData, priority: v as EntryPriority})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectItem value="low">Baixa</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {editingEntry && (
                      <div className="space-y-2">
                        <Label>Estado</Label>
                        <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v as EntryStatus})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="in_progress">Em Progresso</SelectItem>
                            <SelectItem value="done">Concluído</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}

                <div className="space-y-2">
                  <Label>Tags (separadas por vírgula)</Label>
                  <Input 
                    placeholder="contactos, validação, UX..."
                    value={formData.tags}
                    onChange={(e) => setFormData({...formData, tags: e.target.value})}
                  />
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>
                {editingEntry ? "Guardar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar entrada?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser revertida. A entrada será permanentemente eliminada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
