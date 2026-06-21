import { contactMatchesScope, type ContactScopeOptions, type ScopedContactLike } from "./scope";

export interface ScopedContactResolutionRow extends ScopedContactLike {
  id: string;
  entity_id: string;
  deleted_at?: string | null;
  converted_to_client_id?: string | null;
}

export function findScopedContactByRef<T extends ScopedContactResolutionRow>(
  contacts: readonly T[],
  ref: string | null | undefined,
  scope: ContactScopeOptions,
): T | null {
  if (!ref) return null;

  return contacts.find((contact) => {
    if (contact.id !== ref && contact.entity_id !== ref) return false;
    if (contact.deleted_at || contact.converted_to_client_id) return false;
    return contactMatchesScope(contact, scope);
  }) || null;
}
