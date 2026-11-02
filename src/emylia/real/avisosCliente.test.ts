import { describe, expect, it, vi } from "vitest";
import type { Negocio } from "../motor";
import { avisarCliente, avisosDoNegocio, htmlAviso } from "./avisosCliente";

/** Um negócio mínimo com o que os avisos leem. */
function negocio(x: Partial<Negocio> & { orc?: unknown; obra?: unknown; fin?: unknown } = {}): Negocio {
  return {
    id: 1014, nome: "Ricardo Belchior", tel: "", f: { email: "cliente@example.com" }, hist: [], perdido: false,
    orc: { enviada: "02/11/2026", aceite: "02/11/2026", contrato: "assinado" },
    fin: { fatura: null, pago: false, recibo: null, tranches: [] },
    obra: { plano: null, auto: null },
    ...x,
  } as unknown as Negocio;
}

const tarefa = (fase: number, estado?: string) => ({ nome: "t", fase, dia: 0, dur: 1, ...(estado ? { exec: { estado } } : {}) });

describe("avisosDoNegocio", () => {
  it("sem proposta enviada não há avisos", () => {
    expect(avisosDoNegocio(negocio({ orc: null as never }))).toEqual([]);
  });

  it("fatura por pagar e, depois, paga", () => {
    const d = negocio({ fin: { fatura: null, pago: false, recibo: null, tranches: [{ id: "a1", numero: "FT 2026/9", data: "2026-11-02", valor: 1708, tranche: "adj" }] } });
    expect(avisosDoNegocio(d).map((a) => a.chave)).toEqual(["fatura:a1"]);
    d.fin.tranches![0].pagamento = { data: "2026-11-02" } as never;
    expect(avisosDoNegocio(d).map((a) => a.chave)).toEqual(["fatura:a1", "pago:a1"]);
  });

  it("as faturas de demonstração não avisam", () => {
    const d = negocio({ fin: { fatura: null, pago: false, recibo: null, tranches: [{ id: "x", numero: "FT", data: "", valor: 1, tranche: "", daDemo: true }] } });
    expect(avisosDoNegocio(d)).toEqual([]);
  });

  it("plano, início do serviço, fases concluídas e o auto", () => {
    const d = negocio({ obra: { plano: { estado: "aprovado", dia: 0, tasks: [tarefa(1), tarefa(2)] }, auto: null } });
    expect(avisosDoNegocio(d).map((a) => a.chave)).toEqual(["plano"]);
    d.obra.plano!.estado = "em curso";
    d.obra.plano!.tasks[0] = tarefa(1, "validada") as never;
    expect(avisosDoNegocio(d).map((a) => a.chave)).toEqual(["plano", "servico-inicio", "fase:1"]);
    d.obra.plano!.estado = "concluída";
    d.obra.plano!.tasks[1] = tarefa(2, "validada") as never;
    d.obra.auto = { n: "AR 2026/1014", estado: "por assinar" } as never;
    expect(avisosDoNegocio(d).map((a) => a.chave)).toEqual(["plano", "servico-inicio", "fase:1", "fase:2", "auto:AR 2026/1014"]);
  });

  it("sem contrato assinado, só as faturas", () => {
    const d = negocio({ orc: { enviada: "x", aceite: "x", contrato: "enviado" }, obra: { plano: { estado: "em curso", dia: 0, tasks: [] }, auto: null } });
    expect(avisosDoNegocio(d)).toEqual([]);
  });

  it("o email escapa o texto e leva o link", () => {
    const h = htmlAviso({ chave: "k", assunto: "a", linhas: ["<b>1</b>"] }, "Ana <x>", "Empresa & Cª", "https://x.pt/a?b=1");
    expect(h).toContain("&lt;b&gt;1&lt;/b&gt;");
    expect(h).toContain("Olá Ana,");
    expect(h).toContain("Empresa &amp; Cª");
    expect(h).toContain('href="https://x.pt/a?b=1"');
  });
});

describe("avisarCliente", () => {
  const avisoFatura = () => negocio({ fin: { fatura: null, pago: false, recibo: null, tranches: [{ id: "a1", numero: "FT 2026/9", data: "", valor: 10, tranche: "" }] } });

  it("envia só as chaves novas e regista o resultado", async () => {
    const rpc = vi.fn(async (f: string) => (f === "neg_avisos_cliente_registar" ? { data: { primeira: false, novas: ["fatura:a1"] }, error: null } : { data: null, error: null }));
    const invoke = vi.fn(async () => ({ data: { success: true }, error: null }));
    const sb = { rpc, functions: { invoke } } as never;
    const r = await avisarCliente(sb, "org", "neg-1", avisoFatura(), "https://site.pt/", "Empresa");
    expect(r).toEqual({ enviados: ["fatura:a1"], erros: [] });
    expect(invoke).toHaveBeenCalledWith("send-email", { body: expect.objectContaining({ to: "cliente@example.com", subject: "Fatura FT 2026/9 por pagar" }) });
    expect((invoke.mock.calls[0] as unknown as [string, { body: { html: string } }])[1].body.html).toContain("https://site.pt/client-portal/negocios/neg-1");
    expect(rpc).toHaveBeenLastCalledWith("neg_avisos_cliente_resultado", { p_org: "org", p_negocio_id: "neg-1", p_chave: "fatura:a1", p_enviado: true, p_erro: null });
    // a mesma coisa outra vez na mesma sessão: não pergunta à base
    rpc.mockClear();
    await avisarCliente(sb, "org", "neg-1", avisoFatura(), "https://site.pt/", "Empresa");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem email do cliente não faz nada", async () => {
    const rpc = vi.fn();
    const d = avisoFatura(); d.f = {};
    expect(await avisarCliente({ rpc } as never, "org", "neg-2", d, "https://site.pt")).toEqual({ enviados: [], erros: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("um email que falha fica registado como falha", async () => {
    const rpc = vi.fn(async (f: string) => (f === "neg_avisos_cliente_registar" ? { data: { novas: ["fatura:a1"] }, error: null } : { data: null, error: null }));
    const invoke = vi.fn(async () => ({ data: { error: "SMTP" }, error: null }));
    const r = await avisarCliente({ rpc, functions: { invoke } } as never, "org", "neg-3", avisoFatura(), "https://site.pt", "E");
    expect(r.erros).toEqual(["fatura:a1: SMTP"]);
    expect(rpc).toHaveBeenLastCalledWith("neg_avisos_cliente_resultado", expect.objectContaining({ p_enviado: false, p_erro: "SMTP" }));
  });
});
