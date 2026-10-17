// O estado local da página "Pessoas": as pessoas, as pendentes, as notas e a atividade vivem só em memória (nada
// persiste, ao recarregar volta tudo ao exemplo) e as preferências de tipo, chip, ordem e vista em localStorage.
import { useCallback, useEffect, useMemo, useState } from "react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  alterarVisitaDoPedido, criarPedidoGuardado, guardarPedido, marcarVisitaDaPessoa, removerPedido, type DadosGuardarPedido,
  type DadosVisitaPedido, type EscolhaPedido,
} from "./acoesPedido";
import { adiar, juntarNota, perder, reativar, registarChamada, type ContextoPerda, type DadosChamada } from "./acoesPessoa";
import type { DadosNovaLead } from "./novaLead";
import type { DadosPedido } from "./pedidoNegocio";
import { pessoasNovas, registarLead } from "./pessoasNovas";
import type { DadosAlterarVisita } from "./visitaPessoa";
import { useNegociosDasPessoas } from "./useNegociosDasPessoas";
import { chipValido } from "./filtrosPessoas";
import { juntarPessoas } from "./juntarPessoas";
import { PEDIDOS_EXEMPLO } from "./pedidosDeExemplo";
import { PESSOAS_EXEMPLO, SUBMISSOES_EXEMPLO } from "./pessoasExemplo";
import { guardarPrefsPessoas, lerPrefsPessoas, type PreferenciasPessoas } from "./preferenciasPessoas";
import type { ChipPessoa, EstadoPessoas, MotivoPerda, OrdemPessoa, TipoPessoa, VistaPessoas } from "./pessoasTipos";
import { pessoasQueVoltaram, resolverSubmissao } from "./resolverSubmissao";

/** O estado de partida: o exemplo e as leads criadas até agora (que sobrevivem à navegação, ver `pessoasNovas.ts`). */
function estadoInicial(): EstadoPessoas {
  const novas = pessoasNovas();
  return {
    submissoes: SUBMISSOES_EXEMPLO, notas: [], pessoas: [...PESSOAS_EXEMPLO, ...novas.pessoas], atividade: [...novas.atividade], contactadas: [],
    pedidos: [...PEDIDOS_EXEMPLO, ...novas.pedidos],
  };
}

/** Os dados da página e as ações que os mudam. `podeVerSubmissoes` esconde tudo o que vem de submissões. */
export function usePessoasEstado(podeVerSubmissoes: boolean) {
  const [estado, setEstado] = useState<EstadoPessoas>(estadoInicial);
  const negocios = useNegociosDasPessoas();
  const [prefs, setPrefs] = useState<PreferenciasPessoas>(lerPrefsPessoas);
  useEffect(() => guardarPrefsPessoas(prefs), [prefs]);

  const resumos = useMemo(
    () => juntarPessoas(estado.pessoas, negocios, HOJE_EXEMPLO, estado.pedidos),
    [estado.pessoas, estado.pedidos, negocios],
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
    setEstado((atual) => ({
      ...atual, pessoas: [...atual.pessoas, lead.pessoa], atividade: [...lead.atividade, ...atual.atividade], pedidos: [...atual.pedidos, lead.pedido],
    }));
    return lead.pessoa;
  }, []);
  /** Marca uma visita à pessoa: no pedido indicado, no primeiro ainda sem visita, ou num pedido novo (ver `marcarVisitaDaPessoa`). */
  const marcarVisitaPedida = useCallback(
    (pessoaId: string, escolha: EscolhaPedido, dados: DadosVisitaPedido) =>
      setEstado((atual) => marcarVisitaDaPessoa(atual, pessoaId, escolha, dados, HOJE_EXEMPLO)),
    [],
  );
  /** Muda o dia, a hora e a morada de uma visita de um pedido. */
  const alterarVisitaMarcada = useCallback(
    (pedidoId: string, visitaId: string, dados: DadosAlterarVisita) =>
      setEstado((atual) => alterarVisitaDoPedido(atual, pedidoId, visitaId, dados, HOJE_EXEMPLO)),
    [],
  );
  /** Guarda as visitas e o levantamento de um pedido numa só gravação (uma visita feita pede linhas de medidas). */
  const guardarPedidoFeito = useCallback(
    (pedidoId: string, dados: DadosGuardarPedido) => setEstado((atual) => guardarPedido(atual, pedidoId, dados, HOJE_EXEMPLO)),
    [],
  );
  /** Cria o pedido da pessoa já com as visitas e o levantamento (só fica criado se se guardam). */
  const criarPedidoComVisitas = useCallback(
    (dados: DadosPedido, guardar: DadosGuardarPedido) => setEstado((atual) => criarPedidoGuardado(atual, dados, guardar, HOJE_EXEMPLO)),
    [],
  );
  /** O negócio criado a partir do pedido substitui-o: o pedido sai. */
  const removerPedidoFeito = useCallback((pedidoId: string) => setEstado((atual) => removerPedido(atual, pedidoId)), []);
  const mudarOrdem = useCallback((ordem: OrdemPessoa) => setPrefs((p) => ({ ...p, ordem })), []);
  const mudarVista = useCallback((vista: VistaPessoas) => setPrefs((p) => ({ ...p, vista })), []);
  const mudarChip = useCallback((chip: ChipPessoa) => setPrefs((p) => ({ ...p, chip })), []);
  const mudarTipo = useCallback((tipo: TipoPessoa) => setPrefs((p) => ({ ...p, tipo, chip: chipValido(tipo, p.chip) })), []);

  return {
    resumos, submissoes, notas, pendentes, atividade: estado.atividade, pedidos: estado.pedidos, prefs: prefsEfetivas, resolver,
    registarChamada: chamar, adiar: adiarContacto, perder: perderLead, reativar: reativarLead, juntarNota: juntarNotaManual, criarLead, marcarVisita: marcarVisitaPedida,
    alterarVisita: alterarVisitaMarcada, guardarPedido: guardarPedidoFeito, criarPedidoComVisitas, removerPedido: removerPedidoFeito,
    mudarOrdem, mudarChip, mudarTipo, mudarVista,
  };
}
