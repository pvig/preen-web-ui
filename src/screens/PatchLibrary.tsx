import { useRef, useState } from 'react';
import { PatchSavePanel, BankOrganizerPanel } from '../components/PatchManager';
import { InterpolationEditor } from './InterpolationEditor';
import { PreenSpectrogram } from '../components/PreenSpectrogram';
import type { PreenSpectrogramHandle } from '../components/PreenSpectrogram';
import { PresetBankHarvester } from '../components/PresetBankHarvester';
import { PatchVariatorEditor } from '../components/PatchVariatorEditor';
import { SoundMatcher } from '../components/SoundMatcher';
import { BreederEditor } from '../components/BreederEditor';
import { PatchSlotRack } from '../components/PatchSlotRack';
import styled from 'styled-components';

type ToolTab = 'mixer' | 'variator' | 'harvester' | 'matcher' | 'breeder';

const LibraryContainer = styled.div`
  max-width: 900px;
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const MutationPanel = styled.section`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 8px 0;
  margin-top: 8px;
`;

const ToolPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const TabBar = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 8px 20px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => $active ? theme.colors.primary : 'transparent'};
  background: transparent;
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textMuted};
  transition: color 0.15s, border-color 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const TabContent = styled.div`
  padding-top: 16px;
`;

export function PatchLibrary() {
  const spectrogramRef = useRef<PreenSpectrogramHandle>(null);
  const [activeTab, setActiveTab] = useState<ToolTab>('variator');

  return (
    <LibraryContainer>
      <PatchSavePanel />
      <BankOrganizerPanel />
      <PatchSlotRack />
      <PreenSpectrogram ref={spectrogramRef} />
      <ToolPanel>
        <TabBar>
          <Tab $active={activeTab === 'mixer'} onClick={() => setActiveTab('mixer')}>
            🎛️ Mixer
          </Tab>
          <Tab $active={activeTab === 'variator'} onClick={() => setActiveTab('variator')}>
            ⚡ Variator
          </Tab>
          <Tab $active={activeTab === 'harvester'} onClick={() => setActiveTab('harvester')}>
            ⬇ Harvester
          </Tab>
          <Tab $active={activeTab === 'matcher'} onClick={() => setActiveTab('matcher')}>
            🎵 Matcher
          </Tab>
          <Tab $active={activeTab === 'breeder'} onClick={() => setActiveTab('breeder')}>
            🧬 Breeder
          </Tab>
        </TabBar>
        <TabContent>
          {/* All tabs stay mounted; only visibility changes — state is preserved across tab switches. */}
          <div style={{ display: activeTab === 'mixer' ? 'block' : 'none' }}>
            <MutationPanel><InterpolationEditor /></MutationPanel>
          </div>
          <div style={{ display: activeTab === 'variator' ? 'block' : 'none' }}>
            <PatchVariatorEditor />
          </div>
          <div style={{ display: activeTab === 'harvester' ? 'block' : 'none' }}>
            <PresetBankHarvester spectrogramRef={spectrogramRef} />
          </div>
          <div style={{ display: activeTab === 'matcher' ? 'block' : 'none' }}>
            <SoundMatcher />
          </div>
          <div style={{ display: activeTab === 'breeder' ? 'block' : 'none' }}>
            <BreederEditor />
          </div>
        </TabContent>
      </ToolPanel>
    </LibraryContainer>
  );
}