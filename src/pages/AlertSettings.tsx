import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Save, RotateCcw, ChevronDown, Megaphone, UserCheck, Users, FileText, ScrollText, ClipboardList, Bell, Mail, Calendar } from "lucide-react";

// ─── Alert type definitions with defaults ───
interface AlertDef {
  type: string;
  label: string;
  description: string;
  hasDays: boolean;
  defaultDays: number | null;
  defaultActive: boolean;
}

interface ModuleDef {
  id: string;
  label: string;
  icon: React.ElementType;
  iconColor: string;
  alerts: AlertDef[];
}

const ALERT_MODULES: ModuleDef[] = [
  {
    id: "leads",
    label: "Leads",
    icon: Megaphone,
    iconColor: "text-amber-500",
    alerts: [
      { type: "lead_no_contact", label: "Sem contacto", description: "Gerar alerta após X dias sem interação registada", hasDays: true, defaultDays: 7, defaultActive: true },
      { type: "lead_no_contact_urgent", label: "Sem contacto urgente", description: "Alerta vermelho após X dias sem interação", hasDays: true, defaultDays: 14, defaultActive: true },
    ],
  },
  {
    id: "contacts",
    label: "Contactos",
    icon: UserCheck,
    iconColor: "text-purple-500",
    alerts: [
      { type: "contact_no_contact", label: "Sem contacto", description: "Gerar alerta após X dias sem interação", hasDays: true, defaultDays: 7, defaultActive: true },
      { type: "contact_no_contact_urgent", label: "Sem contacto urgente", description: "Alerta vermelho após X dias sem interação", hasDays: true, defaultDays: 14, defaultActive: true },
      { type: "contact_no_deal", label: "Sem deal criado", description: "Se o contacto foi convertido de lead há X dias e não tem deal", hasDays: true, defaultDays: 14, defaultActive: true },
    ],
  },
  {
    id: "clients",
    label: "Clientes",
    icon: Users,
    iconColor: "text-green-500",
    alerts: [
      { type: "client_no_contact", label: "Sem contacto", description: "Gerar alerta após X dias sem contacto", hasDays: true, defaultDays: 30, defaultActive: true },
      { type: "client_no_contact_urgent", label: "Sem contacto urgente", description: "Alerta vermelho após X dias sem contacto", hasDays: true, defaultDays: 60, defaultActive: true },
      { type: "client_missing_nif", label: "NIF em falta", description: "Alertar quando o cliente não tem NIF preenchido", hasDays: false, defaultDays: null, defaultActive: true },
    ],
  },
  {
    id: "proposals",
    label: "Propostas",
    icon: FileText,
    iconColor: "text-primary",
    alerts: [
      { type: "proposal_no_response", label: "Sem resposta após envio", description: "Alertar quando uma proposta enviada não tem resposta", hasDays: true, defaultDays: 5, defaultActive: true },
      { type: "proposal_no_response_urgent", label: "Sem resposta urgente", description: "Alerta vermelho para propostas sem resposta", hasDays: true, defaultDays: 10, defaultActive: true },
      { type: "proposal_no_validity", label: "Sem validade definida", description: "Alertar quando a proposta não tem data de validade", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "proposal_expired", label: "Proposta expirada", description: "Alertar quando a proposta já expirou", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "proposal_draft_stale", label: "Proposta em rascunho", description: "Se está em rascunho há X dias sem ser enviada", hasDays: true, defaultDays: 5, defaultActive: true },
    ],
  },
  {
    id: "contracts",
    label: "Contratos",
    icon: ScrollText,
    iconColor: "text-blue-500",
    alerts: [
      { type: "contract_draft_stale", label: "Contrato em draft", description: "Se está em draft há X dias sem ser enviado", hasDays: true, defaultDays: 3, defaultActive: true },
      { type: "contract_expiring", label: "Contrato a expirar", description: "Alertar X dias antes de expirar", hasDays: true, defaultDays: 30, defaultActive: true },
      { type: "contract_expiring_urgent", label: "Contrato a expirar urgente", description: "Alerta vermelho X dias antes de expirar", hasDays: true, defaultDays: 7, defaultActive: true },
      { type: "contract_expired", label: "Contrato expirado", description: "Alertar quando o contrato já expirou", hasDays: false, defaultDays: null, defaultActive: true },
    ],
  },
  {
    id: "quotes",
    label: "Pedidos de Proposta",
    icon: ClipboardList,
    iconColor: "text-orange-500",
    alerts: [
      { type: "quote_stale", label: "Rascunho parado", description: "Se está em rascunho há X dias sem ser enviado", hasDays: true, defaultDays: 7, defaultActive: true },
      { type: "quote_pending_sent", label: "Enviado sem resposta", description: "Se foi enviado há X dias sem resposta do cliente", hasDays: true, defaultDays: 5, defaultActive: true },
      { type: "quote_no_value", label: "Sem valor definido", description: "Alertar quando o pedido não tem valor definido", hasDays: false, defaultDays: null, defaultActive: true },
    ],
  },
];

