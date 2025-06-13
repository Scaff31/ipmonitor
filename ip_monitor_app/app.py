from flask import Flask, render_template, request, jsonify
from models import db, IPAddress
from config import Config
import nmap
import socket
import ipaddress
import threading
import time
import logging
import traceback
from flask_apscheduler import APScheduler

# --- Configuration de l'application et du logging ---
app = Flask(__name__)
app.config.from_object(Config)

class SchedulerConfig:
    SCHEDULER_API_ENABLED = True
    SCHEDULER_INTERVAL_SECONDS = 300 # Scan toutes les 5 minutes par défaut

app.config.from_object(SchedulerConfig)

# Configuration du niveau de log pour l'application
app.logger.setLevel(logging.DEBUG) # Définit le niveau de log minimum à DEBUG

db.init_app(app)

scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()

# Création de la base de données (à exécuter une fois)
with app.app_context():
    db.create_all()
    app.logger.info("Base de données vérifiée/créée.")

# --- Fonctions utilitaires ---

# Fonction de scan du réseau
def scan_network_segment(network_cidr):
    with app.app_context():
        nm = nmap.PortScanner()
        app.logger.info(f"Lancement du scan Nmap sur le segment : {network_cidr}")
        try:
            nm.scan(hosts=network_cidr, arguments='-sn')
            app.logger.info(f"Scan Nmap terminé pour {network_cidr}. Hôtes détectés: {nm.all_hosts()}")

            # Convertir toutes les IPs existantes en un dictionnaire pour un accès rapide
            existing_ips_in_db = {ip.ip: ip for ip in IPAddress.query.all()}
            
            # Liste pour stocker les IPs trouvées par Nmap dans ce scan
            found_by_nmap = set()

            for host in nm.all_hosts():
                found_by_nmap.add(host)
                is_up = True
                
                # La résolution DNS est commentée pour éviter un blocage potentiel
                resolved_name = None
                # try:
                #     resolved_name = socket.gethostbyaddr(host)[0]
                # except socket.herror:
                #     resolved_name = None

                ip_entry = existing_ips_in_db.get(host)
                if ip_entry:
                    # Mettre à jour l'entrée existante
                    ip_entry.is_up = is_up
                    ip_entry.last_scanned = db.func.now()
                    # Si un nom est résolu et qu'il n'y a pas déjà un hostname personnalisé
                    if resolved_name and not ip_entry.hostname:
                        ip_entry.hostname = resolved_name
                    app.logger.debug(f"Mise à jour de l'IP existante: {host}")
                else:
                    # Ajouter une nouvelle entrée si elle n'existe pas
                    new_ip = IPAddress(ip=host, is_up=is_up, hostname=resolved_name)
                    db.session.add(new_ip)
                    app.logger.debug(f"Ajout d'une nouvelle IP: {host}")
            
            # Mettre à jour le statut des IPs qui n'ont PAS été trouvées dans ce scan mais qui sont dans la DB comme 'up'
            for ip_str, ip_obj in existing_ips_in_db.items():
                if ip_str not in found_by_nmap and ip_obj.is_up:
                    ip_obj.is_up = False
                    app.logger.info(f"Marqué comme 'down': {ip_str} (non trouvé dans ce scan)")

            db.session.commit()
            app.logger.info("Toutes les modifications de la base de données ont été committées.")

        except nmap.PortScannerError as e:
            app.logger.error(f"ERREUR NMAP LORS DU SCAN : {e}")
            db.session.rollback()
        except Exception as e:
            app.logger.error(f"ERREUR GÉNERALE LORS DU SCAN OU DE L'ENREGISTREMENT EN BASE DE DONNÉES : {e}")
            app.logger.error(traceback.format_exc()) # Affiche le traceback complet
            db.session.rollback()
        finally:
            app.logger.info("Fonction scan_network_segment terminée.")

# Fonction pour obtenir l'adresse IP locale du serveur Flask
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('1.1.1.1', 1))
        IP = s.getsockname()[0]
        app.logger.debug(f"IP locale déterminée via socket : {IP}")
    except Exception as e:
        app.logger.warning(f"ATTENTION: Impossible de déterminer l'IP locale via socket: {e}. Utilisation de 127.0.0.1.")
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

