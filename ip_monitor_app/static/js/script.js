document.addEventListener('DOMContentLoaded', () => {
    console.log('script.js loaded and DOM content loaded.'); // AIDE AU DÉBOGAGE

    const ipDisplayContainer = document.getElementById('ipDisplayContainer');
    const ipTableBody = document.querySelector('#ipTable tbody');
    const filterStatusSelect = document.getElementById('filterStatus');
    const displayModeSelect = document.getElementById('displayMode');
    const addIpBtn = document.getElementById('addIpBtn');
    const newIpInput = document.getElementById('newIp');
    const newHostnameInput = document.getElementById('newHostname');
    const scanNetworkBtn = document.getElementById('scanNetworkBtn');
    const noIpMessage = document.getElementById('noIpMessage');

    const listViewBtn = document.getElementById('listViewBtn');
    const tileViewBtn = document.getElementById('tileViewBtn');

    const totalIpCountSpan = document.getElementById('totalIpCount');
    const upIpCountSpan = document.getElementById('upIpCount');
    const downIpCountSpan = document.getElementById('downIpCount');

    // NOUVEAUX ÉLÉMENTS DE LA MODALE
    const confirmModal = document.getElementById('confirmModal');
    const modalIpAddressSpan = document.getElementById('modalIpAddress');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

    let ipToDeleteId = null; // Variable pour stocker l'ID de l'IP à supprimer

    // FONCTIONS DE GESTION DE LA MODALE
    function showConfirmModal(ipId, ipAddress) {
        ipToDeleteId = ipId;
        modalIpAddressSpan.textContent = ipAddress;
        confirmModal.classList.add('show');
    }

    function hideConfirmModal() {
        confirmModal.classList.remove('show');
        ipToDeleteId = null; // Réinitialise l'ID
    }

    // Gestionnaires d'événements pour les boutons de la modale
    confirmDeleteBtn.addEventListener('click', async () => {
        if (ipToDeleteId) {
            await deleteIp(ipToDeleteId);
            hideConfirmModal();
        }
    });

    cancelDeleteBtn.addEventListener('click', () => {
        hideConfirmModal();
    });

    // Cacher la modale si l'utilisateur clique en dehors du contenu
    confirmModal.addEventListener('click', (event) => {
        if (event.target === confirmModal) {
            hideConfirmModal();
        }
    });
    // --- FIN DES NOUVEAUX ÉLÉMENTS ET FONCTIONS DE LA MODALE ---


    // Fonction pour récupérer et afficher les IPs
    async function fetchIPs() {
        const statusFilter = filterStatusSelect.value;
        const displayMode = displayModeSelect.value;
        const currentView = ipDisplayContainer.classList.contains('list-view') ? 'list' : 'tile';

        let url = `/api/ips?display_mode=${displayMode}`;
        if (displayMode === 'used' && statusFilter !== 'all') {
            url += `&status=${statusFilter}`;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const ips = await response.json();

            let totalIps = ips.length;
            let upIps = 0;
            let downIps = 0;

            if (displayMode === 'used' || displayMode === 'all') {
                ips.forEach(ip => {
                    if (ip.is_up) {
                        upIps++;
                    } else if (ip.id !== null) {
                        downIps++;
                    }
                });
            } else if (displayMode === 'free') {
                downIps = ips.length;
                upIps = 0;
            }

            totalIpCountSpan.textContent = totalIps;
            upIpCountSpan.textContent = upIps;
            downIpCountSpan.textContent = downIps;

            if (currentView === 'list') {
                ipTableBody.innerHTML = '';
            } else {
                const tileContainer = document.getElementById('ipTileContainer');
                if (tileContainer) tileContainer.innerHTML = '';
            }

            if (ips.length === 0) {
                noIpMessage.style.display = 'block';
                ipTable.style.display = 'none';
                const tileContainer = document.getElementById('ipTileContainer');
                if (tileContainer) tileContainer.innerHTML = '';
                return;
            } else {
                noIpMessage.style.display = 'none';
                if (currentView === 'list') {
                    ipTable.style.display = 'table';
                    renderListView(ips);
                } else {
                    ipTable.style.display = 'none';
                    renderTileView(ips);
                }
            }

        } catch (error) {
            console.error("Erreur lors de la récupération des IPs:", error);
            alert("Erreur lors du chargement des IPs. Veuillez vérifier la console du navigateur.");
        }
    }

    // --- Fonctions de rendu spécifiques à la vue ---
    function renderListView(ips) {
        ipTableBody.innerHTML = '';
        const tileContainer = document.getElementById('ipTileContainer');
        if (tileContainer) tileContainer.innerHTML = '';

        ips.forEach(ip => {
            const row = ipTableBody.insertRow();
            if (ip.id !== null) {
                row.dataset.ipId = ip.id;
            }

            const ipCell = row.insertCell();
            ipCell.textContent = ip.ip;

            const hostnameCell = row.insertCell();
            hostnameCell.textContent = ip.hostname || 'Non défini';
            hostnameCell.classList.add('hostname-cell');

            const statusCell = row.insertCell();
            statusCell.textContent = ip.is_up ? 'Up' : 'Down';
            statusCell.classList.add(ip.is_up ? 'status-up' : 'status-down');

            const lastScannedCell = row.insertCell();
            lastScannedCell.textContent = ip.last_scanned ? new Date(ip.last_scanned).toLocaleString() : 'N/A';

            const actionsCell = row.insertCell();
            actionsCell.classList.add('action-buttons');

            if (ip.id !== null) {
                const editButton = document.createElement('button');
                editButton.textContent = 'Modifier Nom';
                editButton.addEventListener('click', () => enableEdit(row, ip.id, hostnameCell, ip.hostname, ip.ip)); // Passe l'IP originale
                actionsCell.appendChild(editButton);

                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Supprimer';
                deleteButton.classList.add('delete-btn');
                deleteButton.addEventListener('click', () => showConfirmModal(ip.id, ip.ip)); // Passe l'IP originale
                actionsCell.appendChild(deleteButton);
            } else {
                actionsCell.textContent = '-';
            }
        });
    }

    function renderTileView(ips) {
        ipTableBody.innerHTML = '';
        ipTable.style.display = 'none';

        let tileContainer = document.getElementById('ipTileContainer');
        if (!tileContainer) {
            tileContainer = document.createElement('div');
            tileContainer.id = 'ipTileContainer';
            ipDisplayContainer.appendChild(tileContainer);
        } else {
            tileContainer.innerHTML = '';
        }

        ips.forEach(ip => {
            const tile = document.createElement('div');
            tile.classList.add('ip-tile');
            tile.classList.add(ip.is_up ? 'status-up' : 'status-down');
            if (ip.id !== null) {
                tile.dataset.ipId = ip.id;
            }

            tile.innerHTML = `
                <div class="tile-ip">${ip.ip}</div>
                <div class="tile-hostname">${ip.hostname || 'Non défini'}</div>
                <div class="tile-status">Statut: ${ip.is_up ? 'Up' : 'Down'}</div>
                <div class="tile-last-scanned">Dernier scan: ${ip.last_scanned ? new Date(ip.last_scanned).toLocaleString() : 'N/A'}</div>
            `;

            if (ip.id !== null) {
                const editButton = document.createElement('button');
                editButton.textContent = 'Modifier Nom';
                editButton.classList.add('tile-edit-button');
                editButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const hostnameDiv = tile.querySelector('.tile-hostname');
                    enableEditTile(tile, ip.id, hostnameDiv, ip.hostname, ip.ip); // Passe l'IP originale
                });
                tile.appendChild(editButton);

                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Supprimer';
                deleteButton.classList.add('delete-btn', 'tile-delete-button');
                deleteButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    showConfirmModal(ip.id, ip.ip); // Passe l'IP originale
                });
                tile.appendChild(deleteButton);
            }

            tileContainer.appendChild(tile);
        });
    }

    // Fonctions d'édition
    // AJOUT DE ipAddress COMME PARAMÈTRE DANS enableEdit
    function enableEdit(row, ipId, hostnameCell, currentHostname, ipAddress) {
        hostnameCell.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentHostname || '';
        input.classList.add('edit-input');
        hostnameCell.appendChild(input);
        input.focus();

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Enregistrer';
        saveButton.classList.add('save');
        saveButton.addEventListener('click', () => saveHostname(ipId, input.value, hostnameCell));

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Annuler';
        cancelButton.classList.add('cancel');
        cancelButton.addEventListener('click', () => {
            hostnameCell.textContent = currentHostname || 'Non défini';
            const actionsCell = row.querySelector('.action-buttons');
            actionsCell.innerHTML = '';
            const editButton = document.createElement('button');
            editButton.textContent = 'Modifier Nom';
            editButton.addEventListener('click', () => enableEdit(row, ipId, hostnameCell, currentHostname, ipAddress));
            actionsCell.appendChild(editButton);
            // Rajouter le bouton supprimer si l'IP a un ID
            if (ipId !== null) {
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Supprimer';
                deleteButton.classList.add('delete-btn');
                deleteButton.addEventListener('click', () => showConfirmModal(ipId, ipAddress));
                actionsCell.appendChild(deleteButton);
            }
        });

        const actionsCell = row.querySelector('.action-buttons');
        actionsCell.innerHTML = '';
        actionsCell.appendChild(saveButton);
        actionsCell.appendChild(cancelButton);
    }

    // AJOUT DE ipAddress COMME PARAMÈTRE DANS enableEditTile
    function enableEditTile(tile, ipId, hostnameDiv, currentHostname, ipAddress) {
        const originalHostname = hostnameDiv.textContent;
        hostnameDiv.innerHTML = '';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentHostname || '';
        input.classList.add('edit-input-tile');
        hostnameDiv.appendChild(input);
        input.focus();

        const tileActions = document.createElement('div');
        tileActions.classList.add('tile-edit-actions');

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Enregistrer';
        saveButton.classList.add('save');
        saveButton.addEventListener('click', (event) => {
            event.stopPropagation();
            saveHostname(ipId, input.value, hostnameDiv);
        });

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Annuler';
        cancelButton.classList.add('cancel');
        cancelButton.addEventListener('click', (event) => {
            event.stopPropagation();
            hostnameDiv.textContent = originalHostname;
            tile.removeChild(tileActions);
            const editButton = document.createElement('button');
            editButton.textContent = 'Modifier Nom';
            editButton.classList.add('tile-edit-button');
            editButton.addEventListener('click', (e) => { e.stopPropagation(); enableEditTile(tile, ipId, hostnameDiv, currentHostname, ipAddress); });
            tile.appendChild(editButton);
            // Rajouter le bouton supprimer si l'IP a un ID
            if (ipId !== null) {
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Supprimer';
                deleteButton.classList.add('delete-btn', 'tile-delete-button');
                deleteButton.addEventListener('click', (e) => { e.stopPropagation(); showConfirmModal(ipId, ipAddress); });
                tile.appendChild(deleteButton);
            }
        });

        tile.appendChild(tileActions);
        tileActions.appendChild(saveButton);
        tileActions.appendChild(cancelButton);


        const originalEditButton = tile.querySelector('.tile-edit-button');
        if (originalEditButton) {
            tile.removeChild(originalEditButton);
        }
        const originalDeleteButton = tile.querySelector('.tile-delete-button');
        if (originalDeleteButton) {
            tile.removeChild(originalDeleteButton);
        }
    }


    async function saveHostname(ipId, newHostname, targetElement) {
        try {
            const response = await fetch(`/api/ips/${ipId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ hostname: newHostname || null })
            });

            if (response.ok) {
                // alert('Nom d\'hôte mis à jour !'); // On peut remplacer par un message flash custom
                fetchIPs();
            } else {
                const errorData = await response.json();
                alert('Erreur lors de la mise à jour du nom d\'hôte: ' + errorData.message);
            }
        } catch (error) {
            console.error('Erreur lors de la sauvegarde du nom d\'hôte:', error);
            alert('Une erreur est survenue lors de la mise à jour du nom d\'hôte.');
        }
    }

    // FONCTION MODIFIÉE: deleteIp (retire le confirm() et s'attend à être appelée par la modale)
    async function deleteIp(ipId) {
        try {
            const response = await fetch(`/api/ips/${ipId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // alert('IP supprimée avec succès !'); // On peut remplacer par un message flash custom
                fetchIPs(); // Rafraîchir la liste après suppression
            } else {
                const errorData = await response.json();
                alert('Erreur lors de la suppression de l\'IP: ' + errorData.message);
            }
        } catch (error) {
            console.error('Erreur lors de la suppression de l\'IP:', error);
            alert('Une erreur est survenue lors de la suppression de l\'IP.');
        }
    }

    // Événements pour les filtres et les vues (inchangés)
    filterStatusSelect.addEventListener('change', () => {
        if (displayModeSelect.value === 'free' || displayModeSelect.value === 'all') {
            filterStatusSelect.value = 'all';
            filterStatusSelect.disabled = true;
        } else {
            filterStatusSelect.disabled = false;
        }
        fetchIPs();
    });

    displayModeSelect.addEventListener('change', () => {
        if (displayModeSelect.value === 'free' || displayModeSelect.value === 'all') {
            filterStatusSelect.value = 'all';
            filterStatusSelect.disabled = true;
        } else {
            filterStatusSelect.disabled = false;
        }
        fetchIPs();
    });

    listViewBtn.addEventListener('click', () => {
        ipDisplayContainer.classList.remove('tile-view');
        ipDisplayContainer.classList.add('list-view');
        listViewBtn.classList.add('active');
        tileViewBtn.classList.remove('active');
        fetchIPs();
    });

    tileViewBtn.addEventListener('click', () => {
        ipDisplayContainer.classList.remove('list-view');
        ipDisplayContainer.classList.add('tile-view');
        tileViewBtn.classList.add('active');
        listViewBtn.classList.remove('active');
        fetchIPs();
    });

    // Événement pour ajouter une IP manuellement (inchangée)
    addIpBtn.addEventListener('click', async () => {
        const ip = newIpInput.value.trim();
        const hostname = newHostnameInput.value.trim();

        if (!ip) {
            alert('Veuillez entrer une adresse IP.');
            return;
        }

        try {
            const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
            if (!ipPattern.test(ip)) {
                alert('Format d\'adresse IP invalide.');
                return;
            }

            const response = await fetch('/api/ips', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ip, hostname: hostname || null })
            });

            if (response.status === 409) {
                alert('Cette adresse IP existe déjà dans la liste.');
                return;
            }

            if (response.ok) {
                // alert('Adresse IP ajoutée avec succès !'); // Remplacer par un message flash custom
                newIpInput.value = '';
                newHostnameInput.value = '';
                fetchIPs();
            } else {
                const errorData = await response.json();
                alert('Erreur lors de l\'ajout de l\'IP: ' + errorData.message);
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Une erreur est survenue lors de l\'ajout de l\'IP.');
        }
    });

    // Événement pour le bouton "Scanner le Réseau" (inchangée)
    scanNetworkBtn.addEventListener('click', async () => {
        scanNetworkBtn.disabled = true;
        scanNetworkBtn.textContent = 'Scan en cours...';
        try {
            const response = await fetch('/api/scan_network', {
                method: 'POST'
            });
            const data = await response.json();
            // alert(data.message); // Remplacer par un message flash custom
            setTimeout(fetchIPs, 5000);
        } catch (error) {
            console.error('Erreur lors du déclenchement du scan:', error);
            alert('Erreur lors du déclenchement du scan réseau.');
        } finally {
            scanNetworkBtn.disabled = false;
            scanNetworkBtn.textContent = 'Scanner le Réseau';
        }
    });

    // Charger les IPs au chargement de la page et initialiser les filtres
    fetchIPs();
    if (displayModeSelect.value === 'free' || displayModeSelect.value === 'all') {
        filterStatusSelect.disabled = true;
    }
});