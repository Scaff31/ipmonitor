#!/bin/bash

# --- Configuration ---
REPO_URL="https://github.com/Scaff31/ipmonitor.git" 
APP_DIR="/var/www/ipmonitor"                       # Répertoire où l'application sera installée
SERVICE_NAME="ipmonitor"
VENV_DIR="venv"
GUNICORN_WORKERS=3 # Nombre de workers Gunicorn, ajuster selon les ressources du serveur

# --- Couleurs pour les messages ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Fonctions utilitaires ---
log_info() {
    echo -e "${GREEN}[INFO] $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[WARN] $1${NC}"
}

log_error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

# --- Vérification des prérequis ---
if [ "$EUID" -ne 0 ]; then
    log_error "Veuillez exécuter ce script avec les privilèges root (sudo)."
fi

# --- 1. Mise à jour du système ---
log_info "Mise à jour de la liste des paquets et du système..."
apt update && apt upgrade -y || log_error "Échec de la mise à jour du système."

# --- 2. Installation des dépendances système ---
log_info "Installation des dépendances système : Python3, pip, python3-venv, git, nginx, nmap..."
apt install -y python3 python3-pip python3-venv git nginx nmap || log_error "Échec de l'installation des dépendances système."

# --- 3. Création du répertoire de l'application et clonage du dépôt Git ---
log_info "Création du répertoire de l'application et clonage du dépôt Git..."
mkdir -p "$APP_DIR" || log_error "Échec de la création du répertoire $APP_DIR."
cd "$APP_DIR" || log_error "Impossible de naviguer vers $APP_DIR."

# Vérifiez si le répertoire .git existe, si oui, effectuez un pull, sinon un clone
if [ -d ".git" ]; then
    log_info "Dépôt Git déjà présent. Récupération des dernières modifications..."
    # Assurez-vous d'être sur la branche principale (main ou master) avant de pull
    git checkout main || git checkout master || log_warn "Impossible de passer à la branche 'main' ou 'master'. Assurez-vous que votre branche est correcte."
    git pull || log_error "Échec de la mise à jour du dépôt Git."
else
    log_info "Clonage du dépôt Git depuis $REPO_URL..."
    git clone "$REPO_URL" . || log_error "Échec du clonage du dépôt Git. Vérifiez l'URL et les permissions."
fi

# Assurez-vous que le propriétaire est www-data pour l'application
log_info "Définition des permissions du répertoire de l'application pour www-data..."
chown -R www-data:www-data "$APP_DIR" || log_error "Échec de la définition des permissions."
chmod -R 755 "$APP_DIR" # S'assure que www-data peut lire et exécuter les scripts Python

# --- 4. Configuration de l'environnement virtuel Python ---
log_info "Création et activation de l'environnement virtuel Python..."
python3 -m venv "$VENV_DIR" || log_error "Échec de la création de l'environnement virtuel."
source "$VENV_DIR/bin/activate" || log_error "Échec de l'activation de l'environnement virtuel."

# --- 5. Installation des dépendances Python ---
log_info "Installation des dépendances Python à partir de requirements.txt..."
if [ ! -f "requirements.txt" ]; then
    log_error "Le fichier 'requirements.txt' est introuvable à la racine de votre dépôt. Veuillez le créer et le pousser sur GitHub."
fi
pip install -r requirements.txt || log_error "Échec de l'installation des dépendances Python."

log_info "Désactivation de l'environnement virtuel."
deactivate

# --- 6. Configuration de Gunicorn (service Systemd) ---
log_info "Création du service Systemd pour Gunicorn..."

cat <<EOF > /etc/systemd/system/$SERVICE_NAME.service
[Unit]
Description=Gunicorn instance for IP Monitor Flask app
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/$VENV_DIR/bin"
ExecStart=$APP_DIR/$VENV_DIR/bin/gunicorn --workers $GUNICORN_WORKERS --bind unix:$APP_DIR/$SERVICE_NAME.sock -m 007 app:app
# L'application est app.py et l'instance Flask s'appelle 'app'.
StandardOutput=inherit
StandardError=inherit
Restart=always
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload || log_error "Échec du rechargement des daemons Systemd."
systemctl enable "$SERVICE_NAME" || log_error "Échec de l'activation du service $SERVICE_NAME."
log_info "Service Gunicorn créé et activé."

# --- 7. Configuration de Nginx ---
log_info "Configuration de Nginx comme reverse proxy..."

# Suppression du site par défaut de Nginx (si existant)
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    rm /etc/nginx/sites-enabled/default
    log_info "Site Nginx par défaut supprimé (si existant)."
fi

cat <<EOF > /etc/nginx/sites-available/$SERVICE_NAME
server {
    listen 80;
    server_name _; # Utilise l'adresse IP du serveur par défaut.
                   # Si vous avez un nom de domaine, remplacez '_' par 'votre_domaine.com'.

    location / {
        include proxy_params;
        proxy_pass http://unix:$APP_DIR/$SERVICE_NAME.sock; # <-- Pointant vers le socket dans $APP_DIR
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Servir les fichiers statiques directement via Nginx (optimisation)
    location /static/ {
        alias $APP_DIR/static/; # <-- Pointant vers le dossier static dans $APP_DIR
        expires 30d; # Mette en cache les fichiers statiques pendant 30 jours
        add_header Cache-Control "public, no-transform";
    }
}
EOF

# Création du lien symbolique
ln -sf /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/ || log_error "Échec de la création du lien symbolique Nginx."

# Test de la configuration Nginx
nginx -t || log_error "Erreur dans la configuration Nginx. Veuillez vérifier le fichier /etc/nginx/sites-available/$SERVICE_NAME."

systemctl restart nginx || log_error "Échec du redémarrage de Nginx."
systemctl enable nginx || log_error "Échec de l'activation de Nginx."
log_info "Nginx configuré et redémarré."

# --- 8. Démarrage du service Gunicorn ---
log_info "Démarrage du service Gunicorn pour l'application IP Monitor..."
# Assurez-vous que le répertoire parent du socket est accessible par www-data si vous changez le chemin du socket.
# Dans ce script, le socket est créé directement dans $APP_DIR, donc les permissions devraient être correctes via chown -R $APP_DIR.

systemctl start "$SERVICE_NAME" || log_error "Échec du démarrage du service Gunicorn. Vérifiez les logs avec 'journalctl -u $SERVICE_NAME -f'."
systemctl status "$SERVICE_NAME" --no-pager

log_info "----------------------------------------------------"
log_info "Installation et configuration terminées avec succès !"
log_info "Votre application IP Monitor devrait être accessible à l'adresse IP de ce serveur sur le port 80 (HTTP)."
log_info "Pour vérifier le statut du service Gunicorn: ${YELLOW}sudo systemctl status $SERVICE_NAME${NC}"
log_info "Pour voir les logs du service Gunicorn: ${YELLOW}sudo journalctl -u $SERVICE_NAME -f${NC}"
log_info "----------------------------------------------------"
