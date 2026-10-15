# AI Photo Finder

ระบบค้นหารูปภาพด้วย AI Face Recognition สำหรับค้นหารูปที่มีบุคคลเดียวกันจากคลังรูปภาพ

> Docker-first / Local Development / Production-ready Architecture

---

## 1. Project Concept

ระบบมีเป้าหมายหลักคือ

```text
Admin Upload Photos
        ↓
AI Face Detection
        ↓
Face Embedding
        ↓
PostgreSQL + pgvector
        ↓
User Upload Selfie
        ↓
Face Embedding
        ↓
Vector Similarity Search
        ↓
แสดงรูปที่มีใบหน้าตรงกัน
```

ตัวระบบจะไม่เก็บรูปไว้ใน PostgreSQL โดยตรง

* Image Storage → Object Storage
* Metadata → PostgreSQL
* Face Embedding → PostgreSQL + pgvector
* AI Processing → Python FastAPI
* Frontend → Next.js

---

# 2. Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                    Docker Environment                    │
│                                                          │
│  ┌────────────────┐                                      │
│  │    Next.js     │                                      │
│  │   Web Client   │                                      │
│  │    :3000       │                                      │
│  └───────┬────────┘                                      │
│          │                                               │
│          ↓                                               │
│  ┌────────────────┐       ┌─────────────────────────┐    │
│  │    FastAPI     │──────→│     AI Processing       │    │
│  │   :8000        │       │ Face Detection          │    │
│  │                 │       │ Face Embedding          │    │
│  └───────┬────────┘       └─────────────────────────┘    │
│          │                                               │
│          ├──────────────────────┐                        │
│          ↓                      ↓                        │
│  ┌────────────────┐     ┌────────────────┐              │
│  │  PostgreSQL    │     │     MinIO      │              │
│  │  + pgvector    │     │ Object Storage │              │
│  │     :5432      │     │ :9000 / :9001  │              │
│  └────────────────┘     └────────────────┘              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

# 3. Technology Stack

## Frontend

* Next.js
* TypeScript
* Tailwind CSS

## Backend

* Python
* FastAPI
* Uvicorn

## AI

* InsightFace / ArcFace
* ONNX Runtime
* OpenCV

## Database

* PostgreSQL
* pgvector

## Object Storage

Development:

* MinIO

Production:

* Cloudflare R2 / S3-compatible storage

## Infrastructure

* Docker
* Docker Compose

---

# 4. Project Structure

แนะนำโครงสร้าง:

```text
ai-photo-finder/
│
├── apps/
│   │
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── public/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── ...
│   │
│   └── api/
│       ├── app/
│       │   ├── main.py
│       │   ├── config.py
│       │   │
│       │   ├── api/
│       │   │   ├── photos.py
│       │   │   ├── search.py
│       │   │   └── events.py
│       │   │
│       │   ├── services/
│       │   │   ├── face_detector.py
│       │   │   ├── face_embedding.py
│       │   │   ├── image_service.py
│       │   │   └── storage_service.py
│       │   │
│       │   ├── db/
│       │   │   ├── database.py
│       │   │   ├── models.py
│       │   │   └── migrations/
│       │   │
│       │   └── schemas/
│       │       ├── photo.py
│       │       ├── face.py
│       │       └── search.py
│       │
│       ├── requirements.txt
│       └── Dockerfile
│
├── infra/
│   ├── postgres/
│   │   └── init.sql
│   │
│   └── minio/
│       └── init.sh
│
├── data/
│   ├── postgres/
│   ├── minio/
│   └── models/
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitignore
└── README.md
```

---

# 5. Docker Services

Docker Compose จะมีอย่างน้อย 4 services

```text
web
api
postgres
minio
```

เพิ่มเติมภายหลัง:

```text
redis
worker
nginx
```

---

# 6. Docker Compose

ไฟล์:

```text
docker-compose.yml
```

ตัวอย่าง architecture:

