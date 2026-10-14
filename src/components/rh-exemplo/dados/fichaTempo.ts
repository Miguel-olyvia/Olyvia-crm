/** Horário planeado, horário realizado e ausências de exemplo de uma pessoa. */
import type { Catalogos } from "@/components/rh-exemplo/dados/catalogos";
import type { AusenciaDoDiaCal } from "@/components/rh-exemplo/calendarioPessoa/previsto";
import { ausenciasDoPlano } from "@/components/rh-exemplo/dados/assiduidadePlano";
import { gerarEGuardar } from "@/components/rh-exemplo/dados/assiduidadeSetembro";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { EXCECOES_EXEMPLO, configDaPessoa } from "@/components/rh-exemplo/dados/horariosIniciaisB";
import type { EspecPessoa } from "@/components/rh-exemplo/dados/fichaExemplo";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { calcularPedido } from "@/components/rh-exemplo/lib/ausencias";
import type { DiaSemana, HorarioPlaneado, HorarioRealizado } from "@/components/rh-exemplo/tipos";
import type {
  AusenciaDia,
  AusenciaPedido,
  AusenciaTipo,
  EstadoPedido,
} from "@/components/rh-exemplo/tiposAusencias";

const NUMERO_DO_DIA: Record<DiaSemana, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

const MANHA = { inicio: "09:00", fim: "13:00" } as const;
const TARDE = { inicio: "14:00", fim: "18:00" } as const;
/** O Hugo tem horario repartido: dois periodos, com a pausa a meio da tarde. */
const REPARTIDO_1 = { inicio: "11:00", fim: "15:00" } as const;
const REPARTIDO_2 = { inicio: "19:00", fim: "23:00" } as const;

function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

function linhaPlaneada(
  e: EspecPessoa,
  org: string,
  chave: string,
  campos: Partial<HorarioPlaneado>,
): HorarioPlaneado {
  return {
    id: `hp-${e.id}-${chave}`,
    pessoa_id: e.id,
    organization_id: org,
    vinculo_id: `vin-${e.id}`,
    local_id: e.localId,
    dia_semana: null,
    data: null,
    hora_inicio: null,
    hora_fim: null,
    nao_trabalha: false,
    ordem: 1,
    valido_de: null,
    valido_ate: null,
    notas: null,
    corrige_horario_id: null,
    correccao_motivo: null,
    corrigido_por_anew_user_id: null,
    corrigido_por_pessoa_id: null,
    ...campos,
  };
}

export function horariosDeExemplo(
  e: EspecPessoa,
  org: string,
  cat: Catalogos,
  ausencias: FichaRh["ausencias"] = ausenciasDeExemplo(e, org, cat),
): Pick<FichaRh, "horarioPlaneado" | "horarioRealizado"> {
  const [manha, tarde] = e.id === "p-hugo" ? [REPARTIDO_1, REPARTIDO_2] : [MANHA, TARDE];
  const desde = e.historicoLocal ? diaIso(-119) : diaIso(Math.min(e.inicio, 0));
  const ate = e.saida !== undefined ? diaIso(e.saida) : null;
  const planeado: HorarioPlaneado[] = [];

  for (const dia of e.dias) {
    const n = NUMERO_DO_DIA[dia];
    if (e.historicoLocal) {
      planeado.push(
        linhaPlaneada(e, org, `ant-${dia}`, {
          dia_semana: n,
          hora_inicio: "09:00",
          hora_fim: "17:00",
          valido_de: diaIso(Math.min(e.inicio, -400)),
          valido_ate: diaIso(-120),
        }),
      );
    }
    planeado.push(
      linhaPlaneada(e, org, `${dia}-1`, {
        dia_semana: n,
        hora_inicio: manha.inicio,
        hora_fim: manha.fim,
        ordem: 1,
        valido_de: desde,
        valido_ate: ate,
      }),
      linhaPlaneada(e, org, `${dia}-2`, {
        dia_semana: n,
        hora_inicio: tarde.inicio,
        hora_fim: tarde.fim,
        ordem: 2,
        valido_de: desde,
        valido_ate: ate,
      }),
    );
  }

  if (e.id === "p-rui") {
    planeado.push(
      linhaPlaneada(e, org, "folga", { data: diaIso(12), nao_trabalha: true, notas: "Folga combinada" }),
    );
  }

  const aprovadas = new Map<string, AusenciaDoDiaCal>();
  for (const dia of ausencias.dias) {
    if (dia.estado !== "aprovado") continue;
    aprovadas.set(dia.data, { nome: cat.tiposAusencia.find((t) => t.id === dia.tipo_id)?.nome ?? "", fraccao: dia.fraccao_dia });
  }
  const gerada = gerarEGuardar({
    pessoaId: e.id,
    organizationId: org,
    vinculoId: `vin-${e.id}`,
    localId: e.localId,
    config: configDaPessoa(e.id, planeado, e.horas),
    excecoes: EXCECOES_EXEMPLO[e.id] ?? [],
    contrato: { desde: diaIso(e.inicio), ate: e.saida !== undefined ? diaIso(e.saida) : null },
    ausencias: aprovadas,
    hoje: diaIso(0),
    decididoPor: "p-sofia",
    decididoPorNome: "Sofia Rebelo",
  });
  const realizado: HorarioRealizado[] = gerada.realizado;
  return { horarioPlaneado: planeado, horarioRealizado: realizado };
}

