// 25/11 (Rúben: «atrasos, adiantamentos, avisar automaticamente, ajustar automaticamente… como se a plataforma estivesse viva, com
// agentes por trás»). Etapa 1 do plano «Obra Viva» (https://claude.ai/artifact/WiSr4HGRAF2JGwFs5R3HYX): os agentes no Estúdio da obra.
// Os agentes são a Olyvia com seis papéis. Cada um vigia uma coisa (os vigias são os alertas da obra e mais três olhares novos) e, conforme
// o degrau de autonomia escolhido nessa obra, só mostra, sugere, aplica sozinho se ninguém recusar até ao fim do dia útil, ou aplica logo.
// As decisões são regras (sem IA): só se aplica sozinho o que não mexe no fim da obra, não passa de 2 dias úteis e não põe um técnico em
// duas obras. O que um agente aplica vai pelas ações do motor (fica no histórico e desfaz-se). Sem SQL: o estado vive em obra.agentes.
import type { Estado, Negocio } from "../motor";
import type { ResumoEcNeg } from "../inventario/ponteNegocios";
import { alertasDaObra, type AcaoAlerta, type Nivel } from "./alertasObra";
import { estadoVivo, nomeNoPlano, replanear, type Replano } from "./planoVivo";
import { custoDaHora } from "./quemPaga";
import { rotuloDia } from "../preparacaoObra";
import { ROTULO_ALTERACAO } from "../historicoPlano";
import { fimDe } from "../ajustesPlano";

export type AgenteId = "plano" | "equipa" | "materiais" | "cliente" | "margem" | "aprendizagem";
export type Degrau = 0 | 1 | 2 | 3;

export const AGENTES: { id: AgenteId; nome: string; sigla: string; cor: string; vigia: string }[] = [
  { id: "plano", nome: "Plano", sigla: "PL", cor: "#8c6df2", vigia: "atrasos, dias sem ninguém, folga e o fim da obra" },
  { id: "equipa", nome: "Equipa", sigla: "EQ", cor: "#3aa7e8", vigia: "agendas, férias e quem está livre" },
  { id: "materiais", nome: "Materiais", sigla: "MT", cor: "#e3a03a", vigia: "entregas contra o início de cada fase" },
  { id: "cliente", nome: "Cliente", sigla: "CL", cor: "#2fbf86", vigia: "avisos ao cliente e mensagens por ler" },
  { id: "margem", nome: "Margem", sigla: "MG", cor: "#e46aa8", vigia: "horas a mais, imprevistos e quem paga" },
  { id: "aprendizagem", nome: "Aprendizagem", sigla: "AP", cor: "#8f89ad", vigia: "o que se muda sempre no plano" },
];
export const agente = (id: AgenteId) => AGENTES.find((x) => x.id === id)!;

/** O que cada degrau faz. */
export const DEGRAUS: { n: Degrau; nome: string; sub: string }[] = [
  { n: 0, nome: "Observa", sub: "Mostra o que vê. Não propõe nada." },
  { n: 1, nome: "Sugere", sub: "Propõe com o impacto. Só aplica se aceitar." },
  { n: 2, nome: "Faz com prazo", sub: "Aplica sozinho ao fim do dia útil, se ninguém recusar." },
  { n: 3, nome: "Faz sozinho", sub: "Aplica logo, dentro dos limites, e conta no resumo." },
];
/** As recomendações do plano, aceites pelo Rúben a 25/11. */
export const DEGRAUS_DE_ORIGEM: Record<AgenteId, Degrau> = { plano: 2, equipa: 2, materiais: 1, cliente: 1, margem: 1, aprendizagem: 0 };
/** O máximo de dias úteis que um agente mexe numa tarefa sem pedir (e nunca empurrando o fim). */
export const LIMITE_DIAS_SOZINHO = 2;

/** O que um agente pode aplicar sozinho: só mudanças que não empurram o fim da obra. */
// 26/11 (etapa 4, ajuste contínuo): «replanear» põe em dia um atraso pequeno ou aproveita a folga, sempre sem empurrar o fim da obra.
export type AcaoAuto = { k: "fecharBuraco"; ini: number; fim: number } | { k: "passar"; ti: number; tec: string } | { k: "replanear"; adiantar: boolean };

