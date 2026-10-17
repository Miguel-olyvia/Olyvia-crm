// Os pedidos de exemplo variados (ver `pessoasExemploVariado.ts`): por contactar, contactados e em Visita, com visitas diferentes por
// pedido (por fazer, feitas, canceladas e revisitas) e um com levantamento. Os ids são `pd-101` em diante: ficam acima dos que as
// sementes geram (`pd-1`...`pd-8`), que não mudam. Só em memória, sem Supabase.
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { dia, moradaDe, visitaDe } from "./exemploVariadoApoio";
import { LEVANTAMENTO_HELGA } from "./levantamentosExemploVariado";
import { pessoaVariado } from "./pessoasExemploVariado";
import type { PedidoNegocio } from "./pessoasTipos";

type Dados = Pick<VisitaNegocio, "data" | "estado"> & Partial<VisitaNegocio>;

interface Pedido {
  n: number;
  pessoaId: string;
  servico: string;
  /** Dias de hoje até ao dia em que o pedido foi criado (negativo). */
  criado: number;
  contactado: boolean;
  /** As visitas por ordem cronológica, cada uma na morada da pessoa. */
  visitas?: Dados[];
  levantamento?: PedidoNegocio["levantamento"];
}

function pedido({ n, pessoaId, servico, criado, contactado, visitas = [], levantamento }: Pedido): PedidoNegocio {
  const p = pessoaVariado(pessoaId);
  const id = `pd-${n}`;
  return {
    id, pessoaId, servico, comercial: p.comercial, criadoEm: dia(criado), contactado,
    visitas: visitas.map((v, i) => visitaDe(`${id}-v${i + 1}`, moradaDe(p), { feitoPor: p.comercial, ...v })),
    ...(levantamento ? { levantamento } : {}),
  };
}

export const PEDIDOS_VARIADO: PedidoNegocio[] = [
  // Leads, da que não tem nada feito até à que já tem visita feita com levantamento.
  pedido({ n: 101, pessoaId: "pv-ema", servico: "Pintura de quarto", criado: -1, contactado: false }),
  pedido({ n: 102, pessoaId: "pv-duarte", servico: "Janelas", criado: -6, contactado: true }),
  pedido({
    n: 103, pessoaId: "pv-filipa", servico: "Casa de banho", criado: -9, contactado: true,
    visitas: [
      { data: dia(-4), estado: "cancelada", nota: "Cancelada: o cliente teve de viajar. Ficou remarcada." },
      { data: dia(4), estado: "porFazer", quemVaiEstar: "cliente", duracao: "h1" },
    ],
  }),
  pedido({
    n: 104, pessoaId: "pv-gaspar", servico: "Pavimento flutuante", criado: -12, contactado: true,
    visitas: [{ data: dia(-3), hora: "09:30", estado: "feita", nota: "Visita feita; ainda não se tiraram as medidas.", quemVaiEstar: "cliente" }],
  }),
  pedido({
    n: 105, pessoaId: "pv-helga", servico: "Casa de banho", criado: -15, contactado: true, levantamento: LEVANTAMENTO_HELGA,
    visitas: [{ data: dia(-2), hora: "14:00", estado: "feita", quemVaiEstar: "casal", duracao: "h1m30", nota: "Levantamento feito na visita." }],
  }),
  pedido({
    n: 106, pessoaId: "pv-ivo", servico: "Cozinha", criado: -18, contactado: true,
    visitas: [
      { data: dia(-5), estado: "feita", quemVaiEstar: "cliente", duracao: "h1" },
      { data: dia(6), hora: "15:30", estado: "porFazer", tipo: "revisita", nota: "Voltar para ver o vão do frigorífico com o carpinteiro." },
    ],
  }),
  // Uma lead com dois pedidos em paralelo, de serviços diferentes e em fases diferentes.
  pedido({ n: 107, pessoaId: "pv-jaime", servico: "Cozinha", criado: -10, contactado: true }),
  pedido({
    n: 108, pessoaId: "pv-jaime", servico: "Casa de banho", criado: -4, contactado: true,
    visitas: [{ data: dia(1), hora: "09:30", estado: "porFazer", quemVaiEstar: "familia", duracao: "m30" }],
  }),
  // Clientes: um pedido novo em Visita ao lado de um negócio, dois pedidos sem serviço (no mesmo dia) e um pedido novo por contactar.
  pedido({
    n: 109, pessoaId: "pv-pascoal", servico: "Pavimento", criado: -14, contactado: true,
    visitas: [
      { data: dia(-3), hora: "16:00", estado: "feita", quemVaiEstar: "cliente", duracao: "h1" },
      { data: dia(5), hora: "11:00", estado: "porFazer", tipo: "materiais", nota: "Escolha dos materiais e dos acabamentos." },
    ],
  }),
  pedido({ n: 110, pessoaId: "pv-quiteria", servico: "", criado: -4, contactado: false }),
  pedido({ n: 111, pessoaId: "pv-quiteria", servico: "", criado: -4, contactado: true }),
  pedido({ n: 112, pessoaId: "pv-rodrigo", servico: "Impermeabilização de terraço", criado: -1, contactado: false }),
];
