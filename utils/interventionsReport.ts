import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MaintenanceEntry, Equipment, EvaluacionIngresoTaller, CostoRealIntervencion } from '../types';
import { supabase } from '../supabase';
import { 
  getDiffDays, 
  formatDateDisplay, 
  calculateLoss, 
  formatCurrency, 
  getWorkshopName, 
  getStateLabel,
  sanitizePdfText
} from './inactivityReport';
import { 
  extractRcandSottFromActions, 
  getStoredCostoReal, 
  calculateTotalCostoReal,
  getRepairDays,
  getPartsWaitDays,
  getTestingDays
} from './realCostHelper';
import { buildInterventionSummaryParagraph } from './interventionSummaryHelper';

export interface FlujoFondoReportRow {
  mes: number;
  fase: 'Inversión' | 'Taller' | 'Operación';
  margenOperativo: number;
  costosFijosTaller: number;
  inversion: number;
  residual: number;
  flujoNeto: number;
  factorDescuento: number;
  valorActual: number;
  vaAcumuladoSinResidual: number;
}

const buildCashFlowReport = (
  plazoMeses: number,
  vuRemMeses: number,
  invCalc: number,
  cFijos: number,
  margenMes: number,
  vVentaFin: number,
  tnaVal: number
): { rows: FlujoFondoReportRow[]; vanCalc: number; mesRepagoCalc: number } => {
  const nPlazo = Math.max(0, Math.round(plazoMeses));
  const nVuRem = Math.max(1, Math.round(vuRemMeses));
  const totalMeses = nPlazo + nVuRem;
  const im = (tnaVal / 100) / 12;

  const rows: FlujoFondoReportRow[] = [];
  let vaAcum = 0;
  let detectedRepago: number | null = null;
  let totalVan = 0;

  for (let m = 0; m <= totalMeses; m++) {
    let fase: 'Inversión' | 'Taller' | 'Operación' = 'Operación';
    let margenOperativo = 0;
    let costosFijosTaller = 0;
    let inversionVal = 0;
    let residualVal = 0;
    let flujoNeto = 0;

    if (m === 0) {
      fase = 'Inversión';
      inversionVal = invCalc;
      flujoNeto = -invCalc;
    } else if (m <= nPlazo) {
      fase = 'Taller';
      costosFijosTaller = cFijos;
      flujoNeto = -cFijos;
    } else {
      fase = 'Operación';
      margenOperativo = margenMes;
      if (m === totalMeses) {
        residualVal = vVentaFin;
        flujoNeto = margenMes + vVentaFin;
      } else {
        flujoNeto = margenMes;
      }
    }

    const factorDescuento = im > 0 ? 1 / Math.pow(1 + im, m) : 1;
    const valorActual = flujoNeto * factorDescuento;
    totalVan += valorActual;

    const flujoSinResidual = (m === totalMeses && residualVal > 0) ? margenOperativo : flujoNeto;
    const vaSinResidual = flujoSinResidual * factorDescuento;
    vaAcum += vaSinResidual;

    if (vaAcum >= 0 && detectedRepago === null) {
      detectedRepago = m;
    }

    rows.push({
      mes: m,
      fase,
      margenOperativo,
      costosFijosTaller,
      inversion: inversionVal,
      residual: residualVal,
      flujoNeto,
      factorDescuento,
      valorActual,
      vaAcumuladoSinResidual: vaAcum,
    });
  }

  return {
    rows,
    vanCalc: totalVan,
    mesRepagoCalc: detectedRepago !== null ? detectedRepago : 0,
  };
};

