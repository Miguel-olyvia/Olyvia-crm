// A regra do formulário de contacto da ficha real: telefone e email (que só se substituem), contacto preferido, melhor hora e língua.
// Função pura: diz o que guardar (só o que mudou), o que está inválido, ou que nada mudou. Os limites são os de neg_substituir_contacto.
import type { ContactoPreferido, HoraPreferida } from "@/components/pessoas/pessoasTipos";
import { linguaParaEnviar } from "@/hooks/pessoas/useGuardarContactoPessoa";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TELEFONE = /^\+?[0-9 ().-]+$/;
const MAX_EMAIL = 254;
const MAX_TELEFONE = 30;
const DIGITOS_MIN = 7;
const DIGITOS_MAX = 15;

export interface ContactoAtual {
  telefone: string | null;
  email: string | null;
  contacto?: ContactoPreferido;
  hora?: HoraPreferida;
  lingua?: string;
}

export interface FormularioContacto {
  telefone: string;
  email: string;
  contacto: ContactoPreferido | "";
  hora: HoraPreferida | "";
  lingua: string;
}

export interface DadosContactoFormulario {
  telefone?: string;
  email?: string;
  contacto?: ContactoPreferido | "";
  hora?: HoraPreferida | "";
  lingua?: string;
}

export type PedidoContacto =
  | { estado: "guardar"; dados: DadosContactoFormulario }
  | { estado: "semAlteracao" }
  | { estado: "falta"; campo: "email" | "telefone"; chaveErro: "errorEmail" | "errorPhone" };

export function formularioDeContacto(atual: ContactoAtual): FormularioContacto {
  return {
    telefone: atual.telefone ?? "", email: atual.email ?? "", contacto: atual.contacto ?? "", hora: atual.hora ?? "",
    // Sem língua na base fica vazio («Sem indicação»): escolher pt é então uma alteração que se manda.
    lingua: atual.lingua?.trim() ?? "",
  };
}

const emailValido = (e: string): boolean => e.length <= MAX_EMAIL && EMAIL.test(e);
function telefoneValido(t: string): boolean {
  const digitos = t.replace(/\D/g, "").length;
  return t.length <= MAX_TELEFONE && TELEFONE.test(t) && digitos >= DIGITOS_MIN && digitos <= DIGITOS_MAX;
}

export function pedidoDeContacto(form: FormularioContacto, atual: ContactoAtual): PedidoContacto {
  const dados: DadosContactoFormulario = {};
  const email = form.email.trim();
  const telefone = form.telefone.trim();
  // Vazio não apaga (a função da base só substitui): conta como não mexer.
  if (email !== "" && email.toLowerCase() !== (atual.email ?? "").trim().toLowerCase()) {
    if (!emailValido(email)) return { estado: "falta", campo: "email", chaveErro: "errorEmail" };
    dados.email = email;
  }
  if (telefone !== "" && telefone !== (atual.telefone ?? "").trim()) {
    if (!telefoneValido(telefone)) return { estado: "falta", campo: "telefone", chaveErro: "errorPhone" };
    dados.telefone = telefone;
  }
  if (form.contacto !== (atual.contacto ?? "")) dados.contacto = form.contacto;
  if (form.hora !== (atual.hora ?? "")) dados.hora = form.hora;
  const lingua = linguaParaEnviar(atual.lingua?.trim() ?? "", form.lingua);
  if (lingua !== null) dados.lingua = lingua;
  return Object.keys(dados).length === 0 ? { estado: "semAlteracao" } : { estado: "guardar", dados };
}
