/**
 * O formulario do portal: a UI do convite que a pessoa ja preenchia (`ConvitePagina1` e
 * `ConvitePagina2`), reutilizada tal como estava, preenchida com o que a accao `ler` devolveu, e que
 * agora GRAVA E SUBMETE (com sessao OTP).
 *
 *  - a origem dos dados: o rascunho vem da `ler`;
 *  - o que e obrigatorio: `campos_obrigatorios` da `ler` (os da posicao "convite" desta organizacao);
 *  - o que se edita: `campos_editaveis` da `ler`, conforme o estado (todos em preenchimento; so os
 *    devolvidos em `devolvida`); a assinatura e a declaracao editam-se sempre que o estado deixa;
 *  - GRAVAR: rascunho automatico (debounce de 3 s, ao mudar de pagina, ao fechar o separador), ver
 *    `useRascunhoAutomatico`. O NISS e o IBAN seguem com o resto e ficam cifrados no cofre; guardados,
 *    o campo mantem o valor visivel ate a pessoa submeter;
 *  - SUBMETER: na pagina 2, valida como o prototipo (assinatura, declaracao, obrigatorios, formato),
 *    leva a pessoa ao campo em falta e, no sucesso, a pagina mostra o ecra de sucesso.
 *
 * Os ANEXOS: o estado dos ficheiros (`useConviteAnexos`) vive aqui, porque a submissao precisa de saber o que
 * falta. So o comprovativo de IBAN esta aberto, e e obrigatorio quando a pessoa indicou um IBAN: sem ele a
 * submissao nem sai (resumo com `role="alert"` e o foco em «Adicionar ficheiro»), e o servidor repete a regra
 * (`anexos_em_falta`). Os ficheiros guardam-se ao serem enviados; os campos so ao gravar (aviso fixo no cartao).
 * Nada do que se escreve sai do browser a nao ser pela Edge; acaba com a sessao: este componente
 * desmonta-se com ela.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CamposTocadosProvider } from "@/components/hr/form/Campos";
import { ConvitePagina1 } from "@/components/hr/convite/ConvitePagina1";
import { ConvitePagina2 } from "@/components/hr/convite/ConvitePagina2";
import { useTranslation } from "@/hooks/useTranslation";
import { useConviteAnexos } from "@/hooks/useConviteAnexos";
import type { EscritaPortal, ResultadoSubmissao } from "@/hooks/useConviteAdmissaoPublico";
import {
  CODIGOS_PAGINA_2,
  campoEhObrigatorio,
  obrigatoriosResolvidos,
  pendenciasDoRascunho,
  type CodigoCampoObrigatorioAdmissao,
} from "@/lib/hr/admissaoObrigatorios";
import type { RascunhoConvite } from "@/lib/hr/conviteAdmissaoPayload";
import { campoDoErroDeServidor, errosDeFormato, type CampoComFormato } from "@/lib/hr/conviteAdmissaoEcra";
import { anexosLigadosDaLer, tiposEmFalta } from "@/lib/hr/conviteAnexos";
import { mensagemErroAdmissao } from "@/lib/hr/errosAdmissao";
import {
  comSensiveisGuardados,
  formularioEditavel,
  mensagemErroPortal,
  rascunhoParaFormulario,
  type PortalLer,
} from "@/lib/hr/portalAdmissao";
import { payloadDaSubmissao } from "@/lib/hr/portalRascunho";
import { PortalDocumentos } from "./PortalDocumentos";
import { PortalEstadoRascunho } from "./PortalEstadoRascunho";
import { useRascunhoAutomatico } from "./useRascunhoAutomatico";

/** O `id` de cada campo com validacao de formato, para saber se ja foi tocado e para lhe levar o foco. */
const ID_DOM_DO_CAMPO: Record<CampoComFormato, string> = {
  nif: "convite-nif",
  niss: "convite-niss",
  conta_numero: "convite-conta-numero",
  conta_bic: "convite-conta-bic",
};

const CAMPOS_COM_FORMATO: readonly string[] = ["nif", "niss", "conta_numero", "conta_bic"];

/** O resumo de erros da submissao: o botao de adicionar ficheiro liga-se a ele (aria-describedby). */
const ID_ALERTA_SUBMISSAO = "portal-erro-submissao";
/** O que um tipo de anexo vindo do servidor pode ser antes de entrar num seletor. */
const FORMATO_TIPO_ANEXO = /^[a-z_]+$/;

