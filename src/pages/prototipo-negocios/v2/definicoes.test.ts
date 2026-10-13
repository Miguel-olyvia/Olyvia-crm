// As regras puras das Definições da V2: o índice da pesquisa, o arranque e os modelos de setor novos.
import { describe, expect, it } from "vitest";
import { AREA, efetivo, EXTERIOR } from "../campos";
import { SETORES } from "../setores";
import {
  SEM_RESPOSTAS, alternarServico, emFalta, escolherSetor, perfisPorPessoas, planoArranque, servicosDoSetor, type Respostas,
} from "./arranque";
import { INDICE, SECOES, procurar } from "./definicoesIndice";
import { RESUMO_SETOR, SETORES_NOVOS, SETORES_V2 } from "./setoresV2";

describe("Definições V2 · o índice da pesquisa", () => {
  it("pesquisa vazia não dá nada", () => {
    expect(procurar("")).toEqual([]);
    expect(procurar("   ")).toEqual([]);
  });
  it("encontra pelo nome, sem acentos nem maiúsculas", () => {
    expect(procurar("MARGEM")[0].ancora).toBe("orcamento-margens");
    expect(procurar("deslocacao")[0].ancora).toBe("orcamento-deslocacao");
  });
  it("encontra pelos sinónimos (as palavras do antigo)", () => {
    expect(procurar("smtp").map((e) => e.ancora)).toContain("email-smtp");
    expect(procurar("apagados")[0].ancora).toBe("dados-lixo");
    expect(procurar("etapas")[0].ancora).toBe("fases-nomes");
    expect(procurar("onboarding")[0].ancora).toBe("arranque");
    expect(procurar("permissões")[0].ancora).toBe("equipa-perfis");
  });
  it("todas as palavras têm de aparecer; o que começa pelo nome vem primeiro", () => {
    expect(procurar("modelos contrato").map((e) => e.ancora)).toEqual(["documentos-contratos"]);
    const r = procurar("modelo");
    expect(r[0].rotulo.toLowerCase().startsWith("modelo")).toBe(true);
    expect(procurar("xyzzy")).toEqual([]);
  });
  it("cada entrada aponta para uma secção que existe, e as âncoras não se repetem", () => {
    const ids = SECOES.map((s) => s.id);
    for (const e of INDICE) expect(ids).toContain(e.secao);
    expect(new Set(INDICE.map((e) => e.ancora)).size).toBe(INDICE.length);
  });
});

describe("Definições V2 · modelos de setor novos", () => {
  it("Limpeza e Manutenção juntam-se aos três de sempre, sem os mudar", () => {
    expect(SETORES.map((s) => s.id)).toEqual(["remodelacao", "avac", "solar"]);
    expect(SETORES_NOVOS.map((s) => s.id)).toEqual(["limpeza", "manutencao"]);
    expect(SETORES_V2).toHaveLength(5);
    for (const s of SETORES_V2) expect(RESUMO_SETOR[s.id]).toBeDefined();
  });
  it("a Limpeza esconde a área de intervenção e junta os seus campos", () => {
    const cfg = SETORES_NOVOS[0].cfg;
    expect(efetivo(cfg, AREA).oculto).toBe(true);
    expect(efetivo(cfg, EXTERIOR).campos.some((c) => c.k === "lp_horario")).toBe(true);
  });
});

describe("Definições V2 · o arranque", () => {
  const completo: Respostas = { setor: "limpeza", servicos: ["Limpeza regular"], pessoas: "6a15", cobra: "mes", empresas: "uma" };

  it("diz o que falta, pela ordem das perguntas, e não há plano enquanto faltar", () => {
    expect(emFalta(SEM_RESPOSTAS)).toEqual(["o setor", "pelo menos um serviço", "quantas pessoas são", "como cobra", "quantas empresas"]);
    expect(planoArranque(SEM_RESPOSTAS)).toBeNull();
    expect(planoArranque({ ...completo, servicos: [] })).toBeNull();
    expect(emFalta(completo)).toEqual([]);
  });
  it("os serviços vêm do setor, e mudar de setor tira os que não são dele", () => {
    expect(servicosDoSetor(undefined)).toEqual([]);
    expect(servicosDoSetor("limpeza")).toContain("Pós-obra");
    let r = escolherSetor(SEM_RESPOSTAS, "remodelacao");
    r = alternarServico(r, "Cozinha");
    expect(r.servicos).toEqual(["Cozinha"]);
    expect(alternarServico(r, "Cozinha").servicos).toEqual([]);
    expect(escolherSetor(r, "limpeza").servicos).toEqual([]);
  });
  it("os perfis seguem o tamanho da equipa", () => {
    expect(perfisPorPessoas("so_eu")).toEqual(["direcao"]);
    expect(perfisPorPessoas("2a5")).toHaveLength(3);
    expect(perfisPorPessoas("mais15")).toHaveLength(5);
  });
  it("com tudo respondido, mostra o modelo a aplicar: nomes, linhas, margens, perfis e campos", () => {
    const p = planoArranque(completo)!;
    expect(p.nomeSetor).toBe("Limpeza");
    expect(p.termos).toEqual({ cliente: "Cliente", local: "Espaço", obra: "Serviço" });
    expect(p.servicos).toEqual(["Limpeza regular"]);
    expect(p.margem).toEqual({ min: 20, alvo: 28 });
    expect(p.perfis).toEqual(["comercial", "direcao", "financeiro", "operacoes"]);
    expect(p.campos.novos).toBe(5); // 1 no edifício, 2 nas zonas, 2 nas escolhas
    expect(p.campos.gruposEscondidos).toBe(1);
    expect(p.campos.escondidos).toBeGreaterThan(0);
    expect(p.notas.some((n) => n.startsWith("Faturação recorrente"))).toBe(true);
  });
  it("avisa quando a cobrança escolhida não é a do modelo, e quando há várias empresas", () => {
    const p = planoArranque({ ...completo, cobra: "obra", empresas: "varias" })!;
    expect(p.notas.some((n) => n.includes("costuma cobrar por mês"))).toBe(true);
    expect(p.notas.some((n) => n.startsWith("Cada empresa"))).toBe(true);
    expect(planoArranque({ ...completo, setor: "remodelacao", servicos: ["Cozinha"], cobra: "obra" })!.notas.some((n) => n.includes("costuma"))).toBe(false);
  });
});
