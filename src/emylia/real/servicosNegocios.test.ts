// 28/10: /negocios rebentava ao recarregar: os negócios lidos traziam serviços do Catálogo fora do modelo, que ainda não estavam em S.svc.
import { describe, expect, it } from "vitest";
import { linhaCalc, seed, servicoDoCatalogo, tot, type Negocio } from "../motor";
import { CATALOGO_MUDELAR } from "../catalogo";
import { garantirServicosDosNegocios, sidsDoNegocio } from "./negocioReal";

/** Um negócio do seed com o orçamento só com uma linha de serviço, sem custo congelado. */
function comLinha(S: ReturnType<typeof seed>, sid: string): Negocio {
  const d = structuredClone(S.deals[0]);
  d.id = 9001;
  d.orc = { modelo: "", linhas: [{ t: "svc", sid, q: 2, cu: 10, pu: 20 }], desconto: 0, vendaDireta: false, verif: false, aprov: null,
    enviada: null, aceite: null, contrato: null, avisosVistos: {} };
  return d;
}

describe("serviços dos negócios lidos", () => {
  it("põe em S.svc o serviço do Catálogo fora do modelo e o total não rebenta", () => {
    const S = seed();
    const sid = CATALOGO_MUDELAR[0].id;
    expect(S.svc[sid]).toBeUndefined();
    expect(servicoDoCatalogo(sid, S)).not.toBeNull();
    const d = comLinha(S, sid);
    expect(sidsDoNegocio(d)).toContain(sid);
    garantirServicosDosNegocios(S, [d]);
    expect(S.svc[sid]).toBeDefined();
    const x = linhaCalc(d.orc!.linhas[0], S);
    expect(x.h).toBe(S.svc[sid].h * 2);
    expect(tot(d, S).preco).toBe(40);
  });

  it("junta os serviços das versões, da visita e das adendas", () => {
    const S = seed();
    const d = comLinha(S, "a");
    d.orc!.versoes = [{ n: 1, enviada: "", substituida: "", total: 0, motivos: [], onde: "orcamento", linhas: [{ t: "svc", sid: "b", q: 1, cu: 0, pu: 0 }],
      prod: [{ id: "p", n: "P", un: "un", custo: 0, q: 1, no: null, svc: "c" }] }];
    d.visita.off = ["d"]; d.visita.extra = { e: 1 };
    d.visita.prod = [{ id: "p2", n: "P2", un: "un", custo: 0, q: 1, no: null, svc: "f" }];
    d.adendas = [{ n: "A1", estado: "rascunho", criada: "", motivo: "", linhas: [{ sid: "g", n: "G", un: "un", q: 1, pu: 0, h: 0, perfil: "" },
      { sid: "livre-1", n: "Livre", un: "un", q: 1, pu: 0, h: 0, perfil: "", livre: true }],
      versoes: [{ n: 1, enviada: "", substituida: "", total: 0, motivos: [], linhas: [{ sid: "h", n: "H", un: "un", q: 1, pu: 0, h: 0, perfil: "" }] }] }];
    expect(sidsDoNegocio(d).sort()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("o serviço que não está em lado nenhum também não rebenta", () => {
    const S = seed();
    const d = comLinha(S, "s-nao-existe");
    garantirServicosDosNegocios(S, [d]);
    expect(S.svc["s-nao-existe"]).toBeUndefined();
    expect(linhaCalc(d.orc!.linhas[0], S)).toMatchObject({ custo: 20, preco: 40, h: 0 });
    expect(() => tot(d, S)).not.toThrow();
  });
});
