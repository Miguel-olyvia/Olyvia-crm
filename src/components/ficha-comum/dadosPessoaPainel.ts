// Os dados de uma pessoa que o painel de um negócio mostra no separador "Pessoa". O painel (em negocio-metas) não
// importa de pessoas: quem tem a ficha converte-a para este tipo (ver `pessoas/paraPainelNegocio.ts`). Os valores
// que se escrevem por extenso (papel, etapa, origem) vão como chaves, que o painel traduz.
export type PapelFicha = "lead" | "cliente";
export type EtapaFicha = "nova" | "emContacto" | "visitaMarcada" | "qualificada" | "cliente";
export type OrigemFicha = "site" | "formulario" | "campanha" | "indicacao" | "telefone";

export interface DadosPessoaPainel {
  id: string;
  nome: string;
  papel: PapelFicha;
  etapa: EtapaFicha;
  origem: OrigemFicha;
  empresa: string | null;
  /** Dias desde o último contacto. */
  ultimoContactoDias: number;
  comercial: string;
  /** Cliente ou lead desde (AAAA-MM-DD); `null` sem data. */
  desde: string | null;
  telefone: string | null;
  email: string | null;
  /** A morada numa linha ("Rua X 1, 4000-001 Porto"); `null` sem morada. */
  morada: string | null;
  distrito: string | null;
}
