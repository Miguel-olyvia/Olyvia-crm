// 22/10/2026: as faturas no Eticadata. A Olyvia não emite (a API com certificação exige a plataforma certificada): o Financeiro emite
// no ERP, regista aqui o número e a Olyvia lê no ERP se já foi paga. A leitura é a de server/eticadataLeitura.ts (/api/erp/fatura),
// que só existe no servidor de desenvolvimento, neste PC; sem ele, a fatura regista-se na mesma e o pagamento valida-se à mão.
// 26/10: no site publicado (e em dev, quando este PC não chega ao ERP) a leitura vai pela Edge Function erp-fatura, que pergunta à
// ponte na rede da empresa (ponte-eticadata/). A resposta é a mesma nos dois caminhos. O supabase-js só se carrega aí (import
// dinâmico): o motor importa este ficheiro e o protótipo sem base não o pode puxar.
import { orgDoModoReal } from "./acessosPortal";

export type EstadoErp = "paga" | "paga em parte" | "vencida" | "por pagar" | "anulada";
export type ReciboErp = { n: string; data: string; valor: number; meio: string };
/** O que a Olyvia guarda do ERP sobre a fatura do negócio (a última leitura). */
export type InfoErp = {
  estado: EstadoErp; data: string; total: number; pago: number; emFalta: number; vencimento: string; atcud: string;
  nif: string; recibos: ReciboErp[]; bd: string; lidaEm: string;
};
/** F3 (28/10): a organização para a leitura do ERP no Pipeline e em /negocios (o modo real do portal não se liga lá). */
let orgErp: string | null = null;
export const definirOrgErp = (org: string | null): void => { orgErp = org; };
/** F3: a última leitura do ERP de cada fatura (o estado no Eticadata não se grava na base: sobrevive à releitura do negócio). */
const lidas = new Map<string, InfoErp>();
export const lembrarErp = (numero: string, info: InfoErp): void => { lidas.set(numero.trim(), info); };
export const erpLembrado = (numero: string | null | undefined): InfoErp | null => (numero ? lidas.get(numero.trim()) ?? null : null);

export type LeituraErp =
  | { ok: true; info: InfoErp }
  | { ok: false; motivo: "nao_existe" | "sem_ligacao"; msg: string };

/** A resposta do ERP (a mesma da rota deste PC e da ponte) como leitura. */
function interpretar(j: { erro?: string; encontrada?: boolean; bd?: string } & Partial<InfoErp> | null, numero: string): LeituraErp {
  if (!j || j.erro) return { ok: false, motivo: "sem_ligacao", msg: j?.erro || "Resposta inválida do Eticadata." };
  if (!j.encontrada) return { ok: false, motivo: "nao_existe", msg: `A fatura ${numero} não existe no Eticadata (${j.bd}).` };
  const { estado, data, total, pago, emFalta, vencimento, atcud, nif, recibos, bd, lidaEm } = j as InfoErp;
  return { ok: true, info: { estado, data, total, pago, emFalta, vencimento, atcud, nif, recibos, bd, lidaEm } };
}

/** Pela rota /api/erp/fatura do servidor de desenvolvimento (só neste PC, na rede do ERP). */
async function lerNestePc(numero: string): Promise<LeituraErp> {
  let r: Response;
  try {
    r = await fetch("/api/erp/fatura?numero=" + encodeURIComponent(numero), { headers: { Accept: "application/json" } });
  } catch {
    return { ok: false, motivo: "sem_ligacao", msg: "Sem ligação ao Eticadata." };
  }
  // fora do servidor de desenvolvimento a rota não existe (vem a página ou um 404)
  if (!(r.headers.get("content-type") || "").includes("application/json"))
    return { ok: false, motivo: "sem_ligacao", msg: "A leitura do Eticadata só funciona no PC ligado à rede do ERP." };
  return interpretar(await r.json().catch(() => null), numero);
}

/** 26/10: pela Edge Function erp-fatura e pela ponte na rede da empresa (o site publicado). */
async function lerPelaPonte(numero: string, org: string): Promise<LeituraErp> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke("erp-fatura", { body: { organizacao_id: org, numero } });
    if (!error) return interpretar(data, numero);
    // um erro HTTP da função traz a resposta em `context` (o motivo em `erro`)
    const ctx = (error as { context?: { json?: () => Promise<{ erro?: unknown }> } }).context;
    const corpo = typeof ctx?.json === "function" ? await ctx.json().catch(() => null) : null;
    return { ok: false, motivo: "sem_ligacao", msg: typeof corpo?.erro === "string" ? corpo.erro : "Sem ligação ao Eticadata." };
  } catch {
    return { ok: false, motivo: "sem_ligacao", msg: "Sem ligação ao Eticadata." };
  }
}

/** Lê no Eticadata o estado de uma fatura, pelo número tal como lá aparece (ex.: "FAT 15200126/538"). Em dev, primeiro neste PC;
 *  depois (e sempre no site publicado) pela ponte, quando há organização real. */
export async function lerFaturaErp(numero: string): Promise<LeituraErp> {
  const n = numero.trim(), org = orgDoModoReal() ?? orgErp;
  // 26/10: no protótipo sem conta (/sem-conta, só em desenvolvimento) os dados são falsos: não se lê o Eticadata real
  let semConta = false;
  try { semConta = import.meta.env.DEV && window.location.pathname === "/sem-conta"; } catch { /* sem window */ }
  if (semConta) return { ok: false, motivo: "sem_ligacao", msg: "No protótipo sem conta (dados de teste) não se lê o Eticadata." };
  if (import.meta.env.DEV) {
    const aqui = await lerNestePc(n);
    if ("info" in aqui || aqui.motivo === "nao_existe" || !org) return aqui;
  }
  if (!org) return { ok: false, motivo: "sem_ligacao", msg: "A leitura do Eticadata precisa de uma organização real." };
  return lerPelaPonte(n, org);
}

const dm = (iso: string) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
/** O estado numa frase curta, para o passo e para o Financeiro. */
export function resumoErp(i: InfoErp): string {
  const e = (x: number) => x.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (i.estado === "paga") return `paga${i.recibos.length ? " a " + dm(i.recibos[i.recibos.length - 1].data) : ""}`;
  if (i.estado === "anulada") return "anulada no ERP";
  if (i.estado === "paga em parte") return `paga em parte · faltam ${e(i.emFalta)} €`;
  if (i.estado === "vencida") return `vencida${i.vencimento ? " a " + dm(i.vencimento) : ""} · ${e(i.emFalta)} € em falta`;
  return `por pagar${i.vencimento ? " · vence a " + dm(i.vencimento) : ""} · ${e(i.emFalta)} € em falta`;
}
