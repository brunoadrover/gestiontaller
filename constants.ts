
import { Equipment, MaintenanceEntry } from './types';

export const INITIAL_EQUIPMENT: Equipment[] = [
  // Serie A (Acoplados y Tanques)
  { id: 'A0001', type: 'ACOPLADO TANQUE AGUA/REGADOR DE TIRO 10 ≥ 25 m3', brand: 'NICAR', model: '-', hours: 0, valorNuevo: 45000, demerito: 0.8 },
  { id: 'A0007', type: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', brand: 'PRATTI FRUENHAUF', model: 'TC-SP6011', hours: 0, valorNuevo: 55000, demerito: 0.75 },
  { id: 'A0021', type: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', brand: 'v0704', model: 'SA 16/20', hours: 0, valorNuevo: 55000, demerito: 0.7 },
  { id: 'A0053', type: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', brand: 'HELVETICA - FERRONI', model: 'SA 20/25 TT', hours: 0, valorNuevo: 60000, demerito: 0.65 },
  
  // Serie E (Equipos Pesados y Plantas)
  { id: 'E0206', type: 'DISTRIBUIDOR DE AGR. PETREOS ARR.', brand: 'MICHELINI', model: 'FM/375', hours: 98, valorNuevo: 85000, demerito: 0.9 },
  { id: 'E0306', type: 'PLANTA CLASIFICADORA DE ARIDOS < 200 Tn/h', brand: 'FERRONI', model: 'PC-200', hours: 18243, valorNuevo: 450000, demerito: 0.85 },
  { id: 'E0307', type: 'PLANTA MEZCLADORA P/SUELO ESTAB. < 200 Tn/h', brand: 'FERRONI', model: 'PMS-200', hours: 50000, valorNuevo: 520000, demerito: 0.8 },
  { id: 'E0354', type: 'AUTOELEVADOR 3 ≤ Tn < 6', brand: 'HYSTER', model: 'H-110F', hours: 12399, valorNuevo: 75000, demerito: 0.7 },
  { id: 'E0404', type: 'RODILLO P. CABRA ESTATICO AUTOP. ≥ 25 Tn', brand: 'CATERPILLAR', model: '825 STD', hours: 16731, valorNuevo: 650000, demerito: 0.95 },
  { id: 'E1014', type: 'MOTONIVELADORA 14\'', brand: 'CATERPILLAR', model: '140H', hours: 23882, valorNuevo: 380000, demerito: 0.82 },
  { id: 'E1070', type: 'EXCAVADORA S/ORUGAS ≥ 40 Tn', brand: 'KOMATSU', model: 'PC450-7', hours: 15827, valorNuevo: 550000, demerito: 0.88 },
  { id: 'E1402', type: 'EXCAVADORA S/ORUGAS 30 ≤ Tn < 40', brand: 'VOLVO', model: 'EC290 BLC PRIME', hours: 11882, valorNuevo: 320000, demerito: 0.75 },
  { id: 'E1403', type: 'EXCAVADORA S/ORUGAS 30 ≤ Tn < 40', brand: 'VOLVO', model: 'EC290 BLC PRIME', hours: 6633, valorNuevo: 320000, demerito: 0.85 },
  { id: 'E1464', type: 'EXCAVADORA S/ORUGAS 20 ≤ Tn < 30', brand: 'KOMATSU', model: 'PC240LC-8', hours: 5744, valorNuevo: 240000, demerito: 0.9 },

  // Serie V (Vehículos de Servicio y Camiones)
  { id: 'V0704', type: 'CAMION REGADOR DE AGUA < 10 m3', brand: 'IVECO', model: '170E 21 EUROCARGO', hours: 3134, valorNuevo: 120000, demerito: 0.7 },
  { id: 'V0748', type: 'CAMION TRACTOR 6X4', brand: 'IVECO', model: 'EUROTRAKKER 380 E37H', hours: 14085, valorNuevo: 180000, demerito: 0.65 },
  { id: 'V0771', type: 'CAMION SERVICIO DE TALLER', brand: 'IVECO', model: 'EUROCARGO 170 E22 TECTOR', hours: 57591, valorNuevo: 140000, demerito: 0.6 },
  { id: 'V1169', type: 'CAMION VOLCADOR ≥ 15 m3 6x4', brand: 'IVECO', model: 'TRAKKER HI LAND 410T44', hours: 3041, valorNuevo: 210000, demerito: 0.95 },
  
  // Serie Q (Equipos Nuevos)
  { id: 'Q0352', type: 'CAMION C/MOTOHORMIGONERO', brand: 'CARMIX', model: '45FX', hours: 867, valorNuevo: 160000, demerito: 0.98 },
];

export const INITIAL_ENTRIES: MaintenanceEntry[] = [
  {
    id: '1',
    equipmentId: 'E1402',
    entryDate: '2025-05-12',
    preliminaryInfo: 'Ruidos anormales en el motor',
    actions: [
      { id: 'a1', description: 'Ingreso a taller - Diagnóstico inicial', date: '2025-05-12', performedBy: 'Juan Pérez' },
      { id: 'a7', description: 'Operativo', date: '2025-06-15', performedBy: 'Taller Central' },
    ]
  },
  {
    id: '2',
    equipmentId: 'E1464',
    entryDate: '2025-10-10',
    preliminaryInfo: 'Pérdida de fluido hidráulico en mandos finales',
    actions: [
      { id: 'b1', description: 'Revisión de sellos y retenes', date: '2025-10-11', performedBy: 'S. Técnico' },
      { id: 'b2', description: 'Desarme de mando final izquierdo', date: '2025-10-14', performedBy: 'Mecánica 2' },
    ]
  },
  {
    id: '3',
    equipmentId: 'V1169',
    entryDate: '2025-11-20',
    preliminaryInfo: 'Service preventivo - Cambio de aceites y filtros',
    actions: [
      { id: 'c1', description: 'Cambio de aceite motor y filtros de aire', date: '2025-11-21', performedBy: 'Lubricentro' },
      { id: 'c2', description: 'Operativo', date: '2025-11-22', performedBy: 'Lubricentro' },
    ]
  }
];
