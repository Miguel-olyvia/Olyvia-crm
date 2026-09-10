/**
 * Filiacao sindical: artigo 9.o do RGPD, o MESMO regime de `PessoaSaudeCard`.
 *
 * Tabela separada (`pessoas_sindicalizacao`, 20261124100000), permissoes
 * proprias `hr.pessoas.sindicalizacao.view` / `.edit` -- ambas marcadas
 * `is_dangerous` na base, com a intencao de que nenhum papel as receba por
 * omissao -- e auditada por trigger em `pessoas_acessos_sensiveis`.
 *
 * O cartao nao aparece sequer a quem nao tem a permissao de leitura, pela
 * mesma razao do cartao de saude: uma moldura vazia a dizer "sem acesso" ja e
 * informacao (revela que a pessoa tem resposta registada). Quem chama decide
 * se o renderiza -- ver `PessoaPessoaisTab.tsx`.
 *
 * NAO ha forma mascarada aqui, ao contrario do NISS: "os ultimos 4 caracteres
 * do sindicato" nao significa nada. E tudo ou nada, e por isso NUNCA aparece
 * no formulario de criacao de pessoa nem no convite de admissao.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ShieldAlert, Users2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import type { PessoaSindicalizacao } from "@/types/hr";

interface PessoaSindicalizacaoCardProps {
  sindicalizacao: PessoaSindicalizacao | null;
  /** `hr.pessoas.sindicalizacao.edit` na organizacao da pessoa. */
  podeEditar: boolean;
  saving: boolean;
  onGuardar: (patch: Partial<PessoaSindicalizacao>) => Promise<string | null>;
}

export function PessoaSindicalizacaoCard({
  sindicalizacao,
  podeEditar,
  saving,
  onGuardar,
}: PessoaSindicalizacaoCardProps) {
  const { t } = useTranslation();
  const [sindicalizado, setSindicalizado] = useState(false);
  const [sindicato, setSindicato] = useState("");
  const [quota, setQuota] = useState("");
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    setSindicalizado(sindicalizacao?.sindicalizado ?? false);
    setSindicato(sindicalizacao?.sindicato ?? "");
    setQuota(
      sindicalizacao?.quota_percentagem === null || sindicalizacao?.quota_percentagem === undefined
        ? ""
        : String(sindicalizacao.quota_percentagem),
    );
    setAlterado(false);
  }, [sindicalizacao]);

  const gravar = async () => {
    const quotaNumero = quota.trim() === "" ? null : Number(quota);
    if (quotaNumero !== null && (Number.isNaN(quotaNumero) || quotaNumero < 0 || quotaNumero > 100)) {
      toast.error(t("hr.campos.quotaSindical"));
      return;
    }
    const erro = await onGuardar({
      sindicalizado,
      sindicato: sindicalizado ? sindicato.trim() || null : null,
      quota_percentagem: sindicalizado ? quotaNumero : null,
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
          <Users2 className="h-4 w-4 text-muted-foreground" />
          {t("hr.sindicalizacao.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("hr.sindicalizacao.aviso")}
        </p>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="hr-sindicalizado" id="hr-sindicalizado-rotulo">
              {t("hr.campos.sindicalizado")}
            </Label>
          </div>
          {/* `aria-labelledby` e nao so `htmlFor`: o Switch do Radix e um
              <button>, e o nome acessivel de um botao NAO vem de uma
              <label for>. */}
          <Switch
            id="hr-sindicalizado"
            aria-labelledby="hr-sindicalizado-rotulo"
            checked={sindicalizado}
            disabled={!podeEditar}
            onCheckedChange={(v) => {
              setSindicalizado(v);
              setAlterado(true);
            }}
          />
        </div>

        {sindicalizado && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hr-sindicato">{t("hr.campos.sindicato")}</Label>
              <Input
                id="hr-sindicato"
                value={sindicato}
                disabled={!podeEditar}
                onChange={(e) => {
                  setSindicato(e.target.value);
                  setAlterado(true);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-quota-sindical">{t("hr.campos.quotaSindical")}</Label>
              <Input
                id="hr-quota-sindical"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={quota}
                disabled={!podeEditar}
                onChange={(e) => {
                  setQuota(e.target.value);
                  setAlterado(true);
                }}
              />
            </div>
          </div>
        )}

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
