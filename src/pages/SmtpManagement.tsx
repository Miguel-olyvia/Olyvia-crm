import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Mail, Plus, Pencil, Trash2, Loader2, Star, CheckCircle, XCircle, Send, Building2, User, ArrowRight, Globe, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface SmtpConfig {
  id: string;
  name: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_secure: boolean;
  encryption: string | null;
  from_email: string;
  from_name: string;
  is_active: boolean;
  is_default: boolean;
  daily_limit: number | null;
  reply_to?: string | null;
  organization_id?: string;
  user_id?: string;
}

interface SmtpFormData {
  name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  encryption: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  daily_limit: number;
  is_default: boolean;
}

const defaultFormData: SmtpFormData = {
  name: "",
  smtp_host: "",
  smtp_port: 587,
  smtp_username: "",
  smtp_password: "",
  encryption: "tls",
  from_email: "",
  from_name: "",
  reply_to: "",
  daily_limit: 500,
  is_default: false,
};

export default function SmtpManagement() {
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("smtp.edit");
  const [userSmtps, setUserSmtps] = useState<SmtpConfig[]>([]);
  const [orgSmtps, setOrgSmtps] = useState<SmtpConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"user" | "org">("user");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SmtpFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadSmtpConfigs();
  }, [activeCompany]);

  const loadSmtpConfigs = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load user SMTPs
      const { data: userConfigs } = await (supabase as any)
        .from("user_smtp_settings")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false });
      setUserSmtps(userConfigs || []);

      // Load org SMTPs
      if (activeCompany) {
        const { data: orgConfigs } = await (supabase as any)
          .from("organization_smtp_settings")
          .select("*")
          .eq("organization_id", activeCompany.id)
          .order("is_default", { ascending: false });
        setOrgSmtps(orgConfigs || []);
      }
    } catch (error) {
      console.error("Error loading SMTP configs:", error);
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = (mode: "user" | "org") => {
    setDialogMode(mode);
    setEditingId(null);
    setFormData(defaultFormData);
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEditDialog = (smtp: SmtpConfig, mode: "user" | "org") => {
    setDialogMode(mode);
    setEditingId(smtp.id);
    setFormData({
      name: smtp.name || "",
      smtp_host: smtp.smtp_host,
      smtp_port: smtp.smtp_port,
      smtp_username: smtp.smtp_username,
      smtp_password: smtp.smtp_password,
      encryption: smtp.encryption || (smtp.smtp_secure ? "tls" : "none"),
      from_email: smtp.from_email,
      from_name: smtp.from_name,
      reply_to: smtp.reply_to || "",
      daily_limit: smtp.daily_limit || 500,
      is_default: smtp.is_default || false,
    });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const handleTestConnection = async () => {
    if (!formData.smtp_host || !formData.from_email) {
      toast({ title: "Erro", description: "Preencha pelo menos o host e email do remetente", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          test: true,
          to: formData.from_email,
          subject: "Teste de Conexão SMTP",
          html: "<h2>✅ Conexão SMTP bem-sucedida!</h2><p>Se recebeu este email, a configuração está correta.</p>",
          smtp_config: {
            host: formData.smtp_host,
            port: formData.smtp_port,
            username: formData.smtp_username,
            password: formData.smtp_password,
            secure: formData.encryption === "ssl",
          },
        },
      });
      const errorMsg = data?.error || error?.message;
      if (errorMsg) {
        // Provide user-friendly messages for common SMTP errors
        let friendlyMsg = errorMsg;
        if (errorMsg.includes("basic authentication is disabled") || errorMsg.includes("Authentication unsuccessful")) {
          friendlyMsg = "O Outlook/Hotmail bloqueou a autenticação básica. Precisa de usar uma 'App Password' (palavra-passe de aplicação) nas definições de segurança da sua conta Microsoft, ou usar OAuth2.";
        } else if (errorMsg.includes("Invalid login") || errorMsg.includes("authentication failed")) {
          friendlyMsg = "Credenciais inválidas. Verifique o nome de utilizador e a palavra-passe.";
        } else if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("connect ETIMEDOUT")) {
          friendlyMsg = "Não foi possível ligar ao servidor SMTP. Verifique o host e a porta.";
        }
        throw new Error(friendlyMsg);
      }
      toast({ title: "Teste bem-sucedido!", description: `Email de teste enviado para ${formData.from_email}` });
    } catch (error: any) {
      toast({ title: "Erro no teste", description: error.message || "Falha na conexão SMTP", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!formData.smtp_host || !formData.from_email || !formData.name) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utilizador não autenticado");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      const smtp_secure = formData.encryption === "tls" || formData.encryption === "ssl";

      if (dialogMode === "user") {
        const payload: any = {
          user_id: user.id,
          organization_id: activeCompany?.id || null,
          name: formData.name,
          smtp_host: formData.smtp_host,
          smtp_port: formData.smtp_port,
          smtp_username: formData.smtp_username,
          smtp_password: formData.smtp_password,
          smtp_secure,
          encryption: formData.encryption,
          from_email: formData.from_email,
          from_name: formData.from_name,
          reply_to: formData.reply_to || null,
          daily_limit: formData.daily_limit,
          is_default: formData.is_default,
          is_active: true,
        };

        // If setting as default, unset other defaults first
        if (formData.is_default) {
          await (supabase as any)
            .from("user_smtp_settings")
            .update({ is_default: false })
            .eq("user_id", user.id)
            .neq("id", editingId || "");
        }

        if (editingId) {
          await (supabase as any).from("user_smtp_settings").update(payload).eq("id", editingId);
        } else {
          await (supabase as any).from("user_smtp_settings").insert(payload);
        }
      } else {
        if (!activeCompany) throw new Error("Sem empresa ativa");
        const payload: any = {
          organization_id: activeCompany.id,
          name: formData.name,
          smtp_host: formData.smtp_host,
          smtp_port: formData.smtp_port,
          smtp_username: formData.smtp_username,
          smtp_password: formData.smtp_password,
          smtp_secure,
          encryption: formData.encryption,
          from_email: formData.from_email,
          from_name: formData.from_name,
          daily_limit: formData.daily_limit,
          is_default: formData.is_default,
          is_active: true,
          created_by: businessUserId,
        };

        if (formData.is_default) {
          await (supabase as any)
            .from("organization_smtp_settings")
            .update({ is_default: false })
            .eq("organization_id", activeCompany.id)
            .neq("id", editingId || "");
        }

        if (editingId) {
          await (supabase as any).from("organization_smtp_settings").update(payload).eq("id", editingId);
        } else {
          await (supabase as any).from("organization_smtp_settings").insert(payload);
        }
      }

      toast({ title: "Guardado", description: "Configuração SMTP guardada com sucesso" });
      setDialogOpen(false);
      loadSmtpConfigs();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (smtp: SmtpConfig, mode: "user" | "org") => {
    const table = mode === "user" ? "user_smtp_settings" : "organization_smtp_settings";
    await (supabase as any).from(table).update({ is_active: !smtp.is_active }).eq("id", smtp.id);
    loadSmtpConfigs();
  };

  const handleSetDefault = async (smtp: SmtpConfig, mode: "user" | "org") => {
    const table = mode === "user" ? "user_smtp_settings" : "organization_smtp_settings";
    const { data: { user } } = await supabase.auth.getUser();

    // Unset all defaults
    if (mode === "user") {
      await (supabase as any).from(table).update({ is_default: false }).eq("user_id", user?.id);
    } else {
      await (supabase as any).from(table).update({ is_default: false }).eq("organization_id", activeCompany?.id);
    }
    // Set this as default
    await (supabase as any).from(table).update({ is_default: true }).eq("id", smtp.id);
    loadSmtpConfigs();
    toast({ title: "Atualizado", description: `"${smtp.name || smtp.from_email}" definido como SMTP padrão` });
  };

  const handleDelete = async (smtp: SmtpConfig, mode: "user" | "org") => {
    const table = mode === "user" ? "user_smtp_settings" : "organization_smtp_settings";
    await (supabase as any).from(table).delete().eq("id", smtp.id);
    loadSmtpConfigs();
    toast({ title: "Eliminado", description: "Configuração SMTP eliminada" });
  };

  const SmtpCard = ({ smtp, mode }: { smtp: SmtpConfig; mode: "user" | "org" }) => (
    <Card className={`transition-all ${!smtp.is_active ? "opacity-60" : ""}`}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{smtp.name || smtp.from_email}</span>
            {smtp.is_default && <Badge variant="default" className="text-[10px] px-1.5 py-0">Padrão</Badge>}
            <Badge variant={smtp.is_active ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
              {smtp.is_active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {smtp.from_email} · {smtp.smtp_host}:{smtp.smtp_port}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canEdit && !smtp.is_default && smtp.is_active && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleSetDefault(smtp, mode)}>
              <Star className="h-3 w-3 mr-1" /> Padrão
            </Button>
          )}
          {canEdit && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(smtp, mode)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleActive(smtp, mode)}>
                {smtp.is_active ? <XCircle className="h-3.5 w-3.5 text-muted-foreground" /> : <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(smtp, mode)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-8 w-8" />
            Gestão de SMTP
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure os servidores de email para envio de orçamentos, propostas e notificações.
          </p>
        </div>

        {/* Resolution Flow */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <span className="font-medium text-foreground">Prioridade de envio:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default" className="gap-1"><User className="h-3 w-3" /> SMTP do User</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="secondary" className="gap-1"><Building2 className="h-3 w-3" /> SMTP da Empresa</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="gap-1"><Globe className="h-3 w-3" /> SMTP Global</Badge>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="user" className="space-y-4">
          <TabsList>
            <TabsTrigger value="user" className="gap-2"><User className="h-4 w-4" /> Os meus SMTPs</TabsTrigger>
            <TabsTrigger value="org" className="gap-2"><Building2 className="h-4 w-4" /> SMTPs da Empresa</TabsTrigger>
          </TabsList>

          <TabsContent value="user" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Os meus SMTPs</h3>
                <p className="text-sm text-muted-foreground">Configurações pessoais — têm prioridade sobre os da empresa</p>
              </div>
              {canEdit && (
                <Button onClick={() => openAddDialog("user")} className="gap-2">
                  <Plus className="h-4 w-4" /> Adicionar SMTP
                </Button>
              )}
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : userSmtps.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                <Mail className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Nenhum SMTP pessoal configurado.</p>
                <p className="text-xs mt-1">Será usado o SMTP da empresa como fallback.</p>
              </CardContent></Card>
            ) : (
              <div className="grid gap-3">{userSmtps.map(s => <SmtpCard key={s.id} smtp={s} mode="user" />)}</div>
            )}
          </TabsContent>

          <TabsContent value="org" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">SMTPs da Empresa</h3>
                <p className="text-sm text-muted-foreground">Configurados pelo admin — usados como fallback</p>
              </div>
              {canEdit && (
                <Button onClick={() => openAddDialog("org")} className="gap-2">
                  <Plus className="h-4 w-4" /> Adicionar SMTP
                </Button>
              )}
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : orgSmtps.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Nenhum SMTP da empresa configurado.</p>
              </CardContent></Card>
            ) : (
              <div className="grid gap-3">{orgSmtps.map(s => <SmtpCard key={s.id} smtp={s} mode="org" />)}</div>
            )}
          </TabsContent>
        </Tabs>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar" : "Adicionar"} SMTP {dialogMode === "user" ? "Pessoal" : "da Empresa"}</DialogTitle>
              <DialogDescription>Configure os dados do servidor SMTP para envio de emails.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label>Nome do perfil *</Label>
                <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="ex: Gmail Principal" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Servidor SMTP *</Label>
                  <Input value={formData.smtp_host} onChange={e => setFormData(p => ({ ...p, smtp_host: e.target.value }))} placeholder="smtp.gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label>Porta</Label>
                  <Input type="number" value={formData.smtp_port} onChange={e => setFormData(p => ({ ...p, smtp_port: parseInt(e.target.value) || 587 }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Encriptação</Label>
                <Select value={formData.encryption} onValueChange={v => setFormData(p => ({ ...p, encryption: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tls">TLS (recomendado)</SelectItem>
                    <SelectItem value="ssl">SSL</SelectItem>
                    <SelectItem value="none">Nenhum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Usa a password do servidor SMTP, não a da tua conta Olívia.</AlertTitle>
                <AlertDescription>
                  Esta é a password do <strong>servidor de email</strong> (ex.: Gmail → <em>App Password</em>; Outlook/Microsoft 365 → password da conta ou App Password com 2FA; servidor próprio → password definida no painel do email). <strong>Não é</strong> a tua password de login na Olívia. Se o navegador pedir para "guardar password" depois de gravar, <strong>recusa</strong> — caso contrário o autofill pode substituir a tua password de login.
                </AlertDescription>
              </Alert>
              <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Utilizador / Email *</Label>
                  <Input
                    name="smtp-username-no-autofill"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    value={formData.smtp_username}
                    onChange={e => setFormData(p => ({ ...p, smtp_username: e.target.value }))}
                    placeholder="user@gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    name="smtp-password-no-autofill"
                    autoComplete="new-password"
                    data-1p-ignore
                    data-lpignore="true"
                    value={formData.smtp_password}
                    onChange={e => setFormData(p => ({ ...p, smtp_password: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
              </form>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email do remetente *</Label>
                  <Input value={formData.from_email} onChange={e => setFormData(p => ({ ...p, from_email: e.target.value }))} placeholder="vendas@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label>Nome do remetente</Label>
                  <Input value={formData.from_name} onChange={e => setFormData(p => ({ ...p, from_name: e.target.value }))} placeholder="João Silva" />
                </div>
              </div>
              {dialogMode === "user" && (
                <div className="space-y-2">
                  <Label>Reply-To (opcional)</Label>
                  <Input value={formData.reply_to} onChange={e => setFormData(p => ({ ...p, reply_to: e.target.value }))} placeholder="resposta@empresa.com" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Limite diário</Label>
                  <Input type="number" value={formData.daily_limit} onChange={e => setFormData(p => ({ ...p, daily_limit: parseInt(e.target.value) || 500 }))} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={formData.is_default} onCheckedChange={c => setFormData(p => ({ ...p, is_default: c }))} />
                  <Label>SMTP padrão</Label>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="gap-2">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Testar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
