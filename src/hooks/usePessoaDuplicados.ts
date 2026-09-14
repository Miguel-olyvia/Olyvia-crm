/**
 * Verificacao de duplicados de identificacao ao criar (ou editar) uma pessoa.
 *
 * Chama `hr_pessoa_duplicados_candidatos`, que devolve FICHAS candidatas a
 * serem a mesma pessoa -- nunca os valores em si (ver a migracao
 * 20261130020000). `forca` distingue:
 *
 *   'travao' -- nif, niss: dois documentos oficiais iguais SO podem ser a
 *              mesma pessoa. O ecra usa isto para BLOQUEAR a gravacao.
 *   'sinal'  -- email_pessoal, documento, nome: podem coincidir por acaso.
 *              O ecra usa isto para AVISAR, deixando gravar com confirmacao.
 *
 * Quem nao tem `hr.pessoas.create` nem `hr.pessoas.edit` naquela organizacao
 * leva `insufficient_privilege`: `semAcesso` fica true e NAO se finge que
 * nao ha duplicado -- o formulario simplesmente nao verifica (a gravacao
 * em si continua sujeita a RLS de escrita, que e quem realmente protege).
 *
 * Desde a migracao 20261201030000, a RPC tambem tem um travao de tentativas
 * (60/5min, 600/1h por utilizador) para nao servir de oraculo de enumeracao
 * de NIF/NISS. Quem o atinge leva ERRCODE HR920: `demasiadasTentativas` fica
 * true, distinto de `semAcesso` e de "sem duplicado" -- e a politica a
 * funcionar, nao um defeito, por isso nao vai para `captureFlowError`.
 */
import { useCallback, useRef, useState } from "react";
import { hrRpc, isPermissionError, isRateLimitError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";

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
  /** A propria ficha, quando ja existe (edicao). Null ao criar. */
  excluirPessoaId?: string | null;
}

interface RespostaRpc {
  pessoa_id: string;
  nome_completo: string;
  campo_coincidente: string;
  forca: string;
  estado: string;
}

/** Sem NENHUM valor a verificar, a chamada nem se faz: nao ha o que procurar. */
function temAlgumValor(v: ValoresParaVerificar): boolean {
  return Boolean(
    (v.nif && v.nif.trim() !== "") ||
      (v.niss && v.niss.trim() !== "") ||
      (v.emailPessoal && v.emailPessoal.trim() !== "") ||
      (v.tipoDocumento && v.numeroDocumento && v.numeroDocumento.trim() !== "") ||
      (v.primeiroNome && v.primeiroNome.trim() !== "" && v.apelido && v.apelido.trim() !== ""),
  );
}

export function usePessoaDuplicados() {
  const [candidatos, setCandidatos] = useState<CandidatoDuplicado[]>([]);
  const [aVerificar, setAVerificar] = useState(false);
  const [semAcesso, setSemAcesso] = useState(false);
  const [demasiadasTentativas, setDemasiadasTentativas] = useState(false);
  const [erro, setErro] = useState(false);
  /** Descarta a resposta de uma chamada que ja nao e a mais recente. */
  const pedidoAtual = useRef(0);

  const limpar = useCallback(() => {
    setCandidatos([]);
    setSemAcesso(false);
    setDemasiadasTentativas(false);
    setErro(false);
  }, []);

  const verificar = useCallback(async (valores: ValoresParaVerificar): Promise<void> => {
    if (!valores.organizationId || !temAlgumValor(valores)) {
      limpar();
      return;
    }

    const meuPedido = ++pedidoAtual.current;
    setAVerificar(true);
    setSemAcesso(false);
    setDemasiadasTentativas(false);
    setErro(false);
    try {
      const { data, error } = await hrRpc("hr_pessoa_duplicados_candidatos", {
        p_organization_id: valores.organizationId,
        p_nif: valores.nif || null,
        p_niss: valores.niss || null,
        p_email_pessoal: valores.emailPessoal || null,
        p_tipo_documento: valores.tipoDocumento || null,
        p_numero_documento: valores.numeroDocumento || null,
        p_primeiro_nome: valores.primeiroNome || null,
        p_apelido: valores.apelido || null,
        p_data_nascimento: valores.dataNascimento || null,
        p_excluir_pessoa_id: valores.excluirPessoaId || null,
      });

      if (meuPedido !== pedidoAtual.current) return; // uma resposta mais recente ja chegou

      if (error) {
        if (isPermissionError(error)) {
          setSemAcesso(true);
        } else if (isRateLimitError(error)) {
          // O travao a funcionar, nao um defeito -- nunca vai para o
          // Sentry. Lista vazia aqui NAO significa "sem duplicado": o
          // formulario tem de distinguir os dois estados.
          setDemasiadasTentativas(true);
        } else {
          captureFlowError(error, "hr-pessoa-duplicados-candidatos");
          setErro(true);
        }
        setCandidatos([]);
        return;
      }

      const linhas: RespostaRpc[] = Array.isArray(data) ? data : [];
      setCandidatos(
        linhas
          .filter((linha) => linha && typeof linha.pessoa_id === "string")
          .map((linha) => ({
            pessoaId: linha.pessoa_id,
            nomeCompleto: linha.nome_completo,
            campoCoincidente: linha.campo_coincidente,
            forca: linha.forca === "travao" ? "travao" : "sinal",
            estado: linha.estado === "apagada" ? "apagada" : "activa",
          })),
      );
    } catch (e) {
      if (meuPedido !== pedidoAtual.current) return;
      captureFlowError(e, "hr-pessoa-duplicados-candidatos");
      setErro(true);
      setCandidatos([]);
    } finally {
      if (meuPedido === pedidoAtual.current) setAVerificar(false);
    }
  }, [limpar]);

  return {
    candidatos,
    travoes: candidatos.filter((c) => c.forca === "travao"),
    sinais: candidatos.filter((c) => c.forca === "sinal"),
    temFichaApagada: candidatos.some((c) => c.estado === "apagada"),
    aVerificar,
    semAcesso,
    demasiadasTentativas,
    erro,
    verificar,
    limpar,
  };
}
