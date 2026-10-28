// 28/10/2026 (Fase 0, 20261231994000): um negócio com documentos do CRM (docs_crm) lê-se, mas nunca se grava pelo ecrã da Emylia: a
// base recusa-o (NE005) e, fora de `refs`, a gravação criava uma lead nova. A assinatura do portal ("portal_sms") lê-se como SMS.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seed } from "../motor";
import { deBase, idsServico } from "./negocioBase";
import { deLinhas, paraLinhas } from "./negocioReal";
import { gravarMudancas, type RefNegocio } from "./sincronizarNegocios";

/** Os serviços com o mesmo nome dos dois lados (a chave serve de id): o teste não precisa do Catálogo. */
class Eco extends Map<string, string> { override get(k: string) { return k; } }
const ids = idsServico(new Eco());

/** Um cliente da base que só guarda as chamadas às funções. */
function cliente() {
  const chamadas: string[] = [];
  const sb = { rpc: (fn: string) => { chamadas.push(fn); return Promise.resolve({ data: { avisos: [] }, error: null }); } } as unknown as SupabaseClient;
  return { sb, chamadas };
}

describe("negócios do CRM (docs_crm): só de leitura", () => {
  it("deBase lê docs_crm e tira-o das linhas do negócio", () => {
    const S = seed();
    const L = paraLinhas(S.deals[0]);
    const j = { ...L, negocio: { ...L.negocio, id: "n1", entity_id: "e1", estado_crm: "aberto", fluxo_emylia: false, docs_crm: true } };
    const lido = deBase(j, ids);
    expect(lido.docsCrm).toBe(true);
    expect(lido.fluxoEmylia).toBe(false);
    expect("docs_crm" in (lido.linhas.negocio as object)).toBe(false);
    expect(deBase({ ...j, negocio: { ...j.negocio, docs_crm: undefined } }, ids).docsCrm).toBe(false);
  });

  it("gravarMudancas não grava um negócio de soLeitura (nem cria lead), e grava os outros", async () => {
    const S = seed();
    const [crm, emylia] = S.deals;
    const refs = new Map<number, RefNegocio>([[crm.id, { id: "n-crm", entityId: "e" }], [emylia.id, { id: "n-emy", entityId: "e" }]]);
    S.deals = [crm, emylia];
    const { sb, chamadas } = cliente();
    const r = await gravarMudancas(sb, "org", S, refs, new Map(), ids, new Set([crm.id]));
    expect(r.erros).toEqual([]);
    expect(r.gravados).toBe(1);
    expect(chamadas).toEqual(["neg_guardar_negocio"]);
    expect(refs.size).toBe(2);
  });

  it("a assinatura do portal (portal_sms) volta ao negócio como código por SMS", () => {
    const S = seed();
    const d = S.deals.find((x) => x.orc) ?? S.deals[0];
    const L = paraLinhas(d);
    L.contratos = [{ versao: 1, estado: "assinado", substituido_em: null, revisto_por: null, revisto_em: null, assinado_em: "2026-10-22T11:30:00Z",
      pedidos: [], clausulas: [], assinatura: { metodo: "portal_sms", nome: "Cliente do Portal", identificador: null, telefone_mascarado: null, assinado_em: "2026-10-22T11:30:00Z" } }];
    const n = deLinhas(L);
    const a = (n.orc as { assinatura?: { tipo: string; nome: string } } | undefined)?.assinatura;
    expect(a?.tipo).toBe("sms");
    expect(a?.nome).toBe("Cliente do Portal");
  });
});
