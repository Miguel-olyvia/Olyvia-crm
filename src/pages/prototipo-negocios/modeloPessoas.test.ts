// O modelo novo da página Pessoas: o que é um negócio ganho, o percurso do negócio (com e sem contrato), quem é lead e quem é cliente,
// e as cinco etapas da pessoa (Lead, Contacto, Visita, Negócio, Cliente). A obra não entra em nada disto.
import { describe, expect, it } from "vitest";
import { seed, type Estado, type Negocio } from "./motor";
import { clientesApp, dadosCliente, documentosDe, ehGanho, leadsApp, proximoNegocio, todosApp } from "./pessoasDocs";
import { ETAPAS_PESSOA, etapaPessoa, etapaTexto } from "./listaDocs";
import { estadoCurto, estadoDe, estadoNegocio, faltaParaOrcamento, pagamentoDe, percursoDe, proximoTexto } from "./perfilDocs";
import { valorNegocio } from "./negociosApp";

const base = (id: number): Negocio => structuredClone(seed().deals.find((d) => d.id === id)!);
const nomes = (l: { nome: string }[]): string[] => l.map((p) => p.nome);
const juntar = (S: Estado, id: number, novoId: number, mudar: Record<string, unknown> = {}): void => {
  S.deals.push({ ...structuredClone(S.deals.find((d) => d.id === id)!), id: novoId, ...mudar } as Negocio);
};
const estados = (d: Negocio): string[] => percursoDe(d).map((x) => x.estado);

describe("ganho · uma só regra", () => {
  it("o contrato assinado ganha, mesmo antes de o motor avançar de fase", () => {
    const d = base(1031);
    d.orc!.aceite = "06/10"; d.orc!.contrato = "assinado";
    expect(d.fase).toBe(3);
    expect(ehGanho(d)).toBe(true);
  });
  it("com contrato exigido, a proposta aceite não chega: falta assinar", () => {
    const d = base(1031);
    d.orc!.aceite = "06/10"; d.orc!.contrato = "enviado";
    expect(ehGanho(d)).toBe(false);
    d.orc!.contrato = null;
    expect(ehGanho(d)).toBe(false);
  });
  it("sem contrato exigido (venda direta), a proposta aceite ganha; só enviada, não", () => {
    const d = base(1030);
    expect(d.orc!.vendaDireta).toBe(true);
    expect(d.orc!.aceite).toBeNull();
    expect(ehGanho(d)).toBe(false);
    d.orc!.aceite = "08/10";
    expect(ehGanho(d)).toBe(true);
  });
  it("Financeiro (fase 4) e a fase 5 já passaram pelo ganho", () => {
    expect(ehGanho(base(1027))).toBe(true);
    expect(ehGanho(base(1022))).toBe(true);
    expect(ehGanho(base(1050))).toBe(true);
  });
  it("leads, negócios em orçamento e perdidos não ganham", () => {
    for (const id of [1044, 1038, 1036, 1031]) expect(ehGanho(base(id)), String(id)).toBe(false);
    const d = base(1027);
    d.perdido = true;
    expect(ehGanho(d)).toBe(false);
    const sem = base(1044);
    sem.orc = null;
    expect(ehGanho(sem)).toBe(false);
  });
});

