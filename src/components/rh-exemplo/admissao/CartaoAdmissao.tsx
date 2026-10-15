// O cartão «Admissão» da Visão geral da ficha: o estado, o prazo do login temporário, o role previsto, o que o RH devolveu ou
// a pessoa recusou, as ações certas para cada estado e o histórico. O botão de credenciais fica desligado, com a razão em
// texto, até o contrato estar assinado. Nenhum e-mail sai: tudo é simulação, dita no próprio cartão. Só memória.
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useAdmissao } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { usePapeisDaOrganizacao } from "@/components/rh-exemplo/hooks/usePapeisDaOrganizacao";
import { acoesPossiveis, estadoVisivel, prazoDoLogin, type AcaoAdmissao, type Admissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { formatarDataHora } from "@/components/rh-exemplo/lib/conviteAdmissaoEcra";
import { rotuloDeCampoAdmissao } from "@/components/rh-exemplo/rotuloCampoAdmissao";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { EstadoAdmissaoChip } from "./aspeto";
import { dataEHora, textoPrazo } from "./auxiliares";
import { codigoDoRotulo } from "./dadosSubmetidos";
import { HistoricoAdmissao } from "./HistoricoAdmissao";
import { useAcoesAdmissao, type AcaoUi } from "./useAcoesAdmissao";

const PARA_UI: Record<AcaoAdmissao, AcaoUi | null> = {
  convidar: null, abrir: null, retomar: null, submeter: null, recusarContrato: null, assinarContrato: null,
  devolver: "devolver", rejeitar: "rejeitar", aprovar: "aprovar", gerarContrato: "gerarContrato", reenviarContrato: "reenviarContrato",
  anularContrato: "anularContrato", enviarCredenciais: "enviarCredenciais", ativarAcesso: "simularAcesso",
  renovarLogin: "renovarLogin", reenviarLink: "reenviarLink",
};
const PRINCIPAIS: readonly AcaoUi[] = ["rever", "gerarContrato", "enviarCredenciais", "renovarLogin"];
/** Estados em que o botão de credenciais ainda não pode funcionar (aparece desligado, com a razão). */
const SEM_CREDENCIAIS_AINDA = ["convite_enviado", "a_preencher", "submetida", "devolvida", "aprovada", "contrato_por_assinar"];

function acoesDoCartao(adm: Admissao, agora: Date): AcaoUi[] {
  const lista = acoesPossiveis(adm, agora).map((a) => PARA_UI[a]).filter((a): a is AcaoUi => a !== null);
  return adm.estado === "submetida" && estadoVisivel(adm, agora) !== "expirado" ? ["rever", ...lista] : lista;
}

function Notas({ adm, agora }: { adm: Admissao; agora: Date }) {
  const { t } = useTranslation();
  const comentarios = Object.entries(adm.comentarios);
  return (
    <div className="space-y-2 text-sm">
      {comentarios.length > 0 && (adm.estado === "devolvida" || adm.estado === "a_preencher") && (
        <div>
          <p className="font-medium">{t("rhAdm.cartao.devolvidoComentarios")}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {comentarios.map(([campo, texto]) => (
              <li key={campo}><span className="font-medium text-foreground">{rotuloDeCampoAdmissao(t, codigoDoRotulo(campo))}:</span> {texto}</li>
            ))}
          </ul>
        </div>
      )}
      {adm.motivoRejeicao && <p>{t("rhAdm.cartao.rejeitada", { motivo: adm.motivoRejeicao })}</p>}
      {adm.contrato?.recusa && estadoVisivel(adm, agora) !== "acesso_ativo" && (
        <p role="status">{t("rhAdm.cartao.contratoRecusado", { motivo: adm.contrato.recusa.motivo })}</p>
      )}
      {adm.estado === "acesso_ativo" && adm.credenciais?.ativoEm && (
        <p>{t("rhAdm.cartao.acessoAtivo", { data: formatarDataHora(adm.credenciais.ativoEm) })}</p>
      )}
    </div>
  );
}

function Resumo({ adm, agora }: { adm: Admissao; agora: Date }) {
  const { t } = useTranslation();
  const { papeis } = usePapeisDaOrganizacao();
  const prazo = prazoDoLogin(adm, agora);
  const termina = dataEHora(adm.login.expiraEm);
  const papel = papeis.find((p) => p.id === adm.roleId)?.name ?? t("rhAdm.credenciais.semRole");
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      {prazo.tipo !== "sem" && (
        <>
          <dt className="text-muted-foreground">{t("rhAdm.cartao.login")}</dt>
          <dd className={cn(estadoVisivel(adm, agora) === "expirado" && "font-medium text-destructive")}>
            {textoPrazo(t, prazo)} · {t("rhAdm.cartao.termina", { data: termina.data, hora: termina.hora })}
          </dd>
        </>
      )}
      <dt className="text-muted-foreground">{t("rhAdm.cartao.roleprevisto")}</dt>
      <dd>{papel}</dd>
    </dl>
  );
}

interface BotoesProps {
  adm: Admissao;
  agora: Date;
  executar: (pessoaId: string, acao: AcaoUi) => void;
}

/** As ações do estado; e, até haver contrato assinado, o botão de credenciais desligado com a razão em texto. */
function Botoes({ adm, agora, executar }: BotoesProps) {
  const { t } = useTranslation();
  const semCredenciais = SEM_CREDENCIAIS_AINDA.includes(adm.estado);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {acoesDoCartao(adm, agora).map((acao) => (
          <Button
            key={acao} type="button" size="sm" className={cn("min-h-11", FOCO, acao === "rejeitar" && "text-destructive")}
            variant={PRINCIPAIS.includes(acao) ? "default" : "outline"} onClick={() => executar(adm.pessoaId, acao)}
          >
            {t(`rhAdm.acao.${acao}`)}
          </Button>
        ))}
        {semCredenciais && (
          <Button type="button" size="sm" variant="outline" className="min-h-11" disabled aria-describedby="rh-adm-cred-razao">
            {t("rhAdm.acao.enviarCredenciais")}
          </Button>
        )}
      </div>
      {semCredenciais && <p id="rh-adm-cred-razao" className="text-xs text-muted-foreground">{t("rhAdm.credenciais.razao")}</p>}
    </>
  );
}

export function CartaoAdmissao({ pessoaId }: { pessoaId: string }) {
  const { t } = useTranslation();
  const adm = useAdmissao(pessoaId);
  const { executar, dialogos, mensagem } = useAcoesAdmissao();
  if (!adm) return null;
  const agora = agoraExemplo();

  return (
    <Card aria-labelledby="rh-adm-cartao-titulo">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle id="rh-adm-cartao-titulo" className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("rhAdm.cartao.titulo")}
        </CardTitle>
        <EstadoAdmissaoChip estado={estadoVisivel(adm, agora)} />
      </CardHeader>
      <CardContent className="space-y-3">
        <Resumo adm={adm} agora={agora} />
        <Notas adm={adm} agora={agora} />
        <Botoes adm={adm} agora={agora} executar={executar} />
        <p role="status" className="min-h-5 text-sm">{mensagem}</p>
        <HistoricoAdmissao eventos={adm.historico} />
        <p className="text-xs text-muted-foreground">{t("rhAdm.simulacao.geral")}</p>
      </CardContent>
      {dialogos}
    </Card>
  );
}
