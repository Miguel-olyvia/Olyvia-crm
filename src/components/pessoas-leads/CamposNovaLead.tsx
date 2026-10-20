import type { DefinicaoCampo } from "@/hooks/pessoas/novaLead/fluxoNovaLead";
import { CampoNovaLead } from "./CampoNovaLead";

interface CamposProps {
  /** O título da secção (com o aria-labelledby): sem título, só a grelha. */
  titulo: string;
  descricao?: string;
  idSecao: string;
  campos: readonly DefinicaoCampo[];
  valores: Readonly<Record<string, unknown>>;
  erros: Readonly<Record<string, string>>;
  campanhaId: string | null;
  aoMudar: (chave: string, valor: unknown) => void;
}

/** Uma secção do formulário: os campos em grelha, os de texto longo a toda a largura. Só dados e callbacks. */
export function CamposNovaLead({ titulo, descricao, idSecao, campos, valores, erros, campanhaId, aoMudar }: CamposProps) {
  if (campos.length === 0) return null;
  return (
    <section aria-labelledby={idSecao} className="space-y-3 border-t pt-4">
      <div className="space-y-1">
        <h3 id={idSecao} className="text-sm font-semibold text-foreground">{titulo}</h3>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {campos.map((campo) => (
          <div key={campo.id} className={campo.field_type === "textarea" || campo.field_type === "composite_address" ? "md:col-span-2" : ""}>
            <CampoNovaLead campo={campo} valor={valores[campo.field_key]} aoMudar={(v) => aoMudar(campo.field_key, v)} campanhaId={campanhaId} erro={erros[campo.field_key]} />
          </div>
        ))}
      </div>
    </section>
  );
}
