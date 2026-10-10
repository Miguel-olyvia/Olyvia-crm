import { describe, expect, it } from "vitest";
import { seed, tot, type Estado, type Papel } from "./motor";
import { leadsDe } from "./leadsDocs";
import { EXEMPLOS } from "./exemplosDocs";
import { estadoDe } from "./perfilDocs";
import { valorColuna } from "./listaDocs";
import {
  SEM_FILTROS, chipsDe, clientesApp, comerciaisDe, contagens, dadosCliente, documentosDe, filtrarPessoas, filtrarTexto, filtrosEfetivos, leadsApp,
  listaVisivel, ordenarPessoas, origensDe, pessoasDoSeparador, separadorPorDefeito, todosApp, valorPessoa,
} from "./pessoasDocs";

const LEADS = ["Ana Martins", "Pedro Lopes", "Rita Sousa", "Manuel Costa", "Luísa Freitas", "Hugo Matos", "Carla Nunes", "Sérgio Pinto"];
const CLIENTES = ["Tiago Almeida", "Marta Lima", "Joana Ribeiro"];
const nomes = (l: { nome: string }[]): string[] => l.map((p) => p.nome);
const clone = (S: Estado, id: number, novoId: number, mudar: Record<string, unknown> = {}): void => {
  const base = S.deals.find((d) => d.id === id)!;
  S.deals.push({ ...structuredClone(base), id: novoId, ...mudar } as typeof base);
};
/** Um cliente sem negócios de exemplo: o negócio 1027 (ganho, Financeiro) com outro nome. */
const NOVO_CLIENTE = { nome: "Bruno Cliente", tel: "910 000 099" };

describe("pessoas · lead com um negócio perdido (Rita Sousa)", () => {
  it("continua lead, com dois negócios, e o perdido não conta para o valor", () => {
    const S = seed();
    const rita = leadsApp(S).find((p) => p.nome === "Rita Sousa")!;
    expect(rita.papel).toBe("lead");
    expect(rita.todos).toHaveLength(2);
    expect(rita.todos.filter((n) => n.perdido !== null).map((n) => n.titulo)).toEqual(["WC social"]);
    expect(valorColuna(S, rita)).toBeNull();
    expect(valorPessoa(S, rita)).toBe(0);
  });
});

describe("pessoas · quem é lead e quem é cliente", () => {
  it("com a seed: 8 leads e 3 clientes, os mesmos da página de Leads", () => {
    const S = seed();
    expect(nomes(leadsApp(S)).sort()).toEqual([...LEADS].sort());
    expect(nomes(clientesApp(S)).sort()).toEqual([...CLIENTES].sort());
    expect(nomes(leadsApp(S))).toEqual(nomes(leadsDe(S)));
    expect(leadsApp(S).every((p) => p.papel === "lead")).toBe(true);
    expect(clientesApp(S).every((p) => p.papel === "cliente")).toBe(true);
  });
  it("negócio em fase 4 ou 5, ou contrato assinado, faz da pessoa um cliente (mais casos em modeloPessoas.test.ts)", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1031)!.orc!.contrato = "assinado";
    expect(nomes(clientesApp(S))).toContain("Carla Nunes");
    expect(nomes(leadsApp(S))).not.toContain("Carla Nunes");
    const S2 = seed();
    S2.deals.find((d) => d.id === 1030)!.fase = 4;
    expect(nomes(clientesApp(S2))).toContain("Sérgio Pinto");
  });
  it("só negócios perdidos: a pessoa não é lead nem cliente", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1044)!.perdido = true;
    expect(nomes(todosApp(S))).not.toContain("Pedro Lopes");
  });
  it("um perdido em fase 4 mais um aberto em fase 1 mantém a pessoa como lead", () => {
    const S = seed();
    clone(S, 1038, 2102, { fase: 4, perdido: true });
    expect(nomes(leadsApp(S))).toContain("Manuel Costa");
    expect(nomes(clientesApp(S))).not.toContain("Manuel Costa");
  });
});

