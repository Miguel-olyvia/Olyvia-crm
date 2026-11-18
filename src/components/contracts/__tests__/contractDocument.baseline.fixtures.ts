// Cenários que produzem, em português, o que o contrato escreve hoje nas assinaturas, no resolver e no HTML de
// impressão. O resultado de cada um foi capturado do código ORIGINAL, antes de ele ganhar idioma por versão
// (ver contractDocument.baseline.ts). Sem idioma (undefined) e com "pt" tem de sair exatamente o mesmo texto.
// O supabase tem de estar simulado pelo ficheiro de teste (vi.mock + fakeSupabase).
import {
  buildContractPrintHtml,
  drawContractPdfFooters,
  hasSignatoryHook,
  injectSignatoryIntoSignatureBlock,
  injectSignaturesIntoBlock,
  resolveContractDocument,
} from "@/components/contracts/contractDocument";
import { estadoFalso, reporEstadoFalso } from "./fakeSupabase";

export const DATA_FIXA = "2026-03-13T12:00:00.000Z";

type Variante = string | undefined;
export type Cenario = (idioma?: Variante) => string | Promise<string>;

/** O carimbo escreve a data com o fuso da máquina: o formato é o que se prova, não a hora. */
function normalizarDataDoCarimbo(texto: string): string {
  return texto.replace(/\d{1,2} de \p{L}+ de \d{4} às \d{2}:\d{2}/gu, "<DATA-HORA-PT>");
}

// ── blocos de assinatura (marcação real das minutas) ────────────────────────────────────────────

export const REAL_BLOCK = `<div style="margin-top:40px;">
  <div style="display:flex;justify-content:space-between;gap:60px;">
    <div style="flex:1;text-align:center;">
      <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
      <p style=""><b><font>A M1D3L4R, REMODELAÇÕES UNIPESSOAL, LDA.</font></b></p><p style=""><font>(A VENDEDORA)</font></p>
    </div>
    <div style="flex:1;text-align:center;">
      <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
      <p style=""><strong><font>O CLIENTE<br></font></strong></p><p style=""><font>(O COMPRADOR)</font></p>
    </div>
  </div>
</div>`;

export const EMPREITA_BLOCK = `<div style="text-align: left;"><font>Pontinha,&nbsp;</font><span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">06/08/2026</span><font><br></font><div style="margin-top:40px;">
      <div style="display:flex;justify-content:space-between;gap:60px;">
        <div style="flex:1;text-align:center;">
          <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
          <p style=""><b><font>A M1D3L4R, REMODELAÇÕES UNIPESSOAL, LDA.</font></b></p>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
          <p style=""><strong><font><font>O CLIENTE</font><br></font></strong></p>
        </div>
      </div>
    </div><font><br></font></div>`;

export const TABLE_UNDERSCORE_BLOCK = `<table style="width:100%;"><tr>
<td style="text-align:center;width:50%;border:none;"><p>_______________________________</p><p><strong>{{empresa_nome}}</strong></p><p>(O Prestador)</p></td>
<td style="text-align:center;width:50%;border:none;"><p>_______________________________</p><p><strong>{{cliente_nome}}</strong></p><p>(O Cliente)</p></td>
</tr></table>`;

/** O bloco plano antigo: uma só etiqueta com as duas partes, precedida de linhas de underscores. */
export const FLAT_BLOCK = `<p>Lisboa, 13 de Março de 2026</p><p>_______________________</p><p>_______________________</p><p>A PRIMEIRA CONTRATANTE&nbsp;&nbsp;&nbsp;&nbsp;O SEGUNDO CONTRATANTE</p>`;

export const TEXTO_INGLES_SOLTO = `<p>Lisboa</p><p>The Client signs here</p><p>The Company shall provide the Services to the Client.</p>`;

export const SEM_BLOCO = `<h2>CONTRATO</h2><p>O CLIENTE obriga-se a pagar o preço acordado no prazo estabelecido na proposta, sem prejuízo do disposto na cláusula anterior e demais legislação aplicável ao presente contrato.</p>`;

const EMPRESA_ASSINOU = { signed: true, name: "Ricardo Belchior", showOtpBadge: false } as const;
const CLIENTE_ASSINOU = {
  signed: true, name: "Daniel Paixão <&> Silva", signedAt: "2026-08-06T20:15:00.000Z", ip: "185.128.9.205", showOtpBadge: true,
} as const;
const NADA = { signed: false } as const;

