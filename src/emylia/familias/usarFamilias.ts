// 20/11: as famílias da organização GRAVADAS NA BASE (substitui o armazém em memória). A lista tem três estados (a ler, erro com «Tentar de novo», ok);
// `guardar` e `apagar` escrevem pela base e relêem a lista sem a esconder. Uma resposta de um pedido antigo, ou que chega depois de desmontar, descarta-se.
// `useFamiliasDosProdutos` dá a marca «já está noutra família» para os produtos visíveis (só os ids da página, até 60).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResG } from "../atributosGestao";
import { AINDA_NAO } from "../fichaProdutoDados";
import {
  apagarFamilia, familiasDosProdutos, guardarFamilia, lerFamilias,
  type FamiliaGravada, type FamiliaParaGravar, type FamiliaResumo,
} from "./familiasDados";

export type EstadoFamilias = { k: "a-ler" } | { k: "erro"; erro: string } | { k: "ok"; familias: FamiliaResumo[] };
export interface Familias {
  estado: EstadoFamilias;
  tentar: () => void;
  guardar: (f: FamiliaParaGravar) => Promise<ResG<FamiliaGravada>>;
  apagar: (id: string) => Promise<ResG<unknown>>;
}

/** Depois de uma escrita falhar com estes códigos, a lista mudou noutro lado (não encontrada, repetida, alterada): relê-se. */
const RELER_DEPOIS: readonly string[] = ["CT003", "CT004"];

export function useFamilias(org: string): Familias {
  const [estado, setEstado] = useState<EstadoFamilias>({ k: "a-ler" });
  const pedido = useRef(0);
  const ler = useCallback(async (mostrarALer: boolean) => {
    const n = ++pedido.current;
    if (mostrarALer) setEstado({ k: "a-ler" });
    const r = await lerFamilias(org);
    if (n !== pedido.current) return;
    setEstado("erro" in r ? { k: "erro", erro: r.erro } : { k: "ok", familias: r.v });
  }, [org]);

  useEffect(() => {
    const contador = pedido;
    void ler(false);
    // desmontar (ou mudar de organização) invalida o pedido em curso
    return () => { contador.current++; };
  }, [ler]);

  const tentar = useCallback(() => { void ler(true); }, [ler]);
  const depoisDeEscrever = useCallback(async <T,>(r: ResG<T>): Promise<ResG<T>> => {
    if (!("erro" in r) || (r.codigo && RELER_DEPOIS.includes(r.codigo))) await ler(false);
    return r;
  }, [ler]);
  const guardar = useCallback(async (f: FamiliaParaGravar) => depoisDeEscrever(await guardarFamilia(org, f)), [org, depoisDeEscrever]);
  const apagar = useCallback(async (id: string) => depoisDeEscrever(await apagarFamilia(org, id)), [org, depoisDeEscrever]);
  return { estado, tentar, guardar, apagar };
}

export interface FamiliasDosProdutos { ocupados: ReadonlySet<string>; erro: string | null }
const NENHUM: ReadonlySet<string> = new Set();

/** Os produtos (destes ids) que já estão noutra família que não `familiaAtual`. Uma falha não bloqueia nada (a base volta a conferir ao gravar):
 *  fica sem marcas e com `erro`; a função ainda por criar na base não conta como erro. */
export function useFamiliasDosProdutos(org: string, ids: readonly string[], familiaAtual: string | null): FamiliasDosProdutos {
  const chave = ids.join(",");
  const [lido, setLido] = useState<{ chave: string; ocupados: ReadonlySet<string>; erro: string | null }>({ chave: "", ocupados: NENHUM, erro: null });
  useEffect(() => {
    let vivo = true;
    const pedidos = chave ? chave.split(",") : [];
    familiasDosProdutos(org, pedidos).then(
      (r) => {
        if (!vivo) return;
        if ("erro" in r) { setLido({ chave, ocupados: NENHUM, erro: r.erro === AINDA_NAO ? null : r.erro }); return; }
        setLido({ chave, ocupados: new Set([...r.v].filter(([, f]) => f.familiaId !== familiaAtual).map(([id]) => id)), erro: null });
      },
      (e: unknown) => { if (vivo) setLido({ chave, ocupados: NENHUM, erro: e instanceof Error && e.message ? e.message : "Não foi possível ver as famílias dos produtos." }); },
    );
    return () => { vivo = false; };
  }, [org, chave, familiaAtual]);
  return useMemo(() => (lido.chave === chave ? { ocupados: lido.ocupados, erro: lido.erro } : { ocupados: NENHUM, erro: null }), [lido, chave]);
}
