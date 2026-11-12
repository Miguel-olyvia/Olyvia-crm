/**
 * @vitest-environment node
 *
 * 12/11: a verificação automática no Eticadata (erp-verificar-pagamentos). A ponte e a base são simuladas.
 */
import { describe, expect, it, vi } from "vitest";
import { configPonte, lerNaPonte, orgsDaPonte, verificarPagamentos, type LeituraPonte } from "./erpVerificar.ts";

const TOKEN = "t".repeat(40);
const env = (o: Record<string, string>) => (k: string) => o[k];
const paga = (numero: string): LeituraPonte => ({ ok: true, resposta: { encontrada: true, numero, estado: "paga", pago: 100, nif: "123456789", recibos: [{ n: "REC 1", data: "2026-11-10", valor: 100, meio: "Transferência" }] } });
const semEspera = { esperar: async () => {}, intervaloMs: 0 };

describe("configPonte", () => {
  it("sem endereço https ou com o token curto, a ponte não está configurada", () => {
    expect(configPonte(env({}))).toBeNull();
    expect(configPonte(env({ ERP_PONTE_URL: "http://x", ERP_PONTE_TOKEN: TOKEN }))).toBeNull();
    expect(configPonte(env({ ERP_PONTE_URL: "https://x", ERP_PONTE_TOKEN: "curto" }))).toBeNull();
  });
  it("leva o token e, com o Cloudflare Access, o Service Token; tira a barra do fim", () => {
    const c = configPonte(env({ ERP_PONTE_URL: "https://erp.ex.pt//", ERP_PONTE_TOKEN: TOKEN, ERP_PONTE_CF_ID: "id", ERP_PONTE_CF_SECRET: "s" }))!;
    expect(c.url).toBe("https://erp.ex.pt");
    expect(c.cabecalhos).toMatchObject({ Authorization: `Bearer ${TOKEN}`, "CF-Access-Client-Id": "id", "CF-Access-Client-Secret": "s" });
  });
});

describe("orgsDaPonte", () => {
  it("só aceita uuids; vazio é todas", () => {
    expect(orgsDaPonte(undefined)).toBeNull();
    expect(orgsDaPonte(" , lixo")).toBeNull();
    expect(orgsDaPonte("11111111-1111-1111-1111-111111111111, lixo")).toEqual(["11111111-1111-1111-1111-111111111111"]);
  });
});

describe("lerNaPonte", () => {
  const cfg = { url: "https://erp.ex.pt", cabecalhos: { Authorization: "Bearer x" } };
  const responde = (corpo: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;
  it("pede a fatura pelo número, codificado", async () => {
    const f = responde({ encontrada: false });
    await lerNaPonte(cfg, "FAT 15200126/538", f);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("https://erp.ex.pt/fatura?numero=FAT%2015200126%2F538");
  });
  it("encontrada ou não, é uma leitura", async () => {
    expect(await lerNaPonte(cfg, "FAT 1", responde({ encontrada: false }))).toMatchObject({ ok: true });
    expect(await lerNaPonte(cfg, "FAT 1", responde({ encontrada: true, estado: "paga" }))).toMatchObject({ ok: true });
  });
  it("o erro do ERP, uma resposta estranha ou a rede em baixo são falhas da ponte", async () => {
    expect(await lerNaPonte(cfg, "FAT 1", responde({ erro: "Sem ligação ao SQL Server" }, 502))).toEqual({ ok: false, erro: "Sem ligação ao SQL Server" });
    expect(await lerNaPonte(cfg, "FAT 1", responde({ ola: 1 }))).toMatchObject({ ok: false });
    const caiu = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await lerNaPonte(cfg, "FAT 1", caiu)).toEqual({ ok: false, erro: "a ponte não respondeu" });
  });
});

describe("verificarPagamentos", () => {
  it("lê cada fatura, grava a leitura e conta o que aconteceu", async () => {
    const acoes: Record<string, string> = { a: "validada", b: "por_pagar", c: "nao_existe", d: "nif_diferente", e: "erro", f: "ignorada" };
    const registar = vi.fn(async (id: string) => ({ acao: acoes[id], recibo: id === "a" ? "REC 1" : null }));
    const r = await verificarPagamentos({
      pendentes: Object.keys(acoes).map((id) => ({ fatura_id: id, numero: "FAT " + id })),
      ler: async (n) => paga(n), registar, ...semEspera,
    });
    expect(r).toEqual({ porVerificar: 6, lidas: 6, validadas: 1, porPagar: 1, naoExistem: 1, nifDiferente: 1, erros: 1, pagas: [{ numero: "FAT a", recibo: "REC 1" }] });
    expect(registar).toHaveBeenCalledWith("a", expect.objectContaining({ estado: "paga" }));
  });

  it("para logo que a ponte falha: não insiste com as outras faturas", async () => {
    const ler = vi.fn(async (n: string): Promise<LeituraPonte> => (n === "FAT 2" ? { ok: false, erro: "a ponte não respondeu" } : paga(n)));
    const registar = vi.fn(async () => ({ acao: "por_pagar" }));
    const r = await verificarPagamentos({ pendentes: [1, 2, 3].map((i) => ({ fatura_id: String(i), numero: "FAT " + i })), ler, registar, ...semEspera });
    expect(ler).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ lidas: 1, porPagar: 1, parou: "a ponte não respondeu" });
  });

  it("um erro ao gravar uma fatura não para as outras", async () => {
    const registar = vi.fn(async (id: string) => { if (id === "1") throw new Error("x"); return { acao: "validada" }; });
    const r = await verificarPagamentos({ pendentes: [1, 2].map((i) => ({ fatura_id: String(i), numero: "FAT " + i })), ler: async (n) => paga(n), registar, ...semEspera });
    expect(r).toMatchObject({ lidas: 2, erros: 1, validadas: 1 });
  });

  it("respeita o prazo da volta e espera entre leituras", async () => {
    let t = 0;
    const esperar = vi.fn(async (ms: number) => { t += ms; });
    const r = await verificarPagamentos({
      pendentes: [1, 2, 3, 4].map((i) => ({ fatura_id: String(i), numero: "FAT " + i })),
      ler: async (n) => paga(n), registar: async () => ({ acao: "por_pagar" }),
      agora: () => t, esperar, intervaloMs: 500, prazoMs: 1000,
    });
    expect(esperar).toHaveBeenCalledWith(500);
    expect(r).toMatchObject({ lidas: 2, parou: "o prazo da volta acabou" });
  });

  it("sem nada por verificar, não pergunta nada à ponte", async () => {
    const ler = vi.fn();
    expect(await verificarPagamentos({ pendentes: [], ler, registar: vi.fn() })).toMatchObject({ porVerificar: 0, lidas: 0 });
    expect(ler).not.toHaveBeenCalled();
  });
});
