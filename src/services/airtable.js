import Airtable from 'airtable';

// Log environment variables for debugging
console.log('Airtable Environment Variables:', {
  baseId: process.env.REACT_APP_AIRTABLE_BASE_ID,
  accessToken: process.env.REACT_APP_AIRTABLE_ACCESS_TOKEN ? 'Set' : 'Missing',
  inventoryTable: process.env.REACT_APP_AIRTABLE_TABLE_NAME,
  usersTable: process.env.REACT_APP_AIRTABLE_USERS_TABLE,
  packoutTable: process.env.REACT_APP_AIRTABLE_PACKOUT_TABLE
});

// Configure Airtable
const base = new Airtable({
  apiKey: process.env.REACT_APP_AIRTABLE_ACCESS_TOKEN
}).base(process.env.REACT_APP_AIRTABLE_BASE_ID);

// Define tables with fallbacks
const table = base(process.env.REACT_APP_AIRTABLE_TABLE_NAME || 'Inventory');
const usersTable = base(process.env.REACT_APP_AIRTABLE_USERS_TABLE || 'Users');
const packoutTable = base(process.env.REACT_APP_AIRTABLE_PACKOUT_TABLE || 'Packout Sheets');

export const airtableService = {
  // Get all users by role
  async getUsers(userRole) {
    try {
      const formula = userRole ? `{role} = '${userRole}'` : '';
      const records = await usersTable
        .select({
          filterByFormula: formula,
          sort: [{ field: 'name', direction: 'asc' }]
        })
        .all();
      return records.map(record => ({
        id: record.id,
        name: record.fields.name || '',
        role: record.fields.role || '',
        active: record.fields.active !== false
      }));
    } catch (error) {
      console.error('Error fetching users:', error);
      return [];
    }
  },

  // Create a new user
  async createUser(userData) {
    try {
      const record = await usersTable.create([
        {
          fields: {
            name: userData.name,
            role: userData.role,
            active: userData.active !== false,
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

  // Confirm packout items
  async confirmPackoutItems(packoutId, confirmedBy) {
    try {
      const record = await packoutTable.update([
        {
          id: packoutId,
          fields: {
            status: 'confirmed',
            confirmedBy: confirmedBy,
            confirmedAt: new Date().toISOString()
          }
        }
      ]);
      return record[0];
    } catch (error) {
      console.error('Error confirming packout:', error);
      throw error;
    }
  },

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

  // Get packout sheets by status and warehouse
  async getPackoutSheets(statuses, warehouse) {
    try {
      let formula = `{warehouse} = '${warehouse}'`;
      if (statuses) {
        if (Array.isArray(statuses)) {
          const statusFilters = statuses.map(status => `{status} = '${status}'`).join(', ');
          formula = `AND(${formula}, OR(${statusFilters}))`;
        } else {
          formula = `AND(${formula}, {status} = '${statuses}')`;
        }
      }
      console.log('Fetching packout sheets with formula:', formula);
      const records = await packoutTable
        .select({
          filterByFormula: formula,
          sort: [{ field: 'createdAt', direction: 'desc' }]
        })
        .all();
      
      return records.map(record => ({
        id: record.id,
        jobNumber: record.fields.jobNumber,
        customerName: record.fields.customerName,
        jobColor: record.fields.jobColor,
        warehouse: record.fields.warehouse,
        status: record.fields.status,
        createdBy: record.fields.createdBy,
        createdAt: record.fields.createdAt,
        confirmedBy: record.fields.confirmedBy,
        confirmedAt: record.fields.confirmedAt,
        completedBy: record.fields.completedBy,
        completedAt: record.fields.completedAt,
        items: JSON.parse(record.fields.items || '[]')
      }));
    } catch (error) {
      console.error('Error fetching packout sheets:', error);
      throw error;
    }
  },

  // Process packout returns
  async processPackoutReturns(packoutId, returns, completedBy) {
    try {
      const packoutRecord = await packoutTable.find(packoutId);
      const originalItems = JSON.parse(packoutRecord.fields.items || '[]');
      const jobColor = packoutRecord.fields.jobColor?.trim();
      const warehouse = packoutRecord.fields.warehouse?.trim();
      const jobNumber = packoutRecord.fields.jobNumber;

      const getColorLetter = (color) => {
        const colorMap = {
          'White': 'E',
          'Brown': 'C',
          'Coal Gray': 'K',
          'Musket Brown': 'M',
          'Eggshell': 'S',
          'Wicker': 'W',
          'Cream': 'N',
          'Clay': 'D',
          'Tan': 'T',
          'Terratone': 'U',
          'Ivory': 'I',
          'Light Gray': 'H',
          'Red': 'R',
          'Green': 'F'
        };
        return colorMap[color] || '';
      };

      const colorLetter = getColorLetter(jobColor);
      if (!colorLetter) {
        console.warn(`No color letter mapped for jobColor: ${jobColor}`);
        throw new Error(`Invalid jobColor: ${jobColor}`);
      }

      for (const originalItem of originalItems) {
        const returnItem = returns.find(r => r.itemName === originalItem.itemName);
        const returnedQty = returnItem ? parseInt(returnItem.quantity, 10) : 0;
        const usedQty = originalItem.quantity - returnedQty;

        if (usedQty > 0) {
          const itemNumber = `${originalItem.partNumber}${colorLetter}`.trim(); // e.g., 00128E
          console.log(`Processing ${originalItem.itemName}: used ${usedQty}, itemNumber: ${itemNumber}, color: ${jobColor}, warehouse: ${warehouse}`);

          const inventoryRecords = await table
            .select({
              filterByFormula: `AND({itemNumber} = '${itemNumber}', {color} = '${jobColor}', {warehouse} = '${warehouse}')`
            })
            .all();

          if (inventoryRecords.length > 0) {
            const record = inventoryRecords[0];
            const newQuantity = Math.max(0, record.fields.quantity - usedQty);
            console.log(`Updating inventory: ${record.fields.description} (${itemNumber}) from ${record.fields.quantity} to ${newQuantity}`);
            await table.update([
              {
                id: record.id,
                fields: {
                  quantity: newQuantity,
                  lastUpdated: new Date().toISOString(),
                  lastUpdatedBy: `Packout ${jobNumber}`
                }
              }
            ]);
          } else {
            console.warn(`No inventory record found for itemNumber: ${itemNumber}, color: ${jobColor}, warehouse: ${warehouse}`);
            await table.create([
              {
                fields: {
                  itemNumber: itemNumber,
                  description: originalItem.itemName,
                  color: jobColor,
                  warehouse: warehouse,
                  quantity: 0,
                  lastUpdated: new Date().toISOString(),
                  lastUpdatedBy: `Packout ${jobNumber}`
                }
              }
            ]);
            console.log(`Created new inventory record for ${itemNumber}`);
          }
        }
      }

      await packoutTable.update([
        {
          id: packoutId,
          fields: {
            status: 'completed',
            returns: JSON.stringify(returns),
            completedBy: completedBy,
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