/**
 * O separador Ausencias da ficha: a vista de RH sobre UMA pessoa.
 *
 * Contador, pedidos, ajustes e o ano em calendario. E tambem daqui que se
 * pede por outra pessoa (`hr.ausencias.pedir.outros`) e que se ajusta o
 * contador (`hr.ausencias.ajustar`).
 *
 * O QUE A CHEFIA NAO VE
 * ---------------------
 * Quem abre esta ficha por ser chefe da pessoa (`aprovar.chefia`) le pedidos e
 * dias, mas NAO le ajustes -- a RLS de `pessoas_ausencias_ajustes` tem so dois
 * ramos, `direitos.view` e a propria pessoa. O bloco de ajustes esconde-se, em
 * vez de aparecer vazio: vazio, a chefia leria "nao ha ajustes" quando o que
 * ha e falta de permissao.
 *
 * O separador nao carrega a ficha: carrega o SEU modulo, pelo hook proprio, e
 * recebe da ficha so o que ja estava carregado (a pessoa e o nome).
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { CalendarPlus, SlidersHorizontal } from "lucide-react";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { AjusteSaldoSheet } from "@/components/hr/ausencias/AjusteSaldoSheet";
import { AjustesTabela } from "@/components/hr/ausencias/AjustesTabela";
import { AusenciasContador } from "@/components/hr/ausencias/AusenciasContador";
import { CalendarioAnual } from "@/components/hr/ausencias/CalendarioAnual";
import { MotivoDialog } from "@/components/hr/ausencias/MotivoDialog";
import { PedidoDetalheSheet } from "@/components/hr/ausencias/PedidoDetalheSheet";
import { PedidosLista } from "@/components/hr/ausencias/PedidosLista";
import { PedirAusenciaSheet } from "@/components/hr/ausencias/PedirAusenciaSheet";
import { useAusenciasDaPessoa } from "@/hooks/useAusenciasDaPessoa";
import { useAusenciasTipos } from "@/hooks/useAusenciasTipos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";

export interface PermissoesAusenciasFicha {
  view: boolean;
  pedir: boolean;
  pedirOutros: boolean;
  aprovarChefia: boolean;
  aprovarRh: boolean;
  direitosView: boolean;
  ajustar: boolean;
  historicoEditar: boolean;
  justificacaoView: boolean;
}

interface PessoaAusenciasTabProps {
  pessoaId: string;
  pessoaNome: string;
  /** Quem esta a olhar e a propria pessoa da ficha. */
  souAPessoa: boolean;
  permissoes: PermissoesAusenciasFicha;
  /** Nome de quem aprova o passo de chefia. Null = passo dispensado. */
  aprovadorChefiaNome?: string | null;
  nomePorPessoaId?: Map<string, string>;
}