describe("percurso do negócio · com contrato são cinco passos", () => {
  it("Levantamento, Orçamento, Proposta, Contrato, Financeiro, e a marca Ganho só no Contrato", () => {
    const p = percursoDe(base(1031));
    expect(p.map((x) => x.nome)).toEqual(["Levantamento", "Orçamento", "Proposta", "Contrato", "Financeiro"]);
    expect(p.filter((x) => x.ganho).map((x) => x.nome)).toEqual(["Contrato"]);
  });
  it("cada momento do negócio marca o passo certo", () => {
    const d = base(1031);
    expect(estados(d)).toEqual(["feito", "feito", "atual", "seguinte", "seguinte"]);
    d.orc!.aceite = "06/10"; d.orc!.contrato = "enviado";
    expect(estados(d)).toEqual(["feito", "feito", "feito", "atual", "seguinte"]);
    d.orc!.contrato = "assinado";
    expect(estados(d)).toEqual(["feito", "feito", "feito", "feito", "atual"]);
    expect(estados(base(1027))).toEqual(["feito", "feito", "feito", "feito", "atual"]);
  });
  it("uma lead está no Levantamento; sem proposta enviada está no Orçamento; a fase 5 tem tudo feito", () => {
    expect(estados(base(1044))).toEqual(["atual", "seguinte", "seguinte", "seguinte", "seguinte"]);
    const d = base(1031);
    d.orc!.enviada = null;
    expect(estados(d)).toEqual(["feito", "atual", "seguinte", "seguinte", "seguinte"]);
    for (const id of [1022, 1050]) expect(estados(base(id)).every((e) => e === "feito"), String(id)).toBe(true);
  });
});

describe("percurso do negócio · sem contrato são quatro passos", () => {
  it("Levantamento, Orçamento, Proposta, Financeiro, e a marca Ganho na Proposta", () => {
    const p = percursoDe(base(1030));
    expect(p.map((x) => x.nome)).toEqual(["Levantamento", "Orçamento", "Proposta", "Financeiro"]);
    expect(p.filter((x) => x.ganho).map((x) => x.nome)).toEqual(["Proposta"]);
  });
  it("enviada e por aceitar: Proposta atual; aceite: o Financeiro vem a seguir, sem contrato pelo meio", () => {
    const d = base(1030);
    expect(estados(d)).toEqual(["feito", "feito", "atual", "seguinte"]);
    d.orc!.aceite = "08/10";
    expect(estados(d)).toEqual(["feito", "feito", "feito", "atual"]);
  });
  it("com Financeiro em curso (fase 4) o Financeiro é o atual", () => {
    const d = base(1030);
    d.orc!.aceite = "08/10"; d.fase = 4;
    expect(estados(d)).toEqual(["feito", "feito", "feito", "atual"]);
  });
});

describe("estado do negócio", () => {
  it("em palavras curtas: Em preparação, Orçamento, Proposta, Contrato, Financeiro e Concluído", () => {
    const d = base(1031);
    expect(estadoCurto(base(1044))).toBe("Em preparação");
    d.orc!.enviada = null;
    expect(estadoCurto(d)).toBe("Orçamento");
    d.orc!.enviada = "05/10";
    expect(estadoCurto(d)).toBe("Proposta");
    d.orc!.aceite = "06/10"; d.orc!.contrato = "enviado";
    expect(estadoCurto(d)).toBe("Contrato");
    d.orc!.contrato = "assinado";
    expect(estadoCurto(d)).toBe("Financeiro");
    expect(estadoCurto(base(1027))).toBe("Financeiro");
    expect(estadoCurto(base(1022))).toBe("Concluído");
  });
  it("sem contrato, a proposta aceite passa direta a Financeiro", () => {
    const d = base(1030);
    expect(estadoCurto(d)).toBe("Proposta");
    d.orc!.aceite = "08/10";
    expect(estadoCurto(d)).toBe("Financeiro");
  });
  it("o estado longo diz onde está o negócio e a fase 5 é só Concluído", () => {
    expect(estadoNegocio(base(1044))).toBe("Em preparação");
    expect(estadoNegocio(base(1031))).toBe("Proposta enviada");
    expect(estadoNegocio(base(1027))).toBe("Financeiro");
    expect(estadoNegocio(base(1050))).toBe("Concluído");
  });
  it("o que falta: para o contrato antes do ganho; depois do ganho, o Financeiro; fechado, nada", () => {
    const S = seed();
    expect(faltaParaOrcamento(S, base(1031)).titulo).toBe("O que falta para o contrato");
    const f = faltaParaOrcamento(S, base(1027));
    expect(f.titulo).toBe("O que falta para o pagamento");
    expect(f.passos).toEqual(["Emitir a fatura"]);
    expect(faltaParaOrcamento(S, base(1050)).passos).toEqual([]);
  });
});