const NOTIFICATION_MODULES: ModuleDef[] = [
  {
    id: "portal_actions",
    label: "Ações do Portal Cliente",
    icon: Bell,
    iconColor: "text-primary",
    alerts: [
      { type: "client_signed_proposal", label: "Proposta assinada", description: "Quando o cliente assina uma proposta no portal", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "client_signed_contract", label: "Contrato assinado", description: "Quando o cliente assina um contrato no portal", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "client_accepted_quote", label: "Orçamento aceite", description: "Quando o cliente aceita um orçamento no portal", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "client_rejected_quote", label: "Orçamento rejeitado", description: "Quando o cliente rejeita um orçamento", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "client_rejected_proposal", label: "Proposta rejeitada", description: "Quando o cliente rejeita uma proposta", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "client_rejected_contract", label: "Contrato rejeitado", description: "Quando o cliente rejeita um contrato", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "client_question", label: "Dúvida do cliente", description: "Quando o cliente envia uma dúvida sobre um documento", hasDays: false, defaultDays: null, defaultActive: true },
    ],
  },
  {
    id: "portal_views",
    label: "Visualizações do Portal",
    icon: Bell,
    iconColor: "text-muted-foreground",
    alerts: [
      { type: "client_viewed_proposal", label: "Proposta visualizada", description: "Quando o cliente abre uma proposta no portal", hasDays: false, defaultDays: null, defaultActive: false },
      { type: "client_viewed_quote", label: "Orçamento visualizado", description: "Quando o cliente abre um orçamento no portal", hasDays: false, defaultDays: null, defaultActive: false },
      { type: "client_viewed_contract", label: "Contrato visualizado", description: "Quando o cliente abre um contrato no portal", hasDays: false, defaultDays: null, defaultActive: false },
    ],
  },
  {
    id: "email_notifications",
    label: "Emails Automáticos",
    icon: Mail,
    iconColor: "text-blue-500",
    alerts: [
      { type: "email_sent", label: "Email enviado", description: "Notificação quando um email automático é enviado com sucesso", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "email_error", label: "Erro de email", description: "Notificação quando um email automático falha", hasDays: false, defaultDays: null, defaultActive: true },
      { type: "email_suggestion", label: "Sugestão de email", description: "Quando um template semi-automático é sugerido", hasDays: false, defaultDays: null, defaultActive: true },
    ],
  },
  {
    id: "scheduling",
    label: "Agendamento",
    icon: Calendar,
    iconColor: "text-green-500",
    alerts: [
      { type: "schedule_invite", label: "Convite de agendamento", description: "Quando recebe um convite para um evento", hasDays: false, defaultDays: null, defaultActive: true },
    ],
  },
];

const ALL_ALERTS = ALERT_MODULES.flatMap((m) => m.alerts);
const ALL_NOTIFICATIONS = NOTIFICATION_MODULES.flatMap((m) => m.alerts);

interface SettingState {
  is_active: boolean;
  days_threshold: number | null;
  id?: string;
}

interface SettingsMap {
  [alertType: string]: SettingState;
}

