import styled from 'styled-components';
import { usePreenFM3Midi } from '../midi/usePreenFM3Midi';
import { requestPatchDump } from '../midi/midiService';
import { useCurrentPatch, usePatchStore } from '../stores/patchStore';
import { PreenFM3Parser } from '../midi/preenFM3Parser';
import { useState, useRef } from 'react';

const MidiMenuContainer = styled.div`
  background: none;
  display: inline-flex;
  margin: auto;
  justify-content: space-between;
  flex-wrap: wrap;
  max-width: 1200px;
`;

const MidiPorts = styled.div`
  display: flex;
  gap: 0.5rem;
  
  h3 {
    color: ${props => props.theme.colors.text};
  }
`;

const MidiPortSelect = styled.div`
  margin: 0.5rem;
  
  label {
    display: block;
    margin-bottom: 0.25rem;
    color: ${props => props.theme.colors.text};
  }
  
  select {
    width: 10em;
    padding: 0.5rem;
    border-radius: 0.25rem;
    background: ${props => props.theme.colors.button};
    color: ${props => props.theme.colors.text};
    border: 1px solid ${props => props.theme.colors.border};
    cursor: pointer;
    display: block;
    
    &:focus {
      outline: none;
      border-color: ${props => props.theme.colors.primary};
    }
  }
`;

const MidiActions = styled.div`
  display: flex;
  gap: 0.25rem;
  margin: 1rem;
`;

const MidiButton = styled.button`
  flex: 1;
  padding: 0.25rem 1rem;
  border-radius: 0.25rem;
  background: ${props => props.theme.colors.primary};
  color: ${props => props.theme.colors.background};
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  font-weight: 500;
  
  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.buttonHover || props.theme.colors.accent};
  }
  
  &:disabled {
    background: ${props => props.theme.colors.button};
    cursor: not-allowed;
    opacity: 0.5;
  }
`;


const ErrorMessage = styled.p`
  color: ${props => props.theme.colors.accent};
  margin: 0.5rem;
  padding: 0.5rem;
  background: ${props => `${props.theme.colors.accent}20`};
  border-radius: 0.25rem;
`;

const ErrorContainer = styled.div`
  padding: 1rem;
`;

const HelpContainer = styled.div`
  margin-top: 1rem;
  padding: 1rem;
  background: ${props => props.theme.colors.background};
  border-radius: 0.5rem;
  border-left: 3px solid ${props => props.theme.colors.primary};
  
  h4 {
    margin: 0 0 0.75rem 0;
    color: ${props => props.theme.colors.primary};
    font-size: 1rem;
  }
  
  p {
    color: ${props => props.theme.colors.textSecondary};
    margin: 0.5rem 0;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  
  ol {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
    color: ${props => props.theme.colors.text};
    
    li {
      margin: 0.5rem 0;
      font-size: 0.875rem;
    }
  }
`;

const HelpNote = styled.p`
  padding: 0.5rem;
  background: ${props => `${props.theme.colors.primary}20`};
  border-radius: 0.25rem;
  margin: 0.5rem 0 !important;
  
  code {
    background: ${props => props.theme.colors.button};
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-family: 'Courier New', monospace;
    color: ${props => props.theme.colors.primary};
    font-size: 0.8125rem;
  }
`;

const InfoBox = styled.div`
  margin: 0.5rem;
  padding: 0.75rem;
  background: rgba(237, 137, 54, 0.1);
  border-left: 3px solid #ed8936;
  border-radius: 0.25rem;
  
  p {
    margin: 0.25rem 0;
    color: ${props => props.theme.colors.text};
    font-size: 0.875rem;
  }
`;

const InfoDetail = styled.p`
  color: ${props => props.theme.colors.textMuted} !important;
  font-size: 0.8125rem !important;
`;

const ReceptionStatus = styled.div`
  margin: 0.5rem;
  padding: 0.75rem;
  background: rgba(16, 185, 129, 0.1);
  border-left: 3px solid #10b981;
  border-radius: 0.25rem;
  
  p {
    margin: 0.25rem 0;
    color: #d1fae5;
    font-size: 0.875rem;
  }
`;

const PatchName = styled.p`
  color: #6ee7b7 !important;
  font-weight: 500 !important;
`;

