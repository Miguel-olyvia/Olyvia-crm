import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  ErroDeEscrita,
  ativosDoLocal,
  criarOrdem,
  listarChecklists,
  listarClientes,
  listarEquipa,
  listarLocais,
  type AtivoRow,
  type Cliente,
  type LocalRow,
  type MembroEquipa,
} from "../lib/dados";
import {
  Button,
  Card,
  Combobox,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  cx,
} from "../components/ui";
import { ChevronLeft } from "../components/icons";
import { ROTULO_ORIGEM, ROTULO_PRIORIDADE, ORIGENS, PRIORIDADES } from "../domain/tipos";

/**
 * Abrir uma ordem — o caso do telefone a tocar.
 *
 * Até aqui as ordens só nasciam sozinhas: de um plano preventivo, ou de uma
 * não conformidade. Faltava o caso mais comum de todos.
 *
 * O formulário pede quatro coisas e mais nada: quem, o quê, onde, e para
 * quando. Tudo o resto tem valor por omissão e pode ficar para depois — quem
 * está ao telefone com um cliente irritado não preenche catorze campos.
 *
 * A ordem nasce por aprovar se quem a abre for técnico, e já na fila se for
 * gestor. Isso é decidido na base, não aqui: o ecrã limita-se a dizer o que
 * vai acontecer, para ninguém ficar à espera de uma ordem que ainda precisa
 * de aprovação.
 */

