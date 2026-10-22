import { beforeEach, describe, expect, it } from "vitest";
import { esquecerInventario, lerInventario } from "./inventario/loja";
import { acoes, alertas, bloqueado, conflitos, protecoesSugeridas, seed, tot, type Negocio } from "./motor";
import { totais } from "./DocsCliente";
import { receberTudo } from "./testeObra";
import { realPorFase } from "./planoObra";
import { PREFIXO_LEV } from "./efeitosLevantamento";
import { SETORES } from "./setores";
import { RECEITAS, amortUn, consUn, custoAnoTecnico } from "./receitas";
import { efetivo, grupoVisita, AREA, CONTACTO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PROPOSTA, emFalta, type Grupo } from "./campos";
import { completarParaEncerrar } from "./encerrarObra";

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
  beforeEach(() => { esquecerInventario(); });
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
    expect(d().vis).toEqual([1]); // marcar a visita cria a visita 1
    A.novaVisita(id); // uma segunda visita, também com os seus campos
    preencher(d(), [grupoVisita(2)]);
    A.fecharVisita(id);
    expect(d().fase).toBe(2); // não fecha sem medidas
    expect(d().valida?.grupos).toContain("medidas");
    expect(d().f.v1_estado).toBe("Marcada"); // a visita só fica feita com as necessidades completas

    Object.assign(d().visita.med, { pav: 6, par: 18, pts: 3, pcs: 4 });
    A.fecharVisita(id);
    expect(d().fase).toBe(3);
    expect(d().f.v1_estado).toBe("Feita"); // ficou feita sozinha

    // as respostas do levantamento juntam linhas próprias (proteções, logística…); sem elas, o orçamento de referência
    const lev = d().orc!.linhas.filter((l) => l.t === "mat" && l.d.startsWith(PREFIXO_LEV));
    expect(lev.length).toBeGreaterThan(0);
    const semLev = { ...d(), orc: { ...d().orc!, linhas: d().orc!.linhas.filter((l) => !lev.includes(l)) } };
    let T = tot(semLev, S);
    // 22/10: o €/h dos ofícios é a média dos técnicos do RH (antes 25 €/h fixos): o custo baixa de 2454,55 para 2214,07; o preço não muda
    expect(T.custo).toBeCloseTo(2214.07, 0);
    expect(T.pf).toBeCloseTo(3606.12, 0);

    // 22/10: com o custo real, o revestimento já fica acima do mínimo: o comercial baixa-lhe o preço para 19 € e a Olyvia bloqueia
    A.precoLinha(id, d().orc!.linhas.findIndex((l) => l.t === "svc" && l.sid === "revest"), 19);
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

    // 16/10: o contrato gera só o plano (do orçamento), por aprovar; encomenda de cliente nenhuma
    expect(d().obra.ec ?? null).toBeNull();
    expect(d().obra.plano?.origem).toBe("orcamento");
    expect(conflitos(d().obra.plano!)).toHaveLength(0); // escolhe o técnico que não está de férias
    // o pagamento primeiro: o plano não se aprova antes dele
    A.aprovarPlano(id);
    expect(d().obra.plano!.estado).toBe("por aprovar");
    preencher(d(), FINANCEIRO);
    // 19/10: a fatura e o pagamento são do Financeiro (permissoes.ts)
    S.role = "financeiro";
    A.emitir(id);
    A.validar(id);
    expect(d().fase).toBe(5);
    // validado o pagamento, a encomenda de cliente é emitida logo no Inventário novo (sem aprovação)
    expect(d().obra.ec).toMatchObject({ n: "EC-" + id, estado: "emitida", ref: "CT 2026/" + id });
    expect(lerInventario().ecs.some((e) => e.id === "EC-" + id && e.origin.ref === "CT 2026/" + id)).toBe(true);
    expect(d().obra.mats).toBeTruthy();
    A.aprovarPlano(id);
    preencher(d(), [OBRA[0]]);
    // 19/10: só arranca com os materiais no armazém (as encomendas a fornecedor aprovadas e recebidas no Inventário)
    expect(receberTudo("CT 2026/" + id)).toBe("");
    A.arrancar(id);
    expect(d().obra.plano!.estado).toBe("em curso");

    preencher(d(), [OBRA[1]]);
    // 21/10: não encerra com tarefas por fazer; com tudo feito e validado, sim
    A.fimObra(id);
    expect(d().obra.plano!.estado).toBe("em curso");
    completarParaEncerrar(d());
    A.fimObra(id);
    expect(d().obra.plano!.estado).toBe("concluída");
    expect(d().obra.real!.m).toBeLessThan(T.m);
    const antes = JSON.stringify(realPorFase(d(), S));
    A.aprender(id);
    expect(S.svc.revest.h).toBeGreaterThan(0.75);
    // 15/10: a receita nova vale para os próximos orçamentos; o resultado desta obra (já fechada) não muda
    expect(JSON.stringify(realPorFase(d(), S))).toBe(antes);
  });

  it("a Direção aprova uma exceção à margem", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const id = 1035; // Hugo Matos, visita com medidas
    const d = S.deals.find((x) => x.id === id)!;
    preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    A.fecharVisita(id);
    // 22/10: com o €/h dos técnicos, a margem só fica abaixo do mínimo com o preço do revestimento baixado à mão
    A.precoLinha(id, d.orc!.linhas.findIndex((l) => l.t === "svc" && l.sid === "revest"), 19);
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

  it("o detalhe do custo bate certo com o custo do orçamento", () => {
    const S = seed();
    for (const [sid, R] of Object.entries(RECEITAS)) {
      const s = S.svc[sid];
      expect(R.equip.reduce((a, e) => a + amortUn(e), 0)).toBeCloseTo(s.eq, 2);
      expect(R.cons.reduce((a, c) => a + consUn(c), 0)).toBeCloseTo(s.cons, 2);
    }
    const ano = custoAnoTecnico();
    expect(ano.total / ano.horas).toBeCloseTo(25, 0);
  });

  it("IVA na proposta: 6% na mão de obra e 23% nos materiais", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1031)!; // Carla Nunes, com orçamento
    const T = totais(d, S);
    const mat = d.orc!.linhas.filter((l) => l.t === "mat").reduce((a, l) => a + (l.t === "mat" ? l.preco : 0), 0);
    expect(T.mat).toBeCloseTo(mat, 2);
    expect(T.mo + T.mat).toBeCloseTo(tot(d, S).pf, 2);
    expect(T.ivaMo).toBeCloseTo(T.mo * 0.06, 2);
    expect(T.ivaMat).toBeCloseTo(T.mat * 0.23, 2);
    expect(T.total).toBeCloseTo(T.mo * 1.06 + T.mat * 1.23, 2);
  });

  it("cada empresa ajusta os campos: modelo de setor, campos novos e escondidos", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    S.campos = structuredClone(SETORES.find((x) => x.id === "solar")!.cfg);
    expect(efetivo(S.campos, AREA).oculto).toBe(true);
    const ext = efetivo(S.campos, EXTERIOR);
    expect(ext.nome).toBe("O telhado");
    expect(ext.campos.some((c) => c.k === "sol_telhado")).toBe(true);
    expect(ext.campos.some((c) => c.k === "andar")).toBe(false);
    // um negócio na Visita não passa sem os campos novos do setor
    const d = S.deals.find((x) => x.id === 1035)!;
    preencher(d, [INTERIOR, AREA, ESCOLHAS]);
    A.fecharVisita(d.id);
    expect(d.fase).toBe(2);
    expect(emFalta([ext], d.f).map((c) => c.k)).toContain("sol_telhado");
    preencher(d, [efetivo(S.campos, EXTERIOR), efetivo(S.campos, INTERIOR), efetivo(S.campos, ESCOLHAS)]);
    A.fecharVisita(d.id);
    expect(d.fase).toBe(3);
  });
});

