/**
 * O "hoje" do universo de exemplo de RH.
 *
 * Os dados de exemplo contam uma história com datas absolutas: Setembro de 2026 acabou e está a processar,
 * Agosto está fechado, Outubro é o mês corrente, o Pedro saiu a 4/9. Se «hoje» fosse o relógio do computador,
 * essa história deslizava um dia por dia (e os números do exemplo mudavam com ela). Por isso há UMA data de
 * referência fixa, de onde derivam todos os deslocamentos relativos (`diaIso`), a marca «Hoje» dos calendários,
 * o mês aberto por omissão e os prazos das admissões.
 *
 * Fica REAL (relógio do computador): a hora mostrada ao picar, os carimbos de acções feitas na sessão que não
 * dependem de calendário (histórico, mensagens) e os temporizadores de simulação em directo.
 */
export const HOJE_EXEMPLO_RH = "2026-10-14";

/** O instante de referência: meio-dia UTC de `HOJE_EXEMPLO_RH`, para o dia civil ser o mesmo em qualquer fuso. */
export const AGORA_EXEMPLO_RH = `${HOJE_EXEMPLO_RH}T12:00:00Z`;

/** «Agora» do exemplo (um `Date` novo de cada vez, para quem o possa alterar). */
export function agoraExemplo(): Date {
  return new Date(AGORA_EXEMPLO_RH);
}

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

/**
 * O momento de uma picagem feita agora: o DIA é o de `HOJE_EXEMPLO_RH` (para a picagem aparecer em «hoje») e a
 * HORA é a do relógio real (a que o ecrã mostrou a quem picou).
 */
export function momentoDePicagemAgora(): string {
  const real = new Date();
  const hora = `${doisDigitos(real.getHours())}:${doisDigitos(real.getMinutes())}:${doisDigitos(real.getSeconds())}`;
  return new Date(`${HOJE_EXEMPLO_RH}T${hora}`).toISOString();
}
