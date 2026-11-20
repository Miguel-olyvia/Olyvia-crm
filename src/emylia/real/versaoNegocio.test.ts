// 20/11/2026 (auditoria de 19/11, Lote 3, dados; 20270125020000 e 20270125030000): duas pessoas a gravar o mesmo negócio já não se apagam.
// O ecrã lê a versão (neg_versoes) antes dos negócios, manda-a em neg_guardar_negocio (versao_lida) e sobe-a depois de gravar; a base
// recusa com NE015 se outra gravação veio depois, e o ecrã relê e diz «Este negócio foi alterado noutro lado; atualizei. Volte a fazer a
// alteração.». O histórico grava «hoje hh:mm» já com o dia, para a base (que só acrescenta) o reconhecer depois da meia-noite.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seed } from "../motor";
import { idsServico, lerNegocios, lerVersoes, MSG_ALTERADO_NOUTRO_LADO } from "./negocioBase";
import { paraLinhas } from "./negocioReal";
import { fixarDatasDoHistorico, gravarMudancas, type RefNegocio } from "./sincronizarNegocios";

class Eco extends Map<string, string> { override get(k: string) { return k; } }
const ids = idsServico(new Eco());

type Chamada = { fn: string; args: Record<string, unknown> };
/** Um cliente da base que guarda as chamadas e responde por função. */
function cliente(resp: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({ data: { avisos: [] }, error: null })) {
  const chamadas: Chamada[] = [];
  const sb = { rpc: (fn: string, args: Record<string, unknown>) => { chamadas.push({ fn, args }); return Promise.resolve(resp(fn, args)); } } as unknown as SupabaseClient;
  return { sb, chamadas };
}
const linhasDe = (c: Chamada) => c.args.p_linhas as Record<string, unknown>;

describe("a versão do negócio ao gravar (20270125020000)", () => {
  it("manda a versão lida e, gravado, a versão do ecrã sobe 1", async () => {
    const S = seed();
    const d = S.deals[0];
    S.deals = [d];
    const refs = new Map<number, RefNegocio>([[d.id, { id: "n1", entityId: "e1", versao: 4 }]]);
    const { sb, chamadas } = cliente();
    const r = await gravarMudancas(sb, "org", S, refs, new Map(), ids);
    expect(r.erros).toEqual([]);
    const g = chamadas.find((c) => c.fn === "neg_guardar_negocio")!;
    expect(linhasDe(g).versao_lida).toBe(4);
    expect(refs.get(d.id)!.versao).toBe(5);
  });

  it("sem versão (base sem neg_versoes), grava como antes: sem versao_lida", async () => {
    const S = seed();
    const d = S.deals[0];
    S.deals = [d];
    const refs = new Map<number, RefNegocio>([[d.id, { id: "n1", entityId: "e1" }]]);
    const { sb, chamadas } = cliente();
    const r = await gravarMudancas(sb, "org", S, refs, new Map(), ids);
    expect(r.gravados).toBe(1);
    expect("versao_lida" in linhasDe(chamadas.find((c) => c.fn === "neg_guardar_negocio")!)).toBe(false);
    expect(refs.get(d.id)!.versao).toBeUndefined();
  });

  it("NE015: não é erro, fica em `alterados`, pede para reler e não grava a obra nem sobe a versão", async () => {
    const S = seed();
    const [a, b] = S.deals;
    S.deals = [a, b];
    const refs = new Map<number, RefNegocio>([[a.id, { id: "na", entityId: "e", versao: 2 }], [b.id, { id: "nb", entityId: "e", versao: 7 }]]);
    const { sb, chamadas } = cliente((fn, args) => fn === "neg_guardar_negocio" && args.p_negocio_id === "na"
      ? { data: null, error: { code: "NE015", message: "Este negócio foi alterado noutro lado depois de o abrir: volte a ler o negócio e faça a alteração outra vez." } }
      : { data: { avisos: [] }, error: null });
    const r = await gravarMudancas(sb, "org", S, refs, new Map(), ids);
    expect(r.erros).toEqual([]);
    expect(r.alterados).toEqual([a.nome]);
    expect(r.reler).toBe(true);
    expect(r.gravados).toBe(1);
    expect(refs.get(a.id)!.versao).toBe(2);
    expect(refs.get(b.id)!.versao).toBe(8);
    expect(chamadas.some((c) => c.fn === "obra_guardar_negocio" && c.args.p_negocio_id === "na")).toBe(false);
  });

  it("um erro que não é de versão continua a ser erro", async () => {
    const S = seed();
    const d = S.deals[0];
    S.deals = [d];
    const refs = new Map<number, RefNegocio>([[d.id, { id: "n1", entityId: "e1", versao: 1 }]]);
    const { sb } = cliente((fn) => fn === "neg_guardar_negocio" ? { data: null, error: { code: "CT001", message: "Sem permissão (pessoas.edit)." } } : { data: { avisos: [] }, error: null });
    const r = await gravarMudancas(sb, "org", S, refs, new Map(), ids);
    expect(r.alterados ?? []).toEqual([]);
    expect(r.erros[0]).toContain("Sem permissão");
  });

  it("a mensagem do ecrã é a pedida", () => {
    expect(MSG_ALTERADO_NOUTRO_LADO).toBe("Este negócio foi alterado noutro lado; atualizei. Volte a fazer a alteração.");
  });
});

