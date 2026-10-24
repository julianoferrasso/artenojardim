-- Migration separada de propósito: o valor novo de um enum não pode ser usado na
-- mesma transação que o criou (o Postgres recusa com "unsafe use of new value").
--
-- Quem já recebe os pedidos pagos passa a receber também o resumo diário das
-- encomendas com prazo vencendo. Idempotente: só acrescenta onde ainda não há.
UPDATE "AlertDestination"
SET "events" = array_append("events", 'PRODUCTION_DUE'::"AlertEventType")
WHERE 'ORDER_PAID'::"AlertEventType" = ANY("events")
  AND NOT ('PRODUCTION_DUE'::"AlertEventType" = ANY("events"));
