
import React, { useState } from 'react';
import { Equipment } from '../types';
import { Search, Plus, Trash2, Edit2, AlertCircle, X, MessageSquare, Check } from 'lucide-react';
import { supabase } from '../supabase';

interface EquipmentViewProps {
  equipment: Equipment[];
  refreshData: () => Promise<void>;
}

const EquipmentView: React.FC<EquipmentViewProps> = ({ equipment, refreshData }) => {
  const [searchTerm, setSearchTerm] = useState('');
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

  const filtered = equipment.filter(e => 
    e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.tipo.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      // Limpiamos el objeto para asegurar que solo enviamos lo que la tabla espera
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
        msg = "Error de red (Failed to fetch). Verifique que la API Key sea correcta. Las llaves de Supabase suelen empezar con 'eyJ'.";
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

  const inputClass = "w-full bg-white text-slate-950 border border-slate-400 rounded p-2 text-sm font-medium focus:ring-2 focus:ring-green-600 outline-none shadow-sm transition-all";
  const inlineInputClass = "w-full p-1.5 bg-white text-slate-950 border-2 border-green-500 rounded text-xs font-bold outline-none shadow-sm focus:ring-1 focus:ring-green-700";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Base de Datos de Equipos</h2>
          <p className="text-slate-500">Persistencia en tiempo real vía Supabase.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Buscar por interno, marca..."
              className="pl-10 pr-4 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 w-full md:w-64 font-medium text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 shadow-md whitespace-nowrap font-bold text-sm transition-all"
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
              <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-widest">Interno</label>
              <input type="text" value={newEq.id} onChange={e => setNewEq({...newEq, id: e.target.value.toUpperCase()})} className={inputClass + " uppercase font-black"} placeholder="E-0000" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-widest">Tipo</label>
              <input type="text" value={newEq.tipo} onChange={e => setNewEq({...newEq, tipo: e.target.value})} className={inputClass} placeholder="Excavadora..." />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-widest">Marca/Modelo</label>
              <div className="flex gap-1">
                <input type="text" value={newEq.marca} onChange={e => setNewEq({...newEq, marca: e.target.value})} className={inputClass} placeholder="Marca" />
                <input type="text" value={newEq.modelo} onChange={e => setNewEq({...newEq, modelo: e.target.value})} className={inputClass} placeholder="Modelo" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-widest">Hs / Arrastre</label>
              <input type="number" value={newEq.horas} onChange={e => setNewEq({...newEq, horas: parseInt(e.target.value) || 0})} className={inputClass} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-widest">Valor Nuevo (USD)</label>
              <input type="number" value={newEq.valor_nuevo} onChange={e => setNewEq({...newEq, valor_nuevo: parseInt(e.target.value) || 0})} className={inputClass} placeholder="Monto USD" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-widest">Demérito (0-1)</label>
              <input type="number" step="0.01" min="0" max="1" value={newEq.demerito} onChange={e => setNewEq({...newEq, demerito: parseFloat(e.target.value) || 0})} className={inputClass} />
            </div>
          </div>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-widest">Comentario de Equipo</label>
              <input type="text" value={newEq.comentario_general} onChange={e => setNewEq({...newEq, comentario_general: e.target.value})} className={inputClass + " italic"} placeholder="Observaciones permanentes del equipo..." />
            </div>
            <button 
              type="button" onClick={handleAdd} disabled={isProcessing}
              className="bg-green-700 text-white px-8 py-2 rounded text-sm font-black hover:bg-green-800 shadow-xl transition-all h-[42px] uppercase disabled:bg-slate-300"
            >
              {isProcessing ? 'Guardando...' : 'Guardar Equipo'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-slate-100 text-slate-700 text-[11px] font-black uppercase tracking-widest border-b border-slate-200">
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
              {filtered.map(eq => {
                const isEditing = editingId === eq.id;
                return (
                  <tr key={eq.id} className={`${isEditing ? 'bg-green-50/50' : 'hover:bg-slate-50'} transition-colors group`}>
                    <td className="px-6 py-4 font-black text-green-700 text-base">{eq.id}</td>
                    <td className="px-6 py-4">
                      {isEditing ? <input type="text" value={editData?.tipo || ''} onChange={e => setEditData(p => p ? {...p, tipo: e.target.value} : null)} className={inlineInputClass}/> : <span className="text-slate-600 font-medium">{eq.tipo}</span>}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <input type="text" value={editData?.marca || ''} onChange={e => setEditData(p => p ? {...p, marca: e.target.value} : null)} className={inlineInputClass} placeholder="Marca"/>
                          <input type="text" value={editData?.modelo || ''} onChange={e => setEditData(p => p ? {...p, modelo: e.target.value} : null)} className={inlineInputClass} placeholder="Modelo"/>
                        </div>
                      ) : <div className="text-slate-800 font-bold">{eq.marca} <span className="text-slate-500 font-normal">{eq.modelo || '-'}</span></div>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isEditing ? <input type="number" value={editData?.horas || 0} onChange={e => setEditData(p => p ? {...p, horas: parseInt(e.target.value) || 0} : null)} className={inlineInputClass + " text-right"}/> : <span className="tabular-nums text-slate-900 font-black">{eq.horas.toLocaleString()}</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isEditing ? <input type="number" value={editData?.valor_nuevo || 0} onChange={e => setEditData(p => p ? {...p, valor_nuevo: parseInt(e.target.value) || 0} : null)} className={inlineInputClass + " text-right"}/> : <span className="tabular-nums text-slate-700 font-bold">${(eq.valor_nuevo || 0).toLocaleString()}</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isEditing ? <input type="number" step="0.01" value={editData?.demerito || 0} onChange={e => setEditData(p => p ? {...p, demerito: parseFloat(e.target.value) || 0} : null)} className={inlineInputClass + " text-center"}/> : <span className="tabular-nums text-slate-500">{eq.demerito}</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-500 italic text-xs">
                      {isEditing ? <input type="text" value={editData?.comentario_general || ''} onChange={e => setEditData(p => p ? {...p, comentario_general: e.target.value} : null)} className={inlineInputClass}/> : <span className="max-w-xs truncate block">{eq.comentario_general || '-'}</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {isEditing ? (
                          <>
                            <button onClick={handleEditSave} disabled={isProcessing} className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 shadow-md"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="bg-slate-200 text-slate-600 p-2 rounded-lg hover:bg-slate-300"><X className="w-4 h-4" /></button>
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
              })}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center border border-slate-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8" /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">¿Eliminar equipo?</h3>
            <p className="text-sm text-slate-500 mb-6">Esta acción borrará el interno <span className="font-bold">{deleteConfirmId}</span> de la base de datos.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm">Cancelar</button>
              <button onClick={confirmDelete} disabled={isProcessing} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg disabled:bg-slate-300">{isProcessing ? '...' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentView;