export const MidiMenu = () => {
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
      // Suppression de la mise à jour immédiate de l’amplitude/pan lors du pull NRPN :
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

  if (midi.isLoading) {
    return (
      <MidiMenuContainer>
        <p>Initialisation MIDI...</p>
      </MidiMenuContainer>
    );
  }

  if (midi.error) {
    return (
      <MidiMenuContainer>
        <ErrorContainer>
          <ErrorMessage>❌ {midi.error}</ErrorMessage>
          <HelpContainer>
            <h4>Web MIDI API requis</h4>
            <p>Pour utiliser la connexion MIDI avec le PreenFM3, vous devez :</p>
            <ol>
              <li>Utiliser un navigateur compatible (Chrome, Edge, Brave, Opera)</li>
              <li>Autoriser l'accès MIDI dans les permissions du site</li>
              <li>Connecter votre PreenFM3 via USB</li>
            </ol>
            <HelpNote>
              💡 <strong>Chrome/Edge/Brave :</strong> Cliquez sur l'icône de cadenas dans la barre d'adresse → 
              Paramètres du site → Autorisez "Périphériques MIDI"
            </HelpNote>
            <HelpNote>
              💡 <strong>Firefox :</strong> Tapez <code>about:config</code> → 
              Recherchez <code>dom.webmidi.enabled</code> → Activez-le (support expérimental)
            </HelpNote>
          </HelpContainer>
        </ErrorContainer>
      </MidiMenuContainer>
    );
  }

  const noDevices = !midi.devices || (midi.devices.inputs.length === 0 && midi.devices.outputs.length === 0);

  return (
    <MidiMenuContainer>
      {noDevices && (
        <InfoBox>
          <p>⚠️ Aucun périphérique MIDI détecté</p>
          <InfoDetail>Connectez votre PreenFM3 via USB et actualisez la page</InfoDetail>
        </InfoBox>
      )}
      
      <MidiPorts>
        <MidiPortSelect>
          <label>
            Entrée MIDI:
            <select 
              value={midi.selectedInput?.id || ''}
              onChange={(e) => {
                const input = midi.devices?.inputs.find(i => i.id === e.target.value);
                midi.selectInput(input || null);
              }}
            >
              <option value="">-- Sélectionner --</option>
              {midi.devices?.inputs.map(input => (
                <option key={input.id} value={input.id}>
                  {input.name}
                </option>
              ))}
            </select>
          </label>
        </MidiPortSelect>

        <MidiPortSelect>
          <label>
            Sortie MIDI:
            <select 
              value={midi.selectedOutput?.id || ''}
              onChange={(e) => {
                const output = midi.devices?.outputs.find(o => o.id === e.target.value);
                midi.selectOutput(output || null);
              }}
            >
              <option value="">-- Sélectionner --</option>
              {midi.devices?.outputs.map(output => (
                <option key={output.id} value={output.id}>
                  {output.name}
                </option>
              ))}
            </select>
          </label>
        </MidiPortSelect>

        <MidiPortSelect>
          <label>
            Canal MIDI:
            <select 
              value={midi.channel}
              onChange={(e) => midi.changeChannel(parseInt(e.target.value))}
            >
              {Array.from({ length: 16 }, (_, i) => i + 1).map(ch => (
                <option key={ch} value={ch}>
                  Canal {ch}
                </option>
              ))}
            </select>
          </label>
        </MidiPortSelect>
      </MidiPorts>

      <MidiActions>
        <MidiButton 
          onClick={sendPatch}
          disabled={!midi.selectedOutput}
          title="Envoyer le patch actuel vers le PreenFM3"
        >
          Push → PreenFM
        </MidiButton>
        
        <MidiButton 
          onClick={receivePatch}
          disabled={!midi.selectedInput}
          title="Récupérer le patch actuel depuis le PreenFM3"
        >
          Pull ← PreenFM
        </MidiButton>
      </MidiActions>

      {receivedCount > 0 && (
        <ReceptionStatus>
          <p>📥 Réception: {receivedCount} paramètres</p>
          {receivedName && <PatchName>Patch: "{receivedName}"</PatchName>}
        </ReceptionStatus>
      )}
    </MidiMenuContainer>
  );
};