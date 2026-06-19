export interface LeadContactInfo {
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

const asString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
};

/**
 * Extract lead contact details from `field_values` with common alias fallbacks.
 * Supports both separate first_name/last_name and combined name fields.
 * Includes "po_" prefixed fields commonly used in Portuguese forms.
 */
export const extractLeadContactInfo = (fieldValues?: Record<string, any> | null): LeadContactInfo => {
  const fv = (fieldValues || {}) as Record<string, any>;

  // Extract first name (prioritize dedicated field)
  let firstName =
    asString(fv.first_name) ||
    asString(fv.primeiro_nome) ||
    null;

  // Extract last name (prioritize dedicated field)
  let lastName =
    asString(fv.last_name) ||
    asString(fv.apelido) ||
    null;

  // If we have a combined name field (po_nome, nome, name, etc.) and no separate first/last
  if (!firstName && !lastName) {
    const fullName = 
      asString(fv.po_nome) ||
      asString(fv.nome) ||
      asString(fv.name) ||
      asString(fv.full_name) ||
      null;
    
    if (fullName) {
      const parts = fullName.split(/\s+/);
      if (parts.length >= 2) {
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      } else {
        firstName = fullName;
      }
    }
  }

  // Build full name: prioritize first+last, then fallback to combined fields
  const name =
    (firstName && lastName ? `${firstName} ${lastName}` : null) ||
    (firstName || '') ||
    asString(fv.po_nome) ||
    asString(fv.nome) ||
    asString(fv.name) ||
    asString(fv.full_name) ||
    asString(fv.email) ||
    asString(fv.po_email) ||
    '';

  const email = 
    asString(fv.email) || 
    asString(fv.po_email) || 
    asString(fv.poEmail) ||
    asString(fv.e_mail) ||
    asString(fv.mail);

  const phone =
    asString(fv.phone) ||
    asString(fv.telefone) ||
    asString(fv.po_telefone) ||
    asString(fv.poTelefone) ||
    asString(fv.telemovel) ||
    asString(fv.telemóvel) ||
    asString(fv.mobile) ||
    asString(fv.celular);

  return {
    name: name || 'Lead',
    firstName,
    lastName,
    email,
    phone,
  };
};
