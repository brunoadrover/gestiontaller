
export interface Equipment {
  id: string; // Interno
  tipo: string;
  marca: string;
  modelo: string;
  horas: number;
  valor_nuevo: number;
  demerito: number;
  comentario_general?: string;
}

export interface MaintenanceAction {
  id: string;
  ingreso_id: string;
  descripcion: string;
  fecha_accion: string;
  responsable: string;
}

export interface TechnicalReport {
  id: string;
  ingreso_id: string;
  equipo_id: string;
  motor: string;
  sistema_hidraulico: string;
  sistema_electrico: string;
  sistema_neumatico: string;
  estructura: string;
  cabina: string;
  tren_rodante: string;
  elementos_desgaste: string;
  componentes_especificos: string;
  observaciones: string;
}

export interface MaintenanceEntry {
  id: string;
  equipo_id: string;
  fecha_ingreso: string;
  obra_asignada?: string;
  informe_fallas: string;
  observaciones?: string;
  acciones_taller: MaintenanceAction[]; 
  informe_taller?: TechnicalReport | TechnicalReport[] | null; // Acepta Array u Objeto
  fecha_salida?: string; 
}

export type ViewType = 'tracking' | 'equipment' | 'dashboard';
