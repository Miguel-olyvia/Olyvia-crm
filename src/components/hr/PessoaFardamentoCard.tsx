/**
 * Tamanhos de farda: cartao proprio, permissoes de laborais.
 *
 * PORQUE E UM CARTAO A PARTE, E NAO CAMPOS SOLTOS NO BLOCO GERAL
 * ----------------------------------------------------------------
 * `pessoas_fardamento` e uma tabela propria (20261124070000) por uma razao de
 * ACESSO, nao de arrumacao: quem encomenda fardas (armazem, operacoes) precisa
 * de ler o tamanho do blazer sem precisar de `hr.pessoas.pessoais.view`, que
 * devolve data de nascimento, estado civil, dependentes e retencao de IRS. As
 * permissoes que este cartao usa sao as MESMAS de Detalhes laborais
 * (`hr.pessoas.laborais.view` / `.edit`) -- nao ha codigo novo so para isto.
 *
 * `*_detalhe` so aparece quando o tamanho escolhido e "outro": nao ha CHECK
 * cruzado a exigir isso na base (a mesma razao de `pessoas_dados_pessoais`:
 * um CHECK cruzado rejeitaria o registo legitimo mais obvio), a coerencia
 * impoe-se aqui.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shirt, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { TAMANHOS_FARDAMENTO, type PessoaFardamento, type TamanhoFardamento } from "@/types/hr";

const SEM_ESCOLHA = "__sem_escolha__";

interface PessoaFardamentoCardProps {
  fardamento: PessoaFardamento | null;
  /** `hr.pessoas.laborais.edit` na organizacao da pessoa. */
  podeEditar: boolean;
  saving: boolean;
  onGuardar: (patch: Partial<PessoaFardamento>) => Promise<string | null>;
}

type Rascunho = {
  tamanho_cima: string;
  tamanho_cima_detalhe: string;
  tamanho_baixo: string;
  tamanho_baixo_detalhe: string;
  tamanho_blazer: string;
  tamanho_blazer_detalhe: string;
};

function rascunhoDe(fardamento: PessoaFardamento | null): Rascunho {
  return {
    tamanho_cima: fardamento?.tamanho_cima ?? SEM_ESCOLHA,
    tamanho_cima_detalhe: fardamento?.tamanho_cima_detalhe ?? "",
    tamanho_baixo: fardamento?.tamanho_baixo ?? SEM_ESCOLHA,
    tamanho_baixo_detalhe: fardamento?.tamanho_baixo_detalhe ?? "",
    tamanho_blazer: fardamento?.tamanho_blazer ?? SEM_ESCOLHA,
    tamanho_blazer_detalhe: fardamento?.tamanho_blazer_detalhe ?? "",
  };
}

function ouNull(valor: string): string | null {
  return valor.trim() === "" ? null : valor.trim();
}

export function PessoaFardamentoCard({
  fardamento,
  podeEditar,
  saving,
  onGuardar,
}: PessoaFardamentoCardProps) {
  const { t } = useTranslation();
  const [rascunho, setRascunho] = useState<Rascunho>(() => rascunhoDe(fardamento));
  useEffect(() => setRascunho(rascunhoDe(fardamento)), [fardamento]);

  const alterado = JSON.stringify(rascunho) !== JSON.stringify(rascunhoDe(fardamento));

  const gravar = async () => {
    const erro = await onGuardar({
      tamanho_cima:
        rascunho.tamanho_cima === SEM_ESCOLHA ? null : (rascunho.tamanho_cima as TamanhoFardamento),
      tamanho_cima_detalhe: ouNull(rascunho.tamanho_cima_detalhe),
      tamanho_baixo:
        rascunho.tamanho_baixo === SEM_ESCOLHA
          ? null
          : (rascunho.tamanho_baixo as TamanhoFardamento),
      tamanho_baixo_detalhe: ouNull(rascunho.tamanho_baixo_detalhe),
      tamanho_blazer:
        rascunho.tamanho_blazer === SEM_ESCOLHA
          ? null
          : (rascunho.tamanho_blazer as TamanhoFardamento),
      tamanho_blazer_detalhe: ouNull(rascunho.tamanho_blazer_detalhe),
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  const linhas: Array<{
    campo: "cima" | "baixo" | "blazer";
    labelKey: string;
  }> = [
    { campo: "cima", labelKey: "hr.fardamento.tamanhoCima" },
    { campo: "baixo", labelKey: "hr.fardamento.tamanhoBaixo" },
    { campo: "blazer", labelKey: "hr.fardamento.tamanhoBlazer" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shirt className="h-4 w-4 text-muted-foreground" />
          {t("hr.fardamento.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {linhas.map(({ campo, labelKey }) => {
            const idTamanho = `hr-fardamento-${campo}`;
            const idDetalhe = `hr-fardamento-${campo}-detalhe`;
            const tamanhoChave = `tamanho_${campo}` as const;
            const detalheChave = `tamanho_${campo}_detalhe` as const;
            return (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={idTamanho}>{t(labelKey)}</Label>
                <Select
                  value={rascunho[tamanhoChave]}
                  disabled={!podeEditar}
                  onValueChange={(v) => setRascunho({ ...rascunho, [tamanhoChave]: v })}
                >
                  <SelectTrigger id={idTamanho}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_ESCOLHA}>{t("hr.campos.semValor")}</SelectItem>
                    {TAMANHOS_FARDAMENTO.map((tamanho) => (
                      <SelectItem key={tamanho} value={tamanho}>
                        {t(`hr.tamanhoFardamento.${tamanho}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rascunho[tamanhoChave] === "outro" && (
                  <div className="pt-1">
                    <Label htmlFor={idDetalhe} className="text-xs text-muted-foreground">
                      {t("hr.fardamento.detalhe")}
                    </Label>
                    <Input
                      id={idDetalhe}
                      value={rascunho[detalheChave]}
                      disabled={!podeEditar}
                      onChange={(e) => setRascunho({ ...rascunho, [detalheChave]: e.target.value })}
                    />
                  </div>
                )}
              </div>
            );
          })}
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
