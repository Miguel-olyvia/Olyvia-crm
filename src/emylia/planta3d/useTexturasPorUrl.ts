// 24/11 (fase 1): as fotos de várias zonas de uma peça. Pede cada URL à cache de texturaProduto.ts (uma textura por foto, partilhada e libertada quando a última larga) e devolve as que já
// chegaram; uma foto que falha (404, rede) fica de fora e a zona fica na sua cor. `aoMudar`: pede um desenho (o ciclo do canvas é sob pedido).
// Quando a lista muda (a foto de UMA zona), as outras fotos não se largam nem o estado se limpa: pedem-se os URL novos primeiro e só depois se largam os que saíram, para as outras
// zonas não piscarem para a cor lisa. Só ao desmontar se largam todos.
import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { pedirTextura } from "./texturaProduto";

const VAZIO: ReadonlyMap<string, THREE.Texture> = new Map();

export function useTexturasPorUrl(urls: readonly string[], aoMudar?: () => void): ReadonlyMap<string, THREE.Texture> {
  const [prontas, setProntas] = useState<ReadonlyMap<string, THREE.Texture>>(VAZIO);
  const chave = [...new Set(urls)].sort().join("\n");
  /** O que este hook tem pedido à cache: URL → a função que o larga. */
  const pedidos = useRef(new Map<string, () => void>());
  useEffect(() => {
    const lista = chave ? chave.split("\n") : [];
    // 1. pedir os que faltam (um URL que já estava pedido não se pede outra vez)
    for (const url of lista) {
      if (pedidos.current.has(url)) continue;
      pedidos.current.set(url, pedirTextura(url, (t) => {
        setProntas((antes) => {
          if (!t) { if (!antes.has(url)) return antes; const m = new Map(antes); m.delete(url); return m; }
          if (antes.get(url) === t) return antes;
          return new Map(antes).set(url, t);
        });
        aoMudar?.();
      }));
    }
    // 2. só depois, largar os que saíram da lista e tirá-los do estado
    const sairam = [...pedidos.current.keys()].filter((url) => !lista.includes(url));
    if (sairam.length) {
      for (const url of sairam) { pedidos.current.get(url)?.(); pedidos.current.delete(url); }
      setProntas((antes) => {
        if (!sairam.some((url) => antes.has(url))) return antes;
        const m = new Map(antes);
        for (const url of sairam) m.delete(url);
        return m;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume `urls`; `aoMudar` é estável (invalidate do canvas)
  }, [chave]);
  // desmontar: larga tudo o que ainda se tinha pedido (o estado vai com o componente)
  useEffect(() => {
    const ativos = pedidos.current;
    return () => { ativos.forEach((largar) => largar()); ativos.clear(); };
  }, []);
  return prontas;
}
