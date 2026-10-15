// As ações da Frota (o objeto DLG do protótipo HTML): para cada diálogo, os valores iniciais, a validação (os mesmos textos) e o que grava.
// Sem React. Os valores dos formulários são texto (como no HTML). Cada `gravar*` volta a validar e recusa com ErroFrota: corre dentro de executar()
// (loja.ts), numa cópia da base, por isso uma regra que recusa não deixa nada a meio.
import { HOJE, addDias, addMeses, fData, fEur, fKm, falhar, uid } from "./base";
import { PERFIS_FROTA, PESSOA_TECNICO, lerPerfilFrota, pode, porqueNao, type AcaoFrota, type PerfilFrota } from "./perfil";
import { ESTADOS, VENC, atribEm, bloqueios, cartaOk, ocupada, pessoa, quemConduzia, revisao, viatura, viaturaDe } from "./regras";
import { CENTROS, OFICINAS } from "./seed";
import type { ChaveVenc, EstadoViatura, Frota, Ocorrencia, Viatura } from "./tipos";

export type Vals = Record<string, string>;
export type Erros = Record<string, string>;

/**
 * O perfil com que as ações correm quando quem as chama o fixa (comPerfilFrota): a Frota de exemplo da app real corre
 * sempre como "gestor" — lá decide a permissão real — sem mexer no perfil simulado global do protótipo.
 */
let perfilFixo: PerfilFrota | null = null;
/** Corre `fn` com as ações a verem o perfil `p` (em vez do perfil simulado do protótipo). O perfil do protótipo não muda. */
export function comPerfilFrota<T>(p: PerfilFrota, fn: () => T): T {
  const antes = perfilFixo;
  perfilFixo = p;
  try { return fn(); } finally { perfilFixo = antes; }
}

/**
 * Recusa a ação se o perfil não a pode fazer (o porquê é o do botão desativado). O técnico só age sobre a sua própria viatura (`vid`).
 * O perfil é, por esta ordem: o passado em `perfil`, o fixado por comPerfilFrota, ou o perfil simulado do protótipo.
 */
export function exigir(acao: AcaoFrota, F?: Frota, vid?: string, perfil: PerfilFrota = perfilFixo ?? lerPerfilFrota()): void {
  const p = perfil;
  if (!pode(p, acao)) falhar(porqueNao(p));
  if (p === "tecnico" && F && vid) {
    const minha = viaturaDe(F, PESSOA_TECNICO);
    if (!minha || minha.id !== vid) falhar(`Como técnico, só podes agir sobre a tua viatura${minha ? ` (${minha.mat})` : ""}.`);
  }
}
/* ------------------------------------------------------------------ histórico */

/** Quem faz as ações quando quem as chama o diz (comAutorFrota): na app real é o utilizador com sessão iniciada. */
let autorFixo: string | null = null;
/** Corre `fn` com as entradas do histórico assinadas por `autor`. */
export function comAutorFrota<T>(autor: string, fn: () => T): T {
  const antes = autorFixo;
  autorFixo = autor;
  try { return fn(); } finally { autorFixo = antes; }
}
/** Quem assina uma entrada: o autor fixado, ou o perfil simulado do protótipo ("Gestora de frota · Sofia Martins"). */
export const autorAtual = (): string => autorFixo ?? PERFIS_FROTA[perfilFixo ?? lerPerfilFrota()];
/**
 * Grava uma entrada no histórico (mais recente primeiro): quando (hora real), quem, a viatura, o tipo de ação e o
 * detalhe. Devolve `texto` (a mensagem da ação), para os gravar* terminarem com `return registar(...)`.
 */
export function registar(F: Frota, acao: string, vid: string | undefined, texto: string, det?: string): string {
  F.log = [{ at: new Date().toISOString(), t: texto, quem: autorAtual(), vid, acao, det }, ...(F.log ?? [])];
  return texto;
}