function assinar(html: string, company: object, client: object, idioma: Variante): string {
  const chamar = injectSignaturesIntoBlock as unknown as (...args: unknown[]) => string;
  const args: unknown[] = [html, company, client];
  if (idioma !== undefined) args.push(idioma);
  return normalizarDataDoCarimbo(chamar(...args));
}

function assinarSignatario(html: string, nome: string | null, cargo: string | null, idioma: Variante): string {
  const chamar = injectSignatoryIntoSignatureBlock as unknown as (...args: unknown[]) => string;
  const args: unknown[] = [html, nome, cargo];
  if (idioma !== undefined) args.push(idioma);
  return chamar(...args);
}

function gancho(html: string | null | undefined, idioma: Variante): boolean {
  const chamar = hasSignatoryHook as unknown as (...args: unknown[]) => boolean;
  return idioma === undefined ? chamar(html) : chamar(html, idioma);
}

const HTML_DOS_GANCHOS: Array<string | null | undefined> = [
  null, undefined, "", "<p>nada</p>",
  '<div data-signatory-block="primary" style="margin-top:32px"></div>',
  "<p>Assina {{signatario_nome}}</p>", "<p>Assina {{ signatario_nome }}</p>",
  "<p>O SEGUNDO CONTRATANTE</p>", "<p>o cliente assina</p>", "<p>O CLIENTELA</p>",
  REAL_BLOCK, FLAT_BLOCK, SEM_BLOCO,
];

// ── contratos para o resolver ───────────────────────────────────────────────────────────────────

const CORPO_COM_VARIAVEIS = `<h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h2><p>Entre {{empresa_nome}} e {{cliente_nome}}, NIF {{cliente_nif}}, morada {{cliente_morada}}.</p><p>Valor: {{contrato_valor}} ({{contrato_valor_extenso}}), com início em {{contrato_data_inicio}} e fim em {{contrato_data_fim}}, duração {{contrato_duracao}}.</p><p>Proposta n.º {{proposta_numero}} de {{data_atual}}.</p><p>{{tabela_artigos}}</p>${REAL_BLOCK}`;

function contratoBase(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "c-1",
    contract_number: "CC-2026-0003",
    total_value: 392.37,
    start_date: "2026-03-13T12:00:00.000Z",
    end_date: "2027-03-13T12:00:00.000Z",
    created_at: DATA_FIXA,
    entity_id: "e-1",
    quote_id: "q-1",
    contract_template_id: "t-1",
    status: "draft",
    contract_body_html: CORPO_COM_VARIAVEIS,
    ...extra,
  };
}

function tabelasDoRemoto(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    anew_organizations: { name: "Mudelar Teste", entity_id: null, metadata: { vat: "514234567", address: "Rua da Empresa 42, Lisboa" }, phone: "210000000", logo_url: "https://exemplo.test/logo.png" },
    organization_document_settings: {
      organization_id: "o-1", primary_color: "#112233", footer_text: "Rodapé da organização", margin_top: 15,
      extra_settings: { company_nif_override: "999888777" },
    },
    client_contract_templates: {
      body_html: "<p>minuta</p>",
      doc_settings: { show_quote_items: true, quote_items_title: "Artigos do Orçamento", footer_text: "Rodapé da minuta" },
    },
    anew_entities: { display_name: "Cliente Teste, Lda.", first_name: null, last_name: null },
    anew_entity_emails: [{ email: "cliente@teste.pt" }],
    anew_entity_phones: [{ phone_number: "912345678" }],
    anew_entity_addresses: [{ is_primary: true, anew_addresses: { street: "Rua A", number: "1", postal_code: "1000-001", city: "Lisboa" } }],
    quotes: { total: 392.37, desconto_global_percent: 0 },
    quote_lines: [
      { descricao_snapshot: "Remodelação cozinha", qt: "1", unidade: "vg", total_com_desconto: 320 },
      { descricao_snapshot: "Material", qt: "2", unidade: "un", total_com_desconto: 72.37 },
    ],
    ...extra,
  };
}

