const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'inventory.db');

class Database {
  constructor() {
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.initTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async initTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Items table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            quantity INTEGER DEFAULT 0,
            description TEXT DEFAULT '',
            location TEXT DEFAULT '',
            lastScanned TEXT,
            lastScannedBy TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          )
        `, (err) => {
          if (err) {
            console.error('Error creating items table:', err);
            reject(err);
          } else {
            console.log('Items table ready');
          }
        });

        // Next ID counter table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `, (err) => {
          if (err) {
            console.error('Error creating settings table:', err);
            reject(err);
          } else {
            console.log('Settings table ready');
            // Initialize next_id if it doesn't exist
            this.db.run(`
              INSERT OR IGNORE INTO settings (key, value) VALUES ('next_id', '1')
            `, (err) => {
              if (err) {
                console.error('Error initializing next_id:', err);
                reject(err);
              } else {
                resolve();
              }
            });
          }
        });

        // Audit log table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            itemId TEXT,
            userName TEXT NOT NULL,
            details TEXT,
            timestamp TEXT NOT NULL
          )
        `, (err) => {
          if (err) {
            console.error('Error creating audit_log table:', err);
            reject(err);
          } else {
            console.log('Audit log table ready');
          }
        });
      });
    });
  }

  async getAllItems() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM items ORDER BY id', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getItem(itemId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM items WHERE id = ?', [itemId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async addItem(item) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      this.db.run(
        `INSERT INTO items (id, name, quantity, description, location, lastScanned, lastScannedBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.name,
          item.quantity || 0,
          item.description || '',
          item.location || '',
          item.lastScanned || now,
          item.lastScannedBy || '',
          item.createdAt || now,
          now
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ success: true, item: { ...item, updatedAt: now } });
          }
        }
      );
    });
  }

  async updateItem(itemId, updates) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      const fields = [];
      const values = [];
      const self = this; // Store reference to Database instance

      // Valid database columns (exclude id and userName which are not stored in items table)
      const validColumns = ['name', 'quantity', 'description', 'location', 'lastScanned', 'lastScannedBy', 'createdAt', 'updatedAt'];
      
      Object.keys(updates).forEach(key => {
        if (key !== 'id' && key !== 'userName' && validColumns.includes(key)) {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        }
      });

      fields.push('updatedAt = ?');
      values.push(now);
      values.push(itemId);

      this.db.run(
        `UPDATE items SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) {
            reject(err);
          } else {
            if (this.changes === 0) {
              resolve({ success: false, error: 'Item not found' });
            } else {
              // Fetch updated item using stored reference
              self.getItem(itemId).then(item => {
                if (item) {
                  resolve({ success: true, item });
                } else {
                  // Item was updated but couldn't be retrieved - return success anyway
                  // This can happen due to timing issues, but the update was successful
                  resolve({ success: true, item: null });
                }
              }).catch(err => {
                // Log error but still return success since the update worked
                console.error('Error fetching updated item:', err);
                resolve({ success: true, item: null });
              });
            }
          }
        }
      );
    });
  }

  async deleteItem(itemId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM items WHERE id = ?', [itemId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ success: this.changes > 0 });
        }
      });
    });
  }

  async updateItemId(oldId, newId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE items SET id = ?, updatedAt = ? WHERE id = ?',
        [newId, new Date().toISOString(), oldId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            if (this.changes === 0) {
              resolve({ success: false, error: 'Item not found' });
            } else {
              resolve({ success: true, itemId: newId });
            }
          }
        }
      );
    });
  }

  async getNextIdNumber() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT value FROM settings WHERE key = ?', ['next_id'], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(parseInt(row?.value || '1', 10));
        }
      });
    });
  }

  async setNextIdNumber(number) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['next_id', String(number)],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ success: true });
          }
        }
      );
    });
  }

  async addAuditLog(action, itemId, userName, details) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO audit_log (action, itemId, userName, details, timestamp) VALUES (?, ?, ?, ?, ?)',
        [action, itemId || null, userName, JSON.stringify(details || {}), new Date().toISOString()],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ success: true, id: this.lastID });
          }
        }
      );
    });
  }

  async getAuditLogs(limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(row => ({
              ...row,
              details: JSON.parse(row.details || '{}')
            })));
          }
        }
      );
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

const db = new Database();

module.exports = db;

