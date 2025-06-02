import React, { useState, useEffect } from 'react';
import { Package, Scan, Plus, Minus, Building2, FileSpreadsheet, Camera, LogOut, CheckCircle, XCircle } from 'lucide-react';
import { airtableService } from './services/airtable';
import { Html5QrcodeScanner } from "html5-qrcode";
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
  const [isScanning, setIsScanning] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  const roles = ['PM', 'GM', 'Chop Driver', 'Lead Installer'];
  const colors = ['White', 'Brown', 'Coal Gray', 'Musket Brown', 'Eggshell', 'Wicker', 'Cream', 'Clay', 'Tan', 'Terratone', 'Ivory', 'Light Gray', 'Red', 'Green'];

  // Load warehouses on mount
  useEffect(() => {
    loadWarehouses();
  }, []);

  const loadWarehouses = async () => {
    try {
      const warehouseList = await airtableService.getWarehouses();
      setWarehouses(warehouseList);
    } catch (error) {
      console.error('Error loading warehouses:', error);
      setWarehouses(['Main Warehouse']);
    }
  };
  
  // QR Scanner Effect
  useEffect(() => {
    if (isScanning) {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { 
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        false
      );

      scanner.render(
        (decodedText) => {
          scanner.clear();
          setIsScanning(false);
          handleScan(decodedText);
        },
        (error) => {
          console.warn(error);
        }
      );

      return () => {
        scanner.clear();
      };
    }
  }, [isScanning]);

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
      setShowModal('');
      setFormData({});
      setScannedCode('');
      setLastAction({ type: 'success', message: `Item ${formData.itemNumber} added successfully!` });
      setTimeout(() => setLastAction(null), 5000);
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
	  //debugger
	console.log('Updating inventory:',{
		recordId: formData.id,
		newQuantity: newQuantity,
		formData: formData
	});

    setLoading(true);
    try {
      await airtableService.updateItemQuantity(formData.id, newQuantity, user);
      setShowModal('');
      const action = type === 'in' ? 'checked in' : 'checked out';
      setLastAction({ 
        type: 'success', 
        message: `${formData.itemNumber}: ${qty} items ${action}. New quantity: ${newQuantity}` 
      });
      setFormData({});
      setScannedCode('');
      setTimeout(() => setLastAction(null), 5000);
    } catch (error) {
      console.error('Error updating inventory:', error);
      alert('Error updating inventory. Please try again.');
    }
    setLoading(false);
  };

  const exportData = async () => {
    setLoading(true);
    try {
      // Load fresh inventory data for export
      const items = await airtableService.getWarehouseItems(warehouse);
      
      let csv = 'QR Code,Item Number,Description,Color,Quantity,Last Updated,Last Updated By\n';
      items.forEach(item => {
        csv += `${item.qrCode},${item.itemNumber},${item.description},${item.color},${item.quantity},${item.lastUpdated || ''},${item.lastUpdatedBy || ''}\n`;
      });
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-${warehouse}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Error exporting data. Please try again.');
    }
    setLoading(false);
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

  // Main Scanner Screen - Simplified
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
            <button onClick={exportData} disabled={loading} className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 mobile-text disabled:opacity-50">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              {loading ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto mobile-padding py-6">
        {/* Last Action Notification */}
        {lastAction && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            lastAction.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {lastAction.type === 'success' ? 
              <CheckCircle className="w-5 h-5 flex-shrink-0" /> : 
              <XCircle className="w-5 h-5 flex-shrink-0" />
            }
            <p className="font-medium">{lastAction.message}</p>
          </div>
        )}

        {/* Scanner Section - Now the main focus */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="bg-blue-100 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Scan className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Scan QR Code</h2>
            <p className="text-gray-600">Scan to check in/out items or add new inventory</p>
          </div>
          
          <div className="flex flex-col items-center gap-6">
            {!isScanning ? (
              <>
                <button 
                  onClick={() => setIsScanning(true)}
                  className="flex items-center bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 text-lg font-medium shadow-lg hover:shadow-xl transition-all"
                >
                  <Camera className="w-6 h-6 mr-3" />
                  Start Camera Scanner
                </button>
                
                <div className="w-full max-w-md">
                  <p className="text-sm text-gray-500 text-center mb-3">Or enter code manually:</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter QR code"
                      className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                      value={scannedCode}
                      onChange={(e) => setScannedCode(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && scannedCode) {
                          handleScan(scannedCode);
                        }
                      }}
                    />
                    <button 
                      onClick={() => scannedCode && handleScan(scannedCode)}
                      disabled={!scannedCode || loading}
                      className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium"
                    >
                      {loading ? 'Loading...' : 'Search'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full max-w-md">
                <div id="qr-reader" className="w-full mb-4"></div>
                <button 
                  onClick={() => setIsScanning(false)}
                  className="w-full bg-gray-500 text-white py-3 rounded-xl hover:bg-gray-600 font-medium"
                >
                  Cancel Scanning
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Modals with better visibility */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform scale-105">
            
            {/* Add Warehouse Modal */}
            {showModal === 'addwarehouse' && (
              <>
                <h3 className="text-2xl font-bold mb-6">Add New Warehouse</h3>
                <input
                  type="text"
                  placeholder="Warehouse name"
                  className="w-full p-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 mb-6"
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
                <div className="flex gap-3">
                  <button 
                    onClick={addWarehouse}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 font-medium text-lg"
                  >
                    Add Warehouse
                  </button>
                  <button onClick={() => {
                    setShowModal('');
                    setFormData({});
                  }} className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-400 font-medium text-lg">
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Item Form Modal - For new items */}
            {showModal === 'item' && (
              <>
                <h3 className="text-2xl font-bold mb-2">Add New Item</h3>
                <p className="text-gray-600 mb-6">QR Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{formData.qrCode}</span></p>
                <div className="space-y-4">
                  <input type="text" placeholder="Item Number*" className="w-full p-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" 
                    value={formData.itemNumber || ''} onChange={(e) => setFormData({...formData, itemNumber: e.target.value})} />
                  <input type="text" placeholder="Description*" className="w-full p-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} />
                  <input type="number" placeholder="Initial Quantity" className="w-full p-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    value={formData.quantity || ''} onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} />
                  <select className="w-full p-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    value={formData.color || ''} onChange={(e) => setFormData({...formData, color: e.target.value})}>
                    <option value="">Select Color*</option>
                    {colors.map(color => <option key={color} value={color}>{color}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={saveItem} disabled={loading} className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium text-lg">
                    {loading ? 'Saving...' : 'Save Item'}
                  </button>
                  <button onClick={() => {
                    setShowModal('');
                    setFormData({});
                    setScannedCode('');
                  }} className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-400 font-medium text-lg">
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Check In/Out Modal - Enhanced visibility */}
            {showModal === 'checkinout' && (
              <>
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2">{formData.description}</h3>
                  <p className="text-gray-600">Item: <span className="font-mono">{formData.itemNumber}</span></p>
                  <p className="text-gray-600">QR: <span className="font-mono">{formData.qrCode}</span></p>
                  <div className="mt-4 bg-gray-100 rounded-xl p-4">
                    <p className="text-sm text-gray-600">Current Quantity</p>
                    <p className="text-4xl font-bold text-gray-900">{formData.quantity}</p>
                  </div>
                </div>
                
                <div className="flex gap-3 mb-6">
                  <button onClick={() => setFormData({...formData, type: 'in'})} 
                    className={`flex-1 py-4 rounded-xl flex items-center justify-center text-lg font-medium transition-all ${
                      formData.type === 'in' ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-100 hover:bg-gray-200'
                    }`}>
                    <Plus className="w-6 h-6 mr-2" />Check In
                  </button>
                  <button onClick={() => setFormData({...formData, type: 'out'})}
                    className={`flex-1 py-4 rounded-xl flex items-center justify-center text-lg font-medium transition-all ${
                      formData.type === 'out' ? 'bg-red-600 text-white shadow-lg' : 'bg-gray-100 hover:bg-gray-200'
                    }`}>
                    <Minus className="w-6 h-6 mr-2" />Check Out
                  </button>
                </div>
                
                {formData.type && (
                  <>
                    <input 
                      type="number" 
                      min="1" 
                      placeholder={`Enter quantity to ${formData.type === 'in' ? 'add' : 'remove'}`}
                      className="w-full p-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 mb-6"
                      onChange={(e) => setFormData({...formData, qty: e.target.value})}
                      autoFocus
                    />
                    <div className="flex gap-3">
                      <button onClick={() => updateInventory(formData.type, formData.qty)} disabled={loading}
                        className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium text-lg">
                        {loading ? 'Updating...' : 'Confirm'}
                      </button>
                      <button onClick={() => {
                        setShowModal('');
                        setFormData({});
                        setScannedCode('');
                      }} className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-400 font-medium text-lg">
                        Cancel
                      </button>
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