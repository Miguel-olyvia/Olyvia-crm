// As regras do formulário de ativos no ecrã, as mesmas da base (rpc_ativo_criar): datas de 2000-01-01 a hoje + 10 anos, euros até
// 9 999 999 999,99, vida de 1 a 600 meses, e os argumentos `p_*` que seguem para a RPC. Também os erros (ATVnn) e o seu campo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campoDoCodigo, campoDoErro, chaveDoErro, codigoAtv, ativosIndisponivel, ativosRecusado, detalheDaBase, refazListaAposErro } from "./errosAtivo";
import { argumentosDoAtivo, dataMaximaAtivo, dataValida, numeroDoCampo, validarAtivo, type CamposAtivo } from "./validarAtivo";

const BOM: CamposAtivo = {
  grupo: "estrutura", nome: " Mesa ", tipo: "mobiliario", catEquipamentoId: "", codigo: "", numSerie: "", dataCompra: "2026-03-01",
  valorCompra: "1 234,567", valorResidual: "", vidaMeses: "12", manutencaoAno: "", centroCustoId: "", localizacao: "", notas: "",
  forma: "comprado", vidaOrigem: "manual", vidaCatalogoMeses: null, rendaMensal: "", inicioAluguer: "", fimAluguer: "", armazemId: "",
};
const ALUGADO: CamposAtivo = {
  ...BOM, grupo: "pessoa", tipo: "viatura", nome: "Carrinha", forma: "alugado", dataCompra: "", valorCompra: "", vidaMeses: "", vidaOrigem: "manual",
  rendaMensal: "450", inicioAluguer: "2026-01-01", fimAluguer: "",
};

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-06-15T12:00:00")); });
afterEach(() => vi.useRealTimers());

describe("validarAtivo", () => {
  it("um formulário bom não tem erros", () => expect(validarAtivo(BOM)).toEqual({}));

  it("a data vai de 2000-01-01 a hoje + 7 dias (como a base: ATV07 e ATV16) e tem de existir", () => {
    expect(dataValida("2000-01-01")).toBe(true);
    expect(dataValida("1999-12-31")).toBe(false);
    expect(dataValida("2026-06-22")).toBe(true);
    expect(dataValida("2026-06-23")).toBe(false);
    expect(dataValida("2036-06-15")).toBe(false);
    expect(dataMaximaAtivo()).toBe("2026-06-22");
    expect(dataValida("2026-02-30")).toBe(false);
    expect(dataValida("")).toBe(false);
  });

  it("o valor de compra: maior que zero e até 9 999 999 999,99", () => {
    expect(validarAtivo({ ...BOM, valorCompra: "0,004" }).valorCompra).toBeDefined();
    expect(validarAtivo({ ...BOM, valorCompra: "9999999999,99" }).valorCompra).toBeUndefined();
    expect(validarAtivo({ ...BOM, valorCompra: "10000000000" }).valorCompra).toBeDefined();
    expect(validarAtivo({ ...BOM, valorCompra: "1e3" }).valorCompra).toBeDefined();
  });

  it("o residual compara-se ao cêntimo (igual à compra passa) e a manutenção não é negativa", () => {
    expect(validarAtivo({ ...BOM, valorCompra: "100", valorResidual: "100" }).residual).toBeUndefined();
    expect(validarAtivo({ ...BOM, valorCompra: "100", valorResidual: "100,01" }).residual).toBeDefined();
    expect(validarAtivo({ ...BOM, valorResidual: "-1" }).residual).toBeDefined();
    expect(validarAtivo({ ...BOM, manutencaoAno: "-5" }).manutencao).toBeDefined();
  });

  it("Serviço: a vida é opcional mas, se vier, é de 1 a 600; sem modelo falha; tipo não se pede", () => {
    const servico = { ...BOM, grupo: "servico" as const, tipo: "", vidaMeses: "", catEquipamentoId: "c1" };
    expect(validarAtivo(servico)).toEqual({});
    expect(validarAtivo({ ...servico, vidaMeses: "601" }).vida).toBeDefined();
    expect(validarAtivo({ ...servico, catEquipamentoId: "" }).modelo).toBeDefined();
  });

  it("os tamanhos: nome 120, código 40, série 80, localização 120, notas 1000", () => {
    const e = validarAtivo({ ...BOM, nome: "x".repeat(121), codigo: "c".repeat(41), numSerie: "s".repeat(81), localizacao: "l".repeat(121), notas: "n".repeat(1001) });
    expect(Object.keys(e).sort()).toEqual(["codigo", "localizacao", "nome", "notas", "numSerie"]);
    expect(validarAtivo({ ...BOM, nome: "   " }).nome).toBeDefined();
  });

  it("um tipo de outro grupo não serve", () => {
    expect(validarAtivo({ ...BOM, grupo: "pessoa", tipo: "mobiliario" }).tipo).toBeDefined();
    expect(validarAtivo({ ...BOM, grupo: "estrutura", tipo: "portatil" }).tipo).toBeDefined();
  });
});

