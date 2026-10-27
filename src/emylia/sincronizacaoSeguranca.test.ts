// 23/10/2026 (segurança): a sincronização por organização.
// · um Estado marcado com outra organização nunca se grava nem recebe as partes desta;
// · uma ligação antiga (outra organização) que responde depois de se trocar é ignorada;
// · a equipa lê e grava pelas funções da 0015 (e volta à tabela se ainda não existirem); a recusa (42501) não é falta de rede;
// · o que se muda sem rede fica na fila: ao voltar, se ninguém mexeu, envia-se; se outra pessoa mudou, abre-se o conflito e a pessoa
//   escolhe (as minhas / as da outra pessoa), sem perder nada em silêncio.
import { beforeEach, describe, expect, it, vi } from "vitest";

const bd = vi.hoisted(() => {
  type Linha = { organizacao_id: string; chave: string; dados: unknown; versao: number };
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
      if (linhas.some((x) => x.organizacao_id === l.organizacao_id && x.chave === l.chave)) return Promise.resolve({ error: { message: "duplicate key" } });
      linhas.push(copia(l));
      return Promise.resolve({ error: null });
    }
    then<R>(ok: (r: { data: unknown[]; error: null }) => R) {
      const alvo = linhas.filter((l) => this.filtros.every((f) => f(l)));
      if (this.patch) for (const l of alvo) Object.assign(l, copia(this.patch));
      return Promise.resolve({ data: copia(alvo), error: null }).then(ok);
    }
  }
  return { linhas, from: () => new Q(), tabelaUsada: 0 };
});
const rpc = vi.hoisted(() => ({
  chamadas: [] as { fn: string; args?: Record<string, unknown> }[],
  responder: null as null | ((fn: string, args?: Record<string, unknown>) => { data: unknown; error: unknown }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => { bd.tabelaUsada++; return bd.from(); },
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpc.chamadas.push({ fn, args });
      return Promise.resolve(rpc.responder ? rpc.responder(fn, args) : { data: null, error: { code: "PGRST202", message: "sem função" } });
    },
  },
}));

import { ErroSemPermissao, Sincronizador, armazemEquipa, juntarEstado, nomeDaParte, partesDoEstado, type Armazem, type Linha } from "./sincronizacao";
import { seed, type Estado, type Negocio } from "./motor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Priv = any;
const ORG = "org-a";

beforeEach(() => {
  bd.linhas.length = 0; bd.tabelaUsada = 0;
  rpc.chamadas.length = 0; rpc.responder = null;
  localStorage.clear();
});

/** Um aparelho ligado à organização ORG, a conhecer a versão 1 de tudo (como depois da 1.ª leitura). */
function aparelho(armazem: Armazem = armazemEquipa(ORG)) {
  let S: Estado = seed();
  S.org = ORG;
  const s = new Sincronizador() as Priv;
  s.estadoFonte = { ler: () => S, aplicar: (x: Estado) => { S = x; } };
  s.fontes = [];
  s.armazem = armazem;
  s.ligado = true; s.carregado = true;
  const aviso = vi.fn(); s.avisarConflito = aviso;
  vi.spyOn(s, "mudou").mockImplementation(() => {});
  for (const p of partesDoEstado(S)) {
    bd.linhas.push({ organizacao_id: ORG, chave: p.chave, dados: JSON.parse(JSON.stringify(p.dados)), versao: 1 });
    s.versoes.set(p.chave, 1); s.json.set(p.chave, JSON.stringify(p.dados));
  }
  return { s, ler: () => S, trocar: (x: Estado) => { S = x; }, aviso };
}
const linha = (chave: string) => bd.linhas.find((l) => l.chave === chave)!;
const gravaOutro = (chave: string, nome: string, versao: number) => {
  const dados = JSON.parse(JSON.stringify(linha(chave).dados)); dados.nome = nome;
  Object.assign(linha(chave), { dados, versao });
};

