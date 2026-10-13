const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const L = require("react-icons/lu");
// apply_theme.js grava as cores e as letras no tema do .pptx (o pptxgenjs não o faz).
// Vem da skill de apresentações do Claude; sem ele a apresentação sai na mesma,
// só que o tema do PowerPoint fica com as cores de origem do Office.
let applyTheme = async () => console.warn("APPLY_THEME não definido: tema do Office mantido.");
if (process.env.APPLY_THEME) ({ applyTheme } = require(process.env.APPLY_THEME));

const OUT = process.argv[2] || "apresentacao.pptx";
const A = (f) => __dirname + "/assets/" + f;

// Marca BMLAR (bmlar.pt): preto + azulejo, osso, verde Mudelar, azul BMG, coral. Olyvia em roxo.
const K = {
  bg: "0E0E0E", card: "181818", card2: "222222", line: "2F2F2F",
  bone: "F5F0E8", muted: "A8A39A", dim: "6E6A64",
  mud: "81CEBA", mudDeep: "67A392", bmg: "6F86FF", bmgDeep: "4462FF", coral: "E84F70",
  oly: "A07BF2", olyDeep: "763CE9", white: "FFFFFF", ink: "000000", ui: "F4F2EE", uiLine: "E2DED7", uiText: "3A3A3A",
};
const THEME = {
  name: "BMLAR Olyvia", headFontFace: "Century Gothic", bodyFontFace: "Calibri",
  colors: { dk1: K.ink, lt1: K.white, dk2: K.card, lt2: K.bone, accent1: K.mudDeep, accent2: K.mud, accent3: K.bmgDeep, accent4: K.coral, accent5: K.olyDeep, accent6: K.card2, hlink: K.bmg, folHlink: K.oly },
};
const HF = THEME.headFontFace;

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  return "image/png;base64," + (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "Olyvia — ponto de situação";
  pres.author = "Ruben Carvalho";
  pres.company = "BMLAR Group";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const W = 13.333, H = 7.5, M = 0.65;
  let n = 0; const id = (p) => p + "-" + (++n);

  // ---------- layouts ----------
  pres.defineSlideMaster({
    title: "CAPA", background: { path: A("azulejo.jpg") },
    objects: [{ rect: { x: 0, y: 0, w: W, h: H, fill: { color: K.ink, transparency: 25 } } }],
  });
  pres.defineSlideMaster({
    title: "ESCURO", background: { color: K.bg },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.78, w: W - 2 * M, h: 0.75, fontFace: HF, fontSize: 30, color: K.bone, align: "left", valign: "top", margin: 0 }, text: "" } },
      { text: { text: "OLYVIA · PONTO DE SITUAÇÃO · 06/10/2026", options: { x: M, y: H - 0.48, w: 6, h: 0.25, fontSize: 9, charSpacing: 2, color: K.dim, margin: 0, isTextBox: true } } },
      { image: { path: A("bmlar-group-horizontal-branco.png"), x: W - M - 0.95, y: H - 0.56, w: 0.95, h: 0.33 } },
    ],
    slideNumber: { x: W - M - 1.55, y: H - 0.48, w: 0.45, h: 0.25, fontSize: 9, color: K.dim, align: "right" },
  });
  pres.defineSlideMaster({
    title: "DIVISOR", background: { color: K.ink },
    objects: [
      { image: { path: A("azulejo.jpg"), x: 6.9, y: 0, w: W - 6.9, h: H, sizing: { type: "cover", w: W - 6.9, h: H } } },
      { placeholder: { options: { name: "title", type: "title", x: M, y: 2.9, w: 5.9, h: 1.9, fontFace: HF, fontSize: 40, color: K.bone, align: "left", valign: "top", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: M, y: 4.85, w: 5.6, h: 1.2, fontSize: 17, color: K.muted, align: "left", valign: "top", margin: 0 }, text: "" } },
    ],
  });

  // ---------- helpers ----------
  const T = (s, text, o) => s.addText(text, { margin: 0, isTextBox: true, objectName: id("texto"), ...o });
  const eyebrow = (s, t, color = K.mud) => T(s, t.toUpperCase(), { x: M, y: 0.42, w: 9, h: 0.3, fontSize: 11, charSpacing: 4, bold: true, color });
  const head = (s, eb, title, color) => { eyebrow(s, eb, color); s.addText(title, { placeholder: "title" }); };
  const box = (s, x, y, w, h, fill = K.card, line) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: fill }, line: { color: line || fill, width: 0.75 }, objectName: id("cartao") });
  const rect = (s, x, y, w, h, fill, o = {}) => s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: id("ret"), ...o });
  const rrect = (s, x, y, w, h, fill, r = 0.05, o = {}) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: r, fill: { color: fill }, line: { color: o.lineColor || fill, width: o.lineWidth || 0.5 }, objectName: id("rret") });
  const dot = (s, x, y, d, fill) => s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: id("ponto") });
  const ic = async (s, Comp, x, y, d, bg, fg = K.ink) => { dot(s, x, y, d, bg); const p = d * 0.25; s.addImage({ data: await icon(Comp, fg), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: id("icone") }); };
  const icBare = async (s, Comp, x, y, d, color) => s.addImage({ data: await icon(Comp, color), x, y, w: d, h: d, objectName: id("icone") });
  const pill = (s, text, x, y, w, fill, color = K.ink, h = 0.3, fs = 10) => { rrect(s, x, y, w, h, fill, h / 2); T(s, text, { x, y, w, h, fontSize: fs, bold: true, color, align: "center", valign: "middle" }); };
  const bl = (items, o = {}) => items.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: i < items.length - 1, paraSpaceAfter: 8, ...o } }));
  const norm = (x, y, w, h) => ({ x: w < 0 ? x + w : x, y: h < 0 ? y + h : y, w: Math.abs(w), h: Math.abs(h), flipH: w < 0, flipV: h < 0 });
  const arrow = (s, x, y, w, h, color = K.dim, wpt = 1.5) => s.addShape(pres.shapes.LINE, { ...norm(x, y, w, h), line: { color, width: wpt, endArrowType: "triangle" }, objectName: id("seta") });
  const line = (s, x, y, w, h, color = K.line, wpt = 1, dash) => s.addShape(pres.shapes.LINE, { x, y, w, h, line: { color, width: wpt, dashType: dash || "solid" }, objectName: id("linha") });
  const caption = (s, t, x, y, w) => T(s, t, { x, y, w, h: 0.28, fontSize: 10, italic: true, color: K.dim });

  // Moldura de portátil com ecrã claro. Devolve a área útil do ecrã.
  const laptop = (s, x, y, w) => {
    const h = w * 0.6;
    rrect(s, x, y, w, h, "2A2A2A", 0.06);
    const sx = x + 0.09, sy = y + 0.12, sw = w - 0.18, sh = h - 0.2;
    rect(s, sx, sy, sw, sh, K.ui);
    s.addShape(pres.shapes.TRAPEZOID, { x: x - 0.35, y: y + h, w: w + 0.7, h: 0.14, fill: { color: "3A3A3A" }, line: { color: "3A3A3A" }, flipV: true, objectName: id("base-portatil") });
    return { sx, sy, sw, sh };
  };
  // Barra lateral e topo da app (ilustrativo)
  const appChrome = (s, { sx, sy, sw, sh }, active, items) => {
    const sbw = sw * 0.17;
    rect(s, sx, sy, sbw, sh, "1C1A24");
    s.addImage({ path: A("olyvia-t.png"), x: sx + 0.1, y: sy + 0.12, w: Math.min(0.9, sbw - 0.2), h: Math.min(0.9, sbw - 0.2) / 3, objectName: id("logo-app") });
    items.forEach((it, i) => {
      const yy = sy + 0.55 + i * 0.3;
      if (i === active) rrect(s, sx + 0.06, yy - 0.03, sbw - 0.12, 0.25, K.olyDeep, 0.04);
      T(s, it, { x: sx + 0.14, y: yy, w: sbw - 0.2, h: 0.2, fontSize: 8, color: i === active ? K.white : "B9B5C9" });
    });
    rect(s, sx + sbw, sy, sw - sbw, 0.36, K.white);
    line(s, sx + sbw, sy + 0.36, sw - sbw, 0, K.uiLine, 0.75);
    return { cx: sx + sbw + 0.15, cy: sy + 0.5, cw: sw - sbw - 0.3, ch: sh - 0.62, topY: sy };
  };
  const phone = (s, x, y, h) => {
    const w = h * 0.49;
    rrect(s, x, y, w, h, "050505", 0.22, { lineColor: "3A3A3A", lineWidth: 1.5 });
    const sx = x + 0.1, sy = y + 0.12, sw = w - 0.2, sh = h - 0.24;
    rrect(s, sx, sy, sw, sh, K.ui, 0.16);
    rrect(s, x + w / 2 - 0.35, y + 0.17, 0.7, 0.1, "050505", 0.05);
    return { sx, sy, sw, sh };
  };

  // =====================================================================
  // 1. CAPA
  pres.addSection({ title: "Abertura" });
  let s = pres.addSlide({ masterName: "CAPA", sectionTitle: "Abertura" });
  s.addImage({ path: A("bmlar-group-horizontal-branco.png"), x: M, y: 0.6, w: 2.4, h: 0.84, objectName: "capa-bmlar" });
  T(s, "REUNIÃO DE ADMINISTRAÇÃO  ·  06 OUT 2026", { x: M, y: 2.35, w: 9, h: 0.35, fontSize: 12, charSpacing: 5, bold: true, color: K.mud });
  T(s, "Olyvia", { x: M, y: 2.75, w: 9, h: 1.3, fontFace: HF, fontSize: 80, color: K.white });
  T(s, "A plataforma que liga o grupo, da primeira chamada à manutenção da casa", { x: M, y: 4.15, w: 7.4, h: 0.9, fontSize: 22, color: K.bone });
  line(s, M, 5.55, 5.2, 0, "5A5A5A", 0.75);
  T(s, "Ponto de situação  ·  o que está feito  ·  o potencial  ·  decisões", { x: M, y: 5.7, w: 8, h: 0.35, fontSize: 13, color: K.muted });
  rrect(s, W - M - 2.6, 5.35, 2.6, 0.95, K.white, 0.12);
  s.addImage({ path: A("olyvia-t.png"), x: W - M - 2.35, y: 5.49, w: 2.1, h: 0.7, objectName: "capa-olyvia" });
  s.addNotes("Abertura. Situação a 03/10/2026. A apresentação tem três partes: o que já funciona, o potencial para o grupo e o que precisamos da administração.");

  // 2. AGENDA
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Abertura" });
  head(s, "Agenda", "O que vamos ver");
  const agenda = [
    ["01", "Porquê a Olyvia", "O problema que resolve e a visão para o grupo"],
    ["02", "O que já funciona", "Da lead à obra, módulo a módulo"],
    ["03", "O potencial", "Dados próprios, manutenção BMG, produto para o mercado"],
    ["04", "Onde estamos", "Trabalho em curso, o que falta e calendário"],
    ["05", "Decisões", "Seis pontos para desbloquear a próxima fase"],
  ];
  agenda.forEach(([num, t, d], i) => {
    const y = 1.85 + i * 0.95;
    T(s, num, { x: M, y, w: 1.0, h: 0.7, fontFace: HF, fontSize: 36, color: i === 2 ? K.mud : "4A4A4A" });
    T(s, t, { x: M + 1.3, y: y + 0.02, w: 5, h: 0.4, fontFace: HF, fontSize: 20, color: K.bone });
    T(s, d, { x: M + 1.3, y: y + 0.42, w: 6, h: 0.3, fontSize: 13, color: K.muted });
    if (i < agenda.length - 1) line(s, M + 1.3, y + 0.86, 6.5, 0, K.line, 0.75);
  });
  s.addImage({ path: A("azulejo.jpg"), x: 8.9, y: 1.75, w: 3.78, h: 4.75, sizing: { type: "cover", w: 3.78, h: 4.75 }, objectName: "agenda-azulejo" });
  s.addImage({ path: A("simbolo-azulejo-branco.png"), x: 10.04, y: 3.37, w: 1.5, h: 1.5, objectName: "agenda-simbolo" });
  s.addNotes("Cinco partes. A parte 3 (potencial) é a novidade desta apresentação.");

  // =====================================================================
  pres.addSection({ title: "Porquê" });
  s = pres.addSlide({ masterName: "DIVISOR", sectionTitle: "Porquê" });
  T(s, "01", { x: M, y: 1.6, w: 2, h: 1.0, fontFace: HF, fontSize: 60, color: K.mud });
  s.addText("Porquê a Olyvia", { placeholder: "title" });
  s.addText("Hoje a informação de um cliente vive em cinco sítios diferentes. A Olyvia junta-a num só.", { placeholder: "body" });

  // 4. ANTES / DEPOIS
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Porquê" });
  head(s, "O problema", "De ferramentas soltas a um só sistema");
  const antes = [
    [L.LuFileText, "Manuais de obra em Word e tempos em Excel"],
    [L.LuMessageSquare, "Marcações e confirmações por telefone e mensagens"],
    [L.LuLayers, "Ordens de trabalho noutra ferramenta (Infraspeak)"],
    [L.LuClipboardList, "Levantamento da casa em papel ou de memória"],
    [L.LuTriangleAlert, "Ninguém sabe quanto tempo uma obra demora de facto"],
  ];
  const depois = [
    [L.LuRoute, "Um percurso único: lead, visita, orçamento, contrato, obra"],
    [L.LuCalendarCheck, "O cliente marca a visita e confirma por SMS"],
    [L.LuHardHat, "A obra é planeada sozinha a partir do contrato"],
    [L.LuHouse, "Ficha do local com campos fechados, pronta a usar"],
    [L.LuGauge, "Previsto contra real em cada tarefa: o sistema aprende"],
  ];
  box(s, M, 1.85, 5.75, 4.75, K.card);
  T(s, "HOJE", { x: M + 0.4, y: 2.1, w: 3, h: 0.3, fontSize: 11, charSpacing: 4, bold: true, color: K.coral });
  for (let i = 0; i < antes.length; i++) {
    const y = 2.6 + i * 0.75;
    await icBare(s, antes[i][0], M + 0.4, y + 0.04, 0.36, K.muted);
    T(s, antes[i][1], { x: M + 1.0, y, w: 4.45, h: 0.5, fontSize: 15, color: K.muted, valign: "middle" });
  }
  arrow(s, M + 5.95, 4.22, 0.6, 0, K.mud, 2.5);
  const dX = M + 6.75;
  box(s, dX, 1.85, W - M - dX, 4.75, "13241F", "1F3B33");
  T(s, "COM A OLYVIA", { x: dX + 0.4, y: 2.1, w: 3, h: 0.3, fontSize: 11, charSpacing: 4, bold: true, color: K.mud });
  for (let i = 0; i < depois.length; i++) {
    const y = 2.6 + i * 0.75;
    await icBare(s, depois[i][0], dX + 0.4, y + 0.04, 0.36, K.mud);
    T(s, depois[i][1], { x: dX + 1.0, y, w: W - M - dX - 1.3, h: 0.5, fontSize: 15, color: K.bone, valign: "middle" });
  }
  s.addNotes("O diagnóstico vem das reuniões com Operações: manuais em Word e Excel, ordens no Infraspeak, levantamentos sem estrutura. A Olyvia substitui estas peças por um percurso único.");

  // 5. VISÃO DO GRUPO
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Porquê" });
  head(s, "A visão", "Uma plataforma para o grupo inteiro");
  // duas marcas a alimentar um ciclo
  const cx0 = 6.67, cy0 = 4.15;
  const nodes = [
    ["Captar", "lead e visita", -2.9, -1.35, K.mud],
    ["Vender", "orçamento e contrato", 2.9, -1.35, K.mud],
    ["Transformar", "obra Mudelar", 2.9, 1.35, K.mud],
    ["Manter", "manutenção BMG", -2.9, 1.35, K.bmg],
  ];
  dot(s, cx0 - 1.15, cy0 - 1.15, 2.3, K.card2);
  rrect(s, cx0 - 0.95, cy0 - 0.33, 1.9, 0.66, K.white, 0.1);
  s.addImage({ path: A("olyvia-t.png"), x: cx0 - 0.8, y: cy0 - 0.23, w: 1.6, h: 0.53, objectName: "visao-olyvia" });
  for (const [t, d, dx, dy, col] of nodes) {
    const bx = cx0 + dx - 1.25, by = cy0 + dy - 0.5;
    box(s, bx, by, 2.5, 1.0, K.card, col);
    T(s, t, { x: bx, y: by + 0.14, w: 2.5, h: 0.4, fontFace: HF, fontSize: 18, color: K.bone, align: "center" });
    T(s, d, { x: bx, y: by + 0.55, w: 2.5, h: 0.3, fontSize: 12, color: col, align: "center" });
  }
  arrow(s, cx0 - 1.55, cy0 - 1.35, 3.1, 0, K.dim, 1.5);
  arrow(s, cx0 + 2.9, cy0 - 0.8, 0, 1.6, K.dim, 1.5);
  arrow(s, cx0 + 1.6, cy0 + 1.35, -3.1, 0, K.dim, 1.5);
  arrow(s, cx0 - 2.9, cy0 + 0.8, 0, -1.6, K.dim, 1.5);
  s.addImage({ path: A("mudelar-horizontal-branco.png"), x: W - M - 1.9, y: 6.08, w: 1.9, h: 0.475, objectName: "visao-mudelar" });
  s.addImage({ path: A("bmg-services-horizontal-branco.png"), x: M, y: 6.0, w: 1.6, h: 0.64, objectName: "visao-bmg" });
  T(s, "A Mudelar entrega a obra; a BMG mantém a casa. A Olyvia guarda o histórico do cliente, do primeiro contacto à manutenção.", { x: 3.4, y: 6.12, w: 6.6, h: 0.5, fontSize: 13, color: K.muted, align: "center" });
  s.addNotes("Visão do grupo BMLAR: 'Do edifício ao lar'. Hoje a Olyvia cobre captar, vender e transformar (Mudelar). O módulo de ordens de trabalho e planos preventivos já existe e é a ponte natural para a manutenção (BMG). Esta ligação é potencial, ainda não está em uso pela BMG.");

  // 6. NÚMEROS
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Porquê" });
  head(s, "Em números", "Três meses e meio de desenvolvimento");
  const st = [["18/06", "primeira versão no repositório"], ["1 190", "alterações publicadas (aprox.)"], ["714", "alterações à base de dados"], ["4", "pessoas a desenvolver"]];
  st.forEach(([v, l], i) => {
    const x = M + i * 3.05;
    T(s, v, { x, y: 1.8, w: 2.9, h: 0.95, fontFace: HF, fontSize: 48, color: i === 1 ? K.mud : K.bone });
    T(s, l, { x, y: 2.75, w: 2.8, h: 0.3, fontSize: 13, color: K.muted });
  });
  box(s, M, 3.4, 7.6, 3.25, K.card);
  s.addChart(pres.charts.BAR, [{ name: "Alterações", labels: ["Jun", "Jul", "Ago", "Set", "Out (1–3)"], values: [65, 286, 445, 495, 36] }], {
    x: M + 0.2, y: 3.5, w: 7.2, h: 2.75, barDir: "col", showTitle: true, title: "Alterações publicadas por mês", titleFontSize: 12, titleColor: K.bone, titleFontFace: "+mn-lt",
    chartColors: [K.mudDeep], showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 11, dataLabelColor: K.bone, dataLabelFontFace: "+mn-lt",
    catAxisLabelColor: K.muted, catAxisLabelFontSize: 11, catAxisLabelFontFace: "+mn-lt", catAxisLineShow: false, valAxisHidden: true,
    valGridLine: { style: "none" }, catGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 55,
  });
  caption(s, "Inclui cópias do mesmo trabalho entre ramos.", M + 0.25, 6.28, 6);
  const quem = [["Miguel Carvalho", "base, segurança, leads, agenda, RH", K.mud], ["Rafael Gromicho", "orçamentos, stock, compras, venda direta", K.bmg], ["Ruben Carvalho", "Operações e Obras", K.coral], ["Ricardo Paiágua", "App DUC", K.oly]];
  box(s, M + 7.85, 3.4, W - 2 * M - 7.85, 3.25, K.card);
  T(s, "QUEM DESENVOLVE", { x: M + 8.2, y: 3.65, w: 4, h: 0.3, fontSize: 11, charSpacing: 4, bold: true, color: K.muted });
  quem.forEach(([nm, d, col], i) => {
    const y = 4.1 + i * 0.6;
    dot(s, M + 8.2, y + 0.1, 0.16, col);
    T(s, nm, { x: M + 8.5, y, w: 3.6, h: 0.28, fontSize: 14, bold: true, color: K.bone });
    T(s, d, { x: M + 8.5, y: y + 0.27, w: 3.6, h: 0.26, fontSize: 12, color: K.muted });
  });
  s.addNotes("Total de 1 461 commits no ramo principal; sem repetições, cerca de 1 190. O código já vinha de uma versão anterior; 18/06 é a primeira versão neste repositório. Pico de trabalho no fim de agosto.");

  // =====================================================================
  pres.addSection({ title: "Feito" });
  s = pres.addSlide({ masterName: "DIVISOR", sectionTitle: "Feito" });
  T(s, "02", { x: M, y: 1.6, w: 2, h: 1.0, fontFace: HF, fontSize: 60, color: K.mud });
  s.addText("O que já funciona", { placeholder: "title" });
  s.addText("Tudo o que se segue está em produção em www.olyvia-ai.com e a Mudelar já o usa.", { placeholder: "body" });

  // 8. PERCURSO
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Feito" });
  head(s, "O percurso do cliente", "Sete passos ligados, sem voltar a escrever nada");
  const passos = [
    [L.LuUsers, "Lead", ["Entra pelo site", "Origem detetada", "Sem repetidas"]],
    [L.LuCalendarCheck, "Visita", ["Marcada pelo cliente", "SMS e lembretes", "Comercial mais perto"]],
    [L.LuCalculator, "Orçamento", ["Catálogo e margens", "Ficha do local", "Moradas no PDF"]],
    [L.LuFileText, "Proposta", ["Numerada", "Fixa ao enviar", "Vários orçamentos"]],
    [L.LuSignature, "Contrato", ["Assinado online", "Congelado", "Stock reservado"]],
    [L.LuHardHat, "Obra", ["Criada sozinha", "Plano automático", "Equipa e datas"]],
    [L.LuHouse, "Portal", ["Cliente assina", "Descarrega PDF", "Várias empresas"]],
  ];
  const pw = (W - 2 * M) / 7;
  line(s, M + pw / 2, 2.35, pw * 6, 0, K.mudDeep, 1.5);
  for (let i = 0; i < 7; i++) {
    const [I, t, items] = passos[i];
    const cx = M + i * pw + pw / 2;
    await ic(s, I, cx - 0.42, 1.93, 0.84, i === 5 ? K.coral : K.mud, K.ink);
    T(s, t, { x: M + i * pw, y: 2.95, w: pw, h: 0.42, fontFace: HF, fontSize: 18, color: K.bone, align: "center" });
    box(s, M + i * pw + 0.08, 3.5, pw - 0.16, 1.45, K.card);
    T(s, items.join("\n"), { x: M + i * pw + 0.15, y: 3.6, w: pw - 0.3, h: 1.25, fontSize: 12, color: K.muted, align: "center", valign: "middle", paraSpaceAfter: 4 });
  }
  box(s, M, 5.3, W - 2 * M, 1.3, "2A1219", "4A1E2A");
  await icBare(s, L.LuTriangleAlert, M + 0.35, 5.68, 0.5, K.coral);
  T(s, [
    { text: "Funciona de ponta a ponta, mas ainda é pesado de usar.  ", options: { bold: true, color: K.bone } },
    { text: "No teste de 03/10 houve passos, abas e scroll a mais, e a morada da lead tem campos diferentes da do cliente. Simplificar o percurso é a proposta para depois da demo.", options: { color: K.muted } },
  ], { x: M + 1.1, y: 5.4, w: W - 2 * M - 1.4, h: 1.1, fontSize: 14, valign: "middle" });
  s.addNotes("Cada passo herda os dados do anterior: o cliente, a morada, os serviços vendidos. O ponto fraco é a experiência de uso, que o Ruben testou a 03/10.");

  // 9. LEADS — Kanban
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Feito" });
  head(s, "Captação", "Cada lead tem origem, dono e próximo passo");
  let scr = laptop(s, M + 0.15, 1.95, 6.9);
  let c = appChrome(s, scr, 1, ["Painel", "Leads", "Agenda", "Orçamentos", "Contratos", "Clientes", "Operações"]);
  T(s, "Leads · Funil Mudelar", { x: c.cx, y: c.topY + 0.09, w: 3, h: 0.2, fontSize: 9, bold: true, color: K.uiText });
  const cols = [["Nova", K.dim, [["Cozinha · Lisboa", "Google Ads"], ["WC · Almada", "Site"], ["Cozinha · Oeiras", "Instagram"]]],
    ["Qualificada", K.bmgDeep, [["WC · Cascais", "MQL · urgente"], ["Remodelação · Porto", "MQL"]]],
    ["Visita marcada", K.mudDeep, [["WC · Lisboa", "qui 10:00"], ["Cozinha · Sintra", "sex 15:30"]]],
    ["Proposta", K.olyDeep, [["WC · Amadora", "enviada"]]]];
  const kw = (c.cw - 0.3) / 4;
  cols.forEach(([nm, col, cards], i) => {
    const kx = c.cx + i * (kw + 0.1);
    dot(s, kx, c.cy + 0.04, 0.1, col);
    T(s, nm, { x: kx + 0.15, y: c.cy - 0.02, w: kw - 0.15, h: 0.2, fontSize: 8, bold: true, color: K.uiText });
    cards.forEach(([a, b], j) => {
      const ky = c.cy + 0.3 + j * 0.62;
      rrect(s, kx, ky, kw, 0.52, K.white, 0.04, { lineColor: K.uiLine });
      T(s, a, { x: kx + 0.08, y: ky + 0.07, w: kw - 0.12, h: 0.18, fontSize: 8, bold: true, color: K.uiText });
      T(s, b, { x: kx + 0.08, y: ky + 0.27, w: kw - 0.12, h: 0.18, fontSize: 7.5, color: col });
    });
  });
  caption(s, "Ecrã ilustrativo, sem dados reais.", M + 0.15, 6.45, 4);
  const lx = 7.95;
  const leadsF = [
    ["Funil por empresa", "Etapas e regras de passagem configuráveis, com qualificação MQL e SQL"],
    ["Origem automática", "Site, Google Analytics e campanhas, guardada até virar cliente"],
    ["Sem repetidos", "O formulário reconhece quem já existe; em caso de dúvida escolhe-se"],
    ["Nada se perde", "Motivo obrigatório ao perder; quem volta a contactar sobe na lista"],
    ["O Meu Dia", "Tarefas e calendário do comercial num só ecrã"],
  ];
  leadsF.forEach(([t, d], i) => {
    const y = 1.9 + i * 0.92;
    T(s, t, { x: lx, y, w: W - M - lx, h: 0.32, fontFace: HF, fontSize: 16, color: K.mud });
    T(s, d, { x: lx, y: y + 0.34, w: W - M - lx, h: 0.5, fontSize: 13, color: K.muted });
  });
  s.addNotes("Trabalho de julho a setembro (Miguel e Rafa). O funil sequencial e a reavaliação das leads quando o funil muda entraram a 18 e 22/09.");

  // 10. VISITAS — telemóvel com SMS
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Feito" });
  head(s, "Visitas", "O cliente marca, o sistema escolhe o comercial certo");
  const ph = phone(s, M + 0.3, 1.75, 4.9);
  T(s, "Mudelar", { x: ph.sx, y: ph.sy + 0.3, w: ph.sw, h: 0.25, fontSize: 10, bold: true, color: K.uiText, align: "center" });
  const bub = (t, y, h, me) => { const bw = ph.sw - 0.55; const bx = me ? ph.sx + ph.sw - bw + 0.25 - 0.1 : ph.sx + 0.12; rrect(s, bx, y, me ? 0.8 : bw, h, me ? K.mudDeep : K.white, 0.08, { lineColor: me ? K.mudDeep : K.uiLine }); T(s, t, { x: bx + 0.08, y: y + 0.05, w: (me ? 0.8 : bw) - 0.16, h: h - 0.1, fontSize: 8.5, color: me ? K.white : K.uiText, valign: "middle", align: me ? "center" : "left" }); };
  bub("A sua visita está marcada para quinta, 10:00. Responda SIM para confirmar.", ph.sy + 0.75, 0.82, false);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: ph.sx + ph.sw - 0.95, y: ph.sy + 1.7, w: 0.8, h: 0.36, rectRadius: 0.08, fill: { color: K.mudDeep }, line: { color: K.mudDeep }, objectName: "sms-resposta" });
  T(s, "SIM", { x: ph.sx + ph.sw - 0.95, y: ph.sy + 1.7, w: 0.8, h: 0.36, fontSize: 9, bold: true, color: K.white, align: "center", valign: "middle" });
  bub("Obrigado, está confirmada. Até quinta.", ph.sy + 2.25, 0.5, false);
  bub("Lembrete: amanhã às 10:00. Precisa de mudar? Use o link.", ph.sy + 2.95, 0.68, false);
  caption(s, "Mensagens ilustrativas.", M + 0.3, 6.75, 3);
  const vx = 4.3;
  const vis = [
    [L.LuMapPin, "Comercial mais perto", "Por distrito, distância real e tempo de viagem entre visitas"],
    [L.LuCalendarCheck, "Agenda que não falha", "Só oferece horas que existem; feriados, almoço e antecedência mínima"],
    [L.LuSmartphone, "SMS e confirmação", "Confirmação, lembrete e resposta do cliente, tudo automático"],
    [L.LuRoute, "Mudanças avisadas", "Reagendar avisa o cliente e move os lembretes com a visita"],
    [L.LuActivity, "Nada fica por enviar", "Ecrã de envios falhados, com reenvio"],
    [L.LuHouse, "No site da Mudelar", "Formulário e marcação embebidos na página"],
  ];
  const vw = (W - M - vx - 0.3) / 2;
  for (let i = 0; i < vis.length; i++) {
    const x = vx + (i % 2) * (vw + 0.3), y = 1.85 + Math.floor(i / 2) * 1.55;
    box(s, x, y, vw, 1.35, K.card);
    await ic(s, vis[i][0], x + 0.25, y + 0.25, 0.55, K.mud, K.ink);
    T(s, vis[i][1], { x: x + 0.95, y: y + 0.22, w: vw - 1.1, h: 0.35, fontFace: HF, fontSize: 15, color: K.bone });
    T(s, vis[i][2], { x: x + 0.95, y: y + 0.6, w: vw - 1.15, h: 0.65, fontSize: 12, color: K.muted });
  }
  s.addNotes("Agendamento integrado até 30/09 (pedidos #15 a #21). A escolha do comercial usa distância e tempo de viagem reais.");

  // 11. DOCUMENTOS
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Feito" });
  head(s, "Do orçamento ao contrato", "Documentos que não mudam depois de enviados");
  const docs = [["ORÇAMENTO", "Rascunho", K.dim], ["PROPOSTA", "Enviada", K.bmg], ["CONTRATO", "Assinado", K.mud]];
  docs.forEach(([t, stt, col], i) => {
    const x = M + 0.2 + i * 0.55, y = 1.95 + i * 0.4;
    rrect(s, x, y, 3.0, 3.9, K.white, 0.04, { lineColor: K.uiLine });
    T(s, t, { x: x + 0.25, y: y + 0.25, w: 2.5, h: 0.25, fontSize: 10, bold: true, charSpacing: 2, color: K.uiText });
    for (let k = 0; k < 5; k++) rect(s, x + 0.25, y + 0.7 + k * 0.28, 2.5 - (k % 2) * 0.6, 0.08, K.uiLine);
    if (i === 2) { line(s, x + 0.25, y + 3.2, 1.6, 0, K.uiText, 0.75); T(s, "Assinatura do cliente", { x: x + 0.25, y: y + 3.28, w: 2, h: 0.2, fontSize: 7, color: K.dim }); }
    pill(s, stt, x + 1.75, y + 0.22, 1.0, col, K.ink, 0.26, 9);
  });
  const dx2 = 5.55, dcw = (W - M - dx2 - 0.3) / 2;
  const dcols = [
    ["Orçamentos", ["Ficha técnica de cada serviço: mão de obra e materiais", "Margens visíveis só a quem tem permissão", "Preço definido à mão não é recalculado", "Morada fiscal e morada do serviço no PDF"]],
    ["Propostas e contratos", ["Numeração automática", "Acrescentar orçamentos a uma proposta enviada", "Contrato assinado fica congelado", "Ao assinar: stock abatido e pedido ao fornecedor"]],
  ];
  dcols.forEach(([t, items], i) => {
    const x = dx2 + i * (dcw + 0.3);
    T(s, t, { x, y: 1.9, w: dcw, h: 0.4, fontFace: HF, fontSize: 18, color: K.mud });
    T(s, bl(items), { x, y: 2.45, w: dcw, h: 2.4, fontSize: 13, color: K.bone, valign: "top" });
  });
  box(s, dx2, 5.0, W - M - dx2, 1.6, K.card);
  await ic(s, L.LuHouse, dx2 + 0.3, 5.3, 0.6, K.oly, K.ink);
  T(s, "Portal do cliente", { x: dx2 + 1.15, y: 5.22, w: 4, h: 0.35, fontFace: HF, fontSize: 16, color: K.bone });
  T(s, "O cliente assina ou rejeita propostas e contratos, descarrega os PDF e o processo avança sozinho. Uma conta pode ter várias empresas.", { x: dx2 + 1.15, y: 5.6, w: W - M - dx2 - 1.4, h: 0.85, fontSize: 13, color: K.muted });
  s.addNotes("Orçamentos e stock: sobretudo o Rafa. Contratos e portal: Miguel. A fuga de dados do portal foi corrigida a 01/10.");

  // 12. FICHA DO LOCAL
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Feito" });
  head(s, "Levantamento na visita", "A casa descrita em campos fechados, não em texto livre");
  const fichas = [
    ["EXTERIOR", "O edifício e os acessos", K.bmg, [["Acesso", ["Fácil", "Difícil"], 0], ["Estacionamento", ["Pago", "Grátis", "Sem"], 0], ["Elevador", ["Sim", "Não"], 0], ["Andar", ["3.º de 5"], 0]]],
    ["INTERIOR", "A casa", K.oly, [["Tipologia", ["T2", "T3", "T4"], 1], ["Habitada na obra", ["Sim", "Não"], 0], ["Canalização", ["Ferro", "PVC", "Multicam."], 0], ["Amianto", ["Sim", "Não", "Não sei"], 1]]],
    ["ÁREA DE INTERVENÇÃO", "A casa de banho ou cozinha", K.mud, [["Medidas", ["6,2 m²", "perím. 10 m"], 0], ["Distância à entrada", ["Curta", "Média", "Longa"], 1], ["Onde se fazem cortes", ["Na área", "Varanda", "Fora"], 2], ["Janela", ["Sim", "Não"], 0]]],
  ];
  const fw = (W - 2 * M - 0.6) / 3;
  fichas.forEach(([t, d, col, rows], i) => {
    const x = M + i * (fw + 0.3);
    box(s, x, 1.85, fw, 4.0, K.card);
    T(s, t, { x: x + 0.3, y: 2.05, w: fw - 0.6, h: 0.28, fontSize: 11, charSpacing: 3, bold: true, color: col });
    T(s, d, { x: x + 0.3, y: 2.35, w: fw - 0.6, h: 0.3, fontSize: 13, color: K.muted });
    rows.forEach(([lab, opts, sel], j) => {
      const y = 2.85 + j * 0.72;
      T(s, lab, { x: x + 0.3, y, w: fw - 0.6, h: 0.24, fontSize: 11, color: K.bone });
      let ox = x + 0.3;
      opts.forEach((o, k) => {
        const ow = Math.max(0.62, o.length * 0.085 + 0.3);
        rrect(s, ox, y + 0.28, ow, 0.3, k === sel ? col : K.card2, 0.15, { lineColor: k === sel ? col : "3A3A3A" });
        T(s, o, { x: ox, y: y + 0.28, w: ow, h: 0.3, fontSize: 10, color: k === sel ? K.ink : K.muted, align: "center", valign: "middle", bold: k === sel });
        ox += ow + 0.08;
      });
    });
  });
  T(s, [
    { text: "Porque importa: ", options: { bold: true, color: K.mud } },
    { text: "estes campos alimentam o plano da obra (as medidas multiplicam os tempos) e, a seguir, o orçamento: proteções, deslocação e estacionamento discriminados.", options: { color: K.muted } },
  ], { x: M, y: 6.05, w: W - 2 * M, h: 0.5, fontSize: 14 });
  s.addNotes("Pedido na reunião de 02/10: poucos campos, fechados, opcionais por agora. Exterior e interior ficam na morada (02/10); a área de intervenção fica no diagnóstico da necessidade (03/10). Valores mostrados são exemplos.");

  // 13. PLANEAMENTO — Gantt
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Feito" });
  head(s, "Operações · planeamento automático", "O plano da obra faz-se sozinho, a partir do contrato");
  const gx = M, gy = 1.85, gw2 = 8.6, gh2 = 4.6;
  box(s, gx, gy, gw2, gh2, K.card);
  const labW = 2.45, days = 10, dayW = (gw2 - labW - 0.3) / days;
  const dnames = ["seg", "ter", "qua", "qui", "sex", "seg", "ter", "qua", "qui", "sex"];
  dnames.forEach((d, i) => { T(s, d, { x: gx + labW + i * dayW, y: gy + 0.18, w: dayW, h: 0.22, fontSize: 9, color: K.dim, align: "center" }); if (i) line(s, gx + labW + i * dayW, gy + 0.45, 0, gh2 - 0.6, "262626", 0.5); });
  const tasks = [
    ["Proteções e preparação", 0, 0.5, K.bmg], ["Demolição", 0.5, 1, K.bmg],
    ["Canalização", 1.5, 1, K.oly], ["Eletricidade", 1.5, 0.8, K.oly],
    ["Impermeabilização", 2.5, 0.5, K.mud], ["Secagem (espera)", 3, 1, "4A4A4A"],
    ["Revestimento de parede", 4, 1.8, K.mud], ["Pavimento", 5.8, 1, K.mud],
    ["Loiças e torneiras", 6.8, 1, K.coral], ["Limpeza e vistoria", 7.8, 0.6, K.coral],
  ];
  const rh = (gh2 - 0.65) / tasks.length;
  tasks.forEach(([t, st0, du, col], i) => {
    const y = gy + 0.55 + i * rh;
    T(s, t, { x: gx + 0.25, y, w: labW - 0.3, h: rh, fontSize: 10.5, color: K.bone, valign: "middle" });
    rrect(s, gx + labW + st0 * dayW, y + rh * 0.2, du * dayW, rh * 0.6, col, 0.05);
  });
  caption(s, "Ilustrativo: casa de banho média, plano em paralelo dentro de cada fase.", gx, gy + gh2 + 0.08, 7);
  const rx = gx + gw2 + 0.35, rw = W - M - rx;
  const plan = [
    ["52", "serviços com tempos padrão na Mudelar"],
    ["168", "passos de casa de banho e cozinha"],
    ["4", "fases, com tarefas em paralelo"],
  ];
  plan.forEach(([v, l], i) => {
    const y = 1.85 + i * 1.05;
    T(s, v, { x: rx, y, w: rw, h: 0.65, fontFace: HF, fontSize: 38, color: K.mud });
    T(s, l, { x: rx, y: y + 0.62, w: rw, h: 0.3, fontSize: 12, color: K.muted });
  });
  T(s, bl(["Esperas de secagem e feriados contados", "Medidas da visita ajustam os tempos", "Extras encaixam no pacote vendido", "Pessoas livres atribuídas, choques avisados"]), { x: rx, y: 5.05, w: rw, h: 1.5, fontSize: 12, color: K.bone, valign: "top" });
  s.addNotes("Em produção desde 03/10. A obra nasce do contrato com os serviços vendidos; o motor usa tempos padrão propostos por nós (aguardam validação da equipa de obra) e aprende com os tempos reais.");

  // 14. NO TERRENO — telemóvel do técnico
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Feito" });
  head(s, "No terreno", "O técnico regista, o supervisor valida, o sistema aprende");
  const p2 = phone(s, M + 0.3, 1.75, 4.9);
  T(s, "A MINHA TAREFA", { x: p2.sx + 0.2, y: p2.sy + 0.35, w: p2.sw - 0.4, h: 0.2, fontSize: 7.5, charSpacing: 2, bold: true, color: K.dim });
  T(s, "Revestimento de parede", { x: p2.sx + 0.2, y: p2.sy + 0.58, w: p2.sw - 0.4, h: 0.3, fontSize: 11, bold: true, color: K.uiText });
  T(s, "WC · Lisboa · fase 3", { x: p2.sx + 0.2, y: p2.sy + 0.88, w: p2.sw - 0.4, h: 0.2, fontSize: 8.5, color: K.dim });
  rrect(s, p2.sx + 0.2, p2.sy + 1.25, p2.sw - 0.4, 0.95, K.white, 0.08, { lineColor: K.uiLine });
  T(s, "02:14:35", { x: p2.sx + 0.2, y: p2.sy + 1.32, w: p2.sw - 0.4, h: 0.55, fontFace: HF, fontSize: 24, color: K.uiText, align: "center" });
  T(s, "previsto 06:00", { x: p2.sx + 0.2, y: p2.sy + 1.85, w: p2.sw - 0.4, h: 0.2, fontSize: 8, color: K.dim, align: "center" });
  const btn = (t, y, col, fg) => { rrect(s, p2.sx + 0.2, y, p2.sw - 0.4, 0.38, col, 0.08); T(s, t, { x: p2.sx + 0.2, y, w: p2.sw - 0.4, h: 0.38, fontSize: 9.5, bold: true, color: fg, align: "center", valign: "middle" }); };
  btn("Concluir tarefa", p2.sy + 2.4, K.mudDeep, K.white);
  btn("Tirar foto", p2.sy + 2.88, K.white, K.uiText);
  btn("Reportar atraso", p2.sy + 3.36, "FBE3E8", "B3213F");
  caption(s, "Ecrã ilustrativo.", M + 0.3, 6.75, 3);
  const steps2 = [
    [L.LuClock, "Relógio por tarefa", "Começar, pausar e concluir no telemóvel; o tempo real fica registado"],
    [L.LuSmartphone, "Fotos e atrasos", "Fotos em cada tarefa; um atraso pede justificação e nova estimativa"],
    [L.LuCircleCheck, "Validação", "O supervisor valida o trabalho e recebe alertas de atraso"],
    [L.LuChartGantt, "Previsto contra real", "Gantt por dia, semana ou mês, com o plano original por baixo"],
  ];
  for (let i = 0; i < steps2.length; i++) {
    const y = 1.85 + i * 1.18;
    box(s, 4.3, y, W - M - 4.3, 1.0, K.card);
    await ic(s, steps2[i][0], 4.55, y + 0.2, 0.6, i === 2 ? K.coral : K.mud, K.ink);
    T(s, steps2[i][1], { x: 5.4, y: y + 0.15, w: 6, h: 0.35, fontFace: HF, fontSize: 16, color: K.bone });
    T(s, steps2[i][2], { x: 5.4, y: y + 0.52, w: W - M - 5.6, h: 0.35, fontSize: 13, color: K.muted });
  }
  s.addNotes("Módulo de Obras publicado a 01/10; atrasos, alertas ao supervisor e plano original no Gantt a 02/10. Para a demo faltam dados de exemplo na Mudelar (tarefas validadas e extras).");

  // 15. BASE
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Feito" });
  head(s, "A base", "O que não se vê, mas segura tudo");
  const base = [
    [L.LuShieldCheck, "Segurança e RGPD", "Cada empresa só vê os seus dados. NIF cifrado, histórico de cada alteração, direito ao esquecimento, lixo recuperável.", K.mud],
    [L.LuPackage, "Stock e compras", "Vários fornecedores por produto com histórico de preços, inventário com a câmara, receções parciais, prazos por fornecedor.", K.bmg],
    [L.LuReceipt, "Venda direta", "Aceitação no portal com código, proforma, PDF, registo da fatura e custo e margem internos.", K.oly],
    [L.LuGauge, "Planos e limites", "Teste de 14 dias, limites por plano, créditos de IA com custo real registado. Pagamentos prontos a ativar.", K.mud],
    [L.LuFolderOpen, "App DUC", "Documento Único de Cliente: etapas, Kanban, chat, link público, PDF e colaboradores externos.", K.bmg],
    [L.LuActivity, "Monitorização", "Erros e falhas silenciosas reportados, alertas de nova sessão, limites contra abusos.", K.oly],
  ];
  const bw = (W - 2 * M - 0.6) / 3, bh = 2.25;
  for (let i = 0; i < base.length; i++) {
    const [I, t, d, col] = base[i];
    const x = M + (i % 3) * (bw + 0.3), y = 1.85 + Math.floor(i / 3) * (bh + 0.25);
    box(s, x, y, bw, bh, K.card);
    await ic(s, I, x + 0.3, y + 0.3, 0.6, col, K.ink);
    T(s, t, { x: x + 1.1, y: y + 0.33, w: bw - 1.3, h: 0.5, fontFace: HF, fontSize: 17, color: K.bone, valign: "middle" });
    T(s, d, { x: x + 0.3, y: y + 1.1, w: bw - 0.6, h: 1.0, fontSize: 12.5, color: K.muted, valign: "top" });
  }
  s.addNotes("Segurança e RGPD: Miguel, junho e julho. Stock, compras e venda direta: Rafa, agosto e setembro (fora do âmbito das Operações, mas no CRM). App DUC: Ricardo Paiágua, em olyvia-ai.com/duc-app.");

  // =====================================================================
  pres.addSection({ title: "Potencial" });
  s = pres.addSlide({ masterName: "DIVISOR", sectionTitle: "Potencial" });
  T(s, "03", { x: M, y: 1.6, w: 2, h: 1.0, fontFace: HF, fontSize: 60, color: K.mud });
  s.addText("O potencial", { placeholder: "title" });
  s.addText("O que a Olyvia pode valer para o grupo quando estiver a ser usada todos os dias.", { placeholder: "body" });

  // 17. DADOS COMO ATIVO — ciclo
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Potencial" });
  head(s, "Dados próprios", "Cada obra torna a próxima mais certa");
  const fc = { x: 3.55, y: 4.2 }, rad = 1.75;
  dot(s, fc.x - 1.05, fc.y - 1.05, 2.1, K.card2);
  T(s, "Dados\nque ninguém\nmais tem", { x: fc.x - 1.0, y: fc.y - 0.6, w: 2.0, h: 1.2, fontFace: HF, fontSize: 15, color: K.mud, align: "center", valign: "middle" });
  const fly = [["Visita", "ficha do local e medidas", 0, -1], ["Orçamento", "preço com risco real", 1, 0], ["Obra", "tempos reais por tarefa", 0, 1], ["Motor", "ajusta os tempos padrão", -1, 0]];
  fly.forEach(([t, d, ux, uy], i) => {
    const bx = fc.x + ux * (rad + 0.55) - 0.95, by = fc.y + uy * (rad + 0.1) - 0.42;
    box(s, bx, by, 1.9, 0.84, K.card, K.mudDeep);
    T(s, t, { x: bx, y: by + 0.08, w: 1.9, h: 0.35, fontFace: HF, fontSize: 15, color: K.bone, align: "center" });
    T(s, d, { x: bx, y: by + 0.45, w: 1.9, h: 0.3, fontSize: 10.5, color: K.muted, align: "center" });
  });
  arrow(s, fc.x + 0.95, fc.y - 1.85, 0.95, 1.0, K.mudDeep, 1.5);
  arrow(s, fc.x + 1.9, fc.y + 0.45, -0.95, 1.0, K.mudDeep, 1.5);
  arrow(s, fc.x - 0.95, fc.y + 1.85, -0.95, -1.0, K.mudDeep, 1.5);
  arrow(s, fc.x - 1.9, fc.y - 0.45, 0.95, -1.0, K.mudDeep, 1.5);
  const ganhos = [
    ["Orçamentos mais certos", "O custo de uma casa difícil (acesso, estacionamento, mobília) passa a estar no preço, não na margem perdida."],
    ["Prazos que se cumprem", "Os tempos deixam de ser estimativas: vêm de obras reais, por tipo de casa e de área."],
    ["Melhor uso das equipas", "Quem está livre, quando, e onde: o plano encaixa as obras sem choques."],
    ["Um ativo do grupo", "Fotografias, medidas e tempos de centenas de casas, bem organizados. Ninguém no setor os tem."],
  ];
  ganhos.forEach(([t, d], i) => {
    const y = 1.85 + i * 1.18;
    T(s, t, { x: 7.0, y, w: W - M - 7.0, h: 0.36, fontFace: HF, fontSize: 17, color: K.mud });
    T(s, d, { x: 7.0, y: y + 0.38, w: W - M - 7.0, h: 0.7, fontSize: 13, color: K.muted });
  });
  s.addNotes("Ideia da reunião de 02/10: dados bem parametrizados são um ativo (a analogia do Pokémon Go). O motor de aprendizagem já existe; o ganho cresce com o uso. A ligação da ficha do local ao preço ainda está por decidir.");

  // 18. MANUTENÇÃO BMG
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Potencial" });
  head(s, "Do lar ao edifício", "A mesma plataforma pode servir a manutenção da BMG", K.bmg);
  const mflow = [
    [L.LuHardHat, "Obra concluída", "Mudelar", K.mud],
    [L.LuPackage, "Equipamentos", "registados no local do cliente", K.bmg],
    [L.LuCalendarCheck, "Plano preventivo", "gera ordens sozinho", K.bmg],
    [L.LuSmartphone, "Técnico no local", "checklist, fotos, relatório", K.bmg],
  ];
  const mw = (W - 2 * M - 3 * 0.45) / 4;
  for (let i = 0; i < mflow.length; i++) {
    const [I, t, d, col] = mflow[i];
    const x = M + i * (mw + 0.45);
    box(s, x, 1.95, mw, 2.0, K.card, i === 0 ? "1F3B33" : "1E2A55");
    await ic(s, I, x + 0.3, 2.2, 0.65, col, K.ink);
    T(s, t, { x: x + 0.3, y: 3.0, w: mw - 0.5, h: 0.4, fontFace: HF, fontSize: 16, color: K.bone });
    T(s, d, { x: x + 0.3, y: 3.4, w: mw - 0.5, h: 0.35, fontSize: 12.5, color: K.muted });
    if (i < 3) arrow(s, x + mw + 0.05, 2.95, 0.35, 0, K.dim, 2);
  }
  box(s, M, 4.3, 6.0, 2.3, K.card);
  T(s, "JÁ EXISTE NAS OPERAÇÕES", { x: M + 0.35, y: 4.5, w: 5, h: 0.28, fontSize: 11, charSpacing: 3, bold: true, color: K.mud });
  T(s, bl(["Locais, equipamentos, medições e checklists", "Planos preventivos que geram ordens de trabalho", "Ordens atribuídas, agendadas e respondidas no telemóvel", "Custos, orçamentado contra gasto e relatório PDF"]), { x: M + 0.35, y: 4.9, w: 5.4, h: 1.6, fontSize: 13, color: K.bone, valign: "top" });
  box(s, M + 6.3, 4.3, W - 2 * M - 6.3, 2.3, "121A33", "1E2A55");
  T(s, "O QUE FALTA PARA A BMG", { x: M + 6.65, y: 4.5, w: 5, h: 0.28, fontSize: 11, charSpacing: 3, bold: true, color: K.bmg });
  T(s, bl(["Integrar o trabalho de setembro: QR nos equipamentos, rota do dia, assinatura no telemóvel, sem rede", "Avisos no sino e agenda a contar com férias", "Um piloto: um edifício, um técnico, uma semana"]), { x: M + 6.65, y: 4.9, w: W - 2 * M - 7.0, h: 1.6, fontSize: 13, color: K.bone, valign: "top" });
  s.addNotes("Potencial, não em uso: o módulo de ordens de trabalho ao estilo Infraspeak foi publicado a 31/08. O piloto 'um edifício, um técnico, uma semana' está proposto em operacao-app/docs/onde-estamos.md. A BMG ainda não foi envolvida.");

  // 19. PRODUTO
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Potencial" });
  head(s, "Para lá do grupo", "Já preparada para outras empresas", K.oly);
  const prod = [
    [L.LuUsers, "Várias empresas", "Cada empresa vê só os seus dados, com a sua marca nos emails"],
    [L.LuGauge, "Planos e limites", "Leads, utilizadores, propostas e contratos limitados por plano, com avisos"],
    [L.LuClock, "Teste grátis", "14 dias para experimentar, sem registo aberto no login"],
    [L.LuCreditCard, "Pagamentos", "Stripe preparado, por ativar"],
    [L.LuActivity, "IA com custo controlado", "Créditos por plano e custo real registado"],
    [L.LuHouse, "Portal e app DUC", "O cliente final também usa a plataforma"],
  ];
  const pcw = (W - 2 * M - 0.6) / 3;
  for (let i = 0; i < prod.length; i++) {
    const [I, t, d] = prod[i];
    const x = M + (i % 3) * (pcw + 0.3), y = 1.85 + Math.floor(i / 3) * 1.55;
    box(s, x, y, pcw, 1.35, K.card);
    await ic(s, I, x + 0.25, y + 0.25, 0.55, K.oly, K.ink);
    T(s, t, { x: x + 0.95, y: y + 0.22, w: pcw - 1.1, h: 0.35, fontFace: HF, fontSize: 15, color: K.bone });
    T(s, d, { x: x + 0.95, y: y + 0.6, w: pcw - 1.15, h: 0.65, fontSize: 12, color: K.muted });
  }
  box(s, M, 5.1, W - 2 * M, 1.5, "1D1530", "3A2A66");
  T(s, [
    { text: "O caminho: ", options: { bold: true, color: K.oly } },
    { text: "provar a Olyvia na Mudelar, depois na BMG, e só então abrir a outras empresas de remodelação e manutenção. Cada empresa nova paga a plataforma e enriquece os dados.", options: { color: K.bone } },
  ], { x: M + 0.4, y: 5.2, w: W - 2 * M - 0.8, h: 1.3, fontSize: 16, valign: "middle" });
  s.addNotes("Factos: multiempresa com isolamento de dados, limites por plano (15–22/09), teste de 14 dias (julho), Stripe preparado mas não ativo, créditos de IA (21/08). A página de faturação ficou de fora da integração de 30/09. Vender a terceiros é uma decisão estratégica, não está em curso.");

  // =====================================================================
  pres.addSection({ title: "Onde estamos" });
  s = pres.addSlide({ masterName: "DIVISOR", sectionTitle: "Onde estamos" });
  T(s, "04", { x: M, y: 1.6, w: 2, h: 1.0, fontFace: HF, fontSize: 60, color: K.mud });
  s.addText("Onde estamos", { placeholder: "title" });
  s.addText("O trabalho em curso, o que falta e as datas que já estão fixadas.", { placeholder: "body" });

  // 21. EM CURSO
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Onde estamos" });
  head(s, "Em curso", "Cinco frentes desenvolvidas, ainda fora da plataforma");
  const cur = [
    ["RH", "Assiduidade e ponto com localização, férias, contratos, fardamento, processamento salarial", "Miguel", "104 alterações por integrar", "Decidir quando integrar", K.mud],
    ["Faturação", "Página de faturação e pagamentos por Stripe", "A confirmar", "Ficou de fora em 30/09", "Decidir a ativação", K.oly],
    ["Orçamento V2", "Da medida da casa à quantidade de material, automaticamente", "Equipa", "Diagnóstico feito, falta o motor", "Rácios reais da Mudelar", K.coral],
    ["Operações v2", "QR nos equipamentos, rota do dia, assinatura no telemóvel, sem rede", "Ruben", "Feito em set., por integrar", "Integrar ou abandonar", K.bmg],
    ["Stock", "Receção por código, packs, catálogo do fornecedor", "Rafa", "≈ 17 alterações por integrar", "Concluir e integrar", K.bmg],
  ];
  const hy = 1.85;
  [["FRENTE", M + 0.3], ["O QUE É", M + 2.4], ["QUEM", M + 7.0], ["ESTADO", M + 8.35], ["PRÓXIMO PASSO", M + 10.25]].forEach(([t, x]) => T(s, t, { x, y: hy, w: 2.2, h: 0.25, fontSize: 10, charSpacing: 3, bold: true, color: K.dim }));
  cur.forEach(([f, d, q, e, p, col], i) => {
    const y = hy + 0.38 + i * 0.86;
    box(s, M, y, W - 2 * M, 0.74, K.card);
    dot(s, M + 0.3, y + 0.3, 0.14, col);
    T(s, f, { x: M + 0.55, y, w: 1.8, h: 0.74, fontFace: HF, fontSize: 15, color: K.bone, valign: "middle" });
    T(s, d, { x: M + 2.4, y, w: 4.4, h: 0.74, fontSize: 12, color: K.muted, valign: "middle" });
    T(s, q, { x: M + 7.0, y, w: 1.3, h: 0.74, fontSize: 12.5, color: K.bone, valign: "middle" });
    T(s, e, { x: M + 8.35, y, w: 1.8, h: 0.74, fontSize: 12, color: K.muted, valign: "middle" });
    T(s, p, { x: M + 10.25, y, w: 1.75, h: 0.74, fontSize: 12.5, bold: true, color: col, valign: "middle" });
  });
  s.addNotes("Fonte: ramos do repositório fora do ramo principal, a 03/10. O ramo de Operações de setembro não está confirmado como abandonado. A pessoa responsável pela faturação não foi identificada no levantamento.");

  // 22. ROADMAP
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Onde estamos" });
  head(s, "O que falta", "Três horizontes, por ordem");
  const hz = [
    ["ATÉ À DEMO", "07/10", K.coral, ["Dados de exemplo na Mudelar para Validar e Métricas", "Textos em inglês nos ecrãs da demo", "Testes de ponta a ponta a 5 e 6/10"]],
    ["PRÓXIMA FASE", "data a definir", K.mud, ["Ficha do local no orçamento: proteções e deslocação discriminadas", "Tempos padrão validados pela equipa de obra", "Fotos da área de intervenção na visita", "Simplificar o percurso lead → cliente"]],
    ["A SEGUIR", "data a definir", K.bmg, ["Dados do local ao marmorista, com a data da obra", "Pessoas por especialidade e capacidade no plano", "Prazos dos materiais a condicionar a obra", "Avisos no sino e agenda com férias"]],
  ];
  const hw = (W - 2 * M - 0.6) / 3;
  hz.forEach(([t, d, col, items], i) => {
    const x = M + i * (hw + 0.3);
    box(s, x, 1.85, hw, 4.75, K.card);
    rect(s, x + 0.3, 2.15, 0.5, 0.05, col);
    T(s, t, { x: x + 0.3, y: 2.3, w: hw - 0.6, h: 0.3, fontSize: 12, charSpacing: 3, bold: true, color: col });
    T(s, d, { x: x + 0.3, y: 2.62, w: hw - 0.6, h: 0.4, fontFace: HF, fontSize: 20, color: K.bone });
    T(s, bl(items, { paraSpaceAfter: 12 }), { x: x + 0.3, y: 3.3, w: hw - 0.6, h: 3.1, fontSize: 13.5, color: K.muted, valign: "top" });
    if (i < 2) arrow(s, x + hw + 0.04, 4.2, 0.22, 0, K.dim, 1.5);
  });
  s.addNotes("A lista vem da reunião de Operações de 02/10 e da documentação do projeto. Só a demo tem data.");

  // 23. CALENDÁRIO
  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Onde estamos" });
  head(s, "Calendário", "Quatro datas fixadas; as restantes saem desta reunião");
  const mk = [["03/10", "Planeamento automático em produção", "FEITO", K.mud], ["05–06/10", "Testes de ponta a ponta", "PREVISTO", K.bmg], ["06/10", "Reunião de administração", "HOJE", K.white], ["07/10", "Apresentação e demo", "PREVISTO", K.coral], ["?", "Datas por frente, com responsável", "POR FIXAR", K.dim]];
  const tw = (W - 2 * M) / mk.length;
  line(s, M + tw / 2, 3.35, tw * (mk.length - 1), 0, "3A3A3A", 2);
  mk.forEach(([d, t, stt, col], i) => {
    const cx = M + i * tw + tw / 2;
    T(s, d, { x: M + i * tw, y: 2.15, w: tw, h: 0.75, fontFace: HF, fontSize: 30, color: i === 4 ? K.dim : K.bone, align: "center" });
    dot(s, cx - 0.17, 3.18, 0.34, col);
    pill(s, stt, cx - 0.7, 3.8, 1.4, col, K.ink, 0.3, 10);
    T(s, t, { x: M + i * tw + 0.15, y: 4.3, w: tw - 0.3, h: 0.9, fontSize: 14, color: K.muted, align: "center", valign: "top" });
  });
  box(s, M, 5.45, W - 2 * M, 1.15, K.card);
  T(s, [
    { text: "Proposta: ", options: { bold: true, color: K.mud } },
    { text: "cada responsável traz uma data de conclusão para a sua frente até ao fim da semana da demo. Nenhuma data está nos documentos do projeto e não as inventámos.", options: { color: K.bone } },
  ], { x: M + 0.35, y: 5.5, w: W - 2 * M - 0.7, h: 1.05, fontSize: 15, valign: "middle" });
  s.addNotes("Datas fixadas: testes 5–6/10, esta reunião a 06/10, apresentação a 07/10.");

  // =====================================================================
  pres.addSection({ title: "Decisões" });
  s = pres.addSlide({ masterName: "DIVISOR", sectionTitle: "Decisões" });
  T(s, "05", { x: M, y: 1.6, w: 2, h: 1.0, fontFace: HF, fontSize: 60, color: K.coral });
  s.addText("Decisões que pedimos", { placeholder: "title" });
  s.addText("Seis pontos que desbloqueiam a próxima fase.", { placeholder: "body" });

  s = pres.addSlide({ masterName: "ESCURO", sectionTitle: "Decisões" });
  head(s, "Para decidir hoje", "Seis decisões da administração", K.coral);
  const dec = [
    ["Impacto da ficha do local no preço", "Percentagem fixa por parâmetro, ou definida por quem preenche? Com responsabilização na comissão?"],
    ["Armazém de referência", "Ponto de partida para quilómetros, combustível e estacionamento no orçamento."],
    ["RH e faturação", "Integrar na plataforma e quando; ativar os pagamentos."],
    ["Rácios reais da Mudelar", "Quem fornece as quantidades por medida que o Orçamento V2 precisa."],
    ["Simplificar o percurso", "Mandato para cortar passos e ecrãs entre lead e cliente depois da demo."],
    ["Datas e piloto BMG", "Uma data por frente, com responsável; avançar ou não com o piloto de manutenção."],
  ];
  const dw = (W - 2 * M - 0.3) / 2, dh = 1.38;
  dec.forEach(([t, d], i) => {
    const x = M + (i % 2) * (dw + 0.3), y = 1.85 + Math.floor(i / 2) * (dh + 0.2);
    box(s, x, y, dw, dh, K.card);
    T(s, String(i + 1).padStart(2, "0"), { x: x + 0.3, y: y + 0.25, w: 0.9, h: 0.7, fontFace: HF, fontSize: 32, color: K.coral });
    T(s, t, { x: x + 1.25, y: y + 0.22, w: dw - 1.5, h: 0.4, fontFace: HF, fontSize: 17, color: K.bone });
    T(s, d, { x: x + 1.25, y: y + 0.65, w: dw - 1.5, h: 0.65, fontSize: 13, color: K.muted, valign: "top" });
  });
  s.addNotes("1 e 2 vêm da reunião de Operações de 02/10. 3: ramos por integrar. 4: etapa bloqueante do Orçamento V2. 5: teste do percurso a 03/10. 6: nenhuma frente tem data; o piloto BMG está proposto na documentação de Operações.");

  // FECHO
  pres.addSection({ title: "Fecho" });
  s = pres.addSlide({ masterName: "CAPA", sectionTitle: "Fecho" });
  s.addImage({ path: A("bmlar-group-horizontal-branco.png"), x: M, y: 0.6, w: 2.4, h: 0.84, objectName: "fecho-bmlar" });
  T(s, "Do edifício ao lar,\nnuma só plataforma.", { x: M, y: 2.3, w: 10, h: 2.0, fontFace: HF, fontSize: 48, color: K.white });
  T(s, "Obrigado. Perguntas e decisões.", { x: M, y: 4.45, w: 8, h: 0.5, fontSize: 20, color: K.bone });
  rrect(s, M, 5.6, 2.4, 0.85, K.white, 0.12);
  s.addImage({ path: A("olyvia-t.png"), x: M + 0.25, y: 5.72, w: 1.9, h: 0.63, objectName: "fecho-olyvia" });
  s.addImage({ path: A("mudelar-horizontal-branco.png"), x: M + 3.0, y: 5.78, w: 2.0, h: 0.5, objectName: "fecho-mudelar" });
  s.addImage({ path: A("bmg-services-horizontal-branco.png"), x: M + 5.6, y: 5.65, w: 1.9, h: 0.76, objectName: "fecho-bmg" });
  s.addNotes("Fecho. Retomar as decisões que ficarem em aberto.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("ok", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
