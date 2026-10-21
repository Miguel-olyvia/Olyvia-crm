// 21/10/2026: o estado partilhado não escreve por cima de uma mudança local ainda por enviar (o envio espera 250 ms): a ação acabada de
// fazer (ex.: validar o pagamento da adenda) não se perde quando chega, entretanto, a leitura de 2 em 2 segundos.
import { describe, expect, it, vi } from "vitest";
import { Sincronizador, partesDoEstado, separarRemoto } from "./sincronizacao";
import { seed, type Estado } from "./motor";

describe("separarRemoto", () => {
  const sinc = new Map([["deal:1", JSON.stringify({ a: 1 })], ["global", JSON.stringify({ g: 1 })]]);
  it("sem mudanças locais, aplica as remotas (o caso normal)", () => {
    const r = separarRemoto([{ chave: "deal:1", dados: { a: 2 } }], [{ chave: "deal:1", dados: { a: 1 } }], sinc);
    expect(r.aplicar.map((l) => l.chave)).toEqual(["deal:1"]);
    expect(r.manter).toEqual([]);
  });
  it("com uma mudança local por enviar, mantém a local", () => {
    const r = separarRemoto([{ chave: "deal:1", dados: { a: 2 } }, { chave: "global", dados: { g: 2 } }], [{ chave: "deal:1", dados: { a: 9 } }, { chave: "global", dados: { g: 1 } }], sinc);
    expect(r.manter.map((l) => l.chave)).toEqual(["deal:1"]);
    expect(r.aplicar.map((l) => l.chave)).toEqual(["global"]);
  });
  it("a remota igual à local aplica-se (só a versão muda)", () => {
    const r = separarRemoto([{ chave: "deal:1", dados: { a: 9 } }], [{ chave: "deal:1", dados: { a: 9 } }], sinc);
    expect(r.aplicar).toHaveLength(1);
  });
  it("uma parte nunca sincronizada (a primeira leitura, ou nova) aplica-se", () => {
    const r = separarRemoto([{ chave: "deal:2", dados: { b: 1 } }], [{ chave: "deal:2", dados: { b: 0 } }], sinc);
    expect(r.aplicar).toHaveLength(1);
  });
});

describe("Sincronizador: aplicarRemoto", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Priv = any;
  function montar() {
    let S: Estado = seed();
    const s = new Sincronizador() as Priv;
    s.estadoFonte = { ler: () => S, aplicar: (x: Estado) => { S = x; } };
    s.fontes = [];
    s.ligado = true;
    const mudou = vi.spyOn(s, "mudou").mockImplementation(() => {});
    // o que este aparelho conhece como sincronizado (versão 1 de tudo)
    for (const p of partesDoEstado(S)) { s.versoes.set(p.chave, 1); s.json.set(p.chave, JSON.stringify(p.dados)); }
    return { s, ler: () => S, mudou };
  }
  it("uma mudança remota normal aplica-se e fica a versão nova", () => {
    const { s, ler, mudou } = montar();
    const d = structuredClone(ler().deals[0]); d.nome = "Remoto";
    s.aplicarRemoto([{ chave: "deal:" + d.id, dados: d, versao: 2 }]);
    expect(ler().deals[0].nome).toBe("Remoto");
    expect(s.versoes.get("deal:" + d.id)).toBe(2);
    expect(mudou).not.toHaveBeenCalled();
  });
  it("com uma ação local por enviar, a leitura não a apaga: fica a local, com a versão remota, e envia-se a seguir", () => {
    const { s, ler, mudou } = montar();
    const id = ler().deals[0].id, chave = "deal:" + id;
    ler().deals[0].nome = "Local (por enviar)";
    const remoto = structuredClone(ler().deals[0]); remoto.nome = "Remoto";
    s.aplicarRemoto([{ chave, dados: remoto, versao: 2 }]);
    expect(ler().deals[0].nome).toBe("Local (por enviar)");
    // a versão remota passa a ser a conhecida (o envio a seguir grava por cima dela sem conflito) e o JSON fica o de antes (está por enviar)
    expect(s.versoes.get(chave)).toBe(2);
    expect(s.json.get(chave)).not.toContain("Local (por enviar)");
    expect(mudou).toHaveBeenCalled();
  });
  it("no conflito do envio (forçar), ganha a remota, como antes", () => {
    const { s, ler } = montar();
    const chave = "deal:" + ler().deals[0].id;
    ler().deals[0].nome = "Local";
    const remoto = structuredClone(ler().deals[0]); remoto.nome = "Remoto";
    s.aplicarRemoto([{ chave, dados: remoto, versao: 3 }], true);
    expect(ler().deals[0].nome).toBe("Remoto");
    expect(s.versoes.get(chave)).toBe(3);
  });
  it("as outras partes remotas aplicam-se na mesma leitura", () => {
    const { s, ler } = montar();
    const [d0, d1] = ler().deals;
    d0.nome = "Local";
    const r0 = structuredClone(d0); r0.nome = "R0";
    const r1 = structuredClone(d1); r1.nome = "R1";
    s.aplicarRemoto([{ chave: "deal:" + d0.id, dados: r0, versao: 2 }, { chave: "deal:" + d1.id, dados: r1, versao: 2 }]);
    expect(ler().deals[0].nome).toBe("Local");
    expect(ler().deals[1].nome).toBe("R1");
  });
});
