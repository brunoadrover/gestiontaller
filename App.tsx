
import React, { useState, useEffect } from 'react';
import { ClipboardList, Database, LayoutDashboard, LogOut, AlertTriangle, Clock, Settings, Save, Loader2, X } from 'lucide-react';
import TrackingView from './components/TrackingView';
import HistoryView from './components/HistoryView';
import EquipmentView from './components/EquipmentView';
import DashboardView from './components/DashboardView';
import OvertimeView from './components/OvertimeView';
import Login from './components/Login';
import { Equipment, MaintenanceEntry, ViewType, Configuracion } from './types';
import { supabase } from './supabase';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('tracking');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [config, setConfig] = useState<Configuracion | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Configuracion form fields
  const [formConfigVisible, setFormConfigVisible] = useState(true);
  const [formConfigTitulo, setFormConfigTitulo] = useState('PLANIFICACION DE JORNADA EXTRAORDINARIA');
  const [formConfigSugerencia, setFormConfigSugerencia] = useState('');

  // Función para obtener TODOS los registros saltando el límite de 1000 de Supabase
  const fetchAllFromTable = async (tableName: string) => {
    let allData: any[] = [];
    let from = 0;
    let to = 999;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order('id')
        .range(from, to);

      if (error) throw error;
      if (data && data.length > 0) {
        allData = [...allData, ...data];
        if (data.length < 1000) {
          hasMore = false;
        } else {
          from += 1000;
          to += 1000;
        }
      } else {
        hasMore = false;
      }
    }
    return allData;
  };

  const fetchData = async () => {
    try {
      setIsLoaded(false);
      setError(null);
      
      // Cargamos la flota completa usando recursión
      const fullEquipmentList = await fetchAllFromTable('equipos');
      setEquipment(fullEquipmentList);

      // Cargamos los ingresos incluyendo informe_taller
      const { data: entData, error: entError } = await supabase
        .from('ingresos_taller')
        .select('*, acciones_taller(*), informe_taller(*)')
        .order('fecha_ingreso', { ascending: false })
        .limit(5000);
        
      if (entError) throw entError;
      
      const normalizedEntries = (entData || []).map(entry => ({
        ...entry,
        estado: entry.estado || 'REPARACION'
      }));
      
      setEntries(normalizedEntries);

    } catch (err: any) {
      console.error("Error crítico de Supabase:", err);
      setError(err.message || "No se pudo conectar con Supabase. Verifique las tablas y la clave API.");
    } finally {
      setIsLoaded(true);
    }
  };

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase.from('configuracion').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        const c = data[0];
        setConfig(c);
        setFormConfigVisible(c.visible !== false); // default to true if undefined
        setFormConfigTitulo(c.titulo || 'PLANIFICACION DE JORNADA EXTRAORDINARIA');
        setFormConfigSugerencia(c.sugerencia || '');
      } else {
        // Try to insert a default configurations row with a static UUID key
        const defaultConf = {
          id: '00000000-0000-0000-0000-000000000001',
          visible: true,
          titulo: 'PLANIFICACION DE JORNADA EXTRAORDINARIA',
          sugerencia: ''
        };
        const { data: inserted, error: insertError } = await supabase
          .from('configuracion')
          .insert([defaultConf])
          .select();
        
        if (!insertError && inserted && inserted.length > 0) {
          const c = inserted[0];
          setConfig(c);
          setFormConfigVisible(c.visible);
          setFormConfigTitulo(c.titulo);
          setFormConfigSugerencia(c.sugerencia);
        } else {
          // Local fallback
          setConfig({ id: '00000000-0000-0000-0000-000000000001', visible: true, titulo: 'PLANIFICACION DE JORNADA EXTRAORDINARIA', sugerencia: '' });
        }
      }
    } catch (err) {
      console.error("Error reading config table:", err);
      setConfig({ id: '00000000-0000-0000-0000-000000000001', visible: true, titulo: 'PLANIFICACION DE JORNADA EXTRAORDINARIA', sugerencia: '' });
    }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const payload: any = {
        id: config?.id || '00000000-0000-0000-0000-000000000001',
        visible: formConfigVisible,
        titulo: formConfigTitulo.trim(),
        sugerencia: formConfigSugerencia.trim()
      };

      const { data, error } = await supabase
        .from('configuracion')
        .upsert(payload)
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        setConfig(data[0]);
      } else {
        await fetchConfig();
      }

      // If hidden and active view was overtime, redirect to tracking view
      if (!formConfigVisible && activeView === 'overtime') {
        setActiveView('tracking');
      }

      setShowSettingsModal(false);
    } catch (err: any) {
      console.error("Error saving configuracion table:", err);
      alert("Error al guardar la configuración: " + (err.message || err.toString()));
    } finally {
      setIsSavingConfig(false);
    }
  };

  useEffect(() => {
    const authStatus = localStorage.getItem('taller_auth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
    fetchData();
    fetchConfig();
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
      case 'history':
        return <HistoryView entries={entries} refreshData={fetchData} equipment={equipment} />;
      case 'equipment':
        return <EquipmentView equipment={equipment} refreshData={fetchData} />;
      case 'dashboard':
        return <DashboardView entries={entries} equipment={equipment} />;
      case 'overtime':
        return <OvertimeView customTitle={config?.titulo} customSugerencia={config?.sugerencia} />;
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
                onClick={() => setActiveView('history')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-xs font-bold uppercase tracking-wider ${activeView === 'history' ? 'bg-green-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              >
                <ClipboardList className="w-4 h-4" />
                <span className="hidden sm:inline">Historial/Operativos</span>
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
              {(config?.visible !== false) && (
                <button 
                  onClick={() => setActiveView('overtime')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-xs font-bold uppercase tracking-wider ${activeView === 'overtime' ? 'bg-green-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                >
                  <Clock className="w-4 h-4" />
                  <span className="hidden sm:inline">Horas Extra</span>
                </button>
              )}
            </nav>
            <button 
              onClick={() => {
                setFormConfigVisible(config?.visible !== false);
                setFormConfigTitulo(config?.titulo || 'PLANIFICACION DE JORNADA EXTRAORDINARIA');
                setFormConfigSugerencia(config?.sugerencia || '');
                setShowSettingsModal(true);
              }}
              className="p-2.5 text-slate-400 hover:text-green-400 hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-800"
              title="Configuración del Sistema"
            >
              <Settings className="w-5 h-5" />
            </button>
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
              <p className="text-lg font-black uppercase tracking-tighter">Error de Configuración</p>
              <p className="text-sm opacity-80 mt-1 font-medium italic">{error}</p>
              <div className="mt-4 p-3 bg-white/50 rounded text-[10px] text-left">
                <strong>Sincronización de Datos</strong>
                <p className="mt-1">Si no encuentra un equipo, asegúrese de que esté cargado en la pestaña 'Equipos (DB)'. Se están procesando bloques de 1000 registros para mayor seguridad.</p>
              </div>
              <div className="mt-6 flex gap-4 justify-center">
                <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg">Reiniciar App</button>
                <button onClick={fetchData} className="px-6 py-2 bg-white text-red-600 border border-red-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-50 transition-all">Reintentar Sincro</button>
              </div>
            </div>
          </div>
        )}

        {!isLoaded && !error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Descargando flota completa ({equipment.length} equipos)...</p>
          </div>
        ) : (!error && renderView())}
      </main>

      <footer className="bg-white border-t py-4 text-center text-slate-400 text-[10px] uppercase font-black tracking-[0.3em]">
        GEyT - SISTEMA DE GESTIÓN INTEGRAL &copy; {new Date().getFullYear()}
      </footer>

      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 rounded-xl text-green-400">
                  <Settings className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">Parámetros del Sistema</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Control de Visibilidad y PDF</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Form */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-slate-700">
              {/* Visible Toggle */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-wide">Pestaña "Horas Extra"</p>
                  <p className="text-[10.5px] text-slate-400 font-medium mt-0.5">Habilitar o deshabilitar la pestaña del panel de horas extras para el personal.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={formConfigVisible}
                    onChange={(e) => setFormConfigVisible(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#008000]"></div>
                </label>
              </div>

              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-sans">Título Planilla PDF</label>
                <input 
                  type="text" 
                  value={formConfigTitulo} 
                  onChange={(e) => setFormConfigTitulo(e.target.value)}
                  placeholder="Ej. PLANIFICACION DE JORNADA EXTRAORDINARIA"
                  className="w-full px-4 py-3 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#008000] focus:border-transparent transition-all shadow-sm"
                />
              </div>

              {/* Footer text footnote suggestions/advice */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-sans">Sugerencia / Nota al Pie (PDF)</label>
                <textarea 
                  value={formConfigSugerencia}
                  onChange={(e) => setFormConfigSugerencia(e.target.value)}
                  placeholder="Escriba alguna directiva, nota de seguridad o sugerencia de asistencia que se imprimirá al final de la planilla PDF..."
                  rows={4}
                  className="w-full px-4 py-3 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#008000] focus:border-transparent transition-all shadow-sm resize-none"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3 font-sans">
              <button 
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                disabled={isSavingConfig}
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleSaveConfig}
                className="px-5 py-2.5 bg-[#008000] hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-md shadow-green-900/10"
                disabled={isSavingConfig}
              >
                {isSavingConfig ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