# Fonction utilitaire pour convertir une IP en tuple d'entiers pour le tri numérique
def ip_to_int_tuple(ip_str):
    try:
        return tuple(map(int, ip_str.split('.')))
    except ValueError:
        app.logger.error(f"Erreur de conversion IP pour tri: {ip_str}")
        return (0,0,0,0) # Valeur par défaut pour éviter le crash

# --- Routes de l'API Flask ---

# Endpoint pour récupérer les IPs avec filtres et affichage de toutes les IPs possibles
@app.route('/api/ips', methods=['GET'])
def get_ips():
    display_mode = request.args.get('display_mode', 'used') # 'used', 'free', 'all'
    
    # Obtenir la plage réseau (on suppose qu'elle est toujours la même que celle du scan)
    local_ip = get_local_ip()
    network_cidr = ".".join(local_ip.split('.')[:-1]) + ".0/24"
    
    app.logger.debug(f"Requête API /api/ips avec display_mode: {display_mode}, pour réseau: {network_cidr}")

    all_possible_ips = []
    try:
        network = ipaddress.ip_network(network_cidr)
        # Exclure l'adresse réseau et l'adresse de broadcast
        for ip in network.hosts():
            all_possible_ips.append(str(ip))
    except ValueError as e:
        app.logger.error(f"Erreur lors de la génération des IPs de la plage {network_cidr}: {e}")
        return jsonify({'message': 'Erreur de configuration réseau'}), 500

    # Récupérer toutes les IPs de la base de données
    ips_in_db = {ip.ip: ip for ip in IPAddress.query.all()}

    response_data = []

    # Construire la liste des IPs à afficher
    if display_mode == 'used': # Afficher seulement les IPs qui sont dans la DB
        status_filter = request.args.get('status')
        for ip_str, ip_obj in ips_in_db.items():
            if (status_filter == 'up' and ip_obj.is_up) or \
               (status_filter == 'down' and not ip_obj.is_up) or \
               (status_filter not in ['up', 'down']):
                response_data.append({
                    'id': ip_obj.id,
                    'ip': ip_obj.ip,
                    'hostname': ip_obj.hostname,
                    'is_up': ip_obj.is_up,
                    'last_scanned': ip_obj.last_scanned.isoformat() if ip_obj.last_scanned else None
                })
    elif display_mode == 'free': # Afficher UNIQUEMENT les IPs de la plage qui ne sont PAS DU TOUT dans la base de données
        for ip_str in all_possible_ips:
            if ip_str not in ips_in_db: # L'IP n'existe pas dans la base de données, donc elle est "libre"
                response_data.append({
                    'id': None, # Pas d'ID car elle n'est pas dans la DB
                    'ip': ip_str,
                    'hostname': 'Libre',
                    'is_up': False,
                    'last_scanned': None
                })
    elif display_mode == 'all': # Afficher toutes les IPs de la plage, utilisées et libres
        for ip_str in all_possible_ips:
            ip_obj = ips_in_db.get(ip_str)
            if ip_obj:
                response_data.append({
                    'id': ip_obj.id,
                    'ip': ip_obj.ip,
                    'hostname': ip_obj.hostname,
                    'is_up': ip_obj.is_up,
                    'last_scanned': ip_obj.last_scanned.isoformat() if ip_obj.last_scanned else None
                })
            else:
                response_data.append({
                    'id': None, # Pas d'ID pour les IPs non enregistrées
                    'ip': ip_str,
                    'hostname': 'Libre',
                    'is_up': False,
                    'last_scanned': None
                })

    # Tri numérique final
    sorted_response_data = sorted(response_data, key=lambda x: ip_to_int_tuple(x['ip']))
    
    app.logger.info(f"API /api/ips a retourné {len(sorted_response_data)} IPs pour le mode '{display_mode}'.")
    return jsonify(sorted_response_data)

