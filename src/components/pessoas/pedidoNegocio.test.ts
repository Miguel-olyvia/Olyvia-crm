// A lógica pura dos pedidos: a fase deriva dos dados, a próxima visita e o prazo, e o próximo contacto da pessoa.
import { describe, expect, it } from "vitest";
import { pedidoBase, pessoaBase, visitaBase } from "./fabricaTestes";
import {
  faseDoPedido, horaDoProximoContacto, nomeDoPedido, pedidoNovo, prazoDoPedido, proximaVisitaDoPedido, proximoContactoDaPessoa, proximoIdPedido,
  proximoContactoVemDeVisita, rotuloDoPedido, textoDoRotulo,
} from "./pedidoNegocio";

/** Um `t` de teste com os textos reais do nome do pedido. */
const TEXTOS: Record<string, string> = {
  "pessoasPagina.process.requestName.date": "Pedido de {date}", "pessoasPagina.process.requestName.ofTotal": "{name} ({n} de {total})",
};
const t = (chave: string, params: Record<string, string | number> = {}): string =>
  Object.entries(params).reduce((texto, [k, v]) => texto.split(`{${k}}`).join(String(v)), TEXTOS[chave] ?? chave);

describe("proximoContactoVemDeVisita", () => {
  const visita = (data: string, estado: "porFazer" | "feita" = "porFazer") =>
    pedidoBase("pd-1", { pessoaId: "a", contactado: true, visitas: [visitaBase("v1", { data, estado })] });

  it("sem chamada agendada e com uma visita por fazer, o próximo contacto é a visita", () => {
    expect(proximoContactoVemDeVisita({ id: "a", proximoContacto: undefined }, [visita("2026-10-16")])).toBe(true);
  });
  it("uma chamada agendada mais cedo do que a visita: vem da chamada", () => {
    expect(proximoContactoVemDeVisita({ id: "a", proximoContacto: "2026-10-14" }, [visita("2026-10-16")])).toBe(false);
  });
  it("uma visita mais cedo do que a chamada, ou no mesmo dia: vem da visita", () => {
    expect(proximoContactoVemDeVisita({ id: "a", proximoContacto: "2026-10-20" }, [visita("2026-10-16")])).toBe(true);
    expect(proximoContactoVemDeVisita({ id: "a", proximoContacto: "2026-10-16" }, [visita("2026-10-16")])).toBe(true);
  });
  it("sem próximo contacto, ou com a visita já feita, ou de outra pessoa, não vem de visita", () => {
    expect(proximoContactoVemDeVisita({ id: "a", proximoContacto: undefined }, [])).toBe(false);
    expect(proximoContactoVemDeVisita({ id: "a", proximoContacto: undefined }, [visita("2026-10-16", "feita")])).toBe(false);
    expect(proximoContactoVemDeVisita({ id: "b", proximoContacto: undefined }, [visita("2026-10-16")])).toBe(false);
  });
});

