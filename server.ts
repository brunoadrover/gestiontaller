import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PolishSummaryBody {
  draftSummary?: unknown;
  context?: {
    equipoId?: unknown;
    taller?: unknown;
    fechaIngreso?: unknown;
    fechaFin?: unknown;
    diasRepuestos?: unknown;
    diasReparacion?: unknown;
    diasPrueba?: unknown;
    fallaInicial?: unknown;
    observaciones?: unknown;
    avances?: Array<{
      fecha?: unknown;
      responsable?: unknown;
      descripcion?: unknown;
    }>;
  };
}

const SYSTEM_INSTRUCTION = `Eres un redactor técnico especializado en informes de mantenimiento de maquinaria pesada y talleres industriales en español.
Tu tarea es redactar el apartado "RESUMEN DE LA INTERVENCIÓN" para un informe PDF oficial ("Carpeta de Arrastre").

Instrucciones obligatorias:
- Corrige la redacción del resumen, eliminando o modificando palabras, eliminando nombres de colaboradores repetidos (si el responsable es "Taller" o "Compras" modificar a "personal de taller" o "personal de compras") para que la redacción de todo el texto sea coherente y profesional.
- También, para el mismo fin, agrupa los avances que sean repetidos o similares.
- El texto debe contar la historia, lo mejor posible, de la estadía del equipo en el taller, manteniendo un relato cronológico, fluido, claro y profesional.
- No incluyas las palabras predefinidas "Avance", "RC", "SOTT" ni los números de comprobantes o códigos asociados a ellos.
- Conserva con exactitud las fechas de ingreso y salida/actual, el código interno del equipo, el taller asignado y los días de estadía (esperando repuestos y en reparación) proporcionados en los datos.
- Responde ÚNICAMENTE con el texto plano del resumen en uno o dos párrafos continuos, sin títulos, sin viñetas, sin formato Markdown (nada de asteriscos ni negritas) ni frases introductorias.`;

async function generatePolishedSummary(ai: GoogleGenAI, promptContent: string): Promise<string> {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptContent,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const text = (response.text ?? '').trim();
      if (!text) {
        throw new Error('La respuesta del modelo estuvo vacía.');
      }
      return text;
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code;
      const isTransient =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        /network|timeout|ECONNRESET|fetch failed/i.test(String(err?.message || ''));

      if (attempt < maxAttempts && isTransient) {
        await sleep(500 * Math.pow(2, attempt - 1));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/gemini/polish-summary', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as PolishSummaryBody;
      const draftSummary = typeof body.draftSummary === 'string' ? body.draftSummary.trim() : '';

      if (!draftSummary || draftSummary.length > 25000) {
        res.status(400).json({ error: 'El borrador del resumen es inválido o excede el tamaño permitido.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(500).json({
          error: 'No se encontró GEMINI_API_KEY en el servidor. Verifica la clave en Settings > Secrets.',
        });
        return;
      }

      const ctx = body.context || {};
      const avancesList = Array.isArray(ctx.avances)
        ? ctx.avances
            .slice(0, 150)
            .map((a, idx) => {
              const fecha = typeof a?.fecha === 'string' ? a.fecha : '';
              const resp = typeof a?.responsable === 'string' ? a.responsable : '';
              const desc = typeof a?.descripcion === 'string' ? a.descripcion : '';
              return `${idx + 1}. [${fecha}] (${resp}): ${desc}`;
            })
            .join('\n')
        : '';

      const userPrompt = [
        'Corrige la redacción del resumen, eliminando o modificando palabras, eliminando nombres de colaboradores repetidos (si el responsable es "Taller" o "Compras" modificar a "personal de taller" o "personal de compras") para que la redacción de todo el texto sea coherente y profesional. También, para el mismo fin, agrupar los avances que sean repetidos o similares. El texto debe contar la historia, lo mejor posible, de la estadía del equipo en el taller.',
        '',
        '--- BORRADOR BASE DEL RESUMEN ---',
        draftSummary,
        '',
        '--- DATOS DE CONTEXTO ---',
        `Equipo: ${typeof ctx.equipoId === 'string' ? ctx.equipoId : ''}`,
        `Taller asignado: ${typeof ctx.taller === 'string' ? ctx.taller : ''}`,
        `Fecha ingreso: ${typeof ctx.fechaIngreso === 'string' ? ctx.fechaIngreso : ''}`,
        `Fecha salida / actual: ${typeof ctx.fechaFin === 'string' ? ctx.fechaFin : ''}`,
        `Días esperando repuestos: ${Number(ctx.diasRepuestos) || 0}`,
        `Días en reparación: ${Number(ctx.diasReparacion) || 0}`,
        Number(ctx.diasPrueba) > 0 ? `Días en prueba: ${Number(ctx.diasPrueba)}` : '',
        typeof ctx.fallaInicial === 'string' && ctx.fallaInicial.trim()
          ? `Motivo de ingreso / falla inicial: ${ctx.fallaInicial.trim()}`
          : '',
        typeof ctx.observaciones === 'string' && ctx.observaciones.trim()
          ? `Observaciones de salida: ${ctx.observaciones.trim()}`
          : '',
        avancesList ? `\n--- HISTORIAL CRONOLÓGICO DE AVANCES ---\n${avancesList}` : '',
      ]
        .filter((line) => line !== undefined)
        .join('\n');

      const polished = await generatePolishedSummary(ai, userPrompt);
      res.json({ summary: polished });
    } catch (err: any) {
      const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502;
      const message = err?.message || 'Error al procesar el resumen con Gemini.';
      console.error('Error en /api/gemini/polish-summary:', err);
      res.status(status).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use((_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
