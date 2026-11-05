// Protótipo (visualizador 3D): as escolhas do ecrã (tipo de espaço, revestimentos, tecto) guardam-se no localStorage deste aparelho, por negócio.
// Sem base de dados. A própria planta continua a gravar-se em f.planta, como até aqui.
import { useCallback, useState } from "react";
import { tipoEspacoDeDivisao } from "./catalogo3d";
import { espacoVazio, type Revestimentos, type TipoEspaco } from "./modelo";
import type { Superficie } from "./revestimentos";

export interface Pref3D { tipo: TipoEspaco; rev: Revestimentos; teto: boolean }
const chave = (negocio: number | string) => `olyvia.proto3d.${negocio}`;
const TIPOS: TipoEspaco[] = ["casa_banho", "cozinha", "quarto", "sala", "outro"];

/** Lê as preferências guardadas; o que estiver estragado ou em falta cai nos valores de omissão. */
export function lerPref(negocio: number | string, divisao: string | null | undefined): Pref3D {
  const omissao: Pref3D = { tipo: tipoEspacoDeDivisao(divisao), rev: espacoVazio().revestimentos, teto: false };
  try {
    const bruto = window.localStorage.getItem(chave(negocio));
    if (!bruto) return omissao;
    const p = JSON.parse(bruto) as Partial<Pref3D>;
    return {
      tipo: p.tipo && TIPOS.includes(p.tipo) ? p.tipo : omissao.tipo,
      rev: { pavimento: String(p.rev?.pavimento ?? omissao.rev.pavimento), parede: String(p.rev?.parede ?? omissao.rev.parede) },
      teto: p.teto === true,
    };
  } catch {
    return omissao;
  }
}

export function useProto3d(negocio: number | string, divisao: string | null | undefined) {
  const [pref, setPref] = useState<Pref3D>(() => lerPref(negocio, divisao));
  const mudar = useCallback((fn: (p: Pref3D) => Pref3D) => {
    setPref((antes) => {
      const depois = fn(antes);
      try { window.localStorage.setItem(chave(negocio), JSON.stringify(depois)); } catch { /* sem armazenamento: fica só nesta sessão */ }
      return depois;
    });
  }, [negocio]);
  return {
    pref,
    setTipo: (tipo: TipoEspaco) => mudar((p) => ({ ...p, tipo })),
    setRev: (s: Superficie, id: string) => mudar((p) => ({ ...p, rev: { ...p.rev, [s]: id } })),
    setTeto: (teto: boolean) => mudar((p) => ({ ...p, teto })),
  };
}
