// As ligações de contacto (tel:, wa.me, mailto:), partilhadas pelas fichas. Funções puras.
/** Um endereço simples, sem espaços nem `? & # , ;` (que acrescentariam campos ao mailto:, como `?bcc=`). */
const EMAIL_SIMPLES = /^[^\s@?&#,;<>]+@[^\s@?&#,;<>]+\.[^\s@?&#,;<>]+$/;

export interface LigacoesContacto {
  telefone?: string;
  whatsapp?: string;
  email?: string;
}

/** Os dígitos do telefone com o indicativo de Portugal (351) quando falta; um número já internacional fica como está. */
export function digitosComIndicativo(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "").replace(/^00/, "");
  return digitos.length === 9 ? `351${digitos}` : digitos;
}

/** As ligações de cada botão (tel:, wa.me, mailto:); sem telefone ou sem email, a chave não existe. */
export function ligacoes(contacto: { telefone: string | null; email: string | null }): LigacoesContacto {
  const resultado: LigacoesContacto = {};
  const digitos = digitosComIndicativo(contacto.telefone ?? "");
  if (digitos !== "") {
    const mais = (contacto.telefone ?? "").trim().startsWith("+") ? "+" : "";
    resultado.telefone = `tel:${mais}${(contacto.telefone ?? "").replace(/\D/g, "")}`;
    resultado.whatsapp = `https://wa.me/${digitos}`;
  }
  const email = (contacto.email ?? "").trim();
  if (EMAIL_SIMPLES.test(email)) resultado.email = `mailto:${email}`;
  return resultado;
}
