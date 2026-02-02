
import React, { useState, useEffect } from 'react';
import { Layout, ClipboardList, Database, LayoutDashboard, LogOut } from 'lucide-react';
import TrackingView from './components/TrackingView';
import EquipmentView from './components/EquipmentView';
import DashboardView from './components/DashboardView';
import Login from './components/Login';
import { Equipment, MaintenanceEntry, ViewType } from './types';
import { INITIAL_EQUIPMENT, INITIAL_ENTRIES } from './constants';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('tracking');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load data from localStorage or initial constants
  useEffect(() => {
    const savedEq = localStorage.getItem('taller_equipment');
    const savedEntries = localStorage.getItem('taller_entries');
    const authStatus = localStorage.getItem('taller_auth');
    
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }

    if (savedEq) setEquipment(JSON.parse(savedEq));
    else setEquipment(INITIAL_EQUIPMENT);

    if (savedEntries) setEntries(JSON.parse(savedEntries));
    else setEntries(INITIAL_ENTRIES);
    
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('taller_equipment', JSON.stringify(equipment));
      localStorage.setItem('taller_entries', JSON.stringify(entries));
    }
  }, [equipment, entries, isLoaded]);

  const handleLogin = (password: string) => {
    if (password === 'taller2026') {
      setIsAuthenticated(true);
      localStorage.setItem('taller_auth', 'true');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('taller_auth');
  };

  if (!isAuthenticated && isLoaded) {
    return <Login onLogin={handleLogin} />;
  }

  const renderView = () => {
    switch (activeView) {
      case 'tracking':
        return <TrackingView entries={entries} setEntries={setEntries} equipment={equipment} />;
      case 'equipment':
        return <EquipmentView equipment={equipment} setEquipment={setEquipment} />;
      case 'dashboard':
        return <DashboardView entries={entries} equipment={equipment} />;
      default:
        return <TrackingView entries={entries} setEntries={setEntries} equipment={equipment} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-slate-800 text-white shadow-md">
        <div className="container mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Layout className="w-8 h-8 text-blue-400" />
            <h1 className="text-xl font-bold tracking-tight">Gestión de Taller <span className="text-blue-400">| Historial</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex gap-1 bg-slate-900 p-1 rounded-lg">
              <button 
                onClick={() => setActiveView('tracking')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${activeView === 'tracking' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <ClipboardList className="w-4 h-4" />
                <span className="hidden sm:inline">Seguimiento</span>
              </button>
              <button 
                onClick={() => setActiveView('equipment')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${activeView === 'equipment' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <Database className="w-4 h-4" />
                <span className="hidden sm:inline">Equipos (DB)</span>
              </button>
              <button 
                onClick={() => setActiveView('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${activeView === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
            </nav>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-all"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {!isLoaded ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : renderView()}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-4 text-center text-slate-500 text-[10px] uppercase font-bold tracking-widest">
        Sistema de Seguimiento de Taller - Flota Pesada &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default App;
