// A linha de `rpc_hr_equipamentos_listar` como o ecrã a usa: o ativo (comprado ou alugado), o ativo_id e o conta_desde entram no
// equipamento; a farda e as linhas sem ativo ficam como estavam. E os argumentos que o ecrã manda a rpc_hr_equipamento_atribuir.
import { describe, expect, it } from "vitest";
import { argumentosDeAtribuir, argumentosDeCorrecao, equipamentoDaLinha, type LinhaEquipamento } from "@/lib/hr/custoBase";
import { valorDoEquipamentoNoMes, type NovoEquipamentoBase } from "@/components/rh-exemplo/lib/equipamentos";

const HOJE = "2030-06-15";

const linhaBase: LinhaEquipamento = {
  id: "e1", pessoa_id: "p1", tipo: "portatil", descricao: "Portátil 14", valor: 1200, entrega: "2027-01-10",
  conta_modo: "repartido", conta_meses: 36, conta_inicio: null, conta_fim: null, estado: "atribuido", devolucao: null, estado_devolucao: null,
};

const ativoComprado = {
  codigo: "PC-0001", nome: "Portátil 14", tipo: "portatil", forma_aquisicao: "comprado", valor_compra: 1200, valor_residual: 0,
  data_compra: "2027-01-05", vida_meses: 36, vida_origem: "pagamento", estado: "ativo", desativado_em: null,
};
const ativoAlugado = {
  codigo: "VIA-0001", nome: "Viatura", tipo: "viatura", forma_aquisicao: "alugado", renda_mensal: 450, inicio_aluguer: "2026-01-01",
  fim_aluguer: "2029-12-31", estado: "ativo", desativado_em: null,
};

describe("equipamentoDaLinha: linhas sem ativo", () => {
  it("a farda (sem ativo) fica como hoje e não ganha ativo", () => {
    const e = equipamentoDaLinha({ ...linhaBase, tipo: "fardamento", conta_modo: "umaVez", conta_meses: null, ativo_id: null, ativo: null });
    expect(e.ativo ?? null).toBeNull();
    expect(e.ativoId ?? null).toBeNull();
    expect(e.conta).toEqual({ modo: "umaVez", meses: 1, inicio: null, fim: null });
    expect(e.contaDesde).toBe("2027-01-10");
  });

  it("uma linha das chaves antigas (sem ativo_id nem ativo nem conta_desde) continua a ler", () => {
    const e = equipamentoDaLinha(linhaBase);
    expect(e.valor).toBe(1200);
    expect(e.ativo ?? null).toBeNull();
    expect(e.contaDesde).toBe("2027-01-10");
  });
});

