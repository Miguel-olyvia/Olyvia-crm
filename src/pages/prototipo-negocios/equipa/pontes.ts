// As pontes dos técnicos de obra para o RH de exemplo (22/10/2026), sem React (como frota/pontes.ts):
// - Pessoas: cada técnico é uma pessoa do RH com o cargo "Técnico de obra" (ids estáveis "p-tec-<id do técnico>"). Para não mexer nos dados
//   nem nos testes do RH de exemplo, as seis pessoas juntam-se ao store do RH quando o RH abre no protótipo (garantirTecnicosNoRh),
//   e só se ainda lá não estiverem; "Repor a demonstração" repõe o RH de origem e elas voltam a entrar quando o RH abrir outra vez.
// - Custo/hora sugerido: do salário e dos encargos da pessoa no RH (a mesma taxa e o mesmo seguro do separador Custos), a dividir pelas horas
//   do contrato. Só se mostra ao lado do campo: quem decide o custo/hora da obra é a Direção (ou as Operações).
// - Ausências: os dias aprovados no RH (férias, baixa...) de cada técnico, para a Agenda.
// - 22/10: cada papel do "A ver como" é uma pessoa do RH (pessoaRhDoPapel; as que faltam entram como os técnicos, juntarPapeisAoRh), a equipa
//   de cada pessoa é quem lhe reporta (equipaDe) e a agenda de cada pessoa sai daqui (agendaDasPessoas): RH › Agenda e "A minha agenda" no Hoje.
// Só dados de teste em memória, nada fala com a base.
import { ORGANIZACAO_EXEMPLO_ID as ORG } from "@/components/rh-exemplo/dados/constantes";
import * as K from "@/components/rh-exemplo/dados/constantes";
import { catalogos } from "@/components/rh-exemplo/dados/catalogos";
import { fichaDeEspec, type EspecPessoa } from "@/components/rh-exemplo/dados/fichaExemplo";
import { definirEstado, lerEstado } from "@/components/rh-exemplo/dados/loja";
import { lerCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import type { EstadoRh, FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { custoPorHora, custoRepartido14em12, encargosDaEmpresa, salarioMensal, taxaEfetiva } from "@/components/rh-exemplo/lib/custo";
import { TECNICOS, type FichaTecnico } from "./tecnicos";
import { derivarServicos } from "../v2/custosModelo";
import type { Estado, Papel } from "../motor";
import { feriadoDe } from "@/components/rh-exemplo/calendarioPessoa/feriados";
import { rhExemploCalendarioTranslations } from "@/translations/rhExemploCalendario";
import { tecnicosComTrabalho } from "../trabalhoObra";
import { agendaEquipa, type CelulaAgenda, type EntradaAgenda, type ItemAgenda, type LinhaAgenda } from "./regrasAgenda";

/** O cargo do RH dos técnicos de obra. */
export const CARGO_TECNICO = { id: "cg-tecnico-obra", nome: "Técnico de obra", horas: 40 } as const;
/** O salário base de exemplo de cada técnico (€/mês). 22/10: escolhido para o custo/hora calculado nos Custos do RH (sugestaoCustoHora)
 *  dar os valores de antes: 1.685 € → 14,20 €/h, 2.195 € → 18,50 €/h, 2.112 € → 17,80 €/h, 2.005 € → 16,90 €/h (25,25 % de encargos, 40 h). */
export const SALARIO: Readonly<Record<string, number>> = { js: 1685, ra: 1685, ma: 2195, sf: 2112, hn: 2112, pm: 2005 };
const SALARIO_CARGO = 1100;

/** A pessoa do RH de um técnico (a da ficha, ou a de sempre: "p-tec-<id>"). */
export const pessoaRhDe = (t: Pick<FichaTecnico, "id" | "pessoaRhId">): string => t.pessoaRhId ?? `p-tec-${t.id}`;
/** O técnico que é esta pessoa do RH. */
export const tecnicoDaPessoaRh = (pid: string, L: readonly FichaTecnico[] = TECNICOS): FichaTecnico | undefined => L.find((t) => pessoaRhDe(t) === pid);

function especDe(t: FichaTecnico, desde: number): EspecPessoa {
  const [nome, ...resto] = t.n.split(" ");
  return {
    id: pessoaRhDe(t), nome, apelido: resto.join(" ") || nome, cargoId: CARGO_TECNICO.id, localId: K.LOCAL_ARMAZEM, filialId: K.FILIAL_LISBOA,
    // 22/10: os técnicos reportam ao Filipe (Operações), já não à Marta
    tipo: "sem_termo", inicio: desde, fim: null, reportaA: PESSOA_DO_PAPEL.operacoes, conta: false, estado: "activo", genero: "masculino", nascimento: "1988-05-10",
    trabalho: "presencial", horas: CARGO_TECNICO.horas, dias: ["seg", "ter", "qua", "qui", "sex"],
  };
}

/** As pessoas (e o cargo) dos técnicos no estado do RH, as que faltam. Devolve o estado igual se já lá estão todas. */
export function juntarTecnicosAoRh(e0: EstadoRh, L: readonly FichaTecnico[] = TECNICOS): EstadoRh {
  // 22/10: primeiro as pessoas dos papéis do protótipo (o Filipe, a quem os técnicos reportam, e os outros)
  const e = juntarPapeisAoRh(e0);
  const faltam = L.filter((t) => !e.fichas[pessoaRhDe(t)]);
  if (!faltam.length && e.cargos.some((c) => c.id === CARGO_TECNICO.id)) return e;
  const cat = catalogos();
  const cargo = { ...cat.cargos[0], id: CARGO_TECNICO.id, nome: CARGO_TECNICO.nome, horas_referencia: CARGO_TECNICO.horas };
  const periodo = { id: "cp-tecnico-obra", cargo_id: CARGO_TECNICO.id, salario_base: SALARIO_CARGO, periodicidade: "mensal" as const, valido_de: "2024-01-01", valido_ate: null, motivo: null };
  const cargos = e.cargos.some((c) => c.id === cargo.id) ? e.cargos : [...e.cargos, cargo];
  const cargosPeriodos = e.cargosPeriodos.some((p) => p.id === periodo.id) ? e.cargosPeriodos : [...e.cargosPeriodos, periodo];
  const catTec = { ...cat, cargos, cargosPeriodos };
  const fichas: Record<string, FichaRh> = { ...e.fichas };
  const base = Object.keys(e.fichas).length;
  faltam.forEach((t, i) => {
    // há quanto tempo está na empresa: desde o ano da ficha (1 de março desse ano), em dias até hoje
    const anos = Math.max(0, new Date().getFullYear() - Number(t.desde || new Date().getFullYear()));
    const f = fichaDeEspec(especDe(t, -Math.max(30, anos * 365)), base + i, catTec, ORG);
    const salario = SALARIO[t.id];
    fichas[pessoaRhDe(t)] = salario ? { ...f, retribuicoes: f.retribuicoes.map((r) => ({ ...r, valor_base: salario })) } : f;
  });
  return { ...e, cargos, cargosPeriodos, fichas, ordem: [...e.ordem, ...faltam.map(pessoaRhDe).filter((id) => !e.ordem.includes(id))] };
}

/** Junta as pessoas dos técnicos ao store do RH de exemplo (só as que faltam; sem mudança, não avisa ninguém). */
export function garantirTecnicosNoRh(L: readonly FichaTecnico[] = TECNICOS): void {
  const e = lerEstado();
  if (juntarTecnicosAoRh(e, L) === e) return;
  definirEstado((x) => juntarTecnicosAoRh(x, L));
}

/* ------------------------------------------------------------------ o custo/hora sugerido */
export interface SugestaoCustoHora { valor: number; salario: number; encargosPct: number; horasMes: number }
/**
 * O custo/hora pelo RH: (salário base × 14 / 12 + encargos da empresa) ÷ horas do contrato num mês (horas semanais × 52 / 12).
 * Os encargos (TSU e seguro de acidentes de trabalho) são os das definições do separador Custos do RH, com a exceção da pessoa, se tiver.
 * Não conta o tempo não produtivo (deslocações, armazém) nem a estrutura: é um ponto de partida, não o valor a pôr.
 */
export function sugestaoCustoHora(f: FichaRh | null | undefined): SugestaoCustoHora | null {
  const r = f?.retribuicoes.find((x) => !x.valido_ate) ?? f?.retribuicoes[0];
  const v = f?.vinculos.find((x) => x.estado === "activo") ?? f?.vinculos[0];
  if (!f || !r || !v) return null;
  const horasSemana = v.horas_semanais_equivalentes ?? v.horas_periodo ?? 40;
  const horasMes = (horasSemana * 52) / 12;
  const salario = salarioMensal({ valor_base: r.valor_base, periodicidade: r.periodicidade }, horasMes);
  if (salario === null) return null;
  const { definicoes, excecoes } = lerCusto();
  const taxa = taxaEfetiva(definicoes.taxaEmpresa, excecoes[f.pessoa.id] ?? null);
  const media = (salario * 14) / 12;
  const custo = custoRepartido14em12(salario, encargosDaEmpresa(media, taxa, definicoes.seguro));
  const valor = custoPorHora(custo, horasMes);
  return valor === null ? null : { valor, salario, encargosPct: taxa + definicoes.seguro, horasMes: Math.round(horasMes * 10) / 10 };
}

/* ------------------------------------------------------------------ o custo/hora do técnico vem do RH (22/10) */
/**
 * 22/10: o custo/hora de cada técnico deixa de se escrever à mão: é o que os Custos do RH calculam para a pessoa (sugestaoCustoHora, com as
 * funções de rh-exemplo/lib/custo.ts). A medida escolhida é o custo mensal repartido 14/12 (salário × 14 ÷ 12 + encargos da empresa) a dividir
 * pelas horas do contrato num mês médio (horas semanais × 52 ÷ 12): é estável de mês para mês (o custoDoMes.porHoraPrevista muda com os dias
 * úteis de cada mês e não reparte os subsídios), por isso serve para orçamentar.
 * O store do RH só vive em memória e não se sincroniza: o valor calculado guarda-se na ficha do técnico (S.tecnicos, parte "global"), que é o
 * que o orçamento e a obra leem em todos os aparelhos. Uma retribuição mudada no RH chega aos outros aparelhos por aí (o RH deles não muda).
 * Atualiza só as fichas cuja pessoa está no RH; sem dados de custo no RH, marca-a (semCustoRh: fora da média do ofício, com aviso).
 * Devolve se mudou alguma coisa.
 */
export function custosDoRh(L: FichaTecnico[], e: EstadoRh = lerEstado()): boolean {
  let mudou = false;
  for (const t of L) {
    const f = e.fichas[pessoaRhDe(t)];
    if (!f) continue;
    const sug = sugestaoCustoHora(f);
    if (!sug) { if (!t.semCustoRh) { t.semCustoRh = true; mudou = true; } continue; }
    const rh = { salario: sug.salario, encargosPct: sug.encargosPct, horasMes: sug.horasMes };
    if (t.semCustoRh || t.custoHora !== sug.valor || JSON.stringify(t.custoRh) !== JSON.stringify(rh)) {
      delete t.semCustoRh; t.custoHora = sug.valor; t.custoRh = rh; mudou = true;
    }
  }
  return mudou;
}
/** Leva o custo/hora calculado no RH à ficha dos técnicos do Estado e, se mudou, ao €/h dos ofícios e dos serviços em uso (orçamentos novos).
 *  Os orçamentos já enviados guardam o custo na linha e não mudam. */
export function atualizarCustosDoRh(S: Estado): boolean {
  if (!S.tecnicos || !custosDoRh(S.tecnicos)) return false;
  derivarServicos(S);
  return true;
}

/* ------------------------------------------------------------------ as ausências */
/** As ausências aprovadas no RH de cada técnico (dias úteis): técnico → data → nome do tipo. */
export function ausenciasDosTecnicos(e: EstadoRh, L: readonly FichaTecnico[] = TECNICOS): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const t of L) {
    const f = e.fichas[pessoaRhDe(t)];
    if (!f) continue;
    const m: Record<string, string> = {};
    for (const d of f.ausencias.dias) {
      if (d.estado !== "aprovado" || d.e_fim_semana) continue;
      m[d.data] = e.tiposAusencia.find((x) => x.id === d.tipo_id)?.nome ?? "Ausência";
    }
    out[t.id] = m;
  }
  return out;
}

