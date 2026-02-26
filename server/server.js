const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const db = require('./database');

// Try to load optional dependencies (for Excel export)
let XLSX, cron;
try {
  XLSX = require('xlsx');
  cron = require('node-cron');
} catch (error) {
  console.warn('Excel export dependencies not installed. Run: cd server && npm install');
  console.warn('Excel export features will be disabled until dependencies are installed.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize database
db.connect().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Routes

// Get all items
app.get('/api/items', async (req, res) => {
  try {
    const items = await db.getAllItems();
    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Get single item
app.get('/api/items/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const item = await db.getItem(id);
    if (item) {
      res.json(item);
    } else {
      res.status(404).json({ error: 'Item not found' });
    }
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Add item
app.post('/api/items', async (req, res) => {
  try {
    const result = await db.addItem(req.body);
    if (result.success) {
      // Log audit with new quantity (initial quantity for new items)
      await db.addAuditLog('add', req.body.id, req.body.userName || 'unknown', {
        itemId: req.body.id,
        name: req.body.name,
        quantity: req.body.quantity || 0,
        newQuantity: req.body.quantity || 0, // Store the total quantity after this transaction
      });
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// Update item
app.put('/api/items/:id', async (req, res) => {
  try {
    // Decode the ID from URL (in case it's URL encoded)
    const id = decodeURIComponent(req.params.id);
    const updates = req.body;
    delete updates.id; // Don't allow ID change via this endpoint
    
    console.log('Updating item:', id, 'with updates:', Object.keys(updates));
    
    // Get current item to detect quantity changes
    const currentItem = await db.getItem(id);
    const oldQuantity = currentItem?.quantity || 0;
    const newQuantity = updates.quantity;
    
    // Extract action type flag (if present) and remove it from updates before saving
    const actionType = updates._actionType;
    const quantityChange = updates._quantityChange;
    
    console.log('Extracted actionType:', actionType, 'quantityChange:', quantityChange, 'for item:', id);
    
    delete updates._actionType;
    delete updates._quantityChange;
    
    const result = await db.updateItem(id, updates);
    if (result.success) {
      // Determine action type for audit log
      let auditActionType = 'update';
      
      // If action type was explicitly set (check_in/check_out), use it
      if (actionType === 'check_in' || actionType === 'check_out') {
        auditActionType = actionType;
        console.log('Setting audit action to:', auditActionType, 'for item:', id);
      } else if (newQuantity !== undefined && oldQuantity !== undefined) {
        // Otherwise, check if this is a manual quantity adjustment
        // Manual adjustment: quantity changed but other fields might have changed too
        // (admin editing item details)
        const quantityChanged = newQuantity !== oldQuantity;
        const otherFieldsChanged = (updates.name && updates.name !== currentItem?.name) ||
                                   (updates.location && updates.location !== currentItem?.location) ||
                                   (updates.description && updates.description !== currentItem?.description);
        
        if (quantityChanged && !otherFieldsChanged) {
          // Only quantity changed, but not explicitly check_in/check_out, so it's a manual adjustment
          auditActionType = 'update';
        }
      }
      
      // Prepare audit details (don't include _actionType or _quantityChange since we extracted them)
      const auditDetails = {};
      
      // Copy relevant fields from updates (excluding internal flags)
      Object.keys(updates).forEach(key => {
        if (key !== '_actionType' && key !== '_quantityChange' && key !== 'userName') {
          auditDetails[key] = updates[key];
        }
      });
      
      // Store quantity change amount
      if (quantityChange !== undefined) {
        auditDetails.quantityChange = quantityChange;
      } else if (newQuantity !== undefined && oldQuantity !== undefined) {
        auditDetails.quantityChange = Math.abs(newQuantity - oldQuantity);
      }
      
      // Store old and new quantities
      if (newQuantity !== undefined) {
        auditDetails.oldQuantity = oldQuantity;
        auditDetails.newQuantity = newQuantity; // Store the total quantity after this transaction
      }
      
      console.log('Logging audit:', {
        action: auditActionType,
        itemId: id,
        quantityChange: auditDetails.quantityChange,
        newQuantity: auditDetails.newQuantity,
        oldQuantity: auditDetails.oldQuantity
      });
      
      // Log audit with appropriate action type
      await db.addAuditLog(auditActionType, id, updates.userName || 'unknown', auditDetails);
      res.json(result);
    } else {
      console.log('Update failed - item not found:', id);
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete item
app.delete('/api/items/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { userName } = req.body;
    
    // Get item before deleting for audit
    const item = await db.getItem(id);
    const oldQuantity = item?.quantity || 0;
    
    const result = await db.deleteItem(id);
    if (result.success) {
      // Log audit with old quantity (before deletion, total was oldQuantity, after deletion it's 0)
      await db.addAuditLog('delete', id, userName || 'unknown', {
        itemId: id,
        name: item?.name,
        oldQuantity: oldQuantity,
        newQuantity: 0, // After deletion, quantity is 0
      });
      res.json(result);
    } else {
      res.status(404).json({ error: 'Item not found' });
    }
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Update item ID (admin only)
app.post('/api/items/:id/change-id', async (req, res) => {
  try {
    // Decode the ID from URL
    const oldId = decodeURIComponent(req.params.id);
    const { newId, userName } = req.body;
    
    console.log('Changing item ID from:', oldId, 'to:', newId);
    const result = await db.updateItemId(oldId, newId);
    if (result.success) {
      // Log audit
      await db.addAuditLog('change_id', oldId, userName || 'unknown', {
        oldId,
        newId
      });
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error changing item ID:', error);
    res.status(500).json({ error: 'Failed to change item ID' });
  }
});

// Get next ID number
app.get('/api/settings/next-id', async (req, res) => {
  try {
    const nextId = await db.getNextIdNumber();
    res.json({ nextId });
  } catch (error) {
    console.error('Error fetching next ID:', error);
    res.status(500).json({ error: 'Failed to fetch next ID' });
  }
});

// Set next ID number (admin only)
app.post('/api/settings/next-id', async (req, res) => {
  try {
    const { nextId, userName } = req.body;
    const result = await db.setNextIdNumber(nextId);
    if (result.success) {
      // Log audit
      await db.addAuditLog('set_next_id', null, userName || 'unknown', { nextId });
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error setting next ID:', error);
    res.status(500).json({ error: 'Failed to set next ID' });
  }
});

// Get audit logs
app.get('/api/audit', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const logs = await db.getAuditLogs(limit);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Root route - helpful info
app.get('/', (req, res) => {
  res.json({ 
    message: 'Paint Inventory Tracker API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      items: '/api/items',
      settings: '/api/settings/next-id',
      audit: '/api/audit'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper function to generate Excel file
async function generateExcelExport() {
  if (!XLSX) {
    throw new Error('Excel export library not installed. Please run: cd server && npm install');
  }
  try {
    const items = await db.getAllItems();
    
    // Prepare data for Excel (without Created At and Updated At)
    const excelData = items.map(item => ({
      'Paint ID': item.id || 'N/A',
      'Color Name': item.name || 'Unnamed',
      'Quantity (gal)': item.quantity || 0,
      'Location': item.location || '',
      'Description': item.description || '',
      'Last Scanned': item.lastScanned ? new Date(item.lastScanned).toLocaleString('en-US') : 'Never',
      'Last Scanned By': item.lastScannedBy || 'N/A',
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Paint ID
      { wch: 25 }, // Color Name
      { wch: 15 }, // Quantity
      { wch: 20 }, // Location
      { wch: 30 }, // Description
      { wch: 20 }, // Last Scanned
      { wch: 18 }, // Last Scanned By
    ];

    // Make header row (row 1) bold
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!ws[cellAddress]) continue;
      
      // Set cell style to bold
      ws[cellAddress].s = {
        font: { bold: true }
      };
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    
    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    return buffer;
  } catch (error) {
    console.error('Error generating Excel export:', error);
    throw error;
  }
}

// Export Excel file endpoint (download)
app.get('/api/export/excel', async (req, res) => {
  try {
    const buffer = await generateExcelExport();
    const filename = `paint-inventory-${new Date().toISOString().split('T')[0]}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting Excel:', error);
    res.status(500).json({ error: 'Failed to export Excel file', details: error.message });
  }
});

// Save Excel file to disk endpoint
app.post('/api/export/save', async (req, res) => {
  if (!XLSX) {
    return res.status(500).json({ error: 'Excel export library not installed. Please run: cd server && npm install' });
  }
  try {
    const EXPORT_DIR = path.join(__dirname, 'exports');
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
    
    const buffer = await generateExcelExport();
    const filename = `paint-inventory-${new Date().toISOString().split('T')[0]}.xlsx`;
    const filepath = path.join(EXPORT_DIR, filename);
    
    fs.writeFileSync(filepath, buffer);
    console.log(`Excel export saved to: ${filepath}`);
    res.json({ success: true, message: 'Excel file saved successfully', filepath });
  } catch (error) {
    console.error('Error saving Excel:', error);
    res.status(500).json({ error: 'Failed to save Excel file', details: error.message });
  }
});

// Schedule daily Excel export at 7am (only if dependencies are installed)
if (XLSX && cron) {
  const EXPORT_DIR = path.join(__dirname, 'exports');
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  // Function to save Excel file to disk
  async function saveExcelToDisk() {
    try {
      const buffer = await generateExcelExport();
      const filename = `paint-inventory-${new Date().toISOString().split('T')[0]}.xlsx`;
      const filepath = path.join(EXPORT_DIR, filename);
      
      fs.writeFileSync(filepath, buffer);
      console.log(`Excel export saved to: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error('Error saving Excel export:', error);
      throw error;
    }
  }

  // Save Excel file immediately on server start (for testing)
  saveExcelToDisk().catch(err => {
    console.error('Failed to create initial Excel export:', err);
  });

  // Schedule daily Excel export at 7am
  cron.schedule('0 7 * * *', async () => {
    try {
      console.log('Generating daily Excel export at 7am...');
      await saveExcelToDisk();
    } catch (error) {
      console.error('Error in scheduled Excel export:', error);
    }
  });
  
  console.log('Excel export scheduled for 7am daily');
} else {
  console.log('Excel export features disabled - dependencies not installed');
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Paint Inventory API server running on http://0.0.0.0:${PORT}`);
  console.log(`Access from other devices: http://YOUR_IP:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  db.close();
  process.exit(0);
});

