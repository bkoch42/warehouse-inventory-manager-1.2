import React, { useState, useEffect } from 'react';
import { Package, Scan, Plus, Minus, Building2, FileSpreadsheet, Camera, LogOut, CheckCircle, XCircle, ClipboardList, User } from 'lucide-react';
import { airtableService } from './services/airtable';
import { Html5QrcodeScanner } from "html5-qrcode";
import './App.css';

function App() {
  const [user, setUser] = useState('');
  const [userName, setUserName] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState('');
  const [formData, setFormData] = useState({});
  const [scannedCode, setScannedCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [lastAction, setLastAction] = useState(null);
  const [confirmationData, setConfirmationData] = useState(null);
  const [packoutSheets, setPackoutSheets] = useState([]);
  const [currentView, setCurrentView] = useState('scanner'); // scanner, packout

  const roles = ['PM', 'GM', 'Chop Driver', 'Lead Installer'];
  const colors = ['White', 'Brown', 'Coal Gray', 'Musket Brown', 'Eggshell', 'Wicker', 'Cream', 'Clay', 'Tan', 'Terratone', 'Ivory', 'Light Gray', 'Red', 'Green'];
  
  // Common items for packout sheets
  const packoutItems = [
    'A Elbows', 'B Elbows', 'C Elbows', 'Downspout', 
    'Fascia', 'J-Channel', 'Starter Strip', 'Corner Post',
    'Window Trim', 'Door Trim', 'Soffit', 'F-Channel'
  ];

  // Load warehouses on mount
  useEffect(() => {
    loadWarehouses();
    // Load saved user name
    const savedUserName = localStorage.getItem(`userName_${user}`);
    if (savedUserName) {
      setUserName(savedUserName);
    }
  }, [user]);

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

  const calculateBoxesAndPieces = (quantity, boxQuantity) => {
    if (!boxQuantity || boxQuantity === 0) {
      return { boxes: 0, pieces: quantity };
    }
    const boxes = Math.floor(quantity / boxQuantity);
    const pieces = quantity % boxQuantity;
    return { boxes, pieces };
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
        lastUpdatedBy: userName || user
      });
      
      // Show confirmation
      const { boxes, pieces } = calculateBoxesAndPieces(formData.quantity, formData.boxQuantity || 12);
      setConfirmationData({
        action: 'created',
        itemNumber: formData.itemNumber,
        description: formData.description,
        quantity: formData.quantity,
        boxes,
        pieces
      });
      setShowModal('confirmation');
      
      setFormData({});
      setScannedCode('');
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
      await airtableService.updateItemQuantity(formData.id, newQuantity, userName || user);
      
      // Calculate boxes and pieces for confirmation
      const { boxes, pieces } = calculateBoxesAndPieces(newQuantity, formData.boxQuantity || 12);
      const { boxes: oldBoxes, pieces: oldPieces } = calculateBoxesAndPieces(formData.quantity, formData.boxQuantity || 12);
      
      setConfirmationData({
        action: type,
        itemNumber: formData.itemNumber,
        description: formData.description,
        oldQuantity: formData.quantity,
        newQuantity: newQuantity,
        changeQuantity: qtyNum,
        oldBoxes,
        oldPieces,
        boxes,
        pieces
      });
      setShowModal('confirmation');
      
      setFormData({});
      setScannedCode('');
    } catch (error) {
      console.error('Error updating inventory:', error);
      alert('Error updating inventory. Please try again.');
    }
    setLoading(false);
  };

  const exportData = async () => {
    setLoading(true);
    try {
      const items = await airtableService.getWarehouseItems(warehouse);
      
      let csv = 'QR Code,Item Number,Description,Color,Quantity,Boxes,Pieces,Last Updated,Last Updated By\n';
      items.forEach(item => {
        const { boxes, pieces } = calculateBoxesAndPieces(item.quantity, item.boxQuantity || 12);
        csv += `${item.qrCode},${item.itemNumber},${item.description},${item.color},${item.quantity},${boxes},${pieces},${item.lastUpdated || ''},${item.lastUpdatedBy || ''}\n`;
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

  // User Name Modal
  const UserNameModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center mb-4">
          <User className="w-6 h-6 text-blue-600 mr-2" />
          <h3 className="text-xl font-bold">Enter Your Name</h3>
        </div>
        <input
          type="text"
          placeholder={`${user} - Your Full Name`}
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className="w-full p-3 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 mb-4"
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={() => {
              localStorage.setItem(`userName_${user}`, userName);
              setShowModal('');
            }}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 font-medium"
          >
            Save & Continue
          </button>
          <button
            onClick={() => setShowModal('')}
            className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-400 font-medium"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );

  // Confirmation Modal
  const ConfirmationModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="text-center">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold mb-4">
            {confirmationData?.action === 'created' ? 'Item Created!' :
             confirmationData?.action === 'in' ? 'Items Checked In!' : 'Items Checked Out!'}
          </h3>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4 text-left">
            <p className="font-medium text-gray-900 mb-2">{confirmationData?.description}</p>
            <p className="text-sm text-gray-600 mb-3">Item: {confirmationData?.itemNumber}</p>
            
            {confirmationData?.action === 'created' ? (
              <>
                <p className="text-lg mb-2">Initial Quantity: <span className="font-bold">{confirmationData?.quantity}</span></p>
                <div className="border-t pt-2">
                  <p className="text-lg">
                    <span className="font-bold text-blue-600">{confirmationData?.boxes} boxes</span>
                    {confirmationData?.pieces > 0 && (
                      <span className="ml-2">+ <span className="font-bold text-orange-600">{confirmationData?.pieces} pieces</span></span>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <p className="text-sm text-gray-500">Previous</p>
                    <p className="font-bold">{confirmationData?.oldQuantity} total</p>
                    <p className="text-sm">{confirmationData?.oldBoxes} boxes + {confirmationData?.oldPieces} pcs</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">New</p>
                    <p className="font-bold text-green-600">{confirmationData?.newQuantity} total</p>
                    <p className="text-sm">{confirmationData?.boxes} boxes + {confirmationData?.pieces} pcs</p>
                  </div>
                </div>
                <div className="border-t pt-2">
                  <p className="text-lg">
                    {confirmationData?.action === 'in' ? '+' : '-'}
                    {confirmationData?.changeQuantity} items
                  </p>
                </div>
              </>
            )}
          </div>
          
          <button
            onClick={() => {
              setShowModal('');
              setConfirmationData(null);
            }}
            className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  // User Selection Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-md">
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
            onClick={() => {
              if (user) {
                setUser(user);
                setShowModal('userName');
              }
            }}
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto py-4 sm:py-8">
          <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="bg-blue-100 w-10 sm:w-12 h-10 sm:h-12 rounded-xl flex items-center justify-center mr-3 sm:mr-4">
                  <Building2 className="w-5 sm:w-6 h-5 sm:h-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Select Warehouse</h1>
                  <p className="text-sm sm:text-base text-gray-600">Welcome, {userName || user}</p>
                </div>
              </div>
              <button onClick={() => {
                setUser('');
                setUserName('');
              }} className="p-2 text-gray-400 hover:text-gray-600">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {warehouses.map(wh => (
                <button
                  key={wh}
                  onClick={() => setWarehouse(wh)}
                  className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all"
                >
                  <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900">{wh}</h3>
                </button>
              ))}
            </div>
            
            {user === 'Chop Driver' && (
              <button
                onClick={() => {
                  setWarehouse(warehouses[0] || 'Main Warehouse');
                  setCurrentView('packout');
                }}
                className="mt-6 w-full bg-orange-600 text-white py-4 rounded-xl hover:bg-orange-700 font-medium text-lg flex items-center justify-center"
              >
                <ClipboardList className="w-6 h-6 mr-2" />
                Packout Sheets
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main App with Navigation
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
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">{warehouse}</h1>
                <p className="text-xs sm:text-sm text-gray-600">User: {userName || user}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {(user === 'Chop Driver' || user === 'Lead Installer') && (
                <button
                  onClick={() => setCurrentView(currentView === 'scanner' ? 'packout' : 'scanner')}
                  className={`px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base ${
                    currentView === 'packout' 
                      ? 'bg-orange-600 text-white' 
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {currentView === 'packout' ? 'Scanner' : 'Packouts'}
                </button>
              )}
              <button 
                onClick={exportData} 
                disabled={loading} 
                className="flex items-center bg-green-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm sm:text-base"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {currentView === 'scanner' ? (
        // Scanner View
        <div className="max-w-2xl mx-auto p-4 py-6">
          {lastAction && (
            <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
              lastAction.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {lastAction.type === 'success' ? 
                <CheckCircle className="w-5 h-5 flex-shrink-0" /> : 
                <XCircle className="w-5 h-5 flex-shrink-0" />
              }
              <p className="font-medium text-sm sm:text-base">{lastAction.message}</p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
            <div className="text-center mb-6 sm:mb-8">
              <div className="bg-blue-100 w-16 sm:w-20 h-16 sm:h-20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Scan className="w-8 sm:w-10 h-8 sm:h-10 text-blue-600" />
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">Scan QR Code</h2>
              <p className="text-gray-600 text-sm sm:text-base">Scan to check in/out items or add new inventory</p>
            </div>
            
            <div className="flex flex-col items-center gap-4 sm:gap-6">
              {!isScanning ? (
                <>
                  <button 
                    onClick={() => setIsScanning(true)}
                    className="flex items-center bg-blue-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl hover:bg-blue-700 text-base sm:text-lg font-medium shadow-lg hover:shadow-xl transition-all"
                  >
                    <Camera className="w-5 sm:w-6 h-5 sm:h-6 mr-2 sm:mr-3" />
                    Start Camera Scanner
                  </button>
                  
                  <div className="w-full max-w-md">
                    <p className="text-xs sm:text-sm text-gray-500 text-center mb-3">Or enter code manually:</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter QR code"
                        className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-lg"
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
                        className="bg-blue-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium"
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
      ) : (
        // Packout View - Placeholder for now
        <div className="max-w-4xl mx-auto p-4 py-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-4">Packout Sheets</h2>
            <p className="text-gray-600">Packout sheet functionality coming soon...</p>
          </div>
        </div>
      )}

      {/* Modals */}
      {showModal === 'userName' && <UserNameModal />}
      {showModal === 'confirmation' && <ConfirmationModal />}
      
      {showModal === 'item' && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl sm:text-2xl font-bold mb-2">Add New Item</h3>
            <p className="text-gray-600 mb-6">QR Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{formData.qrCode}</span></p>
            <div className="space-y-4">
              <input type="text" placeholder="Item Number*" className="w-full p-3 sm:p-4 text-base sm:text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" 
                value={formData.itemNumber || ''} onChange={(e) => setFormData({...formData, itemNumber: e.target.value})} />
              <input type="text" placeholder="Description*" className="w-full p-3 sm:p-4 text-base sm:text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} />
              <input type="number" placeholder="Initial Quantity" className="w-full p-3 sm:p-4 text-base sm:text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                value={formData.quantity || ''} onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} />
              <input type="number" placeholder="Box Quantity (pieces per box)" className="w-full p-3 sm:p-4 text-base sm:text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                value={formData.boxQuantity || ''} onChange={(e) => setFormData({...formData, boxQuantity: parseInt(e.target.value) || 0})} />
              <select className="w-full p-3 sm:p-4 text-base sm:text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                value={formData.color || ''} onChange={(e) => setFormData({...formData, color: e.target.value})}>
                <option value="">Select Color*</option>
                {colors.map(color => <option key={color} value={color}>{color}</option>)}
              </select>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={saveItem} disabled={loading} className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium text-base sm:text-lg">
                {loading ? 'Saving...' : 'Save Item'}
              </button>
              <button onClick={() => {
                setShowModal('');
                setFormData({});
                setScannedCode('');
              }} className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-400 font-medium text-base sm:text-lg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal === 'checkinout' && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8">
            <div className="text-center mb-6">
              <h3 className="text-xl sm:text-2xl font-bold mb-2">{formData.description}</h3>
              <p className="text-gray-600 text-sm sm:text-base">Item: <span className="font-mono">{formData.itemNumber}</span></p>
              <p className="text-gray-600 text-sm sm:text-base">QR: <span className="font-mono">{formData.qrCode}</span></p>
              <div className="mt-4 bg-gray-100 rounded-xl p-4">
                <p className="text-sm text-gray-600">Current Quantity</p>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900">{formData.quantity}</p>
                {formData.boxQuantity && (
                  <p className="text-sm text-gray-600 mt-1">
                    {Math.floor(formData.quantity / formData.boxQuantity)} boxes + {formData.quantity % formData.boxQuantity} pieces
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mb-6">
              <button onClick={() => setFormData({...formData, type: 'in'})} 
                className={`flex-1 py-3 sm:py-4 rounded-xl flex items-center justify-center text-base sm:text-lg font-medium transition-all ${
                  formData.type === 'in' ? 'bg-green-600 text-white shadow-lg transform scale-105' : 'bg-gray-100 hover:bg-gray-200'
                }`}>
                <Plus className="w-5 sm:w-6 h-5 sm:h-6 mr-2" />Check In
              </button>
              <button onClick={() => setFormData({...formData, type: 'out'})}
                className={`flex-1 py-3 sm:py-4 rounded-xl flex items-center justify-center text-base sm:text-lg font-medium transition-all ${
                  formData.type === 'out' ? 'bg-red-600 text-white shadow-lg transform scale-105' : 'bg-gray-100 hover:bg-gray-200'
                }`}>
                <Minus className="w-5 sm:w-6 h-5 sm:h-6 mr-2" />Check Out
              </button>
            </div>
            
            {formData.type && (
              <>
                <input 
                  type="number" 
                  min="1" 
                  placeholder={`Enter quantity to ${formData.type === 'in' ? 'add' : 'remove'}`}
                  className="w-full p-3 sm:p-4 text-base sm:text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 mb-6"
                  onChange={(e) => setFormData({...formData, qty: e.target.value})}
                  autoFocus
                />
                <div className="flex gap-3">
                  <button onClick={() => updateInventory(formData.type, formData.qty)} disabled={loading}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium text-base sm:text-lg">
                    {loading ? 'Updating...' : 'Confirm'}
                  </button>
                  <button onClick={() => {
                    setShowModal('');
                    setFormData({});
                    setScannedCode('');
                  }} className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-400 font-medium text-base sm:text-lg">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;