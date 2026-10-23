/** Pequenos formatadores de texto da página «Organização». */
import type { DestinoLigacao, EstruturaOrg } from "@/components/rh-exemplo/organizacao/tipos";

type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

/** AAAA-MM-DD para DD/MM/AAAA (as datas de exemplo são sempre ISO). */
export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

export const nomeEmpresa = (est: EstruturaOrg, id: string): string => est.empresas.find((e) => e.id === id)?.nome ?? id;
export const nomeFilial = (est: EstruturaOrg, id: string): string => est.filiais.find((f) => f.id === id)?.nome ?? id;
export const nomeCentro = (est: EstruturaOrg, id: string): string => est.centros.find((c) => c.id === id)?.nome ?? id;

/** «Aurora Remodelações, Lda. · Filial Lisboa · trabalha em Loja Faro». */
export function destinoTexto(est: EstruturaOrg, d: DestinoLigacao, t: Traduzir): string {
  return t("rhOrg.destino", {
    empresa: nomeEmpresa(est, d.empresaId),
    filial: nomeFilial(est, d.filialId),
    centro: nomeCentro(est, d.centroId),
  });
}
