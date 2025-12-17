import os

# --- BLOQUE CRÍTICO PARA CPU ---
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import json
import numpy as np
import cv2
import uvicorn
import tensorflow as tf
from tensorflow.keras.models import load_model

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from google_cse_api import GoogleCSEAPI
import traceback

# --- CONFIGURACIoN ---
MODEL_PATH = 'modelo_entrenado.h5'
LABELS_PATH = 'etiquetas.json'
UPLOAD_DIR = 'uploads'

# Google CSE Config
GOOGLE_CSE_API_KEY = ""
GOOGLE_CSE_ID = ""

# Inicializar Google CSE API
google_cse = None
try:
    google_cse = GoogleCSEAPI(api_key=GOOGLE_CSE_API_KEY, cse_id=GOOGLE_CSE_ID)
    print(">>> Google CSE API inicializada correctamente")
except Exception as e:
    print(f"⚠️ Error inicializando Google CSE API: {e}")
    traceback.print_exc()

app = FastAPI(title="CPU Neural API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "online", "message": "Neural Scan API v2.0 Running"}

# Variables globales
model = None
class_labels = {}
MOCK_MODE = False

def load_system():
    """Carga modelo y etiquetas en RAM (CPU)"""
    global model, class_labels, MOCK_MODE
    
    if not os.path.exists(MODEL_PATH) or not os.path.exists(LABELS_PATH):
        print("⚠️ ALERTA: No se encontró 'modelo_entrenado.h5'. ACTIVANDO MODO SIMULACIÓN (MOCK).")
        MOCK_MODE = True
        return

    print(">>> Cargando modelo en CPU...")
    try:
        model = load_model(MODEL_PATH)
        # Cargar etiquetas
        with open(LABELS_PATH, 'r') as f:
            data = json.load(f)
            class_labels = {int(k): v for k, v in data.items()}
            
        print(f">>> Sistema Online. Clases detectables: {list(class_labels.values())}")
    except Exception as e:
        print(f"❌ Error fatal cargando modelo: {e}")
        print(">>> Activando MODO SIMULACIÓN por error.")
        MOCK_MODE = True

load_system()

def prepare_image(image_path):
    """Redimensiona la imagen a 224x224 para la IA"""
    img = cv2.imread(image_path)
    if img is None: return None
    
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (224, 224))
    img = img / 255.0  # Normalizar (0-1)
    img = np.expand_dims(img, axis=0) # Batch de 1 imagen
    return img

@app.post("/predict/")
async def predict(file: UploadFile = File(...)):
    # MOCK MODE HANDLER
    if MOCK_MODE:
        import time
        import random
        time.sleep(1.5) # Simular proceso
        
        # Simular resultado
        mock_names = ["Target_Alpha", "Subject_01", "Unknown_Entity", "John_Doe"]
        name = random.choice(mock_names)
        confidence = random.uniform(0.75, 0.99)
        
        return {
            "identified_name": name,
            "confidence": f"{confidence:.2%}",
            "system_log": "SIMULATION_MODE: Model file not found. Returning mock data."
        }

    if model is None:
        raise HTTPException(status_code=500, detail="Modelo no cargado. Revisa logs del servidor.")

    # Guardar temporalmente
    if not os.path.exists(UPLOAD_DIR): os.makedirs(UPLOAD_DIR)
    file_location = f"{UPLOAD_DIR}/{file.filename}"
    
    with open(file_location, "wb+") as file_object:
        file_object.write(file.file.read())

    try:
        # Preprocesar
        processed_img = prepare_image(file_location)
        if processed_img is None:
             raise HTTPException(status_code=400, detail="Archivo de imagen inválido.")

        # Inferencia
        predictions = model.predict(processed_img)
        predicted_idx = np.argmax(predictions, axis=1)[0]
        confidence = float(np.max(predictions))
        
        name = class_labels.get(predicted_idx, "Desconocido")
        
        # Umbral de seguridad (65%)
        if confidence < 0.65:
            name = "UNKNOWN_TARGET"

        return {
            "identified_name": name,
            "confidence": f"{confidence:.2%}",
            "system_log": "Inference successful."
        }

    except Exception as e:
        return {"error": str(e)}
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
        results = google_cse.search(target)
        
        if "error" in results:
            return results

        formatted_results = []
        if results.get("found"):
            for item in results.get("results", []):
                formatted_results.append(item.get("link"))

        if not formatted_results:
            return {
                "found": False,
                "summary": "No se encontraron resultados públicos relevantes.",
                "links": []
            }

        return {
            "found": True,
            "summary": f"Se encontraron {len(formatted_results)} resultados indexados para '{target}'.",
            "links": formatted_results
        }

    except Exception as e:
        print(f"Error OSINT: {e}")
        return {"error": str(e)}

if __name__ == '__main__':
    print(">>> Iniciando Servidor en Modo CPU...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