describe("equipamentoDaLinha: linhas com ativo", () => {
  it("comprado: guarda ativo, ativo_id e conta_desde, com os campos em camelCase", () => {
    const e = equipamentoDaLinha({ ...linhaBase, ativo_id: "at-1", ativo: ativoComprado, conta_desde: "2027-01-11" });
    expect(e.ativoId).toBe("at-1");
    expect(e.contaDesde).toBe("2027-01-11");
    expect(e.ativo).toEqual({
      forma: "comprado", codigo: "PC-0001", nome: "Portátil 14", tipo: "portatil", estado: "ativo", valorCompra: 1200, valorResidual: 0,
      dataCompra: "2027-01-05", vidaMeses: 36, vidaOrigem: "pagamento", desativadoEm: null,
    });
  });

  it("alugado: renda, início e fim; o valor mostrado é a renda", () => {
    const e = equipamentoDaLinha({ ...linhaBase, tipo: "viatura", valor: 450, conta_modo: "todosMeses", conta_meses: null, entrega: "2026-01-01", ativo_id: "at-2", ativo: ativoAlugado, conta_desde: "2026-01-01" });
    expect(e.ativo).toEqual({
      forma: "alugado", codigo: "VIA-0001", nome: "Viatura", tipo: "viatura", estado: "ativo", rendaMensal: 450, inicioAluguer: "2026-01-01",
      fimAluguer: "2029-12-31", desativadoEm: null,
    });
    expect(e.valor).toBe(450);
  });

  it("os valores nulos da linha (a base já não guarda cópia) vêm do ativo, e o valor do mês vem do ativo", () => {
    const e = equipamentoDaLinha({ ...linhaBase, tipo: null, descricao: null, valor: null, conta_modo: null, conta_meses: null, ativo_id: "at-1", ativo: ativoComprado });
    expect(e.tipo).toBe("portatil");
    expect(e.descricao).toBe("Portátil 14");
    expect(e.valor).toBe(1200);
    expect(valorDoEquipamentoNoMes(e, "2027-03", HOJE)).toBe(33.33);
  });

  it("com ativo, a conta antiga da linha (todos os meses) não conta: manda o ativo", () => {
    const e = equipamentoDaLinha({ ...linhaBase, valor: 1200, conta_modo: "todosMeses", conta_meses: null, conta_inicio: "2027-01-01", ativo_id: "at-1", ativo: ativoComprado });
    // «todos os meses» de 1 200 € daria 1 200 € por mês; pelo ativo é a quota de 33,33 €.
    expect(valorDoEquipamentoNoMes(e, "2027-02", HOJE)).toBe(33.33);
  });

  it("um ativo mal formado (sem valor de compra nem renda) é ignorado em vez de partir o ecrã", () => {
    const e = equipamentoDaLinha({ ...linhaBase, ativo_id: "at-9", ativo: { codigo: "X", nome: "X", forma_aquisicao: "comprado", estado: "ativo" } });
    expect(e.ativo ?? null).toBeNull();
    expect(e.valor).toBe(1200);
  });
});

describe("argumentosDeAtribuir: o que o ecrã manda a rpc_hr_equipamento_atribuir", () => {
  const ORG = "org-1";
  const comum = { pessoaId: "p1", descricao: "  Portátil 14 ", entrega: "2027-01-10", idPedido: "id-1" };
  const args = (novo: NovoEquipamentoBase) => argumentosDeAtribuir(novo, ORG);

  it("comprado: valor, data de compra e SEMPRE p_vida_meses; sem renda nem datas de aluguer", () => {
    const a = args({ ...comum, tipo: "portatil", forma: "comprado", valor: 1200, dataCompra: "2027-01-05", vidaMeses: 36, vidaOrigem: "pagamento" });
    expect(a).toMatchObject({
      p_pessoa_id: "p1", p_organization_id: "org-1", p_tipo: "portatil", p_descricao: "Portátil 14", p_valor: 1200, p_entrega: "2027-01-10",
      p_forma_aquisicao: "comprado", p_data_compra: "2027-01-05", p_vida_meses: 36, p_vida_origem: "pagamento", p_id: "id-1",
      p_renda_mensal: null, p_inicio_aluguer: null, p_fim_aluguer: null, p_ativo_id: null, p_cat_equipamento_id: null,
    });
    expect(a).toHaveProperty("p_vida_meses");
    expect(a).not.toHaveProperty("p_conta_modo");
  });

  it("comprado sem data de compra manda p_data_compra nulo (a base usa a entrega)", () => {
    const a = args({ ...comum, tipo: "portatil", forma: "comprado", valor: 1200, dataCompra: null, vidaMeses: 36, vidaOrigem: "manual" });
    expect(a.p_data_compra).toBeNull();
  });

  it("comprado com a vida do catálogo: manda a vida calculada e o equipamento do catálogo", () => {
    const a = args({ ...comum, tipo: "ferramentas", forma: "comprado", valor: 300, dataCompra: "2027-01-05", vidaMeses: 60, vidaOrigem: "catalogo", catEquipamentoId: "cat-1" });
    expect(a).toMatchObject({ p_vida_meses: 60, p_vida_origem: "catalogo", p_cat_equipamento_id: "cat-1" });
  });

  it("alugado: renda, início e fim; sem valor de compra, data de compra nem vida", () => {
    const a = args({ ...comum, tipo: "viatura", forma: "alugado", rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: "2029-12-31" });
    expect(a).toMatchObject({
      p_forma_aquisicao: "alugado", p_renda_mensal: 450, p_valor: 450, p_inicio_aluguer: "2026-01-01", p_fim_aluguer: "2029-12-31",
      p_data_compra: null, p_vida_meses: null, p_vida_origem: null, p_ativo_id: null,
    });
  });

  it("alugado sem fim manda p_fim_aluguer nulo", () => {
    const a = args({ ...comum, tipo: "viatura", forma: "alugado", rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: null });
    expect(a.p_fim_aluguer).toBeNull();
  });

  it("um ativo que já existe e está livre: só p_ativo_id; tipo, descrição, valor e todos os novos NULOS explícitos", () => {
    const a = args({ pessoaId: "p1", entrega: "2027-01-10", idPedido: "id-1", forma: "existente", ativoId: "at-7" });
    expect(a).toEqual({
      p_pessoa_id: "p1", p_organization_id: "org-1", p_entrega: "2027-01-10", p_id: "id-1", p_ativo_id: "at-7",
      p_tipo: null, p_descricao: null, p_valor: null, p_conta_meses: null, p_conta_inicio: null, p_conta_fim: null,
      p_data_compra: null, p_vida_origem: null, p_vida_meses: null, p_cat_equipamento_id: null,
      p_forma_aquisicao: null, p_renda_mensal: null, p_inicio_aluguer: null, p_fim_aluguer: null,
    });
    expect(a).not.toHaveProperty("p_conta_modo");
  });

  it("a farda (e a chamada antiga sem forma) continua como hoje: tipo, descrição, valor e a conta, sem nenhum parâmetro novo", () => {
    const conta = { modo: "umaVez" as const, meses: 1, inicio: null, fim: null };
    const esperado = {
      p_pessoa_id: "p1", p_organization_id: "org-1", p_tipo: "fardamento", p_descricao: "Portátil 14", p_valor: 80, p_entrega: "2027-01-10",
      p_conta_modo: "umaVez", p_conta_meses: null, p_conta_inicio: null, p_conta_fim: null, p_id: "id-1",
    };
    expect(args({ ...comum, tipo: "fardamento", forma: "farda", valor: 80, conta })).toEqual(esperado);
    expect(args({ ...comum, tipo: "fardamento", valor: 80, conta })).toEqual(esperado);
  });
});