/** Um pedido de ausência e os seus dias, calculados como a base os calcularia. */
export function montarPedido(args: {
  id: string;
  org: string;
  pessoaId: string;
  tipo: AusenciaTipo;
  vinculoId: string | null;
  dataInicio: string;
  dataFim: string;
  meioDiaInicio: boolean;
  meioDiaFim: boolean;
  estado: EstadoPedido;
  aprovadorId: string | null;
  criadoPorId: string | null;
  origem?: AusenciaPedido["origem"];
  substituiPedidoId?: string | null;
}): { pedido: AusenciaPedido; dias: AusenciaDia[] } {
  const ano = args.dataInicio.slice(0, 4);
  const periodoInicio = `${ano}-01-01`;
  const calculo = calcularPedido({
    dataInicio: args.dataInicio,
    dataFim: args.dataFim,
    tipo: args.tipo,
    meioDiaInicio: args.meioDiaInicio,
    meioDiaFim: args.meioDiaFim,
    periodos: [{ periodo_inicio: periodoInicio, periodo_fim: `${ano}-12-31` }],
  });
  const estadoDia = args.estado === "aprovado" ? "aprovado" : args.estado === "cancelado" ? "cancelado" : args.estado === "recusado" ? "recusado" : "pendente";
  return {
    pedido: {
      id: args.id,
      organization_id: args.org,
      pessoa_id: args.pessoaId,
      tipo_id: args.tipo.id,
      vinculo_id: args.vinculoId,
      data_inicio: args.dataInicio,
      data_fim: args.dataFim,
      meio_dia_inicio: args.meioDiaInicio,
      meio_dia_fim: args.meioDiaFim,
      hora_inicio: null,
      hora_fim: null,
      dias_solicitados: calculo.total,
      estado: args.estado,
      aprovador_chefia_pessoa_id: args.aprovadorId,
      criado_por_pessoa_id: args.criadoPorId,
      origem: args.origem ?? "ficha",
      schedule_item_id: null,
      periodo_inicio: periodoInicio,
      periodo_fim: `${ano}-12-31`,
      created_at: new Date().toISOString(),
      substitui_pedido_id: args.substituiPedidoId ?? null,
    },
    dias: calculo.dias.map((dia) => ({
      id: `${args.id}-${dia.data}`,
      pedido_id: args.id,
      pessoa_id: args.pessoaId,
      organization_id: args.org,
      tipo_id: args.tipo.id,
      data: dia.data,
      fraccao_dia: dia.fraccao,
      conta_saldo: args.tipo.desconta_saldo,
      e_feriado: dia.eFeriado,
      e_fim_semana: dia.eFimDeSemana,
      periodo_inicio: dia.periodoInicio,
      estado: estadoDia,
    })),
  };
}