/* ------------------------------------------------------------------ cada papel é uma pessoa do RH (22/10) */
/**
 * 22/10: a pessoa do RH de cada papel do "A ver como". A Direção é a Marta (a diretora do RH de exemplo). As outras não existiam no RH e
 * entram como os técnicos (juntarPapeisAoRh), com ids próprios: o "p-ruben" do RH é outro Rúben (vendedor futuro em Braga) e a "p-ines" é a
 * gerente da loja do Porto, por isso o Rúben comercial e a Inês do Jurídico são pessoas à parte. O técnico é a pessoa dele (pessoaRhDe).
 */
export const PESSOA_DO_PAPEL: Readonly<Record<Exclude<Papel, "tecnico">, string>> = {
  direcao: "p-marta", operacoes: "p-op-filipe", comercial: "p-com-ruben", financeiro: "p-fin-sandra", armazem: "p-arm-nuno", juridico: "p-jur-ines",
};
/** Os cargos novos das pessoas dos papéis (o Nuno usa o "Operador/a de Armazém" do RH de exemplo). */
const CARGOS_PAPEIS = [
  { id: "cg-gestor-operacoes", nome: "Gestor/a de Operações", salario: 2400 },
  { id: "cg-comercial-obras", nome: "Comercial de obras", salario: 1400 },
  { id: "cg-financeiro", nome: "Técnico/a Financeiro/a", salario: 1700 },
  { id: "cg-juridico", nome: "Jurista", salario: 2100 },
] as const;
type EspecPapel = Pick<EspecPessoa, "id" | "nome" | "apelido" | "cargoId" | "localId" | "filialId" | "reportaA" | "genero" | "nascimento" | "inicio">;
/** As pessoas dos papéis que entram no RH: o Filipe reporta à Marta (e os técnicos a ele), o Rúben ao Rui (o gerente de Lisboa), os outros à Marta. */
const PESSOAS_PAPEIS: readonly EspecPapel[] = [
  { id: PESSOA_DO_PAPEL.operacoes, nome: "Filipe", apelido: "Rocha", cargoId: "cg-gestor-operacoes", localId: K.LOCAL_ARMAZEM, filialId: K.FILIAL_LISBOA, reportaA: "p-marta", genero: "masculino", nascimento: "1984-02-21", inicio: -1800 },
  { id: PESSOA_DO_PAPEL.comercial, nome: "Rúben", apelido: "Costa", cargoId: "cg-comercial-obras", localId: K.LOCAL_COLOMBO, filialId: K.FILIAL_LISBOA, reportaA: "p-rui", genero: "masculino", nascimento: "1992-08-04", inicio: -700 },
  { id: PESSOA_DO_PAPEL.financeiro, nome: "Sandra", apelido: "Moreira", cargoId: "cg-financeiro", localId: K.LOCAL_SEDE, filialId: K.FILIAL_SEDE, reportaA: "p-marta", genero: "feminino", nascimento: "1986-11-13", inicio: -1300 },
  { id: PESSOA_DO_PAPEL.armazem, nome: "Nuno", apelido: "Ferreira", cargoId: "cg-armazem", localId: K.LOCAL_ARMAZEM, filialId: K.FILIAL_LISBOA, reportaA: "p-marta", genero: "masculino", nascimento: "1989-06-30", inicio: -1000 },
  { id: PESSOA_DO_PAPEL.juridico, nome: "Inês", apelido: "Carvalho", cargoId: "cg-juridico", localId: K.LOCAL_SEDE, filialId: K.FILIAL_SEDE, reportaA: "p-marta", genero: "feminino", nascimento: "1987-03-08", inicio: -900 },
];

