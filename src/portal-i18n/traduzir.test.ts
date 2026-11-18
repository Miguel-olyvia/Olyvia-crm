// traduzir() e traduzirN(): fallback idioma -> pt -> a própria chave, parâmetros {x} e {{x}}, plurais e aviso só em
// desenvolvimento. Os dicionários são simulados para o teste não depender dos textos reais (que outros vão acrescentar).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./dicionarios", () => ({
  dicionarios: {
    pt: {
      "pc.ola": "Olá",
      "pc.soPt": "Só em português",
      "pc.saudacao": "Olá, {nome}! {nome}, bem-vindo.",
      "pc.saudacao2": "Olá, {{nome}}!",
      "pc.total": "Total: {valor} em {n} linhas",
      "pc.cifrao": "Preço: {preco}",
      "pc.artigos.um": "{n} artigo",
      "pc.artigos.varios": "{n} artigos",
      "pc.artigosDe.um": "{n} artigo de {quem}",
      "pc.artigosDe.varios": "{n} artigos de {quem}",
    },
    en: {
      "pc.ola": "Hello",
      "pc.saudacao": "Hello, {nome}! {nome}, welcome.",
      "pc.saudacao2": "Hello, {{nome}}!",
      "pc.total": "Total: {valor} across {n} lines",
      "pc.cifrao": "Price: {preco}",
      "pc.artigos.um": "{n} item",
      "pc.artigos.varios": "{n} items",
      "pc.artigosDe.um": "{n} item from {quem}",
      "pc.artigosDe.varios": "{n} items from {quem}",
    },
  },
}));

import { reporAvisosDeChavesEmFalta, traduzir, traduzirN } from "./traduzir";

let aviso: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  reporAvisosDeChavesEmFalta();
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("traduzir: escolha do texto", () => {
  it("devolve o texto do idioma pedido", () => {
    expect(traduzir("pt", "pc.ola")).toBe("Olá");
    expect(traduzir("en", "pc.ola")).toBe("Hello");
    expect(aviso).not.toHaveBeenCalled();
  });

  it("cai para pt quando falta no idioma pedido", () => {
    expect(traduzir("en", "pc.soPt")).toBe("Só em português");
  });

  it("devolve a própria chave quando não existe em lado nenhum", () => {
    expect(traduzir("en", "pc.nao.existe")).toBe("pc.nao.existe");
    expect(traduzir("pt", "pc.nao.existe")).toBe("pc.nao.existe");
  });

  it("uma chave vazia devolve texto vazio e não rebenta", () => {
    expect(traduzir("pt", "")).toBe("");
  });

  it("não confunde chaves herdadas do objeto (toString, __proto__, constructor)", () => {
    expect(traduzir("pt", "toString")).toBe("toString");
    expect(traduzir("en", "__proto__")).toBe("__proto__");
    expect(traduzir("en", "constructor")).toBe("constructor");
  });
});

describe("traduzir: parâmetros", () => {
  it("substitui {x} em todas as ocorrências", () => {
    expect(traduzir("pt", "pc.saudacao", { nome: "Rita" })).toBe("Olá, Rita! Rita, bem-vindo.");
    expect(traduzir("en", "pc.saudacao", { nome: "Rita" })).toBe("Hello, Rita! Rita, welcome.");
  });

  it("substitui {{x}} como o t() do CRM", () => {
    expect(traduzir("pt", "pc.saudacao2", { nome: "Rita" })).toBe("Olá, Rita!");
  });

  it("aceita números, incluindo zero", () => {
    expect(traduzir("pt", "pc.total", { valor: 0, n: 3 })).toBe("Total: 0 em 3 linhas");
  });

  it("deixa o marcador à vista quando falta o parâmetro", () => {
    expect(traduzir("pt", "pc.saudacao", {})).toBe("Olá, {nome}! {nome}, bem-vindo.");
    expect(traduzir("pt", "pc.saudacao")).toBe("Olá, {nome}! {nome}, bem-vindo.");
  });

  it("trata o valor como texto literal (sem interpretar $& nem $1)", () => {
    expect(traduzir("pt", "pc.cifrao", { preco: "US$& $1 {nome}" })).toBe("Preço: US$& $1 {nome}");
  });

  it("aplica os parâmetros também quando o texto veio do fallback pt", () => {
    expect(traduzir("en", "pc.soPt", { x: 1 })).toBe("Só em português");
  });

  it("a chave devolvida por falta não tem os parâmetros aplicados", () => {
    expect(traduzir("en", "pc.falta.{nome}", { nome: "Rita" })).toBe("pc.falta.{nome}");
  });
});

