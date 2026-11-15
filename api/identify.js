// Identificación de setas por foto con Claude (Anthropic).
// Necesita la variable de entorno ANTHROPIC_API_KEY en Vercel (Settings → Environment Variables).
// Opcionales: CLAUDE_MODEL (por defecto claude-sonnet-5-5), MAX_POR_HORA (por defecto 20 por persona).

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const MAX_POR_HORA = parseInt(process.env.MAX_POR_HORA || "20", 10);
const hits = new Map(); // límite sencillo por IP (en memoria, por instancia)

const IDS = "tentullo (Boletus aereus), reticulado (Boletus reticulatus), tana (Amanita caesarea), gallipierno (Macrolepiota procera), niscalo (Lactarius deliciosus/sanguifluus), rebozuelo (Cantharellus cibarius/pallens), trompeta (Craterellus cornucopioides), lengua (Hydnum repandum), cardo (Pleurotus eryngii), champi (Agaricus campestris), pieazul (Lepista nuda), barbuda (Coprinus comatus), higado (Fistulina hepatica), criadilla (Terfezia), phalloides (Amanita phalloides), verna (Amanita verna/virosa), lepiotas (Lepiota pequeñas mortales), galerina (Galerina marginata), cortinarius (Cortinarius orellanus y afines), pantherina (Amanita pantherina), muscaria (Amanita muscaria), satanas (Rubroboletus satanas), omphalotus (Omphalotus olearius), entoloma (Entoloma sinuatum), hypholoma (Hypholoma fasciculare)";

const SYSTEM = `Eres un micólogo experto del Campo de Gibraltar (Cádiz, España: Los Alcornocales, alcornocal, quejigal, pinares y dehesas). Analizas fotos de setas que manda gente que sale al campo.
Reglas de seguridad obligatorias:
- Nunca digas que una seta es segura para comer ni que "se puede comer". Como mucho, que "podría ser" una especie comestible.
- Si entre las posibles hay alguna tóxica o mortal, o la foto no permite descartarlas (no se ve la base del pie, las láminas, etc.), el peligro es "alto" o "medio".
- Ten muy presentes las amanitas mortales (phalloides, verna/virosa), las lepiotas pequeñas, Galerina y Cortinarius.
- La recomendación siempre incluye que la revise un experto con la seta delante antes de comerla.
Responde SOLO con un objeto JSON válido, sin texto antes ni después, con esta forma:
{"es_seta":true,"calidad_foto":"buena|regular|mala","consejo_foto":"qué foto falta para identificarla mejor","candidatas":[{"id":"uno de los ids de la lista o 'otra'","nombre":"nombre común en español","cientifico":"nombre científico","confianza":0,"comestibilidad":"comestible|toxica|mortal|desconocida","rasgos":"rasgos que se ven en la foto y la apoyan"}],"descripcion":"descripción breve de lo que se ve (sombrero, láminas/poros, pie, base, hábitat)","peligro":"alto|medio|bajo","parecidas_peligrosas":["nombre común (científico)"],"recomendacion":"qué debe hacer la persona"}
Da entre 1 y 3 candidatas ordenadas de más a menos probable. La confianza es un porcentaje honesto; si la foto es mala, baja la confianza.
Ids de especies de la app: ${IDS}. Si no es ninguna de esas, usa "otra" y escribe el nombre.
Escribe en español sencillo de España.`;

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  if (req.method === "GET") return send(res, 200, { ok: true, configurada: !!process.env.ANTHROPIC_API_KEY });
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 501, { error: "La identificación por foto no está activada todavía." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
  const now = Date.now(), win = 3600e3;
  const h = (hits.get(ip) || []).filter(t => now - t < win);
  if (h.length >= MAX_POR_HORA) return send(res, 429, { error: "Has hecho muchas fotos seguidas. Espera un rato y vuelve a probar." });
  h.push(now); hits.set(ip, h);

  let body = req.body;
  try { if (typeof body === "string") body = JSON.parse(body); } catch (e) { body = null; }
  if (!body || !body.image) return send(res, 400, { error: "Falta la foto." });
  const mime = /^image\/(jpeg|png|webp)$/.test(body.mime || "") ? body.mime : "image/jpeg";
  const data = String(body.image).replace(/^data:image\/\w+;base64,/, "");
  if (data.length > 4_000_000) return send(res, 413, { error: "La foto es demasiado grande." });

  const extra = [];
  if (body.mes) extra.push("Mes actual: " + body.mes + ".");
  if (body.lugar) extra.push("Lugar aproximado: " + String(body.lugar).slice(0, 80) + ".");
  if (body.nota) extra.push("Nota de la persona: " + String(body.nota).slice(0, 300));

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1200, system: SYSTEM,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mime, data } },
          { type: "text", text: "Identifica esta seta del Campo de Gibraltar. " + extra.join(" ") }
        ] }]
      })
    });
    const j = await r.json();
    if (!r.ok) return send(res, 502, { error: "El servicio de identificación ha fallado.", detalle: j && j.error && j.error.message });
    const txt = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return send(res, 502, { error: "No se pudo leer la respuesta." });
    let out; try { out = JSON.parse(m[0]); } catch (e) { return send(res, 502, { error: "No se pudo leer la respuesta." }); }
    return send(res, 200, { ok: true, modelo: MODEL, resultado: out });
  } catch (e) {
    return send(res, 502, { error: "No se pudo conectar con el servicio de identificación." });
  }
};
