/** Criar acesso, na apresentação: liga uma conta de exemplo à ficha em memória (não cria utilizador nem envia e-mail). */
import { useCallback, useState } from "react";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { atualizarFicha, novoId } from "@/components/rh-exemplo/dados/loja";

export interface ResultadoCriarAcesso {
  ok: boolean;
  emailEnviado: boolean;
  aviso: string | null;
  erro: string | null;
  faltam: string[] | null;
}

interface OpcoesCriarAcesso {
  forcarNovaPassword?: boolean;
}

export function useCriarAcessoPessoa() {
  const [processando, setProcessando] = useState(false);

  const criarAcesso = useCallback(
    async (pessoaId: string, _roleId: string, _opcoes?: OpcoesCriarAcesso): Promise<ResultadoCriarAcesso> => {
      setProcessando(true);
      atualizarFicha(pessoaId, (f) =>
        f.conta
          ? f
          : {
              ...f,
              conta: {
                id: novoId("ct"),
                pessoa_id: pessoaId,
                organization_id: f.pessoa.organization_id,
                anew_user_id: `u-${pessoaId}`,
                entity_id: null,
                estado: "activa",
                ligada_em: `${diaIso(0)}T09:00:00Z`,
                revogada_em: null,
              },
              pendencias: [],
            },
      );
      setProcessando(false);
      return { ok: true, emailEnviado: true, aviso: null, erro: null, faltam: null };
    },
    [],
  );

  return { criarAcesso, processando };
}
