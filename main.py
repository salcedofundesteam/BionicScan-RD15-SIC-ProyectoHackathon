import os
import shutil
import json
import numpy as np
import cv2
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from deepface import DeepFace
from google_cse_api import GoogleCSEAPI
from google.cloud import storage
from PIL import Image
import traceback

print(">>> Loading main.py...")

# --- CONFIGURACIoN ---
UPLOAD_DIR = '/tmp/uploads'
DB_PATH = '/tmp/db'  # Local Database for DeepFace
GCS_BUCKET_NAME = 'bionic-scan-v2.appspot.com' # Default App Engine bucket
GCS_DB_PREFIX = 'database/'

# Ensure directories exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DB_PATH, exist_ok=True)

# Google CSE Config
GOOGLE_CSE_API_KEY = ""
GOOGLE_CSE_ID = ""

# Initialize GCS Client
storage_client = None
bucket = None
try:
    storage_client = storage.Client()
    bucket = storage_client.bucket(GCS_BUCKET_NAME)
    print(f">>> Connected to GCS Bucket: {GCS_BUCKET_NAME}")
except Exception as e:
    print(f"⚠️ Error connecting to GCS: {e}")

# Sync DB from GCS (Incremental)
def sync_db_from_gcs():
    if not bucket: 
        print("⚠️ GCS Bucket not initialized. Skipping sync.")
        return
        
    # print(">>> Checking for database updates from GCS...")
    try:
        print(f">>> ☁️ Accessing GCS Bucket: {GCS_BUCKET_NAME}")
        print(f">>> 📂 Scanning Cloud Folder: {GCS_DB_PREFIX} ...")
        
        # 1. List GCS blobs
        blobs = list(bucket.list_blobs(prefix=GCS_DB_PREFIX))
        remote_files = {os.path.basename(b.name) for b in blobs if not b.name.endswith('/') and not b.name.endswith('.pkl')}
        
        print(f">>> ✅ Found {len(remote_files)} images in Cloud Database.")
        
        if not os.path.exists(DB_PATH):
            os.makedirs(DB_PATH)
            
        local_files = set(os.listdir(DB_PATH))
        
        changes_made = False

        # 2. Download new files
        for blob in blobs:
            if blob.name.endswith('/') or blob.name.endswith('.pkl'): continue
            filename = os.path.basename(blob.name)
            local_path = os.path.join(DB_PATH, filename)
            
            if filename not in local_files:
                blob.download_to_filename(local_path)
                changes_made = True
                print(f">>> Downloaded new face: {filename}")

        # 3. Delete removed files (sync deletion)
        for filename in local_files:
            if filename not in remote_files and not filename.endswith('.pkl'):
                os.remove(os.path.join(DB_PATH, filename))
                changes_made = True
                print(f">>> Removed deleted face: {filename}")

        # 4. Clear DeepFace cache ONLY if changes occurred
        if changes_made:
            pkl_file = os.path.join(DB_PATH, "representations_arcface.pkl")
            if os.path.exists(pkl_file):
                os.remove(pkl_file)
                print(">>> Database updated. Cleared DeepFace cache.")
                
    except Exception as e:
        print(f"❌ Error syncing from GCS: {e}")
        traceback.print_exc()



# Inicializar Google CSE API
google_cse = None
try:
    google_cse = GoogleCSEAPI(api_key=GOOGLE_CSE_API_KEY, cse_id=GOOGLE_CSE_ID)
    print(">>> Google CSE API inicializada correctamente")
except Exception as e:
    print(f"⚠️ Error inicializando Google CSE API: {e}")
    traceback.print_exc()

