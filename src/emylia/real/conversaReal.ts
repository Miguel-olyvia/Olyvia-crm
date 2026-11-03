// A «Conversa com o cliente» das Operações, a mesma do portal do cliente (30/10/2026): com a base ligada lê e grava em negocio_mensagens pelas
// funções neg_mensagens_ler, neg_mensagem_enviar e neg_mensagens_marcar_lidas (por organização e número do negócio). O autor das mensagens da
// equipa é o utilizador com sessão (o nome vem do servidor). Sem a base (o protótipo de sempre) nada disto corre: a conversa fica a do estado local.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MensagemObra } from "../motor";

export interface LinhaMensagem { id: string; de: "cliente" | "empresa"; quem: string; t: string; em: string; lida: boolean;
  /** 3/11 (20270105200000): os ids das fotografias da mensagem (até 4); as antigas não têm */ fotos?: string[] }
type RespostaRpc = { data: unknown; error: { message: string } | null };
const rpc = (fn: string, args: Record<string, unknown>): PromiseLike<RespostaRpc> =>
  (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<RespostaRpc> }).rpc(fn, args);

const hhmm = (d: Date): string => d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
const mesmoDia = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** «hoje 11:21», «ontem 18:02» ou «29/10 09:40»: como a conversa do protótipo mostra a hora. */
export function horaDaMensagem(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (mesmoDia(d, agora)) return `hoje ${hhmm(d)}`;
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (mesmoDia(d, ontem)) return `ontem ${hhmm(d)}`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hhmm(d)}`;
}

export const mensagemDaLinha = (l: LinhaMensagem): MensagemObra => ({ id: l.id, de: l.de, quem: l.quem, t: l.t, q: horaDaMensagem(l.em), lida: l.lida,
  ...(Array.isArray(l.fotos) && l.fotos.length ? { fotos: l.fotos.map(String) } : {}) });

/* ------------------------------------------------------------------ 3/11 (Rúben): as fotografias da conversa (20270105200000) */
/** Uma fotografia pronta a enviar: o tipo e os bytes em base64 (sem o «data:…;base64,»). */
export interface FotoEnvio { mime: string; b64: string }
/** Até 4 por mensagem e 1,5 MB cada (a base recusa o resto). */
export const MAX_FOTOS = 4;
export const MAX_BYTES_FOTO = 1_572_864;
/** O tamanho em bytes de uma fotografia em base64. */
export const bytesDeB64 = (b64: string): number => Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
/** Um data URL («data:image/jpeg;base64,…») em {mime, b64}; null se não for uma imagem. */
export function fotoDeDataUrl(u: string): FotoEnvio | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(u);
  return m ? { mime: m[1], b64: m[2] } : null;
}

/** Reduz a fotografia (o lado maior a 1600 px, JPEG): o que o cliente envia é a prova do problema, por isso não tão pequena como a do protótipo. */
export function fotoParaEnvio(f: File, max = 1600): Promise<FotoEnvio> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onerror = () => falha(r.error ?? new Error("Não foi possível ler a fotografia."));
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        let foto: FotoEnvio | null = null;
        try { foto = fotoDeDataUrl(c.toDataURL("image/jpeg", 0.8)); } catch { /* sem canvas: fica a original */ }
        foto ??= fotoDeDataUrl(String(r.result));
        if (!foto) { falha(new Error("O ficheiro não é uma fotografia.")); return; }
        if (bytesDeB64(foto.b64) > MAX_BYTES_FOTO) { falha(new Error("A fotografia é grande demais (até 1,5 MB).")); return; }
        ok(foto);
      };
      img.onerror = () => falha(new Error("O ficheiro não é uma fotografia."));
      img.src = String(r.result);
    };
    r.readAsDataURL(f);
  });
}

/** As fotografias já lidas nesta sessão (pelo id): cada uma lê-se uma vez, nas Operações e no portal. */
const fotosLidas = new Map<string, Promise<string>>();
function lerFoto(fn: string, args: Record<string, unknown>, id: string): Promise<string> {
  const ja = fotosLidas.get(id);
  if (ja) return ja;
  const p = Promise.resolve(rpc(fn, args)).then(({ data, error }) => {
    if (error) throw new Error(error.message);
    const f = data as { mime?: string; b64?: string } | null;
    if (!f?.mime || !f.b64) throw new Error("Fotografia indisponível.");
    return `data:${f.mime};base64,${f.b64}`;
  });
  fotosLidas.set(id, p);
  // uma leitura que falhou volta a tentar-se da próxima vez
  p.catch(() => fotosLidas.delete(id));
  return p;
}
/** A fotografia de uma mensagem, nas Operações (pessoas.view). */
export const fotoDaEquipa = (org: string) => (id: string): Promise<string> => lerFoto("neg_mensagem_foto", { p_organization_id: org, p_foto_id: id }, id);
/** A fotografia de uma mensagem, no portal do cliente (só dos negócios dele). */
export const fotoDoPortal = (id: string): Promise<string> => lerFoto("portal_neg_mensagem_foto", { p_foto_id: id }, id);

function linhas(data: unknown): LinhaMensagem[] {
  return Array.isArray(data) ? (data as LinhaMensagem[]) : [];
}

export async function lerConversa(org: string, numero: number): Promise<MensagemObra[]> {
  const { data, error } = await rpc("neg_mensagens_ler", { p_organization_id: org, p_numero: numero });
  if (error) throw new Error(error.message);
  return linhas(data).map(mensagemDaLinha);
}

export async function enviarMensagem(org: string, numero: number, texto: string): Promise<MensagemObra> {
  const { data, error } = await rpc("neg_mensagem_enviar", { p_organization_id: org, p_numero: numero, p_texto: texto });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Resposta inesperada do servidor: a mensagem pode ter seguido, confirme na conversa.");
  return mensagemDaLinha(data as LinhaMensagem);
}

export async function marcarLidas(org: string, numero: number): Promise<void> {
  const { error } = await rpc("neg_mensagens_marcar_lidas", { p_organization_id: org, p_numero: numero });
  if (error) throw new Error(error.message);
}

const ATUALIZAR_CADA_MS = 10_000;

/** A conversa de um negócio na base: lê ao abrir, de 10 em 10 segundos e ao voltar ao separador. Sem `org` (sem base) não faz nada. */
export function useConversaReal(org: string | null, numero: number) {
  const [msgs, setMsgs] = useState<MensagemObra[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  // A conversa de agora (organização e negócio) e o número da última leitura pedida: uma resposta que já não é a de agora, ou que chega depois
  // de outra mais recente, deita-se fora (senão a mensagem enviada desaparecia, ou aparecia a conversa do negócio anterior).
  const atual = useRef("");
  const pedido = useRef(0);
  atual.current = `${org ?? ""}|${numero}`;

  const recarregar = useCallback(async () => {
    if (!org) return;
    const chave = `${org}|${numero}`;
    const meu = ++pedido.current;
    try {
      const lidas = await lerConversa(org, numero);
      if (vivo.current && atual.current === chave && meu === pedido.current) { setMsgs(lidas); setErro(null); }
    } catch (e) {
      if (vivo.current && atual.current === chave && meu === pedido.current) setErro(e instanceof Error ? e.message : "Não foi possível ler a conversa.");
    }
  }, [org, numero]);

  useEffect(() => {
    setMsgs([]);
    setErro(null);
    if (!org) return;
    void recarregar();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void recarregar(); }, ATUALIZAR_CADA_MS);
    const aoVoltar = () => { if (document.visibilityState === "visible") void recarregar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [org, numero, recarregar]);

  /** Envia e, se correu bem, volta a ler a conversa (a leitura mais recente vence); devolve se correu bem, para o campo só se apagar nesse caso. */
  const enviar = useCallback(async (texto: string): Promise<boolean> => {
    if (!org) return false;
    setAEnviar(true);
    try {
      await enviarMensagem(org, numero, texto);
      await recarregar();
      return true;
    } catch (e) {
      if (vivo.current) setErro(e instanceof Error ? e.message : "Não foi possível enviar a mensagem.");
      return false;
    } finally {
      if (vivo.current) setAEnviar(false);
    }
  }, [org, numero, recarregar]);

  const marcarComoLidas = useCallback(async () => {
    if (!org) return;
    try {
      await marcarLidas(org, numero);
      if (vivo.current) { setMsgs((m) => m.map((x) => (x.de === "cliente" ? { ...x, lida: true } : x))); setErro(null); }
    } catch (e) {
      if (vivo.current) setErro(e instanceof Error ? e.message : "Não foi possível marcar como lidas.");
    }
  }, [org, numero]);

  return { msgs, erro, aEnviar, enviar, marcarComoLidas };
}
