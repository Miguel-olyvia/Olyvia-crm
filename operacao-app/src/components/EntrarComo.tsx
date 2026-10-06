import { useEffect, useMemo, useState } from "react";
import { ErroDeEscrita, listarEquipa, type MembroEquipa } from "../lib/dados";
import { DURACAO_MAX_MS, entrarComo, estadoEntrarComo, voltarAMinhaConta, type EstadoEntrarComo } from "../lib/entrarComo";
import { Button, Input, Modal, Spinner, cx } from "./ui";
import { ROTULO_FUNCAO } from "../domain/tipos";

const rotulo = (f: string) => (ROTULO_FUNCAO as Record<string, string>)[f] ?? (f === "supervisor" ? "Supervisor" : f);

/** Recarrega a app inteira: nenhum ecrã fica com dados da conta anterior. */
function recarregar(para: string) {
  window.location.assign(`${import.meta.env.BASE_URL.replace(/\/$/, "")}${para}`);
}

/** O estado "a ver como", atualizado quando muda noutro sítio da app. */
export function useEntrarComo(): EstadoEntrarComo | null {
  const [estado, setEstado] = useState(estadoEntrarComo);
  useEffect(() => {
    const ler = () => setEstado(estadoEntrarComo());
    window.addEventListener("operacao-entrar-como", ler);
    return () => window.removeEventListener("operacao-entrar-como", ler);
  }, []);
  return estado;
}

export async function sairDoEntrarComo() {
  try {
    await voltarAMinhaConta();
  } finally {
    recarregar("/");
  }
}

/** A faixa que não deixa esquecer em nome de quem se está a trabalhar. */
export function FaixaEntrarComo({ estado }: { estado: EstadoEntrarComo }) {
  const [aVoltar, setAVoltar] = useState(false);

  // Ao fim de uma hora, volta sozinho.
  useEffect(() => {
    const falta = estado.desde + DURACAO_MAX_MS - Date.now();
    const id = window.setTimeout(() => void sairDoEntrarComo(), Math.max(0, falta));
    return () => window.clearTimeout(id);
  }, [estado.desde]);

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-14 z-30 flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-3 py-1.5 text-sm text-amber-950 shadow print:hidden"
    >
      <span>
        A ver como <b>{estado.nome}</b> ({rotulo(estado.funcao)}). O que fizeres fica em nome desta pessoa.
      </span>
      <button
        type="button"
        disabled={aVoltar}
        onClick={() => {
          setAVoltar(true);
          void sairDoEntrarComo();
        }}
        className="rounded-md bg-amber-950 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-60"
      >
        {aVoltar ? "A voltar…" : "Voltar à minha conta"}
      </button>
    </div>
  );
}

/** Escolher a pessoa. Só aparecem as que se podem escolher; a base decide o resto. */
export function EscolherPessoa({
  orgId,
  euId,
  aoFechar,
}: {
  orgId: string;
  euId: string | null;
  aoFechar: () => void;
}) {
  const [equipa, setEquipa] = useState<MembroEquipa[] | null>(null);
  const [pesquisa, setPesquisa] = useState("");
  const [escolhida, setEscolhida] = useState<MembroEquipa | null>(null);
  const [aEntrar, setAEntrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarEquipa(orgId)
      .then((eq) => vivo && setEquipa(eq.filter((m) => m.utilizador_id !== euId && m.funcao !== "admin")))
      .catch(() => vivo && setErro("Não foi possível carregar a equipa."));
    return () => {
      vivo = false;
    };
  }, [orgId, euId]);

  const lista = useMemo(() => {
    const p = pesquisa.trim().toLowerCase();
    return (equipa ?? []).filter((m) => !p || `${m.nome} ${m.email} ${m.funcao}`.toLowerCase().includes(p));
  }, [equipa, pesquisa]);

  const entrar = async () => {
    if (!escolhida) return;
    setAEntrar(true);
    setErro(null);
    try {
      await entrarComo(orgId, escolhida.utilizador_id);
      recarregar("/minhas-tarefas");
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível entrar como essa pessoa.");
      setAEntrar(false);
    }
  };

  return (
    <Modal
      title="Ver a app como outra pessoa"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void entrar()} disabled={!escolhida || aEntrar}>
            {aEntrar ? "A entrar…" : escolhida ? `Entrar como ${escolhida.nome.split(" ")[0]}` : "Entrar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Abres a app com a conta da pessoa: vês as tarefas dela e o que fizeres (iniciar, fotos, validar) fica em nome
          dela. Fica registado. Voltas à tua conta na faixa amarela, ou sozinho ao fim de 1 hora.
        </p>
        <Input
          placeholder="Pesquisar por nome, email ou função…"
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          className="w-full"
        />
        {equipa === null && !erro ? (
          <Spinner label="A carregar a equipa" />
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {lista.map((m) => (
              <li key={m.utilizador_id}>
                <button
                  type="button"
                  onClick={() => setEscolhida(m)}
                  className={cx(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    escolhida?.utilizador_id === m.utilizador_id
                      ? "border-brand bg-brand-50"
                      : "border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{m.nome}</span>
                    <span className="block truncate text-xs text-slate-400">{m.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{rotulo(m.funcao)}</span>
                </button>
              </li>
            ))}
            {lista.length === 0 && <li className="px-1 text-sm text-slate-400">Ninguém encontrado.</li>}
          </ul>
        )}
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}
