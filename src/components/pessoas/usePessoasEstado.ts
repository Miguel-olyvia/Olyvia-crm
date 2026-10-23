// O estado local da página "Pessoas": as pessoas, as pendentes, as notas e a atividade vivem só em memória (nada
// persiste, ao recarregar volta tudo ao exemplo) e as preferências de tipo, chip, ordem e vista em localStorage. Os registos de cada pessoa
// (contactos, visitas e levantamentos) vivem no store de `negocio-metas` (`registosPessoa.ts`), porque o negócio os liga a si. Não há pedidos.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  atualizarVisita, guardarVisitasELevantamento, ligarRegisto, registarContacto, registarVisita, useRegistosPessoa,
} from "@/components/negocio-metas/registosPessoa";
import { resultadoEncerra } from "@/components/negocio-metas/registosTipos";
import { encerrarAbordagem, reativarAbordagem, type PedidoEncerrar } from "./acoesEncerrar";
import { adiar, chamadaAplicavel, juntarNota, reativar, registarChamada, type DadosChamada } from "./acoesPessoa";
import {
  levantamentoGuardado, resultadoDaVisitaRegistado, visitaAlterada, visitaMarcada, visitasFeitas, type DadosResultadoVisita,
} from "./acoesVisitaPessoa";
import { contactoDaChamada, visitaDaChamada } from "./chamadaPassos";
import type { DadosNovaLead } from "./novaLead";
import { pessoasNovas, registarLead } from "./pessoasNovas";
import { useNegociosDasPessoas } from "./useNegociosDasPessoas";
import { chipValido } from "./filtrosPessoas";
import { juntarPessoas } from "./juntarPessoas";
import { PESSOAS_EXEMPLO, SUBMISSOES_EXEMPLO } from "./pessoasExemplo";
import { guardarPrefsPessoas, lerPrefsPessoas, type PreferenciasPessoas } from "./preferenciasPessoas";
import type { ChipPessoa, EstadoPessoas, OrdemPessoa, ResultadoEncerramento, TipoPessoa, VistaPessoas } from "./pessoasTipos";
import { REGISTOS_EXEMPLO } from "./registosExemplo";
import { marcarVoltaAAbordagem, pessoaDaSubmissao, pessoasQueVoltaram, resolverSubmissao } from "./resolverSubmissao";
import { alterarVisitaDaPessoa, visitaNova, type DadosVisitaPessoa } from "./visitaDaPessoa";
import type { DadosAlterarVisita } from "./visitaPessoa";
import type { DadosGuardarRegistos } from "@/components/negocio-metas/guardarRegistos";

/** O estado de partida: o exemplo e as leads criadas até agora (que sobrevivem à navegação, ver `pessoasNovas.ts`). */
function estadoInicial(): EstadoPessoas {
  const novas = pessoasNovas();
  return { submissoes: SUBMISSOES_EXEMPLO, notas: [], pessoas: [...PESSOAS_EXEMPLO, ...novas.pessoas], atividade: [...novas.atividade], contactadas: [] };
}

/** O que o painel «Visita e levantamento» guarda (o dia de hoje sabe-o o estado). */
export type PedidoGuardarRegistos = Omit<DadosGuardarRegistos, "hoje">;

