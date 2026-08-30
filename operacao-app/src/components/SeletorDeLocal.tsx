import { useEffect, useMemo, useState } from "react";
import { ErroDeEscrita, type LocalRow } from "../lib/dados";
import {
  criarLocal,
  moradasDoCliente,
  type MoradaDoCliente,
} from "../lib/config";
import { Button, Combobox, Field, Input, Select, cx } from "./ui";
import { MapPin, Plus, X } from "./icons";

/**
 * Escolher o sítio — ou criá-lo sem sair daqui.
 *
 * O que isto resolve, dito por quem estava a usar: para abrir uma ordem num
 * sítio novo era preciso sair, ir a Definições, criar o local, e voltar. Três
 * ecrãs para uma coisa que devia ser um botão.
 *
 * E o sítio quase sempre já está no CRM. O cliente tem a morada na ficha, e
 * mesmo assim alguém a escrevia outra vez — com hipótese de a escrever de
 * outra maneira, e ficarem duas versões da mesma casa.
 *
 * Por isso a ordem em que as coisas aparecem:
 *
 *  1. os locais que já existem — o caso comum;
 *  2. as moradas que o CRM já tem e ainda não são local — um toque e existe;
 *  3. criar do nada — para o que não está em lado nenhum.
 *
 * Usado em Nova ordem, Planos e Orçamentos. A mesma fricção estava nos três.
 */

