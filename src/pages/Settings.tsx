import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings as SettingsIcon, User, Shield, Database, Plus, Trash2, Loader2, ListPlus, Calendar, Mail, CheckCircle, XCircle, Radio } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface CustomField {
  id: string;
  name: string;
  label: string;
  field_type: string;
  required: boolean;
  options: string[] | null;
  organization_id: string | null;
  organization?: { name: string };
}

interface Organization {
  id: string;
  name: string;
  type?: string | null;
}

interface CalendarPermission {
  id: string;
  role: string;
  can_create_visits: boolean;
  can_view_own_visits: boolean;
  can_view_all_visits: boolean;
  can_edit_own_visits: boolean;
  can_edit_all_visits: boolean;
  can_delete_own_visits: boolean;
  can_delete_all_visits: boolean;
}

interface SMTPSettings {
  id: string;
  organization_id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_secure: boolean;
  from_email: string;
  from_name: string;
  is_active: boolean;
}

interface ChannelType {
  id: string;
  name: string;
  label: string;
  icon: string | null;
  is_active: boolean;
}

const Settings = () => {
  const { t } = useTranslation();
  
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [childOrgs, setChildOrgs] = useState<Organization[]>([]);
  const [calendarPermissions, setCalendarPermissions] = useState<CalendarPermission[]>([]);
  const [smtpSettings, setSmtpSettings] = useState<SMTPSettings | null>(null);
  const [channelTypes, setChannelTypes] = useState<ChannelType[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [smtpDialogOpen, setSmtpDialogOpen] = useState(false);
  const [channelTypeDialogOpen, setChannelTypeDialogOpen] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  
  const [fieldName, setFieldName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  
  // Unique key configuration
  const [contactUniqueKeys, setContactUniqueKeys] = useState<string[]>(['email']);
  const [uniqueKeyCompanyId, setUniqueKeyCompanyId] = useState("");

  // SMTP form state
  const [smtpForm, setSmtpForm] = useState({
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    smtp_secure: true,
    from_email: "",
    from_name: "",
    is_active: true,
  });

  // Channel type form state
  const [channelTypeForm, setChannelTypeForm] = useState({
    name: "",
    label: "",
    icon: "",
    is_active: true,
  });
  const [editingChannelType, setEditingChannelType] = useState<ChannelType | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let userIsAdmin = false;
      
      if (user) {
        // Check if user is admin - simplified
        try {
          const roleCheck = await supabase.rpc('has_role', {
            _user_id: user.id,
            _role: 'admin'
          });
          
          if (roleCheck.data) {
            setIsAdmin(true);
            userIsAdmin = true;
          }
        } catch {
          // If function doesn't exist, skip admin check
        }

        // Check if user is company admin via anew_memberships + anew_roles
        const { data: anewUser } = await (supabase as any)
          .from('anew_users')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        
        if (anewUser?.id) {
          const { data: membership } = await supabase
            .from('anew_memberships')
            .select('organization_id, role_id')
            .eq('user_id', anewUser.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
          
          if (membership) {
            const { data: role } = await supabase
              .from('anew_roles')
              .select('code')
              .eq('id', membership.role_id)
              .maybeSingle();
            
            const adminCodes = ['org_admin', 'super_admin', 'system_admin'];
            if (role?.code && adminCodes.includes(role.code)) {
              setIsCompanyAdmin(true);
              setUserCompanyId(membership.organization_id);
              loadSmtpSettings(membership.organization_id);
            }
          }
        }

        // Contact unique key will be loaded when company is selected
      }

      // Try to load channel types - RLS will handle permissions
      try {
        const { data: typesData } = await supabase
          .from('channel_types')
          .select('*')
          .order('label');
        
        if (typesData && typesData.length > 0) {
          setChannelTypes(typesData);
          userIsAdmin = true; // If we can read, we're admin
          setIsAdmin(true);
        }
      } catch {
        // Not admin, skip
      }

      const [fieldsResult, orgsResult] = await Promise.all([
        (supabase as any)
          .from("contact_custom_fields")
          .select(`
            *,
            organization:anew_organizations(name)
          `)
          .order("created_at", { ascending: false }),
        (supabase as any).from("anew_organizations").select("id, name, type").in("type", ["holding", "empresa"]).order("name"),
      ]);

      if (fieldsResult.error) throw fieldsResult.error;
      if (orgsResult.error) throw orgsResult.error;

      setCustomFields(fieldsResult.data || []);
      setOrganizations(orgsResult.data || []);
      
      // Load child orgs via hierarchy if needed
      // For now, childOrgs = all visible orgs (same list)
      setChildOrgs(orgsResult.data || []);
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadSmtpSettings = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from("organization_smtp_settings")
        .select("*")
        .eq("organization_id", companyId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSmtpSettings(data);
        setSmtpForm({
          smtp_host: data.smtp_host,
          smtp_port: data.smtp_port,
          smtp_username: data.smtp_username,
          smtp_password: "", // Don't show password
          smtp_secure: data.smtp_secure,
          from_email: data.from_email,
          from_name: data.from_name,
          is_active: data.is_active,
        });
      }
    } catch (error: any) {
      console.error("Error loading SMTP settings:", error);
    }
  };

  const handleSaveSmtp = async () => {
    if (!userCompanyId) {
      toast.error(t('settingsPage.smtp.noCompany'));
      return;
    }

    if (!smtpForm.smtp_host || !smtpForm.smtp_username || !smtpForm.from_email || !smtpForm.from_name) {
      toast.error(t('settingsPage.smtp.fillRequired'));
      return;
    }

    // If editing and password is empty, don't update it
    const updateData = smtpForm.smtp_password
      ? { ...smtpForm, organization_id: userCompanyId }
      : { ...smtpForm, smtp_password: undefined, organization_id: userCompanyId };

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      if (smtpSettings) {
        // Update existing
        const { error } = await supabase
          .from("organization_smtp_settings")
          .update(updateData)
          .eq("id", smtpSettings.id);

        if (error) throw error;
        toast.success(t('settingsPage.smtp.success'));
      } else {
        // Create new
        if (!smtpForm.smtp_password) {
          toast.error(t('settingsPage.smtp.passwordRequired'));
          return;
        }

        const { error } = await supabase
          .from("organization_smtp_settings")
          .insert({
            ...smtpForm,
            organization_id: userCompanyId,
            created_by: businessUserId,
          });

        if (error) throw error;
        toast.success(t('settingsPage.smtp.created'));
      }

      setSmtpDialogOpen(false);
      loadSmtpSettings(userCompanyId);
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!userCompanyId) {
      toast.error(t('settingsPage.smtp.noCompany'));
      return;
    }

    if (!smtpSettings) {
      toast.error(t('settingsPage.smtp.saveFirst'));
      return;
    }

    setTestingSmtp(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) throw new Error("User email not found");

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          organization_id: userCompanyId,
          to: user.email,
          subject: "Test Email - SMTP Configuration",
          html: `
            <h1>SMTP Configuration Test</h1>
            <p>This is a test email to verify your SMTP configuration is working correctly.</p>
            <p>If you received this email, your SMTP server is configured properly!</p>
          `,
          text: "SMTP Configuration Test - If you received this email, your SMTP server is configured properly!",
        },
      });

      if (error) throw error;

      toast.success(t('settingsPage.smtp.testSuccess'));
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleCreateField = async () => {
    if (!fieldName || !fieldLabel) {
      toast.error(t('settingsPage.smtp.fillRequired'));
      return;
    }

    if (!selectedOrgId) {
      toast.error(t('settingsPage.columns.selectCompany'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await (supabase as any).from("contact_custom_fields").insert({
        name: fieldName,
        label: fieldLabel,
        field_type: fieldType,
        required: fieldRequired,
        options: fieldType === "select" && fieldOptions ? fieldOptions.split(",").map(o => o.trim()) : null,
        organization_id: selectedOrgId,
      });

      if (error) throw error;

      toast.success(t('settingsPage.customFields.success'));
      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteField = async (id: string) => {
    if (!confirm(t('settingsPage.confirm.deleteField'))) return;

    setLoading(true);
    try {
      const { error } = await supabase.from("contact_custom_fields").delete().eq("id", id);
      if (error) throw error;

      toast.success(t('settingsPage.customFields.deleted'));
      loadData();
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFieldName("");
    setFieldLabel("");
    setFieldType("text");
    setFieldRequired(false);
    setFieldOptions("");
    setSelectedOrgId("");
  };

  const handleUpdateCalendarPermission = async (permissionId: string, field: string, value: boolean) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("role_calendar_permissions")
        .update({ [field]: value } as any)
        .eq("id", permissionId);

      if (error) throw error;

      toast.success(t('settingsPage.calendar.success'));
      loadData();
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateContactUniqueKeys = async () => {
    if (!uniqueKeyCompanyId) {
      toast.error(t('settingsPage.contactUniqueKeys.selectCompany'));
      return;
    }

    if (contactUniqueKeys.length === 0) {
      toast.error(t('settingsPage.contactUniqueKeys.atLeastOne'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await (supabase as any)
        .from('anew_organizations')
        .update({ metadata: { contact_unique_keys: contactUniqueKeys } })
        .eq('id', uniqueKeyCompanyId);

      if (error) throw error;

      toast.success(t('settingsPage.contactUniqueKeys.success'));
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyUniqueKeys = async (companyId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('anew_organizations')
        .select('metadata')
        .eq('id', companyId)
        .maybeSingle();

      if (error) throw error;

      const keys = data?.metadata?.contact_unique_keys;
      if (keys && Array.isArray(keys) && keys.length > 0) {
        setContactUniqueKeys(keys);
      } else {
        setContactUniqueKeys(['email']);
      }
    } catch (error: any) {
      console.error("Error loading company unique keys:", error);
      setContactUniqueKeys(['email']);
    }
  };

  const toggleUniqueKey = (key: string) => {
    setContactUniqueKeys(prev => {
      if (prev.includes(key)) {
        // Don't allow removing the last key
        if (prev.length === 1) {
          toast.error(t('settingsPage.contactUniqueKeys.atLeastOne'));
          return prev;
        }
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleSaveChannelType = async () => {
    if (!channelTypeForm.name || !channelTypeForm.label) {
      toast.error(t('settingsPage.smtp.fillRequired'));
      return;
    }

    setLoading(true);
    try {
      if (editingChannelType) {
        // Update existing
        const { error } = await supabase
          .from("channel_types")
          .update({
            name: channelTypeForm.name,
            label: channelTypeForm.label,
            icon: channelTypeForm.icon || null,
            is_active: channelTypeForm.is_active,
          })
          .eq("id", editingChannelType.id);

        if (error) throw error;
        toast.success(t('settingsPage.channelTypes.success'));
      } else {
        // Create new
        const { error } = await supabase
          .from("channel_types")
          .insert({
            name: channelTypeForm.name,
            label: channelTypeForm.label,
            icon: channelTypeForm.icon || null,
            is_active: channelTypeForm.is_active,
          });

        if (error) throw error;
        toast.success(t('settingsPage.channelTypes.success'));
      }

      setChannelTypeDialogOpen(false);
      setEditingChannelType(null);
      setChannelTypeForm({
        name: "",
        label: "",
        icon: "",
        is_active: true,
      });
      loadData();
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditChannelType = (type: ChannelType) => {
    setEditingChannelType(type);
    setChannelTypeForm({
      name: type.name,
      label: type.label,
      icon: type.icon || "",
      is_active: type.is_active,
    });
    setChannelTypeDialogOpen(true);
  };

  const handleDeleteChannelType = async (typeId: string) => {
    if (!confirm(t('settingsPage.confirm.deleteChannelType'))) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("channel_types")
        .delete()
        .eq("id", typeId);

      if (error) throw error;

      toast.success(t('settingsPage.channelTypes.deleted'));
      loadData();
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleChannelTypeStatus = async (typeId: string, currentStatus: boolean) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("channel_types")
        .update({ is_active: !currentStatus })
        .eq("id", typeId);

      if (error) throw error;

      toast.success(!currentStatus ? t('settingsPage.channelTypes.activated') : t('settingsPage.channelTypes.deactivated'));
      loadData();
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t('settingsPage.title')}</h1>
            <p className="text-muted-foreground">{t('settingsPage.subtitle')}</p>
          </div>
          <PageFAQSheet pageKey="admin.settings" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {t('settingsPage.profile.title')}
              </CardTitle>
              <CardDescription>{t('settingsPage.profile.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('settingsPage.profile.content')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {t('settingsPage.security.title')}
              </CardTitle>
              <CardDescription>{t('settingsPage.security.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('settingsPage.security.content')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                {t('settingsPage.data.title')}
              </CardTitle>
              <CardDescription>{t('settingsPage.data.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('settingsPage.data.content')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {t('settingsPage.contactUniqueKeys.title')}
              </CardTitle>
              <CardDescription>{t('settingsPage.contactUniqueKeys.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="uniqueKeyCompany">{t('common.company')}</Label>
                <Select 
                  value={uniqueKeyCompanyId} 
                  onValueChange={(v) => {
                    setUniqueKeyCompanyId(v);
                    loadCompanyUniqueKeys(v);
                  }}
                >
                  <SelectTrigger id="uniqueKeyCompany">
                    <SelectValue placeholder={t('settingsPage.contactUniqueKeys.selectCompany')} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {uniqueKeyCompanyId && (
                <>
                  <div className="space-y-3">
                    <Label>{t('settingsPage.contactUniqueKeys.fields')}</Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="uniqueKey-email" 
                          checked={contactUniqueKeys.includes('email')}
                          onCheckedChange={() => toggleUniqueKey('email')}
                        />
                        <Label htmlFor="uniqueKey-email" className="cursor-pointer font-normal">
                          {t('common.email')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="uniqueKey-phone" 
                          checked={contactUniqueKeys.includes('phone')}
                          onCheckedChange={() => toggleUniqueKey('phone')}
                        />
                        <Label htmlFor="uniqueKey-phone" className="cursor-pointer font-normal">
                          {t('common.phone')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="uniqueKey-vat" 
                          checked={contactUniqueKeys.includes('vat')}
                          onCheckedChange={() => toggleUniqueKey('vat')}
                        />
                        <Label htmlFor="uniqueKey-vat" className="cursor-pointer font-normal">
                          {t('settingsPage.contactUniqueKeys.vat')}
                        </Label>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settingsPage.contactUniqueKeys.help')}
                      {contactUniqueKeys.length > 1 && ' ' + t('settingsPage.contactUniqueKeys.multipleHelp')}
                    </p>
                  </div>
                  <Button onClick={handleUpdateContactUniqueKeys} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('settingsPage.contactUniqueKeys.save')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" />
                {t('settingsPage.system.title')}
              </CardTitle>
              <CardDescription>{t('settingsPage.system.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('settingsPage.system.content')}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {t('settingsPage.calendar.title')}
            </CardTitle>
            <CardDescription>{t('settingsPage.calendar.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && calendarPermissions.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : calendarPermissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('settingsPage.calendar.noPermissions')}
              </p>
            ) : (
              <div className="space-y-4">
                {calendarPermissions.map((permission) => (
                  <div key={permission.id} className="border rounded-lg p-4 space-y-3">
                    <h4 className="font-semibold text-lg capitalize">{permission.role}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`${permission.id}-create`}
                          checked={permission.can_create_visits}
                          onCheckedChange={(checked) =>
                            handleUpdateCalendarPermission(permission.id, "can_create_visits", checked as boolean)
                          }
                          disabled={loading}
                        />
                        <Label htmlFor={`${permission.id}-create`} className="cursor-pointer font-normal">
                          {t('settingsPage.calendar.createVisits')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`${permission.id}-view-own`}
                          checked={permission.can_view_own_visits}
                          onCheckedChange={(checked) =>
                            handleUpdateCalendarPermission(permission.id, "can_view_own_visits", checked as boolean)
                          }
                          disabled={loading}
                        />
                        <Label htmlFor={`${permission.id}-view-own`} className="cursor-pointer font-normal">
                          {t('settingsPage.calendar.viewOwnVisits')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`${permission.id}-view-all`}
                          checked={permission.can_view_all_visits}
                          onCheckedChange={(checked) =>
                            handleUpdateCalendarPermission(permission.id, "can_view_all_visits", checked as boolean)
                          }
                          disabled={loading}
                        />
                        <Label htmlFor={`${permission.id}-view-all`} className="cursor-pointer font-normal">
                          {t('settingsPage.calendar.viewAllVisits')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`${permission.id}-edit-own`}
                          checked={permission.can_edit_own_visits}
                          onCheckedChange={(checked) =>
                            handleUpdateCalendarPermission(permission.id, "can_edit_own_visits", checked as boolean)
                          }
                          disabled={loading}
                        />
                        <Label htmlFor={`${permission.id}-edit-own`} className="cursor-pointer font-normal">
                          {t('settingsPage.calendar.editOwnVisits')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`${permission.id}-edit-all`}
                          checked={permission.can_edit_all_visits}
                          onCheckedChange={(checked) =>
                            handleUpdateCalendarPermission(permission.id, "can_edit_all_visits", checked as boolean)
                          }
                          disabled={loading}
                        />
                        <Label htmlFor={`${permission.id}-edit-all`} className="cursor-pointer font-normal">
                          {t('settingsPage.calendar.editAllVisits')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`${permission.id}-delete-own`}
                          checked={permission.can_delete_own_visits}
                          onCheckedChange={(checked) =>
                            handleUpdateCalendarPermission(permission.id, "can_delete_own_visits", checked as boolean)
                          }
                          disabled={loading}
                        />
                        <Label htmlFor={`${permission.id}-delete-own`} className="cursor-pointer font-normal">
                          {t('settingsPage.calendar.deleteOwnVisits')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`${permission.id}-delete-all`}
                          checked={permission.can_delete_all_visits}
                          onCheckedChange={(checked) =>
                            handleUpdateCalendarPermission(permission.id, "can_delete_all_visits", checked as boolean)
                          }
                          disabled={loading}
                        />
                        <Label htmlFor={`${permission.id}-delete-all`} className="cursor-pointer font-normal">
                          {t('settingsPage.calendar.deleteAllVisits')}
                        </Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SMTP Configuration Card - Only visible to company admins */}
        {isCompanyAdmin && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    {t('settingsPage.smtp.title')}
                  </CardTitle>
                  <CardDescription>{t('settingsPage.smtp.description')}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {smtpSettings && (
                    <Button
                      variant="outline"
                      onClick={handleTestSmtp}
                      disabled={testingSmtp || !smtpSettings.is_active}
                    >
                      {testingSmtp ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t('settingsPage.smtp.testing')}
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          {t('settingsPage.smtp.testEmail')}
                        </>
                      )}
                    </Button>
                  )}
                  <Dialog open={smtpDialogOpen} onOpenChange={setSmtpDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        {smtpSettings ? t('settingsPage.smtp.edit') : t('settingsPage.smtp.configure')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{t('settingsPage.smtp.dialogTitle')}</DialogTitle>
                        <DialogDescription>
                          {t('settingsPage.smtp.dialogDescription')}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="col-span-2 space-y-2">
                            <Label htmlFor="smtp_host">{t('techSettings.smtp.host')} *</Label>
                            <Input
                              id="smtp_host"
                              placeholder="smtp.gmail.com"
                              value={smtpForm.smtp_host}
                              onChange={(e) => setSmtpForm({ ...smtpForm, smtp_host: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="smtp_port">{t('techSettings.smtp.port')} *</Label>
                            <Input
                              id="smtp_port"
                              type="number"
                              placeholder="587"
                              value={smtpForm.smtp_port}
                              onChange={(e) => setSmtpForm({ ...smtpForm, smtp_port: parseInt(e.target.value) || 587 })}
                            />
                          </div>
                          <div className="space-y-2 flex items-end">
                            <div className="flex items-center space-x-2 pb-2">
                              <Switch
                                id="smtp_secure"
                                checked={smtpForm.smtp_secure}
                                onCheckedChange={(checked) => setSmtpForm({ ...smtpForm, smtp_secure: checked })}
                              />
                              <Label htmlFor="smtp_secure" className="cursor-pointer">
                                {t('techSettings.smtp.secure')}
                              </Label>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="smtp_username">{t('techSettings.smtp.username')} *</Label>
                            <Input
                              id="smtp_username"
                              placeholder="your-email@example.com"
                              value={smtpForm.smtp_username}
                              onChange={(e) => setSmtpForm({ ...smtpForm, smtp_username: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="smtp_password">
                              {t('techSettings.smtp.password')} * {smtpSettings && ` ${t('settingsPage.smtp.passwordKeep')}`}
                            </Label>
                            <Input
                              id="smtp_password"
                              type="password"
                              placeholder={smtpSettings ? "••••••••" : "password"}
                              value={smtpForm.smtp_password}
                              onChange={(e) => setSmtpForm({ ...smtpForm, smtp_password: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="from_email">{t('techSettings.smtp.fromEmail')} *</Label>
                            <Input
                              id="from_email"
                              placeholder="noreply@example.com"
                              value={smtpForm.from_email}
                              onChange={(e) => setSmtpForm({ ...smtpForm, from_email: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="from_name">{t('techSettings.smtp.fromName')} *</Label>
                            <Input
                              id="from_name"
                              placeholder="Your Company Name"
                              value={smtpForm.from_name}
                              onChange={(e) => setSmtpForm({ ...smtpForm, from_name: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            id="is_active"
                            checked={smtpForm.is_active}
                            onCheckedChange={(checked) => setSmtpForm({ ...smtpForm, is_active: checked })}
                          />
                          <Label htmlFor="is_active" className="cursor-pointer">
                            {t('techSettings.smtp.active')}
                          </Label>
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setSmtpDialogOpen(false)}>
                            {t('common.cancel')}
                          </Button>
                          <Button onClick={handleSaveSmtp} disabled={loading}>
                            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {t('settingsPage.smtp.save')}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {smtpSettings ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {smtpSettings.is_active ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm">
                      {smtpSettings.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('settingsPage.smtp.host')}: {smtpSettings.smtp_host}:{smtpSettings.smtp_port}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('settingsPage.smtp.fromName')}: {smtpSettings.from_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('settingsPage.smtp.fromEmail')}: {smtpSettings.from_email}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t('settingsPage.smtp.configure')}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Channel Types Card - Only visible to admins */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Radio className="w-5 h-5" />
                    {t('settingsPage.channelTypes.title')}
                  </CardTitle>
                  <CardDescription>{t('settingsPage.channelTypes.description')}</CardDescription>
                </div>
                <Dialog open={channelTypeDialogOpen} onOpenChange={(open) => {
                  setChannelTypeDialogOpen(open);
                  if (!open) {
                    setEditingChannelType(null);
                    setChannelTypeForm({ name: "", label: "", icon: "", is_active: true });
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      {t('settingsPage.channelTypes.add')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('settingsPage.channelTypes.dialogTitle')}</DialogTitle>
                      <DialogDescription>{t('settingsPage.channelTypes.description')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="channel_name">{t('common.name')} *</Label>
                        <Input
                          id="channel_name"
                          placeholder="facebook_ads"
                          value={channelTypeForm.name}
                          onChange={(e) => setChannelTypeForm({ ...channelTypeForm, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="channel_label">{t('settingsPage.channelTypes.label')} *</Label>
                        <Input
                          id="channel_label"
                          placeholder="Facebook Ads"
                          value={channelTypeForm.label}
                          onChange={(e) => setChannelTypeForm({ ...channelTypeForm, label: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="channel_icon">{t('settingsPage.channelTypes.icon')}</Label>
                        <Input
                          id="channel_icon"
                          placeholder="facebook"
                          value={channelTypeForm.icon}
                          onChange={(e) => setChannelTypeForm({ ...channelTypeForm, icon: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('settingsPage.channelTypes.iconHelp')}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="channel_active"
                          checked={channelTypeForm.is_active}
                          onCheckedChange={(checked) => setChannelTypeForm({ ...channelTypeForm, is_active: checked })}
                        />
                        <Label htmlFor="channel_active" className="cursor-pointer">
                          {t('common.active')}
                        </Label>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setChannelTypeDialogOpen(false)}
                        >
                          {t('common.cancel')}
                        </Button>
                        <Button onClick={handleSaveChannelType} disabled={loading}>
                          {loading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {t('common.saving')}
                            </>
                          ) : (
                            editingChannelType ? t('common.save') : t('common.create')
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : channelTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t('settingsPage.channelTypes.noTypes')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.name')}</TableHead>
                      <TableHead>{t('settingsPage.channelTypes.label')}</TableHead>
                      <TableHead>{t('settingsPage.channelTypes.icon')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channelTypes.map((type) => (
                      <TableRow key={type.id}>
                        <TableCell className="font-medium">{type.name}</TableCell>
                        <TableCell>{type.label}</TableCell>
                        <TableCell>{type.icon || '-'}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleChannelTypeStatus(type.id, type.is_active)}
                          >
                            {type.is_active ? (
                              <span className="text-success">{t('common.active')}</span>
                            ) : (
                              <span className="text-muted-foreground">{t('common.inactive')}</span>
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditChannelType(type)}
                            >
                              {t('common.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteChannelType(type.id)}
                              disabled={loading}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ListPlus className="w-5 h-5" />
                  {t('settingsPage.customFields.title')}
                </CardTitle>
                <CardDescription>{t('settingsPage.customFields.description')}</CardDescription>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('settingsPage.customFields.add')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{t('settingsPage.customFields.createTitle')}</DialogTitle>
                    <DialogDescription>{t('settingsPage.customFields.createDescription')}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fieldName">{t('settingsPage.customFields.fieldName')} *</Label>
                        <Input
                          id="fieldName"
                          placeholder="e.g., secondary_email"
                          value={fieldName}
                          onChange={(e) => setFieldName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fieldLabel">{t('settingsPage.customFields.displayLabel')} *</Label>
                        <Input
                          id="fieldLabel"
                          placeholder="e.g., Secondary Email"
                          value={fieldLabel}
                          onChange={(e) => setFieldLabel(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fieldType">{t('settingsPage.customFields.fieldType')}</Label>
                        <Select value={fieldType} onValueChange={setFieldType}>
                          <SelectTrigger id="fieldType">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">{t('settingsPage.customFields.typeText')}</SelectItem>
                            <SelectItem value="textarea">{t('settingsPage.customFields.typeTextarea')}</SelectItem>
                            <SelectItem value="number">{t('settingsPage.customFields.typeNumber')}</SelectItem>
                            <SelectItem value="date">{t('settingsPage.customFields.typeDate')}</SelectItem>
                            <SelectItem value="select">{t('settingsPage.customFields.typeSelect')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center space-x-2 pt-8">
                        <Checkbox
                          id="required"
                          checked={fieldRequired}
                          onCheckedChange={(checked) => setFieldRequired(checked as boolean)}
                        />
                        <Label htmlFor="required" className="cursor-pointer">{t('settingsPage.customFields.required')}</Label>
                      </div>
                    </div>

                    {fieldType === "select" && (
                      <div className="space-y-2">
                        <Label htmlFor="options">{t('settingsPage.customFields.options')}</Label>
                        <Input
                          id="options"
                          placeholder="e.g., Option 1, Option 2, Option 3"
                          value={fieldOptions}
                          onChange={(e) => setFieldOptions(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="organization">{t('settingsPage.customFields.scope')} *</Label>
                        <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                          <SelectTrigger id="organization">
                            <SelectValue placeholder={t('settingsPage.columns.selectCompany')} />
                          </SelectTrigger>
                          <SelectContent>
                            {organizations.map((org) => (
                              <SelectItem key={org.id} value={org.id}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>
                        {t('common.cancel')}
                      </Button>
                      <Button onClick={handleCreateField} disabled={loading}>
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {t('settingsPage.customFields.create')}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {loading && customFields.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : customFields.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('settingsPage.customFields.noFields')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.label')}</TableHead>
                    <TableHead>{t('common.type')}</TableHead>
                    <TableHead>{t('common.required')}</TableHead>
                    <TableHead>{t('common.scope')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customFields.map((field) => (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium">{field.label}</TableCell>
                      <TableCell className="capitalize">{field.field_type}</TableCell>
                      <TableCell>{field.required ? t('common.yes') : t('common.no')}</TableCell>
                      <TableCell>
                        {field.organization_id 
                          ? `${t('settingsPage.customFields.scope')}: ${field.organization?.name}` 
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteField(field.id)}
                          disabled={loading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Settings;
