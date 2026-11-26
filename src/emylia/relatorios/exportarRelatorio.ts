// 26/11: o relatório da Olyvia em PDF (pdf-lib, A4 ao alto: a faixa da marca, os números-chave em cartões, as barras, as tabelas às riscas
// com a linha do total, os textos, e o rodapé com a página) e em Excel (o resumo e uma folha por tabela, com os valores em número).
// Tudo no navegador, a partir do mesmo DocRelatorio que o ecrã desenha.
import { textoPdf } from "../estudioObra/exportarPlano";
import { eur, type Coluna, type DocRelatorio, type Seccao } from "./relatoriosOlyvia";

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const COR = {
  marca: hex("#4b2fc9"), marca2: hex("#7c5ce0"), clara: hex("#f1edfd"), clara2: hex("#faf9ff"), linha: hex("#e4def7"),
  texto: hex("#1f1b2e"), suave: hex("#6b6680"), bom: hex("#15803d"), atencao: hex("#b45309"), branco: hex("#ffffff"),
};
const valorCelula = (c: Coluna, v: string | number) => (typeof v === "number" ? (c.dinheiro ? eur(v) : v.toLocaleString("pt-PT")) : v);
const gerado = (agora: Date) => agora.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Os bytes do PDF. */
export async function gerarPdfRelatorio(doc: DocRelatorio, agora = new Date()): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(textoPdf(doc.titulo)); pdf.setAuthor("Olyvia"); pdf.setCreator("Olyvia");
  const f = await pdf.embedFont(StandardFonts.Helvetica), fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const C = (c: Rgb) => rgb(c[0], c[1], c[2]);
  const W = 595.28, H = 841.89, M = 40, LARG = W - 2 * M;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const larguraTexto = (t: string, tam: number, bold = false) => (bold ? fb : f).widthOfTextAtSize(textoPdf(t), tam);
  const cortar = (t: string, max: number, tam: number, bold = false) => {
    let s = textoPdf(t);
    if (larguraTexto(s, tam, bold) <= max) return s;
    while (s.length > 1 && larguraTexto(`${s}...`, tam, bold) > max) s = s.slice(0, -1);
    return `${s}...`;
  };
  const escrever = (t: string, x: number, yy: number, tam: number, o: { bold?: boolean; cor?: Rgb; max?: number; dir?: boolean } = {}) => {
    const s = o.max ? cortar(t, o.max, tam, o.bold) : textoPdf(t);
    const xx = o.dir && o.max ? x + o.max - larguraTexto(s, tam, o.bold) : x;
    page.drawText(s, { x: xx, y: yy, size: tam, font: o.bold ? fb : f, color: C(o.cor ?? COR.texto) });
  };
  const partir = (t: string, max: number, tam: number) => {
    const palavras = textoPdf(t).split(" "), out: string[] = [];
    let linha = "";
    for (const p of palavras) { const nova = linha ? `${linha} ${p}` : p; if (larguraTexto(nova, tam) > max && linha) { out.push(linha); linha = p; } else linha = nova; }
    if (linha) out.push(linha);
    return out;
  };
  const novaPagina = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 28, width: W, height: 28, color: C(COR.marca) });
    escrever(doc.titulo, M, H - 18, 9, { bold: true, cor: COR.branco, max: LARG });
    y = H - 28 - 22;
  };
  const espaco = (h: number) => { if (y - h < M + 24) novaPagina(); };

  // a faixa do topo
  page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: C(COR.marca) });
  page.drawRectangle({ x: 0, y: H - 116, width: W, height: 4, color: C(COR.marca2) });
  escrever("OLYVIA", M, H - 34, 9, { bold: true, cor: hex("#d9cffb") });
  escrever(doc.titulo, M, H - 62, 20, { bold: true, cor: COR.branco, max: LARG });
  escrever(doc.subtitulo, M, H - 82, 10, { cor: hex("#e6e0fd"), max: LARG });
  escrever(`Dados atualizados ${doc.atualizado ? new Date(doc.atualizado).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}`, M, H - 100, 8, { cor: hex("#d9cffb") });
  y = H - 116 - 26;

  const titulo = (t: string, nota?: string) => {
    espaco(nota ? 40 : 28);
    escrever(t, M, y, 12.5, { bold: true });
    y -= 6;
    page.drawRectangle({ x: M, y, width: 28, height: 2, color: C(COR.marca2) });
    y -= 12;
    if (nota) { for (const l of partir(nota, LARG, 8.5)) { escrever(l, M, y, 8.5, { cor: COR.suave }); y -= 11; } y -= 2; }
  };

  const seccao = (s: Seccao) => {
    if (s.k === "kpis") {
      const n = s.itens.length, gap = 10, w = (LARG - gap * (n - 1)) / Math.max(1, n), h = 62;
      espaco(h + 14);
      s.itens.forEach((k, i) => {
        const x = M + i * (w + gap), cor = k.tom === "bom" ? COR.bom : k.tom === "atencao" ? COR.atencao : COR.marca;
        page.drawRectangle({ x, y: y - h, width: w, height: h, color: C(COR.clara), borderColor: C(COR.linha), borderWidth: 0.8 });
        page.drawRectangle({ x, y: y - h, width: 3, height: h, color: C(cor) });
        escrever(k.rot.toUpperCase(), x + 10, y - 15, 7.5, { bold: true, cor: COR.suave, max: w - 16 });
        escrever(k.valor, x + 10, y - 34, 14, { bold: true, cor, max: w - 16 });
        if (k.nota) escrever(k.nota, x + 10, y - 50, 7.5, { cor: COR.suave, max: w - 16 });
      });
      y -= h + 22;
      return;
    }
    if (s.k === "barras") {
      titulo(s.titulo, s.nota);
      const max = Math.max(1, ...s.itens.map((x) => x.valor)), rotW = 150, valW = 110, barW = LARG - rotW - valW - 16;
      for (const it of s.itens) {
        espaco(18);
        escrever(it.rot, M, y - 9, 8.5, { max: rotW - 6 });
        page.drawRectangle({ x: M + rotW, y: y - 12, width: barW, height: 10, color: C(COR.clara) });
        if (it.valor > 0) page.drawRectangle({ x: M + rotW, y: y - 12, width: Math.max(2, (barW * it.valor) / max), height: 10, color: C(COR.marca2) });
        escrever(it.texto, M + rotW + barW + 8, y - 9, 8.5, { bold: true, max: valW, dir: true });
        y -= 17;
      }
      y -= 10;
      return;
    }
    if (s.k === "texto") {
      titulo(s.titulo);
      for (const p of s.paragrafos) { for (const l of partir(p, LARG, 9)) { espaco(13); escrever(l, M, y, 9); y -= 12.5; } y -= 6; }
      y -= 6;
      return;
    }
    // tabela
    titulo(s.titulo, s.nota);
    const soma = s.colunas.reduce((a, c) => a + c.w, 0), larg = s.colunas.map((c) => (LARG * c.w) / soma), xs = larg.map((_, i) => M + larg.slice(0, i).reduce((a, b) => a + b, 0));
    const cab = () => {
      page.drawRectangle({ x: M, y: y - 16, width: LARG, height: 18, color: C(COR.clara) });
      s.colunas.forEach((c, i) => escrever(c.t, xs[i] + 5, y - 11, 7.8, { bold: true, cor: COR.marca, max: larg[i] - 10, dir: c.dir }));
      y -= 20;
    };
    espaco(40); cab();
    s.linhas.forEach((l, r) => {
      if (y - 16 < M + 24) { novaPagina(); cab(); }
      if (r % 2 === 1) page.drawRectangle({ x: M, y: y - 12, width: LARG, height: 16, color: C(COR.clara2) });
      s.colunas.forEach((c, i) => escrever(String(valorCelula(c, l[i] ?? "")), xs[i] + 5, y - 7, 8.3, { max: larg[i] - 10, dir: c.dir }));
      y -= 16;
    });
    if (s.total) {
      espaco(20);
      page.drawRectangle({ x: M, y: y + 2, width: LARG, height: 1, color: C(COR.marca2) });
      s.colunas.forEach((c, i) => escrever(String(valorCelula(c, s.total![i] ?? "")), xs[i] + 5, y - 9, 8.6, { bold: true, max: larg[i] - 10, dir: c.dir }));
      y -= 18;
    }
    y -= 14;
  };
  for (const s of doc.seccoes) seccao(s);

  // o rodapé de todas as páginas
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    p.drawRectangle({ x: M, y: 30, width: LARG, height: 0.6, color: C(COR.linha) });
    const esq = textoPdf(`Olyvia · ${doc.titulo} · gerado a ${gerado(agora)}`), dir = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(cortar(esq, LARG - 80, 7.5), { x: M, y: 18, size: 7.5, font: f, color: C(COR.suave) });
    p.drawText(dir, { x: W - M - f.widthOfTextAtSize(dir, 7.5), y: 18, size: 7.5, font: f, color: C(COR.suave) });
  });
  return pdf.save();
}

