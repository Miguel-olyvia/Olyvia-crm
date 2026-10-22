// 22/10/2026: as faturas no Eticadata. A Olyvia não emite (a API com certificação exige a plataforma certificada): o Financeiro emite
// no ERP, regista aqui o número e a Olyvia lê no ERP se já foi paga. A leitura é a de server/eticadataLeitura.ts (/api/erp/fatura),
// que só existe no servidor de desenvolvimento, neste PC; sem ele, a fatura regista-se na mesma e o pagamento valida-se à mão.

export type EstadoErp = "paga" | "paga em parte" | "vencida" | "por pagar" | "anulada";
export type ReciboErp = { n: string; data: string; valor: number; meio: string };
/** O que a Olyvia guarda do ERP sobre a fatura do negócio (a última leitura). */
export type InfoErp = {
  estado: EstadoErp; data: string; total: number; pago: number; emFalta: number; vencimento: string; atcud: string;
  nif: string; recibos: ReciboErp[]; bd: string; lidaEm: string;
};
export type LeituraErp =
  | { ok: true; info: InfoErp }
  | { ok: false; motivo: "nao_existe" | "sem_ligacao"; msg: string };

/** Lê no Eticadata o estado de uma fatura, pelo número tal como lá aparece (ex.: "FAT 15200126/538"). */
export async function lerFaturaErp(numero: string): Promise<LeituraErp> {
  let r: Response;
  try {
    r = await fetch("/api/erp/fatura?numero=" + encodeURIComponent(numero.trim()), { headers: { Accept: "application/json" } });
  } catch {
    return { ok: false, motivo: "sem_ligacao", msg: "Sem ligação ao Eticadata." };
  }
  // fora do servidor de desenvolvimento a rota não existe (vem a página ou um 404)
  if (!(r.headers.get("content-type") || "").includes("application/json"))
    return { ok: false, motivo: "sem_ligacao", msg: "A leitura do Eticadata só funciona no PC ligado à rede do ERP." };
  const j = await r.json().catch(() => null);
  if (!j || j.erro) return { ok: false, motivo: "sem_ligacao", msg: j?.erro || "Resposta inválida do Eticadata." };
  if (!j.encontrada) return { ok: false, motivo: "nao_existe", msg: `A fatura ${numero.trim()} não existe no Eticadata (${j.bd}).` };
  const { estado, data, total, pago, emFalta, vencimento, atcud, nif, recibos, bd, lidaEm } = j;
  return { ok: true, info: { estado, data, total, pago, emFalta, vencimento, atcud, nif, recibos, bd, lidaEm } };
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
