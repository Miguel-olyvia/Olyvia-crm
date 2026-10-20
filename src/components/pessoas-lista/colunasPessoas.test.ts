// O catálogo e a preferência de colunas da Lista real: por organização, à prova de lixo, e sem esconder o nome.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CATALOGO, alternarColuna, chaveColunas, colunasVisiveis, escolhaPorOmissao, guardarColunas, larguras, lerColunas, moverColuna,
  moverParaIndice, reporColunas,
} from "./colunasPessoas";

const ids = (e: readonly { id: string }[]): string[] => e.map((c) => c.id);

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("catálogo e omissão", () => {
  it("«person» é a primeira e está sempre visível por omissão", () => {
    const e = escolhaPorOmissao();
    expect(e[0]).toEqual({ id: "person", visivel: true });
  });
  it("entram todas as colunas com dado: formulário, criado em, origem e campanha já têm", () => {
    const e = ids(escolhaPorOmissao());
    for (const com of ["stage", "form", "lastContact", "next", "nextVisit", "value", "deals", "assigned", "phone", "email", "whatsapp", "created", "origin", "campaign"]) {
      expect(e, com).toContain(com);
    }
  });
  it("origem e campanha ficam escondidas por omissão; formulário e criado em visíveis", () => {
    const e = escolhaPorOmissao();
    expect(e.find((c) => c.id === "origin")?.visivel).toBe(false);
    expect(e.find((c) => c.id === "campaign")?.visivel).toBe(false);
    expect(e.find((c) => c.id === "form")?.visivel).toBe(true);
    expect(e.find((c) => c.id === "created")?.visivel).toBe(true);
  });
  it("a localidade saiu: não está no catálogo", () => {
    expect(CATALOGO.find((c) => c.id === "place")).toBeUndefined();
    expect(ids(escolhaPorOmissao())).not.toContain("place");
  });
  it("sem ids repetidos e com larguras positivas", () => {
    expect(new Set(CATALOGO.map((c) => c.id)).size).toBe(CATALOGO.length);
    for (const c of CATALOGO) expect(c.largura).toBeGreaterThan(0);
  });
});

describe("preferência por organização", () => {
  it("a chave leva o id da organização", () => {
    expect(chaveColunas("org-1")).toBe("pessoas.colunas.org-1");
  });
  it("sem nada guardado, a omissão", () => {
    expect(lerColunas("org-1")).toEqual(escolhaPorOmissao());
  });
  it("duas organizações não partilham a escolha", () => {
    guardarColunas("org-1", alternarColuna(escolhaPorOmissao(), "email"));
    expect(lerColunas("org-1").find((c) => c.id === "email")?.visivel).toBe(false);
    expect(lerColunas("org-2")).toEqual(escolhaPorOmissao());
  });
  it("a escolha guardada volta igual (ordem e visibilidade)", () => {
    const escolha = moverColuna(alternarColuna(escolhaPorOmissao(), "phone"), "value", -2);
    guardarColunas("org-1", escolha);
    expect(lerColunas("org-1")).toEqual(escolha);
  });
  it("sem organização (null) não lê nem guarda: omissão", () => {
    guardarColunas(null, alternarColuna(escolhaPorOmissao(), "email"));
    expect(window.localStorage.length).toBe(0);
    expect(lerColunas(null)).toEqual(escolhaPorOmissao());
  });
  it.each([["não é json"], ["null"], ["[]"], ["3"], ['{"v":2,"colunas":[]}'], ['{"v":1,"colunas":"x"}'], ['{"v":1}']])(
    "lixo guardado (%s) volta à omissão",
    (bruto) => {
      window.localStorage.setItem(chaveColunas("org-1"), bruto);
      expect(lerColunas("org-1")).toEqual(escolhaPorOmissao());
    },
  );
  it("ids desconhecidos, repetidos e sem dado descartam-se; valores que não são booleanos usam a omissão", () => {
    window.localStorage.setItem(chaveColunas("org-1"), JSON.stringify({
      v: 1, colunas: [
        { id: "value", visivel: true }, { id: "inventada", visivel: true }, { id: "value", visivel: false },
        { id: "place", visivel: true }, { id: "email", visivel: "sim" }, 42, null,
      ],
    }));
    const lidas = lerColunas("org-1");
    expect(ids(lidas)).not.toContain("inventada");
    expect(ids(lidas)).not.toContain("place");
    expect(ids(lidas).filter((i) => i === "value")).toHaveLength(1);
    expect(lidas.find((c) => c.id === "value")?.visivel).toBe(true);
    expect(lidas.find((c) => c.id === "email")?.visivel).toBe(CATALOGO.find((c) => c.id === "email")?.visivelPorOmissao);
  });
  it("colunas que faltam na escolha guardada entram escondidas e no fim", () => {
    window.localStorage.setItem(chaveColunas("org-1"), JSON.stringify({ v: 1, colunas: [{ id: "person", visivel: true }, { id: "stage", visivel: true }] }));
    const lidas = lerColunas("org-1");
    expect(ids(lidas).slice(0, 2)).toEqual(["person", "stage"]);
    expect(lidas.slice(2).every((c) => c.visivel === false)).toBe(true);
    expect(lidas).toHaveLength(escolhaPorOmissao().length);
  });
  it("«person» guardada como escondida, ou fora do primeiro lugar, volta a ser a primeira e visível", () => {
    window.localStorage.setItem(chaveColunas("org-1"), JSON.stringify({
      v: 1, colunas: [{ id: "stage", visivel: true }, { id: "person", visivel: false }],
    }));
    expect(lerColunas("org-1")[0]).toEqual({ id: "person", visivel: true });
  });
  it("sem «person» guardada, entra à frente e visível", () => {
    window.localStorage.setItem(chaveColunas("org-1"), JSON.stringify({ v: 1, colunas: [{ id: "stage", visivel: true }] }));
    expect(lerColunas("org-1")[0]).toEqual({ id: "person", visivel: true });
  });
  it("armazenamento indisponível: lê a omissão e guardar não rebenta", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("cheio"); });
    expect(lerColunas("org-1")).toEqual(escolhaPorOmissao());
    expect(() => guardarColunas("org-1", escolhaPorOmissao())).not.toThrow();
  });
  it("repor apaga só a preferência desta organização e devolve a omissão", () => {
    guardarColunas("org-1", alternarColuna(escolhaPorOmissao(), "email"));
    guardarColunas("org-2", alternarColuna(escolhaPorOmissao(), "phone"));
    expect(reporColunas("org-1")).toEqual(escolhaPorOmissao());
    expect(lerColunas("org-1")).toEqual(escolhaPorOmissao());
    expect(lerColunas("org-2").find((c) => c.id === "phone")?.visivel).toBe(false);
  });
});

