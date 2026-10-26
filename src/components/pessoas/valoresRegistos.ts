// O que o painel «Visita e levantamento» leva quando se abre sobre uma PESSOA (a ficha, o passo «Marcar a visita como feita» ou «Fazer o
// levantamento»): ela, o comercial dela, as visitas dela e o último levantamento dela por ligar. Função pura.
import type { ValoresIniciaisNegocio } from "@/components/negocio-metas/novoNegocio";
import type { RegistosDaPessoa } from "@/components/negocio-metas/registosTipos";
import type { Pessoa } from "./pessoasTipos";

/**
 * Os valores com que o painel abre. As visitas são as da pessoa (a lista inteira, copiada) e o levantamento é o mais recente que ainda
 * não está ligado a nenhum negócio (um ligado já não se edita aqui). A morada da obra vem do levantamento guardado ou, sem ele, das visitas
 * (é o painel que decide). Sem registos, abre vazio.
 */
export function valoresIniciaisDosRegistos(pessoa: Pick<Pessoa, "id" | "comercial">, registos: RegistosDaPessoa): ValoresIniciaisNegocio {
  const livre = [...registos.levantamentos].filter((l) => l.negocioId === null).sort((a, b) => b.data.localeCompare(a.data))[0];
  return {
    pessoaId: pessoa.id, comercial: pessoa.comercial, visitas: [...registos.visitas],
    // O levantamento leva também a data, o estado e o comercial que já tem (valem enquanto nenhuma visita o representar).
    ...(livre ? {
      levantamento: {
        ...livre.rascunho,
        dados: { data: livre.data, estado: livre.estado ?? "porFazer", feitoPor: livre.feitoPor },
        ...(livre.moradaOrigem ? { moradaOrigem: livre.moradaOrigem } : {}),
      },
    } : {}),
  };
}
