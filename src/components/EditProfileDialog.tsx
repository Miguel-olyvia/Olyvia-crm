import { useState, useEffect } from "react";
import { User, Lock, Eye, EyeOff, Trash2, AlertTriangle, Mail, CheckCircle2, XCircle, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/hooks/useTranslation";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SmtpSettings {
  id?: string;
  name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_secure: boolean;
  from_email: string;
  from_name: string;
  is_active: boolean;
  is_default: boolean;
}

const defaultSmtpSettings: SmtpSettings = {
  name: "",
  smtp_host: "",
  smtp_port: 587,
  smtp_username: "",
  smtp_password: "",
  smtp_secure: true,
  from_email: "",
  from_name: "",
  is_active: true,
  is_default: false,
};

export function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<'success' | 'error' | null>(null);
  
  // Profile data
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  
  // Password data
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // SMTP data
  const [smtpList, setSmtpList] = useState<SmtpSettings[]>([]);
  const [selectedSmtpId, setSelectedSmtpId] = useState<string | null>(null);
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>(defaultSmtpSettings);

  useEffect(() => {
    if (open) {
      loadUserData();
      checkPendingDeletionRequest();
      checkUserType();
      loadSmtpSettings();
    }
  }, [open]);

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setEmail(user.email || "");
      setFirstName(user.user_metadata?.first_name || "");
      setLastName(user.user_metadata?.last_name || "");
    }
  };

  const loadSmtpSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_smtp_settings')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (data && data.length > 0) {
        const smtpConfigs: SmtpSettings[] = data.map(item => ({
          id: item.id,
          name: item.name || item.from_name || 'SMTP',
          smtp_host: item.smtp_host,
          smtp_port: item.smtp_port,
          smtp_username: item.smtp_username,
          smtp_password: item.smtp_password,
          smtp_secure: item.smtp_secure ?? true,
          from_email: item.from_email,
          from_name: item.from_name,
          is_active: item.is_active ?? true,
          is_default: item.is_default ?? false,
        }));
        setSmtpList(smtpConfigs);
        
        // Select the default one or first one
        const defaultSmtp = smtpConfigs.find(s => s.is_default) || smtpConfigs[0];
        setSelectedSmtpId(defaultSmtp.id || null);
        setSmtpSettings(defaultSmtp);
      }
    }
  };

  const checkUserType = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.rpc('is_system_admin', { _user_id: user.id });
      setIsSystemAdmin(data === true);
    }
  };

  const checkPendingDeletionRequest = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('account_deletion_requests')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .single();
      
      setHasPendingRequest(!!data);
    }
  };

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
        }
      });

      if (error) throw error;

      toast({
        title: t("common.success"),
        description: t("profile.updated"),
      });
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("profile.updateError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: t("common.error"),
        description: t("profile.passwordMismatch"),
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: t("common.error"),
        description: t("profile.passwordTooShort"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: t("common.success"),
        description: t("profile.passwordUpdated"),
      });
      
      // Clear password fields
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("profile.passwordUpdateError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSmtpSettings = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");

      if (smtpSettings.id) {
        // Update existing
        const { error } = await supabase
          .from('user_smtp_settings')
          .update({
            name: smtpSettings.name,
            smtp_host: smtpSettings.smtp_host,
            smtp_port: smtpSettings.smtp_port,
            smtp_username: smtpSettings.smtp_username,
            smtp_password: smtpSettings.smtp_password,
            smtp_secure: smtpSettings.smtp_secure,
            from_email: smtpSettings.from_email,
            from_name: smtpSettings.from_name,
            is_active: smtpSettings.is_active,
            is_default: smtpSettings.is_default,
            updated_at: new Date().toISOString(),
          })
          .eq('id', smtpSettings.id);

        if (error) throw error;
        
        // Update local list
        setSmtpList(prev => prev.map(s => 
          s.id === smtpSettings.id 
            ? smtpSettings 
            : smtpSettings.is_default ? { ...s, is_default: false } : s
        ));
      } else {
        // Insert new - set as default if first one
        const isFirst = smtpList.length === 0;
        const { data, error } = await supabase
          .from('user_smtp_settings')
          .insert({
            user_id: user.id,
            name: smtpSettings.name || 'Novo SMTP',
            smtp_host: smtpSettings.smtp_host,
            smtp_port: smtpSettings.smtp_port,
            smtp_username: smtpSettings.smtp_username,
            smtp_password: smtpSettings.smtp_password,
            smtp_secure: smtpSettings.smtp_secure,
            from_email: smtpSettings.from_email,
            from_name: smtpSettings.from_name,
            is_active: smtpSettings.is_active,
            is_default: isFirst || smtpSettings.is_default,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) {
          const newSmtp = { 
            ...smtpSettings, 
            id: data.id, 
            name: data.name || 'Novo SMTP',
            is_default: data.is_default 
          };
          setSmtpSettings(newSmtp);
          setSmtpList(prev => {
            const updated = data.is_default 
              ? prev.map(s => ({ ...s, is_default: false })) 
              : prev;
            return [...updated, newSmtp];
          });
          setSelectedSmtpId(data.id);
        }
      }

      toast({
        title: t("common.success"),
        description: t("profile.smtpSaved"),
      });
      loadSmtpSettings();
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("profile.smtpSaveError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSmtp = async (id: string) => {
    try {
      const { error } = await supabase
        .from('user_smtp_settings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSmtpList(prev => prev.filter(s => s.id !== id));
      
      if (selectedSmtpId === id) {
        const remaining = smtpList.filter(s => s.id !== id);
        if (remaining.length > 0) {
          setSelectedSmtpId(remaining[0].id || null);
          setSmtpSettings(remaining[0]);
        } else {
          setSelectedSmtpId(null);
          setSmtpSettings(defaultSmtpSettings);
        }
      }

      toast({
        title: t("common.success"),
        description: "SMTP eliminado",
      });
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleNewSmtp = () => {
    setSelectedSmtpId(null);
    setSmtpSettings({ ...defaultSmtpSettings, is_default: smtpList.length === 0 });
  };

  const handleSelectSmtp = (smtp: SmtpSettings) => {
    setSelectedSmtpId(smtp.id || null);
    setSmtpSettings(smtp);
  };

  const handleTestSmtpConnection = async () => {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          test: true,
          smtp_config: {
            host: smtpSettings.smtp_host,
            port: smtpSettings.smtp_port,
            username: smtpSettings.smtp_username,
            password: smtpSettings.smtp_password,
            secure: smtpSettings.smtp_secure,
          },
          to: smtpSettings.from_email,
          subject: 'SMTP Test',
          html: '<p>This is a test email to verify your SMTP settings.</p>',
        }
      });

      if (error) throw error;

      setSmtpTestResult('success');
      toast({
        title: t("common.success"),
        description: t("profile.smtpTestSuccess"),
      });
    } catch (error: any) {
      setSmtpTestResult('error');
      toast({
        title: t("common.error"),
        description: error.message || t("profile.smtpTestError"),
        variant: "destructive",
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleRequestDeletion = async () => {
    setDeletionLoading(true);
    try {
      const { error } = await supabase.rpc('request_account_deletion', {
        reason_text: deletionReason || null
      });

      if (error) throw error;

      toast({
        title: t("common.success"),
        description: t("profile.deletionRequestSent"),
      });
      
      setHasPendingRequest(true);
      setDeletionReason("");
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("profile.deletionRequestError"),
        variant: "destructive",
      });
    } finally {
      setDeletionLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("profile.editProfile")}</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              {t("profile.personalData")}
            </TabsTrigger>
            <TabsTrigger value="password" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {t("profile.password")}
            </TabsTrigger>
            <TabsTrigger value="smtp" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              {t("profile.emailSmtp")}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="profile" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("common.email")}</Label>
              <Input
                id="email"
                value={email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                {t("profile.emailCannotChange")}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="firstName">{t("profile.firstName")}</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("profile.firstNamePlaceholder")}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lastName">{t("profile.lastName")}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("profile.lastNamePlaceholder")}
              />
            </div>
            
            <Button 
              onClick={handleUpdateProfile} 
              disabled={loading}
              className="w-full"
            >
              {loading ? t("common.saving") : t("common.saveChanges")}
            </Button>

            {/* Delete Account Section - Only show for non-system admins */}
            {!isSystemAdmin && (
              <>
                <Separator className="my-4" />
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <h4 className="text-sm font-medium">{t("profile.dangerZone")}</h4>
                  </div>
                  
                  {hasPendingRequest ? (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                      <p className="text-sm text-amber-800">
                        {t("profile.pendingDeletionRequest")}
                      </p>
                    </div>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t("profile.deleteAccount")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("profile.deleteAccount")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("profile.deleteAccountDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        
                        <div className="space-y-2 py-2">
                          <Label htmlFor="deletionReason">{t("profile.reason")}</Label>
                          <Textarea
                            id="deletionReason"
                            value={deletionReason}
                            onChange={(e) => setDeletionReason(e.target.value)}
                            placeholder={t("profile.reasonPlaceholder")}
                            rows={3}
                          />
                        </div>
                        
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleRequestDeletion}
                            disabled={deletionLoading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deletionLoading ? t("common.sending") : t("profile.sendRequest")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </>
            )}
          </TabsContent>
          
          <TabsContent value="password" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("profile.newPassword")}</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("profile.newPasswordPlaceholder")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("profile.confirmPassword")}</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("profile.confirmPasswordPlaceholder")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            
            <Button 
              onClick={handleUpdatePassword} 
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full"
            >
              {loading ? t("common.updating") : t("profile.updatePassword")}
            </Button>
          </TabsContent>

          <TabsContent value="smtp" className="space-y-4 pt-4">
            {/* SMTP Header with Add Button */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Configurações SMTP</Label>
                <p className="text-xs text-muted-foreground">Gerir as suas configurações de email</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleNewSmtp}>
                <Plus className="h-4 w-4 mr-1" />
                Novo SMTP
              </Button>
            </div>

            {/* SMTP List */}
            {smtpList.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                {smtpList.map((smtp) => (
                  <div 
                    key={smtp.id}
                    className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedSmtpId === smtp.id 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => handleSelectSmtp(smtp)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {smtp.is_default && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <span className="text-sm font-medium block truncate">{smtp.name || 'SMTP'}</span>
                        <span className="text-xs text-muted-foreground block truncate">{smtp.from_email}</span>
                      </div>
                      {!smtp.is_active && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">Inativo</Badge>
                      )}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSmtp(smtp.id!);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground border rounded-md">
                <Mail className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum SMTP configurado</p>
                <p className="text-xs">Clique em "Novo SMTP" para adicionar</p>
              </div>
            )}

            <Separator />

            {/* SMTP Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="smtp_name">Nome da Configuração</Label>
                <Input
                  id="smtp_name"
                  value={smtpSettings.name}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Gmail Pessoal"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>{t("profile.smtpActive")}</Label>
                  <p className="text-xs text-muted-foreground">{t("profile.smtpActiveDescription")}</p>
                </div>
                <Switch
                  checked={smtpSettings.is_active}
                  onCheckedChange={(checked) => setSmtpSettings(prev => ({ ...prev, is_active: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>SMTP Padrão</Label>
                  <p className="text-xs text-muted-foreground">Usar este SMTP por defeito para envios</p>
                </div>
                <Switch
                  checked={smtpSettings.is_default}
                  onCheckedChange={(checked) => setSmtpSettings(prev => ({ ...prev, is_default: checked }))}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp_host">{t("profile.smtpHost")}</Label>
                  <Input
                    id="smtp_host"
                    value={smtpSettings.smtp_host}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, smtp_host: e.target.value }))}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="smtp_port">{t("profile.smtpPort")}</Label>
                  <Input
                    id="smtp_port"
                    inputMode="numeric"
                    value={smtpSettings.smtp_port || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setSmtpSettings(prev => ({ ...prev, smtp_port: val ? parseInt(val) : 0 }));
                    }}
                    placeholder="587"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp_username">{t("profile.smtpUsername")}</Label>
                <Input
                  id="smtp_username"
                  value={smtpSettings.smtp_username}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, smtp_username: e.target.value }))}
                  placeholder={t("profile.smtpUsernamePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp_password">{t("profile.smtpPassword")}</Label>
                <div className="relative">
                  <Input
                    id="smtp_password"
                    type={showSmtpPassword ? "text" : "password"}
                    value={smtpSettings.smtp_password}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, smtp_password: e.target.value }))}
                    placeholder={t("profile.smtpPasswordPlaceholder")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                  >
                    {showSmtpPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>{t("profile.smtpSecure")}</Label>
                  <p className="text-xs text-muted-foreground">{t("profile.smtpSecureDescription")}</p>
                </div>
                <Switch
                  checked={smtpSettings.smtp_secure}
                  onCheckedChange={(checked) => setSmtpSettings(prev => ({ ...prev, smtp_secure: checked }))}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="from_name">{t("profile.fromName")}</Label>
                <Input
                  id="from_name"
                  value={smtpSettings.from_name}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, from_name: e.target.value }))}
                  placeholder={t("profile.fromNamePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="from_email">{t("profile.fromEmail")}</Label>
                <Input
                  id="from_email"
                  type="email"
                  value={smtpSettings.from_email}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, from_email: e.target.value }))}
                  placeholder={t("profile.fromEmailPlaceholder")}
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleSaveSmtpSettings} 
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? t("common.saving") : (smtpSettings.id ? t("common.saveChanges") : "Adicionar SMTP")}
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleTestSmtpConnection}
                  disabled={testingSmtp || !smtpSettings.smtp_host || !smtpSettings.smtp_username}
                  className="flex items-center gap-2"
                >
                  {testingSmtp ? (
                    t("profile.testing")
                  ) : smtpTestResult === 'success' ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      {t("profile.testSuccess")}
                    </>
                  ) : smtpTestResult === 'error' ? (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      {t("profile.testFailed")}
                    </>
                  ) : (
                    t("profile.testConnection")
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
