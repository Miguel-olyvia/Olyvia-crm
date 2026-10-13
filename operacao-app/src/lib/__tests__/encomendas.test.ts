import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ supabase: { rpc: vi.fn() } }));

import {
  acoesEncomenda,
  agruparPorTipo,
  bloqueioAprovar,
  formatarQtd,
  linhaDeCompra,
  mensagemDeErro,
  normalizarEncomenda,
  porqueFornecedor,
  problemasProduto,
  resumoEncomenda,
  rpcEmFalta,
  type LinhaEncomenda,
} from "../encomendas";

const linha = (p: Partial<LinhaEncomenda>): LinhaEncomenda => ({
  id: "l",
  tipo: "produto",
  product_id: "p",
  service_id: null,
  equipamento_id: null,
  skill_id: null,
  descricao: "Torneira",
  unidade: "un",
  qtd_necessaria: 1,
  qtd_stock: 0,
  qtd_em_encomenda: 0,
  qtd_em_falta: 0,
  origem: "orcamento",
  quote_id: null,
  quote_line_id: null,
  supplier_id: "s",
  fornecedor_nome: "Leroy",
  fornecedor_origem: "preferido",
  fornecedor_mudado: false,
  preco_compra: null,
  prazo_dias: null,
  gere_stock: null,
  servico_nome: null,
  ...p,
});

describe("porqueFornecedor", () => {
  it("explica cada origem", () => {
    expect(porqueFornecedor(linha({ fornecedor_origem: "preferido" }))).toBe("fornecedor preferido");
    expect(porqueFornecedor(linha({ fornecedor_origem: "linha_orcamento" }))).toMatch(/^sem fornecedor preferido — o escolhido na linha/);
    expect(porqueFornecedor(linha({ fornecedor_origem: "produto" }))).toMatch(/ficha do produto/);
    expect(porqueFornecedor(linha({ fornecedor_origem: "marca" }))).toMatch(/marca/);
    expect(porqueFornecedor(linha({ fornecedor_origem: "nenhum", supplier_id: null }))).toBe(
      "sem fornecedor preferido nem marca ligada"
    );
  });
  it("a escolha à mão manda sobre a origem", () => {
    expect(porqueFornecedor(linha({ fornecedor_origem: "nenhum", fornecedor_mudado: true }))).toBe("escolhido à mão");
  });
  it("equipamentos, mão de obra e linhas sem produto não têm fornecedor", () => {
    expect(porqueFornecedor(linha({ tipo: "equipamento", product_id: null }))).toBeNull();
    expect(porqueFornecedor(linha({ tipo: "mao_obra", product_id: null }))).toBeNull();
    expect(porqueFornecedor(linha({ tipo: "consumivel", product_id: null }))).toBeNull();
  });
});

describe("agruparPorTipo", () => {
  it("ordena produtos → consumíveis → equipamentos → mão de obra e tira os vazios", () => {
    const g = agruparPorTipo([
      linha({ id: "m", tipo: "mao_obra" }),
      linha({ id: "c", tipo: "consumivel" }),
      linha({ id: "p1", tipo: "produto" }),
      linha({ id: "p2", tipo: "produto" }),
    ]);
    expect(g.map((x) => x.tipo)).toEqual(["produto", "consumivel", "mao_obra"]);
    expect(g[0].linhas.map((l) => l.id)).toEqual(["p1", "p2"]);
  });
});

describe("resumoEncomenda", () => {
  it("conta faltas e sem fornecedor só nas linhas de compra", () => {
    const r = resumoEncomenda([
      linha({ qtd_em_falta: 2 }),
      linha({ qtd_em_falta: 0, supplier_id: null }),
      linha({ tipo: "mao_obra", product_id: null, qtd_em_falta: 0, supplier_id: null }),
    ]);
    expect(r).toEqual({ linhas: 3, emFalta: 1, semFornecedor: 1, cobertas: 1 });
    expect(linhaDeCompra(linha({ tipo: "equipamento" }))).toBe(false);
  });
});