export default function AlertSettings() {
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const [alertState, setAlertState] = useState<SettingsMap>({});
  const [notifState, setNotifState] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>(
    Object.fromEntries([...ALERT_MODULES, ...NOTIFICATION_MODULES].map((m) => [m.id, true]))
  );

  const loadSettings = useCallback(async () => {
    if (!activeCompany?.id) return;
    setLoading(true);

    const { data } = await supabase
      .from("alert_settings")
      .select("id, organization_id, alert_type, kind, is_active, days_threshold")
      .eq("organization_id", activeCompany.id);

    // Build alert state from defaults + DB
    const newAlertState: SettingsMap = {};
    for (const alert of ALL_ALERTS) {
      newAlertState[alert.type] = { is_active: alert.defaultActive, days_threshold: alert.defaultDays };
    }

    // Build notification state from defaults + DB
    const newNotifState: SettingsMap = {};
    for (const notif of ALL_NOTIFICATIONS) {
      newNotifState[notif.type] = { is_active: notif.defaultActive, days_threshold: notif.defaultDays };
    }

    // Override with DB values, separated by kind
    for (const row of data || []) {
      const kind = (row as any).kind || "alert";
      if (kind === "alert" && newAlertState[row.alert_type] !== undefined) {
        newAlertState[row.alert_type] = {
          is_active: row.is_active,
          days_threshold: row.days_threshold,
          id: row.id,
        };
      } else if (kind === "notification" && newNotifState[row.alert_type] !== undefined) {
        newNotifState[row.alert_type] = {
          is_active: row.is_active,
          days_threshold: row.days_threshold,
          id: row.id,
        };
      }
    }

    setAlertState(newAlertState);
    setNotifState(newNotifState);
    setLoading(false);
  }, [activeCompany?.id]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggle = (kind: "alert" | "notification", alertType: string, value: boolean) => {
    const setter = kind === "alert" ? setAlertState : setNotifState;
    setter((prev) => ({
      ...prev,
      [alertType]: { ...prev[alertType], is_active: value },
    }));
  };

  const handleDays = (kind: "alert" | "notification", alertType: string, value: number) => {
    const setter = kind === "alert" ? setAlertState : setNotifState;
    setter((prev) => ({
      ...prev,
      [alertType]: { ...prev[alertType], days_threshold: value },
    }));
  };

  const handleSave = async () => {
    if (!activeCompany?.id) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const alertRows = ALL_ALERTS.map((alert) => ({
        organization_id: activeCompany.id,
        alert_type: alert.type,
        kind: "alert",
        is_active: alertState[alert.type]?.is_active ?? alert.defaultActive,
        days_threshold: alertState[alert.type]?.days_threshold ?? alert.defaultDays,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }));

      const notifRows = ALL_NOTIFICATIONS.map((notif) => ({
        organization_id: activeCompany.id,
        alert_type: notif.type,
        kind: "notification",
        is_active: notifState[notif.type]?.is_active ?? notif.defaultActive,
        days_threshold: notifState[notif.type]?.days_threshold ?? notif.defaultDays,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("alert_settings")
        .upsert([...alertRows, ...notifRows], { onConflict: "organization_id,alert_type,kind" });

      if (error) throw error;
      toast({ title: "Configurações guardadas com sucesso" });
      await loadSettings();
    } catch (err: any) {
      toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const newAlertState: SettingsMap = {};
    for (const alert of ALL_ALERTS) {
      newAlertState[alert.type] = {
        is_active: alert.defaultActive,
        days_threshold: alert.defaultDays,
        id: alertState[alert.type]?.id,
      };
    }
    const newNotifState: SettingsMap = {};
    for (const notif of ALL_NOTIFICATIONS) {
      newNotifState[notif.type] = {
        is_active: notif.defaultActive,
        days_threshold: notif.defaultDays,
        id: notifState[notif.type]?.id,
      };
    }
    setAlertState(newAlertState);
    setNotifState(newNotifState);
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  const renderModules = (modules: ModuleDef[], kind: "alert" | "notification", stateMap: SettingsMap) => (
    modules.map((mod) => {
      const Icon = mod.icon;
      const isOpen = openModules[mod.id] ?? true;
      return (
        <Collapsible
          key={mod.id}
          open={isOpen}
          onOpenChange={(val) => setOpenModules((prev) => ({ ...prev, [mod.id]: val }))}
        >
          <div className="rounded-lg border bg-card">
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full px-5 py-4 hover:bg-muted/50 transition-colors rounded-t-lg">
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${mod.iconColor}`} />
                  <span className="text-base font-semibold">{mod.label}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {mod.alerts.filter((a) => stateMap[a.type]?.is_active).length}/{mod.alerts.length} activos
                  </span>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t divide-y">
                {mod.alerts.map((alert) => {
                  const s = stateMap[alert.type] || { is_active: alert.defaultActive, days_threshold: alert.defaultDays };
                  return (
                    <div key={alert.type} className="flex items-center gap-4 px-5 py-3.5">
                      <Switch
                        checked={s.is_active}
                        onCheckedChange={(v) => handleToggle(kind, alert.type, v)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${!s.is_active ? "text-muted-foreground" : ""}`}>
                          {alert.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{alert.description}</p>
                      </div>
                      {alert.hasDays && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Input
                            type="number"
                            min={1}
                            className="w-20 h-8 text-center"
                            value={s.days_threshold ?? ""}
                            onChange={(e) => handleDays(kind, alert.type, parseInt(e.target.value) || 1)}
                            disabled={!s.is_active}
                          />
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">dias</Label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      );
    })
  );

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Definições de Alertas e Notificações</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure os tempos e condições dos alertas automáticos e notificações para cada módulo
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Repor padrão
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              Guardar
            </Button>
          </div>
        </div>

        {/* Alerts Section */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-amber-500" />
            Alertas
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Alertas aparecem como banners nos módulos respectivos, sinalizando estados que requerem atenção.
          </p>
          <div className="space-y-4">
            {renderModules(ALERT_MODULES, "alert", alertState)}
          </div>
        </div>

        {/* Notifications Section */}
        <div className="pt-4 border-t">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notificações
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Notificações aparecem no sino (🔔) e informam sobre eventos e ações realizadas.
          </p>
          <div className="space-y-4">
            {renderModules(NOTIFICATION_MODULES, "notification", notifState)}
          </div>
        </div>

        {/* Bottom save */}
        <div className="flex justify-end gap-2 pb-8">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Repor padrão
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Guardar
          </Button>
        </div>
      </div>
    </>
  );
}
