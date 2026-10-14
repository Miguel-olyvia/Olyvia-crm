// "Marcar visita" nas submissões que a pedem: um diálogo curto (dia, hora e nota) que marca a visita EM MEMÓRIA (a pessoa
// passa à etapa Visita e a atividade regista-o). Um contexto liga o botão de cada cartão de submissão ao diálogo único da
// página; sem o provider (outros usos do cartão) o botão não existe.
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOCO } from "@/components/negocio-metas/estilos";
import { CamposDataHora, MensagemErro } from "./CamposDataHora";
import { MarcarVisitaContext, type PedidoVisita } from "./marcarVisitaContexto";
import { MAX_NOTA_VISITA, validarVisita, type DadosVisita, type ErroVisita } from "./visitaPessoa";

const V = "pessoasPagina.visitDialog.";

interface ProviderProps {
  /** O dia de hoje (AAAA-MM-DD): a data mínima da visita. */
  hoje: string;
  aoMarcar: (pessoaId: string, dados: DadosVisita) => void;
  children: ReactNode;
}

interface CamposVisitaProps {
  id: string;
  campos: { data: string; hora: string; nota: string };
  erro: ErroVisita | null;
  hoje: string;
  campoData: Ref<HTMLInputElement>;
  aoMudar: (parcial: Partial<CamposVisitaProps["campos"]>) => void;
}

/** Os campos da visita: dia, hora e nota. */
function CamposVisita({ id, campos, erro, hoje, campoData, aoMudar }: CamposVisitaProps) {
  const { t } = useTranslation();
  const erroData = erro === "dataVazia" || erro === "dataPassada";
  return (
    <>
      <CamposDataHora
        id={id} data={campos.data} hora={campos.hora} hoje={hoje} campoData={campoData} rotuloData={t(`${V}date`)} rotuloHora={t(`${V}time`)}
        erroData={erroData ? t(`${V}error.${erro}`) : null} erroHora={erro === "horaInvalida" ? t(`${V}error.horaInvalida`) : null}
        aoMudar={aoMudar}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>{t(`${V}note`)}</Label>
        <Input
          id={`${id}-nota`} value={campos.nota} autoComplete="off" aria-invalid={erro === "notaComprida" ? true : undefined}
          aria-describedby={erro === "notaComprida" ? `${id}-nota-erro` : undefined} className={cn("min-h-11", FOCO)}
          onChange={(e) => aoMudar({ nota: e.target.value })}
        />
        {erro === "notaComprida" && <MensagemErro id={`${id}-nota-erro`} texto={t(`${V}error.notaComprida`, { max: MAX_NOTA_VISITA })} />}
      </div>
    </>
  );
}

function FormVisita({ pedido, hoje, aoMarcar, aoFechar }: { pedido: PedidoVisita; hoje: string; aoMarcar: ProviderProps["aoMarcar"]; aoFechar: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [campos, setCampos] = useState({ data: "", hora: "", nota: "" });
  const [tentou, setTentou] = useState(false);
  const campoData = useRef<HTMLInputElement>(null);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (validarVisita(campos, hoje)) { campoData.current?.focus(); return; }
    aoMarcar(pedido.pessoaId, { ...campos, servico: pedido.servico });
    toast.success(t(`${V}done`, { name: pedido.nome }));
    aoFechar();
  };
  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <CamposVisita
        id={id} campos={campos} erro={tentou ? validarVisita(campos, hoje) : null} hoje={hoje} campoData={campoData}
        aoMudar={(parcial) => setCampos((c) => ({ ...c, ...parcial }))}
      />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${V}cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${V}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

export function MarcarVisitaProvider({ hoje, aoMarcar, children }: ProviderProps) {
  const { t } = useTranslation();
  const [pedido, setPedido] = useState<PedidoVisita | null>(null);
  const ultimo = useRef<PedidoVisita | null>(null);
  if (pedido) ultimo.current = pedido;
  const mostrado = pedido ?? ultimo.current;
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const valor = useMemo(() => ({ pedir: (p: PedidoVisita) => setPedido(p), marcadas }), [marcadas]);
  const marcar = (pessoaId: string, dados: DadosVisita) => {
    aoMarcar(pessoaId, dados);
    setMarcadas((antes) => new Set(antes).add(pessoaId));
  };
  return (
    <MarcarVisitaContext.Provider value={valor}>
      {children}
      <Dialog open={pedido !== null} onOpenChange={(aberto) => { if (!aberto) setPedido(null); }}>
        <DialogContent className="motion-reduce:!animate-none">
          <DialogHeader>
            <DialogTitle>{t(`${V}title`)}</DialogTitle>
            <DialogDescription>{t(`${V}description`, { name: mostrado?.nome ?? "", service: mostrado?.servico ?? "" })}</DialogDescription>
          </DialogHeader>
          {mostrado && <FormVisita key={mostrado.pessoaId} pedido={mostrado} hoje={hoje} aoMarcar={marcar} aoFechar={() => setPedido(null)} />}
        </DialogContent>
      </Dialog>
    </MarcarVisitaContext.Provider>
  );
}
