/**
 * "Nova pessoa" num painel lateral (Sheet) igual à ficha de Pessoas: meio ecrã (todo em ecrã estreito), cabeçalho com migalhas
 * e selo "Novo · por gravar", seis abas sublinhadas e rodapé fixo. Ao abrir, o foco vai para o nome; Esc, Cancelar ou Fechar
 * fecham e devolvem o foco a quem abriu.
 *
 * COM ALTERAÇÕES POR GRAVAR, NADA FECHA O PAINEL SEM PERGUNTAR: o Esc, Cancelar, Fechar e um clique fora abrem a mesma
 * confirmação («Descartar a nova pessoa?»), e só «Descartar» fecha. Sem alterações fecham logo. E A CRIAR, nada fecha: Cancelar,
 * Esc e o clique fora são ignorados até a criação (a ficha, os satélites e os anexos) acabar, senão o painel fechava, limpava os
 * ficheiros escolhidos e deixava o envio dos anexos a meio.
 *
 * Grava com o `criarPessoa` REAL (a ficha, os satélites, a ligação a uma conta, tudo por secções: uma que falhe NÃO desfaz a
 * ficha, diz-se por escrito qual). Os ficheiros escolhidos seguem DEPOIS de a ficha existir, e uma falha de anexo também não
 * a desfaz. «Criar e enviar convite» cria e abre o envio do convite com o e-mail pessoal escrito aqui (o link só se mostra uma
 * vez, e o diálogo que o mostra é o mesmo da ficha); só quando ele fecha se segue para a ficha, para não lha tirar de debaixo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EnviarConviteDialog } from "@/components/rh-exemplo/EnviarConviteDialog";
import { useAnexosNovaPessoa } from "@/components/rh-exemplo/hooks/useAnexosNovaPessoa";
import { useDevolverFoco } from "@/components/rh-exemplo/hooks/useDevolverFoco";
import type { NaoGravado, NovaPessoaExemplo, ResultadoCriacao } from "@/components/rh-exemplo/hooks/usePessoas";
import { CabecalhoNova } from "@/components/rh-exemplo/novaPessoa/CabecalhoNova";
import { FormularioNovaPessoa, type DadosParaCriar } from "@/components/rh-exemplo/novaPessoa/FormularioNovaPessoa";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

interface NovaPessoaDialogoProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  colegas: Array<{ id: string; nome_completo: string }>;
  onCriar: (dados: NovaPessoaExemplo) => Promise<ResultadoCriacao>;
  /** Abre a ficha da pessoa criada (ou da que já existia, ao travar um duplicado). */
  onCriada: (id: string) => void;
}

