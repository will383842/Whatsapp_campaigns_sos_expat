#!/bin/sh
set -e

# Ensure .env exists (Docker injects env vars via env_file, but Laravel needs the file)
if [ ! -f /var/www/html/.env ] && [ -f /var/www/html/.env.production ]; then
    cp /var/www/html/.env.production /var/www/html/.env
fi

if [ -d /var/www/html/public-shared ]; then
    cp -r /var/www/html/public/* /var/www/html/public-shared/ 2>/dev/null || true
fi

php artisan config:cache 2>/dev/null || true
php artisan route:cache 2>/dev/null || true

exec "$@"