```yaml
services:

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    container_name: ai-photo-web
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    depends_on:
      - api
    networks:
      - ai-photo-network

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    container_name: ai-photo-api
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://photo_user:photo_password@postgres:5432/photo_db

      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: minio
      S3_SECRET_KEY: minio_password
      S3_BUCKET: photos

    volumes:
      - ./data/models:/app/models

    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_started

    networks:
      - ai-photo-network

  postgres:
    image: pgvector/pgvector:pg16
    container_name: ai-photo-postgres
    restart: unless-stopped

    environment:
      POSTGRES_DB: photo_db
      POSTGRES_USER: photo_user
      POSTGRES_PASSWORD: photo_password

    ports:
      - "5432:5432"

    volumes:
      - ./data/postgres:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

    healthcheck:
      test:
        [
          "CMD-SHELL",
          "pg_isready -U photo_user -d photo_db"
        ]
      interval: 5s
      timeout: 5s
      retries: 10

    networks:
      - ai-photo-network

  minio:
    image: minio/minio:latest
    container_name: ai-photo-minio
    restart: unless-stopped

    command: server /data --console-address ":9001"

    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio_password

    ports:
      - "9000:9000"
      - "9001:9001"

    volumes:
      - ./data/minio:/data

    networks:
      - ai-photo-network

networks:
  ai-photo-network:
    driver: bridge
```

---

# 7. PostgreSQL + pgvector

ไฟล์:

```text
infra/postgres/init.sql
```

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id UUID NOT NULL
        REFERENCES events(id)
        ON DELETE CASCADE,

    storage_key TEXT NOT NULL,

    thumbnail_key TEXT,

    original_filename TEXT,

    mime_type VARCHAR(100),

    width INTEGER,

    height INTEGER,

    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    photo_id UUID NOT NULL
        REFERENCES photos(id)
        ON DELETE CASCADE,

    x INTEGER NOT NULL,

    y INTEGER NOT NULL,

    width INTEGER NOT NULL,

    height INTEGER NOT NULL,

    embedding VECTOR(512),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> ขนาด `VECTOR(512)` ต้องให้ตรงกับ embedding dimension ของ model ที่เลือกใช้จริง หาก model ที่ใช้คืน dimension อื่น ต้องเปลี่ยนตามนั้น

---

# 8. Vector Index

เมื่อ dataset ใหญ่ขึ้น ให้เพิ่ม index

ตัวอย่าง:

```sql
CREATE INDEX faces_embedding_idx
ON faces
USING hnsw (embedding vector_cosine_ops);
```

สำหรับ MVP ที่มีหลักร้อยหรือหลักพัน faces ยังสามารถเริ่มโดยไม่ใช้ index แล้วค่อยเพิ่มภายหลังได้

---

# 9. Face Search

Concept:

```sql
SELECT
    f.id,
    f.photo_id,
    1 - (f.embedding <=> :query_embedding) AS similarity
FROM faces f
WHERE f.embedding IS NOT NULL
ORDER BY f.embedding <=> :query_embedding
LIMIT 50;
```

ผลลัพธ์:

```text
photo_001    0.96
photo_019    0.94
photo_102    0.92
photo_302    0.88
```

---

# 10. MinIO

MinIO จะทำหน้าที่แทน Cloudflare R2 ในเครื่อง Local

```text
Browser
   ↓
FastAPI
   ↓
MinIO
   ↓
photos bucket
```

Bucket:

```text
photos
```

โครงสร้าง:

```text
photos/

events/
└── {event_id}/

    original/
        {photo_id}.jpg

    thumbnails/
        {photo_id}.webp
```

ตัวอย่าง:

```text
events/
├── 01HXXX/
│   ├── original/
│   │   ├── 01HAAA.jpg
│   │   └── 01HBBB.jpg
│   │
│   └── thumbnails/
│       ├── 01HAAA.webp
│       └── 01HBBB.webp
```

---

# 11. FastAPI Dockerfile

ไฟล์:

```text
apps/api/Dockerfile
```

```dockerfile
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN mkdir -p /app/models

EXPOSE 8000

CMD [
    "uvicorn",
    "app.main:app",
    "--host",
    "0.0.0.0",
    "--port",
    "8000"
]
```