describe("a visita fica feita sozinha", () => {
  it("quando as necessidades ficam completas, e volta a marcada se deixarem de estar", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const id = 1043;
    const d = () => S.deals.find((x) => x.id === id)!;
    preencher(d(), LEAD); A.contactar(id);
    preencher(d(), CONTACTO); A.marcarVisita(id);
    Object.assign(d().visita.med, { pav: 6, par: 18, pts: 3, pcs: 4 });
    A.campo(id, "nota", "x");
    expect(d().f.v1_estado).toBe("Marcada"); // faltam as fotografias
    d().visita.fotos = 2;
    A.campo(id, "nota", "y");
    expect(d().f.v1_estado).toBe("Feita");
    d().visita.fotos = 0;
    A.campo(id, "nota", "z");
    expect(d().f.v1_estado).toBe("Marcada");
  });

  it("uma visita cancelada não fica feita, e sem nenhuma por cancelar a fase não fecha", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const id = 1043;
    const d = () => S.deals.find((x) => x.id === id)!;
    preencher(d(), LEAD); A.contactar(id);
    preencher(d(), CONTACTO); A.marcarVisita(id);
    A.cancelarVisita(id, 1);
    preencher(d(), [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
    Object.assign(d().visita.med, { pav: 6, par: 18, pts: 3, pcs: 4 });
    d().visita.fotos = 2;
    A.fecharVisita(id);
    expect(d().f.v1_estado).toBe("Cancelada");
    expect(d().fase).toBe(2);
    expect(d().valida?.grupos).toContain("visitas");
  });
});
