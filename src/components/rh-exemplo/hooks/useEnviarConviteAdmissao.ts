/** Enviar o convite de admissão, na apresentação: regista o convite na ficha em memória (não envia e-mail nenhum). */
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { useCallback, useState } from "react";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { atualizarFicha, novoId } from "@/components/rh-exemplo/dados/loja";

export interface ResultadoConvite {
  ok: boolean;
  emailEnviado: boolean;
  erro: string | null;
  conviteId: string | null;
  validUntil: string | null;
  link: string | null;
  emailErro: string | null;
  semLink: boolean;
}

export function useEnviarConviteAdmissao() {
  const [enviando, setEnviando] = useState(false);

  const enviarConvite = useCallback(async (pessoaId: string, email: string): Promise<ResultadoConvite> => {
    setEnviando(true);
    const conviteId = novoId("cv");
    const validUntil = `${diaIso(8)}T09:00:00Z`;
    atualizarFicha(pessoaId, (f) => ({
      ...f,
      convite: {
        conviteId,
        estado: "pendente",
        emailDestino: email,
        criadoEm: agoraExemplo().toISOString(),
        validUntil,
        usadoEm: null,
        emailEnviado: true,
        emailErro: null,
        ultimaRecusa: null,
      },
    }));
    setEnviando(false);
    return {
      ok: true,
      emailEnviado: true,
      erro: null,
      conviteId,
      validUntil,
      link: null,
      emailErro: null,
      semLink: false,
    };
  }, []);

  return { enviarConvite, enviando };
}
