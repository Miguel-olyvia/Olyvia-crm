/**
 * Ofícios de obra (28/10/2026): os ofícios do Catálogo (ops_skill) que esta
 * pessoa faz. E o que a torna tecnico no Catalogo e no orcamento do /negocios:
 * o EUR/h de cada oficio e a media do custo/hora das pessoas com esse oficio.
 * Sem ninguem ligado, o oficio usa o salario de referencia do perfil; sem os
 * dois, a mao de obra conta 0 EUR e o orcamento avisa ("Oficio sem custo/hora").
 *
 * Le e grava pelas RPCs da migration 20261231996000 (rh_ler_oficios_pessoa,
 * rh_guardar_oficios_pessoa). O custo/hora e calculado na base a partir da
 * retribuicao em vigor, pela mesma conta do salario do perfil no Catalogo; so
 * aparece a quem tem `hr.pessoas.retribuicao.view`.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { HardHat, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { hrRpc } from "@/lib/hr/hrDb";

interface Oficio {
  id: string;
  nome: string;
  ligado: boolean;
}

interface Lido {
  oficios: Oficio[];
  custo_hora: number | null;
  ve_custo: boolean;
}

interface PessoaOficiosObraCardProps {
  pessoaId: string;
  organizationId: string;
  /** `hr.pessoas.laborais.edit` na organizacao da pessoa. */
  podeEditar: boolean;
}

const eur = (v: number) => v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PessoaOficiosObraCard({ pessoaId, organizationId, podeEditar }: PessoaOficiosObraCardProps) {
  const { t } = useTranslation();
  const [lido, setLido] = useState<Lido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await hrRpc("rh_ler_oficios_pessoa", { p_org: organizationId, p_pessoa: pessoaId });
    if (error) {
      setErro(error.message ?? "");
      return;
    }
    const l: Lido = { oficios: [], custo_hora: null, ve_custo: false, ...(data as Partial<Lido> | null) };
    setErro(null);
    setLido(l);
    setEscolhidos(new Set(l.oficios.filter((o) => o.ligado).map((o) => o.id)));
  }, [organizationId, pessoaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ligadosAntes = new Set(lido?.oficios.filter((o) => o.ligado).map((o) => o.id) ?? []);
  const alterado = ligadosAntes.size !== escolhidos.size || [...escolhidos].some((id) => !ligadosAntes.has(id));

  const alternar = (id: string, marcado: boolean) => {
    const n = new Set(escolhidos);
    if (marcado) n.add(id);
    else n.delete(id);
    setEscolhidos(n);
  };

  const gravar = async () => {
    setSaving(true);
    const { error } = await hrRpc("rh_guardar_oficios_pessoa", {
      p_org: organizationId,
      p_pessoa: pessoaId,
      p_skills: [...escolhidos],
    });
    setSaving(false);
    if (error) {
      toast.error(error.message ?? t("hr.oficiosObra.erroGravar"));
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    await carregar();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4 text-muted-foreground" />
          {t("hr.oficiosObra.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("hr.oficiosObra.ajuda")}</p>
        {erro !== null && <p className="text-sm text-destructive">{erro || t("hr.oficiosObra.erroLer")}</p>}
        {!lido && erro === null &&<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {lido && !lido.oficios.length && <p className="text-sm text-muted-foreground">{t("hr.oficiosObra.semOficios")}</p>}
        {lido && lido.oficios.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lido.oficios.map((o) => {
              const id = `hr-oficio-${o.id}`;
              return (
                <label key={o.id} htmlFor={id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={id}
                    checked={escolhidos.has(o.id)}
                    disabled={!podeEditar || saving}
                    onCheckedChange={(v) => alternar(o.id, v === true)}
                  />
                  {o.nome}
                </label>
              );
            })}
          </div>
        )}
        {lido?.ve_custo && escolhidos.size > 0 && (
          <p className="text-sm">
            {lido.custo_hora != null
              ? t("hr.oficiosObra.custoHora", { valor: eur(lido.custo_hora) })
              : t("hr.oficiosObra.semCusto")}
          </p>
        )}
        {podeEditar && alterado && (
          <div className="flex gap-2">
            <Button size="sm" onClick={gravar} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("employees.form.update")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEscolhidos(new Set(ligadosAntes))}
              disabled={saving}
            >
              {t("employees.form.cancel")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