describe("argumentosDoAtivo", () => {
  it("aparados, arredondados ao cêntimo e com os vazios a null (residual e manutenção a 0)", () => {
    expect(argumentosDoAtivo(BOM)).toEqual({
      p_nome: "Mesa", p_tipo: "mobiliario", p_cat_equipamento_id: null, p_data_compra: "2026-03-01", p_valor_compra: 1234.57, p_valor_residual: 0,
      p_vida_meses: 12, p_manutencao_ano: 0, p_codigo: null, p_num_serie: null, p_centro_custo_id: null, p_localizacao: null, p_notas: null,
      p_vida_origem: "manual", p_warehouse_id: null, p_forma_aquisicao: "comprado", p_renda_mensal: null, p_inicio_aluguer: null, p_fim_aluguer: null,
    });
  });
  it("numeroDoCampo aceita «1.234,50», «1234,50», «1 234,50» e «1234.5»; vazio é null; lixo é NaN", () => {
    expect(numeroDoCampo("1.234,50")).toBe(1234.5);
    expect(numeroDoCampo("1234,50")).toBe(1234.5);
    expect(numeroDoCampo("1.234.567,89")).toBe(1234567.89);
    expect(numeroDoCampo("1.500")).toBe(1500);
    expect(numeroDoCampo("0.125")).toBe(0.125);
    expect(numeroDoCampo("1234.5")).toBe(1234.5);
    expect(numeroDoCampo("12.34.5")).toBeNaN();
    expect(numeroDoCampo("1 234,5")).toBe(1234.5);
    expect(numeroDoCampo("  ")).toBeNull();
    expect(numeroDoCampo("12abc")).toBeNaN();
  });
});

describe("Alugado: renda e datas do contrato, sem compra nem vida", () => {
  it("um alugado bom não tem erros, mesmo sem valor de compra, data de compra nem vida", () => {
    expect(validarAtivo(ALUGADO)).toEqual({});
    expect(validarAtivo({ ...ALUGADO, fimAluguer: "2029-12-31" })).toEqual({});
  });

  it("a renda tem de ser maior do que zero e até 9 999 999 999,99", () => {
    expect(validarAtivo({ ...ALUGADO, rendaMensal: "" }).renda).toBeDefined();
    expect(validarAtivo({ ...ALUGADO, rendaMensal: "0" }).renda).toBeDefined();
    expect(validarAtivo({ ...ALUGADO, rendaMensal: "abc" }).renda).toBeDefined();
    expect(validarAtivo({ ...ALUGADO, rendaMensal: "10000000000" }).renda).toBeDefined();
    expect(validarAtivo({ ...ALUGADO, rendaMensal: "450,50" }).renda).toBeUndefined();
  });

  it("o início é obrigatório e vai de 2000-01-01 a hoje + 366 dias (um contrato que ainda vai começar)", () => {
    expect(validarAtivo({ ...ALUGADO, inicioAluguer: "" }).inicioAluguer).toBeDefined();
    expect(validarAtivo({ ...ALUGADO, inicioAluguer: "1999-12-31" }).inicioAluguer).toBeDefined();
    expect(validarAtivo({ ...ALUGADO, inicioAluguer: "2026-02-30" }).inicioAluguer).toBeDefined();
    expect(validarAtivo({ ...ALUGADO, inicioAluguer: "2027-06-16" }).inicioAluguer).toBeUndefined();
    expect(validarAtivo({ ...ALUGADO, inicioAluguer: "2027-06-17" }).inicioAluguer).toBeDefined();
  });

  it("o fim é opcional, não pode ser antes do início e vai até 2100", () => {
    expect(validarAtivo({ ...ALUGADO, fimAluguer: "2025-12-31" }).fimAluguer).toBeDefined();
    expect(validarAtivo({ ...ALUGADO, fimAluguer: "2026-01-01" }).fimAluguer).toBeUndefined();
    expect(validarAtivo({ ...ALUGADO, fimAluguer: "2100-01-02" }).fimAluguer).toBeDefined();
    expect(validarAtivo({ ...ALUGADO, fimAluguer: "lixo" }).fimAluguer).toBeDefined();
  });

  it("os argumentos de um alugado: renda e datas, tudo da compra a null, residual e vida a null", () => {
    expect(argumentosDoAtivo({ ...ALUGADO, fimAluguer: "2029-12-31", rendaMensal: "450,555" })).toEqual({
      p_nome: "Carrinha", p_tipo: "viatura", p_cat_equipamento_id: null, p_data_compra: null, p_valor_compra: null, p_valor_residual: null,
      p_vida_meses: null, p_manutencao_ano: 0, p_codigo: null, p_num_serie: null, p_centro_custo_id: null, p_localizacao: null, p_notas: null,
      p_vida_origem: null, p_warehouse_id: null, p_forma_aquisicao: "alugado", p_renda_mensal: 450.56, p_inicio_aluguer: "2026-01-01", p_fim_aluguer: "2029-12-31",
    });
  });

  it("sem fim, o fim vai a null (um arrendamento que se renova)", () => {
    expect(argumentosDoAtivo(ALUGADO).p_fim_aluguer).toBeNull();
  });

  it("um comprado nunca leva campos do aluguer, mesmo que tenham ficado escritos no formulário", () => {
    const a = argumentosDoAtivo({ ...BOM, rendaMensal: "99", inicioAluguer: "2026-01-01", fimAluguer: "2027-01-01" });
    expect(a).toMatchObject({ p_renda_mensal: null, p_inicio_aluguer: null, p_fim_aluguer: null, p_forma_aquisicao: "comprado" });
  });

  it("o serviço não se aluga: o formulário trata-o sempre como comprado", () => {
    const servico = { ...BOM, grupo: "servico" as const, tipo: "", catEquipamentoId: "c1", vidaMeses: "", forma: "alugado" as const };
    expect(validarAtivo(servico).renda).toBeUndefined();
    expect(argumentosDoAtivo(servico).p_forma_aquisicao).toBe("comprado");
  });
});

