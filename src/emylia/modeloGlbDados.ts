// 27/11: os dados do GLB PRÓPRIO por categoria, subcategoria e Modelo: o que corre na base e no storage. O contrato é o da migration 20270130420000 (por aplicar enquanto isto se escreve):
//   cat_definir_glb(p_org, p_alvo, p_id, p_caminho) → { alvo, id, caminho, anterior, anterior_orfao }    p_alvo: 'categoria' (categorias e subcategorias) ou 'modelo'; p_caminho null/'' remove
//   bucket público `catalogo-modelos3d`, caminho `{org}/{uuid}.glb`, upload com contentType model/gltf-binary e upsert false (trocar = ficheiro novo)
// A sequência é a das fotos de opção (fotoOpcaoDados.ts): validar o ficheiro, carregar o NOVO, ligá-lo (cat_definir_glb) e só então apagar o ANTIGO, e só se a base disser que ficou órfão;
// se a base recusar, apaga-se o novo. Quem tem products.edit carrega; a base decide (CT001 sem permissão, CT002 ficheiro de outra organização, CT006 ficheiro em falta no bucket, CT007 tipo
// ou tamanho fora do limite) e as mensagens dela mostram-se tal e qual. Os textos do storage (inglês) traduzem-se aqui.
import { supabase } from "@/integrations/supabase/client";
import { AINDA_NAO, erroAmigavel, rpcLivre, type Res } from "./fichaProdutoDados";
import { invalidarGlbsDoCatalogo } from "./glbCatalogoCache";
import { BUCKET_MODELOS_3D, CAMINHO_GLB, TIPO_GLB, glbDeLeitura } from "./glbProprioFormato";
import { analisarGlb } from "./planta3d/glbValidar";

export { BUCKET_MODELOS_3D, bytesDeGlbDeLeitura, glbDeLeitura } from "./glbProprioFormato";

/** `categoria`: uma categoria ou uma subcategoria (a mesma tabela); `modelo`: um Modelo do Catálogo (0001 SMOOTH…). */
export type AlvoGlb = "categoria" | "modelo";
export interface ResultadoGlb { alvo: string; id: string; caminho: string | null; anterior: string | null; anteriorOrfao: boolean }
/** O que se devolve ao guardar um GLB novo: o resultado da base e o que a validação achou (avisos para o ecrã mostrar, tamanho e triângulos). */
export interface ResultadoGuardarGlb extends ResultadoGlb { avisos: string[]; bytes: number; triangulos: number }

const FRASE = "Não foi possível guardar o modelo 3D próprio.";
const AINDA_NAO_FRASE = "O modelo 3D próprio ainda não está disponível nesta base (falta a migração do GLB próprio).";
const MSG_ENVIO = "Não foi possível enviar o ficheiro do modelo 3D. Tente de novo.";

/** O URL público de um GLB próprio (o 3D e o ecrã de gestão usam-no). Sem storage ou sem caminho válido: null, nunca lança. */
export function urlDoGlbProprio(caminho: string | null | undefined): string | null {
  if (!caminho || !CAMINHO_GLB.test(caminho)) return null;
  try {
    return supabase.storage.from(BUCKET_MODELOS_3D).getPublicUrl(caminho).data?.publicUrl || null;
  } catch {
    return null;
  }
}

/** Traduz o erro (em inglês) do storage: os conhecidos têm mensagem própria, o resto uma genérica. */
export function mensagemDoStorageGlb(texto: string | null | undefined): string {
  const t = (texto ?? "").toLowerCase();
  if (t.includes("bucket not found")) return "A pasta dos modelos 3D ainda não está disponível nesta base.";
  if (t.includes("row-level security") || t.includes("unauthorized") || t.includes("not authorized")) return "Não tem permissão para carregar modelos 3D.";
  if (t.includes("too large") || t.includes("exceeded the maximum")) return "O ficheiro é demasiado grande: o limite é 5 MB.";
  if (t.includes("mime type") || t.includes("not supported") || t.includes("invalid_mime")) return "O ficheiro tem de ser um GLB (.glb).";
  return MSG_ENVIO;
}

const textoOuNull = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

