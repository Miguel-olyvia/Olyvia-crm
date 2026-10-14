// O contexto dos ecrãs da Frota (como ctxInv.ts): a base, o Inventário (para o stock das carrinhas), o perfil simulado, como agir, os avisos
// (região aria-live), os filtros de cada ecrã, a folha da viatura e os diálogos abertos, e as ligações para fora (obra, agenda, inventário).
import { createContext, useContext } from "react";
import type { Resultado as ResultadoInv } from "../inventario/loja";
import type { Inventario } from "../inventario/tipos";
import type { AvisoInv } from "../inventario/ctxInv";
import type { AbaFrota, Resultado } from "./loja";
import type { PerfilFrota } from "./perfil";
import type { Frota, LinhaCarrinha, ObraRef, Viatura } from "./tipos";

export type AbaFolha = "resumo" | "atrib" | "manut" | "custos" | "ocorr" | "docs" | "stock" | "lig";
export type TipoDlg = "atribuir" | "devolver" | "km" | "abastecer" | "despesa" | "importar" | "manut" | "concluir" | "estado" | "ocorrencia" | "identificar" | "renovar" | "nova";
/** Os dados com que se abre um diálogo (os data-* do protótipo HTML): viatura, pessoa, atribuição, manutenção, ocorrência, documento e dia. */
export interface DadosDlg { v?: string; p?: string; a?: string; m?: string; o?: string; k?: string; ini?: string }

export interface CtxFrota {
  F: Frota;
  inv: Inventario;
  perfil: PerfilFrota;
  fontes: boolean;
  mudarFontes: (v: boolean) => void;
  /** As viaturas que o perfil vê (o técnico só a sua). */
  visiveis: Viatura[];
  /** O stock da carrinha (lido do armazém móvel no Inventário). */
  stock: (vid: string) => LinhaCarrinha[];
  /** As obras do protótipo (do Estado). */
  obras: ObraRef[];
  agir: <T>(fn: (F: Frota) => T, ok?: string | ((r: T) => string)) => Resultado<T>;
  agirInv: <T>(fn: (inv: Inventario) => T, ok?: string | ((r: T) => string)) => ResultadoInv<T>;
  avisar: (texto: string, erro?: boolean) => void;
  aviso: AvisoInv | null;
  aba: AbaFrota;
  /** Vai para outro ecrã, com filtros já aplicados (os cartões do Hoje abrem listas filtradas). */
  ir: (aba: AbaFrota, f?: Record<string, string>) => void;
  f: Record<string, string>;
  setF: (k: string, v: string) => void;
  abrir: (vid: string, aba?: AbaFolha) => void;
  fechar: () => void;
  dlg: (tipo: TipoDlg, dados?: DadosDlg) => void;
  /** Abre a obra do protótipo (Operações › obra). Sem ela (testes e uso isolado) as obras não são ligações. */
  irObra?: (id: number) => void;
  /** Abre as Definições › Agenda › Recursos. */
  irAgenda?: () => void;
  /** Abre o Inventário (Existências). */
  irInventario?: () => void;
}

export const ContextoFrota = createContext<CtxFrota | null>(null);
export function useCtxFrota(): CtxFrota {
  const c = useContext(ContextoFrota);
  if (!c) throw new Error("useCtxFrota fora da Frota");
  return c;
}
