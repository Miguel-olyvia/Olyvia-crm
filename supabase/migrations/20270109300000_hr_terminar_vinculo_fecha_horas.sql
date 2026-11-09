-- ==============================================================================
-- Ronda 2 de permissões (05/11/2026), RH ponto 1. MUDANÇA DE FUNCIONAMENTO
-- APROVADA: terminar um vínculo fecha as horas contratadas desse vínculo.
--
-- Problema: com a guarda de 20270108410000 (P1.8), quem tem
-- hr.pessoas.vinculos.edit e não tem hr.pessoas.vinculos.horas.corrigir não
-- consegue readmitir com data de início no passado. Terminar um vínculo não
-- fechava a versão de horas aberta; o «Novo contrato» (usePessoa.saveVinculo)
-- fechava-a então na data de início do contrato novo, que está no passado, e a
-- guarda recusava (horas_contratadas_fecha_no_passado).
--
-- Solução (a mais pequena, sem mexer na guarda): gatilho AFTER UPDATE em
-- pessoas_vinculos que mantém o fim das horas igual ao fim do contrato:
--   - passa a 'terminado' -> a versão aberta deste vínculo fecha em
--     data_fim + 1 (intervalos [) — o último dia do contrato ainda conta);
--   - continua 'terminado' mas muda a data_fim -> a versão fechada pelo fim
--     acompanha a nova data;
--   - deixa de estar 'terminado' (engano desfeito) -> reabre a versão que o
--     fim tinha fechado, se depois dela não houver outra.
-- Na readmissão já não há versão aberta: o saveVinculo só insere a nova versão
-- (valido_ate NULL, permitido com vinculos.edit) e nunca fecha nada no passado.
--
-- O contorno do P1.8 continua fechado: a guarda e a RLS de
-- pessoas_vinculos_horas ficam iguais. Fechar ou mudar horas já decorridas
-- diretamente continua a exigir .corrigir. O gatilho só fecha no fim do
-- contrato, que é decisão de quem pode terminar o vínculo (vinculos.edit,
-- RLS de pessoas_vinculos; ou as RPCs de fim e a rotina diária).
-- SECURITY DEFINER porque a versão a fechar pode ficar no passado (a rotina
-- diária termina sempre com data_fim < hoje). Sem tabelas nem colunas novas.
-- ==============================================================================

DO $pre$
BEGIN
  IF to_regprocedure('public.hr_vinculo_terminado_fecha_horas()') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-condicao: hr_vinculo_terminado_fecha_horas() ja existe no vivo';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pessoas_vinculos_fecha_horas_ao_terminar') THEN
    RAISE EXCEPTION 'pre-condicao: trg_pessoas_vinculos_fecha_horas_ao_terminar ja existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pessoas_vinculos_horas_corrigir_guarda') THEN
    RAISE EXCEPTION 'pre-condicao: a guarda de 20270108410000 nao esta no vivo';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.hr_vinculo_terminado_fecha_horas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_fim_novo   date;
  v_fim_antigo date;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- Fim das horas = dia seguinte ao último dia do contrato ([) ).
  v_fim_novo := CASE WHEN NEW.estado = 'terminado' AND NEW.data_fim IS NOT NULL
                     THEN NEW.data_fim + 1 END;
  v_fim_antigo := CASE WHEN OLD.estado = 'terminado' AND OLD.data_fim IS NOT NULL
                       THEN OLD.data_fim + 1 END;

  IF v_fim_novo IS NOT DISTINCT FROM v_fim_antigo THEN
    RETURN NULL;
  END IF;

  IF v_fim_antigo IS NULL THEN
    -- Passa a terminado: fecha a versão aberta deste vínculo. Se o vínculo
    -- estava em vigor e a pessoa fica sem nenhum, a versão aberta é a dele
    -- mesmo que ainda não tenha sido re-apontada.
    UPDATE public.pessoas_vinculos_horas h
       SET valido_ate = v_fim_novo
     WHERE h.pessoa_id = NEW.pessoa_id
       AND h.deleted_at IS NULL
       AND h.valido_ate IS NULL
       AND h.valido_de < v_fim_novo
       AND (h.vinculo_id = NEW.id
            OR (OLD.estado IN ('activo', 'suspenso')
                AND NOT EXISTS (SELECT 1 FROM public.pessoas_vinculos v
                                 WHERE v.pessoa_id = NEW.pessoa_id
                                   AND v.estado IN ('activo', 'suspenso')
                                   AND v.deleted_at IS NULL)));

  ELSIF v_fim_novo IS NULL THEN
    -- Deixa de estar terminado: reabre a versão que o fim fechou, se não
    -- houver nenhuma depois dela (nem aberta).
    UPDATE public.pessoas_vinculos_horas h
       SET valido_ate = NULL
     WHERE h.vinculo_id = NEW.id
       AND h.deleted_at IS NULL
       AND h.valido_ate = v_fim_antigo
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_vinculos_horas o
                        WHERE o.pessoa_id = h.pessoa_id
                          AND o.deleted_at IS NULL
                          AND o.id <> h.id
                          AND (o.valido_ate IS NULL OR o.valido_de >= v_fim_antigo));

  ELSE
    -- Continua terminado com outra data de fim: a versão acompanha.
    UPDATE public.pessoas_vinculos_horas h
       SET valido_ate = v_fim_novo
     WHERE h.vinculo_id = NEW.id
       AND h.deleted_at IS NULL
       AND h.valido_ate = v_fim_antigo
       AND h.valido_de < v_fim_novo;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_vinculo_terminado_fecha_horas() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_pessoas_vinculos_fecha_horas_ao_terminar
  AFTER UPDATE OF estado, data_fim ON public.pessoas_vinculos
  FOR EACH ROW
  WHEN (OLD.estado = 'terminado' OR NEW.estado = 'terminado')
  EXECUTE FUNCTION public.hr_vinculo_terminado_fecha_horas();
