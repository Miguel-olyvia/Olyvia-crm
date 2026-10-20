// A orquestração da «Nova lead» de Pessoas: valida, verifica duplicados (fail-closed), cria uma pessoa NOVA com a sua lead ou mostra o
// diálogo de duplicados (Abrir existente, Atualizar dados com confirmação, Cancelar). Substitui o handleCreateLead e os três handlers do
// diálogo de duplicados de Leads. Em cada sucesso refaz as listas e a ficha e entrega o id da pessoa; numa falha não invalida nada.
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useTranslation } from "@/hooks/useTranslation";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO } from "../errosNeg";
import { invalidarPessoas } from "../invalidarPessoas";
import { useFontePessoas } from "../useFontePessoas";
import { AtualizacaoParcial, atualizarPessoaExistente, type PassoAtualizar } from "./atualizarPessoaExistente";
import { resolverOrgRaiz } from "./comerciaisNovaLead";
import { depoisDeGravar } from "./depoisNovaLead";
import { prepararLead, type DefinicaoCampo, type LeadPreparada } from "./fluxoNovaLead";
import { FalhaGravar, gravarNovaLead } from "./gravarNovaLead";
import { revalidarAntesDeCriar } from "./revalidarNovaLead";
import type { DecisaoDuplicados, PessoaBloqueio } from "./tiposNovaLead";

const N = "pessoasPagina.real.newLead.";

export interface EntradaNovaLead {
  base: DefinicaoCampo[];
  campanha: DefinicaoCampo[];
  valores: Record<string, unknown>;
  origemId: string | null;
  /** O nome da origem escolhida, ou «manual». */
  origemNome: string;
  campanhaId: string | null;
}

/** O que o hospedeiro faz quando acaba: fecha o diálogo, abre a ficha da pessoa e anuncia a mensagem. */
export interface ConclusaoNovaLead {
  entityId: string;
  mensagem: string;
}

export type Bloqueio = Extract<DecisaoDuplicados, { tipo: "bloquear" }>;
/** Um erro a mostrar dentro do diálogo (role=alert), com a chave traduzida e o que «Tentar de novo» repete. */
export interface ErroDialogo {
  tipo: "verificar" | "atualizar";
  chave: string;
}
export interface Parcial {
  feito: PassoAtualizar[];
  falhou: PassoAtualizar;
  chave: string;
}

export interface UseNovaLead {
  aCriar: boolean;
  duplicados: Bloqueio | null;
  /** A pessoa cuja atualização espera confirmação (segundo ecrã do diálogo). */
  confirmar: PessoaBloqueio | null;
  erro: ErroDialogo | null;
  parcial: Parcial | null;
  /** A mensagem de cada campo inválido, por chave do campo (o formulário marca-os e liga a mensagem ao campo). */
  errosCampo: Record<string, string>;
  submeter: (entrada: EntradaNovaLead) => Promise<void>;
  atualizar: (pessoa: PessoaBloqueio) => void;
  confirmarAtualizar: () => Promise<void>;
  voltarDaConfirmacao: () => void;
  abrirExistente: (pessoa: PessoaBloqueio) => void;
  cancelarDuplicados: () => void;
  tentarDeNovo: () => Promise<void>;
  reiniciar: () => void;
}

interface Pendente {
  entrada: EntradaNovaLead;
  preparada: LeadPreparada;
}

