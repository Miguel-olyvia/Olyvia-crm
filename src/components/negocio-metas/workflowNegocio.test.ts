import { describe, expect, it } from "vitest";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";
import type { NegocioMes } from "./negocioMetas";
import {
  MAX_CARACTERES_MOTIVO, MAX_MOTIVOS, PREDEFINICAO, descreverFluxo, normalizarConfig, opcoesAdmitidas,
  simularAceite, textoAoAceitar, validarMotivo, type ConfigWorkflow,
} from "./workflowNegocio";

const cfg = (parcial: Omit<Partial<ConfigWorkflow>, "fases"> & { fases?: Partial<ConfigWorkflow["fases"]> } = {}): ConfigWorkflow => ({
  ...PREDEFINICAO, ...parcial, fases: { ...PREDEFINICAO.fases, ...parcial.fases },
});
const sem = (id: string) => DADOS_EXEMPLO.negocios.find((n) => n.id === id) as NegocioMes;
/** Um negócio ainda em Orçamento, com um orçamento escolhido. */
const emOrcamento: NegocioMes = { ...sem("n9"), proposta: null, contrato: null };
const comProposta = sem("n6"); // proposta enviada
const curta = (chave: string) => chave.replace("businessGoals.workflow.", "");
const chaves = (r: { avisos: { chave: string }[] }) => r.avisos.map((a) => curta(a.chave));

describe("predefinição", () => {
  it("cria a proposta, pergunta pelo contrato, com as três fases e cinco motivos", () => {
    expect(PREDEFINICAO.aoAceitarOrcamento).toBe("criarProposta");
    expect(PREDEFINICAO.aoAceitarProposta).toBe("perguntarContrato");
    expect(PREDEFINICAO.fases).toEqual({ proposta: true, contrato: true });
    expect(PREDEFINICAO.motivosPerda).toEqual(["Preço", "Concorrência", "Sem resposta", "Adiou", "Outro"]);
  });
  it("já está normalizada, sem avisos", () => {
    const r = normalizarConfig(PREDEFINICAO);
    expect(r.config).toEqual(PREDEFINICAO);
    expect(r.avisos).toEqual([]);
  });
});