/** As pessoas (e os cargos) dos papéis no estado do RH, as que faltam. Devolve o estado igual se já lá estão todas. */
export function juntarPapeisAoRh(e: EstadoRh): EstadoRh {
  const faltam = PESSOAS_PAPEIS.filter((p) => !e.fichas[p.id]);
  if (!faltam.length && CARGOS_PAPEIS.every((c) => e.cargos.some((x) => x.id === c.id))) return e;
  const cat = catalogos();
  const novos = CARGOS_PAPEIS.filter((c) => !e.cargos.some((x) => x.id === c.id));
  const cargos = [...e.cargos, ...novos.map((c) => ({ ...cat.cargos[0], id: c.id, nome: c.nome, horas_referencia: 40 }))];
  const cargosPeriodos = [...e.cargosPeriodos, ...novos.filter((c) => !e.cargosPeriodos.some((p) => p.cargo_id === c.id)).map((c) => (
    { id: `cp-${c.id.slice(3)}`, cargo_id: c.id, salario_base: c.salario, periodicidade: "mensal" as const, valido_de: "2024-01-01", valido_ate: null, motivo: null }))];
  const catPapeis = { ...cat, cargos: [...cat.cargos, ...cargos.filter((c) => !cat.cargos.some((x) => x.id === c.id))], cargosPeriodos };
  const fichas: Record<string, FichaRh> = { ...e.fichas };
  const base = Object.keys(e.fichas).length;
  faltam.forEach((p, i) => {
    const espec: EspecPessoa = { ...p, tipo: "sem_termo", fim: null, conta: false, estado: "activo", trabalho: "presencial", horas: 40, dias: ["seg", "ter", "qua", "qui", "sex"] };
    const f = fichaDeEspec(espec, base + i, catPapeis, ORG);
    const salario = CARGOS_PAPEIS.find((c) => c.id === p.cargoId)?.salario;
    fichas[p.id] = salario ? { ...f, retribuicoes: f.retribuicoes.map((r) => ({ ...r, valor_base: salario })) } : f;
  });
  return { ...e, cargos, cargosPeriodos, fichas, ordem: [...e.ordem, ...faltam.map((p) => p.id).filter((id) => !e.ordem.includes(id))] };
}