---

# 12. Python Dependencies

ไฟล์:

```text
apps/api/requirements.txt
```

เริ่มต้นประมาณ:

```text
fastapi
uvicorn[standard]

sqlalchemy
psycopg[binary]

boto3

numpy
opencv-python-headless

onnxruntime
insightface

python-multipart

pydantic
pydantic-settings
```

ภายหลังสามารถเพิ่ม:

```text
alembic
redis
celery
```

สำหรับ background processing

---

# 13. FastAPI Entry Point

ไฟล์:

```text
apps/api/app/main.py
```

```python
from fastapi import FastAPI

app = FastAPI(
    title="AI Photo Finder API",
    version="0.1.0",
)


@app.get("/health")
async def health():
    return {
        "status": "ok"
    }
```

ทดสอบ:

```text
http://localhost:8000/health
```

ควรได้:

```json
{
  "status": "ok"
}
```

---

# 14. Next.js Dockerfile

ไฟล์:

```text
apps/web/Dockerfile
```

สำหรับ Development:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

ภายหลัง Production ค่อยเปลี่ยนเป็น multi-stage build

---

# 15. Environment

ไฟล์:

```text
.env.example
```

```env
POSTGRES_DB=photo_db
POSTGRES_USER=photo_user
POSTGRES_PASSWORD=photo_password

DATABASE_URL=postgresql://photo_user:photo_password@postgres:5432/photo_db

S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio_password
S3_BUCKET=photos

NEXT_PUBLIC_API_URL=http://localhost:8000
```

ห้าม commit:

```text
.env
```

---

# 16. Development Flow

Start:

```bash
docker compose up --build
```

ดู logs:

```bash
docker compose logs -f
```

เฉพาะ API:

```bash
docker compose logs -f api
```

หยุด:

```bash
docker compose down
```

หยุดและลบ database/storage:

```bash
docker compose down -v
```

---

# 17. Local Services

หลังจาก start:

```text
Next.js
http://localhost:3000

FastAPI
http://localhost:8000

FastAPI Swagger
http://localhost:8000/docs

PostgreSQL
localhost:5432

MinIO API
http://localhost:9000

MinIO Console
http://localhost:9001
```

---

# 18. Development Milestone

## Milestone 1 — Infrastructure

เป้าหมาย:

```text
[✓] Docker Compose
[✓] PostgreSQL
[✓] pgvector
[✓] MinIO
[✓] FastAPI
[✓] Next.js
```

Test:

```bash
docker compose ps
```

ทุก service ต้องขึ้น `running`

---

# Milestone 2 — Event

สร้าง Event:

```http
POST /events
```

Request:

```json
{
  "name": "Demo Event 2026",
  "description": "AI Photo Finder Test"
}
```

---

# Milestone 3 — Upload Photo

```http
POST /events/{event_id}/photos
```

Flow:

```text
Upload
 ↓
Validate MIME
 ↓
Validate Size
 ↓
Generate Photo ID
 ↓
Upload MinIO
 ↓
Create photos record
 ↓
status = PENDING
```

---

# Milestone 4 — Face Processing

```text
Photo
 ↓
Download from MinIO
 ↓
OpenCV
 ↓
Face Detection
 ↓
Crop Face
 ↓
Face Embedding
 ↓
Save faces
 ↓
status = PROCESSED
```

---

# Milestone 5 — Search

```http
POST /search
```

Request:

```text
multipart/form-data

file = selfie.jpg
```

Flow:

```text
Selfie
 ↓
Face Detection
 ↓
Embedding
 ↓
Vector Search
 ↓
Similarity Threshold
 ↓
Unique Photos
 ↓
Results
```

---

# Milestone 6 — Gallery

หน้า:

```text
/search
```

ตัวอย่าง:

```text
Found 17 photos

┌──────────┐ ┌──────────┐ ┌──────────┐
│          │ │          │ │          │
│ Photo 01 │ │ Photo 02 │ │ Photo 03 │
│          │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘

   96.2%        94.8%        92.7%
```

---

