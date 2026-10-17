// Os negócios de exemplo variados (ver `pessoasExemploVariado.ts`): abertos em Orçamento, Proposta e Contrato, com e sem visitas e
// levantamento, e terminados (ganhos antigos e perdidos com motivo). O valor e a fase seguem as mesmas regras do Quadro de Negócios
// (`negocioMetas.ts`). Ficam FORA do quadro de Negócio e metas (como os `x1`...`x5` de `pessoasExemplo.ts`): só o Quadro de Pessoas e
// as fichas os mostram, por isso não mexem nos totais, na conversão nem nas metas dessa página. Valores inventados.
import type { NegocioMes, VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { NegocioPerdido } from "@/components/negocio-metas/negociosAlterados";
import { dia, levantamentoDoNegocio, moradaDe, visitaDe } from "./exemploVariadoApoio";
import { LEVANTAMENTO_OTILIA_BANHO, LEVANTAMENTO_OTILIA_COZINHA } from "./levantamentosExemploVariado";
import { pessoaVariado } from "./pessoasExemploVariado";
import type { NegocioHistorico, NegocioPessoa } from "./pessoasTipos";
import {
  ID_ORCAMENTO_BLOQUEADO, ID_ORCAMENTO_DIRECAO, ID_ORCAMENTO_VERIFICADO, ORCAMENTOS_DETALHADOS, valorDoDetalhado,
} from "./processo/extrasExemploVariado";

const orc = (id: string, valor: number, escolhido = false) => ({ id, valor, escolhido });
/** O orçamento escolhido de um negócio com orçamento detalhado: o valor é o total com IVA das linhas. */
const doDetalhado = (id: string) => [orc(`${id}-o1`, valorDoDetalhado(ORCAMENTOS_DETALHADOS[id]), true)];

function negocio(id: string, pessoaId: string, servico: string, extra: Partial<NegocioMes>): NegocioMes {
  const p = pessoaVariado(pessoaId);
  return {
    id, pessoaId, pessoa: p.nome, servico, comercial: p.comercial, dias: 5, parado: null, proximoPrazo: null, contacto: { ...p.contacto },
    orcamentos: [], proposta: null, contrato: null, ...extra,
  };
}

/** Um negócio terminado ganho num mês anterior (contrato assinado). */
const ganho = (id: string, pessoaId: string, servico: string, mes: string, valor: number, dias: number): NegocioHistorico => ({
  ...negocio(id, pessoaId, servico, { dias, orcamentos: [orc(`${id}-o1`, valor, true)], proposta: { estado: "aceite" }, contrato: { estado: "assinado" } }),
  mes, resultado: "ganho",
});

/** Um negócio perdido num mês anterior, com o motivo (como `NegocioPerdido`). */
const perdido = (id: string, pessoaId: string, servico: string, mes: string, valor: number, dias: number, motivoPerda: string): NegocioPerdido => ({
  ...negocio(id, pessoaId, servico, { dias, orcamentos: [orc(`${id}-o1`, valor, true)], proposta: { estado: "enviada" } }),
  mes, resultado: "perdido", motivoPerda,
});

const MORADA_OTILIA = moradaDe(pessoaVariado("pv-otilia"));
const visita = (id: string, dados: Omit<Parameters<typeof visitaDe>[2], "feitoPor"> & { feitoPor?: string }): VisitaNegocio => visitaDe(id, MORADA_OTILIA, { feitoPor: "Ana Ribeiro", ...dados });

/** A Otília: o negócio da casa de banho nasceu de uma visita feita com levantamento. */
const BANHO_OTILIA = levantamentoDoNegocio(LEVANTAMENTO_OTILIA_BANHO, dia(-12), "Ana Ribeiro");
/** A cozinha da Otília: duas visitas feitas (levantamento e medição técnica). */
const COZINHA_OTILIA = levantamentoDoNegocio(LEVANTAMENTO_OTILIA_COZINHA, dia(-20), "Ana Ribeiro");

/** Os negócios da lead com um negócio criado diretamente e os dos 9 clientes novos: primeiro os abertos, depois os terminados. */
export const NEGOCIOS_VARIADO: NegocioPessoa[] = [
  // Lead com um negócio em Orçamento criado diretamente, sem visita nem levantamento.
  negocio("vn-leonor-orc", "pv-leonor", "Janelas", { dias: 4, parado: 2, proximoPrazo: dia(3), orcamentos: [orc("vn-leonor-orc-o1", 7200, true)] }),
  // Cliente com 3 negócios abertos em fases diferentes, e um ganho antigo e um perdido.
  negocio("vn-otilia-orc", "pv-otilia", "Pintura exterior", { dias: 6, parado: 3, proximoPrazo: dia(5), orcamentos: [orc("vn-otilia-orc-o1", 5400, true)] }),
  negocio("vn-otilia-prop", "pv-otilia", "Casa de banho", {
    dias: 21, parado: 4, proximoPrazo: dia(2), orcamentos: [orc("vn-otilia-prop-o1", 9800, true), orc("vn-otilia-prop-o2", 10900)],
    proposta: { estado: "enviada" }, ...BANHO_OTILIA, moradaObra: { ...MORADA_OTILIA },
    visitas: [visita("vn-otilia-prop-v1", {
      data: dia(-12), hora: "14:30", estado: "feita", quemVaiEstar: "casal", duracao: "h1m30", nota: "Querem base de duche e azulejos novos.",
    })],
  }),
  negocio("vn-otilia-con", "pv-otilia", "Cozinha", {
    dias: 35, proximoPrazo: dia(1), orcamentos: [orc("vn-otilia-con-o1", 17500, true)], proposta: { estado: "aceite" }, contrato: { estado: "pendente" },
    ...COZINHA_OTILIA, moradaObra: { ...MORADA_OTILIA },
    visitas: [
      visita("vn-otilia-con-v1", { data: dia(-20), estado: "feita", quemVaiEstar: "cliente", duracao: "h1", nota: "Levantamento completo da cozinha." }),
      visita("vn-otilia-con-v2", {
        data: dia(-9), hora: "11:00", estado: "feita", tipo: "medicao", quemVaiEstar: "cliente", duracao: "h1",
        nota: "Medição técnica da bancada e do vão do frigorífico.",
      }),
    ],
  }),
  // Cliente com um negócio em Proposta e um pedido novo em Visita (ver os pedidos).
  negocio("vn-pascoal-prop", "pv-pascoal", "Climatização", { dias: 14, parado: 5, proximoPrazo: dia(3), orcamentos: [orc("vn-pascoal-prop-o1", 4600, true)], proposta: { estado: "enviada" } }),
  // Clientes com o orçamento detalhado: verificado, com bloqueio de margem e com a Direção pedida.
  negocio(ID_ORCAMENTO_VERIFICADO, "pv-sara", "Cozinha", { dias: 9, parado: 3, proximoPrazo: dia(2), orcamentos: doDetalhado(ID_ORCAMENTO_VERIFICADO) }),
  negocio(ID_ORCAMENTO_BLOQUEADO, "pv-tomas", "Casa de banho", { dias: 7, parado: 2, proximoPrazo: dia(1), orcamentos: doDetalhado(ID_ORCAMENTO_BLOQUEADO) }),
  negocio(ID_ORCAMENTO_DIRECAO, "pv-ursula", "Janelas", { dias: 8, parado: 4, proximoPrazo: dia(3), orcamentos: doDetalhado(ID_ORCAMENTO_DIRECAO) }),
  // Cliente com atraso (prazo ultrapassado) e outro com tudo em dia.
  negocio("vn-vitor-prop", "pv-vitor", "Telhado", { dias: 25, parado: 9, proximoPrazo: dia(-4), orcamentos: [orc("vn-vitor-prop-o1", 12400, true)], proposta: { estado: "enviada" } }),
  negocio("vn-zita-con", "pv-zita", "Isolamento", {
    dias: 30, proximoPrazo: dia(5), orcamentos: [orc("vn-zita-con-o1", 8800, true)], proposta: { estado: "aceite" }, contrato: { estado: "pendente" },
  }),
  // Terminados: um ganho antigo em cada cliente (é o que os faz clientes) e os perdidos.
  ganho("vh-otilia-ganho", "pv-otilia", "Pintura interior", "2026-03", 4100, 190),
  perdido("vh-otilia-perdido", "pv-otilia", "Telhado", "2026-08", 13800, 80, "Preço acima da proposta de outra empresa"),
  ganho("vh-pascoal-ganho", "pv-pascoal", "Portão", "2026-05", 3300, 150),
  ganho("vh-quiteria-ganho", "pv-quiteria", "Casa de banho", "2026-07", 8900, 100),
  ganho("vh-rodrigo-ganho", "pv-rodrigo", "Pavimento", "2026-04", 6200, 170),
  perdido("vh-rodrigo-perdido", "pv-rodrigo", "Cozinha", "2026-09", 15900, 40, "Adiou a obra para o próximo ano"),
  ganho("vh-sara-ganho", "pv-sara", "Pintura interior", "2026-06", 3600, 120),
  ganho("vh-tomas-ganho", "pv-tomas", "Eletricidade", "2026-02", 2400, 230),
  ganho("vh-ursula-ganho", "pv-ursula", "Estores", "2026-05", 1900, 150),
  ganho("vh-vitor-ganho", "pv-vitor", "Pintura exterior", "2026-01", 5100, 270),
  ganho("vh-zita-ganho", "pv-zita", "Portão", "2026-06", 2900, 120),
];
