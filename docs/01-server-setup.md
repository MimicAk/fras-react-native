# 01 — Server Setup: CompreFace + Silent-Face on EC2

## Prerequisites

- Current server: `44.204.69.221` (running Node.js backend)
- Upgrade EC2 instance to **m7g.xlarge** (4 vCPU, 16 GB RAM) before deploying
- Domain + TLS cert required before sending biometric data (HTTP is blocked by Android 9+)

---

## Step 1 — Upgrade EC2 Instance

In AWS Console:
1. Stop the instance
2. Actions → Instance Settings → Change Instance Type → `m7g.xlarge`
3. Start the instance

---

## Step 2 — Install Docker & Docker Compose

```bash
# SSH into your server
ssh ubuntu@44.204.69.221

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

# Install Docker Compose v2
sudo apt-get install -y docker-compose-plugin
docker compose version
```

---

## Step 3 — Deploy CompreFace

Create the project directory:

```bash
mkdir -p /opt/fras-ai && cd /opt/fras-ai
```

Create `docker-compose.yml`:

```yaml
version: "3.8"

services:
  # ─── CompreFace Core (face recognition) ───────────────────────
  compreface-postgres:
    image: postgres:11.5
    restart: always
    environment:
      POSTGRES_USER: compreface
      POSTGRES_PASSWORD: compreface
      POSTGRES_DB: compreface
    volumes:
      - compreface-postgres-data:/var/lib/postgresql/data

  compreface-core:
    image: exadel/compreface-core:latest
    restart: always
    environment:
      ML_PORT: 3000
    depends_on:
      - compreface-postgres

  compreface-api:
    image: exadel/compreface-api:latest
    restart: always
    ports:
      - "8000:8080"
    environment:
      POSTGRES_USER: compreface
      POSTGRES_PASSWORD: compreface
      POSTGRES_URL: jdbc:postgresql://compreface-postgres:5432/compreface
      SPRING_PROFILES_ACTIVE: dev
      ENABLE_EMAIL_SERVER: "false"
      EMAIL_HOST: smtp.gmail.com
      ADMIN_JAVA_OPTS: -Xmx256m
    depends_on:
      - compreface-postgres
      - compreface-core

  compreface-ui:
    image: exadel/compreface-ui:latest
    restart: always
    ports:
      - "8080:80"
    environment:
      API_URL: http://compreface-api:8080
    depends_on:
      - compreface-api

  # ─── Silent-Face Anti-Spoofing (liveness) ─────────────────────
  silent-face:
    build: ./silent-face
    restart: always
    ports:
      - "8001:8001"
    environment:
      MODEL_THRESHOLD: "0.7"

volumes:
  compreface-postgres-data:
```

---

## Step 4 — Silent-Face Anti-Spoofing Service

Create the sidecar directory and files:

```bash
mkdir -p /opt/fras-ai/silent-face
cd /opt/fras-ai/silent-face
```

**`Dockerfile`:**

```dockerfile
FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Clone the Silent-Face repo
RUN git clone https://github.com/minivision-ai/Silent-Face-Anti-Spoofing.git /app/sfas

# Install Python deps
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn==0.24.0 \
    opencv-python-headless==4.8.1.78 \
    torch==2.1.0 --index-url https://download.pytorch.org/whl/cpu \
    torchvision==0.16.0 --index-url https://download.pytorch.org/whl/cpu \
    numpy==1.24.4 \
    Pillow==10.1.0

COPY server.py /app/server.py

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

**`server.py`:**

```python
import base64
import os
import sys
import cv2
import numpy as np
from io import BytesIO
from PIL import Image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Add Silent-Face path
sys.path.insert(0, '/app/sfas/src')

from anti_spoof_predict import AntiSpoofPredict
from generate_patches import CropImage
from utility import parse_model_name

app = FastAPI(title="Silent-Face Liveness API")

MODEL_DIR = '/app/sfas/resources/anti_spoof_models'
DEVICE_ID = 0  # CPU

# Load models on startup
predictor = AntiSpoofPredict(DEVICE_ID)
image_cropper = CropImage()
threshold = float(os.environ.get('MODEL_THRESHOLD', '0.7'))