export default function SeletorDeLocal({
  clienteId,
  locais,
  valor,
  aoEscolher,
  aoCriar,
  desativado,
}: {
  clienteId: string;
  /** Os locais já existentes, do ecrã pai. */
  locais: readonly LocalRow[];
  valor: string;
  aoEscolher: (id: string) => void;
  /** Chamado depois de criar, para o pai recarregar a lista. */
  aoCriar: (id: string) => void;
  desativado?: boolean;
}) {
  const [moradas, setMoradas] = useState<MoradaDoCliente[]>([]);
  // Enquanto não se souber, não se diz nada. Dizer "não tem morada" e depois
  // aparecerem duas é pior do que esperar meio segundo.
  const [aProcurar, setAProcurar] = useState(false);
  const [aCriar, setACriar] = useState<MoradaDoCliente | "novo" | null>(null);
  const [aGravar, setAGravar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const doCliente = useMemo(
    () => (clienteId ? locais.filter((l) => l.cliente_id === clienteId) : []),
    [locais, clienteId]
  );

  useEffect(() => {
    if (!clienteId) {
      setMoradas([]);
      return;
    }
    let vivo = true;
    setAProcurar(true);
    void moradasDoCliente(clienteId)
      .then((ms) => {
        if (vivo) setMoradas(ms);
      })
      .finally(() => {
        if (vivo) setAProcurar(false);
      });
    return () => {
      vivo = false;
    };
  }, [clienteId, locais]);

  const porUsar = moradas.filter((m) => !m.ja_e_local);

  const criarDaMorada = async (m: MoradaDoCliente) => {
    setAGravar(m.address_id);
    setErro(null);
    try {
      const r = await criarLocal({ clienteId, addressId: m.address_id });
      aoEscolher(r.id);
      aoCriar(r.id);
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível criar o local.");
    } finally {
      setAGravar(null);
    }
  };

  if (!clienteId) {
    return (
      <Field label="Local" hint="Escolhe primeiro o cliente.">
        <Combobox value="" onChange={() => {}} options={[]} placeholder="—" className="w-full" disabled />
      </Field>
    );
  }

  return (
    <div className="space-y-2">
      <Field
        label="Local"
        hint={
          doCliente.length === 0 && porUsar.length === 0
            ? "Este cliente ainda não tem sítios. Cria um aqui mesmo."
            : undefined
        }
      >
        <div className="flex items-center gap-2">
          <Combobox
            value={valor}
            onChange={aoEscolher}
            options={doCliente.map((l) => ({ value: l.id, label: l.nome }))}
            placeholder={doCliente.length === 0 ? "Nenhum ainda" : "Escolher"}
            className="min-w-0 flex-1"
            disabled={desativado || doCliente.length === 0}
            icon={<MapPin width={14} height={14} />}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={desativado}
            onClick={() => setACriar("novo")}
            className="shrink-0"
          >
            <Plus width={14} height={14} /> Novo
          </Button>
        </div>
      </Field>

      {/*
        Vazio sem explicação é pior do que um erro: quem não vê a caixa fica
        sem saber se está avariado ou se não há dados. Por isso os três casos
        dizem-se por escrito.
      */}
      {!aProcurar && moradas.length === 0 && (
        <p className="text-xs text-slate-400">
          Este cliente não tem morada na ficha do CRM. Cria o sítio no botão acima.
        </p>
      )}

      {!aProcurar && moradas.length > 0 && porUsar.length === 0 && (
        <p className="text-xs text-slate-400">
          {moradas.length === 1
            ? "A morada que o cliente tem no CRM já é um local."
            : `As ${moradas.length} moradas que o cliente tem no CRM já são locais.`}
        </p>
      )}

      {/* As moradas que o CRM já tem. Um toque, e o sítio existe. */}
      {porUsar.length > 0 && (
        <div className="rounded-lg bg-brand-50/50 p-3">
          <p className="text-xs font-medium text-brand-800">
            {porUsar.length === 1
              ? "Este cliente tem uma morada no CRM:"
              : `Este cliente tem ${porUsar.length} moradas no CRM:`}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {porUsar.map((m) => (
              <li key={m.address_id}>
                <button
                  type="button"
                  disabled={desativado || aGravar !== null}
                  onClick={() => void criarDaMorada(m)}
                  className={cx(
                    "flex w-full items-start gap-2 rounded-lg bg-white px-3 py-2 text-left",
                    "text-sm text-slate-700 ring-1 ring-brand-200 transition-all",
                    "hover:ring-brand/40 active:scale-[0.99] disabled:opacity-50"
                  )}
                >
                  <MapPin width={14} height={14} className="mt-0.5 shrink-0 text-brand" />
                  {/*
                    `break-words` e `min-w-0`: uma morada é texto longo sem
                    sítios óbvios para partir, e num ecrã de telemóvel saía
                    para fora da caixa. A acção passa para baixo em vez de
                    disputar a mesma linha.
                  */}
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">{m.morada}</span>
                    <span className="mt-0.5 block text-xs">
                      {m.principal && <span className="text-slate-400">principal · </span>}
                      <span className="font-medium text-brand">
                        {aGravar === m.address_id ? "a criar…" : "tocar para usar"}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-brand-800/70">
            Um toque cria o sítio com a morada já preenchida.
          </p>
        </div>
      )}

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {aCriar && (
        <FormLocalRapido
          clienteId={clienteId}
          locais={doCliente}
          aoFechar={() => setACriar(null)}
          aoCriar={(id) => {
            setACriar(null);
            aoEscolher(id);
            aoCriar(id);
          }}
        />
      )}
    </div>
  );
}

/**
 * O formulário mínimo.
 *
 * Nome, tipo, e dentro de quê. Mais nada — o resto edita-se em Definições, e
 * quem está a abrir uma ordem com um cliente à espera não quer preencher
 * código postal.
 */
function FormLocalRapido({
  clienteId,
  locais,
  aoFechar,
  aoCriar,
}: {
  clienteId: string;
  locais: readonly LocalRow[];
  aoFechar: () => void;
  aoCriar: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("morada");
  const [parentId, setParentId] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = async () => {
    if (!nome.trim()) return;
    setAGravar(true);
    setErro(null);
    try {
      const r = await criarLocal({
        clienteId,
        nome: nome.trim(),
        tipo,
        parentId: parentId || null,
      });
      aoCriar(r.id);
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível criar o local.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-slate-700">Sítio novo</span>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
          aria-label="Fechar"
        >
          <X width={15} height={15} />
        </button>
      </div>

      <div className="mt-2 space-y-3">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nome.trim()) void gravar();
          }}
          placeholder="Ex.: Torre A — Garagem −2"
          className="w-full"
          autoFocus
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full text-sm">
            <option value="morada">Morada</option>
            <option value="edificio">Edifício</option>
            <option value="piso">Piso</option>
            <option value="espaco">Espaço</option>
          </Select>

          {locais.length > 0 && (
            <Combobox
              value={parentId}
              onChange={setParentId}
              options={locais.map((l) => ({ value: l.id, label: l.nome }))}
              placeholder="Dentro de… (opcional)"
              className="w-full"
            />
          )}
        </div>

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        <Button size="sm" disabled={!nome.trim() || aGravar} onClick={() => void gravar()}>
          {aGravar ? "A criar…" : "Criar e usar"}
        </Button>
      </div>
    </div>
  );
}
