-- ==============================================================================
-- P1.8 (auditoria de permissões 05/11/2026, RH B2 #79):
-- hr.pessoas.vinculos.horas.corrigir era contornável com hr.pessoas.vinculos.edit.
--
-- A RLS de pessoas_vinculos_horas decide pelo valido_ate da linha ANTIGA
-- (hr_periodo_decorrido): a versão em vigor (valido_ate NULL) nunca está
-- decorrida, por isso só com .edit dava para a fechar com uma data no passado e
-- abrir outra desde essa data, reescrevendo meses de horas já decorridas sem
-- .corrigir. Também dava para mudar as horas da versão em vigor no lugar, o que
-- reescreve tudo desde o seu valido_de.
--
-- Guarda (BEFORE UPDATE), só para o acesso direto com sessão
-- (current_user = authenticated) e só para quem NÃO tem .corrigir na organização:
--   1. fechar (valido_ate) com uma data anterior a hoje -> recusado;
--   2. mudar o valido_de quando o antigo ou o novo ficam antes de hoje -> recusado;
--   3. numa versão já começada (valido_de < hoje), mudar horas, frequência
--      ou deleted_at -> recusado.
-- Fechar a partir de hoje (valido_ate = hoje, intervalos [)) continua livre: é o
-- «Alterar» do ecrã. Quem tem .corrigir não muda nada. As RPCs definer
-- (hr_vinculos_horas_sincronizar, owner postgres) e a service_role não passam aqui.
-- Mesma ideia de hr_horario_planeado_janela_imutavel (horário planeado).
-- Sem tabelas nem colunas novas.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.hr_vinculos_horas_corrigir_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Só o PostgREST com sessão. RPCs SECURITY DEFINER (owner postgres) e a
  -- service_role já decidiram a permissão antes de escrever.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.vinculos.horas.corrigir', OLD.organization_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.valido_ate IS DISTINCT FROM OLD.valido_ate
     AND NEW.valido_ate IS NOT NULL
     AND NEW.valido_ate < CURRENT_DATE THEN
    RAISE EXCEPTION
      'horas_contratadas_fecha_no_passado: fechar a versao % com valido_ate=% reescreveria horas ja decorridas. Alterar so a partir de hoje; corrigir o passado exige hr.pessoas.vinculos.horas.corrigir.',
      OLD.id, NEW.valido_ate
      USING ERRCODE = '42501';
  END IF;

  IF NEW.valido_de IS DISTINCT FROM OLD.valido_de
     AND (OLD.valido_de < CURRENT_DATE OR NEW.valido_de < CURRENT_DATE) THEN
    RAISE EXCEPTION
      'horas_contratadas_inicio_no_passado: mudar o inicio da versao % (de % para %) reescreve dias ja decorridos. Exige hr.pessoas.vinculos.horas.corrigir.',
      OLD.id, OLD.valido_de, NEW.valido_de
      USING ERRCODE = '42501';
  END IF;

  -- horas_semanais_equivalentes é coluna gerada (de horas_periodo e
  -- horas_frequencia): num BEFORE vem por calcular, por isso não se compara.
  IF OLD.valido_de < CURRENT_DATE
     AND (NEW.horas_periodo IS DISTINCT FROM OLD.horas_periodo
          OR NEW.horas_frequencia IS DISTINCT FROM OLD.horas_frequencia
          OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION
      'horas_contratadas_versao_em_curso: a versao % ja comecou (%). Mudar as horas no lugar reescreve dias ja decorridos: Alterar (fechar hoje e abrir outra) ou corrigir com hr.pessoas.vinculos.horas.corrigir.',
      OLD.id, OLD.valido_de
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_pessoas_vinculos_horas_corrigir_guarda
  BEFORE UPDATE ON public.pessoas_vinculos_horas
  FOR EACH ROW EXECUTE FUNCTION public.hr_vinculos_horas_corrigir_guarda();
