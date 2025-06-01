 
import Airtable from 'airtable';

// Configure Airtable
const base = new Airtable({
  apiKey: process.env.REACT_APP_AIRTABLE_ACCESS_TOKEN
}).base(process.env.REACT_APP_AIRTABLE_BASE_ID);

const table = base(process.env.REACT_APP_AIRTABLE_TABLE_NAME);

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
      const record = await table.create([
        {
          fields: {
            ...itemData,
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
  }
};