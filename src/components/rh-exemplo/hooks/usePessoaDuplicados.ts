/** Verificar duplicados, na apresentacao: procura NIF/NISS iguais nas fichas de exemplo. */
import { useCallback, useState } from "react";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";

export type ForcaDuplicado = "travao" | "sinal";
export type EstadoFicha = "activa" | "apagada";

export interface CandidatoDuplicado {
  pessoaId: string;
  nomeCompleto: string;
  campoCoincidente: string;
  forca: ForcaDuplicado;
  estado: EstadoFicha;
}

export interface ValoresParaVerificar {
  organizationId: string;
  nif?: string | null;
  niss?: string | null;
  emailPessoal?: string | null;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  primeiroNome?: string | null;
  apelido?: string | null;
  dataNascimento?: string | null;
  excluirPessoaId?: string | null;
}

const SEM_CANDIDATOS: CandidatoDuplicado[] = [];

export function usePessoaDuplicados() {
  const [candidatos, setCandidatos] = useState<CandidatoDuplicado[]>(SEM_CANDIDATOS);

  const limpar = useCallback(() => setCandidatos(SEM_CANDIDATOS), []);

  const verificar = useCallback(async (valores: ValoresParaVerificar): Promise<CandidatoDuplicado[] | null> => {
    const encontrados: CandidatoDuplicado[] = [];
    for (const ficha of Object.values(lerEstado().fichas)) {
      if (ficha.pessoa.id === valores.excluirPessoaId) continue;
      const nif = valores.nif && ficha.identificacao?.nif === valores.nif;
      const niss = valores.niss && ficha.segredos.niss === valores.niss;
      if (!nif && !niss) continue;
      encontrados.push({
        pessoaId: ficha.pessoa.id,
        nomeCompleto: ficha.pessoa.nome_completo,
        campoCoincidente: nif ? "nif" : "niss",
        forca: "travao",
        estado: "activa",
      });
    }
    setCandidatos(encontrados);
    return encontrados;
  }, []);

  return {
    candidatos,
    aVerificar: false,
    semAcesso: false,
    demasiadasTentativas: false,
    erro: false,
    verificar,
    limpar,
  };
}
