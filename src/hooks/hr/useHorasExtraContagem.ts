/**
 * O interruptor «as horas extra contam so depois de confirmadas, a partir de [data]» de uma organizacao, lido e escrito so pelas
 * RPCs `rpc_hr_horas_extra_contagem_ler` e `_guardar`. Ler pede `hr.assiduidade.view`; guardar, `hr.assiduidade.gerir`.
 * O ecra so recebe TEXTO traduzido, nunca o codigo em bruto. Se a base ainda nao tem a RPC (migration por aplicar), o estado e
 * `indisponivel` e o ecra di-lo sem partir. Defeitos (rede, sem codigo legivel) vao para o registo; recusas de negocio nao.
 */
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";
import { CHAVE_HORAS_EXTRA } from "@/hooks/hr/useHorasExtra";
import { chaveDoErroHorasExtra, codigoDeErroHorasExtra, SUCESSO_HE, type ResultadoHE } from "@/lib/hr/horasExtraBase";
import {
  contagemIndisponivel, guardarContagemHorasExtra, lerContagemHorasExtra, type ContagemHorasExtra,
} from "@/lib/hr/horasExtraContagemRpc";

export type EstadoContagemHorasExtra = "a-carregar" | "ok" | "indisponivel" | "erro" | "sem-organizacao";

/** O que se tenta fazer ao interruptor: decide qual dos dois HRA87 se explica. */
export type AccaoContagem = "ligar" | "antecipar" | "adiar" | "desligar";

/** Ligar ou antecipar esbarra numa folha ja fechada; desligar ou adiar deixa de cobrir uma folha fechada. */
export function accaoDaContagem(actual: string | null, desde: string | null): AccaoContagem {
  if (desde === null) return "desligar";
  if (actual === null) return "ligar";
  return desde < actual ? "antecipar" : "adiar";
}

export interface ContagemHorasExtraHook {
  estado: EstadoContagemHorasExtra;
  /** `null` enquanto carrega, ou quando a leitura falhou ou a RPC ainda nao existe. */
  contagem: ContagemHorasExtra | null;
  aGuardar: boolean;
  /** `null` desliga. Devolve o texto traduzido do erro quando a base recusa. */
  guardar: (desde: string | null) => Promise<ResultadoHE>;
}

/** O texto traduzido de um erro desta RPC. HRA87 (folha fechada) tem texto proprio: aqui a data do interruptor e que esbarra, nao um dia. */
export function textoDoErroContagem(erro: unknown, accao: AccaoContagem = "ligar", ultimaFolhaFechadaAte: string | null = null): string {
  const codigo = codigoDeErroHorasExtra(erro);
  if (codigo === null) captureFlowError(erro, "hr-horas-extra-config-guardar");
  if (codigo !== "folha_fechada") return getLocalizedFallback(chaveDoErroHorasExtra(codigo));
  if (accao === "desligar" || accao === "adiar") return getLocalizedFallback("rhHeReal.contagem.erro.folhaFechadaDesligar");
  if (!ultimaFolhaFechadaAte) return getLocalizedFallback("rhHeReal.contagem.erro.folhaFechadaLigar");
  return getLocalizedFallback("rhHeReal.contagem.erro.folhaFechadaLigarData").replace("{data}", ultimaFolhaFechadaAte.split("-").reverse().join("/"));
}

export function useHorasExtraContagem(enabled = true): ContagemHorasExtraHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const ocupado = useRef(false);
  const [aGuardar, setAGuardar] = useState(false);
  const consulta = useQuery({
    queryKey: [CHAVE_HORAS_EXTRA, organizationId, "contagem"],
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<ContagemHorasExtra | "indisponivel"> => {
      try {
        return await lerContagemHorasExtra(organizationId as string);
      } catch (e) {
        if (contagemIndisponivel(e)) return "indisponivel";
        if (codigoDeErroHorasExtra(e) === null) captureFlowError(e, "hr-horas-extra-config-ler");
        throw e;
      }
    },
  });

  const guardar = useCallback(
    async (desde: string | null): Promise<ResultadoHE> => {
      if (!organizationId) return { ok: false, erro: getLocalizedFallback(chaveDoErroHorasExtra("pedido_invalido")) };
      // Guarda SINCRONA: dois cliques no mesmo instante nao chegam a fazer dois pedidos.
      if (ocupado.current) return { ok: false, erro: getLocalizedFallback(chaveDoErroHorasExtra("pedido_em_curso")) };
      ocupado.current = true;
      setAGuardar(true);
      try {
        await guardarContagemHorasExtra(organizationId, desde);
        await queryClient.invalidateQueries({ queryKey: [CHAVE_HORAS_EXTRA, organizationId] });
        return SUCESSO_HE;
      } catch (e) {
        const lida = queryClient.getQueryData<ContagemHorasExtra | "indisponivel">([CHAVE_HORAS_EXTRA, organizationId, "contagem"]);
        const contagem = lida && lida !== "indisponivel" ? lida : null;
        return { ok: false, erro: textoDoErroContagem(e, accaoDaContagem(contagem?.aprovacaoDesde ?? null, desde), contagem?.ultimaFolhaFechadaAte ?? null) };
      } finally {
        ocupado.current = false;
        setAGuardar(false);
      }
    },
    [organizationId, queryClient],
  );

  const dados = consulta.data;
  const estado: EstadoContagemHorasExtra = enabled && organizationId === null ? "sem-organizacao" : consulta.isLoading ? "a-carregar" : consulta.error ? "erro" : dados === "indisponivel" ? "indisponivel" : dados ? "ok" : "a-carregar";
  return { estado, contagem: dados && dados !== "indisponivel" ? dados : null, aGuardar, guardar };
}