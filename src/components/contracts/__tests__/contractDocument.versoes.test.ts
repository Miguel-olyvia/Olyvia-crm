import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildContractPrintHtml, resolveContractDocument } from "../contractDocument";
import { comporCorpoDoContrato, numberToEnglishWords, tDoc } from "@/lib/idiomaDocumento";
import { estadoFalso, reporEstadoFalso } from "./fakeSupabase";

vi.mock("@/integrations/supabase/client", async () => {
  const { makeFakeSupabase } = await import("./fakeSupabase");
  return { supabase: makeFakeSupabase() };
});

const LINHA = `<div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>`;
const COLUNA = (rotulo: string) => `<div style="flex:1;text-align:center;">${LINHA}<p><strong>${rotulo}</strong></p></div>`;
const BLOCO_PT = `<div style="margin-top:40px;"><div style="display:flex;gap:60px;">${COLUNA("A MUDELAR, LDA.")}${COLUNA("O CLIENTE")}</div></div>`;
const BLOCO_EN = `<div style="margin-top:40px;"><div style="display:flex;gap:60px;">${COLUNA("MUDELAR, LDA. (THE COMPANY)")}${COLUNA("THE CLIENT")}</div></div>`;

const CORPO_PT = `<h2>CONTRATO</h2><p>Cliente {{cliente_nome}}: {{contrato_valor}} ({{contrato_valor_extenso}}), desde {{contrato_data_inicio}}, {{contrato_duracao}}.</p><p>{{tabela_artigos}}</p>${BLOCO_PT}`;
const CORPO_EN = `<h2>SERVICES AGREEMENT</h2><p>Client {{cliente_nome}}: {{contrato_valor}} ({{contrato_valor_extenso}}), since {{contrato_data_inicio}}, {{contrato_duracao}}.</p><p>{{tabela_artigos}}</p>${BLOCO_EN}`;

const DOC_SETTINGS_BASE = {
  show_quote_items: true,
  quote_items_title: "Artigos do Orçamento",
  footer_text: "Rodapé português",
  header_style: "split",
  contract_block_title: "CONTRATO PT",
  versions: {
    en: {
      body_html: CORPO_EN,
      header: { contract_block_title: null, contract_block_subtitle: null, contract_block_number_label: "CONTRACT No.", contract_block_date_label: null, contract_block_commercial_label: null },
      footer_text: "English footer",
      quote_items_title: "Quote items",
    },
  },
};

const TEMPLATE_COM_VERSOES = { language: "pt", body_html: CORPO_PT, doc_settings: DOC_SETTINGS_BASE };
const CORPO_PT_EN = comporCorpoDoContrato(TEMPLATE_COM_VERSOES, "pt+en");

const ASSINADO = {
  status: "signed",
  company_signature_date: "2026-08-05T09:00:00.000Z", company_signed_by_name: "Ricardo Belchior",
  signature_date: "2026-08-06T20:15:00.000Z", signed_by_name: "Cliente Teste", signature_ip: "185.128.9.205",
};

function contrato(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "c-1", contract_number: "CC-2026-0003", total_value: 392.37,
    start_date: "2026-03-13T12:00:00.000Z", end_date: "2027-03-13T12:00:00.000Z", created_at: "2026-03-13T12:00:00.000Z",
    entity_id: "e-1", quote_id: "q-1", status: "draft",
    contract_body_html: CORPO_PT_EN,
    prompt_values: { __idiomas: "pt+en" },
    template_snapshot: TEMPLATE_COM_VERSOES,
    ...extra,
  };
}

function remoto(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    anew_organizations: { name: "Mudelar Teste", entity_id: null, metadata: {}, phone: null },
    organization_document_settings: { organization_id: "o-1", primary_color: "#112233", footer_text: "Rodapé da organização", contract_block_title: "ORG" },
    anew_entities: { display_name: "Cliente Teste, Lda." },
    quotes: { total: 392.37, desconto_global_percent: 0 },
    quote_lines: [{ descricao_snapshot: "Remodelação", qt: "1", unidade: "vg", total_com_desconto: 392.37 }],
    ...extra,
  };
}

async function resolver(c: Record<string, unknown>, tabelas = remoto()) {
  reporEstadoFalso(tabelas);
  const r = await resolveContractDocument(c, "o-1", "Empresa");
  if (!r) throw new Error("sem documento");
  return r;
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-13T12:00:00.000Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => reporEstadoFalso());

