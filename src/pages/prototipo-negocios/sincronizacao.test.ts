// 21/10/2026: o estado partilhado não escreve por cima de uma mudança local ainda por enviar (o envio espera 250 ms): a ação acabada de
// fazer (ex.: validar o pagamento da adenda) não se perde em silêncio quando chega, entretanto, a leitura de 2 em 2 segundos.
// 22/10/2026: a parte mantida NÃO fica com a versão remota: o envio bate no controlo de versão e dá conflito (ganha a remota e avisa-se),
// em vez de esmagar a mudança do outro aparelho. A "global" (contadores, ordem dos negócios) nunca se mantém.
import { beforeEach, describe, expect, it, vi } from "vitest";

/** A tabela prototipo_estado simulada (em memória), com o mesmo encadeamento que o sincronizador usa. */
const bd = vi.hoisted(() => {
  type Linha = { sala: string; chave: string; dados: unknown; versao: number; atualizado?: string };
  const linhas: Linha[] = [];
  const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  class Q {
    private filtros: ((l: Linha) => boolean)[] = [];
    private patch: Partial<Linha> | null = null;
    select() { return this; }
    eq(k: keyof Linha, v: unknown) { this.filtros.push((l) => l[k] === v); return this; }
    in(k: keyof Linha, v: unknown[]) { this.filtros.push((l) => v.includes(l[k])); return this; }
    update(p: Partial<Linha>) { this.patch = p; return this; }
    insert(l: Linha) {
      if (linhas.some((x) => x.sala === l.sala && x.chave === l.chave)) return Promise.resolve({ error: { message: "duplicate key" } });
      linhas.push(copia(l));
      return Promise.resolve({ error: null });
    }
    then<R>(ok: (r: { data: unknown[]; error: null }) => R) {
      const alvo = linhas.filter((l) => this.filtros.every((f) => f(l)));
      if (this.patch) for (const l of alvo) Object.assign(l, copia(this.patch));
      return Promise.resolve({ data: copia(alvo), error: null }).then(ok);
    }
  }
  return { linhas, from: () => new Q() };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => bd.from() } }));

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
  it("a global nunca se mantém: aplica-se a remota e fica em perdidas (para avisar)", () => {
    const r = separarRemoto([{ chave: "global", dados: { g: 2 } }], [{ chave: "global", dados: { g: 9 } }], sinc);
    expect(r.manter).toEqual([]);
    expect(r.aplicar.map((l) => l.chave)).toEqual(["global"]);
    expect(r.perdidas).toEqual(["global"]);
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
  it("com uma ação local por enviar, a leitura não a apaga já: fica a local, com a versão que se conhecia (não a remota), e envia-se a seguir", () => {
    const { s, ler, mudou } = montar();
    const id = ler().deals[0].id, chave = "deal:" + id;
    ler().deals[0].nome = "Local (por enviar)";
    const remoto = structuredClone(ler().deals[0]); remoto.nome = "Remoto";
    s.aplicarRemoto([{ chave, dados: remoto, versao: 2 }]);
    expect(ler().deals[0].nome).toBe("Local (por enviar)");
    // a versão conhecida continua a 1: o envio a seguir bate no controlo de versão e dá conflito (não esmaga a 2)
    expect(s.versoes.get(chave)).toBe(1);
    expect(s.json.get(chave)).not.toContain("Local (por enviar)");
    expect(mudou).toHaveBeenCalled();
  });
  it("a global com mudanças por enviar e a remota diferente: ganha a remota logo e avisa-se", () => {
    const { s, ler, mudou } = montar();
    const aviso = vi.fn(); s.avisarConflito = aviso;
    const remotoG = structuredClone(partesDoEstado(ler())[0].dados) as Record<string, unknown>;
    remotoG.ft = 999;
    ler().ft = 500; // a mudança local por enviar
    s.aplicarRemoto([{ chave: "global", dados: remotoG, versao: 2 }]);
    expect(ler().ft).toBe(999);
    expect(s.versoes.get("global")).toBe(2);
    expect(aviso).toHaveBeenCalled();
    expect(mudou).not.toHaveBeenCalled();
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

describe("Sincronizador: leitura e envio contra a tabela", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Priv = any;
  beforeEach(() => { bd.linhas.length = 0; });
  /** Um aparelho (B) na sala, a conhecer a versão 1 de tudo. */
  function aparelho() {
    let S: Estado = seed();
    const s = new Sincronizador() as Priv;
    s.estadoFonte = { ler: () => S, aplicar: (x: Estado) => { S = x; } };
    s.fontes = [];
    s.ligado = true;
    const aviso = vi.fn(); s.avisarConflito = aviso;
    vi.spyOn(s, "mudou").mockImplementation(() => {});
    for (const p of partesDoEstado(S)) {
      bd.linhas.push({ sala: "principal", chave: p.chave, dados: JSON.parse(JSON.stringify(p.dados)), versao: 1 });
      s.versoes.set(p.chave, 1); s.json.set(p.chave, JSON.stringify(p.dados));
    }
    return { s, ler: () => S, aviso };
  }
  const linha = (chave: string) => bd.linhas.find((l) => l.chave === chave)!;
  /** Outro aparelho (A) grava a parte: muda o nome e sobe a versão. */
  const gravaA = (chave: string, nome: string, versao: number) => {
    const dados = JSON.parse(JSON.stringify(linha(chave).dados)); dados.nome = nome;
    Object.assign(linha(chave), { dados, versao });
  };

  it("A grava o negócio; B tinha uma mudança por enviar no mesmo e lê antes de enviar: o envio de B dá conflito e não esmaga o de A", async () => {
    const B = aparelho();
    const chave = "deal:" + B.ler().deals[0].id;
    gravaA(chave, "Gravado por A", 2);
    // B mexe no mesmo negócio (por enviar) e a leitura de 2 em 2 segundos chega primeiro
    B.ler().deals[0].nome = "Mudado por B";
    await B.s.puxar();
    expect(B.ler().deals[0].nome).toBe("Mudado por B");
    expect(B.s.versoes.get(chave)).toBe(1);
    // o envio de B: conflito, ganha a de A e B é avisado
    await B.s.enviar(false);
    expect((linha(chave).dados as { nome: string }).nome).toBe("Gravado por A");
    expect(linha(chave).versao).toBe(2);
    expect(B.ler().deals[0].nome).toBe("Gravado por A");
    expect(B.aviso).toHaveBeenCalledWith(expect.stringMatching(/Alguém mudou este negócio/));
    // sem ciclo: depois do conflito, nem a leitura nem o envio mexem em nada
    B.aviso.mockClear();
    await B.s.puxar();
    await B.s.enviar(false);
    expect(linha(chave).versao).toBe(2);
    expect(B.aviso).not.toHaveBeenCalled();
  });

  it("sem rede o envio falha; quando volta, a parte por enviar não esmaga o que outro aparelho gravou entretanto", async () => {
    const B = aparelho();
    const chave = "deal:" + B.ler().deals[1].id;
    // o envio falhou (sem rede): o JSON e a versão conhecidos ficam os de antes, a mudança fica por enviar
    B.ler().deals[1].nome = "Mudado por B (sem rede)";
    gravaA(chave, "Gravado por A", 7);
    await B.s.puxar();
    await B.s.enviar(false);
    expect((linha(chave).dados as { nome: string }).nome).toBe("Gravado por A");
    expect(linha(chave).versao).toBe(7);
    expect(B.aviso).toHaveBeenCalled();
  });

  it("a global: um negócio criado noutro aparelho não desaparece da lista por causa de uma mudança local por enviar", async () => {
    const B = aparelho();
    // o aparelho A cria um negócio: a parte nova e a global com a ordem nova
    const novo = { ...structuredClone(B.ler().deals[0]), id: 9999, nome: "Criado em A" };
    const gA = JSON.parse(JSON.stringify(linha("global").dados)); gA.ordem = [...gA.ordem, 9999];
    Object.assign(linha("global"), { dados: gA, versao: 2 });
    bd.linhas.push({ sala: "principal", chave: "deal:9999", dados: novo, versao: 2 });
    // B tem uma mudança na global por enviar (um contador)
    B.ler().rc = B.ler().rc + 1;
    await B.s.puxar();
    expect(B.ler().deals.some((d) => d.id === 9999)).toBe(true);
    expect(B.aviso).toHaveBeenCalled();
    await B.s.enviar(false);
    expect((linha("global").dados as { ordem: number[] }).ordem).toContain(9999);
    expect(linha("global").versao).toBe(2);
  });

  it("sem conflito, a mudança local envia-se normalmente", async () => {
    const B = aparelho();
    const chave = "deal:" + B.ler().deals[0].id;
    B.ler().deals[0].nome = "Só B";
    await B.s.enviar(false);
    expect((linha(chave).dados as { nome: string }).nome).toBe("Só B");
    expect(linha(chave).versao).not.toBe(1);
    expect(B.aviso).not.toHaveBeenCalled();
  });
});