/** O técnico que se está a ver (o do "A ver como", senão o primeiro com trabalho, como o Hoje do técnico). */
export function tecnicoDoPapel(S: Pick<Estado, "tec" | "deals" | "tecnicos">): FichaTecnico | undefined {
  const L = S.tecnicos ?? TECNICOS;
  const id = S.tec && L.some((x) => x.id === S.tec) ? S.tec : tecnicosComTrabalho(S.deals)[0] ?? "hn";
  return L.find((x) => x.id === id) ?? L[0];
}
/** A pessoa do RH de quem está a ver o protótipo (pelo papel; o técnico, pela ficha dele). */
export function pessoaRhDoPapel(S: Pick<Estado, "role" | "tec" | "deals" | "tecnicos">): string {
  if (S.role !== "tecnico") return PESSOA_DO_PAPEL[S.role];
  const t = tecnicoDoPapel(S);
  return t ? pessoaRhDe(t) : "p-tec-hn";
}

/**
 * A equipa de uma pessoa: ela primeiro e depois quem lhe reporta, direta ou indiretamente (reporta_a_pessoa_id), pela ordem da lista do RH.
 * As pessoas arquivadas (saíram) ficam de fora. A Marta (Direção) tem toda a gente; quem não tem ninguém, só a si.
 */
