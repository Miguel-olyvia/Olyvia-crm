// O estado local da página "Pessoas": as pessoas, as pendentes, as notas e a atividade vivem só em memória (nada
// persiste, ao recarregar volta tudo ao exemplo) e as preferências de ordem e chip em localStorage.
import { useCallback, useEffect, useMemo, useState } from "react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { adiar, juntarNota, perder, registarChamada, type DadosChamada } from "./acoesPessoa";
import { juntarPessoas } from "./juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO, SUBMISSOES_EXEMPLO } from "./pessoasExemplo";
import {
  chipEfetivo, guardarPrefsPessoas, lerPrefsPessoas, type PreferenciasPessoas,
} from "./preferenciasPessoas";
import type { ChipPessoa, EstadoPessoas, MotivoPerda, OrdemPessoa } from "./pessoasTipos";
import { pessoasQueVoltaram, resolverSubmissao } from "./resolverSubmissao";

const ESTADO_INICIAL: EstadoPessoas = {
  submissoes: SUBMISSOES_EXEMPLO, notas: [], pessoas: PESSOAS_EXEMPLO, atividade: [], contactadas: [],
};

/** Os dados da página e as ações que os mudam. `podeVerSubmissoes` esconde tudo o que vem de submissões. */
export function usePessoasEstado(podeVerSubmissoes: boolean) {
  const [estado, setEstado] = useState<EstadoPessoas>(ESTADO_INICIAL);
  const [prefs, setPrefs] = useState<PreferenciasPessoas>(lerPrefsPessoas);
  useEffect(() => guardarPrefsPessoas(prefs), [prefs]);

  const resumos = useMemo(
    () => juntarPessoas(estado.pessoas, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO),
    [estado.pessoas],
  );
  const submissoes = useMemo(() => (podeVerSubmissoes ? estado.submissoes : []), [podeVerSubmissoes, estado.submissoes]);
  const pendentes = useMemo(
    () => pessoasQueVoltaram({ pessoas: estado.pessoas, contactadas: estado.contactadas }, submissoes),
    [estado.pessoas, estado.contactadas, submissoes],
  );

  const notas = useMemo(() => (podeVerSubmissoes ? estado.notas : []), [podeVerSubmissoes, estado.notas]);
  const prefsEfetivas = useMemo(
    () => ({ ...prefs, chip: chipEfetivo(prefs.chip, podeVerSubmissoes) }),
    [prefs, podeVerSubmissoes],
  );

  const resolver = useCallback(
    (submissaoId: string, pessoaId?: string) => setEstado((atual) => resolverSubmissao(atual, submissaoId, pessoaId)),
    [],
  );
  const chamar = useCallback(
    (id: string, dados: Omit<DadosChamada, "hoje">) =>
      setEstado((atual) => registarChamada(atual, id, { ...dados, hoje: HOJE_EXEMPLO })),
    [],
  );
  const adiarContacto = useCallback(
    (id: string, dias: 1 | 3 | 7) => setEstado((atual) => adiar(atual, id, dias, HOJE_EXEMPLO)),
    [],
  );
  const perderLead = useCallback(
    (id: string, motivo: MotivoPerda) => setEstado((atual) => perder(atual, id, motivo, HOJE_EXEMPLO)),
    [],
  );
  const juntarNotaManual = useCallback(
    (id: string, texto: string) => setEstado((atual) => juntarNota(atual, id, texto, HOJE_EXEMPLO)),
    [],
  );
  const mudarOrdem = useCallback((ordem: OrdemPessoa) => setPrefs((p) => ({ ...p, ordem })), []);
  const mudarChip = useCallback((chip: ChipPessoa) => setPrefs((p) => ({ ...p, chip })), []);

  return {
    resumos, submissoes, notas, pendentes, atividade: estado.atividade, prefs: prefsEfetivas, resolver,
    registarChamada: chamar, adiar: adiarContacto, perder: perderLead, juntarNota: juntarNotaManual, mudarOrdem, mudarChip,
  };
}