describe("um Estado de outra organização nunca vai para esta", () => {
  it("o envio recusa um Estado marcado com outra organização (nada se grava)", async () => {
    const B = aparelho();
    const chave = "deal:" + B.ler().deals[0].id;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    B.ler().org = "org-b"; // ex.: trocou-se de organização a meio
    B.ler().deals[0].nome = "Da organização B";
    await B.s.enviar(true);
    expect((linha(chave).dados as { nome: string }).nome).not.toBe("Da organização B");
    expect(linha(chave).versao).toBe(1);
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
  it("um Estado sem marca também não se grava numa organização", async () => {
    const B = aparelho();
    delete B.ler().org;
    B.ler().deals[0].nome = "Sem marca";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await B.s.enviar(false);
    expect(bd.linhas.some((l) => (l.dados as { nome?: string }).nome === "Sem marca")).toBe(false);
  });
  it("as partes que chegam não se aplicam num Estado de outra organização", () => {
    const B = aparelho();
    B.ler().org = "org-b";
    const d = structuredClone(B.ler().deals[0]); d.nome = "Remoto de A";
    B.s.aplicarRemoto([{ chave: "deal:" + d.id, dados: d, versao: 2 }]);
    expect(B.ler().deals[0].nome).not.toBe("Remoto de A");
  });
  it("uma ligação antiga que responde depois de se trocar de organização é ignorada", async () => {
    (globalThis as { __olyviaSincNosTestes?: boolean }).__olyviaSincNosTestes = true;
    try {
      const s = new Sincronizador();
      let S: Estado = { ...seed(), org: "org-b" };
      const aplicar = vi.fn((x: Estado) => { S = x; });
      let soltarA: (l: Linha[]) => void = () => {};
      const A: Armazem = { ...armazemEquipa("org-a"), tudo: () => new Promise<Linha[]>((r) => { soltarA = r; }) };
      const dB = { ...structuredClone(S.deals[0]), nome: "Da B" };
      const gB = partesDoEstado(S)[0].dados;
      const B: Armazem = { ...armazemEquipa("org-b"), tudo: async () => [{ chave: "global", dados: gB, versao: 1 }, { chave: "deal:" + dB.id, dados: dB, versao: 1 }], versoes: async () => [] };
      void s.ligar(A, { ler: () => S, aplicar }, [], () => {}, () => {});
      s.desligar();
      await s.ligar(B, { ler: () => S, aplicar }, [], () => {}, () => {});
      expect(S.deals[0].nome).toBe("Da B");
      aplicar.mockClear();
      const dA = { ...structuredClone(S.deals[0]), nome: "Da A (atrasada)" };
      soltarA([{ chave: "global", dados: gB, versao: 9 }, { chave: "deal:" + dA.id, dados: dA, versao: 9 }]);
      await new Promise((r) => setTimeout(r, 0));
      expect(aplicar).not.toHaveBeenCalled();
      expect(S.deals[0].nome).toBe("Da B");
      s.desligar();
    } finally {
      (globalThis as { __olyviaSincNosTestes?: boolean }).__olyviaSincNosTestes = false;
    }
  });
  it("uma organização sem nada partilhado: comecar diz se é de demonstração", async () => {
    (globalThis as { __olyviaSincNosTestes?: boolean }).__olyviaSincNosTestes = true;
    try {
      rpc.responder = (fn) => (fn === "app_estado_ler" ? { data: { demonstracao: false, partes: [] }, error: null } : { data: 1, error: null });
      const s = new Sincronizador();
      let S: Estado = { ...seed(), org: ORG };
      const comecar = vi.fn(() => { S = { ...S, deals: [] }; });
      await s.ligar(armazemEquipa(ORG), { ler: () => S, aplicar: (x) => { S = x; } }, [], () => {}, comecar);
      expect(comecar).toHaveBeenCalledWith(false);
      expect(s.demonstracao).toBe(false);
      s.desligar();
    } finally {
      (globalThis as { __olyviaSincNosTestes?: boolean }).__olyviaSincNosTestes = false;
    }
  });
});

describe("armazemEquipa: pelas funções da 0015", () => {
  it("lê por app_estado_ler (a demonstração vem com as partes) e grava por app_estado_gravar com a versão conhecida", async () => {
    rpc.responder = (fn, a) => {
      if (fn === "app_estado_ler") return { data: { demonstracao: true, partes: [{ chave: "global", dados: { x: 1 }, versao: 3 }] }, error: null };
      if (fn === "app_estado_gravar") return { data: a?.p_nova, error: null };
      if (fn === "app_estado_versoes") return { data: [{ chave: "global", versao: 3 }], error: null };
      return { data: null, error: { message: "?" } };
    };
    const a = armazemEquipa(ORG);
    expect(await a.tudo()).toEqual([{ chave: "global", dados: { x: 1 }, versao: 3 }]);
    expect(a.demonstracao).toBe(true);
    expect(await a.versoes()).toEqual([{ chave: "global", versao: 3 }]);
    expect(await a.atualizar("global", { x: 2 }, 10, 3)).toBe(10);
    expect(rpc.chamadas.find((c) => c.fn === "app_estado_gravar")?.args).toMatchObject({ p_org: ORG, p_chave: "global", p_versao: 3, p_nova: 10 });
    expect(bd.tabelaUsada).toBe(0);
  });
  it("o conflito (null) e a recusa (42501): null e ErroSemPermissao", async () => {
    let resp: { data: unknown; error: unknown } = { data: null, error: null };
    rpc.responder = (fn) => (fn === "app_estado_ler" ? { data: { partes: [] }, error: null } : resp);
    const a = armazemEquipa(ORG);
    await a.tudo();
    expect(await a.atualizar("deal:1", {}, 5, 4)).toBeNull();
    expect(await a.inserir("deal:1", {}, 5)).toBe(false);
    resp = { data: null, error: { code: "42501", message: "Sem permissão para gravar deal:1" } };
    await expect(a.atualizar("deal:1", {}, 5, 4)).rejects.toBeInstanceOf(ErroSemPermissao);
    resp = { data: null, error: { message: "Failed to fetch" } };
    await expect(a.atualizar("deal:1", {}, 5, 4)).rejects.not.toBeInstanceOf(ErroSemPermissao);
  });
  it("sem as funções (a 0015 por aplicar), volta à tabela", async () => {
    bd.linhas.push({ organizacao_id: ORG, chave: "global", dados: { y: 1 }, versao: 2 });
    const a = armazemEquipa(ORG);
    expect(await a.tudo()).toMatchObject([{ chave: "global", dados: { y: 1 }, versao: 2 }]);
    expect(bd.tabelaUsada).toBeGreaterThan(0);
    expect(a.demonstracao).toBe(false);
  });
});

describe("a recusa da base não é falta de rede", () => {
  it("sem permissão para gravar: fica a versão guardada, avisa-se e nada vai para a fila", async () => {
    const B = aparelho();
    const chave = "deal:" + B.ler().deals[0].id;
    B.s.armazem.atualizar = async () => { throw new ErroSemPermissao("Sem permissão para gravar " + chave); };
    B.ler().deals[0].nome = "Sem permissão";
    await B.s.enviar(false);
    expect(B.ler().deals[0].nome).not.toBe("Sem permissão");
    expect(B.aviso).toHaveBeenCalledWith(expect.stringMatching(/Sem permissão/));
    expect(B.s.porEnviar).toBe(0);
    expect(B.s.estado).not.toBe("sem ligação");
  });
});

describe("a fila do que se mudou sem rede", () => {
  /** B muda um negócio sem rede: o envio falha e a mudança fica na fila. */
  async function semRede() {
    const B = aparelho();
    const id = B.ler().deals[0].id, chave = "deal:" + id;
    const atualizar = B.s.armazem.atualizar;
    B.s.armazem.atualizar = async () => { throw new Error("Failed to fetch"); };
    B.ler().deals[0].nome = "Mudado por B (sem rede)";
    await B.s.enviar(false);
    expect(B.s.estado).toBe("sem ligação");
    expect(B.s.pendentes.get(chave)).toBe(1);
    B.s.armazem.atualizar = atualizar; // volta a rede
    return { ...B, chave };
  }

  it("ninguém mexeu entretanto: ao voltar a rede envia-se a de B, sem conflito", async () => {
    const B = await semRede();
    await B.s.puxar();
    await B.s.enviar(false);
    expect((linha(B.chave).dados as { nome: string }).nome).toBe("Mudado por B (sem rede)");
    expect(B.s.porEnviar).toBe(0);
    expect(B.s.conflitos).toHaveLength(0);
  });

  it("outra pessoa mudou a mesma parte: não ganha ninguém em silêncio, abre-se o conflito; 'Manter as minhas' grava a de B", async () => {
    const B = await semRede();
    gravaOutro(B.chave, "Gravado por A", 7);
    await B.s.puxar();
    // a de B fica (não se escreve por cima) e o conflito está aberto
    expect(B.ler().deals[0].nome).toBe("Mudado por B (sem rede)");
    expect(B.s.conflitos.map((c: { chave: string }) => c.chave)).toEqual([B.chave]);
    expect(B.s.conflitos[0].nome).toMatch(/Gravado por A/);
    // enquanto não se escolhe, o envio não lhe toca
    await B.s.enviar(false);
    expect(linha(B.chave).versao).toBe(7);
    B.s.resolverConflitos("minhas");
    await B.s.enviar(false);
    expect((linha(B.chave).dados as { nome: string }).nome).toBe("Mudado por B (sem rede)");
    expect(linha(B.chave).versao).not.toBe(7);
    expect(B.s.conflitos).toHaveLength(0);
    expect(B.s.porEnviar).toBe(0);
  });

  it("'Ficar com as da outra pessoa': fica a remota e a de B deita-se fora", async () => {
    const B = await semRede();
    gravaOutro(B.chave, "Gravado por A", 7);
    await B.s.puxar();
    B.s.resolverConflitos("remotas");
    expect(B.ler().deals[0].nome).toBe("Gravado por A");
    await B.s.enviar(false);
    expect(linha(B.chave).versao).toBe(7);
    expect(B.s.porEnviar).toBe(0);
  });

  it("o conflito também se abre se o envio bater na versão (a remota mudou entre a leitura e o envio)", async () => {
    const B = await semRede();
    gravaOutro(B.chave, "Gravado por A", 8);
    await B.s.enviar(false); // ainda sem ler: o envio dá conflito de versão
    expect(B.s.conflitos.map((c: { chave: string }) => c.chave)).toEqual([B.chave]);
    expect(B.ler().deals[0].nome).toBe("Mudado por B (sem rede)");
  });

  it("a global da fila também não se perde (antes ganhava sempre a remota)", async () => {
    const B = aparelho();
    const atualizar = B.s.armazem.atualizar;
    B.s.armazem.atualizar = async () => { throw new Error("Failed to fetch"); };
    B.ler().rc = 4242;
    await B.s.enviar(false);
    B.s.armazem.atualizar = atualizar;
    const g = JSON.parse(JSON.stringify(linha("global").dados)); g.rc = 1;
    Object.assign(linha("global"), { dados: g, versao: 5 });
    await B.s.puxar();
    expect(B.ler().rc).toBe(4242);
    expect(B.s.conflitos.map((c: { chave: string }) => c.chave)).toEqual(["global"]);
  });

  it("sem a 1.ª leitura: só vai para a fila o que se sabe que mudou (com as versões de uma sessão anterior); sem elas, nada", async () => {
    const B = aparelho();
    B.s.carregado = false;
    vi.spyOn(B.s, "carregar").mockImplementation(async () => {});
    B.ler().deals[0].nome = "Sem rede desde o início";
    B.s.comBase = false;
    await B.s.enviar(false);
    expect(B.s.porEnviar).toBe(0);
    B.s.comBase = true;
    await B.s.enviar(false);
    expect([...B.s.pendentes.keys()]).toEqual(["deal:" + B.ler().deals[0].id]);
  });

  it("a fila fica guardada neste browser (por organização e pessoa) e volta numa ligação nova", () => {
    const B = aparelho();
    B.s.chaveLocal = "org-a:pessoa-1";
    B.s.versoes.set("deal:1", 4);
    B.s.paraAFila([{ chave: "deal:1", dados: {} }]);
    const outro = new Sincronizador() as Priv;
    outro.chaveLocal = "org-a:pessoa-1";
    expect(outro.lerGuardado()).toMatchObject({ pendentes: { "deal:1": 4 } });
    outro.chaveLocal = "org-b:pessoa-1";
    expect(outro.lerGuardado()).toBeNull();
  });
});

describe("juntarEstado e o nome das partes", () => {
  it("sem a global, um negócio novo que chega junta-se no fim (não se perde)", () => {
    const S = seed();
    const novo = { ...structuredClone(S.deals[0]), id: 9999, nome: "Novo" } as Negocio;
    const r = juntarEstado(S, null, new Map([[9999, novo]]));
    expect(r.deals.map((d) => d.id)).toEqual([...S.deals.map((d) => d.id), 9999]);
  });
  it("com a global remota, os negócios da fila (criados sem rede) ficam", () => {
    const S = seed();
    const ordem = S.deals.slice(1).map((d) => d.id);
    const r = juntarEstado(S, { ordem }, new Map(), [S.deals[0].id]);
    expect(r.deals.map((d) => d.id)).toContain(S.deals[0].id);
    expect(juntarEstado(S, { ordem }, new Map()).deals.map((d) => d.id)).not.toContain(S.deals[0].id);
  });
  it("a marca da organização nunca vem de fora", () => {
    const S = { ...seed(), org: ORG };
    expect(juntarEstado(S, { org: "org-b" }, new Map()).org).toBe(ORG);
    expect(partesDoEstado(S)[0].dados).not.toHaveProperty("org");
  });
  it("o nome de cada parte no diálogo", () => {
    expect(nomeDaParte({ chave: "deal:7", dados: { nome: "Ana" }, versao: 1 })).toBe("O negócio Ana");
    expect(nomeDaParte({ chave: "global", dados: {}, versao: 1 })).toMatch(/dados gerais/);
    expect(nomeDaParte({ chave: "inv", dados: {}, versao: 1 })).toBe("O Inventário");
  });
});
