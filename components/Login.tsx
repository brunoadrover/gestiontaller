
import React, { useState } from 'react';
import { Lock, AlertCircle, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLogin: (password: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'taller2026') {
      onLogin(password);
    } else {
      setError(true);
      setTimeout(() => setError(false), 500); // Reset shake animation
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="max-w-md w-full">
        {/* Isologo GEyT en Times New Roman */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div 
            className="inline-flex items-center justify-center bg-[#008000] px-8 py-4 rounded-xl shadow-2xl shadow-green-900/40 border-4 border-white/10 mb-6 select-none"
            style={{ fontFamily: '"Times New Roman", Times, serif' }}
          >
            <span className="text-white text-7xl font-bold tracking-tight">GE<span className="text-5xl lowercase">y</span>T</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-[0.3em] uppercase opacity-90">GESTIÓN DE TALLER</h1>
        </div>

        {/* Login Card */}
        <div className={`bg-white rounded-3xl p-8 shadow-2xl border border-slate-200 transition-all duration-300 ${error ? 'animate-shake border-red-500' : ''}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Acceso Restringido</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Contraseña del Sistema</label>
              <input 
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full bg-slate-50 border ${error ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-200 focus:ring-4 focus:ring-green-50'} rounded-2xl px-5 py-4 text-slate-900 outline-none transition-all font-mono text-lg`}
              />
              {error && (
                <div className="flex items-center gap-2 mt-3 text-red-500 text-sm font-bold animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>Contraseña incorrecta. Reintente.</span>
                </div>
              )}
            </div>

            <button 
              type="submit"
              className="w-full bg-green-700 hover:bg-green-800 text-white font-black py-4 rounded-2xl shadow-xl shadow-green-900/20 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              INGRESAR AL PANEL
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
          
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Área de Mantenimiento - v2.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
