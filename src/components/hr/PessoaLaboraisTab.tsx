/**
 * Detalhes laborais: o que a organizacao sabe sobre o vinculo da pessoa
 * enquanto colaborador -- e nada sobre a pessoa enquanto pessoa.
 *
 * Tudo aqui vive no nucleo `pessoas` (permissao `hr.pessoas.laborais.view` /
 * `.edit`). Sem a permissao de edicao os campos ficam em leitura, e nao
 * escondidos: quem ve os detalhes laborais tem de os poder ler inteiros.
 *
 * A ENTIDADE LEGAL NAO SE ESCOLHE. E sempre a da organizacao activa e mostra-se
 * como texto: o selector que aqui existia deixava escolher uma organizacao
 * diferente daquela em que a ficha vive, e isso nao e uma escolha que se deva
 * poder fazer.
 *
 * O LOCAL DE TRABALHO DEIXOU DE SE EDITAR AQUI. Desde 20261130060000
 * `pessoas.local_id` e DERIVADO da afectacao em aberto mais recente
 * (`pessoas_afectacoes`) -- escreve-lo directamente e recusado pela base
 * (`pessoas_local_id_e_derivado`). Aqui mostra-se so em leitura; quem o quer
 * mudar usa a seccao "Afectacoes a centros", mais abaixo, que e o unico
 * caminho de escrita. `local_trabalho`, o texto livre da ronda 1, continua
 * visivel como legenda legada enquanto nao houver local escolhido -- nao se
 * apaga e nao se migra por iniciativa do ecra.
 *
 * "Reporta a" so oferece pessoas da MESMA organizacao. Isso e garantido pela
 * base (a chave estrangeira e composta, `(reporta_a_pessoa_id, organization_id)`),
 * e aqui a lista ja vem filtrada pela organizacao activa -- as duas coisas de
 * acordo, nao uma a confiar na outra.
 *
 * O E-MAIL PESSOAL SAIU DAQUI. Vive agora em Detalhes pessoais
 * (`PessoaPessoaisTab.tsx`, bloco 1), a pedido do utilizador -- "se e detalhes
 * laborais o email pessoal n deve ser aqui". Nao voltar a propor este campo
 * neste separador.
 *
 * O ESTADO DO CONTRATO SAIU DAQUI TAMBEM, mas so-leitura: e derivado do
 * vinculo (`lib/hr/estadoContrato.ts`) e o controlo real vive no separador
 * Contratos, sobre o `estado` do vinculo activo. Mudar aqui nao mudava nada
 * de verdade -- era um enum solto a competir com a fonte real.
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
import { PessoaAfectacoesSeccao } from "@/components/hr/PessoaAfectacoesSeccao";
import type { EstadoContratoDerivado } from "@/lib/hr/estadoContrato";
import { type LocalTrabalho, type Pessoa } from "@/types/hr";

/** Valor do Select quando nao ha escolha. O Radix nao aceita `value=""`. */
const SEM_ESCOLHA = "__sem_escolha__";

interface PessoaLaboraisTabProps {
  pessoa: Pessoa;
  /** Pessoas da organizacao activa, para o selector de chefia. */
  colegas: Array<{ id: string; nome_completo: string }>;
  /** Locais de trabalho da organizacao activa -- para a legenda do local
   *  actual e para a seccao de afectacoes. */
  locais: LocalTrabalho[];
  locaisALoad: boolean;
  /** Nome da organizacao activa: a entidade legal, mostrada e nao escolhida. */
  entidadeLegalNome: string | null;
  /** So-leitura aqui -- ver o comentario de topo. `null` quando quem olha nao
   *  tem `hr.pessoas.vinculos.view`. */
  estadoContratoDerivado: EstadoContratoDerivado | null;
  podeEditar: boolean;
  saving: boolean;
  onGuardar: (patch: Partial<Pessoa>) => Promise<string | null>;
  /** Afectacoes a centros -- ver `PessoaAfectacoesSeccao`. Tres permissoes
   *  distintas: ver, alterar (`.edit`) e corrigir historico (`.corrigir`). */
  vinculoActivoId: string | null;
  podeVerAfectacoes: boolean;
  podeEditarAfectacoes: boolean;
  podeCorrigirAfectacoes: boolean;
}

type Rascunho = {
  email_trabalho: string;
  telefone_trabalho: string;
  numero_interno: string;
  cargo: string;
  data_admissao: string;
  data_antiguidade: string;
  data_saida: string;
  reporta_a_pessoa_id: string;
};