describe("normalizarConfig: fases", () => {
  it("Proposta desligada força Contrato desligado e só admite fechar como ganho", () => {
    const r = normalizarConfig(cfg({ fases: { proposta: false } }));
    expect(r.config.fases).toEqual({ proposta: false, contrato: false });
    expect(r.config.aoAceitarOrcamento).toBe("fecharGanho");
    expect(r.config.aoAceitarProposta).toBe("fecharSemContrato");
    expect(chaves(r)).toEqual(["aviso.contratoPorProposta", "aviso.orcamentoPorProposta", "aviso.propostaPorContrato"]);
  });
  it("Contrato desligado só admite fechar sem contrato", () => {
    const r = normalizarConfig(cfg({ fases: { contrato: false } }));
    expect(r.config.aoAceitarProposta).toBe("fecharSemContrato");
    expect(r.config.aoAceitarOrcamento).toBe("criarProposta");
    expect(chaves(r)).toEqual(["aviso.propostaPorContrato"]);
  });
  it("não avisa quando o valor já era o admitido", () => {
    const r = normalizarConfig(cfg({ fases: { contrato: false }, aoAceitarProposta: "fecharSemContrato" }));
    expect(r.avisos).toEqual([]);
  });
  it("é idempotente: normalizar o resultado não muda nada nem avisa", () => {
    const uma = normalizarConfig(cfg({ fases: { proposta: false } })).config;
    expect(normalizarConfig(uma).config).toEqual(uma);
    expect(normalizarConfig(uma).avisos).toEqual([]);
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
  it("com tudo ligado nada está indisponível", () => {
    const o = opcoesAdmitidas(PREDEFINICAO);
    expect(Object.values(o.orcamento).every((v) => v === null)).toBe(true);
    expect(Object.values(o.proposta).every((v) => v === null)).toBe(true);
    expect(o.contrato).toBeNull();
  });
  it("sem Proposta, só fechar como ganho; o Contrato fica indisponível com motivo", () => {
    const o = opcoesAdmitidas(cfg({ fases: { proposta: false } }));
    expect(o.orcamento.fecharGanho).toBeNull();
    expect(o.orcamento.criarProposta?.chave).toContain("indisponivel.propostaDesligada");
    expect(o.orcamento.perguntar).not.toBeNull();
    expect(o.orcamento.nada).not.toBeNull();
    expect(o.contrato?.chave).toContain("indisponivel.propostaDesligada");
  });
  it("sem Contrato, só fechar sem contrato", () => {
    const o = opcoesAdmitidas(cfg({ fases: { contrato: false } }));
    expect(o.proposta.fecharSemContrato).toBeNull();
    expect(o.proposta.perguntarContrato?.chave).toContain("indisponivel.contratoDesligado");
    expect(o.proposta.criarContrato).not.toBeNull();
    expect(o.contrato).toBeNull();
  });
});

describe("simularAceite", () => {
  type Evento = "aceitarOrcamento" | "aceitarProposta";
  it("aceitar o orçamento: cada opção de A", () => {
    const esperado = { criarProposta: "proposta", perguntar: "proposta", nada: null, fecharGanho: "ganho" } as const;
    for (const [opcao, proximo] of Object.entries(esperado)) {
      const r = simularAceite(cfg({ aoAceitarOrcamento: opcao as ConfigWorkflow["aoAceitarOrcamento"] }), "aceitarOrcamento", emOrcamento);
      expect(r).toMatchObject({ tipo: "resultado", proximo });
      expect(r.tipo === "resultado" && r.resultado.chave).toContain(opcao);
    }
  });
  it("aceitar a proposta: cada opção de B", () => {
    const esperado = { perguntarContrato: "contrato", criarContrato: "contrato", fecharSemContrato: "ganho" } as const;
    for (const [opcao, proximo] of Object.entries(esperado)) {
      const r = simularAceite(cfg({ aoAceitarProposta: opcao as ConfigWorkflow["aoAceitarProposta"] }), "aceitarProposta", comProposta);
      expect(r).toMatchObject({ tipo: "resultado", proximo });
    }
  });
  it("fechar sem contrato avisa que hoje não conta como ganho nas metas", () => {
    const r = simularAceite(cfg({ aoAceitarProposta: "fecharSemContrato" }), "aceitarProposta", comProposta);
    expect(r).toMatchObject({ ganhoSemContrato: true });
    expect(simularAceite(PREDEFINICAO, "aceitarProposta", comProposta)).toMatchObject({ ganhoSemContrato: false });
  });
  it("sem Proposta, aceitar o orçamento fecha como ganho e aceitar a proposta não se aplica", () => {
    const c = cfg({ fases: { proposta: false } });
    expect(simularAceite(c, "aceitarOrcamento", emOrcamento)).toMatchObject({ tipo: "resultado", proximo: "ganho" });
    const na = simularAceite(c, "aceitarProposta", comProposta);
    expect(na.tipo).toBe("nao-aplicavel");
    expect(na.tipo === "nao-aplicavel" && na.motivo.chave).toContain("faseDesligada");
  });
  it("não se aplica quando esse passo não está pendente", () => {
    const motivo = (ev: Evento, n: NegocioMes) => {
      const r = simularAceite(PREDEFINICAO, ev, n);
      return r.tipo === "nao-aplicavel" ? curta(r.motivo.chave) : "aplicavel";
    };
    expect(motivo("aceitarOrcamento", comProposta)).toBe("sim.na.jaPassou");
    expect(motivo("aceitarOrcamento", sem("n8"))).toBe("sim.na.semEscolhido");
    expect(motivo("aceitarProposta", emOrcamento)).toBe("sim.na.semProposta");
    expect(motivo("aceitarProposta", sem("n9"))).toBe("sim.na.rascunho");
    expect(motivo("aceitarProposta", sem("n10"))).toBe("sim.na.jaPassou");
    expect(motivo("aceitarProposta", { ...comProposta, proposta: { estado: "aceite" }, contrato: null })).toBe("sim.na.jaAceite");
  });
  it("nunca altera o negócio", () => {
    const antes = JSON.stringify(comProposta);
    simularAceite(PREDEFINICAO, "aceitarProposta", comProposta);
    expect(JSON.stringify(comProposta)).toBe(antes);
  });
});

describe("textoAoAceitar", () => {
  const chave = (c: ConfigWorkflow, n: NegocioMes) => {
    const t = textoAoAceitar(c, n);
    return t ? curta(t.chave) : null;
  };
  it("em Orçamento fala de A; em Proposta fala de B", () => {
    expect(chave(PREDEFINICAO, emOrcamento)).toBe("aoAceitar.criarProposta");
    expect(chave(cfg({ aoAceitarOrcamento: "perguntar" }), emOrcamento)).toBe("aoAceitar.perguntar");
    expect(chave(PREDEFINICAO, comProposta)).toBe("aoAceitar.perguntarContrato");
    expect(chave(cfg({ aoAceitarProposta: "fecharSemContrato" }), comProposta)).toBe("aoAceitar.fecharSemContrato");
  });
  it("sem Proposta, o orçamento fecha como ganho; a proposta deixa de ter linha", () => {
    const c = cfg({ fases: { proposta: false } });
    expect(chave(c, emOrcamento)).toBe("aoAceitar.fecharGanho");
    expect(textoAoAceitar(c, comProposta)).toBeNull();
  });
  it("só há linha quando o passo está pendente, como no simulador", () => {
    expect(textoAoAceitar(PREDEFINICAO, sem("n8"))).toBeNull(); // Orçamento sem orçamento escolhido
    expect(textoAoAceitar(PREDEFINICAO, sem("n9"))).toBeNull(); // proposta ainda em rascunho
    expect(chave(PREDEFINICAO, comProposta)).toBe("aoAceitar.perguntarContrato"); // proposta enviada
  });
  it("sem passo ativo não há linha: contrato em curso, assinado, proposta já aceite", () => {
    expect(textoAoAceitar(PREDEFINICAO, sem("n10"))).toBeNull();
    expect(textoAoAceitar(PREDEFINICAO, sem("n1"))).toBeNull();
    expect(textoAoAceitar(PREDEFINICAO, { ...comProposta, proposta: { estado: "aceite" } })).toBeNull();
  });
});

describe("descreverFluxo", () => {
  const ids = (c: ConfigWorkflow) => descreverFluxo(c).setas.map((s) => `${s.de}>${s.para}`);
  it("predefinição: Orçamento, Proposta, Contrato, Ganho, cada um ligado ao seguinte", () => {
    const d = descreverFluxo(PREDEFINICAO);
    expect(d.nos.map((n) => [n.id, n.ligado])).toEqual([
      ["orcamento", true], ["proposta", true], ["contrato", true], ["ganho", true],
    ]);
    expect(ids(PREDEFINICAO)).toEqual(["orcamento>proposta", "proposta>contrato", "contrato>ganho"]);
    expect(d.frases.length).toBeGreaterThanOrEqual(4);
  });
  it("Proposta desligada: Orçamento vai direto a Ganho", () => {
    const c = cfg({ fases: { proposta: false } });
    expect(ids(c)).toEqual(["orcamento>ganho"]);
    expect(descreverFluxo(c).nos.filter((n) => !n.ligado).map((n) => n.id)).toEqual(["proposta", "contrato"]);
    expect(descreverFluxo(c).setas[0].rotulo.chave).toContain("seta.orcGanho");
  });
  it("Contrato desligado: Proposta vai a Ganho sem contrato", () => {
    const c = cfg({ fases: { contrato: false } });
    expect(ids(c)).toEqual(["orcamento>proposta", "proposta>ganho"]);
    expect(descreverFluxo(c).setas[1].rotulo.chave).toContain("seta.propSemContrato");
  });
  it("fechar como ganho no Orçamento salta a Proposta; nada mantém a seta com o seu rótulo", () => {
    expect(ids(cfg({ aoAceitarOrcamento: "fecharGanho" }))[0]).toBe("orcamento>ganho");
    expect(descreverFluxo(cfg({ aoAceitarOrcamento: "nada" })).setas[0].rotulo.chave).toContain("seta.orcNada");
  });
  it("as frases dizem as fases desligadas e o Perdido", () => {
    const f = descreverFluxo(cfg({ fases: { proposta: false } })).frases.map((x) => x.chave);
    expect(f.some((k) => k.includes("frase.propostaOff"))).toBe(true);
    expect(f.some((k) => k.includes("frase.contratoOff"))).toBe(true);
    expect(f.some((k) => k.includes("frase.perdido"))).toBe(true);
  });
});
