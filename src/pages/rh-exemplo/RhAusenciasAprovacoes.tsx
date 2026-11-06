/**
 * A caixa de entrada de quem decide -- chefia e RH no MESMO ecra.
 *
 * PORQUE E QUE OS DOIS PAPEIS PARTILHAM O ECRA
 * --------------------------------------------
 * Uma pessoa pode ser chefe de uma equipa E estar no RH. Se fossem dois ecras,
 * essa pessoa andava a saltar entre eles para nao perder pedidos. Aqui a lista
 * e uma so e cada linha diz em que passo esta; as accoes disponiveis no
 * detalhe e que mudam conforme a permissao e o passo.
 *
 * A LISTA NAO E FILTRADA POR NOS
 * ------------------------------
 * Quem ve o que decide-o a RLS: `hr.ausencias.view` ve a organizacao toda, e a
 * chefia ve a sua cadeia por `hr_ausencias_pessoa_na_minha_cadeia`. Repetir a
 * regra no cliente daria duas versoes da mesma coisa.
 *
 * O SEPARADOR «A DECIDIR» E UMA FILA DE PESSOAS
 * ---------------------------------------------
 * Mostra so as PESSOAS com pedidos por decidir (o numero conta pessoas); ao abrir uma, o painel junta todos os pedidos
 * dela, com as accoes nos proprios itens. E a mesma lista e o mesmo painel da fila do mapa de assiduidade (`FilaDeAusencias`).
 * A lista de «Decididos» continua a ser a tabela por pedido: e historico, nao fila de trabalho.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { PedidoDetalheSheet } from "@/components/rh-exemplo/ausencias/PedidoDetalheSheet";
import { FilaDeAusencias } from "@/components/rh-exemplo/ausencias/fila/FilaDeAusencias";
import { PedidosLista } from "@/components/rh-exemplo/ausencias/PedidosLista";
import { useFilaDeAusencias } from "@/components/rh-exemplo/hooks/useFilaDeAusencias";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";

interface AprovacoesConteudoProps {
  /**
   * Nome do parametro de URL usado para o sub-separador (aDecidir/decididos).
   * Configuravel porque, dentro de `AusenciasGestao`, o separador de topo
   * (Aprovacoes/Organizacao) ja usa "tab" -- usar o mesmo nome aqui pisava o
   * estado um do outro.
   */
  tabParam?: string;
}

/**
 * So o conteudo (sem h1/descricao de pagina): usado standalone abaixo e
 * tambem dentro de `AusenciasGestao.tsx`, que fornece o proprio titulo.
 */