app = FastAPI(title="CPU Neural API v2 (DeepFace + GCS)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Perform initial sync on startup
@app.on_event("startup")
async def startup_event():
    sync_db_from_gcs()

@app.get("/")
async def root():
    return FileResponse("static/index.html")

@app.post("/upload_data/")
async def upload_data(file: UploadFile = File(...), name: str = Form(...)):
    try:
        # Sanitize name
        safe_name = "".join([c for c in name if c.isalpha() or c.isdigit() or c==' ']).rstrip()
        filename = f"{safe_name}_{file.filename}"
        local_path = os.path.join(DB_PATH, filename)
        
        # 1. Save locally
        with open(local_path, "wb+") as file_object:
            file_object.write(file.file.read())
            
        # 2. Upload to GCS
        if bucket:
            blob = bucket.blob(f"{GCS_DB_PREFIX}{filename}")
            blob.upload_from_filename(local_path)
            print(f">>> Uploaded {filename} to GCS.")

        # Clear DeepFace representations cache to force reload
        pkl_file = os.path.join(DB_PATH, "representations_arcface.pkl")
        if os.path.exists(pkl_file):
            os.remove(pkl_file)
            
        return {"status": "success", "message": f"Face for '{safe_name}' added to database (Cloud Persisted)."}
    except Exception as e:
        print(f"Upload Error: {e}")
        return {"error": str(e)}

@app.post("/predict/")
async def predict(file: UploadFile = File(...)):
    # Guardar temporalmente
    file_location = os.path.join(UPLOAD_DIR, file.filename)
    
    with open(file_location, "wb+") as file_object:
        file_object.write(file.file.read())

    try:
        # ALWAYS Sync with Cloud DB before prediction to ensure real-time results
        sync_db_from_gcs()

        # Check if DB is empty
        if not os.path.exists(DB_PATH) or not os.listdir(DB_PATH):
             return {
                 "identified_name": "UNKNOWN_TARGET",
                 "confidence": "0.00%",
                 "system_log": "Database is empty. Upload faces first."
             }

        # DeepFace Find (Regression/Embedding Comparison)
        print(f">>> 📂 Local DB Content: {os.listdir(DB_PATH)}")
        
        # This compares the uploaded image against all images in DB_PATH
        dfs = DeepFace.find(
            img_path=file_location, 
            db_path=DB_PATH, 
            model_name='ArcFace',
            detector_backend='ssd',
            enforce_detection=False, 
            silent=True
        )
        
        if len(dfs) > 0 and not dfs[0].empty:
            match = dfs[0].iloc[0]
            identity_path = match['identity']
            filename = os.path.basename(identity_path)
            
            # Extract name from filename (e.g., "Vladimir_Putin.jpg" -> "Vladimir Putin")
            base = os.path.splitext(filename)[0]
            
            # Clean up name
            if base.endswith("_db_image"):
                identified_name = base[:-9]
            elif base.endswith("_db"):
                identified_name = base[:-3]
            else:
                parts = base.rsplit('_', 1)
                if len(parts) > 1:
                    identified_name = parts[0]
                else:
                    identified_name = base
            
            identified_name = identified_name.replace("_", " ").strip()

            # Calculate confidence from distance (lower distance = higher confidence)
            # SFace threshold is usually around 0.5-0.6
            distance = match['distance']
            # Simple inversion for display purposes (not scientifically accurate probability)
            confidence_score = max(0, 1 - distance) 
            
            return {
                "identified_name": identified_name,
                "confidence": f"{confidence_score:.2%}",
                "system_log": f"Match found: {filename} (Dist: {distance:.4f})"
            }
        else:
            return {
                "identified_name": "UNKNOWN_TARGET",
                "confidence": "0.00%",
                "system_log": "No match found in database."
            }

    except Exception as e:
        print(f"Prediction Error: {e}")
        return {
            "identified_name": "ERROR",
            "confidence": "0.00%",
            "system_log": str(e)
        }
    finally:
        if os.path.exists(file_location):
            os.remove(file_location)

@app.post("/osint/")
async def osint_search(query: dict):
    target = query.get("query")
    if not target:
        return {"error": "Query empty"}
    
    print(f">>> Buscando en OSINT (Google CSE): {target}")
    
    if not google_cse:
        return {"error": "Google CSE API not initialized"}

    try:
        # The search method now returns a structured dict with description, emails, phones, etc.
        results = google_cse.search(target)
        
        if "error" in results:
            return results

        if not results.get("found"):
            return {
                "found": False,
                "summary": "No se encontraron resultados públicos relevantes.",
                "description": "",
                "emails": [],
                "phones": [],
                "links": []
            }

        return {
            "found": True,
            "summary": f"Se encontraron resultados para '{target}'.",
            "description": results.get("description", ""),
            "emails": results.get("emails", []),
            "phones": results.get("phones", []),
            "links": [item.get('link') for item in results.get("links", []) if item.get('link')] # Flatten to list of URL strings
        }

    except Exception as e:
        print(f"Error OSINT: {e}")
        return {"error": str(e)}

@app.get("/api/debug")
async def debug_system():
    """Endpoint de diagnóstico para verificar conexión a GCS y estado del sistema."""
    status = {
        "gcs_connected": False,
        "bucket_name": GCS_BUCKET_NAME,
        "bucket_exists": False,
        "files_in_cloud": [],
        "local_db_files": [],
        "errors": []
    }
    
    # 1. Check GCS Connection
    try:
        if storage_client:
            status["gcs_connected"] = True
            # Check bucket
            try:
                b = storage_client.get_bucket(GCS_BUCKET_NAME)
                status["bucket_exists"] = True
                
                # List files
                blobs = list(b.list_blobs(prefix=GCS_DB_PREFIX))
                status["files_in_cloud"] = [b.name for b in blobs]
                
                # Try writing a test file
                test_blob = b.blob(f"{GCS_DB_PREFIX}debug_test.txt")
                test_blob.upload_from_string("Connection Test OK")
                status["write_test"] = "Success"
                
            except Exception as e:
                status["errors"].append(f"Bucket Error: {str(e)}")
        else:
            status["errors"].append("Storage Client not initialized")
            
    except Exception as e:
        status["errors"].append(f"GCS General Error: {str(e)}")

    # 2. Check Local DB
    try:
        if os.path.exists(DB_PATH):
            status["local_db_files"] = os.listdir(DB_PATH)
        else:
            status["errors"].append("Local DB directory missing")
    except Exception as e:
        status["errors"].append(f"Local DB Error: {str(e)}")

    return status

# --- SERVING FRONTEND (AFTER API ROUTES) ---
app.mount("/static", StaticFiles(directory="static/static"), name="static")

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    static_file_path = f"static/{full_path}"
    if os.path.exists(static_file_path) and os.path.isfile(static_file_path):
        return FileResponse(static_file_path)
    return FileResponse("static/index.html")

if __name__ == '__main__':
    print(">>> Iniciando Servidor en Modo CPU (DeepFace + GCS)...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
