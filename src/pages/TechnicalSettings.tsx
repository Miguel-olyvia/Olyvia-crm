import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { Key, Mail, Plus, Trash2, Copy, Eye, EyeOff, Settings2, Building2, Layers, LayoutGrid, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ScheduleTestForm } from "@/components/ScheduleTestForm";

interface ScopedApiToken {
  id: string;
  token_key: string;
  token_name: string;
  description: string | null;
  organization_id: string | null;
  scopes: string[];
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
}

interface SmtpSettings {
  id?: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_secure: boolean;
  from_email: string;
  from_name: string;
  is_active: boolean;
}

type ScopeLevel = "company" | "business_unit" | "department";

export default function TechnicalSettings() {
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const { hasPermission, isSystemAdmin } = usePermissions();
  const { t } = useTranslation();

  const AVAILABLE_SCOPES = [
    { value: "leads.write", label: t('techSettings.scopes.leadsWrite') },
    { value: "leads.read", label: t('techSettings.scopes.leadsRead') },
    { value: "contacts.read", label: t('techSettings.scopes.contactsRead') },
    { value: "contacts.write", label: t('techSettings.scopes.contactsWrite') },
    { value: "quotes.read", label: t('techSettings.scopes.quotesRead') },
    { value: "products.read", label: t('techSettings.scopes.productsRead') },
  ];
  
  const [loading, setLoading] = useState(false);
  const [scopeLevel, setScopeLevel] = useState<ScopeLevel>("company");
  
  // Business Units and Areas for selection
  const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
  const [businessAreas, setBusinessAreas] = useState<{ id: string; name: string }[]>([]);
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>("");
  const [selectedBusinessArea, setSelectedBusinessArea] = useState<string>("");
  
  // Companies for selection (for system_admin and tenant_admin)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  
  // API Tokens
  const [tokens, setTokens] = useState<ScopedApiToken[]>([]);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenForm, setTokenForm] = useState({
    token_name: "",
    description: "",
    scopes: ["leads.write"],
    expires_at: "",
  });
  const [newTokenKey, setNewTokenKey] = useState<string | null>(null);
  const [showTokenKey, setShowTokenKey] = useState<Record<string, boolean>>({});
  const [deleteTokenId, setDeleteTokenId] = useState<string | null>(null);
  
  // SMTP Settings
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>({
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    smtp_secure: true,
    from_email: "",
    from_name: "",
    is_active: true,
  });
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, [activeCompany?.id, isSystemAdmin]);

  useEffect(() => {
    if (activeCompany) {
      loadBusinessUnits();
      loadBusinessAreas();
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    if (activeCompany || selectedBusinessUnit || selectedBusinessArea) {
      loadTokens();
      loadSmtpSettings();
    }
  }, [scopeLevel, activeCompany, selectedBusinessUnit, selectedBusinessArea]);

  const loadBusinessUnits = async () => {
    if (!activeCompany) return;
    
    const { data: children } = await (supabase as any)
      .from("anew_hierarchy")
      .select("child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, type)")
      .eq("parent_org_id", activeCompany.id);
    
    const bus = (children || [])
      .filter((c: any) => c.anew_organizations?.type === "unidade_negocio" || c.anew_organizations?.type === "empresa")
      .map((c: any) => ({ id: c.anew_organizations.id, name: c.anew_organizations.name }));
    
    setBusinessUnits(bus);
  };

  const loadBusinessAreas = async () => {
    if (!activeCompany) return;
    
    const { data: children } = await (supabase as any)
      .from("anew_hierarchy")
      .select("child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, type)")
      .eq("parent_org_id", activeCompany.id);
    
    const areas = (children || [])
      .filter((c: any) => c.anew_organizations?.type === "departamento" || c.anew_organizations?.type === "area")
      .map((c: any) => ({ id: c.anew_organizations.id, name: c.anew_organizations.name }));
    
    setBusinessAreas(areas);
  };

  const loadCompanies = async () => {
    // Only load for admins who can select from multiple companies
    if (!isSystemAdmin) {
      // Set activeCompany as selected by default for other users
      if (activeCompany?.id) {
        setSelectedCompany(activeCompany.id);
      }
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // System admin sees all organizations
      // @ts-ignore - Supabase type instantiation too deep
      const companiesQuery = (supabase as any).from("anew_organizations").select("id, name").in("type", ["holding", "empresa"]).order("name");
      const { data } = await companiesQuery;
      setCompanies((data || []) as { id: string; name: string }[]);

      // Set activeCompany as selected by default
      if (activeCompany?.id) {
        setSelectedCompany(activeCompany.id);
      }
    } catch (error) {
      console.error("Error loading companies:", error);
    }
  };

  const loadTokens = async () => {
    let query = supabase.from("scoped_api_tokens").select("*");
    
    // All scope levels use organization_id — BUs and departments are anew_organizations
    const currentOrgId = scopeLevel === "company" ? activeCompany?.id
      : scopeLevel === "business_unit" ? selectedBusinessUnit
      : selectedBusinessArea;

    if (!currentOrgId) {
      setTokens([]);
      return;
    }

    query = query.eq("organization_id", currentOrgId);

    const { data, error } = await query.order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error loading tokens:", error);
      return;
    }
    
    setTokens((data || []) as unknown as ScopedApiToken[]);
  };

  const loadSmtpSettings = async () => {
    let data = null;
    
    if (scopeLevel === "company" && activeCompany) {
      const result = await supabase
        .from("organization_smtp_settings")
        .select("*")
        .eq("organization_id", activeCompany.id)
        .single();
      data = result.data;
    } else if (scopeLevel === "business_unit" && selectedBusinessUnit) {
      const result = await supabase
        .from("organization_smtp_settings")
        .select("*")
        .eq("organization_id", selectedBusinessUnit)
        .single();
      data = result.data;
    } else if (scopeLevel === "department" && selectedBusinessArea) {
      const result = await supabase
        .from("organization_smtp_settings")
        .select("*")
        .eq("organization_id", selectedBusinessArea)
        .single();
      data = result.data;
    }

    if (data) {
      setSmtpSettings({
        id: data.id,
        smtp_host: data.smtp_host,
        smtp_port: data.smtp_port,
        smtp_username: data.smtp_username,
        smtp_password: data.smtp_password,
        smtp_secure: data.smtp_secure,
        from_email: data.from_email,
        from_name: data.from_name,
        is_active: data.is_active,
      });
    } else {
      setSmtpSettings({
        smtp_host: "",
        smtp_port: 587,
        smtp_username: "",
        smtp_password: "",
        smtp_secure: true,
        from_email: "",
        from_name: "",
        is_active: true,
      });
    }
  };

  const handleCreateToken = async () => {
    if (!tokenForm.token_name.trim()) {
      toast({ title: t('common.error'), description: t('techSettings.tokens.error.name'), variant: "destructive" });
      return;
    }

    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) return;

    // All scope levels resolve to an anew_organizations ID
    const currentOrgId = scopeLevel === "company" ? activeCompany?.id
      : scopeLevel === "business_unit" ? selectedBusinessUnit
      : selectedBusinessArea;

    if (!currentOrgId) {
      toast({ title: t('common.error'), description: t('techSettings.tokens.error.scope'), variant: "destructive" });
      return;
    }

    const tokenData: Record<string, unknown> = {
      token_name: tokenForm.token_name,
      description: tokenForm.description || null,
      scopes: tokenForm.scopes,
      expires_at: tokenForm.expires_at || null,
      created_by: businessUserId,
      organization_id: currentOrgId,
    };

    const { data, error } = await supabase
      .from("scoped_api_tokens")
      .insert([tokenData as any])
      .select()
      .single();

    if (error) {
      console.error("Error creating token:", error);
      toast({ title: t('common.error'), description: t('techSettings.tokens.error.create'), variant: "destructive" });
      return;
    }

    setNewTokenKey(data.token_key);
    setTokenForm({ token_name: "", description: "", scopes: ["leads.write"], expires_at: "" });
    loadTokens();
    toast({ title: t('common.success'), description: t('techSettings.tokens.success') });
  };

  const handleDeleteToken = async () => {
    if (!deleteTokenId) return;

    const { error } = await supabase
      .from("scoped_api_tokens")
      .delete()
      .eq("id", deleteTokenId);

    if (error) {
      toast({ title: t('common.error'), description: t('techSettings.tokens.error.delete'), variant: "destructive" });
      return;
    }

    setDeleteTokenId(null);
    loadTokens();
    toast({ title: t('common.success'), description: t('techSettings.tokens.deleted') });
  };

  const handleToggleToken = async (tokenId: string, isActive: boolean) => {
    const { error } = await supabase
      .from("scoped_api_tokens")
      .update({ is_active: !isActive })
      .eq("id", tokenId);

    if (error) {
      toast({ title: t('common.error'), description: t('techSettings.tokens.error.update'), variant: "destructive" });
      return;
    }

    loadTokens();
  };

  const handleSaveSmtp = async () => {
    if (!smtpSettings.smtp_host || !smtpSettings.from_email) {
      toast({ title: t('common.error'), description: t('techSettings.smtp.hostAndEmailRequired'), variant: "destructive" });
      return;
    }

    setSavingSmtp(true);
    const businessUserId = await resolveCurrentBusinessUserId();

    try {
      if (scopeLevel === "company" && activeCompany) {
        const payload = {
          organization_id: activeCompany.id,
          ...smtpSettings,
          created_by: businessUserId,
        };
        delete (payload as Record<string, unknown>).id;

        if (smtpSettings.id) {
          await supabase.from("organization_smtp_settings").update(payload).eq("id", smtpSettings.id);
        } else {
          await supabase.from("organization_smtp_settings").insert(payload);
        }
      } else if (scopeLevel === "business_unit" && selectedBusinessUnit) {
        const payload = {
          organization_id: selectedBusinessUnit,
          ...smtpSettings,
          created_by: businessUserId,
        };
        delete (payload as Record<string, unknown>).id;

        if (smtpSettings.id) {
          await supabase.from("organization_smtp_settings").update(payload).eq("id", smtpSettings.id);
        } else {
          await supabase.from("organization_smtp_settings").insert(payload);
        }
      } else if (scopeLevel === "department" && selectedBusinessArea) {
        const payload = {
          organization_id: selectedBusinessArea,
          ...smtpSettings,
          created_by: businessUserId,
        };
        delete (payload as Record<string, unknown>).id;

        if (smtpSettings.id) {
          await supabase.from("organization_smtp_settings").update(payload).eq("id", smtpSettings.id);
        } else {
          await supabase.from("organization_smtp_settings").insert(payload);
        }
      }

      toast({ title: t('common.success'), description: t('techSettings.smtp.saveSuccess') });
      loadSmtpSettings();
    } catch (error) {
      console.error("Error saving SMTP:", error);
      toast({ title: t('common.error'), description: t('techSettings.smtp.saveError'), variant: "destructive" });
    } finally {
      setSavingSmtp(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('techSettings.tokens.copied'), description: t('techSettings.tokens.copiedDesc') });
  };

  const getScopeLevelIcon = (level: ScopeLevel) => {
    switch (level) {
      case "company": return <Building2 className="h-4 w-4" />;
      case "business_unit": return <Layers className="h-4 w-4" />;
      case "department": return <LayoutGrid className="h-4 w-4" />;
    }
  };

  const canAccessScopeLevel = (level: ScopeLevel): boolean => {
    if (isSystemAdmin || hasPermission('settings.manage') || hasPermission('settings.update')) {
      return true;
    }
    return false;
  };

  if (loading) {
    return (
      <>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings2 className="h-8 w-8" />
            {t('techSettings.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('techSettings.subtitle')}
          </p>
        </div>

        {/* Scope Level Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('techSettings.scopeConfig.title')}</CardTitle>
            <CardDescription>{t('techSettings.scopeConfig.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {canAccessScopeLevel("company") && (
                <Button
                  variant={scopeLevel === "company" ? "default" : "outline"}
                  onClick={() => setScopeLevel("company")}
                  className="gap-2"
                >
                  <Building2 className="h-4 w-4" />
                  {t('common.company')}
                </Button>
              )}
              {canAccessScopeLevel("business_unit") && (
                <Button
                  variant={scopeLevel === "business_unit" ? "default" : "outline"}
                  onClick={() => setScopeLevel("business_unit")}
                  className="gap-2"
                >
                  <Layers className="h-4 w-4" />
                  {t('common.businessUnit')}
                </Button>
              )}
              {canAccessScopeLevel("department") && (
                <Button
                  variant={scopeLevel === "department" ? "default" : "outline"}
                  onClick={() => setScopeLevel("department")}
                  className="gap-2"
                >
                  <LayoutGrid className="h-4 w-4" />
                  {t('common.department')}
                </Button>
              )}
            </div>

            {scopeLevel === "company" && isSystemAdmin && (
              <div className="max-w-sm">
                <Label>{t('common.company')}</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.selectCompany')} />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.length === 0 ? (
                      <SelectItem value="loading" disabled>{t('common.loading')}</SelectItem>
                    ) : (
                      companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scopeLevel === "business_unit" && (
              <div className="max-w-sm">
                <Label>{t('techSettings.scopeConfig.selectBU')}</Label>
                <Select value={selectedBusinessUnit} onValueChange={setSelectedBusinessUnit}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('techSettings.scopeConfig.selectBUPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {businessUnits.map((bu) => (
                      <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scopeLevel === "department" && (
              <div className="max-w-sm">
                <Label>{t('techSettings.scopeConfig.selectBA')}</Label>
                <Select value={selectedBusinessArea} onValueChange={setSelectedBusinessArea}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('techSettings.scopeConfig.selectBAPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {businessAreas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="tokens" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tokens" className="gap-2">
              <Key className="h-4 w-4" />
              {t('techSettings.tabs.tokens')}
            </TabsTrigger>
            {(isSystemAdmin || hasPermission("smtp.view")) && (
              <TabsTrigger value="smtp" className="gap-2">
                <Mail className="h-4 w-4" />
                {t('techSettings.tabs.smtp')}
              </TabsTrigger>
            )}
            <TabsTrigger value="schedule-test" className="gap-2">
              <Calendar className="h-4 w-4" />
              {t('techSettings.tabs.scheduleTest')}
            </TabsTrigger>
          </TabsList>

          {/* API Tokens Tab */}
          <TabsContent value="tokens">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    {t('techSettings.tokens.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('techSettings.tokens.description')}
                  </CardDescription>
                </div>
                {(isSystemAdmin || hasPermission("api_keys.create")) && (
                  <Button onClick={() => setTokenDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t('techSettings.tokens.new')}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {tokens.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {t('techSettings.tokens.noTokens')}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common.name')}</TableHead>
                        <TableHead>{t('techSettings.tokens.token')}</TableHead>
                        <TableHead>{t('techSettings.tokens.scopes')}</TableHead>
                        <TableHead>{t('techSettings.tokens.lastUsed')}</TableHead>
                        <TableHead>{t('techSettings.tokens.usageCount')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                        <TableHead className="text-right">{t('common.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokens.map((token) => (
                        <TableRow key={token.id}>
                          <TableCell className="font-medium">{token.token_name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {showTokenKey[token.id] ? token.token_key : `${token.token_key.substring(0, 12)}...`}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowTokenKey({ ...showTokenKey, [token.id]: !showTokenKey[token.id] })}
                              >
                                {showTokenKey[token.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                              {(isSystemAdmin || hasPermission("api_keys.copy")) && (
                                <Button variant="ghost" size="icon" onClick={() => copyToClipboard(token.token_key)}>
                                  <Copy className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {token.scopes.map((scope) => (
                                <Badge key={scope} variant="secondary" className="text-xs">
                                  {scope}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {token.last_used_at ? format(new Date(token.last_used_at), "dd/MM/yyyy HH:mm") : "-"}
                          </TableCell>
                          <TableCell>{token.usage_count}</TableCell>
                          <TableCell>
                            <Switch
                              checked={token.is_active}
                              onCheckedChange={() => handleToggleToken(token.id, token.is_active)}
                              disabled={!(isSystemAdmin || hasPermission("api_keys.toggle"))}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {(isSystemAdmin || hasPermission("api_keys.delete")) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTokenId(token.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SMTP Tab */}
          <TabsContent value="smtp">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  {t('techSettings.smtp.title')}
                </CardTitle>
                <CardDescription>
                  {t('techSettings.smtp.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('techSettings.smtp.host')}</Label>
                    <Input
                      placeholder="smtp.example.com"
                      value={smtpSettings.smtp_host}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_host: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('techSettings.smtp.port')}</Label>
                    <Input
                      type="number"
                      value={smtpSettings.smtp_port}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_port: parseInt(e.target.value) || 587 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('techSettings.smtp.username')}</Label>
                    <Input
                      placeholder="user@example.com"
                      value={smtpSettings.smtp_username}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_username: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('techSettings.smtp.password')}</Label>
                    <div className="relative">
                      <Input
                        type={showSmtpPassword ? "text" : "password"}
                        value={smtpSettings.smtp_password}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, smtp_password: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0"
                        onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                      >
                        {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('techSettings.smtp.fromEmail')}</Label>
                    <Input
                      placeholder="noreply@example.com"
                      value={smtpSettings.from_email}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, from_email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('techSettings.smtp.fromName')}</Label>
                    <Input
                      placeholder="Company XYZ"
                      value={smtpSettings.from_name}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, from_name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={smtpSettings.smtp_secure}
                      onCheckedChange={(checked) => setSmtpSettings({ ...smtpSettings, smtp_secure: checked })}
                    />
                    <Label>{t('techSettings.smtp.secureConnection')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={smtpSettings.is_active}
                      onCheckedChange={(checked) => setSmtpSettings({ ...smtpSettings, is_active: checked })}
                    />
                    <Label>{t('common.active')}</Label>
                  </div>
                </div>

                {(isSystemAdmin || hasPermission("smtp.edit")) && (
                  <Button onClick={handleSaveSmtp} disabled={savingSmtp}>
                    {savingSmtp ? t('common.saving') : t('techSettings.smtp.save')}
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedule Testing Tab */}
          <TabsContent value="schedule-test">
            <ScheduleTestForm tokens={tokens} />
          </TabsContent>

        </Tabs>
      </div>

      {/* Create Token Dialog */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('techSettings.tokens.dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('techSettings.tokens.dialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('techSettings.tokens.dialog.name')}</Label>
              <Input
                placeholder={t('techSettings.tokens.dialog.namePlaceholder')}
                value={tokenForm.token_name}
                onChange={(e) => setTokenForm({ ...tokenForm, token_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('techSettings.tokens.dialog.descriptionLabel')}</Label>
              <Input
                placeholder={t('techSettings.tokens.dialog.descriptionPlaceholder')}
                value={tokenForm.description}
                onChange={(e) => setTokenForm({ ...tokenForm, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('techSettings.tokens.dialog.permissions')}</Label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SCOPES.map((scope) => (
                  <Badge
                    key={scope.value}
                    variant={tokenForm.scopes.includes(scope.value) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      const newScopes = tokenForm.scopes.includes(scope.value)
                        ? tokenForm.scopes.filter((s) => s !== scope.value)
                        : [...tokenForm.scopes, scope.value];
                      setTokenForm({ ...tokenForm, scopes: newScopes });
                    }}
                  >
                    {scope.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('techSettings.tokens.dialog.expiration')}</Label>
              <Input
                type="datetime-local"
                value={tokenForm.expires_at}
                onChange={(e) => setTokenForm({ ...tokenForm, expires_at: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleCreateToken}>{t('techSettings.tokens.dialog.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Token Created Dialog */}
      <Dialog open={!!newTokenKey} onOpenChange={() => setNewTokenKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('techSettings.tokens.created.title')}</DialogTitle>
            <DialogDescription>
              {t('techSettings.tokens.created.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-muted p-4 rounded-lg break-all font-mono text-sm">
              {newTokenKey}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { copyToClipboard(newTokenKey!); setNewTokenKey(null); }}>
              {t('techSettings.tokens.created.copyAndClose')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Token Confirmation */}
      <AlertDialog open={!!deleteTokenId} onOpenChange={() => setDeleteTokenId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('techSettings.tokens.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('techSettings.tokens.delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteToken} className="bg-destructive text-destructive-foreground">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
