/**
 * Os documentos de exemplo do Portal do colaborador, por pessoa em admissão (a mesma pessoa de cada token de demonstração):
 * `exemplo` tem 3 pedidos do RH por enviar e um regulamento recebido; `submetida` tem os pedidos enviados à espera de
 * aceitação; `contrato` tem o contrato por assinar (vem da admissão) e 2 pedidos por enviar; `assinado` tem o contrato
 * assinado e um pedido aceite. Datas relativas ao «agora» do exemplo, para o aspeto nunca envelhecer.
 */
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import {
  PORTAL_VAZIO, type DocRecebido, type PedidoPessoa, type PedidoRh, type PortalPessoa, type TipoPedidoRh,
} from "@/components/rh-exemplo/lib/portalDocumentos";

const H = 60 * 60 * 1000;

const iso = (agora: Date, horasAtras: number): string => new Date(agora.getTime() - horasAtras * H).toISOString();

function doc(id: string, titulo: string, agora: Date, horasAtras: number, extra: Partial<DocRecebido> = {}): DocRecebido {
  return {
    id, titulo, nomeFicheiro: `${titulo}.pdf`, enviadoEm: iso(agora, horasAtras), precisaAssinatura: false, assinadoEm: null,
    assinaturaNome: null, recusa: null, origemPedidoId: null, ...extra,
  };
}

function pedido(id: string, tipo: TipoPedidoRh, prazoDias: number, agora: Date, extra: Partial<PedidoRh> = {}): PedidoRh {
  return {
    id, tipo, titulo: "", nota: "", prazo: diaIso(prazoDias), criadoEm: iso(agora, 48), estado: "por_enviar", ficheiros: [],
    enviadoEm: null, motivoRecusa: null, ...extra,
  };
}

const NOTA_CARTAO = "Frente e verso, em PDF ou imagem.";
const REGULAMENTO = "Regulamento interno";

function criarDe(agora: Date): Record<string, PortalPessoa> {
  const enviado = (horas: number, ficheiros: string[]): Partial<PedidoRh> => ({ estado: "enviado", ficheiros, enviadoEm: iso(agora, horas) });
  const cartao = ["cartao-cidadao-frente.pdf", "cartao-cidadao-verso.pdf"];
  const copia: PedidoPessoa = {
    id: "pp-eva-1", tipo: "copia_contrato", titulo: "", nota: "Preciso de uma cópia para o banco.", urgencia: "normal",
    criadoEm: iso(agora, 40), estado: "disponivel", motivoRecusa: null, documentoId: "dr-eva-2",
  };
  return {
    "p-lara": { ...PORTAL_VAZIO, pedidosRh: [pedido("pr-lara-1", "cartao_cidadao", 5, agora, { nota: NOTA_CARTAO })] },
    "p-beatriz": {
      ...PORTAL_VAZIO, recebidos: [doc("dr-beatriz-1", REGULAMENTO, agora, 30)],
      pedidosRh: [
        pedido("pr-beatriz-1", "cartao_cidadao", 3, agora, { nota: NOTA_CARTAO }),
        pedido("pr-beatriz-2", "comprovativo_iban", 3, agora, { nota: "Documento do banco com o nome do titular." }),
        pedido("pr-beatriz-3", "fotografia", 5, agora, { nota: "Fotografia tipo passe, fundo claro." }),
      ],
    },
    "p-marco": {
      ...PORTAL_VAZIO, recebidos: [doc("dr-marco-1", REGULAMENTO, agora, 60)], vistos: ["dr-marco-1"],
      pedidosRh: [
        pedido("pr-marco-1", "cartao_cidadao", 2, agora, enviado(5, cartao)),
        pedido("pr-marco-2", "comprovativo_iban", 2, agora, enviado(5, ["iban-marco.pdf"])),
        pedido("pr-marco-3", "fotografia", 4, agora, enviado(4, ["foto-marco.jpg"])),
      ],
    },
    "p-nadia": {
      ...PORTAL_VAZIO, recebidos: [doc("dr-nadia-1", REGULAMENTO, agora, 90)], vistos: ["dr-nadia-1"],
      pedidosRh: [
        pedido("pr-nadia-1", "cartao_cidadao", 1, agora, { estado: "aceite", ficheiros: cartao, enviadoEm: iso(agora, 60) }),
        pedido("pr-nadia-2", "comprovativo_iban", 3, agora, {
          estado: "recusado", ficheiros: ["iban-nadia.pdf"], enviadoEm: iso(agora, 50), motivoRecusa: "O comprovativo não mostra o nome do titular.",
        }),
      ],
    },
    "p-vasco": {
      ...PORTAL_VAZIO, recebidos: [doc("dr-vasco-1", "Política de privacidade", agora, 26)], vistos: ["dr-vasco-1"],
      pedidosRh: [
        pedido("pr-vasco-1", "cartao_cidadao", 2, agora, { nota: NOTA_CARTAO }),
        pedido("pr-vasco-2", "comprovativo_iban", 4, agora),
      ],
    },
    "p-eva": {
      ...PORTAL_VAZIO, recebidos: [doc("dr-eva-2", "Cópia do contrato", agora, 20, { origemPedidoId: "pp-eva-1" })],
      vistos: ["dr-eva-2", "contrato"], pedidosPessoa: [copia],
      pedidosRh: [pedido("pr-eva-1", "cartao_cidadao", -2, agora, { estado: "aceite", ficheiros: cartao, enviadoEm: iso(agora, 180) })],
    },
  };
}

export interface EstadoPortal {
  porPessoa: Record<string, PortalPessoa>;
}

export function criarPortalInicial(agora: Date = agoraExemplo()): EstadoPortal {
  return { porPessoa: criarDe(agora) };
}
