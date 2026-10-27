/**
 * Das linhas dos stores (ficha, gestao, horarios, horas extra e banco) para a entrada pura de `montarMes`.
 * Sem React: serve o calendario da pessoa (por hook) e o Calculo do mes (por leitura directa), que por isso
 * partem exactamente dos mesmos dados.
 */
import type { EstadoGestao } from "@/components/rh-exemplo/dados/tiposGestao";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type { EstadoFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import type { EstadoFluxosC } from "@/components/rh-exemplo/fluxosC/dadosFluxosC";
import { comoRealizadoComCorreccao, type AssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import { LEITOR_FALTAS, LEITOR_PICAGENS, LEITOR_REALIZADO, emVigor } from "@/components/rh-exemplo/lib/assiduidade";
import { distanciaMetros, foraDoLocal, referenciaDoLocal } from "@/components/rh-exemplo/lib/picagemLocal";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";
import type { AusenciaTipo } from "@/components/rh-exemplo/tiposAusencias";
import type { AusenciaDoDiaCal } from "./previsto";
import type { EntradaMes } from "./montarMes";

export interface FonteDoMes {
  gestao: Pick<EstadoGestao, "picagens" | "faltas">;
  fluxosB: Pick<EstadoFluxosB, "horarios">;
  fluxosC: Pick<EstadoFluxosC, "horasExtra" | "banco" | "podeHE">;
  tiposAusencia: readonly AusenciaTipo[];
  locais: readonly LocalTrabalho[];
  hoje: string;
}

/** Ausencias aprovadas por dia (a de maior fraccao ganha), com o nome do tipo. */
export function ausenciasAprovadas(ficha: FichaRh, tipos: readonly AusenciaTipo[]): Map<string, AusenciaDoDiaCal> {
  const mapa = new Map<string, AusenciaDoDiaCal>();
  for (const dia of ficha.ausencias.dias) {
    if (dia.estado !== "aprovado") continue;
    const anterior = mapa.get(dia.data);
    if (anterior && anterior.fraccao >= dia.fraccao_dia) continue;
    mapa.set(dia.data, { nome: tipos.find((t) => t.id === dia.tipo_id)?.nome ?? "", fraccao: dia.fraccao_dia });
  }
  return mapa;
}

function diasForaDoLocal(picagens: EntradaMes["picagens"], locais: readonly LocalTrabalho[]): Set<string> {
  const dias = new Set<string>();
  for (const p of picagens) {
    if (p.latitude === null || p.longitude === null) continue;
    const local = locais.find((l) => l.id === p.local_id);
    if (foraDoLocal(distanciaMetros({ latitude: p.latitude, longitude: p.longitude }, referenciaDoLocal(local)))) dias.add(p.data_local);
  }
  return dias;
}

/** O que o calendario real le do hook de assiduidade da pessoa (linhas em bruto, com as substituidas). */
export type AssiduidadeDoMes = Pick<
  AssiduidadeDaPessoa,
  "picagens" | "realizado" | "faltas" | "ausenciaAprovadaPorDia" | "planeado" | "planeadoRecusado"
>;

export interface FonteReal {
  ano: number;
  /** 1 a 12. */
  mes: number;
  hoje: string;
  contrato: EntradaMes["contrato"];
  assiduidade: AssiduidadeDoMes;
  tiposAusencia: readonly Pick<AusenciaTipo, "id" | "nome">[];
  /** Do horario planeado real (`horarioPessoaDeLinhas`); `undefined` = a pessoa nao tem horario planeado. */
  horario: EntradaMes["horario"];
  horasExtra: EntradaMes["horasExtra"];
  banco: EntradaMes["banco"];
  podeHE: boolean;
}

/**
 * A entrada do mes a partir da assiduidade REAL: as tabelas leem-se em bruto e o valor em vigor tira-se aqui com
 * `emVigor`, a mesma regra das vistas. Picagens, horas realizadas, faltas, ausencias e o horario planeado vem da base;
 * so as horas extra e o banco continuam a vir dos stores (ainda nao tem tabela).
 */
export function entradaMesReal(f: FonteReal): EntradaMes {
  const ausencias = new Map<string, AusenciaDoDiaCal>();
  for (const [data, dia] of f.assiduidade.ausenciaAprovadaPorDia) {
    const tipoId = (dia as { tipo_id?: string | null }).tipo_id;
    ausencias.set(data, { nome: f.tiposAusencia.find((t) => t.id === tipoId)?.nome ?? "", fraccao: dia.fraccao_dia });
  }
  return {
    ano: f.ano,
    mes: f.mes,
    hoje: f.hoje,
    horario: f.horario,
    contrato: f.contrato,
    ausencias,
    realizado: emVigor(f.assiduidade.realizado, LEITOR_REALIZADO).filter((l) => !l.deleted_at),
    picagens: emVigor(f.assiduidade.picagens, LEITOR_PICAGENS),
    faltas: emVigor(f.assiduidade.faltas, LEITOR_FALTAS),
    horasExtra: f.horasExtra,
    banco: f.banco,
    podeHE: f.podeHE,
    // As picagens lidas da base nao trazem coordenadas: nao ha como medir a distancia ao local.
    diasForaDoLocal: new Set<string>(),
  };
}

export function entradaMesDaFicha(ficha: FichaRh, ano: number, mes: number, fonte: FonteDoMes): EntradaMes {
  const id = ficha.pessoa.id;
  const picagens = emVigor(fonte.gestao.picagens.filter((p) => p.pessoa_id === id), LEITOR_PICAGENS);
  return {
    ano,
    mes,
    hoje: fonte.hoje,
    horario: fonte.fluxosB.horarios[id],
    contrato: ficha.pessoa.data_admissao ? { desde: ficha.pessoa.data_admissao, ate: ficha.pessoa.data_saida ?? null } : null,
    ausencias: ausenciasAprovadas(ficha, fonte.tiposAusencia),
    realizado: emVigor(ficha.horarioRealizado.map(comoRealizadoComCorreccao), LEITOR_REALIZADO).filter((l) => !l.deleted_at),
    picagens,
    faltas: emVigor(fonte.gestao.faltas.filter((f) => f.pessoa_id === id), LEITOR_FALTAS),
    horasExtra: fonte.fluxosC.horasExtra.filter((h) => h.pessoaId === id),
    banco: fonte.fluxosC.banco.filter((m) => m.pessoaId === id),
    podeHE: fonte.fluxosC.podeHE[id] === true,
    diasForaDoLocal: diasForaDoLocal(picagens, fonte.locais),
  };
}
