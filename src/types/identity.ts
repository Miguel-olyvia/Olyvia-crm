/**
 * Branded scalar types for user identity.
 *
 * AnewUserId  — primary key from the anew_users table (application-layer user)
 * AuthUserId  — sub / UUID from Supabase auth.users (auth-layer user)
 *
 * Using branded types prevents accidental cross-assignment of the two ID
 * spaces, which refer to different tables and different RLS principals.
 */

export type AnewUserId = string & { readonly _brand: 'AnewUserId' }
export type AuthUserId = string & { readonly _brand: 'AuthUserId' }

/** Cast a raw string to AnewUserId — only call this at a verified source boundary. */
export function asAnewUserId(id: string): AnewUserId {
  return id as AnewUserId
}

/** Cast a raw string to AuthUserId — only call this at a verified source boundary. */
export function asAuthUserId(id: string): AuthUserId {
  return id as AuthUserId
}
