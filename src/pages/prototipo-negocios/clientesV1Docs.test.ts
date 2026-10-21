import { describe, expect, it } from "vitest";
import { acoes, demo as seed, exemplosClientes } from "./motor";
import { chaveData, clientesV1, estadoNegocio, fichaCliente, filtrarClientes, historicoCliente, moradasObra } from "./clientesV1Docs";

const comAcoes = () => {
  const S = seed(), avisos: string[] = [];
  const A = acoes(S, (a) => avisos.push(a.msg), (fn) => fn());
  return { S, A, avisos };
};

describe("Clientes do V1", () => {
  it("cada cliente junta os seus negócios: a Joana tem a casa de banho concluída e a cozinha em curso", () => {
    const S = seed();
    const j = clientesV1(S).find((c) => c.nome === "Joana Ribeiro")!;
    expect(j.negocios.map((d) => d.id)).toEqual([2001, 1050]);
    expect(j.emCurso.map((d) => d.id)).toEqual([2001]);
    expect(j.concluidos.map((d) => d.id)).toEqual([1050]);
    expect(j.valor).toBeGreaterThan(0);
    expect(j.desde).toBe("21/09");
  });

  it("só são clientes as pessoas com um negócio ganho; os perdidos ficam no cliente, à parte", () => {
    const S = seed();
    const cs = clientesV1(S);
    expect(cs.map((c) => c.nome).sort()).toEqual(["Joana Ribeiro", "Marta Lima", "Tiago Almeida"]);
    const m = cs.find((c) => c.nome === "Marta Lima")!;
    expect(m.perdidos.map((d) => d.id)).toEqual([2003]);
    expect(estadoNegocio(m.perdidos[0])).toBe("Perdido · Adiou a obra para o próximo ano");
    expect(cs[0].obraEmCurso).toBe(true); // a Marta tem a obra em curso: vem primeiro
  });

  it("os exemplos juntam-se a um Estado guardado sem os repetir", () => {
    const S = seed();
    S.deals = S.deals.filter((d) => d.id < 2000);
    expect(exemplosClientes(S)).toBe(true);
    expect(exemplosClientes(S)).toBe(false);
    expect(S.deals.filter((d) => d.id === 2001)).toHaveLength(1);
    // os dados da pessoa vêm do negócio que já tinha
    expect(S.deals.find((d) => d.id === 2001)!.f.email).toBe("joana.ribeiro@exemplo.pt");
  });

  it("novo negócio para o cliente: leva os dados da pessoa e a morada escolhida, e abre-se", () => {
    const { S, A, avisos } = comAcoes();
    A.editarCliente("Tiago Almeida", "nif", "234567890");
    A.novoNegocioCliente("Tiago Almeida", "wc", "Casa de banho da suite", { morada: "Rua Nova 3", cp: "2800-100", localidade: "Almada" });
    const d = S.deals[0];
    expect(S.view).toBe("negocio");
    expect(S.deal).toBe(d.id);
    expect(d).toMatchObject({ nome: "Tiago Almeida", tel: "913 220 410", fase: 0, origem: "cliente", local: "Rua Nova 3, Almada" });
    expect(d.f).toMatchObject({ nif: "234567890", pedido: "Casa de banho da suite", morada: "Rua Nova 3", cp: "2800-100", email: "tiago.almeida@exemplo.pt" });
    expect(avisos).toContain("Negócio criado");
    expect(clientesV1(S).find((c) => c.nome === "Tiago Almeida")!.negocios).toHaveLength(3);
  });

  it("mudar o nome ou o telefone muda em todos os negócios do cliente; o resto fica na ficha", () => {
    const { S, A } = comAcoes();
    A.editarCliente("Joana Ribeiro", "tel", "910 000 000");
    expect(S.deals.filter((d) => d.nome === "Joana Ribeiro").every((d) => d.tel === "910 000 000")).toBe(true);
    A.editarCliente("Joana Ribeiro", "notas", "Prefere obras em agosto");
    A.editarCliente("Joana Ribeiro", "nome", "Joana R. Ribeiro");
    expect(S.deals.some((d) => d.nome === "Joana Ribeiro")).toBe(false);
    expect(fichaCliente(S, "Joana R. Ribeiro").notas).toBe("Prefere obras em agosto");
    expect(clientesV1(S).find((c) => c.nome === "Joana R. Ribeiro")!.negocios).toHaveLength(2);
  });

  it("não deixa dar a um cliente o nome de outro", () => {
    const { S, A, avisos } = comAcoes();
    A.editarCliente("Joana Ribeiro", "nome", "Marta Lima");
    expect(avisos).toContain("Já há um cliente com esse nome");
    expect(S.deals.filter((d) => d.nome === "Joana Ribeiro")).toHaveLength(2);
  });

  it("a ficha, as moradas das obras, o histórico e a pesquisa", () => {
    const S = seed();
    const j = clientesV1(S).find((c) => c.nome === "Joana Ribeiro")!;
    const f = fichaCliente(S, j.nome, j.negocios);
    expect(f).toMatchObject({ nif: "123456789", email: "joana.ribeiro@exemplo.pt", tipo_cliente: "Particular", tel: "916 480 213" });
    expect(moradasObra(j).length).toBeGreaterThanOrEqual(1);
    const h = historicoCliente(j);
    expect(h[0].negocio.id).toBe(2001); // o mais recente primeiro (16/10)
    expect(h.map((e) => chaveData(e.q))).toEqual([...h.map((e) => chaveData(e.q))].sort((a, b) => b - a));
    const cs = clientesV1(S);
    expect(filtrarClientes(cs, "todos", "cozinha").map((c) => c.nome).sort()).toEqual(["Joana Ribeiro", "Marta Lima", "Tiago Almeida"]);
    expect(filtrarClientes(cs, "obra", "").map((c) => c.nome)).toEqual(["Marta Lima"]);
    expect(filtrarClientes(cs, "todos", "916480").map((c) => c.nome)).toEqual(["Joana Ribeiro"]);
  });
});
