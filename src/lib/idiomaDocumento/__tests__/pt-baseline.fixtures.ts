// Cenários que produzem, em português, as palavras que o contrato escreve hoje (variáveis, tabelas e cabeçalho).
// O resultado de cada um foi capturado do código ORIGINAL, antes de ele ganhar o parâmetro `idioma`
// (ver pt-baseline.ts). Cada cenário recebe o idioma como último argumento: sem ele (undefined) e com "pt"
// tem de sair exatamente o mesmo texto, byte a byte.
import { substituteVariables, SAMPLE_VARIABLE_DATA, type ContractVariableData } from "@/utils/contractVariables";
import { applyDataTableTokens, renderItemsTableModelHtml } from "@/components/contracts/contractDocument";
import { renderContractHeaderHtml } from "@/components/contracts/contractHeader";
import { buildItemsTableModel, type ItemsTableLine } from "@/utils/documentTemplate/buildItemsTableModel";

const DATA_FIXA = "2026-03-13T12:00:00.000Z";

const TODOS_OS_TOKENS = [
  "{{empresa_nome}}", "{{empresa_nif}}", "{{empresa_morada}}",
  "{{cliente_nome}}", "{{cliente_nif}}", "{{cliente_morada}}", "{{cliente_email}}", "{{cliente_telefone}}", "{{cliente_localidade}}",
  "{{comercial_nome}}", "{{comercial_email}}", "{{comercial_telefone}}",
  "{{contrato_numero}}", "{{contrato_valor}}", "{{contrato_valor_extenso}}",
  "{{contrato_data_inicio}}", "{{contrato_data_fim}}", "{{contrato_duracao}}",
  "{{proposta_numero}}", "{{proposta_valor}}", "{{proposta_data}}", "{{data_atual}}",
  "{{orcamento_itens}}", "{{tabela_artigos}}",
].join(" | ");

const DADOS_COMPLETOS: ContractVariableData = {
  ...SAMPLE_VARIABLE_DATA,
  data_documento: DATA_FIXA,
  contrato_data_inicio: "2026-03-13T12:00:00.000Z",
  contrato_data_fim: "2027-03-13T12:00:00.000Z",
  proposta_data: "2026-02-20T12:00:00.000Z",
};

const VALORES_EXTENSO = [0, 1, 1.01, 2, 21, 99.99, 100, 101, 392.37, 999, 1000, 1001, 1100, 2000.5, 12345.67, 100000, 999999.99, 1000000, 0.5, 0.01];

const PARES_DURACAO: [string, string][] = [
  ["2026-03-13T12:00:00.000Z", "2026-03-13T12:00:00.000Z"],
  ["2026-03-13T12:00:00.000Z", "2026-03-23T12:00:00.000Z"],
  ["2026-03-13T12:00:00.000Z", "2026-04-13T12:00:00.000Z"],
  ["2026-03-13T12:00:00.000Z", "2027-03-13T12:00:00.000Z"],
  ["2026-03-13T12:00:00.000Z", "2026-03-01T12:00:00.000Z"],
];

const ITENS = [
  { descricao: "Remodelação cozinha", qtd: 1, unidade: "vg", valor: 320, preco_unitario: 320, kind: "service" as const },
  { descricao: "Material acabamento", qtd: 2, unidade: "un", valor: 72.37, kind: "product" as const },
  {
    descricao: "Pack banho", qtd: 1, unidade: "vg", valor: 900, kind: "bundle" as const,
    components: [{ descricao: "Base de duche", qtd: 1, unidade: "un" }, { descricao: "Torneira", qtd: 2 }],
  },
  { descricao: "Deslocação", qtd: 1, unidade: "vg", valor: 20, kind: "manual" as const },
];

const CORES = { headerBg: "#7C3AED", headerColor: "#ffffff", borderColor: "#d1d5db", zebra: true, zebraColor: "#f9fafb" };

const OPCOES_TABELA = {
  title: "Artigos do Orçamento",
  showQuantity: true, showUnit: true, showPrice: true, showTotal: true,
  primaryColor: "#7C3AED", columnOrder: undefined, colors: CORES,
};

