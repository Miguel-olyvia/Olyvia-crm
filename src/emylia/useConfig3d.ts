// 25/11: o gancho da configuração 3D de um produto (config3dDados.ts): lê UMA vez quando o 3D abre (quem o usa só o chama então) e grava por produto. Tolerante: a função não existir na
// base (migration por aplicar) ou faltar a permissão de leitura deixa `config` a null e sem erro (o 3D fica como era); qualquer outro erro vem em `erro`, em português.
import { useCallback, useEffect, useRef, useState } from "react";
import { definirConfig3d, lerConfig3d, type Config3d, type Ligacao } from "./config3dDados";
import type { Eixos } from "./planta3d/eixosMedida";

export interface AlvoConfig3d { org: string; produtoId: string; podeEditar: boolean }
export interface EstadoConfig3d {
  /** A configuração lida; null enquanto se lê, ou se a base não a dá (função em falta, sem permissão, erro). */
  config: Config3d | null;
  /** Só um erro de verdade (nem «função em falta» nem «sem permissão»): a frase em português. */
  erro: string | null;
  /** Grava os eixos (null herda), mantendo as ligações do produto. Devolve o erro em texto, ou null se correu bem (a configuração já foi relida). */
  gravarEixos: (eixos: Eixos | null) => Promise<string | null>;
  /** Grava as ligações (null herda), mantendo os eixos do produto. */
  gravarLigacoes: (ligacoes: readonly Ligacao[] | null) => Promise<string | null>;
}

const FRASE_RELER = "A configuração ficou guardada, mas não foi possível relê-la: feche e abra o 3D para a ver.";

export function useConfig3d(alvo: AlvoConfig3d | undefined): EstadoConfig3d {
  const org = alvo?.org, produtoId = alvo?.produtoId;
  const [config, setConfig] = useState<Config3d | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // a configuração mais recente, para quem grava não usar uma cópia velha do próprio (os eixos e as ligações gravam-se juntos)
  const atual = useRef<Config3d | null>(null);
  atual.current = config;

  useEffect(() => {
    setConfig(null); setErro(null);
    if (!org || !produtoId) return;
    let vivo = true;
    void lerConfig3d(org, "produto", produtoId).then((r) => {
      if (!vivo) return;
      if (r.ok === false) {
        // função em falta (migration por aplicar) ou sem permissão de leitura: o 3D fica como era, sem ruído
        if (!r.indisponivel && r.codigo !== "CT001") setErro(r.erro);
        return;
      }
      setConfig(r.v);
    });
    return () => { vivo = false; };
  }, [org, produtoId]);

  const gravar = useCallback(async (parte: { eixos?: Eixos | null; ligacoes?: readonly Ligacao[] | null }): Promise<string | null> => {
    if (!org || !produtoId) return "Não foi possível gravar a configuração 3D.";
    const proprio = atual.current?.proprio;
    const r = await definirConfig3d(org, "produto", produtoId, {
      eixos: parte.eixos !== undefined ? parte.eixos : proprio?.eixos ?? null,
      ligacoes: parte.ligacoes !== undefined ? parte.ligacoes : proprio?.ligacoes ?? null,
    });
    if (r.ok === false) return r.erro;
    const lida = await lerConfig3d(org, "produto", produtoId);
    if (lida.ok === false) return FRASE_RELER;
    setConfig(lida.v);
    return null;
  }, [org, produtoId]);

  const gravarEixos = useCallback((eixos: Eixos | null) => gravar({ eixos }), [gravar]);
  const gravarLigacoes = useCallback((ligacoes: readonly Ligacao[] | null) => gravar({ ligacoes }), [gravar]);
  return { config, erro, gravarEixos, gravarLigacoes };
}
