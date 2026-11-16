// 16/11 (Rúben): confirmar que as «Condições de pagamento» da proposta são sugeridas (etiqueta «Sugerido») tal como a validade e a
//  garantia. Ao fechar a visita o negócio passa à fase Negócio e o motor preenche as sugestões da proposta: o pagamento tem de ficar
//  marcado em d.sug como os outros. (No browser pode não aparecer a etiqueta num negócio onde alguém já mudou o valor — isso é de propósito.)
import { describe, expect, it, vi } from "vitest";
import { acoes, seed, type Negocio } from "./motor";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, grupoVisita } from "./campos";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

function visitaCompleta(d: Negocio) {
  for (let i = 0; i < 6; i++)
    for (const c of emFalta([...(d.vis ?? []).map(grupoVisita), EXTERIOR, INTERIOR, AREA, ESCOLHAS], d.f))
      d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  d.visita.fotos = 2;
}

describe("16/11: as condições de pagamento são sugeridas como a validade e a garantia", () => {
  it("ao fechar a visita, o pagamento fica marcado como sugestão (d.sug), igual a validade/garantia", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)!;
    visitaCompleta(d);
    // começar sem os campos da proposta nem as marcas, para o motor os sugerir de novo
    for (const k of ["validade", "prazo_exec", "garantia", "pagamento"]) { delete d.f[k]; if (d.sug) delete d.sug[k]; }

    A.fecharVisita(d.id);

    expect(d.fase).toBe(3);
    // o pagamento foi preenchido com a sugestão e marcado como sugestão, tal como a validade e a garantia
    expect(d.f.pagamento).toBeTruthy();
    expect(!!d.sug?.validade).toBe(true);
    expect(!!d.sug?.garantia).toBe(true);
    expect(!!d.sug?.pagamento).toBe(true);
  });

  it("mudar o pagamento à mão tira-lhe a etiqueta de sugestão (por isso num negócio editado não aparece «Sugerido»)", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)!;
    visitaCompleta(d);
    for (const k of ["validade", "garantia", "pagamento"]) { delete d.f[k]; if (d.sug) delete d.sug[k]; }
    A.fecharVisita(d.id);
    expect(!!d.sug?.pagamento).toBe(true);

    A.campo(d.id, "pagamento", "100% na adjudicação");
    expect(d.f.pagamento).toBe("100% na adjudicação");
    expect(!!d.sug?.pagamento).toBe(false); // deixou de ser sugestão
    expect(!!d.sug?.validade).toBe(true); // a validade, não mexida, continua sugerida
  });
});
