-- Drizzle custom migration: ledger corrections must be new entries, never edits.
CREATE FUNCTION wb_next.reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are immutable' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_immutable
BEFORE UPDATE OR DELETE ON wb_next.ledger
FOR EACH ROW EXECUTE FUNCTION wb_next.reject_ledger_mutation();