describe("pessoas · cliente que pede algo novo", () => {
  it("com a seed os três clientes têm um negócio novo em curso (de exemplo), e só aparecem em Clientes", () => {
    const S = seed();
    const marcados = clientesApp(S).filter((p) => p.novoNegocio);
    expect(nomes(marcados).sort()).toEqual([...CLIENTES].sort());
    for (const nome of CLIENTES) expect(nomes(leadsApp(S))).not.toContain(nome);
    expect(leadsApp(S).some((p) => p.novoNegocio)).toBe(false);
  });
  it("a Marta Lima tem o negócio da seed e dois de exemplo: uma cozinha em orçamento e um pavimento perdido", () => {
    const S = seed();
    const marta = clientesApp(S).find((p) => p.nome === "Marta Lima")!;
    expect(marta.todos.map((n) => n.id)).toEqual(["neg-1022", "ex-90107", "ex-90108"]);
    const cozinha = marta.todos[1];
    expect(cozinha).toMatchObject({ titulo: "Cozinha nova", fase: "orcamento", demo: true, negocioId: 1022 });
    expect(cozinha.orcamentos).toHaveLength(1);
    expect(cozinha.deal.linha).toBe("coz");
    expect(cozinha.deal.orc?.enviada).toBeNull();
    expect(marta.todos[2]).toMatchObject({ titulo: "Pavimento exterior", perdido: "preço" });
    expect(S.deals.some((x) => x.id === cozinha.deal.id)).toBe(false);
    expect(valorPessoa(S, marta)).toBeGreaterThan(cozinha.orcamentos[0].valor);
  });
  it("um negócio aberto a sério, antes de contrato, também deixa o cliente em Clientes com a marca", () => {
    const S = seed();
    clone(S, 1027, 2200, NOVO_CLIENTE);
    expect(clientesApp(S).find((p) => p.nome === NOVO_CLIENTE.nome)!.novoNegocio).toBe(false);
    clone(S, 1043, 2201, NOVO_CLIENTE);
    expect(nomes(leadsApp(S))).not.toContain(NOVO_CLIENTE.nome);
    const t = clientesApp(S).find((p) => p.nome === NOVO_CLIENTE.nome)!;
    expect(t.novoNegocio).toBe(true);
    expect(t.todos).toHaveLength(2);
  });
  it("só as pessoas da tabela de exemplos têm negócios de exemplo; as outras só têm o da seed", () => {
    const S = seed();
    for (const p of todosApp(S)) {
      const exemplos = p.todos.filter((n) => n.demo).length;
      expect(exemplos, p.nome).toBe(EXEMPLOS[p.nome]?.length ?? 0);
      expect(p.todos.filter((n) => !n.demo), p.nome).toHaveLength(p.negocios.length);
    }
  });
});

describe("pessoas · casos de borda do negócio novo", () => {
  it("sem o negócio base, a Marta Lima deixa de ter negócio novo", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1022)!.perdido = true;
    expect(clientesApp(S).find((p) => p.nome === "Marta Lima")?.novoNegocio ?? false).toBe(false);
  });
  it("um negócio aberto em fase 4 não conta como novo; só o outro, em fase menor, conta", () => {
    const S = seed();
    clone(S, 1027, 2300, NOVO_CLIENTE);
    clone(S, 1027, 2301, { ...NOVO_CLIENTE, fase: 4 });
    expect(clientesApp(S).find((p) => p.nome === NOVO_CLIENTE.nome)!.novoNegocio).toBe(false);
    clone(S, 1043, 2302, { ...NOVO_CLIENTE, fase: 2 });
    expect(clientesApp(S).find((p) => p.nome === NOVO_CLIENTE.nome)!.novoNegocio).toBe(true);
  });
  it("um negócio perdido de um cliente não é um negócio novo em curso", () => {
    const S = seed();
    clone(S, 1027, 2400, NOVO_CLIENTE);
    clone(S, 1043, 2401, { ...NOVO_CLIENTE, perdido: true });
    expect(clientesApp(S).find((p) => p.nome === NOVO_CLIENTE.nome)!.novoNegocio).toBe(false);
  });
});

