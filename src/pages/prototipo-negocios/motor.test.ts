import { describe, expect, it } from "vitest";
import { acoes, alertas, bloqueado, conflitos, protecoesSugeridas, seed, tot, type Negocio } from "./motor";
import { AREA, CONTACTO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PROPOSTA, emFalta, type Grupo } from "./campos";

// Preenche os obrigatórios que faltam (os condicionais podem aparecer depois de preencher outros).
function preencher(d: Negocio, gs: Grupo[]) {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
}

// O fluxo da Ana Martins, da lead à obra (era o #teste do prototipo.html).
describe("protótipo de Negócios", () => {
  it("leva a Ana Martins da Lead à Obra", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const id = 1043;
    const d = () => S.deals.find((x) => x.id === id)!;

    preencher(d(), LEAD);
    A.contactar(id);
    expect(d().fase).toBe(1);
    preencher(d(), CONTACTO);
    A.marcarVisita(id);
    expect(d().fase).toBe(2);
    preencher(d(), [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    d().visita.fotos = 2;
    A.fecharVisita(id);
    expect(d().fase).toBe(2); // não fecha sem medidas
    expect(d().valida?.grupos).toContain("medidas");

    Object.assign(d().visita.med, { pav: 6, par: 18, pts: 3, pcs: 4 });
    A.fecharVisita(id);
    expect(d().fase).toBe(3);

    let T = tot(d(), S);
    expect(T.custo).toBeCloseTo(2454.55, 0);
    expect(T.pf).toBeCloseTo(3606.12, 0);

    A.verificar(id);
    expect(bloqueado(d(), S)).toBe(true); // a margem do revestimento
    const al = alertas(d(), S).find((a) => a.sug)!;
    A.sugerido(id, al.i!, al.sug!);
    expect(bloqueado(d(), S)).toBe(false);
    T = tot(d(), S);

    preencher(d(), PROPOSTA);
    A.enviar(id);
    A.aceitar(id);
    A.enviarContrato(id);
    A.assinar(id);
    expect(d().fase).toBe(4);
    expect(S.clientes.some((c) => c.deal === id)).toBe(true);

    preencher(d(), FINANCEIRO);
    A.emitir(id);
    A.validar(id);
    expect(d().fase).toBe(5);
    expect(d().obra.plano).toBeTruthy();
    expect(d().obra.mats).toBeTruthy();
    expect(conflitos(d().obra.plano!)).toHaveLength(1); // férias do Sérgio

    A.trocar(id, 2);
    expect(conflitos(d().obra.plano!)).toHaveLength(0);

    A.aprovarPlano(id);
    A.confirmarEnc(id);
    A.receberEnc(id);
    preencher(d(), [OBRA[0]]);
    A.arrancar(id);
    expect(d().obra.plano!.estado).toBe("em curso");

    preencher(d(), [OBRA[1]]);
    A.fimObra(id);
    expect(d().obra.real!.m).toBeLessThan(T.m);
    A.aprender(id);
    expect(S.svc.revest.h).toBeGreaterThan(0.75);
  });

  it("a Direção aprova uma exceção à margem", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const id = 1035; // Hugo Matos, visita com medidas
    const d = S.deals.find((x) => x.id === id)!;
    preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    A.fecharVisita(id);
    A.verificar(id);
    expect(bloqueado(d, S)).toBe(true);
    A.pedirAprov(id);
    A.aprovar(id);
    expect(bloqueado(d, S)).toBe(false);
  });

  it("os campos das fases: serviços da visita no orçamento e o que vem preenchido", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const id = 1035; // Hugo Matos, na Visita
    const d = S.deals.find((x) => x.id === id)!;
    expect(d.f.tem_elevador).toBe("Sim");
    A.campo(id, "diag_portas_proteger", "2");
    A.servico(id, "demol"); // o cliente já tirou o azulejo
    A.extra(id, "eletr", 4);
    A.extra(id, "c2", 2); // do Catálogo real: "Supressão de ponto de água"
    preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    A.fecharVisita(id);
    const sids = d.orc!.linhas.flatMap((l) => (l.t === "svc" ? [l.sid] : []));
    expect(sids).not.toContain("demol");
    expect(sids).toContain("eletr");
    expect(sids).toContain("c2");
    expect(S.svc.c2.n).toBe("Supressão de ponto de água");
    expect(S.svc.c2.preco).toBeGreaterThan(0);
    expect(d.f.validade).toBe("30 dias");
    expect(protecoesSugeridas(d.f)).toContain("plástico nas 2 portas");
    expect(protecoesSugeridas(d.f)).toContain("elevador");
  });

  it("não passa de fase com campos em falta e diz quais", () => {
    const S = seed();
    const avisos: string[] = [];
    const A = acoes(S, (a) => avisos.push(a.msg + " · " + (a.sub || "")), (fn) => fn());
    const id = 1038; // Manuel Costa, no Contacto
    const d = S.deals.find((x) => x.id === id)!;
    S.view = "hoje";
    A.marcarVisita(id);
    expect(d.fase).toBe(1);
    expect(d.valida?.grupos).toContain("Qualificação");
    expect(S.view).toBe("negocio"); // abre o negócio para mostrar o que falta
    expect(avisos[0]).toMatch(/Falta preencher/);
    preencher(d, CONTACTO);
    A.marcarVisita(id);
    expect(d.fase).toBe(2);
    expect(d.valida).toBeNull();
  });

  it("o exemplo completo tem tudo preenchido, e as respostas sugerem outras", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const j = S.deals.find((x) => x.id === 1050)!;
    expect(j.fase).toBe(5);
    expect(emFalta([...LEAD, ...CONTACTO, EXTERIOR, INTERIOR, AREA, ESCOLHAS, ...PROPOSTA, ...FINANCEIRO, ...OBRA], j.f)).toEqual([]);
    expect(j.obra.real).toBeTruthy();

    const d = S.deals.find((x) => x.id === 1036)!; // Luísa Freitas, na Visita
    delete d.f.area_util_m2; delete d.f.n_casas_banho;
    A.campo(d.id, "tipologia", "T2");
    expect(d.f.area_util_m2).toBe("80");
    expect(d.sug?.area_util_m2).toBe(true);
    A.campo(d.id, "area_util_m2", "75"); // mexido: deixa de ser sugestão
    expect(d.sug?.area_util_m2).toBeUndefined();
    A.campo(d.id, "fracao", "R/C Dto.");
    expect(d.f.andar).toBe("1"); // já tinha valor: a sugestão não o apaga
  });
});