/** Liga (caminho) ou remove (null ou '') o GLB de uma categoria, subcategoria ou Modelo. A resposta diz que ficheiro ficou para trás e se mais ninguém o usa. */
export async function definirGlbProprio(org: string, alvo: AlvoGlb, id: string, caminho: string | null): Promise<Res<ResultadoGlb>> {
  const valor = caminho?.trim() ? caminho.trim() : null;
  if (valor !== null && !CAMINHO_GLB.test(valor)) return { ok: false, erro: "O ficheiro do modelo 3D não tem um caminho válido." };
  try {
    const { data, error } = await rpcLivre("cat_definir_glb", { p_org: org, p_alvo: alvo, p_id: id, p_caminho: valor });
    if (error) {
      if (erroAmigavel(error, FRASE) === AINDA_NAO) return { ok: false, erro: AINDA_NAO_FRASE, ...(error.code ? { codigo: error.code } : {}) };
      if (/^CT00\d$/.test(error.code ?? "") && error.message) return { ok: false, erro: error.message, codigo: error.code };
      return { ok: false, erro: FRASE, ...(error.code ? { codigo: error.code } : {}) };
    }
    if (!data || typeof data !== "object") return { ok: false, erro: FRASE };
    const r = data as Record<string, unknown>;
    invalidarGlbsDoCatalogo(org);
    return { ok: true, v: { alvo: textoOuNull(r.alvo) ?? alvo, id: textoOuNull(r.id) ?? id, caminho: glbDeLeitura(r.caminho), anterior: glbDeLeitura(r.anterior), anteriorOrfao: r.anterior_orfao === true } };
  } catch {
    return { ok: false, erro: FRASE };
  }
}

/** Apaga ficheiros do bucket. Melhor esforço: um ficheiro que fica para trás é só espaço, nunca um erro que a pessoa possa resolver nem que estrague o GLB já ligado. */
async function apagarFicheiros(caminhos: readonly string[]): Promise<void> {
  if (caminhos.length === 0) return;
  try { await supabase.storage.from(BUCKET_MODELOS_3D).remove([...caminhos]); } catch { /* ficheiro órfão: inofensivo */ }
}
/** Depois de a base ligar/remover: o ficheiro antigo só se apaga se ela disser que nenhuma categoria nem Modelo o usa. */
async function limparAnterior(r: ResultadoGlb): Promise<void> {
  if (r.anterior && r.anteriorOrfao) await apagarFicheiros([r.anterior]);
}

/** Os bytes de um ficheiro ou Blob (File herda de Blob). `arrayBuffer` falta em ambientes antigos: lê-se com um FileReader. */
export function lerBytes(f: Blob): Promise<ArrayBuffer> {
  if (typeof f.arrayBuffer === "function") return f.arrayBuffer();
  return new Promise((resolver, rejeitar) => {
    const l = new FileReader();
    l.onload = () => resolver(l.result as ArrayBuffer);
    l.onerror = () => rejeitar(l.error ?? new Error("leitura"));
    l.readAsArrayBuffer(f);
  });
}

/**
 * Valida o GLB (glbValidar.ts: cabeçalho, autocontido, Draco, triângulos, tamanho), carrega-o ao bucket com um caminho novo, liga-o e apaga o antigo se ficou órfão. Um GLB inválido nem
 * sobe (a recusa diz porquê); se a base recusar a ligação, apaga-se o ficheiro novo. Os avisos (muitos triângulos, imagem pesada) voltam para o ecrã os mostrar.
 */
export async function guardarGlbProprio(org: string, alvo: AlvoGlb, id: string, ficheiro: Blob): Promise<Res<ResultadoGuardarGlb>> {
  let a;
  try { a = await analisarGlb(await lerBytes(ficheiro)); } catch { return { ok: false, erro: "Não foi possível ler o ficheiro." }; }
  if (!a.ok) return { ok: false, erro: a.erros.join(" ") };
  let caminho = "";
  try {
    // o randomUUID fica DENTRO do try: fora de um contexto seguro (http) não existe e lança, e isso não pode deixar o ecrã preso
    caminho = `${org}/${crypto.randomUUID()}.glb`;
    // o nome é novo em cada ficheiro (nunca se sobrepõe), por isso a cache pode ser longa
    const { error } = await supabase.storage.from(BUCKET_MODELOS_3D).upload(caminho, ficheiro, { contentType: TIPO_GLB, upsert: false, cacheControl: "31536000" });
    if (error) return { ok: false, erro: mensagemDoStorageGlb(error.message) };
  } catch (e) {
    return { ok: false, erro: mensagemDoStorageGlb((e as Error).message) };
  }
  const r = await definirGlbProprio(org, alvo, id, caminho);
  if (r.ok === false) { await apagarFicheiros([caminho]); return r; }
  await limparAnterior(r.v);
  return { ok: true, v: { ...r.v, avisos: a.avisos, bytes: a.bytes, triangulos: a.triangulos } };
}

/** Remove o GLB próprio (o 3D volta ao modelo escolhido ou ao automático) e apaga o ficheiro se ficou sem uso. */
export async function removerGlbProprio(org: string, alvo: AlvoGlb, id: string): Promise<Res<ResultadoGlb>> {
  const r = await definirGlbProprio(org, alvo, id, null);
  if (r.ok) await limparAnterior(r.v);
  return r;
}
