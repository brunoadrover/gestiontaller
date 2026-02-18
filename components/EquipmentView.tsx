
import React, { useState, useMemo } from 'react';
import { Equipment } from '../types';
import { Search, Plus, Trash2, Edit2, AlertCircle, X, Check } from 'lucide-react';
import { supabase } from '../supabase';

interface EquipmentViewProps {
  equipment: Equipment[];
  refreshData: () => Promise<void>;
}

const EquipmentView: React.FC<EquipmentViewProps> = ({ equipment, refreshData }) => {
  const [inputText, setInputText] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('');
  
  const [isAdding, setIsAdding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Equipment | null>(null);

  const [newEq, setNewEq] = useState<Equipment>({
    id: '',
    tipo: '',
    marca: '',
    modelo: '',
    horas: 0,
    valor_nuevo: 0,
    demerito: 0.8,
    comentario_general: ''
  });

  // Helper para normalizar texto (quitar acentos, minúsculas, nulos)
  const normalizeText = (text: any) => {
    if (text === null || text === undefined) return '';
    return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };

  const filteredEquipment = useMemo(() => {
    if (!appliedFilter.trim()) return equipment;
    
    const term = normalizeText(appliedFilter);
    
    return equipment.filter(e => 
      normalizeText(e.id).includes(term) ||
      normalizeText(e.marca).includes(term) ||
      normalizeText(e.modelo).includes(term) ||
      normalizeText(e.tipo).includes(term) ||
      normalizeText(e.comentario_general).includes(term)
    );
  }, [equipment, appliedFilter]);

  const displayedEquipment = filteredEquipment.slice(0, 100);
  const totalResults = filteredEquipment.length;

  const handleSearch = () => {
    setAppliedFilter(inputText);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setInputText('');
    setAppliedFilter('');
  };

  const handleAdd = async () => {
    if (!newEq.id) {
      alert("Por favor ingrese un número de Interno.");
      return;
    }
    
    if (equipment.some(e => e.id === newEq.id)) {
      alert("El número de Interno ya existe en la base de datos.");
      return;
    }

    setIsProcessing(true);
    try {
      const payload = {
        id: newEq.id.trim().toUpperCase(),
        tipo: newEq.tipo.trim(),
        marca: newEq.marca.trim(),
        modelo: newEq.modelo.trim(),
        horas: Number(newEq.horas),
        valor_nuevo: Number(newEq.valor_nuevo),
        demerito: Number(newEq.demerito),
        comentario_general: newEq.comentario_general?.trim() || null
      };

      const { error } = await supabase.from('equipos').insert([payload]);
      
      if (error) {
        throw error;
      }

      await refreshData();
      setNewEq({ id: '', tipo: '', marca: '', modelo: '', horas: 0, valor_nuevo: 0, demerito: 0.8, comentario_general: '' });
      setIsAdding(false);
      alert("Equipo guardado exitosamente.");
    } catch (e: any) {
      console.error("Error detallado:", e);
      let msg = "Error al conectar con Supabase.";
      if (e.message === "Failed to fetch") {
        msg = "Error de red (Failed to fetch). Verifique que la API Key sea correcta.";
      } else if (e.message) {
        msg = `Error: ${e.message}`;
      }
      alert(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditStart = (eq: Equipment) => {
    setEditingId(eq.id);
    setEditData({ ...eq });
  };

  const handleEditSave = async () => {
    if (editData && editingId) {
      setIsProcessing(true);
      try {
        const { error } = await supabase.from('equipos').update(editData).eq('id', editingId);
        if (error) throw error;
        await refreshData();
        setEditingId(null);
        setEditData(null);
      } catch (e: any) {
        alert("Error actualizando equipo: " + (e.message || "Error desconocido"));
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirmId) {
      setIsProcessing(true);
      try {
        const { error } = await supabase.from('equipos').delete().eq('id', deleteConfirmId);
        if (error) throw error;
        await refreshData();
        setDeleteConfirmId(null);
      } catch (e: any) {
        alert("Error eliminando equipo: " + (e.message || "Error desconocido"));
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const inputClass = "w-full bg-white text-slate-950 border border-slate-400 rounded p-2 text-sm font-normal focus:ring-2 focus:ring-green-600 outline-none shadow-sm transition-all";
  const inlineInputClass = "w-full p-1.5 bg-white text-slate-950 border-2 border-green-500 rounded text-xs font-normal outline-none shadow-sm focus:ring-1 focus:ring-green-700";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-normal text-slate-800">Base de Datos de Equipos</h2>
          <p className="text-xs text-slate-500 mt-1">
            Total Equipos: {equipment.length} | Mostrando: {displayedEquipment.length} {totalResults > 100 ? `(de ${totalResults} filtrados)` : ''}
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Interno, marca o tipo..."
                className="pl-10 pr-4 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 w-full font-normal text-sm"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              {inputText && (
                <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button 
              onClick={handleSearch}
              className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 shadow-md font-bold text-sm transition-all flex items-center gap-2"
            >
              <Search className="w-4 h-4" /> Buscar
            </button>
          </div>
          <button 
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 shadow-md whitespace-nowrap font-normal text-sm transition-all justify-center md:justify-start"
          >
            {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isAdding ? 'Cancelar' : 'Nuevo Equipo'}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white border-2 border-green-600 p-6 rounded-xl space-y-4 animate-in fade-in zoom-in-95 duration-200 shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-normal text-slate-600 mb-1 uppercase tracking-widest">Interno</label>
              <input type="text" value={newEq.id} onChange={e => setNewEq({...newEq, id: e.target.value.toUpperCase()})} className={inputClass + " uppercase font-normal"} placeholder="E-0000" />
            </div>
            <div>
              <label className="block text-[10px] font-normal text-slate-600 mb-1 uppercase tracking-widest">Tipo</label>
              <input type="text" value={newEq.tipo} onChange={e => setNewEq({...newEq, tipo: e.target.value})} className={inputClass} placeholder="Excavadora..." />
            </div>
            <div>
              <label className="block text-[10px] font-normal text-slate-600 mb-1 uppercase tracking-widest">Marca/Modelo</label>
              <div className="flex gap-1">
                <input type="text" value={newEq.marca} onChange={e => setNewEq({...newEq, marca: e.target.value})} className={inputClass} placeholder="Marca" />
                <input type="text" value={newEq.modelo} onChange={e => setNewEq({...newEq, modelo: e.target.value})} className={inputClass} placeholder="Modelo" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-normal text-slate-600 mb-1 uppercase tracking-widest">Hs / Arrastre</label>
              <input type="number" value={newEq.horas} onChange={e => setNewEq({...newEq, horas: parseInt(e.target.value) || 0})} className={inputClass} />
            </div>
            <div>
              <label className="block text-[10px] font-normal text-slate-600 mb-1 uppercase tracking-widest">Valor Nuevo (USD)</label>
              <input type="number" value={newEq.valor_nuevo} onChange={e => setNewEq({...newEq, valor_nuevo: parseInt(e.target.value) || 0})} className={inputClass} placeholder="Monto USD" />
            </div>
            <div>
              <label className="block text-[10px] font-normal text-slate-600 mb-1 uppercase tracking-widest">Demérito (0-1)</label>
              <input type="number" step="0.01" min="0" max="1" value={newEq.demerito} onChange={e => setNewEq({...newEq, demerito: parseFloat(e.target.value) || 0})} className={inputClass} />
            </div>
          </div>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-[10px] font-normal text-slate-600 mb-1 uppercase tracking-widest">Comentario de Equipo</label>
              <input type="text" value={newEq.comentario_general} onChange={e => setNewEq({...newEq, comentario_general: e.target.value})} className={inputClass + " italic font-normal"} placeholder="Observaciones permanentes del equipo..." />
            </div>
            <button 
              type="button" onClick={handleAdd} disabled={isProcessing}
              className="bg-green-700 text-white px-8 py-2 rounded text-sm font-normal hover:bg-green-800 shadow-xl transition-all h-[42px] uppercase disabled:bg-slate-300"
            >
              {isProcessing ? 'Guardando...' : 'Guardar Equipo'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-slate-100 text-slate-700 text-[11px] font-normal uppercase tracking-widest border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Interno</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Marca / Modelo</th>
                <th className="px-6 py-4 text-right">Hs</th>
                <th className="px-6 py-4 text-right">Valor</th>
                <th className="px-6 py-4 text-center">Dem..</th>
                <th className="px-6 py-4">Observaciones</th>
                <th className="px-6 py-4 w-28 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {displayedEquipment.length > 0 ? (
                displayedEquipment.map(eq => {
                  const isEditing = editingId === eq.id;
                  return (
                    <tr key={eq.id} className={`${isEditing ? 'bg-green-50/50' : 'hover:bg-slate-50'} transition-colors group`}>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editData?.id || ''} 
                            onChange={e => setEditData(p => p ? {...p, id: e.target.value.toUpperCase()} : null)} 
                            className={inlineInputClass + " uppercase font-normal"}
                          />
                        ) : (
                          <span className="font-normal text-green-700 text-base">{eq.id}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isEditing ? <input type="text" value={editData?.tipo || ''} onChange={e => setEditData(p => p ? {...p, tipo: e.target.value} : null)} className={inlineInputClass}/> : <span className="text-slate-600 font-normal">{eq.tipo}</span>}
                      </td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <input type="text" value={editData?.marca || ''} onChange={e => setEditData(p => p ? {...p, marca: e.target.value} : null)} className={inlineInputClass} placeholder="Marca"/>
                            <input type="text" value={editData?.modelo || ''} onChange={e => setEditData(p => p ? {...p, modelo: e.target.value} : null)} className={inlineInputClass} placeholder="Modelo"/>
                          </div>
                        ) : <div className="text-slate-800 font-normal">{eq.marca} <span className="text-slate-500 font-normal">{eq.modelo || '-'}</span></div>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isEditing ? <input type="number" value={editData?.horas || 0} onChange={e => setEditData(p => p ? {...p, horas: parseInt(e.target.value) || 0} : null)} className={inlineInputClass + " text-right"}/> : <span className="tabular-nums text-slate-900 font-normal">{eq.horas.toLocaleString()}</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isEditing ? <input type="number" value={editData?.valor_nuevo || 0} onChange={e => setEditData(p => p ? {...p, valor_nuevo: parseInt(e.target.value) || 0} : null)} className={inlineInputClass + " text-right"}/> : <span className="tabular-nums text-slate-700 font-normal">${(eq.valor_nuevo || 0).toLocaleString()}</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isEditing ? <input type="number" step="0.01" value={editData?.demerito || 0} onChange={e => setEditData(p => p ? {...p, demerito: parseFloat(e.target.value) || 0} : null)} className={inlineInputClass + " text-center"}/> : <span className="tabular-nums text-slate-500 font-normal">{eq.demerito}</span>}
                      </td>
                      <td className="px-6 py-4 text-slate-500 italic text-xs">
                        {isEditing ? <input type="text" value={editData?.comentario_general || ''} onChange={e => setEditData(p => p ? {...p, comentario_general: e.target.value} : null)} className={inlineInputClass}/> : <span className="max-w-xs truncate block font-normal">{eq.comentario_general || '-'}</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {isEditing ? (
                            <>
                              <button onClick={handleEditSave} disabled={isProcessing} className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 shadow-md"><Check className="w-4 h-4" /></button>
                              <button onClick={() => {setEditingId(null); setEditData(null);}} className="bg-slate-200 text-slate-600 p-2 rounded-lg hover:bg-slate-300"><X className="w-4 h-4" /></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => handleEditStart(eq)} className="text-slate-400 hover:text-green-600 transition-all p-1.5 hover:bg-green-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => setDeleteConfirmId(eq.id)} className="text-slate-400 hover:text-red-600 transition-all p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-400 italic">
                    {appliedFilter ? "No se encontraron equipos con ese criterio." : "Utilice el buscador para encontrar un equipo."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center border border-slate-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8" /></div>
            <h3 className="text-lg font-normal text-slate-800 mb-2">¿Eliminar equipo?</h3>
            <p className="text-sm text-slate-500 mb-6 font-normal">Esta acción borrará el interno <span className="font-normal">{deleteConfirmId}</span> de la base de datos.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-normal text-sm">Cancelar</button>
              <button onClick={confirmDelete} disabled={isProcessing} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-normal text-sm shadow-lg disabled:bg-slate-300">{isProcessing ? '...' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentView;
