// A estrutura do menu da Frota (MENU do protótipo HTML), os títulos de cada ecrã e os contadores (função contagem()).
import { CalendarDays, ChartColumn, FileBadge, Fuel, IdCard, KeyRound, Sun, TriangleAlert, Truck, Waypoints, Wrench, type LucideIcon } from "lucide-react";
import type { AbaFrota } from "./loja";
import { PESSOA_TECNICO, type PerfilFrota } from "./perfil";
import { alertas, ativa, multasPend, revisao, viaturaDe } from "./regras";
import type { Frota, LinhaCarrinha, Viatura } from "./tipos";

export const ICONE_FROTA = Truck;
export const ICONE_AGENDA = CalendarDays;
export const MENU_FROTA: readonly (readonly [AbaFrota, string, LucideIcon])[] = [
  ["hoje", "Hoje", Sun], ["viaturas", "Viaturas", Truck], ["atribuicoes", "Atribuições", KeyRound], ["condutores", "Condutores", IdCard],
  ["manutencao", "Manutenção", Wrench], ["custos", "Abastecimentos e custos", Fuel], ["ocorrencias", "Ocorrências", TriangleAlert],
  ["documentos", "Documentos", FileBadge], ["relatorios", "Relatórios", ChartColumn], ["ligacoes", "Ligações", Waypoints],
];
export const NOME_ABA_FROTA = Object.fromEntries(MENU_FROTA.map(([k, t]) => [k, t])) as Record<AbaFrota, string>;

/** As viaturas que o perfil vê: o técnico só a que tem atribuída. */
export function visiveisDe(F: Frota, perfil: PerfilFrota): Viatura[] {
  if (perfil !== "tecnico") return F.viaturas;
  const v = viaturaDe(F, PESSOA_TECNICO);
  return v ? [v] : [];
}

export type TomCont = "bad" | "warn" | "";
export interface Contagem { n: number; tom: TomCont; dica: string }
/** O número ao lado de cada item do menu (vermelho no Hoje, laranja em Ocorrências e Manutenção, cinzento em Viaturas). Zero não mostra nada. */
export function contagem(F: Frota, perfil: PerfilFrota, k: AbaFrota, stock: (vid: string) => LinhaCarrinha[] = () => []): Contagem | null {
  const vs = visiveisDe(F, perfil).filter(ativa), tec = perfil === "tecnico";
  let c: Contagem | null = null;
  if (k === "hoje") c = { n: vs.filter((v) => alertas(F, v, stock(v.id)).some((a) => a.tom === "bad")).length + (tec ? 0 : multasPend(F).length), tom: "bad", dica: "Alertas graves e multas por identificar" };
  else if (k === "viaturas") c = { n: vs.length, tom: "", dica: "Viaturas na frota" };
  else if (k === "ocorrencias") c = { n: tec ? 0 : multasPend(F).length, tom: "warn", dica: "Multas por identificar" };
  else if (k === "manutencao") c = { n: vs.filter((v) => revisao(v).tom !== "ok").length, tom: "warn", dica: "Revisões a fazer" };
  return c && c.n > 0 ? c : null;
}

/** O título e o texto de cada ecrã (os do protótipo HTML). */
export const TITULOS_FROTA: Record<AbaFrota, string> = {
  hoje: "Hoje", viaturas: "Viaturas", atribuicoes: "Atribuições", condutores: "Condutores", manutencao: "Manutenção", custos: "Abastecimentos e custos",
  ocorrencias: "Ocorrências", documentos: "Documentos", relatorios: "Relatórios", ligacoes: "Ligações",
};
