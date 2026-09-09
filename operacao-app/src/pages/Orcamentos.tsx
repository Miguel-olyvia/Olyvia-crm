import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  ErroDeEscrita,
  listarClientes,
  listarLocais,
  listarOrcamentos,
  obraDeOrcamento,
  type Cliente,
  type LocalRow,
  type OrcamentoAceite,
} from "../lib/dados";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
  Toggle,
} from "../components/ui";
import { Euro, Inbox, MapPin } from "../components/icons";
import { euros } from "../lib/formatar";
import SeletorDeLocal from "../components/SeletorDeLocal";

/**
 * Orçamentos aceites à espera de virar obra.
 *
 * A ponte entre as duas metades da empresa. O comercial fecha um orçamento no
 * CRM; até hoje alguém tinha de abrir o Infraspeak e reescrever tudo à mão,
 * com os custos previstos a ficarem para trás.
 *
 * Uma nota sobre o número que se mostra: NÃO é o total do orçamento. É a soma
 * de `custo_material_unit + custo_mao_obra_unit` das linhas — o CUSTO. Comparar
 * o gasto real contra o preço de venda daria um desvio bonito e falso, porque
 * o preço leva margem e IVA lá dentro.
 */

export default function Orcamentos() {
  const navegar = useNavigate();
  const { activeOrgId } = useAuth();

  const [orcamentos, setOrcamentos] = useState<OrcamentoAceite[]>([]);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [mostrarFeitos, setMostrarFeitos] = useState(false);

  const [aAbrir, setAAbrir] = useState<OrcamentoAceite | null>(null);
  const [localId, setLocalId] = useState("");
  const [quando, setQuando] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setACarregar(true);
    setErro(null);
    try {
      const [os, cs, ls] = await Promise.all([
        listarOrcamentos(activeOrgId),
        listarClientes(activeOrgId),
        listarLocais(activeOrgId),
      ]);
      setOrcamentos(os);
      setClientes(new Map(cs.map((c) => [c.id, c.nome])));
      setLocais(ls);
    } catch (e) {
      setErro(
        e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar os orçamentos."
      );
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () => (mostrarFeitos ? orcamentos : orcamentos.filter((o) => !o.tem_obra)),
    [orcamentos, mostrarFeitos]
  );

  const porFazer = orcamentos.filter((o) => !o.tem_obra).length;

  const abrir = async () => {
    if (!aAbrir) return;
    setAGravar(true);
    setErroAcao(null);
    try {
      const r = await obraDeOrcamento({
        orcamentoId: aAbrir.id,
        localId: localId || null,
        agendadaPara: quando ? new Date(quando).toISOString() : null,
      });
      navegar(`/ordens/${r.codigo}`);
    } catch (e) {
      setErroAcao(
        e instanceof ErroDeEscrita
          ? e.message
          : "Não foi possível falar com o servidor. Tenta outra vez."
      );
    } finally {
      setAGravar(false);
    }
  };

  if (aCarregar) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Orçamentos</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {porFazer === 0
              ? "Nenhum orçamento aceite à espera de obra."
              : porFazer === 1
                ? "1 orçamento aceite à espera de obra."
                : `${porFazer} orçamentos aceites à espera de obra.`}
          </p>
        </div>
        <Toggle
          checked={mostrarFeitos}
          onChange={setMostrarFeitos}
          label="Mostrar os que já têm obra"
        />
      </div>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={<Inbox width={22} height={22} />}
          title={porFazer === 0 ? "Está tudo a andar" : "Nada a mostrar"}
          description={
            porFazer === 0
              ? "Todos os orçamentos aceites já têm obra aberta. Quando o comercial fechar outro, aparece aqui."
              : "Liga o interruptor acima para ver os que já viraram obra."
          }
        />
      ) : (
        <div className="space-y-2">
          {visiveis.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium tabular text-slate-500">
                      {o.numero}
                    </span>
                    {o.tem_obra ? (
                      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                        já tem obra
                      </Badge>
                    ) : (
                      <Badge className="bg-brand-50 text-brand-800 ring-brand-200">
                        por pôr a andar
                      </Badge>
                    )}
                  </div>

                  <p className="mt-1 text-sm font-medium text-slate-800">{o.titulo}</p>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {o.cliente_id ? (clientes.get(o.cliente_id) ?? "Cliente") : "Sem cliente"}
                    {o.accepted_at && (
                      <>
                        {" · aceite a "}
                        {new Date(o.accepted_at).toLocaleDateString("pt-PT")}
                      </>
                    )}
                  </p>

                  {o.obra_endereco && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                      <MapPin width={12} height={12} className="text-slate-400" />
                      {o.obra_endereco}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-semibold tabular text-slate-800">
                    {euros(o.custo_previsto)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    custo previsto · {o.linhas} {o.linhas === 1 ? "linha" : "linhas"}
                  </p>
                  {o.total != null && Number(o.total) !== Number(o.custo_previsto) && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      ao cliente: {euros(o.total)}
                    </p>
                  )}

                  {!o.tem_obra && (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setAAbrir(o);
                        setLocalId("");
                        setQuando("");
                        setErroAcao(null);
                      }}
                    >
                      Pôr a andar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {aAbrir && (
        <Modal
          title={`Abrir obra — ${aAbrir.numero}`}
          onClose={() => setAAbrir(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAAbrir(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void abrir()} disabled={aGravar}>
                {aGravar ? "A abrir…" : "Abrir obra"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50/70 p-3">
              <p className="text-sm font-medium text-slate-800">{aAbrir.titulo}</p>
              <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm tabular text-slate-600">
                <Euro width={13} height={13} className="text-slate-400" />
                {euros(aAbrir.custo_previsto)} de custo previsto
              </p>
              <p className="mt-1 text-xs text-slate-500">
                As {aAbrir.linhas} {aAbrir.linhas === 1 ? "linha fica congelada" : "linhas ficam congeladas"}{" "}
                na obra. Rever o orçamento depois não muda o que ficou aqui.
              </p>
            </div>

            <SeletorDeLocal
              clienteId={aAbrir.cliente_id ?? ""}
              locais={locais}
              valor={localId}
              aoEscolher={setLocalId}
              aoCriar={() => setRecarga((r) => r + 1)}
            />

            <Field label="Data e hora" hint="Opcional. Podes marcar depois, na ficha da obra.">
              <Input
                type="datetime-local"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                className="w-full"
              />
            </Field>

            {erroAcao && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroAcao}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
