// 27/11 (Rúben: «preciso que passes todos os negócios que importamos via contrato para o arranque de obra»). Só no modo de teste do super
// admin (as Ferramentas de teste do negócio). Leva um negócio com a proposta aceite até à obra em curso, pelos MESMOS passos e ações da app
// que se fazem à mão (o teste do 1029, Manuel Jorge):
//   contrato (a minuta com as perguntas a «TESTE (por preencher)», as condições, o envio e a assinatura pelo cliente em modo de teste) →
//   fatura do ERP registada sem confirmar e o 1.º pagamento validado → medidas aceites como na visita → plano com os conflitos resolvidos,
//   «sem adenda» se o valor mudou, e aprovado → materiais garantidos (real/materiaisTeste.ts) → a parcela do arranque faturada e paga →
//   «Preparar a obra» com o que falta e «Arrancar».
// Cada passo é uma ação do motor (gravada pela página, como um clique) ou uma função da base que a página já usa; nunca se escreve a fase
// à força. Antes de cada passo relê-se o estado: se um passo não muda nada, pára e diz onde ficou (alguém pode estar a mexer no negócio).
// Nada vai a clientes nem a fornecedores: a assinatura é a do modo de teste, as encomendas a fornecedor recebem-se sem se enviarem, e o
// testarh tem o ENVIOS_SO_PARA.
import { TECS, acertoDoValorPendente, proximo, type Estado, type Negocio, type acoes } from "../motor";
import { OBRA, PROPOSTA, efetivo, emFalta, type Grupo } from "../campos";
import { parcelaDoArranquePorPagar } from "../parcelas";
import { retificacaoAceite, supervisorDasMedidas } from "../preparacaoObra";
import { prontaReal, prontidaoDe } from "../inventario/prontidaoReal";

type Acoes = ReturnType<typeof acoes>;
export interface DependenciasArranque {
  S: Estado;
  A: Acoes;
  /** Uma ação do motor, como um clique (a página grava a seguir). */
  run: (fn: () => void) => void;
  /** Espera que a gravação acabe (com o que a base devolve: a fatura, o recibo, a encomenda de cliente). */
  esperarGravacao: () => Promise<void>;
  /** Relê os negócios, as encomendas de cliente e a prontidão da base. */
  reler: () => Promise<void>;
  /** A minuta do contrato com as perguntas respondidas a «TESTE (por preencher)» (nada se faz se já houver uma). */
  prepararMinuta: (d: Negocio) => Promise<void>;
  /** O cliente assina o contrato pelo portal, em modo de teste. */
  assinarContrato: (d: Negocio) => Promise<void>;
  /** Os materiais da encomenda de cliente garantidos (o botão de teste do passo Materiais). */
  garantirMateriais: (contrato: string) => Promise<void>;
  /** Hoje, «aaaa-mm-dd». */
  hoje: () => string;
}
export interface ResultadoArranque { id: number; nome: string; ok: boolean; ficou: string; feito: string[] }

export const RESPOSTA_TESTE = "TESTE (por preencher)";
const MAX_PASSOS = 14;

/** O valor de teste de um campo em falta (o primeiro da lista, «Não» num sim/não, hoje numa data). */
export function valorDeTeste(c: Grupo["campos"][number], hoje: string, k: string): string {
  if (c.t === "sim_nao") return k === "condominio" ? "Sim" : "Não";
  if (c.t === "escolha" || c.t === "varios") return c.op?.[0] ?? "Teste";
  if (c.t === "data") return hoje;
  if (c.t === "numero" || c.t === "contador") return "1";
  return "Teste";
}
/** Preenche o que falta num grupo de campos (as condições do contrato, «Preparar a obra»). Devolve quantos preencheu. */
export function preencherEmFalta(dep: DependenciasArranque, d: Negocio, grupo: Grupo): number {
  const F = emFalta([efetivo(dep.S.campos, grupo)], d.f);
  if (!F.length) return 0;
  dep.run(() => { for (const c of F) dep.A.campo(d.id, c.k, valorDeTeste(c as Grupo["campos"][number], dep.hoje(), c.k)); });
  return F.length;
}

/** Um retrato do estado do negócio, para saber se um passo mudou alguma coisa. */
export const retrato = (d: Negocio): string => JSON.stringify([
  d.fase, d.orc?.contrato, d.fin.fatura?.n, d.fin.pago, d.f.retif_aceite, d.f.supervisor_medidas, d.obra.plano?.estado, !!d.obra.ec,
  d.obra.ec?.contrato ? prontaReal(prontidaoDe(d.obra.ec.contrato)) : null, (d.fin.tranches ?? []).map((t) => [t.numero, !!t.pagamento]),
]);