function rascunhoDe(pessoa: Pessoa): Rascunho {
  return {
    email_trabalho: pessoa.email_trabalho ?? "",
    telefone_trabalho: pessoa.telefone_trabalho ?? "",
    numero_interno: pessoa.numero_interno ?? "",
    cargo: pessoa.cargo ?? "",
    data_admissao: pessoa.data_admissao ?? "",
    data_antiguidade: pessoa.data_antiguidade ?? "",
    data_saida: pessoa.data_saida ?? "",
    reporta_a_pessoa_id: pessoa.reporta_a_pessoa_id ?? SEM_ESCOLHA,
  };
}

export function PessoaLaboraisTab({
  pessoa,
  colegas,
  locais,
  locaisALoad,
  entidadeLegalNome,
  estadoContratoDerivado,
  podeEditar,
  saving,
  onGuardar,
  vinculoActivoId,
  podeVerAfectacoes,
  podeEditarAfectacoes,
  podeCorrigirAfectacoes,
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
      email_trabalho: vazioParaNull(rascunho.email_trabalho),
      telefone_trabalho: vazioParaNull(rascunho.telefone_trabalho),
      numero_interno: vazioParaNull(rascunho.numero_interno),
      cargo: vazioParaNull(rascunho.cargo),
      data_admissao: vazioParaNull(rascunho.data_admissao),
      data_antiguidade: vazioParaNull(rascunho.data_antiguidade),
      data_saida: vazioParaNull(rascunho.data_saida),
      reporta_a_pessoa_id:
        rascunho.reporta_a_pessoa_id === SEM_ESCOLHA ? null : rascunho.reporta_a_pessoa_id,
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
    { id: "email_trabalho", labelKey: "hr.laborais.emailTrabalho", tipo: "email" },
    { id: "telefone_trabalho", labelKey: "hr.laborais.telefoneTrabalho" },
    { id: "data_admissao", labelKey: "hr.columns.contratacao", tipo: "date" },
    { id: "data_antiguidade", labelKey: "hr.laborais.dataAntiguidade", tipo: "date" },
    { id: "data_saida", labelKey: "hr.laborais.dataSaida", tipo: "date" },
  ];

  return (
    <div className="space-y-4">
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

          {/* So-leitura: `local_id` e DERIVADO da afectacao em aberto mais
              recente (`pessoas_afectacoes`, 20261130060000) e ja nao se
              escreve aqui. Quem o quer mudar usa a seccao de afectacoes,
              mais abaixo -- e o unico caminho de escrita. */}
          <div className="space-y-1.5">
            <Label htmlFor="hr-laborais-local">{t("hr.laborais.local")}</Label>
            <Input
              id="hr-laborais-local"
              value={
                pessoa.local_id
                  ? (locais.find((local) => local.id === pessoa.local_id)?.nome ??
                    t("hr.campos.semValor"))
                  : t("hr.campos.semValor")
              }
              readOnly
              disabled
            />
            <p className="text-xs text-muted-foreground">{t("hr.laborais.localAjudaDerivado")}</p>
            {!pessoa.local_id && pessoa.local_trabalho && (
              <p className="text-xs text-muted-foreground">
                {t("hr.laborais.localLegado")}: {pessoa.local_trabalho}
              </p>
            )}
          </div>

          {/* A entidade legal e a da organizacao activa. Texto, nao selector. */}
          <div className="space-y-1.5">
            <Label htmlFor="hr-laborais-entidade-legal">{t("hr.detalhes.entidadeLegal")}</Label>
            <Input
              id="hr-laborais-entidade-legal"
              value={entidadeLegalNome ?? t("hr.campos.semValor")}
              readOnly
              disabled
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hr-laborais-estado-contrato">{t("hr.columns.estadoContrato")}</Label>
            <Input
              id="hr-laborais-estado-contrato"
              value={
                estadoContratoDerivado
                  ? t(`hr.estadoContrato.${estadoContratoDerivado}`)
                  : t("hr.campos.semValor")
              }
              readOnly
              disabled
            />
            <p className="text-xs text-muted-foreground">
              {t("hr.detalhes.estadoContratoAjuda")}
            </p>
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

    <PessoaAfectacoesSeccao
      pessoaId={pessoa.id}
      organizationId={pessoa.organization_id}
      vinculoActivoId={vinculoActivoId}
      locais={locais}
      locaisALoad={locaisALoad}
      podeVer={podeVerAfectacoes}
      podeEditar={podeEditarAfectacoes}
      podeCorrigir={podeCorrigirAfectacoes}
    />
    </div>
  );
}