describe("a obra não é um passo nem um próximo passo da pessoa", () => {
  const S = seed();
  it("a fase 5 diz Concluído, sem botão para Operações", () => {
    for (const id of [1022, 1050]) {
      const nx = proximoNegocio(base(id), S);
      expect(nx.t, String(id)).toBe("Concluído");
      expect(nx.act, String(id)).toBeUndefined();
      expect(JSON.stringify(nx), String(id)).not.toMatch(/obra/i);
    }
    expect(proximoNegocio(base(1031), S).t).toBe("À espera do cliente");
  });
  it("na lista o próximo passo dos clientes nunca fala de obra", () => {
    for (const p of clientesApp(S)) expect(proximoTexto(p, S), p.nome).not.toMatch(/obra/i);
  });
  it("os documentos do cliente são orçamento, proposta, contrato, fatura e recibo, e os dados não contam obras", () => {
    for (const p of clientesApp(S)) {
      expect(documentosDe(p).every((d) => ["Orçamento", "Proposta", "Contrato", "Fatura", "Recibo"].includes(d.tipo)), p.nome).toBe(true);
      expect(Object.keys(dadosCliente(S, p)), p.nome).toEqual(["valorTotal", "contratos", "ultimo"]);
    }
  });
  it("o negócio da fase 5 aparece como Concluído, com valor, e sem próximo passo, no separador Negócios", () => {
    const joana = clientesApp(S).find((p) => p.nome === "Joana Ribeiro")!;
    const [n] = joana.todos;
    expect(n).toMatchObject({ id: "neg-1050", fase: "obra" });
    expect(estadoDe(n)).toBe("Concluído");
    expect(proximoNegocio(n.deal, S).t).toBe("Concluído");
    expect(valorNegocio(n)).toBeGreaterThan(0);
  });
  it("o cliente mostra o valor contratado e o que falta receber; tudo pago na fase 5, nada pago em Financeiro por pagar", () => {
    const por = (n: string) => clientesApp(S).find((p) => p.nome === n)!;
    expect(pagamentoDe(S, por("Joana Ribeiro"))).toMatchObject({ falta: 0 });
    const tiago = pagamentoDe(S, por("Tiago Almeida"));
    expect(tiago.pago).toBe(0);
    expect(tiago.falta).toBe(tiago.total);
  });
});

