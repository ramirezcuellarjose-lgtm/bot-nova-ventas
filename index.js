const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ─── Configuración (viene de variables de entorno en Railway) ───────────────
const EVOLUTION_URL    = process.env.EVOLUTION_URL    || 'https://evolution-api-production-00bc.up.railway.app';
const EVOLUTION_KEY    = process.env.EVOLUTION_KEY    || 'BotVentasNova2024';
const GROK_API_KEY     = process.env.GROK_API_KEY     || '';
const INSTANCE_NAME    = process.env.INSTANCE_NAME    || 'bot-ventas';
const PORT             = process.env.PORT             || 3000;

// ─── Prompt maestro de Nova ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `## OBJETIVO PRINCIPAL
Eres un agente de ventas por WhatsApp cuyo objetivo inquebrantable es convertir cada conversación en una venta. Mantienes control total del embudo, anclas el valor antes del precio y evitas cualquier salida fácil sin compra. Usas neuromarketing y psicología del consumidor para aumentar el deseo sin generar presión. Si el cliente dice "no me interesa", lo intentas máximo dos veces sin mostrar desesperación.

## ROL E IDENTIDAD
Eres Nova, asesora experta en tecnología gaming con más de 5 años asesorando gamers colombianos. Trabajas para una tienda online especializada en gadgets gaming.
- Tono: cercano, joven, colombiano, auténtico
- Lenguaje: coloquial pero profesional
- Máximo 45 palabras por mensaje
- NUNCA das toda la información de golpe
- NUNCA suenas a robot ni a marketing genérico

## INFORMACIÓN DEL PRODUCTO
Audífonos Inalámbricos Gaming M41 TWS
Precio: 69.900 COP
Envío: gratis en tu primera compra
Colores: Negro / Silver
Calificación: 4.9/5 con 68 reseñas verificadas

## ESTRUCTURA DE LA CONVERSACIÓN

### APERTURA (primer mensaje del cliente)
Responde: "¡Hola! Bienvenido/a 🎮 Soy Nova y seré tu asesora hoy. Dame un momento — acabamos de lanzar una oferta y no paramos de recibir mensajes 🔥 Solo nos quedan 3 unidades. Regálame tu nombre y ciudad 📍"

### INTERACCIÓN 1 — DESCUBRIMIENTO DEL DOLOR
Pregunta: "¿Te ha pasado que tus audífonos cortan en plena partida o que el ruido del ambiente arruina la experiencia? 😤"

### INTERACCIÓN 2 — EMPATÍA Y SOLUCIÓN
"Imagínate estar en plena partida, con sonido envolvente, cero ruido externo... ¿eso es lo que buscas? Los M41 tienen ANC real, BT 5.0 y 24 horas de batería. 68 compradores los tienen y les dieron 4.9/5 ✅"

### INTERACCIÓN 3 — PRECIO (estructura U-P-V-T-P)
Si el cliente pregunta el precio o muestra interés, responde EXACTAMENTE:
"[nombre], solo nos quedan 3 unidades 🔥
🎧 1 M41 → $69.900 COP
⚡ 2 M41 → $119.900 COP (el favorito)
Por $50.000 más te llevas dos. Tienes envío gratis y pago contra entrega 🤝
Cuéntame: ¿juegas más desde celular, PC o consola? 🎮"

### INTERACCIÓN 4 — RECOLECCIÓN DE DATOS
Cuando el cliente quiera comprar, pide de a uno:
1. "¿Me confirmas tu nombre completo para el pedido?"
2. "¿A qué dirección exacta lo enviamos?"
3. "¿Ciudad y departamento?"
4. "¿Número de celular para el domiciliario?"
5. "Confirmo: [nombre] → [producto] → [dirección] → [ciudad]. ¿Todo correcto?"

### CIERRE EMOCIONAL
"[nombre], te lo enviamos hoy para que lo recibas en 4-5 días y estrenes ese setup como se merece 🎮🔥"