function linha(descricao: string, qtd: number, preco: number, kind?: ItemsTableLine["kind"]): ItemsTableLine {
  return { description: descricao, quantity: qtd, unit: "un", unit_price: preco, line_total: qtd * preco, kind };
}

const DOIS_ORCAMENTOS = [
  { quoteNumber: "Q-1", lines: [linha("Artigo a", 2, 50), linha("Artigo b", 1, 30)], subtotal: 130 },
  { quoteNumber: "Q-2", lines: [linha("Artigo c", 1, 200)], subtotal: 200 },
];

function chip(tipo: string, config: unknown, fallback: string): string {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
  return `<span data-contract-table="${tipo}" data-config="${b64}">chip</span>${fallback}`;
}

const DEFINICOES_TABELA = { show_quote_items: true, table_zebra: true };

export const CENARIOS: Record<string, (idioma?: string) => string> = {
  "variaveis.todas": (i) => substituteVariables(TODOS_OS_TOKENS, DADOS_COMPLETOS, false, i),
  "variaveis.todas.destaque": (i) => substituteVariables(TODOS_OS_TOKENS, DADOS_COMPLETOS, true, i),
  "variaveis.vazias": (i) => substituteVariables(TODOS_OS_TOKENS, { data_documento: DATA_FIXA }, false, i),
  "variaveis.vazias.destaque": (i) => substituteVariables(TODOS_OS_TOKENS, { data_documento: DATA_FIXA }, true, i),
  "variaveis.so.inicio": (i) =>
    substituteVariables("{{contrato_duracao}} {{contrato_data_inicio}} {{contrato_data_fim}}", { contrato_data_inicio: "2026-03-13T12:00:00.000Z" }, false, i),
  "variaveis.tabela.itens": (i) => substituteVariables("{{orcamento_itens}}", { orcamento_itens: ITENS }, false, i),
  "variaveis.tabela.itens.destaque": (i) => substituteVariables("{{tabela_artigos}}", { orcamento_itens: ITENS }, true, i),
  "variaveis.extenso": (i) =>
    VALORES_EXTENSO.map((v) => substituteVariables("{{contrato_valor_extenso}}", { contrato_valor: v }, false, i)).join("\n"),
  "variaveis.duracao": (i) =>
    PARES_DURACAO.map(([a, b]) => substituteVariables("{{contrato_duracao}}", { contrato_data_inicio: a, contrato_data_fim: b }, false, i)).join("\n"),
  "variaveis.datas.meses": (i) =>
    Array.from({ length: 12 }, (_, m) => `2026-${String(m + 1).padStart(2, "0")}-15T12:00:00.000Z`)
      .map((d) => substituteVariables("{{contrato_data_inicio}}", { contrato_data_inicio: d }, false, i)).join("\n"),
  "variaveis.dinheiro": (i) =>
    substituteVariables("{{contrato_valor}} {{proposta_valor}}", { contrato_valor: 1234567.891, proposta_valor: -45.5 }, false, i),
  "variaveis.personalizada": (i) =>
    substituteVariables("{{foo}} {{bar}} {{contrato_numero}}", { contrato_numero: "CC-1", foo: "valor", bar: 7 } as ContractVariableData, false, i),

  "tabelas.legado": (i) => applyDataTableTokens("<p>{{tabela_artigos}}</p>", { orcamento_itens: ITENS }, DEFINICOES_TABELA, "#7C3AED", true, i),
  "tabelas.legado.titulo": (i) =>
    applyDataTableTokens("<p>{{orcamento_itens}}</p>", { orcamento_itens: ITENS }, { ...DEFINICOES_TABELA, quote_items_title: "Os meus artigos" }, "#112233", true, i),
  "tabelas.legado.fim": (i) => applyDataTableTokens("<p>texto</p>", { orcamento_itens: ITENS }, DEFINICOES_TABELA, "#7C3AED", true, i),
  "tabelas.legado.sem.itens": (i) => applyDataTableTokens("<p>{{orcamento_itens}}</p>", {}, DEFINICOES_TABELA, "#7C3AED", true, i),
  "tabelas.chip": (i) =>
    applyDataTableTokens(chip("quote_items", { showQuantity: false, columnOrder: ["total", "description"] }, "{{orcamento_itens}}"), { orcamento_itens: ITENS }, {}, "#7C3AED", true, i),
  "tabelas.chip.titulo": (i) =>
    applyDataTableTokens(chip("quote_items", { title: "Linhas" }, ""), { orcamento_itens: ITENS }, { quote_items_title: "Ignorado" }, "#7C3AED", true, i),
  "tabelas.chip.componentes": (i) =>
    applyDataTableTokens(chip("quote_items", { showBundleComponents: true }, ""), { orcamento_itens: ITENS }, {}, "#7C3AED", true, i),
  "tabelas.assinantes": (i) =>
    applyDataTableTokens(chip("signatories", { showOrder: true }, "{{tabela_signatarios}}"), { signatarios: SAMPLE_VARIABLE_DATA.signatarios }, {}, "#7C3AED", true, i),
  "tabelas.assinantes.titulo": (i) =>
    applyDataTableTokens(chip("signatories", { title: "Partes", showEmail: false }, ""), { signatarios: SAMPLE_VARIABLE_DATA.signatarios }, { table_header_color: "#00aa00" }, "#7C3AED", true, i),
  "tabelas.modelo.unico": (i) =>
    renderItemsTableModelHtml(buildItemsTableModel({ quotes: [DOIS_ORCAMENTOS[0]] }), OPCOES_TABELA, i),
  "tabelas.modelo.agrupado": (i) =>
    renderItemsTableModelHtml(buildItemsTableModel({ quotes: DOIS_ORCAMENTOS }), OPCOES_TABELA, i),
  "tabelas.modelo.consolidado": (i) =>
    renderItemsTableModelHtml(buildItemsTableModel({ quotes: DOIS_ORCAMENTOS, settings: { mode: "consolidated" } as never }), OPCOES_TABELA, i),
  "tabelas.modelo.consolidado.sem.ref": (i) =>
    renderItemsTableModelHtml(
      buildItemsTableModel({ quotes: DOIS_ORCAMENTOS, settings: { mode: "consolidated", show_quote_ref_column: false } as never }),
      { ...OPCOES_TABELA, title: "" }, i,
    ),

  "cabecalho.simples": (i) =>
    renderContractHeaderHtml(null, { empresa_nome: "Mudelar", empresa_nif: "514234567", empresa_morada: "Rua da Empresa 42", empresa_telefone: "210000000", empresa_email: "geral@mudelar.pt" }, i),
  "cabecalho.simples.website": (i) =>
    renderContractHeaderHtml({ show_website: true, company_website: "www.mudelar.pt", header_layout: "center", logo_url: "https://x/y.png" }, { empresa_nome: "Mudelar", empresa_telefone: "210000000" }, i),
  "cabecalho.split.omissoes": (i) =>
    renderContractHeaderHtml(
      { header_style: "split" },
      { empresa_nome: "Mudelar", empresa_nif: "514234567", empresa_morada: "Rua da Empresa 42", empresa_telefone: "210000000", empresa_email: "geral@mudelar.pt", contrato_numero: "CC-2026-0003", comercial_nome: "Ricardo", data: "2026-03-13" },
      i,
    ),
  "cabecalho.split.personalizado": (i) =>
    renderContractHeaderHtml(
      {
        header_style: "split", primary_color: "#112233", contract_block_title: "CONTRATO DE OBRA", contract_block_subtitle: "www.mudelar.pt",
        contract_block_number_label: "Nº", contract_block_date_label: "Em:", contract_block_commercial_label: "Responsável:", show_website: true, company_website: "www.mudelar.pt",
      },
      { empresa_nome: "Mudelar", empresa_telefone: "210000000", contrato_numero: "CC-9", comercial_nome: "Rita", data: "2026-01-02" },
      i,
    ),
  "cabecalho.split.sem.bloco": (i) =>
    renderContractHeaderHtml({ header_style: "split", contract_block_show: false, contract_block_show_date: false }, { empresa_nome: "Mudelar", data: "2026-03-13" }, i),
  "cabecalho.split.sem.data.nem.comercial": (i) =>
    renderContractHeaderHtml(
      { header_style: "split", contract_block_show_date: false, contract_block_show_commercial: false },
      { empresa_nome: "Mudelar", contrato_numero: "CC-1", data: "2026-03-13" },
      i,
    ),
};
