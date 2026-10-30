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
 * Os ANEXOS ficam para a fase 2: o cartao de documentos mostra a lista e diz que o envio chega depois.
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

interface PortalFormularioProps {
  dados: PortalLer;
  pagina: 1 | 2;
  aoMudarPagina: (pagina: 1 | 2) => void;
  escrita: EscritaPortal;
}

export function PortalFormulario({ dados, pagina, aoMudarPagina, escrita }: PortalFormularioProps) {
  const { t } = useTranslation();
  // Preenche-se uma so vez, com o que a `ler` trouxe: depois disso quem manda e quem escreve.
  const [rascunho, setRascunho] = useState<RascunhoConvite>(() => rascunhoParaFormulario(dados.rascunho));
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [submetendo, setSubmetendo] = useState(false);
  const [erroSubmissao, setErroSubmissao] = useState<string | null>(null);
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

  const mudarPagina = (destino: 1 | 2) => {
    // Sair de uma pagina grava o que la ficou, sem esperar pelo debounce.
    void gravarJa();
    aoMudarPagina(destino);
  };

  /** Uma recusa do servidor: marca o campo, ou diz o que falta, e leva a pessoa onde ha trabalho. */
  const tratarRecusa = (resultado: ResultadoSubmissao) => {
    const codigo = resultado.codigo ?? "erro_inesperado";
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

    setErroSubmissao(null);
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
            anexos={<PortalDocumentos anexos={dados.anexos} />}
          />
        )}
      </CamposTocadosProvider>

      <PortalEstadoRascunho guardadoEm={escrita.rascunhoGuardadoEm} aGravar={escrita.aGravar} erro={escrita.erroRascunho} />

      {erroSubmissao && (
        <p role="alert" className="text-sm font-medium text-destructive">
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
            {submetendo && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {submetendo ? t("portal.submeter.aSubmeter") : t("hr.convite.submeter")}
          </Button>
        )}
      </div>
    </div>
  );
}
