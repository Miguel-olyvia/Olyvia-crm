// 25/11 (Rúben, 1048: casa de banho e cozinha no mesmo contrato): um negócio com várias divisões, cada uma com a sua planta e o seu 3D.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CHAVE_PRINCIPAL, reorganizarDivisoes } from "./campos";
import { acoes, permDoCampo } from "./motor";
import type { Ctx } from "./pecas";
import { gravarPlanta, retangulo } from "./planta";
import { comDivisao, divisoesDoNegocio, divisoesPorJuntar, fDaDivisao, filtroDaDivisao } from "./divisoesNegocio";
import { EstudioObra } from "./estudioObra/EstudioObra";
import { obraDeExemplo } from "./estudioObra/exemploObra";
import { feitoPorGrupo, obraEm3D, projetoDaDivisao } from "./estudioObra/obra3d";

afterEach(cleanup);

const PLANTA_COZINHA = gravarPlanta({ o: { x: 0, y: 0 }, paredes: retangulo(300, 250), pecas: [{ id: "bancada1", tipo: "bancada", x: 10, y: 10, w: 240, h: 60 }, { id: "porta", tipo: "porta", x: 110, y: 246, w: 80, h: 8 }] });

describe("as divisões do negócio", () => {
  it("sem nenhuma escolhida, uma só (a de sempre, nas chaves sem prefixo), com o nome do projeto do Estúdio ou da linha", () => {
    expect(divisoesDoNegocio({ estudio: JSON.stringify({ divisao: "Casa de banho" }) })).toEqual([{ nome: "Casa de banho", principal: true, prefixo: "" }]);
    expect(divisoesDoNegocio({}, "coz")).toEqual([{ nome: "Cozinha", principal: true, prefixo: "" }]);
  });
  it("com a casa de banho e a cozinha: a principal sem prefixo, a cozinha com div_coz_", () => {
    const f = { diag_tipo_area: "Casa de banho, Cozinha", [CHAVE_PRINCIPAL]: "Casa de banho" };
    expect(divisoesDoNegocio(f).map((x) => [x.nome, x.prefixo])).toEqual([["Casa de banho", ""], ["Cozinha", "div_coz_"]]);
    expect(divisoesPorJuntar(f)).toEqual(["Sala", "Quarto"]);
  });
  it("os valores vistos da cozinha: a planta, o projeto e as respostas dela nas chaves de base; a principal fica o mesmo objeto", () => {
    const f: Record<string, string> = { diag_tipo_area: "Casa de banho, Cozinha", [CHAVE_PRINCIPAL]: "Casa de banho", planta: "WC", estudio: "{}", diag_pe_direito_m: "2,6", div_coz_planta: "COZ", div_coz_diag_pe_direito_m: "2,8" };
    const [wc, coz] = divisoesDoNegocio(f);
    expect(fDaDivisao(f, wc)).toBe(f);
    const fc = fDaDivisao(f, coz);
    expect(fc).toMatchObject({ planta: "COZ", diag_pe_direito_m: "2,8", diag_tipo_area: "Cozinha", [CHAVE_PRINCIPAL]: "Cozinha" });
    expect(fc.estudio).toBeUndefined(); // o projeto da casa de banho não é o da cozinha
    expect(f.planta).toBe("WC"); // não mexe no negócio
  });
  it("juntar a cozinha: a de sempre fica primeiro (é a principal), a nova no fim", () => {
    expect(comDivisao({ estudio: JSON.stringify({ divisao: "Casa de banho" }) }, "Cozinha")).toBe("Casa de banho, Cozinha");
    expect(comDivisao({ diag_tipo_area: "Cozinha" }, "Casa de banho")).toBe("Cozinha, Casa de banho");
    expect(comDivisao({ diag_tipo_area: "Casa de banho, Cozinha" }, "Cozinha")).toBe("Casa de banho, Cozinha");
  });
  it("a principal sai: a planta e o projeto dela guardam-se com o prefixo, e os da nova principal passam para as chaves de sempre", () => {
    const f: Record<string, string> = { diag_tipo_area: "Cozinha", [CHAVE_PRINCIPAL]: "Casa de banho", planta: "WC", estudio: "E-WC", div_coz_planta: "COZ" };
    reorganizarDivisoes(f);
    expect(f).toMatchObject({ [CHAVE_PRINCIPAL]: "Cozinha", planta: "COZ", div_wc_planta: "WC", div_wc_estudio: "E-WC" });
    expect(f.estudio).toBeUndefined();
    expect(f.div_coz_planta).toBeUndefined();
  });
  it("a planta corrigida de outra divisão pede o mesmo que a da principal (planear a obra)", () => {
    expect(permDoCampo("div_coz_retif_planta")).toBe("obra.planear");
    expect(permDoCampo("div_coz_planta")).toBeNull();
  });
});

