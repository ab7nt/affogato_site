#!/usr/bin/env bash
#
# Деплой статического сайта Affogato на хостинг (reg.ru) по FTP/SFTP.
# Заливает только изменённые файлы (lftp mirror -R --only-newer).
#
# Использование:
#   ./deploy.sh            — залить изменения на хостинг
#   ./deploy.sh --dry-run  — показать, что зальётся/удалится, без реальной заливки
#   ./deploy.sh --delete   — дополнительно удалить на сервере файлы, которых нет локально
#   (флаги можно совмещать: ./deploy.sh --dry-run --delete)
#
# Настройки (хост, логин, пароль, путь) берутся из .deploy.env — см. .deploy.env.example.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.deploy.env"

# --- Конфиг -----------------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Ошибка: нет файла .deploy.env" >&2
  echo "Скопируй шаблон и заполни своими данными от reg.ru:" >&2
  echo "  cp .deploy.env.example .deploy.env && chmod 600 .deploy.env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# --- Проверка lftp ----------------------------------------------------------
if ! command -v lftp >/dev/null 2>&1; then
  echo "Ошибка: lftp не установлен." >&2
  echo "Установи его: brew install lftp" >&2
  exit 1
fi

# --- Обязательные переменные ------------------------------------------------
: "${DEPLOY_HOST:?не задан DEPLOY_HOST в .deploy.env}"
: "${DEPLOY_USER:?не задан DEPLOY_USER в .deploy.env}"
: "${DEPLOY_PASS:?не задан DEPLOY_PASS в .deploy.env}"
: "${DEPLOY_REMOTE_DIR:?не задан DEPLOY_REMOTE_DIR в .deploy.env}"

PROTOCOL="${DEPLOY_PROTOCOL:-ftp}"   # ftp | sftp
FTP_SSL="${FTP_SSL:-true}"           # FTPS для протокола ftp

# --- Разбор флагов ----------------------------------------------------------
DRY=""
DELETE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY="--dry-run" ;;
    --delete)  DELETE="--delete" ;;
    *) echo "Неизвестный флаг: $arg (доступно: --dry-run, --delete)" >&2; exit 1 ;;
  esac
done

# --- Что НЕ заливать на прод (regex по пути относительно корня) --------------
# Каждая regex в одинарных кавычках, иначе lftp принимает `|` за pipe.
EXCLUDES="\
 -x '(^|/)\.git/' \
 -x '(^|/)\.deploy\.env' \
 -x '(^|/)deploy\.sh$' \
 -x '\.md$' \
 -x '(^|/)\.gitignore$' \
 -x '(^|/)\.DS_Store$' \
 -x '(^|/)\.claude/' \
 -x '^assets/index\.html$' \
 -x '^js/index\.html$'"

# --- Настройки соединения ---------------------------------------------------
SETTINGS="set cmd:fail-exit yes; set net:max-retries 2; set net:timeout 15;"
if [[ "$PROTOCOL" == "sftp" ]]; then
  SETTINGS="$SETTINGS set sftp:auto-confirm yes;"
else
  SETTINGS="$SETTINGS set ftp:ssl-allow $FTP_SSL; set ftp:ssl-protect-data yes; set ssl:verify-certificate no;"
fi

OPEN_OPTS=""
[[ -n "${DEPLOY_PORT:-}" ]] && OPEN_OPTS="-p $DEPLOY_PORT"

echo "→ Деплой на $PROTOCOL://$DEPLOY_HOST → $DEPLOY_REMOTE_DIR"
[[ -n "$DRY" ]]    && echo "  режим: dry-run (ничего не зальётся)"
[[ -n "$DELETE" ]] && echo "  режим: с удалением лишнего на сервере"

# Команды передаются lftp через stdin (heredoc), чтобы пароль не светился в `ps`.
# cd в целевую папку + заливка в текущую директорию (.) — чище, чем абсолютный путь
# (избегает mkdir %2F при DEPLOY_REMOTE_DIR=/).
# Вывод --verbose прогоняем через sed, маскируя пароль в URL (user:pass@ → user:***@).
lftp <<EOF 2>&1 | sed -E 's#(ftps?|sftp)://([^:/@]+):[^@]*@#\1://\2:***@#g'
$SETTINGS
open $OPEN_OPTS $PROTOCOL://$DEPLOY_HOST
user "$DEPLOY_USER" "$DEPLOY_PASS"
cd "$DEPLOY_REMOTE_DIR"
mirror -R --only-newer --parallel=4 --verbose $DRY $DELETE $EXCLUDES "$SCRIPT_DIR/" .
bye
EOF

echo "✓ Готово."
