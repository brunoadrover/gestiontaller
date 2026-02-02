
import React, { useState, useEffect } from 'react';
import { ClipboardList, Database, LayoutDashboard, LogOut } from 'lucide-react';
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
      <header className="bg-slate-900 text-white shadow-xl border-b border-green-900/30">
        <div className="container mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            {/* Isologo Header GEyT con Times New Roman */}
            <div 
              className="bg-[#008000] px-3 py-1 rounded-lg shadow-inner border border-white/20 select-none flex items-center justify-center"
              style={{ fontFamily: '"Times New Roman", Times, serif' }}
            >
              <span className="text-white text-2xl font-bold tracking-tighter">GE<span className="text-xl lowercase">y</span>T</span>
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none uppercase">Gestión de Taller</h1>
              <p className="text-[10px] text-green-400 font-bold tracking-[0.2em] uppercase">Control de Historial</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex gap-1 bg-slate-800 p-1 rounded-xl">
              <button 
                onClick={() => setActiveView('tracking')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-xs font-bold uppercase tracking-wider ${activeView === 'tracking' ? 'bg-green-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              >
                <ClipboardList className="w-4 h-4" />
                <span className="hidden sm:inline">Seguimiento</span>
              </button>
              <button 
                onClick={() => setActiveView('equipment')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-xs font-bold uppercase tracking-wider ${activeView === 'equipment' ? 'bg-green-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              >
                <Database className="w-4 h-4" />
                <span className="hidden sm:inline">Equipos (DB)</span>
              </button>
              <button 
                onClick={() => setActiveView('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-xs font-bold uppercase tracking-wider ${activeView === 'dashboard' ? 'bg-green-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
            </nav>
            <button 
              onClick={handleLogout}
              className="p-2.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-red-900/30"
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        ) : renderView()}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-4 text-center text-slate-400 text-[10px] uppercase font-black tracking-[0.3em]">
        GEyT - Sistema de Seguimiento de Taller &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default App;
