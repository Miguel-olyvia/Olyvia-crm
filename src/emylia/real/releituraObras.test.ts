// 20/11 (auditoria de 19/11, lote 3): a releitura das obras de 20 em 20 s lê tudo uma vez e depois só o que mudou
// (obra_ler_negocios_desde); sem a função, como antes. Com o separador escondido, o relógio pára. O Hoje do técnico e o Estúdio da obra
// continuam ligados: o que mudou chega e junta-se como antes (juntarObrasDaBase).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seed, type Negocio, type Plano } from "../motor";
import { obraVazia } from "./obraReal";
import { fotografarNegocios, juntarObrasDaBase } from "./sincronizarNegocios";
import { MARGEM_RELEITURA_MS, criarReleituraObras, lerObrasDesde } from "./releituraObras";
import { iniciarReleituraPeriodica } from "./relerObrasPeriodico";

type Chamada = { fn: string; args: Record<string, unknown> };
function base(respostas: Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: { code?: string; message?: string } | null }>) {
  const chamadas: Chamada[] = [];
  const sb = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => { chamadas.push({ fn, args }); const r = respostas[fn]?.(args) ?? { data: null, error: { code: "PGRST202" } }; return { data: r.data ?? null, error: r.error ?? null }; }),
  } as unknown as SupabaseClient;
  return { sb, chamadas };
}
const AGORA = "2026-11-20T10:00:00.000Z";

describe("ler só o que mudou", () => {
  it("a primeira leitura é de tudo; depois de juntar, a seguinte é desde a hora do servidor menos a margem", async () => {
    const { sb, chamadas } = base({ obra_ler_negocios_desde: () => ({ data: { agora: AGORA, obras: [{ negocio_id: "n1", emylia: { a: 1 } }] } }) });
    const r = criarReleituraObras(sb, "org");
    const l1 = await r.ler();
    expect(chamadas[0]).toEqual({ fn: "obra_ler_negocios_desde", args: { p_org: "org", p_desde: null } });
    expect(l1?.lidas.get("n1")).toEqual({ a: 1 });
    r.confirmar(l1!);
    expect(r.desde).toBe(new Date(Date.parse(AGORA) - MARGEM_RELEITURA_MS).toISOString());
    await r.ler();
    expect(chamadas[1].args.p_desde).toBe(r.desde);
  });

  it("uma leitura que não se juntou (começou a gravar) não avança: a seguinte volta a pedir desde o mesmo sítio", async () => {
    const { sb, chamadas } = base({ obra_ler_negocios_desde: () => ({ data: { agora: AGORA, obras: [] } }) });
    const r = criarReleituraObras(sb, "org");
    await r.ler();
    await r.ler();
    expect(chamadas.map((c) => c.args.p_desde)).toEqual([null, null]);
  });

  it("sem a função nova na base, lê tudo como antes (obra_ler_negocios) e não volta a tentar a nova", async () => {
    const { sb, chamadas } = base({ obra_ler_negocios: () => ({ data: [{ negocio_id: "n1", emylia: { b: 2 } }] }) });
    const r = criarReleituraObras(sb, "org");
    const l = await r.ler();
    expect(l?.lidas.get("n1")).toEqual({ b: 2 });
    expect(l?.agora).toBeNull();
    r.confirmar(l!);
    expect(r.desde).toBeNull();
    await r.ler();
    expect(chamadas.map((c) => c.fn)).toEqual(["obra_ler_negocios_desde", "obra_ler_negocios", "obra_ler_negocios"]);
  });

  it("um erro que não é de falta da função dá null (tenta-se na volta seguinte)", async () => {
    const { sb } = base({ obra_ler_negocios_desde: () => ({ error: { code: "57014", message: "timeout" } }) });
    expect(await lerObrasDesde(sb, "org", null)).toBeNull();
    expect(await criarReleituraObras(sb, "org").ler()).toBeNull();
  });

  it("o técnico deu a tarefa por feita: vem na leitura do que mudou e o ecrã fica com ela (o Estúdio da obra ligado)", async () => {
    const plano: Plano = { estado: "em curso", dia: 1, inicio: "2026-11-16", tasks: [
      { nome: "Canalização", svcs: [], dia: 1, dur: 1, sk: "Canalizador", h: 8, tec: "t2", fase: 2, exec: { estado: "em curso", horas: 2, fotos: [] } },
    ] };
    const S = seed();
    const d = structuredClone(S.deals[0]);
    d.id = 1001; d.obra = { ...obraVazia(), plano, diario: [] } as Negocio["obra"];
    const outro = structuredClone(S.deals[0]);
    outro.id = 1002; outro.obra = { ...obraVazia(), plano: structuredClone(plano), diario: [] } as Negocio["obra"];
    S.deals = [d, outro];
    const foto = fotografarNegocios(S.deals);
    const refs = new Map([[1001, { id: "neg-1", entityId: "e" }], [1002, { id: "neg-2", entityId: "e2" }]]);
    const naBase = structuredClone(d.obra);
    naBase.plano!.tasks[0].exec!.estado = "feita";
    // só a obra que mudou vem na leitura; a outra fica como está
    const { sb } = base({ obra_ler_negocios_desde: () => ({ data: { agora: AGORA, obras: [{ negocio_id: "neg-1", emylia: naBase }] } }) });
    const l = (await criarReleituraObras(sb, "org").ler())!;
    const m = juntarObrasDaBase(S, refs, foto, l.lidas);
    expect(m.map((x) => x.d.id)).toEqual([1001]);
    expect(d.obra.plano!.tasks[0].exec?.estado).toBe("feita");
    expect(outro.obra.plano!.tasks[0].exec?.estado).toBe("em curso");
  });
});

