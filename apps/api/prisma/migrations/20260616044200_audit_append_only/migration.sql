-- Auditoria append-only (PLAN ADR-02): bloqueia UPDATE e DELETE em "AuditLog"
-- a nível de banco, valendo inclusive para o owner. TRUNCATE não dispara este
-- trigger (usado apenas em limpeza de testes, nunca em produção).

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog é append-only: operação % não permitida', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_no_update ON "AuditLog";
CREATE TRIGGER audit_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

DROP TRIGGER IF EXISTS audit_no_delete ON "AuditLog";
CREATE TRIGGER audit_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
