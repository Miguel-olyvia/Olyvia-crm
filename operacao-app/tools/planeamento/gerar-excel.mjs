/**
 * A folha "Planeamento - tempos padrão casa de banho e cozinha.xlsx", a partir
 * de dados.mjs: tarefas com os tempos (editáveis), plano calculado por fórmulas
 * (início/fim por dependências e esperas), Gantt, extras, perguntas e
 * medidas de referência. Foi esta folha que a equipa validou a 03/10/2026.
 *
 *   npm i --no-save exceljs
 *   node tools/planeamento/gerar-excel.mjs "Planeamento - tempos padrão.xlsx"
 */

const OUT = process.argv[2];
if (!OUT) {
  console.error("Uso: node tools/planeamento/gerar-excel.mjs <saida.xlsx>");
  process.exit(1);
}
let ExcelJS;
try {
  ExcelJS = (await import("exceljs")).default;
} catch {
  console.error("Falta a biblioteca exceljs (não é dependência da app). Corre: npm i --no-save exceljs");
  process.exit(1);
}

import { FASES, MEDIDAS, LISTA_MEDIDAS, WC, COZ, EXTRAS } from './dados.mjs';

const PERGUNTAS = [
  ['Tempos', 'Os tempos das colunas amarelas são uma proposta nossa. Vêm dos dias por fase do manual e dos exemplos que já estão na aplicação. Validar tarefa a tarefa: "OK" ou corrigir o valor. O plano e o Gantt recalculam-se sozinhos. Depois de a aplicação estar em uso, o motor corrige estes tempos com os tempos reais.'],
  ['Medidas', 'Os pacotes vendem-se com quantidade 1, sem medidas. Para os tempos usámos uma casa de banho média (≈ 2 × 2 m, revestimento até ao teto) e uma cozinha média (10 m²). Os dias do manual (15–19 e 20–26) são para que tamanho?'],
  ['Curas', 'Com as curas do próprio manual (48 h da betonilha, 24 h da cola, 1 dia antes da montagem), a fase 3 só cabe nos 5–7 dias se o teto e a pintura forem feitos durante a cura da betonilha e o azulejo for a dois. É assim que trabalham?'],
  ['Folgas', 'Os marcos do manual (dia 19 e dia 26) não somam as 2 folgas, e a soma dos mínimos das fases dá 14 e 19 dias, não 15 e 20. As folgas são as curas, ou somam-se a elas?'],
  ['Secagem', 'Quanto tempo depois de impermeabilizar se pode assentar azulejo?'],
  ['Paralelo', 'Canalizador e eletricista trabalham ao mesmo tempo na mesma casa de banho? Quantas pessoas cabem numa casa de banho de cada vez?'],
  ['Testes WC', 'Criámos a tarefa 2.4 (ensaios e fecho de roços) na casa de banho, que no manual só existe na cozinha. Está certo?'],
  ['Pacote', '"Levantamento de Sanitários e Mobiliário" vende-se como extra em 133 dos 566 orçamentos de Remodelação Completa de casa de banho. A desmontagem (1.2) está incluída no pacote ou não?'],
  ['Bancada', 'Bancada de pedra: com 5 dias de fabrico depois de medir, a fase 4 da cozinha passa os 5–7 dias do manual. O marmorista pode medir pelo projeto antes da obra (como se falou na reunião)? Quantos dias de fabrico?'],
  ['Gás', 'O técnico credenciado ITG é da casa ou subcontratado? Com quantos dias de antecedência se marca? A certificação tem data própria?'],
  ['Entulho', 'O manual diz "a partir do ponto 3.3 é responsabilidade do armazém". Que ponto é? Até onde vai a equipa de obra?'],
  ['Materiais', 'Quem faz o levantamento de materiais (armazém ou equipa)? Com quantos dias de antecedência? Ocupa tempo da equipa de obra?'],
  ['Modelos parciais', 'Os modelos parciais de casa de banho (0, 1, 2, 3) venderam 529 vezes. A coluna "Modelos parciais" propõe que tarefas entram em cada um. Está certo?'],
  ['Cozinha', 'Na cozinha, a impermeabilização é em toda a área ou só nas zonas húmidas?'],
  ['Ofícios', 'A plataforma tem 8 especialidades sem ninguém associado. Faltam Gás (ITG), Marmorista e Logística. Quem tem cada ofício?'],
  ['Variantes', 'Casa de Banho "Social" e "Comum": que diferença faz nas tarefas e nos tempos? E o "Modelo Simples de Mudança de Mobiliário - Cozinha" (151 vendas): que tarefas tem?'],
];

