# LFO MIDI Clock Mode - NRPN Value Mapping

## Summary

The PreenFM3 official editor (preenfm2Controller) uses the **same NRPN parameter** for both normal frequency (0-99.9) and MIDI Clock mode. The distinction is made using **different value ranges**:

- **Normal frequency**: 0 to 9990 (representing 0.00 to 99.90 Hz, multiplied by 100)
- **MIDI Clock mode**: 10000 to 10080 (special values)

## NRPN Parameter

- `PREENFM2_NRPN_LFO1_FREQUENCY` = 169
- `PREENFM2_NRPN_LFO2_FREQUENCY` = 173
- `PREENFM2_NRPN_LFO3_FREQUENCY` = 177

## MIDI Clock Mode Value Mapping

From the official editor `PanelModulation.cpp` (lines 225-246):

```cpp
lfoExtMidiSync[k]->addItem("Internal", 9990);
lfoExtMidiSync[k]->addItem("MC/16", 10000);
lfoExtMidiSync[k]->addItem("MC/8", 10010);
lfoExtMidiSync[k]->addItem("MC/4", 10020);
lfoExtMidiSync[k]->addItem("MC/2", 10030);
lfoExtMidiSync[k]->addItem("MC", 10040);
lfoExtMidiSync[k]->addItem("MC*2", 10050);
lfoExtMidiSync[k]->addItem("MC*3", 10060);
lfoExtMidiSync[k]->addItem("MC*4", 10070);
lfoExtMidiSync[k]->addItem("MC*8", 10080);
```

## Display String Mapping

The firmware displays (from `FMDisplayEditor.cpp::lfoOscMidiClock[]`):

| NRPN Value | Editor Display | Firmware Display | Description |
|------------|----------------|------------------|-------------|
| 0-9990     | "0.00"-"99.90" | "0.00"-"99.9"    | Normal frequency in Hz |
| 10000      | "MC/16"        | "C/16"           | MIDI Clock divided by 16 |
| 10010      | "MC/8"         | "Ck/8"           | MIDI Clock divided by 8 |
| 10020      | "MC/4"         | "Ck/4"           | MIDI Clock divided by 4 |
| 10030      | "MC/2"         | "Ck/2"           | MIDI Clock divided by 2 |
| 10040      | "MC"           | "Ck  "           | MIDI Clock (1:1) |
| 10050      | "MC*2"         | "Ck*2"           | MIDI Clock times 2 |
| 10060      | "MC*3"         | "Ck*3"           | MIDI Clock times 3 |
| 10070      | "MC*4"         | "Ck*4"           | MIDI Clock times 4 |
| 10080      | "MC*8"         | "Ck*8"           | MIDI Clock times 8 |

## How It Works in the Official Editor

### 1. Dual Parameter Registration

From `PluginProcessor.cpp` (lines 205-216), the same NRPN is registered **twice** with different ranges:

```cpp
// First parameter: External Sync (MIDI Clock values)
nrpmParam = PREENFM2_NRPN_LFO1_FREQUENCY + k * 4;
newParam = new MidifiedFloatParameter(
    String("LFO" + String(k + 1) + " External Sync"), 
    nrpmParam, 
    1,      // multiplier = 1 (send real value)
    9990,   // min value
    10080,  // max value
    9990    // default (Internal)
);
((MidifiedFloatParameter*)newParam)->setSendRealValue(true);
addMidifiedParameter(newParam);

// Second parameter: Normal Frequency
nrpmParam = PREENFM2_NRPN_LFO1_FREQUENCY + k * 4;
newParam = new MidifiedFloatParameter(
    String("LFO" + String(k + 1) + " Frequency"), 
    nrpmParam, 
    100,    // multiplier = 100
    0,      // min value
    99.9f,  // max value
    1       // default = 1 Hz
);
addMidifiedParameter(newParam);
```

### 2. Smart Value Redirection

From `PluginProcessor.cpp` (lines 1011-1030), when an NRPN value falls outside the current parameter's range, it's redirected:

```cpp
void Pfm2AudioProcessor::sendMidiForParameter(int paramIndex, int nrpnValue, int forceIndex) {
    const Array< AudioProcessorParameter* >parameters = getParameters();
    MidifiedFloatParameter* midifiedFP = (MidifiedFloatParameter*)parameters[paramIndex];
    
    if (midifiedFP != nullptr) {
        float newFloatValue = midifiedFP->getValueFromNrpn(nrpnValue);
        float end = midifiedFP->getMax();
        float start = midifiedFP->getMin();
        
        // If value is outside range, redirect to previous parameter
        if ((newFloatValue > end || newFloatValue < start) && forceIndex == -1) {
            if (pfm2Editor) {
                pfm2Editor->removeParamToUpdateUI(midifiedFP->getName());
            }
            // Redirect to previous param (External Sync or Frequency)
            handleIncomingNrpn(paramIndex, nrpnValue, paramIndex - 1);
            return;
        }
        // ...
    }
}
```