export default function NovaOrdem() {
  const navegar = useNavigate();
  const { activeOrgId, funcao } = useAuth();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [ativos, setAtivos] = useState<AtivoRow[]>([]);
  const [equipa, setEquipa] = useState<MembroEquipa[]>([]);
  const [checklists, setChecklists] = useState<{ id: string; codigo: string; nome: string }[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [localId, setLocalId] = useState("");
  const [ativoId, setAtivoId] = useState("");
  const [checklistId, setChecklistId] = useState("");
  const [origem, setOrigem] = useState("corretiva");
  const [prioridade, setPrioridade] = useState("normal");
  const [descricao, setDescricao] = useState("");
  const [contactoNome, setContactoNome] = useState("");
  const [contactoTelefone, setContactoTelefone] = useState("");
  const [agendadaPara, setAgendadaPara] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [maisCampos, setMaisCampos] = useState(false);

  const [aGravar, setAGravar] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setACarregar(true);
    setErro(null);
    (async () => {
      try {
        const [cls, lcs, eq, cks] = await Promise.all([
          listarClientes(activeOrgId),
          listarLocais(activeOrgId),
          listarEquipa(activeOrgId),
          listarChecklists(activeOrgId),
        ]);
        if (!vivo) return;
        setClientes(cls);
        setLocais(lcs);
        setEquipa(eq);
        setChecklists(cks);
      } catch (e) {
        if (vivo) {
          setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar os dados.");
        }
      } finally {
        if (vivo) setACarregar(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [activeOrgId]);

  // Os ativos são do local. Sem local escolhido não se mostram — uma lista de
  // todos os equipamentos de todos os clientes não ajuda ninguém.
  useEffect(() => {
    if (!localId) {
      setAtivos([]);
      setAtivoId("");
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const as = await ativosDoLocal(localId);
        if (vivo) setAtivos(as);
      } catch {
        if (vivo) setAtivos([]);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [localId]);

  // Escolher o cliente estreita os locais. Escolher o local sem cliente
  // preenche o cliente — as duas coisas concordam, venha de onde vier.
  const locaisDoCliente = useMemo(
    () => (clienteId ? locais.filter((l) => l.cliente_id === clienteId) : locais),
    [locais, clienteId]
  );

  const escolherLocal = (id: string) => {
    setLocalId(id);
    const l = locais.find((x) => x.id === id);
    if (l && !clienteId) setClienteId(l.cliente_id);
  };

  const escolherCliente = (id: string) => {
    setClienteId(id);
    const l = locais.find((x) => x.id === localId);
    if (l && l.cliente_id !== id) {
      setLocalId("");
      setAtivoId("");
    }
  };

  const podeGravar = titulo.trim().length > 0 && clienteId.length > 0 && !aGravar;

  // O que vai acontecer, dito antes de acontecer.
  const vaiFicar = funcao === "tecnico" ? "por aprovar" : "na fila, agendada";

  const gravar = async () => {
    if (!podeGravar) return;
    setAGravar(true);
    setErroAcao(null);
    try {
      const r = await criarOrdem({
        titulo: titulo.trim(),
        clienteId,
        origem,
        prioridade,
        descricao: descricao.trim() || null,
        localId: localId || null,
        ativoId: ativoId || null,
        checklistId: checklistId || null,
        contactoNome: contactoNome.trim() || null,
        contactoTelefone: contactoTelefone.trim() || null,
        agendadaPara: agendadaPara ? new Date(agendadaPara).toISOString() : null,
        responsavelId: responsavelId || null,
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
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="space-y-4">
        <Voltar />
        <ErrorState message={erro} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Voltar />

      <Card className="p-4 sm:p-5">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Nova ordem</h1>
        <p className="mt-1 text-sm text-slate-500">
          Vai ficar {vaiFicar}. O resto pode ser preenchido depois.
        </p>

        <div className="mt-5 space-y-4">
          <Field label="O que se passa" hint="É isto que aparece na lista. Sê concreto.">
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Portão da garagem não abre"
              className="w-full"
              autoFocus
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente">
              <Combobox
                value={clienteId}
                onChange={escolherCliente}
                options={clientes.map((c) => ({ value: c.id, label: c.nome }))}
                placeholder="Escolher cliente"
                className="w-full"
              />
            </Field>

            <Field
              label="Local"
              hint={
                clienteId && locaisDoCliente.length === 0
                  ? "Este cliente ainda não tem locais."
                  : undefined
              }
            >
              <Combobox
                value={localId}
                onChange={escolherLocal}
                options={locaisDoCliente.map((l) => ({
                  value: l.id,
                  label: `${l.nome} · ${l.codigo}`,
                }))}
                placeholder="Escolher local"
                className="w-full"
                disabled={locaisDoCliente.length === 0}
              />
            </Field>
          </div>

          {ativos.length > 0 && (
            <Field label="Equipamento" hint="Opcional. Liga a ordem ao histórico do equipamento.">
              <Combobox
                value={ativoId}
                onChange={setAtivoId}
                options={ativos.map((a) => ({ value: a.id, label: `${a.nome} · ${a.codigo}` }))}
                placeholder="Nenhum em concreto"
                className="w-full"
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Origem">
              <Select
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                className="w-full"
              >
                {ORIGENS.map((o) => (
                  <option key={o} value={o}>
                    {ROTULO_ORIGEM[o]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Prioridade">
              <Select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
                className="w-full"
              >
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PRIORIDADE[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Detalhe" hint="Opcional. O que o cliente disse, por palavras dele.">
            <Textarea
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Faz barulho e para a meio. Já aconteceu na semana passada."
              className="w-full"
            />
          </Field>

          {/* O resto é útil, mas não é para agora. Fica atrás de um clique
              para o formulário caber num ecrã de telemóvel. */}
          <button
            type="button"
            onClick={() => setMaisCampos((m) => !m)}
            className="text-sm font-medium text-brand transition-colors hover:text-brand-dark"
          >
            {maisCampos ? "− Menos campos" : "+ Atribuir, agendar, contacto no local"}
          </button>

          {maisCampos && (
            <div className="space-y-4 rounded-lg bg-slate-50/70 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Responsável" hint="Quem entra na ordem passa a poder executá-la.">
                  <Combobox
                    value={responsavelId}
                    onChange={setResponsavelId}
                    options={equipa.map((m) => ({ value: m.utilizador_id, label: m.nome }))}
                    placeholder="Por atribuir"
                    className="w-full"
                  />
                </Field>

                <Field label="Data e hora">
                  <Input
                    type="datetime-local"
                    value={agendadaPara}
                    onChange={(e) => setAgendadaPara(e.target.value)}
                    className="w-full"
                  />
                </Field>
              </div>

              {checklists.length > 0 && (
                <Field
                  label="Procedimento a cumprir"
                  hint="As tarefas da checklist vêm com a ordem, congeladas na versão de hoje."
                >
                  <Combobox
                    value={checklistId}
                    onChange={setChecklistId}
                    options={checklists.map((c) => ({
                      value: c.id,
                      label: `${c.nome} · ${c.codigo}`,
                    }))}
                    placeholder="Nenhum"
                    className="w-full"
                  />
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contacto no local">
                  <Input
                    value={contactoNome}
                    onChange={(e) => setContactoNome(e.target.value)}
                    placeholder="Nome de quem abre a porta"
                    className="w-full"
                  />
                </Field>
                <Field label="Telefone">
                  <Input
                    value={contactoTelefone}
                    onChange={(e) => setContactoTelefone(e.target.value)}
                    placeholder="912 000 000"
                    className="w-full"
                  />
                </Field>
              </div>
            </div>
          )}

          {erroAcao && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroAcao}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <Button onClick={() => void gravar()} disabled={!podeGravar}>
              {aGravar ? "A abrir…" : "Abrir ordem"}
            </Button>
            <Link
              to="/ordens"
              className={cx(
                "inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-2",
                "text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              )}
            >
              Cancelar
            </Link>
            {!podeGravar && !aGravar && (
              <span className="text-xs text-slate-400">
                {titulo.trim() ? "Falta escolher o cliente." : "Falta dizer o que se passa."}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Voltar() {
  return (
    <Link
      to="/ordens"
      className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-brand"
    >
      <ChevronLeft width={16} height={16} /> Ordens
    </Link>
  );
}