# 19. Processing Architecture

ใน MVP สามารถ process แบบ synchronous ได้:

```text
Upload
 ↓
API
 ↓
AI
 ↓
Database
 ↓
Response
```

แต่ Production ไม่ควรทำแบบนี้เมื่อมีรูปจำนวนมาก

ควรเปลี่ยนเป็น:

```text
Upload
 ↓
API
 ↓
MinIO
 ↓
Queue
 ↓
Worker
 ↓
Face AI
 ↓
PostgreSQL
```

เพิ่ม:

```text
Redis
```

และ worker:

```text
Celery / RQ / custom worker
```

---

# 20. Production-like Architecture

เมื่อ MVP ผ่านแล้ว:

```text
                    ┌─────────────┐
                    │   Next.js   │
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │   FastAPI   │
                    └──────┬──────┘
                           │
             ┌─────────────┼─────────────┐
             ↓             ↓             ↓
          Postgres       Redis          R2
          pgvector       Queue        Storage
                           │
                           ↓
                     AI Worker
                           │
                           ↓
                    Face Embedding
```

---

# 21. Database Relationship

```text
events
   │
   │ 1:N
   ↓
photos
   │
   │ 1:N
   ↓
faces
   │
   └── embedding
```

ตัวอย่าง:

```text
Event
  │
  ├── Photo 001
  │     ├── Face A
  │     └── Face B
  │
  ├── Photo 002
  │     └── Face A
  │
  └── Photo 003
        ├── Face A
        ├── Face B
        └── Face C
```

---

# 22. Security Requirements

ตั้งแต่ MVP ควรทำ:

* Validate MIME type
* จำกัด file size
* จำกัด image dimensions
* Randomize storage key
* ห้ามใช้ filename จาก user โดยตรง
* ไม่ expose MinIO credentials
* จำกัด API upload
* Validate image content
* Prevent path traversal
* จำกัดจำนวน upload
* ไม่ให้ user เข้าถึง PostgreSQL โดยตรง

Production เพิ่ม:

* Authentication
* Authorization
* Rate limiting
* Signed URLs
* Object lifecycle
* Audit logs
* Data deletion
* Consent / privacy management

---

# 23. Privacy

Face embedding ถือเป็นข้อมูลที่ต้องจัดการอย่างระมัดระวัง เพราะเกี่ยวข้องกับข้อมูลชีวมิติ

ระบบควรออกแบบให้:

```text
User Selfie
     ↓
Process
     ↓
Embedding
     ↓
Search
     ↓
ลบไฟล์ Query
```

ไม่ควรเก็บ selfie ของผู้ค้นหาโดยไม่จำเป็น

สำหรับ Event จริงควรกำหนด:

* วัตถุประสงค์การใช้
* ระยะเวลาเก็บข้อมูล
* การลบข้อมูล
* สิทธิ์การเข้าถึง
* การแจ้งผู้เข้าร่วม
* กระบวนการขอความยินยอมตามกรณีที่เกี่ยวข้อง

---

# 24. Testing Dataset

เริ่มต้น:

```text
10 people
×
10 photos/person
=
100 photos
```

จากนั้นเพิ่ม:

```text
100 people
×
50 photos/person
=
5,000 photos
```

และ Stress Test:

```text
1,000 people
×
100 photos/person
=
100,000 photos
```

วัด:

```text
Upload speed
Processing time
Embedding generation time
Search latency
Database query time
Memory usage
CPU usage
Storage usage
```

---

# 25. Acceptance Criteria

MVP ถือว่าสำเร็จเมื่อ:

```text
[ ] Docker Compose start ได้ทั้งหมด

[ ] PostgreSQL + pgvector ทำงาน

[ ] MinIO ทำงาน

[ ] Next.js เปิดได้

[ ] FastAPI เปิดได้

[ ] Upload รูปได้

[ ] รูปถูกเก็บใน MinIO

[ ] Photo metadata ถูกเก็บ PostgreSQL

[ ] AI ตรวจจับใบหน้าได้

[ ] AI สร้าง embedding ได้

[ ] Embedding ถูกเก็บ pgvector

[ ] Upload Selfie ได้

[ ] Search vector ได้

[ ] คืนรูปที่ match ได้

[ ] Gallery แสดงผลได้

[ ] ลบ Event แล้วข้อมูลที่เกี่ยวข้องถูกลบ

[ ] สามารถรันใหม่จาก clean environment ได้
```

