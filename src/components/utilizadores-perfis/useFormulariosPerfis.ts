import { useState } from "react";
import { toast } from "@/lib/toast";
import type { ResultadoForm } from "./FormRole";
import type { FormAberto } from "./tipos";

/**
 * O formulário aberto (role ou utilizador) e o anúncio para o leitor de ecrã. `aoAbrir` corre antes de abrir (a página
 * fecha a ficha de onde se veio, para os dois painéis não ficarem empilhados).
 */
export function useFormulariosPerfis(aoAbrir: () => void) {
  const [form, setForm] = useState<FormAberto>(null);
  const [anuncio, setAnuncio] = useState("");
  const avisar = (r: ResultadoForm) => {
    toast.success(r.aviso);
    setAnuncio(r.anuncio);
  };
  return {
    form,
    anuncio,
    abrir: (f: FormAberto) => { aoAbrir(); setForm(f); },
    fechar: () => setForm(null),
    /** Uma ação que acabou sem formulário (desativar, reativar): só avisa e anuncia. */
    avisar,
    /** O formulário acabou: avisa, anuncia e fecha. */
    concluir: (r: ResultadoForm) => { avisar(r); setForm(null); },
  };
}
