// As fotografias da obra fora do JSON (auditoria de 19/11, Lote 3, dados; migration 20270125010000). Com a base ligada, cada fotografia
// tirada na obra (o registo do técnico, «dar por feita», os imprevistos, o Estúdio da obra) vai a 1600 px para negocio_obra_fotos pela
// função neg_obra_foto_juntar; no estado da obra fica só a referência «obrafoto:<id>». O ecrã mostra-a pela função neg_obra_foto (a
// equipa) ou portal_neg_obra_foto (o cliente), uma vez por sessão (cache por id).
// As fotografias antigas (um data URL dentro do JSON) e as de exemplo continuam a ver-se como estão. Sem a base (o protótipo) a fotografia
// fica como antes: um data URL pequeno (480 px) no estado. Numa base sem o SQL aplicado, também.
// O supabase-js só se carrega quando é preciso (com a base ligada): as peças que mostram fotografias também servem o protótipo e o RH de
// exemplo, que não têm base (como acessosPortal.ts).
import { orgDoModoReal } from "../acessosPortal";

/** Uma fotografia pronta a enviar: o tipo e os bytes em base64 (como conversaReal.ts). */
export interface FotoEnvio { mime: string; b64: string }

type RespostaRpc = { data: unknown; error: { message: string; code?: string } | null };
const rpc = async (fn: string, args: Record<string, unknown>): Promise<RespostaRpc> => {
  const { supabase } = await import("@/integrations/supabase/client");
  return (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<RespostaRpc> }).rpc(fn, args);
};
const reduzir = async (f: Blob): Promise<FotoEnvio> => (await import("./conversaReal")).fotoParaEnvio(f as File);

/* ------------------------------------------------------------------ a referência */
export const PREFIXO_FOTO_OBRA = "obrafoto:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** O id da fotografia guardada na base; null se não é uma referência (um data URL antigo, uma de exemplo, um URL). */
export function idDaFotoObra(src: unknown): string | null {
  if (typeof src !== "string" || !src.startsWith(PREFIXO_FOTO_OBRA)) return null;
  const id = src.slice(PREFIXO_FOTO_OBRA.length);
  return UUID.test(id) ? id : null;
}
export const eFotoObraGuardada = (src: unknown): src is string => idDaFotoObra(src) !== null;
export const refDaFotoObra = (id: string): string => PREFIXO_FOTO_OBRA + id;

/* ------------------------------------------------------------------ quem lê: a equipa (por defeito) ou o cliente (o portal) */
let doPortal = false;
/** O portal do cliente (ClientPortalNegocio) lê as fotografias pela função do portal; o resto da app, pela da equipa. */
export function definirFotosObraDoPortal(v: boolean): void { doPortal = v; }

/** A função ainda não aplicada na base diz-se assim (a app continua como antes). */
export const semFuncaoFotosObra = (e: { message: string }): boolean =>
  /(neg_obra_foto|portal_neg_obra_foto)/.test(e.message) && /(does not exist|Could not find|schema cache)/i.test(e.message);
function mensagem(e: { message: string }): string {
  if (semFuncaoFotosObra(e)) return "As fotografias da obra ainda não estão ligadas nesta base (falta aplicar o SQL 20270125010000).";
  return e.message;
}

/* ------------------------------------------------------------------ mostrar */
/** Os bytes em base64 como um URL para o <img>: um blob (leve na memória) ou, sem ele (testes), o data URL. */
export function urlDaImagem(f: FotoEnvio): string {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof atob === "function" && typeof Blob !== "undefined") {
    try {
      const bin = atob(f.b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([u8], { type: f.mime }));
    } catch { /* fica o data URL */ }
  }
  return `data:${f.mime};base64,${f.b64}`;
}

/** As fotografias já lidas nesta sessão (pelo id): cada uma lê-se uma vez. */
const imagens = new Map<string, Promise<string>>();

