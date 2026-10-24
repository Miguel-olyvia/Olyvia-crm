// «Gerar contrato»: depois de aprovar a ficha, o RH completa o que só ele preenche (data de admissão, cargo, tipo de contrato,
// retribuição, subsídio e duodécimos), escolhe o modelo de documento e vê a pré-visualização. Ao gerar, o contrato entra em
// Documentos da ficha e fica por assinar, à vista da pessoa no mesmo login temporário. Só memória.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { gerarContrato, type CamposDoRh } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useEstadoRh, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { textoDoContrato } from "@/components/rh-exemplo/lib/admissaoContratoTexto";
import { TIPOS_CONTRATO, type TipoContrato } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";

interface GerarContratoDialogProps {
  pessoaId: string | null;
  aoFechar: () => void;
  aoGerado: (pessoaId: string) => void;
}

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  );
}

function camposIniciais(ficha: ReturnType<typeof useFichaRh>): CamposDoRh {
  const vinculo = ficha?.vinculos[0];
  const retribuicao = ficha?.retribuicoes[0];
  return {
    dataAdmissao: ficha?.pessoa.data_admissao ?? hojeIso(),
    cargoId: ficha?.pessoa.cargo_id ?? "",
    tipoContrato: vinculo?.tipo_contrato ?? "sem_termo",
    retribuicao: retribuicao?.valor_base ?? 1000,
    subsidio: retribuicao?.subsidio_alimentacao ?? null,
    duodecimos: retribuicao?.duodecimos_pct ?? 50,
  };
}

