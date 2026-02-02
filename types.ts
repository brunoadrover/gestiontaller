
export interface Equipment {
  id: string; // Interno
  type: string; // Tipo
  brand: string; // Marca
  model: string; // Modelo
  hours: number; // Hs
}

export interface MaintenanceAction {
  id: string;
  description: string;
  date: string;
  performedBy: string; // Realizado por
}

export interface MaintenanceEntry {
  id: string;
  equipmentId: string;
  entryDate: string;
  preliminaryInfo: string;
  actions: MaintenanceAction[];
  comment?: string; // Observaciones generales del ingreso
}

export type ViewType = 'tracking' | 'equipment' | 'dashboard';
