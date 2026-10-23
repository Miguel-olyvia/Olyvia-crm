/**
 * Das linhas dos stores (ficha, gestao, horarios, horas extra e banco) para a entrada pura de `montarMes`.
 * Sem React: serve o calendario da pessoa (por hook) e o Calculo do mes (por leitura directa), que por isso
 * partem exactamente dos mesmos dados.
 */
import type { EstadoGestao } from "@/components/rh-exemplo/dados/tiposGestao";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type { EstadoFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import type { EstadoFluxosC } from "@/components/rh-exemplo/fluxosC/dadosFluxosC";
import { comoRealizadoComCorreccao } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
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
