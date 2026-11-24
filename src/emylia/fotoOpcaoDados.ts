// Foto na opção de atributo: o que corre na base e no storage. As funções cat_* e o bucket `catalogo-opcoes` são o CONTRATO com a migration (por aplicar enquanto isto se escreve):
//   cat_foto_opcao(p_org, p_opcao, p_foto) → { foto, antiga, antiga_orfa }   p_foto null ou '' limpa; `antiga_orfa` é true só se mais nenhuma opção usa o caminho antigo
//   cat_definir_foto_atributo(p_org, p_atributo, p_tem_foto)                  liga/desliga o interruptor num atributo de cor (recusa desligar com opções com foto)
//   bucket público `catalogo-opcoes`, caminho `{org}/{uuid}.webp`, upload com contentType image/webp e upsert false
// A sequência para trocar/ligar uma foto: carregar o ficheiro NOVO, ligá-lo à opção (cat_foto_opcao), e só então apagar o ANTIGO (e só se ficou órfão). Se a base recusar, apaga-se o novo.
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_FOTOS_OPCOES } from "./fotoOpcaoUrl";
import { chamar, type ResG } from "./atributosGestao";

export interface ResultadoFoto { foto: string | null; antiga: string | null; antiga_orfa: boolean }

const textoOuNull = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

/** Liga (caminho) ou limpa (null) a foto de uma opção. A resposta da base diz que ficheiro ficou para trás e se mais alguém o usa. */
export async function definirFotoOpcao(org: string, opcao: string, foto: string | null): Promise<ResG<ResultadoFoto>> {
  const r = await chamar("cat_foto_opcao", { p_org: org, p_opcao: opcao, p_foto: foto }, "Não foi possível guardar a foto.");
  if (r.ok === false) return r;
  const v = (r.v ?? {}) as Record<string, unknown>;
  return { ok: true, v: { foto: textoOuNull(v.foto), antiga: textoOuNull(v.antiga), antiga_orfa: v.antiga_orfa === true } };
}

/** O interruptor «Tem foto» de um atributo de cor. A mensagem de recusa é a da base. */
export function definirFotoAtributo(org: string, atributo: string, temFoto: boolean): Promise<ResG<unknown>> {
  return chamar("cat_definir_foto_atributo", { p_org: org, p_atributo: atributo, p_tem_foto: temFoto }, "Não foi possível mudar a foto do atributo.");
}

/** Apaga ficheiros do storage. Melhor esforço: um ficheiro que fica para trás é só espaço, nunca um erro que a pessoa possa resolver nem que estrague a foto já ligada. */
async function apagarFicheiros(caminhos: readonly string[]): Promise<void> {
  if (caminhos.length === 0) return;
  try { await supabase.storage.from(BUCKET_FOTOS_OPCOES).remove([...caminhos]); } catch { /* ficheiro órfão: inofensivo */ }
}

/** Depois de a base ligar/limpar: o ficheiro antigo só se apaga se ela disser que mais nenhuma opção o usa. */
async function limparAntiga(r: ResultadoFoto): Promise<void> {
  if (r.antiga && r.antiga_orfa) await apagarFicheiros([r.antiga]);
}

/** Carrega a foto já convertida e liga-a à opção. Se a base recusar, o ficheiro novo apaga-se; se aceitar, apaga-se o antigo (se ficou órfão). */
export async function guardarFotoOpcao(org: string, opcao: string, foto: Blob): Promise<ResG<ResultadoFoto>> {
  const caminho = `${org}/${crypto.randomUUID()}.webp`;
  try {
    const { error } = await supabase.storage.from(BUCKET_FOTOS_OPCOES).upload(caminho, foto, { contentType: "image/webp", upsert: false });
    if (error) return { ok: false, erro: `Não foi possível carregar a foto${error.message ? ` (${error.message})` : ""}.` };
  } catch (e) {
    return { ok: false, erro: (e as Error).message || "Não foi possível carregar a foto." };
  }
  const r = await definirFotoOpcao(org, opcao, caminho);
  if (!r.ok) { await apagarFicheiros([caminho]); return r; }
  await limparAntiga(r.v);
  return r;
}

/** Reutiliza o caminho de outra opção do mesmo atributo (`foto`) ou limpa a foto (null). Nada se carrega; o ficheiro antigo só se apaga se ficou órfão. */
export async function ligarFotoOpcao(org: string, opcao: string, foto: string | null): Promise<ResG<ResultadoFoto>> {
  const r = await definirFotoOpcao(org, opcao, foto);
  if (r.ok) await limparAntiga(r.v);
  return r;
}