export function PessoaAusenciasTab({
  pessoaId,
  pessoaNome,
  souAPessoa,
  permissoes,
  aprovadorChefiaNome,
  nomePorPessoaId,
}: PessoaAusenciasTabProps) {
  const { t } = useTranslation();
  const dados = useAusenciasDaPessoa(pessoaId);
  const tipos = useAusenciasTipos();

  const [aPedir, setAPedir] = useState(false);
  const [dataInicial, setDataInicial] = useState<string | null>(null);
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [aAjustar, setAAjustar] = useState(false);
  const [tipoDoAjuste, setTipoDoAjuste] = useState<string | null>(null);
  const [ajusteAAnular, setAjusteAAnular] = useState<string | null>(null);
  const [ano, setAno] = useState(() => new Date().getFullYear());

  const podeVer = permissoes.view || souAPessoa || permissoes.aprovarChefia;
  const podePedir = permissoes.pedirOutros || (souAPessoa && permissoes.pedir);

  const periodoActual = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const cobre = dados.direitos.find(
      (direito) => direito.periodo_inicio <= hoje && direito.periodo_fim >= hoje,
    );
    return cobre?.periodo_inicio ?? dados.saldos[0]?.periodo_inicio ?? null;
  }, [dados.direitos, dados.saldos]);

  const pedidoSeleccionado = useMemo(
    () => dados.pedidos.find((pedido) => pedido.id === pedidoAberto) ?? null,
    [dados.pedidos, pedidoAberto],
  );

  const diasDoAno = useMemo(
    () => dados.dias.filter((dia) => dia.data.startsWith(String(ano))),
    [dados.dias, ano],
  );

  if (!podeVer) return <SemAcessoCard />;
  if (dados.loading || tipos.loading) return <OlyviaLoader />;

  const anularAjuste = async (motivo: string) => {
    if (!ajusteAAnular) return;
    const erro = await dados.anularAjuste(ajusteAAnular, motivo);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.ausencias.ajuste.anulado"));
    setAjusteAAnular(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium">{t("hr.ausencias.ficha.titulo")}</h2>
        <div className="flex gap-2">
          {permissoes.ajustar && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTipoDoAjuste(null);
                setAAjustar(true);
              }}
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              {t("hr.ausencias.ajuste.titulo")}
            </Button>
          )}
          {podePedir && (
            <Button
              size="sm"
              onClick={() => {
                setDataInicial(null);
                setAPedir(true);
              }}
            >
              <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
              {t("hr.ausencias.pedir.titulo")}
            </Button>
          )}
        </div>
      </div>

      <AusenciasContador
        saldos={dados.saldos}
        tiposPorId={tipos.porId}
        periodoInicio={periodoActual}
        recusado={dados.saldosRecusados}
        onVerAjustes={
          permissoes.direitosView || souAPessoa
            ? (tipoId) => {
                setTipoDoAjuste(tipoId);
                document.getElementById("hr-ausencias-ajustes")?.scrollIntoView({
                  behavior: "smooth",
                });
              }
            : undefined
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("hr.ausencias.ficha.pedidos")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pendentes" className="space-y-3">
            <TabsList>
              <TabsTrigger value="pendentes">{t("hr.ausencias.ficha.pendentes")}</TabsTrigger>
              <TabsTrigger value="historico">{t("hr.ausencias.ficha.historico")}</TabsTrigger>
              <TabsTrigger value="calendario">{t("hr.ausencias.ficha.calendario")}</TabsTrigger>
            </TabsList>

            <TabsContent value="pendentes">
              <PedidosLista
                pedidos={dados.pedidos.filter(
                  (pedido) =>
                    pedido.estado === "pendente_chefia" || pedido.estado === "pendente_rh",
                )}
                tiposPorId={tipos.porId}
                vazioTexto={t("hr.ausencias.ficha.semPendentes")}
                onAbrir={setPedidoAberto}
              />
            </TabsContent>

            <TabsContent value="historico">
              <PedidosLista
                pedidos={dados.pedidos.filter(
                  (pedido) =>
                    pedido.estado !== "pendente_chefia" && pedido.estado !== "pendente_rh",
                )}
                tiposPorId={tipos.porId}
                vazioTexto={t("hr.ausencias.ficha.semHistorico")}
                onAbrir={setPedidoAberto}
              />
            </TabsContent>

            <TabsContent value="calendario" className="space-y-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setAno((v) => v - 1)}>
                  {ano - 1}
                </Button>
                <span className="text-sm font-medium tabular-nums">{ano}</span>
                <Button size="sm" variant="outline" onClick={() => setAno((v) => v + 1)}>
                  {ano + 1}
                </Button>
              </div>
              <CalendarioAnual
                ano={ano}
                dias={diasDoAno}
                tiposPorId={tipos.porId}
                feriados={dados.feriados}
                onAbrirPedido={setPedidoAberto}
                onEscolherDiaLivre={
                  podePedir
                    ? (isoData) => {
                        setDataInicial(isoData);
                        setAPedir(true);
                      }
                    : undefined
                }
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {!dados.ajustesRecusados && (permissoes.direitosView || souAPessoa) && (
        <Card id="hr-ausencias-ajustes">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("hr.ausencias.ficha.ajustes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AjustesTabela
              ajustes={
                tipoDoAjuste
                  ? dados.ajustes.filter((ajuste) => ajuste.tipo_id === tipoDoAjuste)
                  : dados.ajustes
              }
              tiposPorId={tipos.porId}
              podeAnular={permissoes.ajustar}
              onAnular={setAjusteAAnular}
            />
          </CardContent>
        </Card>
      )}

      <PedirAusenciaSheet
        aberto={aPedir}
        onFechar={() => setAPedir(false)}
        tipos={tipos.activos}
        saldos={dados.saldos}
        direitos={dados.direitos}
        feriados={dados.feriados}
        pessoaNome={pessoaNome}
        aprovadorChefiaNome={aprovadorChefiaNome ?? null}
        dataInicial={dataInicial}
        saving={dados.saving}
        onPedir={(pedido) => dados.pedir({ ...pedido, origem: "ficha" })}
        idPrefixo="hr-ficha-pedir"
      />

      <AjusteSaldoSheet
        aberto={aAjustar}
        onFechar={() => setAAjustar(false)}
        tipos={tipos.activos}
        saldos={dados.saldos}
        direitos={dados.direitos}
        pessoaNome={pessoaNome}
        saving={dados.saving}
        tipoInicial={tipoDoAjuste}
        onAjustar={dados.ajustarSaldo}
        idPrefixo="hr-ficha-ajuste"
      />

      {pedidoSeleccionado && (
        <PedidoDetalheSheet
          pedido={pedidoSeleccionado}
          decisoes={dados.decisoesPorPedido.get(pedidoSeleccionado.id) ?? []}
          tipo={tipos.porId.get(pedidoSeleccionado.tipo_id) ?? null}
          pessoaNome={pessoaNome}
          nomePorPessoaId={nomePorPessoaId}
          souOAutor={souAPessoa}
          saving={dados.saving}
          permissoes={{
            aprovarChefia: permissoes.aprovarChefia,
            aprovarRh: permissoes.aprovarRh,
            editarHistorico: permissoes.historicoEditar,
            verJustificacao: permissoes.justificacaoView,
          }}
          onFechar={() => setPedidoAberto(null)}
          onDecidirChefia={dados.decidirChefia}
          onDecidirRh={dados.decidirRh}
          onCancelar={dados.cancelar}
          onCorrigirAprovado={dados.corrigirAprovado}
          onRevelarJustificacao={
            permissoes.justificacaoView ? dados.revelarJustificacao : undefined
          }
          onVerMotivo={dados.verMotivo}
        />
      )}

      <MotivoDialog
        aberto={ajusteAAnular !== null}
        titulo={t("hr.ausencias.ajuste.anular")}
        descricao={t("hr.ausencias.ajuste.anularDescricao")}
        rotuloConfirmar={t("hr.ausencias.ajuste.anular")}
        destrutivo
        aGravar={dados.saving}
        onFechar={() => setAjusteAAnular(null)}
        onConfirmar={(resultado) => void anularAjuste(resultado.motivo)}
        idPrefixo="hr-anular-ajuste"
      />
    </div>
  );
}
