// "Alterar visita": um diálogo curto para mudar o dia, a hora e a morada de uma visita já marcada (ou por concluir). A nova
// morada passa a valer. Só em memória, como o resto da ficha.
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/negocio-metas/estilos";
import { CamposDataHora } from "./CamposDataHora";
import { MORADA_VISITA_VAZIA, moradaDaLead, type DestinoVisita } from "./moradaVisita";
import { MoradaVisitaCampos } from "./MoradaVisitaCampos";
import type { Pessoa, VisitaPessoa } from "./pessoasTipos";
import { validarVisita, type DadosAlterarVisita } from "./visitaPessoa";

const V = "pessoasPagina.visitDialog.";
const C = "pessoasPagina.changeVisit.";

/** A escolha de partida: a da visita atual (a morada da lead só conta se a ficha ainda a tiver). */
function destinoDaVisita(visita: VisitaPessoa, temMoradaLead: boolean): DestinoVisita {
  const naLead = visita.igualALead && temMoradaLead;
  return { igualALead: naLead, outra: naLead ? MORADA_VISITA_VAZIA : visita.moradaVisita, notaAcesso: visita.notaAcesso ?? "" };
}

interface FormAlterarProps {
  pessoa: Pessoa;
  visita: VisitaPessoa;
  hoje: string;
  aoGuardar: (dados: DadosAlterarVisita) => void;
  aoFechar: () => void;
}

function FormAlterar({ pessoa, visita, hoje, aoGuardar, aoFechar }: FormAlterarProps) {
  const { t } = useTranslation();
  const id = useId();
  const lead = moradaDaLead(pessoa);
  const [campos, setCampos] = useState({ data: visita.data, hora: visita.hora });
  const [destino, setDestino] = useState<DestinoVisita>(() => destinoDaVisita(visita, lead !== null));
  const [tentou, setTentou] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const erro = validarVisita({ ...campos, nota: "", destino }, hoje, lead);
  const erroData = tentou && (erro === "dataVazia" || erro === "dataPassada") ? t(`${V}error.${erro}`) : null;
  const erroHora = tentou && erro === "horaInvalida" ? t(`${V}error.horaInvalida`) : null;
  const erroMorada = tentou && (erro === "ruaVazia" || erro === "codigoPostalInvalido" || erro === "notaAcessoComprida") ? erro : null;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (erro) {
      setTimeout(() => formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    aoGuardar({ ...campos, destino });
    toast.success(t(`${C}done`, { name: pessoa.nome }));
    aoFechar();
  };
  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="space-y-4">
      <CamposDataHora
        id={id} data={campos.data} hora={campos.hora} hoje={hoje} rotuloData={t(`${V}date`)} rotuloHora={t(`${V}time`)}
        erroData={erroData} erroHora={erroHora} aoMudar={(parcial) => setCampos((c) => ({ ...c, ...parcial }))}
      />
      <MoradaVisitaCampos id={`${id}-morada`} moradaLead={lead} valor={destino} erro={erroMorada} aoMudar={setDestino} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${V}cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${C}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

interface AlterarVisitaProps extends Omit<FormAlterarProps, "aoFechar"> {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
}

export function AlterarVisita({ aberto, aoMudarAberto, ...resto }: AlterarVisitaProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent className="max-h-[90vh] overflow-y-auto motion-reduce:!animate-none">
        <DialogHeader>
          <DialogTitle>{t(`${C}title`)}</DialogTitle>
          <DialogDescription>{t(`${C}description`, { name: resto.pessoa.nome })}</DialogDescription>
        </DialogHeader>
        <FormAlterar {...resto} aoFechar={() => aoMudarAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}