describe("as tarefas do plano por divisão", () => {
  const tasks = [
    { nome: "MO Modelo Remodelação Completa - Casa de Banho Comum · Revestimento de parede" },
    { nome: "MO Modelo Remodelação Completa - Cozinha · Revestimento de parede" },
    { nome: "Limpeza final" },
  ];
  it("cada divisão conta as suas e as comuns", () => {
    expect(tasks.filter(filtroDaDivisao(tasks, "Casa de banho")).map((t) => t.nome)).toEqual([tasks[0].nome, tasks[2].nome]);
    expect(tasks.filter(filtroDaDivisao(tasks, "Cozinha")).map((t) => t.nome)).toEqual([tasks[1].nome, tasks[2].nome]);
  });
  it("um plano sem divisões nos nomes (os de antes) não se filtra", () => {
    const antigos = [{ nome: "Revestimento de parede" }, { nome: "Pavimento" }];
    expect(antigos.filter(filtroDaDivisao(antigos, "Casa de banho"))).toHaveLength(2);
    expect(tasks.filter(filtroDaDivisao(tasks, "Sala"))).toHaveLength(3);
  });
  it("o revestimento da cozinha feito não pinta as paredes da casa de banho", () => {
    const t = (nome: string, feita: boolean) => ({ nome, dia: 0, dur: 1, h: 8, ...(feita ? { exec: { estado: "validada" } } : {}) });
    const p = { estado: "em curso", dia: 3, tasks: [t("MO Modelo - Casa de Banho Comum · Revestimento de parede", false), t("MO Modelo - Cozinha · Revestimento de parede", true)] } as unknown as Parameters<typeof feitoPorGrupo>[0];
    expect(feitoPorGrupo(p, "Casa de banho").paredes).toBe(false);
    expect(feitoPorGrupo(p, "Cozinha").paredes).toBe(true);
    expect(feitoPorGrupo(p).paredes).toBe(false); // sem divisão, todas, como antes
  });
});

describe("o 3D de cada divisão", () => {
  it("a cozinha só com a planta: o 3D é a divisão como está; sem planta, nada; a casa de banho fica com o projeto do Estúdio", () => {
    const { d } = obraDeExemplo();
    d.f.diag_tipo_area = "Casa de banho, Cozinha"; d.f[CHAVE_PRINCIPAL] = "Casa de banho";
    expect(projetoDaDivisao(d, "Cozinha")).toBeNull();
    d.f.div_coz_planta = PLANTA_COZINHA;
    const R = projetoDaDivisao(d, "Cozinha")!;
    expect(R.soPlanta).toBe(true);
    expect(R.projeto.divisao).toBe("Cozinha");
    expect(R.projeto.antes.pecas.map((x) => x.tipo)).toContain("bancada");
    expect(projetoDaDivisao(d, "Casa de banho")!.soPlanta).toBe(false);
    // sem divisão dita, como antes: o projeto do Estúdio do negócio
    expect(obraEm3D(d)!.nome).toBe(obraEm3D(d, "Casa de banho")!.nome);
    expect(obraEm3D(d, "Cozinha")).not.toBeNull();
  });

  it("no Estúdio da obra: juntar a cozinha, desenhar-lhe a planta e escolher a divisão por cima do 3D", () => {
    const { S, d } = obraDeExemplo();
    // o projeto de exemplo é uma casa de banho (o negócio de exemplo diz cozinha)
    d.linha = "wc"; d.f.diag_tipo_area = "Casa de banho"; delete d.f[CHAVE_PRINCIPAL];
    const A = acoes(S, () => {}, (fn) => fn());
    const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /3D/ }));
    // uma divisão só: sem seletor, com «Juntar divisão»
    expect(screen.queryByRole("group", { name: "A divisão" })).toBeNull();
    const antesDoWc = d.f.estudio;
    fireEvent.click(screen.getByRole("button", { name: "Juntar divisão" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Que divisão juntar" })).getByRole("button", { name: "Cozinha" }));
    expect(d.f.diag_tipo_area?.split(", ")).toEqual(expect.arrayContaining(["Cozinha"]));
    expect(d.f[CHAVE_PRINCIPAL]).not.toBe("Cozinha");
    expect(d.f.estudio).toBe(antesDoWc); // o projeto da casa de banho fica onde estava
    // a cozinha escolhida, sem planta: a planta para desenhar
    const grupo = screen.getByRole("group", { name: "A divisão" });
    expect(within(grupo).getByRole("button", { name: "Cozinha", pressed: true })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Desenhar a planta da cozinha" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Usar nas medidas/ })).toBeNull(); // as medidas do negócio são da principal
    // a planta gravada: a cozinha em 3D, como está
    ctx.run(() => A.campo(d.id, "div_coz_planta", PLANTA_COZINHA));
    const sec = screen.getByRole("region", { name: "O projeto em 3D" });
    expect(within(sec).getByRole("heading", { name: "A cozinha como está" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "A planta" })).toBeTruthy();
    // de volta à casa de banho: o projeto do Estúdio, como antes
    fireEvent.click(within(screen.getByRole("group", { name: "A divisão" })).getByRole("button", { name: /Casa de banho/ }));
    expect(screen.getByRole("region", { name: "As plantas antes e depois" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Como vai ficar" })).toBeTruthy();
  });
});