describe("lead e cliente · quem é quem", () => {
  it("a seed: as mesmas 8 leads e 3 clientes de antes (ninguém muda de papel)", () => {
    const S = seed();
    expect(nomes(leadsApp(S)).sort()).toEqual(["Ana Martins", "Carla Nunes", "Hugo Matos", "Luísa Freitas", "Manuel Costa", "Pedro Lopes", "Rita Sousa", "Sérgio Pinto"]);
    expect(nomes(clientesApp(S)).sort()).toEqual(["Joana Ribeiro", "Marta Lima", "Tiago Almeida"]);
  });
  it("contrato assinado faz da pessoa um cliente", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1031)!.orc!.contrato = "assinado";
    expect(nomes(clientesApp(S))).toContain("Carla Nunes");
    expect(nomes(leadsApp(S))).not.toContain("Carla Nunes");
  });
  it("venda direta com a proposta aceite faz um cliente, sem contrato nenhum", () => {
    const S = seed();
    const d = S.deals.find((x) => x.id === 1030)!;
    d.orc!.aceite = "08/10";
    expect(d.orc!.contrato).toBeNull();
    expect(nomes(clientesApp(S))).toContain("Sérgio Pinto");
    expect(nomes(leadsApp(S))).not.toContain("Sérgio Pinto");
  });
  it("venda direta só enviada continua lead, com um negócio em curso (etapa Negócio)", () => {
    const S = seed();
    const sergio = leadsApp(S).find((p) => p.nome === "Sérgio Pinto")!;
    expect(sergio.papel).toBe("lead");
    expect(ETAPAS_PESSOA[etapaPessoa(sergio)]).toBe("Negócio");
    expect(etapaTexto(sergio)).toBe("Negócio · proposta");
  });
  it("fase 4 e fase 5 fazem clientes", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1030)!.fase = 4;
    S.deals.find((d) => d.id === 1031)!.fase = 5;
    expect(nomes(clientesApp(S))).toEqual(expect.arrayContaining(["Sérgio Pinto", "Carla Nunes"]));
  });
  it("um negócio perdido não faz a pessoa cliente nem lead", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1027)!.perdido = true;
    expect(nomes(todosApp(S))).not.toContain("Tiago Almeida");
  });
  it("um negócio ganho mais um perdido: continua cliente; um perdido em fase 4 mais um aberto em fase 1 é lead", () => {
    const S = seed();
    juntar(S, 1038, 2102, { fase: 4, perdido: true });
    expect(nomes(leadsApp(S))).toContain("Manuel Costa");
    expect(nomes(clientesApp(S))).not.toContain("Manuel Costa");
    juntar(S, 1027, 2103, { perdido: true });
    expect(nomes(clientesApp(S))).toContain("Tiago Almeida");
  });
  it("o cliente com um negócio novo continua cliente (Novo negócio em curso) e não volta ao passo Negócio", () => {
    const S = seed();
    juntar(S, 1043, 2201, { nome: "Tiago Almeida", tel: "913 220 410", fase: 3 });
    const t = clientesApp(S).find((p) => p.nome === "Tiago Almeida")!;
    expect(t.novoNegocio).toBe(true);
    expect(nomes(leadsApp(S))).not.toContain("Tiago Almeida");
    expect(ETAPAS_PESSOA[etapaPessoa(t)]).toBe("Cliente");
    expect(etapaTexto(t)).toBe("Cliente");
    const marta = clientesApp(S).find((p) => p.nome === "Marta Lima")!;
    expect(marta.novoNegocio).toBe(true);
    expect(etapaTexto(marta)).toBe("Cliente");
  });
  it("um cliente cujo negócio novo também ganhou deixa de ter o aviso", () => {
    const S = seed();
    const novo = { nome: "Bruno Cliente", tel: "910 000 099" };
    juntar(S, 1027, 2300, novo);
    juntar(S, 1027, 2301, { ...novo, fase: 4 });
    expect(clientesApp(S).find((p) => p.nome === "Bruno Cliente")!.novoNegocio).toBe(false);
  });
});

describe("as cinco etapas da pessoa", () => {
  const S = seed();
  const de = (n: string) => todosApp(S).find((p) => p.nome === n)!;
  it("são Lead, Contacto, Visita, Negócio e Cliente", () => {
    expect([...ETAPAS_PESSOA]).toEqual(["Lead", "Contacto", "Visita", "Negócio", "Cliente"]);
  });
  it("cada pessoa da seed está na etapa certa, dita em palavras na lista", () => {
    const esperado: Record<string, [string, string]> = {
      "Pedro Lopes": ["Lead", "Por contactar"], "Manuel Costa": ["Contacto", "Contactada"], "Luísa Freitas": ["Visita", "Com visita"],
      "Carla Nunes": ["Negócio", "Negócio · proposta"], "Sérgio Pinto": ["Negócio", "Negócio · proposta"],
      "Tiago Almeida": ["Cliente", "Cliente"], "Marta Lima": ["Cliente", "Cliente"], "Joana Ribeiro": ["Cliente", "Cliente"],
    };
    for (const [nome, [etapa, texto]] of Object.entries(esperado)) {
      expect(ETAPAS_PESSOA[etapaPessoa(de(nome))], nome).toBe(etapa);
      expect(etapaTexto(de(nome)), nome).toBe(texto);
    }
  });
  it("com o orçamento por enviar a etapa diz o estado curto do negócio", () => {
    const T = seed();
    T.deals.find((d) => d.id === 1031)!.orc!.enviada = null;
    expect(etapaTexto(todosApp(T).find((p) => p.nome === "Carla Nunes")!)).toBe("Negócio · orçamento");
  });
});
