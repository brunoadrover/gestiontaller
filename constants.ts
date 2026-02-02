
import { Equipment, MaintenanceEntry } from './types';

export const INITIAL_EQUIPMENT: Equipment[] = [
  // Serie A (Acoplados y Tanques)
  { id: 'A0001', type: 'ACOPLADO TANQUE AGUA/REGADOR DE TIRO 10 ≥ 25 m3', brand: 'NICAR', model: '-', hours: 0 },
  { id: 'A0007', type: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', brand: 'PRATTI FRUENHAUF', model: 'TC-SP6011', hours: 0 },
  { id: 'A0021', type: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', brand: 'v0704', model: 'SA 16/20', hours: 0 },
  { id: 'A0053', type: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', brand: 'HELVETICA - FERRONI', model: 'SA 20/25 TT', hours: 0 },
  { id: 'A0061', type: 'ACOPLADO CARRETON DE TIRO 10 ≤ Tn < 20', brand: 'CYC', model: 'ACOPLADO SEMIRREMOLQUE', hours: 0 },
  { id: 'A0091', type: 'ACOPLADO PLAYO DE TIRO 15 ≥ 35 Ton', brand: 'HELVETICA - FERRONI', model: 'SA 16/20 TT', hours: 0 },
  { id: 'A0148', type: 'ACOPLADO CARRETON DE TIRO ≥ 35 Tn', brand: 'ECONMEC', model: 'SB2', hours: 0 },
  
  // Serie E (Equipos Pesados y Plantas)
  { id: 'E0206', type: 'DISTRIBUIDOR DE AGR. PETREOS ARR.', brand: 'MICHELINI', model: 'FM/375', hours: 98 },
  { id: 'E0306', type: 'PLANTA CLASIFICADORA DE ARIDOS < 200 Tn/h', brand: 'FERRONI', model: 'PC-200', hours: 18243 },
  { id: 'E0307', type: 'PLANTA MEZCLADORA P/SUELO ESTAB. < 200 Tn/h', brand: 'FERRONI', model: 'PMS-200', hours: 50000 },
  { id: 'E0311', type: 'BARREDORA SOPLADORA DE ARR.', brand: 'FRACCHIA', model: '108-G', hours: 50000 },
  { id: 'E0354', type: 'AUTOELEVADOR 3 ≤ Tn < 6', brand: 'HYSTER', model: 'H-110F', hours: 12399 },
  { id: 'E0404', type: 'RODILLO P. CABRA ESTATICO AUTOP. ≥ 25 Tn', brand: 'CATERPILLAR', model: '825 STD', hours: 16731 },
  { id: 'E0556', type: 'PLANTA MEZCLADORA P/SUELO ESTAB. ≥ 200 Tn/h', brand: 'BARBER GREENE', model: 'KS-60', hours: 20632 },
  { id: 'E0564', type: 'PLANTA ASFALTICA 150 ≥ 200 Tn/h', brand: 'PARKER', model: 'F-20', hours: 24576 },
  { id: 'E0567', type: 'TERMINADORA DE HORMIGON', brand: 'GOMACO', model: 'C-650S', hours: 19654 },
  { id: 'E0591', type: 'BARREDORA SOPLADORA DE ARR.', brand: 'MICHELINI', model: 'FM230', hours: 18500 },
  { id: 'E0612', type: 'MOTOCOMPRESOR ≥ 6 m3', brand: 'SULLAIR', model: '375 DP', hours: 50000 },
  { id: 'E1014', type: 'MOTONIVELADORA 14\'', brand: 'CATERPILLAR', model: '140H', hours: 23882 },
  { id: 'E1070', type: 'EXCAVADORA S/ORUGAS ≥ 40 Tn', brand: 'KOMATSU', model: 'PC450-7', hours: 15827 },
  { id: 'E1402', type: 'EXCAVADORA S/ORUGAS 30 ≤ Tn < 40', brand: 'VOLVO', model: 'EC290 BLC PRIME', hours: 11882 },
  { id: 'E1403', type: 'EXCAVADORA S/ORUGAS 30 ≤ Tn < 40', brand: 'VOLVO', model: 'EC290 BLC PRIME', hours: 6633 },
  { id: 'E1464', type: 'EXCAVADORA S/ORUGAS 20 ≤ Tn < 30', brand: 'KOMATSU', model: 'PC240LC-8', hours: 5744 },

  // Serie V (Vehículos de Servicio y Camiones)
  { id: 'V0704', type: 'CAMION REGADOR DE AGUA < 10 m3', brand: 'IVECO', model: '170E 21 EUROCARGO', hours: 3134 },
  { id: 'V0748', type: 'CAMION TRACTOR 6X4', brand: 'IVECO', model: 'EUROTRAKKER 380 E37H', hours: 14085 },
  { id: 'V0771', type: 'CAMION SERVICIO DE TALLER', brand: 'IVECO', model: 'EUROCARGO 170 E22 TECTOR', hours: 57591 },
  { id: 'V0773', type: 'CAMION C/HIDROGRUA 10 ≤ Tnm < 20', brand: 'IVECO / PALFINGER', model: 'EUROCARGO 170 E22', hours: 16552 },
  { id: 'V1169', type: 'CAMION VOLCADOR ≥ 15 m3 6x4', brand: 'IVECO', model: 'TRAKKER HI LAND 410T44', hours: 3041 },
  
  // Serie Q (Equipos Nuevos / Adquisiciones Recientes)
  { id: 'Q0352', type: 'CAMION C/MOTOHORMIGONERO', brand: 'CARMIX', model: '45FX', hours: 867 },
  { id: 'Q0363', type: 'CAMION VOLCADOR < 8 m3', brand: 'MERCEDES BENZ', model: 'ACTROS 3336', hours: 14254 },
  { id: 'Q0412', type: 'MANIPULADOR TELESCOPICO < 4,5 Tn', brand: 'JLG', model: '4017 RS', hours: 7787 },

  // Serie X (Contenedores y Casillas)
  { id: 'X0095', type: 'CONTENEDOR TALLER 6 m', brand: '-', model: 'DEPOSITO', hours: 0 },
  { id: 'X0880', type: 'CONTENEDOR TALLER 12 m', brand: '-', model: 'PAÑOL', hours: 0 }
];

export const INITIAL_ENTRIES: MaintenanceEntry[] = [
  {
    id: '1',
    equipmentId: 'E1402',
    entryDate: '2025-05-12',
    preliminaryInfo: 'Ruidos anormales en el motor',
    actions: [
      { id: 'a1', description: 'Ingreso a taller - Diagnóstico inicial', date: '2025-05-12', performedBy: 'Juan Pérez' },
      { id: 'a2', description: 'Se retira motor para inspección interna', date: '2025-05-15', performedBy: 'Mecánica Gral' },
      { id: 'a3', description: 'Desarme completo de motor', date: '2025-05-20', performedBy: 'Rectificadora' },
      { id: 'a4', description: 'Pedido de repuestos (Camisas, Pistones)', date: '2025-05-22', performedBy: 'Compras' },
      { id: 'a5', description: 'Recibido de repuestos y armado', date: '2025-06-05', performedBy: 'Mecánica Gral' },
      { id: 'a6', description: 'Instalación y puesta en marcha', date: '2025-06-10', performedBy: 'Juan Pérez' },
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
    equipmentId: 'V0771',
    entryDate: '2025-11-20',
    preliminaryInfo: 'Service preventivo - Cambio de aceites y filtros',
    actions: [
      { id: 'c1', description: 'Cambio de aceite motor y filtros de aire', date: '2025-11-21', performedBy: 'Lubricentro' },
      { id: 'c2', description: 'Operativo', date: '2025-11-22', performedBy: 'Lubricentro' },
    ]
  }
];
