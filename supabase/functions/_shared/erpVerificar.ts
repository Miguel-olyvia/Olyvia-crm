// 12/11/2026: a verificação automática no Eticadata (Edge Function erp-verificar-pagamentos). Sem imports: corre no Deno e nos testes
// (vitest, Node). A Edge Function só liga isto ao Supabase e ao ambiente.
//
// Em cada volta: as faturas por pagar (neg_erp_por_verificar), uma a uma, perguntadas à ponte (GET /fatura?numero=…, a mesma da
// erp-fatura) e gravadas na base (neg_erp_registar_leitura, que valida o pagamento quando a fatura está paga). Para logo que a ponte
// falha (em baixo, o SQL Server parado, um token errado): não vale a pena insistir com as outras. Tem um prazo, abaixo do limite da
// Edge Function, e um intervalo entre leituras (a ponte aceita no máximo 120 por minuto, e o browser também lá vai).

export type ConfigPonte = { url: string; cabecalhos: Record<string, string> };

/** A ponte, dos segredos (os mesmos da erp-fatura). Null se não estiver configurada. */
export function configPonte(env: (k: string) => string | undefined): ConfigPonte | null {
  const url = (env("ERP_PONTE_URL") ?? "").trim().replace(/\/+$/, "");
  const token = (env("ERP_PONTE_TOKEN") ?? "").trim();
  if (!url.startsWith("https://") || token.length < 32) return null;
  const cabecalhos: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const id = env("ERP_PONTE_CF_ID"), segredo = env("ERP_PONTE_CF_SECRET");
  if (id && segredo) { cabecalhos["CF-Access-Client-Id"] = id; cabecalhos["CF-Access-Client-Secret"] = segredo; }
  return { url, cabecalhos };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ERP_PONTE_ORGS: as organizações cujas faturas estão na base do ERP que a ponte lê (separadas por vírgulas). Vazio: todas. */
export function orgsDaPonte(valor: string | undefined): string[] | null {
  const l = (valor ?? "").split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s));
  return l.length ? l : null;
}

export type LeituraPonte =
  | { ok: true; resposta: Record<string, unknown> }
  | { ok: false; erro: string };

/** Pergunta à ponte por uma fatura. Uma resposta com `erro` (o SQL Server em baixo, por exemplo) conta como falha da ponte. */
export async function lerNaPonte(cfg: ConfigPonte, numero: string, f: typeof fetch = fetch, esperaMs = 25_000): Promise<LeituraPonte> {
  try {
    const r = await f(`${cfg.url}/fatura?numero=${encodeURIComponent(numero)}`, { headers: cfg.cabecalhos, signal: AbortSignal.timeout(esperaMs) });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (!j || typeof j !== "object") return { ok: false, erro: `resposta inválida da ponte (HTTP ${r.status})` };
    if (typeof j.erro === "string") return { ok: false, erro: j.erro };
    if (typeof j.encontrada !== "boolean") return { ok: false, erro: `resposta inesperada da ponte (HTTP ${r.status})` };
    return { ok: true, resposta: j };
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.name === "TimeoutError" ? "a ponte não respondeu a tempo" : "a ponte não respondeu" };
  }
}

export type Pendente = { fatura_id: string; numero: string };
export type Registo = { acao?: string; msg?: string; recibo?: string | null };
export type Resumo = {
  porVerificar: number; lidas: number; validadas: number; porPagar: number; naoExistem: number; nifDiferente: number; erros: number;
  /** As faturas validadas agora, com o recibo. */
  pagas: { numero: string; recibo: string | null }[];
  /** Porque parou antes de as ler todas (a ponte em baixo, o prazo). */
  parou?: string;
};

export async function verificarPagamentos(o: {
  pendentes: Pendente[];
  ler: (numero: string) => Promise<LeituraPonte>;
  registar: (faturaId: string, leitura: Record<string, unknown>) => Promise<Registo>;
  prazoMs?: number; intervaloMs?: number; agora?: () => number; esperar?: (ms: number) => Promise<void>;
}): Promise<Resumo> {
  const agora = o.agora ?? (() => Date.now());
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const fim = agora() + (o.prazoMs ?? 110_000), intervalo = o.intervaloMs ?? 600;
  const R: Resumo = { porVerificar: o.pendentes.length, lidas: 0, validadas: 0, porPagar: 0, naoExistem: 0, nifDiferente: 0, erros: 0, pagas: [] };
  for (let i = 0; i < o.pendentes.length; i++) {
    if (i > 0 && intervalo > 0) await esperar(intervalo);
    if (agora() >= fim) { R.parou = "o prazo da volta acabou"; break; }
    const p = o.pendentes[i];
    const l = await o.ler(p.numero);
    if (!l.ok) { R.parou = l.erro; break; }
    R.lidas++;
    let g: Registo;
    try { g = await o.registar(p.fatura_id, l.resposta); } catch { R.erros++; continue; }
    switch (g.acao) {
      case "validada": R.validadas++; R.pagas.push({ numero: p.numero, recibo: g.recibo ?? null }); break;
      case "por_pagar": R.porPagar++; break;
      case "nao_existe": R.naoExistem++; break;
      case "nif_diferente": R.nifDiferente++; break;
      case "ignorada": break;
      default: R.erros++;
    }
  }
  return R;
}