export function NovaPessoaDialogo({ open, onOpenChange, colegas, onCriar, onCriada }: NovaPessoaDialogoProps) {
  const { t } = useTranslation();
  const conteudo = useRef<HTMLDivElement>(null);
  const origem = useRef<HTMLElement | null>(null);
  const criou = useRef(false);
  /** «Descartar» foi escolhido: o painel fecha e é o painel (não o aviso) que devolve o foco a quem o abriu. */
  const descartou = useRef(false);
  const sujo = useRef(false);
  /** Uma criação está em curso. Síncrono (um `useState` só muda no render seguinte): dois cliques seguidos não criam duas vezes. */
  const emCurso = useRef(false);
  const anexos = useAnexosNovaPessoa();
  const [aCriar, setACriar] = useState(false);
  const [aConfirmarDescarte, setAConfirmarDescarte] = useState(false);
  /** Ao fechar o aviso sem descartar, o foco volta a quem o tinha (o campo ou o botão Cancelar), não ao BODY. */
  const devolverFocoDoAviso = useDevolverFoco(aConfirmarDescarte);
  /** A ficha acabou de ser criada com «Criar e enviar convite»: o envio abre a seguir, e só ao fechar se segue para a ficha. */
  const [conviteDaNova, setConviteDaNova] = useState<{ pessoaId: string; email: string } | null>(null);

  const sujar = useCallback(() => { sujo.current = true; }, []);

  // O painel pode ser fechado de fora (por exemplo, a organização ativa mudou): os ficheiros escolhidos não ficam para a próxima.
  useEffect(() => {
    if (open) return;
    setAConfirmarDescarte(false);
    if (!emCurso.current) anexos.limpar();
  }, [open, anexos.limpar]); // eslint-disable-line react-hooks/exhaustive-deps

  const fechar = () => {
    anexos.limpar();
    onOpenChange(false);
  };

  /** Um pedido para fechar (Esc, Cancelar, Fechar, clique fora): a criar ignora-se; com alterações pergunta-se; senão fecha. */
  const pedirFecho = () => {
    if (emCurso.current) return;
    if (sujo.current) setAConfirmarDescarte(true);
    else fechar();
  };

  const mudarAberto = (aberto: boolean) => {
    if (aberto) onOpenChange(true);
    else pedirFecho();
  };

  /** Sucesso, secções que não ficaram gravadas, e o que o formulário recolheu mas não tem onde gravar. */
  const anunciarResultado = (
    falhas: ResultadoCriacao["falhas"], falhasAnexos: ReadonlyArray<{ seccao: string }>, naoGravado: NaoGravado[],
  ) => {
    const pendenciaDeAcesso = falhas.some((f) => f.seccao === "acesso");
    const reais = [...falhas.filter((f) => f.seccao !== "acesso"), ...falhasAnexos];
    // Não há falha silenciosa: diz-se quais as secções que não ficaram gravadas, e a ficha fica criada e editável.
    if (reais.length === 0) toast.success(t("hr.sucesso.criada"));
    else toast.error(`${t("hr.form.criadaComFalhas")} ${reais.map((f) => t(`hr.form.seccoes.${f.seccao}`)).join(", ")}`);
    // O acesso pedido não se cria aqui: conclui-se na ficha («Criar acesso»), com as pendências à vista.
    if (pendenciaDeAcesso) toast.warning(t("hr.acesso.convitePendente"));
    if (naoGravado.length > 0) {
      toast.warning(`${t("rhNova.naoGravado")} ${naoGravado.map((c) => t(`rhNova.naoGravado.${c}`)).join(", ")}`);
    }
  };

  const criar = async ({ dados, comConvite }: DadosParaCriar) => {
    if (emCurso.current) return;
    emCurso.current = true;
    setACriar(true);
    try {
      const { id, falhas, naoGravado } = await onCriar(dados);
      // Os ficheiros seguem depois de a ficha existir; nunca a desfazem.
      const falhasAnexos = await anexos.enviar(id);
      anunciarResultado(falhas, falhasAnexos, naoGravado);

      const email = dados.payload.nucleo.email_pessoal;
      if (comConvite && email === null) toast.warning(t("hr.form.conviteNaoAberto.semEmail"));
      criou.current = true;
      anexos.limpar();
      onOpenChange(false);
      if (comConvite && email) setConviteDaNova({ pessoaId: id, email });
      else onCriada(id);
    } catch (e) {
      // Recusa total: nada foi criado. O painel fica aberto com o que se escreveu, e o erro diz-se.
      toast.error(await getFriendlyErrorMessage(e, t("hr.erros.guardar")));
    } finally {
      emCurso.current = false;
      setACriar(false);
    }
  };

  const abrirFichaExistente = (pessoaId: string) => {
    if (emCurso.current) return;
    anexos.limpar();
    onOpenChange(false);
    onCriada(pessoaId);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={mudarAberto}>
        <SheetContent
          ref={conteudo}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            sujo.current = false;
            criou.current = false;
            descartou.current = false;
            origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            conteudo.current?.querySelector<HTMLElement>("#hr-novo-primeiro-nome")?.focus();
          }}
          // O Esc e um clique fora passam pela mesma regra que Cancelar: a criar ignoram-se, com alterações perguntam.
          onInteractOutside={(e) => { e.preventDefault(); pedirFecho(); }}
          onEscapeKeyDown={(e) => { e.preventDefault(); pedirFecho(); }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (!criou.current && origem.current?.isConnected) origem.current.focus();
          }}
          className="flex w-full flex-col gap-0 p-0 sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden"
        >
          <CabecalhoNova />
          <FormularioNovaPessoa
            colegas={colegas} anexos={anexos} aCriar={aCriar} aoCriar={(dados) => void criar(dados)}
            aoCancelar={pedirFecho} aoSujar={sujar}
            aoAbrirFichaExistente={abrirFichaExistente}
          />

          {/* Dentro do painel (na mesma árvore React): o foco e os cliques do diálogo não contam como «fora» do painel. */}
          <AlertDialog open={aConfirmarDescarte} onOpenChange={setAConfirmarDescarte}>
            <AlertDialogContent
              onCloseAutoFocus={(e) => {
                if (descartou.current) e.preventDefault();
                else devolverFocoDoAviso(e);
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>{t("rhNova.descartar.titulo")}</AlertDialogTitle>
                <AlertDialogDescription>{t("rhNova.descartar.descricao")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11">{t("rhNova.descartar.continuar")}</AlertDialogCancel>
                <AlertDialogAction className="min-h-11" onClick={() => { descartou.current = true; setAConfirmarDescarte(false); fechar(); }}>
                  {t("rhNova.descartar.confirmar")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SheetContent>
      </Sheet>

      {/* O envio do convite da ficha acabada de criar. Fica fora do painel (que já fechou e limpou o formulário): é a sua
          própria raiz de diálogo. Fechar (com ou sem envio) segue para a ficha, como se o painel tivesse terminado agora. */}
      <EnviarConviteDialog
        open={conviteDaNova !== null}
        onOpenChange={(aberto) => {
          if (aberto || conviteDaNova === null) return;
          const { pessoaId } = conviteDaNova;
          setConviteDaNova(null);
          onCriada(pessoaId);
        }}
        pessoaId={conviteDaNova?.pessoaId ?? ""}
        emailSugerido={conviteDaNova?.email ?? null}
      />
    </>
  );
}
