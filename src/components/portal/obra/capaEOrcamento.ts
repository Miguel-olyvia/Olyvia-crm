// 23/11: o que o documento do template ainda não tinha da folha da Emylia (DocsCliente.tsx, PropostaDoc):
//  · a carta e o resumo da capa («Olá, …», «Obrigado por nos ter recebido (…)», total com IVA, prazo, início previsto, garantia,
//    «Preparada para», data e «Válida até»), que entram ONDE O TEMPLATE NÃO ESCREVE o cabeçalho (o texto do template manda);
//  · o «03 Orçamento detalhado» (por fase ou por zona, com os subtotais, a mão de obra e os materiais sem IVA, o IVA a 6% e a 23%
//    e o total), para o passo «Proposta» do CRM antes de existir a proposta real (depois dela, o 03 é o orçamento do template).
// Sem React: os dados saem da vista (a do portal, ou a montada no CRM com vistaDoCliente), pelas mesmas funções da Emylia.
// O cálculo do 03 está em orcamentoObra.ts (puxa a folha da Emylia, DocsCliente): o portal só lê a capa e não o carrega.
import type { LinhaOrcamentoDoc } from "@/emylia/DocsCliente";
import { diasDaObra } from "@/emylia/planoObra";
import { diasDoPlano, inicioDaObra, validadeDaProposta } from "@/emylia/propostaDados";
import type { FaseObra } from "@/emylia/fasesObra";
import { estadoDaVista, type EstadoDosDocs, type PropostaObra, type VistaDoPortal } from "./dadosObra";

export interface CapaObra {
  primeiroNome: string;
  /** O dia da visita («seg, 3 nov»), como a Emylia o escreve; null sem visita marcada. */
  visita: string | null;
  preparadaPara: string; contacto: string; nif: string | null;
  emitida: Date; validaAte: Date;
  total: number; prazo: number; inicio: Date; garantia: string | null;
  /** Quem assina a carta: o comercial; sem ele, a empresa. */
  assina: string; empresa: string;
}

/** A carta e o resumo da capa; null sem vista ou sem orçamento. `obra`: os blocos já calculados (o mesmo total, prazo e validade). */
export function capaDaVista(v: VistaDoPortal | null | undefined, obra: PropostaObra | null | undefined, docs: EstadoDosDocs = {}): CapaObra | null {
  if (!v?.d?.orc || !obra) return null;
  const S = estadoDaVista(v, docs);
  const d = S.deals[0];
  if (!d?.orc) return null;
  const inicio = diasDaObra(inicioDaObra(d), diasDoPlano(d, S))[0] ?? inicioDaObra(d);
  return {
    primeiroNome: d.nome.split(" ")[0] ?? d.nome,
    visita: d.visita.slot ? d.visita.slot.split(" · ")[0] : null,
    preparadaPara: d.f.nome_fiscal || d.nome, contacto: d.f.email || d.tel, nif: d.f.nif_fat || d.f.nif || null,
    emitida: validadeDaProposta(d).emitida, validaAte: obra.condicoes.validaAte,
    total: obra.total, prazo: obra.condicoes.prazo, inicio, garantia: obra.condicoes.garantia,
    assina: obra.aceitacao.comercial || obra.aceitacao.empresa, empresa: obra.aceitacao.empresa,
  };
}

export type TituloDoGrupo = { tipo: "fase"; n: FaseObra } | { tipo: "zona"; zona: string };
export interface GrupoDoOrcamento { chave: string; titulo: TituloDoGrupo; cor: string | null; linhas: LinhaOrcamentoDoc[]; subtotal: number }
export interface OrcamentoObra { grupos: GrupoDoOrcamento[]; desconto: number; mo: number; mat: number; ivaMo: number; ivaMat: number; total: number }

