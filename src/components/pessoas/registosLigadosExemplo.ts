// Registos de exemplo JÁ LIGADOS a negócios, para se ver na ficha a flexibilidade do fluxo: cada negócio tem o que realmente aconteceu com
// ele e nada mais, nunca uma sequência obrigatória. As combinações (Visita e Levantamento nunca são obrigatórios):
//   Leonor (Janelas, Orçamento)            só falado: um contacto, sem visita nem levantamento
//   Vítor (Telhado, Proposta)              contacto e visita feita, sem levantamento
//   Sara (Cozinha, Orçamento)              só levantamento, sem visita nem contacto (o cliente mandou as medidas)
//   Tomás (Casa de banho, Orçamento)       só visita feita, sem contacto nem levantamento
//   Úrsula (Janelas, Orçamento)            contacto e levantamento, sem visita
//   Zita (Isolamento, Contrato)            contacto, visita e levantamento, e um contacto novo ainda POR LIGAR
// Os da Otília (Casa de banho e Cozinha) trazem a visita e o levantamento no próprio negócio (exemplo antigo), a Pascoal tem uma visita
// feita e outra por fazer por ligar ao lado do negócio, e a Otília (Pintura exterior) não tem nada ligado. Só em memória, sem Supabase.
import type {
  ContactoPessoa, EstadoRegistos, LevantamentoPessoa, VisitaPessoa,
} from "@/components/negocio-metas/registosTipos";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { dia, moradaDe, visitaDe } from "./exemploVariadoApoio";
import { LEVANTAMENTO_HELGA, LEVANTAMENTO_OTILIA_BANHO, LEVANTAMENTO_OTILIA_COZINHA } from "./levantamentosExemploVariado";
import { pessoaVariado } from "./pessoasExemploVariado";
import type { ResultadoContacto } from "./pessoasTipos";
import { ID_ORCAMENTO_BLOQUEADO, ID_ORCAMENTO_DIRECAO, ID_ORCAMENTO_VERIFICADO } from "./processo/extrasExemploVariado";

const contacto = (n: number, pessoaId: string, negocioId: string | null, dias: number, resultado: ResultadoContacto, nota: string): ContactoPessoa => ({
  id: `rcl-${n}`, pessoaId, data: dia(dias), resultado, nota, negocioId,
});

const visita = (n: number, pessoaId: string, negocioId: string | null, dias: number, nota: string): VisitaPessoa => {
  const p = pessoaVariado(pessoaId);
  return { ...visitaDe(`rvl-${n}`, moradaDe(p), { data: dia(dias), estado: "feita", feitoPor: p.comercial, quemVaiEstar: "cliente", duracao: "h1", nota }), pessoaId, negocioId };
};

const levantamento = (n: number, pessoaId: string, negocioId: string, visitaId: string | null, dias: number, rascunho: RascunhoLevantamento): LevantamentoPessoa => ({
  id: `rll-${n}`, pessoaId, visitaId, data: dia(dias), feitoPor: pessoaVariado(pessoaId).comercial, rascunho, negocioId,
});

/** Os registos já ligados (mais um contacto da Zita por ligar), a juntar aos das abordagens. */
export const REGISTOS_LIGADOS_EXEMPLO: EstadoRegistos = {
  contactos: [
    contacto(1, "pv-leonor", "vn-leonor-orc", -4, "atendeuInteressado", "Pediu orçamento para 6 janelas. Não precisa de visita."),
    contacto(2, "pv-vitor", "vn-vitor-prop", -30, "atendeuInteressado", "Ligou a pedir orçamento do telhado."),
    contacto(3, "pv-ursula", ID_ORCAMENTO_DIRECAO, -14, "atendeuInteressado", "Janelas da sala e de dois quartos."),
    contacto(4, "pv-zita", "vn-zita-con", -40, "atendeuInteressado", "Isolamento do sótão."),
    contacto(5, "pv-zita", null, -2, "atendeuInteressado", "Perguntou pelas datas da obra. Ainda não está ligado a nenhum negócio."),
  ],
  visitas: [
    visita(1, "pv-vitor", "vn-vitor-prop", -27, "Telhado em mau estado nas águas furtadas. Só fotografias, sem levantamento formal."),
    visita(2, "pv-tomas", ID_ORCAMENTO_BLOQUEADO, -8, "Visita para ver o espaço. Sem medidas."),
    visita(3, "pv-zita", "vn-zita-con", -36, "Levantamento do sótão feito nesta visita."),
  ],
  levantamentos: [
    // Sem visita: o cliente mandou as medidas e as fotografias.
    levantamento(1, "pv-sara", ID_ORCAMENTO_VERIFICADO, null, -12, LEVANTAMENTO_OTILIA_COZINHA),
    levantamento(2, "pv-ursula", ID_ORCAMENTO_DIRECAO, null, -11, LEVANTAMENTO_HELGA),
    // Com visita: o levantamento fica ligado à visita em que foi feito.
    levantamento(3, "pv-zita", "vn-zita-con", "rvl-3", -36, LEVANTAMENTO_OTILIA_BANHO),
  ],
};