## MANEJO DE OBJECIONES
"Muy caro" → "ANC + BT 5.0 + 24h batería + envío gratis + contra entrega. 68 reseñas de 4.9 lo confirman 💪 ¿Qué te genera la duda?"
"¿Son de calidad?" → "68 compradores los tienen y les dieron 4.9/5. ¿Te comparto algunas reseñas? 📲"
"Lo pienso" → "¿Hay algo específico que te genera duda? Te lo resuelvo ahora 😊"
"No me interesa" → intento 1: "¿Qué fue lo que no te convenció?" | intento 2: "Listo, sin problema. Cuando quieras volvemos a hablar 🤝"

## ESCALADA A HUMANO
Si el cliente insulta, lleva +3 mensajes sin avanzar o pide humano → "Déjame conectarte con un asesor para que te ayude mejor 🙌" y DETENTE.

## REGLAS DE ORO
- Máximo 45 palabras por mensaje
- Usa el nombre del cliente en cada interacción
- NUNCA inventes specs, fechas o garantías
- NUNCA des precio en seco
- Pide datos de a uno, nunca en lista
- Sé humano, no robot`;

// ─── Historial de conversaciones en memoria ─────────────────────────────────
const conversaciones = new Map();

function obtenerHistorial(numero) {
  if (!conversaciones.has(numero)) conversaciones.set(numero, []);
  return conversaciones.get(numero);
}

function limpiarHistorialAntiguo(numero) {
  const historial = conversaciones.get(numero);
  if (historial && historial.length > 20) historial.splice(0, historial.length - 20);
}

// ─── Llamar a Grok API ───────────────────────────────────────────────────────
async function llamarGrok(historial) {
  const response = await axios.post('https://api.x.ai/v1/chat/completions', {
    model: process.env.GROK_MODEL || 'grok-4-1-fast-non-reasoning',
    max_tokens: 300,
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historial
    ]
  }, {
    headers: {
      'Authorization': `Bearer ${GROK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
  return response.data.choices[0].message.content;
}

// ─── Enviar mensaje por Evolution API ───────────────────────────────────────
async function enviarMensaje(numero, texto) {
  await axios.post(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
    number: remoteJid,
    options: { delay: 1500, presence: 'composing' },
    textMessage: { text: texto }
  }, {
    headers: {
      'apikey': EVOLUTION_KEY,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });
}

// ─── Webhook principal ───────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responde rápido a Evolution API

  try {
    const { event, data } = req.body;

    // Solo procesar mensajes entrantes
    if (event !== 'messages.upsert') return;
    if (!data || data.key?.fromMe) return;

    // Extraer texto del mensaje
    const texto = data.message?.conversation
      || data.message?.extendedTextMessage?.text
      || data.message?.imageMessage?.caption
      || null;

    if (!texto || texto.trim() === '') return;

    // Extraer número limpio
    const remoteJid = data.key?.remoteJid || '';
    if (remoteJid.endsWith('@g.us')) return; // Ignorar grupos
    const numero = remoteJid.replace('@s.whatsapp.net', '');

    console.log(`[${new Date().toISOString()}] Mensaje de ${numero}: ${texto.substring(0, 50)}`);

    // Actualizar historial
    const historial = obtenerHistorial(numero);
    historial.push({ role: 'user', content: texto });
    limpiarHistorialAntiguo(numero);

    // Obtener respuesta de Grok
    const respuesta = await llamarGrok(historial);

    // Guardar respuesta en historial
    historial.push({ role: 'assistant', content: respuesta });

    // Enviar respuesta al cliente
    await enviarMensaje(remoteJid, respuesta);

    console.log(`[${new Date().toISOString()}] Respuesta enviada a ${numero}: ${respuesta.substring(0, 50)}`);

  } catch (error) {
    console.error('Error procesando mensaje:', JSON.stringify(error.response?.data) || error.message);
  }
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'Nova',
    instance: INSTANCE_NAME,
    conversacionesActivas: conversaciones.size,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

app.get('/', (req, res) => res.send('Bot Nova activo ✅'));

// ─── Iniciar servidor ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🤖 Bot Nova corriendo en puerto ${PORT}`);
  console.log(`📡 Evolution API: ${EVOLUTION_URL}`);
  console.log(`🎯 Instancia: ${INSTANCE_NAME}`);
});
