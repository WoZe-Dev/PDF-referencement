import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { jsPDF } from "npm:jspdf@2";

// --- Config ---
const PORT = parseInt(Deno.env.get("PORT") || "3001");
const DATABASE_URL = Deno.env.get("DATABASE_URL") || "postgres://postgres:postgres@db:5432/pdf_art_generator";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const SKYPER_USERNAME = Deno.env.get("SKYPER_USERNAME") || "";
const SKYPER_PASSWORD = Deno.env.get("SKYPER_PASSWORD") || "";
const OCR_API_KEY = Deno.env.get("OCR_API_KEY") || "";
const SKYPER_LOGIN_URL = Deno.env.get("SKYPER_LOGIN_URL") || "";
const SKYPER_PRODUCTS_URL = Deno.env.get("SKYPER_PRODUCTS_URL") || "";
const ALLOWED_IMAGE_HOSTS = ["api-tricycle.skyper.fr"];
const MAX_PRODUCTS = 50;
const MAX_BASE64_LENGTH = 10 * 1024 * 1024 * 1.37;

const pool = new Pool(DATABASE_URL, 5, true);

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

async function imageUrlToBase64(
  url: string
): Promise<{ data: string; format: string } | null> {
  if (!isAllowedImageUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    let format = "JPEG";
    if (contentType.includes("png")) format = "PNG";

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) return null;

    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return { data: `data:image/jpeg;base64,${btoa(binary)}`, format };
  } catch {
    return null;
  }
}

// --- Extract References ---
async function handleExtractReferences(req: Request): Promise<Response> {
  const { imageBase64 } = await req.json();
  if (!imageBase64) return jsonResponse({ error: "Image base64 is required" }, 400);

  if (!OCR_API_KEY) {
    console.error("Missing OCR_API_KEY");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const base64Only = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;
  if (base64Only.length > MAX_BASE64_LENGTH)
    return jsonResponse({ error: "Image too large (max 10MB)" }, 413);

  // Try OCR Engine 2 first (more accurate), fallback to Engine 1
  // deno-lint-ignore no-explicit-any
  let ocrData: any = null;
  for (const engine of ["2", "1"]) {
    const formData = new FormData();
    formData.append("base64Image", `data:image/jpeg;base64,${base64Only}`);
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("detectOrientation", "true");
    formData.append("scale", "true");
    formData.append("OCREngine", engine);

    const ocrResponse = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: OCR_API_KEY },
      body: formData,
    });

    if (!ocrResponse.ok) {
      console.error(`OCR Engine ${engine} HTTP error:`, ocrResponse.status);
      continue;
    }

    const data = await ocrResponse.json();
    if (data.IsErroredOnProcessing) {
      console.error(`OCR Engine ${engine} failed:`, data.ErrorMessage?.[0]);
      continue;
    }

    ocrData = data;
    break;
  }

  if (!ocrData) throw new Error("OCR processing failed");

  const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || "";
  const artRegex = /\b[Aa][Rr][Tt]\s*(\d+)\b/g;
  const matches = [...extractedText.matchAll(artRegex)];
  const references: string[] = [];
  for (const match of matches) {
    const reference = `ART${match[1]}`;
    if (!references.includes(reference)) references.push(reference);
  }

  return jsonResponse({ success: true, references, extractedText });
}

// --- Fetch Skyper Products ---
async function handleFetchSkyperProducts(req: Request): Promise<Response> {
  if (!SKYPER_USERNAME || !SKYPER_PASSWORD) {
    console.error("Missing SKYPER credentials");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const { references } = await req.json();
  if (!references || !Array.isArray(references) || references.length > 100)
    return jsonResponse({ error: "Valid references array required (max 100)" }, 400);

  // Auth with Skyper
  const authResponse = await fetch(SKYPER_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: SKYPER_USERNAME, password: SKYPER_PASSWORD }),
  });
  if (!authResponse.ok) throw new Error("Failed to authenticate with Skyper API");
  const { token } = await authResponse.json();
  if (!token) throw new Error("No token received from Skyper API");

  // Fetch products
  const productsResponse = await fetch(SKYPER_PRODUCTS_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!productsResponse.ok) throw new Error("Failed to fetch products");

  const productsData = await productsResponse.json();
  const allProducts = productsData["hydra:member"] || [];

  const filteredProducts = allProducts.filter((product: Record<string, unknown>) => {
    const productRef = product.reference as string;
    return references.some(
      (ref: string) => ref.toLowerCase() === productRef?.toLowerCase()
    );
  });

  const products = filteredProducts.map((product: Record<string, unknown>) => {
    const img = product.image as Record<string, Record<string, string>> | undefined;
    const imgs = product.images as Array<Record<string, Record<string, string>>> | undefined;
    const imageUrl = img?.urls?.original || imgs?.[0]?.urls?.original || null;
    return {
      reference: (product.reference as string) || "N/A",
      name: (product.name as string) || "Sans nom",
      price: parseFloat(product.priceHT as string) || 0,
      stock: parseInt(product.stockAvailable as string) || 0,
      image_url: imageUrl,
    };
  });

  // Upsert into local PostgreSQL
  if (products.length > 0) {
    const client = await pool.connect();
    try {
      for (const p of products) {
        await client.queryObject(
          `INSERT INTO products (reference, name, price, stock, image_url)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (reference)
           DO UPDATE SET name = $2, price = $3, stock = $4, image_url = $5, updated_at = now()`,
          [p.reference, p.name, p.price, p.stock, p.image_url]
        );
      }
    } finally {
      client.release();
    }
  }

  return jsonResponse({
    success: true,
    products,
    found: products.length,
    requested: references.length,
  });
}

