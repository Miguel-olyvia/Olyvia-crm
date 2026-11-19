// 19/11/2026 (auditoria, ponto 3): o total de uma proposta aceite não muda com o Catálogo. Antes, congelarProposta não congelava a taxa
// de IVA de cada linha, negocioReal mandava taxa_iva nula quando ela vinha do Catálogo e preco_final / total_com_iva nulos, e
// sincronizarNegocios recalculava o total a cada gravação. Agora: a taxa congela-se ao enviar, vai sempre para a base, e os totais da
// versão aceite calculam-se uma vez (o.totalAceite) e não se recalculam.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acoes, congelarProposta, congelarTotalAceite, ivaDaLinha, seed, totaisIva, tot, r2, type Estado, type Negocio } from "./motor";
import { idsServico } from "./real/negocioBase";
import { deLinhas, paraLinhas, type LinhasNegocio } from "./real/negocioReal";
import { gravarMudancas, type RefNegocio } from "./real/sincronizarNegocios";

class Eco extends Map<string, string> { override get(k: string) { return k; } }
const ids = idsServico(new Eco());

/** Um negócio com a proposta por enviar (rascunho) e o primeiro serviço dele. */
function rascunho(): { S: Estado; d: Negocio; A: ReturnType<typeof acoes>; sid: string } {
  const S = seed();
  // o 1031 com a proposta por enviar: as linhas sem taxa escrita (seguem o Catálogo)
  const d = S.deals.find((x) => x.id === 1031)!;
  d.orc!.enviada = null; d.orc!.aceite = null;
  for (const l of d.orc!.linhas) delete l.iva;
  const A = acoes(S, () => {}, (fn) => fn());
  const l = d.orc!.linhas.find((x) => x.t === "svc")!;
  return { S, d, A, sid: l.t === "svc" ? l.sid : "" };
}

describe("a taxa de IVA congela-se com a proposta", () => {
  it("ao enviar, cada linha fica com a sua taxa; mudar o Catálogo depois não muda o total da proposta", () => {
    const { S, d, sid } = rascunho();
    const antes = totaisIva(d, S).total;
    d.orc!.enviada = "hoje";
    // o que o motor faz ao enviar (A.enviar pede os campos da proposta; aqui só a parte que congela)
    congelarProposta(d, S, "19/11 10:00");
    expect(d.orc!.linhas.every((l) => l.iva === 6 || l.iva === 23)).toBe(true);
    S.svc[sid].iva = 23;
    expect(totaisIva(d, S).total).toBeCloseTo(antes, 6);
  });

  it("aceite: a taxa e os totais ficam congelados (o.totalAceite); o Catálogo já não os mexe", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1031)!; // proposta enviada, por aceitar
    const A = acoes(S, () => {}, (fn) => fn());
    A.aceitar(d.id);
    const T = d.orc!.totalAceite!;
    expect(T).toEqual({ pf: r2(tot(d, S).pf), total: r2(totaisIva(d, S).total) });
    const sid = (d.orc!.linhas.find((l) => l.t === "svc") as { sid: string }).sid;
    S.svc[sid].iva = 23;
    expect(r2(totaisIva(d, S).total)).toBe(T.total);
    expect(congelarTotalAceite(d, S)).toBe(T);
  });

  it("uma versão nova da proposta aceite (antes do contrato assinado) deixa de ter os totais congelados", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1031)!; // enviada, na fase 3
    const A = acoes(S, () => {}, (fn) => fn());
    d.orc!.aceite = "hoje";
    expect(congelarTotalAceite(d, S)).toBeTruthy();
    S.role = "comercial";
    A.novaVersao(d.id, ["O preço"], "", "orcamento");
    expect(d.orc!.aceite).toBeNull();
    expect(d.orc!.totalAceite).toBeUndefined();
    expect(congelarTotalAceite(d, S)).toBeNull();
  });
});

describe("o que vai para a base", () => {
  it("com o Estado, a taxa de cada linha vai sempre (a do Catálogo, quando a linha não a tem)", () => {
    const { S, d, sid } = rascunho();
    S.svc[sid].iva = 23;
    const atual = paraLinhas(d, new Date(), S).orcamentos.at(-1)!;
    expect(atual.linhas!.every((l) => l.taxa_iva === 6 || l.taxa_iva === 23)).toBe(true);
    const daLinha = atual.linhas!.find((l) => l.tipo === "servico" && l.servico === sid)!;
    expect(daLinha.taxa_iva).toBe(23);
    // e volta para a linha
    const volta = deLinhas(paraLinhas(d, new Date(), S));
    for (const l of volta.orc!.linhas) expect(l.iva).toBe(ivaDaLinha(l, S));
  });

  it("a versão aceite leva os totais congelados (preco_final, total_com_iva) e eles voltam ao ler", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1031)!;
    acoes(S, () => {}, (fn) => fn()).aceitar(d.id);
    const atual = paraLinhas(d, new Date(), S).orcamentos.at(-1)!;
    expect(atual.estado).toBe("aceite");
    expect(atual.preco_final).toBe(d.orc!.totalAceite!.pf);
    expect(atual.total_com_iva).toBe(d.orc!.totalAceite!.total);
    expect(deLinhas(paraLinhas(d, new Date(), S)).orc!.totalAceite).toEqual(d.orc!.totalAceite);
  });

  it("gravarMudancas: o total da versão aceite não se recalcula a cada gravação, mesmo com o Catálogo mudado", async () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1027)!; // contrato assinado (do exemplo), sem totais congelados
    expect(d.orc!.totalAceite).toBeUndefined();
    S.deals = [d];
    const enviados: LinhasNegocio[] = [];
    const sb = { rpc: (fn: string, args: { p_linhas?: LinhasNegocio }) => { if (fn === "neg_guardar_negocio" && args.p_linhas) enviados.push(structuredClone(args.p_linhas)); return Promise.resolve({ data: { avisos: [] }, error: null }); } } as unknown as SupabaseClient;
    const refs = new Map<number, RefNegocio>([[d.id, { id: "n1", entityId: "e1" }]]);
    const foto = new Map<number, string>();
    await gravarMudancas(sb, "org", S, refs, foto, ids);
    const primeiro = enviados.at(-1)!.orcamentos.at(-1)!;
    expect(primeiro.preco_final).toBe(d.orc!.totalAceite!.pf);
    expect(primeiro.total_com_iva).toBe(d.orc!.totalAceite!.total);
    // o Catálogo muda (a taxa e o preço de um serviço) e o negócio grava-se outra vez
    for (const l of d.orc!.linhas) if (l.t === "svc") { S.svc[l.sid].iva = 23; break; }
    d.hist.unshift({ t: "Uma nota", q: "19/11 11:00", k: "a" });
    await gravarMudancas(sb, "org", S, refs, foto, ids);
    const segundo = enviados.at(-1)!.orcamentos.at(-1)!;
    expect(enviados.length).toBe(2);
    expect(segundo.preco_final).toBe(primeiro.preco_final);
    expect(segundo.total_com_iva).toBe(primeiro.total_com_iva);
  });
});
