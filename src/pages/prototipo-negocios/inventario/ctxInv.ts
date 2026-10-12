// O contexto dos ecrãs do Inventário: a base, como agir sobre ela, os avisos (região aria-live) e como ir para outro separador ou abrir um detalhe.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { FiltrosCont, FiltrosEc, FiltrosForn, FiltrosGuia, FiltrosInv, FiltrosMov, FiltrosPo, FiltrosStock } from "./filtros";
import type { Resultado } from "./loja";
import type { PerfilId } from "./perfil";
import type { Inventario } from "./tipos";

export type AbaInv = "hoje" | "po" | "sup" | "stock" | "mov" | "ec" | "guia" | "cont" | "wh" | "cov";
/** Para onde ir: o separador e, se se quiser, os filtros já aplicados (a fila do Hoje abre listas filtradas). */
export type Destino =
  | { aba: "hoje" | "wh" | "cov" } | { aba: "po"; f?: Partial<FiltrosPo> } | { aba: "sup"; f?: Partial<FiltrosForn> } | { aba: "stock"; f?: Partial<FiltrosStock> }
  | { aba: "mov"; f?: Partial<FiltrosMov> } | { aba: "ec"; f?: Partial<FiltrosEc> } | { aba: "guia"; f?: Partial<FiltrosGuia> } | { aba: "cont"; f?: Partial<FiltrosCont> };
/** O detalhe aberto numa folha lateral. */
export type Detalhe =
  | { t: "po"; id: string; tab?: string } | { t: "stock"; sku: string } | { t: "ec"; id: string } | { t: "sup"; id: string; tab?: string } | { t: "guia"; id: string } | { t: "cont"; id: string };

export interface AvisoInv { texto: string; erro: boolean }

export interface CtxInv {
  db: Inventario;
  leitura: boolean;
  /** Corre uma ação sobre a base: anuncia o que ficou feito (ou a regra que recusou) e devolve o resultado. */
  agir: <T>(fn: (db: Inventario) => T, ok?: string | ((r: T) => string)) => Resultado<T>;
  avisar: (texto: string, erro?: boolean) => void;
  aviso: AvisoInv | null;
  /** Vai para outro ecrã (com filtros) e, se se der `detalhe`, abre-o logo a seguir. */
  ir: (d: Destino, detalhe?: Detalhe) => void;
  abrir: (d: Detalhe) => void;
  fecharDetalhe: () => void;
  /** O perfil simulado: está no contexto para os ecrãs (e os diálogos, que vivem fora da raiz) redesenharem quando muda. O tema vem da app, não daqui. */
  perfil: PerfilId;
  /** Onde as ações do ecrã se desenham: dentro do cabeçalho (função head() do mockup). */
  alvoAcoes: HTMLElement | null;
  registarAcoes: (el: HTMLElement | null) => void;
  filtros: FiltrosInv;
  setFiltros: <K extends keyof FiltrosInv>(k: K, p: Partial<FiltrosInv[K]>) => void;
}

export const Contexto = createContext<CtxInv | null>(null);
export function useCtxInv(): CtxInv {
  const c = useContext(Contexto);
  if (!c) throw new Error("useCtxInv fora do Inventário");
  return c;
}

const ATRASO_MS = 50;
/** O aviso da região viva: limpa-se primeiro para que a mesma mensagem repetida volte a ser anunciada (como useAviso). */
export function useAvisoInv(): [AvisoInv | null, (texto: string, erro?: boolean) => void] {
  const [aviso, setAviso] = useState<AvisoInv | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const anunciar = useCallback((texto: string, erro = false): void => {
    clearTimeout(espera.current);
    setAviso(null);
    espera.current = setTimeout(() => setAviso({ texto, erro }), ATRASO_MS);
  }, []);
  useEffect(() => () => clearTimeout(espera.current), []);
  return [aviso, anunciar];
}
