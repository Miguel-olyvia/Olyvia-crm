// As pontes dos técnicos de obra para o RH de exemplo (22/10/2026), sem React (como frota/pontes.ts):
// - Pessoas: cada técnico é uma pessoa do RH com o cargo "Técnico de obra" (ids estáveis "p-tec-<id do técnico>"). Para não mexer nos dados
//   nem nos testes do RH de exemplo, as seis pessoas juntam-se ao store do RH quando o RH abre no protótipo (garantirTecnicosNoRh),
//   e só se ainda lá não estiverem; "Repor a demonstração" repõe o RH de origem e elas voltam a entrar quando o RH abrir outra vez.
// - Custo/hora sugerido: do salário e dos encargos da pessoa no RH (a mesma taxa e o mesmo seguro do separador Custos), a dividir pelas horas
//   do contrato. Só se mostra ao lado do campo: quem decide o custo/hora da obra é a Direção (ou as Operações).
// - Ausências: os dias aprovados no RH (férias, baixa...) de cada técnico, para a Agenda.
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

/** O cargo do RH dos técnicos de obra. */
export const CARGO_TECNICO = { id: "cg-tecnico-obra", nome: "Técnico de obra", horas: 40 } as const;
/** O salário base de exemplo de cada técnico (€/mês). */
const SALARIO: Record<string, number> = { js: 920, ra: 920, ma: 1350, sf: 1250, hn: 1220, pm: 1150 };
const SALARIO_CARGO = 1100;

/** A pessoa do RH de um técnico (a da ficha, ou a de sempre: "p-tec-<id>"). */
export const pessoaRhDe = (t: Pick<FichaTecnico, "id" | "pessoaRhId">): string => t.pessoaRhId ?? `p-tec-${t.id}`;
/** O técnico que é esta pessoa do RH. */
export const tecnicoDaPessoaRh = (pid: string, L: readonly FichaTecnico[] = TECNICOS): FichaTecnico | undefined => L.find((t) => pessoaRhDe(t) === pid);

function especDe(t: FichaTecnico, desde: number): EspecPessoa {
  const [nome, ...resto] = t.n.split(" ");
  return {
    id: pessoaRhDe(t), nome, apelido: resto.join(" ") || nome, cargoId: CARGO_TECNICO.id, localId: K.LOCAL_ARMAZEM, filialId: K.FILIAL_LISBOA,
    tipo: "sem_termo", inicio: desde, fim: null, reportaA: "p-marta", conta: false, estado: "activo", genero: "masculino", nascimento: "1988-05-10",
    trabalho: "presencial", horas: CARGO_TECNICO.horas, dias: ["seg", "ter", "qua", "qui", "sex"],
  };
}

/** As pessoas (e o cargo) dos técnicos no estado do RH, as que faltam. Devolve o estado igual se já lá estão todas. */
export function juntarTecnicosAoRh(e: EstadoRh, L: readonly FichaTecnico[] = TECNICOS): EstadoRh {
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