/** Os dados da página e as ações que os mudam. `podeVerSubmissoes` esconde tudo o que vem de submissões. */
export function usePessoasEstado(podeVerSubmissoes: boolean) {
  const [estado, setEstado] = useState<EstadoPessoas>(estadoInicial);
  const registos = useRegistosPessoa(REGISTOS_EXEMPLO);
  const negocios = useNegociosDasPessoas();
  const [prefs, setPrefs] = useState<PreferenciasPessoas>(lerPrefsPessoas);
  useEffect(() => guardarPrefsPessoas(prefs), [prefs]);

  const resumos = useMemo(
    () => juntarPessoas(estado.pessoas, negocios, HOJE_EXEMPLO, registos),
    [estado.pessoas, negocios, registos],
  );
  // As ações leem o estado e os resumos de agora (e não os do render em que foram criadas): escrevem no store dos registos, que não pode
  // acontecer dentro de uma atualização de estado do React.
  const atual = useRef({ estado, resumos, registos });
  atual.current = { estado, resumos, registos };
  const mudar = useCallback((f: (e: EstadoPessoas) => EstadoPessoas) => {
    const seguinte = f(atual.current.estado);
    atual.current = { ...atual.current, estado: seguinte };
    setEstado(seguinte);
  }, []);
  const resumoDe = useCallback((id: string) => atual.current.resumos.find((r) => r.pessoa.id === id), []);
  const pessoaDe = useCallback((id: string) => atual.current.estado.pessoas.find((p) => p.id === id), []);
  const visitasDe = useCallback((id: string) => atual.current.registos.visitas.filter((v) => v.pessoaId === id), []);

  const submissoes = useMemo(() => (podeVerSubmissoes ? estado.submissoes : []), [podeVerSubmissoes, estado.submissoes]);
  const pendentes = useMemo(
    () => pessoasQueVoltaram({ pessoas: estado.pessoas, contactadas: estado.contactadas }, submissoes),
    [estado.pessoas, estado.contactadas, submissoes],
  );
  const notas = useMemo(() => (podeVerSubmissoes ? estado.notas : []), [podeVerSubmissoes, estado.notas]);
  const prefsEfetivas = useMemo(() => ({ ...prefs, chip: chipValido(prefs.tipo, prefs.chip) }), [prefs]);

  /** Resolver uma submissão: a nota fica na ficha e a pessoa volta à abordagem (Parte 1 do Quadro) se o último negócio dela é anterior. */
  const resolver = useCallback((submissaoId: string, pessoaId?: string) => {
    const s = atual.current.estado.submissoes.find((x) => x.id === submissaoId);
    const destino = s ? pessoaDaSubmissao(s, pessoaId) : null;
    mudar((e) => {
      const resolvido = resolverSubmissao(e, submissaoId, pessoaId);
      return destino && resolvido !== e ? marcarVoltaAAbordagem(resolvido, destino, HOJE_EXEMPLO) : resolvido;
    });
  }, [mudar]);

  /** Registar a chamada: a pessoa e a atividade mudam, e o contacto (e a visita, se a chamada a marca) ficam nos registos da pessoa. */
  const chamar = useCallback((id: string, dados: Omit<DadosChamada, "hoje">) => {
    const completos: DadosChamada = { ...dados, hoje: HOJE_EXEMPLO, temNegocioAberto: (resumoDe(id)?.abertos.length ?? 0) > 0 };
    const pessoa = pessoaDe(id);
    if (!pessoa || !chamadaAplicavel(atual.current.estado, id, completos)) return;
    registarContacto(contactoDaChamada(id, completos));
    const visita = visitaDaChamada(pessoa, completos, visitasDe(id));
    if (visita) registarVisita(visita.visita);
    mudar((e) => registarChamada(e, id, completos));
  }, [mudar, resumoDe, pessoaDe, visitasDe]);

  const adiarContacto = useCallback((id: string, dias: 1 | 3 | 7) => {
    const vemDeVisita = resumoDe(id)?.proximoDeVisita ?? false;
    mudar((e) => adiar(e, id, dias, HOJE_EXEMPLO, vemDeVisita));
  }, [mudar, resumoDe]);

  /** Encerra a abordagem (sem interesse, ou obra inviável): fica o resultado e o motivo na pessoa e não se cria negócio. */
  const encerrar = useCallback((id: string, dados: PedidoEncerrar) => {
    const temNegocioAberto = (resumoDe(id)?.abertos.length ?? 0) > 0;
    mudar((e) => encerrarAbordagem(e, id, { ...dados, hoje: HOJE_EXEMPLO, temNegocioAberto }));
  }, [mudar, resumoDe]);

  /** Reativa a abordagem encerrada (ou, numa lead perdida do exemplo antigo, reativa a lead). */
  const reativarPessoa = useCallback((id: string) => {
    mudar((e) => (e.pessoas.find((p) => p.id === id)?.encerrada ? reativarAbordagem(e, id, HOJE_EXEMPLO) : reativar(e, id, HOJE_EXEMPLO)));
  }, [mudar]);
  const juntarNotaManual = useCallback((id: string, texto: string) => mudar((e) => juntarNota(e, id, texto, HOJE_EXEMPLO)), [mudar]);

  /** Cria a lead (Por contactar), guarda-a e devolve-a, para a página lhe abrir a ficha. */
  const criarLead = useCallback((dados: DadosNovaLead) => {
    const lead = registarLead(dados, HOJE_EXEMPLO);
    mudar((e) => ({ ...e, pessoas: [...e.pessoas, lead.pessoa], atividade: [...lead.atividade, ...e.atividade] }));
    return lead.pessoa;
  }, [mudar]);

  /**
   * Marca uma visita à pessoa (fica nos registos dela, por ligar). Com `negocioId` (marcada a partir do negócio) fica logo ligada a ele,
   * mas só se for um negócio ABERTO da mesma pessoa; senão fica por ligar. Devolve `false` quando se pediu um negócio e a visita ficou por
   * ligar (quem chama avisa o utilizador); `true` quando ficou onde se pediu; `undefined` quando não se registou nenhuma visita.
   */
  const marcarVisita = useCallback((pessoaId: string, dados: DadosVisitaPessoa, negocioId?: string): boolean | undefined => {
    const pessoa = pessoaDe(pessoaId);
    if (!pessoa || pessoa.perdida || pessoa.encerrada) return undefined;
    const nova = visitaNova(pessoa, dados, visitasDe(pessoaId), HOJE_EXEMPLO);
    if (!nova) return undefined;
    const registada = registarVisita({ ...nova.visita, pessoaId });
    const ligavel = !negocioId || (resumoDe(pessoaId)?.abertos.some((n) => n.id === negocioId) ?? false);
    if (negocioId && ligavel) ligarRegisto({ tipo: "visita", id: registada.id }, negocioId);
    mudar((e) => visitaMarcada(e, pessoaId, nova.detalhe, HOJE_EXEMPLO));
    return ligavel;
  }, [mudar, pessoaDe, visitasDe, resumoDe]);

  /** Muda o dia, a hora e a morada de uma visita da pessoa. */
  const alterarVisita = useCallback((visitaId: string, dados: DadosAlterarVisita) => {
    const visita = atual.current.registos.visitas.find((v) => v.id === visitaId);
    const pessoa = visita && pessoaDe(visita.pessoaId);
    if (!visita || !pessoa) return;
    const alterada = alterarVisitaDaPessoa(pessoa, visita, dados, HOJE_EXEMPLO);
    if (!alterada) return;
    atualizarVisita(visitaId, () => alterada.visita);
    mudar((e) => visitaAlterada(e, visita.pessoaId, alterada.detalhe, HOJE_EXEMPLO));
  }, [mudar, pessoaDe]);

  /** Guarda as visitas e o levantamento da pessoa numa só gravação (uma visita feita pede linhas de medidas só se houver linhas por acabar). */
  const guardarRegistos = useCallback((pessoaId: string, dados: PedidoGuardarRegistos) => {
    if (!pessoaDe(pessoaId)) return;
    const r = guardarVisitasELevantamento(pessoaId, { ...dados, hoje: HOJE_EXEMPLO });
    mudar((e) => levantamentoGuardado(visitasFeitas(e, pessoaId, r.passaramAFeita, HOJE_EXEMPLO), pessoaId, r.levantamentoMudou, HOJE_EXEMPLO));
  }, [mudar, pessoaDe]);

  /**
   * O resultado de uma visita: interessado ou a pensar (a abordagem segue) ou, sem interesse / obra inviável, que encerra a abordagem com
   * o motivo (sem motivo, ou com um negócio aberto, não se grava nada). Um resultado implica a visita feita.
   */
  const registarResultadoVisita = useCallback((visitaId: string, dados: DadosResultadoVisita) => {
    const visita = atual.current.registos.visitas.find((v) => v.id === visitaId);
    if (!visita || !pessoaDe(visita.pessoaId)) return;
    const { pessoaId } = visita;
    if (resultadoEncerra(dados.resultado)) {
      if (!dados.motivo) return;
      const temNegocioAberto = (resumoDe(pessoaId)?.abertos.length ?? 0) > 0;
      const encerrado = encerrarAbordagem(atual.current.estado, pessoaId, {
        resultado: dados.resultado as ResultadoEncerramento, motivo: dados.motivo, motivoOutro: dados.motivoOutro, hoje: HOJE_EXEMPLO, temNegocioAberto,
      });
      if (encerrado === atual.current.estado) return;
    }
    atualizarVisita(visitaId, (v) => ({ ...v, estado: v.estado === "cancelada" ? v.estado : "feita", resultado: dados.resultado }));
    mudar((e) => {
      const registado = resultadoDaVisitaRegistado(e, pessoaId, dados.resultado, HOJE_EXEMPLO);
      if (!resultadoEncerra(dados.resultado) || !dados.motivo) return registado;
      return encerrarAbordagem(registado, pessoaId, {
        resultado: dados.resultado, motivo: dados.motivo, motivoOutro: dados.motivoOutro, hoje: HOJE_EXEMPLO,
      });
    });
  }, [mudar, pessoaDe, resumoDe]);

  const mudarOrdem = useCallback((ordem: OrdemPessoa) => setPrefs((p) => ({ ...p, ordem })), []);
  const mudarVista = useCallback((vista: VistaPessoas) => setPrefs((p) => ({ ...p, vista })), []);
  const mudarChip = useCallback((chip: ChipPessoa) => setPrefs((p) => ({ ...p, chip })), []);
  const mudarTipo = useCallback((tipo: TipoPessoa) => setPrefs((p) => ({ ...p, tipo, chip: chipValido(tipo, p.chip) })), []);

  return {
    resumos, submissoes, notas, pendentes, atividade: estado.atividade, registos, prefs: prefsEfetivas, resolver,
    registarChamada: chamar, adiar: adiarContacto, encerrar, reativar: reativarPessoa, juntarNota: juntarNotaManual, criarLead,
    marcarVisita, alterarVisita, guardarRegistos, registarResultadoVisita, mudarOrdem, mudarChip, mudarTipo, mudarVista,
  };
}
