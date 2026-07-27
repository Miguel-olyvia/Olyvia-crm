import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCachedAuthUser } from '@/lib/cachedAuth';
import { resolveOrgSubtree } from '@/lib/orgSubtree';

export interface ModuleAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  entity_id: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  action_type: string | null;
  action_config: Record<string, any> | null;
  created_at: string;
}

/**
 * Fetches the raw (unenriched) notifications rows for a given module/entityType.
 * This is the shared, cacheable input consumed by useModuleAlerts. It is kept
 * free of any per-module enrichment so react-query can serve overlapping
 * fetches (same org + entityType) from cache instead of firing independent
 * requests.
 */
async function fetchRawModuleAlerts(entityType: string, activeOrgId?: string | null): Promise<ModuleAlert[]> {
  const { data: user } = await getCachedAuthUser();
  if (!user.user) return [];

  let orgIds: string[] = [];
  if (activeOrgId) {
    orgIds = await resolveOrgSubtree(activeOrgId);
  }

  let query = supabase
    .from('notifications')
    .select('id, type, title, message, entity_id, priority, action_type, action_config, created_at')
    .eq('user_id', user.user.id)
    .eq('is_dismissed', false)
    .eq('is_resolved', false)
    .eq('kind', 'alert')
    .eq('entity_type', entityType)
    .order('created_at', { ascending: false })
    .limit(20);

  if (orgIds.length > 0) {
    query = query.in('organization_id', orgIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as ModuleAlert[]) || [];
}

export function useModuleAlerts(entityType: string, activeOrgId?: string | null) {
  const [enrichedAlerts, setEnrichedAlerts] = useState<ModuleAlert[]>([]);
  const [enriching, setEnriching] = useState(true);

  const {
    data: rawAlerts,
    isLoading: isRawLoading,
    refetch,
  } = useQuery({
    queryKey: ['notifications', 'alert', entityType, activeOrgId ?? null],
    queryFn: () => fetchRawModuleAlerts(entityType, activeOrgId),
  });

  // Enrich raw alerts with related contact/client/entity data. Kept as a
  // separate derive step from the cached raw fetch, since different modules
  // need different enrichment shapes from the same underlying notifications data.
  useEffect(() => {
    let cancelled = false;

    const enrich = async () => {
      setEnriching(true);
      try {
        let nextAlerts = rawAlerts ? [...rawAlerts] : [];

        if (entityType === 'contact' && nextAlerts.length > 0) {
          const alertRefs = Array.from(
            new Set(
              nextAlerts
                .flatMap((alert) => [alert.entity_id, alert.action_config?.contact_id, alert.action_config?.entity_id])
                .filter(Boolean)
            )
          ) as string[];

          if (alertRefs.length > 0) {
            // Fetch contacts and check if they've been converted to clients
            const { data: contactsById } = await supabase
              .from('anew_contacts')
              .select('id, entity_id, converted_to_client_id, status')
              .in('id', alertRefs);

            const { data: contactsByEntityId } = await supabase
              .from('anew_contacts')
              .select('id, entity_id, converted_to_client_id, status')
              .in('entity_id', alertRefs);

            const contactRows = [...(contactsById || []), ...(contactsByEntityId || [])];

            // Build set of converted/inactive contact IDs to exclude
            const excludedContactIds = new Set<string>();
            contactRows.forEach((contact) => {
              if (contact.converted_to_client_id || contact.status === 'inactive') {
                excludedContactIds.add(contact.id);
                if (contact.entity_id) excludedContactIds.add(contact.entity_id);
              }
            });

            // Filter out alerts for converted contacts
            nextAlerts = nextAlerts.filter((alert) => {
              const ref = alert.action_config?.contact_id || alert.entity_id || alert.action_config?.entity_id;
              return !ref || !excludedContactIds.has(ref);
            });

            const contactEntityMap = new Map<string, string>();

            contactRows.forEach((contact) => {
              if (contact.id) contactEntityMap.set(contact.id, contact.entity_id);
              if (contact.entity_id) contactEntityMap.set(contact.entity_id, contact.entity_id);
            });

            const entityIds = Array.from(new Set(contactRows.map((contact) => contact.entity_id).filter(Boolean)));
            const entityNameMap = new Map<string, string>();

            if (entityIds.length > 0) {
              const { data: entities } = await supabase
                .from('anew_entities')
                .select('id, display_name')
                .in('id', entityIds);

              (entities || []).forEach((entity) => entityNameMap.set(entity.id, entity.display_name));
            }

            nextAlerts = nextAlerts.map((alert) => {
              if (!alert.type.startsWith('contact_no_contact_')) return alert;

              const alertRef = alert.action_config?.entity_id || alert.entity_id || alert.action_config?.contact_id;
              const contactEntityId = alertRef ? contactEntityMap.get(alertRef) : null;
              const contactName = contactEntityId ? entityNameMap.get(contactEntityId) : null;

              if (!contactName) return alert;

              const daysMatch = alert.type.match(/_(\d+)d$/);
              const days = daysMatch?.[1];
              const isFollowUpAlert = alert.type === 'contact_no_contact_7d';

              return {
                ...alert,
                title: days ? `${contactName} — sem interação há ${days} dias` : contactName,
                message: isFollowUpAlert
                  ? `Considere fazer follow-up com ${contactName}.`
                  : `${contactName} não é abordado há mais de ${days} dias.`,
              };
            });
          }
        }

        // Enrich client alerts (e.g. client_missing_nif) with entity names
        if (entityType === 'client' && nextAlerts.length > 0) {
          const clientAlertRefs = Array.from(
            new Set(
              nextAlerts
                .flatMap((a) => [a.entity_id, a.action_config?.entity_id, a.action_config?.client_id])
                .filter(Boolean)
            )
          ) as string[];

          if (clientAlertRefs.length > 0) {
            // Resolve client -> entity_id
            const { data: clientsById } = await supabase
              .from('anew_clients')
              .select('id, entity_id')
              .in('id', clientAlertRefs);

            const clientEntityMap = new Map<string, string>();
            (clientsById || []).forEach((c) => {
              if (c.id && c.entity_id) clientEntityMap.set(c.id, c.entity_id);
            });

            const entityIds = Array.from(new Set([...clientEntityMap.values()]));
            const clientNameMap = new Map<string, string>();

            if (entityIds.length > 0) {
              const { data: entities } = await supabase
                .from('anew_entities')
                .select('id, display_name')
                .in('id', entityIds);

              (entities || []).forEach((e) => clientNameMap.set(e.id, e.display_name));
            }

            nextAlerts = nextAlerts.map((alert) => {
              const ref = alert.entity_id || alert.action_config?.client_id;
              const entityId = ref ? clientEntityMap.get(ref) : null;
              const name = entityId ? clientNameMap.get(entityId) : null;
              if (!name) return alert;

              if (alert.type === 'client_missing_nif') {
                return { ...alert, title: `${name} — sem NIF`, message: `${name} não tem informação fiscal preenchida.` };
              }
              if (alert.type.startsWith('client_no_contact')) {
                const daysMatch = alert.type.match(/_(\d+)d$/);
                const days = daysMatch?.[1];
                return { ...alert, title: days ? `${name} — sem contacto há ${days} dias` : `${name} — sem contacto`, message: `${name} não é contactado há mais de ${days || '?'} dias.` };
              }
              return alert;
            });
          }
        }

        if (!cancelled) {
          setEnrichedAlerts(nextAlerts);
        }
      } catch (e) {
        console.error('Error enriching module alerts:', e);
      } finally {
        if (!cancelled) {
          setEnriching(false);
        }
      }
    };

    enrich();

    return () => {
      cancelled = true;
    };
  }, [rawAlerts, entityType]);

  const dismissAlert = useCallback(async (alertId: string) => {
    await supabase
      .from('notifications')
      .update({ is_dismissed: true })
      .eq('id', alertId);
    setEnrichedAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const loading = isRawLoading || enriching;

  return {
    alerts: enrichedAlerts,
    alertCount: enrichedAlerts.length,
    loading,
    dismissAlert,
    refetch,
  };
}