/** Leva o negócio até à obra em curso (ver o topo do ficheiro). */
export async function levarAoArranque(dep: DependenciasArranque, id: number, aoPasso?: (t: string) => void): Promise<ResultadoArranque> {
  const { S, A } = dep;
  const deal = () => S.deals.find((x) => x.id === id);
  const papel0 = S.role;
  const feito: string[] = [];
  const passo = (t: string) => { feito.push(t); aoPasso?.(t); };
  const fazer = async (papel: Estado["role"], fn: () => void) => { S.role = papel; dep.run(fn); await dep.esperarGravacao(); };
  try {
    for (let i = 0; i < MAX_PASSOS; i++) {
      const d = deal();
      if (!d) return { id, nome: "?", ok: false, ficou: "o negócio não está carregado", feito };
      if (d.obra.plano?.estado === "em curso" || d.obra.plano?.estado === "concluída") return { id, nome: d.nome, ok: true, ficou: "obra em curso", feito };
      if (d.anulado || d.perdido) return { id, nome: d.nome, ok: false, ficou: "negócio anulado ou perdido", feito };
      if (!d.orc?.aceite) return { id, nome: d.nome, ok: false, ficou: "a proposta ainda não está aceite", feito };
      const antes = retrato(d);

      if (!d.orc.vendaDireta && d.orc.contrato !== "assinado") {
        // 1. o contrato
        await dep.prepararMinuta(d);
        S.role = "comercial";
        if (preencherEmFalta(dep, d, PROPOSTA[1])) await dep.esperarGravacao();
        if (deal()!.orc!.contrato !== "enviado") await fazer("comercial", () => { A.contratoNoPortal(id); });
        await dep.assinarContrato(deal()!);
        await dep.reler();
        passo("contrato assinado (teste)");
      } else if (!d.fin.fatura) {
        // 2. a fatura do ERP, sem confirmar (o ERP é só de leitura)
        await fazer("financeiro", () => { A.registarFaturaErp(id, `FT 2026/TESTE-${id}`, null, true); });
        passo("fatura registada");
      } else if (!d.fin.pago) {
        await fazer("financeiro", () => { A.validar(id); });
        await dep.reler();
        passo("1.º pagamento validado");
      } else if (!retificacaoAceite(d)) {
        // 3. as medidas, como na visita
        const quem = supervisorDasMedidas(d) ? null : TECS[0]?.id;
        await fazer("operacoes", () => { if (quem) A.supervisorMedidas(id, quem); A.retificarMedidas(id); });
        passo("medidas aceites");
      } else if (!d.obra.plano || d.obra.plano.estado === "por aprovar") {
        // 4. o plano
        await fazer("operacoes", () => {
          A.resolverConflitos(id);
          if (acertoDoValorPendente(deal()!)) { S.role = "comercial"; A.semAdendaDoValor(id); S.role = "operacoes"; }
          A.aprovarPlano(id);
        });
        await dep.reler();
        passo("plano aprovado");
      } else if (d.obra.ec?.contrato && !prontaReal(prontidaoDe(d.obra.ec.contrato))) {
        // 5. os materiais
        await dep.garantirMateriais(d.obra.ec.contrato);
        await dep.reler();
        passo("materiais garantidos (teste)");
      } else if (parcelaDoArranquePorPagar(S, d)) {
        // 6. a parcela do arranque
        const pa = parcelaDoArranquePorPagar(S, d)!;
        if (!pa.fatura) await fazer("financeiro", () => { A.registarFaturaParcela(id, pa.id, `FT 2026/TESTE-${id}-A`); });
        await fazer("financeiro", () => { A.validarParcela(id, pa.id); });
        await dep.reler();
        passo("parcela do arranque paga");
      } else {
        // 7. preparar e arrancar
        S.role = "operacoes";
        if (preencherEmFalta(dep, d, OBRA[0])) await dep.esperarGravacao();
        await fazer("operacoes", () => { A.arrancar(id); });
        passo("arrancar");
      }

      const depois = deal();
      if (depois && retrato(depois) === antes && !(depois.obra.plano?.estado === "em curso")) {
        return { id, nome: depois.nome, ok: false, ficou: proximo(depois, S).t, feito };
      }
    }
    const d = deal();
    return { id, nome: d?.nome ?? "?", ok: d?.obra.plano?.estado === "em curso", ficou: d ? (d.obra.plano?.estado === "em curso" ? "obra em curso" : proximo(d, S).t) : "?", feito };
  } finally {
    S.role = papel0;
  }
}

/** «1017-1020, 1025» → [1017, 1018, 1019, 1020, 1025]. */
export function lerNumeros(texto: string): number[] {
  const out: number[] = [];
  for (const parte of texto.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(parte);
    if (!m) continue;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b) && out.length < 500; n++) if (!out.includes(n)) out.push(n);
  }
  return out;
}
