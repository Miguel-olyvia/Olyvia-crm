import { describe, expect, it, vi } from "vitest";
import { VERSAO, seed, tot } from "./motor";
import { clientesApp, leadsApp, todosApp } from "./pessoasDocs";
import {
  atividadeDe, camposContacto, minutosAtras, pagamentoDe, perfilDe, probabilidade, resumoClientes, resumoLeads, resumoTodos,
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
  it("tem de 1 a 4 etiquetas e de 2 a 3 notas, cada nota com autor e data", () => {
    for (const p of todas) {
      const f = perfilDe(p, S);
      expect(f.tags.length, p.nome).toBeGreaterThanOrEqual(1);
      expect(f.tags.length, p.nome).toBeLessThanOrEqual(4);
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

describe("perfil · resumos por separador (números da seed)", () => {
  const S = seed();
  const pf = (id: number): number => tot(S.deals.find((d) => d.id === id)!, S).pf;
  it("leads: 8, 3 por contactar, 1 atrasada e o valor dos orçamentos da Carla e do Sérgio", () => {
    const r = resumoLeads(S);
    expect(r.leads).toBe(8);
    expect(r.porContactar).toBe(3);
    expect(r.atrasadas).toBe(1);
    expect(r.valorEmJogo).toBeCloseTo(pf(1031) + pf(1030), 2);
  });
  it("clientes: 3, o valor dos contratos, as obras em curso e o que falta receber", () => {
    const r = resumoClientes(S);
    expect(r.clientes).toBe(3);
    expect(r.valorContratado).toBeCloseTo(pf(1027) + pf(1022) + pf(1050), 2);
    expect(r.obrasEmCurso).toBeGreaterThanOrEqual(1);
    expect(r.aReceber).toBeGreaterThan(0);
    expect(r.aReceber).toBeLessThanOrEqual(r.valorContratado);
  });
  it("todos: 11 pessoas, 8 leads e 3 clientes", () => {
    expect(resumoTodos(S)).toEqual({ pessoas: 11, leads: 8, clientes: 3 });
  });
});

describe("perfil · nada muda o Estado", () => {
  it("chamar tudo não altera o JSON do Estado", () => {
    const S = seed();
    const antes = JSON.stringify(S);
    for (const p of todosApp(S)) { perfilDe(p, S); atividadeDe(p, S); pagamentoDe(S, p); }
    resumoLeads(S); resumoClientes(S); resumoTodos(S);
    expect(JSON.stringify(S)).toBe(antes);
  });
  it("não toca no localStorage, na versão do Estado nem na seed", () => {
    const get = vi.spyOn(Storage.prototype, "getItem"), set = vi.spyOn(Storage.prototype, "setItem"), rem = vi.spyOn(Storage.prototype, "removeItem");
    try {
      const versao = VERSAO, seedAntes = JSON.stringify(seed());
      const S = seed();
      for (const p of todosApp(S)) { perfilDe(p, S); atividadeDe(p, S); pagamentoDe(S, p); camposContacto(perfilDe(p, S)); }
      resumoLeads(S); resumoClientes(S); resumoTodos(S);
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
