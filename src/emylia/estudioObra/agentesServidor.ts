// 25/11 (plano «Obra Viva», etapa 3b): os agentes no servidor, com a Olyvia fechada. A Edge Function agentes-obra entra com a conta robô
// «Olyvia (agentes)» (o papel das Operações, criada pelo Rúben) e corre isto de 15 em 15 minutos, por organização. Monta o estado como a
// página dos Negócios o monta (as mesmas leituras: o Catálogo e os técnicos, as equipas, a agenda do RH, as visitas, os negócios com a
// obra, as encomendas de cliente), corre a mesma volta dos agentes (VigiaAgentes.voltaDosAgentes: vistos, prazo, aplicar) e grava só as
// obras que mudaram, pela mesma função (obra_guardar_negocio). Antes de gravar, relê a obra: se alguém lhe mexeu entretanto (o técnico,
// o gestor), não grava e fica para a volta seguinte. Nada vai para clientes: os rascunhos do Agente do Cliente ficam à espera de quem envia.
import type { SupabaseClient } from "@supabase/supabase-js";
import { acertarDiaDasObras, acoes, definirRelogioReal, seed, TECS, type Estado, type Negocio } from "../motor";
import { carregarCatalogo } from "../real/carregarCatalogo";
import { carregarCamposConfig } from "../real/camposConfig";
import { aplicarCompromissos, carregarAgendaReal, carregarVisitasCrm } from "../real/agendaReal";
import { definirEncomendasReais, lerEncomendasReais } from "../real/encomendaReal";
import { garantirServicosDosNegocios } from "../real/negocioReal";
import { gravarObra, idsServico, lerNegocios, lerObras, negocioParaOEcra } from "../real/negocioBase";
import { obraDaBase, paraObra } from "../real/obraReal";
import { marcaObra } from "../real/sincronizarNegocios";
import { refNegocio } from "../inventario/ponteNegocios";
import { carregarEquipasObra } from "../equipa/equipasObra";
import { voltaDosAgentes } from "./VigiaAgentes";

export interface ResumoAgentes { org: string; obras: number; aplicadas: number; gravadas: number; adiadas: number; erros: string[] }

/** Uma volta dos agentes numa organização, com o cliente da base já com a sessão da conta robô. */
export async function correrAgentesServidor(sb: SupabaseClient, org: string, agora = new Date()): Promise<ResumoAgentes> {
  const erros: string[] = [];
  definirRelogioReal(true);
  const S: Estado = seed();
  S.deals = []; S.clientes = []; S.deal = null;
  S.role = "operacoes";
  // o Catálogo (os serviços e os técnicos do RH), como a página: sem ele não se mexe em nada
  const cat = await carregarCatalogo(sb, org, S, { tolerante: true, leve: true });
  if (cat.erro) return { org, obras: 0, aplicadas: 0, gravadas: 0, adiadas: 0, erros: [`Catálogo: ${cat.erro}`] };
  await carregarEquipasObra(sb, org).catch(() => undefined);
  try { await carregarCamposConfig(sb, org, S, {}); } catch (e) { erros.push(`Campos: ${(e as Error).message}`); }
  const ag = await carregarAgendaReal(sb, org, agora);
  if (ag.erro) erros.push(`Agenda do RH: ${ag.erro}`);
  const vc = await carregarVisitasCrm(sb, org, agora);
  if (vc.erro) erros.push(`Visitas: ${vc.erro}`);
  const ids = idsServico(cat.M.ids.servico);
  const lidos = await lerNegocios(sb, org, ids, S.campos, { semSugestoes: true });
  // a obra como veio da base (antes de acertar o dia de hoje): é com isto que se compara antes de gravar
  const daBase = new Map(lidos.map((n) => [n.id, marcaObra({ obra: n.obra ?? null } as unknown as Negocio)]));
  S.deals = lidos.map(negocioParaOEcra);
  acertarDiaDasObras(S.deals);
  garantirServicosDosNegocios(S, S.deals);
  aplicarCompromissos(TECS, new Set(S.deals.map((d) => d.id)), agora);
  // as encomendas de cliente emitidas (o Agente dos Materiais)
  const pares = lidos.flatMap((n) => {
    const d = S.deals.find((x) => x.id === n.linhas.negocio.numero);
    return n.ec?.emitida_em && d ? [{ ref: refNegocio(d), contrato: n.ec.contract_id }] : [];
  });
  try { const r = await lerEncomendasReais(sb, org, pares); definirEncomendasReais(r.mapa); if (r.erros.length) erros.push(`Encomendas: ${r.erros[0]}`); }
  catch (e) { erros.push(`Encomendas: ${(e as Error).message}`); }

  const porNumero = new Map(lidos.map((n) => [n.linhas.negocio.numero, n]));
  const antes = new Map(S.deals.map((d) => [d.id, marcaObra(d)]));
  const A = acoes(S, () => {}, (fn) => fn());
  const obras = S.deals.filter((d) => d.obra.plano && (d.obra.plano.estado === "em curso" || d.obra.plano.estado === "aprovado") && !d.perdido).length;
  const aplicadas = voltaDosAgentes({ S, A, run: (fn) => fn() }, agora);

  // gravar só as obras que mudaram, e só se a base ainda tem o que se leu
  const mudadas = S.deals.filter((d) => marcaObra(d) !== antes.get(d.id));
  let gravadas = 0, adiadas = 0;
  if (mudadas.length) {
    const naBase = await lerObras(sb, org);
    for (const d of mudadas) {
      const n = porNumero.get(d.id);
      if (!n || n.docsCrm || n.podeGravar === false) continue;
      const agoraNaBase = naBase?.get(n.id);
      if (naBase && agoraNaBase !== undefined && marcaObra({ obra: obraDaBase(agoraNaBase) } as Negocio) !== daBase.get(n.id)) { adiadas++; continue; }
      try { await gravarObra(sb, org, n.id, paraObra(d, agora)); gravadas++; }
      catch (e) { erros.push(`Obra ${d.id}: ${(e as Error).message}`); }
    }
  }
  return { org, obras, aplicadas, gravadas, adiadas, erros };
}