async function resolver(contrato: Record<string, unknown>, tabelas: Record<string, unknown>): Promise<Record<string, unknown>> {
  reporEstadoFalso(tabelas);
  const resolvido = await resolveContractDocument(contrato, "o-1", "Nome da empresa ativa");
  // `versoes` é novo: o que se compara é tudo o que já existia (bodyHtml incluído).
  const { versoes: _versoes, ...resto } = (resolvido ?? { nulo: true }) as Record<string, unknown>;
  return resto;
}

function textoDoResolvido(resolvido: Record<string, unknown>): string {
  return normalizarDataDoCarimbo(JSON.stringify(resolvido, null, 1));
}

const ASSINADO_PELOS_DOIS = {
  status: "signed",
  company_signature_date: "2026-08-05T09:00:00.000Z", company_signed_by_name: "Ricardo Belchior",
  signature_date: "2026-08-06T20:15:00.000Z", signed_by_name: "Cliente Teste", signature_ip: "185.128.9.205",
};

const SNAPSHOT_DA_MINUTA = {
  body_html: `<h2>MINUTA CONGELADA</h2><p>Cliente: {{cliente_nome}}</p>${REAL_BLOCK}`,
  doc_settings: { footer_text: "Rodapé da minuta congelada", primary_color: "#445566", contract_block_title: "CONTRATO", show_quote_items: true },
  signatory_user_id: null,
};

/** Resolve um contrato e guarda o resolvido (para o HTML de impressão) — o mesmo contrato dá o mesmo resolvido. */
async function resolvido(nome: string): Promise<Record<string, unknown>> {
  switch (nome) {
    case "vivo":
      return resolver(contratoBase(), tabelasDoRemoto());
    case "vivo.idiomas-pt":
      return resolver(contratoBase({ prompt_values: { __idiomas: "pt" } }), tabelasDoRemoto());
    case "assinado":
      return resolver(contratoBase(ASSINADO_PELOS_DOIS), tabelasDoRemoto());
    case "congelado":
      return resolver(
        contratoBase({ ...ASSINADO_PELOS_DOIS, contract_body_frozen_html: "<h2>COPIA CONGELADA</h2><p>Valor fixo {{contrato_valor}} por substituir? não.</p>" }),
        tabelasDoRemoto(),
      );
    case "minuta-congelada":
      return resolver(contratoBase({ contract_body_html: null, template_snapshot: SNAPSHOT_DA_MINUTA }), tabelasDoRemoto());
    case "minuta-viva":
      return resolver(
        contratoBase({ contract_body_html: null, contract_template_id: "t-1" }),
        tabelasDoRemoto({ client_contract_templates: { body_html: `<p>Minuta viva para {{cliente_nome}}</p>{{tabela_artigos}}`, doc_settings: { show_quote_items: true, footer_text: "Rodapé minuta viva", page_size: "LETTER", page_orientation: "landscape" } } }),
      );
    case "sem-corpo":
      return resolver(contratoBase({ contract_body_html: null }), tabelasDoRemoto({ client_contract_templates: null }));
    default:
      throw new Error(`cenário desconhecido: ${nome}`);
  }
}

const NOMES_RESOLVIDO = ["vivo", "vivo.idiomas-pt", "assinado", "congelado", "minuta-congelada", "minuta-viva", "sem-corpo"] as const;

async function atualizacoesDeCongelamento(nome: string): Promise<string> {
  await resolvido(nome);
  // O congelamento é gravado sem esperar: deixa-se a micro-tarefa correr.
  await Promise.resolve();
  await Promise.resolve();
  return normalizarDataDoCarimbo(JSON.stringify(estadoFalso.updates.map((u) => ({ table: u.table, payload: { ...(u.payload as object), contract_frozen_at: "<AGORA>" } })), null, 1));
}

// ── o HTML de impressão ─────────────────────────────────────────────────────────────────────────

async function impressao(nome: string, titulo = "Contrato CC-2026-0003 & <teste>"): Promise<string> {
  reporEstadoFalso(tabelasDoRemoto());
  const contratoPorNome: Record<string, Record<string, unknown>> = {
    vivo: contratoBase(),
    assinado: contratoBase(ASSINADO_PELOS_DOIS),
    congelado: contratoBase({ ...ASSINADO_PELOS_DOIS, contract_body_frozen_html: "<h2>COPIA CONGELADA</h2><p>texto fixo</p>" }),
  };
  const doc = await resolveContractDocument(contratoPorNome[nome], "o-1", "Empresa");
  if (!doc) throw new Error("sem documento");
  return normalizarDataDoCarimbo(buildContractPrintHtml(doc as never, titulo));
}