describe("pessoas · Todos", () => {
  it("cada pessoa uma só vez e Leads mais Clientes dá Todos", () => {
    const S = seed();
    const t = nomes(todosApp(S));
    expect(new Set(t).size).toBe(t.length);
    expect(t).toHaveLength(leadsApp(S).length + clientesApp(S).length);
    expect([...t].sort()).toEqual([...LEADS, ...CLIENTES].sort());
    expect(contagens(S, "")).toEqual({ leads: 8, clientes: 3, todos: 11 });
  });
  it("uma pessoa com vários negócios aparece uma só vez", () => {
    const S = seed();
    clone(S, 1043, 2001);
    const t = nomes(todosApp(S));
    expect(t.filter((n) => n === "Ana Martins")).toHaveLength(1);
  });
  it("os separadores dão as listas certas", () => {
    const S = seed();
    expect(nomes(pessoasDoSeparador(S, "leads"))).toEqual(nomes(leadsApp(S)));
    expect(nomes(pessoasDoSeparador(S, "clientes"))).toEqual(nomes(clientesApp(S)));
    expect(nomes(pessoasDoSeparador(S, "todos"))).toEqual(nomes(todosApp(S)));
  });
  it("a pesquisa conta nos separadores e encontra por nome, telefone, serviço e local", () => {
    const S = seed();
    expect(nomes(filtrarTexto(todosApp(S), "marta"))).toEqual(["Marta Lima"]);
    expect(nomes(filtrarTexto(todosApp(S), "916 004"))).toEqual(["Marta Lima"]);
    expect(nomes(filtrarTexto(todosApp(S), "  ODIVELAS "))).toEqual(["Marta Lima"]);
    expect(filtrarTexto(todosApp(S), "zzz")).toEqual([]);
    expect(contagens(S, "marta")).toEqual({ leads: 0, clientes: 1, todos: 1 });
  });
});

