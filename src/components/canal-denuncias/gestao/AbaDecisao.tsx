// Aba «Decisão»: concluir com resultado, medidas e fundamentação, ou arquivar com motivo. Depois de decidida, mostra a decisão
// (reabrir fica no cabeçalho do painel).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { Campo } from "../comum/Campo";
import { arquivarDenuncia, concluirDenuncia } from "../dados/loja";
import { MIN_MOTIVO_ARQUIVO, erroDe, type ErroAcao } from "../lib/acoes";
import { dataHora } from "../lib/datas";
import { estaEmTratamento } from "../lib/estados";
import { RESULTADOS, type Denuncia, type ResultadoDenuncia } from "../lib/tipos";

function DecisaoTomada({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  if (d.decisao) {
    return (
      <dl className="space-y-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">{t("cd.decisao.resultado")}</dt><dd className="font-medium">{t(`cd.resultado.${d.decisao.resultado}`)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("cd.decisao.medidas")}</dt><dd className="whitespace-pre-line">{d.decisao.medidas || "—"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("cd.decisao.fundamentacao")}</dt><dd className="whitespace-pre-line">{d.decisao.fundamentacao}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("cd.decisao.em")}</dt><dd>{dataHora(d.decisao.em)}</dd></div>
      </dl>
    );
  }
  return (
    <dl className="space-y-3 text-sm">
      <div><dt className="text-xs text-muted-foreground">{t("cd.decisao.motivoArquivo")}</dt><dd className="whitespace-pre-line">{d.motivoArquivo}</dd></div>
    </dl>
  );
}

function FormConcluir({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const [resultado, setResultado] = useState<ResultadoDenuncia | "">("");
  const [medidas, setMedidas] = useState("");
  const [fundamentacao, setFundamentacao] = useState("");
  const [erro, setErro] = useState<ErroAcao | null>(null);
  const pode = estaEmTratamento(d.estado);

  const concluir = (): void => {
    const r = concluirDenuncia(d.id, { resultado, medidas, fundamentacao });
    setErro(erroDe(r));
  };
  const msg = (k: ErroAcao) => (erro === k ? t(`cd.erroAcao.${k}`) : undefined);

  return (
    <section aria-labelledby="den-concluir" className="space-y-3">
      <h3 id="den-concluir" className="text-sm font-semibold">{t("cd.decisao.concluirTitulo")}</h3>
      {!pode && <p className="text-xs text-muted-foreground">{t("cd.decisao.confirmaPrimeiro")}</p>}
      <Campo id="den-resultado" rotulo={t("cd.decisao.resultado")} obrigatorio erro={msg("resultado_em_falta")}>
        {(a) => (
          <NativeSelect {...a} className="h-11" value={resultado} placeholder={t("cd.decisao.escolherResultado")} disabled={!pode}
            options={RESULTADOS.map((r) => ({ value: r, label: t(`cd.resultado.${r}`) }))} onValueChange={(v) => setResultado(v as ResultadoDenuncia)} />
        )}
      </Campo>
      <Campo id="den-medidas" rotulo={t("cd.decisao.medidas")}>
        {(a) => <Textarea {...a} rows={3} disabled={!pode} value={medidas} onChange={(e) => setMedidas(e.target.value)} />}
      </Campo>
      <Campo id="den-fundamentacao" rotulo={t("cd.decisao.fundamentacao")} obrigatorio erro={msg("fundamentacao_em_falta")}>
        {(a) => <Textarea {...a} rows={4} disabled={!pode} value={fundamentacao} onChange={(e) => setFundamentacao(e.target.value)} />}
      </Campo>
      {erro === "transicao_invalida" && <p role="alert" className="text-sm text-destructive">{t("cd.erroAcao.transicao_invalida")}</p>}
      <Button type="button" className="min-h-11" disabled={!pode} onClick={concluir}>{t("cd.decisao.concluir")}</Button>
    </section>
  );
}

function FormArquivar({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState(false);

  const arquivar = (): void => setErro(!arquivarDenuncia(d.id, motivo).ok);

  return (
    <section aria-labelledby="den-arquivar" className="space-y-3 border-t pt-4">
      <h3 id="den-arquivar" className="text-sm font-semibold">{t("cd.decisao.arquivarTitulo")}</h3>
      <Campo id="den-motivo" rotulo={t("cd.decisao.motivoArquivo")} ajuda={t("cd.decisao.motivoAjuda", { min: MIN_MOTIVO_ARQUIVO })} erro={erro ? t("cd.erroAcao.motivo_curto") : undefined}>
        {(a) => <Input {...a} value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(false); }} />}
      </Campo>
      <Button type="button" variant="outline" className="min-h-11" onClick={arquivar}>{t("cd.decisao.arquivar")}</Button>
    </section>
  );
}

export function AbaDecisao({ d }: { d: Denuncia }) {
  if (d.decisao || d.motivoArquivo) return <DecisaoTomada d={d} />;
  return (
    <div className="space-y-4">
      <FormConcluir d={d} />
      <FormArquivar d={d} />
    </div>
  );
}
