import styled from 'styled-components';
import { useMidiActions } from '../midi/useMidiActions';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const MidiMenuContainer = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`;

const MidiToggleButton = styled.button`
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  background: ${props => props.theme.colors.primary};
  color: ${props => props.theme.colors.background};
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  font-weight: 500;
  font-size: 0.875rem;
  
  &:hover {
    background: ${props => props.theme.colors.buttonHover || props.theme.colors.accent};
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: ${props => props.theme.colors.background};
  padding: 2rem;
  border-radius: 0.5rem;
  border: 1px solid ${props => props.theme.colors.border};
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  
  h3 {
    color: ${props => props.theme.colors.text};
    margin: 0;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.colors.text};
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.25rem;
  
  &:hover {
    opacity: 0.7;
  }
`;

const MidiPorts = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  
  h3 {
    color: ${props => props.theme.colors.text};
  }
`;

const MidiPortSelect = styled.div`
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    color: ${props => props.theme.colors.text};
    font-weight: 500;
  }
  
  select {
    width: 12em;
    max-width: 12em;
    height: 40px;
    padding: 0.5rem 2rem 0.5rem 0.5rem;
    border-radius: 0.25rem;
    background: ${props => props.theme.colors.button};
    color: ${props => props.theme.colors.text};
    border: 1px solid ${props => props.theme.colors.border};
    cursor: pointer;
    display: block;
    font-size: 0.875rem;
    box-sizing: border-box;
    
    &:focus {
      outline: none;
      border-color: ${props => props.theme.colors.primary};
    }
  }
`;

const MidiActions = styled.div`
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
`;

const MidiButton = styled.button`
  flex: 1;
  padding: 0.75rem 1rem;
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
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: ${props => `${props.theme.colors.accent}20`};
  border-radius: 0.25rem;
`;

const ErrorContainer = styled.div`
  margin: 1rem 0;
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
  margin: 0.5rem 0;
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
  margin: 0.5rem 0;
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

const StatusIndicator = styled.span<{ $connected: boolean }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.$connected ? '#10b981' : '#6b7280'};
  margin-left: 0.5rem;
`;

export const MidiMenu = () => {
  const { t } = useTranslation();
  const { sendPatch, receivePatch, receivedCount, receivedName, isSending, midi } = useMidiActions();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isConnected = Boolean(midi.selectedInput && midi.selectedOutput);
  const noDevices = !midi.devices || (midi.devices.inputs.length === 0 && midi.devices.outputs.length === 0);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const input = midi.devices?.inputs.find(i => i.id === e.target.value);
    midi.selectInput(input || null);
  }, [midi.devices?.inputs, midi.selectInput]);

  const handleOutputChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const output = midi.devices?.outputs.find(o => o.id === e.target.value);
    midi.selectOutput(output || null);
  }, [midi.devices?.outputs, midi.selectOutput]);

  const handleChannelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    midi.changeChannel(parseInt(e.target.value));
  }, [midi.changeChannel]);

  const renderModalContent = () => {
    if (midi.isLoading) {
      return <p>Initialisation MIDI...</p>;
    }

    if (midi.error) {
      return (
        <ErrorContainer>
          <ErrorMessage>❌ {midi.error}</ErrorMessage>
          <HelpContainer>
            <h4>{t('midi.apiRequired')}</h4>
            <p>{t('midi.helpTitle')}</p>
            <ol>
              <li>{t('midi.helpStep1')}</li>
              <li>{t('midi.helpStep2')}</li>
              <li>{t('midi.helpStep3')}</li>
            </ol>
            <HelpNote>
              💡 <strong>{t('midi.helpChrome')}</strong> {t('midi.helpChromeText')}
            </HelpNote>
            <HelpNote>
              💡 <strong>{t('midi.helpFirefox')}</strong> {t('midi.helpFirefoxText')}
            </HelpNote>
          </HelpContainer>
        </ErrorContainer>
      );
    }

    return (
      <>
        {noDevices && (
          <InfoBox>
            <p>⚠️ {t('midi.noDevicesWarning')}</p>
            <InfoDetail>{t('midi.connectDevice')}</InfoDetail>
          </InfoBox>
        )}
        
        <MidiPorts>
          <MidiPortSelect>
            <label>
              {t('midi.inputLabel')}
              <select 
                value={midi.selectedInput?.id || ''}
                onChange={handleInputChange}
              >
                <option value="">{t('midi.selectOption')}</option>
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
              {t('midi.outputLabel')}
              <select 
                value={midi.selectedOutput?.id || ''}
                onChange={handleOutputChange}
              >
                <option value="">{t('midi.selectOption')}</option>
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
              {t('midi.channelLabel')}
              <select 
                value={midi.channel}
                onChange={handleChannelChange}
              >
                {Array.from({ length: 16 }, (_, i) => i + 1).map(ch => (
                  <option key={ch} value={ch}>
                    {t('midi.channelNumber', { number: ch })}
                  </option>
                ))}
              </select>
            </label>
          </MidiPortSelect>
        </MidiPorts>

        <MidiActions>
          <MidiButton 
            onClick={() => sendPatch()}
            disabled={!midi.selectedOutput || isSending}
            title={t('midi.pushTooltip')}
          >
            {isSending ? t('midi.sending', 'Envoi…') : t('midi.pushButton')}
          </MidiButton>
          
          <MidiButton 
            onClick={receivePatch}
            disabled={!midi.selectedInput}
            title={t('midi.pullTooltip')}
          >
            {t('midi.pullButton')}
          </MidiButton>
        </MidiActions>

        {receivedCount > 0 && (
          <ReceptionStatus>
            <p>📥 {t('midi.receptionStatus', { count: receivedCount })}</p>
            {receivedName && <PatchName>{t('midi.patchName', { name: receivedName })}</PatchName>}
          </ReceptionStatus>
        )}
      </>
    );
  };

  return (
    <>
      <MidiMenuContainer>
        <MidiToggleButton onClick={() => setIsModalOpen(true)}>
          MIDI
          <StatusIndicator $connected={isConnected} />
        </MidiToggleButton>
        
        {receivedCount > 0 && (
          <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 'bold' }}>
            {t('midi.params', { count: receivedCount })}
          </span>
        )}
      </MidiMenuContainer>

      {isModalOpen && (
        <ModalOverlay onClick={() => setIsModalOpen(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h3>{t('midi.configuration')}</h3>
              <CloseButton onClick={() => setIsModalOpen(false)}>×</CloseButton>
            </ModalHeader>
            {renderModalContent()}
          </ModalContent>
        </ModalOverlay>
      )}
    </>
  );
};