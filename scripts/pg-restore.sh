#!/bin/bash
#
# Restaura um dump do artenojardim. Uso na hora do desastre — por isso existe
# pronto, em vez de improvisar pg_restore sob pressão.
#
#   ./pg-restore.sh <arquivo.dump> [banco-destino]
#
# Sem banco-destino, restaura para um banco de TESTE (artenojardim_restore_test),
# nunca por cima do de produção sem intenção explícita. Restaurar por cima do
# banco vivo exige passar o nome dele de propósito.

set -euo pipefail

FILE="${1:-}"
TARGET="${2:-artenojardim_restore_test}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "uso: $0 <arquivo.dump> [banco-destino]" >&2
  echo "dumps disponíveis:" >&2
  ls -lt /var/backups/artenojardim/*.dump 2>/dev/null | head -5 >&2
  exit 1
fi

echo "Restaurando '$FILE' -> banco '$TARGET'"

if [ "$TARGET" = "artenojardim" ]; then
  echo "⚠  DESTINO É O BANCO DE PRODUÇÃO. Ctrl+C em 5s para abortar."
  sleep 5
fi

# Recria o banco de teste do zero para o restore ser fiel (sem resíduo de tentativa
# anterior). Para o destino de produção, NÃO dropa — pg_restore --clean cuida.
if [ "$TARGET" != "artenojardim" ]; then
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS \"$TARGET\""
  sudo -u postgres psql -c "CREATE DATABASE \"$TARGET\" OWNER artenojardim"
  sudo -u postgres pg_restore -d "$TARGET" --no-owner "$FILE"
else
  sudo -u postgres pg_restore -d "$TARGET" --clean --if-exists --no-owner "$FILE"
fi

echo ""
echo "=== conferência: contagem de linhas no destino ==="
sudo -u postgres psql -d "$TARGET" -tAc "
  SELECT 'Store: '     || count(*) FROM \"Store\"     UNION ALL
  SELECT 'Product: '   || count(*) FROM \"Product\"   UNION ALL
  SELECT 'Variant: '   || count(*) FROM \"ProductVariant\" UNION ALL
  SELECT 'Movement: '  || count(*) FROM \"InventoryMovement\" UNION ALL
  SELECT 'User: '      || count(*) FROM \"User\"
"
echo ""
echo "OK. Se o destino foi o de teste, apague depois com:"
echo "  sudo -u postgres psql -c 'DROP DATABASE \"$TARGET\"'"
