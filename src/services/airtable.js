import Airtable from 'airtable';

// Configure Airtable
const base = new Airtable({
  apiKey: process.env.REACT_APP_AIRTABLE_ACCESS_TOKEN
}).base(process.env.REACT_APP_AIRTABLE_BASE_ID);

const table = base(process.env.REACT_APP_AIRTABLE_TABLE_NAME);
const packoutTable = base('Packout Sheets'); // You'll need to create this table

export const airtableService = {
  // Get all items for a warehouse
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

  // Get single item by QR code
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

  // Create new item
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

  // Update item quantity
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

  // Get all warehouses (unique values)
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
  
  // Create a new packout sheet
  async createPackoutSheet(packoutData) {
    try {
      const record = await packoutTable.create([
        {
          fields: {
            jobNumber: packoutData.jobNumber,
            customerName: packoutData.customerName,
            jobColor: packoutData.jobColor,
            warehouse: packoutData.warehouse,
            status: 'pending_installer', // pending_installer, confirmed, completed
            createdBy: packoutData.createdBy,
            createdAt: new Date().toISOString(),
            items: JSON.stringify(packoutData.items) // Store as JSON
          }
        }
      ]);
      return record[0];
    } catch (error) {
      console.error('Error creating packout sheet:', error);
      throw error;
    }
  },

  // Get packout sheets by status
  async getPackoutSheets(status) {
    try {
      const formula = status ? `{status} = '${status}'` : '';
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
      throw error;
    }
  },

  // Update packout sheet status
  async updatePackoutStatus(recordId, status, confirmedBy) {
    try {
      const updates = {
        status: status
      };
      
      if (status === 'confirmed') {
        updates.confirmedBy = confirmedBy;
        updates.confirmedAt = new Date().toISOString();
      } else if (status === 'completed') {
        updates.completedAt = new Date().toISOString();
      }
      
      const record = await packoutTable.update([
        {
          id: recordId,
          fields: updates
        }
      ]);
      return record[0];
    } catch (error) {
      console.error('Error updating packout status:', error);
      throw error;
    }
  },

  // Process packout returns (final step)
  async processPackoutReturns(packoutId, returns) {
    try {
      // First get the packout sheet
      const packoutRecord = await packoutTable.find(packoutId);
      const originalItems = JSON.parse(packoutRecord.fields.items || '[]');
      
      // Calculate differences and update inventory
      for (const item of originalItems) {
        const returnItem = returns.find(r => r.itemName === item.itemName);
        if (returnItem) {
          const usedQuantity = item.quantity - returnItem.quantity;
          
          // Find the inventory item
          const inventoryRecords = await table
            .select({
              filterByFormula: `AND({description} = '${item.itemName}', {color} = '${packoutRecord.fields.jobColor}')`
            })
            .all();
          
          if (inventoryRecords.length > 0) {
            const inventoryRecord = inventoryRecords[0];
            const newQuantity = Math.max(0, inventoryRecord.fields.quantity - usedQuantity);
            
            // Update inventory
            await table.update([
              {
                id: inventoryRecord.id,
                fields: {
                  quantity: newQuantity,
                  lastUpdated: new Date().toISOString(),
                  lastUpdatedBy: 'Packout Return'
                }
              }
            ]);
          }
        }
      }
      
      // Update packout sheet with returns
      await packoutTable.update([
        {
          id: packoutId,
          fields: {
            status: 'completed',
            returns: JSON.stringify(returns),
            completedAt: new Date().toISOString()
          }
        }
      ]);
      
      return true;
    } catch (error) {
      console.error('Error processing packout returns:', error);
      throw error;
    }
  }
};