export function useNovaLead(aoConcluir: (conclusao: ConclusaoNovaLead) => void): UseNovaLead {
  const { t } = useTranslation();
  const { toast } = useToast();
  const client = useQueryClient();
  const fonte = useFontePessoas();
  const { anewUserId, authUserId } = usePermissionScope();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;

  const [aCriar, setACriar] = useState(false);
  const [duplicados, setDuplicados] = useState<Bloqueio | null>(null);
  const [confirmar, setConfirmar] = useState<PessoaBloqueio | null>(null);
  const [erro, setErro] = useState<ErroDialogo | null>(null);
  const [parcial, setParcial] = useState<Parcial | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});
  // Um clique duplo (ou Enter e clique) não pode dar duas criações: a guarda é um ref, que não espera por um novo render.
  const emCurso = useRef(false);
  const pendente = useRef<Pendente | null>(null);
  const ultima = useRef<"criar" | "atualizar" | null>(null);
  const raizes = useRef(new Map<string, string>());

  const reiniciar = useCallback(() => {
    setDuplicados(null);
    setConfirmar(null);
    setErro(null);
    setParcial(null);
    setErrosCampo({});
    setACriar(false);
    pendente.current = null;
    ultima.current = null;
  }, []);

  const raizDe = useCallback(async (org: string): Promise<string> => {
    const guardada = raizes.current.get(org);
    if (guardada) return guardada;
    const raiz = await resolverOrgRaiz(org);
    raizes.current.set(org, raiz);
    return raiz;
  }, []);

  const falha = useCallback(async (titulo: string, causa: unknown) => {
    toast({ title: titulo, description: await getFriendlyErrorMessage(causa), variant: "destructive" });
  }, [toast]);

  const submeter = useCallback(async (entrada: EntradaNovaLead): Promise<void> => {
    if (emCurso.current) return;
    if (!organizationId) {
      toast({ title: t(`${N}toast.createError`), description: t(`${N}toast.noOrg`), variant: "destructive" });
      return;
    }
    const createdBy = anewUserId || authUserId;
    if (!createdBy) {
      toast({ title: t(`${N}toast.createError`), description: t(`${N}toast.noUser`), variant: "destructive" });
      return;
    }
    const preparada = prepararLead({ base: entrada.base, campanha: entrada.campanha, valores: entrada.valores });
    if (preparada.erros.length > 0) {
      setErrosCampo(Object.fromEntries(preparada.erros.map((e) => [e.fieldKey, e.message])));
      toast({ title: t(`${N}toast.missingRequired`), description: preparada.erros.map((e) => e.message).join(", "), variant: "destructive" });
      return;
    }
    emCurso.current = true;
    setACriar(true);
    setErro(null);
    setErrosCampo({});
    ultima.current = "criar";
    pendente.current = { entrada, preparada };
    try {
      // A verificação e a escrita seguem-se sem espera: esta é também a revalidação imediatamente antes de gravar (fail-closed).
      const decisao = await revalidarAntesDeCriar(organizationId, preparada.escrito);
      if (decisao.tipo === "bloquear") {
        setDuplicados(decisao);
        return;
      }
      const gravada = await gravarNovaLead({
        organizationId,
        rootOrganizationId: await raizDe(organizationId),
        dados: preparada.dados,
        valores: preparada.valores,
        origemId: entrada.origemId,
        origemNome: entrada.origemNome,
        campanhaId: entrada.campanhaId,
      });
      const depois = await depoisDeGravar({ entityId: gravada.entityId, organizationId, actorId: createdBy, valores: preparada.valores });
      // Um só toast: o `use-toast` guarda um de cada vez e o seguinte apagava o anterior (a falha da morada nunca se via). O motivo em bruto
      // da falha fica no captureFlowError (depoisDeGravar); nunca vai para o ecrã.
      const avisoGrupo = decisao.grupo.length > 0
        ? t(`${N}groupInfo`, { org: decisao.grupo.map((g) => g.nome).filter(Boolean).join(", ") })
        : undefined;
      toast({
        title: t(depois.moradaFalhou ? `${N}toast.addressSyncFailed` : `${N}toast.createSuccess`),
        description: avisoGrupo,
        duration: depois.moradaFalhou || avisoGrupo ? 10000 : undefined,
      });
      void invalidarPessoas(client, organizationId, gravada.entityId);
      const criada = t(`${N}announce.created`, { name: preparada.dados.displayName });
      // A morada que falhou também se anuncia na região viva da página (o toast pode não ser lido).
      aoConcluir({ entityId: gravada.entityId, mensagem: depois.moradaFalhou ? `${criada} ${t(`${N}announce.addressSyncFailed`)}` : criada });
    } catch (causa) {
      if (causa instanceof ErroNeg) {
        // Não se conseguiu verificar: não se cria nada. A mensagem genérica passa a dizer o que aconteceu de verdade.
        setErro({ tipo: "verificar", chave: causa.chave === CHAVE_ERRO_GENERICO ? `${N}error.checkFailed` : causa.chave });
      } else if (causa instanceof FalhaGravar) {
        if (causa.limpezaFalhou) toast({ title: t(`${N}toast.cleanupIncomplete`), description: t(`${N}toast.cleanupIncompleteDesc`), variant: "destructive" });
        else await falha(t(`${N}toast.createError`), causa.causa);
      } else {
        await falha(t(`${N}toast.createError`), causa);
      }
    } finally {
      emCurso.current = false;
      setACriar(false);
    }
  }, [organizationId, anewUserId, authUserId, t, toast, client, aoConcluir, raizDe, falha]);

  const atualizar = useCallback((pessoa: PessoaBloqueio) => {
    if (!pessoa.atualizar) return;
    setErro(null);
    setParcial(null);
    setConfirmar(pessoa);
  }, []);

  const voltarDaConfirmacao = useCallback(() => {
    setConfirmar(null);
    setErro(null);
    setParcial(null);
  }, []);

  const confirmarAtualizar = useCallback(async (): Promise<void> => {
    const pessoa = confirmar;
    const dados = pendente.current;
    if (emCurso.current || !pessoa?.atualizar || !dados || !organizationId) return;
    emCurso.current = true;
    setACriar(true);
    setErro(null);
    setParcial(null);
    ultima.current = "atualizar";
    try {
      const r = await atualizarPessoaExistente({
        organizationId, entityId: pessoa.entityId, escrito: dados.preparada.escrito, valores: dados.preparada.valores, plano: pessoa.atualizar,
      });
      if (r.tipo === "conflito") {
        // Apareceu outra pessoa dona do contacto: volta ao diálogo, com ela. Nada se gravou.
        setConfirmar(null);
        if (r.decisao.tipo === "bloquear") setDuplicados(r.decisao);
        return;
      }
      toast({ title: t(`${N}dup.updated`, { name: pessoa.nome }) });
      void invalidarPessoas(client, organizationId, pessoa.entityId);
      aoConcluir({ entityId: pessoa.entityId, mensagem: t(`${N}announce.updated`, { name: pessoa.nome }) });
    } catch (causa) {
      if (causa instanceof AtualizacaoParcial) {
        // Alguma coisa ficou gravada: refaz o que se vê. Repetir é seguro.
        void invalidarPessoas(client, organizationId, pessoa.entityId);
        setParcial({ feito: [...causa.feito], falhou: causa.falhou, chave: causa.erro.chave });
      } else if (causa instanceof ErroNeg) {
        setErro({ tipo: "atualizar", chave: causa.chave === CHAVE_ERRO_GENERICO ? `${N}dup.checkFailed` : causa.chave });
      } else {
        await falha(t(`${N}toast.updateError`), causa);
      }
    } finally {
      emCurso.current = false;
      setACriar(false);
    }
  }, [confirmar, organizationId, t, toast, client, aoConcluir, falha]);

  const abrirExistente = useCallback((pessoa: PessoaBloqueio) => {
    aoConcluir({ entityId: pessoa.entityId, mensagem: "" });
  }, [aoConcluir]);

  const cancelarDuplicados = useCallback(() => {
    setDuplicados(null);
    setConfirmar(null);
    setErro(null);
    setParcial(null);
  }, []);

  const tentarDeNovo = useCallback(async (): Promise<void> => {
    const antes = ultima.current;
    setErro(null);
    if (antes === "atualizar") await confirmarAtualizar();
    else if (antes === "criar" && pendente.current) await submeter(pendente.current.entrada);
  }, [confirmarAtualizar, submeter]);

  return { aCriar, duplicados, confirmar, erro, parcial, errosCampo, submeter, atualizar, confirmarAtualizar, voltarDaConfirmacao, abrirExistente, cancelarDuplicados, tentarDeNovo, reiniciar };
}
