
import React, { useState } from 'react';
import { Equipment } from '../types';
import { Search, Plus, Trash2, Edit2, AlertCircle, X, MessageSquare } from 'lucide-react';

interface EquipmentViewProps {
  equipment: Equipment[];
  setEquipment: React.Dispatch<React.SetStateAction<Equipment[]>>;
}

const EquipmentView: React.FC<EquipmentViewProps> = ({ equipment, setEquipment }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newEq, setNewEq] = useState<Equipment>({
    id: '',
    type: '',
    brand: '',
    model: '',
    hours: 0,
    valorNuevo: 0,
    demerito: 0.8,
    generalComment: ''
  });

  const filtered = equipment.filter(e => 
    e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = () => {
    if (!newEq.id) return;
    if (equipment.some(e => e.id === newEq.id)) {
      alert("El número de Interno ya existe.");
      return;
    }
    setEquipment(prev => [...prev, newEq]);
    setNewEq({ id: '', type: '', brand: '', model: '', hours: 0, valorNuevo: 0, demerito: 0.8, generalComment: '' });
    setIsAdding(false);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      setEquipment(prev => prev.filter(e => e.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Base de Datos de Equipos</h2>
          <p className="text-slate-500">Administre el catálogo maestro de maquinaria disponible.</p>
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
            <Plus className="w-4 h-4" />
            {isAdding ? 'Cancelar' : 'Nuevo Equipo'}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white border border-green-200 p-6 rounded-xl space-y-4 animate-in fade-in zoom-in-95 duration-200 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase tracking-widest">Interno</label>
              <input 
                type="text" 
                value={newEq.id}
                onChange={e => setNewEq({...newEq, id: e.target.value.toUpperCase()})}
                className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded p-2 text-sm uppercase font-bold focus:bg-white focus:ring-2 focus:ring-green-500 outline-none transition-all"
                placeholder="E-0000"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase tracking-widest">Tipo</label>
              <input 
                type="text" 
                value={newEq.type}
                onChange={e => setNewEq({...newEq, type: e.target.value})}
                className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none"
                placeholder="Excavadora..."
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase tracking-widest">Marca/Modelo</label>
              <div className="flex gap-1">
                <input 
                  type="text" 
                  value={newEq.brand}
                  onChange={e => setNewEq({...newEq, brand: e.target.value})}
                  className="w-1/2 bg-slate-50 text-slate-900 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none"
                  placeholder="Marca"
                />
                <input 
                  type="text" 
                  value={newEq.model}
                  onChange={e => setNewEq({...newEq, model: e.target.value})}
                  className="w-1/2 bg-slate-50 text-slate-900 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none"
                  placeholder="Modelo"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase tracking-widest">Hs / Arrastre</label>
              <input 
                type="number" 
                value={newEq.hours}
                onChange={e => setNewEq({...newEq, hours: parseInt(e.target.value) || 0})}
                className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase tracking-widest">Valor Nuevo (USD)</label>
              <input 
                type="number" 
                value={newEq.valorNuevo}
                onChange={e => setNewEq({...newEq, valorNuevo: parseInt(e.target.value) || 0})}
                className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none"
                placeholder="Monto USD"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase tracking-widest">Demérito (0-1)</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                max="1"
                value={newEq.demerito}
                onChange={e => setNewEq({...newEq, demerito: parseFloat(e.target.value) || 0})}
                className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded p-2 text-sm focus:bg-white outline-none"
              />
            </div>
          </div>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-500 mb-1 uppercase tracking-widest">Comentario de Equipo</label>
              <input 
                type="text" 
                value={newEq.generalComment}
                onChange={e => setNewEq({...newEq, generalComment: e.target.value})}
                className="w-full bg-white text-slate-900 border border-slate-200 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-green-500 italic"
                placeholder="Observaciones permanentes del equipo..."
              />
            </div>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={handleAdd}
                className="bg-green-600 text-white px-6 py-2 rounded text-sm font-bold hover:bg-green-700 shadow-md transition-all h-[38px]"
              >
                Guardar
              </button>
              <button 
                type="button"
                onClick={() => setIsAdding(false)}
                className="bg-slate-100 text-slate-600 px-6 py-2 rounded text-sm font-bold hover:bg-slate-200 transition-all h-[38px]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-slate-100 text-slate-700 text-[11px] font-black uppercase tracking-widest border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Interno</th>
                <th className="px-6 py-4">Tipo de Equipo</th>
                <th className="px-6 py-4">Marca / Modelo</th>
                <th className="px-6 py-4 text-right">Hs / Arrastre</th>
                <th className="px-6 py-4 text-right">Valor Nuevo</th>
                <th className="px-6 py-4 text-center">Demérito</th>
                <th className="px-6 py-4">Observaciones del Equipo</th>
                <th className="px-6 py-4 w-28 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {filtered.map(eq => (
                <tr key={eq.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 font-black text-green-700">{eq.id}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{eq.type}</td>
                  <td className="px-6 py-4 text-slate-800 font-bold">{eq.brand} <span className="text-slate-500 font-normal">{eq.model || '-'}</span></td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-900 font-black">{eq.hours.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-700 font-bold">${(eq.valorNuevo || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-center tabular-nums text-slate-500">{eq.demerito || 0}</td>
                  <td className="px-6 py-4 text-slate-500 italic text-xs max-w-xs truncate">
                    {eq.generalComment || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-3">
                      <button type="button" className="text-slate-400 hover:text-green-600 transition-all p-1.5 hover:bg-green-50 rounded-lg">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setDeleteConfirmId(eq.id)} className="text-slate-400 hover:text-red-600 transition-all p-1.5 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-16 text-center">
            <p className="text-slate-400 italic">No se encontraron equipos en la base de datos.</p>
          </div>
        )}
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
            <div className="p-6 text-center relative">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">¿Eliminar equipo?</h3>
              <p className="text-sm text-slate-500 mb-6">
                Está por eliminar el interno <span className="font-bold text-slate-800">{deleteConfirmId}</span>.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm">Cancelar</button>
                <button onClick={confirmDelete} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-200">Eliminar</button>
              </div>
              <button onClick={() => setDeleteConfirmId(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentView;