export interface Proposta {
  /** estável entre leituras (é por ele que se guarda quando se viu e se foi recusada) */
  id: string;
  agente: AgenteId; nivel: Nivel;
  titulo: string; sub: string;
  /** os botões (as mesmas ações dos alertas) */
  acoes: { rot: string; a: AcaoAlerta }[];
  /** quando o agente pode fazê-la sozinho (degrau 2 ou 3) */
  auto?: { acao: AcaoAuto; texto: string };
  /** só para ver (o Cliente e a Aprendizagem a observar) */
  ti?: number;
}

/** O registo do que um agente aplicou (ou do que o gestor aceitou de um agente): com as tarefas como estavam, para desfazer. */
export interface FeitoAgente { id: string; q: string; agente: AgenteId; texto: string; auto: boolean; quem: string;
  antes: { ti: number; dia: number; tec: string | null; antecipada?: true; /** 26/11: a duração, quando um replaneamento a mudou */ dur?: number }[]; desfeito?: string }
export interface EstadoAgentes {
  degraus?: Partial<Record<AgenteId, Degrau>>;
  /** quando cada proposta foi vista pela primeira vez (ISO): o prazo do degrau 2 conta daqui */
  vistos?: Record<string, string>;
  /** as propostas recusadas (não voltam enquanto a situação for a mesma) */
  recusadas?: Record<string, string>;
  feitos?: FeitoAgente[];
}

export const degrauDe = (e: EstadoAgentes | undefined, a: AgenteId): Degrau => e?.degraus?.[a] ?? DEGRAUS_DE_ORIGEM[a];

/** O agente de cada alerta da obra, pelo prefixo do id. */
function agenteDoAlerta(id: string): AgenteId {
  if (/^(conflito|sem)-/.test(id)) return "equipa";
  if (/^mat-/.test(id)) return "materiais";
  if (id === "chat") return "cliente";
  if (/^im-/.test(id)) return "margem";
  return "plano";
}

const dias = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;

/** 26/11 (etapa 4): um replaneamento que um agente pode fazer sozinho. Muda alguma coisa, o fim da obra não anda para a frente, e nenhuma
 *  tarefa muda de dia nem cresce mais do que LIMITE_DIAS_SOZINHO. Os técnicos noutra obra ou de férias já esperam no replanear. */
