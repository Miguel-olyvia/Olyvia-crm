import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { resolveCurrentBusinessUserId } from '@/lib/identity/resolveBusinessUserId';
import { callFiscalEntityResolve } from '@/lib/nif/callFiscalEntityResolve';
import { callNifReveal, callNifRevealSingle } from '@/lib/nif/callNifReveal';

// Must stay <= nif-reveal's MAX_BATCH_SIZE (supabase/functions/nif-reveal/handler.ts).
const NIF_REVEAL_BATCH_SIZE = 100;

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
  // Mirrors identityMap so resolveEntities/getIdentity can read the latest
  // value without depending on identityMap itself — depending on it would
  // give both callbacks a new reference every time it changes, which in
  // turn destabilizes every useMemo/useCallback/useEffect downstream that
  // depends on them (AnewClients.tsx/AnewLeads.tsx/AnewContacts.tsx all did
  // this), causing a visible refetch+re-render cascade right after mount.
  // Kept in sync synchronously on every render — safe, no side effects.
  const identityMapRef = useRef(identityMap);
  identityMapRef.current = identityMap;
  const [loading, setLoading] = useState(false);

  const resolveEntities = useCallback(async (entityIds: string[]) => {
    const uniqueIds = [...new Set(entityIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return {};
    }

    // Filter out already-cached IDs to avoid redundant queries
    const currentMap = identityMapRef.current;
    const uncachedIds = uniqueIds.filter(id => !(id in currentMap));
    if (uncachedIds.length === 0) {
      // All already cached — return existing map subset
      const map: Record<string, EntityIdentity> = {};
      uniqueIds.forEach(id => { if (currentMap[id]) map[id] = currentMap[id]; });
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

      // Resolve VAT: decrypt via nif-reveal (batched, <= NIF_REVEAL_BATCH_SIZE
      // ids per call) instead of reading fiscal_entities.nif in plaintext.
      const vatMap: Record<string, string> = {};
      if (fiscalLinks.length > 0) {
        const fiscalEntityIds = [...new Set(fiscalLinks.map((f: any) => f.fiscal_entity_id).filter(Boolean))];
        if (fiscalEntityIds.length > 0) {
          const nifMap: Record<string, string> = {};
          const batches = chunk(fiscalEntityIds, NIF_REVEAL_BATCH_SIZE);
          const revealResults = await Promise.all(batches.map(batch => callNifReveal(batch)));
          revealResults.forEach(({ data }) => {
            if (data) Object.assign(nifMap, data.revealed);
          });
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
  }, []);

  const getIdentity = useCallback((entityId: string | null | undefined): EntityIdentity | null => {
    if (!entityId) return null;
    return identityMapRef.current[entityId] || null;
  }, []);

  /**
   * Drop entities from the cache so the next resolveEntities() fetches them
   * again.
   *
   * Call this after writing to anew_entities / anew_entity_emails /
   * anew_entity_phones / the fiscal link for an entity. Reloading the list
   * that owns the row is NOT enough: name, email, phone and VAT are served
   * from this cache, and resolveEntities() skips any id already in it, so the
   * screen kept showing the pre-edit values until a full page reload.
   *
   * The ref is updated synchronously as well as the state: a resolveEntities()
   * called in the same tick reads the ref, not the state, and would otherwise
   * still see the stale entries and skip the refetch.
   */
  const invalidateEntities = useCallback((entityIds: (string | null | undefined)[]) => {
    const ids = entityIds.filter((id): id is string => !!id);
    if (ids.length === 0) return;

    const next = { ...identityMapRef.current };
    let removed = false;
    for (const id of ids) {
      if (id in next) {
        delete next[id];
        removed = true;
      }
    }
    if (!removed) return;

    identityMapRef.current = next;
    setIdentityMap(next);
  }, []);

  return { identityMap, resolveEntities, getIdentity, invalidateEntities, loading };
}

/**
 * Resolve an existing entity by email/phone/vat, scoped to entities already
 * linked to `organizationId`. Cross-org identity matches are NEVER
 * auto-resolved here — entities are per-org by design; the only sanctioned
 * way to reuse an entity across organizations (even within the same group)
 * is the explicit "Partilhar com esta org" opt-in flow (linkEntityToOrg),
 * which requires an explicit user action. Mirrors findLocalEntityForOrg's
 * org-scoping used by the public lead form.
 */
export async function resolveEntityByIdentity(params: {
  email?: string | null;
  phone?: string | null;
  vat?: string | null;
  organizationId: string;
}): Promise<string | null> {
  const { email, phone, vat, organizationId } = params;
  if (!organizationId) return null;

  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedPhone = phone?.trim().replace(/\s+/g, '');
  const normalizedVat = vat?.trim().toUpperCase();

  const CANDIDATE_LIMIT = 10;

  // Gather candidate entity ids per signal (unscoped) — filtered to this org below.
  const [emailCandidates, phoneCandidates, vatCandidates] = await Promise.all([
    // Exact match, not ILIKE: email is normalized to lowercase above, and a
    // BEFORE INSERT/UPDATE trigger (fn_normalize_entity_email) guarantees
    // every stored email is lowercase too — so `=` matches exactly what
    // ILIKE (case-insensitive, no wildcards) used to match, but `=` is a
    // leakproof operator. ILIKE is not, and on an RLS-protected table
    // Postgres must apply non-leakproof quals AFTER the (expensive) RLS
    // check on every row instead of pushing them into an index scan first —
    // this alone was an ~800x slowdown (~8s vs ~10ms) on lead creation.
    normalizedEmail
      ? supabase
          .from('anew_entity_emails')
          .select('entity_id')
          .eq('email', normalizedEmail)
          .limit(CANDIDATE_LIMIT)
          .then(r => (r.data || []).map((row: any) => row.entity_id as string))
      : Promise.resolve([] as string[]),
    normalizedPhone
      ? supabase
          .from('anew_entity_phones')
          .select('entity_id')
          .eq('phone_number', normalizedPhone)
          .limit(CANDIDATE_LIMIT)
          .then(r => (r.data || []).map((row: any) => row.entity_id as string))
      : Promise.resolve([] as string[]),
    // NOTE: fiscal-entity-resolve is a find-or-create operation scoped to
    // (nif, countryCode), defaulting countryCode to "PT" — unlike the
    // previous direct query, it cannot match a NIF registered under a
    // different country code. This mirrors the Edge Function contract,
    // which does not support cross-country NIF lookups from this call.
    normalizedVat
      ? (async () => {
          const { data: resolved, error } = await callFiscalEntityResolve({ nif: normalizedVat });
          if (error || !resolved) return [] as string[];
          const { data: links } = await supabase
            .from('anew_entity_fiscal_entities')
            .select('entity_id')
            .eq('fiscal_entity_id', resolved.fiscalEntityId)
            .eq('is_primary', true)
            .limit(CANDIDATE_LIMIT);
          return (links || []).map((l: any) => l.entity_id as string);
        })()
      : Promise.resolve([] as string[]),
  ]);

  const allCandidateIds = [...new Set([...emailCandidates, ...phoneCandidates, ...vatCandidates])];
  if (allCandidateIds.length === 0) return null;

  const { data: orgLinks } = await supabase
    .from('anew_entity_org_links')
    .select('entity_id')
    .in('entity_id', allCandidateIds)
    .eq('organization_id', organizationId);
  const inOrgIds = new Set((orgLinks || []).map((l: any) => l.entity_id as string));

  // Priority: email > phone > vat, among entities already linked to this org.
  return (
    emailCandidates.find(id => inOrgIds.has(id)) ||
    phoneCandidates.find(id => inOrgIds.has(id)) ||
    vatCandidates.find(id => inOrgIds.has(id)) ||
    null
  );
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
 *  - phoneOnlyMatch: true when phone is the ONLY signal that matched (no
 *    email, no vat). Phone numbers are shared/reused (households, company
 *    lines) far more often than email/VAT, so callers must NOT silently
 *    auto-reuse the candidate entity on this signal alone — treat it like
 *    'none' (force a new entity / surface for manual review), same policy
 *    HubSpot uses for phone-based "potential duplicates".
 *
 * Strong signals: email, vat. Phone alone never qualifies as "full" and,
 * per phoneOnlyMatch above, must not silently auto-merge either. Name alone
 * never qualifies as "full".
 */
export async function validateEntityCoherence(
  entityId: string,
  candidate: { name?: string | null; email?: string | null; phone?: string | null; vat?: string | null }
): Promise<{
  level: 'full' | 'partial' | 'none';
  matches: { name: boolean; email: boolean; phone: boolean; vat: boolean };
  storedIdentity: { name: string | null; email: string | null; phone: string | null; vat: string | null };
  phoneOnlyMatch: boolean;
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
    storedVat = await callNifRevealSingle(fiscalId);
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

  const phoneOnlyMatch = matches.phone && !matches.email && !matches.vat;

  return {
    level,
    matches,
    storedIdentity: { name: storedName, email: storedEmail, phone: storedPhone, vat: storedVat },
    phoneOnlyMatch,
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
    const { data: resolved, error: resolveError } = await callFiscalEntityResolve({
      nif: vat,
      entityType: type === 'person' ? 'individual' : 'company',
    });
    if (resolveError) throw resolveError;
    if (resolved) {
      await supabase.from('anew_entity_fiscal_entities').insert({ entity_id: entityId, fiscal_entity_id: resolved.fiscalEntityId, is_primary: true, created_by: createdBy });
    }
  }

  return entityId;
}
