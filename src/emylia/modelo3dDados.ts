// O «Modelo 3D» de um produto, de um Modelo do Catálogo (0001 SMOOTH…), de uma subcategoria ou de uma categoria: gravar com cat_definir_modelo_3d(p_org,
// p_alvo, p_id, p_modelo) → jsonb {alvo, id, modelo, anterior}. `p_alvo`: 'produto', 'modelo' ou 'categoria' (a subcategoria é uma categoria); '' ou null limpa (herda). A base só guarda o id
// (^[a-z0-9_]{1,40}$, sem lista fechada); o que cada id quer dizer vive em planta3d/modelos3dEscolha.ts.
// Mesmo padrão das outras funções cat_* (fichaProdutoDados: rpcLivre, erroAmigavel): a função ainda não existir na base (PGRST202) é «ainda não
// disponível»; as recusas CT00x trazem a mensagem em português da base e mostram-se tal e qual; o resto vira uma frase de reserva (nunca inglês em bruto).
import { AINDA_NAO, erroAmigavel, rpcLivre, type Res } from "./fichaProdutoDados";
import { ehIdDeModelo3D } from "./planta3d/modelos3dEscolha";

export type AlvoModelo3D = "produto" | "modelo" | "categoria";
export interface ResultadoModelo3D { alvo: string; id: string; modelo: string | null; anterior: string | null }

const FRASE = "Não foi possível gravar o modelo 3D.";
const AINDA_NAO_FRASE = "Mudar o modelo 3D ainda não está disponível nesta base (falta a migração do modelo 3D).";

/** O valor de uma leitura da base: o id se estiver no formato, senão null. A chave em falta (migração por aplicar) é null. */
export const modelo3dDeLeitura = (v: unknown): string | null => (ehIdDeModelo3D(v) ? v : null);

/** Grava (ou limpa, com null, '' ou só espaços) o modelo 3D. Devolve o que a base respondeu; qualquer falha volta como texto para mostrar. */
export async function definirModelo3d(org: string, alvo: AlvoModelo3D, id: string, modelo: string | null): Promise<Res<ResultadoModelo3D>> {
  const valor = modelo?.trim() ? modelo.trim() : null;
  if (valor !== null && !ehIdDeModelo3D(valor)) return { ok: false, erro: "O modelo 3D escolhido não é válido." };
  try {
    const { data, error } = await rpcLivre("cat_definir_modelo_3d", { p_org: org, p_alvo: alvo, p_id: id, p_modelo: valor });
    if (error) {
      if (erroAmigavel(error, FRASE) === AINDA_NAO) return { ok: false, erro: AINDA_NAO_FRASE, ...(error.code ? { codigo: error.code } : {}) };
      if (/^CT00\d$/.test(error.code ?? "") && error.message) return { ok: false, erro: error.message, codigo: error.code };
      return { ok: false, erro: FRASE, ...(error.code ? { codigo: error.code } : {}) };
    }
    if (!data || typeof data !== "object") return { ok: false, erro: FRASE };
    const r = data as Record<string, unknown>;
    return { ok: true, v: { alvo: typeof r.alvo === "string" ? r.alvo : alvo, id: typeof r.id === "string" ? r.id : id, modelo: modelo3dDeLeitura(r.modelo), anterior: modelo3dDeLeitura(r.anterior) } };
  } catch {
    return { ok: false, erro: FRASE };
  }
}