---

# 26. Development Commands

Start:

```bash
docker compose up --build
```

Background:

```bash
docker compose up -d --build
```

Status:

```bash
docker compose ps
```

Logs:

```bash
docker compose logs -f
```

API logs:

```bash
docker compose logs -f api
```

Database shell:

```bash
docker compose exec postgres \
  psql -U photo_user -d photo_db
```

API shell:

```bash
docker compose exec api bash
```

Restart:

```bash
docker compose restart
```

Clean:

```bash
docker compose down -v
```

---

# 27. Development Roadmap

```text
PHASE 1
Infrastructure
        ↓
Docker
PostgreSQL
pgvector
MinIO
FastAPI
Next.js

        ↓

PHASE 2
Photo Management
        ↓
Event
Upload
Storage
Metadata

        ↓

PHASE 3
AI
        ↓
Face Detection
Face Embedding
Processing

        ↓

PHASE 4
Search
        ↓
Upload Selfie
Vector Search
Similarity
Results

        ↓

PHASE 5
UI
        ↓
Gallery
Preview
Download
Filter

        ↓

PHASE 6
Scale
        ↓
Redis
Worker
Queue
Thumbnail
Caching

        ↓

PHASE 7
Production
        ↓
Auth
Security
Privacy
Monitoring
Cloud Storage
```

---

# 28. Future Production Migration

Local:

```text
MinIO
```

สามารถเปลี่ยนเป็น:

```text
Cloudflare R2
```

โดย application ไม่ควรผูกกับ MinIO โดยตรง

ใช้ S3-compatible API:

```text
Local
        ↓
MinIO
        ↓
S3 API
```

Production:

```text
Cloudflare R2
        ↓
S3 API
```

ดังนั้น code ฝั่ง Storage สามารถใช้ service interface เดียวกันได้

```python
class StorageService:

    async def upload(...):
        ...

    async def delete(...):
        ...

    async def get_url(...):
        ...
```

ทำให้เปลี่ยน:

```text
MinIO → R2
```

ได้โดยไม่ต้องแก้ระบบส่วนอื่นมาก

---

# 29. Final Target

เป้าหมายสุดท้ายของ MVP:

```text
┌────────────────────────────────────────────┐
│              AI PHOTO FINDER              │
│                                            │
│      ค้นหารูปของคุณจากใบหน้า              │
│                                            │
│       ┌──────────────────────┐             │
│       │                      │             │
│       │    Upload Selfie     │             │
│       │                      │             │
│       └──────────────────────┘             │
│                                            │
│              [ 🔍 Search ]                 │
│                                            │
└────────────────────────────────────────────┘

                    ↓

              AI Processing

                    ↓

┌────────────────────────────────────────────┐
│ Found 17 photos                            │
│                                            │
│  [ IMG ]  [ IMG ]  [ IMG ]  [ IMG ]       │
│   96.2%    95.1%    93.8%    91.4%        │
│                                            │
│  [ IMG ]  [ IMG ]  [ IMG ]  [ IMG ]       │
│   90.8%    89.7%    88.3%    87.9%        │
│                                            │
└────────────────────────────────────────────┘
```

**เป้าหมายแรกไม่ใช่ทำระบบให้ใหญ่ แต่คือทำให้ pipeline นี้ทำงานครบก่อน:**

```text
Photo
 ↓
MinIO
 ↓
Face Detection
 ↓
Embedding
 ↓
pgvector
 ↓
Selfie
 ↓
Embedding
 ↓
Similarity Search
 ↓
Photo Result
```

เมื่อ pipeline นี้ผ่านแล้ว ค่อยต่อยอดเป็นระบบ Event Photo Platform เต็มรูปแบบ
