const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || "";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || "horizontes";

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(__dirname + "/public"));

function pageUrl(req, id) {
  const base = BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}/archivo/${encodeURIComponent(id)}`;
}
function publicFileUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
function safeName(name) {
  return name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180);
}

app.get("/api/files", async (req, res) => {
  const { data, error } = await supabase.from("documentos").select("*").order("creado_en", {ascending:false});
  if (error) return res.status(500).json({error:error.message});
  const q = String(req.query.q || "").toLowerCase().trim();
  let items = data || [];
  if (q) items = items.filter(x => x.nombre.toLowerCase().includes(q) || (x.descripcion||"").toLowerCase().includes(q) || x.nombre_original.toLowerCase().includes(q));
  res.json(items.map(x => ({
    id:x.id, name:x.nombre, description:x.descripcion||"", originalName:x.nombre_original,
    mime:x.tipo_mime, size:x.tamano, createdAt:x.creado_en,
    url:pageUrl(req,x.id), fileUrl:publicFileUrl(x.ruta_archivo)
  })));
});

app.post("/api/upload", upload.single("file"), async (req,res) => {
  try {
    if (!req.file) return res.status(400).json({error:"No se recibió ningún archivo."});
    const id = crypto.randomUUID();
    const storagePath = `${id}/${safeName(req.file.originalname)}`;

    const up = await supabase.storage.from(BUCKET).upload(storagePath, req.file.buffer, {
      contentType:req.file.mimetype || "application/octet-stream", upsert:false
    });
    if (up.error) return res.status(500).json({error:"No se pudo guardar el archivo: "+up.error.message});

    const row = {
      id,
      nombre:req.body.name?.trim() || req.file.originalname,
      descripcion:req.body.description?.trim() || "",
      nombre_original:req.file.originalname,
      ruta_archivo:storagePath,
      tipo_mime:req.file.mimetype || "application/octet-stream",
      tamano:req.file.size
    };
    const db = await supabase.from("documentos").insert(row);
    if (db.error) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return res.status(500).json({error:"No se pudo registrar el archivo: "+db.error.message});
    }
    res.json({id,name:row.nombre,description:row.descripcion,originalName:row.nombre_original,url:pageUrl(req,id),fileUrl:publicFileUrl(storagePath)});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/files/:id/qr", async (req,res) => {
  const {data,error}=await supabase.from("documentos").select("id").eq("id",req.params.id).single();
  if(error||!data) return res.status(404).send("Archivo no encontrado");
  const png=await QRCode.toBuffer(pageUrl(req,data.id),{width:700,margin:2,errorCorrectionLevel:"H"});
  res.type("png").send(png);
});

app.get("/api/view/:id", async (req,res) => {
  const {data,error}=await supabase.from("documentos").select("*").eq("id",req.params.id).single();
  if(error||!data) return res.status(404).json({error:"Archivo no encontrado"});
  res.json({id:data.id,name:data.nombre,description:data.descripcion||"",originalName:data.nombre_original,mime:data.tipo_mime,size:data.tamano,createdAt:data.creado_en,downloadUrl:`/api/files/${data.id}/download`,fileUrl:publicFileUrl(data.ruta_archivo),url:pageUrl(req,data.id)});
});

app.get("/api/files/:id/download", async (req,res) => {
  const {data,error}=await supabase.from("documentos").select("*").eq("id",req.params.id).single();
  if(error||!data) return res.status(404).send("Archivo no encontrado");
  const result=await supabase.storage.from(BUCKET).download(data.ruta_archivo);
  if(result.error) return res.status(404).send("Archivo no encontrado");
  res.setHeader("Content-Type",data.tipo_mime||"application/octet-stream");
  res.setHeader("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(data.nombre_original)}`);
  res.send(Buffer.from(await result.data.arrayBuffer()));
});

app.delete("/api/files/:id", async (req,res) => {
  const {data,error}=await supabase.from("documentos").select("ruta_archivo").eq("id",req.params.id).single();
  if(error||!data) return res.status(404).json({error:"Archivo no encontrado"});
  const rm=await supabase.storage.from(BUCKET).remove([data.ruta_archivo]);
  if(rm.error) return res.status(500).json({error:rm.error.message});
  const del=await supabase.from("documentos").delete().eq("id",req.params.id);
  if(del.error) return res.status(500).json({error:del.error.message});
  res.json({ok:true});
});

app.get("/api/raw/:id", async (req,res) => {
  const {data,error}=await supabase.from("documentos").select("*").eq("id",req.params.id).single();
  if(error||!data) return res.status(404).send("Archivo no encontrado");
  const result=await supabase.storage.from(BUCKET).download(data.ruta_archivo);
  if(result.error) return res.status(404).send("Archivo no encontrado");
  res.setHeader("Content-Type",data.tipo_mime||"application/octet-stream");
  res.setHeader("Content-Disposition","inline");
  res.send(Buffer.from(await result.data.arrayBuffer()));
});

app.get("/archivo/:id",(req,res)=>res.sendFile(__dirname+"/public/viewer.html"));
app.listen(PORT,()=>console.log("Horizontes funcionando en puerto "+PORT));