export function equipaDe(e: EstadoRh, pessoaId: string): string[] {
  const ids = [...e.ordem, ...Object.keys(e.fichas).filter((id) => !e.ordem.includes(id))];
  const filhos = (pai: string) => ids.filter((id) => {
    const p = e.fichas[id]?.pessoa;
    return !!p && p.reporta_a_pessoa_id === pai && p.estado_registo !== "arquivado";
  });
  const out = [pessoaId], vistos = new Set(out);
  for (let i = 0; i < out.length; i++) for (const id of filhos(out[i])) if (!vistos.has(id)) { vistos.add(id); out.push(id); }
  return out;
}

/** As ausências aprovadas no RH de cada pessoa (dias úteis): pessoa → data → nome do tipo. */
export function ausenciasDasPessoas(e: EstadoRh, pessoas: readonly string[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const pid of pessoas) {
    const f = e.fichas[pid];
    if (!f) continue;
    const m: Record<string, string> = {};
    for (const d of f.ausencias.dias) {
      if (d.estado !== "aprovado" || d.e_fim_semana) continue;
      m[d.data] = e.tiposAusencia.find((x) => x.id === d.tipo_id)?.nome ?? "Ausência";
    }
    out[pid] = m;
  }
  return out;
}

/* ------------------------------------------------------------------ a agenda de cada pessoa do RH (22/10) */
/** Na agenda, as visitas de quem não é técnico ficam na linha "com:<primeiro nome>": a pessoa do RH de cada uma. */
export const VISITAS_DA_PESSOA: Readonly<Record<string, string>> = { [PESSOA_DO_PAPEL.comercial]: "Rúben" };
const NOME_FERIADO: Record<string, string> = rhExemploCalendarioTranslations.pt;
/** O feriado nacional desse dia, como item da agenda. */
export function feriadoNaAgenda(data: string): ItemAgenda | null {
  const c = feriadoDe(data);
  return c ? { tipo: "feriado", titulo: NOME_FERIADO[`rhCal.feriado.${c}`] ?? "Feriado", sub: "Feriado nacional" } : null;
}

