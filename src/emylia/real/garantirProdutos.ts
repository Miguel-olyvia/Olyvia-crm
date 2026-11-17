// 17/11 (teste A-Z na Mudelar: «Sem par no Catálogo» para tudo o que se escolheu no Estúdio). Com o Catálogo leve (catalogoLeve.ts) K.produtos só traz os
// consumíveis dos serviços; os produtos que o Estúdio escolheu (ids do Catálogo verdadeiro) têm de ser lidos do servidor e entrar no Catálogo em memória
// ANTES de o Estúdio os ligar ao negócio (ligarAoCatalogo, levarEstudio) ou de mostrar o orçamento. Lê só os que faltam, 8 de cada vez, e uma vez cada.
import { lerCatalogo } from "../v2/catalogoStore";
import { orgDoCatalogoLido } from "./catalogoLeve";
// a pesquisa (e com ela o cliente do Supabase) só se carrega quando falta mesmo um produto: a Visita e o Estúdio importam este módulo nos testes
let pesquisa: Promise<typeof import("./pesquisaProdutos")> | null = null;
const escolherProdutoDoServidor = (org: string, id: string) => (pesquisa ??= import("./pesquisaProdutos")).then((m) => m.escolherProdutoDoServidor(org, id));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Os pedidos em curso por produto: o mesmo id não se pede duas vezes ao mesmo tempo. */
const emCurso = new Map<string, Promise<boolean>>();

/** Os ids (do Catálogo verdadeiro) que ainda não estão no Catálogo em memória. */
export const produtosEmFalta = (ids: readonly (string | undefined)[]): string[] => {
  const tem = new Set((lerCatalogo().produtos ?? []).map((p) => p.id));
  return [...new Set(ids.filter((x): x is string => !!x && UUID.test(x) && !tem.has(x)))];
};

/** Lê do servidor e mete no Catálogo os produtos que faltam. Devolve os que não se conseguiram ler (sem organização lida: todos os em falta). */
export async function garantirProdutos(ids: readonly (string | undefined)[], org = orgDoCatalogoLido()): Promise<string[]> {
  const falta = produtosEmFalta(ids);
  if (!falta.length) return [];
  if (!org) return falta;
  const falhados: string[] = [];
  for (let i = 0; i < falta.length; i += 8) {
    await Promise.all(falta.slice(i, i + 8).map(async (id) => {
      let p = emCurso.get(id);
      if (!p) {
        p = escolherProdutoDoServidor(org, id).then((r) => r.ok, () => false);
        emCurso.set(id, p);
        void p.then(() => { emCurso.delete(id); });
      }
      if (!(await p)) falhados.push(id);
    }));
  }
  return falhados;
}
