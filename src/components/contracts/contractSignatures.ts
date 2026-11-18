// Assinaturas do corpo de um contrato: o signatário escolhido na minuta, o gancho que o mostra e o ESTADO REAL
// de assinatura (empresa + cliente) injetado no bloco. Ciente do idioma: a deteção do bloco (marcas por classe,
// frases de cada idioma, heurística de sempre) está em contractSignatureBlock.ts e o carimbo escreve as palavras
// no idioma da versão (ou nos dois, quando o documento sai em vários e a assinatura é uma só). A data do
// carimbo mantém o formato de sempre, no idioma (primeiro) do carimbo; o português é exatamente o de antes.

import { IDIOMA_BASE, localeDoIdioma, ordenarPorRegisto, tDoc } from "@/lib/idiomaDocumento";
import {
  CLASSE_EMPRESA,
  frasesPorOrdem,
  isLineElement,
  isDecorativeLine,
  localizarAssinaturas,
  localizarBlocoGenerico,
  rotulosDasPartes,
  temMarcaDeAssinatura,
} from "./contractSignatureBlock";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Substitui o bloco final estático de assinatura
 *   "A PRIMEIRA CONTRATANTE … O SEGUNDO CONTRATANTE"   (em inglês: "THE FIRST PARTY … THE SECOND PARTY")
 * pelo nome/cargo do signatário escolhido na minuta. Conservador: só toca
 * em elementos curtos (<220 chars) que contenham ambas as etiquetas — assim
 * cláusulas que mencionem "A PRIMEIRA CONTRATANTE" no texto ficam intactas.
 * Com a coluna da empresa marcada (olv-assinatura-empresa) o nome entra por baixo da sua linha.
 * Se já não houver bloco a substituir (foi reescrito manualmente ou já usa
 * {{signatario_*}}), devolve o HTML original.
 */
