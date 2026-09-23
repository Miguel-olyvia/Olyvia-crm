-- Regra 15: interruptor por passo de agendamento -- "esta verificação de
-- zona/distância é necessária aqui?" (ver artefacto/registo 23/09). Só
-- exige código postal COMPLETO (CP7, "XXXX-XXX") antes de agendar quando
-- ligado; nada muda para os formulários que não o ligam.
--
-- Não se cria um campo de morada novo: o código postal completo já dá
-- coordenadas exactas via a API Olyvia (ver postcodeGeocode.ts), sem
-- precisar de morada por extenso.
ALTER TABLE public.form_steps
  ADD COLUMN IF NOT EXISTS scheduling_requires_location BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.form_steps.scheduling_requires_location IS
  'Quando true, o código postal (scheduling_postal_code_field_key) tem de ser um CP7 completo ("XXXX-XXX") antes deste passo de agendamento ficar acessível -- necessário para a regra 13 (tempo de deslocação real entre visitas) ter coordenadas exactas. Omissão false: formulário continua dinâmico, sem nada obrigatório.';
