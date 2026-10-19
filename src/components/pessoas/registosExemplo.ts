// Os registos de exemplo (contactos, visitas e levantamentos das pessoas): nascem das sementes (a etapa e a visita que cada pessoa traz em
// `pessoasExemploFicha.ts`) e dos exemplos variados (`pessoasExemploVariado.ts`), porque o contacto, a visita e o levantamento são da
// PESSOA: os das abordagens ficam por ligar, e alguns negócios já têm registos ligados de várias formas (`registosLigadosExemplo.ts`).
// Só em memória, sem Supabase.
import type { NegocioMes, VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { somarDias, type RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import type { ContactoPessoa, EstadoRegistos, LevantamentoPessoa, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { dia, moradaDe, visitaDe } from "./exemploVariadoApoio";
import { papelEAbertos } from "./juntarPessoas";
import { LEVANTAMENTO_HELGA } from "./levantamentosExemploVariado";
import { MORADA_VISITA_VAZIA, moradaDaLead } from "./moradaVisita";
import type { PessoaSemente, VisitaSemente } from "./pessoaSemente";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO, SEMENTES_EXEMPLO } from "./pessoasExemplo";
import { pessoaVariado } from "./pessoasExemploVariado";
import type { PapelPessoa, Pessoa } from "./pessoasTipos";
import { REGISTOS_LIGADOS_EXEMPLO } from "./registosLigadosExemplo";

/** O que uma pessoa já tinha feito de uma abordagem (as visitas por ordem cronológica). */
export interface AbordagemExemplo {
  pessoaId: string;
  comercial: string;
  /** AAAA-MM-DD: quando a abordagem começou. */
  criadoEm: string;
  /** Já houve uma chamada. */
  contactado: boolean;
  visitas: VisitaNegocio[];
  levantamento?: RascunhoLevantamento;
}

/** A visita em que o levantamento foi feito: a primeira feita, ou, sem nenhuma, a primeira; `null` sem visitas. */
const visitaDoLevantamento = (visitas: readonly VisitaPessoa[]): VisitaPessoa | null =>
  visitas.find((v) => v.estado === "feita") ?? visitas[0] ?? null;

/**
 * Os registos de uma lista de abordagens. Uma pessoa com várias abordagens tem UM contacto (a data do último contacto da ficha e o
 * resultado da última chamada), e todas as visitas e levantamentos delas. Nenhum fica ligado a um negócio.
 */
function registosDeAbordagens(abordagens: readonly AbordagemExemplo[], pessoas: readonly Pessoa[], hoje: string): EstadoRegistos {
  const contactos: ContactoPessoa[] = [];
  const visitas: VisitaPessoa[] = [];
  const levantamentos: LevantamentoPessoa[] = [];
  for (const a of abordagens) {
    const pessoa = pessoas.find((p) => p.id === a.pessoaId);
    if (a.contactado && pessoa && !contactos.some((c) => c.pessoaId === a.pessoaId)) {
      contactos.push({
        id: `rc-${contactos.length + 1}`, pessoaId: a.pessoaId, data: somarDias(hoje, -(pessoa.ultimoContactoDias ?? 0)),
        resultado: pessoa.resultadoContacto ?? "atendeuInteressado", nota: "", negocioId: null,
      });
    }
    const dela = a.visitas.map((v): VisitaPessoa => ({ ...v, id: `rv-${visitas.length + 1 + a.visitas.indexOf(v)}`, pessoaId: a.pessoaId, negocioId: null, morada: { ...v.morada } }));
    visitas.push(...dela);
    if (a.levantamento) {
      const visita = visitaDoLevantamento(dela);
      levantamentos.push({
        id: `rl-${levantamentos.length + 1}`, pessoaId: a.pessoaId, visitaId: visita?.id ?? null, data: visita?.data ?? a.criadoEm,
        feitoPor: visita?.feitoPor || a.comercial, rascunho: a.levantamento, negocioId: null,
      });
    }
  }
  return { contactos, visitas, levantamentos };
}

/** Uma semente com o que decide se tem abordagem: o papel e os negócios abertos (ver `papelEAbertos`). */
export interface EntradaAbordagem {
  pessoa: PessoaSemente;
  papel: PapelPessoa;
  abertos: readonly NegocioMes[];
}

/** A visita de uma ficha antiga (etapa "Com visita", sem visita guardada): o próximo contacto, com a morada da lead. */
function visitaDaEtapa(pessoa: PessoaSemente): VisitaSemente | null {
  if (pessoa.etapa !== "visitaMarcada" || !pessoa.proximoContacto) return null;
  const lead = moradaDaLead(pessoa);
  return {
    data: pessoa.proximoContacto, hora: pessoa.proximoHora ?? "", comercial: pessoa.comercial,
    igualALead: lead !== null, moradaVisita: lead ?? MORADA_VISITA_VAZIA,
  };
}

/** A visita da semente passa a visita da pessoa: Levantamento, Feita ou Por fazer; a nota de acesso passa a ser a nota. */
const paraVisita = (id: string, comercial: string, v: VisitaSemente): VisitaNegocio => ({
  id, data: v.data, hora: v.hora, feitoPor: v.comercial || comercial, estado: v.feita ? "feita" : "porFazer", tipo: "levantamento",
  quemVaiEstar: "", duracao: "", morada: { ...v.moradaVisita }, igualALead: v.igualALead, nota: v.notaAcesso ?? "",
});

/**
 * Uma lead "nova" só conta como contactada se já tem uma chamada registada; qualquer outra etapa, ou uma visita, quer dizer que já se
 * falou com ela.
 */
const estaContactada = ({ pessoa }: EntradaAbordagem, temVisita: boolean): boolean =>
  temVisita || pessoa.etapa !== "nova" || pessoa.resultadoContacto !== undefined;

/** Uma lead sem negócio aberto tem sempre uma abordagem; quem tem visita (um cliente, por exemplo) também, ao lado dos negócios. */
const temAbordagem = ({ pessoa, papel, abertos }: EntradaAbordagem): boolean =>
  pessoa.visita !== undefined || (papel === "lead" && abertos.length === 0);

/** As abordagens das sementes, pela ordem das pessoas. A visita é a guardada na semente ou, nas fichas antigas, a que se deduz do próximo contacto. */
export function abordagensDeSementes(entradas: readonly EntradaAbordagem[], hoje: string): AbordagemExemplo[] {
  return entradas.filter(temAbordagem).map((entrada, i) => {
    const { pessoa } = entrada;
    const da = pessoa.visita ?? visitaDaEtapa(pessoa);
    return {
      pessoaId: pessoa.id, comercial: pessoa.comercial, criadoEm: pessoa.desde ?? hoje, contactado: estaContactada(entrada, da !== null),
      visitas: da ? [paraVisita(`s${i + 1}-v1`, pessoa.comercial, da)] : [],
      ...(da?.levantamento ? { levantamento: da.levantamento } : {}),
    };
  });
}

type Dados = Pick<VisitaNegocio, "data" | "estado"> & Partial<VisitaNegocio>;

interface Linha {
  pessoaId: string;
  /** Dias de hoje até ao início da abordagem (negativo). */
  criado: number;
  contactado: boolean;
  /** As visitas por ordem cronológica, cada uma na morada da pessoa. */
  visitas?: Dados[];
  levantamento?: AbordagemExemplo["levantamento"];
}

function abordagem({ pessoaId, criado, contactado, visitas = [], levantamento }: Linha, n: number): AbordagemExemplo {
  const p = pessoaVariado(pessoaId);
  return {
    pessoaId, comercial: p.comercial, criadoEm: dia(criado), contactado, ...(levantamento ? { levantamento } : {}),
    visitas: visitas.map((v, i) => visitaDe(`v${n}-${i + 1}`, moradaDe(p), { feitoPor: p.comercial, ...v })),
  };
}

/**
 * As abordagens dos exemplos variados: por contactar, contactadas e com visita, com visitas diferentes por pessoa (por fazer, feitas,
 * canceladas e revisitas) e uma com levantamento.
 */
const LINHAS: Linha[] = [
  // Leads, da que não tem nada feito até à que já tem visita feita com levantamento.
  { pessoaId: "pv-ema", criado: -1, contactado: false },
  { pessoaId: "pv-duarte", criado: -6, contactado: true },
  {
    pessoaId: "pv-filipa", criado: -9, contactado: true,
    visitas: [
      { data: dia(-4), estado: "cancelada", nota: "Cancelada: o cliente teve de viajar. Ficou remarcada." },
      { data: dia(4), estado: "porFazer", quemVaiEstar: "cliente", duracao: "h1" },
    ],
  },
  {
    pessoaId: "pv-gaspar", criado: -12, contactado: true,
    visitas: [{ data: dia(-3), hora: "09:30", estado: "feita", nota: "Visita feita; ainda não se tiraram as medidas.", quemVaiEstar: "cliente" }],
  },
  {
    pessoaId: "pv-helga", criado: -15, contactado: true, levantamento: LEVANTAMENTO_HELGA,
    visitas: [{ data: dia(-2), hora: "14:00", estado: "feita", quemVaiEstar: "casal", duracao: "h1m30", nota: "Levantamento feito na visita." }],
  },
  {
    pessoaId: "pv-ivo", criado: -18, contactado: true,
    visitas: [
      { data: dia(-5), estado: "feita", quemVaiEstar: "cliente", duracao: "h1" },
      { data: dia(6), hora: "15:30", estado: "porFazer", tipo: "revisita", nota: "Voltar para ver o vão do frigorífico com o carpinteiro." },
    ],
  },
  // Uma lead com contacto e, mais tarde, uma visita por fazer (duas abordagens em paralelo, que dão um só contacto).
  { pessoaId: "pv-jaime", criado: -10, contactado: true },
  {
    pessoaId: "pv-jaime", criado: -4, contactado: true,
    visitas: [{ data: dia(1), hora: "09:30", estado: "porFazer", quemVaiEstar: "familia", duracao: "m30" }],
  },
  // Clientes: uma abordagem nova em Visita ao lado de um negócio, uma sem nada feito e uma por contactar.
  {
    pessoaId: "pv-pascoal", criado: -14, contactado: true,
    visitas: [
      { data: dia(-3), hora: "16:00", estado: "feita", quemVaiEstar: "cliente", duracao: "h1" },
      { data: dia(5), hora: "11:00", estado: "porFazer", tipo: "materiais", nota: "Escolha dos materiais e dos acabamentos." },
    ],
  },
  { pessoaId: "pv-quiteria", criado: -4, contactado: false },
  { pessoaId: "pv-quiteria", criado: -4, contactado: true },
  { pessoaId: "pv-rodrigo", criado: -1, contactado: false },
];

/** Os registos das abordagens: os das sementes (leads sem negócio aberto e quem tem visita marcada) e os dos exemplos variados; nenhum ligado. */
const REGISTOS_DAS_ABORDAGENS: EstadoRegistos = registosDeAbordagens(
  [
    ...abordagensDeSementes(
      SEMENTES_EXEMPLO.map((pessoa) => ({ pessoa, ...papelEAbertos(NEGOCIOS_PESSOAS_EXEMPLO.filter((n) => n.pessoaId === pessoa.id)) })),
      HOJE_EXEMPLO,
    ),
    ...LINHAS.map((l, i) => abordagem(l, i + 1)),
  ],
  PESSOAS_EXEMPLO, HOJE_EXEMPLO,
);

/** Os registos das pessoas de exemplo: os das abordagens (por ligar) e os que já estão ligados a negócios (ver `registosLigadosExemplo.ts`). */
export const REGISTOS_EXEMPLO: EstadoRegistos = {
  contactos: [...REGISTOS_DAS_ABORDAGENS.contactos, ...REGISTOS_LIGADOS_EXEMPLO.contactos],
  visitas: [...REGISTOS_DAS_ABORDAGENS.visitas, ...REGISTOS_LIGADOS_EXEMPLO.visitas],
  levantamentos: [...REGISTOS_DAS_ABORDAGENS.levantamentos, ...REGISTOS_LIGADOS_EXEMPLO.levantamentos],
};