export function injectSignatoryIntoSignatureBlock(
  html: string,
  signatoryName?: string | null,
  signatoryRole?: string | null,
  idioma: string = IDIOMA_BASE,
): string {
  if (!html) return html;
  const name = (signatoryName || "").trim();
  if (!name) return html;
  const cargo = (signatoryRole || "").trim();

  // Remove um parágrafo de underscores/traços imediatamente antes do bloco
  // de assinatura (a injeção desenha as suas próprias linhas).
  const stripPrecedingUnderscoreLineSSR = (src: string): string =>
    src.replace(
      /<p\b[^>]*>(?:[\s\u00A0_·\-–—]|&nbsp;|<br\s*\/?>)*<\/p>\s*(?=<(?:p|div)\b[^>]*>[\s\S]*?A PRIMEIRA CONTRATANTE[\s\S]*?O SEGUNDO CONTRATANTE)/gi,
      "",
    );

  // Fallback SSR — usa regex sobre <p>… A PRIMEIRA CONTRATANTE … O SEGUNDO CONTRATANTE …</p> (só português)
  if (typeof document === "undefined") {
    const cleaned = stripPrecedingUnderscoreLineSSR(html);
    return cleaned.replace(
      /<(p|div)\b([^>]*)>([\s\S]*?A PRIMEIRA CONTRATANTE[\s\S]*?O SEGUNDO CONTRATANTE[\s\S]*?)<\/\1>/gi,
      (match, tag: string, attrs: string, inner: string) => {
        if (inner.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length > 220) return match;
        return `<${tag}${attrs}>
          <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
            <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
            <strong>${esc(name)}</strong>${cargo ? `<br/><span style="color:#6b7280;font-size:0.92em;">${esc(cargo)}</span>` : ""}<br/>
            <span>A PRIMEIRA CONTRATANTE</span>
          </span>
          <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
            <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
            <span>O SEGUNDO CONTRATANTE</span>
          </span>
        </${tag}>`;
      },
    );
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  // Coluna da empresa marcada: o nome e o cargo entram por baixo da linha, sem refazer o bloco.
  const empresaMarcada = template.content.querySelector(`.${CLASSE_EMPRESA}`);
  if (empresaMarcada) {
    if ((empresaMarcada.textContent || "").includes(name)) return html;
    const nome = `<div><strong>${esc(name)}</strong>${cargo ? `<br/><span style="color:#6b7280;font-size:0.92em;">${esc(cargo)}</span>` : ""}</div>`;
    const linha = Array.from(empresaMarcada.children).find(isLineElement);
    if (linha) linha.insertAdjacentHTML("afterend", nome);
    else empresaMarcada.insertAdjacentHTML("afterbegin", nome);
    return template.innerHTML;
  }

  const bloco = localizarBlocoGenerico(template.content, idioma);
  if (!bloco) return html;
  const target = bloco.alvo;
  const rotulos = rotulosDasPartes(bloco.idioma);

  // Remover até 2 elementos anteriores que contenham apenas underscores/
  // traços/espaços/<br> (linhas de assinatura duplicadas do template).
  for (let i = 0; i < 2; i += 1) {
    const prev = target.previousElementSibling;
    if (isDecorativeLine(prev)) prev!.remove();
    else break;
  }

  target.innerHTML = `
      <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
        <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
        <strong>${esc(name)}</strong>${cargo ? `<br/><span style="color:#6b7280;font-size:0.92em;">${esc(cargo)}</span>` : ""}<br/>
        <span>${rotulos.primeira}</span>
      </span>
      <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
        <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
        <span>${rotulos.segunda}</span>
      </span>`;
  return template.innerHTML;
}

/**
 * HTML do marcador determinístico de bloco de assinatura. Quando este marcador
 * está presente no `body_html` do template/contrato, serve de âncora visível
 * para o utilizador saber onde o signatário vai ser mostrado.
 */
export const SIGNATORY_BLOCK_MARKER_HTML =
  '<div data-signatory-block="primary" style="margin-top:32px"></div>';

/**
 * Devolve true se o `body_html` já contém um gancho que mostra o signatário:
 * marcador determinístico, chip {{signatario_nome}}, as marcas por classe do bloco de assinatura, ou a
 * frase do cliente reconhecida pela heurística (a do `idioma` primeiro, depois as dos outros idiomas).
 */
export function hasSignatoryHook(html: string | null | undefined, idioma?: string): boolean {
  if (!html) return false;
  if (/data-signatory-block\s*=\s*"primary"/i.test(html)) return true;
  if (/\{\{\s*signatario_nome\s*\}\}/i.test(html)) return true;
  if (temMarcaDeAssinatura(html)) return true;
  return frasesPorOrdem(idioma).some(({ frases }) => frases.segundaParte.test(html));
}

export interface PartySignatureInfo {
  signed: boolean;
  name?: string | null;
  signedAt?: string | null;
  ip?: string | null;
  /** true = client (shows "Assinado via SMS OTP" + name/date/IP); false = company (plain signature, no badge) */
  showOtpBadge?: boolean;
}

// Reserved height (px) above each signature line once at least one party has
// signed — the client stamp (badge + name + date + IP, 4 lines) is naturally
// taller than the company's (just a cursive name, 1 line); without a shared
// minimum height the two lines end up at different vertical positions.
const STAMP_MIN_HEIGHT = 60;

/** A palavra `chave` em cada idioma do carimbo, juntas por « / » (sem repetir quando coincidem, como «IP:»). */
function palavrasDoCarimbo(idiomas: readonly string[], chave: string): string {
  const frases: string[] = [];
  for (const codigo of idiomas) {
    const frase = tDoc(codigo, chave);
    if (!frases.includes(frase)) frases.push(frase);
  }
  return esc(frases.join(" / "));
}

/** Os idiomas do carimbo: os pedidos (pela ordem do registo, português primeiro) ou, sem pedido, o da versão. */
function idiomasDoCarimbo(idioma: string, pedidos?: readonly string[]): string[] {
  const ordenados = pedidos ? ordenarPorRegisto(pedidos) : [];
  return ordenados.length > 0 ? ordenados : [idioma];
}

function buildSignatureStampHtml(info: PartySignatureInfo, idiomas: readonly string[]): string {
  const base = `min-height:${STAMP_MIN_HEIGHT}px;display:flex;flex-direction:column;justify-content:flex-end;`;
  if (!info.signed) {
    // Not signed yet — invisible spacer only, so the line doesn't jump when
    // the OTHER party's (possibly taller) stamp appears.
    return `<div style="${base}"></div>`;
  }
  if (info.showOtpBadge) {
    const dateStr = info.signedAt
      ? new Date(info.signedAt).toLocaleString(localeDoIdioma(idiomas[0]), { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
    return `<div style="${base}margin-bottom:6px;">
      <div style="color:#059669;font-size:11px;font-weight:600;">&#10003; ${palavrasDoCarimbo(idiomas, "doc.carimbo.assinadoOtp")}</div>
      ${info.name ? `<div style="font-size:12px;font-weight:600;color:#374151;">${esc(info.name)}</div>` : ""}
      ${dateStr ? `<div style="font-size:11px;color:#6b7280;">${esc(dateStr)}</div>` : ""}
      ${info.ip ? `<div style="font-size:10px;color:#9ca3af;">${palavrasDoCarimbo(idiomas, "doc.carimbo.ip")} ${esc(info.ip)}</div>` : ""}
    </div>`;
  }
  return `<div style="${base}margin-bottom:2px;">
    <div style="font-family:'Brush Script MT','Segoe Script','Lucida Handwriting',cursive;font-size:22px;color:#1a1a1a;">${info.name ? esc(info.name) : palavrasDoCarimbo(idiomas, "doc.carimbo.assinado")}</div>
  </div>`;
}

/** Inserir mesmo antes da linha (não no início da coluna): a assinatura fica colada por cima da linha. */
function colocarCarimbo(coluna: Element | null, carimbo: string): void {
  if (!coluna || !carimbo) return;
  const linha = Array.from(coluna.children).find(isLineElement);
  if (linha) linha.insertAdjacentHTML("beforebegin", carimbo);
  else coluna.insertAdjacentHTML("afterbegin", carimbo);
}

/**
 * Injeta o ESTADO REAL de assinatura (empresa + cliente) diretamente no bloco
 * de assinatura existente no corpo do contrato — sem substituir o texto
 * original das etiquetas ("A [Empresa]" / "O Cliente" ou o genérico legacy
 * "A PRIMEIRA CONTRATANTE" / "O SEGUNDO CONTRATANTE"). Nada aparece do lado
 * de uma parte enquanto ela não tiver assinado (`signed: false` → sem
 * conteúdo injetado, o espaço fica como já estava na minuta).
 *
 * Ao contrário de `injectSignatoryIntoSignatureBlock` (que só sabe mostrar um
 * nome estático definido na minuta, sem estado real), esta função é chamada
 * em cada render/PDF a partir dos campos reais do contrato
 * (company_signature_date/company_signed_by_name, signature_date/
 * signed_by_name/signature_ip), por isso reflete sempre o estado atual.
 *
 * `idioma` é o da versão onde está o bloco (omissão "pt"): decide que frases se procuram primeiro e em que
 * língua se escreve o carimbo. `idiomasDoCarimbo` (omissão: só `idioma`) é para o documento com vários
 * idiomas e uma só assinatura: o carimbo sai nos dois, «Assinado via SMS OTP / Signed via SMS OTP».
 */
export function injectSignaturesIntoBlock(
  html: string,
  company: PartySignatureInfo,
  client: PartySignatureInfo,
  idioma: string = IDIOMA_BASE,
  idiomasDoCarimboPedidos?: readonly string[],
): string {
  if (!html) return html;
  if (typeof document === "undefined") return html; // SSR: no-op (não exercitado neste código)
  // Nada assinado ainda — não mexer no HTML original (buildSignatureStampHtml
  // já não devolve vazio quando signed=false, para poder reservar espaço).
  if (!company.signed && !client.signed) return html;

  const idiomas = idiomasDoCarimbo(idioma, idiomasDoCarimboPedidos);
  const companyStamp = buildSignatureStampHtml(company, idiomas);
  const clientStamp = buildSignatureStampHtml(client, idiomas);

  const template = document.createElement("template");
  template.innerHTML = html;
  const alvo = localizarAssinaturas(template.content, idioma);
  if (!alvo) return html;

  // Colunas marcadas por classe, ou as duas colunas achadas pelas frases: o carimbo vai colado à linha de cada uma.
  if (alvo.tipo !== "plano") {
    colocarCarimbo(alvo.empresa, companyStamp);
    colocarCarimbo(alvo.cliente, clientStamp);
    return template.innerHTML;
  }

  // Fallback legacy: bloco plano com o texto genérico exato numa única
  // etiqueta, sem sub-elementos por parte — reconstrói como antes.
  const rotulos = rotulosDasPartes(alvo.idioma);
  alvo.alvo.innerHTML = `
      <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
        ${companyStamp}
        <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
        <span>${rotulos.primeira}</span>
      </span>
      <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
        ${clientStamp}
        <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
        <span>${rotulos.segunda}</span>
      </span>`;
  return template.innerHTML;
}
