// "Marcar visita" nas submissões que a pedem: um diálogo curto (dia, hora, nota e morada da visita) que marca a visita EM MEMÓRIA (a pessoa
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
import { MoradaVisitaCampos } from "./MoradaVisitaCampos";
import { destinoInicial, validarDestino, type DestinoVisita } from "./moradaVisita";
import type { ErroMoradaVisita } from "./moradaVisita";
import type { DadosVisitaPedido, EscolhaPedido } from "./acoesPedido";
import { MAX_NOTA_VISITA, validarVisita, type ErroVisita } from "./visitaPessoa";

const V = "pessoasPagina.visitDialog.";

interface ProviderProps {
  /** O dia de hoje (AAAA-MM-DD): a data mínima da visita. */
  hoje: string;
  /** Marca a visita: `escolha` diz o pedido (e o serviço de um pedido novo), `dados` o dia, a hora, a nota e a morada. */
  aoMarcar: (pessoaId: string, escolha: EscolhaPedido, dados: DadosVisitaPedido) => void;
  /** As pessoas que já têm uma visita marcada em algum pedido (juntam-se às marcadas neste ecrã). */
  jaComVisita?: ReadonlySet<string>;
  /** Ao fechar o diálogo: devolve o foco a quem o abriu e diz se o fez (o `ProcessoProvider` fá-lo para o "A fazer"); sem isto, o diálogo devolve-o por si. */
  aoDevolverFoco?: () => boolean;
  children: ReactNode;
}

interface CamposVisitaProps {
  id: string;
  campos: { data: string; hora: string; nota: string };
  erro: ErroVisita | null;
  hoje: string;
  campoData: Ref<HTMLInputElement>;
  aoMudar: (parcial: Partial<CamposVisitaProps["campos"]>) => void;
  moradaLead: PedidoVisita["moradaLead"];
  destino: DestinoVisita;
  aoMudarDestino: (destino: DestinoVisita) => void;
}

const ERROS_DA_MORADA: readonly ErroVisita[] = ["ruaVazia", "codigoPostalInvalido", "notaAcessoComprida"];

/** Os campos da visita: dia, hora, nota e a morada da visita. */
function CamposVisita({ id, campos, erro, hoje, campoData, aoMudar, moradaLead, destino, aoMudarDestino }: CamposVisitaProps) {
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
      <MoradaVisitaCampos
        id={`${id}-morada`} moradaLead={moradaLead} valor={destino} aoMudar={aoMudarDestino}
        erro={erro !== null && ERROS_DA_MORADA.includes(erro) ? (erro as ErroMoradaVisita) : null}
      />
    </>
  );
}

function FormVisita({ pedido, hoje, aoMarcar, aoFechar }: { pedido: PedidoVisita; hoje: string; aoMarcar: ProviderProps["aoMarcar"]; aoFechar: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [campos, setCampos] = useState({ data: "", hora: "", nota: "" });
  const [destino, setDestino] = useState<DestinoVisita>(() => destinoInicial(pedido.moradaLead));
  const [tentou, setTentou] = useState(false);
  const campoData = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const erroAtual = validarVisita({ ...campos, destino }, hoje, pedido.moradaLead);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (erroAtual) {
      // O foco vai para o primeiro campo com erro (o dia, a hora, a nota ou a morada), depois de o erro aparecer.
      setTimeout(() => (formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? campoData.current)?.focus(), 0);
      return;
    }
    aoMarcar(pedido.pessoaId, { pedidoId: pedido.pedidoId, servico: pedido.servico }, { ...campos, destino });
    toast.success(t(`${V}done`, { name: pedido.nome }));
    aoFechar();
  };
  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="space-y-4">
      <CamposVisita
        id={id} campos={campos} erro={tentou ? erroAtual : null} hoje={hoje} campoData={campoData}
        aoMudar={(parcial) => setCampos((c) => ({ ...c, ...parcial }))}
        moradaLead={pedido.moradaLead} destino={destino} aoMudarDestino={setDestino}
      />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${V}cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${V}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

export function MarcarVisitaProvider({ hoje, aoMarcar, aoDevolverFoco, jaComVisita, children }: ProviderProps) {
  const { t } = useTranslation();
  const [pedido, setPedido] = useState<PedidoVisita | null>(null);
  const ultimo = useRef<PedidoVisita | null>(null);
  if (pedido) ultimo.current = pedido;
  const mostrado = pedido ?? ultimo.current;
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const valor = useMemo(
    () => ({ pedir: (p: PedidoVisita) => setPedido(p), marcadas: jaComVisita ? new Set([...marcadas, ...jaComVisita]) : marcadas }),
    [marcadas, jaComVisita],
  );
  const marcar: ProviderProps["aoMarcar"] = (pessoaId, escolha, dados) => {
    aoMarcar(pessoaId, escolha, dados);
    setMarcadas((antes) => new Set(antes).add(pessoaId));
  };
  return (
    <MarcarVisitaContext.Provider value={valor}>
      {children}
      <Dialog open={pedido !== null} onOpenChange={(aberto) => { if (!aberto) setPedido(null); }}>
        <DialogContent className="motion-reduce:!animate-none" onCloseAutoFocus={(e) => { if (aoDevolverFoco?.()) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>{t(`${V}title`)}</DialogTitle>
            {/* A visita é de um pedido: a descrição diz qual (uma pessoa pode ter vários, também sem serviço). */}
            <DialogDescription>
              {t("pessoasPagina.process.visitDescription", { name: mostrado?.pedidoNome ? `${mostrado.nome} · ${mostrado.pedidoNome}` : mostrado?.nome ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {mostrado && <FormVisita key={mostrado.pessoaId} pedido={mostrado} hoje={hoje} aoMarcar={marcar} aoFechar={() => setPedido(null)} />}
        </DialogContent>
      </Dialog>
    </MarcarVisitaContext.Provider>
  );
}