describe("ler as versões (neg_versoes)", () => {
  it("lê {id: versão}; sem a função, com erro ou com outra forma, null", async () => {
    expect([...(await lerVersoes(cliente(() => ({ data: { a: 3, b: 0, c: "x" }, error: null })).sb, "org"))!]).toEqual([["a", 3], ["b", 0]]);
    expect(await lerVersoes(cliente(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } })).sb, "org")).toBeNull();
    expect(await lerVersoes(cliente(() => ({ data: [], error: null })).sb, "org")).toBeNull();
    const rebenta = { rpc: () => { throw new Error("rede"); } } as unknown as SupabaseClient;
    expect(await lerVersoes(rebenta, "org")).toBeNull();
  });

  it("lerNegocios lê as versões PRIMEIRO e põe-nas em cada negócio", async () => {
    const S = seed();
    const L = paraLinhas(S.deals[0]);
    const j = { ...L, negocio: { ...L.negocio, id: "n1", entity_id: "e1", estado_crm: "aberto", fluxo_emylia: true } };
    const { sb, chamadas } = cliente((fn) => fn === "neg_versoes" ? { data: { n1: 9 }, error: null }
      : fn === "neg_ler_negocios" ? { data: [j], error: null } : { data: [], error: null });
    const lidos = await lerNegocios(sb, "org", ids, undefined, { semSugestoes: true });
    expect(chamadas[0].fn).toBe("neg_versoes");
    expect(lidos[0].versao).toBe(9);
  });
});

describe("o histórico grava o dia de «hoje» (20270125030000)", () => {
  it("«hoje hh:mm» passa a «dd/mm hh:mm»; o resto fica", () => {
    const d = { hist: [{ t: "a", q: "hoje 09:05", k: "a" }, { t: "b", q: "hoje", k: "a" }, { t: "c", q: "03/11 10:00", k: "a" }, { t: "d", q: "", k: "a" }] } as never;
    expect(fixarDatasDoHistorico(d, new Date(2026, 10, 20, 23, 59))).toBe(2);
    expect((d as { hist: { q: string }[] }).hist.map((e) => e.q)).toEqual(["20/11 09:05", "20/11", "03/11 10:00", ""]);
  });

  it("gravarMudancas manda o histórico já com o dia", async () => {
    const S = seed();
    const d = S.deals[0];
    d.hist = [{ t: "Chamada sem resposta", q: "hoje 10:00", k: "a" }];
    S.deals = [d];
    const { sb, chamadas } = cliente();
    await gravarMudancas(sb, "org", S, new Map([[d.id, { id: "n1", entityId: "e1" }]]), new Map(), ids);
    expect(d.hist[0].q).not.toMatch(/^hoje/);
    const h = (linhasDe(chamadas.find((c) => c.fn === "neg_guardar_negocio")!).historico as { ocorrido_em: string | null }[])[0];
    expect(h.ocorrido_em).toMatch(/T10:00:00$/);
  });
});
