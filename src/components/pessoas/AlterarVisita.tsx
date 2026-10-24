// "Alterar visita": um diálogo para mudar uma visita já marcada (ou por concluir). No exemplo muda o dia, a hora e a morada, só em memória.
// Com `naBase` (a ficha real) abre o formulário ligado à base (`AlterarVisitaReal`: quadro, recursos, duração e conflito), que se carrega à parte.
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { CamposDataHora } from "./CamposDataHora";
import { FormularioVisitaCarregavel } from "./FormularioVisitaCarregavel";
import { destinoDaVisita, moradaDaLead, type DestinoVisita } from "./moradaVisita";
import { MoradaVisitaCampos } from "./MoradaVisitaCampos";
import type { Pessoa } from "./pessoasTipos";
import { validarVisita, type DadosAlterarVisita } from "./visitaPessoa";

const V = "pessoasPagina.visitDialog.";
const C = "pessoasPagina.changeVisit.";

// O formulário ligado à base só se carrega quando se abre com `naBase`: o exemplo (e os seus testes) nunca importa a ligação à base.
// Uma função de módulo (estável); se o pacote falhar a carregar, `FormularioVisitaCarregavel` contém o erro e deixa tentar de novo.
const importarFormAlterarReal = () => import("./AlterarVisitaReal").then((m) => ({ default: m.FormAlterarReal }));

interface FormAlterarProps {
  pessoa: Pessoa;
  /** A visita a alterar (uma visita da pessoa). */
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
  /** Liga o diálogo à base: grava por `useAcoesVisita` (quadro, recursos, duração, conflito) e não usa `aoGuardar`. */
  naBase?: boolean;
}

export function AlterarVisita({ aberto, aoMudarAberto, naBase = false, ...resto }: AlterarVisitaProps) {
  const { t } = useTranslation();
  // Uma gravação na base está a correr: o diálogo não se deixa fechar (Escape, clique fora, «Cancelar»). Lê-se no instante do clique, por isso é uma ref.
  const ocupado = useRef(false);
  const descricao = t(naBase ? "pessoasPagina.real.visit.alterar.description" : `${C}description`, { name: resto.pessoa.nome });
  return (
    <Dialog open={aberto} onOpenChange={(valor) => { if (!valor && ocupado.current) return; aoMudarAberto(valor); }}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto motion-reduce:!animate-none"
        onEscapeKeyDown={(e) => { if (ocupado.current) e.preventDefault(); }} onInteractOutside={(e) => { if (ocupado.current) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{t(`${C}title`)}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {naBase ? (
          <FormularioVisitaCarregavel
            importar={importarFormAlterarReal}
            propriedades={{
              pessoa: resto.pessoa, visita: resto.visita, hoje: resto.hoje, aoOcupado: (a: boolean) => { ocupado.current = a; }, aoFechar: () => aoMudarAberto(false),
            }}
          />
        ) : (
          <FormAlterar {...resto} aoFechar={() => aoMudarAberto(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
