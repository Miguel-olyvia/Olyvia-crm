-- Allow portal users to read quote_fees for quotes they can access
-- Mirrors the "Client can view own quote lines" policy on quote_lines
CREATE POLICY "portal_select_quote_fees" ON quote_fees
FOR SELECT TO public
USING (portal_user_can_see_document('quote'::portal_document_type, quote_id));