/** Os bytes do Excel: o resumo (os números-chave e as barras) e uma folha por tabela. */
export async function gerarExcelRelatorio(doc: DocRelatorio): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const seguro = (v: unknown) => (typeof v === "string" && /^\s*[=+\-@]/.test(v) ? `'${v}` : v);
  const resumo: unknown[][] = [[doc.titulo], [doc.subtitulo], [`Dados atualizados: ${doc.atualizado ? new Date(doc.atualizado).toLocaleString("pt-PT") : "—"}`], []];
  for (const s of doc.seccoes) {
    if (s.k === "kpis") { resumo.push(["Indicador", "Valor", "Nota"]); for (const k of s.itens) resumo.push([k.rot, k.valor, k.nota ?? ""]); resumo.push([]); }
    if (s.k === "barras") { resumo.push([s.titulo]); for (const b of s.itens) resumo.push([b.rot, b.valor, b.texto]); resumo.push([]); }
    if (s.k === "texto") { resumo.push([s.titulo]); for (const p of s.paragrafos) resumo.push([seguro(p)]); resumo.push([]); }
  }
  const wsR = XLSX.utils.aoa_to_sheet(resumo);
  wsR["!cols"] = [{ wch: 44 }, { wch: 22 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsR, "Resumo");
  const usados = new Set(["Resumo"]);
  for (const s of doc.seccoes) {
    if (s.k !== "tabela") continue;
    const linhas: unknown[][] = [s.colunas.map((c) => c.t), ...s.linhas.map((l) => l.map(seguro)), ...(s.total ? [s.total.map(seguro)] : [])];
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = s.colunas.map((c) => ({ wch: Math.max(8, Math.round(c.w * 1.2)) }));
    s.colunas.forEach((c, ci) => { if (!c.dinheiro) return; for (let r = 1; r < linhas.length; r++) { const cel = ws[XLSX.utils.encode_cell({ r, c: ci })]; if (cel && cel.t === "n") cel.z = "#,##0.00 €"; } });
    if (s.linhas.length) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: s.linhas.length, c: s.colunas.length - 1 } }) };
    let nome = s.titulo.replace(/[\\/?*[\]:]/g, " ").slice(0, 31), k = 2;
    while (usados.has(nome)) nome = `${s.titulo.slice(0, 27)} (${k++})`;
    usados.add(nome);
    XLSX.utils.book_append_sheet(wb, ws, nome);
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true }) as Uint8Array;
}

function descarregar(bytes: Uint8Array, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportarRelatorio(doc: DocRelatorio, formato: "pdf" | "excel"): Promise<void> {
  if (formato === "pdf") descarregar(await gerarPdfRelatorio(doc), `${doc.nomeFicheiro}.pdf`, "application/pdf");
  else descarregar(await gerarExcelRelatorio(doc), `${doc.nomeFicheiro}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
