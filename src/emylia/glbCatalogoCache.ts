// A leitura, por organização, das categorias e dos Modelos COM o GLB próprio de cada um (cat_ler_categorias_gestao e cat_ler_modelos_gestao: as mesmas que o Catálogo já usa).
// O 3D de um produto precisa de saber se o Modelo, a subcategoria ou a categoria dele têm um GLB próprio; as leituras do produto (a ficha, a planta) não trazem essa chave, por
// isso lê-se UMA vez por organização (e não por produto), fica em memória pouco tempo e invalida-se quando alguém liga ou remove um GLB (modeloGlbDados.ts). Uma leitura que
// falha (sem permissão, base antiga) é «sem GLB» e a falha também se guarda, mas só um minuto: as duas RPC recusam quem não tem `products.edit` nem `services.view`, e sem isto cada ficha
// aberta repetia as duas chamadas recusadas (cada uma fica como erro no painel da base). Sem React.
import { lerCategoriasGestao, type CategoriaGestao } from "./categoriasMarcasGestao";
import { lerModelosGestao, type ModeloGestao } from "./modelosDados";

export interface LeituraGlbs { categorias: readonly CategoriaGestao[]; modelos: readonly ModeloGestao[] }

/** Quanto tempo uma leitura serve (ms): o suficiente para as fichas seguintes não a repetirem, curto para outro utilizador ser apanhado. */
export const VALIDADE_LEITURA_MS = 5 * 60_000;

/** Quanto tempo uma leitura que FALHOU serve (ms): não repete as chamadas recusadas a cada ficha, e volta a tentar pouco depois (a permissão pode ter mudado). */
export const VALIDADE_FALHA_MS = 60_000;

interface Entrada { quando: number; leitura: Promise<LeituraGlbs | null>; falhou?: boolean }
const entradas = new Map<string, Entrada>();

/** As duas leituras da organização (em paralelo), ou null se qualquer uma falhar. Nunca lança. */
async function ler(org: string): Promise<LeituraGlbs | null> {
  try {
    const [c, m] = await Promise.all([lerCategoriasGestao(org), lerModelosGestao(org)]);
    return c.ok && m.ok ? { categorias: c.v, modelos: m.v } : null;
  } catch {
    return null;
  }
}

/** A leitura da organização (de memória se é recente). null: não se conseguiu ler, e o próximo pedido tenta de novo. */
export function lerGlbsDoCatalogo(org: string): Promise<LeituraGlbs | null> {
  const tida = entradas.get(org);
  if (tida && Date.now() - tida.quando < (tida.falhou ? VALIDADE_FALHA_MS : VALIDADE_LEITURA_MS)) return tida.leitura;
  const nova: Entrada = { quando: Date.now(), leitura: ler(org) };
  entradas.set(org, nova);
  // a validade conta a partir de quando a leitura acabou (uma resposta lenta não nasce já velha)
  void nova.leitura.then((l) => { nova.quando = Date.now(); if (l === null) nova.falhou = true; });
  return nova.leitura;
}

/** Depois de ligar ou remover um GLB (ou, nos testes, para começar do zero): a próxima leitura vai à base. */
export function invalidarGlbsDoCatalogo(org?: string): void {
  if (org) entradas.delete(org); else entradas.clear();
}
