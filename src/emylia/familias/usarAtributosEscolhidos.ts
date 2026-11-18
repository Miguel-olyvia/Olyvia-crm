// Famílias (interface): a leitura dos atributos de cada produto escolhido (cat_ler_atributos_produto, via lerAtributosProduto). Cache em memória por organização e
// produto, no máximo MAX_CONCORRENTES pedidos em simultâneo (com 60 produtos não se disparam 60 pedidos de uma vez), estado de carregamento e de erro POR produto,
// e «tentar» repete só esse. Só lê: nunca escreve.
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { AtributoProduto } from "../v2/catalogoModelo";
import { lerAtributosProduto } from "../real/produtosPaginados";

export const MAX_CONCORRENTES = 4;

export type EstadoAtributos = { k: "a-ler" } | { k: "ok"; attrs: AtributoProduto[] } | { k: "erro"; erro: string };
/** A cache dos atributos já lidos (chave «organização|produto»). Quem a cria (a página) decide quanto dura: recarregar a página esvazia-a. */
export type CacheAtributos = Map<string, AtributoProduto[]>;
export const criarCacheAtributos = (): CacheAtributos => new Map();

interface Pedido { chave: string; org: string; id: string }
const chaveDe = (org: string, id: string): string => `${org}|${id}`;

export interface AtributosEscolhidos { estados: ReadonlyMap<string, EstadoAtributos>; tentar: (id: string) => void }

/** Lê (com a cache) os atributos de `ids` enquanto `ativo`. Um produto tirado da escolha enquanto espera na fila não chega a ser lido. */
export function useAtributosEscolhidos(org: string | null, ids: readonly string[], ativo: boolean, cache: CacheAtributos): AtributosEscolhidos {
  const [versao, refrescar] = useReducer((n: number) => n + 1, 0);
  const erros = useRef(new Map<string, string>()), fila = useRef<Pedido[]>([]), emVoo = useRef(new Set<string>());
  const queridos = useRef(new Set<string>()), vivo = useRef(true);

  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const bombear = useCallback(function bombear(): void {
    while (emVoo.current.size < MAX_CONCORRENTES && fila.current.length > 0) {
      const p = fila.current.shift();
      if (!p || !queridos.current.has(p.chave) || cache.has(p.chave) || emVoo.current.has(p.chave)) continue;
      emVoo.current.add(p.chave);
      lerAtributosProduto(p.org, p.id)
        .catch((e: unknown) => ({ ok: false as const, erro: e instanceof Error && e.message ? e.message : "Não foi possível ler os atributos." }))
        .then((r) => {
          emVoo.current.delete(p.chave);
          if ("erro" in r) erros.current.set(p.chave, r.erro); else cache.set(p.chave, r.v);
          if (!vivo.current) return;
          refrescar();
          bombear();
        });
    }
  }, [cache]);

  const chaveIds = ids.join("\u0001");
  useEffect(() => {
    if (!ativo || !org) return;
    const mine = ids.map((id) => chaveDe(org, id));
    queridos.current = new Set(mine);
    ids.forEach((id, i) => {
      const chave = mine[i];
      if (cache.has(chave) || erros.current.has(chave) || emVoo.current.has(chave) || fila.current.some((p) => p.chave === chave)) return;
      fila.current.push({ chave, org, id });
    });
    bombear();
    // `ids` entra pela chave (chaveIds): a lista pode ser um array novo em cada render sem repetir o efeito
  }, [ativo, org, chaveIds, cache, bombear]); // eslint-disable-line react-hooks/exhaustive-deps

  const tentar = useCallback((id: string) => {
    if (!org) return;
    const chave = chaveDe(org, id);
    erros.current.delete(chave);
    queridos.current.add(chave);
    if (!fila.current.some((p) => p.chave === chave)) fila.current.push({ chave, org, id });
    refrescar();
    bombear();
  }, [org, bombear]);

  // o mesmo Map enquanto nada muda (quem o usa memoriza o que deriva dele); `versao` sobe quando chega uma resposta ou se tenta de novo
  const estados = useMemo(() => {
    const m = new Map<string, EstadoAtributos>();
    for (const id of chaveIds ? chaveIds.split("\u0001") : []) {
      const chave = org ? chaveDe(org, id) : id, lidos = cache.get(chave), erro = erros.current.get(chave);
      m.set(id, lidos ? { k: "ok", attrs: lidos } : erro !== undefined ? { k: "erro", erro } : { k: "a-ler" });
    }
    return m;
  }, [chaveIds, org, cache, versao]); // eslint-disable-line react-hooks/exhaustive-deps -- `versao` não se lê dentro: serve só para refazer o Map quando a cache ou os erros (refs) mudam
  return { estados, tentar };
}