describe("o relógio da releitura", () => {
  afterEach(() => vi.useRealTimers());
  const documento = (hidden: boolean) => {
    const ouvintes = new Set<() => void>();
    return {
      hidden,
      addEventListener: (_: string, f: () => void) => { ouvintes.add(f); },
      removeEventListener: (_: string, f: () => void) => { ouvintes.delete(f); },
      mudar(h: boolean) { this.hidden = h; for (const f of ouvintes) f(); },
      get n() { return ouvintes.size; },
    };
  };
  const leitura = { lidas: new Map<string, unknown>(), agora: AGORA };

  it("à vista relê de 20 em 20 s; escondido pára (nem acorda); ao voltar lê logo e volta a contar", async () => {
    vi.useFakeTimers();
    const doc = documento(false);
    const ler = vi.fn(async () => leitura), aplicar = vi.fn(() => true), confirmar = vi.fn();
    const parar = iniciarReleituraPeriodica({ ler, aplicar, confirmar, podeLer: () => true, doc: doc as unknown as Document });
    await vi.advanceTimersByTimeAsync(20000);
    expect(ler).toHaveBeenCalledTimes(1);
    expect(confirmar).toHaveBeenCalledWith(leitura);
    doc.mudar(true);
    expect(vi.getTimerCount()).toBe(0); // escondido: sem relógio
    await vi.advanceTimersByTimeAsync(120000);
    expect(ler).toHaveBeenCalledTimes(1);
    doc.mudar(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(ler).toHaveBeenCalledTimes(2); // à vista outra vez: lê logo
    await vi.advanceTimersByTimeAsync(20000);
    expect(ler).toHaveBeenCalledTimes(3);
    parar();
    expect(doc.n).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(ler).toHaveBeenCalledTimes(3);
  });

  it("aberto escondido não arranca; sem poder ler (a gravar, sem obras) não lê; o que não se juntou não se confirma", async () => {
    vi.useFakeTimers();
    const doc = documento(true);
    let pode = false;
    const ler = vi.fn(async () => leitura), confirmar = vi.fn();
    let juntou = false;
    const parar = iniciarReleituraPeriodica({ ler, aplicar: () => juntou, confirmar, podeLer: () => pode, doc: doc as unknown as Document });
    expect(vi.getTimerCount()).toBe(0);
    doc.mudar(false);
    await vi.advanceTimersByTimeAsync(20000);
    expect(ler).not.toHaveBeenCalled();
    pode = true;
    await vi.advanceTimersByTimeAsync(20000);
    expect(ler).toHaveBeenCalledTimes(1);
    expect(confirmar).not.toHaveBeenCalled();
    juntou = true;
    await vi.advanceTimersByTimeAsync(20000);
    expect(confirmar).toHaveBeenCalledTimes(1);
    parar();
  });
});
