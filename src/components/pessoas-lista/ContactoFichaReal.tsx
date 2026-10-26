// O contacto da pessoa na ficha real: telefone e email (que se substituem), «Prefere ser contactado», «Melhor hora» e «Idioma», com edição em linha.
// Um idioma fora da lista (por exemplo es) mostra-se tal como está e nunca se reenvia. Um erro da base (contacto de outra pessoa, email ou telefone
// repetido) aparece traduzido, e o formulário só fecha quando a base confirma.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ErroAcao } from "@/components/pessoas/ErroAcao";
import type { ContactoPreferido, HoraPreferida } from "@/components/pessoas/pessoasTipos";
import { useExecutarAcao } from "@/components/pessoas/useExecutarAcao";
import { CONTACTOS_PREFERIDOS, HORAS_PREFERIDAS, opcoesDeLingua } from "@/hooks/pessoas/useGuardarContactoPessoa";
import { formularioDeContacto, pedidoDeContacto, type DadosContactoFormulario, type FormularioContacto } from "./contactoFormulario";

const C = "pessoasPagina.real.ficha.contact.";
const LINGUAS_COM_NOME = ["pt", "en", "fr"];
const CLASSE_SELECT = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-[15px] text-foreground";

interface ContactoFichaRealProps {
  telefone: string | null;
  email: string | null;
  contactoPreferido?: ContactoPreferido;
  horaPreferida?: HoraPreferida;
  /** O idioma da base (pode estar fora da lista: es). */
  lingua?: string;
  podeEditar: boolean;
  aoGuardar: (dados: DadosContactoFormulario) => Promise<unknown>;
}

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  );
}

