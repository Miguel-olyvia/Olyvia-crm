/**
 * Format phone number into a WhatsApp link.
 * Handles Portuguese numbers (9 digits starting with 9 or 2) by prepending 351.
 */
export function formatWhatsAppLink(phone: string, message?: string): string {
  // Remove all non-digit characters
  let cleanPhone = phone.replace(/\D/g, '');

  // If starts with 00, remove it
  if (cleanPhone.startsWith('00')) {
    cleanPhone = cleanPhone.substring(2);
  }

  // If doesn't start with country code (assuming PT 351 if 9 digits)
  if (cleanPhone.length === 9 && (cleanPhone.startsWith('9') || cleanPhone.startsWith('2'))) {
    cleanPhone = '351' + cleanPhone;
  }

  const url = `https://wa.me/${cleanPhone}`;
  if (message) {
    return `${url}?text=${encodeURIComponent(message)}`;
  }
  return url;
}

/**
 * Check if a field key is a phone field based on common naming conventions.
 */
export function isPhoneField(fieldKey: string): boolean {
  const keyLower = fieldKey.toLowerCase();
  return ['phone', 'telefone', 'tel', 'mobile', 'telemovel', 'contacto', 'celular'].some(p => keyLower.includes(p));
}
