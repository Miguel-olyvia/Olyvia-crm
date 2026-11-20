// 20/11 (auditoria de 19/11; Rúben: «um botão principal por ecrã»): na Visita apareciam ao mesmo tempo «Começar a gravar», «Continuar no
// Estúdio» e «Fechar levantamento» (e o «Continuar» do passo), todos com aspeto de primário. O ecrã da Visita junta três peças que não se
// conhecem (o painel da gravação, ChamadaDireto; o passo do Estúdio, EstudioNaVisita; o rodapé dos passos, FaseSimples): cada uma diz aqui
// o que sabe e todas lêem a mesma decisão — qual é O botão principal neste estado. Os outros passam a secundários.
//   · antes da visita (nada gravado): «Começar a gravar»;
//   · a gravar: «Abrir o Estúdio» / «Continuar no Estúdio» no passo do Estúdio (a gravação continua lá), «Terminar e preencher» nos outros;
//   · a gravação parou a meio: «Continuar a gravar»;
//   · campos (ou a planta da folha) por confirmar: «Preencher N campos» (ou «Usar esta planta»);
//   · no fim: «Fechar levantamento»;
//   · já gravada: o Estúdio no passo do Estúdio, «Continuar» nos outros.
// Sem o painel da gravação no ecrã (a ficha do Pipeline, a Visita sem Estúdio), não há decisão: cada peça fica como era.
import { useSyncExternalStore } from "react";

/** O botão principal da Visita. */
export type Principal = "gravar" | "retomar" | "terminar" | "estudio" | "confirmar" | "fechar" | "continuar";
/** A gravação, vista pelo painel: livre para começar; a gravar; parada a meio; ou outra coisa (a transcrever, noutro separador, outro negócio). */
export type GravacaoVisita = "livre" | "a_gravar" | "interrompida" | "outro";
/** O passo aberto: o do Estúdio, o fim (o botão do negócio, «Fechar levantamento») ou outro. */
export type PassoVisita = "estudio" | "fim" | "outro";

export interface PainelVisita { gravacao: GravacaoVisita; gravada: boolean; porConfirmar: boolean }
export interface EstadoVisita extends PainelVisita { passo: PassoVisita }

/** Qual é o botão principal (puro, para testar à parte). */
export function principalDaVisita(e: EstadoVisita): Principal {
  if (e.gravacao === "interrompida") return "retomar";
  if (e.gravacao === "a_gravar") return e.passo === "estudio" ? "estudio" : "terminar";
  if (e.porConfirmar) return "confirmar";
  if (e.passo === "fim") return "fechar";
  if (e.gravacao === "livre" && !e.gravada) return "gravar";
  return e.passo === "estudio" ? "estudio" : "continuar";
}

// ---- o que cada peça diz, por negócio (só na memória) ----------------------------------------------

interface UiVisita { painel?: PainelVisita; passo?: PassoVisita }
const VAZIO: UiVisita = {};
const ui = new Map<number, UiVisita>();
const ouvintes = new Set<() => void>();
const igualPainel = (a?: PainelVisita, b?: PainelVisita) =>
  a === b || (!!a && !!b && a.gravacao === b.gravacao && a.gravada === b.gravada && a.porConfirmar === b.porConfirmar);

/** Uma peça diz o que sabe (`undefined` = deixou de estar no ecrã). Só avisa quem ouve quando muda mesmo. */
export function definirVisita(negocio: number, parcial: UiVisita): void {
  const antes = ui.get(negocio) ?? VAZIO;
  const novo: UiVisita = { ...antes, ...parcial };
  if (igualPainel(antes.painel, novo.painel) && antes.passo === novo.passo) return;
  if (!novo.painel && !novo.passo) ui.delete(negocio); else ui.set(negocio, novo);
  ouvintes.forEach((f) => f());
}

const ouvir = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/** O passo aberto da Visita deste negócio (o que o rodapé dos passos disse; «outro» sem ele). */
export function usePassoDaVisita(negocio: number): PassoVisita {
  return useSyncExternalStore(ouvir, () => ui.get(negocio) ?? VAZIO, () => VAZIO).passo ?? "outro";
}

/** O botão principal da Visita deste negócio, ou null quando o painel da gravação não está no ecrã (então cada peça fica como era). */
export function usePrincipalDaVisita(negocio: number): Principal | null {
  const u = useSyncExternalStore(ouvir, () => ui.get(negocio) ?? VAZIO, () => VAZIO);
  return u.painel ? principalDaVisita({ ...u.painel, passo: u.passo ?? "outro" }) : null;
}

/** Para os testes: esquece tudo. */
export function limparVisitas(): void { ui.clear(); ouvintes.forEach((f) => f()); }
