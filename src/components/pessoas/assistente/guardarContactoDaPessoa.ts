// Grava o telefone, o email e as preferências de contacto da pessoa em duas chamadas: o telefone e o email substituem-se primeiro; se isso falhar as
// preferências não se tocam. Se as preferências falharem a seguir, o telefone e o email já ficaram gravados e o erro diz-o (a mesma regra da ficha da pessoa).
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import type { DadosContactoFormulario } from "@/components/pessoas-lista/contactoFormulario";

const CHAVE_CONTACTO_PARCIAL = "pessoasPagina.real.ficha.contact.partial";

interface Gravadores {
  substituir: (dados: { email?: string; telefone?: string }) => Promise<unknown>;
  preferencias: (dados: { contacto?: DadosContactoFormulario["contacto"]; hora?: DadosContactoFormulario["hora"]; lingua?: string }) => Promise<unknown>;
}

export async function guardarContactoDaPessoa(
  { email, telefone, contacto, hora, lingua }: DadosContactoFormulario, { substituir, preferencias }: Gravadores,
): Promise<void> {
  const substituiu = email !== undefined || telefone !== undefined;
  if (substituiu) await substituir({ email, telefone });
  if (contacto === undefined && hora === undefined && lingua === undefined) return;
  try {
    await preferencias({ contacto, hora, lingua });
  } catch (erro) {
    if (substituiu && erro instanceof ErroNeg) throw new ErroNeg(erro, erro.codigo, CHAVE_CONTACTO_PARCIAL, erro.chave);
    throw erro;
  }
}