function ParteDoRh({ campos, aoMudar }: { campos: CamposDoRh; aoMudar: (p: Partial<CamposDoRh>) => void }) {
  const { t } = useTranslation();
  const cargos = useEstadoRh((e) => e.cargos);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo id="rh-adm-data" rotulo={t("hr.detalhes.dataInicio")}>
        <Input id="rh-adm-data" type="date" className="h-11" value={campos.dataAdmissao} onChange={(e) => aoMudar({ dataAdmissao: e.target.value })} />
      </Campo>
      <Campo id="rh-adm-cargo" rotulo={t("hr.columns.cargo")}>
        <NativeSelect id="rh-adm-cargo" className="h-11" value={campos.cargoId} onValueChange={(cargoId) => aoMudar({ cargoId })} options={cargos.map((c) => ({ value: c.id, label: c.nome }))} />
      </Campo>
      <Campo id="rh-adm-tipo" rotulo={t("hr.contrato.tipoContrato")}>
        <NativeSelect
          id="rh-adm-tipo" className="h-11" value={campos.tipoContrato} onValueChange={(v) => aoMudar({ tipoContrato: v as TipoContrato })}
          options={TIPOS_CONTRATO.map((v) => ({ value: v, label: t(`hr.tipoContrato.${v}`) }))}
        />
      </Campo>
      <Campo id="rh-adm-retribuicao" rotulo={t("rhAdm.contrato.campoRetribuicao")}>
        <Input id="rh-adm-retribuicao" type="number" min={0} step="0.01" className="h-11" value={campos.retribuicao} onChange={(e) => aoMudar({ retribuicao: Number(e.target.value) })} />
      </Campo>
      <Campo id="rh-adm-subsidio" rotulo={t("hr.pendencias.campo.subsidio_alimentacao")}>
        <Input
          id="rh-adm-subsidio" type="number" min={0} step="0.01" className="h-11" value={campos.subsidio ?? ""}
          onChange={(e) => aoMudar({ subsidio: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </Campo>
      <Campo id="rh-adm-duodecimos" rotulo={t("hr.pendencias.campo.duodecimos")}>
        <NativeSelect
          id="rh-adm-duodecimos" className="h-11" value={String(campos.duodecimos)} onValueChange={(v) => aoMudar({ duodecimos: Number(v) as 0 | 50 | 100 })}
          options={["0", "50", "100"].map((v) => ({ value: v, label: `${v}%` }))}
        />
      </Campo>
    </div>
  );
}

function PreVisualizacaoContrato({ texto }: { texto: { titulo: string; linhas: string[] } | null }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="rh-adm-preview" className="space-y-2 rounded-md border bg-muted/30 p-4">
      <h3 id="rh-adm-preview" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("rhAdm.contrato.preVisualizacao")}</h3>
      {texto ? (
        <div className="space-y-2 text-sm">
          <p className="text-base font-semibold">{texto.titulo}</p>
          {texto.linhas.map((l) => <p key={l}>{l}</p>)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rhAdm.contrato.semModelo")}</p>
      )}
    </section>
  );
}

/** O texto do contrato com o que o RH escreveu até agora (muda a cada campo), ou `null` sem modelo. */
function useTextoDoContrato(modelo: { nome: string; corpo_html: string } | undefined, ficha: ReturnType<typeof useFichaRh>, campos: CamposDoRh) {
  const { t } = useTranslation();
  const cargos = useEstadoRh((e) => e.cargos);
  return useMemo(() => {
    if (!modelo || !ficha) return null;
    const cargo = cargos.find((c) => c.id === campos.cargoId)?.nome ?? ficha.pessoa.cargo ?? "";
    const tipoContrato = t(`hr.tipoContrato.${campos.tipoContrato}`);
    const dados = {
      nome: ficha.pessoa.nome_completo, cargo, dataAdmissao: campos.dataAdmissao, tipoContrato,
      retribuicao: campos.retribuicao, subsidio: campos.subsidio, duodecimos: campos.duodecimos,
    };
    return textoDoContrato(modelo, dados, t);
  }, [modelo, ficha, cargos, campos, t]);
}

export function GerarContratoDialog({ pessoaId, aoFechar, aoGerado }: GerarContratoDialogProps) {
  const { t } = useTranslation();
  const ficha = useFichaRh(pessoaId);
  const modelos = useEstadoRh((e) => e.modelos).filter((m) => m.activo && m.tipo === "contrato");
  const [campos, setCampos] = useState<CamposDoRh>(() => camposIniciais(ficha));
  const [modeloId, setModeloId] = useState("");
  useEffect(() => {
    if (pessoaId === null) return;
    setCampos(camposIniciais(ficha));
    setModeloId((atual) => atual || (modelos[0]?.id ?? ""));
    // Só ao abrir para uma pessoa: o que o RH escreve a seguir não se repõe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoaId]);

  const modelo = modelos.find((m) => m.id === (modeloId || modelos[0]?.id));
  const texto = useTextoDoContrato(modelo, ficha, campos);

  const gerar = () => {
    if (!pessoaId || !modelo || !texto) return;
    const resultado = gerarContrato(pessoaId, { modeloId: modelo.id, campos, titulo: texto.titulo, linhas: texto.linhas });
    if (resultado.ok) aoGerado(pessoaId);
  };

  return (
    <Dialog open={pessoaId !== null} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("rhAdm.contrato.titulo", { nome: ficha?.pessoa.nome_completo ?? "" })}</DialogTitle>
          <DialogDescription>{t("rhAdm.contrato.descricao")}</DialogDescription>
        </DialogHeader>
        <Campo id="rh-adm-modelo" rotulo={t("rhAdm.contrato.modelo")}>
          <NativeSelect
            id="rh-adm-modelo" className="h-11" value={modelo?.id ?? ""} onValueChange={setModeloId}
            options={modelos.map((m) => ({ value: m.id, label: m.nome }))}
          />
        </Campo>
        <ParteDoRh campos={campos} aoMudar={(p) => setCampos((c) => ({ ...c, ...p }))} />
        <PreVisualizacaoContrato texto={texto} />
        <p className="text-xs text-muted-foreground">{t("rhAdm.simulacao.contrato")}</p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" className="min-h-11" onClick={aoFechar}>{t("employees.form.cancel")}</Button>
          <Button type="button" className="min-h-11" disabled={!texto} onClick={gerar}>{t("rhAdm.acao.gerarContrato")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
