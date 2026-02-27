import { useState, useEffect } from 'react';
import { USERS, INITIAL_INVENTORY } from './constants';
import { Warehouse } from 'lucide-react';
import type { User, InventoryItem, LogEntry } from './types';
import { LogAction } from './types';
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(USERS[0]);
  // --- State with LocalStorage Persistence ---
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    try {
      const savedInventory = localStorage.getItem('nirocheck-inventory');
      return savedInventory ? JSON.parse(savedInventory) : INITIAL_INVENTORY;
    } catch (error) {
      console.error("Error al cargar el inventario desde localStorage", error);
      return INITIAL_INVENTORY;
    }
  });

  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const savedLogs = localStorage.getItem('nirocheck-logs');
      return savedLogs ? JSON.parse(savedLogs) : [];
    } catch (error) {
      console.error("Error al cargar los registros desde localStorage", error);
      return [];
    }
  });

  // Effect to save inventory to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('nirocheck-inventory', JSON.stringify(inventory));
    } catch (error) {
      console.error("Error al guardar el inventario en localStorage", error);
    }
  }, [inventory]);

  // Effect to save logs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('nirocheck-logs', JSON.stringify(logs));
    } catch (error) {
      console.error("Error al guardar los registros en localStorage", error);
    }
  }, [logs]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [logsToConfirm, setLogsToConfirm] = useState<LogEntry[]>([]);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  // --- State for Real-Time Stock from Google Sheets ---
  const [realTimeStock, setRealTimeStock] = useState<InventoryItem[]>([]);
  const [isStockLoading, setIsStockLoading] = useState(true);
  const [stockError, setStockError] = useState<string | null>(null);
  const [isStockVisible, setIsStockVisible] = useState(false);
  const [currentPatente, setCurrentPatente] = useState('');
  const [patenteModalItem, setPatenteModalItem] = useState<InventoryItem | null>(null);

  const handleAction = (item: InventoryItem, action: LogAction, patenteOverride?: string) => {
    if (!currentUser) {
      alert('Por favor, seleccione un usuario.');
      return;
    }

    // If it's a SALIDA and no patente is provided yet, open the modal
    if (action === LogAction.OUT && !patenteOverride) {
      setPatenteModalItem(item);
      setCurrentPatente('');
      return;
    }

    const patenteToUse = patenteOverride || '';
    const newInventoryQuantity = action === LogAction.IN ? item.quantity + 1 : item.quantity - 1;

    // Update inventory state first
    setInventory(prevInventory =>
      prevInventory.map(invItem =>
        invItem.id === item.id ? { ...invItem, quantity: newInventoryQuantity } : invItem
      )
    );

    // Now, handle the logging with quantity grouping
    const logId = action === LogAction.OUT && patenteToUse 
      ? `log-${item.id}-${currentUser.id}-${action}-${patenteToUse}`
      : `log-${item.id}-${currentUser.id}-${action}`;
      
    const existingLogIndex = logs.findIndex(log => log.id === logId);

    if (existingLogIndex > -1) {
      // Log exists, just update quantity and timestamp
      const updatedLogs = [...logs];
      const existingLog = updatedLogs[existingLogIndex];
      existingLog.quantity += 1;
      existingLog.timestamp = new Date().toISOString();
      setLogs(updatedLogs);
    } else {
      // Log doesn't exist, create a new one
      const newLog: LogEntry = {
        id: logId,
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        userId: currentUser.id,
        userName: currentUser.name,
        action: action,
        timestamp: new Date().toISOString(),
        quantity: 1,
        patente: action === LogAction.OUT ? patenteToUse : undefined,
      };
      setLogs(prevLogs => [newLog, ...prevLogs]);
    }
    
    // Close modal if it was open
    setPatenteModalItem(null);
    setCurrentPatente('');
  };

  const handleInitiateSave = () => {
    if (logs.length === 0) {
      setSaveMessage('No hay nuevos registros para guardar.');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }
    setLogsToConfirm(logs);
    setShowConfirmation(true);
  };

  const executeSaveToSheets = async () => {
    setIsSaving(true);
    setSaveMessage('');
    setShowConfirmation(false);

    try {
      const rawUrl = import.meta.env.VITE_APPS_SCRIPT_WEB_APP_URL;
      const webAppUrl = rawUrl ? rawUrl.trim() : null;
      
      if (!webAppUrl) {
        throw new Error('La URL de Apps Script no está configurada en las variables de entorno.');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // Aumentado a 60 segundos

      const response = await fetch(webAppUrl, {
        method: 'POST',
        mode: 'cors', // Asegurar modo CORS
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ logs: logsToConfirm }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const resultText = await response.text();

      if (!response.ok) {
        throw new Error(`Error de red: ${response.status} - ${response.statusText}. Respuesta: ${resultText}`);
      }

      let result;
      try {
        result = JSON.parse(resultText);
      } catch (e) {
        throw new Error(`Respuesta no válida del servidor: ${resultText}`);
      }

      if (result.success === false) {
        throw new Error(result.message || 'Error no especificado de Google Apps Script.');
      }

      setSaveMessage(result.message || 'Guardado con éxito. El historial y el inventario han sido reiniciados.');
      setLogs([]);
      setInventory(INITIAL_INVENTORY);
      setLogsToConfirm([]);
      fetchRealTimeStock(); // Actualizar el stock de bodega

    } catch (error) {
      console.error('Error al guardar en Google Sheets:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
      setSaveMessage(`Error: ${errorMessage}`);
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(''), 5000);
    }
  };

  const handleInitiateClear = () => {
    if (logs.length === 0) {
      return; // No hay nada que limpiar
    }
    setShowClearConfirmation(true);
  };

  const executeClearLogs = () => {
    setLogs([]);
    setInventory(INITIAL_INVENTORY);
    setShowClearConfirmation(false);
  };

  // --- Function to Fetch Real-Time Stock ---
  const fetchRealTimeStock = async () => {
    setIsStockLoading(true);
    setStockError(null);
    try {
      const rawUrl = import.meta.env.VITE_APPS_SCRIPT_WEB_APP_URL;
      const webAppUrl = rawUrl ? rawUrl.trim() : null;
      
      if (!webAppUrl) {
        throw new Error('La URL de Apps Script no está configurada.');
      }
      // Append a parameter to signal a GET request for inventory
      const getUrl = `${webAppUrl}${webAppUrl.includes('?') ? '&' : '?'}action=getInventory`;
      
      const response = await fetch(getUrl, { 
        method: 'GET',
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`Error de red: ${response.status} - ${response.statusText}`);
      }
      
      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        // The script returns [code, name, quantity], we need to map it
        const formattedData: InventoryItem[] = result.data.map((row: any[], index: number) => ({
          id: index + 1, // Assign a temporary unique ID for React keys
          code: row[0],
          name: row[1],
          quantity: row[2],
        }));
        setRealTimeStock(formattedData);
      } else {
        throw new Error(result.message || 'La respuesta del servidor no tiene el formato esperado.');
      }
    } catch (error) {
      console.error('Error al obtener el stock en tiempo real:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
      setStockError(errorMessage);
    } finally {
      setIsStockLoading(false);
    }
  };

  // Fetch stock when the component mounts
  useEffect(() => {
    fetchRealTimeStock();
  }, []);

 return (
    <div className="bg-blue-50 min-h-screen font-sans text-slate-800">
      <div className="max-w-4xl mx-auto p-4">
        <header className="my-8 text-center relative">
          <h1 className="text-3xl font-bold text-blue-900 tracking-tight">NIROCHECK</h1>
          <p className="text-blue-800 opacity-75 mt-1">Inventario de Asistencia en Ruta</p>
          <button 
            onClick={() => setIsStockVisible(!isStockVisible)}
            className="absolute top-0 right-0 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold flex items-center space-x-2 shadow-sm"
          >
            <Warehouse size={16} />
            <span>Ver Stock de Bodega</span>
          </button>
        </header>

        <main className="space-y-6">
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-blue-900">Usuario Actual</h2>
            <select
              value={currentUser?.id || ''}
              onChange={(e) => {
                const selectedUser = USERS.find(u => u.id === parseInt(e.target.value)) || null;
                setCurrentUser(selectedUser);
              }}
              className="w-full p-3 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {USERS.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>

          {/* Real-Time Stock Modal */}
          {isStockVisible && (
            <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50" onClick={() => setIsStockVisible(false)}>
              <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 w-full max-w-lg relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => setIsStockVisible(false)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">&times;</button>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-blue-900">Stock en Tiempo Real (Sheets)</h2>
              <button
                onClick={fetchRealTimeStock}
                disabled={isStockLoading}
                className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50 text-sm font-semibold"
              >
                {isStockLoading ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>
            {stockError && <p className="text-sm text-center mb-3 p-2 bg-red-100 text-red-800 rounded-md">Error: {stockError}</p>}
            <div className="space-y-3 h-60 overflow-y-auto pr-2">
              {isStockLoading && !stockError && <p className="text-center text-slate-500 py-10">Cargando stock...</p>}
              {!isStockLoading && realTimeStock.length === 0 && !stockError && <p className="text-center text-slate-500 py-10">No se encontró stock.</p>}
              {realTimeStock.map(item => (
                <div key={`realtime-${item.code}`} className="bg-slate-50 p-3 rounded-lg flex items-center justify-between">
                  <span className="font-medium text-slate-800">{item.name}</span>
                  <div className="flex items-center space-x-2">
                    <span className={`text-lg font-bold ${item.quantity > 0 ? 'text-slate-600' : 'text-red-500'}`}>
                      {item.quantity}
                    </span>
                    <span className="text-sm text-slate-500">unidades</span>
                  </div>
                </div>
              ))}
            </div>
            </div>
            </div>
          )}

          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-blue-900">Inventario</h2>
            <div className="space-y-3">
              {inventory.map(item => (
                <div key={item.id} className="bg-blue-50/50 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-grow mb-3 sm:mb-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium text-blue-900">{item.name}</span>
                      {realTimeStock.find(rs => rs.code === item.code) && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold uppercase">
                          Stock Bodega: {realTimeStock.find(rs => rs.code === item.code)?.quantity}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xl font-bold ${item.quantity > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                        {item.quantity}
                      </span>
                      <span className="text-sm text-slate-500">unidades locales</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <div className="flex space-x-2">
                      <button onClick={() => handleAction(item, LogAction.IN)} className="bg-blue-500 text-white px-5 py-2 rounded-lg hover:bg-blue-600 transition-colors font-semibold text-sm">INGRESO</button>
                      <button onClick={() => handleAction(item, LogAction.OUT)} className="bg-slate-200 text-slate-700 px-5 py-2 rounded-lg hover:bg-slate-300 transition-colors font-semibold text-sm">SALIDA</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
              <h2 className="text-xl font-semibold text-blue-900 mb-3 sm:mb-0">Registro de Actividad</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleInitiateClear}
                  disabled={isSaving || logs.length === 0}
                  className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors disabled:bg-slate-400 text-sm font-semibold w-full sm:w-auto"
                >
                  Limpiar Historial
                </button>
                <button
                  onClick={handleInitiateSave}
                  disabled={isSaving || logs.length === 0}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-400 text-sm font-semibold w-full sm:w-auto"
                >
                  {isSaving ? 'Guardando...' : 'Guardar en Sheets'}
                </button>
              </div>
            </div>
            {saveMessage && <p className="text-sm text-center mb-3 p-2 bg-blue-100 text-blue-800 rounded-md">{saveMessage}</p>}
            <div className="space-y-2 h-80 overflow-y-auto pr-2">
              {logs.map(log => (
                <div key={log.id} className="p-3 rounded-md text-sm bg-slate-100">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-700">{log.itemName}</span>
                    <span className="font-bold text-slate-600">x{log.quantity}</span>
                  </div>
                  <p className={`font-bold ${log.action === LogAction.IN ? 'text-blue-600' : 'text-red-600'}`}>
                    {log.action} {log.patente ? ` - Patente: ${log.patente}` : ''}
                  </p>
                  <p className="text-slate-500 text-xs">{log.userName} - {new Date(log.timestamp).toLocaleString('es-CL')}</p>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-center text-slate-400 py-12">
                  <p>No hay actividad registrada.</p>
                </div>
              )}
            </div>
          </div>
        </main>

        {showConfirmation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold text-blue-900 mb-4">Confirmar Envío</h2>
              <p className="text-slate-600 mb-4">Se enviarán los siguientes {logsToConfirm.length} movimientos a Google Sheets:</p>
              <div className="space-y-2 h-48 overflow-y-auto border rounded-lg p-2 bg-slate-50 mb-6">
                {logsToConfirm.map(log => (
                  <div key={log.id} className="text-sm flex justify-between">
                    <div>
                      <span className={`font-semibold ${log.action === LogAction.IN ? 'text-blue-600' : 'text-red-600'}`}>{log.action}: </span>
                      <span className="text-slate-700">{log.itemName}</span>
                      <span className="text-slate-500 text-xs block">
                        ({log.userName}){log.patente ? ` - Patente: ${log.patente}` : ''}
                      </span>
                    </div>
                    <span className="font-bold text-slate-600">x{log.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end space-x-3">
                <button 
                  onClick={() => setShowConfirmation(false)} 
                  className="bg-slate-200 text-slate-700 px-5 py-2 rounded-lg hover:bg-slate-300 transition-colors font-semibold"
                >
                  Cancelar
                </button>
                <button 
                  onClick={executeSaveToSheets} 
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  Confirmar Envío
                </button>
              </div>
            </div>
          </div>
        )}

        {showClearConfirmation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold text-red-800 mb-4">Confirmar Limpieza</h2>
              <p className="text-slate-600 mb-6">¿Estás seguro de que quieres borrar el historial y reiniciar el inventario? Se perderán todos los movimientos no guardados. Esta acción no se puede deshacer.</p>
              <div className="flex justify-end space-x-3">
                <button 
                  onClick={() => setShowClearConfirmation(false)} 
                  className="bg-slate-200 text-slate-700 px-5 py-2 rounded-lg hover:bg-slate-300 transition-colors font-semibold"
                >
                  Cancelar
                </button>
                <button 
                  onClick={executeClearLogs} 
                  className="bg-red-600 text-white px-5 py-2 rounded-lg hover:bg-red-700 transition-colors font-semibold"
                >
                  Sí, Limpiar
                </button>
              </div>
            </div>
          </div>
        )}
        {patenteModalItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold text-blue-900 mb-2">Registrar Salida</h2>
              <p className="text-slate-600 mb-4 text-sm">
                Ingresa la patente del vehículo para: <br/>
                <strong className="text-blue-800">{patenteModalItem.name}</strong>
              </p>
              
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Patente del Vehículo</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="Ej: ABCD-12"
                  value={currentPatente}
                  onChange={(e) => setCurrentPatente(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && currentPatente.trim()) {
                      handleAction(patenteModalItem, LogAction.OUT, currentPatente);
                    }
                  }}
                  className="w-full p-3 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase text-lg font-mono tracking-wider"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button 
                  onClick={() => setPatenteModalItem(null)} 
                  className="bg-slate-200 text-slate-700 px-5 py-2 rounded-lg hover:bg-slate-300 transition-colors font-semibold"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleAction(patenteModalItem, LogAction.OUT, currentPatente)}
                  disabled={!currentPatente.trim()}
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:bg-slate-300"
                >
                  Confirmar Salida
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