// --- Generate PDF ---
async function handleGeneratePDF(req: Request): Promise<Response> {
  const { products } = await req.json();
  if (!products || products.length === 0)
    return jsonResponse({ error: "No products provided" }, 400);
  if (products.length > MAX_PRODUCTS)
    return jsonResponse({ error: `Too many products (max ${MAX_PRODUCTS})` }, 400);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPosition = margin;

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Liste des Produits", pageWidth / 2, yPosition, { align: "center" });
  yPosition += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${new Date().toLocaleDateString("fr-FR")}`, pageWidth / 2, yPosition, { align: "center" });
  yPosition += 15;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setDrawColor(0, 0, 0);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 7;

  const imgCol = margin + 2;
  const titleCol = margin + 55;
  const refCol = margin + 105;
  const stockActuelCol = margin + 140;
  const stockVideCol = margin + 165;
  const stockBoxWidth = 20;

  doc.text("Image", imgCol, yPosition);
  doc.text("Titre", titleCol, yPosition);
  doc.text("Ref", refCol, yPosition);
  doc.text("Stock", stockActuelCol + 3, yPosition);
  doc.text("Vide", stockVideCol + 5, yPosition);
  yPosition += 2;
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;

  doc.setFont("helvetica", "normal");

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const imageSize = 45;
    const rowHeight = imageSize + 10;

    if (yPosition + rowHeight > pageHeight - 20) {
      doc.addPage();
      yPosition = margin + 10;
    }

    const rowStartY = yPosition;

    let imageAdded = false;
    if (product.image_url) {
      try {
        const imageResult = await imageUrlToBase64(product.image_url);
        if (imageResult) {
          doc.addImage(imageResult.data, imageResult.format, imgCol, rowStartY, imageSize, imageSize);
          imageAdded = true;
        }
      } catch { /* placeholder will be used */ }
    }

    if (!imageAdded) {
      doc.setDrawColor(180, 180, 180);
      doc.setFillColor(240, 240, 240);
      doc.rect(imgCol, rowStartY, imageSize, imageSize, "FD");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Pas d'image", imgCol + imageSize / 2, rowStartY + imageSize / 2, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    const titleLines = doc.splitTextToSize(product.name || "N/A", 58);
    doc.text(titleLines, titleCol, rowStartY + 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(product.reference || "N/A", refCol, rowStartY + 20);

    doc.setDrawColor(80, 80, 80);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.8);
    doc.rect(stockActuelCol, rowStartY + 10, stockBoxWidth, 25, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(product.stock?.toString() || "0", stockActuelCol + stockBoxWidth / 2, rowStartY + 24, { align: "center" });

    doc.setDrawColor(80, 80, 80);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.8);
    doc.rect(stockVideCol, rowStartY + 10, stockBoxWidth, 25, "D");

    yPosition += rowHeight;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, yPosition - 5, pageWidth - margin, yPosition - 5);
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Généré le ${new Date().toLocaleString("fr-FR")} - ${products.length} produit(s)`,
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  const pdfBase64 = doc.output("datauristring");
  return jsonResponse({ success: true, pdf: pdfBase64, totalProducts: products.length });
}

// --- Router ---
Deno.serve({ port: PORT }, async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Health check
  if (path === "/health" && req.method === "GET") {
    return jsonResponse({ status: "ok" });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    switch (path) {
      case "/functions/v1/extract-references":
        return await handleExtractReferences(req);
      case "/functions/v1/fetch-skyper-products":
        return await handleFetchSkyperProducts(req);
      case "/functions/v1/generate-pdf":
        return await handleGeneratePDF(req);
      default:
        return jsonResponse({ error: "Not found" }, 404);
    }
  } catch (error) {
    console.error(`Error on ${path}:`, error);
    return jsonResponse({ success: false, error: "Internal server error" }, 500);
  }
});

console.log(`API server running on port ${PORT}`);
