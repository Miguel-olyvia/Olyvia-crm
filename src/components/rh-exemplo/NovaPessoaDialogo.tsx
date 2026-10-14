/**
 * "Nova pessoa" da apresentação: uma versão curta do assistente real (que tem cinco passos, anexos e
 * verificação de duplicados). Recolhe o essencial, cria a ficha em memória e abre-a.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import type { NovaPessoaExemplo } from "@/components/rh-exemplo/hooks/usePessoas";
import { TIPOS_CONTRATO, type TipoContrato } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";

interface NovaPessoaDialogoProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  colegas: Array<{ id: string; nome_completo: string }>;
  onCriar: (dados: NovaPessoaExemplo) => Promise<{ id: string }>;
  onCriada: (id: string) => void;
}

const SEM_CHEFIA = "__nenhuma__";

export function NovaPessoaDialogo({ open, onOpenChange, colegas, onCriar, onCriada }: NovaPessoaDialogoProps) {
  const { t } = useTranslation();
  const { cargos } = useCargos();
  const { locais } = useLocaisTrabalho();
  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [localId, setLocalId] = useState("");
  const [tipo, setTipo] = useState<TipoContrato>("sem_termo");
  const [inicio, setInicio] = useState(hojeIso());
  const [fim, setFim] = useState("");
  const [chefia, setChefia] = useState(SEM_CHEFIA);
  const [tentou, setTentou] = useState(false);

  const comTermo = tipo !== "sem_termo";
  const cargosActivos = useMemo(() => cargos.filter((c) => c.activo), [cargos]);
  const erros = {
    nome: nome.trim() === "",
    apelido: apelido.trim() === "",
    cargo: cargoId === "",
    local: localId === "",
    fim: comTermo && (fim === "" || fim < inicio),
  };
  const invalido = Object.values(erros).some(Boolean);

  const reiniciar = () => {
    setNome("");
    setApelido("");
    setCargoId("");
    setLocalId("");
    setTipo("sem_termo");
    setInicio(hojeIso());
    setFim("");
    setChefia(SEM_CHEFIA);
    setTentou(false);
  };

  const criar = async () => {
    setTentou(true);
    if (invalido) return;
    const { id } = await onCriar({
      primeiro_nome: nome.trim(),
      apelido: apelido.trim(),
      cargoId,
      localId,
      tipoContrato: tipo,
      dataInicio: inicio,
      dataFim: comTermo ? fim : null,
      reportaAId: chefia === SEM_CHEFIA ? null : chefia,
    });
    reiniciar();
    onOpenChange(false);
    onCriada(id);
  };

  const mensagemErro = (campo: keyof typeof erros) =>
    tentou && erros[campo] ? (
      <p role="alert" className="text-xs text-destructive">
        {t("rhExemplo.novaPessoa.obrigatorio")}
      </p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hr.pessoas.new")}</DialogTitle>
          <DialogDescription>{t("rhExemplo.novaPessoa.descricao")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rh-nova-nome">{t("rhExemplo.novaPessoa.nome")}</Label>
            <Input id="rh-nova-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            {mensagemErro("nome")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rh-nova-apelido">{t("rhExemplo.novaPessoa.apelido")}</Label>
            <Input id="rh-nova-apelido" value={apelido} onChange={(e) => setApelido(e.target.value)} />
            {mensagemErro("apelido")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rh-nova-cargo">{t("hr.columns.cargo")}</Label>
            <Select value={cargoId} onValueChange={setCargoId}>
              <SelectTrigger id="rh-nova-cargo">
                <SelectValue placeholder={t("rhExemplo.novaPessoa.escolher")} />
              </SelectTrigger>
              <SelectContent>
                {cargosActivos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mensagemErro("cargo")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rh-nova-local">{t("hr.columns.local")}</Label>
            <Select value={localId} onValueChange={setLocalId}>
              <SelectTrigger id="rh-nova-local">
                <SelectValue placeholder={t("rhExemplo.novaPessoa.escolher")} />
              </SelectTrigger>
              <SelectContent>
                {locais.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mensagemErro("local")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rh-nova-tipo">{t("rhExemplo.novaPessoa.tipoContrato")}</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoContrato)}>
              <SelectTrigger id="rh-nova-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_CONTRATO.map((valor) => (
                  <SelectItem key={valor} value={valor}>
                    {t(`hr.tipoContrato.${valor}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rh-nova-chefia">{t("hr.detalhes.reportaA")}</Label>
            <Select value={chefia} onValueChange={setChefia}>
              <SelectTrigger id="rh-nova-chefia">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CHEFIA}>{t("rhExemplo.novaPessoa.semChefia")}</SelectItem>
                {colegas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rh-nova-inicio">{t("hr.detalhes.dataInicio")}</Label>
            <Input id="rh-nova-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          {comTermo && (
            <div className="space-y-1.5">
              <Label htmlFor="rh-nova-fim">{t("rhExemplo.novaPessoa.dataFim")}</Label>
              <Input id="rh-nova-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              {mensagemErro("fim")}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void criar()}>{t("rhExemplo.novaPessoa.criar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
