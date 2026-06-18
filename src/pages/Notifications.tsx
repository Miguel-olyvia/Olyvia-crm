import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedAuthUser } from "@/lib/cachedAuth";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCheck, Filter, Bell, Phone, Send, RefreshCw, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveOrgSubtree } from "@/lib/orgSubtree";
import { appendTimestamp, getNotificationRoute, notificationPriorityColors, sortNotificationsByPriority } from "@/lib/notifications/notificationPresentation";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  organization_id: string | null;
  priority: string;
  is_read: boolean;
  action_type: string | null;
  action_config: any;
  link: string | null;
  created_at: string;
}

const entityLabels: Record<string, string> = {
  proposal: "Propostas",
  client: "Clientes",
  contract: "Contratos",
  contact: "Contactos",
  email_tracking: "Email",
  lead: "Leads",
  quote: "Pedidos",
};

const actionLabels: Record<string, { label: string; icon: typeof Send }> = {
  send_followup: { label: "Enviar follow-up", icon: Send },
  renew_validity: { label: "Renovar validade", icon: RefreshCw },
  send_renewal: { label: "Enviar renovação", icon: Send },
  call_now: { label: "Ligar agora", icon: Phone },
};

const LIMIT = 100;

export default function Notifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [filterModule, setFilterModule] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterRead, setFilterRead] = useState("unread");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setHasError(false);
    const { data: user } = await getCachedAuthUser();
    if (!user.user) { setLoading(false); return; }

    let orgIds: string[] = [];
    if (activeCompany?.id) {
      orgIds = await resolveOrgSubtree(activeCompany.id);
    }

    let query = supabase
      .from("notifications")
      .select("id, type, title, message, entity_type, entity_id, organization_id, priority, is_read, action_type, action_config, link, created_at")
      .eq("user_id", user.user.id)
      .eq("kind", "notification")
      .eq("is_dismissed", false)
      .eq("is_resolved", false)
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    if (orgIds.length > 0) query = query.in("organization_id", orgIds);
    if (filterModule !== "all") query = query.eq("entity_type", filterModule);
    if (filterPriority !== "all") query = query.eq("priority", filterPriority);
    if (filterRead === "unread") query = query.eq("is_read", false);
    if (filterRead === "read") query = query.eq("is_read", true);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching notifications:", error);
      setHasError(true);
      setLoading(false);
      return;
    }
    setHasError(false);
    setNotifications((data || []).sort(sortNotificationsByPriority));
    setLoading(false);
  }, [filterModule, filterPriority, filterRead, activeCompany?.id]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("Error marking notification as read:", error);
      toast.error("Não foi possível marcar como lida.");
      return;
    }
    if (filterRead === "unread") {
      setNotifications(prev => prev.filter(n => n.id !== id));
    } else {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    }
  };

  const markAllAsRead = async () => {
    const { data: user } = await getCachedAuthUser();
    if (!user.user) return;

    const timestamp = new Date().toISOString();

    let orgIds: string[] = [];
    if (activeCompany?.id) {
      orgIds = await resolveOrgSubtree(activeCompany.id);
    }

    let updateQuery = supabase
      .from("notifications")
      .update({ is_read: true, read_at: timestamp })
      .eq("user_id", user.user.id)
      .eq("is_read", false)
      .eq("is_resolved", false)
      .eq("is_dismissed", false)
      .eq("kind", "notification");

    if (orgIds.length > 0) updateQuery = updateQuery.in("organization_id", orgIds);

    const { error } = await updateQuery;
    if (error) {
      console.error("Error marking all notifications as read:", error);
      toast.error("Não foi possível marcar todas como lidas.");
      return;
    }

    // Optimistic update — avoid wiping the list when on "unread" tab
    if (filterRead === "unread") {
      setNotifications([]);
    } else {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const handleAction = async (n: NotificationRow) => {
    await markAsRead(n.id);
    const route = await getNotificationRoute(n);
    if (route) navigate(appendTimestamp(route), { replace: true });
  };

  return (
    <>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Notificações</h1>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-3 flex-wrap">
            <Select value={filterModule} onValueChange={setFilterModule}>
              <SelectTrigger className="w-40"><Filter className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os módulos</SelectItem>
                {Object.entries(entityLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas prioridades</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRead} onValueChange={setFilterRead}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="unread">Não lidas</SelectItem>
                <SelectItem value="read">Lidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <CheckCheck className="w-4 h-4 mr-1" /> Marcar todas como lidas
          </Button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">A carregar...</div>
          ) : hasError ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive/60" />
              <p className="mb-3">Erro ao carregar notificações.</p>
              <Button size="sm" variant="outline" onClick={fetchNotifications}>Tentar novamente</Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Sem notificações</p>
            </div>
          ) : (
            <>
              {notifications.map((n) => {
                const action = n.action_type ? actionLabels[n.action_type] : null;
                const ActionIcon = action?.icon;
                return (
                  <div
                    key={n.id}
                    onClick={() => { void handleAction(n); }}
                    className={cn(
                      "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors hover:bg-accent",
                      !n.is_read && "bg-primary/5 border-primary/20"
                    )}
                  >
                    <Badge className={cn("shrink-0 text-[10px] mt-0.5", notificationPriorityColors[n.priority] || notificationPriorityColors.low)}>
                      {n.priority}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm", !n.is_read && "font-medium")}>{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(n.id); }}
                        className="text-[11px] text-muted-foreground/70 font-mono mt-0.5 hover:text-primary cursor-pointer truncate max-w-xs text-left"
                        title="Clique para copiar"
                      >
                        ID: {n.id}
                      </button>
                      <div className="flex items-center gap-2 mt-1.5">
                        {n.entity_type && (
                          <Badge variant="outline" className="text-[10px] h-5">
                            {entityLabels[n.entity_type] || n.entity_type}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: pt })}
                        </span>
                      </div>
                    </div>
                    {action && (
                      <Button
                        variant="outline" size="sm" className="shrink-0 h-8 text-xs"
                        onClick={(e) => { e.stopPropagation(); handleAction(n); }}
                      >
                        {ActionIcon && <ActionIcon className="w-3 h-3 mr-1" />}
                        {action.label}
                      </Button>
                    )}
                  </div>
                );
              })}
              {notifications.length === LIMIT && (
                <p className="text-center text-xs text-muted-foreground py-3">
                  A mostrar as {LIMIT} notificações mais recentes.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
