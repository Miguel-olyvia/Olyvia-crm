/** O envio de um anexo, na apresentacao: aceita logo e nao envia nada para lado nenhum. */
import { useCallback, useState } from "react";
import type { TipoAnexoRh } from "@/components/rh-exemplo/lib/anexosRh";

export type FaseEnvioRh = "a_enviar" | "a_verificar" | "erro";

export interface EnvioAnexoRh {
  tipo: TipoAnexoRh;
  nome: string;
  fase: FaseEnvioRh;
  progresso: number;
  codigoErro: string | null;
}

export interface ResultadoEnvioRh {
  ok: boolean;
  codigo: string | null;
  anexo: { id: string; tipo: TipoAnexoRh; nome: string } | null;
}

export function useAnexarAnexoRh() {
  const [envios, setEnvios] = useState<Record<string, EnvioAnexoRh>>({});

  const enviar = useCallback(async (tipo: TipoAnexoRh, ficheiro: File): Promise<ResultadoEnvioRh> => {
    return { ok: true, codigo: null, anexo: { id: `anx-${tipo}-${ficheiro.name}`, tipo, nome: ficheiro.name } };
  }, []);

  const descartarEnvio = useCallback((id: string) => {
    setEnvios((actuais) => {
      const { [id]: _removido, ...resto } = actuais;
      return resto;
    });
  }, []);

  return { envios, enviar, descartarEnvio };
}
