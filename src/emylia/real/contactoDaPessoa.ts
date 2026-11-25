// 23/11 (testarh, negócio 1015 da Mudelar): o contacto do negócio na ficha da pessoa. O «Telefone ou email» do cartão «Novo negócio»
// separa-se (o email vai para o email, o telefone para o telefone) e cada um vai para a entidade (anew_entities.email / phone, o que a
// «Nova lead» grava) e para o principal das tabelas de contacto (anew_entity_emails / anew_entity_phones, que o portal e a pesquisa
// «Já existe» leem). O telefone mudado em «Quem pede» também vai para a ficha: neg_guardar_negocio não o grava e neg_ler_negocios lê-o
// da entidade (anew_entities.phone primeiro, depois o principal em anew_entity_phones). Sem isto o telefone perdia-se ao reler e o
// envio da proposta dizia «Falta o telefone do cliente com indicativo do país».
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailOk, separarContacto, telefoneNormal } from "../acessosPortal";
import type { Negocio } from "../motor";
import { garantirEmailDoContacto, garantirTelefoneDoContacto } from "./portalReal";

/** O telefone que se grava na ficha: o do negócio, normalizado (telefoneNormal); vazio se for um email ou tiver menos de 7 algarismos. */
export function telefoneParaFicha(tel: string): string {
  const t = (tel || "").trim();
  if (!t || t.includes("@")) return "";
  const n = telefoneNormal(t);
  return n.replace(/\D/g, "").length >= 7 ? n : "";
}

/** O email e o telefone de um negócio, para a ficha da pessoa. O email é o do negócio (f.email); um negócio antigo com o email no
 *  contacto (`tel`) também conta. */
export function contactoDoNegocio(d: Pick<Negocio, "tel" | "f">): { email: string; telefone: string } {
  const doCampo = (d.f?.email ?? "").trim().toLowerCase();
  const email = emailOk(doCampo) ? doCampo : separarContacto(d.tel).email;
  return { email, telefone: telefoneParaFicha(d.tel) };
}

type Erro = { code?: string; message?: string } | null;
const entidades = (sb: SupabaseClient) => sb.from("anew_entities" as never) as unknown as {
  update: (r: object) => { eq: (c: string, v: string) => PromiseLike<{ error: Erro }> };
};

/** O telefone passa a ser o da pessoa: anew_entities.phone e o principal em anew_entity_phones. Lança com a mensagem em português. */
export async function gravarTelefoneDaPessoa(sb: SupabaseClient, entityId: string, telefone: string): Promise<void> {
  const t = telefoneParaFicha(telefone);
  if (!entityId || !t) return;
  const { error } = await entidades(sb).update({ phone: t }).eq("id", entityId);
  if (error) throw new Error(error.code === "23505" ? "Já existe outra pessoa com este telefone nesta organização." : error.message || "Não foi possível gravar o telefone.");
  await garantirTelefoneDoContacto(sb, entityId, t);
}

/** A pessoa acabada de criar (a entidade já tem o email e o telefone): o email e o telefone principais nas tabelas de contacto. Não
 *  lança: devolve o que não ficou gravado, para avisar (a pessoa e o negócio já existem; repetir criava outra pessoa). */
export async function gravarContactoDaPessoaNova(sb: SupabaseClient, entityId: string, c: { email: string; telefone: string }): Promise<string[]> {
  const avisos: string[] = [];
  if (c.email) {
    try { await garantirEmailDoContacto(sb, entityId, c.email); }
    catch (e) { avisos.push(`o email não ficou nos contactos da pessoa (${(e as Error).message})`); }
  }
  if (c.telefone) {
    try { await garantirTelefoneDoContacto(sb, entityId, c.telefone); }
    catch (e) { avisos.push(`o telefone não ficou nos contactos da pessoa (${(e as Error).message})`); }
  }
  return avisos;
}
