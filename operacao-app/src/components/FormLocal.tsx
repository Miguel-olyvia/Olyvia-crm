import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useRotulos } from "../auth/Rotulos";
import { gravarLocal, proximoCodigo } from "../lib/config";
import type { Cliente, LocalRow } from "../lib/dados";
import {
  Button,
  Combobox,
  Field,
  Input,
  Modal,
  Select,
  useGravar,
} from "./ui";
import CampoDeMapa from "./CampoDeMapa";
import { coordenadasValidas, type Coordenadas } from "../domain/mapa";

/**
 * Criar ou editar um sítio.
 *
 * Vive aqui, e já não dentro de Definições, porque um sítio não é uma
 * definição: é trabalho do dia. Quem chega a uma morada nova não vai a
 * Definições — está a abrir uma ordem, ou está na árvore dos locais.
 *
 * ⚠ **Duas coisas diferentes, e o formulário sabe qual delas é.** A confusão
 * antiga vinha de o mesmo ecrã servir para as duas, com uma caixa
 * &ldquo;Dentro de&rdquo; opcional que ninguém percebia:
 *
 *  - **Um sítio** é a morada. Tem cliente, tem morada, tem ponto no mapa.
 *  - **Um espaço** vive dentro de um sítio. Herda o cliente e a morada de
 *    quem está por cima — só precisa de nome. É a garagem, o piso 3, a
 *    cozinha.
 *
 * Quando se cria de dentro de um sítio (`dentroDe`), o cliente nem se
 * pergunta: é o de quem está por cima, e perguntá-lo era um convite a
 * pendurar um espaço no cliente errado.
 */
export default function FormLocal({
  local,
  dentroDe,
  clientes,
  clienteFixo,
  aoFechar,
  aoGravar,
}: {
  /** O local a editar. Nulo quando é novo. */
  local?: LocalRow | null;
  /** O sítio onde este vai viver. Presente = estamos a criar um espaço. */
  dentroDe?: LocalRow | null;
  /** Para escolher o cliente, quando há escolha a fazer. */
  clientes?: readonly Cliente[];
  /** Quando se chega aqui de uma ordem, o cliente já está decidido. */
  clienteFixo?: string;
  aoFechar: () => void;
  /** Recebe o id de quem nasceu, para o ecrã de cima o poder escolher. */
  aoGravar: (id: string | null) => void;
}) {
  const rotulos = useRotulos();
  const { activeOrgId } = useAuth();
  const { aGravar, erro, gravar } = useGravar();

  const eEspaco = !!dentroDe || (!!local?.parent_id && !dentroDe);
  const paiId = dentroDe?.id ?? local?.parent_id ?? "";

  const [codigo, setCodigo] = useState(local?.codigo ?? "");
  const [nome, setNome] = useState(local?.nome ?? "");
  const [tipo, setTipo] = useState(
    local?.tipo ?? (dentroDe ? "espaco" : "morada")
  );
  const [clienteId, setClienteId] = useState(
    local?.cliente_id ?? dentroDe?.cliente_id ?? clienteFixo ?? ""
  );
  const [morada, setMorada] = useState(local?.morada ?? "");
  const [coords, setCoords] = useState<Coordenadas | null>(
    local && coordenadasValidas(local.latitude, local.longitude)
      ? { latitude: local.latitude as number, longitude: local.longitude as number }
      : null
  );

  // O código gera-se sozinho para quem cria. Obrigar alguém a inventar um
  // código único é um convite ao engano, e o engano só aparece meses depois.
  useEffect(() => {
    if (local || codigo || !activeOrgId) return;
    void proximoCodigo(activeOrgId, "LOC").then(setCodigo).catch(() => {});
  }, [local, codigo, activeOrgId]);

  // Um cliente tem de haver sempre: é por ele que a RLS decide quem vê o quê.
  const podeGravar = !!nome.trim() && !!clienteId && !aGravar;

  const titulo = local
    ? `Editar ${local.codigo}`
    : dentroDe
      ? `Novo espaço em ${dentroDe.nome}`
      : "Novo sítio";

  return (
    <Modal
      title={titulo}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            disabled={!podeGravar}
            onClick={() => {
              // O id sai por aqui e não pelo `gravar`, que só avisa que
              // acabou. Quem criou um espaço a meio de uma ordem precisa de o
              // escolher a seguir, e sem isto ficava a olhar para uma caixa
              // vazia sem perceber que a gravação correu bem.
              let novoId: string | null = null;
              void gravar(async () => {
                novoId = await gravarLocal({
                  id: local?.id,
                  orgId: activeOrgId!,
                  clienteId,
                  codigo: codigo.trim(),
                  nome: nome.trim(),
                  tipo,
                  parentId: paiId || null,
                  // Um espaço não tem morada própria: é a do sítio onde está.
                  // Duas moradas para a mesma casa é como se perde o mapa.
                  morada: eEspaco ? null : morada.trim() || null,
                  latitude: eEspaco ? null : coords?.latitude ?? null,
                  longitude: eEspaco ? null : coords?.longitude ?? null,
                });
              }, () => aoGravar(novoId));
            }}
          >
            {aGravar ? "A gravar…" : "Gravar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {dentroDe && (
          <p className="rounded-lg bg-brand-50/60 px-3 py-2 text-xs text-brand-800">
            Fica dentro de <strong>{dentroDe.nome}</strong>. Herda o cliente e a
            morada — só precisa de nome.
          </p>
        )}

        <Field
          label="Nome"
          hint={
            eEspaco
              ? "Ex.: Garagem −1, Piso 3, Cozinha"
              : "Como as pessoas lhe chamam. Ex.: Torre A"
          }
        >
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* O cliente só se pergunta quando há mesmo escolha a fazer. */}
          {!dentroDe && !clienteFixo && (
            <Field label="Cliente">
              <Combobox
                value={clienteId}
                onChange={setClienteId}
                options={(clientes ?? []).map((c) => ({ value: c.id, label: c.nome }))}
                placeholder="Escolher"
                className="w-full"
              />
            </Field>
          )}

          <Field
            label="Tipo"
            hint={eEspaco ? "O degrau da árvore." : "Quase sempre uma morada."}
          >
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full"
            >
              {rotulos.opcoes("tipo_local").map((x) => (
                <option key={x.valor} value={x.valor}>
                  {x.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Código" hint="Gerado automaticamente. Podes mudá-lo.">
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="w-full font-mono"
            />
          </Field>
        </div>

        {/* O mapa só faz sentido para quem tem morada própria. */}
        {!eEspaco && (
          <CampoDeMapa
            valor={coords}
            aoMudar={setCoords}
            morada={morada}
            aoMudarMorada={setMorada}
          />
        )}

        {erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
        )}
      </div>
    </Modal>
  );
}
