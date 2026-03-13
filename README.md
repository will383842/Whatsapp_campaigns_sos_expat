# WhatsApp Campaigns — SOS-Expat

Outil de campagnes WhatsApp automatiques pour les 68 groupes SOS-Expat.
Projet 100% standalone — base de données, ports et credentials dédiés.

## Architecture

| Sous-projet | Technologie | Port dev | Port prod |
|-------------|-------------|----------|-----------|
| `baileys-service/` | Node.js 20 + Baileys + Express | 3002 | 3002 (interne) |
| `laravel-api/` | Laravel 11 + PHP 8.3 | 8001 | 8001 (Nginx/FPM) |
| `react-dashboard/` | React 18 + Vite + TypeScript | 5174 | 81 (Nginx static) |
| MySQL | MySQL 8 | 3308 | 3308 |

---

## Installation locale (XAMPP + VS Code)

### Prérequis
- Node.js 20+, PHP 8.3+, Composer 2+, XAMPP (MySQL sur port 3308)

### 1. Base de données

Dans phpMyAdmin ou MySQL CLI :
```sql
CREATE DATABASE whatsapp_campaigns CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'campaigns_user'@'localhost' IDENTIFIED BY 'votre_mot_de_passe';
GRANT ALL PRIVILEGES ON whatsapp_campaigns.* TO 'campaigns_user'@'localhost';
FLUSH PRIVILEGES;
```

Importer le schéma :
```bash
mysql -u campaigns_user -p whatsapp_campaigns < database/whatsapp_campaigns.sql
```

### 2. Laravel API

```bash
cd laravel-api
cp .env.example .env
# Éditer .env : DB_PASSWORD, BAILEYS_API_KEY, OPENAI_API_KEY

php artisan key:generate
php artisan migrate
php artisan db:seed        # Crée le compte Williams
php artisan serve --port=8001
```

Dans un second terminal :
```bash
php artisan queue:work --queue=default
```

Dans un troisième terminal (scheduler) :
```bash
php artisan schedule:work
```

### 3. Baileys Service

```bash
cd baileys-service
npm install
cp .env.example .env
# Éditer .env : WA_PHONE_NUMBER, LARAVEL_API_KEY (= BAILEYS_API_KEY du Laravel)

npm run dev
```

Au premier démarrage, un code de couplage s'affiche dans le terminal.
Sur le téléphone de Williams : **WhatsApp → Appareils connectés → Lier avec numéro de téléphone**

### 4. React Dashboard

```bash
cd react-dashboard
npm install
cp .env.example .env
# VITE_API_URL=http://localhost:8001

npm run dev
# → http://localhost:5174
```

---

## Déploiement Production (VPS Hetzner)

### Variables d'environnement
Configurer les `.env` de chaque sous-projet avec les valeurs de production.

### Baileys Service (PM2)
```bash
cd baileys-service
npm install --production
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Laravel API (Nginx + PHP-FPM)
```nginx
server {
    listen 8001;
    root /var/www/whatsapp-campaigns/laravel-api/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
```

Laravel Queue en production :
```bash
pm2 start --name "campaigns-queue" --interpreter php -- artisan queue:work --sleep=3 --tries=3
```

Cron Laravel Scheduler (crontab -e) :
```
* * * * * cd /var/www/whatsapp-campaigns/laravel-api && php artisan schedule:run >> /dev/null 2>&1
```

### React Dashboard (Nginx static)
```bash
cd react-dashboard
npm run build
# Servir le dossier dist/ via Nginx sur le port 81
```

---

## Structure des ports (isolation avec les autres projets)

| Projet | Laravel | React | MySQL | Baileys |
|--------|---------|-------|-------|---------|
| SOS-Expat principal | 8000 | 80 | 3306 | — |
| Trustpilot | 8000 | 80 | 3307 | 3001 |
| **WhatsApp Campaigns** | **8001** | **81/5174** | **3308** | **3002** |

---

## Compte utilisateur par défaut

Après `php artisan db:seed` :
- **Email** : williams@sos-expat.com
- **Password** : à définir dans le seeder
- **Role** : admin

---

## Risque Baileys

Baileys est une bibliothèque **non officielle**. En cas de ban du numéro WhatsApp :
1. Ban temporaire → attendre 24-48h, reconnexion automatique
2. Session expirée → supprimer `baileys-service/auth_info/` et redémarrer
3. Ban définitif → nouveau numéro, re-scan code de couplage, re-ajouter aux 68 groupes

---

*SOS-Expat.com · WhatsApp Campaigns · v2.1 · Standalone*
