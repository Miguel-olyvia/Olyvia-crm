// 17/11 (Rúben: «no Estúdio falta ele trabalhar também»): a Olyvia por voz dentro do Estúdio.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { alturasNoEstudio, divisaoNoEstudio, passoNoEstudio, vozNoEstudio } from "./estudioPorVoz";
import { PROJETO_EXEMPLO } from "./exemploEstudio";
import { estadoDaPeca } from "./necessidadesEstudio";

describe("os passos do Estúdio", () => {
  it("pelo nome, próximo e anterior, voltar e mostrar", () => {
    expect(passoNoEstudio("vai para o estilo", 0)).toEqual({ passo: 1 });
    expect(passoNoEstudio("mostra o 3D", 0)).toEqual({ passo: 3 });
    expect(passoNoEstudio("abre a proposta", 0)).toEqual({ passo: 4 });
    expect(passoNoEstudio("o plano da obra", 0)).toEqual({ passo: 5 });
    expect(passoNoEstudio("vai para o fim", 0)).toEqual({ passo: 5 });
    expect(passoNoEstudio("próximo passo", 2)).toEqual({ passo: 3 });
    expect(passoNoEstudio("passo anterior", 2)).toEqual({ passo: 1 });
    expect(passoNoEstudio("volta ao negócio", 2)).toEqual({ voltar: true });
    expect(passoNoEstudio("mostra isto ao cliente", 2)).toEqual({ mostrar: true });
    // «depois» numa frase não é o passo Depois
    expect(passoNoEstudio("depois tiramos o bidé", 0)).toBeNull();
  });
});

describe("as alturas e a divisão", () => {
  it("pé-direito em metros ou centímetros; teto falso com altura, sim ou não", () => {
    expect(alturasNoEstudio("o pé-direito é 2,60")).toEqual({ peDireito: 260 });
    expect(alturasNoEstudio("pé direito de 255")).toEqual({ peDireito: 255 });
    expect(alturasNoEstudio("pé direito 2 metros e 70")).toEqual({ peDireito: 270 });
    expect(alturasNoEstudio("tem teto falso a 2,40")).toEqual({ tetoFalso: 240 });
    expect(alturasNoEstudio("sem teto falso")).toEqual({ tetoFalso: null });
    expect(alturasNoEstudio("não tem teto falso")).toEqual({ tetoFalso: null });
    expect(alturasNoEstudio("o pé direito é 2,50 e tem teto falso a 2,30")).toEqual({ peDireito: 250, tetoFalso: 230 });
    expect(alturasNoEstudio("tira o bidé")).toBeNull();
  });
  it("a divisão", () => {
    expect(divisaoNoEstudio("é uma cozinha")).toBe("Cozinha");
    expect(divisaoNoEstudio("muda para casa de banho")).toBe("Casa de banho");
    expect(divisaoNoEstudio("a cozinha do cliente é grande")).toBeNull();
  });
});

describe("no projeto", () => {
  const p = PROJETO_EXEMPLO;
  // «sai» = deixa de estar na planta do depois (necessidadesEstudio.ts, sairam)
  const noDepois = (x: typeof p, tipo: string) => x.depois.pecas.some((pc) => pc.tipo === tipo);
  it("«tira o bidé» e «troca a banheira por uma base de duche»", () => {
    expect(noDepois(p, "bide")).toBe(true);
    const r1 = vozNoEstudio("tira o bidé", p, 2)!;
    expect(noDepois(r1.p!, "bide")).toBe(false);
    expect(r1.partes).toEqual(["Bidé: tirar"]);
    const r2 = vozNoEstudio("troca a banheira por uma base de duche", p, 2)!;
    expect(noDepois(r2.p!, "banheira")).toBe(false);
    expect([...(r2.p!.porColocar ?? []).map((x) => x.tipo), ...r2.p!.depois.pecas.map((x) => x.tipo)]).toContain("base");
  });
  it("«troca a sanita» escolhe uma sanita nova no estilo", () => {
    const r = vozNoEstudio("troca a sanita", p, 2)!;
    const sanita = r.p!.antes.pecas.find((pc) => pc.tipo === "sanita")!;
    expect(estadoDaPeca(r.p!, sanita)).toBe("troca");
  });
  it("as alturas e as cores aplicam-se e diz o que fez", () => {
    const r = vozNoEstudio("o pé direito é 2,60 e sem teto falso", p, 0)!;
    expect(r.p!.alturas).toMatchObject({ peDireito: 260, tetoFalso: null });
    expect(r.partes).toEqual(["Pé-direito: 260 cm", "Sem teto falso"]);
    const c = vozNoEstudio("quero tudo em preto", p, 1)!;
    expect(c.p!.estilo.cores[0]).toBe("preto");
  });
  it("o que não é do Estúdio não faz nada", () => {
    expect(vozNoEstudio("vai aos negócios", p, 0)).toBeNull();
    expect(vozNoEstudio("bom dia", p, 0)).toBeNull();
  });
});