export interface EntradaAgendaRh extends Omit<EntradaAgenda, "ausencias"> { rh: EstadoRh }
/**
 * As linhas da agenda de várias pessoas do RH, pela ordem pedida. O técnico é a linha dele (tarefas, visitas, férias e ausências); quem faz
 * visitas é a linha das visitas ("com:Rúben"); toda a gente tem as ausências aprovadas no RH e os feriados nacionais. Quem não tem nada
 * fica com uma linha vazia (aparece na mesma). `outros`: no fim, as linhas da agenda sem pessoa do RH (visitas de outras pessoas).
 */
export function agendaDasPessoas(E: EntradaAgendaRh, pessoas: readonly string[], dias: readonly string[], outros = false): LinhaAgenda[] {
  const base = agendaEquipa({ ...E, ausencias: ausenciasDosTecnicos(E.rh, E.tecnicos) }, dias);
  const aus = ausenciasDasPessoas(E.rh, pessoas), usadas = new Set<string>();
  const vazia = (data: string): CelulaAgenda => ({ data, itens: [], horas: 0, viatura: null, conflitos: [] });
  const comFeriados = (l: LinhaAgenda): LinhaAgenda => ({
    ...l, celulas: l.celulas.map((c) => { const f = feriadoNaAgenda(c.data); return f ? { ...c, itens: [f, ...c.itens] } : c; }),
  });
  const L = pessoas.map((pid): LinhaAgenda => {
    const p = E.rh.fichas[pid]?.pessoa, t = tecnicoDaPessoaRh(pid, E.tecnicos), visitas = VISITAS_DA_PESSOA[pid];
    const daBase = base.find((l) => (t ? l.tipo === "tecnico" && l.id === t.id : !!visitas && l.id === `com:${visitas}`));
    if (daBase) usadas.add(daBase.id);
    let linha: LinhaAgenda = daBase
      ? { ...daBase, nome: t ? daBase.nome : p?.nome_completo ?? daBase.nome, pessoaRhId: pid }
      : { id: `rh:${pid}`, nome: p?.nome_completo ?? pid, papel: p?.cargo ?? "", tipo: "pessoa", celulas: dias.map(vazia), pessoaRhId: pid };
    // as ausências do RH (as dos técnicos já vêm na linha deles)
    if (!t) {
      const a = aus[pid] ?? {};
      linha = { ...linha, celulas: linha.celulas.map((c) => (a[c.data] && !c.itens.some((x) => x.tipo === "ferias" || x.tipo === "ausencia")
        ? { ...c, itens: [{ tipo: "ausencia", titulo: a[c.data], sub: "Ausência aprovada no RH" }, ...c.itens] } : c)) };
    }
    return comFeriados(linha);
  });
  // os técnicos de fora da lista não entram; as visitas de quem não é pessoa do RH, sim
  if (outros) for (const l of base) if (!usadas.has(l.id) && l.tipo !== "tecnico") L.push(comFeriados(l));
  return L;
}
/** A agenda de uma pessoa do RH (uma linha). */
export const agendaDaPessoa = (E: EntradaAgendaRh, pessoaId: string, dias: readonly string[]): LinhaAgenda => agendaDasPessoas(E, [pessoaId], dias)[0];
