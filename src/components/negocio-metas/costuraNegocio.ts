// A costura de LEITURA entre o protótipo e a ficha real. Os ecrãs do negócio liam sempre os stores em memória (registos, perdas, detalhes);
// em modo real a ficha monta um provider à volta da pessoa aberta e os mesmos hooks passam a ler o que a base devolveu. Sem provider
// (o exemplo e os testes antigos) tudo continua a vir dos stores. A parte de ESCRITA está em `mutacoesNegocio.ts`.
import { createContext, useContext } from "react";
import type { DetalheNegocio } from "./negocioDetalhes";
import type { Alteracoes } from "./negociosAlterados";
import type { EstadoRegistos } from "./registosTipos";

/** A regra da organização para dar um negócio como ganho (os valores que o CHECK da base aceita). */
export type MomentoGanhoCostura = "manual" | "proposta_aceite" | "contrato_assinado";

/** Uma lead aberta da pessoa, para escolher a que um negócio novo corresponde. */
export interface LeadAbertaCostura {
  id: string;
  /** AAAA-MM-DD, para o texto da opção. */
  criadaEm: string;
  /** O instante completo da criação (ISO), para escolher a mais recente entre leads do mesmo dia; sem ele vale só o dia. */
  instante?: string;
  /** A abordagem desta lead está encerrada: criar o negócio exige «Reabrir a abordagem». */
  encerrada: boolean;
}

/** Um documento antigo (orçamento, proposta ou contrato) da pessoa, ainda sem negócio, que se pode ligar a um negócio aberto. */
export interface DocumentoPorLigar {
  tipo: "orcamento" | "proposta" | "contrato";
  id: string;
  /** O número do documento (para o texto da linha). */
  numero: string;
  /** Falso num contrato sem orçamento nem proposta: a base recusa-o (NG014), por isso nem se oferece. */
  temBase: boolean;
}

export interface DadosNegocio {
  /** Os registos da pessoa aberta (contactos, visitas e levantamentos), com o negócio a que cada um está ligado. */
  registos: EstadoRegistos;
  /** As perdas dos negócios da pessoa (`perdidos`); o resto fica vazio: o estado vem da base. */
  alteracoes: Alteracoes;
  /** Os detalhes (orçamentos, proposta e contrato) de um negócio, lidos dos documentos da ficha; `null` sem eles. */
  detalhe: (negocioId: string) => DetalheNegocio | null;
  momentoGanho: MomentoGanhoCostura | null;
  /** `pessoas.edit`: ligar, desligar, perder, anular a perda e ganhar. */
  podeEditar: boolean;
  /** `pessoas.create`: criar um negócio. */
  podeCriar: boolean;
  leadsAbertas: readonly LeadAbertaCostura[];
  /** Os documentos antigos da pessoa sem negócio; vazio se não há. */
  documentosPorLigar: readonly DocumentoPorLigar[];
}

export const DadosNegocioContext = createContext<DadosNegocio | null>(null);

/** Os dados da ficha real; `null` fora dela (o exemplo): então os ecrãs leem os stores. */
export const useDadosNegocio = (): DadosNegocio | null => useContext(DadosNegocioContext);
