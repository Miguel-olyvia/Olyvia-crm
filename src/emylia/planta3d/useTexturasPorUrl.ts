// 24/11 (fase 1): as fotos de várias zonas de uma peça. Pede cada URL à cache de texturaProduto.ts (uma textura por foto, partilhada e libertada quando a última larga) e devolve as que já
// chegaram; uma foto que falha (404, rede) fica de fora e a zona fica na sua cor. `aoMudar`: pede um desenho (o ciclo do canvas é sob pedido).
import { useEffect, useState } from "react";
import type * as THREE from "three";
import { pedirTextura } from "./texturaProduto";

const VAZIO: ReadonlyMap<string, THREE.Texture> = new Map();

export function useTexturasPorUrl(urls: readonly string[], aoMudar?: () => void): ReadonlyMap<string, THREE.Texture> {
  const [prontas, setProntas] = useState<ReadonlyMap<string, THREE.Texture>>(VAZIO);
  const chave = [...new Set(urls)].sort().join("\n");
  useEffect(() => {
    const lista = chave ? chave.split("\n") : [];
    if (!lista.length) { setProntas(VAZIO); return; }
    const largar = lista.map((url) => pedirTextura(url, (t) => {
      setProntas((antes) => {
        if (!t) { if (!antes.has(url)) return antes; const m = new Map(antes); m.delete(url); return m; }
        if (antes.get(url) === t) return antes;
        return new Map(antes).set(url, t);
      });
      aoMudar?.();
    }));
    return () => { largar.forEach((f) => f()); setProntas(VAZIO); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume `urls`; `aoMudar` é estável (invalidate do canvas)
  }, [chave]);
  return prontas;
}