describe("pessoas · dados do cliente", () => {
  const S = seed();
  const por = (n: string) => clientesApp(S).find((p) => p.nome === n)!;
  const pf = (id: number) => tot(S.deals.find((d) => d.id === id)!, S).pf;
  it("valor total dos negócios ganhos e n.º de contratos: a seed mais a venda direta aceite do Tiago", () => {
    expect(dadosCliente(S, por("Tiago Almeida"))).toMatchObject({ valorTotal: pf(1027) + 4200 + 2350, contratos: 2 });
    expect(dadosCliente(S, por("Marta Lima"))).toMatchObject({ valorTotal: pf(1022), contratos: 1 });
    expect(dadosCliente(S, por("Joana Ribeiro"))).toMatchObject({ valorTotal: pf(1050), contratos: 1 });
  });
  it("um negócio de exemplo ainda em curso, perdido ou à espera de assinatura não entra no valor dos contratos", () => {
    expect(dadosCliente(S, por("Marta Lima")).valorTotal).toBe(pf(1022));
    expect(dadosCliente(S, por("Joana Ribeiro")).valorTotal).toBe(pf(1050));
  });
  it("o último negócio é o mais recente, os de exemplo incluídos e os perdidos não", () => {
    expect(dadosCliente(S, por("Marta Lima")).ultimo).toMatchObject({ servico: "Cozinha nova", quando: "08/10" });
    expect(dadosCliente(S, por("Tiago Almeida")).ultimo).toMatchObject({ servico: "Pintura exterior", quando: "09/10" });
    expect(dadosCliente(S, por("Joana Ribeiro")).ultimo).toMatchObject({ servico: "WC de serviço e lavandaria", quando: "06/10" });
  });
  it("uma venda direta com a proposta aceite conta como negócio ganho, com o seu valor, sem contrato", () => {
    const T = seed();
    T.deals.find((d) => d.id === 1030)!.orc!.aceite = "08/10";
    const sergio = clientesApp(T).find((p) => p.nome === "Sérgio Pinto")!;
    expect(dadosCliente(T, sergio)).toMatchObject({ contratos: 1, valorTotal: tot(T.deals.find((d) => d.id === 1030)!, T).pf });
    expect(documentosDe(sergio).map((d) => d.tipo)).toEqual(["Orçamento", "Proposta", "Orçamento", "Proposta"]);
    expect(documentosDe(sergio)[1].estado).toBe("Aceite");
  });
  it("contratos e documentos: os mesmos de cada negócio (orçamentos, proposta, contrato) mais a fatura e o recibo da seed", () => {
    const tipos = (n: string) => documentosDe(por(n)).map((d) => d.tipo);
    const joana = documentosDe(por("Joana Ribeiro"));
    expect(tipos("Joana Ribeiro")).toEqual(["Orçamento", "Proposta", "Contrato", "Fatura", "Recibo", "Orçamento", "Orçamento", "Proposta", "Contrato"]);
    expect(joana[2]).toMatchObject({ estado: "Assinado", data: "21/09", negocioId: 1050 });
    expect(joana[3]).toMatchObject({ referencia: "FT 2026/380", data: "22/09" });
    expect(joana[4]).toMatchObject({ referencia: "RC 2026/270", data: "24/09" });
    expect(joana[7]).toMatchObject({ estado: "Aceite", inclui: 2 });
    expect(joana[8]).toMatchObject({ estado: "Enviado ao cliente" });
    expect(tipos("Tiago Almeida")).toEqual(["Orçamento", "Proposta", "Contrato", "Orçamento", "Orçamento", "Proposta", "Orçamento", "Proposta"]);
    expect(tipos("Marta Lima")).toEqual(["Orçamento", "Proposta", "Contrato", "Fatura", "Recibo", "Orçamento", "Proposta"]);
    expect(documentosDe(por("Marta Lima")).every((d) => d.negocioId === 1022)).toBe(true);
  });
  it("os negócios perdidos não têm documentos na lista do cliente", () => {
    expect(documentosDe(por("Marta Lima")).some((d) => d.servico === "Pavimento exterior")).toBe(false);
  });
  it("um contrato só enviado aparece como enviado", () => {
    const T = seed();
    T.deals.find((x) => x.id === 1022)!.orc!.contrato = "enviado";
    const docs = documentosDe(clientesApp(T).find((p) => p.nome === "Marta Lima")!);
    expect(docs.find((d) => d.tipo === "Contrato")!.estado).toBe("Enviado ao cliente");
  });
});

describe("pessoas · separador por defeito", () => {
  it("o comercial abre em Leads e os outros papéis em Clientes", () => {
    expect(separadorPorDefeito("comercial")).toBe("leads");
    for (const r of ["direcao", "financeiro", "armazem", "operacoes"] as Papel[]) expect(separadorPorDefeito(r)).toBe("clientes");
  });
});

