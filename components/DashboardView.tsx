
import React, { useMemo } from 'react';
import { MaintenanceEntry, Equipment } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Activity, Clock, Wrench, CheckCircle2, ShoppingCart, Timer, Box, RefreshCw, DollarSign } from 'lucide-react';

interface DashboardViewProps {
  entries: MaintenanceEntry[];
  equipment: Equipment[];
}

const DashboardView: React.FC<DashboardViewProps> = ({ entries, equipment }) => {
  
  const stats = useMemo(() => {
    const totalEntries = entries.length;
    let totalStayDaysAcrossAll = 0;
    let totalLossAll = 0;

    const repuestoKeywords = ['pedido', 'repuesto', 'terceros', 'compra', 'adquisición', 'pendiente', 'insumo', 'falta'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let operativeCount = 0;
    let waitingPartsCount = 0;
    let inRepairCount = 0;
    let currentlyInWorkshop = 0;

    const getDiffDays = (d1: string, d2: string) => {
      const start = new Date(d1 + 'T00:00:00');
      const end = new Date(d2 + 'T00:00:00');
      return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    };
    const todayStr = today.toISOString().split('T')[0];

    entries.forEach(entry => {
      const eq = equipment.find(e => e.id === entry.equipo_id);
      const estado = entry.estado || 'REPARACION';
      const isCurrentlyOperative = estado === 'OPERATIVO';
      
      const stayDays = getDiffDays(entry.fecha_ingreso, isCurrentlyOperative ? (entry.fecha_salida || todayStr) : todayStr);

      totalStayDaysAcrossAll += stayDays;

      if (eq) {
        const entryLoss = (stayDays / 30) * 0.0325 * (eq.demerito || 0.8) * 0.5 * (eq.valor_nuevo || 0);
        totalLossAll += entryLoss;
      }

      if (isCurrentlyOperative) {
        operativeCount++;
      } else {
        currentlyInWorkshop++;
        if (estado === 'COMPRAS') {
          waitingPartsCount++;
        } else {
          inRepairCount++;
        }
      }
    });

    const formatCurrencyUSD = (value: number) => {
      return `USD ${Math.round(value).toLocaleString('de-DE')}`;
    };

    const avgStay = totalEntries > 0 ? (totalStayDaysAcrossAll / totalEntries).toFixed(2) : "0.00";

    const statusData = [
      { name: 'En Reparación', value: inRepairCount },
      { name: 'Esperando Repuestos', value: waitingPartsCount },
      { name: 'Operativos', value: operativeCount },
    ];

    const typeMap: Record<string, number> = {};
    entries.forEach(entry => {
      const eq = equipment.find(e => e.id === entry.equipo_id);
      if (eq) typeMap[eq.tipo] = (typeMap[eq.tipo] || 0) + 1;
    });

    return { 
      totalEntries, currentlyInWorkshop, operativeCount, 
      statusData, avgStay, 
      totalLossFormatted: formatCurrencyUSD(totalLossAll),
      typeData: Object.entries(typeMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 5)
    };
  }, [entries, equipment]);

  const COLORS = ['#3B82F6', '#F59E0B', '#10B981']; 

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Panel de Control (Dashboard)</h2>
        </div>
        <div className="px-3 py-1 bg-green-100 text-green-700 text-[10px] font-black uppercase rounded-full shadow-sm animate-pulse">DB Live</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={<DollarSign className="w-6 h-6 text-red-600" />}
          label="Pérdida Facturación Total"
          value={stats.totalLossFormatted}
          color="bg-red-50"
          desc="Impacto económico estimado por inactividad"
        />
        <StatCard 
          icon={<Timer className="w-6 h-6 text-indigo-500" />}
          label="Estadía Promedio"
          value={`${stats.avgStay} d.`}
          color="bg-indigo-50"
          desc="Σ estadías / total ingresos"
        />
        <StatCard 
          icon={<Wrench className="w-6 h-6 text-blue-500" />}
          label="Equipos en Taller"
          value={stats.currentlyInWorkshop}
          color="bg-blue-50"
          desc="Maquinaria fuera de servicio hoy"
        />
        <StatCard 
          icon={<CheckCircle2 className="w-6 h-6 text-green-500" />}
          label="Operativos"
          value={stats.operativeCount}
          color="bg-green-50"
          desc="Equipos con service finalizado"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold mb-8 text-slate-700 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" /> Distribución de Estados Actuales
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.statusData} cx="50%" cy="45%" innerRadius={70} outerRadius={100} paddingAngle={8} dataKey="value">
                  {stats.statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold mb-8 text-slate-700 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-500" /> Tipos de equipo con más ingresos
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.typeData} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 9, fill: '#64748b', fontWeight: 'bold'}} />
                <Tooltip cursor={{fill: '#f8fafc'}} />
                <Bar dataKey="value" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string; desc: string }> = ({ icon, label, value, color, desc }) => (
  <div className={`p-6 rounded-2xl border border-slate-200 bg-white flex flex-col gap-3 transition-all hover:shadow-xl hover:border-green-300 group`}>
    <div className="flex items-center gap-4">
      <div className={`p-4 rounded-2xl ${color} group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
        <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
      </div>
    </div>
    <div className="mt-2 pt-3 border-t border-slate-50">
      <p className="text-[10px] text-slate-400 font-medium italic">{desc}</p>
    </div>
  </div>
);

export default DashboardView;
