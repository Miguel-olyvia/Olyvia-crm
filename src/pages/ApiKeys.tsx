import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Key, Copy, Trash2, Plus, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface ApiKey {
  id: string;
  key_name: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  usage_count: number;
}

export default function ApiKeys() {
  const { t } = useTranslation();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewKey, setShowNewKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: t('apiKeys.toast.loadError'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateApiKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: t('common.error'),
        description: t('apiKeys.toast.nameRequired'),
        variant: "destructive",
      });
      return;
    }

    try {
      // Get user's organization via anew_memberships
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: anewUser } = await (supabase as any)
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!anewUser?.id) throw new Error("User not found");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      const { data: membership } = await supabase
        .from("anew_memberships")
        .select("organization_id")
        .eq("user_id", anewUser.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (!membership) throw new Error("No organization found");

      // Generate API key using database function
      const { data: keyData, error: keyError } = await supabase
        .rpc("generate_api_key");

      if (keyError) throw keyError;

      // Insert new API key
      const { data, error } = await (supabase as any)
        .from("api_keys")
        .insert({
          organization_id: membership.organization_id,
          key_name: newKeyName,
          api_key: keyData,
          created_by: businessUserId,
        })
        .select()
        .single();

      if (error) throw error;

      setShowNewKey(data.api_key);
      setNewKeyName("");
      setIsDialogOpen(false);
      fetchApiKeys();

      toast({
        title: t('common.success'),
        description: t('apiKeys.toast.createSuccess'),
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('apiKeys.toast.createError'),
        variant: "destructive",
      });
    }
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('apiKeys.toast.copied'),
      description: t('apiKeys.toast.copiedDesc'),
    });
  };

  const deleteApiKey = async (id: string) => {
    if (!confirm(t('apiKeys.toast.deleteConfirm'))) return;

    try {
      const { error } = await supabase
        .from("api_keys")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: t('apiKeys.toast.deleteSuccess'),
      });
      fetchApiKeys();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: t('apiKeys.toast.deleteError'),
        variant: "destructive",
      });
    }
  };

  const toggleKeyStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("api_keys")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: t('common.success'),
        description: !currentStatus ? t('apiKeys.toast.activatedSuccess') : t('apiKeys.toast.deactivatedSuccess'),
      });
      fetchApiKeys();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: t('apiKeys.toast.updateError'),
        variant: "destructive",
      });
    }
  };

  const maskApiKey = (key: string) => {
    return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('apiKeys.title')}</h1>
            <p className="text-muted-foreground mt-2">
              {t('apiKeys.subtitle')}
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t('apiKeys.newKey')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('apiKeys.dialog.title')}</DialogTitle>
                <DialogDescription>
                  {t('apiKeys.dialog.description')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="keyName">{t('apiKeys.dialog.keyName')}</Label>
                  <Input
                    id="keyName"
                    placeholder={t('apiKeys.dialog.keyNamePlaceholder')}
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t('apiKeys.dialog.cancel')}
                </Button>
                <Button onClick={generateApiKey}>{t('apiKeys.dialog.create')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {showNewKey && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">{t('apiKeys.alert.created')}</p>
                <p className="text-sm">{t('apiKeys.alert.copyNow')}</p>
                <div className="flex gap-2 items-center mt-2">
                  <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                    {showNewKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      copyToClipboard(showNewKey);
                      setShowNewKey(null);
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('apiKeys.docs.title')}</CardTitle>
            <CardDescription>{t('apiKeys.docs.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <Label className="text-base font-semibold">{t('apiKeys.docs.endpoints')}</Label>
                <div className="mt-2 space-y-3">
                  <div className="p-3 bg-muted rounded">
                    <p className="font-medium text-sm mb-1">{t('apiKeys.docs.directEndpoint')}</p>
                    <div className="flex gap-2 items-center">
                      <code className="flex-1 text-xs break-all">
                        POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/insert-lead
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/insert-lead`)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded border-2 border-blue-200 dark:border-blue-800">
                    <p className="font-medium text-sm mb-1 flex items-center gap-2">
                      <span className="text-blue-600 dark:text-blue-400">✓ {t('apiKeys.docs.recommendedEndpoint')}</span> 
                      {t('apiKeys.docs.customDomainEndpoint')}
                    </p>
                    <div className="flex gap-2 items-center">
                      <code className="flex-1 text-xs break-all">
                        POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-proxy/leads
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-proxy/leads`)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      💡 {t('apiKeys.docs.customDomainTip')}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold">{t('apiKeys.docs.requiredHeaders')}</Label>
                <div className="mt-2 space-y-2">
                  <div className="p-3 bg-muted rounded">
                    <code className="text-sm">Content-Type: application/json</code>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <code className="text-sm">X-API-Key: your_api_key_here</code>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold">{t('apiKeys.docs.bodyFields')}</Label>
                <div className="mt-2 space-y-3">
                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      <span className="text-destructive">*</span> first_name <span className="text-muted-foreground">(string)</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.firstName')}</p>
                  </div>
                  
                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      <span className="text-destructive">*</span> last_name <span className="text-muted-foreground">(string)</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.lastName')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      email <span className="text-muted-foreground">(string, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.email')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      phone <span className="text-muted-foreground">(string, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.phone')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      position <span className="text-muted-foreground">(string, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.position')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      status <span className="text-muted-foreground">(string, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.status')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      call_center_status <span className="text-muted-foreground">(string, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.callCenterStatus')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      call_center_priority <span className="text-muted-foreground">(number, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.callCenterPriority')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      call_center_notes <span className="text-muted-foreground">(string, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.callCenterNotes')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      call_center_scheduled_for <span className="text-muted-foreground">(string ISO date, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.callCenterScheduledFor')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      notes <span className="text-muted-foreground">(string, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.notes')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      source <span className="text-muted-foreground">(string, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.source')}</p>
                  </div>

                  <div className="p-3 border rounded">
                    <p className="font-medium text-sm mb-1">
                      organization_id <span className="text-muted-foreground">(string UUID, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.docs.companyId')}</p>
                  </div>

                  <div className="p-3 border rounded bg-blue-50 dark:bg-blue-950">
                    <p className="font-medium text-sm mb-1">
                      custom_fields <span className="text-muted-foreground">(object, {t('apiKeys.docs.optional')})</span>
                    </p>
                    <p className="text-sm text-muted-foreground mb-2">{t('apiKeys.docs.customFields')}</p>
                    <code className="text-xs block mt-2 p-2 bg-background rounded">
                      {`"custom_fields": {\n  "field_1": "value",\n  "field_2": "another value"\n}`}
                    </code>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold">{t('apiKeys.docs.completeExample')}</Label>
                <pre className="mt-2 p-4 bg-muted rounded text-xs overflow-x-auto">
{`# ${t('apiKeys.docs.usingDirect')}
curl -X POST https://api.yourdomain.com/functions/v1/insert-lead \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your_api_key_here" \\
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "position": "CEO",
    "status": "lead",
    "call_center_status": "not_attempted",
    "call_center_priority": 2,
    "call_center_notes": "Preferred contact: 2pm-6pm",
    "notes": "Interested in product X",
    "source": "Website Landing Page",
    "custom_fields": {
      "interest": "Premium Product",
      "budget": "10000-50000"
    }
  }'

# ${t('apiKeys.docs.usingProxy')}
curl -X POST https://api.yourdomain.com/functions/v1/api-proxy/leads \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your_api_key_here" \\
  -d '{ ... ${t('apiKeys.docs.sameBody')} ... }'`}
                </pre>
              </div>

              <div>
                <Label className="text-base font-semibold">{t('apiKeys.docs.successResponse')}</Label>
                <pre className="mt-2 p-4 bg-muted rounded text-xs">
{`{
  "success": true,
  "lead_id": "uuid-of-created-lead",
  "message": "Lead created successfully"
}`}
                </pre>
              </div>

              <div>
                <Label className="text-base font-semibold">{t('apiKeys.docs.errorResponses')}</Label>
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-sm font-medium">{t('apiKeys.docs.invalidApiKey')}</p>
                    <pre className="p-2 bg-muted rounded text-xs mt-1">
{`{
  "error": "Invalid or inactive API key"
}`}
                    </pre>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t('apiKeys.docs.missingFields')}</p>
                    <pre className="p-2 bg-muted rounded text-xs mt-1">
{`{
  "error": "first_name and last_name are required"
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('apiKeys.keys.title')}</CardTitle>
            <CardDescription>{t('apiKeys.keys.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>{t('apiKeys.keys.loading')}</p>
            ) : apiKeys.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {t('apiKeys.keys.noKeys')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('apiKeys.table.name')}</TableHead>
                    <TableHead>{t('apiKeys.table.apiKey')}</TableHead>
                    <TableHead>{t('apiKeys.table.status')}</TableHead>
                    <TableHead>{t('apiKeys.table.lastUsed')}</TableHead>
                    <TableHead>{t('apiKeys.table.usageCount')}</TableHead>
                    <TableHead>{t('apiKeys.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.key_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-sm">
                            {visibleKeys.has(key.id) ? key.api_key : maskApiKey(key.api_key)}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleKeyVisibility(key.id)}
                          >
                            {visibleKeys.has(key.id) ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(key.api_key)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={key.is_active ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => toggleKeyStatus(key.id, key.is_active)}
                        >
                          {key.is_active ? t('apiKeys.status.active') : t('apiKeys.status.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {key.last_used_at
                          ? new Date(key.last_used_at).toLocaleString()
                          : t('apiKeys.never')}
                      </TableCell>
                      <TableCell>{key.usage_count}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteApiKey(key.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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
}
