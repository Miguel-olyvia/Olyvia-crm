/**
 * RenderContext partilhado por PDF, preview e email.
 *
 * NUNCA contém pricing/IVA/fees/bundles. Esses ficam no Quote Builder
 * e são lidos diretamente das props originais pelo QuotePDFDocument.
 *
 * Este contexto serve apenas para os 4 blocos configuráveis:
 *   - Rodapé / contacto
 *   - Bloco do cliente
 *   - Bloco da empresa
 *   - Email de envio (aliases obrigatórios)
 */

export interface CommercialUserCtx {
  id?: string | null;
  name: string;
  email: string;
  phone: string;
}

export interface ClientCtx {
  display_name: string;
  email: string;
  phone: string;
  vat: string;
  address: string; // já formatada (street, number, postal_code city)
}

export interface CompanyCtx {
  name: string;
  vat: string;
  email: string;
  phone: string;
  logo_url: string | null; // base64 ou URL
  address: string;
}

export interface ProposalCtx {
  title: string;
  value: string;     // já formatado em pt-PT
  publicUrl: string;
}

export interface RenderContext {
  client: ClientCtx;
  company: CompanyCtx;
  commercial: CommercialUserCtx;     // utilizador responsável (PDF) ou auth user (email)
  authUser: CommercialUserCtx | null;
  proposal?: ProposalCtx;
}

export const EMPTY_COMMERCIAL: CommercialUserCtx = { name: "", email: "", phone: "" };
export const EMPTY_CLIENT: ClientCtx = { display_name: "", email: "", phone: "", vat: "", address: "" };
export const EMPTY_COMPANY: CompanyCtx = { name: "", vat: "", email: "", phone: "", logo_url: null, address: "" };