interface PortalFormularioProps {
  dados: PortalLer;
  pagina: 1 | 2;
  aoMudarPagina: (pagina: 1 | 2) => void;
  escrita: EscritaPortal;
  /** O token do link: os ficheiros passam pela Edge com ele (e a sessao, que o hook le da memoria). */
  token?: string;
}

export function PortalFormulario({ dados, pagina, aoMudarPagina, escrita, token }: PortalFormularioProps) {
  const { t } = useTranslation();
  // Os ficheiros que o servidor ja tinha ligados ao abrir; o hook adopta-os uma so vez.
  const anexosIniciais = useMemo(() => anexosLigadosDaLer(dados.anexos), [dados.anexos]);
  const anexos = useConviteAnexos(token, anexosIniciais, { aoPerderSessao: escrita.aoPerderSessao });
  const idsIniciais = useMemo(() => new Set(anexosIniciais.map((a) => a.id)), [anexosIniciais]);
  // O cartao so aparece onde a base aceita ficheiros (hr_convite_anexos_abrir: em_preenchimento e devolvida,
  // nao em `convidada`): em preenchimento, ou numa devolucao que pede o comprovativo.
  const mostrarAnexos =
    dados.estado === "em_preenchimento" ||
    (dados.estado === "devolvida" && (dados.documentos_editaveis ?? []).includes("comprovativo_iban"));
  // O que o servidor disse que faltava depois de o ecra achar que nao (anexos_em_falta na submissao).
  const [avisoServidor, setAvisoServidor] = useState<{ tipos: string[]; ids: ReadonlySet<string> } | null>(null);
  // Preenche-se uma so vez, com o que a `ler` trouxe: depois disso quem manda e quem escreve.
  const [rascunho, setRascunho] = useState<RascunhoConvite>(() => rascunhoParaFormulario(dados.rascunho));
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [submetendo, setSubmetendo] = useState(false);
  const [erroSubmissao, setErroSubmissao] = useState<string | null>(null);
  // O erro de submissao que se mostra e o resumo dos anexos em falta (e nao outro): sai quando deixam de faltar.
  const [resumoAnexos, setResumoAnexos] = useState(false);
  // Pedido de foco para «Adicionar ficheiro» (ou, sem cartao, para o resumo): ver o efeito mais abaixo.
  const [pedidoFocoAnexo, setPedidoFocoAnexo] = useState<{ tipo: string; n: number } | null>(null);
  const [erroAssinatura, setErroAssinatura] = useState<string | null>(null);
  const [erroAceite, setErroAceite] = useState<string | null>(null);
  const [errosServidor, setErrosServidor] = useState<Partial<Record<CampoComFormato, string>>>({});
  const formularioRef = useRef<HTMLDivElement>(null);
  const [pedidoFoco, setPedidoFoco] = useState(0);

  const tocar = (campoId: string) =>
    setTocados((anteriores) => (anteriores.has(campoId) ? anteriores : new Set(anteriores).add(campoId)));
  const definir = <K extends keyof RascunhoConvite>(campo: K, valor: RascunhoConvite[K]) => {
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));
    // Mexer num campo tira-lhe o erro que o servidor lhe tinha posto.
    if (CAMPOS_COM_FORMATO.includes(campo)) {
      setErrosServidor((anteriores) => {
        if (!(campo in anteriores)) return anteriores;
        const { [campo as CampoComFormato]: _removido, ...resto } = anteriores;
        return resto;
      });
    }
    if (campo === "assinatura_nome") setErroAssinatura(null);
    if (campo === "aceite") setErroAceite(null);
  };

  const { gravarJa } = useRascunhoAutomatico({ dados, rascunho, definir, escrita, ativo: !submetendo });

  // Os obrigatorios REAIS desta organizacao: os codigos que a `ler` devolveu (posicao "convite"). Uma lista
  // vazia e uma resposta ("nada e obrigatorio"), nunca um motivo para cair na lista fixa.
  const camposObrigatorios = useMemo(
    () => obrigatoriosResolvidos(dados.campos_obrigatorios.map((codigo) => ({ codigo, condicional: false }))),
    [dados.campos_obrigatorios],
  );
  // O NISS e o IBAN guardados no cofre contam como preenchidos (um dos dois, NIF ou NISS, basta).
  const efetivo = useMemo(() => comSensiveisGuardados(rascunho, dados), [rascunho, dados]);
  const obrigatorio = (codigo: CodigoCampoObrigatorioAdmissao): boolean => campoEhObrigatorio(efetivo, codigo, camposObrigatorios);

  // O que falta, so do que a pessoa pode editar (em `devolvida` o resto ja esta na ficha e nao se mostra aqui).
  const pendencias = useMemo(
    () =>
      pendenciasDoRascunho(efetivo, camposObrigatorios).filter(
        (codigo) => dados.estado !== "devolvida" || formularioEditavel(dados, codigo as keyof RascunhoConvite),
      ),
    [efetivo, camposObrigatorios, dados],
  );
  const pendenciasTodas = useMemo(() => new Set<string>(pendencias), [pendencias]);
  const pendenciasPagina1 = pendencias.filter((codigo) => !CODIGOS_PAGINA_2.has(codigo));

  // ANEXOS OBRIGATORIOS. `dados.anexos_obrigatorios` so se le na `ler` (ao abrir): quem abre sem IBAN e depois o
  // escreve (ou o guarda) nao o ve la. Por isso o ecra deriva tambem do que ja sabe: o convite so grava IBAN, por
  // isso um numero de conta escrito, ou `iban_ultimos4` (o IBAN ja no cofre), obriga o comprovativo. O servidor
  // repete a regra (HRA86) e o que ele diz em `anexos_em_falta` entra aqui (`avisoServidor`).
  const ibanIndicado = Boolean(dados.iban_ultimos4) || rascunho.conta_numero.trim() !== "";
  const anexosObrigatorios = useMemo(() => {
    if (!mostrarAnexos) return [];
    const tipos = new Set<string>(dados.anexos_obrigatorios ?? []);
    if (ibanIndicado) tipos.add("comprovativo_iban");
    for (const tipo of avisoServidor?.tipos ?? []) tipos.add(tipo);
    return [...tipos];
  }, [mostrarAnexos, dados.anexos_obrigatorios, ibanIndicado, avisoServidor]);
  const anexosEmFalta = useMemo(() => {
    if (!mostrarAnexos) return [];
    const locais = tiposEmFalta({
      obrigatorios: [...(dados.anexos_obrigatorios ?? []), ...(ibanIndicado ? ["comprovativo_iban"] : [])],
      emFaltaInicial: dados.anexos_em_falta ?? [],
      idsIniciais,
      anexos: anexos.anexos,
    });
    // O que o servidor recusou: so um ficheiro enviado DEPOIS do aviso o resolve.
    const doServidor = (avisoServidor?.tipos ?? []).filter(
      (tipo) => !anexos.anexos.some((a) => a.tipo === tipo && !avisoServidor?.ids.has(a.id)),
    );
    return [...new Set([...locais, ...doServidor])];
  }, [mostrarAnexos, dados.anexos_obrigatorios, dados.anexos_em_falta, ibanIndicado, idsIniciais, anexos.anexos, avisoServidor]);

  // Formato: digito de controlo do NIF/NISS, IBAN, BIC. So se mostra depois de sair do campo (ou ao submeter).
  const errosFormato = useMemo(
    () => errosDeFormato({ nif: rascunho.nif, niss: rascunho.niss, conta_numero: rascunho.conta_numero, conta_bic: rascunho.conta_bic }),
    [rascunho.nif, rascunho.niss, rascunho.conta_numero, rascunho.conta_bic],
  );
  const erroDe = (campoId: keyof RascunhoConvite): string | null => {
    if (CAMPOS_COM_FORMATO.includes(campoId)) {
      const campo = campoId as CampoComFormato;
      if (errosServidor[campo]) return errosServidor[campo] ?? null;
      const chave = errosFormato[campo];
      if (chave && (mostrarTodos || tocados.has(ID_DOM_DO_CAMPO[campo]))) return t(chave);
    }
    if (!mostrarTodos && !tocados.has(campoId)) return null;
    return pendenciasTodas.has(campoId) ? t("hr.convite.erroObrigatorio") : null;
  };

  const editavel = (campo: keyof RascunhoConvite): boolean => formularioEditavel(dados, campo);

  // Com erros, o foco vai para o primeiro campo invalido. Adiado um ciclo: ao mudar de pagina o ecra leva o
  // foco ao topo, e o campo invalido tem de ganhar.
  useEffect(() => {
    if (pedidoFoco === 0) return;
    const id = setTimeout(() => formularioRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
    return () => clearTimeout(id);
  }, [pedidoFoco]);
  const pedirFocoNoErro = () => setPedidoFoco((n) => n + 1);

  // FOCO em «Adicionar ficheiro». Depois de montado e de a mudanca de pagina ter feito o seu (o portal leva o foco
  // ao topo num efeito): dois `requestAnimationFrame` seguidos, nao um `setTimeout(0)`, para este foco ser o ultimo.
  // O pedido gasta-se ao focar. Se o cartao nao esta montado, o foco vai para o resumo (nunca falha em silencio).
  useEffect(() => {
    if (!pedidoFocoAnexo) return;
    let segundo = 0;
    const primeiro = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => {
        const tipo = pedidoFocoAnexo.tipo;
        const botao = FORMATO_TIPO_ANEXO.test(tipo)
          ? formularioRef.current?.querySelector<HTMLElement>(`[data-anexo-adicionar="${tipo}"]`)
          : null;
        (botao ?? document.getElementById(ID_ALERTA_SUBMISSAO))?.focus();
        setPedidoFocoAnexo(null);
      });
    });
    return () => {
      cancelAnimationFrame(primeiro);
      cancelAnimationFrame(segundo);
    };
  }, [pedidoFocoAnexo, pagina]);
  /**
   * O resumo do que falta enviar, no mesmo sitio dos outros erros de submissao (`role="alert"`). `tipos` pode vir do
   * servidor: so entram os que tem o formato de um tipo (^[a-z_]+$), e sem nenhum fica o comprovativo de IBAN.
   * Com `doServidor`, o resumo nao some enquanto nao houver um ficheiro novo, mesmo que o ecra achasse que nada faltava.
   */
  const avisarAnexosEmFalta = (tipos: readonly string[], doServidor = false) => {
    const validos = tipos.filter((tipo) => FORMATO_TIPO_ANEXO.test(tipo));
    const lista = validos.length > 0 ? validos : ["comprovativo_iban"];
    if (doServidor) setAvisoServidor({ tipos: lista, ids: new Set(anexos.anexos.map((a) => a.id)) });
    setResumoAnexos(true);
    setErroSubmissao(mensagemErroAdmissao(t, { error: "anexos_em_falta", campos: lista }));
    setPedidoFocoAnexo((anterior) => ({ tipo: lista[0], n: (anterior?.n ?? 0) + 1 }));
  };
  // Quando o ficheiro que faltava e enviado, o resumo deixa de ser verdade: sai (sem tocar noutros erros).
  useEffect(() => {
    // Sem cartao (nao se pode enviar aqui) o resumo fica: ninguem o pode resolver, e a pessoa tem de o ler.
    if (!resumoAnexos || !mostrarAnexos || anexosEmFalta.length > 0) return;
    setResumoAnexos(false);
    setErroSubmissao(null);
  }, [resumoAnexos, mostrarAnexos, anexosEmFalta]);

  const mudarPagina = (destino: 1 | 2) => {
    // Sair de uma pagina grava o que la ficou, sem esperar pelo debounce.
    void gravarJa();
    aoMudarPagina(destino);
  };

  /** Uma recusa do servidor: marca o campo, ou diz o que falta, e leva a pessoa onde ha trabalho. */
  const tratarRecusa = (resultado: ResultadoSubmissao) => {
    const codigo = resultado.codigo ?? "erro_inesperado";
    // O servidor diz que falta um anexo (a regra e dele; o ecra ja o tinha dito, a menos que o RH tenha mudado algo).
    if (codigo === "anexos_em_falta") {
      mudarPagina(2);
      avisarAnexosEmFalta(resultado.campos ?? [], true);
      return;
    }
    const incompleta = codigo === "admissao_incompleta";
    const mensagem = incompleta ? mensagemErroAdmissao(t, { error: codigo, campos: resultado.campos }) : mensagemErroPortal(t, codigo);
    const campo = campoDoErroDeServidor(codigo);
    if (campo) {
      setErrosServidor((anteriores) => ({ ...anteriores, [campo]: mensagem }));
      mudarPagina(campo === "conta_numero" || campo === "conta_bic" ? 2 : 1);
      pedirFocoNoErro();
      return;
    }
    setErroSubmissao(mensagem);
    if (incompleta) {
      setMostrarTodos(true);
      const primeiro = resultado.campos?.[0];
      if (primeiro) mudarPagina(CODIGOS_PAGINA_2.has(primeiro as CodigoCampoObrigatorioAdmissao) ? 2 : 1);
      pedirFocoNoErro();
    }
  };

  const submeter = async () => {
    if (submetendo) return;
    // A assinatura e a declaracao pedem-se sempre; o erro fica junto do campo.
    const faltaAssinatura = rascunho.assinatura_nome.trim() === "";
    const faltaAceite = !rascunho.aceite;
    setErroAssinatura(faltaAssinatura ? t("hr.convite.erro.assinatura") : null);
    setErroAceite(faltaAceite ? t("hr.convite.erroObrigatorio") : null);
    if (faltaAssinatura || faltaAceite) {
      pedirFocoNoErro();
      return;
    }
    // Faltar um obrigatorio, ou um numero com formato errado, nao e erro de servidor: mostra-se onde falta.
    if (pendencias.length > 0) {
      setMostrarTodos(true);
      setErroSubmissao(t("hr.convite.erroObrigatorio"));
      if (pendenciasPagina1.length > 0) mudarPagina(1);
      pedirFocoNoErro();
      return;
    }
    if (Object.keys(errosFormato).length > 0) {
      setMostrarTodos(true);
      setErroSubmissao(null);
      mudarPagina(errosFormato.nif || errosFormato.niss ? 1 : 2);
      pedirFocoNoErro();
      return;
    }

    // Ficheiros ainda a enviar (ou a remover): a submissao espera, senao o ficheiro nao entrava.
    if (anexos.emCurso) {
      setErroSubmissao(t("hr.convite.anexos.aguardarEnvio"));
      return;
    }
    // Comprovativo obrigatorio por enviar: nem se pede ao servidor.
    if (anexosEmFalta.length > 0) {
      avisarAnexosEmFalta(anexosEmFalta);
      return;
    }

    setErroSubmissao(null);
    setResumoAnexos(false);
    setSubmetendo(true);
    const resultado = await escrita.submeter(payloadDaSubmissao(dados, rascunho), rascunho.assinatura_nome);
    setSubmetendo(false);
    if (!resultado.ok) tratarRecusa(resultado);
  };

  const propsPagina = { t, rascunho, definir, erroDe, obrigatorio, editavel };

  return (
    <div ref={formularioRef} className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("portal.formulario.aviso")}</p>
      {dados.estado === "devolvida" && <p className="text-sm font-medium">{t("portal.formulario.bloqueados")}</p>}

      <CamposTocadosProvider onTocar={tocar} rotuloObrigatorio={t("hr.campos.obrigatorio")}>
        {pagina === 1 && <ConvitePagina1 {...propsPagina} />}
        {pagina === 2 && (
          <ConvitePagina2
            {...propsPagina}
            erroAssinatura={erroAssinatura}
            erroAceite={erroAceite}
            anexos={
              mostrarAnexos ? (
                <PortalDocumentos
                  estado={anexos}
                  obrigatorios={anexosObrigatorios}
                  idAlerta={resumoAnexos ? ID_ALERTA_SUBMISSAO : undefined}
                  bloqueado={submetendo}
                />
              ) : null
            }
          />
        )}
      </CamposTocadosProvider>

      <PortalEstadoRascunho guardadoEm={escrita.rascunhoGuardadoEm} aGravar={escrita.aGravar} erro={escrita.erroRascunho} />

      {erroSubmissao && (
        <p id={ID_ALERTA_SUBMISSAO} tabIndex={-1} role="alert" className="text-sm font-medium text-destructive">
          {erroSubmissao}
        </p>
      )}

      <div className="flex justify-between">
        {pagina === 2 ? (
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => mudarPagina(1)} disabled={submetendo}>
            {t("hr.convite.anterior")}
          </Button>
        ) : (
          <span />
        )}
        {pagina === 1 && (
          <Button type="button" className="min-h-11" onClick={() => mudarPagina(2)}>
            {t("hr.convite.seguinte")}
          </Button>
        )}
        {pagina === 2 && (
          <Button type="button" className="min-h-11" onClick={() => void submeter()} disabled={submetendo}>
            {submetendo && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {submetendo ? t("portal.submeter.aSubmeter") : t("hr.convite.submeter")}
          </Button>
        )}
      </div>
    </div>
  );
}
