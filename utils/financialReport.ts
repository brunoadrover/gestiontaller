import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MaintenanceEntry, Equipment, EvaluacionIngresoTaller } from '../types';
import { supabase } from '../supabase';
import { sanitizePdfText } from './inactivityReport';

export interface FlujoReportRow {
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

const buildFinancialCashFlow = (
  plazoMeses: number,
  vuRemMeses: number,
  invCalc: number,
  cFijos: number,
  margenMes: number,
  vVentaFin: number,
  tnaVal: number
): { rows: FlujoReportRow[]; vanCalc: number; mesRepagoCalc: number } => {
  const nPlazo = Math.max(0, Math.round(plazoMeses));
  const nVuRem = Math.max(1, Math.round(vuRemMeses));
  const totalMeses = nPlazo + nVuRem;
  const im = (tnaVal / 100) / 12;

  const rows: FlujoReportRow[] = [];
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

export const exportFinancialEvaluationPDF = async (
  entry: MaintenanceEntry,
  equipment: Equipment | null,
  passedEval?: EvaluacionIngresoTaller | null
) => {
  if (!entry) return;

  const eq = equipment;

  // Cargar evaluación económico-financiera si no fue pasada
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
      console.warn('Error al consultar evaluación en Supabase:', e);
    }
  }

