// 22/01: as fotos dos produtos que o Catálogo leve não tem em memória (K.produtos só traz os 145 dos consumos). Um produto escolhido numa pesquisa e gravado no negócio volta ao abrir
// o negócio só como ProdVisita (nome, preço, quantidade), sem fotos: lê-se cada um uma vez com cat_ler_produto (cache por organização e id) e devolvem-se as fotos, SEM o meter no Catálogo
// (para o orçamento só mostrar). Uma leitura que falha, ou um produto sem fotos, ficam de fora: o ecrã mostra a ilustração, como sem foto.
import { useEffect, useState } from "react";
import { lerProdutoFicha } from "./produtosLeves";
import { limparAoMudarDeSessao } from "./sessaoCaches";

const cache = new Map<string, Promise<string[] | null>>();
/** As organizações em que a base recusou a leitura (CT001, sem permissão): não se repete (M7). */
const recusadas = new Set<string>();
/** Esquecer o que se leu e as recusas (a sessão mudou, ou nos testes). */
export const limparFotosDosProdutos = (): void => { cache.clear(); recusadas.clear(); };
limparAoMudarDeSessao(limparFotosDosProdutos);

/** No máximo MAX_LEITURAS leituras ao mesmo tempo (M7): um orçamento com muitos produtos não dispara dezenas de pedidos. */
const MAX_LEITURAS = 4;
let ativas = 0;
const fila: (() => void)[] = [];
function entrar(): Promise<void> {
  if (ativas < MAX_LEITURAS) { ativas++; return Promise.resolve(); }
  return new Promise((r) => { fila.push(() => { ativas++; r(); }); });
}
function sair(): void { ativas--; fila.shift()?.(); }

function fotosDe(org: string, id: string): Promise<string[] | null> {
  const k = `${org}|${id}`;
  const ja = cache.get(k);
  if (ja) return ja;
  const p = (async (): Promise<string[] | null> => {
    await entrar();
    try {
      if (recusadas.has(org)) { cache.delete(k); return null; } // recusada nesta organização: não se repete
      const r = await lerProdutoFicha(org, id);
      if (!r.ok) {
        if (r.codigo === "CT001") recusadas.add(org);
        cache.delete(k); // uma falha não fica guardada: volta a tentar-se (menos a recusa CT001, que fica em `recusadas`)
        return null;
      }
      return r.v.fotos?.length ? [...r.v.fotos] : null;
    } catch {
      cache.delete(k);
      return null;
    } finally { sair(); }
  })();
  cache.set(k, p);
  return p;
}

/** As fotos (por id) dos produtos `ids`, lidas do servidor. Sem organização (Catálogo inteiro, protótipo) ou sem ids, não chama a base. */
export function useFotosDosProdutos(org: string | null, ids: readonly string[]): Record<string, string[]> {
  const chave = [...new Set(ids)].sort().join("|");
  const [lidas, setLidas] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!org || !chave) return undefined;
    let vivo = true;
    for (const id of chave.split("|")) {
      void fotosDe(org, id).then((f) => { if (vivo && f) setLidas((x) => (x[id] ? x : { ...x, [id]: f })); });
    }
    return () => { vivo = false; };
  }, [org, chave]);
  return lidas;
}