describe("alternar, mover e arrastar (puros)", () => {
  it("alternar troca a visibilidade sem mexer no original", () => {
    const antes = escolhaPorOmissao();
    const depois = alternarColuna(antes, "email");
    expect(depois.find((c) => c.id === "email")?.visivel).toBe(false);
    expect(antes.find((c) => c.id === "email")?.visivel).toBe(true);
  });
  it("«person» não se esconde", () => {
    expect(alternarColuna(escolhaPorOmissao(), "person")).toEqual(escolhaPorOmissao());
  });
  it("uma coluna desconhecida não muda nada", () => {
    expect(alternarColuna(escolhaPorOmissao(), "place")).toEqual(escolhaPorOmissao());
  });
  it("mover sobe e desce uma posição, sem mexer no original", () => {
    const antes = escolhaPorOmissao();
    const i = ids(antes).indexOf("value");
    expect(ids(moverColuna(antes, "value", -1))[i - 1]).toBe("value");
    expect(ids(moverColuna(antes, "value", 1))[i + 1]).toBe("value");
    expect(ids(antes)[i]).toBe("value");
  });
  it("não sai dos limites: a primeira depois de «person» não sobe e a última não desce", () => {
    const antes = escolhaPorOmissao();
    expect(moverColuna(antes, ids(antes)[1], -1)).toEqual(antes);
    expect(moverColuna(antes, ids(antes)[antes.length - 1], 1)).toEqual(antes);
  });
  it("«person» não se move e nada passa à frente dela", () => {
    const antes = escolhaPorOmissao();
    expect(moverColuna(antes, "person", 1)).toEqual(antes);
    expect(ids(moverParaIndice(antes, "value", 0))[0]).toBe("person");
  });
  it("arrastar para um índice põe a coluna aí (arrastar e teclado dão o mesmo resultado)", () => {
    const antes = escolhaPorOmissao();
    const de = ids(antes).indexOf("deals");
    expect(moverParaIndice(antes, "deals", de - 2)).toEqual(moverColuna(moverColuna(antes, "deals", -1), "deals", -1));
  });
  it("arrastar para um índice fora dos limites fica no extremo", () => {
    const antes = escolhaPorOmissao();
    expect(ids(moverParaIndice(antes, "stage", 999)).at(-1)).toBe("stage");
  });
});

describe("colunas visíveis e larguras", () => {
  it("só as visíveis, pela ordem escolhida", () => {
    const e = alternarColuna(moverColuna(escolhaPorOmissao(), "value", -1), "email");
    const v = colunasVisiveis(e);
    expect(v[0]).toBe("person");
    expect(v).not.toContain("email");
    expect(v.indexOf("value")).toBeLessThan(v.indexOf("deals"));
  });
  it("as larguras somam 100 com quaisquer colunas escolhidas", () => {
    for (const cols of [colunasVisiveis(escolhaPorOmissao()), ["person"] as const, ["person", "value"] as const]) {
      const l = larguras(cols);
      expect(cols.reduce((s, c) => s + l[c], 0)).toBeCloseTo(100, 5);
    }
  });
  it("a coluna WhatsApp tem largura para o seu cabeçalho (não menos de 9 do peso total)", () => {
    expect(CATALOGO.find((c) => c.id === "whatsapp")?.largura).toBeGreaterThanOrEqual(9);
  });
});