/** O endereço para mostrar uma fotografia da obra: a referência lê-se da base; um data URL ou um URL antigo fica como está. */
export function imagemDaFotoObra(src: string): Promise<string> {
  const id = idDaFotoObra(src);
  if (!id) return Promise.resolve(src);
  const ja = imagens.get(id);
  if (ja) return ja;
  const org = orgDoModoReal();
  const p = (doPortal ? Promise.resolve(rpc("portal_neg_obra_foto", { p_foto_id: id }))
    : org ? Promise.resolve(rpc("neg_obra_foto", { p_organization_id: org, p_foto_id: id }))
    : Promise.resolve<RespostaRpc>({ data: null, error: { message: "Fotografia indisponível sem a base ligada." } }))
    .then(({ data, error }) => {
      if (error) throw new Error(mensagem(error));
      const f = data as { mime?: string; b64?: string } | null;
      if (!f?.mime || !f.b64) throw new Error("Fotografia indisponível.");
      return urlDaImagem({ mime: f.mime, b64: f.b64 });
    });
  imagens.set(id, p);
  // uma leitura que falhou volta a tentar-se da próxima vez
  p.catch(() => imagens.delete(id));
  return p;
}

/** Só para os testes: esquece as fotografias lidas. */
export function esquecerFotosObra(): void { imagens.clear(); }

/* ------------------------------------------------------------------ guardar */
/** Um data URL (a câmara do Hoje) em Blob. */
export function blobDeDataUrl(u: string): Blob | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(u);
  if (!m) return null;
  try {
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: m[1] });
  } catch { return null; }
}

/** Reduz uma fotografia a `max` px (dataURL JPEG) para caber no estado do protótipo (sem a base). */
export function lerFotoLocal(f: Blob, max = 480): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onerror = () => falha(r.error);
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        try { ok(c.toDataURL("image/jpeg", 0.72)); } catch { ok(String(r.result)); }
      };
      img.onerror = () => ok(String(r.result));
      img.src = String(r.result);
    };
    r.readAsDataURL(f);
  });
}

/** Há base ligada para guardar as fotografias da obra (a equipa, numa organização real)? */
export const guardaNaBase = (): boolean => !!orgDoModoReal() && !doPortal;

/**
 * Prepara uma fotografia da obra (do ficheiro ou da câmara) para o estado. Com a base ligada guarda-a (1600 px) e devolve a referência
 * «obrafoto:<id>»; sem a base, ou numa base sem o SQL 20270125010000, devolve um data URL pequeno, como antes. Erro (sem permissão, sem
 * rede, ficheiro que não é imagem): rejeita com a mensagem, para o ecrã a mostrar.
 */
export async function guardarFotoObra(numero: number | null | undefined, foto: Blob | string): Promise<string> {
  const blob = typeof foto === "string" ? blobDeDataUrl(foto) : foto;
  if (!blob) throw new Error("O ficheiro não é uma fotografia.");
  const org = orgDoModoReal();
  if (!org || doPortal || numero == null) return lerFotoLocal(blob);
  const env = await reduzir(blob);
  const { data, error } = await rpc("neg_obra_foto_juntar", { p_organization_id: org, p_numero: numero, p_foto: env });
  if (error) {
    if (semFuncaoFotosObra(error)) return lerFotoLocal(blob);
    throw new Error(mensagem(error));
  }
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !UUID.test(id)) throw new Error("Resposta inesperada do servidor: a fotografia pode não ter ficado guardada.");
  imagens.set(id, Promise.resolve(urlDaImagem(env)));
  return refDaFotoObra(id);
}

/** Tira uma fotografia guardada que ainda não foi registada na obra (a pré-visualização apagada antes de enviar). Nunca lança: a base só
 *  a apaga se foi quem chama a juntá-la e a obra gravada ainda não a usa. Um data URL não precisa de nada. */
export async function apagarFotoObra(src: string): Promise<void> {
  const id = idDaFotoObra(src), org = orgDoModoReal();
  if (!id || !org || doPortal) return;
  try { await rpc("neg_obra_foto_apagar", { p_organization_id: org, p_foto_id: id }); } catch { /* fica na base, sem uso */ }
  imagens.delete(id);
}
