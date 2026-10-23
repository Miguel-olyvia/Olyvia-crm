import { describe, expect, it } from "vitest";
import {
  MAX_CARACTERES_MOTIVO, MAX_MOTIVOS, PREDEFINICAO, avisosDeFases, normalizarConfig, opcoesAdmitidas, tx, traduzir, validarMotivo,
  type ConfigWorkflow,
} from "./workflowNegocio";

const cfg = (parcial: Omit<Partial<ConfigWorkflow>, "fases"> & { fases?: Partial<ConfigWorkflow["fases"]> } = {}): ConfigWorkflow => ({
  ...PREDEFINICAO, ...parcial, fases: { ...PREDEFINICAO.fases, ...parcial.fases },
});
const curta = (chave: string) => chave.replace("businessGoals.workflow.", "");
const chaves = (r: { avisos: { chave: string }[] }) => r.avisos.map((a) => curta(a.chave));

describe("predefinição", () => {
  it("tem o defeito de cada célula, as duas fases ligadas e cinco motivos", () => {
    expect(PREDEFINICAO).toMatchObject({
      orcamentoGanho: "criarProposta", orcamentoPerdido: "perderSeUltimo", propostaGanho: "perguntarContrato",
      propostaPerdido: "perderNegocio", contratoPerdido: "perderNegocio", fases: { proposta: true, contrato: true },
    });
    expect(PREDEFINICAO.motivosPerda).toEqual(["Preço", "Concorrência", "Sem resposta", "Adiou", "Outro"]);
  });
  it("já está normalizada, sem avisos", () => {
    const r = normalizarConfig(PREDEFINICAO);
    expect(r.config).toEqual(PREDEFINICAO);
    expect(r.avisos).toEqual([]);
  });
});

describe("normalizarConfig: fases e células", () => {
  it("Proposta desligada: o Contrato desliga-se, o Orçamento só fecha como ganho e as linhas escondidas voltam ao defeito", () => {
    const r = normalizarConfig(cfg({ fases: { proposta: false }, propostaGanho: "criarContrato", propostaPerdido: "voltarOrcamento", contratoPerdido: "voltarProposta" }));
    expect(r.config.fases).toEqual({ proposta: false, contrato: false });
    expect(r.config.orcamentoGanho).toBe("fecharGanho");
    expect(r.config).toMatchObject({ propostaGanho: "perguntarContrato", propostaPerdido: "perderNegocio", contratoPerdido: "perderNegocio" });
    expect(chaves(r)).toEqual(["aviso.contratoPorProposta", "aviso.orcamentoPorProposta", "aviso.propostaOculta", "aviso.contratoOculto"]);
  });
  it("Contrato desligado: a Proposta só fecha sem contrato e a linha do Contrato volta ao defeito", () => {
    const r = normalizarConfig(cfg({ fases: { contrato: false }, contratoPerdido: "perguntar" }));
    expect(r.config.propostaGanho).toBe("fecharSemContrato");
    expect(r.config.contratoPerdido).toBe("perderNegocio");
    expect(r.config.orcamentoGanho).toBe("criarProposta");
    expect(chaves(r)).toEqual(["aviso.propostaPorContrato", "aviso.contratoOculto"]);
  });
  it("não avisa quando o valor já era o admitido ou o defeito", () => {
    expect(normalizarConfig(cfg({ fases: { contrato: false }, propostaGanho: "fecharSemContrato" })).avisos).toEqual([]);
    expect(normalizarConfig(cfg({ fases: { proposta: false }, orcamentoGanho: "fecharGanho" })).avisos.map((a) => curta(a.chave)))
      .toEqual(["aviso.contratoPorProposta"]);
  });
  it("as células de perdido do Orçamento nunca mudam por causa das fases", () => {
    const r = normalizarConfig(cfg({ fases: { proposta: false }, orcamentoPerdido: "manterAberto" }));
    expect(r.config.orcamentoPerdido).toBe("manterAberto");
  });
  it("é idempotente: normalizar o resultado não muda nada nem avisa", () => {
    for (const fases of [{ proposta: false }, { contrato: false }]) {
      const uma = normalizarConfig(cfg({ fases, propostaPerdido: "perguntar", contratoPerdido: "perguntar" })).config;
      const outra = normalizarConfig(uma);
      expect(outra.config).toEqual(uma);
      expect(outra.avisos).toEqual([]);
    }
  });
  it("não altera a entrada", () => {
    const entrada = cfg({ fases: { proposta: false } });
    const copia = JSON.parse(JSON.stringify(entrada));
    normalizarConfig(entrada);
    expect(entrada).toEqual(copia);
  });
});

