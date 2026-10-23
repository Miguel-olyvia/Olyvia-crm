// A configuração do fecho dos negócios (negocio_workflow_config), em forma pura: ler a linha da tabela, validar o prazo de reflexão, montar os
// parâmetros de neg_guardar_config_negocios e ler a resposta. O prazo de reflexão nunca tem valor por omissão (nulo até o jurídico validar).
import { describe, expect, it } from "vitest";
import {
  CANCELAMENTOS, CONVERSOES_AO_GANHAR, lerConfig, lerResultadoConfig, paraEnvio, RECUSAS, reflexaoEmTexto, validarReflexao,
  type ConfigNegocios,
} from "./configNegocios";

const LINHA = { conversao_ao_ganhar: "manual", recusa_proposta: "manter_aberto", recusa_contrato: "perder", cancelamento_no_prazo: "manter_ganho", reflexao_dias: 14 };
const CONFIG: ConfigNegocios = {
  conversaoAoGanhar: "manual", recusaProposta: "manter_aberto", recusaContrato: "perder", cancelamentoNoPrazo: "manter_ganho", reflexaoDias: 14,
};

describe("os valores que a base aceita", () => {
  it("são exatamente os do CHECK de cada coluna", () => {
    expect([...CONVERSOES_AO_GANHAR].sort()).toEqual(["automatica", "manual", "nao_alterar"]);
    expect([...RECUSAS].sort()).toEqual(["manter_aberto", "perder"]);
    expect([...CANCELAMENTOS].sort()).toEqual(["manter_ganho", "perder"]);
  });

  it("as omissões da base vêm primeiro: automática e perder", () => {
    expect(CONVERSOES_AO_GANHAR[0]).toBe("automatica");
    expect(RECUSAS[0]).toBe("perder");
    expect(CANCELAMENTOS[0]).toBe("perder");
  });
});

describe("lerConfig", () => {
  it("lê a linha da tabela", () => {
    expect(lerConfig(LINHA)).toEqual(CONFIG);
  });

  it("o prazo nulo lê-se como nulo: nunca se inventa um prazo", () => {
    expect(lerConfig({ ...LINHA, reflexao_dias: null })?.reflexaoDias).toBeNull();
    expect(lerConfig({ ...LINHA, reflexao_dias: undefined })?.reflexaoDias).toBeNull();
  });

  it("sem linha (a organização não tem a configuração) devolve nulo", () => {
    expect(lerConfig(null)).toBeNull();
    expect(lerConfig(undefined)).toBeNull();
  });

  it.each([
    ["conversao_ao_ganhar", "xpto"], ["recusa_proposta", "manter_ganho"], ["recusa_contrato", "manter_ganho"],
    ["cancelamento_no_prazo", "manter_aberto"], ["reflexao_dias", 0], ["reflexao_dias", 366], ["reflexao_dias", 1.5], ["reflexao_dias", "14"],
  ])("um valor que a base não aceita (%s = %j) não se mostra como se fosse bom: lança", (coluna, valor) => {
    expect(() => lerConfig({ ...LINHA, [coluna]: valor })).toThrow();
  });

  it("uma linha que não é um objeto lança", () => {
    expect(() => lerConfig("x")).toThrow();
    expect(() => lerConfig([])).toThrow();
  });
});

describe("validarReflexao", () => {
  it("vazio, ou só espaços, é nulo (sem prazo)", () => {
    expect(validarReflexao("")).toEqual({ valor: null });
    expect(validarReflexao("   ")).toEqual({ valor: null });
  });

  it("aceita inteiros de 1 a 365, com espaços à volta", () => {
    expect(validarReflexao("1")).toEqual({ valor: 1 });
    expect(validarReflexao(" 14 ")).toEqual({ valor: 14 });
    expect(validarReflexao("365")).toEqual({ valor: 365 });
  });

  it.each(["0", "366", "1000", "00"])("%s está fora do intervalo", (texto) => {
    expect(validarReflexao(texto)).toEqual({ erro: "intervalo" });
  });

  it.each(["1,5", "1.5", "abc", "-3", "+3", "1e2", "14 dias", "٣"])("%s não é um número inteiro de dias", (texto) => {
    expect(validarReflexao(texto)).toEqual({ erro: "formato" });
  });
});

describe("reflexaoEmTexto", () => {
  it("nulo dá texto vazio e um número dá o número", () => {
    expect(reflexaoEmTexto(null)).toBe("");
    expect(reflexaoEmTexto(30)).toBe("30");
  });
});

describe("paraEnvio", () => {
  it("monta exatamente os seis parâmetros da função", () => {
    expect(paraEnvio("org-1", CONFIG)).toEqual({
      p_organization_id: "org-1", p_conversao_ao_ganhar: "manual", p_recusa_proposta: "manter_aberto", p_recusa_contrato: "perder",
      p_cancelamento_no_prazo: "manter_ganho", p_reflexao_dias: 14,
    });
  });

  it("o prazo nulo vai nulo", () => {
    expect(paraEnvio("org-1", { ...CONFIG, reflexaoDias: null }).p_reflexao_dias).toBeNull();
  });
});

describe("lerResultadoConfig", () => {
  const depois = { ...LINHA, conversao_ao_ganhar: "nao_alterar" };

  it("lê mudou, o estado de depois e o aviso das conversões", () => {
    expect(lerResultadoConfig({ antes: LINHA, depois, mudou: true, aviso_conversao_contratos: true })).toEqual({
      mudou: true, depois: { ...CONFIG, conversaoAoGanhar: "nao_alterar" }, avisoConversaoContratos: true,
    });
  });

  it("mudou e o aviso só valem se forem exatamente true", () => {
    expect(lerResultadoConfig({ depois, mudou: "true", aviso_conversao_contratos: 1 })).toMatchObject({ mudou: false, avisoConversaoContratos: false });
  });

  it("um «depois» que não se reconhece lê-se como nulo (quem chama relê da base)", () => {
    expect(lerResultadoConfig({ depois: { ...depois, recusa_proposta: "xpto" }, mudou: true }).depois).toBeNull();
    expect(lerResultadoConfig({ depois: "x", mudou: true }).depois).toBeNull();
  });

  it("uma resposta que não é um objeto lê-se como «não mudou, sem aviso»", () => {
    expect(lerResultadoConfig(null)).toEqual({ mudou: false, depois: null, avisoConversaoContratos: false });
  });
});
