import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Loader2, MapPin, Building2, History, Edit, Plus, RefreshCw, ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface UserHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

interface AddressHistoryEntry {
  id: string;
  address_id: string;
  address_type: string | null;
  is_primary: boolean | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string | null;
  address: {
    street: string;
    number: string;
    postal_code: string;
    city: string;
    country: string;
  } | null;
}

interface MembershipHistoryEntry {
  id: string;
  organization_id: string;
  relationship_type: string;
  role_id: string | null;
  role_name: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  organization?: {
    name: string;
    type: string;
  };
}

interface EntityHistoryEntry {
  id: string;
  change_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changer_name?: string;
  created_at: string;
}

const changeTypeIcons: Record<string, { icon: any; color: string; tKey: string }> = {
  created: { icon: Plus, color: "bg-green-600", tKey: "common.entity.created" },
  updated: { icon: Edit, color: "bg-blue-500", tKey: "common.entity.updated" },
  status_changed: { icon: RefreshCw, color: "bg-orange-500", tKey: "common.entity.statusChanged" },
};

const fieldTKeys: Record<string, string> = {
  display_name: "common.name",
  status: "common.status",
  type: "common.type",
};

export default function UserHistoryDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: UserHistoryDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [addressHistory, setAddressHistory] = useState<AddressHistoryEntry[]>([]);
  const [membershipHistory, setMembershipHistory] = useState<MembershipHistoryEntry[]>([]);
  const [entityHistory, setEntityHistory] = useState<EntityHistoryEntry[]>([]);

  useEffect(() => {
    if (open && userId) {
      loadHistory();
    }
  }, [open, userId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      // First get entity_id for this user
      const { data: userData } = await (supabase as any)
        .from("anew_users")
        .select("entity_id")
        .eq("id", userId)
        .maybeSingle();

      const entityId = userData?.entity_id;

      // Load address history from entity table
      if (entityId) {
        const { data: addressData } = await (supabase as any)
          .from("anew_entity_addresses")
          .select(`
            id,
            address_id,
            address_type,
            is_primary,
            valid_from,
            valid_to,
            created_at,
            anew_addresses (
              street,
              number,
              postal_code,
              city,
              country
            )
          `)
          .eq("entity_id", entityId)
          .order("created_at", { ascending: false });

        setAddressHistory(
          (addressData || []).map((item: any) => ({
            id: item.id,
            address_id: item.address_id,
            address_type: item.address_type,
            is_primary: item.is_primary,
            valid_from: item.valid_from,
            valid_to: item.valid_to,
            created_at: item.created_at,
            address: item.anew_addresses,
          }))
        );

        // Load entity history
        const { data: historyData } = await (supabase as any)
          .from("anew_entity_history")
          .select("*")
          .eq("entity_id", entityId)
          .order("created_at", { ascending: false })
          .limit(50);

        // Resolve changer names
        const changerIds = [...new Set((historyData || []).map((d: any) => d.changed_by).filter(Boolean))];
        let changerMap: Record<string, string> = {};
        if (changerIds.length > 0) {
          const { data: users } = await (supabase as any)
            .from("anew_users")
            .select("id, name")
            .in("id", changerIds);
          if (users) {
            changerMap = Object.fromEntries(users.map((u: any) => [u.id, u.name]));
          }
        }

        setEntityHistory(
          (historyData || []).map((d: any) => ({
            ...d,
            changer_name: changerMap[d.changed_by] || null,
          }))
        );
      } else {
        // Fallback to old table if no entity_id
        const { data: addressData } = await (supabase as any)
          .from("anew_entity_addresses")
          .select(`
            id, address_id, address_type, is_primary, valid_from, valid_to, created_at,
            anew_addresses:anew_addresses!anew_entity_addresses_address_id_fkey ( street, number, postal_code, city, country )
          `)
          .eq("entity_id", userId)
          .order("created_at", { ascending: false });

        setAddressHistory(
          (addressData || []).map((item: any) => ({
            id: item.id,
            address_id: item.address_id,
            address_type: item.address_type,
            is_primary: item.is_primary,
            valid_from: item.valid_from,
            valid_to: item.valid_to,
            created_at: item.created_at,
            address: item.anew_addresses,
          }))
        );
      }

      // Load membership history (always from memberships table)
      const { data: membershipData } = await supabase
        .from("anew_memberships")
        .select(`
          id, organization_id, relationship_type, role_id, status,
          start_date, end_date, created_at,
          anew_organizations ( name, type ),
          anew_roles!fk_membership_role ( name )
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      setMembershipHistory(
        (membershipData || []).map((item: any) => ({
          id: item.id,
          organization_id: item.organization_id,
          relationship_type: item.relationship_type,
          role_id: item.role_id,
          role_name: item.anew_roles?.name || null,
          status: item.status,
          start_date: item.start_date,
          end_date: item.end_date,
          created_at: item.created_at,
          organization: item.anew_organizations,
        }))
      );
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: AddressHistoryEntry['address']) => {
    if (!address) return t('addresses.noAddress');
    return [address.street, address.number, address.postal_code, address.city, address.country]
      .filter(Boolean).join(', ') || t('addresses.noAddress');
  };

  const getAddressTypeLabel = (type: string | null) => {
    if (!type) return '-';
    const key = `addresses.types.${type}`;
    const translated = t(key);
    return translated !== key ? translated : type;
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    try { return format(new Date(date), "dd/MM/yyyy"); } catch { return '-'; }
  };

  const isAddressActive = (entry: AddressHistoryEntry) => {
    return !entry.valid_to || new Date(entry.valid_to) > new Date();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('users.history.title', { name: userName })}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="entity" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="entity" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('common.history') || 'Histórico'}
              </TabsTrigger>
              <TabsTrigger value="addresses" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {t('addresses.title')}
              </TabsTrigger>
              <TabsTrigger value="organizations" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {t('organizations.title')}
              </TabsTrigger>
            </TabsList>

            {/* Entity History Tab */}
            <TabsContent value="entity" className="mt-4">
              {entityHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>{t('common.noHistory')}</p>
                </div>
              ) : (
                <ScrollArea className="h-[350px] pr-4">
                  <div className="relative">
                    <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
                    <div className="space-y-3">
                      {entityHistory.map((entry) => {
                        const cfg = changeTypeIcons[entry.change_type] || { icon: Edit, color: "bg-muted", tKey: entry.change_type };
                        const config = { ...cfg, label: t(cfg.tKey) };
                        const Icon = config.icon;
                        return (
                          <div key={entry.id} className="relative flex gap-3 pl-2">
                            <div className={cn(
                              "relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                              config.color
                            )}>
                              <Icon className="h-4 w-4 text-white" />
                            </div>
                            <div className="flex-1 bg-muted/50 rounded-lg p-3 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span className="text-sm font-medium truncate">
                                  {entry.changer_name || t('common.system')}
                                </span>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                                </span>
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {config.label}
                              </Badge>
                              {entry.field_name && (
                                <div className="text-sm text-muted-foreground mt-1">
                                  {t('common.field')}: <span className="font-medium">{t(fieldTKeys[entry.field_name] || entry.field_name)}</span>
                                </div>
                              )}
                              {(entry.old_value || entry.new_value) && (
                                <div className="flex items-center gap-2 text-sm mt-1">
                                  {entry.old_value && (
                                    <span className="text-destructive line-through truncate max-w-[120px]">{entry.old_value}</span>
                                  )}
                                  {entry.old_value && entry.new_value && (
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  )}
                                  {entry.new_value && (
                                    <span className="text-green-600 dark:text-green-400 truncate max-w-[120px]">{entry.new_value}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            {/* Addresses Tab */}
            <TabsContent value="addresses" className="mt-4">
              {addressHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('addresses.history.noHistory')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('addresses.history.address')}</TableHead>
                      <TableHead>{t('addresses.type')}</TableHead>
                      <TableHead>{t('addresses.history.validFrom')}</TableHead>
                      <TableHead>{t('addresses.history.validTo')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {addressHistory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium max-w-xs truncate">
                          {formatAddress(item.address)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getAddressTypeLabel(item.address_type)}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(item.valid_from)}</TableCell>
                        <TableCell>{formatDate(item.valid_to)}</TableCell>
                        <TableCell>
                          {isAddressActive(item) ? (
                            <Badge variant="default" className="bg-green-600">{t('common.active')}</Badge>
                          ) : (
                            <Badge variant="secondary">{t('addresses.history.expired')}</Badge>
                          )}
                          {item.is_primary && (
                            <Badge variant="outline" className="ml-1">{t('addresses.primary')}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Organizations Tab */}
            <TabsContent value="organizations" className="mt-4">
              {membershipHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('users.history.noMemberships')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('organizations.organization')}</TableHead>
                      <TableHead>{t('common.type')}</TableHead>
                      <TableHead>{t('users.history.role')}</TableHead>
                      <TableHead>{t('users.history.startDate')}</TableHead>
                      <TableHead>{t('users.history.endDate')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membershipHistory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.organization?.name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {item.organization?.type
                              ? t(`organizations.types.${item.organization.type}`) === `organizations.types.${item.organization.type}`
                                ? item.organization.type
                                : t(`organizations.types.${item.organization.type}`)
                              : '-'}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.role_name || '-'}</TableCell>
                        <TableCell>{formatDate(item.start_date || item.created_at)}</TableCell>
                        <TableCell>{formatDate(item.end_date)}</TableCell>
                        <TableCell>
                          {item.status === 'active' ? (
                            <Badge variant="default" className="bg-green-600">{t('common.active')}</Badge>
                          ) : (
                            <Badge variant="secondary">{t('common.inactive')}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