describe("traduzirN: plurais", () => {
  it("escolhe a chave do singular só para n = 1", () => {
    expect(traduzirN("pt", "pc.artigos.um", "pc.artigos.varios", 1)).toBe("1 artigo");
    expect(traduzirN("pt", "pc.artigos.um", "pc.artigos.varios", 0)).toBe("0 artigos");
    expect(traduzirN("pt", "pc.artigos.um", "pc.artigos.varios", 2)).toBe("2 artigos");
    expect(traduzirN("en", "pc.artigos.um", "pc.artigos.varios", 1)).toBe("1 item");
    expect(traduzirN("en", "pc.artigos.um", "pc.artigos.varios", 5)).toBe("5 items");
  });

  it("formata {n} pelo idioma", () => {
    expect(traduzirN("en", "pc.artigos.um", "pc.artigos.varios", 1500)).toBe("1,500 items");
    expect(traduzirN("pt", "pc.artigos.um", "pc.artigos.varios", 15000)).toBe(`${(15000).toLocaleString("pt-PT")} artigos`);
  });

  it("passa os restantes parâmetros", () => {
    expect(traduzirN("en", "pc.artigosDe.um", "pc.artigosDe.varios", 3, { quem: "Rita" })).toBe("3 items from Rita");
  });

  it("os parâmetros do chamador podem trazer um n próprio", () => {
    expect(traduzirN("pt", "pc.artigos.um", "pc.artigos.varios", 2, { n: "dois" })).toBe("dois artigos");
  });

  it("um n que não é número finito usa o plural e não rebenta", () => {
    expect(traduzirN("pt", "pc.artigos.um", "pc.artigos.varios", Number.NaN)).toBe("NaN artigos");
  });
});

describe("traduzir: aviso de chave em falta só em desenvolvimento", () => {
  it("em desenvolvimento avisa quando a chave não existe em lado nenhum", () => {
    vi.stubEnv("DEV", true);
    traduzir("en", "pc.nao.existe");
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain("pc.nao.existe");
  });

  it("em desenvolvimento avisa quando falta só no idioma pedido (usou o fallback pt)", () => {
    vi.stubEnv("DEV", true);
    traduzir("en", "pc.soPt");
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain("pc.soPt");
  });

  it("avisa uma só vez por chave e idioma", () => {
    vi.stubEnv("DEV", true);
    traduzir("en", "pc.nao.existe");
    traduzir("en", "pc.nao.existe");
    traduzir("en", "pc.nao.existe");
    expect(aviso).toHaveBeenCalledTimes(1);
    traduzir("pt", "pc.nao.existe");
    expect(aviso).toHaveBeenCalledTimes(2);
  });

  it("em produção não escreve nada", () => {
    vi.stubEnv("DEV", false);
    expect(traduzir("en", "pc.nao.existe")).toBe("pc.nao.existe");
    expect(traduzir("en", "pc.soPt")).toBe("Só em português");
    expect(aviso).not.toHaveBeenCalled();
  });

  it("uma chave que existe não avisa", () => {
    vi.stubEnv("DEV", true);
    traduzir("pt", "pc.ola");
    traduzir("en", "pc.ola");
    expect(aviso).not.toHaveBeenCalled();
  });
});
