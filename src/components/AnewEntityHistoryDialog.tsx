import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  History,
  Edit,
  Plus,
  ArrowRight,
  RefreshCw,
  UserCheck,
  UserPlus,
  UserMinus,
  ShieldCheck,
  MapPin,
  MapPinOff,
  GitBranch,
  Building,
  Building2,
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

interface UnifiedEntry {
  id: string;
  source: "entity" | "changelog";
  action: string;
  category: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  description: string | null;
  change_reason: string | null;
  changed_by: string | null;
  changed_at: string;
  changer_name: string | null;
  changer_avatar: string | null;
  metadata: Record<string, any> | null;
}

interface AnewEntityHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
  entityType?: "person" | "organization";
}

// Action config: icon, color, translation key, category
const actionConfig: Record<string, { icon: any; color: string; tKey: string; category: string }> = {
  // Entity-level (anew_entity_history)
  created:              { icon: Plus,        color: "bg-green-600",   tKey: "common.entity.created",              category: "entity" },
  updated:              { icon: Edit,        color: "bg-blue-500",    tKey: "common.entity.updated",              category: "entity" },
  status_changed:       { icon: RefreshCw,   color: "bg-orange-500",  tKey: "common.entity.statusChanged",        category: "entity" },
  role_added:           { icon: UserCheck,   color: "bg-purple-500",  tKey: "common.entity.roleAdded",            category: "entity" },
  role_removed:         { icon: UserCheck,   color: "bg-destructive", tKey: "common.entity.roleRemoved",          category: "entity" },
  // Members (entity_change_log)
  member_added:         { icon: UserPlus,    color: "bg-green-500",   tKey: "common.entity.memberAdded",          category: "member" },
  member_removed:       { icon: UserMinus,   color: "bg-red-500",     tKey: "common.entity.memberRemoved",        category: "member" },
  member_role_changed:  { icon: ShieldCheck, color: "bg-blue-500",    tKey: "common.entity.memberRoleChanged",    category: "member" },
  member_status_changed:{ icon: RefreshCw,   color: "bg-orange-500",  tKey: "common.entity.memberStatusChanged",  category: "member" },
  // Addresses
  address_added:        { icon: MapPin,      color: "bg-emerald-500", tKey: "common.entity.addressAdded",         category: "address" },
  address_removed:      { icon: MapPinOff,   color: "bg-red-500",     tKey: "common.entity.addressRemoved",       category: "address" },
  address_updated:      { icon: MapPin,      color: "bg-blue-500",    tKey: "common.entity.addressUpdated",       category: "address" },
  address_deactivated:  { icon: MapPinOff,   color: "bg-amber-500",   tKey: "common.entity.addressDeactivated",   category: "address" },
  // Hierarchy
  child_added:          { icon: Building,    color: "bg-purple-500",  tKey: "common.entity.childAdded",           category: "hierarchy" },
  child_removed:        { icon: Building,    color: "bg-red-500",     tKey: "common.entity.childRemoved",         category: "hierarchy" },
  parent_added:         { icon: GitBranch,   color: "bg-purple-500",  tKey: "common.entity.parentAdded",          category: "hierarchy" },
  parent_removed:       { icon: GitBranch,   color: "bg-red-500",     tKey: "common.entity.parentRemoved",        category: "hierarchy" },
};

const categoryConfig: Record<string, { icon: any; tKey: string }> = {
  entity:    { icon: Building2,  tKey: "common.entity.entity" },
  member:    { icon: UserPlus,   tKey: "common.entity.members" },
  address:   { icon: MapPin,     tKey: "common.entity.addresses" },
  hierarchy: { icon: GitBranch,  tKey: "common.entity.hierarchy" },
};

const fieldTKeys: Record<string, string> = {
  display_name: "common.name",
  status: "common.status",
  type: "common.type",
};