export function ContactoFichaReal({ telefone, email, contactoPreferido, horaPreferida, lingua, podeEditar, aoGuardar }: ContactoFichaRealProps) {
  const { t } = useTranslation();
  const anunciar = useAnunciar();
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormularioContacto | null>(null);
  const [faltaChave, setFaltaChave] = useState<string | null>(null);
  const [invalido, setInvalido] = useState<"email" | "telefone" | null>(null);
  const executar = useExecutarAcao();
  const botaoEditar = useRef<HTMLButtonElement>(null);
  const campoTelefone = useRef<HTMLInputElement>(null);
  const campoEmail = useRef<HTMLInputElement>(null);
  const jaAbriu = useRef(false);
  const atual = { telefone, email, contacto: contactoPreferido, hora: horaPreferida, lingua };

  // O foco vai para o primeiro campo ao abrir e volta ao botão de editar ao fechar.
  useEffect(() => {
    if (aberto) { jaAbriu.current = true; campoTelefone.current?.focus(); } else if (jaAbriu.current) botaoEditar.current?.focus();
  }, [aberto]);

  const abrir = () => { setForm(formularioDeContacto(atual)); setFaltaChave(null); setInvalido(null); setAberto(true); };
  const mudar = (parte: Partial<FormularioContacto>) => { setFaltaChave(null); setInvalido(null); setForm((f) => (f ? { ...f, ...parte } : f)); };
  const fechar = () => setAberto(false);

  const guardar = () => {
    if (!form) return;
    const pedido = pedidoDeContacto(form, atual);
    if (pedido.estado === "falta") {
      setFaltaChave(`${C}${pedido.chaveErro}`);
      setInvalido(pedido.campo);
      (pedido.campo === "email" ? campoEmail : campoTelefone).current?.focus();
      return;
    }
    if (pedido.estado === "semAlteracao") { fechar(); return; }
    const mensagem = t(`${C}saved`);
    executar.executar(() => aoGuardar(pedido.dados).then(() => undefined), () => { fechar(); anunciar(mensagem); }, mensagem);
  };

  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;
  const ligar = (campo: "email" | "telefone") => {
    const ids = [invalido === campo && faltaChave ? idErro : null, idDica].filter(Boolean).join(" ");
    return { "aria-invalid": invalido === campo ? (true as const) : undefined, "aria-describedby": ids };
  };
  const semIndicacao = t(`${C}notSet`);
  const nomeLingua = (l: string): string => (LINGUAS_COM_NOME.includes(l) ? t(`${C}language.${l}`) : l);
  const linguaAtual = lingua?.trim() || "";
  return (
    <Seccao titulo={t(`${C}title`)}>
      {!aberto || !form ? (
        <>
          <ListaCampos>
            <LinhaCampo rotulo={t(`${C}phone`)}>{telefone || semIndicacao}</LinhaCampo>
            <LinhaCampo rotulo={t(`${C}email`)}>{email || semIndicacao}</LinhaCampo>
            <LinhaCampo rotulo={t(`${C}preferred`)}>{contactoPreferido ? t(`${C}preferred.${contactoPreferido}`) : semIndicacao}</LinhaCampo>
            <LinhaCampo rotulo={t(`${C}time`)}>{horaPreferida ? t(`${C}time.${horaPreferida}`) : semIndicacao}</LinhaCampo>
            <LinhaCampo rotulo={t(`${C}language`)}>{linguaAtual ? nomeLingua(linguaAtual) : semIndicacao}</LinhaCampo>
          </ListaCampos>
          {podeEditar && (
            <Button ref={botaoEditar} type="button" variant="outline" className={cn("mt-3 min-h-11", FOCO)} onClick={abrir}>{t(`${C}edit`)}</Button>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id={`${id}-telefone`} rotulo={t(`${C}phone`)}>
              <Input
                id={`${id}-telefone`} ref={campoTelefone} type="tel" inputMode="tel" autoComplete="off" className="min-h-11" maxLength={30}
                value={form.telefone} onChange={(e) => mudar({ telefone: e.target.value })} {...ligar("telefone")}
              />
            </Campo>
            <Campo id={`${id}-email`} rotulo={t(`${C}email`)}>
              <Input
                id={`${id}-email`} ref={campoEmail} type="email" autoComplete="off" className="min-h-11" maxLength={254}
                value={form.email} onChange={(e) => mudar({ email: e.target.value })} {...ligar("email")}
              />
            </Campo>
          </div>
          <p id={idDica} className="text-sm text-muted-foreground">{t(`${C}hint`)}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo id={`${id}-preferido`} rotulo={t(`${C}preferred`)}>
              <select
                id={`${id}-preferido`} className={cn(CLASSE_SELECT, FOCO)} value={form.contacto}
                onChange={(e) => mudar({ contacto: e.target.value as ContactoPreferido | "" })}
              >
                <option value="">{t(`${C}preferred.none`)}</option>
                {CONTACTOS_PREFERIDOS.map((c) => <option key={c} value={c}>{t(`${C}preferred.${c}`)}</option>)}
              </select>
            </Campo>
            <Campo id={`${id}-hora`} rotulo={t(`${C}time`)}>
              <select
                id={`${id}-hora`} className={cn(CLASSE_SELECT, FOCO)} value={form.hora}
                onChange={(e) => mudar({ hora: e.target.value as HoraPreferida | "" })}
              >
                <option value="">{t(`${C}time.none`)}</option>
                {HORAS_PREFERIDAS.map((h) => <option key={h} value={h}>{t(`${C}time.${h}`)}</option>)}
              </select>
            </Campo>
            <Campo id={`${id}-lingua`} rotulo={t(`${C}language`)}>
              <select id={`${id}-lingua`} className={cn(CLASSE_SELECT, FOCO)} value={form.lingua} onChange={(e) => mudar({ lingua: e.target.value })}>
                {opcoesDeLingua(linguaAtual).map((l) => <option key={l} value={l}>{nomeLingua(l)}</option>)}
              </select>
            </Campo>
          </div>
          {faltaChave && <p id={idErro} role="alert" className="text-sm font-medium text-destructive">{t(faltaChave)}</p>}
          <ErroAcao chave={executar.erro} chaveExtra={executar.erroExtra} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button" className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)} onClick={() => { if (!executar.aGuardar) guardar(); }}
              aria-disabled={executar.aGuardar || undefined} aria-busy={executar.aGuardar || undefined}
            >
              {t(executar.aGuardar ? "pessoasPagina.real.ficha.saving" : `${C}save`)}
            </Button>
            <Button
              type="button" variant="outline" className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
              onClick={() => { if (!executar.aGuardar) fechar(); }} aria-disabled={executar.aGuardar || undefined}
            >
              {t(`${C}cancel`)}
            </Button>
          </div>
        </div>
      )}
    </Seccao>
  );
}