describe("normalizarConfig: motivos de perda", () => {
  const motivos = (m: unknown[]) => normalizarConfig(cfg({ motivosPerda: m as string[] }));
  it("tira espaços, repetidos (sem distinguir maiúsculas) e vazios", () => {
    const r = motivos(["  Preço ", "preço", "", "   ", "Outro"]);
    expect(r.config.motivosPerda).toEqual(["Preço", "Outro"]);
    expect(chaves(r)).toContain("aviso.motivosRepetidos");
  });
  it("corta cada motivo aos 40 caracteres", () => {
    const r = motivos(["x".repeat(60)]);
    expect(r.config.motivosPerda[0]).toHaveLength(MAX_CARACTERES_MOTIVO);
    expect(chaves(r)).toEqual(["aviso.motivosCortados"]);
  });
  it("aceita exatamente 40 caracteres sem aviso", () => {
    expect(chaves(motivos(["y".repeat(40)]))).toEqual([]);
  });
  it("fica com os primeiros 8", () => {
    const r = motivos(Array.from({ length: 12 }, (_, i) => `Motivo ${i}`));
    expect(r.config.motivosPerda).toHaveLength(MAX_MOTIVOS);
    expect(r.config.motivosPerda[7]).toBe("Motivo 7");
    expect(chaves(r)).toEqual(["aviso.motivosExcesso"]);
  });
  it("nunca fica sem motivos: repõe os predefinidos", () => {
    const r = motivos([]);
    expect(r.config.motivosPerda).toEqual(PREDEFINICAO.motivosPerda);
    expect(chaves(r)).toEqual(["aviso.motivosVazios"]);
    expect(motivos([null, 3, ""]).config.motivosPerda).toEqual(PREDEFINICAO.motivosPerda);
  });
});

describe("validarMotivo", () => {
  const atuais = ["Preço", "Outro"];
  it("aceita um motivo novo", () => expect(validarMotivo("Obra adiada", atuais)).toBeNull());
  it("recusa vazio, só espaços, longo, repetido e lista cheia", () => {
    expect(validarMotivo("", atuais)?.chave).toContain("motivo.vazio");
    expect(validarMotivo("   ", atuais)?.chave).toContain("motivo.vazio");
    expect(validarMotivo("z".repeat(41), atuais)?.chave).toContain("motivo.longo");
    expect(validarMotivo(" PREÇO ", atuais)?.chave).toContain("motivo.repetido");
    expect(validarMotivo("Novo", Array.from({ length: 8 }, (_, i) => `m${i}`))?.chave).toContain("motivo.cheio");
  });
  it("40 caracteres é o limite, inclusive", () => expect(validarMotivo("z".repeat(40), atuais)).toBeNull());
});

describe("opcoesAdmitidas", () => {
  const valores = (o: Record<string, unknown>) => Object.values(o);
  it("com tudo ligado nada está indisponível e as duas linhas aparecem", () => {
    const o = opcoesAdmitidas(PREDEFINICAO);
    for (const celula of [o.orcamentoGanho, o.orcamentoPerdido, o.propostaGanho, o.propostaPerdido, o.contratoPerdido]) {
      expect(valores(celula).every((v) => v === null)).toBe(true);
    }
    expect(o.linhas).toEqual({ proposta: true, contrato: true });
    expect(o.contratoLigavel).toBeNull();
  });
  it("sem Proposta: só fechar como ganho no Orçamento, linhas escondidas e Contrato por ligar com motivo", () => {
    const o = opcoesAdmitidas(cfg({ fases: { proposta: false } }));
    expect(o.orcamentoGanho.fecharGanho).toBeNull();
    expect(o.orcamentoGanho.criarProposta?.chave).toContain("indisponivel.propostaDesligada");
    expect(o.orcamentoGanho.perguntar).not.toBeNull();
    expect(o.orcamentoGanho.nada).not.toBeNull();
    expect(o.linhas).toEqual({ proposta: false, contrato: false });
    expect(o.contratoLigavel?.chave).toContain("indisponivel.propostaDesligada");
  });
  it("sem Contrato: a Proposta só fecha sem contrato", () => {
    const o = opcoesAdmitidas(cfg({ fases: { contrato: false } }));
    expect(o.propostaGanho.fecharSemContrato).toBeNull();
    expect(o.propostaGanho.perguntarContrato?.chave).toContain("indisponivel.contratoDesligado");
    expect(o.propostaGanho.criarContrato).not.toBeNull();
    expect(o.linhas).toEqual({ proposta: true, contrato: false });
    expect(o.contratoLigavel).toBeNull();
  });
});

describe("avisosDeFases", () => {
  const chaves = (a: ConfigWorkflow["fases"], b: ConfigWorkflow["fases"]) => avisosDeFases(a, b).map((x) => curta(x.chave));
  it("avisa sempre ao desligar ou ligar uma fase, mesmo que nenhum valor mude", () => {
    expect(chaves({ proposta: true, contrato: true }, { proposta: true, contrato: false })).toEqual(["aviso.contratoDesligado"]);
    expect(chaves({ proposta: true, contrato: false }, { proposta: true, contrato: true })).toEqual(["aviso.contratoLigado"]);
    expect(chaves({ proposta: true, contrato: true }, { proposta: false, contrato: true })).toEqual(["aviso.propostaDesligada"]);
    expect(chaves({ proposta: false, contrato: false }, { proposta: true, contrato: false })).toEqual(["aviso.propostaLigada"]);
  });
  it("não avisa quando as fases ficam como estavam", () => {
    expect(chaves(PREDEFINICAO.fases, PREDEFINICAO.fases)).toEqual([]);
  });
});

describe("traduzir", () => {
  const t = (chave: string, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), chave === "a" ? "Se: {x}" : chave);
  it("traduz também os parâmetros que são textos", () => {
    expect(traduzir(t, { chave: "a", params: { x: { chave: "b" } } })).toBe("Se: b");
    expect(traduzir(t, { chave: "a", params: { x: 3 } })).toBe("Se: 3");
    expect(traduzir(t, tx("c"))).toBe("businessGoals.workflow.c");
  });
});
