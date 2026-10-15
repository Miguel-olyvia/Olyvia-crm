/**
 * Dados de exemplo da página «Organização»: o Grupo Aurora, duas empresas legais, as 5 filiais e os 7 centros que o RH de
 * exemplo já tem (os nomes vêm de `catalogos()`, não se repetem aqui), e a ligação inicial das 18 pessoas.
 *
 * Quase toda a gente trabalha num centro da filial a que está legalmente ligada; quatro pessoas não (Tiago, Hugo, Daniel e
 * Joana) para se ver a diferença entre «onde está legalmente» e «onde trabalha».
 */
import * as K from "@/components/rh-exemplo/dados/constantes";
import { catalogos } from "@/components/rh-exemplo/dados/catalogos";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import type { EstadoRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type {
  EstadoOrganizacao,
  EstruturaOrg,
  EventoLigacao,
  Ligacao,
  PessoaOrg,
} from "@/components/rh-exemplo/organizacao/tipos";

export const GRUPO_ID = "org-grupo-aurora";
export const EMPRESA_REMODELACOES = "emp-aurora-remodelacoes";
export const EMPRESA_CLIMATIZACAO = "emp-aurora-climatizacao";

/** A que empresa legal pertence cada filial (distribuição de exemplo). */
const EMPRESA_DA_FILIAL: Record<string, string> = {
  [K.FILIAL_SEDE]: EMPRESA_REMODELACOES,
  [K.FILIAL_LISBOA]: EMPRESA_REMODELACOES,
  [K.FILIAL_PORTO]: EMPRESA_REMODELACOES,
  [K.FILIAL_BRAGA]: EMPRESA_CLIMATIZACAO,
  [K.FILIAL_FARO]: EMPRESA_CLIMATIZACAO,
};

/** A filial de cada centro; o teletrabalho não tem filial no catálogo e fica na sede. */
const FILIAL_DO_CENTRO: Record<string, string> = {
  [K.LOCAL_SEDE]: K.FILIAL_SEDE,
  [K.LOCAL_COLOMBO]: K.FILIAL_LISBOA,
  [K.LOCAL_ARMAZEM]: K.FILIAL_LISBOA,
  [K.LOCAL_PORTO]: K.FILIAL_PORTO,
  [K.LOCAL_BRAGA]: K.FILIAL_BRAGA,
  [K.LOCAL_FARO]: K.FILIAL_FARO,
  [K.LOCAL_REMOTO]: K.FILIAL_SEDE,
};

const RESPONSAVEL_FILIAL: Record<string, string> = {
  [K.FILIAL_SEDE]: "Marta Figueiredo",
  [K.FILIAL_LISBOA]: "Rui Amaral",
  [K.FILIAL_PORTO]: "Inês Cardoso",
};

const RESPONSAVEL_CENTRO: Record<string, string> = {
  [K.LOCAL_SEDE]: "Sofia Rebelo",
  [K.LOCAL_COLOMBO]: "Rui Amaral",
  [K.LOCAL_PORTO]: "Inês Cardoso",
};

const MORADA_FILIAL: Record<string, string> = {
  [K.FILIAL_SEDE]: "Avenida da República 80, 1050-197 Lisboa",
  [K.FILIAL_LISBOA]: "Rua Castilho 15, 1250-066 Lisboa",
  [K.FILIAL_PORTO]: "Rua de Cedofeita 210, 4050-180 Porto",
  [K.FILIAL_BRAGA]: "Avenida Central 45, 4710-229 Braga",
  [K.FILIAL_FARO]: "Rua de Santo António 12, 8000-283 Faro",
};

/** A estrutura legal e física, montada a partir do catálogo de exemplo de RH. */
export function criarEstruturaExemplo(): EstruturaOrg {
  const cat = catalogos();
  return {
    grupo: {
      id: GRUPO_ID, nome: "Grupo Aurora", nif: "508 731 920",
      morada: "Avenida da República 80, 1050-197 Lisboa", responsavel: "Marta Figueiredo",
    },
    empresas: [
      {
        id: EMPRESA_REMODELACOES, nome: "Aurora Remodelações, Lda.", nif: "509 482 316",
        morada: "Avenida da República 80, 1050-197 Lisboa", responsavel: "Marta Figueiredo",
      },
      {
        id: EMPRESA_CLIMATIZACAO, nome: "Aurora Climatização, Lda.", nif: "510 227 845",
        morada: "Avenida Central 45, 4710-229 Braga", responsavel: "",
      },
    ],
    filiais: cat.filiais.map((f) => ({
      id: f.id, nome: f.name, empresaId: EMPRESA_DA_FILIAL[f.id] ?? EMPRESA_REMODELACOES,
      morada: MORADA_FILIAL[f.id] ?? "", responsavel: RESPONSAVEL_FILIAL[f.id] ?? "",
    })),
    centros: cat.locais.map((c) => ({
      id: c.id, nome: c.nome, filialId: FILIAL_DO_CENTRO[c.id] ?? K.FILIAL_SEDE,
      morada: c.morada ? `${c.morada}, ${c.cidade ?? ""}`.replace(/, $/, "") : "", responsavel: RESPONSAVEL_CENTRO[c.id] ?? "",
    })),
  };
}

/** Quem trabalha num centro que não é da filial do seu vínculo legal (filial do vínculo e centro). */
const VINCULO_DIFERENTE: Record<string, { filialId: string; centroId: string }> = {
  "p-tiago": { filialId: K.FILIAL_LISBOA, centroId: K.LOCAL_FARO },
  "p-hugo": { filialId: K.FILIAL_PORTO, centroId: K.LOCAL_BRAGA },
  "p-daniel": { filialId: K.FILIAL_SEDE, centroId: K.LOCAL_ARMAZEM },
  "p-joana": { filialId: K.FILIAL_BRAGA, centroId: K.LOCAL_PORTO },
};

/** Sem ligação à partida: uma pessoa que já saiu e duas que ainda vão entrar (para se ver o «Ligar pessoa»). */
const SEM_LIGACAO = new Set(["p-pedro", "p-nadia", "p-ruben"]);

/** As 18 pessoas de exemplo, lidas do store do RH. */
export function pessoasDoExemplo(rh: EstadoRh): PessoaOrg[] {
  return rh.ordem.flatMap((id) => {
    const ficha = rh.fichas[id];
    return ficha ? [{ id, nome: ficha.pessoa.nome_completo, cargo: ficha.pessoa.cargo }] : [];
  });
}

function ligacaoInicial(rh: EstadoRh, id: string): Ligacao | null {
  const ficha = rh.fichas[id];
  if (!ficha || SEM_LIGACAO.has(id)) return null;
  const outra = VINCULO_DIFERENTE[id];
  const filialId = outra?.filialId ?? ficha.colocacoes[0]?.organograma_node_id ?? K.FILIAL_SEDE;
  const centroId = outra?.centroId ?? ficha.pessoa.local_id ?? K.LOCAL_SEDE;
  return {
    pessoaId: id, filialId, centroId, empresaId: EMPRESA_DA_FILIAL[filialId] ?? EMPRESA_REMODELACOES,
    desde: ficha.vinculos[0]?.data_inicio ?? diaIso(0),
  };
}

function historicoInicial(ligs: readonly Ligacao[], rh: EstadoRh): EventoLigacao[] {
  const colo = (id: string) => ({ empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_LISBOA, centroId: id });
  const tiago = ligs.find((l) => l.pessoaId === "p-tiago");
  const eventos: Omit<EventoLigacao, "id">[] = [];
  if (tiago) {
    eventos.push({ pessoaId: "p-tiago", data: tiago.desde, tipo: "ligar", de: null, para: colo(K.LOCAL_COLOMBO), motivo: "Entrada na Filial Lisboa" });
    eventos.push({ pessoaId: "p-tiago", data: diaIso(-45), tipo: "alterar", de: colo(K.LOCAL_COLOMBO), para: colo(K.LOCAL_FARO), motivo: "Reforço da loja de Faro" });
  }
  const pedro = rh.fichas["p-pedro"];
  if (pedro) {
    const pedroDestino = { empresaId: EMPRESA_CLIMATIZACAO, filialId: K.FILIAL_FARO, centroId: K.LOCAL_FARO };
    eventos.push({ pessoaId: "p-pedro", data: pedro.vinculos[0]?.data_inicio ?? diaIso(-400), tipo: "ligar", de: null, para: pedroDestino, motivo: "" });
    eventos.push({ pessoaId: "p-pedro", data: diaIso(-40), tipo: "desligar", de: pedroDestino, para: null, motivo: "Caducidade do contrato a termo" });
  }
  return eventos.map((e, i) => ({ ...e, id: `ev-org-${i + 1}` }));
}

/** O estado inicial da página: ligações das pessoas e o histórico de dois casos. */
export function criarEstadoOrganizacaoInicial(rh: EstadoRh): EstadoOrganizacao {
  const ligacoes = rh.ordem.map((id) => ligacaoInicial(rh, id)).filter((l): l is Ligacao => l !== null);
  return { ligacoes, historico: historicoInicial(ligacoes, rh) };
}