describe("argumentosDeCorrecao: o que o ecrã manda a rpc_hr_equipamento_corrigir", () => {
  it("comprado: p_campos só com o que mudou e os valores desses campos; o resto fica fora", () => {
    const a = argumentosDeCorrecao("org-1", "at-1", { campos: ["valor_compra", "vida_meses", "vida_origem"], valorCompra: 1300, vidaMeses: 48, vidaOrigem: "manual" });
    expect(a).toEqual({
      p_ativo_id: "at-1", p_organization_id: "org-1", p_campos: ["valor_compra", "vida_meses", "vida_origem"],
      p_valor_compra: 1300, p_vida_meses: 48, p_vida_origem: "manual",
    });
  });

  it("alugado com o fim limpo: 'fim_aluguer' em p_campos e p_fim_aluguer nulo explícito", () => {
    const a = argumentosDeCorrecao("org-1", "at-2", { campos: ["fim_aluguer"], fimAluguer: null });
    expect(a).toEqual({ p_ativo_id: "at-2", p_organization_id: "org-1", p_campos: ["fim_aluguer"], p_fim_aluguer: null });
  });

  it("datas da entrega: leva a ocupação e só os campos pedidos", () => {
    const a = argumentosDeCorrecao("org-1", "at-1", { campos: ["entrega", "devolucao"], pessoaEquipamentoId: "pe-1", entrega: "2027-01-12", devolucao: "2028-01-10" });
    expect(a).toEqual({
      p_ativo_id: "at-1", p_organization_id: "org-1", p_campos: ["entrega", "devolucao"],
      p_pessoa_equipamento_id: "pe-1", p_entrega: "2027-01-12", p_devolucao: "2028-01-10",
    });
  });
});
