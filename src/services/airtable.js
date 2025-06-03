import Airtable from 'airtable';

// Configure Airtable
const base = new Airtable({
  apiKey: process.env.REACT_APP_AIRTABLE_ACCESS_TOKEN
}).base(process.env.REACT_APP_AIRTABLE_BASE_ID);

const table = base(process.env.REACT_APP_AIRTABLE_TABLE_NAME);
const usersTable = base('Users'); // New users table
const packoutTable = base('Packout Sheets');

export const airtableService = {
  // USER MANAGEMENT
  async getUsers(role) {
    try {
      const formula = role ? `{role} = '${role}'` : '';
      const records = await usersTable
        .select({
          filterByFormula: formula,
          sort: [{field: 'name', direction: 'asc'}]
        })
        .all();
      
      return records.map(record => ({
        id: record.id,
        name: record.fields.name,
        role: record.fields.role,
        active: record.fields.active !== false
      }));
    } catch (error) {
      console.error('Error fetching users:', error);
      return [];
    }
  },

  async createUser(userData) {
    try {
      const record = await usersTable.create([
        {
          fields: {
            name: userData.name,
            role: userData.role,
            active: true,
            createdAt: new Date().toISOString()
          }
        }
      ]);
      return record[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  // INVENTORY MANAGEMENT
  async getWarehouseItems(warehouse) {
    try {
      const records = await table
        .select({
          filterByFormula: `{warehouse} = '${warehouse}'`
        })
        .all();
      
      return records.map(record => ({
        id: record.id,
        qrCode: record.fields.qrCode,
        itemNumber: record.fields.itemNumber,
        description: record.fields.description,
        quantity: record.fields.quantity || 0,
        color: record.fields.color,
        warehouse: record.fields.warehouse,
        boxQuantity: record.fields.boxQuantity || 12,
        lastUpdated: record.fields.lastUpdated,
        lastUpdatedBy: record.fields.lastUpdatedBy
      }));
    } catch (error) {
      console.error('Error fetching items:', error);
      throw error;
    }
  },

  async getItemByQR(qrCode, warehouse) {
    try {
      const records = await table
        .select({
          filterByFormula: `AND({qrCode} = '${qrCode}', {warehouse} = '${warehouse}')`
        })
        .all();
      
      if (records.length > 0) {
        const record = records[0];
        return {
          id: record.id,
          ...record.fields
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching item:', error);
      throw error;
    }
  },

  async createItem(itemData) {
    try {
      const { id, ...fieldsToCreate } = itemData;
      
      const record = await table.create([
        {
          fields: {
            ...fieldsToCreate,
            lastUpdated: new Date().toISOString()
          }
        }
      ]);
      return record[0];
    } catch (error) {
      console.error('Error creating item:', error);
      throw error;
    }
  },

  async updateItemQuantity(recordId, quantity, user) {
    try {
      const record = await table.update([
        {
          id: recordId,
          fields: {
            quantity: quantity,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: user
          }
        }
      ]);
      return record[0];
    } catch (error) {
      console.error('Error updating item:', error);
      throw error;
    }
  },

  async getWarehouses() {
    try {
      const records = await table.select().all();
      const warehouses = [...new Set(records.map(r => r.fields.warehouse).filter(Boolean))];
      return warehouses.length > 0 ? warehouses : ['Main Warehouse'];
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      return ['Main Warehouse'];
    }
  },

  // PACKOUT SHEET FUNCTIONS
  async createPackoutSheet(packoutData) {
    try {
      const record = await packoutTable.create([
        {
          fields: {
            jobNumber: packoutData.jobNumber,
            customerName: packoutData.customerName,
            jobColor: packoutData.jobColor,
            warehouse: packoutData.warehouse,
            status: 'pending_installer',
            createdBy: packoutData.createdBy,
            createdAt: new Date().toISOString(),
            items: JSON.stringify(packoutData.items)
          }
        }
      ]);
      return record[0];
    } catch (error) {
      console.error('Error creating packout sheet:', error);
      throw error;
    }
  },

  async getPackoutSheets(status, warehouse) {
    try {
      let formula = '';
      const conditions = [];
      
      if (status) conditions.push(`{status} = '${status}'`);
      if (warehouse) conditions.push(`{warehouse} = '${warehouse}'`);
      
      if (conditions.length > 0) {
        formula = conditions.length > 1 ? `AND(${conditions.join(', ')})` : conditions[0];
      }
      
      const records = await packoutTable
        .select({
          filterByFormula: formula,
          sort: [{field: 'createdAt', direction: 'desc'}]
        })
        .all();
      
      return records.map(record => ({
        id: record.id,
        ...record.fields,
        items: JSON.parse(record.fields.items || '[]')
      }));
    } catch (error) {
      console.error('Error fetching packout sheets:', error);
      return [];
    }
  },

  async updatePackoutSheet(recordId, updates) {
    try {
      const record = await packoutTable.update([
        {
          id: recordId,
          fields: updates
        }
      ]);
      return record[0];
    } catch (error) {
      console.error('Error updating packout sheet:', error);
      throw error;
    }
  },

  async confirmPackoutItems(packoutId, confirmedBy) {
    try {
      const updates = {
        status: 'confirmed',
        confirmedBy: confirmedBy,
        confirmedAt: new Date().toISOString()
      };
      
      return await this.updatePackoutSheet(packoutId, updates);
    } catch (error) {
      console.error('Error confirming packout:', error);
      throw error;
    }
  },

  async processPackoutReturns(packoutId, returns, completedBy) {
    try {
      // Get the packout sheet
      const packoutRecord = await packoutTable.find(packoutId);
      const originalItems = JSON.parse(packoutRecord.fields.items || '[]');
      const jobColor = packoutRecord.fields.jobColor;
      
      // Process each item
      for (const originalItem of originalItems) {
        const returnItem = returns.find(r => r.itemName === originalItem.itemName);
        const returnedQty = returnItem ? returnItem.quantity : 0;
        const usedQty = originalItem.quantity - returnedQty;
        
        if (usedQty > 0) {
          // Find and update inventory
          const inventoryRecords = await table
            .select({
              filterByFormula: `AND({description} = '${originalItem.itemName}', {color} = '${jobColor}', {warehouse} = '${packoutRecord.fields.warehouse}')`
            })
            .all();
          
          if (inventoryRecords.length > 0) {
            const record = inventoryRecords[0];
            const newQuantity = Math.max(0, record.fields.quantity - usedQty);
            
            await table.update([{
              id: record.id,
              fields: {
                quantity: newQuantity,
                lastUpdated: new Date().toISOString(),
                lastUpdatedBy: `Packout ${packoutRecord.fields.jobNumber}`
              }
            }]);
          }
        }
      }
      
      // Update packout sheet
      await this.updatePackoutSheet(packoutId, {
        status: 'completed',
        returns: JSON.stringify(returns),
        completedBy: completedBy,
        completedAt: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      console.error('Error processing returns:', error);
      throw error;
    }
  },

  // Get items by color for packout
  async getItemsByColor(color, warehouse) {
    try {
      const records = await table
        .select({
          filterByFormula: `AND({color} = '${color}', {warehouse} = '${warehouse}')`
        })
        .all();
      
      return records.map(record => ({
        id: record.id,
        itemName: record.fields.description,
        currentQuantity: record.fields.quantity || 0,
        boxQuantity: record.fields.boxQuantity || 12
      }));
    } catch (error) {
      console.error('Error fetching items by color:', error);
      return [];
    }
  }
};