describe("pessoas · não mutam o Estado", () => {
  it("nada muda o JSON do Estado", () => {
    const S = seed();
    const antes = JSON.stringify(S);
    for (const p of todosApp(S)) { documentosDe(p); valorPessoa(S, p); if (p.papel === "cliente") dadosCliente(S, p); }
    contagens(S, "a"); filtrarTexto(todosApp(S), "a");
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("pessoas · ordenar", () => {
  const S = seed();
  it("urgência mantém a ordem da lista", () => {
    const ls = leadsApp(S);
    expect(nomes(ordenarPessoas(S, ls, "urgencia"))).toEqual(nomes(ls));
    expect(nomes(ordenarPessoas(S, ls, "urgencia"))[0]).toBe("Pedro Lopes");
  });
  it("mais recentes: a que chegou há menos tempo primeiro (Rita Sousa, 08/10) e a mais antiga no fim", () => {
    const o = nomes(ordenarPessoas(S, leadsApp(S), "recentes"));
    expect(o[0]).toBe("Rita Sousa");
    expect(o[o.length - 1]).toBe("Carla Nunes");
    expect(o).toHaveLength(8);
  });
  it("mais recentes com empates: quem chegou ao mesmo tempo mantém a ordem da lista (ordem estável)", () => {
    const S2 = seed();
    clone(S2, 1043, 91001, { nome: "Zé Empate", tel: "910 000 001", quando: "10/10" });
    clone(S2, 1043, 91002, { nome: "Abel Empate", tel: "910 000 002", quando: "10/10" });
    const ls = leadsApp(S2);
    const ordemLista = nomes(ls).filter((n) => n.endsWith("Empate"));
    expect(ordemLista).toHaveLength(2);
    const o = nomes(ordenarPessoas(S2, ls, "recentes"));
    expect(o.filter((n) => n.endsWith("Empate"))).toEqual(ordemLista);
    expect(o.slice(0, 2).sort()).toEqual(["Abel Empate", "Zé Empate"]);
    expect(o[2]).toBe("Rita Sousa");
    expect(nomes(ordenarPessoas(S2, ls, "recentes"))).toEqual(o);
  });
  it("valor: do maior para o menor, e quem não tem orçamento fica no fim pela ordem original", () => {
    const o = ordenarPessoas(S, leadsApp(S), "valor");
    const v = o.map((p) => valorPessoa(S, p));
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeLessThanOrEqual(v[i - 1]);
    expect(nomes(o).slice(0, 2).sort()).toEqual(["Carla Nunes", "Sérgio Pinto"]);
    expect(nomes(o).slice(2)).toEqual(nomes(leadsApp(S)).filter((n) => !["Carla Nunes", "Sérgio Pinto"].includes(n)));
  });
  it("não altera a lista de entrada", () => {
    const ls = leadsApp(S), antes = nomes(ls);
    ordenarPessoas(S, ls, "valor");
    expect(nomes(ls)).toEqual(antes);
  });
});

describe("pessoas · filtros extra (origem e comercial)", () => {
  const S = seed();
  it("as origens e os comerciais disponíveis vêm das pessoas", () => {
    expect(origensDe(S, todosApp(S))).toEqual(expect.arrayContaining(["Google Ads", "Meta Ads", "Indicação", "Site", "TikTok Ads"]));
    expect(comerciaisDe(todosApp(S))).toEqual(["Rúben"]);
  });
  it("origem filtra pelo primeiro toque", () => {
    const f = (origem: string) => nomes(filtrarPessoas(S, todosApp(S), { ...SEM_FILTROS, origem }));
    expect(f("Google Ads")).toEqual(["Luísa Freitas"]);
    expect(f("Meta Ads")).toEqual(["Rita Sousa"]);
    expect(f("TikTok Ads")).toEqual(["Ana Martins"]);
    expect(f("Indicação").sort()).toEqual(["Hugo Matos", "Joana Ribeiro"]);
    expect(f("Origem que não existe")).toEqual([]);
    expect(f("")).toHaveLength(11);
  });
  it("comercial filtra por quem é dono do negócio", () => {
    const T = seed();
    clone(T, 1043, 2601, { nome: "Ana Martins", dono: "direcao" });
    T.deals.find((d) => d.id === 1043)!.dono = "direcao";
    const f = (comercial: string) => nomes(filtrarPessoas(T, todosApp(T), { ...SEM_FILTROS, comercial }));
    expect(f("Direção")).toEqual(["Ana Martins"]);
    expect(f("Rúben")).toHaveLength(10);
    expect(comerciaisDe(todosApp(T))).toEqual(["Direção", "Rúben"]);
  });
  it("combina com a pesquisa e com os filtros de lead", () => {
    const r = filtrarPessoas(S, leadsApp(S), { ...SEM_FILTROS, filtro: "visita", origem: "Google Ads" });
    expect(nomes(r)).toEqual(["Luísa Freitas"]);
    expect(filtrarPessoas(S, leadsApp(S), { ...SEM_FILTROS, q: "cascais", origem: "Google Ads" })).toEqual([]);
    expect(nomes(filtrarPessoas(S, leadsApp(S), { ...SEM_FILTROS, filtro: "atrasadas" }))).toEqual(["Pedro Lopes"]);
  });
});

describe("pessoas · a lista como se vê (ordem e filtros)", () => {
  const S = seed();
  it("a primeira da lista ordenada por urgência é a mais urgente (a atrasada)", () => {
    expect(listaVisivel(S, "leads", SEM_FILTROS, "urgencia")[0]?.nome).toBe("Pedro Lopes");
    const porValor = [...clientesApp(S)].sort((a, b) => dadosCliente(S, b).valorTotal - dadosCliente(S, a).valorTotal);
    expect(clientesApp(S).every((p) => p.novoNegocio)).toBe(true);
    expect(listaVisivel(S, "clientes", SEM_FILTROS, "urgencia")[0]?.nome).toBe(porValor[0].nome);
    expect(listaVisivel(S, "todos", SEM_FILTROS, "urgencia")[0]?.nome).toBe("Pedro Lopes");
  });
  it("segue a ordem e os filtros escolhidos", () => {
    const porValor = nomes(ordenarPessoas(S, leadsApp(S), "valor"));
    expect(listaVisivel(S, "leads", SEM_FILTROS, "valor")[0]?.nome).toBe(porValor[0]);
    expect(listaVisivel(S, "leads", { ...SEM_FILTROS, filtro: "visita" }, "urgencia")[0]?.nome).toBe("Hugo Matos");
    expect(nomes(listaVisivel(S, "leads", { ...SEM_FILTROS, q: "wc social" }, "urgencia"))).toEqual(["Pedro Lopes", "Manuel Costa"]);
  });
  it("lista vazia (sem resultados): não há ninguém", () => {
    expect(listaVisivel(S, "leads", { ...SEM_FILTROS, q: "zzzz" }, "urgencia")[0]).toBeUndefined();
    expect(listaVisivel(S, "leads", { ...SEM_FILTROS, q: "zzzz" }, "urgencia")).toEqual([]);
  });
  it("um chip que o separador não tem volta a Todas; Com visita é um filtro à parte, só das leads", () => {
    expect(chipsDe("leads").map((c) => c.id)).toEqual(["todas", "por_contactar", "atrasadas"]);
    expect(chipsDe("clientes").map((c) => c.id)).toEqual(["todas", "atrasadas"]);
    expect(filtrosEfetivos("clientes", { ...SEM_FILTROS, filtro: "por_contactar" }).filtro).toBe("todas");
    expect(filtrosEfetivos("clientes", { ...SEM_FILTROS, filtro: "visita" }).filtro).toBe("todas");
    expect(filtrosEfetivos("leads", { ...SEM_FILTROS, filtro: "visita" }).filtro).toBe("visita");
  });
  it("não muda o Estado", () => {
    const antes = JSON.stringify(S);
    listaVisivel(S, "todos", SEM_FILTROS, "recentes");
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("pessoas · todos os negócios de cada pessoa (a base do separador Negócios)", () => {
  const S = seed();
  const de = (n: string) => todosApp(S).find((p) => p.nome === n)!;
  it("uma lead sem orçamento: um negócio, em preparação e sem documentos", () => {
    const [n, ...resto] = de("Pedro Lopes").todos;
    expect(resto).toEqual([]);
    expect(n).toMatchObject({ id: "neg-1044", fase: "levantamento", orcamentos: [], proposta: "por gerar" });
    expect(estadoDe(n)).toBe("Em preparação");
  });
  it("uma pessoa com vários negócios tem um por negócio, o da seed primeiro", () => {
    expect(de("Carla Nunes").todos.map((n) => n.titulo)).toEqual(["Cozinha", "Casa de banho e pintura", "Varanda fechada"]);
    expect(de("Tiago Almeida").todos.map((n) => n.id)).toEqual(["neg-1027", "ex-90104", "ex-90105"]);
    expect(de("Sérgio Pinto").todos.map((n) => n.titulo)).toEqual(["WC", "Pintura interior"]);
    expect(de("Marta Lima").todos.map((n) => estadoDe(n))).toEqual(["Concluído", "Orçamento", "Perdido"]);
  });
  it("o papel e as colunas da lista seguem os negócios da seed, não os de exemplo", () => {
    expect(de("Carla Nunes").papel).toBe("lead");
    expect(de("Tiago Almeida").papel).toBe("cliente");
    expect(de("Carla Nunes").negocios).toHaveLength(1);
  });
});
