# NFC Inventory Tracker

A React Native mobile app that uses NFC (Near Field Communication) technology to track and manage inventory. Scan NFC tags to add items, update quantities, and keep track of your inventory efficiently.

## Features

- **NFC Tag Scanning**: Read item IDs from NFC tags
- **NFC Tag Writing**: Write item IDs to NFC tags
- **Inventory Management**: Add, edit, delete, and view inventory items
- **Quantity Tracking**: Adjust item quantities with +/- buttons
- **Search Functionality**: Search through your inventory by name, ID, or location
- **Persistent Storage**: All data is stored locally on your device
- **Last Scanned Tracking**: See when each item was last scanned

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- A physical device with NFC support (iOS 11+ or Android)
- NFC tags (NTAG213, NTAG215, NTAG216, or compatible)

## Installation

1. Navigate to the project directory:
```bash
cd nfc-inventory-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Start the Expo development server:
```bash
npm start
```

4. Run on your device:
   - **iOS**: Scan the QR code with the Camera app, or press `i` in the terminal
   - **Android**: Scan the QR code with the Expo Go app, or press `a` in the terminal

## Usage

### Setting Up NFC Tags

1. Open the app and tap "Scan NFC Tag"
2. Hold your device near an NFC tag
3. The app will read the tag and create a new inventory item
4. Edit the item details (name, quantity, description, location)
5. To write an item ID to a tag, open the item details and tap "Write to NFC Tag"

### Managing Inventory

- **Scan Tag**: Scan an NFC tag to add or view an item
- **View Inventory**: Browse all items in your inventory
- **Edit Item**: Tap on any item to edit its details
- **Adjust Quantity**: Use the +/- buttons to change item quantities
- **Search**: Use the search bar to find items quickly
- **Delete Item**: Delete items you no longer need

## How It Works

1. Each NFC tag stores a unique item ID
2. When you scan a tag, the app reads the ID and looks up the item in the inventory
3. If the item doesn't exist, a new one is created
4. All inventory data is stored locally on your device using AsyncStorage
5. You can write item IDs to blank NFC tags for new items

## Technical Details

- **Framework**: React Native with Expo
- **NFC Library**: react-native-nfc-manager
- **Storage**: AsyncStorage for local data persistence
- **UI Library**: React Native Paper

## Troubleshooting

### NFC Not Working

- Ensure NFC is enabled in your device settings
- Make sure you're using a physical device (NFC doesn't work in simulators/emulators)
- Try holding the device closer to the NFC tag
- Some devices require the screen to be on and unlocked

### App Won't Start

- Make sure all dependencies are installed: `npm install`
- Clear the cache: `expo start -c`
- Check that your Node.js version is compatible

## Platform Support

- **iOS**: Requires iOS 11+ with NFC-capable device (iPhone 7 and later)
- **Android**: Requires Android 4.4+ with NFC support

## License

This project is open source and available for personal and commercial use.