function documentoMao(settings: Record<string, unknown>, corpo: string): never {
  return {
    bodyHtml: corpo,
    variableData: { empresa_nome: "Empresa Manual", cliente_nome: "Cliente Manual", contrato_numero: "CC-1", data: "13/03/2026", comercial_nome: "Ricardo" },
    organization: { logo_url: "https://exemplo.test/org.png" },
    settings: { primary_color: "#7C3AED", font_family: "Arial", header_layout: "left", show_footer: true, contract_block_show: true, ...settings },
    companyName: "Empresa Manual",
    headerLineOne: "",
    headerLineTwo: "",
    pageWidth: "210mm", pageHeight: "297mm", pageCssSize: "A4 portrait",
  } as never;
}

// ── o rodapé desenhado pelo jsPDF ───────────────────────────────────────────────────────────────

function pdfGravador(paginas: number) {
  const registo: unknown[] = [];
  let atual = 1;
  return {
    registo,
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    getNumberOfPages: () => paginas,
    setPage: (n: number) => { atual = n; },
    setFontSize: (n: number) => { registo.push(["fonte", atual, n]); },
    setTextColor: (...c: number[]) => { registo.push(["cor", atual, ...c]); },
    setDrawColor: (...c: number[]) => { registo.push(["corLinha", atual, ...c]); },
    setLineWidth: (n: number) => { registo.push(["largura", atual, n]); },
    line: (...p: number[]) => { registo.push(["linha", atual, ...p.map((v) => Number(v.toFixed(3)))]); },
    text: (t: string, x: number, y: number, o: unknown) => { registo.push(["texto", atual, t, Number(x.toFixed(3)), Number(y.toFixed(3)), o]); },
    splitTextToSize: (t: string, largura: number) => {
      registo.push(["parte", t, Number(largura.toFixed(3))]);
      return t.match(/.{1,40}(\s|$)/g)?.map((l) => l.trim()) ?? [t];
    },
  };
}

function rodape(paginas: number, settings: Record<string, unknown>): string {
  const pdf = pdfGravador(paginas);
  drawContractPdfFooters(pdf, settings);
  return JSON.stringify(pdf.registo);
}

// ── o conjunto ──────────────────────────────────────────────────────────────────────────────────

