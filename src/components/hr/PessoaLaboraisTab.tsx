/**
 * Detalhes laborais: o que a organizacao sabe sobre o vinculo da pessoa
 * enquanto colaborador -- e nada sobre a pessoa enquanto pessoa.
 *
 * Tudo aqui vive no nucleo `pessoas` (permissao `hr.pessoas.laborais.view` /
 * `.edit`). Sem a permissao de edicao os campos ficam em leitura, e nao
 * escondidos: quem ve os detalhes laborais tem de os poder ler inteiros.
 *
 * "Reporta a" so oferece pessoas da MESMA organizacao. Isso e garantido pela
 * base (a chave estrangeira e composta, `(reporta_a_pessoa_id, organization_id)`),
 * e aqui a lista ja vem filtrada pela organizacao activa -- as duas coisas de
 * acordo, nao uma a confiar na outra.
 */
import { useEffect, useMemo, useState } from "react";
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
import { Briefcase, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { ESTADOS_CONTRATO, type EstadoContrato, type Pessoa } from "@/types/hr";

/** Valor do Select quando nao ha escolha. O Radix nao aceita `value=""`. */
const SEM_ESCOLHA = "__sem_escolha__";

interface PessoaLaboraisTabProps {
  pessoa: Pessoa;
  /** Pessoas da organizacao activa, para o selector de chefia. */
  colegas: Array<{ id: string; nome_completo: string }>;
  /** Organizacoes a que o utilizador pertence, para a entidade legal. */
  organizacoes: Array<{ id: string; name: string }>;
  podeEditar: boolean;
  saving: boolean;
  onGuardar: (patch: Partial<Pessoa>) => Promise<string | null>;
}

type Rascunho = {
  nome_social: string;
  email_trabalho: string;
  email_pessoal: string;
  telefone_trabalho: string;
  numero_interno: string;
  cargo: string;
  local_trabalho: string;
  data_admissao: string;
  data_antiguidade: string;
  data_saida: string;
  estado_contrato: EstadoContrato;
  reporta_a_pessoa_id: string;
  entidade_legal_org_id: string;
};

function rascunhoDe(pessoa: Pessoa): Rascunho {
  return {
    nome_social: pessoa.nome_social ?? "",
    email_trabalho: pessoa.email_trabalho ?? "",
    email_pessoal: pessoa.email_pessoal ?? "",
    telefone_trabalho: pessoa.telefone_trabalho ?? "",
    numero_interno: pessoa.numero_interno ?? "",
    cargo: pessoa.cargo ?? "",
    local_trabalho: pessoa.local_trabalho ?? "",
    data_admissao: pessoa.data_admissao ?? "",
    data_antiguidade: pessoa.data_antiguidade ?? "",
    data_saida: pessoa.data_saida ?? "",
    estado_contrato: pessoa.estado_contrato,
    reporta_a_pessoa_id: pessoa.reporta_a_pessoa_id ?? SEM_ESCOLHA,
    entidade_legal_org_id: pessoa.entidade_legal_org_id ?? SEM_ESCOLHA,
  };
}

export function PessoaLaboraisTab({
  pessoa,
  colegas,
  organizacoes,
  podeEditar,
  saving,
  onGuardar,
}: PessoaLaboraisTabProps) {
  const { t } = useTranslation();
  const [rascunho, setRascunho] = useState<Rascunho>(() => rascunhoDe(pessoa));

  useEffect(() => {
    setRascunho(rascunhoDe(pessoa));
  }, [pessoa]);

  const original = useMemo(() => rascunhoDe(pessoa), [pessoa]);
  const alterado = useMemo(
    () => (Object.keys(original) as Array<keyof Rascunho>).some((k) => original[k] !== rascunho[k]),
    [original, rascunho],
  );

  const definir = <K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) =>
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));

  const vazioParaNull = (valor: string) => (valor.trim() === "" ? null : valor.trim());

  const gravar = async () => {
    const erro = await onGuardar({
      nome_social: vazioParaNull(rascunho.nome_social),
      email_trabalho: vazioParaNull(rascunho.email_trabalho),
      email_pessoal: vazioParaNull(rascunho.email_pessoal),
      telefone_trabalho: vazioParaNull(rascunho.telefone_trabalho),
      numero_interno: vazioParaNull(rascunho.numero_interno),
      cargo: vazioParaNull(rascunho.cargo),
      local_trabalho: vazioParaNull(rascunho.local_trabalho),
      data_admissao: vazioParaNull(rascunho.data_admissao),
      data_antiguidade: vazioParaNull(rascunho.data_antiguidade),
      data_saida: vazioParaNull(rascunho.data_saida),
      estado_contrato: rascunho.estado_contrato,
      reporta_a_pessoa_id:
        rascunho.reporta_a_pessoa_id === SEM_ESCOLHA ? null : rascunho.reporta_a_pessoa_id,
      entidade_legal_org_id:
        rascunho.entidade_legal_org_id === SEM_ESCOLHA ? null : rascunho.entidade_legal_org_id,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  const campos: Array<{ id: keyof Rascunho; labelKey: string; tipo?: "date" | "email" | "text" }> = [
    { id: "numero_interno", labelKey: "hr.laborais.numeroInterno" },
    { id: "cargo", labelKey: "hr.columns.cargo" },
    { id: "local_trabalho", labelKey: "hr.laborais.local" },
    { id: "nome_social", labelKey: "hr.laborais.nomeSocial" },
    { id: "email_trabalho", labelKey: "hr.laborais.emailTrabalho", tipo: "email" },
    { id: "email_pessoal", labelKey: "hr.laborais.emailPessoal", tipo: "email" },
    { id: "telefone_trabalho", labelKey: "hr.laborais.telefoneTrabalho" },
    { id: "data_admissao", labelKey: "hr.columns.contratacao", tipo: "date" },
    { id: "data_antiguidade", labelKey: "hr.laborais.dataAntiguidade", tipo: "date" },
    { id: "data_saida", labelKey: "hr.laborais.dataSaida", tipo: "date" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          {t("hr.pessoa.tabs.laborais")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campos.map(({ id, labelKey, tipo }) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={`hr-laborais-${id}`}>{t(labelKey)}</Label>
              <Input
                id={`hr-laborais-${id}`}
                type={tipo ?? "text"}
                value={rascunho[id] as string}
                disabled={!podeEditar}
                onChange={(e) => definir(id, e.target.value as Rascunho[typeof id])}
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="hr-laborais-reporta-a">{t("hr.detalhes.reportaA")}</Label>
            <Select
              value={rascunho.reporta_a_pessoa_id}
              disabled={!podeEditar}
              onValueChange={(v) => definir("reporta_a_pessoa_id", v)}
            >
              <SelectTrigger id="hr-laborais-reporta-a">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ESCOLHA}>{t("employees.form.noSupervisor")}</SelectItem>
                {colegas
                  .filter((colega) => colega.id !== pessoa.id)
                  .map((colega) => (
                    <SelectItem key={colega.id} value={colega.id}>
                      {colega.nome_completo}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hr-laborais-entidade-legal">{t("hr.detalhes.entidadeLegal")}</Label>
            <Select
              value={rascunho.entidade_legal_org_id}
              disabled={!podeEditar}
              onValueChange={(v) => definir("entidade_legal_org_id", v)}
            >
              <SelectTrigger id="hr-laborais-entidade-legal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ESCOLHA}>{t("hr.campos.semValor")}</SelectItem>
                {organizacoes.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hr-laborais-estado-contrato">{t("hr.columns.estadoContrato")}</Label>
            <Select
              value={rascunho.estado_contrato}
              disabled={!podeEditar}
              onValueChange={(v) => definir("estado_contrato", v as EstadoContrato)}
            >
              <SelectTrigger id="hr-laborais-estado-contrato">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_CONTRATO.map((estado) => (
                  <SelectItem key={estado} value={estado}>
                    {t(`hr.estadoContrato.${estado}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {podeEditar && alterado && (
          <div className="flex gap-2">
            <Button size="sm" onClick={gravar} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("employees.form.update")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRascunho(rascunhoDe(pessoa))}
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
