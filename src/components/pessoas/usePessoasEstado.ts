// O estado local da página "Pessoas": as pessoas, as pendentes, as notas e a atividade vivem só em memória (nada
// persiste, ao recarregar volta tudo ao exemplo) e as preferências de tipo, chip, ordem e vista em localStorage.
import { useCallback, useEffect, useMemo, useState } from "react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { adiar, juntarNota, perder, reativar, registarChamada, type ContextoPerda, type DadosChamada } from "./acoesPessoa";
import type { DadosNovaLead } from "./novaLead";
import { pessoasNovas, registarLead } from "./pessoasNovas";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import {
  alterarVisita, concluirVisita, guardarLevantamento, marcarVisita, marcarVisitaFeita, type DadosAlterarVisita, type DadosVisita,
} from "./visitaPessoa";
import { useNegociosDasPessoas } from "./useNegociosDasPessoas";
import { chipValido } from "./filtrosPessoas";
import { juntarPessoas } from "./juntarPessoas";
import { PESSOAS_EXEMPLO, SUBMISSOES_EXEMPLO } from "./pessoasExemplo";
import { guardarPrefsPessoas, lerPrefsPessoas, type PreferenciasPessoas } from "./preferenciasPessoas";
import type { ChipPessoa, EstadoPessoas, MotivoPerda, OrdemPessoa, TipoPessoa, VistaPessoas } from "./pessoasTipos";
import { pessoasQueVoltaram, resolverSubmissao } from "./resolverSubmissao";

/** O estado de partida: o exemplo e as leads criadas até agora (que sobrevivem à navegação, ver `pessoasNovas.ts`). */
function estadoInicial(): EstadoPessoas {
  const novas = pessoasNovas();
  return {
    submissoes: SUBMISSOES_EXEMPLO, notas: [], pessoas: [...PESSOAS_EXEMPLO, ...novas.pessoas], atividade: [...novas.atividade], contactadas: [],
  };
}

/** Os dados da página e as ações que os mudam. `podeVerSubmissoes` esconde tudo o que vem de submissões. */
export function usePessoasEstado(podeVerSubmissoes: boolean) {
  const [estado, setEstado] = useState<EstadoPessoas>(estadoInicial);
  const negocios = useNegociosDasPessoas();
  const [prefs, setPrefs] = useState<PreferenciasPessoas>(lerPrefsPessoas);
  useEffect(() => guardarPrefsPessoas(prefs), [prefs]);

  const resumos = useMemo(
    () => juntarPessoas(estado.pessoas, negocios, HOJE_EXEMPLO),
    [estado.pessoas, negocios],
  );
  const submissoes = useMemo(() => (podeVerSubmissoes ? estado.submissoes : []), [podeVerSubmissoes, estado.submissoes]);
  const pendentes = useMemo(
    () => pessoasQueVoltaram({ pessoas: estado.pessoas, contactadas: estado.contactadas }, submissoes),
    [estado.pessoas, estado.contactadas, submissoes],
  );

  const notas = useMemo(() => (podeVerSubmissoes ? estado.notas : []), [podeVerSubmissoes, estado.notas]);
  const prefsEfetivas = useMemo(() => ({ ...prefs, chip: chipValido(prefs.tipo, prefs.chip) }), [prefs]);

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
  /** O contexto traz o passo (0 a 3) e o papel: quem chama conhece os negócios da pessoa. */
  const perderLead = useCallback(
    (id: string, motivo: MotivoPerda, contexto: ContextoPerda) => setEstado((atual) => perder(atual, id, motivo, HOJE_EXEMPLO, contexto)),
    [],
  );
  const reativarLead = useCallback((id: string) => setEstado((atual) => reativar(atual, id, HOJE_EXEMPLO)), []);
  const juntarNotaManual = useCallback(
    (id: string, texto: string) => setEstado((atual) => juntarNota(atual, id, texto, HOJE_EXEMPLO)),
    [],
  );
  /** Cria a lead (Por contactar), guarda-a e devolve-a, para a página lhe abrir a ficha. */
  const criarLead = useCallback((dados: DadosNovaLead) => {
    const lead = registarLead(dados, HOJE_EXEMPLO);
    setEstado((atual) => ({ ...atual, pessoas: [...atual.pessoas, lead.pessoa], atividade: [...lead.atividade, ...atual.atividade] }));
    return lead.pessoa;
  }, []);
  const marcarVisitaPedida = useCallback(
    (id: string, dados: DadosVisita) => setEstado((atual) => marcarVisita(atual, id, dados, HOJE_EXEMPLO)),
    [],
  );
  const alterarVisitaMarcada = useCallback(
    (id: string, dados: DadosAlterarVisita) => setEstado((atual) => alterarVisita(atual, id, dados, HOJE_EXEMPLO)),
    [],
  );
  /** A visita aconteceu (ainda sem negócio): fica na ficha como feita e o passo seguinte é o levantamento. */
  const marcarVisitaComoFeita = useCallback(
    (id: string, nota: string) => setEstado((atual) => marcarVisitaFeita(atual, id, nota, HOJE_EXEMPLO)),
    [],
  );
  /** Guarda o levantamento feito na visita, antes de criar o negócio. */
  const guardarLevantamentoFeito = useCallback(
    (id: string, rascunho: RascunhoLevantamento) => setEstado((atual) => guardarLevantamento(atual, id, rascunho, HOJE_EXEMPLO)),
    [],
  );
  /** A visita acabou e o negócio foi criado a partir dela: sai da ficha e fica registado na atividade. */
  const concluirVisitaFeita = useCallback((id: string) => setEstado((atual) => concluirVisita(atual, id, HOJE_EXEMPLO)), []);
  const mudarOrdem = useCallback((ordem: OrdemPessoa) => setPrefs((p) => ({ ...p, ordem })), []);
  const mudarVista = useCallback((vista: VistaPessoas) => setPrefs((p) => ({ ...p, vista })), []);
  const mudarChip = useCallback((chip: ChipPessoa) => setPrefs((p) => ({ ...p, chip })), []);
  const mudarTipo = useCallback((tipo: TipoPessoa) => setPrefs((p) => ({ ...p, tipo, chip: chipValido(tipo, p.chip) })), []);

  return {
    resumos, submissoes, notas, pendentes, atividade: estado.atividade, prefs: prefsEfetivas, resolver,
    registarChamada: chamar, adiar: adiarContacto, perder: perderLead, reativar: reativarLead, juntarNota: juntarNotaManual, criarLead, marcarVisita: marcarVisitaPedida,
    alterarVisita: alterarVisitaMarcada, concluirVisita: concluirVisitaFeita, marcarVisitaFeita: marcarVisitaComoFeita,
    guardarLevantamento: guardarLevantamentoFeito,
    mudarOrdem, mudarChip, mudarTipo, mudarVista,
  };
}