describe("nomeDoPedido: o nome de um pedido, igual em todo o lado", () => {
  const A = pedidoBase("pd-1", { servico: "Cozinha", criadoEm: "2026-10-01" });
  const B = pedidoBase("pd-2", { servico: "", criadoEm: "2026-10-05" });
  const C = pedidoBase("pd-3", { servico: "", criadoEm: "2026-10-09" });

  it("com serviço, o nome é o serviço", () => {
    expect(nomeDoPedido(t, A, [A, B])).toBe("Cozinha");
  });

  it("sem serviço, é «Pedido de» e o dia em que foi criado (dd/mm/aaaa)", () => {
    expect(nomeDoPedido(t, B, [A, B, C])).toBe("Pedido de 05/10/2026");
    expect(nomeDoPedido(t, C, [A, B, C])).toBe("Pedido de 09/10/2026");
  });

  it("um serviço só de espaços conta como sem serviço", () => {
    const so = pedidoBase("pd-4", { servico: "   ", criadoEm: "2026-10-02" });
    expect(nomeDoPedido(t, so, [so])).toBe("Pedido de 02/10/2026");
  });

  it("dois pedidos sem serviço criados no mesmo dia ficam «(1 de 2)» e «(2 de 2)», pela ordem da lista", () => {
    const x = pedidoBase("pd-5", { servico: "", criadoEm: "2026-10-01" });
    const y = pedidoBase("pd-6", { servico: "", criadoEm: "2026-10-01" });
    expect(nomeDoPedido(t, x, [x, y])).toBe("Pedido de 01/10/2026 (1 de 2)");
    expect(nomeDoPedido(t, y, [x, y])).toBe("Pedido de 01/10/2026 (2 de 2)");
  });

  it("dois pedidos com o mesmo serviço também se numeram; um terceiro com outro serviço fica como está", () => {
    const x = pedidoBase("pd-5", { servico: "Janelas" });
    const y = pedidoBase("pd-6", { servico: "Janelas" });
    const z = pedidoBase("pd-7", { servico: "Cozinha" });
    expect(nomeDoPedido(t, x, [x, y, z])).toBe("Janelas (1 de 2)");
    expect(nomeDoPedido(t, y, [x, y, z])).toBe("Janelas (2 de 2)");
    expect(nomeDoPedido(t, z, [x, y, z])).toBe("Cozinha");
  });

  it("três repetidos: «(1 de 3)», «(2 de 3)», «(3 de 3)»", () => {
    const lista = ["a", "b", "c"].map((id) => pedidoBase(`pd-${id}`, { servico: "", criadoEm: "2026-10-01" }));
    expect(lista.map((p) => nomeDoPedido(t, p, lista))).toEqual([
      "Pedido de 01/10/2026 (1 de 3)", "Pedido de 01/10/2026 (2 de 3)", "Pedido de 01/10/2026 (3 de 3)",
    ]);
  });

  it("o rótulo diz a posição e o total só entre os repetidos; sozinho, total 1", () => {
    expect(rotuloDoPedido(B, [A, B, C])).toEqual({ servico: "", criadoEm: "2026-10-05", posicao: 1, total: 1 });
    const x = pedidoBase("pd-5", { servico: "", criadoEm: "2026-10-01" });
    const y = pedidoBase("pd-6", { servico: "", criadoEm: "2026-10-01" });
    expect(rotuloDoPedido(y, [x, y])).toMatchObject({ posicao: 2, total: 2 });
    expect(textoDoRotulo(t, rotuloDoPedido(y, [x, y]))).toBe(nomeDoPedido(t, y, [x, y]));
  });

  it("um pedido que não está na lista dá o nome simples (sem numeração)", () => {
    expect(nomeDoPedido(t, B, [])).toBe("Pedido de 05/10/2026");
  });
});

describe("faseDoPedido", () => {
  it("sem chamada e sem visitas está por contactar", () => {
    expect(faseDoPedido(pedidoBase("pd-1"))).toBe("porContactar");
  });

  it("contactado e sem visitas está contactado", () => {
    expect(faseDoPedido(pedidoBase("pd-1", { contactado: true }))).toBe("contactado");
  });

  it("com uma visita por fazer ou feita está na fase da visita", () => {
    expect(faseDoPedido(pedidoBase("pd-1", { contactado: true, visitas: [visitaBase("v1")] }))).toBe("visita");
    expect(faseDoPedido(pedidoBase("pd-1", { contactado: true, visitas: [visitaBase("v1", { estado: "feita" })] }))).toBe("visita");
  });

  it("só com visitas canceladas volta à fase anterior (contactado, ou por contactar)", () => {
    const cancelada = [visitaBase("v1", { estado: "cancelada" })];
    expect(faseDoPedido(pedidoBase("pd-1", { contactado: true, visitas: cancelada }))).toBe("contactado");
    expect(faseDoPedido(pedidoBase("pd-1", { contactado: false, visitas: cancelada }))).toBe("porContactar");
  });

  it("uma visita não cancelada chega, mesmo com outras canceladas", () => {
    const visitas = [visitaBase("v1", { estado: "cancelada" }), visitaBase("v2")];
    expect(faseDoPedido(pedidoBase("pd-1", { visitas }))).toBe("visita");
  });
});

describe("proximaVisitaDoPedido e prazoDoPedido", () => {
  it("a próxima visita é a primeira por fazer, por ordem cronológica", () => {
    const pedido = pedidoBase("pd-1", {
      visitas: [visitaBase("v3", { data: "2026-10-25" }), visitaBase("v2", { data: "2026-10-22" }), visitaBase("v1", { data: "2026-10-18", estado: "feita" })],
    });
    expect(proximaVisitaDoPedido(pedido)?.id).toBe("v2");
    expect(prazoDoPedido(pedido)).toBe("2026-10-22");
  });

  it("sem visitas por fazer não há próxima visita nem prazo (feitas e canceladas não contam)", () => {
    const pedido = pedidoBase("pd-1", { visitas: [visitaBase("v1", { estado: "feita" }), visitaBase("v2", { estado: "cancelada" })] });
    expect(proximaVisitaDoPedido(pedido)).toBeUndefined();
    expect(prazoDoPedido(pedido)).toBeNull();
    expect(prazoDoPedido(pedidoBase())).toBeNull();
  });

  it("uma visita por fazer sem data não dá prazo", () => {
    expect(prazoDoPedido(pedidoBase("pd-1", { visitas: [visitaBase("v1", { data: "" })] }))).toBeNull();
  });
});