describe("A vida útil de um comprado: meses de pagamento, a do catálogo ou à mão", () => {
  const pessoa = { ...BOM, grupo: "pessoa" as const, tipo: "portatil" };

  it("meses de pagamento: de 1 a 600, e a origem segue para a base", () => {
    const c = { ...pessoa, vidaOrigem: "pagamento" as const, vidaMeses: "24" };
    expect(validarAtivo(c)).toEqual({});
    expect(argumentosDoAtivo(c)).toMatchObject({ p_vida_meses: 24, p_vida_origem: "pagamento" });
    expect(validarAtivo({ ...c, vidaMeses: "" }).vida).toBeDefined();
    expect(validarAtivo({ ...c, vidaMeses: "601" }).vida).toBeDefined();
  });

  it("do catálogo (pessoa): a vida vem do equipamento escolhido (anos x 12) e é obrigatório escolher um com vida em anos", () => {
    const c = { ...pessoa, vidaOrigem: "catalogo" as const, vidaMeses: "", catEquipamentoId: "c1", vidaCatalogoMeses: 48 };
    expect(validarAtivo(c)).toEqual({});
    expect(argumentosDoAtivo(c)).toMatchObject({ p_vida_meses: 48, p_vida_origem: "catalogo", p_cat_equipamento_id: "c1" });
    expect(validarAtivo({ ...c, catEquipamentoId: "", vidaCatalogoMeses: null }).modelo).toBeDefined();
    expect(validarAtivo({ ...c, vidaCatalogoMeses: null }).vida).toBeDefined();
  });

  it("à mão e meses de pagamento não levam o equipamento do catálogo (só o serviço, que o exige)", () => {
    const c = { ...pessoa, vidaOrigem: "manual" as const, vidaMeses: "36", catEquipamentoId: "c1" };
    expect(argumentosDoAtivo(c)).toMatchObject({ p_cat_equipamento_id: null, p_vida_origem: "manual" });
  });

  it("serviço do catálogo: a vida fica a null (usa a do modelo ao vivo) e a origem é «catalogo»", () => {
    const c = { ...BOM, grupo: "servico" as const, tipo: "", catEquipamentoId: "c1", vidaOrigem: "catalogo" as const, vidaMeses: "" };
    expect(validarAtivo(c)).toEqual({});
    expect(argumentosDoAtivo(c)).toMatchObject({ p_vida_meses: null, p_vida_origem: "catalogo", p_cat_equipamento_id: "c1" });
  });

  it("serviço à mão com vida: origem «manual»; sem vida, fica sem origem (como antes)", () => {
    const c = { ...BOM, grupo: "servico" as const, tipo: "", catEquipamentoId: "c1", vidaOrigem: "manual" as const };
    expect(argumentosDoAtivo({ ...c, vidaMeses: "60" })).toMatchObject({ p_vida_meses: 60, p_vida_origem: "manual" });
    expect(argumentosDoAtivo({ ...c, vidaMeses: "" })).toMatchObject({ p_vida_meses: null, p_vida_origem: null });
  });
});