describe("acoesEncomenda", () => {
  const base = {
    contrato: { id: "c", numero: "CC-1", estado: "signed", assinado: true },
    pode: { editar: true, validar: true, aprovar: false, mudar_fornecedor: false },
    linhas: [linha({})],
  };
  it("sem encomenda: só gerar", () => {
    expect(acoesEncomenda({ ...base, encomenda: null })).toEqual({
      gerar: true,
      validar: false,
      reabrir: false,
      editarLinhas: false,
    });
  });
  it("rascunho: gerar e validar; validada: gerar (diferença) e reabrir", () => {
    const enc = (estado: "rascunho" | "validada") =>
      ({ id: "e", estado, fornecedor_estado: "por_gerar", obra_id: null, versao: 0, validada_em: null,
         validada_por_nome: null, gerada_em: null, reaberta_em: null, reaberta_motivo: null }) as const;
    expect(acoesEncomenda({ ...base, encomenda: enc("rascunho") })).toMatchObject({ gerar: true, validar: true, reabrir: false });
    expect(acoesEncomenda({ ...base, encomenda: enc("validada") })).toMatchObject({ gerar: true, validar: false, reabrir: true });
    expect(acoesEncomenda({ ...base, linhas: [], encomenda: enc("rascunho") }).validar).toBe(false);
  });
  it("contrato por assinar ou sem permissões: nada", () => {
    expect(acoesEncomenda({ ...base, contrato: { ...base.contrato, assinado: false }, encomenda: null }).gerar).toBe(false);
    const sem = acoesEncomenda({
      ...base,
      pode: { editar: false, validar: false, aprovar: false, mudar_fornecedor: false },
      encomenda: null,
    });
    expect(Object.values(sem).some(Boolean)).toBe(false);
  });
});

describe("bloqueioAprovar", () => {
  it("sem fornecedor não se aprova", () => {
    expect(bloqueioAprovar({ estado: "proposta", supplier_id: null, linhas: [{} as never] })).toMatch(/Escolha o fornecedor/);
    expect(bloqueioAprovar({ estado: "aprovada", supplier_id: "s", linhas: [{} as never] })).toMatch(/já não está/);
    expect(bloqueioAprovar({ estado: "proposta", supplier_id: "s", linhas: [] })).toMatch(/não tem linhas/);
    expect(bloqueioAprovar({ estado: "proposta", supplier_id: "s", linhas: [{} as never] })).toBeNull();
  });
});

describe("normalizarEncomenda", () => {
  it("lê o JSON do rpc_ec_obter (números em texto, nulos)", () => {
    const e = normalizarEncomenda({
      contrato: { id: "c", numero: "CC-1", estado: "signed", assinado: true },
      pode: { editar: true },
      encomenda: { id: "e", estado: "validada", fornecedor_estado: "parcial", versao: "2" },
      linhas: [{ id: "l", tipo: "consumivel", qtd_necessaria: "1.5", qtd_em_falta: "0.5", preco_compra: null }],
      notas: [{ id: "n", estado: "proposta", total: "9.68", linhas: [{ id: "nl", product_id: "p", qtd: "2" }] }],
      fornecedores: null,
    });
    expect(e.pode).toEqual({ editar: true, validar: false, aprovar: false, mudar_fornecedor: false });
    expect(e.encomenda?.versao).toBe(2);
    expect(e.linhas[0]).toMatchObject({ qtd_necessaria: 1.5, qtd_em_falta: 0.5, preco_compra: null, fornecedor_origem: "nenhum" });
    expect(e.notas[0].total).toBeCloseTo(9.68);
    expect(e.notas[0].linhas[0].qtd).toBe(2);
    expect(e.fornecedores).toEqual([]);
  });
  it("sem encomenda devolve encomenda null", () => {
    expect(normalizarEncomenda({ contrato: {}, pode: {}, encomenda: null }).encomenda).toBeNull();
  });
});

describe("problemasProduto", () => {
  it("diz por onde se encomenda quando não há preferido", () => {
    const p = {
      product_id: "p", nome: "Lavatório", sku: null, marca: "Roca", contratos: 1, tem_preferido: false,
      tem_preco: false, gere_stock: false, resolvido_id: "s", resolvido_nome: "Roca", resolvido_origem: "marca" as const,
    };
    expect(problemasProduto(p)).toEqual([
      "sem fornecedor preferido (encomenda-se a Roca pela marca)",
      "sem preço de compra",
      "não gere stock",
    ]);
    expect(problemasProduto({ ...p, resolvido_id: null, tem_preco: true, gere_stock: true })).toEqual(["sem fornecedor"]);
  });
});

describe("utilitários", () => {
  it("mensagens e RPC em falta", () => {
    expect(mensagemDeErro(new Error("ERROR: Escolha o fornecedor antes de aprovar."))).toBe("Escolha o fornecedor antes de aprovar.");
    expect(rpcEmFalta({ message: "Could not find the function public.rpc_ec_obter", code: "PGRST202" })).toBe(true);
    expect(rpcEmFalta({ message: "Sem permissão", code: "42501" })).toBe(false);
    expect(formatarQtd(1.5)).toBe("1,5");
    expect(formatarQtd(3)).toBe("3");
    expect(formatarQtd(null)).toBe("—");
  });
});
