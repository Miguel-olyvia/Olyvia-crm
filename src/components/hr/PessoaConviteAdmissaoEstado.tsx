/**
 * O estado da admissao, na ficha: um cartao que fica ali, e nao so um toast que
 * se perde.
 *
 * Mostra DOIS selos lado a lado -- o estado da ADMISSAO (os 11 estados da V2) e
 * o do PORTAL (ativo, expirado, revogado, encerrado) -- e a validade do link.
 * Responde ao que o RH pergunta sem ter onde olhar:
 *  - "o convite chegou?" -- enviado para tal e-mail, ou "e-mail nao enviado";
 *  - "ate quando serve?" -- link valido ate tal data, expirado, ou ja nao funciona;
 *  - "porque e que nao avanca?" -- bloqueado por tentativas, ou a ultima
 *    tentativa foi recusada. Quando a recusa foi por um NIF/NISS que ja esta
 *    noutra ficha, diz-se QUAL e abre-se (e o RH que decide se e a mesma
 *    pessoa duplicada ou um engano).
 *
 * ACCOES CONTEXTUAIS (so com `hr.pessoas.convite.enviar`): com processo aberto,
 * Prolongar (convidada, em preenchimento, devolvida), Reenviar convite (portal
 * ativo) e Cancelar; sem processo aberto, nenhuma -- o botao de topo "Enviar
 * convite" e que abre outro. Cancelar desde `aprovada` exige tambem
 * `hr.onboarding.approve`: sem ela o botao fica `aria-disabled`, com o motivo a
 * vista (como "Criar acesso"). REENVIAR (V3a) manda o MESMO link, sem mudar a
 * validade: com o portal expirado fica `aria-disabled`, com o motivo (prolongar
 * primeiro). Substituir o link por um novo (regenerar) e da V3b, e nao existe
 * aqui.
 *
 * So metadados: nunca o token, o rascunho nem o conteudo da submissao. Para
 * quem nao tem `hr.onboarding.restrito`, um processo cancelado ou rejeitado
 * chega mascarado (`terminado`): so se sabe que terminou. Sem convite, ou sem
 * permissao para o ver, o cartao nao aparece.
 */
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ban, CalendarPlus, MailCheck, Send } from "lucide-react";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { fraseDoPortal } from "@/components/hr/admissao/aspectoSelos";
import { SelosAdmissao } from "@/components/hr/admissao/SelosAdmissao";
import { CancelarConviteDialog } from "@/components/hr/CancelarConviteDialog";
import { ProlongarConviteDialog } from "@/components/hr/ProlongarConviteDialog";
import { useTranslation } from "@/hooks/useTranslation";
import { useAcoesConviteAdmissao } from "@/hooks/useAcoesConviteAdmissao";
import { useConviteAdmissaoResumo, type EstadoConviteResumo } from "@/hooks/useConviteAdmissaoResumo";
import { mensagemErroAdmissao } from "@/lib/hr/errosAdmissao";
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";
import { cancelarExigeAprovar, podeCancelar, podeProlongar, processoAberto } from "@/lib/hr/estadoAdmissao";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Liga o botao Cancelar ao texto que explica o bloqueio. */
const ID_RAZAO_CANCELAR = "hr-convite-cancelar-bloqueado";
/** Liga o botao Reenviar convite ao texto que explica o bloqueio (portal expirado). */
const ID_RAZAO_REENVIAR = "hr-convite-reenviar-bloqueado";

interface PessoaConviteAdmissaoEstadoProps {
  pessoaId: string;
  /** `hr.pessoas.convite.enviar`: so quem pode enviar ve Prolongar e Cancelar. */
  podeEnviar: boolean;
  /** `hr.onboarding.approve`: cancelar desde `aprovada` desfaz uma aprovacao. */
  podeAprovar?: boolean;
  /**
   * O estado ja lido por quem monta o cartao (a ficha precisa dele tambem para
   * o botao de topo). Ausente, o cartao le-o por si.
   */
  estado?: EstadoConviteResumo;
}