/**
 * O calculo do pedido salta sabados e domingos, mas quem trabalha de terca a sabado tambem esta ausente ao sabado.
 * Estes dias completam a ausencia, sem contar para o saldo de ferias (esse ja foi calculado pelo pedido).
 */
function diasDeTrabalhoEmFalta(
  e: EspecPessoa, org: string, pedidoId: string, tipo: AusenciaTipo, de: string, ate: string,
  estado: EstadoPedido, jaIncluidos: string[],
): AusenciaDia[] {
  if (estado !== "aprovado") return [];
  const extra: AusenciaDia[] = [];
  for (let data = de; data <= ate; data = somarDias(data, 1)) {
    const dow = new Date(`${data}T00:00:00Z`).getUTCDay();
    const trabalha = e.dias.some((d) => NUMERO_DO_DIA[d] === dow);
    if (!trabalha || jaIncluidos.includes(data)) continue;
    extra.push({
      id: `${pedidoId}-${data}`, pedido_id: pedidoId, pessoa_id: e.id, organization_id: org, tipo_id: tipo.id, data,
      fraccao_dia: 1, conta_saldo: false, e_feriado: false, e_fim_semana: true, periodo_inicio: `${data.slice(0, 4)}-01-01`, estado: "aprovado",
    });
  }
  return extra;
}

export function ausenciasDeExemplo(
  e: EspecPessoa,
  org: string,
  cat: Catalogos,
): FichaRh["ausencias"] {
  const ano = diaIso(0).slice(0, 4);
  const ferias = cat.tiposAusencia.find((t) => t.codigo === "FERIAS");
  const emActividade = e.estado === "activo" || e.estado === "suspenso";
  const direitos =
    ferias && emActividade
      ? [
          {
            id: `ad-${e.id}`,
            pessoa_id: e.id,
            organization_id: org,
            tipo_id: ferias.id,
            vinculo_id: `vin-${e.id}`,
            periodo_inicio: `${ano}-01-01`,
            periodo_fim: `${ano}-12-31`,
            dias_direito: 22,
            minutos_direito: null,
            origem: "legal" as const,
            notas: null,
          },
        ]
      : [];
  const resultado: FichaRh["ausencias"] = { pedidos: [], decisoes: [], dias: [], direitos, ajustes: [] };
  ausenciasDoPlano(e.id).forEach(({ codigo, de, ate, estado }, i) => {
    const tipo = cat.tiposAusencia.find((t) => t.codigo === codigo);
    if (!tipo) return;
    const { pedido, dias } = montarPedido({
      id: `ped-${e.id}-${i + 1}`,
      org,
      pessoaId: e.id,
      tipo,
      vinculoId: `vin-${e.id}`,
      dataInicio: de,
      dataFim: ate,
      meioDiaInicio: false,
      meioDiaFim: false,
      estado,
      aprovadorId: e.reportaA,
      criadoPorId: e.id,
    });
    resultado.pedidos.push(pedido);
    resultado.dias.push(...dias, ...diasDeTrabalhoEmFalta(e, org, pedido.id, tipo, de, ate, estado, dias.map((d) => d.data)));
    if (estado === "aprovado" && e.reportaA) {
      resultado.decisoes.push({
        id: `dec-${pedido.id}`,
        pedido_id: pedido.id,
        pessoa_id: e.id,
        organization_id: org,
        ordem: 1,
        passo: "chefia",
        resultado: "aprovado",
        decidido_por_pessoa_id: e.reportaA,
        decidido_em: `${somarDias(de, -5)}T10:00:00Z`,
        motivo: null,
        ajuste_data_inicio: null,
        ajuste_data_fim: null,
        ajuste_dias: null,
      });
    }
  });
  return resultado;
}
