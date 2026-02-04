
import React, { useState, useEffect } from 'react';
import { ClipboardList, Database, LayoutDashboard, LogOut, AlertTriangle } from 'lucide-react';
import TrackingView from './components/TrackingView';
import EquipmentView from './components/EquipmentView';
import DashboardView from './components/DashboardView';
import Login from './components/Login';
import { Equipment, MaintenanceEntry, ViewType } from './types';
import { supabase } from './supabase';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('tracking');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoaded(false);
      setError(null);
      
      // Verificación de conexión básica
      const { data: eqData, error: eqError } = await supabase
        .from('equipos')
        .select('*')
        .order('id');
      
      if (eqError) throw eqError;
      setEquipment(eqData || []);

      const { data: entData, error: entError } = await supabase
        .from('ingresos_taller')
        .select('*, acciones_taller(*)')
        .order('fecha_ingreso', { ascending: false });
        
      if (entError) throw entError;
      setEntries(entData || []);

    } catch (err: any) {
      console.error("Error crítico de Supabase:", err);
      setError(err.message || "No se pudo establecer conexión con el servidor de base de datos.");
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    const authStatus = localStorage.getItem('taller_auth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
    fetchData();
  }, []);

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

  if (!isAuthenticated && isLoaded && !error) {
    return <Login onLogin={handleLogin} />;
  }

  const renderView = () => {
    switch (activeView) {
      case 'tracking':
        return <TrackingView entries={entries} refreshData={fetchData} equipment={equipment} />;
      case 'equipment':
        return <EquipmentView equipment={equipment} refreshData={fetchData} />;
      case 'dashboard':
        return <DashboardView entries={entries} equipment={equipment} />;
      default:
        return <TrackingView entries={entries} refreshData={fetchData} equipment={equipment} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-slate-900 text-white shadow-xl border-b border-green-900/30">
        <div className="container mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div 
              className="bg-[#008000] px-3 py-1 rounded-lg shadow-inner border border-white/20 select-none flex items-center justify-center"
              style={{ fontFamily: '"Times New Roman", Times, serif' }}
            >
              <span className="text-white text-2xl font-bold tracking-tighter">GE<span className="text-xl lowercase">y</span>T</span>
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none uppercase">Gestión de Taller</h1>
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

      <main className="flex-1 container mx-auto px-4 py-6">
        {error && (
          <div className="mb-6 p-6 bg-red-50 border-2 border-red-200 rounded-2xl flex flex-col items-center gap-4 text-red-700 animate-in fade-in slide-in-from-top-2 text-center max-w-xl mx-auto">
            <AlertTriangle className="w-12 h-12 flex-shrink-0" />
            <div>
              <p className="text-lg font-black uppercase tracking-tighter">Fallo de Conexión</p>
              <p className="text-sm opacity-80 mt-1 font-medium italic">{error}</p>
              <p className="text-[10px] mt-2 text-red-500 uppercase font-bold tracking-widest">Verifique su conexión a internet o la configuración del proyecto</p>
              <div className="mt-6 flex gap-4 justify-center">
                <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg">Reiniciar App</button>
                <button onClick={fetchData} className="px-6 py-2 bg-white text-red-600 border border-red-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-50 transition-all">Reintentar</button>
              </div>
            </div>
          </div>
        )}

        {!isLoaded && !error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Sincronizando con Supabase...</p>
          </div>
        ) : (!error && renderView())}
      </main>

      <footer className="bg-white border-t py-4 text-center text-slate-400 text-[10px] uppercase font-black tracking-[0.3em]">
        GEyT - SISTEMA DE GESTIÓN INTEGRAL &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default App;
