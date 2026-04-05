import { useRef, useState } from 'react';
import { usePreenFM3Midi } from './usePreenFM3Midi';
import { useCurrentPatch, usePatchStore } from '../stores/patchStore';
import { requestPatchDump, sendNRPN, clearNRPNQueue, drainNRPNQueue } from './midiService';
import { PreenFM3Parser } from './preenFM3Parser';
import { patchToNRPNMessages, type PatchToNRPNOptions } from './patchSerializer';
import { useSynthStore } from '../stores/synthStore';

export const useMidiActions = () => {
  const midi = usePreenFM3Midi();
  const currentPatch = useCurrentPatch();
  const { loadPatch } = usePatchStore();
  const parserRef = useRef<PreenFM3Parser>(new PreenFM3Parser());
  const [receivedCount, setReceivedCount] = useState(0);
  const [receivedName, setReceivedName] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // État pour la réception MIDI
  const receptionTimeoutRef = useRef<number | null>(null);
  const lastNRPNTimeRef = useRef<number>(0);
  const isReceivingRef = useRef<boolean>(false);
  // Stocke la fonction d'unsubscribe retournée par onNRPNScoped
  const nrpnListenerRef = useRef<(() => void) | null>(null);

  // Envoi d'un patch au PreenFM3 (Push)
  const sendPatch = (options?: PatchToNRPNOptions) => {
    if (!midi.selectedOutput) {
      alert('Aucune sortie MIDI sélectionnée');
      return;
    }

    if (!currentPatch) {
      alert('Aucun patch chargé');
      return;
    }

    console.log('📤 Push du patch vers le PreenFM3…', currentPatch.name);

    // Cancel any in-flight push before starting a new one
    clearNRPNQueue();
    setIsSending(true);

    const nrpnMessages = patchToNRPNMessages(currentPatch, options);
    console.log(`📤 ${nrpnMessages.length} messages NRPN à envoyer (via queue, ~${nrpnMessages.length * 10}ms)`);

    // Queue all messages — the NRPN queue handles pacing (10 ms gap)
    // and deduplication automatically.
    for (const msg of nrpnMessages) {
      sendNRPN(msg, midi.channel);
    }

    // Reset visual feedback when the full push is done
    drainNRPNQueue().then(() => {
      console.log(`✅ Push terminé : ${nrpnMessages.length} messages NRPN envoyés`);
      setIsSending(false);
    });
  };

  // Réception d'un patch depuis le PreenFM3 (Pull)
  const receivePatch = () => {
    if (!midi.selectedInput) {
      alert('Aucune entrée MIDI sélectionnée');
      return;
    }

    console.log('🎹 Demande de patch au PreenFM3...');
    
    // Nettoyer l'état précédent
    if (receptionTimeoutRef.current) {
      clearTimeout(receptionTimeoutRef.current);
      receptionTimeoutRef.current = null;
    }
    
    // Nettoyer le listener précédent si il existe
    if (nrpnListenerRef.current) {
      console.log('🧹 Nettoyage du listener NRPN précédent');
      nrpnListenerRef.current();
      nrpnListenerRef.current = null;
    }

    // Réinitialiser le parser et l'état
    parserRef.current.reset();
    setReceivedCount(0);
    setReceivedName('');
    setIsReceiving(true);
    isReceivingRef.current = true;
    lastNRPNTimeRef.current = Date.now();
    
    console.log('📡 Envoi de la demande de dump patch...');
    requestPatchDump(0, midi.channel); // Timbre 0
    
    // Fonction pour vérifier la complétude et charger le patch
    const checkAndLoadPatch = () => {
      console.log('🔍 Vérification de la complétude du patch...');
      
      const stats = parserRef.current.getStats();
      console.log(`📊 Statistiques: ${stats.count} paramètres reçus, nom: "${stats.name}"`);
      
      // Vérifier que les paramètres critiques ont été reçus
      const algorithmValue = parserRef.current.getValue(0, 0);
      const hasBasicParams = stats.count >= 20; // Minimum de paramètres attendus
      
      if (algorithmValue === undefined) {
        console.error('❌ ÉCHEC: Algorithme non reçu (NRPN [0,0] manquant)');
        alert('Erreur: Algorithme non reçu du PreenFM3. Veuillez réessayer.');
        setIsReceiving(false);
        isReceivingRef.current = false;
        return;
      }
      
      if (!hasBasicParams) {
        console.warn(`⚠️ Peu de paramètres reçus (${stats.count}), chargement quand même...`);
      }
      
      console.log(`✅ Algorithme reçu: ${algorithmValue}`);
      //parserRef.current.logAll();
      
      // Convertir les NRPN en Patch et charger dans le store
      try {
        const patch = parserRef.current.toPatch();
        console.log('✅ Patch converti:', patch);
        console.log(`🎵 Algorithme dans le patch converti: ${patch.algorithm?.id} (${patch.algorithm?.name})`);

        // ── Génération de la fixture de test (dev only) ───────────────────
        if (import.meta.env.DEV) {
          // Générer la fixture en conservant l'ordre exact de réception des NRPN (aucun tri ni regroupement)
          const fixtureData = {
            description: `${stats.name || 'patch'} — ${new Date().toISOString().slice(0, 10)}`,
            nrpns: parserRef.current.getRawNRPNs(),
            expected: {
              name: patch.name,
              algorithm: { id: patch.algorithm.id, name: patch.algorithm.name },
              operators: patch.operators.map(op => ({
                waveform: op.waveform,
                frequency: op.frequency,
                keyboardTracking: op.keyboardTracking,
              })),
              modulationMatrix: patch.modulationMatrix,
              lfos: patch.lfos,
              filters: patch.filters,
              arpeggiator: patch.arpeggiator,
            },
          };
          // Décommenter pour générer une fixture :
          // console.log('%c🧪 FIXTURE JSON ▼  Copier dans src/midi/__tests__/fixtures/nom-du-patch.fixture.json', 'color: #10b981; font-weight: bold;');
          // console.log(JSON.stringify(fixtureData, null, 2));
          void fixtureData;
        }
        // ─────────────────────────────────────────────────────────────────

        // Synchroniser la version firmware dans le synthStore
        useSynthStore.getState().setPfm3Version(parserRef.current.getpfm3Version());
        loadPatch(patch);
        usePatchStore.getState().notifyPullReceived();
        console.log('✅ Patch chargé dans l\'UI');

        // Mettre à jour les statistiques finales
        setReceivedCount(stats.count);
        setReceivedName(stats.name);
        
      } catch (error) {
        console.error('❌ Erreur lors de la conversion du patch:', error);
        alert(`Erreur lors du chargement du patch: ${error}`);
      }
      
      setIsReceiving(false);
      isReceivingRef.current = false;
    };
    
    // Créer le listener NRPN
    const nrpnListener = (nrpn: any, _channel: number) => {
      if (!isReceivingRef.current) return;
      
      // Mettre à jour le timestamp de dernière réception
      lastNRPNTimeRef.current = Date.now();
      
      // Ajouter au parser
      parserRef.current.addNRPN(nrpn);
      
      const paramIndex = (nrpn.paramMSB << 7) | nrpn.paramLSB;
      const value = (nrpn.valueMSB << 7) | nrpn.valueLSB;
      
      // Mettre à jour l'affichage en temps réel
      const stats = parserRef.current.getStats();
      setReceivedCount(stats.count);
      setReceivedName(stats.name);
      
      // Logger de manière plus lisible
      let asciiChar = '';
      if (value >= 32 && value <= 126) {
        asciiChar = ` (char='${String.fromCharCode(value)}')`;
      }
      console.log(`📥 NRPN [${nrpn.paramMSB},${nrpn.paramLSB}] (idx=${paramIndex}) = [${nrpn.valueMSB},${nrpn.valueLSB}] (val=${value})${asciiChar}`);

      // Logger spécifiquement l'algorithme
      if (nrpn.paramMSB === 0 && nrpn.paramLSB === 0) {
        console.log(`🎵 ALGORITHME REÇU: ${value}`);
      }
      
      // Réinitialiser le timeout d'inactivité
      if (receptionTimeoutRef.current) {
        clearTimeout(receptionTimeoutRef.current);
      }
      
      // Timeout dynamique basé sur l'inactivité (500ms après le dernier NRPN)
      receptionTimeoutRef.current = window.setTimeout(() => {
        const timeSinceLastNRPN = Date.now() - lastNRPNTimeRef.current;
        console.log(`⏱️ Timeout atteint (${timeSinceLastNRPN}ms depuis dernier NRPN)`);
        
        if (isReceivingRef.current && timeSinceLastNRPN >= 500) {
          console.log('=== Réception terminée par timeout ===' );
          checkAndLoadPatch();
        }
      }, 500);
    };
    
    // Stocker la référence du listener et l'ajouter
    nrpnListenerRef.current = midi.listenToNRPN(nrpnListener);
    
    // Timeout de sécurité (10 secondes max)
    setTimeout(() => {
      if (isReceivingRef.current) {
        console.log('⚠️ Timeout de sécurité atteint (10s)');
        const stats = parserRef.current.getStats();
        if (stats.count > 0) {
          console.log('🔄 Tentative de chargement avec les données partielles...');
          checkAndLoadPatch();
        } else {
          console.error('❌ Aucune donnée reçue après 10s');
          alert('Timeout: Aucune réponse du PreenFM3. Vérifiez la connexion MIDI.');
          setIsReceiving(false);
          isReceivingRef.current = false;
        }
      }
    }, 10000);
  };

  return {
    sendPatch,
    receivePatch,
    receivedCount,
    receivedName,
    isReceiving,
    isSending,
    midi
  };
};