export function ajusteSozinho(r: Replano): boolean {
  return r.mudancas.length > 0 && r.fimDepois <= r.fimAntes
    && r.mudancas.every((m) => Math.abs(m.para.dia - m.de.dia) <= LIMITE_DIAS_SOZINHO && m.para.dur - m.de.dur <= LIMITE_DIAS_SOZINHO);
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O que os seis agentes veem nesta obra agora. As recusadas ficam de fora. */
export function propostasDosAgentes(d: Negocio, S: Pick<Estado, "deals"> & Partial<Estado>, ocup: Map<string, Set<string>>, inv?: ResumoEcNeg | null): Proposta[] {
  const p = d.obra.plano;
  if (!p || p.estado === "concluída" || p.estado === "por aprovar") return [];
  const out: Proposta[] = [];
  const vivo = p.estado === "em curso";

  // 26/11 (etapa 4, ajuste contínuo): pôr em dia e adiantar calculam-se uma vez (numa cópia do plano), só quando há atraso ou folga
  let emDia: Replano | null = null, comFolga: Replano | null = null;
  const porEmDia = () => (emDia ??= replanear(p, ocup, { adiantar: false }));
  const adiantado = () => (comFolga ??= replanear(p, ocup, { adiantar: true }));

  // 1) os alertas da obra, cada um com o seu agente; alguns podem fazer-se sozinhos
  for (const al of alertasDaObra(d, S, ocup, inv)) {
    const ag = agenteDoAlerta(al.id);
    let auto: Proposta["auto"];
    const fb = al.acoes.find((x) => x.a.k === "fecharBuraco")?.a;
    if (fb && fb.k === "fecharBuraco" && fb.fim - fb.ini + 1 <= LIMITE_DIAS_SOZINHO) auto = { acao: { k: "fecharBuraco", ini: fb.ini, fim: fb.fim }, texto: `Antecipar o que vem depois de ${dias(fb.fim - fb.ini + 1)} sem ninguém` };
    const ps = al.acoes.find((x) => x.a.k === "passar")?.a;
    if (ps && ps.k === "passar" && !p.tasks[ps.ti]?.exec) auto = { acao: { k: "passar", ti: ps.ti, tec: ps.tec }, texto: `Passar ${nomeNoPlano(p, p.tasks[ps.ti])} para ${ps.n.split(" ")[0]}` };
    let sub = al.sub;
    // 26/11 (etapa 4): um atraso pequeno absorve-se sozinho, se pôr o plano em dia não mexer no fim da obra. O que empurra o fim pede sempre.
    if (vivo && /^atraso-/.test(al.id)) {
      const r = porEmDia();
      if (ajusteSozinho(r)) auto = { acao: { k: "replanear", adiantar: false }, texto: `Pôr ${al.ti != null ? nomeNoPlano(p, p.tasks[al.ti]).toLowerCase() : "o plano"} em dia, sem mexer no fim da obra` };
      else if (r.fimDepois > r.fimAntes) sub = `${sub} O fim da obra anda ${dias(r.fimDepois - r.fimAntes)}: isto pede sempre a tua decisão.`;
    }
    // 26/11 (etapa 4): a folga aproveita-se sozinha quando cada tarefa só anda até 2 dias úteis
    if (vivo && al.id === "folga") {
      const r = adiantado();
      if (ajusteSozinho(r)) {
        const ganho = r.fimAntes - r.fimDepois, n = r.mudancas.filter((m) => m.tipo === "adiantada").length;
        auto = { acao: { k: "replanear", adiantar: true }, texto: `Adiantar ${n} ${n === 1 ? "tarefa" : "tarefas"} com a folga${ganho > 0 ? `: a obra acaba ${dias(ganho)} mais cedo` : ""}` };
      }
    }
    out.push({ id: al.id, agente: ag, nivel: al.nivel, titulo: al.t, sub, acoes: al.acoes, ...(auto ? { auto } : {}), ...(al.ti != null ? { ti: al.ti } : {}) });
  }

  // 2) Cliente: a equipa chega no próximo dia útil e o cliente ainda não foi avisado (fica o rascunho, nunca se envia sozinho)
  if (vivo) {
    const amanha = p.dia + 1;
    const chegam = p.tasks.filter((t) => t.dia === amanha && t.tec && estadoVivo(t, p) === "por começar");
    if (chegam.length) {
      const texto = `${rotuloDia(p, amanha).replace(/^./, (c) => c.toUpperCase())} a equipa vem para ${chegam.map((t) => nomeNoPlano(p, t).toLowerCase()).join(", ")}.`;
      const jaAvisado = (d.obra.alteracoes ?? []).some((a) => a.avisoCliente === texto);
      if (!jaAvisado) out.push({ id: `cliente-amanha-${amanha}`, agente: "cliente", nivel: "oportunidade", titulo: "Rascunho para o cliente: a equipa vem no próximo dia útil", sub: `«${texto}»`,
        acoes: [{ rot: "Enviar ao portal", a: { k: "avisarCliente", texto } }] });
    }
  }

  // 2b) Cliente (etapa 2): o fim da obra mudou e o cliente ainda sabe a data antiga (a do último aviso, ou a do plano aprovado)
  if (vivo) {
    const fimAgora = rotuloDia(p, fimDe(p.tasks) - 1);
    const avisado = (d.obra.alteracoes ?? []).find((a) => a.cliente)?.fimDepois;
    const sabe = avisado ?? (p.base?.length ? rotuloDia(p, fimDe(p.base) - 1) : null);
    if (sabe && sabe !== fimAgora) {
      const texto = `A data prevista para acabar a obra passou para ${fimAgora}.`;
      out.push({ id: `cliente-fim-${fimAgora}`, agente: "cliente", nivel: "atencao", titulo: `O cliente ainda conta com o fim a ${sabe}`,
        sub: `O plano acaba agora a ${fimAgora}. Rascunho para o portal: «${texto}»`, acoes: [{ rot: "Enviar ao portal", a: { k: "avisarCliente", texto } }] });
    }
  }

  // 3) Margem: tarefas com mais horas registadas do que as previstas
  for (const [ti, t] of p.tasks.entries()) {
    const reg = t.exec?.horas ?? 0, h = t.h ?? 0;
    if (!(reg > h + 1 && reg > h * 1.1) || estadoVivo(t, p) === "validada") continue;
    const mais = r2(reg - h);
    let custo = 0;
    try { custo = r2(mais * custoDaHora(S as Estado, t)); } catch { /* sem custos */ }
    out.push({ id: `horas-${ti}-${Math.round(reg)}`, agente: "margem", nivel: "atencao", ti, titulo: `${nomeNoPlano(p, t)} já leva mais ${mais} h do que o previsto`,
      sub: `${reg} h registadas para ${h} h previstas${custo ? ` · cerca de ${eur(custo)} € a mais` : ""}. Decida quem paga: o cliente (adenda) ou a empresa.`,
      acoes: [{ rot: "Decidir", a: { k: "tarefa", ti } }] });
  }

  // 4) Aprendizagem: o que nesta obra se muda vezes sem conta (o motor está a prever mal)
  const alt = d.obra.mudancasPlano ?? [];
  const porTipo = new Map<string, number>();
  for (const a of alt) for (const m of a.mudancas) if (m.tipo !== "obra") porTipo.set(m.tipo, (porTipo.get(m.tipo) ?? 0) + 1);
  const [tipo, n] = [...porTipo.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (tipo && n >= 3) out.push({ id: `aprende-${tipo}-${Math.floor(n / 3)}`, agente: "aprendizagem", nivel: "oportunidade",
    titulo: `${ROTULO_ALTERACAO[tipo as keyof typeof ROTULO_ALTERACAO] ?? tipo}: ${n} mudanças nesta obra`,
    sub: "É o que mais se corrige no plano gerado. Fica guardado para o motor aprender.", acoes: [] });

  const rec = d.obra.agentes?.recusadas ?? {};
  const peso: Record<Nivel, number> = { critico: 0, atencao: 1, oportunidade: 2 };
  return out.filter((x) => !rec[x.id]).sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}

/** O prazo do degrau 2: o fim do dia útil em que a proposta foi vista (18h); vista depois das 17h, o fim do dia útil seguinte. */
export function prazoDoDegrau2(vistoIso: string): Date {
  const v = new Date(vistoIso);
  const fim = new Date(v);
  fim.setHours(18, 0, 0, 0);
  if (v.getHours() >= 17) fim.setDate(fim.getDate() + 1);
  while (fim.getDay() === 0 || fim.getDay() === 6) fim.setDate(fim.getDate() + 1);
  return fim;
}

/** O que cada proposta vai fazer agora, pelo degrau do agente: «ver» (0), «pede» (1, ou 2 sem ação automática), «prazo» (2) ou «já» (3). */
export function modoDa(x: Proposta, e: EstadoAgentes | undefined): "ver" | "pede" | "prazo" | "ja" {
  const g = degrauDe(e, x.agente);
  if (g === 0) return "ver";
  if (!x.auto || g === 1) return "pede";
  return g === 2 ? "prazo" : "ja";
}

/** As propostas a aplicar sozinhas agora: degrau 3, ou degrau 2 com o prazo passado. */
export function aAplicarAgora(L: Proposta[], e: EstadoAgentes | undefined, agora = new Date()): Proposta[] {
  return L.filter((x) => {
    const m = modoDa(x, e);
    if (m === "ja") return true;
    if (m !== "prazo") return false;
    const v = e?.vistos?.[x.id];
    return !!v && prazoDoDegrau2(v).getTime() <= agora.getTime();
  });
}
