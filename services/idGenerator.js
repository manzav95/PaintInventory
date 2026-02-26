// Sherwin Williams color code format: H66(3 letters)(5 numbers)
// Example: H66AAA00001, H66AAA00002, H66AAB00001
class IDGenerator {
  // Convert counter number to Sherwin Williams format
  static counterToId(counter) {
    // Counter starts at 1
    const num = counter - 1; // 0-indexed
    const numberPart = (num % 100000).toString().padStart(5, '0');
    const letterIndex = Math.floor(num / 100000);
    
    // Convert letterIndex to 3-letter code (AAA, AAB, AAC, ..., AAZ, ABA, etc.)
    const letter1 = String.fromCharCode(65 + (letterIndex % 26)); // A-Z
    const letter2 = String.fromCharCode(65 + (Math.floor(letterIndex / 26) % 26));
    const letter3 = String.fromCharCode(65 + (Math.floor(letterIndex / 676) % 26));
    
    return `H66${letter3}${letter2}${letter1}${numberPart}`;
  }

  // Validate Sherwin Williams format
  static isValidFormat(id) {
    // Format: H66 followed by 3 uppercase letters and 5 digits
    return /^H66[A-Z]{3}\d{5}$/.test(id);
  }

  // Parse ID to get counter (for finding next available)
  static idToCounter(id) {
    if (!this.isValidFormat(id)) return null;
    
    const letters = id.substring(3, 6); // Get 3 letters
    const numbers = parseInt(id.substring(6), 10); // Get 5 numbers
    
    const letter1 = letters.charCodeAt(2) - 65;
    const letter2 = letters.charCodeAt(1) - 65;
    const letter3 = letters.charCodeAt(0) - 65;
    
    const letterIndex = letter1 + (letter2 * 26) + (letter3 * 676);
    return letterIndex * 100000 + numbers + 1; // Convert back to 1-indexed
  }

  // Normalize an ID (e.g., trims, uppercases, handles old 4-digit format)
  static normalizeId(id) {
    const trimmed = (id ?? '').toString().trim();
    if (this.isValidFormat(trimmed.toUpperCase())) {
      return trimmed.toUpperCase();
    }
    // For backward compatibility with old 4-digit IDs
    if (/^\d{1,4}$/.test(trimmed)) {
      return trimmed.padStart(4, '0');
    }
    return trimmed;
  }
}

export default IDGenerator;