  if (!evalData) {
    try {
      const cached = localStorage.getItem(`eval_intervencion_${entry.id}`);
      if (cached) {
        evalData = JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Error al leer evaluación de caché local:', e);
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
  const todayFormatted = todayRaw.toLocaleDateString('es-AR');
  const fechaEmisionForFile = todayFormatted.replace(/\//g, '-');

  const formatUSD = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return 'USD 0';
    return `USD ${Math.round(val).toLocaleString('de-DE')}`;
  };

  // --- HEADER SUPERIOR ---
  doc.setFillColor(30, 41, 59); // Slate 800
  doc.rect(0, 0, 210, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.text('GEyT', 14, 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text('EVALUACIÓN ECONÓMICO-FINANCIERA DE LA INTERVENCIÓN', 200, 11, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Informe Financiero y Flujo de Fondos | Emisión: ${todayFormatted}`, 200, 17, { align: 'right' });

  // --- RECUADRO DE DATOS DEL EQUIPO Y FALLA ANALIZADA ---
  let startY = 28;

  // Calculamos altura para incluir datos del equipo y la falla
  const fallasText = sanitizePdfText(entry.informe_fallas) || 'Sin informe de falla especificado.';
  const splitFalla = doc.splitTextToSize(fallasText, 136);
  const fallaLines = splitFalla.length;
  const eqBoxH = Math.max(48, 38 + (fallaLines * 3.8));

  doc.setFillColor(248, 250, 252); // Slate 50
  doc.rect(14, startY, 182, eqBoxH, 'F');
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.rect(14, startY, 182, eqBoxH, 'S');

  // Badge Interno lateral
  doc.setFillColor(30, 58, 138); // Blue 900
  doc.roundedRect(18, startY + 8, 28, 14, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(entry.equipo_id, 32, startY + 17, { align: 'center' });

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
  doc.text('Marca / Modelo:', 52, startY + 12.5);
  doc.setFont('helvetica', 'bold');
  const sanitizedMarcaModelo = sanitizePdfText(`${eq?.marca || ''} ${eq?.modelo || ''}`.trim()) || 'N/D';
  doc.text(sanitizedMarcaModelo, 78, startY + 12.5, { maxWidth: 114 });

  // Línea 3: Año y Hs de Arrastre
  doc.setFont('helvetica', 'normal');
  doc.text('Año:', 52, startY + 18.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${eq?.year || 'N/D'}`, 61, startY + 18.5);

  doc.setFont('helvetica', 'normal');
  doc.text('Hs de Arrastre:', 105, startY + 18.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${eq?.horas !== undefined && eq?.horas !== null ? eq.horas.toLocaleString('es-AR') : '0'} hs`, 130, startY + 18.5);

  // Línea 4: Propietario y Obra / Estado
  doc.setFont('helvetica', 'normal');
  doc.text('Propietario:', 52, startY + 24.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 105, 161);
  doc.text(sanitizePdfText(eq?.propietario) || 'N/D', 71, startY + 24.5, { maxWidth: 32 });

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.text('Obra Asignada:', 105, startY + 24.5);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitizePdfText(entry.obra_asignada) || 'Sin asignar', 130, startY + 24.5, { maxWidth: 62 });

  // Línea 5: BLOQUE DE LA FALLA ANALIZADA FINANCIERAMENTE
  doc.setFillColor(254, 242, 242); // Rose 50
  doc.roundedRect(50, startY + 29, 142, (fallaLines * 3.8) + 6, 1.5, 1.5, 'F');
  doc.setDrawColor(254, 205, 211); // Rose 200
  doc.roundedRect(50, startY + 29, 142, (fallaLines * 3.8) + 6, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(159, 18, 57); // Rose 900
  doc.text('FALLA ANALIZADA FINANCIERAMENTE:', 53, startY + 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text(splitFalla, 53, startY + 38);

  startY += eqBoxH + 4;

  if (evalData) {
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

    // --- 1. TABLA: VALORES ESTIMADOS DE DONDE PARTE EL ANÁLISIS ---
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
      startY: startY,
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

    // --- 2. TABLA: INDICADORES FINANCIEROS PRINCIPALES ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 58, 138);
    doc.text('RESULTADOS E INDICADORES CALCULADOS DE LA EVALUACIÓN:', 14, startY + 3);

    startY += 4.5;

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
        fontSize: 7.2,
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
        cellPadding: 2.2,
        lineColor: [203, 213, 225],
        lineWidth: 0.1
      }
    });

    startY = (doc as any).lastAutoTable.finalY + 3;

    // --- 3. RECUADRO: ANÁLISIS DEL PARÁMETRO COBERTURA ---
    const cobValNum = cob !== null ? cob : 0;
    const isCobOptima = cobValNum >= 1.2;
    const isCobAceptable = cobValNum >= 1.0 && cobValNum < 1.2;

    const bgBox = isCobOptima ? [240, 253, 244] : isCobAceptable ? [254, 252, 232] : [255, 241, 242];
    const borderBox = isCobOptima ? [187, 247, 208] : isCobAceptable ? [254, 240, 138] : [254, 205, 211];
    const textTitleBox = isCobOptima ? [22, 101, 52] : isCobAceptable ? [133, 77, 14] : [159, 18, 57];

    doc.setFillColor(bgBox[0], bgBox[1], bgBox[2]);
    doc.rect(14, startY, 182, 14, 'F');
    doc.setDrawColor(borderBox[0], borderBox[1], borderBox[2]);
    doc.rect(14, startY, 182, 14, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(textTitleBox[0], textTitleBox[1], textTitleBox[2]);
    doc.text(`ANÁLISIS DEL PARÁMETRO COBERTURA (Índice: ${cob !== null ? cob.toFixed(2) : '-'} | Dictamen: ${isCobOptima ? 'HOLGADA (>= 1.20)' : isCobAceptable ? 'AJUSTADA (1.00 a 1.19)' : 'INSUFICIENTE (< 1.00)'}):`, 17, startY + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(51, 65, 85);
    doc.text('- Si la Cobertura es mayor o igual a 1: la intervención se repaga en la vida remanente con el margen operativo disponible.', 17, startY + 8);
    doc.setFont('helvetica', 'bold');
    doc.text('- Recomendación: Se recomienda exigir 1,2 o más para absorber desvíos del presupuesto de taller, de la vida remanente o de la utilización.', 17, startY + 11.5);

    startY += 17;

    // --- 4. COMPARATIVA DE COSTOS MENSUALES CON GRÁFICOS DE BARRAS VISUALES ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text('COMPARACIÓN DE COSTOS MENSUALES (REPARACIÓN vs EQUIPO NUEVO vs ALQUILER):', 14, startY + 2);

    startY += 4;

    const maxCostoComp = Math.max(costoReparacion, costoNuevo, costoAlquiler, 1);
    const barAvailableW = 66; // mm para barra gráfica (starts at 64, ends at 130)

    // Fondo para el gráfico de barras
    doc.setFillColor(248, 250, 252);
    doc.rect(14, startY, 182, 28, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, startY, 182, 28, 'S');

    const drawCostBar = (label: string, costVal: number, yPos: number, isBest: boolean) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(30, 41, 59);
      doc.text(label, 17, yPos + 4);

      // Barra de fondo
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(64, yPos, barAvailableW, 5.2, 1, 1, 'F');

      // Barra de valor
      const barW = Math.max(3, (costVal / maxCostoComp) * barAvailableW);
      if (isBest) {
        doc.setFillColor(22, 163, 74); // Green 600
      } else {
        doc.setFillColor(245, 158, 11); // Amber 500
      }
      doc.roundedRect(64, yPos, barW, 5.2, 1, 1, 'F');

      // Valor numérico a la derecha (starts at 134, box ends at 196)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(isBest ? 22 : 51, isBest ? 101 : 65, isBest ? 52 : 85);
      const textTag = formatUSD(costVal) + '/mes' + (isBest ? '  [Más Económica]' : '');
      doc.text(textTag, 134, yPos + 4);
    };

    drawCostBar('1. Reparación Intervención:', costoReparacion, startY + 3, costoReparacion === minCosto);
    drawCostBar('2. Invertir en Equipo Nuevo:', costoNuevo, startY + 11, costoNuevo === minCosto);
    drawCostBar('3. Alquiler de Mercado:', costoAlquiler, startY + 19, costoAlquiler === minCosto);

    startY += 31;

    // --- 5. RECUADRO: DECISIÓN FINAL SOBRE LA INTERVENCIÓN ---
    const decisionTexto = sanitizePdfText(evalData.decision_final);
    const comentariosTexto = sanitizePdfText(evalData.comentarios);

    let decBg = [248, 250, 252];
    let decBorder = [203, 213, 225];
    let decBadgeBg = [71, 85, 105];
    let decTitleColor = [30, 41, 59];

    if (decisionTexto === 'Realizar Intervención') {
      decBg = [240, 253, 244];
      decBorder = [187, 247, 208];
      decBadgeBg = [21, 128, 61];
      decTitleColor = [22, 101, 52];
    } else if (decisionTexto === 'Vender el equipo como está') {
      decBg = [250, 245, 255];
      decBorder = [233, 213, 255];
      decBadgeBg = [126, 34, 206];
      decTitleColor = [88, 28, 135];
    } else if (decisionTexto === 'Realizar una reparación parcial') {
      decBg = [254, 252, 232];
      decBorder = [254, 240, 138];
      decBadgeBg = [161, 98, 7];
      decTitleColor = [113, 63, 18];
    } else if (decisionTexto === 'Buscar alternativas') {
      decBg = [239, 246, 255];
      decBorder = [191, 219, 254];
      decBadgeBg = [29, 78, 216];
      decTitleColor = [30, 58, 138];
    } else if (decisionTexto === 'Comentarios') {
      decBg = [248, 250, 252];
      decBorder = [226, 232, 240];
      decBadgeBg = [71, 85, 105];
      decTitleColor = [15, 23, 42];
    }

    let splitComms: string[] = [];
    if (comentariosTexto) {
      splitComms = doc.splitTextToSize(`Comentarios y Fundamento: ${comentariosTexto}`, 174);
    }
    const decBoxH = Math.max(14, 9 + (splitComms.length * 3.6));

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

    // --- 6. PROYECCIÓN DEL FLUJO DE FONDOS DESCONTADO ---
    const cf = buildFinancialCashFlow(
      evalData.plazo_est_meses || 0,
      evalData.vida_util_rem_meses || 0,
      inv,
      cFijos,
      marg,
      Number(evalData.valor_venta_final) || 0,
      tnaVal
    );

    // Título de la tabla de Flujo de Fondos
    doc.setFillColor(30, 41, 59); // Slate 800
    doc.rect(14, startY, 182, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    const cfTitle = `PROYECCIÓN DEL FLUJO DE FONDOS DESCONTADO (Mes 0 al Mes ${cf.rows.length - 1} | VAN: ${formatUSD(vanVal)} | Repago s/ Residual: ${repagoVal && repagoVal > 0 ? 'Mes ' + repagoVal : 'No alcanzado'})`;
    doc.text(cfTitle, 17, startY + 4.2);

    const cfTableRows = cf.rows.map((r) => [
      r.mes,
      r.fase,
      r.margenOperativo > 0 ? formatUSD(r.margenOperativo) : '-',
      r.costosFijosTaller > 0 ? formatUSD(r.costosFijosTaller) : '-',
      r.inversion > 0 ? formatUSD(r.inversion) : '-',
      r.residual > 0 ? formatUSD(r.residual) : '-',
      formatUSD(r.flujoNeto),
      r.factorDescuento.toFixed(4),
      formatUSD(r.valorActual),
      formatUSD(r.vaAcumuladoSinResidual)
    ]);

    autoTable(doc, {
      startY: startY + 6,
      head: [['Mes', 'Fase', 'Margen Oper.', 'Costos Fijos', 'Inversión', 'Residual', 'Flujo Neto', 'Factor Desc.', 'Valor Actual', 'VA Acum. s/ Resid.']],
      body: cfTableRows,
      theme: 'grid',
      showHead: 'everyPage',
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        fontSize: 6.5,
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 18, halign: 'right' },
        3: { cellWidth: 18, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 18, halign: 'right' },
        6: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
        7: { cellWidth: 18, halign: 'right' },
        8: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
        9: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
      },
      styles: {
        fontSize: 6,
        cellPadding: 1.5,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rowMes = data.row.index;
          const isRepago = cf.mesRepagoCalc > 0 && rowMes === cf.mesRepagoCalc;
          if (isRepago) {
            data.cell.styles.fillColor = [240, 253, 244]; // Highlight green payback
          }
          if (data.column.index === 6 || data.column.index === 8 || data.column.index === 9) {
            const rawText = String(data.cell.raw || '');
            if (rawText.startsWith('-') || rawText.includes('-USD') || (data.column.index === 6 && cf.rows[rowMes]?.flujoNeto < 0) || (data.column.index === 8 && cf.rows[rowMes]?.valorActual < 0) || (data.column.index === 9 && cf.rows[rowMes]?.vaAcumuladoSinResidual < 0)) {
              data.cell.styles.textColor = [185, 28, 28]; // Red
            } else if (rawText !== '-') {
              data.cell.styles.textColor = [21, 128, 61]; // Green
            }
          }
        }
      }
    });
  }

  // --- FOOTER CON PAGINACIÓN DINÁMICA ---
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text(`GEyT - Evaluación Económico-Financiera | Equipo: ${entry.equipo_id}`, 14, 290);
    doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: 'center' });
    doc.text(`Emisión: ${todayFormatted}`, 196, 290, { align: 'right' });
  }

  // Nombre de archivo
  const safeInterno = (entry.equipo_id || 'Equipo').trim().replace(/[\/\\:*?"<>|]/g, '_');
  const fileName = `${safeInterno}_EvaluacionFinanciera_${fechaEmisionForFile}.pdf`;
  doc.save(fileName);
};
