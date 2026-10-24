// O trabalho na obra, dia a dia (21/10/2026).
// · As instruções de cada tarefa (o que levar, o passo a passo, o que verificar, a proteção), pelo ofício e pelo nome da tarefa:
//   o técnico vê-as no Hoje dele e marca os passos à medida que os faz.
// · Os registos (envios) do técnico, por dia: as horas, as fotografias e a descrição. Cada envio fica no histórico da tarefa,
//   com a validação ou o pedido de correção do responsável de obra; o cliente vê o histórico no portal (sem horas nem custos).
// · Os ajustes ao plano com a obra em curso: o que se pode mexer (só o que ainda não foi validado e não ficou para trás),
//   a pré-visualização do efeito (sem mexer no plano) e o texto do aviso ao cliente.
import { TECS, type Negocio, type Plano, type Tarefa } from "./motor";
import { fimDe, guardarBase, inicioMinimo, mudarDuracao, mudarHoras, mudarInicio } from "./ajustesPlano";
import { estadoDe } from "./obraOps";
import { rotuloDia } from "./preparacaoObra";

/* ------------------------------------------------------------------ as instruções */
export interface Instrucoes {
  /** O que deixar pronto antes de começar (proteções, cortes de água ou luz). */
  antes: string[];
  /** O passo a passo; o técnico marca cada um. */
  passos: string[];
  /** O que verificar antes de dar por feita (e o que fotografar). */
  verificar: string[];
  /** A proteção individual. */
  epi: string[];
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MODELOS: { re: RegExp; i: Instrucoes }[] = [
  {
    re: /demol|remoc|picar|desmont/,
    i: {
      antes: ["Proteger o chão e o caminho até à porta (cartão e plástico)", "Fechar a água e desligar o disjuntor da divisão", "Confirmar onde fica o contentor ou os sacos de entulho"],
      passos: ["Retirar as louças, os móveis e os acessórios", "Picar o azulejo e o reboco solto até ao tijolo", "Levantar o pavimento antigo", "Ensacar o entulho e levá-lo ao contentor", "Limpar e aspirar a divisão"],
      verificar: ["Paredes sem restos de cola nem azulejo", "Tubos e caixas à vista, sem danos", "Fotografia de cada parede no fim"],
      epi: ["Óculos", "Máscara FFP2", "Luvas", "Protetores auriculares", "Botas de biqueira"],
    },
  },
  {
    re: /canaliz|agua|esgoto|tubag/,
    i: {
      antes: ["Fechar a água geral e avisar o cliente", "Ter à mão o desenho dos pontos de água"],
      passos: ["Marcar os pontos de água às alturas do desenho", "Abrir os roços", "Passar o tubo multicamada e prensar as uniões", "Ligar o esgoto com a pendente certa", "Fazer o ensaio de pressão (30 minutos)", "Fotografar os tubos à vista antes de fechar", "Fechar os roços"],
      verificar: ["Ensaio sem perda de pressão", "Sem fugas nas uniões", "Pontos à altura e na posição do desenho"],
      epi: ["Óculos", "Luvas", "Botas de biqueira"],
    },
  },
  {
    re: /revest|pavim|azulej|ceram|ladrilh/,
    i: {
      antes: ["Confirmar que a canalização está validada e os roços fechados", "Ver o cerâmico na obra: modelo, lote e quantidade", "Verificar o nível e o prumo das paredes"],
      passos: ["Impermeabilizar a zona do duche", "Marcar a esquadria e a primeira fiada com o nível laser", "Colar com cimento-cola, em dupla colagem nas peças grandes", "Fazer os cortes (tomadas, tubos, cantos)", "Deixar secar e betumar as juntas", "Limpar o cerâmico"],
      verificar: ["Juntas alinhadas e da mesma largura", "Peças sem som oco ao bater", "Remates nos cantos e à volta dos tubos", "Fotografia de cada parede e do chão"],
      epi: ["Óculos", "Joelheiras", "Luvas", "Protetores auriculares (corte)"],
    },
  },
  {
    re: /louc|acabam|mont|sanita|base de duche|torneir/,
    i: {
      antes: ["Confirmar que o revestimento está validado e as juntas secas", "Abrir as caixas e ver se as peças estão inteiras"],
      passos: ["Montar a estrutura e a sanita suspensa", "Assentar a base de duche e ligar o ralo", "Montar as torneiras e o chuveiro", "Selar com silicone", "Testar as descargas e procurar fugas", "Retirar as proteções e limpar a divisão"],
      verificar: ["Sem fugas com a água aberta 10 minutos", "Descargas e torneiras a funcionar", "Silicone contínuo e limpo", "Fotografia final da divisão inteira"],
      epi: ["Luvas", "Óculos (furação)"],
    },
  },
  {
    re: /eletr|luz|tomada|quadro/,
    i: {
      antes: ["Desligar o disjuntor do circuito e confirmar sem tensão"],
      passos: ["Marcar caixas e tomadas", "Passar os tubos e os cabos", "Ligar as tomadas e os pontos de luz", "Testar o circuito e o diferencial"],
      verificar: ["Tudo a funcionar com o disjuntor ligado", "Tampas e espelhos direitos"],
      epi: ["Luvas isolantes", "Óculos"],
    },
  },
  {
    re: /pint|teto|estuque/,
    i: {
      antes: ["Proteger o chão, os móveis e as janelas"],
      passos: ["Reparar fissuras e lixar", "Aplicar o primário", "Pintar a primeira demão", "Pintar a segunda demão", "Retirar as proteções e limpar"],
      verificar: ["Cor uniforme, sem marcas de rolo", "Remates limpos nos cantos e rodapés"],
      epi: ["Óculos", "Máscara (lixagem)", "Luvas"],
    },
  },
];
const GERAL: Instrucoes = {
  antes: ["Proteger o chão e o caminho até à porta", "Confirmar o material na obra"],
  passos: ["Preparar a zona de trabalho", "Fazer o trabalho como no orçamento", "Limpar e arrumar"],
  verificar: ["Trabalho como combinado com o cliente", "Fotografia do resultado"],
  epi: ["Luvas", "Botas de biqueira"],
};
/** No fim de cada dia, em todas as tarefas. */
export const FIM_DO_DIA = ["Arrumar a ferramenta na carrinha", "Deixar a zona limpa e segura", "Fechar a porta e entregar a chave como combinado"];

export function instrucoesDe(t: Pick<Tarefa, "nome" | "sk"> & { corrige?: number; nota?: string }): Instrucoes {
  // 21/10: uma correção tem as instruções do pedido do responsável
  if (t.corrige != null) {
    const base = instrucoesDe({ nome: t.nome.replace(/^Correção · /, ""), sk: t.sk });
    return { antes: ["Ler o pedido do responsável de obra", "Ver as fotografias que enviou antes"], passos: [`Corrigir: ${t.nota ?? "o que o responsável pediu"}`, "Verificar o resultado com o que foi pedido", "Limpar a zona"], verificar: ["O pedido do responsável está resolvido", ...base.verificar.slice(0, 1), "Fotografia do resultado, no mesmo enquadramento"], epi: base.epi };
  }
  const s = sem(t.nome + " " + t.sk);
  return MODELOS.find((m) => m.re.test(s))?.i ?? GERAL;
}

/* ------------------------------------------------------------------ os registos (envios) */
export interface Envio {
  /** Quando ("qua 15/10 17:40"). */
  q: string;
  /** O dia do plano. */
  dia: number;
  quem: string;
  /** registo: o registo de um dia; feita: o último, que pede a validação; validada / correcao: o responsável de obra. */
  k: "registo" | "feita" | "validada" | "correcao";
  horas?: number;
  fotos?: string[];
  nota?: string;
  /** Os passos que ficaram feitos neste envio. */
  passos?: string[];
}

export const enviosDe = (t: Tarefa): Envio[] => t.exec?.envios ?? [];
/** Os passos do passo a passo já marcados (índices). */
export const passosFeitos = (t: Tarefa): number[] => t.exec?.passos ?? [];
/** O dia da tarefa (1.º, 2.º…) no dia `dia` do plano, ou null fora dela. */
export function diaDaTarefa(t: Tarefa, dia: number): number | null {
  return dia >= t.dia && dia < t.dia + t.dur ? dia - t.dia + 1 : null;
}
/** As horas previstas por dia (o registo anda de meia em meia hora). */
export function horasPorDia(t: Tarefa): number {
  return Math.max(0.5, Math.round((t.h / Math.max(1, t.dur)) * 2) / 2);
}
/** Já há registo do técnico neste dia? */
export const registouNoDia = (t: Tarefa, dia: number) => enviosDe(t).some((e) => e.dia === dia && (e.k === "registo" || e.k === "feita"));
/** O texto do dia da tarefa: "2.º de 3 dias" ou "dia único". */
export function rotuloDiaTarefa(t: Tarefa, dia: number): string {
  const k = diaDaTarefa(t, dia);
  if (k == null) return "";
  return t.dur === 1 ? "dia único" : `${k}.º de ${t.dur} dias`;
}
/** O que se passou num dia do plano: as tarefas desse dia (todas, incluindo as validadas) e os envios feitos nele. */
export function oDia(p: Plano, dia: number): { ti: number; t: Tarefa; envios: Envio[] }[] {
  return p.tasks.map((t, ti) => ({ ti, t, envios: enviosDe(t).filter((e) => e.dia === dia) }))
    .filter(({ t, envios }) => diaDaTarefa(t, dia) != null || envios.length > 0);
}
/** Em que tempo está o dia em relação a "hoje" do plano. */
export function tempoDoDia(p: Plano, dia: number): "passado" | "hoje" | "futuro" {
  if (p.estado === "concluída") return "passado";
  if (p.estado !== "em curso") return "futuro";
  return dia < p.dia ? "passado" : dia === p.dia ? "hoje" : "futuro";
}

/* ------------------------------------------------------------------ o Hoje do técnico */
export interface TrabalhoHoje { d: Negocio; ti: number; t: Tarefa }
/** As tarefas de um técnico no dia de hoje de cada obra em curso (o protótipo não tem relógio: cada obra tem o seu dia). */
export function trabalhoDoTecnico(deals: Negocio[], tec: string, desvio = 0): TrabalhoHoje[] {
  const L: TrabalhoHoje[] = [];
  for (const d of deals) {
    const p = d.obra.plano;
    if (d.perdido || !p || p.estado !== "em curso") continue;
    const dia = p.dia + desvio;
    p.tasks.forEach((t, ti) => {
      if (t.tec !== tec || diaDaTarefa(t, dia) == null) return;
      // a tarefa que está a ser corrigida sai do Hoje: o técnico trabalha na tarefa de correção
      if (p.tasks.some((x) => x.corrige === ti && estadoDe(x) !== "validada")) return;
      // hoje: as que não estão validadas; amanhã: todas as que ocupam o dia
      if (desvio === 0 && estadoDe(t) === "validada") return;
      L.push({ d, ti, t });
    });
  }
  return L;
}
/** Os técnicos que têm trabalho hoje em alguma obra (para escolher "quem sou"). */
export function tecnicosComTrabalho(deals: Negocio[]): string[] {
  return TECS.map((x) => x.id).filter((id) => trabalhoDoTecnico(deals, id).length > 0);
}
/** 21/10: o que vem a seguir para o técnico (as tarefas que ainda não começaram) e o trabalho que tem de acabar antes:
 *  a tarefa que termina mais perto do início da dele (de preferência de outro técnico), para ele saber quando é a vez dele. */
export interface ASeguir extends TrabalhoHoje { antes: { ti: number; t: Tarefa } | null; faltam: number }
export function aSeguirDoTecnico(deals: Negocio[], tec: string, max = 4): ASeguir[] {
  const L: ASeguir[] = [];
  for (const d of deals) {
    const p = d.obra.plano;
    if (d.perdido || !p || p.estado !== "em curso") continue;
    p.tasks.forEach((t, ti) => {
      if (t.tec !== tec || t.dia <= p.dia || estadoDe(t) === "validada") return;
      let antes: ASeguir["antes"] = null;
      p.tasks.forEach((x, xi) => {
        if (xi === ti || x.dia + x.dur > t.dia) return;
        if (!antes) { antes = { ti: xi, t: x }; return; }
        const a = antes.t, fx = x.dia + x.dur, fa = a.dia + a.dur;
        // acaba mais tarde; no empate, a de outro técnico e a que está a decorrer hoje
        const pontos = (y: Tarefa) => (y.tec !== tec ? 2 : 0) + (diaDaTarefa(y, p.dia) != null ? 1 : 0);
        if (fx > fa || (fx === fa && pontos(x) > pontos(a))) antes = { ti: xi, t: x };
      });
      L.push({ d, ti, t, antes, faltam: t.dia - p.dia });
    });
  }
  return L.sort((a, b) => a.faltam - b.faltam).slice(0, max);
}

/* ------------------------------------------------------------------ os ajustes com a obra em curso */
export interface Alteracao {
  q: string;
  /** O dia do plano em que se decidiu. */
  dia: number;
  quem: string;
  /** O que mudou, em frase ("Revestimento e pavimento: 2 → 3 dias"). */
  t: string;
  motivo: string;
  /** O fim da obra antes e depois (rótulos). */
  fimAntes: string; fimDepois: string;
  /** O cliente foi avisado no portal. */
  cliente: boolean;
  /** O texto que o cliente vê no portal. */
  avisoCliente?: string;
}
/** dur em dias úteis, ou h em horas úteis (21/10: as tarefas curtas ajustam-se à hora). */
export interface AjusteVivo { dur?: number; h?: number; dia?: number; tec?: string }
export const MOTIVOS_AJUSTE = ["Imprevisto na obra", "Pedido do cliente", "Material atrasado", "Técnico indisponível", "Mais rápido do que previsto"] as const;

/** O que se pode mexer numa tarefa com a obra em curso: nada nas validadas; o início só nas que ainda não começaram (e não para trás de hoje). */
export function podeAjustar(p: Plano, ti: number): { dur: boolean; inicio: boolean; tec: boolean; porque?: string } {
  const t = p.tasks[ti];
  if (!t || p.estado !== "em curso") return { dur: false, inicio: false, tec: false, porque: "Só com a obra em curso." };
  if (estadoDe(t) === "validada") return { dur: false, inicio: false, tec: false, porque: "Esta tarefa já está validada." };
  if (t.dia + t.dur <= p.dia) return { dur: true, inicio: false, tec: false, porque: "Os dias desta tarefa já passaram: pode prolongá-la." };
  const comecou = t.dia <= p.dia;
  return { dur: true, inicio: !comecou, tec: !comecou || estadoDe(t) === "por fazer" };
}
/** A duração mínima com a obra em curso: não acaba antes de hoje. */
export function duracaoMinima(p: Plano, ti: number): number {
  const t = p.tasks[ti];
  return t.dia <= p.dia ? Math.max(1, p.dia - t.dia + 1) : 1;
}
/** O início mínimo com a obra em curso: não antes de hoje nem do fim da fase anterior. */
export function inicioMinimoVivo(p: Plano, ti: number): number {
  return Math.max(p.dia, inicioMinimo(p, ti));
}
/** Aplica o ajuste num plano (o verdadeiro ou uma cópia), com os limites da obra em curso. */
export function aplicarAjuste(p: Plano, ti: number, m: AjusteVivo): void {
  const P = podeAjustar(p, ti);
  if (m.dur != null && P.dur) mudarDuracao(p, ti, Math.max(duracaoMinima(p, ti), m.dur));
  // em horas: não acaba antes de hoje (as horas chegam pelo menos ao dia de hoje)
  if (m.h != null && P.dur) mudarHoras(p, ti, Math.max((duracaoMinima(p, ti) - 1) * 8 + 0.5, m.h));
  if (m.dia != null && P.inicio) mudarInicio(p, ti, Math.max(inicioMinimoVivo(p, ti), m.dia));
  if (m.tec && P.tec) p.tasks[ti].tec = m.tec;
  // o que já passou não muda: as tarefas validadas ficam onde estavam
}
/** O efeito do ajuste, sem mexer no plano: o fim antes e depois, e as tarefas que mudam de datas. */
export function preverAjuste(p: Plano, ti: number, m: AjusteVivo): { fimAntes: number; fimDepois: number; mexe: string[]; texto: string } {
  const c: Plano = JSON.parse(JSON.stringify(p));
  aplicarAjuste(c, ti, m);
  const mexe = p.tasks.map((t, i) => (i !== ti && (c.tasks[i].dia !== t.dia || c.tasks[i].dur !== t.dur) ? t.nome : "")).filter(Boolean);
  const t = p.tasks[ti], n = c.tasks[ti], partes: string[] = [];
  if (m.h != null && n.h !== t.h) partes.push(`${horasTxt(t.h)} → ${horasTxt(n.h)}${n.dur !== t.dur ? ` (${n.dur} ${n.dur === 1 ? "dia" : "dias"})` : ""}`);
  else if (n.dur !== t.dur) partes.push(`${t.dur} → ${n.dur} ${n.dur === 1 ? "dia" : "dias"}`);
  if (n.dia !== t.dia) partes.push(`começa a ${rotuloDia(c, n.dia)} (era ${rotuloDia(p, t.dia)})`);
  if (n.tec !== t.tec) partes.push(`passa para ${TECS.find((x) => x.id === n.tec)?.n ?? "outro técnico"}`);
  return { fimAntes: fimDe(p.tasks), fimDepois: fimDe(c.tasks), mexe, texto: partes.length ? `${t.nome}: ${partes.join(", ")}` : "" };
}
/**
 * 21/10: os ajustes seguidos à mesma tarefa juntam-se num só, com o efeito líquido ("Canalização: 1 → 2 dias" em vez de "1 → 3" e depois
 * "3 → 2"): o fim de antes é o do primeiro, o de depois é o do último, e os motivos juntam-se. A lista vem do mais recente para o mais antigo.
 */
export function juntarAjustes(L: Alteracao[]): (Alteracao & { n: number })[] {
  const out: (Alteracao & { n: number })[] = [];
  const nome = (a: Alteracao) => a.t.split(":")[0];
  for (const a of [...L].reverse()) {
    const ult = out[out.length - 1];
    if (ult && nome(ult) === nome(a) && !a.t.startsWith("Imprevisto")) {
      const ini = ult.t.match(/: (\S+) → /), fim = a.t.match(/ → (.+)$/);
      const t = ini && fim && ult.t.match(/ → /) && a.t.match(/: \S+ → /) ? `${nome(a)}: ${ini[1]} → ${fim[1]}` : a.t;
      const motivos = [...new Set([...ult.motivo.split(" · "), a.motivo])].join(" · ");
      out[out.length - 1] = { ...a, t, motivo: motivos, fimAntes: ult.fimAntes, n: ult.n + 1, cliente: ult.cliente || a.cliente };
    } else out.push({ ...a, n: 1 });
  }
  return out.reverse();
}
/** "5,5 h". */
export const horasTxt = (h: number) => `${String(Math.round(h * 100) / 100).replace(".", ",")} h`;
/** O aviso ao cliente, em linguagem simples (sem técnicos nem horas). */
export function textoAvisoCliente(nomeTarefa: string, motivo: string, fimAntes: string, fimDepois: string): string {
  const fim = fimAntes === fimDepois ? `A data de fim mantém-se: ${fimDepois}.` : `A obra passa a acabar a ${fimDepois} (antes: ${fimAntes}).`;
  return `Ajustámos o plano em "${nomeTarefa.toLowerCase()}" (${motivo.toLowerCase()}). ${fim}`;
}

/* ------------------------------------------------------------------ as correções (21/10) */
/** O tempo que o responsável estima para corrigir (±). */
export const TEMPOS_CORRECAO = [{ h: 2, rot: "2 h" }, { h: 4, rot: "Meio dia" }, { h: 8, rot: "1 dia" }, { h: 16, rot: "2 dias" }] as const;
/** Quando entra a correção: o que cabe num dia fica para hoje (sem atrasar); um dia ou mais começa amanhã e empurra o que vem depois. */
export function planoCorrecao(p: Plano, horas: number): { dia: number; dur: number; atraso: number } {
  if (horas < 8) return { dia: p.dia, dur: 1, atraso: 0 };
  const dur = Math.ceil(horas / 8);
  return { dia: p.dia + 1, dur, atraso: dur };
}
/** O efeito, sem mexer: o fim da obra antes e depois e as tarefas que andam. */
export function preverCorrecao(p: Plano, horas: number): { dia: number; fimAntes: number; fimDepois: number; mexe: string[] } {
  const c = planoCorrecao(p, horas), fimAntes = fimDe(p.tasks);
  const mexe = c.atraso ? p.tasks.filter((x) => estadoDe(x) !== "validada" && x.dia >= c.dia).map((x) => x.nome) : [];
  return { dia: c.dia, fimAntes, fimDepois: Math.max(fimAntes + (mexe.length ? c.atraso : 0), c.dia + c.dur), mexe };
}
/** Junta a tarefa de correção ao plano (no fim da lista, para os índices não mudarem) e empurra o que vem depois. Devolve o índice. */
export function aplicarCorrecao(p: Plano, ti: number, motivo: string, horas: number, tec: string | null): number {
  const t = p.tasks[ti], c = planoCorrecao(p, horas);
  guardarBase(p);
  if (c.atraso) p.tasks.forEach((x) => { if (estadoDe(x) !== "validada" && x.dia >= c.dia) x.dia += c.atraso; });
  p.tasks.push({ nome: `Correção · ${t.nome}`, svcs: t.svcs, dia: c.dia, dur: c.dur, sk: t.sk, h: horas, tec, fase: t.fase, nota: motivo, corrige: ti });
  return p.tasks.length - 1;
}
