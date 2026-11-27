// 26/11: a família para a vista com 3D (cat_ler_familia_vista via lerFamiliaVista): três estados (a ler, erro com «tentar» e o código da base, ok). Mesma convenção de
// usarFamilias.ts: uma resposta de um pedido antigo, ou que chega depois de desmontar ou de mudar de família, descarta-se. Uma promessa rejeitada também é um erro.
import { useCallback, useEffect, useRef, useState } from "react";
import { lerFamiliaVista } from "./familiasDados";
import type { FamiliaVista } from "./escolhaVariacao";

export type EstadoFamiliaVista = { k: "a-ler" } | { k: "erro"; erro: string; codigo?: string } | { k: "ok"; familia: FamiliaVista };
export interface UsoFamiliaVista { estado: EstadoFamiliaVista; tentar: () => void }

const ERRO = "Não foi possível ler a família.";

export function useFamiliaVista(org: string, id: string): UsoFamiliaVista {
  const [estado, setEstado] = useState<EstadoFamiliaVista>({ k: "a-ler" });
  const pedido = useRef(0);
  const ler = useCallback(async () => {
    const n = ++pedido.current;
    setEstado({ k: "a-ler" });
    let r: Awaited<ReturnType<typeof lerFamiliaVista>>;
    try { r = await lerFamiliaVista(org, id); } catch (e) { r = { ok: false, erro: e instanceof Error && e.message ? e.message : ERRO }; }
    if (n !== pedido.current) return;
    setEstado("erro" in r ? { k: "erro", erro: r.erro, ...(r.codigo ? { codigo: r.codigo } : {}) } : { k: "ok", familia: r.v });
  }, [org, id]);

  useEffect(() => {
    const contador = pedido;
    void ler();
    // desmontar (ou mudar de organização ou de família) invalida o pedido em curso
    return () => { contador.current++; };
  }, [ler]);

  const tentar = useCallback(() => { void ler(); }, [ler]);
  return { estado, tentar };
}