describe("proximoContactoDaPessoa", () => {
  const pessoa = (proximoContacto?: string | null) => pessoaBase("a", { proximoContacto });

  it("sem chamada agendada nem visitas é nulo", () => {
    expect(proximoContactoDaPessoa(pessoa(), [])).toBeNull();
    expect(proximoContactoDaPessoa(pessoa(null), [pedidoBase()])).toBeNull();
    expect(proximoContactoDaPessoa(pessoa(""), [])).toBeNull();
  });

  it("só a chamada agendada: devolve-a", () => {
    expect(proximoContactoDaPessoa(pessoa("2026-10-18"), [pedidoBase()])).toBe("2026-10-18");
  });

  it("só visitas: devolve a mais cedo de todos os pedidos da pessoa", () => {
    const pedidos = [
      pedidoBase("pd-1", { visitas: [visitaBase("v1", { data: "2026-10-24" })] }),
      pedidoBase("pd-2", { visitas: [visitaBase("v2", { data: "2026-10-21" })] }),
    ];
    expect(proximoContactoDaPessoa(pessoa(null), pedidos)).toBe("2026-10-21");
  });

  it("o mais cedo entre a chamada agendada e as visitas", () => {
    const pedidos = [pedidoBase("pd-1", { visitas: [visitaBase("v1", { data: "2026-10-20" })] })];
    expect(proximoContactoDaPessoa(pessoa("2026-10-18"), pedidos)).toBe("2026-10-18");
    expect(proximoContactoDaPessoa(pessoa("2026-10-25"), pedidos)).toBe("2026-10-20");
  });

  it("ignora os pedidos de outras pessoas e as visitas já feitas ou canceladas", () => {
    const pedidos = [
      pedidoBase("pd-1", { pessoaId: "outra", visitas: [visitaBase("v1", { data: "2026-10-15" })] }),
      pedidoBase("pd-2", { visitas: [visitaBase("v2", { data: "2026-10-16", estado: "feita" }), visitaBase("v3", { data: "2026-10-17", estado: "cancelada" })] }),
    ];
    expect(proximoContactoDaPessoa(pessoa("2026-10-30"), pedidos)).toBe("2026-10-30");
  });
});

describe("pedidoNovo e proximoIdPedido", () => {
  it("nasce por contactar, sem visitas nem levantamento, com a data de hoje", () => {
    const p = pedidoNovo({ pessoaId: "a", servico: "Cozinha", comercial: "Ana Ribeiro" }, "2026-10-16", "pd-9");
    expect(p).toEqual({ id: "pd-9", pessoaId: "a", servico: "Cozinha", comercial: "Ana Ribeiro", criadoEm: "2026-10-16", contactado: false, visitas: [] });
    expect("levantamento" in p).toBe(false);
  });

  it("o próximo id continua a numeração dos pd-<n> (sem pedidos, pd-1); ignora ids de outro formato", () => {
    expect(proximoIdPedido([])).toBe("pd-1");
    expect(proximoIdPedido([pedidoBase("pd-2"), pedidoBase("pd-10"), pedidoBase("pd-novo-7")])).toBe("pd-11");
  });
});

describe("horaDoProximoContacto", () => {
  const visita = (data: string, hora: string, estado: "porFazer" | "feita" = "porFazer") =>
    pedidoBase("pd-1", { visitas: [visitaBase("v1", { data, hora, estado })] });

  it("com a chamada agendada para o dia mais cedo, é a hora dela", () => {
    const pessoa = pessoaBase("a", { proximoContacto: "2026-10-14", proximoHora: "15:00" });
    expect(horaDoProximoContacto(pessoa, [visita("2026-10-20", "09:00")])).toBe("15:00");
  });

  it("com a visita no dia mais cedo, é a hora da visita; sem hora, nenhuma", () => {
    const pessoa = pessoaBase("a", { proximoContacto: "2026-10-20", proximoHora: "15:00" });
    expect(horaDoProximoContacto(pessoa, [visita("2026-10-16", "09:30")])).toBe("09:30");
    expect(horaDoProximoContacto(pessoa, [visita("2026-10-16", "")])).toBeUndefined();
  });

  it("uma visita feita não conta; sem próximo contacto, nenhuma hora", () => {
    expect(horaDoProximoContacto(pessoaBase("a", { proximoContacto: null }), [visita("2026-10-16", "09:30", "feita")])).toBeUndefined();
  });
});
