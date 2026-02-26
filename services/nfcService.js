let NfcManager, NfcTech, Ndef;
let nfcModuleAvailable = false;

try {
  const nfcModule = require('react-native-nfc-manager');
  NfcManager = nfcModule.default || nfcModule;
  NfcTech = nfcModule.NfcTech;
  Ndef = nfcModule.Ndef;
  nfcModuleAvailable = true;
} catch (error) {
  console.warn('react-native-nfc-manager not available:', error.message);
  nfcModuleAvailable = false;
}

class NFCService {
  constructor() {
    this.isSupported = false;
    this.isEnabled = false;
  }

  async initialize() {
    if (!nfcModuleAvailable) {
      return { 
        isSupported: false, 
        isEnabled: false, 
        error: 'NFC module not available. This app requires a development build, not Expo Go.' 
      };
    }

    try {
      this.isSupported = await NfcManager.isSupported();
      if (this.isSupported) {
        await NfcManager.start();
        this.isEnabled = await NfcManager.isEnabled();
      }
      return { isSupported: this.isSupported, isEnabled: this.isEnabled };
    } catch (error) {
      console.error('NFC initialization error:', error);
      return { isSupported: false, isEnabled: false, error: error.message };
    }
  }

  async readTag() {
    if (!nfcModuleAvailable) {
      return { success: false, error: 'NFC module not available. This app requires a development build.' };
    }

    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      
      if (tag && tag.ndefMessage && tag.ndefMessage.length > 0) {
        const ndefRecords = tag.ndefMessage;
        let itemId = null;
        
        for (const record of ndefRecords) {
          if (record.tnf === Ndef.TNF_WELL_KNOWN) {
            const payload = Ndef.text.decodePayload(record.payload);
            itemId = payload;
            break;
          }
        }
        
        await NfcManager.cancelTechnologyRequest();
        return { success: true, itemId, tag };
      }
      
      await NfcManager.cancelTechnologyRequest();
      return { success: false, message: 'No data found on tag' };
    } catch (error) {
      console.error('NFC read error:', error);
      await NfcManager.cancelTechnologyRequest().catch(() => {});
      return { success: false, error: error.message };
    }
  }

  async writeTag(itemId) {
    if (!nfcModuleAvailable) {
      return { success: false, error: 'NFC module not available. This app requires a development build.' };
    }

    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      
      const bytes = Ndef.encodeMessage([
        Ndef.textRecord(itemId.toString())
      ]);
      
      if (bytes) {
        await NfcManager.ndefHandler.writeNdefMessage(bytes);
        await NfcManager.cancelTechnologyRequest();
        return { success: true, message: 'Tag written successfully' };
      }
      
      await NfcManager.cancelTechnologyRequest();
      return { success: false, message: 'Failed to encode message' };
    } catch (error) {
      console.error('NFC write error:', error);
      await NfcManager.cancelTechnologyRequest().catch(() => {});
      return { success: false, error: error.message };
    }
  }

  async cancelRequest() {
    if (!nfcModuleAvailable) {
      return;
    }

    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (error) {
      console.error('Cancel request error:', error);
    }
  }
}

export default new NFCService();

