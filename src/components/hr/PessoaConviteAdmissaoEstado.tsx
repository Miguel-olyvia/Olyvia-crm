/**
 * O estado do convite de admissao, na ficha: um cartao que fica ali, e nao so
 * um toast que se perde.
 *
 * Responde a tres perguntas que o RH faz sem ter onde olhar:
 *  - "o convite chegou?" -- enviado para tal e-mail, valido ate tal data; ou
 *    "e-mail nao enviado" (com Reenviar, porque o link da primeira vez ja nao
 *    volta a aparecer);
 *  - "a pessoa ja preencheu?" -- preenchido e assinado em tal data;
 *  - "porque e que nao avanca?" -- expirou, foi bloqueado por tentativas, ou a
 *    ultima tentativa foi recusada. Quando a recusa foi por um NIF/NISS que ja
 *    esta noutra ficha, diz-se QUAL e abre-se (e o RH que decide se e a mesma
 *    pessoa duplicada ou um engano).
 *
 * So metadados: nunca o token, o rascunho nem o conteudo da submissao. Um
 * convite substituido por outro mais recente nao se mostra (o mais recente e
 * que conta). Sem convite, ou sem permissao para o ver, o cartao nao aparece.
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MailCheck, Send } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useConviteAdmissaoResumo,
  type EstadoConviteResumo,
} from "@/hooks/useConviteAdmissaoResumo";
import { mensagemErroAdmissao } from "@/lib/hr/errosAdmissao";
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";

interface PessoaConviteAdmissaoEstadoProps {
  pessoaId: string;
  /** `hr.pessoas.convite.enviar`: so quem pode enviar ve o botao Reenviar. */
  podeEnviar: boolean;
  onReenviar: () => void;
  /**
   * O estado ja lido por quem monta o cartao (a ficha precisa dele tambem para
   * recarregar depois de reenviar). Ausente, o cartao le-o por si.
   */
  estado?: EstadoConviteResumo;
}

export function PessoaConviteAdmissaoEstado({
  pessoaId,
  podeEnviar,
  onReenviar,
  estado,
}: PessoaConviteAdmissaoEstadoProps) {
  const { t } = useTranslation();
  const proprio = useConviteAdmissaoResumo(estado ? null : pessoaId);
  const fonte = estado ?? proprio;
  // `conflitosIndisponiveis`: a leitura da ficha em conflito pode ter falhado
  // sem que o cartao inteiro falhe.
  const { semAcesso, erro, resumo, conflitos, conflitosIndisponiveis, recarregar } = fonte;

  // Sem permissao para ver, o cartao nao aparece (esconde-se so o que nao se
  // pode ver). Uma FALHA de leitura e outra coisa: esconder o cartao seria
  // dizer que a pessoa nunca foi convidada, e o RH enviaria outro convite --
  // que revoga o anterior. Mostra-se o erro, com Tentar de novo.
  if (semAcesso) return null;
  if (erro) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6">
          <p role="alert" className="text-sm text-destructive">
            {t("hr.convite.estado.erroCarregar")}
          </p>
          <Button variant="outline" size="sm" onClick={recarregar}>
            {t("common.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }
  // So a primeira carga esconde o cartao; uma recarga (cada gravacao da ficha,
  // cada reenvio) mantem o que ja se sabia em vez de o fazer piscar.
  if (!resumo) return null;
  // Um convite substituido nao e o estado actual: o mais recente e que conta.
  if (resumo.estado === "substituido") return null;

  // So um convite `pendente` conta como "e-mail nao enviado": no desconhecido
  // nao se sabe se ha um convite a meio, e reenviar revogava-o.
  const semEmail = resumo.estado === "pendente" && resumo.emailEnviado === false;
  const podeReenviar =
    podeEnviar && (semEmail || resumo.estado === "expirado" || resumo.estado === "bloqueado");

  const recusa = resumo.estado === "usado" ? null : resumo.ultimaRecusa;
  const campoDaRecusa = recusa?.codigo === "niss_ja_existe" ? "niss" : "nif";
  const conflito = recusa
    ? (conflitos.find((c) => c.campo === campoDaRecusa) ?? conflitos[0])
    : undefined;

  const linhaDeEstado = (): string => {
    switch (resumo.estado) {
      case "usado":
        return t("hr.convite.estado.usado", { data: formatarDataHora(resumo.usadoEm) });
      case "expirado":
        return t("hr.convite.estado.expirado", { data: formatarDataHora(resumo.validUntil) });
      case "bloqueado":
        return t("hr.convite.estado.bloqueado");
      case "desconhecido":
        // Nao se sabe: nao se diz "enviado" nem se oferece reenviar.
        return t("hr.convite.estado.desconhecido");
      default:
        return semEmail
          ? t("hr.convite.estado.pendenteSemEmail", { data: formatarDataHora(resumo.validUntil) })
          : t("hr.convite.estado.pendente", {
              email: resumo.emailDestino ?? "",
              data: formatarDataHora(resumo.validUntil),
            });
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
        {/* Regiao anunciada: reenviar muda esta linha e o leitor de ecra tem de o saber. */}
        <p role="status" className="text-sm">
          {linhaDeEstado()}
        </p>

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

        {podeReenviar && (
          <Button variant="outline" size="sm" className="gap-2" onClick={onReenviar}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {t("hr.convite.reenviar")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
