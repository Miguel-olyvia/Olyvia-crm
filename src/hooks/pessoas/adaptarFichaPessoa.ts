// A pessoa da ficha real: passa o `pessoa`, o `lead` e os `agregados` de neg_ficha_pessoa para o tipo Pessoa do ecrã.
// O contrato dá a campanha e o formulário (`origem`), o NIF e a empresa quando há fonte: preenchem-se quando existem e o ecrã esconde os
// que faltam. O que o contrato não dá (saúde, canal, tipo de origem, via de entrada) fica por preencher. `origem.origin` e `origem.source`
// não se mapeiam: os valores reais são por confirmar e o tipo de origem do ecrã é uma lista fechada.
// Uma lead legada (perdida, rejeitada, cancelada) aparece como abordagem normal: `perdida` nunca se preenche.
import { MOTIVOS_PERDA, RESULTADOS_CONTACTO } from "@/components/pessoas/opcoesPessoa";
import type {
  EncerramentoPessoa, MotivoEncerramento, Pessoa, QualificacaoPessoa, ResultadoContacto, ResultadoEncerramento,
} from "@/components/pessoas/pessoasTipos";
import { diasEntre } from "./adaptarResumoPessoa";
import { escolher, textoOuNull } from "./adaptarComum";
import type { FichaDb, MoradaFichaDb } from "./fichaTipos";
import { diaLisboa, horaDoProximoContacto } from "./tempoLisboa";

const QUALIFICACOES: readonly QualificacaoPessoa[] = ["MQL", "SQL"];
const ENCERRAMENTOS: readonly ResultadoEncerramento[] = ["semInteresse", "obraInviavel"];

function adaptarMorada(m: MoradaFichaDb | null): Pessoa["morada"] {
  if (!m) return undefined;
  const rua = textoOuNull(m.rua);
  const andar = textoOuNull(m.andar);
  const cp = textoOuNull(m.codigo_postal) ?? "";
  const localidade = textoOuNull(m.localidade) ?? "";
  if (!rua && !cp && !localidade) return undefined;
  return { linha: [rua, andar].filter(Boolean).join(", "), cp, localidade };
}

const empresaDe = (nome: string | null): Pessoa["empresa"] => {
  const limpo = textoOuNull(nome);
  return limpo ? { nome: limpo } : undefined;
};

/** O encerramento da abordagem. Motivo da lista, «outro» com texto, ou nulo (encerrada pelo resultado da visita) que vira «outro». */
function adaptarEncerramento(ficha: FichaDb, hoje: string): EncerramentoPessoa | undefined {
  const e = ficha.lead?.encerramento;
  const resultado = escolher(e?.resultado, ENCERRAMENTOS);
  if (!e || !resultado) return undefined;
  const data = diaLisboa(e.em) ?? hoje;
  const daLista = escolher(e.motivo, MOTIVOS_PERDA);
  if (daLista) return { resultado, motivo: daLista, data };
  const motivo: MotivoEncerramento = "outro";
  return { resultado, motivo, motivoOutro: textoOuNull(e.motivo_outro) ?? undefined, data };
}

/** A pessoa da ficha. `hoje` é o dia de Lisboa (AAAA-MM-DD). */
export function adaptarPessoa(ficha: FichaDb, hoje: string): Pessoa {
  const { pessoa, agregados } = ficha;
  const morada = adaptarMorada(pessoa.morada);
  const proximo = agregados.proximo_contacto_em;
  return {
    id: pessoa.id,
    nome: pessoa.nome?.trim() ?? "",
    contacto: { telefone: textoOuNull(pessoa.contacto?.telefone), email: textoOuNull(pessoa.contacto?.email) },
    comercial: pessoa.responsavel_nome?.trim() ?? "",
    ultimoContactoDias: diasEntre(agregados.ultimo_contacto_em, hoje),
    morada,
    distrito: textoOuNull(pessoa.morada?.distrito) ?? undefined,
    qualificacao: escolher(pessoa.qualificacao?.trim().toUpperCase(), QUALIFICACOES) ?? undefined,
    campanha: textoOuNull(pessoa.origem?.campanha) ?? undefined,
    formulario: textoOuNull(pessoa.origem?.formulario) ?? undefined,
    nif: textoOuNull(pessoa.nif) ?? undefined,
    empresa: empresaDe(pessoa.empresa),
    resultadoContacto: (escolher(agregados.ultimo_resultado, RESULTADOS_CONTACTO as readonly ResultadoContacto[]) ?? undefined),
    proximoContacto: diaLisboa(proximo),
    proximoHora: horaDoProximoContacto(proximo),
    desde: diaLisboa(pessoa.desde) ?? undefined,
    encerrada: adaptarEncerramento(ficha, hoje),
  };
}
