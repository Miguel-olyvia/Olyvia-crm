/**
 * Situacao pessoal: incapacidade e adaptacoes do posto de trabalho.
 *
 * Vive em `pessoas_dados_saude`, uma tabela separada de propósito -- e dado de
 * saude (art. 9.o do RGPD) e nao partilha linha com dados administrativos. As
 * permissoes `hr.pessoas.saude.view` e `.edit` estao marcadas is_dangerous na
 * base e a intencao e que nenhum papel as receba por omissao.
 *
 * O cartao nao aparece sequer a quem nao tem a permissao de leitura: nao se
 * mostra uma moldura vazia a dizer "sem acesso" em cima de cada campo
 * sensivel, porque isso ja e informacao (revela que a pessoa tem ficha de
 * saude). Quem chama decide se o renderiza.
 *
 * NAO ha aqui diagnosticos nem patologias: os campos sao a percentagem de
 * incapacidade, a validade do comprovativo e as adaptacoes necessarias.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HeartPulse, Loader2, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import type { PessoaDadosSaude } from "@/types/hr";

interface PessoaSaudeCardProps {
  saude: PessoaDadosSaude | null;
  /** `hr.pessoas.saude.edit` na organizacao da pessoa. */
  podeEditar: boolean;
  saving: boolean;
  onGuardar: (patch: Partial<PessoaDadosSaude>) => Promise<string | null>;
}

export function PessoaSaudeCard({ saude, podeEditar, saving, onGuardar }: PessoaSaudeCardProps) {
  const { t } = useTranslation();
  const [incapacidade, setIncapacidade] = useState("");
  const [validade, setValidade] = useState("");
  const [adaptacoes, setAdaptacoes] = useState("");
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    setIncapacidade(
      saude?.incapacidade_percentagem === null || saude?.incapacidade_percentagem === undefined
        ? ""
        : String(saude.incapacidade_percentagem),
    );
    setValidade(saude?.incapacidade_comprovativo_valido_ate ?? "");
    setAdaptacoes(saude?.necessidades_adaptacao ?? "");
    setAlterado(false);
  }, [saude]);

  const gravar = async () => {
    const percentagem = incapacidade.trim() === "" ? null : Number(incapacidade);
    if (percentagem !== null && (Number.isNaN(percentagem) || percentagem < 0 || percentagem > 100)) {
      toast.error(t("hr.campos.incapacidade"));
      return;
    }
    const erro = await onGuardar({
      incapacidade_percentagem: percentagem,
      incapacidade_comprovativo_valido_ate: validade.trim() || null,
      necessidades_adaptacao: adaptacoes.trim() || null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setAlterado(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartPulse className="h-4 w-4 text-muted-foreground" />
          {t("hr.pessoais.situacao")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("hr.saude.aviso")}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hr-incapacidade">{t("hr.campos.incapacidade")}</Label>
            <Input
              id="hr-incapacidade"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={incapacidade}
              disabled={!podeEditar}
              onChange={(e) => {
                setIncapacidade(e.target.value);
                setAlterado(true);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-incapacidade-validade">{t("hr.campos.incapacidadeValidade")}</Label>
            <Input
              id="hr-incapacidade-validade"
              type="date"
              value={validade}
              disabled={!podeEditar}
              onChange={(e) => {
                setValidade(e.target.value);
                setAlterado(true);
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hr-adaptacoes">{t("hr.campos.necessidadesAdaptacao")}</Label>
          <Textarea
            id="hr-adaptacoes"
            rows={3}
            value={adaptacoes}
            disabled={!podeEditar}
            onChange={(e) => {
              setAdaptacoes(e.target.value);
              setAlterado(true);
            }}
          />
        </div>

        {podeEditar && alterado && (
          <Button size="sm" onClick={gravar} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("employees.form.update")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
