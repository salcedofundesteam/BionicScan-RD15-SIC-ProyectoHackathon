import os

# --- BLOQUE CRÍTICO PARA CPU ---
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
# 2 reduce los logs de advertencia "No GPU found"
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2' 

import json
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense, Dropout
from tensorflow.keras.preprocessing.image import ImageDataGenerator


print(f"Dispositivos disponibles: {tf.config.list_physical_devices()}")

# --- CONFIGURACIÓN ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, 'dataset')
MODEL_FILENAME = os.path.join(BASE_DIR, 'modelo_entrenado.h5')
LABELS_FILENAME = os.path.join(BASE_DIR, 'etiquetas.json')
IMG_SIZE = (224, 224)
BATCH_SIZE = 16  # Reducido a 16 para no saturar la CPU/RAM
EPOCHS = 10 

def entrenar():
    print(">>> [1/4] Cargando imágenes del dataset (MODO CPU)...")
    
    # Generador de imágenes 
    train_datagen = ImageDataGenerator(
        rescale=1./255,
        rotation_range=15,      
        horizontal_flip=True,   
        validation_split=0.2
    )

    try:
        # Cargar datos de entrenamiento
        train_generator = train_datagen.flow_from_directory(
            DATASET_DIR,
            target_size=IMG_SIZE,
            batch_size=BATCH_SIZE,
            class_mode='categorical',
            subset='training'
        )

        # Cargar datos de validación
        validation_generator = train_datagen.flow_from_directory(
            DATASET_DIR,
            target_size=IMG_SIZE,
            batch_size=BATCH_SIZE,
            class_mode='categorical',
            subset='validation'
        )
    except FileNotFoundError:
        print(f"ERROR: No se encuentra la carpeta '{DATASET_DIR}'. Créala y pon subcarpetas con fotos.")
        return

    # Guardar mapa de etiquetas 
    if train_generator.samples == 0:
        print(" ERROR: La carpeta dataset está vacía o mal estructurada.")
        return

    class_map = {v: k for k, v in train_generator.class_indices.items()}
    with open(LABELS_FILENAME, 'w') as f:
        json.dump(class_map, f)
    print(f">>> Etiquetas guardadas: {class_map}")

    num_classes = len(class_map)
    if num_classes < 2:
        print(f" ADVERTENCIA: Solo se detectó {num_classes} clase(s): {list(class_map.values())}.")
        print(" Para clasificación necesitas al menos 2 clases (ej: 'gato' y 'perro', o 'objeto' y 'fondo').")
        print(" El entrenamiento continuará, pero los resultados pueden no tener sentido.")

    print(">>> [2/4] Construyendo Red Neuronal Ligera (CPU Friendly)...")
    
    model = Sequential([
        # Capa 1
        Conv2D(32, (3, 3), activation='relu', input_shape=(IMG_SIZE[0], IMG_SIZE[1], 3)),
        MaxPooling2D(2, 2),
        
        # Capa 2
        Conv2D(64, (3, 3), activation='relu'),
        MaxPooling2D(2, 2),
        
        # Capa 3
        Flatten(),
        Dense(64, activation='relu'), # Reducido de 128 a 64 para velocidad
        Dropout(0.5),
        Dense(num_classes, activation='softmax')
    ])

    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

    print(f">>> [3/4] Entrenando... Paciencia, esto usa el procesador.")
    
    validation_data = validation_generator
    validation_steps = validation_generator.samples // BATCH_SIZE
    
    if validation_generator.samples == 0:
        print(" AVISO: No hay suficientes imágenes para validación (se requiere > 0). Se omitirá la validación.")
        validation_data = None
        validation_steps = None
    
    model.fit(
        train_generator,
        steps_per_epoch=max(1, train_generator.samples // BATCH_SIZE),
        validation_data=validation_data,
        validation_steps=validation_steps,
        epochs=EPOCHS
    )

    print(">>> [4/4] Guardando cerebro digital...")
    model.save(MODEL_FILENAME)
    print(f"¡LISTO! Modelo guardado en: {MODEL_FILENAME}")

if __name__ == '__main__':
    entrenar()