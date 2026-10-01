const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || "";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "files.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");

function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return []; }
}
function writeDb(items) {
  fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2));
}
function cleanName(name) {
  return name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180);
}
function publicUrl(req, id) {
  const base = BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}/archivo/${encodeURIComponent(id)}`;
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const id = crypto.randomUUID();
    cb(null, `${id}__${cleanName(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));

app.get("/api/files", (req, res) => {
  const q = String(req.query.q || "").toLowerCase().trim();
  let items = readDb().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (q) items = items.filter(x =>
    x.name.toLowerCase().includes(q) ||
    (x.description || "").toLowerCase().includes(q)
  );
  res.json(items.map(x => ({...x, url: publicUrl(req, x.id)})));
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({error: "No se recibió ningún archivo."});
  const id = req.file.filename.split("__")[0];
  const item = {
    id,
    name: req.body.name?.trim() || req.file.originalname,
    description: req.body.description?.trim() || "",
    originalName: req.file.originalname,
    storedName: req.file.filename,
    mime: req.file.mimetype,
    size: req.file.size,
    createdAt: new Date().toISOString()
  };
  const db = readDb();
  db.push(item);
  writeDb(db);
  res.json({...item, url: publicUrl(req, id)});
});

app.get("/api/files/:id/qr", async (req, res) => {
  const item = readDb().find(x => x.id === req.params.id);
  if (!item) return res.status(404).send("Archivo no encontrado");
  try {
    const png = await QRCode.toBuffer(publicUrl(req, item.id), {
      width: 700, margin: 2, errorCorrectionLevel: "H"
    });
    res.type("png").send(png);
  } catch (e) {
    res.status(500).send("No fue posible generar el QR");
  }
});

app.get("/api/files/:id/download", (req, res) => {
  const item = readDb().find(x => x.id === req.params.id);
  if (!item) return res.status(404).send("Archivo no encontrado");
  const full = path.join(UPLOAD_DIR, item.storedName);
  if (!fs.existsSync(full)) return res.status(404).send("Archivo no encontrado en almacenamiento");
  res.download(full, item.originalName);
});

app.delete("/api/files/:id", (req, res) => {
  const db = readDb();
  const idx = db.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({error: "Archivo no encontrado"});
  const [item] = db.splice(idx, 1);
  const full = path.join(UPLOAD_DIR, item.storedName);
  if (fs.existsSync(full)) fs.unlinkSync(full);
  writeDb(db);
  res.json({ok:true});
});

app.get("/archivo/:id", (req, res) => {
  res.sendFile(path.join(ROOT, "public", "viewer.html"));
});

app.get("/api/view/:id", (req, res) => {
  const item = readDb().find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({error: "Archivo no encontrado"});
  res.json({...item, downloadUrl: `/api/files/${item.id}/download`, url: publicUrl(req, item.id)});
});

app.get("/api/raw/:id", (req, res) => {
  const item = readDb().find(x => x.id === req.params.id);
  if (!item) return res.status(404).send("Archivo no encontrado");
  const full = path.join(UPLOAD_DIR, item.storedName);
  if (!fs.existsSync(full)) return res.status(404).send("Archivo no encontrado");
  res.setHeader("Content-Type", item.mime || "application/octet-stream");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(full);
});

app.listen(PORT, () => {
  console.log(`Horizontes funcionando en http://localhost:${PORT}`);
  if (BASE_URL) console.log(`BASE_URL: ${BASE_URL}`);
});
