#!/bin/sh
set -e

if [ -d /var/www/html/public-shared ]; then
    cp -r /var/www/html/public/* /var/www/html/public-shared/ 2>/dev/null || true
fi

php artisan config:cache 2>/dev/null || true
php artisan route:cache 2>/dev/null || true

exec "$@"
