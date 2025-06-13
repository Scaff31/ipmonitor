🚀 IP Monitor - Surveillance et Gestion de Réseau

Bienvenue sur IP Monitor ! Cette application web simple vous permet de surveiller l'état (Up/Down) des adresses IP de votre réseau, de gérer les hostnames associés, et d'obtenir des informations sur les scans. Idéal pour avoir un aperçu rapide de la disponibilité de vos équipements.
✨ Fonctionnalités Clés

    Ajout d'IPs Manuellement : Ajoutez facilement de nouvelles adresses IP et leurs hostnames associés.
    Scan de Statut Automatique : L'application scanne périodiquement les IPs enregistrées pour déterminer leur statut (Up ou Down).
    Gestion des Hostnames : Modifiez les hostnames directement depuis l'interface pour une meilleure organisation.
    Vue Liste et Tuiles : Affichez vos IPs sous forme de tableau détaillé ou de tuiles compactes pour une meilleure visibilité.
    Filtres de Statut : Filtrez les IPs par leur statut (Up, Down, ou toutes).
    Compteurs en Temps Réel : Visualisez le nombre total d'IPs, ainsi que le nombre d'IPs Up et Down.
    Dernier Scan : Voyez la date et l'heure du dernier scan pour chaque IP.

📸 Aperçu de l'Application

Voici à quoi ressemble l'application en action :

![firefox_1BSRKVZ0wq](https://github.com/user-attachments/assets/cb88d09c-efd8-4e2d-9d21-f6073250f1f8)


🛠️ Installation

Suivez ces étapes pour configurer et lancer l'application sur votre machine.

    Clonez le dépôt :
    Bash

git clone https://github.com/Scaff31/ipmonitor.git
cd ipmonitor

Créez et activez un environnement virtuel :

Il est fortement recommandé d'utiliser un environnement virtuel pour gérer les dépendances.
Bash

python3 -m venv venv
source venv/bin/activate

Installez les dépendances Python :
Bash

pip install -r requirements.txt

Initialisez la base de données :

Ceci va créer le fichier site.db et les tables nécessaires.
Bash

flask --app app init-db

Lancez l'application Flask :
Bash

    flask --app app run --host 0.0.0.0 --port 5000

    L'application sera accessible dans votre navigateur à l'adresse http://<votre_adresse_ip_du_serveur>:5000.

    Pour une utilisation en production, utilisez un serveur WSGI comme Gunicorn (voir la documentation de Flask pour le déploiement).

🚀 Utilisation

Une fois l'application lancée :

    Ajouter une IP : Utilisez les champs "Nouvelle IP" et "Hostname" en bas de page pour ajouter de nouvelles entrées.
    Scanner le réseau : Cliquez sur le bouton "Scanner le Réseau" pour lancer un scan manuel de toutes les IPs enregistrées.
    Modifier un Hostname (vue Liste) : Cliquez sur un hostname dans la vue liste pour le modifier directement dans la cellule.
    Modifier un Hostname (vue Tuiles) : Cliquez sur le bouton "Modifier" sous une tuile pour passer en mode édition.
    Filtrer/Trier : Utilisez les sélecteurs "Filtrer par statut" et "Mode d'affichage" pour organiser les informations.

💻 Technologies Utilisées

    Backend : Flask (Python)
    Base de Données : SQLite
    Frontend : HTML, CSS, JavaScript
