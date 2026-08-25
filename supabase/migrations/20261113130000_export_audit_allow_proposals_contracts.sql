-- O data_export_audit_module_check so admitia os quatro modulos iniciais
-- (clients, contacts, quotes, leads). Com a chegada de proposals e
-- client_contracts, o INSERT no log de auditoria violava o CHECK e a Edge
-- Function devolvia 500 DEPOIS de ja ter lido os dados -- ou seja, o export
-- falhava exatamente no passo que garante que ele fica registado.
--
-- Confirmado contra o remoto antes de escrever esta migration:
--   data_export_audit_module_check :: CHECK ((module = ANY (ARRAY[
--     'clients'::text, 'contacts'::text, 'quotes'::text, 'leads'::text])))
--
-- Forward-only: a constraint antiga cai e e recriada com os seis modulos.
ALTER TABLE public.data_export_audit
  DROP CONSTRAINT IF EXISTS data_export_audit_module_check;

ALTER TABLE public.data_export_audit
  ADD CONSTRAINT data_export_audit_module_check
  CHECK (module = ANY (ARRAY[
    'clients'::text,
    'contacts'::text,
    'quotes'::text,
    'leads'::text,
    'proposals'::text,
    'client_contracts'::text
  ]));
