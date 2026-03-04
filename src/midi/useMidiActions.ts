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
  const [isReceiving, setIsReceiving] = useState(false);
  
  // État pour la réception MIDI
  const receptionTimeoutRef = useRef<number | null>(null);
  const lastNRPNTimeRef = useRef<number>(0);
  const isReceivingRef = useRef<boolean>(false);
  const nrpnListenerRef = useRef<((nrpn: any, channel: number) => void) | null>(null);

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
    
    // Nettoyer l'état précédent
    if (receptionTimeoutRef.current) {
      clearTimeout(receptionTimeoutRef.current);
      receptionTimeoutRef.current = null;
    }
    
    // Nettoyer le listener précédent si il existe
    if (nrpnListenerRef.current) {
      console.log('🧹 Nettoyage du listener NRPN précédent');
      // Note: il faudrait idéalement avoir une méthode unlisten dans usePreenFM3Midi
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
      parserRef.current.logAll();
      
      // Convertir les NRPN en Patch et charger dans le store
      try {
        const patch = parserRef.current.toPatch();
        console.log('✅ Patch converti:', patch);
        console.log(`🎵 Algorithme dans le patch converti: ${patch.algorithm?.id} (${patch.algorithm?.name})`);
        
        loadPatch(patch);
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
      console.log(`📥 NRPN [${nrpn.paramMSB},${nrpn.paramLSB}] (idx=${paramIndex}) = [${nrpn.valueMSB},${nrpn.valueLSB}] (val=${value})`);
      
      // Logger spécifiquement l'algorithme
      if (nrpn.paramMSB === 0 && nrpn.paramLSB === 0) {
        console.log(`🎵 ALGORITHME REÇU: ${value}`);
      }
      
      // Réinitialiser le timeout d'inactivité
      if (receptionTimeoutRef.current) {
        clearTimeout(receptionTimeoutRef.current);
      }
      
      // Timeout dynamique basé sur l'inactivité (500ms après le dernier NRPN)
      receptionTimeoutRef.current = setTimeout(() => {
        const timeSinceLastNRPN = Date.now() - lastNRPNTimeRef.current;
        console.log(`⏱️ Timeout atteint (${timeSinceLastNRPN}ms depuis dernier NRPN)`);
        
        if (isReceivingRef.current && timeSinceLastNRPN >= 500) {
          console.log('=== Réception terminée par timeout ===' );
          checkAndLoadPatch();
        }
      }, 500);
    };
    
    // Stocker la référence du listener et l'ajouter
    nrpnListenerRef.current = nrpnListener;
    midi.listenToNRPN(nrpnListener);
    
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
    midi
  };
};