# Endpoint pour mettre à jour le nom d'hôte
@app.route('/api/ips/<int:ip_id>', methods=['PUT'])
def update_ip_name(ip_id):
    data = request.get_json()
    with app.app_context():
        ip_entry = IPAddress.query.get(ip_id)
        if not ip_entry:
            return jsonify({'message': 'IP non trouvée'}), 404

        if 'hostname' in data:
            ip_entry.hostname = data['hostname']
            db.session.commit()
            app.logger.info(f"Hostname de l'IP {ip_id} mis à jour vers {data['hostname']}.")
            return jsonify({'message': 'Hostname mis à jour avec succès'})
        return jsonify({'message': 'Aucun hostname fourni'}), 400

# NOUVEAU Endpoint pour supprimer une IP
@app.route('/api/ips/<int:ip_id>', methods=['DELETE'])
def delete_ip(ip_id):
    with app.app_context():
        ip_entry = IPAddress.query.get(ip_id)
        if not ip_entry:
            app.logger.warning(f"Tentative de suppression d'une IP non trouvée: ID {ip_id}")
            return jsonify({'message': 'IP non trouvée'}), 404
        
        try:
            db.session.delete(ip_entry)
            db.session.commit()
            app.logger.info(f"IP {ip_entry.ip} (ID: {ip_id}) supprimée avec succès.")
            return jsonify({'message': 'IP supprimée avec succès'}), 200
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erreur lors de la suppression de l'IP {ip_id}: {e}")
            app.logger.error(traceback.format_exc())
            return jsonify({'message': f'Erreur lors de la suppression de l\'IP: {e}'}), 500

# Endpoint pour ajouter une IP manuellement
@app.route('/api/ips', methods=['POST'])
def add_ip():
    data = request.get_json()
    ip_str = data.get('ip')
    hostname = data.get('hostname')

    if not ip_str:
        return jsonify({'message': 'Adresse IP requise'}), 400

    try:
        ipaddress.ip_address(ip_str) # Valider le format de l'IP
    except ValueError:
        return jsonify({'message': 'Format d\'adresse IP invalide'}), 400

    with app.app_context():
        existing_ip = IPAddress.query.filter_by(ip=ip_str).first()
        if existing_ip:
            return jsonify({'message': 'Adresse IP déjà existante'}), 409

        new_ip = IPAddress(ip=ip_str, hostname=hostname, is_up=False) # Par défaut, on ne sait pas si elle est UP
        db.session.add(new_ip)
        db.session.commit()
        app.logger.info(f"IP manuelle ajoutée: {ip_str} avec hostname: {hostname}.")
        return jsonify({'message': 'Adresse IP ajoutée avec succès', 'id': new_ip.id}), 201

# Endpoint pour lancer un scan manuel
@app.route('/api/scan_network', methods=['POST'])
def trigger_scan():
    local_ip = get_local_ip()
    network_prefix = ".".join(local_ip.split('.')[:-1]) + ".0/24"

    app.logger.info(f"Requête de scan reçue. Lancement du thread pour le réseau: {network_prefix}")
    threading.Thread(target=scan_network_segment, args=(network_prefix,)).start()
    return jsonify({'message': f'Scan du réseau {network_prefix} lancé en arrière-plan.'})

# Page d'accueil
@app.route('/')
def index():
    app.logger.info("Accès à la page d'accueil (index.html).")
    return render_template('index.html')

# --- Définition de la tâche de scan automatique par le scheduler ---
@scheduler.task('interval', id='network_scan_job', seconds=app.config['SCHEDULER_INTERVAL_SECONDS'], misfire_grace_time=900)
def automated_network_scan():
    with app.app_context():
        app.logger.info("Démarrage du scan réseau automatique par le scheduler.")
        local_ip = get_local_ip()
        network_prefix = ".".join(local_ip.split('.')[:-1]) + ".0/24"
        scan_network_segment(network_prefix)
        app.logger.info("Scan réseau automatique terminé.")

# Le bloc if __name__ == '__main__': doit être supprimé ou commenté pour Gunicorn
# if __name__ == '__main__':
#     app.run(debug=True)