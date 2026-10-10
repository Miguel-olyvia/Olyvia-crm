import { describe, expect, it, vi } from "vitest";
import { VERSAO, seed, tot } from "./motor";
import { clientesApp, leadsApp, todosApp } from "./pessoasDocs";
import {
  atividadeDe, camposContacto, estadoCurto, estadoNegocio, factosDe, factosResumo, faltaParaOrcamento, minutosAtras, pagamentoDe, percursoDe, perfilDe, probabilidade,
} from "./perfilDocs";

const LEADS = ["Ana Martins", "Pedro Lopes", "Rita Sousa", "Manuel Costa", "Luísa Freitas", "Hugo Matos", "Carla Nunes", "Sérgio Pinto"];

describe("perfil · determinismo", () => {
  it("o mesmo estado dá sempre o mesmo perfil, mesmo com sementes novas", () => {
    const a = todosApp(seed()).map((p) => perfilDe(p, seed()));
    const b = todosApp(seed()).map((p) => perfilDe(p, seed()));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("perfil · o que cada pessoa da seed tem", () => {
  const S = seed();
  const todas = todosApp(S);
  it("todas as 11 pessoas têm email, telefone, morada, comercial e último contacto", () => {
    expect(todas).toHaveLength(11);
    for (const p of todas) {
      const f = perfilDe(p, S);
      expect(f.email, p.nome).toMatch(/@/);
      expect(f.telefone, p.nome).toMatch(/^\d{3} \d{3} \d{3}$/);
      expect(f.morada.completa, p.nome).not.toBe("");
      expect(f.comercial, p.nome).not.toBe("");
      expect(f.criada, p.nome).toMatch(/^\d{2}\/\d{2}/);
      expect(f.ultimoContacto, p.nome).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
      expect(f.diasSemContacto, p.nome).toBeGreaterThanOrEqual(0);
    }
  });
  it("telefone, email e último contacto de duas pessoas, contra valores fixos da seed", () => {
    const de = (n: string) => perfilDe(todas.find((p) => p.nome === n)!, S);
    expect(de("Pedro Lopes")).toMatchObject({ telefone: "927 118 300", email: "pedro.lopes@exemplo.pt", ultimoContacto: "06/10 09:36", diasSemContacto: 4 });
    expect(de("Marta Lima")).toMatchObject({ telefone: "916 004 552", ultimoContacto: "22/09 11:20", diasSemContacto: 18 });
  });
  it("a saúde vai de 0 a 100 e tem motivos", () => {
    for (const p of todas) {
      const { score, motivos } = perfilDe(p, S).saude;
      expect(Number.isInteger(score), p.nome).toBe(true);
      expect(score, p.nome).toBeGreaterThanOrEqual(0);
      expect(score, p.nome).toBeLessThanOrEqual(100);
      expect(motivos.length, p.nome).toBeGreaterThanOrEqual(1);
      expect(motivos.length, p.nome).toBeLessThanOrEqual(2);
    }
  });
  it("a saúde desce com uma tarefa atrasada", () => {
    const pedro = perfilDe(leadsApp(S).find((p) => p.nome === "Pedro Lopes")!, S).saude;
    const rita = perfilDe(leadsApp(S).find((p) => p.nome === "Rita Sousa")!, S).saude;
    expect(pedro.score).toBeLessThan(rita.score);
    expect(pedro.motivos.join(" ")).toMatch(/atrasada/i);
  });
  it("o NIF só existe nos clientes, com 9 dígitos", () => {
    for (const p of leadsApp(S)) expect(perfilDe(p, S).nif, p.nome).toBeNull();
    for (const p of clientesApp(S)) expect(perfilDe(p, S).nif, p.nome).toMatch(/^\d{9}$/);
  });
  it("tem de 2 a 3 notas, cada nota com autor e data", () => {
    for (const p of todas) {
      const f = perfilDe(p, S);
      expect(f.notas.length, p.nome).toBeGreaterThanOrEqual(2);
      expect(f.notas.length, p.nome).toBeLessThanOrEqual(3);
      for (const n of f.notas) { expect(n.autor).not.toBe(""); expect(n.q).toMatch(/^\d{2}\/\d{2}/); }
    }
  });
  it("com pedido, a primeira nota é o pedido real; sem pedido, todas as notas são de exemplo", () => {
    const pedro = perfilDe(todas.find((p) => p.nome === "Pedro Lopes")!, S);
    expect(pedro.notas).toHaveLength(3);
    expect(pedro.notas.filter((n) => !n.exemplo).map((n) => n.texto)).toEqual([todas.find((p) => p.nome === "Pedro Lopes")!.principal.f.pedido]);
    const manuel = todas.find((p) => p.nome === "Manuel Costa")!;
    expect(manuel.principal.f.pedido).toBeFalsy();
    const notas = perfilDe(manuel, S).notas;
    expect(notas).toHaveLength(2);
    expect(notas.every((n) => n.exemplo)).toBe(true);
  });
  it("as interações (chamadas e emails) vêm da mais recente para a mais antiga", () => {
    for (const p of todas) {
      const l = perfilDe(p, S).interacoes;
      expect(l.length, p.nome).toBeGreaterThan(0);
      for (let i = 1; i < l.length; i++) expect(minutosAtras(l[i].q), p.nome).toBeGreaterThanOrEqual(minutosAtras(l[i - 1].q));
      for (const x of l) expect(["chamada", "email"]).toContain(x.tipo);
    }
  });
  it("só a Luísa Freitas tem visita marcada (qui 15/10 · 10:00); o Hugo Matos tem uma já feita", () => {
    const v = (n: string) => perfilDe(todas.find((p) => p.nome === n)!, S).visita;
    expect(v("Luísa Freitas")).toMatchObject({ estado: "Marcada", data: "qui 15/10", hora: "10:00" });
    expect(v("Hugo Matos")?.estado).toBe("Feita");
    expect(todas.filter((p) => perfilDe(p, S).visita?.estado === "Marcada").map((p) => p.nome)).toEqual(["Luísa Freitas"]);
    expect(v("Ana Martins")).toBeNull();
    expect(v("Luísa Freitas")?.quemExemplo).toBe(false);
  });
  it("sem nenhum toque, o canal vem da origem do negócio (e não cai sempre em Outros)", () => {
    const base = leadsApp(S).find((p) => p.nome === "Rita Sousa")!;
    const fantasma = { ...base, nome: "Pessoa Sem Toques", principal: { ...base.principal, nome: "Pessoa Sem Toques", origem: "Meta Ads" } };
    const f = perfilDe(fantasma, S);
    expect(f.origem).toBe("Meta Ads");
    expect(f.canal).toBe("Redes sociais pagas");
    expect(perfilDe({ ...fantasma, principal: { ...fantasma.principal, origem: "Origem desconhecida" } }, S).canal).toBe("Outros");
  });
  it("a origem vem do primeiro toque e o conflito do Hugo Matos é sinalizado", () => {
    const hugo = perfilDe(todas.find((p) => p.nome === "Hugo Matos")!, S);
    expect(hugo.origem).toBe("Indicação");
    expect(hugo.conflito).toBe(true);
    expect(todas.filter((p) => perfilDe(p, S).conflito)).toHaveLength(1);
  });
  it("as 8 leads da seed são as esperadas (a visita e o negócio novo não mudam quem é lead)", () => {
    expect(todas.filter((p) => p.papel === "lead").map((p) => p.nome).sort()).toEqual([...LEADS].sort());
  });
});

describe("perfil · atividade e pagamentos", () => {
  const S = seed();
  it("a atividade junta histórico, chamadas, emails e notas, do mais recente para o mais antigo", () => {
    for (const p of todosApp(S)) {
      const a = atividadeDe(p, S);
      expect(a.length, p.nome).toBeGreaterThan(0);
      for (let i = 1; i < a.length; i++) expect(minutosAtras(a[i].q), p.nome).toBeGreaterThanOrEqual(minutosAtras(a[i - 1].q));
    }
    const manuel = atividadeDe(leadsApp(S).find((p) => p.nome === "Manuel Costa")!, S);
    expect(new Set(manuel.map((x) => x.tipo))).toEqual(new Set(["historico", "chamada", "email", "nota"]));
  });
  it("quem não tem visita não tem nada de visita na atividade; quem tem, tem", () => {
    const ana = atividadeDe(leadsApp(S).find((p) => p.nome === "Ana Martins")!, S);
    expect(perfilDe(leadsApp(S).find((p) => p.nome === "Ana Martins")!, S).visita).toBeNull();
    expect(ana.some((e) => /visita/i.test(e.titulo))).toBe(false);
    const luisa = atividadeDe(leadsApp(S).find((p) => p.nome === "Luísa Freitas")!, S);
    expect(luisa.some((e) => /visita/i.test(e.titulo))).toBe(true);
  });
  it("atividadeDe com o perfil já calculado dá o mesmo que sem ele", () => {
    const p = leadsApp(S).find((x) => x.nome === "Manuel Costa")!;
    expect(atividadeDe(p, S, perfilDe(p, S))).toEqual(atividadeDe(p, S));
  });
  it("pago mais o que falta dá o valor dos contratos", () => {
    const marta = clientesApp(S).find((p) => p.nome === "Marta Lima")!;
    const pg = pagamentoDe(S, marta);
    const d = S.deals.find((x) => x.id === 1022)!;
    expect(pg.total).toBeCloseTo(tot(d, S).pf, 2);
    expect(pg.pago + pg.falta).toBeCloseTo(pg.total, 2);
    expect(pg.pago).toBeGreaterThanOrEqual(0);
    expect(pagamentoDe(S, leadsApp(S)[0])).toEqual({ total: 0, pago: 0, falta: 0 });
  });
  it("a probabilidade cresce com a etapa", () => {
    const ordem = ["Lead", "Contacto", "Visita", "Orçamento", "Proposta", "Contrato", "Financeiro", "Obra"];
    const v = ordem.map(probabilidade);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
    expect(probabilidade("Proposta conjunta")).toBe(probabilidade("Proposta"));
    expect(probabilidade("desconhecido")).toBeGreaterThan(0);
  });
});

describe("perfil · bloco Contacto da ficha", () => {
  const S = seed();
  const f = perfilDe(leadsApp(S).find((p) => p.nome === "Pedro Lopes")!, S);
  it("com telefone e email mostra-os tal como estão", () => {
    expect(camposContacto(f).slice(0, 2)).toEqual([{ rotulo: "Telefone", valor: "927 118 300" }, { rotulo: "Email", valor: "pedro.lopes@exemplo.pt" }]);
  });
  it("sem telefone ou sem email diz-o, em vez de deixar o campo vazio", () => {
    const c = camposContacto({ ...f, telefone: "  ", email: "" });
    expect(c.find((x) => x.rotulo === "Telefone")?.valor).toBe("Sem telefone");
    expect(c.find((x) => x.rotulo === "Email")?.valor).toBe("Sem email");
    expect(c.every((x) => x.valor.trim() !== "")).toBe(true);
  });
  it("o email e o NIF inventados levam a marca de exemplo; o NIF só aparece nos clientes", () => {
    expect(camposContacto({ ...f, emailExemplo: true }).find((x) => x.rotulo === "Email")?.valor).toBe("pedro.lopes@exemplo.pt (exemplo)");
    expect(camposContacto(f).some((x) => x.rotulo === "NIF")).toBe(false);
    const marta = perfilDe(clientesApp(S).find((p) => p.nome === "Marta Lima")!, S);
    expect(camposContacto(marta).find((x) => x.rotulo === "NIF")?.valor).toMatch(/^\d{9}( \(exemplo\))?$/);
  });
});

describe("perfil · nada muda o Estado", () => {
  it("chamar tudo não altera o JSON do Estado", () => {
    const S = seed();
    const antes = JSON.stringify(S);
    for (const p of todosApp(S)) { perfilDe(p, S); atividadeDe(p, S); pagamentoDe(S, p); }
    expect(JSON.stringify(S)).toBe(antes);
  });
  it("não toca no localStorage, na versão do Estado nem na seed", () => {
    const get = vi.spyOn(Storage.prototype, "getItem"), set = vi.spyOn(Storage.prototype, "setItem"), rem = vi.spyOn(Storage.prototype, "removeItem");
    try {
      const versao = VERSAO, seedAntes = JSON.stringify(seed());
      const S = seed();
      for (const p of todosApp(S)) { perfilDe(p, S); atividadeDe(p, S); pagamentoDe(S, p); camposContacto(perfilDe(p, S)); }
        expect(S.v).toBe(versao);
      expect(VERSAO).toBe(versao);
      expect(JSON.stringify(seed())).toBe(seedAntes);
      expect(get).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      expect(rem).not.toHaveBeenCalled();
    } finally {
      get.mockRestore(); set.mockRestore(); rem.mockRestore();
    }
  });
});

describe("percurso do negócio", () => {
  const S = seed();
  const neg = (id: number) => S.deals.find((d) => d.id === id)!;
  const estados = (id: number): string[] => percursoDe(neg(id)).map((x) => x.estado);
  it("tem sempre os quatro passos, pela mesma ordem", () => {
    expect(percursoDe(neg(1044)).map((x) => x.nome)).toEqual(["Levantamento", "Orçamento", "Proposta", "Contrato"]);
  });
  it("uma lead (fase 0, 1 ou 2) está no Levantamento e os seguintes ficam por chegar", () => {
    for (const id of [1044, 1038, 1036]) expect(estados(id), String(id)).toEqual(["atual", "seguinte", "seguinte", "seguinte"]);
  });
  it("com orçamento feito e por enviar: Levantamento feito, Orçamento atual", () => {
    const d = structuredClone(neg(1031));
    d.orc!.enviada = null as never;
    expect(percursoDe(d).map((x) => x.estado)).toEqual(["feito", "atual", "seguinte", "seguinte"]);
  });
  it("proposta enviada e por aceitar: Proposta atual", () => {
    expect(estados(1031)).toEqual(["feito", "feito", "atual", "seguinte"]);
  });
  it("aceite e sem contrato assinado: Contrato atual; venda direta aceite não tem contrato por assinar", () => {
    const d = structuredClone(neg(1031));
    d.orc!.aceite = "06/10";
    expect(percursoDe(d).map((x) => x.estado)).toEqual(["feito", "feito", "feito", "atual"]);
    d.orc!.vendaDireta = true;
    expect(percursoDe(d).every((x) => x.estado === "feito")).toBe(true);
  });
  it("já em contrato (fase 4 ou 5, ou assinado): o percurso completo marcado", () => {
    for (const id of [1027, 1022, 1050]) expect(estados(id), String(id)).toEqual(["feito", "feito", "feito", "feito"]);
  });
});

describe("estado do negócio", () => {
  const S = seed();
  const neg = (id: number) => S.deals.find((d) => d.id === id)!;
  it("uma lead sem documentos está Em preparação", () => {
    expect(estadoNegocio(neg(1044))).toBe("Em preparação");
  });
  it("com orçamento tem um estado que diz onde está", () => {
    expect(estadoNegocio(neg(1031))).toBe("Proposta enviada");
    expect(estadoNegocio(neg(1027))).toBe("Em contrato");
  });
  it("venda direta enviada e por aceitar: também tem proposta (o motor envia-a), por isso é Proposta enviada; só depois de aceite fica completa", () => {
    const d = structuredClone(neg(1030));
    expect(d.orc?.vendaDireta).toBe(true);
    expect(estadoNegocio(d)).toBe("Proposta enviada");
    expect(percursoDe(d).map((x) => x.estado)).toEqual(["feito", "feito", "atual", "seguinte"]);
    d.orc!.aceite = "08/10";
    expect(estadoNegocio(d)).toBe("Em contrato");
    expect(percursoDe(d).every((x) => x.estado === "feito")).toBe(true);
  });
});

describe("o que falta para o orçamento", () => {
  const S = seed();
  const neg = (id: number) => S.deals.find((d) => d.id === id)!;
  it("lead por contactar: três passos, pela ordem, e o primeiro é o próximo passo do motor", () => {
    const f = faltaParaOrcamento(S, neg(1044));
    expect(f.titulo).toBe("O que falta para o orçamento");
    expect(f.passos).toEqual(["Registar a chamada", "Marcar a visita", "Fechar o levantamento"]);
  });
  it("contactada: sem o passo da chamada; com visita: só falta fechar o levantamento", () => {
    expect(faltaParaOrcamento(S, neg(1038)).passos).toEqual(["Marcar a visita", "Fechar o levantamento"]);
    expect(faltaParaOrcamento(S, neg(1036)).passos).toEqual(["Fechar o levantamento"]);
  });
  it("diz que campos obrigatórios do passo atual ainda estão vazios (os mesmos que travam o motor)", () => {
    const d = structuredClone(neg(1044));
    d.f = {};
    const vazio = faltaParaOrcamento(S, d);
    expect(vazio.campos.length).toBeGreaterThan(0);
    expect(new Set(vazio.campos).size).toBe(vazio.campos.length);
  });
  it("não muda o Estado nem o negócio", () => {
    const antes = JSON.stringify(S);
    for (const d of S.deals) faltaParaOrcamento(S, d);
    expect(JSON.stringify(S)).toBe(antes);
  });
  it("de orçamento em diante o título muda e o passo é o próximo passo do motor; fechado não falta nada", () => {
    const f = faltaParaOrcamento(S, neg(1031));
    expect(f.titulo).toBe("O que falta para o contrato");
    expect(f.passos).toEqual(["À espera do cliente"]);
    expect(faltaParaOrcamento(S, neg(1027)).passos).toEqual([]);
  });
});

describe("faixa de factos da ficha", () => {
  const S = seed();
  const f = (nome: string) => { const p = todosApp(S).find((x) => x.nome === nome)!; return { p, fac: factosDe(p, perfilDe(p, S)) }; };
  it("traz origem, comercial, criada, serviço e tipo de cliente, em pares rótulo e valor", () => {
    const { fac } = f("Pedro Lopes");
    expect(fac.map((x) => x.rotulo)).toEqual(expect.arrayContaining(["Origem", "Comercial", "Criada", "Serviço", "Tipo de cliente"]));
    expect(fac.find((x) => x.rotulo === "Serviço")?.valor).toBe("WC social");
    expect(fac.every((x) => x.valor.trim() !== "")).toBe(true);
  });
  it("o tipo de cliente por omissão leva a marca de exemplo; o que veio dos dados, não", () => {
    const { fac } = f("Pedro Lopes");
    expect(fac.find((x) => x.rotulo === "Tipo de cliente")).toEqual({ rotulo: "Tipo de cliente", valor: "Particular", exemplo: false });
    const T = seed();
    delete T.deals.find((d) => d.id === 1044)!.f.tipo_cliente;
    const p = todosApp(T).find((x) => x.nome === "Pedro Lopes")!;
    expect(factosDe(p, perfilDe(p, T)).find((x) => x.rotulo === "Tipo de cliente")).toEqual({ rotulo: "Tipo de cliente", valor: "Particular", exemplo: true });
  });
  it("o contacto preferido só aparece quando existe, em minúsculas", () => {
    expect(f("Pedro Lopes").fac.find((x) => x.rotulo === "Contacto preferido")?.valor).toBe("telefone");
    expect(f("Joana Ribeiro").fac.find((x) => x.rotulo === "Contacto preferido")?.valor).toBe("whatsapp");
    const T = seed();
    delete T.deals.find((d) => d.id === 1044)!.f.pref;
    const p = todosApp(T).find((x) => x.nome === "Pedro Lopes")!;
    expect(factosDe(p, perfilDe(p, T)).some((x) => x.rotulo === "Contacto preferido")).toBe(false);
  });
});

describe("estado curto do negócio (a lista do separador Negócios)", () => {
  const S = seed();
  const neg = (id: number) => S.deals.find((d) => d.id === id)!;
  it("uma lead sem documentos está Em preparação", () => {
    expect(estadoCurto(neg(1044))).toBe("Em preparação");
  });
  it("com orçamento diz Orçamento, Proposta ou Contrato, conforme o passo", () => {
    const d = structuredClone(neg(1031));
    d.fase = 3; d.orc!.enviada = null; d.orc!.aceite = null; d.orc!.contrato = null;
    expect(estadoCurto(d)).toBe("Orçamento");
    d.orc!.enviada = "07/10";
    expect(estadoCurto(d)).toBe("Proposta");
    d.orc!.aceite = "08/10"; d.orc!.vendaDireta = false;
    expect(estadoCurto(d)).toBe("Contrato");
    d.orc!.contrato = "assinado";
    expect(estadoCurto(d)).toBe("Contrato");
  });
  it("em Financeiro e em Obra diz a fase", () => {
    const d = structuredClone(neg(1031));
    d.fase = 4;
    expect(estadoCurto(d)).toBe("Financeiro");
    d.fase = 5;
    expect(estadoCurto(d)).toBe("Obra");
  });
  it("só usa as palavras da lista", () => {
    const ok = ["Em preparação", "Orçamento", "Proposta", "Contrato", "Financeiro", "Obra"];
    expect(S.deals.every((d) => ok.includes(estadoCurto(d)))).toBe(true);
  });
});

describe("factos do Resumo", () => {
  const S = seed();
  it("só traz o que o Resumo não diz noutro sítio: comercial, criada, tipo de cliente e contacto preferido", () => {
    const p = todosApp(S).find((x) => x.nome === "Pedro Lopes")!;
    expect(factosResumo(p, perfilDe(p, S)).map((x) => x.rotulo)).toEqual(["Comercial", "Criada", "Tipo de cliente", "Contacto preferido"]);
  });
  it("mantém a marca de exemplo e omite o contacto preferido quando não existe", () => {
    const T = seed();
    delete T.deals.find((d) => d.id === 1044)!.f.tipo_cliente;
    delete T.deals.find((d) => d.id === 1044)!.f.pref;
    const p = todosApp(T).find((x) => x.nome === "Pedro Lopes")!;
    const r = factosResumo(p, perfilDe(p, T));
    expect(r.find((x) => x.rotulo === "Tipo de cliente")?.exemplo).toBe(true);
    expect(r.some((x) => x.rotulo === "Contacto preferido")).toBe(false);
  });
});