export function AnewEntityHistoryDialog({
  open,
  onOpenChange,
  entityId,
  entityName,
  entityType,
}: AnewEntityHistoryDialogProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<UnifiedEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && entityId) loadHistory();
  }, [open, entityId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      // 1. Fetch entity-level history
      const { data: entityData } = await (supabase as any)
        .from("anew_entity_history")
        .select("*")
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(100);

      // 2. Fetch changelog (roles, members, addresses, hierarchy)
      let changelogData: any[] = [];
      {
        const { data: clData } = await (supabase as any)
          .from("entity_change_log")
          .select("*")
          .eq("entity_id", entityId)
          .order("changed_at", { ascending: false })
          .limit(200);
        changelogData = clData || [];
      }

      // 3. Collect all changer IDs from both sources
      const allChangerIds = [
        ...(entityData || []).map((d: any) => d.changed_by),
        ...changelogData.map((d: any) => d.changed_by),
      ].filter(Boolean);
      const changerIds = [...new Set(allChangerIds)];
      let changerMap: Record<string, { name: string; avatar: string | null }> = {};
      if (changerIds.length > 0) {
        const { data: users } = await (supabase as any)
          .from("anew_users")
          .select("id, name, auth_user_id")
          .or(changerIds.map(id => `id.eq.${id},auth_user_id.eq.${id}`).join(","));
        if (users) {
          for (const u of users) {
            changerMap[u.id] = { name: u.name, avatar: null };
            if (u.auth_user_id) {
              changerMap[u.auth_user_id] = { name: u.name, avatar: null };
            }
          }
        }
      }

      // 4. Normalize entity history entries
      const entityEntries: UnifiedEntry[] = (entityData || []).map((d: any) => {
        const cfg = actionConfig[d.change_type] || actionConfig.updated;
        return {
          id: d.id,
          source: "entity" as const,
          action: d.change_type,
          category: cfg?.category || "entity",
          field_name: d.field_name,
          old_value: d.old_value,
          new_value: d.new_value,
          description: null,
          change_reason: null,
          changed_by: d.changed_by,
          changed_at: d.created_at,
          changer_name: changerMap[d.changed_by]?.name || null,
          changer_avatar: changerMap[d.changed_by]?.avatar || null,
          metadata: d.metadata,
        };
      });

      // 5. Normalize changelog entries  
      const clEntries: UnifiedEntry[] = changelogData.map((d: any) => {
        const cfg = actionConfig[d.action];
        const meta = d.metadata || {};
        let description: string | null = null;

        switch (d.action) {
          case "member_added":
            description = `${d.new_value || ""}${meta.role_name ? ` (${meta.role_name})` : ""}`;
            break;
          case "member_removed":
            description = `${d.old_value || ""}${meta.role_name ? ` (${meta.role_name})` : ""}`;
            break;
          case "member_role_changed":
          case "member_status_changed":
            description = meta.user_name || d.new_value || d.old_value || "";
            break;
          case "address_added":
          case "address_removed":
          case "address_deactivated":
            description = d.new_value || d.old_value || "";
            break;
          case "address_updated":
            description = meta.address_label || d.new_value || "";
            break;
          case "child_added":
          case "child_removed":
          case "parent_added":
          case "parent_removed":
            description = d.new_value || d.old_value || "";
            break;
          default:
            description = d.new_value || d.old_value || "";
        }

        return {
          id: d.id,
          source: "changelog" as const,
          action: d.action,
          category: cfg?.category || "other",
          field_name: d.field_changed,
          old_value: d.old_value,
          new_value: d.new_value,
          description,
          change_reason: d.change_reason,
          changed_by: d.changed_by,
          changed_at: d.changed_at,
          changer_name: changerMap[d.changed_by]?.name || null,
          changer_avatar: changerMap[d.changed_by]?.avatar || null,
          metadata: d.metadata,
        };
      });

      // 6. Deduplicate: remove 'created' from changelog if already present in entity history
      const entityCreatedExists = entityEntries.some(e => e.action === "created");
      const dedupedClEntries = entityCreatedExists 
        ? clEntries.filter(e => e.action !== "created")
        : clEntries;

      // 7. Merge and sort by date descending
      const all = [...entityEntries, ...dedupedClEntries].sort(
        (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
      );

      setEntries(all);
    } catch (err) {
      console.error("Error loading entity history:", err);
    } finally {
      setLoading(false);
    }
  };

  const getActionConfig = (action: string) => {
    const cfg = actionConfig[action] || { icon: Edit, color: "bg-muted", tKey: action, category: "entity" };
    return { ...cfg, label: t(cfg.tKey) };
  };

  const TypeIcon = entityType === "organization" ? Building2 : UserCheck;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <History className="h-4 w-4 text-primary" />
            </div>
            <div>
              <span>{t("common.changeHistory")}</span>
              <p className="text-xs font-normal text-muted-foreground mt-0.5 flex items-center gap-1">
                <TypeIcon className="h-3 w-3" />
                {entityName}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[450px] pr-4">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t("common.noHistory")}</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
              <div className="space-y-3">
                {entries.map((entry) => {
                  const config = getActionConfig(entry.action);
                  const Icon = config.icon;
                  const catInfo = categoryConfig[entry.category];

                  return (
                    <div key={`${entry.source}-${entry.id}`} className="relative flex gap-3 pl-2">
                      <div
                        className={cn(
                          "relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                          config.color
                        )}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 bg-muted/50 rounded-lg p-3 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={entry.changer_avatar || undefined} />
                              <AvatarFallback className="text-[10px]">
                                {entry.changer_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "S"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium truncate">
                              {entry.changer_name || t("common.system")}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(entry.changed_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {config.label}
                            </Badge>
                            {catInfo && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <catInfo.icon className="h-3 w-3" />
                                {t(catInfo.tKey)}
                              </Badge>
                            )}
                          </div>

                          {/* Entity-level field change */}
                          {entry.source === "entity" && entry.field_name && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {t("common.field")}:{" "}
                              <span className="font-medium">
                                {t(fieldTKeys[entry.field_name] || entry.field_name)}
                              </span>
                            </div>
                          )}

                          {/* Entity created description */}
                          {entry.source === "entity" && entry.action === "created" && entry.new_value && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {entry.new_value.replace(/^(organization|person):/, "")}
                            </p>
                          )}

                          {/* Changelog description */}
                          {entry.source === "changelog" && entry.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {entry.description}
                            </p>
                          )}

                          {/* Old → New values */}
                          {entry.old_value && entry.new_value && (
                            <div className="flex items-center gap-2 text-sm mt-1">
                              <span className="text-destructive line-through truncate max-w-[120px]">
                                {entry.old_value}
                              </span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-green-600 dark:text-green-400 truncate max-w-[120px]">
                                {entry.new_value}
                              </span>
                            </div>
                          )}

                          {/* Change reason */}
                          {entry.change_reason && (
                            <div className="text-sm text-muted-foreground mt-2 p-2 bg-background rounded border-l-2 border-primary">
                              <span className="text-xs text-muted-foreground">{t("common.entity.reason")}:</span>
                              <p className="mt-0.5">{entry.change_reason}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
