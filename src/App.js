import React, { useState, useEffect } from 'react';
import { Package, Scan, Plus, Minus, Building2, FileSpreadsheet, Camera, LogOut, CheckCircle, XCircle, ClipboardList, User, UserPlus, ChevronRight, AlertCircle } from 'lucide-react';
import { airtableService } from './services/airtable';
import { Html5QrcodeScanner } from "html5-qrcode";
import './App.css';

function App() {
  const [userRole, setUserRole] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState('');
  const [formData, setFormData] = useState({});
  const [scannedCode, setScannedCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [currentView, setCurrentView] = useState('scanner');
  const [packoutSheets, setPackoutSheets] = useState([]);
  const [selectedPackout, setSelectedPackout] = useState(null);

  const roles = ['PM', 'GM', 'Chop Driver', 'Lead Installer'];
  const colors = ['White', 'Brown', 'Coal Gray', 'Musket Brown', 'Eggshell', 'Wicker', 'Cream', 'Clay', 'Tan', 'Terratone', 'Ivory', 'Light Gray', 'Red', 'Green'];
  
  const packoutItems = [
    'A Elbows', 'B Elbows', 'C Elbows', 'Downspout', 'Downspout Elbows',
    'Fascia', 'J-Channel', 'Starter Strip', 'Corner Post',
    'Window Trim', 'Door Trim', 'Soffit', 'F-Channel',
    'Drip Cap', 'Utility Trim', 'Undersill Trim'
  ];

  // Load warehouses on mount
  useEffect(() => {
    loadWarehouses();
  }, []);

  // Load users when role is selected
  useEffect(() => {
    if (userRole) {
      loadUsers();
    }
  }, [userRole]);

  // Load packout sheets when view changes
  useEffect(() => {
    if (currentView === 'packout' && warehouse) {
      loadPackoutSheets();
    }
  }, [currentView, warehouse]);

  const loadWarehouses = async () => {
    try {
      const warehouseList = await airtableService.getWarehouses();
      setWarehouses(warehouseList);
    } catch (error) {
      console.error('Error loading warehouses:', error);
      setWarehouses(['Main Warehouse']);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const userList = await airtableService.getUsers(userRole);
      setUsers(userList);
      if (userList.length === 0) {
        setShowModal('createUser');
      } else {
        setShowModal('selectUser');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      setShowModal('createUser');
    }
    setLoading(false);
  };

  const loadPackoutSheets = async () => {
    setLoading(true);
    try {
      let sheets = [];
      if (userRole === 'Chop Driver') {
        // Show pending and completed sheets
        const pending = await airtableService.getPackoutSheets('pending_installer', warehouse);
        const completed = await airtableService.getPackoutSheets('completed', warehouse);
        sheets = [...pending, ...completed];
      } else if (userRole === 'Lead Installer') {
        // Show only pending installer sheets
        sheets = await airtableService.getPackoutSheets('pending_installer', warehouse);
      } else {
        // GM and PM see all
        sheets = await airtableService.getPackoutSheets(null, warehouse);
      }
      setPackoutSheets(sheets);
    } catch (error) {
      console.error('Error loading packout sheets:', error);
    }
    setLoading(false);
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
        setFormData({ qrCode: code, itemNumber: '', description: '', quantity: 0, color: '', warehouse, boxQuantity: 12 });
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
        lastUpdatedBy: selectedUser.name
      });
      
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
      await airtableService.updateItemQuantity(formData.id, newQuantity, selectedUser.name);
      
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

  // User Selection Modal
  const UserSelectionModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center mb-4">
          <User className="w-6 h-6 text-blue-600 mr-2" />
          <h3 className="text-xl font-bold">Select User</h3>
        </div>
        <div className="space-y-2 mb-4">
          {users.map(user => (
            <button
              key={user.id}
              onClick={() => {
                setSelectedUser(user);
                setShowModal('');
              }}
              className="w-full p-3 text-left border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-gray-500">{user.role}</p>
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowModal('createUser')}
          className="w-full p-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center"
        >
          <UserPlus className="w-5 h-5 mr-2" />
          Add New User
        </button>
      </div>
    </div>
  );

  // Create User Modal
  const CreateUserModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center mb-4">
          <UserPlus className="w-6 h-6 text-blue-600 mr-2" />
          <h3 className="text-xl font-bold">Add New User</h3>
        </div>
        <input
          type="text"
          placeholder="Enter full name"
          value={formData.newUserName || ''}
          onChange={(e) => setFormData({...formData, newUserName: e.target.value})}
          className="w-full p-3 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 mb-4"
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={async () => {
              if (formData.newUserName) {
                try {
                  await airtableService.createUser({
                    name: formData.newUserName,
                    role: userRole
                  });
                  setFormData({});
                  loadUsers();
                } catch (error) {
                  alert('Error creating user');
                }
              }
            }}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 font-medium"
          >
            Create User
          </button>
          <button
            onClick={() => {
              setShowModal(users.length > 0 ? 'selectUser' : '');
              setFormData({});
            }}
            className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-400 font-medium"
          >
            Cancel
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

  // Packout Creation Modal
  const PackoutCreationModal = () => {
    const [step, setStep] = useState(1);
    const [packoutData, setPackoutData] = useState({
      jobNumber: '',
      customerName: '',
      jobColor: '',
      items: packoutItems.map(item => ({ itemName: item, quantity: 0 }))
    });

    const createPackout = async () => {
      setLoading(true);
      try {
        await airtableService.createPackoutSheet({
          ...packoutData,
          warehouse,
          createdBy: selectedUser.name
        });
        setShowModal('');
        loadPackoutSheets();
        alert('Packout sheet created successfully!');
      } catch (error) {
        console.error('Error creating packout:', error);
        alert('Error creating packout sheet');
      }
      setLoading(false);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
          <h3 className="text-2xl font-bold mb-6">Create Packout Sheet</h3>
          
          {step === 1 && (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Number</label>
                  <input
                    type="text"
                    value={packoutData.jobNumber}
                    onChange={(e) => setPackoutData({...packoutData, jobNumber: e.target.value})}
                    className="w-full p-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter job number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Last Name</label>
                  <input
                    type="text"
                    value={packoutData.customerName}
                    onChange={(e) => setPackoutData({...packoutData, customerName: e.target.value})}
                    className="w-full p-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter customer last name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Color</label>
                  <select
                    value={packoutData.jobColor}
                    onChange={(e) => setPackoutData({...packoutData, jobColor: e.target.value})}
                    className="w-full p-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select color</option>
                    {colors.map(color => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    if (packoutData.jobNumber && packoutData.customerName && packoutData.jobColor) {
                      setStep(2);
                    } else {
                      alert('Please fill all fields');
                    }
                  }}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 font-medium"
                >
                  Next
                </button>
                <button
                  onClick={() => setShowModal('')}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-400 font-medium"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
          
          {step === 2 && (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-600">Job: {packoutData.jobNumber} - {packoutData.customerName}</p>
                <p className="text-sm text-gray-600">Color: {packoutData.jobColor}</p>
              </div>
              <div className="space-y-2 mb-6">
                <p className="font-medium">Enter quantities for each item:</p>
                {packoutData.items.map((item, index) => (
                  <div key={item.itemName} className="flex items-center gap-4">
                    <label className="flex-1 text-sm">{item.itemName}</label>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => {
                        const newItems = [...packoutData.items];
                        newItems[index].quantity = parseInt(e.target.value) || 0;
                        setPackoutData({...packoutData, items: newItems});
                      }}
                      className="w-24 p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-xl hover:bg-gray-400 font-medium"
                >
                  Back
                </button>
                <button
                  onClick={createPackout}
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Packout'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Role Selection Screen
  if (!userRole || !selectedUser) {
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
            value={userRole} 
            onChange={(e) => setUserRole(e.target.value)}
          >
            <option value="">Choose your role</option>
            {roles.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <button 
            onClick={() => userRole && loadUsers()}
            disabled={!userRole}
            className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
          >
            Continue
          </button>
        </div>
        
        {showModal === 'selectUser' && <UserSelectionModal />}
        {showModal === 'createUser' && <CreateUserModal />}
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
                  <p className="text-sm sm:text-base text-gray-600">Welcome, {selectedUser.name}</p>
                </div>
              </div>
              <button onClick={() => {
                setUserRole('');
                setSelectedUser(null);
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
          </div>
        </div>
      </div>
    );
  }

  // Main App
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
                <p className="text-xs sm:text-sm text-gray-600">{selectedUser.name} ({userRole})</p>
              </div>
            </div>
            <div className="flex gap-2">
              {(userRole === 'Chop Driver' || userRole === 'Lead Installer' || userRole === 'GM' || userRole === 'PM') && (
                <button
                  onClick={() => setCurrentView(currentView === 'scanner' ? 'packout' : 'scanner')}
                  className={`px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base transition-all ${
                    currentView === 'packout' 
                      ? 'bg-orange-600 text-white hover:bg-orange-700' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
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
        // Packout View
        <div className="max-w-4xl mx-auto p-4 py-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Packout Sheets</h2>
              {userRole === 'Chop Driver' && (
                <button
                  onClick={() => setShowModal('createPackout')}
                  className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 font-medium flex items-center"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  New Packout
                </button>
              )}
            </div>
            
            {loading ? (
              <p className="text-center text-gray-500">Loading packout sheets...</p>
            ) : packoutSheets.length === 0 ? (
              <p className="text-center text-gray-500 py-12">No packout sheets found</p>
            ) : (
              <div className="space-y-4">
                {packoutSheets.map(sheet => (
                  <div
                    key={sheet.id}
                    className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-lg">Job #{sheet.jobNumber} - {sheet.customerName}</p>
                        <p className="text-sm text-gray-600">Color: {sheet.jobColor}</p>
                        <p className="text-sm text-gray-500">Created by {sheet.createdBy} on {new Date(sheet.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          sheet.status === 'pending_installer' ? 'bg-yellow-100 text-yellow-800' :
                          sheet.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {sheet.status === 'pending_installer' ? 'Pending Installer' :
                           sheet.status === 'confirmed' ? 'Confirmed' : 'Completed'}
                        </span>
                        <button
                          onClick={() => setSelectedPackout(sheet)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showModal === 'confirmation' && <ConfirmationModal />}
      {showModal === 'createPackout' && <PackoutCreationModal />}
      
      {/* Item Creation Modal */}
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

      {/* Check In/Out Modal with Fixed Button Highlighting */}
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
                className={`flex-1 py-3 sm:py-4 rounded-xl flex items-center justify-center text-base sm:text-lg font-medium transition-all duration-200 ${
                  formData.type === 'in' 
                    ? 'bg-green-600 text-white shadow-lg transform scale-105 ring-2 ring-green-400' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}>
                <Plus className="w-5 sm:w-6 h-5 sm:h-6 mr-2" />Check In
              </button>
              <button onClick={() => setFormData({...formData, type: 'out'})}
                className={`flex-1 py-3 sm:py-4 rounded-xl flex items-center justify-center text-base sm:text-lg font-medium transition-all duration-200 ${
                  formData.type === 'out' 
                    ? 'bg-red-600 text-white shadow-lg transform scale-105 ring-2 ring-red-400' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
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