### 3. UI Interaction

From `PanelModulation.cpp` (lines 588-603, 621-640):

```cpp
void PanelModulation::sliderValueChanged(Slider* sliderThatWasMoved, bool fromPluginUI) {
    for (int k = 0; k < NUMBER_OF_LFO; k++) {
        // When slider is moved, switch combo to "Internal"
        if (sliderThatWasMoved == lfoFrequency[k] && 
            lfoExtMidiSync[k]->getSelectedId() != 9990) {
            lfoFrequency[k]->setEnabled(true);
            lfoExtMidiSync[k]->setSelectedId(9990, dontSendNotification);
        }
    }
}

void PanelModulation::comboBoxChanged(ComboBox* comboBoxThatHasChanged, bool fromPluginUI) {
    for (int k = 0; k < NUMBER_OF_LFO; k++) {
        if (comboBoxThatHasChanged == lfoExtMidiSync[k]) {
            // When combo is "Internal", enable frequency slider
            if (comboBoxThatHasChanged->getSelectedId() == 9990) {
                lfoFrequency[k]->setEnabled(true);
                // Force sending new value
                float value = (float)lfoFrequency[k]->getValue();
                lfoFrequency[k]->setValue(99.9f);
                lfoFrequency[k]->setValue(value);
            } else {
                // MIDI Clock mode - disable frequency slider
                lfoFrequency[k]->setEnabled(false);
            }
        }
    }
}
```

## Implementation Guidelines

### Parsing NRPN Values

```typescript
function parseLfoFrequency(nrpnValue: number): { 
  isMidiClock: boolean; 
  frequency?: number; 
  midiClockMode?: string; 
} {
  if (nrpnValue >= 10000 && nrpnValue <= 10080) {
    // MIDI Clock mode
    const midiClockModes = {
      10000: 'C/16',
      10010: 'Ck/8',
      10020: 'Ck/4',
      10030: 'Ck/2',
      10040: 'Ck  ',
      10050: 'Ck*2',
      10060: 'Ck*3',
      10070: 'Ck*4',
      10080: 'Ck*8'
    };
    return { 
      isMidiClock: true, 
      midiClockMode: midiClockModes[nrpnValue] || 'Unknown' 
    };
  } else {
    // Normal frequency mode (0-9990 = 0.00-99.90 Hz)
    return { 
      isMidiClock: false, 
      frequency: nrpnValue / 100.0 
    };
  }
}
```

### Encoding to NRPN Values

```typescript
function encodeLfoFrequency(params: {
  isMidiClock: boolean;
  frequency?: number;
  midiClockMode?: string;
}): number {
  if (params.isMidiClock && params.midiClockMode) {
    const midiClockValues: Record<string, number> = {
      'C/16': 10000,
      'Ck/8': 10010,
      'Ck/4': 10020,
      'Ck/2': 10030,
      'Ck  ': 10040,
      'Ck*2': 10050,
      'Ck*3': 10060,
      'Ck*4': 10070,
      'Ck*8': 10080
    };
    return midiClockValues[params.midiClockMode] || 9990;
  } else {
    // Normal frequency: multiply by 100 and clamp to 0-9990
    const freq = params.frequency ?? 0;
    return Math.round(Math.max(0, Math.min(99.9, freq)) * 100);
  }
}
```

## Key Insights

1. **No conversion formula needed**: The NRPN values for MIDI Clock mode are sent directly as 10000, 10010, etc. They're not encoded as 100, 101, 102.

2. **Clear separation**: The value ranges don't overlap:
   - 0-9990: Normal frequency
   - 10000-10080: MIDI Clock modes
   - 9990: Internal (not using MIDI clock)

3. **Same NRPN, different ranges**: This clever design allows seamless switching between frequency and MIDI Clock mode without changing the NRPN parameter number.

4. **Future-proof**: The gap between 9990 and 10000 allows room for extending the frequency range if needed (though 99.9 Hz is already quite high for an LFO).

## References

- Official Editor Repository: https://github.com/Ixox/preenfm2Controller
- Key Files:
  - `Plugin/Source/PluginProcessor.cpp` (lines 205-224)
  - `Plugin/Source/UI/PanelModulation.cpp` (lines 225-246)
  - `Plugin/Source/PreenNrpn.h` (line 169: PREENFM2_NRPN_LFO1_FREQUENCY)
- Firmware Reference: `preenfm3/firmware/Src/hardware/FMDisplayEditor.cpp::lfoOscMidiClock[]`