export const exportEquipmentInterventionsPDF = async (
  entry: MaintenanceEntry,
  equipmentList: Equipment[],
  passedEval?: EvaluacionIngresoTaller | null
) => {
  if (!entry) return;

  const eq = equipmentList.find((e) => e.id.toLowerCase() === entry.equipo_id?.toLowerCase()) || null;

  // Cargar evaluación económico-financiera si existe (de DB o localStorage)
  let evalData: EvaluacionIngresoTaller | null = passedEval || null;
  if (!evalData) {
    try {
      const { data, error } = await supabase
        .from('evaluacion_ingresos_taller')
        .select('*')
        .eq('ingresos_taller_id', entry.id)
        .maybeSingle();
      if (!error && data) {
        evalData = data as EvaluacionIngresoTaller;
      }
    } catch (e) {
      console.warn('No se pudo consultar Supabase para la evaluación:', e);
    }
  }

  if (!evalData) {
    try {
      const cached = localStorage.getItem(`eval_intervencion_${entry.id}`);
      if (cached) {
        evalData = JSON.parse(cached);
      }
    } catch (e) {
      console.warn('No se pudo leer la evaluación del caché local:', e);
    }
  } else if (!evalData.decision_final) {
    try {
      const cached = localStorage.getItem(`eval_intervencion_${entry.id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.decision_final) {
          evalData.decision_final = parsed.decision_final;
        }
        if (!evalData.comentarios && parsed.comentarios) {
          evalData.comentarios = parsed.comentarios;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  
  const todayRaw = new Date();
  const todayStr = todayRaw.toLocaleDateString('en-CA');
  const todayFormatted = todayRaw.toLocaleDateString('es-AR');
  const fechaEmisionForFile = todayFormatted.replace(/\//g, '-');

  const isOperative = entry.estado === 'OPERATIVO' || !!entry.fecha_salida;
  const endDate = entry.fecha_salida || todayStr;
  const totalStayDays = getDiffDays(entry.fecha_ingreso, endDate);
  const loss = calculateLoss(totalStayDays, eq);

  const formatUSD = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return 'USD 0';
    return `USD ${Math.round(val).toLocaleString('de-DE')}`;
  };

  // Cant Pedidos y SOTT (acciones donde responsable NO sea COMPRAS ni SISTEMA)
  const nonComprasActions = (entry.acciones_taller || []).filter((a) => {
    const resp = (a.responsable || '').trim().toUpperCase();
    return resp !== 'COMPRAS' && resp !== 'SISTEMA';
  });

  const cantPedidos = nonComprasActions.filter((a) => {
    const desc = (a.descripcion || '').trim().toLowerCase();
    return /^pedidos?\s+de\s+repuestos?/i.test(desc);
  }).length;

  const cantSOTT = nonComprasActions.filter((a) => {
    const desc = (a.descripcion || '').trim();
    return /(SOTT|SOOT|\bOT\b|O\.T\.?)/i.test(desc);
  }).length;

  // --- HEADER SUPERIOR ---
  doc.setFillColor(30, 41, 59); // Slate 800
  doc.rect(0, 0, 210, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text('GEyT', 14, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CARPETA DE ARRASTRE', 200, 12, { align: 'right' });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Informe de Intervenciones | Emisión: ${todayFormatted}`, 200, 18, { align: 'right' });

  // --- RECTÁNGULO DE DATOS DEL EQUIPO Y SERVICIO ---
  // Estructurado según solicitud:
  // Línea 1: "Tipo" solo
  // Línea 2: "Marca / Modelo" solo
  // Línea 3: "Año" y "Hs de Arrastre"
  // Líneas siguientes: Propietario, Taller, Obra, Estado
  let startY = 32;

  doc.setFillColor(248, 250, 252); // Slate 50
  doc.rect(14, startY, 182, 38, 'F');
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.rect(14, startY, 182, 38, 'S');

  // Badge Interno en el lateral izquierdo
  doc.setFillColor(21, 128, 61); // Green 700
  doc.roundedRect(18, startY + 12, 28, 14, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(entry.equipo_id, 32, startY + 21, { align: 'center' });

  // Datos principales a partir de x = 52
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8);

  // Línea 1: Tipo solo
  doc.setFont('helvetica', 'normal');
  doc.text('Tipo:', 52, startY + 6.5);
  doc.setFont('helvetica', 'bold');
  const sanitizedTipo = sanitizePdfText(eq?.tipo) || 'N/D';
  doc.text(sanitizedTipo, 62, startY + 6.5, { maxWidth: 130 });

  // Línea 2: Marca / Modelo solo
  doc.setFont('helvetica', 'normal');
  doc.text('Marca / Modelo:', 52, startY + 13);
  doc.setFont('helvetica', 'bold');
  const sanitizedMarcaModelo = sanitizePdfText(`${eq?.marca || ''} ${eq?.modelo || ''}`.trim()) || 'N/D';
  doc.text(sanitizedMarcaModelo, 78, startY + 13, { maxWidth: 114 });

  // Línea 3: Año y Hs de Arrastre
  doc.setFont('helvetica', 'normal');
  doc.text('Año:', 52, startY + 19.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${eq?.year || 'N/D'}`, 61, startY + 19.5);

  doc.setFont('helvetica', 'normal');
  doc.text('Hs de Arrastre:', 105, startY + 19.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${eq?.horas !== undefined && eq?.horas !== null ? eq.horas.toLocaleString('es-AR') : '0'} hs`, 130, startY + 19.5);

  // Línea 4: Propietario y Taller Asignado
  doc.setFont('helvetica', 'normal');
  doc.text('Propietario:', 52, startY + 26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 105, 161); // Sky 700
  doc.text(sanitizePdfText(eq?.propietario) || 'N/D', 71, startY + 26, { maxWidth: 32 });

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.text('Taller Asignado:', 105, startY + 26);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitizePdfText(getWorkshopName(entry.equipo_id, eq)), 130, startY + 26, { maxWidth: 62 });

  // Línea 5: Obra Asignada y Estado
  doc.setFont('helvetica', 'normal');
  doc.text('Obra Asignada:', 52, startY + 32.5);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitizePdfText(entry.obra_asignada) || 'Sin asignar', 76, startY + 32.5, { maxWidth: 27 });

  doc.setFont('helvetica', 'normal');
  doc.text('Estado:', 105, startY + 32.5);
  doc.setFont('helvetica', 'bold');
  const estadoLabel = isOperative ? 'OPERATIVO' : getStateLabel(entry.estado).toUpperCase();
  doc.setTextColor(isOperative ? 22 : 180, isOperative ? 101 : 83, isOperative ? 52 : 9);
  doc.text(estadoLabel, 118, startY + 32.5);

  // Subbarra con fechas y estadísticas de taller
  startY += 42;
  doc.setFillColor(241, 245, 249); // Slate 100
  doc.rect(14, startY, 182, 14, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, startY, 182, 14, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);

  doc.text(`Fecha Ingreso: `, 18, startY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(`${formatDateDisplay(entry.fecha_ingreso)}`, 39, startY + 6);

  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha Salida: `, 72, startY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(`${entry.fecha_salida ? formatDateDisplay(entry.fecha_salida) : 'En Taller (Activo)'}`, 91, startY + 6);

  doc.setFont('helvetica', 'normal');
  doc.text(`Estadía Total: `, 140, startY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalStayDays} días`, 160, startY + 6);

  // Segunda sublínea de la barra: Pérdida, Pedidos, SOTT
  doc.setFont('helvetica', 'normal');
  doc.text(`Pérdida Estimada: `, 18, startY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(153, 27, 27);
  doc.text(`${formatCurrency(loss)}`, 43, startY + 11.5);

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cant. Pedidos: `, 95, startY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${cantPedidos}`, 115, startY + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.text(`Cantidad de SOTT: `, 145, startY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${cantSOTT}`, 172, startY + 11.5);

  startY += 18;

  // --- SECCIÓN: EVALUACIÓN ECONÓMICO-FINANCIERA DE LA INTERVENCIÓN (AL COMIENZO, SI EXISTE) ---
  const hasEvaluation = Boolean(
    evalData && (
      (evalData.inversion !== null && evalData.inversion !== undefined) ||
      (evalData.costo_repuesto_est !== null && evalData.costo_repuesto_est !== undefined) ||
      (evalData.crc_exigido !== null && evalData.crc_exigido !== undefined)
    )
  );

  if (hasEvaluation && evalData) {
    const inv = Number(evalData.inversion) || 0;
    const crc = Number(evalData.crc_exigido) || 0;
    const marg = Number(evalData.margen_mensual) || 0;
    const cob = evalData.cobertura !== null && evalData.cobertura !== undefined ? Number(evalData.cobertura) : null;
    const cFijos = Number(evalData.costos_fijos_mes) || 0;
    const vAlquiler = Number(evalData.valor_alquiler) || 0;
    const vNuevo = eq?.valor_nuevo || 0;
    const tnaVal = Number(evalData.tna) || 0;
    const imnuevo = (tnaVal / 100) / 12;
    const vuInicial = Number(evalData.vida_util_inicial) || 120;
    const vanVal = evalData.VAN !== null && evalData.VAN !== undefined ? Number(evalData.VAN) : (evalData.van !== null ? Number(evalData.van) : null);
    const repagoVal = evalData.mes_repago !== null && evalData.mes_repago !== undefined ? Number(evalData.mes_repago) : null;

    // Costos mensuales comparados
    const costoReparacion = crc + cFijos;
    const costoAlquiler = vAlquiler;
    const valorResidualNuevo = vNuevo * 0.25;
    const frcNuevo = imnuevo > 0 
      ? imnuevo / (1 - Math.pow(1 + imnuevo, -vuInicial)) 
      : (vuInicial > 0 ? 1 / vuInicial : 0);
    const crcNuevo = (vNuevo - (valorResidualNuevo / Math.pow(1 + imnuevo, vuInicial))) * frcNuevo;
    const costoNuevo = crcNuevo + cFijos;
    const minCosto = Math.min(costoReparacion, costoNuevo, costoAlquiler);

    // Encabezado de la Sección Financiera
    doc.setFillColor(30, 58, 138); // Blue 900
    doc.rect(14, startY, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('EVALUACIÓN ECONÓMICO-FINANCIERA DE LA INTERVENCIÓN', 18, startY + 5);

    // Indicador Cobertura badge texto a la derecha
    const cobBadge = cob !== null ? (cob >= 1.2 ? `COBERTURA: ${cob.toFixed(2)} (ÓPTIMA)` : cob >= 1.0 ? `COBERTURA: ${cob.toFixed(2)} (VIABLE)` : `COBERTURA: ${cob.toFixed(2)} (RIESGO)`) : 'EVALUADO';
    doc.setFontSize(8);
    doc.text(cobBadge, 192, startY + 5, { align: 'right' });

    // --- TABLA PREVIA: VALORES ESTIMADOS DE DONDE PARTE EL ANÁLISIS ---
    const baseParamsRows: any[] = [
      [
        { content: '1. Taller', styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [30, 58, 138] } },
        `Repuestos: ${formatUSD(evalData.costo_repuesto_est)}`,
        `SOTT: ${formatUSD(evalData.costo_sott_est)}`,
        `Plazo Est.: ${evalData.plazo_est_meses ?? 0} meses`,
        `V.U. Remanente: ${evalData.vida_util_rem_meses ?? 0} meses`
      ],
      [
        { content: '2. Finanzas', styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [21, 128, 61] } },
        `Vta. Como Está: ${formatUSD(evalData.valor_venta_como_esta)}`,
        `Vta. Final (Residual): ${formatUSD(evalData.valor_venta_final)}`,
        `Costos Fijos: ${formatUSD(evalData.costos_fijos_mes)}/mes`,
        `Mano de Obra: ${formatUSD(evalData.mano_obra_hr)}/hr`
      ],
      [
        { content: '3. Gerencia & Mercado', styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [126, 34, 206] } },
        `Alquiler Mercado: ${formatUSD(evalData.valor_alquiler)}/mes`,
        `TNA Financiación: ${evalData.tna ?? 0}%`,
        `Hs. Trab. Esp.: ${evalData.hs_trab_mes_esp ?? 140} hs/mes`,
        `V. Nuevo: ${formatUSD(vNuevo)} (V.U. Ini: ${vuInicial} m)`
      ]
    ];

    autoTable(doc, {
      startY: startY + 8,
      head: [['Origen de Datos', 'Parámetro Estimado 1', 'Parámetro Estimado 2', 'Parámetro Estimado 3', 'Parámetro Estimado 4']],
      body: baseParamsRows,
      theme: 'grid',
      headStyles: {
        fillColor: [71, 85, 105], // Slate 600
        textColor: [255, 255, 255],
        fontSize: 6.8,
        fontStyle: 'bold',
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 34, fontStyle: 'bold' },
        1: { cellWidth: 37 },
        2: { cellWidth: 37 },
        3: { cellWidth: 37 },
        4: { cellWidth: 37 }
      },
      styles: {
        fontSize: 6.8,
        cellPadding: 1.8,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1
      }
    });

    startY = (doc as any).lastAutoTable.finalY + 3;

    // Subtítulo previo a la tabla de indicadores calculados
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 58, 138);
    doc.text('RESULTADOS E INDICADORES CALCULADOS DE LA EVALUACIÓN:', 14, startY + 3);

    startY += 4.5;

    // Tabla 1: Indicadores Financieros Principales
    autoTable(doc, {
      startY: startY,
      head: [['Inversión Intervención', 'CRC Exigido / mes', 'Margen Mensual', 'Índice Cobertura', 'VAN (Valor Actual Neto)', 'Repago s/ Residual']],
      body: [[
        formatUSD(inv),
        formatUSD(crc),
        formatUSD(marg),
        cob !== null ? `${cob.toFixed(2)} (${cob >= 1.2 ? 'Holgada' : cob >= 1.0 ? 'Aceptable' : 'Riesgo'})` : '-',
        vanVal !== null ? formatUSD(vanVal) : '-',
        repagoVal && repagoVal > 0 ? `Mes ${repagoVal}` : 'No alcanzado'
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: [238, 242, 255],
        textColor: [30, 41, 59],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8,
        fontStyle: 'bold',
        textColor: [15, 23, 42],
        halign: 'center'
      },
      styles: {
        cellPadding: 2.5,
        lineColor: [203, 213, 225],
        lineWidth: 0.1
      }
    });

    startY = (doc as any).lastAutoTable.finalY + 3;

    // --- RECUADRO DE ANÁLISIS DEL PARÁMETRO COBERTURA ---
    const cobValNum = cob !== null ? cob : 0;
    const isCobOptima = cobValNum >= 1.2;
    const isCobAceptable = cobValNum >= 1.0 && cobValNum < 1.2;

    const bgBox = isCobOptima ? [240, 253, 244] : isCobAceptable ? [254, 252, 232] : [255, 241, 242];
    const borderBox = isCobOptima ? [187, 247, 208] : isCobAceptable ? [254, 240, 138] : [254, 205, 211];
    const textTitleBox = isCobOptima ? [22, 101, 52] : isCobAceptable ? [133, 77, 14] : [159, 18, 57];

    doc.setFillColor(bgBox[0], bgBox[1], bgBox[2]);
    doc.rect(14, startY, 182, 15, 'F');
    doc.setDrawColor(borderBox[0], borderBox[1], borderBox[2]);
    doc.rect(14, startY, 182, 15, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(textTitleBox[0], textTitleBox[1], textTitleBox[2]);
    doc.text(`ANÁLISIS DEL PARÁMETRO COBERTURA (Índice: ${cob !== null ? cob.toFixed(2) : '-'} | Dictamen: ${isCobOptima ? 'HOLGADA (>= 1.20)' : isCobAceptable ? 'AJUSTADA (1.00 a 1.19)' : 'INSUFICIENTE (< 1.00)'}):`, 17, startY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(51, 65, 85);
    doc.text('- Si la Cobertura es mayor o igual a 1: la intervención se repaga en la vida remanente con el margen operativo disponible.', 17, startY + 8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('- Recomendación: Se recomienda exigir 1,2 o más para absorber desvíos del presupuesto de taller, de la vida remanente o de la utilización.', 17, startY + 12.5);

    startY += 18;

    // Tabla 2: Comparativa de Alternativas Mensuales
    const compRows = [
      [
        '1. Reparación de la Intervención',
        formatUSD(costoReparacion),
        `CRC Exigido (${formatUSD(crc)}) + Costos Fijos (${formatUSD(cFijos)})`,
        costoReparacion === minCosto ? '[Más Económica]' : `+${formatUSD(costoReparacion - minCosto)}/mes`
      ],
      [
        '2. Invertir en Equipo Nuevo',
        formatUSD(costoNuevo),
        `CRC Nuevo (${formatUSD(crcNuevo)}) + Costos Fijos (${formatUSD(cFijos)}) [V.Nuevo: ${formatUSD(vNuevo)}]`,
        costoNuevo === minCosto ? '[Más Económica]' : `+${formatUSD(costoNuevo - minCosto)}/mes`
      ],
      [
        '3. Alquiler de Mercado',
        formatUSD(costoAlquiler),
        `Canon mensual pactado (${formatUSD(vAlquiler)})`,
        costoAlquiler === minCosto ? '[Más Económica]' : `+${formatUSD(costoAlquiler - minCosto)}/mes`
      ]
    ];

    autoTable(doc, {
      startY: startY,
      head: [['Alternativa Evaluada', 'Costo Mensual', 'Composición del Costo', 'Evaluación Relativa']],
      body: compRows,
      theme: 'grid',
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [51, 65, 85],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: 32, fontStyle: 'bold', halign: 'right' },
        2: { cellWidth: 'auto', fontSize: 7 },
        3: { cellWidth: 36, fontStyle: 'bold', halign: 'center' }
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = String(data.cell.raw || '');
          if (val.includes('Más Económica')) {
            data.cell.styles.textColor = [22, 101, 52]; // Green 800
            data.cell.styles.fillColor = [240, 253, 244]; // Green 50
          }
        }
      }
    });

    startY = (doc as any).lastAutoTable.finalY + 4;

    // --- RECUADRO: DECISIÓN FINAL SOBRE LA INTERVENCIÓN ---
    const decisionTexto = sanitizePdfText(evalData.decision_final);
    const comentariosTexto = sanitizePdfText(evalData.comentarios);

    let decBg = [248, 250, 252]; // Slate 50
    let decBorder = [203, 213, 225]; // Slate 300
    let decBadgeBg = [71, 85, 105]; // Slate 600
    let decTitleColor = [30, 41, 59];

    if (decisionTexto === 'Realizar Intervención') {
      decBg = [240, 253, 244]; // Green 50
      decBorder = [187, 247, 208]; // Green 200
      decBadgeBg = [21, 128, 61]; // Green 700
      decTitleColor = [22, 101, 52];
    } else if (decisionTexto === 'Vender el equipo como está') {
      decBg = [250, 245, 255]; // Purple 50
      decBorder = [233, 213, 255]; // Purple 200
      decBadgeBg = [126, 34, 206]; // Purple 700
      decTitleColor = [88, 28, 135];
    } else if (decisionTexto === 'Realizar una reparación parcial') {
      decBg = [254, 252, 232]; // Yellow 50
      decBorder = [254, 240, 138]; // Yellow 200
      decBadgeBg = [161, 98, 7]; // Yellow 700
      decTitleColor = [113, 63, 18];
    } else if (decisionTexto === 'Buscar alternativas') {
      decBg = [239, 246, 255]; // Blue 50
      decBorder = [191, 219, 254]; // Blue 200
      decBadgeBg = [29, 78, 216]; // Blue 700
      decTitleColor = [30, 58, 138];
    } else if (decisionTexto === 'Comentarios') {
      decBg = [248, 250, 252]; // Slate 50
      decBorder = [226, 232, 240];
      decBadgeBg = [71, 85, 105];
      decTitleColor = [15, 23, 42];
    }

    let splitComms: string[] = [];
    if (comentariosTexto) {
      splitComms = doc.splitTextToSize(`Comentarios y Fundamento: ${comentariosTexto}`, 174);
    }
    const decBoxH = Math.max(14, 9 + (splitComms.length * 3.6));

    if (startY + decBoxH > 275) {
      doc.addPage();
      startY = 20;
    }

    doc.setFillColor(decBg[0], decBg[1], decBg[2]);
    doc.rect(14, startY, 182, decBoxH, 'F');
    doc.setDrawColor(decBorder[0], decBorder[1], decBorder[2]);
    doc.rect(14, startY, 182, decBoxH, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(decTitleColor[0], decTitleColor[1], decTitleColor[2]);
    doc.text('DECISIÓN FINAL SOBRE LA INTERVENCIÓN:', 18, startY + 4.5);

    const displayDecision = decisionTexto || 'Pendiente de Definición';
    const badgeW = doc.getTextWidth(displayDecision) + 8;
    doc.setFillColor(decBadgeBg[0], decBadgeBg[1], decBadgeBg[2]);
    doc.roundedRect(82, startY + 1.5, badgeW, 5, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(displayDecision, 82 + (badgeW / 2), startY + 5, { align: 'center' });

    if (splitComms.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(51, 65, 85);
      doc.text(splitComms, 18, startY + 9.5);
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text('Sin comentarios u observaciones adicionales registradas.', 18, startY + 9.5);
    }

    startY += decBoxH + 4;
  } else {
    // Encabezado de la Sección Financiera
    doc.setFillColor(100, 116, 139); // Slate 500
    doc.rect(14, startY, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('EVALUACIÓN ECONÓMICO-FINANCIERA DE LA INTERVENCIÓN', 18, startY + 5);

    // Centrado en el espacio restante de la página correspondiente
    const pageRemainingHeight = 280 - (startY + 7);
    const centerY = startY + 7 + (pageRemainingHeight / 2); // aprox y = 186mm
    const boxH = 44;
    const boxY = centerY - (boxH / 2);

    doc.setFillColor(248, 250, 252); // Slate 50
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.roundedRect(18, boxY, 174, boxH, 3, 3, 'FD');

    // Detalle decorativo sutil
    doc.setDrawColor(203, 213, 225); // Slate 300
    doc.line(85, boxY + 12, 125, boxY + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(100, 116, 139); // Slate 500 (tono de gris medio)

    const noEvalText = sanitizePdfText('Para esta intervención no se realizó una evaluación económico/financiera previa');
    const splitLines = doc.splitTextToSize(noEvalText, 160);
    const textStartY = boxY + 22 + (splitLines.length === 1 ? 4 : 0);
    doc.text(splitLines, 105, textStartY, { align: 'center', lineHeightFactor: 1.4 });
  }

  // --- SECCIÓN: HISTORIAL DE AVANCES E INTERVENCIONES DE TALLER (HOJA APARTE) ---
  // Requisito: el inicio de avances de taller debe comenzar en una hoja aparte, una nueva sección
  doc.addPage();
  let advY = 20;

  // Header de la nueva sección en hoja aparte
  doc.setFillColor(30, 41, 59); // Slate 800
  doc.rect(14, advY, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text('HISTORIAL DE AVANCES E INTERVENCIONES DE TALLER', 18, advY + 5.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Interno: ${entry.equipo_id} | Estadía Total: ${totalStayDays} días`, 192, advY + 5.5, { align: 'right' });

  advY += 12;

  // Motivo de Ingreso / Fallas inicial en la sección de taller
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('MOTIVO DE INGRESO / INFORME PRELIMINAR DE FALLAS:', 14, advY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const fallasText = sanitizePdfText(entry.informe_fallas) || 'Sin informe inicial registrado.';
  const splitFallas = doc.splitTextToSize(fallasText, 182);
  doc.text(splitFallas, 14, advY + 4.5);

  advY += (splitFallas.length * 4.5) + 6;

  const rawActions = (entry.acciones_taller || []).filter(
    (a) => a.responsable !== 'Sistema' && a.descripcion !== 'Sincronización diaria de estadía'
  );

  // Ordenar cronológicamente (antiguos primero para leer el historial de intervenciones)
  const sortedActions = [...rawActions].sort((a, b) => {
    return (a.fecha_accion || '').localeCompare(b.fecha_accion || '');
  });

  const tableRows: any[] = sortedActions.map((action, idx) => {
    const curDate = action.fecha_accion || entry.fecha_ingreso;
    const daysFromIngreso = getDiffDays(entry.fecha_ingreso, curDate);

    return [
      idx + 1,
      formatDateDisplay(action.fecha_accion),
      sanitizePdfText(action.responsable) || 'Sin especificar',
      sanitizePdfText(action.descripcion) || 'Sin descripción',
      `+${daysFromIngreso} d.`
    ];
  });

  if (entry.observaciones && entry.observaciones.trim() !== '') {
    tableRows.push([
      {
        content: `OBSERVACIONES DE SALIDA / FINAL: ${sanitizePdfText(entry.observaciones)}`,
        colSpan: 5,
        styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [30, 41, 59] }
      }
    ]);
  }

  if (tableRows.length === 0) {
    tableRows.push([
      {
        content: 'No se registran avances o intervenciones adicionales para este ingreso.',
        colSpan: 5,
        styles: { halign: 'center', fontStyle: 'italic', textColor: [148, 163, 184] }
      }
    ]);
  }

  autoTable(doc, {
    startY: advY + 2,
    head: [['#', 'Fecha', 'Responsable / Mecánico', 'Acción Realizada / Avance', 'Desde Ingreso']],
    body: tableRows,
    theme: 'grid',
    showHead: 'everyPage',
    headStyles: {
      fillColor: [21, 128, 61],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 38, fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 24, halign: 'center', fontStyle: 'bold' }
    },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      overflow: 'linebreak'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    }
  });

  // --- SECCIÓN: CÓMPUTO DE COSTO REAL DE LA REPARACIÓN / INTERVENCIÓN (PÁGINA APARTE AL FINAL) ---
  let costoReal: CostoRealIntervencion | null = entry.costo_real || null;
  if (!costoReal) {
    try {
      costoReal = await getStoredCostoReal(entry.id);
    } catch (e) {
      console.warn('Error al leer costo_real para el reporte:', e);
    }
  }

  // Si aún no hay costo guardado, extraer automáticamente de los avances registrados
  if (!costoReal) {
    const extractedItems = extractRcandSottFromActions(entry.acciones_taller || []);
    // El precio de mano de obra, por defecto, debe ser 11
    const defaultHourlyRate = 11;
    const repairDays = getRepairDays(entry, entry.fecha_salida);
    const calc = calculateTotalCostoReal(extractedItems, repairDays, defaultHourlyRate);
    costoReal = {
      ingreso_id: entry.id,
      items: extractedItems,
      precio_mano_obra_hr: defaultHourlyRate,
      estadia_total_dias: totalStayDays,
      dias_reparacion: repairDays,
      horas_mano_obra: calc.horasManoObra,
      costo_mano_obra: calc.costoManoObra,
      subtotal_rc: calc.subtotalRc,
      subtotal_sott: calc.subtotalSott,
      costo_total_real: calc.costoTotalReal,
      fecha_computo: todayStr
    };
  }

  // Requisito: este cómputo de costo de la reparación real debe figurar en una página aparte al final
  doc.addPage();
  let costY = 20;

  // Header de la sección de Resumen y Costo Real
  doc.setFillColor(30, 41, 59); // Slate 800
  doc.rect(14, costY, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('RESUMEN Y CÓMPUTO DE COSTO REAL DE LA REPARACIÓN / INTERVENCIÓN', 18, costY + 5.3);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Equipo: ${entry.equipo_id} | Estadía: ${costoReal.estadia_total_dias} días`, 192, costY + 5.3, { align: 'right' });

  costY += 12;

  // Tarjeta de Resumen del Equipo y Fechas
  doc.setFillColor(248, 250, 252);
  doc.rect(14, costY, 182, 16, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, costY, 182, 16, 'S');

  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);

  // Línea 1
  doc.setFont('helvetica', 'normal');
  doc.text('Equipo:', 18, costY + 5.5);
  doc.setFont('helvetica', 'bold');
  const eqDescLine = `${sanitizePdfText(eq?.marca)} ${sanitizePdfText(eq?.modelo)} (${sanitizePdfText(eq?.tipo)})`.trim();
  doc.text(eqDescLine, 30, costY + 5.5, { maxWidth: 75 });

  doc.setFont('helvetica', 'normal');
  doc.text('Obra Asignada:', 110, costY + 5.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${sanitizePdfText(entry.obra_asignada) || 'Sin asignar'}`, 132, costY + 5.5, { maxWidth: 60 });

  // Línea 2
  doc.setFont('helvetica', 'normal');
  doc.text('Fecha Ingreso:', 18, costY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${formatDateDisplay(entry.fecha_ingreso)}`, 38, costY + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.text('Fecha Salida (Operativo):', 75, costY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${entry.fecha_salida ? formatDateDisplay(entry.fecha_salida) : todayFormatted}`, 112, costY + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.text('Estadía Total:', 145, costY + 11.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(21, 128, 61);
  doc.text(`${costoReal.estadia_total_dias} días`, 166, costY + 11.5);

  costY += 20;

  const repDaysVal = costoReal.dias_reparacion !== undefined ? costoReal.dias_reparacion : Math.round(costoReal.horas_mano_obra / 16);
  const partsWaitDaysVal = getPartsWaitDays(entry, entry.fecha_salida);
  const testingDaysVal = getTestingDays(entry, entry.fecha_salida);

  // Subtítulo Sección 1: Resumen de la Intervención
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 58, 138); // Blue 900
  doc.text('1. RESUMEN DE LA INTERVENCIÓN:', 14, costY);

  costY += 3;

  const summaryParagraph = buildInterventionSummaryParagraph({
    entry,
    workshopName: getWorkshopName(entry.equipo_id, eq),
    sortedActions,
    fechaIngresoFormatted: formatDateDisplay(entry.fecha_ingreso),
    fechaFinFormatted: entry.fecha_salida ? formatDateDisplay(entry.fecha_salida) : todayFormatted,
    partsWaitDays: partsWaitDaysVal,
    repairDays: repDaysVal,
    testingDays: testingDaysVal
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const summaryLines = doc.splitTextToSize(summaryParagraph, 173);
  const lineHeightMm = 3.7;
  const padTop = 4;
  const padBottom = 3.5;

  // Renderizar el recuadro de resumen paginando de forma segura si fuera muy extenso
  let lineIdx = 0;
  while (lineIdx < summaryLines.length) {
    const maxY = 278;
    const availH = maxY - costY - padTop - padBottom;
    const maxLinesFit = Math.max(1, Math.floor(availH / lineHeightMm));
    const chunk = summaryLines.slice(lineIdx, lineIdx + maxLinesFit);
    const chunkBoxH = padTop + (chunk.length * lineHeightMm) + padBottom;

    doc.setFillColor(248, 250, 252); // Slate 50
    doc.rect(14, costY, 182, chunkBoxH, 'F');
    doc.setDrawColor(203, 213, 225); // Slate 300
    doc.rect(14, costY, 182, chunkBoxH, 'S');
    // Barra de acento izquierda
    doc.setFillColor(30, 58, 138); // Blue 900
    doc.rect(14, costY, 1.5, chunkBoxH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    chunk.forEach((line: string, i: number) => {
      doc.text(line, 19, costY + padTop + 1.8 + (i * lineHeightMm));
    });

    costY += chunkBoxH + 5;
    lineIdx += chunk.length;

    if (lineIdx < summaryLines.length) {
      doc.addPage();
      costY = 20;
    }
  }

  if (costY > 250) {
    doc.addPage();
    costY = 20;
  }

  // Subtítulo Sección 2: RC y SOTT
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 58, 138); // Blue 900
  doc.text('2. COMPROBANTES DE REPUESTOS (RC) Y SERVICIOS DE TERCEROS (SOTT):', 14, costY);

  costY += 3;

  // Construir filas de la tabla de RC y SOTT
  const costTableRows: any[] = (costoReal.items || []).map((item, idx) => [
    idx + 1,
    item.tipo,
    sanitizePdfText(item.numero) || '-',
    sanitizePdfText(item.descripcion) || '-',
    formatUSD(item.monto)
  ]);

  if (costTableRows.length === 0) {
    costTableRows.push([
      {
        content: 'No se registran comprobantes específicos de RC o SOTT.',
        colSpan: 5,
        styles: { halign: 'center', fontStyle: 'italic', textColor: [148, 163, 184] }
      }
    ]);
  }

  // Filas de subtotales
  costTableRows.push([
    {
      content: 'SUBTOTAL REPUESTOS (RC):',
      colSpan: 4,
      styles: { halign: 'right', fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [146, 64, 14] }
    },
    {
      content: formatUSD(costoReal.subtotal_rc),
      styles: { halign: 'right', fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [146, 64, 14] }
    }
  ]);

  costTableRows.push([
    {
      content: 'SUBTOTAL SERVICIOS TERCEROS (SOTT):',
      colSpan: 4,
      styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 232, 255], textColor: [107, 33, 168] }
    },
    {
      content: formatUSD(costoReal.subtotal_sott),
      styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 232, 255], textColor: [107, 33, 168] }
    }
  ]);

  autoTable(doc, {
    startY: costY,
    head: [['#', 'Tipo', 'N° Comprobante', 'Descripción del Componente / Servicio', 'Monto (USD)']],
    body: costTableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
    },
    styles: {
      fontSize: 7.2,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const val = String(data.cell.raw || '');
        if (val === 'RC') {
          data.cell.styles.textColor = [180, 83, 9]; // Amber 700
        } else if (val === 'SOTT') {
          data.cell.styles.textColor = [126, 34, 206]; // Purple 700
        }
      }
    }
  });

  costY = (doc as any).lastAutoTable.finalY + 5;

  if (costY + 25 > 278) {
    doc.addPage();
    costY = 20;
  }

  // Subtítulo Sección 3: Mano de Obra
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 58, 138);
  doc.text('3. CÓMPUTO DE MANO DE OBRA EN ESTADO DE REPARACIÓN:', 14, costY);

  costY += 3;

  // Recuadro de Mano de Obra
  doc.setFillColor(238, 242, 255); // Indigo 50
  doc.rect(14, costY, 182, 17, 'F');
  doc.setDrawColor(199, 210, 254); // Indigo 200
  doc.rect(14, costY, 182, 17, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(49, 46, 129); // Indigo 900
  doc.text('Fórmula Aplicada:', 18, costY + 4.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(30, 41, 59);
  doc.text(`(Tiempo en REPARACIÓN: ${repDaysVal} días) x 2 operarios x 8 hs/día = ${costoReal.horas_mano_obra} hs de mano de obra`, 45, costY + 4.8);

  doc.setFont('helvetica', 'bold');
  doc.text('Tarifa Mano de Obra:', 18, costY + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`USD ${costoReal.precio_mano_obra_hr} / hora`, 49, costY + 9.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal Mano de Obra:', 18, costY + 14.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(21, 128, 61);
  doc.text(`${costoReal.horas_mano_obra} hs x USD ${costoReal.precio_mano_obra_hr}/hr = ${formatUSD(costoReal.costo_mano_obra)}`, 53, costY + 14.2);

  costY += 21;

  if (costY + 42 > 278) {
    doc.addPage();
    costY = 20;
  }

  // Subtítulo Sección 4: Resumen Consolidado y Total General
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 58, 138);
  doc.text('4. RESUMEN CONSOLIDADO DEL COSTO TOTAL DE LA INTERVENCIÓN:', 14, costY);

  costY += 3.5;

  // Tabla Resumen Final de Costos
  const totalSummaryRows: any[] = [
    ['1. Repuestos Adquiridos (RC)', formatUSD(costoReal.subtotal_rc), costoReal.costo_total_real > 0 ? `${((costoReal.subtotal_rc / costoReal.costo_total_real) * 100).toFixed(1)}%` : '0%'],
    ['2. Servicios y Reparaciones de Terceros (SOTT)', formatUSD(costoReal.subtotal_sott), costoReal.costo_total_real > 0 ? `${((costoReal.subtotal_sott / costoReal.costo_total_real) * 100).toFixed(1)}%` : '0%'],
    ['3. Mano de Obra de Taller (Propia)', formatUSD(costoReal.costo_mano_obra), costoReal.costo_total_real > 0 ? `${((costoReal.costo_mano_obra / costoReal.costo_total_real) * 100).toFixed(1)}%` : '0%'],
    [
      { content: 'COSTO TOTAL REAL DE LA INTERVENCIÓN', styles: { fontStyle: 'bold', fillColor: [240, 253, 244], textColor: [22, 101, 52], fontSize: 8.5 } },
      { content: formatUSD(costoReal.costo_total_real), styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 253, 244], textColor: [22, 101, 52], fontSize: 9 } },
      { content: '100.0%', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 253, 244], textColor: [22, 101, 52], fontSize: 8.5 } }
    ]
  ];

  autoTable(doc, {
    startY: costY,
    head: [['Rubro / Concepto', 'Costo en Dólares (USD)', '% Incidencia']],
    body: totalSummaryRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 105, fontStyle: 'bold' },
      1: { cellWidth: 47, halign: 'right' },
      2: { cellWidth: 30, halign: 'center', fontStyle: 'bold' }
    },
    styles: {
      fontSize: 7.2,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1
    }
  });

  costY = (doc as any).lastAutoTable.finalY + 4.5;

  // Comparativa vs Inversión Inicial Estimada si existe
  if (evalData && (evalData.inversion || evalData.costo_repuesto_est || evalData.costo_sott_est)) {
    if (costY + 16 > 278) {
      doc.addPage();
      costY = 20;
    }

    const invEstimada = evalData.inversion || ((Number(evalData.costo_repuesto_est) || 0) + (Number(evalData.costo_sott_est) || 0));
    const desvio = costoReal.costo_total_real - invEstimada;
    const isUnderBudget = desvio <= 0;

    doc.setFillColor(isUnderBudget ? 240 : 254, isUnderBudget ? 253 : 242, isUnderBudget ? 244 : 242);
    doc.rect(14, costY, 182, 13.5, 'F');
    doc.setDrawColor(isUnderBudget ? 187 : 254, isUnderBudget ? 247 : 205, isUnderBudget ? 208 : 211);
    doc.rect(14, costY, 182, 13.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(isUnderBudget ? 22 : 159, isUnderBudget ? 101 : 18, isUnderBudget ? 52 : 57);
    doc.text(`CONTROL PRESUPUESTARIO (EVALUACIÓN INICIAL vs COSTO REAL EJECUTADO):`, 18, costY + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(51, 65, 85);
    doc.text(`Inversión Estimada Inicial: ${formatUSD(invEstimada)} | Costo Real Final: ${formatUSD(costoReal.costo_total_real)} | Desvío: ${desvio >= 0 ? '+' : ''}${formatUSD(desvio)} (${invEstimada > 0 ? ((desvio / invEstimada) * 100).toFixed(1) : 0}%)`, 18, costY + 8);

    doc.setFont('helvetica', 'bold');
    doc.text(`Dictamen: ${isUnderBudget ? 'CUMPLIMIENTO DE PRESUPUESTO (Ahorro / Sin sobrecostos)' : 'DESVÍO PRESUPUESTARIO DETECTADO'}`, 18, costY + 11.5);
  }

  // --- FOOTER CON PAGINACIÓN DINÁMICA ---
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text(`GEyT - Carpeta de Arrastre | Equipo: ${entry.equipo_id}`, 14, 290);
    doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: 'center' });
    doc.text(`Emisión: ${todayFormatted}`, 196, 290, { align: 'right' });
  }

  // Titulo del archivo: <Interno>_InformeIntervenciones_<fecha de emisión>.pdf
  const safeInterno = (entry.equipo_id || 'Equipo').trim().replace(/[\/\\:*?"<>|]/g, '_');
  const fileName = `${safeInterno}_InformeIntervenciones_${fechaEmisionForFile}.pdf`;
  doc.save(fileName);
};
