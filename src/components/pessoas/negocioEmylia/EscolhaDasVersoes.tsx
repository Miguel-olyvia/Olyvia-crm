// 23/11: a escolha das versões de idioma da proposta no passo do negócio (só quando o template tem versões). Aparece em dois sítios com
// a MESMA escolha: por cima da folha («Versão da proposta a ver») e no envio ao portal («Idiomas a enviar ao portal»), onde também se
// diz se a gravação do idioma falhou (e que por isso a proposta não foi enviada).
import { SeletorIdiomaDocumento } from "@/components/idiomaDocumento/SeletorIdiomaDocumento";
import { useTranslation } from "@/hooks/useTranslation";
import type { FalhaDoIdioma, VersoesDaPropostaNoPasso } from "./versoesDaPropostaNoPasso";

interface EscolhaDasVersoesProps {
  v: VersoesDaPropostaNoPasso;
  sitio: "folha" | "envio";
}

function mensagemDaFalha(f: FalhaDoIdioma, t: (k: string, p?: Record<string, string>) => string): string {
  if (f.tipo === "sem-utilizador") return t("contractTemplates.versoes.passo.falhaUtilizador");
  if (f.tipo === "sem-permissao") return t("contractTemplates.versoes.passo.falhaPermissao");
  return t("contractTemplates.versoes.passo.falhaErro", { erro: f.detalhe });
}

/** Sem versões não desenha nada (e não lê as traduções: o passo continua a desenhar-se como sempre). */
export function EscolhaDasVersoes(props: EscolhaDasVersoesProps) {
  return props.v.temVersoes ? <ComVersoes {...props} /> : null;
}

function ComVersoes({ v, sitio }: EscolhaDasVersoesProps) {
  const { t } = useTranslation();
  const folha = sitio === "folha";
  return (
    <div className="space-y-2" data-testid={`versoes-da-proposta-${sitio}`}>
      <SeletorIdiomaDocumento
        disponiveis={v.disponiveis} valor={v.escolha} onChange={v.mudar}
        rotulo={t(folha ? "contractTemplates.versoes.passo.rotuloVer" : "contractTemplates.versoes.passo.rotuloEnviar")}
      />
      <p className="text-sm text-muted-foreground">{t(folha ? "contractTemplates.versoes.passo.ajudaVer" : "contractTemplates.versoes.passo.ajudaEnviar")}</p>
      {!folha && v.aGravar && <p role="status" className="text-sm text-muted-foreground">{t("contractTemplates.versoes.passo.aGravar")}</p>}
      {!folha && v.falha && <p role="alert" className="text-[15px] text-destructive">{mensagemDaFalha(v.falha, t)}</p>}
    </div>
  );
}