describe("O armazém do Stock", () => {
  it("só um ativo de estrutura do tipo instalações o leva; os outros mandam null", () => {
    const instalacoes = { ...BOM, tipo: "instalacoes", armazemId: "w1" };
    expect(argumentosDoAtivo(instalacoes).p_warehouse_id).toBe("w1");
    expect(argumentosDoAtivo({ ...instalacoes, tipo: "mobiliario" }).p_warehouse_id).toBeNull();
    expect(argumentosDoAtivo({ ...instalacoes, grupo: "pessoa", tipo: "portatil" }).p_warehouse_id).toBeNull();
    expect(argumentosDoAtivo({ ...instalacoes, armazemId: "" }).p_warehouse_id).toBeNull();
  });

  it("um armazém alugado também o leva (renda de estrutura)", () => {
    expect(argumentosDoAtivo({ ...ALUGADO, grupo: "estrutura", tipo: "instalacoes", armazemId: "w1" })).toMatchObject({ p_warehouse_id: "w1", p_forma_aquisicao: "alugado" });
  });
});

describe("errosAtivo", () => {
  it("lê o código ATVnn da mensagem (P0001) e só aceita os do desenho", () => {
    expect(codigoAtv({ code: "P0001", message: "ATV12", details: "Já existe" })).toBe("ATV12");
    expect(codigoAtv({ message: "ATV99" })).toBeNull();
    expect(codigoAtv({ message: "boom" })).toBeNull();
    expect(codigoAtv(null)).toBeNull();
  });
  it("cada código com campo vai para o campo certo", () => {
    expect(campoDoCodigo("ATV05")).toBe("modelo");
    expect(campoDoCodigo("ATV09")).toBe("residual");
    expect(campoDoCodigo("ATV12")).toBe("codigo");
    expect(campoDoCodigo("ATV17")).toBeNull();
    expect(campoDoCodigo("ATV20")).toBe("renda");
    expect(campoDoCodigo("ATV21")).toBe("inicioAluguer");
    expect(campoDoCodigo("ATV22")).toBe("armazem");
    expect(campoDoCodigo("ATV24")).toBe("vida");
    expect(campoDoCodigo("ATV28")).toBe("data");
    expect(campoDoCodigo(null)).toBeNull();
  });
  it("ATV03 serve vários campos: o DETAIL da base diz qual (código, série, localização, notas; o resto é o nome)", () => {
    const atv03 = (details: string) => campoDoErro({ code: "P0001", message: "ATV03", details });
    expect(atv03("O código tem no máximo 40 caracteres.")).toBe("codigo");
    expect(atv03("O número de série tem no máximo 80 caracteres.")).toBe("numSerie");
    expect(atv03("A localização tem no máximo 120 caracteres.")).toBe("localizacao");
    expect(atv03("As notas têm no máximo 1000 caracteres.")).toBe("notas");
    expect(atv03("O nome é obrigatório e tem no máximo 120 caracteres.")).toBe("nome");
    expect(campoDoErro({ message: "ATV12" })).toBe("codigo");
    expect(campoDoErro({ message: "ATV17" })).toBeNull();
  });
  it("o DETAIL pt-PT da base só se usa nos códigos genéricos (ATV03, ATV16, ATV18)", () => {
    expect(detalheDaBase({ message: "ATV18", details: "Esta atribuição já foi devolvida." })).toBe("Esta atribuição já foi devolvida.");
    expect(detalheDaBase({ message: "ATV16", details: "Indique a data e o motivo." })).toBe("Indique a data e o motivo.");
    expect(detalheDaBase({ message: "ATV12", details: "Já existe um ativo com este código." })).toBeNull();
    expect(detalheDaBase({ message: "ATV18", details: "" })).toBeNull();
    expect(detalheDaBase({ message: "ATV18" })).toBeNull();
  });
  it("só estes erros pedem que a lista se refaça (concorrência): ATV14, ATV15, ATV17, ATV18", () => {
    expect(["ATV14", "ATV15", "ATV17", "ATV18", "ATV12", "ATV03"].filter((c) => refazListaAposErro({ message: c }))).toEqual(["ATV14", "ATV15", "ATV17", "ATV18"]);
  });
  it("classifica a RPC por aplicar, a recusa e o resto", () => {
    expect(ativosIndisponivel({ code: "PGRST202" })).toBe(true);
    expect(ativosIndisponivel({ message: "Could not find the function public.rpc_ativos_listar(...)" })).toBe(true);
    expect(ativosRecusado({ code: "42501" })).toBe(true);
    expect(ativosRecusado({ message: "permission denied for table ativo" })).toBe(true);
    expect(chaveDoErro({ message: "ATV17" })).toBe("ativos.erro.ATV17");
    expect(chaveDoErro({ code: "42501" })).toBe("ativos.erro.semPermissao");
    expect(chaveDoErro({ code: "XX000", message: "boom" })).toBe("ativos.erro.generico");
  });
});
