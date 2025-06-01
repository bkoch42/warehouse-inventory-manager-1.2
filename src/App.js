import React, { useState, useEffect } from 'react';
import { Package, Scan, Plus, Minus, Building2, FileSpreadsheet, Camera, LogOut } from 'lucide-react';
import { airtableService } from './services/airtable';
import './App.css';

function App() {
  const [user, setUser] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState('');
  const [formData, setFormData] = useState({});
  const [scannedCode, setScannedCode] = useState('');

  const roles = ['PM', 'GM', 'Chop Driver', 'Lead Installer'];
  const colors = ['White', 'Brown', 'Coal Gray', 'Musket Brown', 'Eggshell', 'Wicker', 'Cream', 'Clay', 'Tan', 'Terratone', 'Ivory', 'Light Gray', 'Red', 'Green'];

  // Load warehouses on mount
  useEffect(() => {
    loadWarehouses();
  }, []);

  // Load inventory when warehouse is selected
  useEffect(() => {
    if (warehouse) {
      loadInventory();
    }
  }, [warehouse]);

  const loadWarehouses = async () => {
    try {
      const warehouseList = await airtableService.getWarehouses();
      setWarehouses(warehouseList);
    } catch (error) {
      console.error('Error loading warehouses:', error);
      setWarehouses(['Main Warehouse']);
    }
  };

  const loadInventory = async () => {
    setLoading(true);
    try {
      const items = await airtableService.getWarehouseItems(warehouse);
      setInventory(items);
    } catch (error) {
      console.error('Error loading inventory:', error);
      alert('Error loading inventory. Please check your connection.');
    }
    setLoading(false);
  };

  const handleScan = async (code) => {
    setScannedCode(code);
    setLoading(true);
    
    try {
      const item = await airtableService.getItemByQR(code, warehouse);
      if (item) {
        setFormData({ ...item, qrCode: code });
        setShowModal('checkinout');
      } else {
        setFormData({ qrCode: code, itemNumber: '', description: '', quantity: 0, color: '', warehouse });
        setShowModal('item');
      }
    } catch (error) {
      console.error('Error scanning item:', error);
      alert('Error scanning item. Please try again.');
    }
    setLoading(false);
  };

  const saveItem = async () => {
    if (!formData.itemNumber || !formData.description || !formData.color) {
      alert('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      await airtableService.createItem({
        ...formData,
        lastUpdatedBy: user
      });
      await loadInventory();
      setShowModal('');
      setFormData({});
      alert('Item added successfully!');
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Error saving item. Please try again.');
    }
    setLoading(false);
  };

  const updateInventory = async (type, qty) => {
    const qtyNum = parseInt(qty);
    if (!qtyNum || qtyNum <= 0) return alert('Enter valid quantity');
    
    const newQuantity = type === 'in' 
      ? formData.quantity + qtyNum 
      : Math.max(0, formData.quantity - qtyNum);

    setLoading(true);
    try {
      await airtableService.updateItemQuantity(formData.id, newQuantity, user);
      await loadInventory();
      setShowModal('');
      setFormData({});
      alert(`Successfully ${type === 'in' ? 'checked in' : 'checked out'} ${qty} items!`);
    } catch (error) {
      console.error('Error updating inventory:', error);
      alert('Error updating inventory. Please try again.');
    }
    setLoading(false);
  };

  const exportData = () => {
    let csv = 'QR Code,Item Number,Description,Color,Quantity,Last Updated,Last Updated By\n';
    inventory.forEach(item => {
      csv += `${item.qrCode},${item.itemNumber},${item.description},${item.color},${item.quantity},${item.lastUpdated || ''},${item.lastUpdatedBy || ''}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${warehouse}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addWarehouse = () => {
    if (formData.name) {
      setWarehouses(prev => [...prev, formData.name]);
      setShowModal('');
      setFormData({});
    }
  };

  // User Selection Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center mobile-padding">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <div className="text-center mb-6">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Warehouse Manager</h1>
            <p className="text-gray-600">Select your role to continue</p>
          </div>
          <select 
            className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            value={user} 
            onChange={(e) => setUser(e.target.value)}
          >
            <option value="">Choose your role</option>
            {roles.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <button 
            onClick={() => user && setUser(user)}
            disabled={!user}
            className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Warehouse Selection Screen
  if (!warehouse) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 mobile-padding">
        <div className="max-w-4xl mx-auto py-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="bg-blue-100 w-12 h-12 rounded-xl flex items-center justify-center mr-4">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Select Warehouse</h1>
                  <p className="text-gray-600">Welcome, {user}</p>
                </div>
              </div>
              <button onClick={() => setUser('')} className="p-2 text-gray-400 hover:text-gray-600">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {warehouses.map(wh => (
                <button
                  key={wh}
                  onClick={() => setWarehouse(wh)}
                  className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all card-hover"
                >
                  <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-1">{wh}</h3>
                </button>
              ))}
              
              <button
                onClick={() => setShowModal('addwarehouse')}
                className="p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all flex flex-col items-center justify-center"
              >
                <Plus className="w-12 h-12 text-gray-400 mb-3" />
                <span className="font-semibold text-gray-600">Add Warehouse</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Inventory Screen
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button onClick={() => setWarehouse('')} className="mr-3 p-2 text-gray-500 hover:text-gray-700">
                <Building2 className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{warehouse}</h1>
                <p className="text-sm text-gray-600 mobile-text">User: {user}</p>
              </div>
            </div>
            <button onClick={exportData} className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 mobile-text">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mobile-padding py-6">
        {/* Scanner Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="text-center mb-6">
            <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Scan className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Scan QR Code</h2>
            <p className="text-gray-600 mobile-text">Use camera or enter code manually</p>
          </div>
          
          <div className="flex flex-col items-center gap-4">
            <button 
              onClick={() => alert('Camera feature would be implemented with QR library')}
              className="flex items-center bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700"
            >
              <Camera className="w-5 h-5 mr-2" />
              Start Camera
            </button>
            
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Demo codes:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {['QR001', 'QR002', 'QR003'].map(code => (
                  <button key={code} onClick={() => handleScan(code)} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm hover:bg-blue-200">
                    {code}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex gap-2 w-full max-w-md">
              <input
                type="text"
                placeholder="Enter QR code"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={scannedCode}
                onChange={(e) => setScannedCode(e.target.value)}
              />
              <button 
                onClick={() => scannedCode && handleScan(scannedCode)}
                disabled={!scannedCode || loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Scan'}
              </button>
            </div>
          </div>
        </div>

        {/* Inventory List */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Inventory</h2>
          {loading && <p className="text-gray-500 text-center">Loading inventory...</p>}
          {!loading && inventory.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gray-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Package className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500">No items yet. Start by scanning a QR code!</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {inventory.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded-md">{item.qrCode}</span>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-md">{item.itemNumber}</span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-md">{item.color}</span>
                    </div>
                    <p className="font-medium text-gray-900 mb-1">{item.description}</p>
                    <p className="text-sm text-gray-600 mobile-text">
                      Updated {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : 'N/A'} by {item.lastUpdatedBy || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-2xl font-bold text-gray-900">{item.quantity}</p>
                    <p className="text-xs text-gray-500">in stock</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            
            {/* Add Warehouse Modal */}
            {showModal === 'addwarehouse' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Add New Warehouse</h3>
                <input
                  type="text"
                  placeholder="Warehouse name"
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 mb-4"
                  onChange={(e) => setFormData({name: e.target.value})}
                />
                <div className="flex gap-2">
                  <button 
                    onClick={addWarehouse}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button onClick={() => setShowModal('')} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-xl hover:bg-gray-400">
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Item Form Modal */}
            {showModal === 'item' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Add Item</h3>
                <div className="space-y-3">
                  <input type="text" placeholder="Item Number*" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" 
                    value={formData.itemNumber || ''} onChange={(e) => setFormData({...formData, itemNumber: e.target.value})} />
                  <input type="text" placeholder="Description*" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} />
                  <input type="number" placeholder="Initial Quantity" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    value={formData.quantity || ''} onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} />
                  <select className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    value={formData.color || ''} onChange={(e) => setFormData({...formData, color: e.target.value})}>
                    <option value="">Select Color*</option>
                    {colors.map(color => <option key={color} value={color}>{color}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={saveItem} disabled={loading} className="flex-1 bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50">
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setShowModal('')} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-xl hover:bg-gray-400">Cancel</button>
                </div>
              </>
            )}

            {/* Check In/Out Modal */}
            {showModal === 'checkinout' && (
              <>
                <h3 className="text-lg font-semibold mb-2">{formData.description}</h3>
                <p className="text-gray-600 mb-4">Current: <strong>{formData.quantity}</strong></p>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setFormData({...formData, type: 'in'})} 
                    className={`flex-1 py-2 rounded-xl flex items-center justify-center ${formData.type === 'in' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>
                    <Plus className="w-4 h-4 mr-1" />Check In
                  </button>
                  <button onClick={() => setFormData({...formData, type: 'out'})}
                    className={`flex-1 py-2 rounded-xl flex items-center justify-center ${formData.type === 'out' ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>
                    <Minus className="w-4 h-4 mr-1" />Check Out
                  </button>
                </div>
                {formData.type && (
                  <>
                    <input type="number" min="1" placeholder="Enter quantity" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 mb-4"
                      onChange={(e) => setFormData({...formData, qty: e.target.value})} />
                    <div className="flex gap-2">
                      <button onClick={() => updateInventory(formData.type, formData.qty)} disabled={loading}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50">
                        {loading ? 'Updating...' : 'Confirm'}
                      </button>
                      <button onClick={() => setShowModal('')} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-xl hover:bg-gray-400">Cancel</button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;