const AMARELO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const CINZA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
const CALC = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const FONTE = { name: 'Arial', size: 10 };
const AZUL = { argb: 'FF0000FF' };
const linha = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const borda = { top: linha, bottom: linha, left: linha, right: linha };

function cabecalho(ws, nomes, larguras, preencher = [], calc = []) {
  ws.columns = nomes.map((n, i) => ({ header: n, width: larguras[i] }));
  const r = ws.getRow(1);
  r.eachCell((c, i) => {
    c.font = { ...FONTE, bold: true };
    c.fill = preencher.includes(i) ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } } : calc.includes(i) ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } } : CINZA;
    c.alignment = { wrapText: true, vertical: 'middle' };
    c.border = borda;
  });
  r.height = 40;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function estilo(ws, { preencher = [], azul = [], calc = [] } = {}) {
  ws.eachRow((row, n) => {
    if (n === 1) return;
    row.eachCell({ includeEmpty: true }, (c, i) => {
      c.font = { ...FONTE, ...(azul.includes(i) ? { color: AZUL } : {}) };
      c.alignment = { wrapText: true, vertical: 'top' };
      c.border = borda;
      if (preencher.includes(i)) c.fill = AMARELO;
      else if (calc.includes(i)) c.fill = CALC;
    });
  });
}


  const wb = new ExcelJS.Workbook();
  wb.creator = 'Olyvia';
  wb.calcProperties.fullCalcOnLoad = true;

  // ---- Leia-me
  const lm = wb.addWorksheet('Leia-me');
  lm.getColumn(1).width = 26; lm.getColumn(2).width = 110;
  [
    ['Tempos padrão — remodelação de casa de banho e de cozinha', ''],
    ['', ''],
    ['Para que serve', 'Pôr o planeamento automático das obras a funcionar já, com tempos padrão por tarefa. Depois, com o uso da aplicação, o motor corrige cada tempo com os tempos reais registados pelas equipas, por tipo de tarefa e pelas suas características.'],
    ['De onde vêm as tarefas', 'Dos dois manuais operacionais, compactados: tarefas repetidas juntas, ordem corrigida, curas separadas. A coluna "Alteração face ao manual" explica cada mudança.'],
    ['De onde vêm os tempos', 'Proposta nossa: os dias por fase dos manuais, os tempos dos exemplos que já estão na aplicação e as medidas de referência da folha "Parâmetros". Cada tarefa diz a base na coluna "Base da estimativa".'],
    ['Como se lê um tempo', 'Horas-pessoa = horas fixas + horas por medida × medida de referência. Dias de trabalho = horas-pessoa ÷ pessoas ÷ 8 h. Exemplo: azulejo da casa de banho = 2 h + 1,0 h/m² × 22 m² = 24 horas-pessoa; a dois, 1,5 dias.'],
    ['O que validar (amarelo)', 'Pessoas, horas fixas, horas por medida e medida: estão preenchidas com a proposta (letra azul). Se estiver certo, escrever "OK" em "Validação"; se não, mudar o valor e escrever "Alterado". As colunas cinzentas calculam-se sozinhas, tal como as folhas "Fases" e "Gantt".'],
    ['Plano', 'Início e fim são dias úteis desde o arranque. Cada tarefa começa quando acabam as tarefas de que depende, mais a espera (24 h ≈ 1 dia). Não conta ainda com feriados nem com a disponibilidade das pessoas: isso é o motor que faz.'],
    ['Folhas', '"Tarefas" (validar), "Fases" (comparação com o manual), "Gantt" (o plano em barras), "Extras" (serviços vendidos junto com os pacotes), "Perguntas", "Parâmetros" (medidas de referência).'],
  ].forEach(l => lm.addRow(l));
  lm.eachRow((row, n) => row.eachCell(c => { c.font = { ...FONTE, bold: n === 1 || c.col === 1 }; c.alignment = { wrapText: true, vertical: 'top' }; }));
  lm.getCell('A1').font = { ...FONTE, size: 14, bold: true };

  const fimPa = 3 + Object.values(MEDIDAS).flat().length;
  const HD = "'Parâmetros'!$D$2";
  const PK = `'Parâmetros'!$A$4:$A$${fimPa}`;
  const PV = `'Parâmetros'!$D$4:$D$${fimPa}`;


  // ---- Tarefas
  const ta = wb.addWorksheet('Tarefas');
  const colsT = ['Pacote', 'Cód.', 'Tarefa', 'Fase', 'Ofício', 'Depende de', 'Espera antes (h)', 'Origem da espera', 'Condição', 'Quem executa', 'Alteração face ao manual',
    'Pessoas', 'Horas fixas', 'Horas por medida', 'Medida', 'Base da estimativa', 'Modelos parciais (proposta)', 'Validação', 'Observações',
    'Medida de referência', 'Horas-pessoa', 'Dias de trabalho', 'Início (dia útil)', 'Fim (dia útil)', 'Chave', 'Dep 1', 'Dep 2', 'Dep 3'];
  const PRE = [12, 13, 14, 15, 18, 19];
  const CAL = [20, 21, 22, 23, 24];
  cabecalho(ta, colsT, [13, 6, 38, 20, 13, 11, 9, 26, 20, 20, 42, 8, 8, 9, 15, 40, 18, 11, 24, 10, 10, 9, 9, 9, 4, 4, 4, 4], PRE, CAL);
  const todas = [...WC.map(t => ['Casa de banho', ...t]), ...COZ.map(t => ['Cozinha', ...t])];
  todas.forEach((t, i) => {
    const r = i + 2;
    const [pac, cod, nome, fase, oficio, deps, espera, origem, cond, quem, alt, pes, fix, var_, med, base, parciais] = t;
    const d = [deps[0] || '', deps[1] || '', deps[2] || ''];
    const inicio = r === 2 ? `N(G${r})/24` :
      `MAX(0,${['Z', 'AA', 'AB'].map(c => `IFERROR(INDEX($X$2:$X$${r - 1},MATCH($A${r}&"|"&${c}${r},$Y$2:$Y$${r - 1},0)),0)`).join(',')})+N(G${r})/24`;
    ta.addRow([pac, cod, nome, FASES[fase], oficio, deps.join(', '), espera || null, origem, cond, quem, alt,
      pes, fix, var_, med, base, parciais, null, null,
      { formula: `IF(O${r}="só fixo",0,IFERROR(INDEX(${PV},MATCH(A${r}&"|"&O${r},${PK},0)),0))` },
      { formula: `IF(L${r}="","",N(M${r})+N(N${r})*T${r})` },
      { formula: `IF(OR(U${r}="",N(L${r})=0),"",U${r}/L${r}/${HD})` },
      { formula: inicio },
      { formula: `W${r}+N(V${r})` },
      { formula: `A${r}&"|"&B${r}` }, d[0], d[1], d[2]]);
  });
  estilo(ta, { preencher: PRE, azul: [12, 13, 14, 15], calc: CAL });
  const fimT = todas.length + 1;
  for (let r = 2; r <= fimT; r++) {
    ta.getCell(`T${r}`).numFmt = 'General'; ta.getCell(`U${r}`).numFmt = '0.0';
    ['V', 'W', 'X'].forEach(c => { ta.getCell(`${c}${r}`).numFmt = '0.0'; });
    ta.getCell(`O${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: [`"${LISTA_MEDIDAS.join(',')}"`] };
    ta.getCell(`L${r}`).dataValidation = { type: 'whole', operator: 'between', allowBlank: false, formulae: [1, 10] };
    ta.getCell(`R${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"OK,Alterado,Retirar"'] };
  }
  ['Y', 'Z', 'AA', 'AB'].forEach(c => { ta.getColumn(c).hidden = true; });
  ta.autoFilter = { from: 'A1', to: `X${fimT}` };

  // ---- Fases
  const fa = wb.addWorksheet('Fases');
  cabecalho(fa, ['Pacote', 'Fase', 'Manual: dias (mín.)', 'Manual: dias (máx.)', 'Proposta: começa no dia', 'Proposta: acaba no dia', 'Proposta: duração (dias úteis)', 'Dentro do manual?'],
    [14, 36, 11, 11, 12, 12, 13, 14], [], [5, 6, 7, 8]);
  const manual = { 'Casa de banho': [[2, 3], [4, 5], [5, 7], [3, 4]], 'Cozinha': [[3, 4], [5, 7], [6, 8], [5, 7]] };
  const tot = { 'Casa de banho': [15, 19], 'Cozinha': [20, 26] };
  let r = 2;
  for (const [pac, fases] of Object.entries(manual)) {
    fases.forEach(([mn, mx], i) => {
      fa.addRow([pac, FASES[i + 1], mn, mx,
        { formula: `_xlfn.MINIFS(Tarefas!$W$2:$W$${fimT},Tarefas!$A$2:$A$${fimT},A${r},Tarefas!$D$2:$D$${fimT},B${r})` },
        { formula: `_xlfn.MAXIFS(Tarefas!$X$2:$X$${fimT},Tarefas!$A$2:$A$${fimT},A${r},Tarefas!$D$2:$D$${fimT},B${r})` },
        { formula: `F${r}-E${r}` },
        { formula: `IF(G${r}<C${r},"abaixo",IF(G${r}>D${r},"acima","sim"))` }]);
      r++;
    });
    fa.addRow([pac, 'Obra completa', tot[pac][0], tot[pac][1], 0,
      { formula: `_xlfn.MAXIFS(Tarefas!$X$2:$X$${fimT},Tarefas!$A$2:$A$${fimT},A${r})` },
      { formula: `F${r}-E${r}` },
      { formula: `IF(G${r}<C${r},"abaixo",IF(G${r}>D${r},"acima","sim"))` }]);
    r++;
  }
  estilo(fa, { calc: [5, 6, 7, 8] });
  for (let i = 2; i < r; i++) {
    ['E', 'F', 'G'].forEach(c => { fa.getCell(`${c}${i}`).numFmt = '0.0'; });
    if (fa.getCell(`B${i}`).value === 'Obra completa') fa.getRow(i).eachCell(c => { c.font = { ...FONTE, bold: true }; });
  }
  fa.addRow([]);
  const nf = fa.addRow(['', 'As fases sobrepõem-se onde há trabalho em paralelo (logística, teto durante a cura). "Obra completa" do manual = 15–19 dias (casa de banho) e 20–26 (cozinha), sem as 2 folgas.']);
  fa.mergeCells(`B${nf.number}:H${nf.number}`);
  nf.getCell(2).font = { ...FONTE, italic: true }; nf.getCell(2).alignment = { wrapText: true }; nf.height = 30;

  // ---- Gantt
  const ga = wb.addWorksheet('Gantt');
  const DIAS = 32;
  ga.columns = [{ width: 13 }, { width: 6 }, { width: 38 }, { width: 7 }, { width: 7 }, { width: 7 }, ...Array.from({ length: DIAS }, () => ({ width: 3.2 }))];
  const hg = ga.addRow(['Pacote', 'Cód.', 'Tarefa', 'Início', 'Fim', 'Espera', ...Array.from({ length: DIAS }, (_, i) => i + 1)]);
  hg.eachCell(c => { c.font = { ...FONTE, bold: true }; c.fill = CINZA; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  todas.forEach((_, i) => {
    const s = i + 2, g = i + 2;
    const row = [{ formula: `Tarefas!A${s}` }, { formula: `Tarefas!B${s}` }, { formula: `Tarefas!C${s}` }, { formula: `Tarefas!W${s}` }, { formula: `Tarefas!X${s}` }, { formula: `N(Tarefas!G${s})/24` }];
    for (let dIdx = 1; dIdx <= DIAS; dIdx++) {
      const col = ga.getColumn(6 + dIdx).letter;
      row.push({ formula: `IF(AND($D${g}<${col}$1,$E${g}>${col}$1-1),1,IF(AND($F${g}>0,$D${g}-$F${g}<${col}$1,$D${g}>${col}$1-1),2,""))` });
    }
    ga.addRow(row);
  });
  ga.eachRow((row, n) => { if (n > 1) row.eachCell({ includeEmpty: true }, (c, i) => { c.font = { ...FONTE, size: i > 6 ? 7 : 10 }; c.alignment = { vertical: 'middle', horizontal: i > 6 ? 'center' : 'left' }; if (i > 3 && i < 7) c.numFmt = '0.0'; }); });
  const ultCol = ga.getColumn(6 + DIAS).letter;
  ga.addConditionalFormatting({ ref: `G2:${ultCol}${fimT}`, rules: [
    { type: 'cellIs', operator: 'equal', formulae: ['1'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF4472C4' } }, font: { color: { argb: 'FF4472C4' } } } },
    { type: 'cellIs', operator: 'equal', formulae: ['2'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF4B183' } }, font: { color: { argb: 'FFF4B183' } } } },
  ] });
  ga.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  ga.addRow([]);
  const lg = ga.addRow(['', '', 'Azul = trabalho; laranja = espera (cura, fabrico). Uma coluna = um dia útil desde o arranque.']);
  lg.getCell(3).font = { ...FONTE, italic: true };

  // ---- Extras
  const ex = wb.addWorksheet('Extras');
  cabecalho(ex, ['Pacote', 'Serviço do catálogo', 'Nº orçamentos com o pacote', 'Qt mediana', 'Unidade', 'Encaixe sugerido (tarefa)', 'Nota', 'Ofício', 'Pessoas', 'Horas fixas', 'Horas por unidade', 'Horas p/ qt mediana', 'Validação', 'Observações'],
    [13, 50, 12, 9, 8, 16, 40, 13, 8, 8, 9, 10, 11, 24], [9, 10, 11, 13, 14], [12]);
  EXTRAS.forEach((e, i) => {
    const r2 = i + 2;
    const [pac, serv, n, qt, un, enc, nota, of, fix, var_] = e;
    ex.addRow([pac, serv, n, qt, un, enc, nota, of, 1, fix, var_, { formula: `N(J${r2})+N(K${r2})*D${r2}` }, null, null]);
  });
  estilo(ex, { preencher: [9, 10, 11, 13, 14], azul: [9, 10, 11], calc: [12] });
  for (let i = 2; i <= EXTRAS.length + 1; i++) { ex.getCell(`L${i}`).numFmt = '0.0'; ex.getCell(`M${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"OK,Alterado,Retirar"'] }; }
  ex.autoFilter = { from: 'A1', to: `N${EXTRAS.length + 1}` };
  ex.addRow([]);
  const ne = ex.addRow(['', 'Fonte: linhas de orçamento em produção (03/10/2026) que aparecem em pelo menos 5 orçamentos com "MO Modelo Remodelação Completa" (566 de casa de banho, 168 de cozinha). Sem a taxa de deslocação. Tempos: estimativa nossa.']);
  ne.getCell(2).font = { ...FONTE, italic: true };

  // ---- Perguntas
  const pe = wb.addWorksheet('Perguntas');
  cabecalho(pe, ['Nº', 'Tema', 'Pergunta', 'Resposta'], [5, 16, 95, 50], [4]);
  PERGUNTAS.forEach((p, i) => pe.addRow([i + 1, ...p, null]));
  estilo(pe, { preencher: [4] });

  // ---- Parâmetros (A: chave escondida, B: pacote, C: medida, D: valor, E: de onde vem)
  const pa = wb.addWorksheet('Parâmetros');
  pa.columns = [{ width: 4 }, { width: 16 }, { width: 22 }, { width: 10 }, { width: 100 }];
  pa.addRow(['', 'Parâmetro', '', 'Valor', 'De onde vem']);
  pa.addRow(['', 'Horas de trabalho por dia', '', 8, 'O planeamento usa 480 minutos por dia (ops_obra.minutos_por_dia).']);
  pa.addRow(['Chave', 'Pacote', 'Medida', 'Valor', 'De onde vem']);
  for (const [pac, ms] of Object.entries(MEDIDAS)) for (const [m, v, o] of ms) pa.addRow([`${pac}|${m}`, pac, m, v, o]);
  if (pa.rowCount !== fimPa) throw new Error("fimPa");
  pa.eachRow((row, n) => row.eachCell({ includeEmpty: true }, c => {
    c.font = { ...FONTE, bold: n === 1 || n === 3 };
    c.alignment = { wrapText: true, vertical: 'top' };
    if (n === 1 || n === 3) c.fill = CINZA;
    if ((n === 2 || n > 3) && c.col === 4) { c.fill = AMARELO; c.font = { ...FONTE, color: AZUL }; }
  }));
  pa.getColumn(1).hidden = true;
  wb.worksheets.forEach(w => { w.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }; });
  await wb.xlsx.writeFile(OUT);
  console.log('ok', todas.length, 'tarefas', EXTRAS.length, 'extras', PERGUNTAS.length, 'perguntas');
