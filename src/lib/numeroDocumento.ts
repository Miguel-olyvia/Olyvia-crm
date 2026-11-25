// O número que se MOSTRA de uma proposta e de um contrato (23/11, pedido do dono: «o mesmo número em todo o lado, como a Emylia tem»).
// Um documento ligado a um negócio (proposals.negocio_id / client_contracts.negocio_id) mostra-se pelo número do negócio:
//   · proposta: «PR <ano>/<n.º do negócio>», com « · vN» a partir da versão 2 (como a folha da Emylia);
//   · contrato: «CT <ano>/<n.º do negócio>».
// O ano é o da criação do documento (proposals.created_at / client_contracts.created_at); sem data, o de hoje.
// Um documento sem negócio continua com o número guardado (proposal_number / contract_number), tal como antes.
// Só formata: o número guardado na base não muda (os emails e SMS das edge functions ainda o usam).

export interface DadosDoNumero {
  /** negocios.numero; sem ele mostra-se o número guardado. */
  numeroNegocio?: number | null;
  /** A versão da proposta (1, 2, …). Só a proposta a mostra, a partir da 2. */
  versao?: number | null;
  /** Quando o documento foi criado (ISO ou Date). */
  criadoEm?: string | Date | null;
  /** O número guardado na base (proposal_number / contract_number). */
  guardado?: string | null;
}

/** O ano de uma data: do texto ISO (sem passar pelo fuso horário) ou do Date; sem data válida, o ano de `hoje`. */
export function anoDoDocumento(criadoEm: string | Date | null | undefined, hoje: Date = new Date()): number {
  if (criadoEm instanceof Date) return Number.isNaN(criadoEm.getTime()) ? hoje.getFullYear() : criadoEm.getFullYear();
  const m = typeof criadoEm === "string" ? /^(\d{4})-\d{2}-\d{2}/.exec(criadoEm.trim()) : null;
  return m ? Number(m[1]) : hoje.getFullYear();
}

const temNegocio = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** O número da proposta: «PR 2026/1031», «PR 2026/1031 · v2»; sem negócio, o guardado. */
export function numeroDaProposta(x: DadosDoNumero, hoje: Date = new Date()): string {
  if (!temNegocio(x.numeroNegocio)) return x.guardado ?? "";
  const v = x.versao && x.versao >= 2 ? ` · v${Math.floor(x.versao)}` : "";
  return `PR ${anoDoDocumento(x.criadoEm, hoje)}/${x.numeroNegocio}${v}`;
}

/** O número do contrato: «CT 2026/1031»; sem negócio, o guardado. */
export function numeroDoContrato(x: DadosDoNumero, hoje: Date = new Date()): string {
  if (!temNegocio(x.numeroNegocio)) return x.guardado ?? "";
  return `CT ${anoDoDocumento(x.criadoEm, hoje)}/${x.numeroNegocio}`;
}

/** O que basta do negócio da Emylia (o motor ou a vista do portal): o número e as versões antigas da proposta. */
export interface NegocioDoNumero { id: number; orc?: { versoes?: readonly unknown[] | null } | null }

/** A versão atual da proposta do negócio: as antigas mais um. */
export const versaoDaProposta = (d: NegocioDoNumero): number => (d.orc?.versoes?.length ?? 0) + 1;

/** O número da proposta de um negócio da Emylia. `criadoEm`: a data da proposta real, quando se sabe. */
export const numeroDaPropostaDoNegocio = (d: NegocioDoNumero, criadoEm?: string | Date | null, hoje?: Date): string =>
  numeroDaProposta({ numeroNegocio: d.id, versao: versaoDaProposta(d), criadoEm }, hoje);

/** O número do contrato de um negócio da Emylia. */
export const numeroDoContratoDoNegocio = (d: NegocioDoNumero, criadoEm?: string | Date | null, hoje?: Date): string =>
  numeroDoContrato({ numeroNegocio: d.id, criadoEm }, hoje);