describe("resolveContractDocument — uma só versão (português)", () => {
  it("devolve uma versão pt com o mesmo corpo e as mesmas definições", async () => {
    const r = await resolver(contrato({ contract_body_html: CORPO_PT, prompt_values: null, template_snapshot: null }));
    expect(r.versoes).toHaveLength(1);
    expect(r.versoes[0].codigo).toBe("pt");
    expect(r.versoes[0].bodyHtml).toBe(r.bodyHtml);
    expect(r.versoes[0].settings).toBe(r.settings);
  });

  it("um corpo sem marcas com __idiomas de um só idioma usa esse idioma na versão", async () => {
    const r = await resolver(contrato({ contract_body_html: CORPO_PT, prompt_values: { __idiomas: "en" }, template_snapshot: null }));
    expect(r.versoes.map((v) => v.codigo)).toEqual(["en"]);
    expect(r.versoes[0].bodyHtml).toContain("March 2026");
  });

  it("um corpo sem marcas com «pt+en» (nada para dividir) fica uma versão portuguesa", async () => {
    const r = await resolver(contrato({ contract_body_html: CORPO_PT, template_snapshot: null }));
    expect(r.versoes.map((v) => v.codigo)).toEqual(["pt"]);
  });
});

describe("resolveContractDocument — português e inglês", () => {
  it("divide pelas marcas do corpo, sem wrappers nas versões", async () => {
    const r = await resolver(contrato());
    expect(r.versoes.map((v) => v.codigo)).toEqual(["pt", "en"]);
    for (const v of r.versoes) expect(v.bodyHtml).not.toContain("olv-versao");
    expect(r.versoes[0].bodyHtml).toContain("CONTRATO");
    expect(r.versoes[1].bodyHtml).toContain("SERVICES AGREEMENT");
  });

  it("as marcas do corpo mandam sobre __idiomas", async () => {
    const r = await resolver(contrato({ prompt_values: { __idiomas: "pt" } }));
    expect(r.versoes.map((v) => v.codigo)).toEqual(["pt", "en"]);
    const soEn = await resolver(contrato({ contract_body_html: comporCorpoDoContrato(TEMPLATE_COM_VERSOES, "en"), prompt_values: { __idiomas: "pt" } }));
    expect(soEn.versoes.map((v) => v.codigo)).toEqual(["en"]);
  });

  it("o bodyHtml junto continua a trazer as duas versões (consumidores antigos), com a quebra de página na segunda", async () => {
    const r = await resolver(contrato());
    expect(r.bodyHtml).toContain("olv-versao-pt");
    expect(r.bodyHtml).toContain("olv-versao-en");
    expect(r.bodyHtml).toMatch(/olv-versao-en"[^>]*break-before:page/);
    expect(r.bodyHtml).not.toMatch(/olv-versao-pt"[^>]*break-before/);
  });

  it("substitui as variáveis por segmento, com o idioma do wrapper; o dinheiro não muda", async () => {
    const r = await resolver(contrato());
    const [pt, en] = r.versoes;
    expect(pt.bodyHtml).toContain("13 de Março de 2026");
    expect(pt.bodyHtml).toContain("12 meses");
    expect(pt.bodyHtml).toContain("trezentos e noventa e dois euros");
    expect(en.bodyHtml).toContain("13 March 2026");
    expect(en.bodyHtml).toContain("12 months");
    expect(en.bodyHtml).toContain(numberToEnglishWords(392.37));
    expect(pt.bodyHtml).toContain("€392,37");
    expect(en.bodyHtml).toContain("€392,37");
    expect(pt.bodyHtml).not.toContain("{{");
    expect(en.bodyHtml).not.toContain("{{");
  });

  it("a tabela de artigos usa o título e as palavras de cada versão", async () => {
    const r = await resolver(contrato());
    const [pt, en] = r.versoes;
    expect(pt.bodyHtml).toContain("Artigos do Orçamento");
    expect(pt.bodyHtml).toContain(tDoc("pt", "doc.tabela.precoUnit"));
    expect(en.bodyHtml).toContain("Quote items");
    expect(en.bodyHtml).toContain(tDoc("en", "doc.tabela.precoUnit"));
    expect(en.bodyHtml).not.toContain("Preço Unit.");
  });

  it("as definições de cada versão sobrepõem o cabeçalho e o rodapé às da base", async () => {
    const r = await resolver(contrato());
    const [pt, en] = r.versoes;
    expect(pt.settings).toBe(r.settings);
    expect(pt.settings.footer_text).toBe("Rodapé português");
    expect((pt.settings as any).contract_block_title).toBe("CONTRATO PT");
    expect(en.settings.footer_text).toBe("English footer");
    expect((en.settings as any).contract_block_title).toBeNull();
    expect((en.settings as any).contract_block_number_label).toBe("CONTRACT No.");
    // o que não é da versão vem da base
    expect(en.settings.primary_color).toBe(pt.settings.primary_color);
    expect(en.settings.organization_id).toBe("o-1");
  });

  it("sem versão no modelo, o inglês usa as definições da base", async () => {
    const r = await resolver(contrato({ template_snapshot: { language: "pt", body_html: CORPO_PT, doc_settings: { footer_text: "Só base" } } }));
    expect(r.versoes[1].codigo).toBe("en");
    expect(r.versoes[1].settings).toBe(r.settings);
  });

  it("a assinatura é uma só: o bloco só está na última versão e o carimbo sai nos dois idiomas", async () => {
    const r = await resolver(contrato(ASSINADO));
    const [pt, en] = r.versoes;
    expect(pt.bodyHtml).not.toContain("border-bottom");
    expect(en.bodyHtml).toContain("Assinado via SMS OTP / Signed via SMS OTP");
    expect(en.bodyHtml).toContain("Ricardo Belchior");
    // Ramo RH: a empresa também assina com o selo OTP (não em letra manuscrita), por isso o bloco único tem
    // exatamente dois carimbos (empresa e cliente), ambos nos dois idiomas, e nenhum noutra versão.
    expect(r.bodyHtml.match(/Brush Script/g)).toBeNull();
    expect(r.bodyHtml.match(/Assinado via SMS OTP \/ Signed via SMS OTP/g)).toHaveLength(2);
    expect(pt.bodyHtml).not.toContain("Assinado via SMS OTP");
  });

  it("o contrato assinado é congelado COM os wrappers (a cópia guarda as versões)", async () => {
    const r = await resolver(contrato(ASSINADO));
    await Promise.resolve();
    await Promise.resolve();
    expect(estadoFalso.updates).toHaveLength(1);
    const congelado = (estadoFalso.updates[0].payload as { contract_body_frozen_html: string }).contract_body_frozen_html;
    expect(congelado).toBe(r.bodyHtml);
    expect(congelado).toContain("olv-versao-en");
  });
});

describe("resolveContractDocument — contrato congelado", () => {
  const CONGELADO = `<div class="olv-versao olv-versao-pt"><p>Valor {{contrato_valor}} fica como está.</p></div>\n<div class="olv-versao olv-versao-en" style="break-before:page;page-break-before:always"><p>Value {{contrato_valor}} stays as is.</p></div>`;

  it("divide pelas marcas, sem recalcular nada nem voltar a gravar", async () => {
    const r = await resolver(contrato({ ...ASSINADO, contract_body_frozen_html: CONGELADO }));
    expect(r.bodyHtml).toBe(CONGELADO);
    expect(r.versoes.map((v) => v.codigo)).toEqual(["pt", "en"]);
    expect(r.versoes[0].bodyHtml).toBe("<p>Valor {{contrato_valor}} fica como está.</p>");
    expect(r.versoes[1].bodyHtml).toBe("<p>Value {{contrato_valor}} stays as is.</p>");
    expect(r.versoes[1].settings.footer_text).toBe("English footer");
    await Promise.resolve();
    expect(estadoFalso.updates).toHaveLength(0);
  });

  it("um congelado antigo, sem marcas, é uma só versão portuguesa tal e qual", async () => {
    const r = await resolver(contrato({ ...ASSINADO, contract_body_frozen_html: "<p>cópia antiga {{x}}</p>" }));
    expect(r.bodyHtml).toBe("<p>cópia antiga {{x}}</p>");
    expect(r.versoes).toHaveLength(1);
    expect(r.versoes[0]).toMatchObject({ codigo: "pt", bodyHtml: "<p>cópia antiga {{x}}</p>" });
  });
});

describe("buildContractPrintHtml — uma página por versão", () => {
  async function documento() {
    return resolver(contrato());
  }
  const paginas = (html: string) => Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll(".page"));

  it("gera uma .page por versão, cada uma com o seu corpo", async () => {
    const html = buildContractPrintHtml(await documento() as never, "Contrato");
    const [p1, p2] = paginas(html);
    expect(paginas(html)).toHaveLength(2);
    expect(p1.querySelector(".content")?.textContent).toContain("CONTRATO");
    expect(p1.querySelector(".content")?.textContent).not.toContain("SERVICES AGREEMENT");
    expect(p2.querySelector(".content")?.textContent).toContain("SERVICES AGREEMENT");
    expect(html).not.toContain("olv-versao");
  });

  it("o cabeçalho de cada página está no seu idioma (rótulo do modelo manda; sem ele, o dicionário)", async () => {
    const html = buildContractPrintHtml(await documento() as never, "Contrato");
    const [p1, p2] = paginas(html);
    expect(p1.textContent).toContain("CONTRATO PT");
    expect(p2.textContent).toContain("CONTRACT No.");
    expect(p2.textContent).toContain(tDoc("en", "doc.cabecalho.titulo"));
    expect(p2.textContent).not.toContain("CONTRATO PT");
  });

  it("cada página leva o rodapé da sua versão, e as seguintes começam em página nova", async () => {
    const html = buildContractPrintHtml(await documento() as never, "Contrato");
    const [p1, p2] = paginas(html);
    expect(p1.querySelector(".footer")?.textContent).toBe("Rodapé português");
    expect(p2.querySelector(".footer")?.textContent).toBe("English footer");
    expect(p1.getAttribute("style") ?? "").not.toContain("break-before");
    expect(p2.getAttribute("style")).toContain("break-before:page");
  });

  it("sem `versoes` (um documento montado à mão) continua a imprimir uma só página com o bodyHtml", () => {
    const doc = {
      bodyHtml: "<p>Corpo antigo</p>", variableData: {}, organization: null, settings: { footer_text: "R" },
      companyName: "", headerLineOne: "", headerLineTwo: "", pageWidth: "210mm", pageHeight: "297mm", pageCssSize: "A4 portrait",
    };
    const html = buildContractPrintHtml(doc as never, "T");
    expect(paginas(html)).toHaveLength(1);
    expect(html).toContain("Corpo antigo");
  });
});

describe("as definições da versão mandam sobre extra_settings do modelo (M6)", () => {
  const COM_EXTRA = {
    language: "pt",
    body_html: CORPO_PT,
    doc_settings: {
      ...DOC_SETTINGS_BASE,
      extra_settings: { footer_text: "Extra PT", contract_block_title: "EXTRA PT", contract_block_subtitle: "www.pt", contract_block_number_label: "N.º PT" },
    },
  };

  it("o rodapé, o título, o subtítulo e os rótulos do inglês não são anulados pelo extra_settings português", async () => {
    const r = await resolver(contrato({ template_snapshot: COM_EXTRA }));
    const [pt, en] = r.versoes;
    expect(en.settings.footer_text).toBe("English footer");
    expect((en.settings as any).contract_block_title).toBeNull();
    expect((en.settings as any).contract_block_subtitle).toBeNull();
    expect((en.settings as any).contract_block_number_label).toBe("CONTRACT No.");
    // o português fica como hoje: o extra_settings por cima das colunas
    expect(pt.settings.footer_text).toBe("Extra PT");
    expect((pt.settings as any).contract_block_title).toBe("EXTRA PT");
    expect((pt.settings as any).contract_block_subtitle).toBe("www.pt");
  });

  it("a versão sem rodapé próprio herda o do base, também quando o base o tem no extra_settings", async () => {
    const t = JSON.parse(JSON.stringify(COM_EXTRA));
    delete t.doc_settings.versions.en.footer_text;
    const r = await resolver(contrato({ template_snapshot: t }));
    expect(r.versoes[1].settings.footer_text).toBe("Extra PT");
  });
});

describe("versão vazia (corpo base em branco)", () => {
  it("uma versão em branco não gera uma página só com cabeçalho", async () => {
    const corpo = `<div class="olv-versao olv-versao-pt"></div>\n<div class="olv-versao olv-versao-en" style="break-before:page;page-break-before:always">${CORPO_EN}</div>`;
    const r = await resolver(contrato({ contract_body_html: corpo }));
    expect(r.versoes.map((v) => v.codigo)).toEqual(["en"]);
    const html = buildContractPrintHtml(r as never, "T");
    expect(new DOMParser().parseFromString(html, "text/html").querySelectorAll("body > .page")).toHaveLength(1);
  });
});