const noFuturo = (d: string): boolean => !!d && d.slice(0, 10) > HOJE;
function semErros(e: Erros): void {
  const k = Object.keys(e);
  if (k.length) falhar(e[k[0]]);
}
const V = (F: Frota, id: string): Viatura => viatura(F, id) ?? falhar("Viatura desconhecida.");

/* ------------------------------------------------------------------ atribuir */

/** A obra do motivo escolhido ("Obra #1022 · …"). */
export const obraDoMotivo = (nota: string): number | undefined => { const m = /^Obra #(\d+)/.exec(nota); return m ? Number(m[1]) : undefined; };

export function iniAtribuir(F: Frota, d: { v?: string; p?: string; ini?: string }): Vals {
  return { vid: d.v ?? "", pid: d.p ?? "", tipo: d.ini ? "pontual" : "permanente", ini: d.ini ?? HOJE, fim: d.ini ?? "", km: d.v ? String(viatura(F, d.v)?.km ?? "") : "", nota: "" };
}
export function validarAtribuir(F: Frota, x: Vals): Erros {
  const e: Erros = {}, v = viatura(F, x.vid), p = pessoa(F, x.pid);
  if (!v) e.vid = "Escolhe a viatura.";
  else if (v.estado !== "ativa") e.vid = `A ${v.mat} não está ativa (${ESTADOS[v.estado][1].toLowerCase()}).`;
  if (!p) e.pid = "Escolhe o condutor.";
  if (x.tipo === "pontual" && !x.fim) e.fim = "Indica até quando.";
  if (x.fim && x.fim < x.ini) e.fim = "O fim não pode ser antes do início.";
  // a carta tem de servir no início e no último dia da reserva
  if (v && p) { const c = cartaOk(p, v, x.ini) ?? cartaOk(p, v, x.fim || x.ini); if (c) e.pid = c; }
  if (v) {
    if (x.ini <= HOJE && x.km !== "" && Number(x.km) < v.km) e.km = `Não pode ser menos do que a última leitura (${fKm(v.km)}).`;
    const fim = x.fim || "9999-12-31";
    const choque = F.atrib.find((a) => a.vid === v.id && a.ini <= fim && (!a.fim || a.fim > x.ini || (a.fim === x.ini && !a.devolvida)));
    if (choque) e.ini = `A ${v.mat} já está com ${pessoa(F, choque.pid)?.nome} de ${fData(choque.ini)} a ${choque.fim ? fData(choque.fim) : "sem fim"}.`;
    // uma reserva pontual percorre todos os seus dias: nenhum pode ter manutenção (marcada ou em curso até à data prevista) nem oficina
    if (!e.ini && x.tipo === "pontual" && x.fim && x.fim >= x.ini) {
      for (let d = x.ini; d <= x.fim && !e.ini; d = addDias(d, 1)) {
        if (!ocupada(F, v.id, d)) continue;
        const b = bloqueios(F, v.id, d).find((z) => z.tipo === "manutencao" || z.tipo === "oficina");
        if (!b) continue;
        const m = b.manut;
        e.ini = !m ? `A ${v.mat} está na oficina a ${fData(d)}: está bloqueada na agenda.`
          : m.estado === "em curso" ? `A ${v.mat} está em ${m.tipo} (em curso, prevista até ${fData(m.prev ?? m.data)}): está bloqueada na agenda.`
          : `A ${v.mat} tem ${m.tipo} marcada a ${fData(m.data)}: está bloqueada na agenda.`;
      }
    }
  }
  if (p && x.tipo === "permanente") {
    const outra = F.viaturas.find((w) => F.atrib.some((a) => a.vid === w.id && a.pid === p.id && a.tipo === "permanente" && !a.fim));
    if (outra) e.pid = `${p.nome} já tem a ${outra.mat}. Devolve-a primeiro.`;
  }
  return e;
}
export function gravarAtribuir(F: Frota, x: Vals): string {
  exigir("atribuir");
  semErros(validarAtribuir(F, x));
  const v = V(F, x.vid);
  F.atrib.push({ id: uid("a"), vid: x.vid, pid: x.pid, tipo: x.tipo === "pontual" ? "pontual" : "permanente", ini: x.ini, fim: x.fim || null, kmIni: x.ini <= HOJE ? Number(x.km || v.km) : null, nota: x.nota, obra: obraDoMotivo(x.nota) });
  if (x.ini <= HOJE && Number(x.km) > v.km) { v.km = Number(x.km); F.leituras.push({ vid: v.id, data: HOJE, km: v.km, origem: "Entrega" }); }
  return registar(F, x.tipo === "pontual" ? "Reserva" : "Atribuição", v.id, `${v.mat} atribuída a ${pessoa(F, x.pid)?.nome}.`,
    `${x.tipo === "pontual" ? "Reserva" : "Permanente"} de ${fData(x.ini)}${x.fim ? " a " + fData(x.fim) : ", sem fim"}${x.nota ? " · " + x.nota : ""}`);
}

/* ------------------------------------------------------------------ devolver */

export function iniDevolver(F: Frota, aid: string): Vals {
  const a = F.atrib.find((z) => z.id === aid);
  return { a: aid, km: a ? String(viatura(F, a.vid)?.km ?? "") : "", data: HOJE, danos: "" };
}
export function validarDevolver(F: Frota, x: Vals): Erros {
  const a = F.atrib.find((z) => z.id === x.a), e: Erros = {};
  if (!a) return { a: "Atribuição desconhecida." };
  if (a.devolvida) return { a: "Esta atribuição já foi devolvida." };
  const v = V(F, a.vid);
  if (x.km === "" || Number(x.km) < v.km) e.km = `Indica os km. Não pode ser menos do que ${fKm(v.km)}.`;
  if (x.data < a.ini) e.data = "A data é anterior à entrega.";
  else if (noFuturo(x.data)) e.data = "Não pode ser no futuro.";
  return e;
}
export function gravarDevolver(F: Frota, x: Vals): string {
  exigir("atribuir");
  semErros(validarDevolver(F, x));
  const a = F.atrib.find((z) => z.id === x.a)!, v = V(F, a.vid);
  a.fim = x.data; a.devolvida = true; a.kmFim = Number(x.km); v.km = Number(x.km);
  F.leituras.push({ vid: v.id, data: x.data, km: v.km, origem: "Devolução" });
  if (x.danos) F.ocorr.push({ id: uid("o"), vid: v.id, tipo: "Sinistro", quando: x.data + "T18:00", local: "Na devolução", desc: "Danos detetados na devolução", pid: a.pid, estado: "registada" });
  return registar(F, "Devolução", v.id, `${v.mat} devolvida com ${fKm(v.km)}.`, `${pessoa(F, a.pid)?.nome ?? ""} · ${fData(x.data)}${x.danos ? " · com danos (ocorrência aberta)" : ""}`);
}

/** Cancelar uma reserva futura: sai da Frota e liberta a viatura na Agenda. */
export function cancelarReserva(F: Frota, aid: string): string {
  exigir("atribuir");
  const a = F.atrib.find((z) => z.id === aid);
  if (!a) falhar("Reserva desconhecida.");
  if (a.ini <= HOJE) falhar("Só se cancelam reservas que ainda não começaram. Esta devolve-se.");
  F.atrib = F.atrib.filter((z) => z.id !== aid);
  return registar(F, "Reserva cancelada", a.vid, "Reserva cancelada. A viatura ficou livre na Agenda.", `${pessoa(F, a.pid)?.nome ?? ""} · ${fData(a.ini)} a ${fData(a.fim)}`);
}

/* ------------------------------------------------------------------ km */

export const iniKm = (vid: string): Vals => ({ vid, km: "", data: HOJE });
export function validarKm(F: Frota, x: Vals): Erros {
  const v = V(F, x.vid), e: Erros = {}, k = Number(x.km);
  if (!x.km) e.km = "Indica os km.";
  else if (k < v.km) e.km = `Os km não podem descer. Última leitura: ${fKm(v.km)}.`;
  else if (k - v.km > 5000) e.km = `São mais ${fKm(k - v.km)} do que a última leitura. Confirma o valor.`;
  if (x.data > HOJE) e.data = "Não pode ser no futuro.";
  return e;
}
export function gravarKm(F: Frota, x: Vals): string {
  exigir("km", F, x.vid);
  semErros(validarKm(F, x));
  const v = V(F, x.vid);
  v.km = Number(x.km);
  F.leituras.push({ vid: v.id, data: x.data, km: v.km, origem: "Manual" });
  const r = revisao(v);
  return registar(F, "Km", v.id, `Km registados.${r.tom !== "ok" ? " Atenção: revisão " + r.txt.toLowerCase() + "." : ""}`, `${fKm(v.km)} a ${fData(x.data)}`);
}

/* ------------------------------------------------------------------ abastecer */

export function iniAbastecer(F: Frota, vid?: string): Vals {
  const v = vid ? viatura(F, vid) : undefined;
  return { vid: vid ?? "", qtd: "", valor: "", km: "", fonte: v?.comb === "Elétrico" ? "Carregamento · Mobi.E" : "Cartão frota · Galp", data: HOJE };
}
export function validarAbastecer(F: Frota, x: Vals): Erros {
  const v = viatura(F, x.vid), e: Erros = {};
  if (!v) e.vid = "Escolhe a viatura.";
  if (!(Number(x.qtd) > 0)) e.qtd = "Indica a quantidade.";
  if (!(Number(x.valor) > 0)) e.valor = "Indica o valor.";
  if (v && (!x.km || Number(x.km) < v.km)) e.km = `Indica os km (pelo menos ${fKm(v.km)}).`;
  if (noFuturo(x.data)) e.data = "Não pode ser no futuro.";
  return e;
}
export function gravarAbastecer(F: Frota, x: Vals): string {
  exigir("abastecer", F, x.vid);
  semErros(validarAbastecer(F, x));
  const v = V(F, x.vid), a = atribEm(F, v.id), el = v.comb === "Elétrico";
  F.custos.push({ id: uid("c"), vid: v.id, data: x.data, tipo: el ? "Carregamento" : "Combustível", qtd: Number(x.qtd), un: el ? "kWh" : "L", valor: Number(x.valor), km: Number(x.km), pid: a ? a.pid : null, fonte: x.fonte, centro: v.centro });
  v.km = Number(x.km);
  F.leituras.push({ vid: v.id, data: x.data, km: v.km, origem: "Abastecimento" });
  return registar(F, el ? "Carregamento" : "Abastecimento", v.id, `Abastecimento de ${fEur(Number(x.valor))} registado na ${v.mat}.`, `${x.qtd} ${el ? "kWh" : "L"} · ${fEur(Number(x.valor))} · ${fKm(v.km)} · ${x.fonte}`);
}

/* ------------------------------------------------------------------ despesa */

export const iniDespesa = (vid?: string): Vals => ({ vid: vid ?? "", tipo: "Portagens", data: HOJE, valor: "", fonte: "", centro: "", nota: "" });
export function validarDespesa(_F: Frota, x: Vals): Erros {
  const e: Erros = {};
  if (!x.vid) e.vid = "Escolhe a viatura.";
  if (!(Number(x.valor) > 0)) e.valor = "Indica o valor.";
  if (!x.fonte) e.fonte = "Escolhe o fornecedor.";
  return e;
}
export function gravarDespesa(F: Frota, x: Vals): string {
  exigir("despesa");
  semErros(validarDespesa(F, x));
  const v = V(F, x.vid);
  F.custos.push({ id: uid("c"), vid: v.id, data: x.data, tipo: x.tipo, valor: Number(x.valor), fonte: x.fonte, centro: x.centro || v.centro, nota: x.nota });
  return registar(F, "Despesa", v.id, `Despesa de ${fEur(Number(x.valor))} registada.`, `${x.tipo} · ${fEur(Number(x.valor))} · ${x.fonte}${x.centro ? " · " + x.centro : ""}`);
}

/* ------------------------------------------------------------------ importar extrato */

/** O ficheiro do extrato de exemplo (fica registado ao importar, para não se importar duas vezes). */
export const FICHEIRO_EXTRATO = "extrato_galp_frota_2026-10-14.csv";
export const extratoImportado = (F: Frota): boolean => (F.importados ?? []).includes(FICHEIRO_EXTRATO);
export const validarImportar = (F: Frota): Erros => (extratoImportado(F) ? { extrato: `O ${FICHEIRO_EXTRATO} já foi importado: importá-lo outra vez duplicava os custos.` } : {});
/** As linhas do extrato de exemplo: data, matrícula, posto, litros, valor, km. */
export const LINHAS_EXTRATO: readonly (readonly [string, string, string, number, number, number])[] = [
  ["2026-10-13", "AA-12-BC", "Galp Loures", 61.2, 99.14, 148230],
  ["2026-10-13", "12-TT-90", "Repsol Odivelas", 58.4, 94.61, 231400],
  ["2026-10-14", "45-XZ-78", "Galp Almada", 38.9, 63.02, 61790],
  ["2026-10-14", "BX-55-RT", "Galp Cascais", 72.0, 116.64, 175980],
];
/** O que a verificação diz de cada linha: matrícula desconhecida ou km abaixo da última leitura (entra marcada "Rever km"). */
export function verificarLinha(F: Frota, l: (typeof LINHAS_EXTRATO)[number]): string | null {
  const v = F.viaturas.find((z) => z.mat === l[1]);
  return !v ? "Matrícula desconhecida" : l[5] < v.km ? `Km abaixo da última leitura (${new Intl.NumberFormat("pt-PT").format(v.km)})` : null;
}
export function gravarImportar(F: Frota): string {
  exigir("importar");
  semErros(validarImportar(F));
  F.importados = [...(F.importados ?? []), FICHEIRO_EXTRATO];
  let n = 0, rever = 0;
  for (const l of LINHAS_EXTRATO) {
    const v = F.viaturas.find((z) => z.mat === l[1]);
    if (!v) continue;
    const prob = l[5] < v.km, a = atribEm(F, v.id, l[0]);
    F.custos.push({ id: uid("c"), vid: v.id, data: l[0], tipo: "Combustível", qtd: l[3], un: "L", valor: l[4], km: l[5], pid: a ? a.pid : null, fonte: "Cartão frota · " + l[2], centro: v.centro, rever: prob });
    if (!prob && l[5] > v.km) { v.km = l[5]; F.leituras.push({ vid: v.id, data: l[0], km: l[5], origem: "Extrato" }); }
    if (prob) rever++;
    n++;
  }
  return registar(F, "Importação", undefined, `${n} abastecimentos importados.${rever ? ` ${rever} ficou para rever.` : ""}`, FICHEIRO_EXTRATO);
}

/* ------------------------------------------------------------------ manutenção */

export const iniManut = (vid?: string): Vals => ({ vid: vid ?? "", tipo: "Revisão", data: addDias(HOJE, 7), oficina: OFICINAS[0], valor: "" });
export function validarManut(F: Frota, x: Vals): Erros {
  const e: Erros = {};
  if (!x.vid) e.vid = "Escolhe a viatura.";
  if (x.data < HOJE) e.data = "Escolhe uma data a partir de hoje.";
  // a manutenção bloqueia a viatura na agenda: não pode cair numa reserva pontual
  const a = x.vid ? F.atrib.find((z) => z.vid === x.vid && z.tipo === "pontual" && z.ini <= x.data && (z.fim ?? z.ini) >= x.data && !z.devolvida) : undefined;
  if (!e.data && a) e.data = `A viatura está reservada a ${pessoa(F, a.pid)?.nome} nesse dia (${fData(a.ini)} a ${fData(a.fim)}). Escolhe outro dia ou cancela a reserva.`;
  return e;
}
export function gravarManut(F: Frota, x: Vals): string {
  exigir("manut");
  semErros(validarManut(F, x));
  F.manut.push({ id: uid("m"), vid: x.vid, tipo: x.tipo, data: x.data, estado: "agendada", oficina: x.oficina, valor: Number(x.valor || 0) });
  return registar(F, "Manutenção agendada", x.vid, `${x.tipo} da ${V(F, x.vid).mat} agendada para ${fData(x.data)}.`, `${x.tipo} · ${x.oficina} · ${fData(x.data)}`);
}

export function iniConcluir(F: Frota, mid: string): Vals {
  const m = F.manut.find((z) => z.id === mid);
  return { m: mid, km: m ? String(viatura(F, m.vid)?.km ?? "") : "", valor: m ? String(m.valor) : "", data: HOJE };
}
export function validarConcluir(F: Frota, x: Vals): Erros {
  const m = F.manut.find((z) => z.id === x.m), e: Erros = {};
  if (!m) return { m: "Intervenção desconhecida." };
  const v = V(F, m.vid);
  if (Number(x.km) < v.km) e.km = `Não pode ser menos do que ${fKm(v.km)}.`;
  if (x.valor === "") e.valor = "Indica o valor (0 se não teve custo).";
  return e;
}
export function gravarConcluir(F: Frota, x: Vals): string {
  exigir("manut");
  semErros(validarConcluir(F, x));
  const m = F.manut.find((z) => z.id === x.m)!, v = V(F, m.vid);
  m.estado = "concluída"; m.km = Number(x.km); m.valor = Number(x.valor); m.data = x.data; v.km = Number(x.km);
  if (/Revis/.test(m.tipo)) { v.rev.ultKm = v.km; v.rev.ultData = x.data; }
  if (/IPO/.test(m.tipo)) v.venc.ipo = addMeses(x.data, 12);
  const saiuDaOficina = v.estado === "oficina";
  if (saiuDaOficina) { v.estado = "ativa"; v.motivo = ""; }
  if (m.valor) F.custos.push({ id: uid("c"), vid: v.id, data: x.data, tipo: "Oficina", valor: m.valor, fonte: m.oficina, centro: v.centro, nota: m.tipo });
  return registar(F, "Manutenção concluída", v.id, `${m.tipo} concluída. ${saiuDaOficina ? `${v.mat} volta a estar ativa.` : `A ${v.mat} continua ${ESTADOS[v.estado][1].toLowerCase()}.`}`, `${m.tipo} · ${m.oficina} · ${fEur(m.valor)} · ${fKm(v.km)}`);
}

/* ------------------------------------------------------------------ estado */

export const iniEstado = (F: Frota, vid: string): Vals => ({ vid, estado: viatura(F, vid)?.estado ?? "ativa", motivo: "" });
export function validarEstado(F: Frota, x: Vals): Erros {
  const e: Erros = {};
  if (x.estado === V(F, x.vid).estado) e.estado = "Escolhe um estado diferente.";
  if ((x.motivo || "").trim().length < 3) e.motivo = "Escreve o motivo (pelo menos 3 letras).";
  return e;
}
export function gravarEstado(F: Frota, x: Vals): string {
  exigir("estado");
  semErros(validarEstado(F, x));
  const v = V(F, x.vid), novo = x.estado as EstadoViatura;
  v.estado = novo; v.motivo = x.motivo.trim();
  if (novo !== "ativa") { const a = atribEm(F, v.id); if (a) { a.fim = HOJE; a.devolvida = true; a.kmFim = v.km; } }
  return registar(F, "Estado", v.id, `${v.mat} passou a “${ESTADOS[novo][1]}”.`, v.motivo);
}

/* ------------------------------------------------------------------ ocorrências */

export const iniOcorrencia = (vid?: string): Vals => ({ vid: vid ?? "", tipo: "Avaria", quando: HOJE + "T09:00", local: "", desc: "", valor: "" });
export function validarOcorrencia(_F: Frota, x: Vals): Erros {
  const e: Erros = {};
  if (!x.vid) e.vid = "Escolhe a viatura.";
  if (!x.quando) e.quando = "Indica quando.";
  if (x.quando && x.quando.slice(0, 10) > HOJE) e.quando = "Não pode ser no futuro.";
  if (!x.local.trim()) e.local = "Indica o local.";
  if (x.desc.trim().length < 3) e.desc = "Descreve o que aconteceu.";
  return e;
}
export function gravarOcorrencia(F: Frota, x: Vals): string {
  exigir("ocorrencia", F, x.vid);
  semErros(validarOcorrencia(F, x));
  const sug = quemConduzia(F, x.vid, x.quando);
  const o: Ocorrencia = { id: uid("o"), vid: x.vid, tipo: x.tipo as Ocorrencia["tipo"], quando: x.quando, local: x.local, desc: x.desc, valor: Number(x.valor || 0), estado: x.tipo === "Multa" ? "por identificar" : "registada" };
  if (x.tipo === "Multa") o.notificada = HOJE; else if (sug) o.pid = sug.id;
  F.ocorr.push(o);
  return registar(F, "Ocorrência", x.vid, `${x.tipo} registada na ${V(F, x.vid).mat}.`, `${x.tipo} · ${x.local} · ${x.desc}`);
}
export function iniIdentificar(F: Frota, oid: string): Vals {
  const o = F.ocorr.find((z) => z.id === oid);
  const s = o ? quemConduzia(F, o.vid, o.quando) : undefined;
  return { o: oid, pid: s ? s.id : "" };
}
export const validarIdentificar = (_F: Frota, x: Vals): Erros => (x.pid ? {} : { pid: "Escolhe o condutor." });
export function gravarIdentificar(F: Frota, x: Vals): string {
  exigir("identificar");
  semErros(validarIdentificar(F, x));
  const o = F.ocorr.find((z) => z.id === x.o) ?? falhar("Ocorrência desconhecida.");
  o.pid = x.pid; o.estado = "identificado";
  return registar(F, "Condutor identificado", o.vid, `Condutor identificado: ${pessoa(F, x.pid)?.nome}. Notificação enviada.`, `${o.tipo} de ${fData(o.quando.slice(0, 10))} · ${o.desc}`);
}
export function resolverOcorrencia(F: Frota, oid: string): string {
  exigir("identificar");
  const o = F.ocorr.find((z) => z.id === oid) ?? falhar("Ocorrência desconhecida.");
  o.estado = "resolvido";
  return registar(F, "Ocorrência resolvida", o.vid, "Ocorrência marcada como resolvida.", `${o.tipo} de ${fData(o.quando.slice(0, 10))} · ${o.desc}`);
}

/* ------------------------------------------------------------------ documentos */

export function iniRenovar(F: Frota, vid: string, k: ChaveVenc): Vals {
  const atual = viatura(F, vid)?.venc[k];
  return { vid, k, data: addMeses(atual && atual > HOJE ? atual : HOJE, 12), valor: "" };
}
export const validarRenovar = (_F: Frota, x: Vals): Erros => (x.data <= HOJE ? { data: "A nova validade tem de ser depois de hoje." } : {});
export function gravarRenovar(F: Frota, x: Vals): string {
  exigir("renovar");
  semErros(validarRenovar(F, x));
  const v = V(F, x.vid), k = x.k as ChaveVenc;
  v.venc[k] = x.data;
  if (Number(x.valor) > 0) F.custos.push({ id: uid("c"), vid: v.id, data: HOJE, tipo: k === "seguro" ? "Seguro" : k === "iuc" ? "IUC" : "Oficina", valor: Number(x.valor), fonte: k === "seguro" ? v.seguradora : k === "ipo" ? "Centro de Inspeções Lisboa Norte" : "Autoridade Tributária", centro: v.centro });
  return registar(F, "Documento renovado", v.id, `${VENC[k]} da ${v.mat} renovado até ${fData(x.data)}.`, `${VENC[k]} até ${fData(x.data)}${Number(x.valor) > 0 ? " · " + fEur(Number(x.valor)) : ""}`);
}

/* ------------------------------------------------------------------ nova viatura */

export const iniNova = (): Vals => ({ mat: "", marca: "", modelo: "", tipo: "Furgão", comb: "Gasóleo", posse: "Própria", ano: "2026", km: "0", cat: "B", centro: CENTROS[0], cidade: "", seguro: "", ipo: "", iuc: "", armazem: "on", agenda: "on" });
export const MATRICULA = /^([A-Z]{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|[A-Z]{2}-\d{2}-\d{2})$/;
export function validarNova(F: Frota, x: Vals): Erros {
  const e: Erros = {}, m = x.mat.trim().toUpperCase();
  if (!MATRICULA.test(m)) e.mat = "Usa o formato português, por exemplo AA-00-AA.";
  else if (F.viaturas.some((v) => v.mat === m)) e.mat = "Já existe uma viatura com esta matrícula.";
  if (!x.marca.trim()) e.marca = "Indica a marca.";
  if (!x.modelo.trim()) e.modelo = "Indica o modelo.";
  if (Number(x.km) < 0 || x.km === "") e.km = "Indica os km.";
  if (!x.seguro) e.seguro = "Sem seguro válido não pode circular.";
  return e;
}
/** Cria a viatura e devolve o id (o armazém móvel no Inventário cria-se à parte, com `armazemId`). */
export function gravarNova(F: Frota, x: Vals, armazemId: string | null): string {
  exigir("nova");
  semErros(validarNova(F, x));
  const id = uid("v"), km = Number(x.km);
  F.viaturas.push({
    id, mat: x.mat.trim().toUpperCase(), marca: x.marca.trim(), modelo: x.modelo.trim(), tipo: x.tipo, comb: x.comb, posse: x.posse as Viatura["posse"], ano: Number(x.ano), km, estado: "ativa", cat: x.cat, centro: x.centro,
    venc: { seguro: x.seguro || null, ipo: x.ipo || null, iuc: x.comb === "Elétrico" ? null : x.iuc || null }, seguradora: "Por indicar", apolice: "—",
    rev: { cadaKm: 30000, cadaMeses: 12, ultKm: km, ultData: HOJE }, armazem: !!x.armazem, armazemId, agenda: !!x.agenda,
  });
  F.leituras.push({ vid: id, data: HOJE, km, origem: "Criação" });
  registar(F, "Nova viatura", id, `Viatura ${x.mat.trim().toUpperCase()} criada.`,
    `${x.marca.trim()} ${x.modelo.trim()} · ${x.comb} · ${fKm(km)}${x.armazem ? " · armazém móvel" : ""}${x.agenda ? " · recurso da agenda" : ""}`);
  return id;
}

/** O livre na agenda para reservar a viatura num dia (o "+" do calendário). */
export const podeReservar = (F: Frota, vid: string, d: string): boolean => {
  const v = viatura(F, vid);
  return !!v && v.estado === "ativa" && d >= HOJE && !atribEm(F, vid, d) && !ocupada(F, vid, d);
};