export const CENARIOS: Record<string, Cenario> = {
  "assinaturas.real.nada": (i) => assinar(REAL_BLOCK, NADA, NADA, i),
  "assinaturas.real.so-empresa": (i) => assinar(REAL_BLOCK, EMPRESA_ASSINOU, { signed: false, showOtpBadge: true }, i),
  "assinaturas.real.so-cliente": (i) => assinar(REAL_BLOCK, NADA, CLIENTE_ASSINOU, i),
  "assinaturas.real.ambos": (i) => assinar(REAL_BLOCK, EMPRESA_ASSINOU, CLIENTE_ASSINOU, i),
  "assinaturas.empreita.so-empresa": (i) => assinar(EMPREITA_BLOCK, EMPRESA_ASSINOU, { signed: false, showOtpBadge: true }, i),
  "assinaturas.tabela.so-cliente": (i) => assinar(TABLE_UNDERSCORE_BLOCK, NADA, CLIENTE_ASSINOU, i),
  "assinaturas.plano.ambos": (i) => assinar(FLAT_BLOCK, EMPRESA_ASSINOU, CLIENTE_ASSINOU, i),
  "assinaturas.plano.so-empresa": (i) => assinar(FLAT_BLOCK, EMPRESA_ASSINOU, NADA, i),
  "assinaturas.sem-bloco": (i) => assinar(SEM_BLOCO, EMPRESA_ASSINOU, CLIENTE_ASSINOU, i),
  "assinaturas.sem-nome": (i) => assinar(REAL_BLOCK, { signed: true, showOtpBadge: false }, { signed: true, showOtpBadge: false }, i),
  "assinaturas.cliente-sem-data-nem-ip": (i) => assinar(REAL_BLOCK, NADA, { signed: true, name: "Só Nome", showOtpBadge: true }, i),
  "assinaturas.vazio": (i) => assinar("", EMPRESA_ASSINOU, CLIENTE_ASSINOU, i),

  "signatario.plano": (i) => assinarSignatario(FLAT_BLOCK, "Ricardo Belchior", "Gerente", i),
  "signatario.plano.sem-cargo": (i) => assinarSignatario(FLAT_BLOCK, "Ricardo Belchior", null, i),
  "signatario.plano.escapa": (i) => assinarSignatario(FLAT_BLOCK, "A & B <Lda>", "Sócio > gerente", i),
  "signatario.colunas": (i) => assinarSignatario(`<p>Texto antes.</p><div><span>A PRIMEIRA CONTRATANTE</span><span>O SEGUNDO CONTRATANTE</span></div>`, "Ricardo Belchior", "Gerente", i),
  "signatario.sem-nome": (i) => assinarSignatario(FLAT_BLOCK, "  ", "Gerente", i),
  "signatario.sem-bloco": (i) => assinarSignatario(SEM_BLOCO, "Ricardo Belchior", "Gerente", i),
  "signatario.bloco-real": (i) => assinarSignatario(REAL_BLOCK, "Ricardo Belchior", "Gerente", i),

  "ganchos.todos": (i) => JSON.stringify(HTML_DOS_GANCHOS.map((h) => gancho(h, i))),

  // Texto em inglês solto num contrato em português: o português de hoje não o vê (esperado = o original).
  "assinaturas.pt-com-texto-ingles": (i) => assinar(TEXTO_INGLES_SOLTO, EMPRESA_ASSINOU, CLIENTE_ASSINOU, i),
  "assinaturas.pt-bloco-com-texto-ingles": (i) => assinar(`<p>THE COMPANY and THE CLIENT agree.</p>${REAL_BLOCK}`, EMPRESA_ASSINOU, CLIENTE_ASSINOU, i),
  "signatario.pt-texto-ingles": (i) => assinarSignatario("<p>THE FIRST PARTY and THE SECOND PARTY</p>", "Ricardo Belchior", "Gerente", i),
  "ganchos.texto-ingles": (i) => JSON.stringify(["<p>The Client signs here</p>", "<p>the client</p>", "<p>THE SECOND PARTY</p>"].map((h) => gancho(h, i))),

  ...Object.fromEntries(
    NOMES_RESOLVIDO.map((nome) => [`resolver.${nome}`, async () => textoDoResolvido(await resolvido(nome))]),
  ),
  "resolver.assinado.congelamento-gravado": () => atualizacoesDeCongelamento("assinado"),
  "resolver.congelado.nao-grava": () => atualizacoesDeCongelamento("congelado"),

  "impressao.vivo": () => impressao("vivo"),
  "impressao.assinado": () => impressao("assinado"),
  "impressao.congelado": () => impressao("congelado"),
  "impressao.mao.rodape": async () => buildContractPrintHtml(documentoMao({ footer_text: "Rodapé <b> & mais", margin_top: 18 }, "<p>Corpo</p>"), "Título"),
  "impressao.mao.sem-rodape": async () => buildContractPrintHtml(documentoMao({ show_footer: false, footer_text: "não aparece", header_layout: "center", header_show_separator: false }, "<p>Corpo</p>"), "T"),
  "impressao.mao.cabecalho-split": async () => buildContractPrintHtml(documentoMao({ header_style: "split", contract_block_title: "CONTRATO", logo_url: "https://exemplo.test/l.png", logo_size: "large" }, "<p>Corpo</p><script>alert(1)</script>"), "T"),
  "impressao.mao.letter": async () => buildContractPrintHtml({ ...(documentoMao({ primary_color: "" }, "<p>x</p>") as object), pageWidth: "215.9mm", pageHeight: "279.4mm", pageCssSize: "letter portrait" } as never, "T"),

  "rodape.4-paginas": async () => rodape(4, { footer_text: "Empresa, Lda. — Rua da Empresa 42, 1200-100 Lisboa — NIF 514234567 — www.empresa.pt" }),
  "rodape.sem-numeros": async () => rodape(3, { footer_text: "Empresa, Lda.", show_page_numbers: false }),
  "rodape.sem-texto": async () => rodape(2, { footer_text: "", margin_left: 30, margin_right: 10 }),
  "rodape.desligado": async () => rodape(3, { footer_text: "Empresa", show_footer: false }),
};

/** A hora do dia que o sistema acha que é (as datas «de hoje» do contrato ficam fixas). */
export const AGORA_FIXO = new Date("2026-03-13T12:00:00.000Z");
