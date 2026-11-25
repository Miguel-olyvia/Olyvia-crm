// As regras do formulário de ativos no ecrã, as mesmas da base (rpc_ativo_criar): datas de 2000-01-01 a hoje + 10 anos, euros até
// 9 999 999 999,99, vida de 1 a 600 meses, e os argumentos `p_*` que seguem para a RPC. Também os erros (ATVnn) e o seu campo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campoDoCodigo, campoDoErro, chaveDoErro, codigoAtv, ativosIndisponivel, ativosRecusado, detalheDaBase, refazListaAposErro } from "./errosAtivo";
import { argumentosDoAtivo, dataMaximaAtivo, dataValida, numeroDoCampo, validarAtivo, type CamposAtivo } from "./validarAtivo";

const BOM: CamposAtivo = {
  grupo: "estrutura", nome: " Mesa ", tipo: "mobiliario", catEquipamentoId: "", codigo: "", numSerie: "", dataCompra: "2026-03-01",
  valorCompra: "1 234,567", valorResidual: "", vidaMeses: "12", manutencaoAno: "", centroCustoId: "", localizacao: "", notas: "",
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
