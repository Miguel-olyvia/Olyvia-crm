// As perguntas do cliente no Hoje (regras puras) e as respostas guardadas em memória (hojeV2Store.ts).
import { beforeEach, describe, expect, it } from "vitest";
import { seed } from "../motor";
import {
  MAX_TEXTO, MODELOS_RESPOSTA, OUTRA, PERGUNTAS_EXEMPLO, contactoDe, destinoDe, faltaEnviar, haQuanto, perguntasPorResponder, primeiroNome,
  textoResposta, vePerguntas,
} from "./perguntasCliente";
import { esquecerHojeV2, lerHojeV2, responderPergunta } from "./hojeV2Store";

const P = (id: string) => PERGUNTAS_EXEMPLO.find((p) => p.id === id)!;

beforeEach(() => esquecerHojeV2());

describe("perguntas do cliente", () => {
  it("cada pergunta é de um negócio da seed, com cliente, negócio, origem, texto e quando", () => {
    const S = seed();
    for (const p of PERGUNTAS_EXEMPLO) {
      const d = S.deals.find((x) => x.id === p.dealId)!;
      expect(d.nome).toBe(p.cliente);
      expect(p.origem).toMatch(/^Portal do cliente/);
      expect(p.texto.length).toBeGreaterThan(20);
    }
  });
  it("só o Comercial e a Direção as veem; mais recentes primeiro; as respondidas saem", () => {
    expect(vePerguntas("comercial") && vePerguntas("direcao")).toBe(true);
    expect(perguntasPorResponder("financeiro", [])).toEqual([]);
    expect(perguntasPorResponder("operacoes", [])).toEqual([]);
    expect(perguntasPorResponder("comercial", []).map((p) => p.id)).toEqual(["pc3", "pc1", "pc2"]);
    expect(perguntasPorResponder("direcao", ["pc3"]).map((p) => p.id)).toEqual(["pc1", "pc2"]);
  });
  it("o contacto vem resolvido do negócio: email, telefone (WhatsApp) e o canal sugerido", () => {
    const S = seed();
    const c = contactoDe(S, P("pc1"));
    expect(c).toEqual({ email: "carla.nunes@exemplo.pt", tel: "938 101 777", preferido: "Email" });
    expect(destinoDe(c, "WhatsApp")).toBe("938 101 777");
    S.deals.find((d) => d.id === 1031)!.f.pref = "WhatsApp";
    expect(contactoDe(S, P("pc1")).preferido).toBe("WhatsApp");
    S.deals.find((d) => d.id === 1031)!.f.email = "";
    S.deals.find((d) => d.id === 1031)!.f.pref = "Telefone";
    expect(contactoDe(S, P("pc1"))).toEqual({ email: null, tel: "938 101 777", preferido: "WhatsApp" });
  });
  it("o texto: o do modelo (com o primeiro nome) ou o escrito, aparado e curto", () => {
    const p = P("pc2");
    expect(textoResposta(p, null, "")).toBeNull();
    expect(textoResposta(p, MODELOS_RESPOSTA[0].id, "")).toMatch(/^Olá Sérgio, /);
    expect(textoResposta(p, OUTRA, "   ")).toBeNull();
    expect(textoResposta(p, OUTRA, "  Sim, começamos dia 27. ")).toBe("Sim, começamos dia 27.");
    expect(textoResposta(p, OUTRA, "x".repeat(400))).toHaveLength(MAX_TEXTO);
    expect(primeiroNome("  Marta  Lima ")).toBe("Marta");
  });
  it("o que falta para enviar: o canal (com destino) e o texto", () => {
    const c = { email: null, tel: "910 000 000", preferido: "WhatsApp" as const };
    expect(faltaEnviar(c, null, null)).toEqual(["Escolha o canal.", "Escolha uma resposta ou escreva uma."]);
    expect(faltaEnviar(c, "Email", "Olá")).toEqual(["O cliente não tem email: responda por WhatsApp."]);
    expect(faltaEnviar(c, "WhatsApp", "Olá")).toEqual([]);
  });
  it("há quanto tempo chegou", () => {
    expect(haQuanto(20)).toBe("há 20 min");
    expect(haQuanto(95)).toBe("há 1 h 35 min");
    expect(haQuanto(240)).toBe("há 4 h");
  });
  it("a resposta fica em memória, uma só vez por pergunta, e esquecerHojeV2 apaga-a", () => {
    expect(responderPergunta({ pergunta: "pc1", cliente: "Carla Nunes", canal: "Email", para: "carla.nunes@exemplo.pt", texto: "Olá" })).not.toBeNull();
    expect(responderPergunta({ pergunta: "pc1", cliente: "Carla Nunes", canal: "WhatsApp", para: "938 101 777", texto: "Olá" })).toBeNull();
    expect(lerHojeV2().respostas).toHaveLength(1);
    esquecerHojeV2();
    expect(lerHojeV2().respostas).toEqual([]);
  });
});
