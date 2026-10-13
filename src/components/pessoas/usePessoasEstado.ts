// O estado local da página "Pessoas": as pendentes e as notas vivem só em memória (nada
// persiste, ao recarregar voltam as 6) e as preferências de ordem e chip em localStorage.
import { useCallback, useEffect, useMemo, useState } from "react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { juntarPessoas } from "./juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO, SUBMISSOES_EXEMPLO } from "./pessoasExemplo";
import {
  chipEfetivo, guardarPrefsPessoas, lerPrefsPessoas, type PreferenciasPessoas,
} from "./preferenciasPessoas";
import type { ChipPessoa, EstadoPessoas, OrdemPessoa } from "./pessoasTipos";
import { pessoasComPendentes, resolverSubmissao } from "./resolverSubmissao";

const ESTADO_INICIAL: EstadoPessoas = { submissoes: SUBMISSOES_EXEMPLO, notas: [] };
const RESUMOS = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO);

/** Os dados da página e as duas ações que os mudam. `podeVerSubmissoes` esconde tudo o que vem de submissões. */
export function usePessoasEstado(podeVerSubmissoes: boolean) {
  const [estado, setEstado] = useState<EstadoPessoas>(ESTADO_INICIAL);
  const [prefs, setPrefs] = useState<PreferenciasPessoas>(lerPrefsPessoas);
  useEffect(() => guardarPrefsPessoas(prefs), [prefs]);

  const submissoes = useMemo(() => (podeVerSubmissoes ? estado.submissoes : []), [podeVerSubmissoes, estado.submissoes]);
  const pendentes = useMemo(() => pessoasComPendentes(submissoes), [submissoes]);

  const notas = useMemo(() => (podeVerSubmissoes ? estado.notas : []), [podeVerSubmissoes, estado.notas]);
  const prefsEfetivas = useMemo(
    () => ({ ...prefs, chip: chipEfetivo(prefs.chip, podeVerSubmissoes) }),
    [prefs, podeVerSubmissoes],
  );

  const resolver = useCallback(
    (submissaoId: string, pessoaId?: string) => setEstado((atual) => resolverSubmissao(atual, submissaoId, pessoaId)),
    [],
  );
  const mudarOrdem = useCallback((ordem: OrdemPessoa) => setPrefs((p) => ({ ...p, ordem })), []);
  const mudarChip = useCallback((chip: ChipPessoa) => setPrefs((p) => ({ ...p, chip })), []);

  return { resumos: RESUMOS, submissoes, notas, pendentes, prefs: prefsEfetivas, resolver, mudarOrdem, mudarChip };
}
