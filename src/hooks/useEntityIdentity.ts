import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { resolveCurrentBusinessUserId } from '@/lib/identity/resolveBusinessUserId';

export interface EntityIdentity {
  entity_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  type: string;
  email: string | null;
  phone: string | null;
  phone_country_code: string | null;
  vat: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
}

// Postgrest sends .in() filters as part of the URL; arrays of thousands of
// UUIDs (e.g. a system_admin's org-wide contact/lead list) can exceed the
// server's URL length limit and fail silently. Chunk to stay well under it.
const ID_BATCH_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function selectInBatches<T>(
  ids: string[],
  runQuery: (batch: string[]) => Promise<{ data: T[] | null }>,
): Promise<T[]> {
  const results = await Promise.all(chunk(ids, ID_BATCH_SIZE).map(runQuery));
  return results.flatMap(r => r.data || []);
}

export function useEntityIdentity() {
  const [identityMap, setIdentityMap] = useState<Record<string, EntityIdentity>>({});
  const [loading, setLoading] = useState(false);

  const resolveEntities = useCallback(async (entityIds: string[]) => {
    const uniqueIds = [...new Set(entityIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return {};
    }

    // Filter out already-cached IDs to avoid redundant queries
    const uncachedIds = uniqueIds.filter(id => !(id in identityMap));
    if (uncachedIds.length === 0) {
      // All already cached — return existing map subset
      const map: Record<string, EntityIdentity> = {};
      uniqueIds.forEach(id => { if (identityMap[id]) map[id] = identityMap[id]; });
      return map;
    }

    setLoading(true);
    try {
      const [entities, emails, phones, fiscalLinks, entityAddresses] = await Promise.all([
        selectInBatches(uncachedIds, batch => supabase.from('anew_entities').select('id, display_name, first_name, last_name, type').in('id', batch)),
        selectInBatches(uncachedIds, batch => supabase.from('anew_entity_emails').select('entity_id, email, is_primary').in('entity_id', batch).eq('is_primary', true)),
        selectInBatches(uncachedIds, batch => supabase.from('anew_entity_phones').select('entity_id, phone_number, country_code, is_primary').in('entity_id', batch).eq('is_primary', true)),
        selectInBatches(uncachedIds, batch => (supabase as any).from('anew_entity_fiscal_entities').select('entity_id, fiscal_entity_id, is_primary').in('entity_id', batch).eq('is_primary', true).is('valid_to', null)) as Promise<any[]>,
        selectInBatches(uncachedIds, batch => supabase.from('anew_entity_addresses').select('entity_id, address_id, is_primary').in('entity_id', batch).eq('is_primary', true)) as Promise<any[]>,
      ]);

      const emailMap: Record<string, string> = {};
      emails.forEach(e => { emailMap[e.entity_id] = e.email; });

      const phoneMap: Record<string, { phone: string; code: string | null }> = {};
      phones.forEach(p => { phoneMap[p.entity_id] = { phone: p.phone_number, code: p.country_code }; });

      // Resolve addresses
      const addressMap: Record<string, { street: string | null; postal_code: string | null; city: string | null }> = {};
      if (entityAddresses.length > 0) {
        const addressIds = [...new Set(entityAddresses.map((ea: any) => ea.address_id).filter(Boolean))];
        if (addressIds.length > 0) {
          const addresses = await selectInBatches(addressIds, batch => supabase.from('anew_addresses').select('id, street, postal_code, city').in('id', batch));
          const addrLookup: Record<string, any> = {};
          (addresses || []).forEach((a: any) => { addrLookup[a.id] = a; });
          entityAddresses.forEach((ea: any) => {
            const addr = addrLookup[ea.address_id];
            if (addr) {
              addressMap[ea.entity_id] = { street: addr.street || null, postal_code: addr.postal_code || null, city: addr.city || null };
            }
          });
        }
      }

      // Resolve VAT: fetch fiscal_entities by IDs from the links
      const vatMap: Record<string, string> = {};
      if (fiscalLinks.length > 0) {
        const fiscalEntityIds = [...new Set(fiscalLinks.map((f: any) => f.fiscal_entity_id).filter(Boolean))];
        if (fiscalEntityIds.length > 0) {
          const fiscalEntities = await selectInBatches(fiscalEntityIds, batch => (supabase as any).from('fiscal_entities').select('id, nif').in('id', batch)) as any[];
          const nifMap: Record<string, string> = {};
          (fiscalEntities || []).forEach((fe: any) => { if (fe.nif) nifMap[fe.id] = fe.nif; });
          fiscalLinks.forEach((f: any) => {
            const nif = nifMap[f.fiscal_entity_id];
            if (nif) vatMap[f.entity_id] = nif;
          });
        }
      }

      const map: Record<string, EntityIdentity> = {};
      entities.forEach(entity => {
        map[entity.id] = {
          entity_id: entity.id,
          display_name: entity.display_name || '',
          first_name: (entity as any).first_name || null,
          last_name: (entity as any).last_name || null,
          type: entity.type,
          email: emailMap[entity.id] || null,
          phone: phoneMap[entity.id]?.phone || null,
          phone_country_code: phoneMap[entity.id]?.code || null,
          vat: vatMap[entity.id] || null,
          address: addressMap[entity.id]?.street || null,
          postal_code: addressMap[entity.id]?.postal_code || null,
          city: addressMap[entity.id]?.city || null,
        };
      });

      setIdentityMap(prev => ({ ...prev, ...map }));
      return map;
    } catch (error) {
      console.error('Error resolving entity identities:', error);
      return {};
    } finally {
      setLoading(false);
    }
  }, [identityMap]);

  const getIdentity = useCallback((entityId: string | null | undefined): EntityIdentity | null => {
    if (!entityId) return null;
    return identityMap[entityId] || null;
  }, [identityMap]);

  return { identityMap, resolveEntities, getIdentity, loading };
}

export async function resolveEntityByIdentity(params: {
  email?: string | null;
  phone?: string | null;
  vat?: string | null;
}): Promise<string | null> {
  const { email, phone, vat } = params;

  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedPhone = phone?.trim().replace(/\s+/g, '');
  const normalizedVat = vat?.trim().toUpperCase();

  // Run all lookups in parallel for speed
  const [emailResult, phoneResult, vatResult] = await Promise.all([
    normalizedEmail
      ? supabase
          .from('anew_entity_emails')
          .select('entity_id')
          .ilike('email', normalizedEmail)
          .limit(1)
          .maybeSingle()
          .then(r => r.data?.entity_id || null)
      : Promise.resolve(null),
    normalizedPhone
      ? supabase
          .from('anew_entity_phones')
          .select('entity_id')
          .eq('phone_number', normalizedPhone)
          .limit(1)
          .maybeSingle()
          .then(r => r.data?.entity_id || null)
      : Promise.resolve(null),
    normalizedVat
      ? (supabase as any)
          .from('fiscal_entities')
          .select('id')
          .eq('nif', normalizedVat)
          .limit(1)
          .maybeSingle()
          .then(async (r: any) => {
            if (!r.data?.id) return null;
            const { data: link } = await supabase
              .from('anew_entity_fiscal_entities')
              .select('entity_id')
              .eq('fiscal_entity_id', r.data.id)
              .eq('is_primary', true)
              .limit(1)
              .maybeSingle();
            return link?.entity_id || null;
          })
      : Promise.resolve(null),
  ]);

  // Priority: email > phone > vat
  return emailResult || phoneResult || vatResult || null;
}

/**
 * Validate that a resolved entity is coherent with the identity data being submitted.
 *
 * Compares the candidate entity's stored canonical fields (display_name, primary email,
 * primary phone, primary VAT) against the new lead's submitted values.
 *
 * Returns:
 *  - level: 'full'    → at least 2 strong signals match (or 1 strong + name)
 *  - level: 'partial' → exactly 1 signal matches (warn the user)
 *  - level: 'none'    → nothing matches (BLOCK reuse, force new entity)
 *  - matches: per-field breakdown for UI/debug
 *
 * Strong signals: email, phone, vat. Name alone never qualifies as "full".
 */
export async function validateEntityCoherence(
  entityId: string,
  candidate: { name?: string | null; email?: string | null; phone?: string | null; vat?: string | null }
): Promise<{
  level: 'full' | 'partial' | 'none';
  matches: { name: boolean; email: boolean; phone: boolean; vat: boolean };
  storedIdentity: { name: string | null; email: string | null; phone: string | null; vat: string | null };
}> {
  const norm = (v?: string | null) => (v ? v.trim().toLowerCase().replace(/\s+/g, '') : '');
  const normName = (v?: string | null) => (v ? v.trim().toLowerCase().replace(/\s+/g, ' ') : '');

  const [entityRes, emailsRes, phonesRes, fiscalLinksRes] = await Promise.all([
    supabase.from('anew_entities').select('display_name, first_name, last_name').eq('id', entityId).maybeSingle(),
    supabase.from('anew_entity_emails').select('email, is_primary').eq('entity_id', entityId).eq('is_primary', true).limit(1),
    supabase.from('anew_entity_phones').select('phone_number, is_primary').eq('entity_id', entityId).eq('is_primary', true).limit(1),
    (supabase as any).from('anew_entity_fiscal_entities').select('fiscal_entity_id').eq('entity_id', entityId).eq('is_primary', true).is('valid_to', null).limit(1),
  ]);

  const storedName = (entityRes.data as any)?.display_name || null;
  const storedEmail = (emailsRes.data?.[0] as any)?.email || null;
  const storedPhone = (phonesRes.data?.[0] as any)?.phone_number || null;
  let storedVat: string | null = null;
  const fiscalId = (fiscalLinksRes.data?.[0] as any)?.fiscal_entity_id;
  if (fiscalId) {
    const { data: fe } = await (supabase as any).from('fiscal_entities').select('nif').eq('id', fiscalId).maybeSingle();
    storedVat = fe?.nif || null;
  }

  const matches = {
    name: !!candidate.name && !!storedName && normName(candidate.name) === normName(storedName),
    email: !!candidate.email && !!storedEmail && norm(candidate.email) === norm(storedEmail),
    phone: !!candidate.phone && !!storedPhone && norm(candidate.phone) === norm(storedPhone),
    vat: !!candidate.vat && !!storedVat && norm(candidate.vat) === norm(storedVat),
  };

  const strongHits = [matches.email, matches.phone, matches.vat].filter(Boolean).length;
  const totalHits = strongHits + (matches.name ? 1 : 0);

  let level: 'full' | 'partial' | 'none';
  if (strongHits >= 2 || (strongHits >= 1 && matches.name)) {
    level = 'full';
  } else if (totalHits >= 1) {
    level = 'partial';
  } else {
    level = 'none';
  }

  return {
    level,
    matches,
    storedIdentity: { name: storedName, email: storedEmail, phone: storedPhone, vat: storedVat },
  };
}

export async function createEntityWithIdentity(params: {
  displayName: string;
  type: 'person' | 'organization';
  email?: string | null;
  phone?: string | null;
  phoneCountryCode?: string | null;
  vat?: string | null;
  createdBy?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<string> {
  const { displayName, type, email, phone, phoneCountryCode, vat, firstName, lastName } = params;
  let { createdBy } = params;

  // Fallback: if createdBy is null/undefined, resolve the business identity from auth session.
  // Never fall back to auth.uid(): created_by is a business identity boundary.
  if (!createdBy) {
    createdBy = await resolveCurrentBusinessUserId();
    if (!createdBy) throw new Error('Business user not found for current auth user');
  }

  const entityInsert: Record<string, any> = { display_name: displayName, type, status: 'active', created_by: createdBy };
  if (firstName) entityInsert.first_name = firstName;
  if (lastName) entityInsert.last_name = lastName;
  const { data: entity, error: entityError } = await supabase.from('anew_entities').insert(entityInsert as any).select('id').single();
  if (entityError || !entity) throw entityError || new Error('Failed to create entity');
  const entityId = entity.id;

  if (email) {
    await supabase.from('anew_entity_emails').insert({ entity_id: entityId, email, email_type: 'work', is_primary: true, created_by: createdBy });
  }

  if (phone) {
    await supabase.from('anew_entity_phones').insert({ entity_id: entityId, phone_number: phone, country_code: phoneCountryCode || '+351', phone_type: 'work', is_primary: true, created_by: createdBy });
  }

  if (vat) {
    const { data: fiscalEntity } = await (supabase as any).from('fiscal_entities').insert({ nif: vat, entity_type: type === 'person' ? 'individual' : 'company', created_by: createdBy }).select('id').single();
    if (fiscalEntity) {
      await supabase.from('anew_entity_fiscal_entities').insert({ entity_id: entityId, fiscal_entity_id: fiscalEntity.id, is_primary: true, created_by: createdBy });
    }
  }

  return entityId;
}