export function AprovacoesConteudo({ tabParam = "tab" }: AprovacoesConteudoProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get(tabParam) || "aDecidir";

  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { pessoas } = usePessoas();
  const minha = useMinhaPessoa();

  const podeChefia = hasPermission("hr.ausencias.aprovar.chefia");
  const podeRh = hasPermission("hr.ausencias.aprovar.rh");

  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);

  const nomePorPessoaId = useMemo(
    () => new Map(pessoas.map((pessoa) => [pessoa.id, pessoa.nome_completo])),
    [pessoas],
  );

  // A fila, os pedidos e os tipos saem da MESMA leitura (uma so instancia do hook da organizacao).
  const { fila, dados, tipos } = useFilaDeAusencias(nomePorPessoaId, {
    aprovarChefia: podeChefia,
    aprovarRh: podeRh,
  });

  const jaDecididos = useMemo(
    () =>
      dados.pedidos.filter(
        (pedido) => pedido.estado !== "pendente_chefia" && pedido.estado !== "pendente_rh",
      ),
    [dados.pedidos],
  );

  const pedidoSeleccionado = useMemo(
    () => dados.pedidos.find((pedido) => pedido.id === pedidoAberto) ?? null,
    [dados.pedidos, pedidoAberto],
  );

  // A fonte falhou: nao se afirmam contagens («0 pessoas») nem listas vazias («sem decididos») que a leitura nao prova.
  const leituraComErro = fila.fontes.ausencias === "erro";
  const textoErroLeitura = t("rhFila.aviso.erro", { fonte: t("rhFila.fonte.ausencias") });

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeChefia && !podeRh) return <SemAcessoCard className="m-6" />;

  const mudarTab = (valor: string) =>
    setSearchParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        proximos.set(tabParam, valor);
        return proximos;
      },
      { replace: true },
    );

  return (
    <>
      {dados.recusado ? (
        <SemAcessoCard />
      ) : fila.aCarregar ? (
        // So ate a primeira resposta: as releituras depois de decidir nao podem desmontar a fila nem o painel aberto.
        <OlyviaLoader />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {leituraComErro
                ? t("hr.ausencias.aprovacoes.aDecidir")
                : t("rhFila.ausencias.contador", {
                    pessoas: t(fila.pessoas.length === 1 ? "rhFila.pessoas.um" : "rhFila.pessoas.varios", {
                      n: String(fila.pessoas.length),
                    }),
                  })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={mudarTab} className="space-y-3">
              <TabsList>
                <TabsTrigger value="aDecidir">
                  {t("hr.ausencias.aprovacoes.aDecidir")}
                </TabsTrigger>
                <TabsTrigger value="decididos">
                  {t("hr.ausencias.aprovacoes.decididos")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="aDecidir">
                <FilaDeAusencias
                  fila={fila}
                  permissoes={{ aprovarChefia: podeChefia, aprovarRh: podeRh }}
                  decisoes={{
                    decidirChefia: dados.decidirChefia,
                    decidirRh: dados.decidirRh,
                    saving: dados.saving,
                  }}
                  aoAbrirDetalhe={setPedidoAberto}
                />
              </TabsContent>

              <TabsContent value="decididos">
                {leituraComErro && (
                  <p role="alert" className="mb-3 text-sm text-destructive">{textoErroLeitura}</p>
                )}
                <PedidosLista
                  pedidos={jaDecididos}
                  tiposPorId={tipos.porId}
                  nomePorPessoaId={nomePorPessoaId}
                  vazioTexto={leituraComErro ? textoErroLeitura : t("hr.ausencias.aprovacoes.semDecididos")}
                  onAbrir={setPedidoAberto}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {pedidoSeleccionado && (
        <PedidoDetalheSheet
          pedido={pedidoSeleccionado}
          decisoes={dados.decisoesPorPedido.get(pedidoSeleccionado.id) ?? []}
          tipo={tipos.porId.get(pedidoSeleccionado.tipo_id) ?? null}
          pessoaNome={nomePorPessoaId.get(pedidoSeleccionado.pessoa_id) ?? "—"}
          nomePorPessoaId={nomePorPessoaId}
          souOAutor={minha.pessoaId === pedidoSeleccionado.pessoa_id}
          saving={dados.saving}
          pedidos={dados.pedidos}
          permissoes={{
            aprovarChefia: podeChefia,
            aprovarRh: podeRh,
            editarHistorico: hasPermission("hr.ausencias.historico.editar"),
            verJustificacao: hasPermission("hr.ausencias.justificacao.view"),
            // Sem `onIniciarAlteracao` (este ecra nao tem a RPC de alteracao
            // ligada): o botao nunca aparece aqui, mesmo com a permissao.
            pedir: hasPermission("hr.ausencias.pedir"),
            pedirOutros: hasPermission("hr.ausencias.pedir.outros"),
          }}
          onFechar={() => setPedidoAberto(null)}
          onDecidirChefia={dados.decidirChefia}
          onDecidirRh={dados.decidirRh}
          onCancelar={dados.cancelar}
          onCorrigirAprovado={dados.corrigirAprovado}
          onVerMotivo={dados.verMotivo}
        />
      )}
    </>
  );
}

