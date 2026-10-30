/**
 * A gravacao automatica do formulario do portal: rascunho com debounce de 3 s, ao mudar de pagina e ao
 * fechar o separador. Quem manda no estado e o formulario; isto so decide QUANDO se grava e o que segue.
 *
 *  - Nunca grava o que acabou de ler (um rascunho igual ao lido) nem o que ja gravou.
 *  - O NISS e o IBAN seguem a parte (o hook valida o formato e so reenvia o que mudou). Quando a Edge diz
 *    que ficaram no cofre, o campo NAO se limpa — a pessoa precisa de ver o que escreveu ate submeter.
 *    A saudacao mostra os 4 ultimos digitos.
 *  - Ao fechar o separador segue so o rascunho, sem NISS nem IBAN (ninguem confirma esse pedido).
 *  - Em processo `devolvida` segue o que o servidor tem com as chaves devolvidas alteradas por cima.
 */
import { useCallback, useEffect, useRef } from "react";
import type { EscritaPortal } from "@/hooks/useConviteAdmissaoPublico";
import type { RascunhoConvite } from "@/lib/hr/conviteAdmissaoPayload";
import { estadoPermiteEditar, type PortalLer } from "@/lib/hr/portalAdmissao";
import { rascunhoAEnviar, rascunhoLido, rascunhoParaGravar, rascunhosIguais } from "@/lib/hr/portalRascunho";

/** O mesmo debounce do prototipo (`RhConviteAdmissao`). */
export const DEBOUNCE_RASCUNHO_MS = 3000;

interface UltimoEnvio {
  rascunho: Record<string, unknown>;
  niss: string;
  iban: string;
}

interface Opcoes {
  dados: PortalLer;
  rascunho: RascunhoConvite;
  definir: <K extends keyof RascunhoConvite>(campo: K, valor: RascunhoConvite[K]) => void;
  escrita: EscritaPortal;
  /** Falso enquanto se submete, ou quando o processo ja nao se edita. */
  ativo: boolean;
}

export function useRascunhoAutomatico({ dados, rascunho, escrita, ativo }: Opcoes): { gravarJa: () => Promise<void> } {
  const podeEditar = ativo && estadoPermiteEditar(dados.estado);
  // Preenchido uma so vez, a partir do que a `ler` trouxe: gravar de volta o que se acabou de ler nao e gravar.
  const lidoRef = useRef(rascunhoLido(dados));
  // Optimista: o que ja seguiu (ou esta em curso). Serve so para nao repetir pedidos iguais.
  const ultimoRef = useRef<UltimoEnvio | null>({ rascunho: rascunhoParaGravar(lidoRef.current), niss: "", iban: "" });
  // O ultimo rascunho que o servidor CONFIRMOU. E o que conta ao fechar o separador: um pedido em curso
  // ou na fila pode morrer com a pagina, por isso nao se assume gravado o que ainda nao respondeu.
  const confirmadoRef = useRef<Record<string, unknown>>(rascunhoParaGravar(lidoRef.current));
  const atualRef = useRef(rascunho);
  atualRef.current = rascunho;
  const dadosRef = useRef(dados);
  dadosRef.current = dados;
  const escritaRef = useRef(escrita);
  escritaRef.current = escrita;

  const gravarJa = useCallback(async (): Promise<void> => {
    const atual = atualRef.current;
    const aEnviar = rascunhoAEnviar(dadosRef.current, atual, lidoRef.current);
    const niss = atual.niss.trim();
    const iban = atual.conta_numero.trim();
    const ultimo = ultimoRef.current;
    if (ultimo && rascunhosIguais(aEnviar, ultimo.rascunho) && niss === ultimo.niss && iban === ultimo.iban) return;
    ultimoRef.current = { rascunho: aEnviar, niss, iban };

    const resultado = await escritaRef.current.gravarRascunho(aEnviar, { niss, iban });
    if (!resultado.ok) {
      // Falhou: o proximo gatilho volta a tentar (o erro fica visivel no indicador).
      ultimoRef.current = null;
      return;
    }
    confirmadoRef.current = aEnviar;
    // O NISS e o IBAN ja ficaram no cofre: o ultimoRef mantem o valor enviado para que a comparacao
    // na linha seguinte nao o reenvie. O campo NAO se limpa — a pessoa precisa de o ver ate submeter.
  }, []);

  useEffect(() => {
    if (!podeEditar) return;
    const id = setTimeout(() => void gravarJa(), DEBOUNCE_RASCUNHO_MS);
    return () => clearTimeout(id);
  }, [rascunho, podeEditar, gravarJa]);

  useEffect(() => {
    if (!podeEditar) return;
    const aoFechar = () => {
      const aEnviar = rascunhoAEnviar(dadosRef.current, atualRef.current, lidoRef.current);
      // Compara com o CONFIRMADO, nao com o optimista: o que esta em curso ou na fila ainda nao conta.
      if (rascunhosIguais(aEnviar, confirmadoRef.current)) return;
      escritaRef.current.gravarRascunhoAoFechar(aEnviar);
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") aoFechar();
    };
    window.addEventListener("pagehide", aoFechar);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      window.removeEventListener("pagehide", aoFechar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [podeEditar]);

  return { gravarJa };
}
