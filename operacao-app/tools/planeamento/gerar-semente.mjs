/**
 * A carga dos tempos padrão (JSON) para db/obras.sql, a partir de dados.mjs.
 *
 *   node tools/planeamento/gerar-semente.mjs              → imprime o JSON
 *   node tools/planeamento/gerar-semente.mjs --escrever   → atualiza ops_obra_tempos_padrao() em db/obras.sql
 *   node tools/planeamento/gerar-semente.mjs --verificar  → falha se db/obras.sql não estiver igual aos dados
 *
 * Depois de --escrever: npm run validar-planeamento, e correr db/obras.sql na
 * produção; a seguir "Carregar tempos padrão" em cada organização (não pisa
 * modelos revistos à mão).
 *
 * As regras que aqui se aplicam aos dados:
 *   · medidas e ofícios em nomes da base ('m² total' → m2_total, 'Geral' → sem ofício);
 *   · fatores (características que mudam o ritmo) e condições (toalheiro, gás) por passo;
 *   · modelos parciais e mudança de mobiliário = subconjuntos do pacote, com as
 *     dependências que caem passadas para as delas e a espera só se as diretas ficam;
 *   · extras: um passo por âncora e por tipo de pacote; o tipo onde o extra mais se
 *     vende leva também '*' (sem pacote: tarefa normal).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WC, COZ, EXTRAS, MEDIDAS } from './dados.mjs';

const MEDIDA = {
  'só fixo': 'fixo', 'm² pavimento': 'm2_pavimento', 'm² parede': 'm2_parede', 'm² total': 'm2_total',
  'pontos de água': 'pontos_agua', 'pontos elétricos': 'pontos_eletricos', 'peças sanitárias': 'pecas_sanitarias',
  'acessórios e móveis': 'acessorios', 'módulos de móveis': 'modulos', 'eletrodomésticos': 'eletrodomesticos',
  'ml de bancada': 'ml_bancada',
};
const OFICIO = (o) => (o === 'Geral' || o === '—' ? null : o);

// Os fatores que mudam o ritmo de cada passo (para aprender por especificação).
const FATORES = {
  'casa_banho': {
    '1.1': ['habitada', 'mobilada', 'distancia'], '1.2': ['habitada'], '1.3': ['acesso'],
    '1.4': ['acesso', 'andar', 'distancia', 'elevador'], '1.5': ['acesso', 'andar', 'elevador'],
    '3.3': ['altura_revestimento', 'janela', 'local_cortes'], '4.4': ['habitada', 'mobilada'],
  },
  'cozinha': {
    '1.1': ['habitada', 'mobilada', 'distancia'], '1.3': ['habitada'], '1.4': ['acesso'],
    '1.5': ['acesso', 'andar', 'distancia', 'elevador'], '1.6': ['acesso', 'andar', 'elevador'],
    '3.3': ['janela', 'local_cortes'], '4.3': ['andar', 'elevador'], '4.6': ['habitada', 'mobilada'],
  },
};

const CONDICOES = {
  'casa_banho': { '2.3': { servicos: ['Instalação de Toalheiros Eletricos'], ficha: { campo: 'toalheiro', valores: ['true'] } } },
  'cozinha': {
    '2.3': {
      servicos: ['Instalação de Gás nas Paredes', 'Instalação de Eletrodoméstico a Gás', 'Anulação de Ponto de Gás', 'Certificação de Gás'],
      ficha: { campo: 'gas', valores: ['anular', 'manter', 'instalar', 'canalizado', 'garrafa'] },
    },
  },
};

function passos(lista, tipo) {
  return lista.map(([cod, nome, fase, oficio, deps, espera, , , , , pes, fix, vari, med]) => ({
    chave: cod, nome, fase, skill: OFICIO(oficio), depende: deps, espera: espera || 0,
    medida: MEDIDA[med], fixos: Math.round(fix * 60), por_unidade: Math.round(vari * 60 * 100) / 100,
    pessoas: pes, fatores: FATORES[tipo][cod] || [], condicao: CONDICOES[tipo][cod] || null,
  }));
}

// Um subconjunto do pacote: as dependências que caem passam para as delas
// (transitivo); a espera só fica se as dependências diretas ficaram todas.
function subconjunto(todos, chaves) {
  const por = new Map(todos.map((p) => [p.chave, p]));
  const resolve = (c, vistos = new Set()) => {
    if (chaves.includes(c)) return [c];
    if (vistos.has(c)) return [];
    vistos.add(c);
    return (por.get(c)?.depende || []).flatMap((d) => resolve(d, vistos));
  };
  return todos.filter((p) => chaves.includes(p.chave)).map((p) => {
    const todasFicam = p.depende.every((d) => chaves.includes(d));
    return { ...p, depende: [...new Set(p.depende.flatMap((d) => resolve(d)))], espera: todasFicam ? p.espera : 0 };
  });
}

const ref = (tipo) => Object.fromEntries(MEDIDAS[tipo === 'casa_banho' ? 'Casa de banho' : 'Cozinha'].map(([m, v]) => [MEDIDA[m], v]));
const wc = passos(WC, 'casa_banho');
const coz = passos(COZ, 'cozinha');
const PARCIAL = ['1.1', '1.2', '1.3', '1.4', '1.5', '3.1', '3.2', '3.3', '3.4', '4.1', '4.2', '4.4'];
const PARCIAL_TORNEIRA = [...PARCIAL, '2.1', '2.4'];
const refParcial = (parede, agua) => ({ m2_pavimento: 1, m2_parede: parede, m2_total: 1 + parede, pontos_agua: agua, pontos_eletricos: 0, pecas_sanitarias: 1, acessorios: 2 });

const pacotes = [
  { servicos: ['MO Modelo Remodelação Completa - Casa de Banho Comum', 'MO Modelo Remodelação Completa - Casa de Banho Social'],
    tipo: 'casa_banho', medidas: ref('casa_banho'), passos: wc },
  { servicos: ['MO Modelo 0 - Casa de Banho: Remoção de Poliban até 100x100 + Revestimento até 20cm'],
    tipo: 'casa_banho', medidas: refParcial(0.6, 1), passos: subconjunto(wc, PARCIAL) },
  { servicos: ['MO Modelo 1 - Casa de Banho: Remoção de Banheira ou Poliban  + Revestimento até 60cm'],
    tipo: 'casa_banho', medidas: refParcial(1.8, 1), passos: subconjunto(wc, PARCIAL) },
  { servicos: ['MO Modelo 2 - Casa de Banho: Remoção de Banheira ou Poliban  + Elevação da Torneira + Revestimento até 120cm'],
    tipo: 'casa_banho', medidas: refParcial(3.6, 1), passos: subconjunto(wc, PARCIAL_TORNEIRA) },
  { servicos: ['MO Modelo 3 - Casa de Banho: Remoção de Banheira ou Poliban  + Elevação da Torneira + Revestimento até teto'],
    tipo: 'casa_banho', medidas: refParcial(7.2, 1), passos: subconjunto(wc, PARCIAL_TORNEIRA) },
  { servicos: ['MO Modelo Remodelação Completa - Cozinha'], tipo: 'cozinha', medidas: ref('cozinha'), passos: coz },
  { servicos: ['MO Modelo Simples de Mudança de Mobiliário - Cozinha'], tipo: 'cozinha',
    medidas: { modulos: 10, eletrodomesticos: 4, ml_bancada: 3, pontos_agua: 3 },
    passos: subconjunto(coz, ['1.1', '1.3', '1.5', '1.6', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6']) },
];

// Extras: um passo por âncora; por tipo de pacote. O tipo onde o extra é mais
// vendido leva também '*' (sem pacote / outro tipo: fica uma tarefa normal).
const faseDe = (tipo, chave) => (tipo === 'casa_banho' ? wc : coz).find((p) => p.chave === chave)?.fase ?? 3;
const proxima = (tipo, chave) => {
  const l = tipo === 'casa_banho' ? wc : coz;
  const i = l.findIndex((p) => p.chave === chave);
  return l[i + 1]?.chave ?? null;
};
const semPlanear = new Set(['Deslocação Fora do Raio de 30 km (valor p/km)', 'Projeto 3D - 3 Imagens']);
const medidaPara = { 'Instalação de Eletrodomésticos de Cozinha': 'eletrodomesticos', 'Instalação de Eletrodomésticos Mudelar': 'eletrodomesticos' };

const porServico = new Map();
for (const [pac, serv, n, , , enc, , oficio, fix, vari] of EXTRAS) {
  const tipo = pac === 'Casa de banho' ? 'casa_banho' : 'cozinha';
  if (!porServico.has(serv)) porServico.set(serv, []);
  porServico.get(serv).push({ tipo, n, enc, oficio, fix, vari });
}

const extras = [];
for (const [serv, usos] of porServico) {
  if (medidaPara[serv]) continue;
  if (usos.some((u) => u.enc === 'Antes da obra')) { semPlanear.add(serv); continue; }
  const principal = [...usos].sort((a, b) => b.n - a.n)[0].tipo;
  const ps = [];
  for (const u of usos) {
    const pre = u.tipo === 'casa_banho' ? 'CB' : 'CZ';
    let ancoras;
    let m;
    if ((m = u.enc.match(/^Entre (\S+) e (\S+)$/))) ancoras = [{ modo: 'entre', alvo: [m[1], m[2]] }];
    else if ((m = u.enc.match(/^Depois de (\S+)$/))) ancoras = [{ modo: 'entre', alvo: [m[1], proxima(u.tipo, m[1])] }];
    else if (u.enc.includes('+')) ancoras = u.enc.split('+').map((x) => ({ modo: 'junta', alvo: x.trim() }));
    else ancoras = [{ modo: 'junta', alvo: u.enc.split('/')[0].trim() }];
    const k = ancoras.length;
    ancoras.forEach((a, i) => {
      const alvoFase = a.modo === 'junta' ? a.alvo : a.alvo[0];
      const enc = { [u.tipo]: a };
      if (u.tipo === principal) enc['*'] = { modo: 'livre' };
      ps.push({
        chave: `${pre}${i + 1}`, nome: k > 1 ? `${serv} (${i + 1}/${k})` : serv,
        fase: faseDe(u.tipo, alvoFase), skill: OFICIO(u.oficio), depende: i > 0 ? [`${pre}${i}`] : [], espera: 0,
        medida: 'qt', fixos: Math.round((u.fix / k) * 60), por_unidade: Math.round((u.vari / k) * 60 * 100) / 100,
        pessoas: 1, fatores: [], condicao: null, encaixe: enc,
      });
    });
  }
  extras.push({ servico: serv, passos: ps });
}

export function gerarSemente() {
  const semente = {
    versao: '2026-10-03',
    skills: ['Logística', 'Gás (ITG)', 'Marmorista', 'Demolições', 'Canalização', 'Eletricidade', 'Revestimentos', 'Pintura', 'Carpintaria'],
    pacotes,
    extras,
    sem_planear: [...semPlanear],
    medida_para: Object.entries(medidaPara).map(([servico, medida]) => ({ servico, medida })),
  };
  return semente;
}

const OBRAS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'obras.sql');
const INI = "AS $semente$ SELECT '";
const FIM = "'::jsonb $semente$;";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const json = JSON.stringify(gerarSemente());
  if (json.includes('$semente$')) throw new Error('o JSON não pode conter o delimitador');
  const modo = process.argv[2];
  if (!modo) {
    process.stdout.write(json);
  } else {
    const sql = readFileSync(OBRAS, 'utf8');
    const a = sql.indexOf(INI);
    const b = sql.indexOf(FIM, a);
    if (a < 0 || b < 0) throw new Error('não encontrei ops_obra_tempos_padrao() em db/obras.sql');
    const atual = sql.slice(a + INI.length, b).replace(/''/g, "'");
    if (modo === '--verificar') {
      if (JSON.stringify(JSON.parse(atual)) !== json) {
        console.error('✗ db/obras.sql não tem os tempos padrão de dados.mjs — corre gerar-semente.mjs --escrever');
        process.exit(1);
      }
      console.log('✓ db/obras.sql tem os tempos padrão de dados.mjs');
    } else if (modo === '--escrever') {
      writeFileSync(OBRAS, sql.slice(0, a + INI.length) + json.replace(/'/g, "''") + sql.slice(b));
      console.log('✓ db/obras.sql atualizado');
    } else {
      throw new Error('modo desconhecido: ' + modo);
    }
  }
}
