// As fotografias da visita com a base ligada (9/11/2026, Rúben: «tirar fotografias no telemóvel»). Gravam-se em negocio_visita_fotos pelas
// funções neg_visita_fotos_ler, neg_visita_foto, neg_visita_foto_juntar e neg_visita_foto_apagar (20270110400000), por organização e número
// do negócio. A lista é partilhada pelas três etapas da página (exterior, interior, área): lê-se uma vez por negócio.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EtapaFotos } from "../motor";
import { fotoParaEnvio } from "./conversaReal";

export interface FotoVisita { id: string; etapa: EtapaFotos; em: string }
type RespostaRpc = { data: unknown; error: { message: string } | null };
const rpc = (fn: string, args: Record<string, unknown>): PromiseLike<RespostaRpc> =>
  (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<RespostaRpc> }).rpc(fn, args);

/** Uma mensagem de erro que se lê: a função ainda não aplicada na base diz-se assim. */
function mensagem(e: { message: string }): string {
  if (/neg_visita_fot/.test(e.message) && /(does not exist|Could not find|schema cache)/i.test(e.message))
    return "As fotografias da visita ainda não estão ligadas nesta base (falta aplicar o SQL 20270110400000).";
  return e.message;
}

const ETAPAS = new Set<string>(["exterior", "interior", "area"]);
export function fotosDaLista(data: unknown): FotoVisita[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((x) => {
    const f = x as Partial<FotoVisita>;
    return f && typeof f.id === "string" && typeof f.etapa === "string" && ETAPAS.has(f.etapa) ? [{ id: f.id, etapa: f.etapa as EtapaFotos, em: String(f.em ?? "") }] : [];
  });
}

/* ------------------------------------------------------------------ a lista, partilhada por negócio */
interface Estado { fotos: FotoVisita[]; erro: string | null; aEnviar: number; lida: boolean }
const VAZIO: Estado = { fotos: [], erro: null, aEnviar: 0, lida: false };
const estados = new Map<string, Estado>();
const ouvintes = new Map<string, Set<() => void>>();
const pedidos = new Map<string, number>();
const chaveDe = (org: string, numero: number) => `${org}|${numero}`;
const ler = (k: string): Estado => estados.get(k) ?? VAZIO;
function mudar(k: string, f: (e: Estado) => Estado) { estados.set(k, f(ler(k))); for (const o of ouvintes.get(k) ?? []) o(); }

async function recarregar(org: string, numero: number) {
  const k = chaveDe(org, numero), meu = (pedidos.get(k) ?? 0) + 1;
  pedidos.set(k, meu);
  const { data, error } = await rpc("neg_visita_fotos_ler", { p_organization_id: org, p_numero: numero });
  if (pedidos.get(k) !== meu) return; // chegou depois de um pedido mais recente
  mudar(k, (e) => (error ? { ...e, erro: mensagem(error), lida: true } : { ...e, fotos: fotosDaLista(data), erro: null, lida: true }));
}

/** As fotografias já lidas nesta sessão (pelo id): cada uma lê-se uma vez. */
const imagens = new Map<string, Promise<string>>();
export function imagemDaFoto(org: string, id: string): Promise<string> {
  const ja = imagens.get(id);
  if (ja) return ja;
  const p = Promise.resolve(rpc("neg_visita_foto", { p_organization_id: org, p_foto_id: id })).then(({ data, error }) => {
    if (error) throw new Error(mensagem(error));
    const f = data as { mime?: string; b64?: string } | null;
    if (!f?.mime || !f.b64) throw new Error("Fotografia indisponível.");
    return `data:${f.mime};base64,${f.b64}`;
  });
  imagens.set(id, p);
  p.catch(() => imagens.delete(id));
  return p;
}

/** As fotografias da visita de um negócio (com a base ligada): a lista, juntar (do ficheiro da câmara) e apagar.
 *  juntar e apagar devolvem se correu bem, para a contagem do negócio só mudar então. */
export function useFotosVisita(org: string | null, numero: number) {
  const k = org ? chaveDe(org, numero) : "";
  const subscrever = useCallback((o: () => void) => {
    if (!k) return () => {};
    let s = ouvintes.get(k);
    if (!s) { s = new Set(); ouvintes.set(k, s); }
    s.add(o);
    return () => { s!.delete(o); };
  }, [k]);
  const estado = useSyncExternalStore(subscrever, () => (k ? ler(k) : VAZIO));
  useEffect(() => { if (org && !ler(chaveDe(org, numero)).lida) void recarregar(org, numero); }, [org, numero]);

  const juntar = useCallback(async (etapa: EtapaFotos, f: File): Promise<boolean> => {
    if (!org) return false;
    mudar(k, (e) => ({ ...e, aEnviar: e.aEnviar + 1, erro: null }));
    try {
      const foto = await fotoParaEnvio(f);
      const { data, error } = await rpc("neg_visita_foto_juntar", { p_organization_id: org, p_numero: numero, p_etapa: etapa, p_foto: foto });
      if (error) throw new Error(mensagem(error));
      const [nova] = fotosDaLista([data]);
      if (nova) {
        imagens.set(nova.id, Promise.resolve(`data:${foto.mime};base64,${foto.b64}`));
        mudar(k, (e) => ({ ...e, fotos: [...e.fotos, nova] }));
      }
      return true;
    } catch (e) {
      mudar(k, (x) => ({ ...x, erro: e instanceof Error ? e.message : "Não foi possível guardar a fotografia." }));
      return false;
    } finally {
      mudar(k, (e) => ({ ...e, aEnviar: Math.max(0, e.aEnviar - 1) }));
    }
  }, [org, numero, k]);

  const apagar = useCallback(async (id: string): Promise<boolean> => {
    if (!org) return false;
    const { error } = await rpc("neg_visita_foto_apagar", { p_organization_id: org, p_foto_id: id });
    if (error) { mudar(k, (e) => ({ ...e, erro: mensagem(error) })); return false; }
    imagens.delete(id);
    mudar(k, (e) => ({ ...e, fotos: e.fotos.filter((x) => x.id !== id), erro: null }));
    return true;
  }, [org, k]);

  return { ...estado, juntar, apagar };
}