export function PessoaConviteAdmissaoEstado({
  pessoaId,
  podeEnviar,
  podeAprovar = false,
  estado,
}: PessoaConviteAdmissaoEstadoProps) {
  const { t } = useTranslation();
  const proprio = useConviteAdmissaoResumo(estado ? null : pessoaId);
  const fonte = estado ?? proprio;
  const [prolongarAberto, setProlongarAberto] = useState(false);
  const [cancelarAberto, setCancelarAberto] = useState(false);
  const { reenviar } = useAcoesConviteAdmissao();
  const [aReenviar, setAReenviar] = useState(false);
  const [erroReenviar, setErroReenviar] = useState<string | null>(null);
  // O estado `aReenviar` so muda no render seguinte: a ref impede o segundo clique no mesmo instante.
  const reenvioEmCurso = useRef(false);
  // `conflitosIndisponiveis`: a leitura da ficha em conflito pode ter falhado
  // sem que o cartao inteiro falhe.
  const { semAcesso, erro, resumo, conflitos, conflitosIndisponiveis, recarregar } = fonte;

  // Sem permissao para ver, o cartao nao aparece (esconde-se so o que nao se
  // pode ver). Uma FALHA de leitura e outra coisa: esconder o cartao seria
  // dizer que a pessoa nunca foi convidada, e o RH enviaria outro convite.
  // Mostra-se o erro, com Tentar de novo.
  if (semAcesso) return null;
  if (erro) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6">
          <p role="alert" className="text-sm text-destructive">
            {t("hr.convite.estado.erroCarregar")}
          </p>
          <Button variant="outline" size="sm" className="min-h-11" onClick={recarregar}>
            {t("common.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }
  // So a primeira carga esconde o cartao; uma recarga (cada gravacao da ficha,
  // cada accao) mantem o que ja se sabia em vez de o fazer piscar.
  if (!resumo) return null;

  const desconhecido = resumo.estado === "desconhecido";
  const aberto = processoAberto(resumo.estado) && !desconhecido;
  // O e-mail falhado so interessa enquanto o processo esta aberto.
  const semEmail = aberto && resumo.emailEnviado === false;
  const frase = desconhecido ? t("hr.convite.estado.desconhecido") : fraseDoPortal(t, resumo.estadoPortal, resumo.validUntil);

  const recusa = resumo.estado === "concluida" ? null : resumo.ultimaRecusa;
  const campoDaRecusa = recusa?.codigo === "niss_ja_existe" ? "niss" : "nif";
  const conflito = recusa
    ? (conflitos.find((c) => c.campo === campoDaRecusa) ?? conflitos[0])
    : undefined;

  const conviteId = resumo.conviteId;
  const mostrarProlongar = podeEnviar && conviteId !== null && podeProlongar(resumo.estado, resumo.estadoPortal);
  const mostrarCancelar = podeEnviar && conviteId !== null && podeCancelar(resumo.estado, { podeAprovar: true });
  const cancelarBloqueado = mostrarCancelar && cancelarExigeAprovar(resumo.estado) && !podeAprovar;
  // Reenviar manda o link que ja existe: com o portal expirado nao serve (HRA04), e prolongar e que o repoe.
  const mostrarReenviar =
    podeEnviar && conviteId !== null && aberto && (resumo.estadoPortal === "ativo" || resumo.estadoPortal === "expirado");
  const reenviarBloqueado = mostrarReenviar && resumo.estadoPortal === "expirado";

  const reenviarConvite = async () => {
    if (conviteId === null || reenviarBloqueado || reenvioEmCurso.current) return;
    reenvioEmCurso.current = true;
    setAReenviar(true);
    setErroReenviar(null);
    try {
      const resultado = await reenviar(conviteId);
      if (!resultado.ok) {
        setErroReenviar(resultado.erro);
        return;
      }
      toast.success(
        resumo.emailDestino
          ? t("hr.convite.reenviar.sucesso", { email: resumo.emailDestino })
          : t("hr.convite.reenviar.sucessoSemEmail"),
      );
      recarregar();
    } finally {
      reenvioEmCurso.current = false;
      setAReenviar(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("hr.convite.estado.titulo")}
          {semEmail && (
            <Badge
              variant="outline"
              className="border-amber-500/60 font-normal text-amber-700 dark:text-amber-400"
            >
              {t("hr.convite.emailNaoEnviadoBadge")}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Os dois selos lado a lado: a admissao e o portal sao coisas diferentes. */}
        <SelosAdmissao estado={resumo.estado} estadoPortal={resumo.estadoPortal} />

        {/* Regiao anunciada: prolongar muda esta linha e o leitor de ecra tem de o saber. */}
        {frase && (
          <p role="status" className="text-sm">
            {frase}
          </p>
        )}

        {!desconhecido && resumo.emailDestino && !semEmail && (
          <p className="text-sm text-muted-foreground">
            {t("hr.convite.estado.enviadoPara", { email: resumo.emailDestino })}
          </p>
        )}

        {aberto && resumo.bloqueado && (
          <p className="text-sm text-muted-foreground">{t("hr.convite.estado.bloqueado")}</p>
        )}

        {/* O motivo tecnico do e-mail falhado e para o RH. Vem em bruto do
            servidor de e-mail (nao traduzido): fica atras de um rotulo traduzido. */}
        {semEmail && resumo.emailErro && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">{t("hr.convite.detalheTecnico")}</summary>
            <p lang="en" className="mt-1 break-words">
              {resumo.emailErro}
            </p>
          </details>
        )}

        {recusa && (
          <p className="text-sm text-muted-foreground">
            {conflito ? (
              <>
                {t("hr.convite.estado.recusaDuplicado", {
                  campo: t(conflito.campo === "niss" ? "hr.campos.niss" : "hr.campos.nif"),
                  // Um nome vazio deixava a frase partida ("ficha de .").
                  nome: conflito.nome.trim() || t("hr.convite.estado.recusaOutraFicha"),
                })}{" "}
                <Link
                  to={`/rh/pessoas/${conflito.pessoaId}`}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  {t("hr.convite.estado.abrirFicha")}
                </Link>
              </>
            ) : (
              <>
                {t("hr.convite.estado.ultimaRecusa", {
                  mensagem: mensagemErroAdmissao(t, { error: recusa.codigo, campos: recusa.campos }),
                })}
                {conflitosIndisponiveis && (
                  <>
                    {" "}
                    {t("hr.convite.estado.conflitoIndisponivel")}
                  </>
                )}
              </>
            )}
          </p>
        )}

        {(mostrarProlongar || mostrarReenviar || mostrarCancelar) && (
          <div className="flex flex-wrap items-start gap-2">
            {mostrarProlongar && (
              <Button
                type="button"
                variant="outline"
                className={cn("min-h-11 gap-2", FOCO)}
                onClick={() => setProlongarAberto(true)}
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                {t("hr.convite.prolongar.botao")}
              </Button>
            )}
            {mostrarReenviar && (
              <div className="flex flex-col items-start gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className={cn("min-h-11 gap-2", FOCO, (reenviarBloqueado || aReenviar) && "cursor-not-allowed opacity-50")}
                  aria-disabled={reenviarBloqueado || aReenviar || undefined}
                  aria-describedby={reenviarBloqueado ? ID_RAZAO_REENVIAR : undefined}
                  onClick={() => void reenviarConvite()}
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {t("hr.convite.reenviar.botao")}
                </Button>
                {reenviarBloqueado && (
                  <p id={ID_RAZAO_REENVIAR} className="max-w-xs text-xs text-muted-foreground">
                    {t("hr.convite.reenviar.expirado")}
                  </p>
                )}
              </div>
            )}
            {mostrarCancelar && (
              <div className="flex flex-col items-start gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className={cn("min-h-11 gap-2", FOCO, cancelarBloqueado && "cursor-not-allowed opacity-50")}
                  aria-disabled={cancelarBloqueado || undefined}
                  aria-describedby={cancelarBloqueado ? ID_RAZAO_CANCELAR : undefined}
                  onClick={() => {
                    if (!cancelarBloqueado) setCancelarAberto(true);
                  }}
                >
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  {t("hr.convite.cancelar.botao")}
                </Button>
                {cancelarBloqueado && (
                  <p id={ID_RAZAO_CANCELAR} className="max-w-xs text-xs text-muted-foreground">
                    {t("hr.convite.cancelar.exigeAprovar")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {erroReenviar && (
          <p role="alert" className="text-sm text-destructive">
            {erroReenviar}
          </p>
        )}
      </CardContent>

      {conviteId !== null && (
        <>
          <ProlongarConviteDialog
            open={prolongarAberto}
            onOpenChange={setProlongarAberto}
            conviteId={conviteId}
            validUntil={resumo.validUntil}
            onConcluido={recarregar}
          />
          <CancelarConviteDialog
            open={cancelarAberto}
            onOpenChange={setCancelarAberto}
            conviteId={conviteId}
            onConcluido={recarregar}
          />
        </>
      )}
    </Card>
  );
}
