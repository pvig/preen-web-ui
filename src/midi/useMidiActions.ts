import { useRef, useState } from 'react';
import { usePreenFM3Midi } from './usePreenFM3Midi';
import { useCurrentPatch, usePatchStore } from '../stores/patchStore';
import { requestPatchDump } from './midiService';
import { PreenFM3Parser } from './preenFM3Parser';

export const useMidiActions = () => {
  const midi = usePreenFM3Midi();
  const currentPatch = useCurrentPatch();
  const { loadPatch } = usePatchStore();
  const parserRef = useRef<PreenFM3Parser>(new PreenFM3Parser());
  const [receivedCount, setReceivedCount] = useState(0);
  const [receivedName, setReceivedName] = useState('');

  // Envoi d'un patch au PreenFM3 (Push)
  const sendPatch = () => {
    if (!midi.selectedOutput) {
      alert('Aucune sortie MIDI sélectionnée');
      return;
    }

    // TODO: Implémenter la conversion du patch en SysEx ou NRPN
    console.log('Patch à envoyer:', currentPatch);
    console.log('Fonctionnalité Push en cours de développement...');
    
    // Pour l'instant, on peut au moins envoyer l'algorithme
    if (currentPatch?.algorithm) {
      midi.sendAlgorithmChange(String(currentPatch.algorithm.id));
    }
  };

  // Réception d'un patch depuis le PreenFM3 (Pull)
  const receivePatch = () => {
    if (!midi.selectedInput) {
      alert('Aucune entrée MIDI sélectionnée');
      return;
    }

    console.log('🎹 Demande de patch au PreenFM3...');
    
    // Réinitialiser le parser
    parserRef.current.reset();
    setReceivedCount(0);
    setReceivedName('');
    
    requestPatchDump(0, midi.channel); // Timbre 0
    
    // Écouter les NRPN entrants
    midi.listenToNRPN((nrpn, _channel) => {
      // Ajouter au parser
      parserRef.current.addNRPN(nrpn);
      
      // Intercepter les NRPN MIX/PAN et les appliquer directement
      // (loadPatch() préservera ces valeurs automatiquement)
      const paramIndex = (nrpn.paramMSB << 7) | nrpn.paramLSB;
      const value = (nrpn.valueMSB << 7) | nrpn.valueLSB;
      
      // MIX: NRPN [0, 16+(n-1)*2] plage 0-100
      // PAN: NRPN [0, 17+(n-1)*2] plage 0-200
      // Suppression de la mise à jour immédiate de l'amplitude/pan lors du pull NRPN :
      // Les valeurs correctes seront appliquées lors du chargement du patch complet.
      
      // Mettre à jour l'affichage
      const stats = parserRef.current.getStats();
      setReceivedCount(stats.count);
      setReceivedName(stats.name);
      
      // Logger de manière plus lisible
      console.log(`📥 NRPN [${nrpn.paramMSB},${nrpn.paramLSB}] (idx=${paramIndex}) = [${nrpn.valueMSB},${nrpn.valueLSB}] (val=${value})`);
    });

    // Attendre un peu puis convertir et charger le patch
    setTimeout(() => {
      console.log('=== Réception terminée ===');
      parserRef.current.logAll();
      
      // Convertir les NRPN en Patch et charger dans le store
      // Note: loadPatch() préserve automatiquement amplitude/pan des opérateurs existants
      try {
        const patch = parserRef.current.toPatch();
        console.log('✅ Patch converti:', patch);
        loadPatch(patch);
        console.log('✅ Patch chargé dans l\'UI (avec MIX/PAN préservés)');
      } catch (error) {
        console.error('❌ Erreur lors de la conversion du patch:', error);
      }
    }, 2000);
  };

  return {
    sendPatch,
    receivePatch,
    receivedCount,
    receivedName,
    midi
  };
};