class LivenessRequest(BaseModel):
    imageBase64: str

class LivenessResponse(BaseModel):
    isReal: bool
    confidence: float
    label: str  # 'real' or 'spoof'

def base64_to_cv2(b64: str):
    # Strip data URI prefix if present
    if ',' in b64:
        b64 = b64.split(',')[1]
    img_bytes = base64.b64decode(b64)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)

@app.post('/check', response_model=LivenessResponse)
def check_liveness(req: LivenessRequest):
    try:
        image = base64_to_cv2(req.imageBase64)
        if image is None:
            raise HTTPException(status_code=400, detail='Invalid image')

        image_bbox = image_cropper.get_bbox(image)

        prediction = np.zeros((1, 3))

        for model_name in os.listdir(MODEL_DIR):
            h_input, w_input, model_type, scale = parse_model_name(model_name)
            param = {
                "org_img": image,
                "bbox": image_bbox,
                "scale": scale,
                "out_w": w_input,
                "out_h": h_input,
                "crop": True,
            }
            if scale is None:
                param["crop"] = False

            img = image_cropper.crop(**param)
            prediction += predictor.predict(img, os.path.join(MODEL_DIR, model_name))

        label = np.argmax(prediction)
        value = prediction[0][label] / 2

        is_real = bool(label == 1)
        confidence = float(round(value, 4))

        return LivenessResponse(
            isReal=is_real,
            confidence=confidence,
            label='real' if is_real else 'spoof'
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get('/health')
def health():
    return {'status': 'ok'}
```

---

## Step 5 — Start Everything

```bash
cd /opt/fras-ai
docker compose up -d

# Verify services are running
docker compose ps

# Check logs
docker compose logs compreface-api --tail=50
docker compose logs silent-face --tail=50
```

Services will be available at:
- CompreFace Admin UI: `http://SERVER_IP:8080`
- CompreFace API: `http://localhost:8000`
- Silent-Face API: `http://localhost:8001`

---

## Step 6 — Create CompreFace Recognition Service

1. Open `http://SERVER_IP:8080` in browser
2. Register an admin account
3. Create an Application → name it `FRAS`
4. Inside the app, create a **Face Recognition Service**
5. Copy the **API Key** — you'll add this to your Node `.env`

```
COMPREFACE_URL=http://localhost:8000
COMPREFACE_API_KEY=<paste_key_here>
LIVENESS_URL=http://localhost:8001
LIVENESS_THRESHOLD=0.7
```

---

## Step 7 — HTTPS with Let's Encrypt (Required)

Android 9+ blocks plaintext HTTP for biometric data. You need a domain.

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain cert (replace with your domain)
sudo certbot --nginx -d api.yourfras.com

# Add to your Node backend's nginx config
# /etc/nginx/sites-available/fras
server {
    listen 443 ssl;
    server_name api.yourfras.com;

    ssl_certificate /etc/letsencrypt/live/api.yourfras.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourfras.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;  # Your Node backend
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then update `config/config.ts` in the app:
```typescript
export const config = {
  Base_URL: "https://api.yourfras.com"
};
```

---

## Step 8 — Verify Installation

```bash
# Test CompreFace health
curl http://localhost:8000/actuator/health

# Test Silent-Face health
curl http://localhost:8001/health

# Test CompreFace enrollment (replace API_KEY)
curl -X POST \
  "http://localhost:8000/api/v1/recognition/faces?subject=test-employee" \
  -H "x-api-key: YOUR_API_KEY" \
  -F "file=@/path/to/test-face.jpg"

# Test Silent-Face liveness
curl -X POST http://localhost:8001/check \
  -H "Content-Type: application/json" \
  -d '{"imageBase64": "/9j/4AAQ..."}'
```

---

## Firewall Rules

```bash
# Only expose HTTPS (443) externally. Keep 8000, 8001 internal only.
sudo ufw allow 22
sudo ufw allow 443
sudo ufw allow 80  # for cert renewal
sudo ufw enable

# CompreFace (8000) and Silent-Face (8001) stay localhost-only
# Node backend proxies all requests
```
