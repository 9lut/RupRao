# ขึ้นระบบบน Google Cloud แบบละเอียด

คู่มือนี้พา RupRao ทั้งระบบ (Caddy, web, api, worker, Postgres, Redis, MinIO) ขึ้น Google Cloud ตั้งแต่สร้างเครื่อง ไปจนถึงผูกโดเมนผ่าน Cloudflare

**สารบัญ**
1. [เลือกวิธี](#1-เลือกวิธี)
2. [สเปคเครื่องและค่าใช้จ่าย](#2-สเปคเครื่องและค่าใช้จ่าย)
3. [เตรียมโปรเจกต์ GCP](#3-เตรียมโปรเจกต์-gcp)
4. [จอง Static IP](#4-จอง-static-ip)
5. [สร้างดิสก์ข้อมูล 100 GB และ VM](#5-สร้างดิสก์ข้อมูล-100-gb-และ-vm)
6. [SSH เข้าเครื่อง (4 วิธี)](#6-ssh-เข้าเครื่อง-4-วิธี)
7. [ติดตั้ง Docker และโค้ด](#7-ติดตั้ง-docker-และโค้ด)
8. [โดเมนและซับโดเมนผ่าน Cloudflare](#8-โดเมนและซับโดเมนผ่าน-cloudflare)
9. [ตั้งค่า `.env`](#9-ตั้งค่า-env)
10. [Docker Compose ทั้งชุด](#10-docker-compose-ทั้งชุด)
11. [เปิดระบบและตรวจสอบ](#11-เปิดระบบและตรวจสอบ)
12. [ย้ายข้อมูลจากเครื่องตัวเอง](#12-ย้ายข้อมูลจากเครื่องตัวเอง)
13. [สำรองข้อมูล](#13-สำรองข้อมูล)
14. [อัปเดต ขยายเครื่อง ประหยัดเครดิต](#14-อัปเดต-ขยายเครื่อง-ประหยัดเครดิต)
15. [ทางเลือก: เก็บรูปบน Cloud Storage หรือ Cloudflare R2](#15-ทางเลือก-เก็บรูปบน-cloud-storage-หรือ-cloudflare-r2)
16. [แก้ปัญหา](#16-แก้ปัญหา)

---

## 1. เลือกวิธี

| วิธี | เหมาะกับ | ข้อดี | ข้อเสีย |
|---|---|---|---|
| **A. VM + Docker Compose + ดิสก์ข้อมูล 100 GB** ⭐ | เริ่มต้น / งานทั่วไป | เหมือนรันในเครื่องตัวเองทุกอย่าง ย้ายง่าย ข้อมูลอยู่บนดิสก์แยก ลบ VM ข้อมูลก็ยังอยู่ | ดิสก์เต็มต้องขยายเอง (ทำได้ออนไลน์) |
| **B. แบบ A + เก็บรูปบน Google Cloud Storage** | รูปเยอะมาก หลายหมื่นรูป | พื้นที่ไม่จำกัด ไม่ต้องดูแลดิสก์ | ตั้งค่าเพิ่ม ค่าส่งข้อมูลออกเท่าเดิม |
| **C. แบบ A + เก็บรูปบน Cloudflare R2** | แขกโหลดรูปเยอะ | **ไม่มีค่าส่งข้อมูลออก** ฟรี 10 GB | ต้องมีบัญชี Cloudflare |
| **D. แบบไหนก็ได้ + Cloudflare Tunnel** | ไม่อยากเปิดพอร์ตหรือไม่อยากใช้ Static IP | ไม่ต้องเปิดพอร์ต 80/443 | เพิ่มอีกหนึ่ง container |

**ไม่แนะนำ** Cloud Run หรือ GKE เพราะ worker ต้องรันค้างไว้ตลอด และโมเดลใบหน้าใช้เวลาโหลดนาน ทำให้แพงและช้ากว่า VM เครื่องเดียว

คู่มือนี้ทำ **วิธี A** ก่อน ส่วน B/C/D อยู่ท้ายคู่มือ เพิ่มทีหลังได้ไม่ต้องติดตั้งใหม่

---

## 2. สเปคเครื่องและค่าใช้จ่าย

| | ขั้นต่ำ | แนะนำ |
|---|---|---|
| เครื่อง | `e2-medium` 2 vCPU, RAM 4 GB (+ swap 2 GB) | `e2-standard-2` 2 vCPU, RAM 8 GB |
| เหมาะกับ | อัปโหลดทีละไม่กี่ร้อยรูป แขกค้นหาพร้อมกันไม่มาก | อัปโหลดหลักพันรูประหว่างที่แขกค้นหาอยู่ |
| ดิสก์ระบบ (boot) | 30 GB Balanced | 30 GB Balanced |
| ดิสก์ข้อมูล | **100 GB Balanced** (Postgres + รูป + Docker image) | 100 GB ขึ้นไป |
| โซน | `asia-southeast1-b` (สิงคโปร์ ใกล้ไทย ping ~30 ms) | |

**ประมาณค่าใช้จ่ายต่อเดือนที่สิงคโปร์** (ราคาเปลี่ยนได้ ตรวจกับ [Pricing Calculator](https://cloud.google.com/products/calculator) อีกครั้ง)

| รายการ | ขั้นต่ำ | แนะนำ |
|---|---|---|
| VM | ~$30 | ~$60 |
| ดิสก์ระบบ 30 GB + ดิสก์ข้อมูล 100 GB (Balanced) | ~$14 | ~$14 |
| Static IP (ขณะผูกกับเครื่อง) | ~$3.6 | ~$3.6 |
| Snapshot สำรองรายวัน | ~$2–5 | ~$2–5 |
| **รวม** | **~$50** | **~$80** |
| ส่งข้อมูลออก (แขกโหลดรูป) | +~$0.12/GB | |

- เครดิตทดลอง $300 ใช้ได้ 90 วัน แบบขั้นต่ำอยู่ได้ครบ 90 วัน
- ถ้าอยากประหยัดดิสก์ ใช้ดิสก์ข้อมูลแบบ **Standard** (~$5/100 GB) แทน Balanced ได้ แต่ช้ากว่า เหมาะกับเก็บรูปมากกว่าฐานข้อมูล
- ดิสก์ 100 GB เก็บรูปได้ประมาณ **15,000–25,000 รูป** (กล้อง 24MP) ขยายดิสก์ทีหลังได้โดยไม่ต้องปิดเครื่อง ([ข้อ 14](#14-อัปเดต-ขยายเครื่อง-ประหยัดเครดิต))
- ใช้ระบบ **คัดรูปซ้ำและรูปไม่ดีก่อนอัปโหลด** ในหน้าแอดมินด้วย จะช่วยประหยัดพื้นที่ได้มาก

---

## 3. เตรียมโปรเจกต์ GCP

1. เข้า <https://console.cloud.google.com> แล้วกดรับ **Free trial** ($300)
2. มุมซ้ายบน → **New Project** → ตั้งชื่อเช่น `ruprao`
3. เมนู ☰ → **Compute Engine** → กด **Enable** แล้วรอ 1–2 นาที
4. **ตั้งงบเตือน (สำคัญมาก):** ☰ → Billing → **Budgets & alerts** → Create budget → ใส่ $50, $150, $250 และติ๊กให้ส่งอีเมล

ทุกคำสั่ง `gcloud` ในคู่มือนี้ รันใน **Cloud Shell** ได้เลย (ไอคอน `>_` มุมขวาบนของ Console) ไม่ต้องติดตั้งอะไรเพิ่ม หรือจะติดตั้ง [gcloud CLI](https://cloud.google.com/sdk/docs/install) ในเครื่องตัวเองก็ได้ เริ่มด้วย:

```bash
gcloud config set project ruprao
gcloud config set compute/region asia-southeast1
gcloud config set compute/zone asia-southeast1-b
```

---

## 4. จอง Static IP

IP ถาวรทำให้ที่อยู่เว็บไม่เปลี่ยนเวลารีสตาร์ตเครื่อง ระเบียน DNS และ QR ที่พิมพ์แจกไปแล้วจึงยังใช้ได้

```bash
gcloud compute addresses create ruprao-ip --region=asia-southeast1
gcloud compute addresses describe ruprao-ip --region=asia-southeast1 --format='value(address)'
```

จด IP ไว้ ตัวอย่างในคู่มือนี้ใช้ `34.87.12.34`

> **มี VM ที่ใช้ IP ชั่วคราวอยู่แล้ว?** แปลงเป็น IP ถาวรได้โดยไม่ต้องเปลี่ยนเลข:
> ```bash
> gcloud compute addresses create ruprao-ip --addresses=34.87.12.34 --region=asia-southeast1
> ```

ถ้าคลิกผ่าน Console: ☰ → VPC network → **IP addresses** → Reserve external static address → Region `asia-southeast1`

> IP ที่จองไว้แต่ไม่ได้ผูกกับเครื่องที่เปิดอยู่ก็ยังคิดเงิน ถ้าเลิกใช้ระบบแล้ว ให้ปล่อย IP คืนด้วย `gcloud compute addresses delete ruprao-ip`

---

## 5. สร้างดิสก์ข้อมูล 100 GB และ VM

แยกดิสก์ข้อมูลออกจากดิสก์ระบบ เพื่อให้ฐานข้อมูลและรูปทั้งหมดอยู่บนดิสก์ที่ขยาย สำรอง หรือย้ายไปเครื่องใหม่ได้ โดยไม่ต้องยุ่งกับตัวระบบ

```bash
# 5.1 ดิสก์ข้อมูล (ชื่อต้องเป็น ruprao-data สคริปต์ติดตั้งจะหาจากชื่อนี้)
#     ประหยัดสุด: pd-standard (~$5/100 GB) · เร็วกว่า: pd-balanced (~$11/100 GB)
gcloud compute disks create ruprao-data \
  --size=100GB --type=pd-standard --zone=asia-southeast1-b

# 5.2 VM (เปลี่ยน e2-medium เป็น e2-standard-2 ถ้าใช้สเปคแนะนำ)
gcloud compute instances create ruprao \
  --machine-type=e2-medium \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-balanced \
  --disk=name=ruprao-data,device-name=ruprao-data,mode=rw,auto-delete=no \
  --address=ruprao-ip \
  --tags=http-server,https-server

# 5.3 เปิดพอร์ตเว็บ
gcloud compute firewall-rules create allow-web \
  --allow=tcp:80,tcp:443 --target-tags=http-server,https-server
```

**ถ้าคลิกผ่าน Console:** Compute Engine → VM instances → **Create instance**
- **Machine configuration:** E2 → `e2-medium`, Region `asia-southeast1`, Zone `asia-southeast1-b`
- **OS and storage:** Boot disk → Change → Ubuntu **24.04 LTS** (x86/64), Balanced persistent disk, **30 GB**
- **OS and storage → Add new disk:** Name `ruprao-data`, Balanced, **100 GB**, Deletion rule = **Keep disk**, Device name `ruprao-data` (ใน Advanced)
- **Networking:** ติ๊ก **Allow HTTP traffic** และ **Allow HTTPS traffic** → Network interfaces → External IPv4 → เลือก `ruprao-ip`

> `auto-delete=no` / **Keep disk** ทำให้ลบ VM แล้วดิสก์ข้อมูลยังอยู่ เอาไปผูกกับเครื่องใหม่ได้ทันที

---

## 6. SSH เข้าเครื่อง (4 วิธี)

**วิธีที่ 1: ปุ่ม SSH บนเว็บ (ง่ายที่สุด)**
Compute Engine → VM instances → กดปุ่ม **SSH** ท้ายแถว `ruprao` จะเปิดหน้าต่างเทอร์มินัลในเบราว์เซอร์ อัปโหลดหรือดาวน์โหลดไฟล์ได้จากปุ่ม ⚙

**วิธีที่ 2: `gcloud compute ssh` (แนะนำ)**
```bash
gcloud compute ssh ruprao                          # ถ้าปิดพอร์ต 22 ตามวิธีที่ 4 แล้ว ให้เติม --tunnel-through-iap
```
ครั้งแรกจะสร้างคีย์และเพิ่มเข้าเครื่องให้อัตโนมัติ ส่งไฟล์ด้วย `gcloud compute scp ไฟล์ ruprao:~/`

**วิธีที่ 3: ssh ปกติด้วยคีย์ของตัวเอง (ใช้กับ VS Code / Termius ได้)**
```bash
# ในเครื่องตัวเอง
ssh-keygen -t ed25519 -f ~/.ssh/ruprao -C "you"
cat ~/.ssh/ruprao.pub          # คัดลอกบรรทัดนี้
```
Console → Compute Engine → **Metadata** → SSH Keys → Add item → วางบรรทัดที่คัดลอก (คำท้ายบรรทัดคือชื่อ user) แล้วเชื่อมต่อด้วย:
```bash
ssh -i ~/.ssh/ruprao you@34.87.12.34
```
ถ้าใช้ **VS Code Remote-SSH** ให้เพิ่มใน `~/.ssh/config`:
```
Host ruprao
  HostName 34.87.12.34
  User you
  IdentityFile ~/.ssh/ruprao
```

**วิธีที่ 4: ผ่าน IAP (ปลอดภัยที่สุด ไม่ต้องเปิดพอร์ต 22 ให้ทั้งโลก)**
```bash
gcloud compute firewall-rules create allow-ssh-iap --allow=tcp:22 --source-ranges=35.235.240.0/20
gcloud compute firewall-rules delete default-allow-ssh        # ปิด SSH จากทุกที่
gcloud compute ssh ruprao --tunnel-through-iap
```

> ถ้ายังไม่ใช้ IAP อย่างน้อยให้จำกัด SSH เฉพาะ IP ของคุณ:
> `gcloud compute firewall-rules update default-allow-ssh --source-ranges=<IP ของคุณ>/32`

---

## 7. ติดตั้ง Docker และโค้ด

SSH เข้าเครื่องแล้วรัน:

```bash
curl -fsSL https://raw.githubusercontent.com/9lut/RupRao/main/scripts/gcp-setup.sh | bash
```

สคริปต์ [scripts/gcp-setup.sh](../scripts/gcp-setup.sh) ทำสิ่งเหล่านี้ให้ (รันซ้ำได้ ไม่พัง):

| ขั้น | รายละเอียด |
|---|---|
| ดิสก์ข้อมูล | เจอดิสก์ `ruprao-data` → format ext4 (**เฉพาะดิสก์ว่าง**) → mount ที่ `/mnt/data` → ใส่ใน `/etc/fstab` |
| Docker | ติดตั้งจาก get.docker.com และตั้ง `data-root=/mnt/data/docker` ให้ image, ฐานข้อมูล และรูปอยู่บนดิสก์ 100 GB |
| Log | หมุนเวียน log ของ container 10 MB × 3 ไฟล์ |
| Swap | 2 GB, swappiness 10 |
| โค้ด | clone ไปที่ `/mnt/data/RupRao` (ลิงก์ไว้ที่ `~/RupRao`) และสร้าง `.env` จาก `.env.example` |

จากนั้น **exit แล้ว SSH เข้าใหม่** หนึ่งครั้ง เพื่อให้ใช้ `docker` ได้โดยไม่ต้อง sudo ตรวจสอบได้ด้วย:

```bash
df -h /mnt/data                 # ต้องเห็นขนาด ~98G
docker info | grep "Root Dir"   # ต้องเป็น /mnt/data/docker
```

<details>
<summary>อยากติดตั้งเองทีละคำสั่ง (ไม่ใช้สคริปต์)</summary>

```bash
# ดิสก์ข้อมูล
sudo mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/disk/by-id/google-ruprao-data   # ครั้งแรกเท่านั้น!
sudo mkdir -p /mnt/data && sudo mount -o discard,defaults /dev/disk/by-id/google-ruprao-data /mnt/data
echo "UUID=$(sudo blkid -s UUID -o value /dev/disk/by-id/google-ruprao-data) /mnt/data ext4 discard,defaults,nofail 0 2" | sudo tee -a /etc/fstab
sudo chown $USER:$USER /mnt/data

# Docker บนดิสก์ข้อมูล
sudo mkdir -p /etc/docker
echo '{"data-root":"/mnt/data/docker","log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# swap
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# โค้ด
git clone https://github.com/9lut/RupRao.git /mnt/data/RupRao && ln -s /mnt/data/RupRao ~/RupRao
cp ~/RupRao/.env.example ~/RupRao/.env
```
</details>

---

## 8. โดเมนและซับโดเมนผ่าน Cloudflare

### 8.1 ย้าย DNS ของโดเมนมาที่ Cloudflare

1. สมัคร <https://dash.cloudflare.com> → **Add a domain** → ใส่ `example.com` → เลือกแพ็กเกจ **Free**
2. Cloudflare จะให้ nameserver 2 ตัว (เช่น `ada.ns.cloudflare.com`) → ไปที่เว็บที่ซื้อโดเมน แล้วเปลี่ยน nameserver เป็น 2 ตัวนี้
3. รอสถานะ **Active** (ไม่กี่นาทีถึง 24 ชม.)

### 8.2 สร้างซับโดเมน

**DNS → Records → Add record:**

| Type | Name | Content | ใช้ทำอะไร |
|---|---|---|---|
| A | `photos` | `34.87.12.34` | เว็บหลัก `photos.example.com` |
| A | `www.photos` | `34.87.12.34` | (ไม่บังคับ) redirect ไปเว็บหลัก |
| A | `s3.photos` | `34.87.12.34` | (ไม่บังคับ) หน้า MinIO console |
| A | `gf7` | `34.87.12.34` | (ไม่บังคับ) ชื่อเว็บเพิ่มสำหรับงานหรือสปอนเซอร์ |

ทั้งระบบใช้แค่ **ชื่อเดียว** (เว็บ, `/api` และ `/storage` อยู่ใต้ชื่อเดียวกัน) ซับโดเมนอื่นเพิ่มเมื่ออยากใช้เท่านั้น

### 8.3 เลือกโหมด Proxy (สำคัญ)

| | **แบบ 1: DNS only** ☁️ เทา (แนะนำให้เริ่มด้วยแบบนี้) | **แบบ 2: Proxied** 🟠 ส้ม |
|---|---|---|
| ใบรับรอง HTTPS | Caddy ขอจาก Let's Encrypt เอง | Cloudflare Origin Certificate (อายุ 15 ปี) |
| ซ่อน IP เครื่อง / กันโจมตี DDoS | ✗ | ✓ |
| อัปโหลดต่อครั้ง | ไม่จำกัด | ≤ 100 MB (ระบบแบ่งส่งให้อัตโนมัติแล้ว) |
| ตั้งค่า | ง่าย | เพิ่มอีก 4 ขั้น |

**แบบ 1: DNS only**
- ระเบียน DNS ตั้งเป็นเมฆสีเทา (DNS only)
- ใน `.env`:
  ```ini
  SITE_ADDRESS=photos.example.com
  CADDY_TLS=you@example.com
  ```

**แบบ 2: Proxied**
1. ระเบียน DNS ตั้งเป็นเมฆสีส้ม (Proxied)
2. **SSL/TLS → Overview → Full (strict)**
3. **SSL/TLS → Origin Server → Create Certificate** → ใส่ hostname `example.com, *.example.com` → อายุ 15 ปี → Create
   - บันทึก "Origin Certificate" เป็นไฟล์ `infra/caddy/certs/origin.pem`
   - บันทึก "Private key" เป็นไฟล์ `infra/caddy/certs/origin.key` (บน VM ใช้ `nano`)
   - ไฟล์ทั้งสอง git จะไม่เก็บอยู่แล้ว
4. ใน `.env`:
   ```ini
   SITE_ADDRESS=photos.example.com
   CADDY_TLS=/etc/caddy/certs/origin.pem /etc/caddy/certs/origin.key
   ```
5. ให้ระบบเห็น IP จริงของแขก (ใช้จำกัดจำนวนครั้งการค้นหา) โดยใส่ช่วง IP ของ Cloudflare:
   ```bash
   cd ~/RupRao
   echo "TRUSTED_PROXIES=$( { curl -s https://www.cloudflare.com/ips-v4; echo; curl -s https://www.cloudflare.com/ips-v6; } | tr '\n' ' ')" >> .env
   ```
6. (แนะนำ) **Caching → Cache Rules →** Create rule: URI Path starts with `/api/` **หรือ** `/storage/` → **Bypass cache**
7. (ไม่บังคับ) ปิดพอร์ต 80/443 ให้รับเฉพาะ Cloudflare:
   ```bash
   gcloud compute firewall-rules update allow-web \
     --source-ranges=$(curl -s https://www.cloudflare.com/ips-v4 | paste -sd,)
   ```

> **กัน DDoS:** ตัวแอปจำกัดการเดารหัสและการยิงจาก IP เดียวได้ แต่รับปริมาณมหาศาลจากหลาย IP ไม่ได้ ต้องใช้แบบ 2 และปิดพอร์ต 80/443 ให้รับเฉพาะ Cloudflare (ขั้น 7) ใบรับรองฟรีของ Cloudflare ครอบคลุมซับโดเมนแค่ชั้นเดียว ชื่อแบบ `ruprao.guidance.example.com` จะเปิดเมฆส้มไม่ได้ ต้องใช้ชื่อชั้นเดียว เช่น `ruprao.example.com`
>
> **ทำไมแบบ 2 ไม่ใช้ Let's Encrypt?** เพราะตอนเปิด proxy การขอใบรับรองครั้งแรกมักติด redirect ของ Cloudflare ใบรับรอง Origin ใช้ได้ 15 ปีและไม่มีปัญหานี้

### 8.4 ใช้ซับโดเมนเพิ่ม (Caddy)

ก๊อปไฟล์ตัวอย่างใน [infra/caddy/sites/](../infra/caddy/sites/) โดยตัด `.example` ท้ายชื่อออก แก้ชื่อโดเมน แล้วรีสตาร์ต Caddy:

```bash
cd ~/RupRao/infra/caddy/sites
cp redirect-www.caddy.example redirect-www.caddy          # www.photos → photos
cp second-event-domain.caddy.example gf7.caddy            # เว็บเดียวกันอีกชื่อ
nano gf7.caddy                                            # แก้ชื่อโดเมน
cd ~/RupRao && docker compose restart caddy
```

> หน้า MinIO console (`minio-console.caddy.example`) ใช้รหัส root ของ MinIO เข้าระบบ เปิดเฉพาะเมื่อตั้งรหัสแข็งแรงแล้ว หรือใช้ผ่าน SSH tunnel แทน: `gcloud compute ssh ruprao --tunnel-through-iap -- -L 9001:localhost:9001` แล้วเปิด <http://localhost:9001>

### 8.5 ยังไม่มีโดเมน

ใช้ `34-87-12-34.sslip.io` ได้ทันที ไม่ต้องตั้ง DNS: `SITE_ADDRESS=34-87-12-34.sslip.io`, `CADDY_TLS=you@example.com` เปลี่ยนเป็นโดเมนจริงทีหลังได้ แต่ QR ที่พิมพ์ไปแล้วจะชี้ไปที่ชื่อเดิม

---

## 9. ตั้งค่า `.env`

```bash
cd ~/RupRao && nano .env
```

ตัวอย่างสำหรับเครื่องจริง (ค่าที่ไม่ได้เขียนไว้ใช้ค่าเดิมจาก `.env.example`):

```ini
# ---- ที่อยู่เว็บ ----
SITE_ADDRESS=photos.example.com
CADDY_TLS=you@example.com                      # Cloudflare แบบ 2: /etc/caddy/certs/origin.pem /etc/caddy/certs/origin.key
# TRUSTED_PROXIES=...                          # Cloudflare แบบ 2 เท่านั้น (ข้อ 8.3)

# ---- แอดมินใหญ่ ----
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<รหัสยาว 20 ตัวขึ้นไป>
AUTH_SECRET=<openssl rand -hex 32>

# ---- ฐานข้อมูล (รหัสต้องตรงกันทั้งสองบรรทัด) ----
POSTGRES_PASSWORD=<openssl rand -hex 16>
DATABASE_URL=postgresql+psycopg://photo_user:<รหัสเดียวกัน>@postgres:5432/photo_db

# ---- ที่เก็บรูป MinIO (รหัสต้องตรงกันทั้งสองบรรทัด) ----
MINIO_ROOT_PASSWORD=<openssl rand -hex 16>
S3_SECRET_KEY=<รหัสเดียวกัน>

# ---- ความเป็นส่วนตัว ----
RETENTION_DAYS_DEFAULT=90
```

สร้างรหัสสุ่มได้ด้วย `openssl rand -hex 32`

> ตั้งรหัส Postgres และ MinIO **ก่อนเปิดระบบครั้งแรก** เพราะทั้งสองจะจำรหัสแรกไว้ ถ้าเปลี่ยนทีหลังต้องเปลี่ยนในตัวฐานข้อมูลด้วย

---

## 10. Docker Compose ทั้งชุด

> **ทำไมใช้ Caddy ไม่ใช้ Nginx?**
> - **HTTPS อัตโนมัติ**: Caddy ขอและต่ออายุใบรับรอง Let's Encrypt เอง ส่วน Nginx ต้องติดตั้ง certbot และตั้ง cron ต่ออายุเพิ่ม
> - **ใบรับรองในเครื่อง** (`tls internal`) ทำให้ทดสอบกล้องผ่าน HTTPS บนมือถือในวง Wi-Fi ได้ ซึ่ง Nginx ทำเองไม่ได้
> - **ตั้งค่าสั้น อ่านง่าย**: [infra/caddy/Caddyfile](../infra/caddy/Caddyfile) ทั้งไฟล์ไม่ถึง 70 บรรทัด และอ่านค่าจาก `.env` ได้ตรง ๆ
> - ได้ HTTP/2, HTTP/3 และค่าความปลอดภัยที่ดีเป็นค่าเริ่มต้น
>
> Nginx เร็วกว่าเล็กน้อยเมื่อโหลดสูงมาก ๆ และคนคุ้นเคยมากกว่า แต่ระบบนี้คอขวดอยู่ที่ AI สแกนใบหน้า ไม่ใช่ตัว proxy ถ้าอยากเปลี่ยนเป็น Nginx ทีหลังก็ทำได้ ต้องเขียนเส้นทาง `/api` → api, `/storage` → minio, `/` → web และตั้ง certbot เอง

บนเครื่องจริงจะใช้ 2 ไฟล์ซ้อนกันเสมอ:

```bash
docker compose -f docker-compose.yml -f docker-compose.gcp.yml <คำสั่ง>
```

พิมพ์ยาว ตั้งชื่อย่อไว้ครั้งเดียว:

```bash
echo "alias dc='docker compose -f docker-compose.yml -f docker-compose.gcp.yml'" >> ~/.bashrc && source ~/.bashrc
```

### 10.1 `docker-compose.yml`: บริการทั้งหมด

| Service | Image | หน้าที่ | พอร์ต |
|---|---|---|---|
| `caddy` | caddy:2-alpine | ทางเข้าเดียว: HTTPS, `/` → web, `/api` → api, `/storage` → minio | **80, 443** (สาธารณะ) |
| `web` | build `apps/web` | หน้าเว็บ Next.js | ภายใน 3000 |
| `api` | build `apps/api` | FastAPI + ค้นหาใบหน้า, รัน migration ฐานข้อมูลตอนเริ่ม | 127.0.0.1:8000 |
| `worker` | (image เดียวกับ api) | สแกนใบหน้ารูปที่อัปโหลด (เพิ่มได้ด้วย `--scale worker=2`) | – |
| `postgres` | pgvector/pgvector:pg16 | ข้อมูลอีเวนต์ + เวกเตอร์ใบหน้า | ภายใน |
| `redis` | redis:7-alpine | คิวงาน + จำกัดจำนวนครั้ง | ภายใน |
| `minio` | chainguard/minio | เก็บไฟล์รูป (แบบ S3) | ภายใน |

Volume ที่เก็บข้อมูล (อยู่บนดิสก์ 100 GB เพราะ `data-root=/mnt/data/docker`): `postgres-data`, `minio-data`, `redis-data`, `caddy-data` (ใบรับรอง HTTPS)
โฟลเดอร์ที่ mount จากโค้ด: `data/models` (โมเดลใบหน้า), `backups/`, `infra/caddy/{Caddyfile,sites,certs}`

### 10.2 `docker-compose.gcp.yml`: ปรับสำหรับเครื่องจริง

ไฟล์นี้ ([docker-compose.gcp.yml](../docker-compose.gcp.yml)) ทับค่าบางอย่างของไฟล์หลัก:

| ปรับอะไร | ค่า | ทำไม |
|---|---|---|
| จำกัด RAM | api 1.4 GB, worker 1.2 GB, postgres/minio 384 MB, web 256 MB, redis 128 MB | ตัวไหนหน่วยความจำรั่วจะไม่ลากทั้งเครื่องล่ม |
| `OMP_NUM_THREADS` | 2 | ให้ AI ใช้เท่าจำนวน vCPU จริง |
| Log | 10 MB × 3 ต่อ container | ดิสก์ไม่เต็ม |
| พอร์ต Postgres / MinIO | ไม่ผูกกับเครื่อง | เข้าได้ทางเดียวคือผ่าน Caddy |
| Redis | จำกัด 96 MB | คิวใช้น้อยมาก |

> ถ้าใช้ **e2-standard-2 (8 GB)** เพิ่ม `mem_limit` ของ api เป็น `2500m` และ worker เป็น `2000m` ได้ แล้วเพิ่ม worker เป็น 2 ตัว: `dc up -d --scale worker=2`

### 10.3 คำสั่งที่ใช้บ่อย

```bash
dc up -d --build          # เปิด / อัปเดตทั้งระบบ
dc ps                     # สถานะ
dc logs -f api worker     # ดู log (Ctrl+C ออก)
dc restart caddy          # หลังแก้ Caddyfile หรือ sites/
dc down                   # ปิดทั้งหมด (ข้อมูลยังอยู่)
docker stats              # RAM/CPU ของแต่ละ container
```

---

## 11. เปิดระบบและตรวจสอบ

```bash
cd ~/RupRao
dc up -d --build          # ครั้งแรก build ใช้ประมาณ 5–10 นาที
dc logs -f api caddy      # รอจนเห็น "Face model ready" และ "certificate obtained"
```

ทดสอบ:
- `https://photos.example.com` เปิดได้ มีกุญแจ 🔒 และใช้กล้องในมือถือได้
- `https://photos.example.com/admin` เข้าด้วยบัญชีแอดมินใหญ่จาก `.env` แล้วสร้างบัญชีผู้จัดงานได้ที่เมนู "ผู้จัดงาน"
- `curl -s localhost:8000/health` บน VM ต้องได้ `"status":"ok"`

> ถ้าไม่อยากรอโหลดโมเดล (~300 MB) ตอนเริ่มครั้งแรก ส่งจากเครื่องตัวเองขึ้นไปก่อนได้:
> `gcloud compute scp --recurse data/models ruprao:~/RupRao/data/`

---

## 12. ย้ายข้อมูลจากเครื่องตัวเอง (ไม่บังคับ)

ถ้าจะเริ่มเซิร์ฟเวอร์จากข้อมูลว่าง ข้ามข้อนี้ได้เลย ถ้าอยากยกข้อมูลในเครื่องตัวเองขึ้นไปทั้งหมด (อีเวนต์ บัญชีผู้จัดงาน ข้อมูลใบหน้า รูป และโมเดล) ทำได้ผ่าน SSH ด้วยคำสั่งเดียว

ในเครื่องตัวเอง เปิด Git Bash ที่โฟลเดอร์โปรเจกต์ แล้วรัน:

```bash
bash scripts/push-to-server.sh you@34.87.12.34 -i ~/.ssh/ruprao
```

สคริปต์ [scripts/push-to-server.sh](../scripts/push-to-server.sh) จะสำรองข้อมูลในเครื่อง ส่งไปที่ `~/RupRao/backups/` ส่งโมเดล (ถ้าเซิร์ฟเวอร์ยังไม่มี) แล้วกู้ข้อมูลบนเซิร์ฟเวอร์ ซึ่งจะ**แทนที่**ข้อมูลเดิมบนเซิร์ฟเวอร์ ใส่ `IMAGES=1` ข้างหน้า เพื่อส่ง Docker image ที่ build แล้วไปด้วย

ถ้าอยากทำเองทีละขั้น:

```bash
bash scripts/backup.sh                                              # ในเครื่องตัวเอง → backups/<เวลา>/
gcloud compute scp --recurse backups/<เวลา> ruprao:~/RupRao/backups/
gcloud compute ssh ruprao --tunnel-through-iap --command "cd ~/RupRao && RESTORE_CONFIRM=restore bash scripts/restore.sh backups/<เวลา>"
```

---

## 13. สำรองข้อมูล

**13.1 สำรองทุกคืนบนเครื่อง** (เก็บ 7 ชุดล่าสุดใน `~/RupRao/backups`):
```bash
(crontab -l 2>/dev/null; echo "0 3 * * * cd ~/RupRao && bash scripts/backup.sh >> backups/cron.log 2>&1") | crontab -
```

**13.2 Snapshot ดิสก์ข้อมูลรายวัน** (กันเครื่องพังทั้งเครื่อง):
```bash
gcloud compute resource-policies create snapshot-schedule daily-ruprao \
  --region=asia-southeast1 --daily-schedule --start-time=19:00 --max-retention-days=7
gcloud compute disks add-resource-policies ruprao-data --resource-policies=daily-ruprao --zone=asia-southeast1-b
```

**13.3 (ไม่บังคับ) ส่งชุดสำรองออกนอกเครื่องไป Cloud Storage:**
```bash
gcloud storage buckets create gs://ruprao-backups-<ชื่อไม่ซ้ำ> --location=asia-southeast1
# ใน crontab เพิ่มต่อจาก backup.sh:
# && gcloud storage rsync -r ~/RupRao/backups gs://ruprao-backups-<ชื่อไม่ซ้ำ>
```
(ต้องให้ VM มีสิทธิ์ Storage: ปิดเครื่อง → Edit → Access scopes → Storage = Read Write)

---

## 14. อัปเดต ขยายเครื่อง ประหยัดเครดิต

**อัปเดตโค้ด**

โค้ดไหลทางเดียว: **เครื่องคุณ → GitHub → เซิร์ฟเวอร์** เซิร์ฟเวอร์ดึงจาก GitHub เสมอ จึงต้อง push ขึ้น GitHub ก่อน

```bash
# 1) ในเครื่องตัวเอง: commit แล้ว push
git add -A && git commit -m "อธิบายสิ่งที่แก้" && git push

# 2) สั่งเซิร์ฟเวอร์ดึงโค้ดใหม่และ build เฉพาะส่วนที่เปลี่ยน (คำสั่งเดียว)
bash scripts/deploy.sh                                   # ผ่าน gcloud
bash scripts/deploy.sh you@34.87.12.34 -i ~/.ssh/ruprao  # หรือ ssh ปกติ
```

[scripts/deploy.sh](../scripts/deploy.sh) จะ `git pull` แล้ว `up -d --build` บนเซิร์ฟเวอร์
- ข้อมูลไม่หาย และ migration ฐานข้อมูลรันเองตอน api เริ่ม
- ระหว่าง build เว็บยังเปิดได้ จะสะดุดแค่ไม่กี่วินาทีตอนสลับ container
- ถ้าแก้แค่หน้าเว็บ จะ build ใหม่แค่ web ใช้ประมาณ 1–2 นาที
- ถ้าแก้ `requirements.txt` ฝั่ง api จะนานขึ้น

ถ้าอัปเดตแล้วพัง ย้อนกลับได้โดยไม่ต้องแก้โค้ด:
```bash
gcloud compute ssh ruprao --tunnel-through-iap --command "cd ~/RupRao && git log --oneline -5"          # ดูเวอร์ชันก่อนหน้า
gcloud compute ssh ruprao --tunnel-through-iap --command "cd ~/RupRao && git checkout <commit> && docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d --build"
```
(กลับมาใช้เวอร์ชันล่าสุดด้วย `git checkout main` แล้ว deploy อีกครั้ง)

**ขยายดิสก์ข้อมูล** (ไม่ต้องปิดเครื่อง):
```bash
gcloud compute disks resize ruprao-data --size=200GB --zone=asia-southeast1-b   # รันใน Cloud Shell
sudo resize2fs /dev/disk/by-id/google-ruprao-data                               # รันบน VM
```

**เปลี่ยนสเปคเครื่อง** (เช่นช่วงอัปโหลดรูปเยอะ ใช้ประมาณ 1 นาที):
```bash
gcloud compute instances stop ruprao
gcloud compute instances set-machine-type ruprao --machine-type=e2-standard-4
gcloud compute instances start ruprao        # ระบบเปิดเองทั้งหมด (restart: unless-stopped)
```

**ปิดเครื่องช่วงไม่มีงาน:** ตอนปิดเสียแค่ค่าดิสก์และ IP (~$20/เดือน) แทน ~$50
```bash
gcloud compute instances stop ruprao     # หลังงานจบ
gcloud compute instances start ruprao    # ก่อนงานเริ่ม
```

---

## 15. ทางเลือก: เก็บรูปบน Cloud Storage หรือ Cloudflare R2

ระบบคุยกับที่เก็บรูปแบบ S3 อยู่แล้ว เปลี่ยนจาก MinIO ได้โดยแก้แค่ `.env` (รูปเดิมใน MinIO ต้องย้ายเองด้วย `mc mirror` หรือเริ่มใหม่)

**Google Cloud Storage (วิธี B)**
1. สร้าง bucket:
   ```bash
   gcloud storage buckets create gs://ruprao-photos-<ชื่อไม่ซ้ำ> --location=asia-southeast1 --uniform-bucket-level-access
   ```
2. Console → Cloud Storage → **Settings → Interoperability** → Create a key for a service account → ได้ Access key และ Secret
3. ใน `.env`:
   ```ini
   S3_ENDPOINT=https://storage.googleapis.com
   S3_PUBLIC_URL=https://storage.googleapis.com
   S3_ACCESS_KEY=<HMAC access key>
   S3_SECRET_KEY=<HMAC secret>
   S3_BUCKET=ruprao-photos-<ชื่อไม่ซ้ำ>
   S3_REGION=auto
   S3_AUTO_CREATE_BUCKET=false
   ```

**Cloudflare R2 (วิธี C · ไม่มีค่าส่งข้อมูลออก)**
1. Cloudflare → **R2** → Create bucket `ruprao-photos`
2. **Manage R2 API Tokens** → Create token (Object Read & Write เฉพาะ bucket นี้)
3. ใน `.env`:
   ```ini
   S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
   S3_PUBLIC_URL=https://<account_id>.r2.cloudflarestorage.com
   S3_ACCESS_KEY=<access key id>
   S3_SECRET_KEY=<secret access key>
   S3_BUCKET=ruprao-photos
   S3_REGION=auto
   S3_AUTO_CREATE_BUCKET=false
   ```

ทั้งสองแบบใช้ `dc up -d` ตามปกติ (MinIO จะเปิดอยู่แต่ไม่ได้ใช้ ลบออกจาก compose ได้) ดิสก์ข้อมูลจะเหลือแค่ฐานข้อมูลกับ Docker image จึงลดเหลือ 30–50 GB ได้

**Cloudflare Tunnel (วิธี D):** Cloudflare → Zero Trust → Networks → **Tunnels** → Create → Docker → คัดลอก token แล้วรันบน VM:
```bash
docker run -d --name cloudflared --restart unless-stopped --network ai-photo-finder_ai-photo-network \
  cloudflare/cloudflared:latest tunnel run --token <TOKEN>
```
ใน Cloudflare ตั้ง Public hostname `photos.example.com` → Service **HTTP** `caddy:80` แล้วใน `.env` ตั้ง:
```ini
SITE_ADDRESS=http://photos.example.com     # Cloudflare ทำ HTTPS ให้ Caddy รับแค่ HTTP ภายใน
TRUSTED_PROXIES=private_ranges             # เชื่อ header จาก cloudflared (IP จริงของแขก, https)
```
แล้ว `dc up -d` แบบนี้ไม่ต้องเปิดพอร์ต 80/443 (ลบ rule `allow-web` ได้) และไม่ต้องมี Static IP

---

## 16. แก้ปัญหา

| อาการ | ตรวจ / แก้ |
|---|---|
| เบราว์เซอร์เตือนใบรับรอง | `dc logs caddy` · แบบ 1: พอร์ต 80 ต้องเปิด และ DNS ต้องเป็นเมฆเทา · แบบ 2: SSL ต้องเป็น Full (strict) และไฟล์ origin.pem/key ต้องถูกที่ |
| Cloudflare ขึ้น Error 521/522 | firewall ไม่เปิด 80/443 หรือ Caddy ไม่ทำงาน (`dc ps`) |
| Cloudflare ขึ้น Error 525/526 | SSL mode ไม่ตรงกับใบรับรอง: แบบ 2 ต้องใช้ Origin Certificate + Full (strict) |
| อัปโหลดไม่ผ่าน 413 | ไฟล์เดียวใหญ่เกิน 50 MB (ตั้ง `MAX_UPLOAD_MB`) · รูปใหญ่กว่า 6000px ถูกย่อเก็บ (ตั้ง `MAX_PHOTO_SIDE`, 0 = เก็บเต็ม) |
| api รีสตาร์ตวน | `dc logs api`, `free -h` · RAM ไม่พอ: ตรวจ swap (`swapon --show`) หรือขยายเครื่อง |
| `/mnt/data` หายหลังรีบูต | `cat /etc/fstab` ต้องมีบรรทัด UUID ของดิสก์ · รัน `sudo mount -a` |
| ดิสก์ใกล้เต็ม | ดูได้ที่เมนู "ภาพรวม" ของแอดมินใหญ่ (ระบบหยุดรับรูปเมื่อเหลือน้อยกว่า `STORAGE_MIN_FREE_GB`, ค่าเริ่มต้น 2 GB) · `df -h /mnt/data`, `docker system df` · ลบ image เก่า `docker image prune -a` · ขยายดิสก์ (ข้อ 14) |
| ค้นหาโดนจำกัดทั้งที่ใช้น้อย (หลัง Cloudflare) | ยังไม่ได้ตั้ง `TRUSTED_PROXIES` (ข้อ 8.3 ขั้น 5) |
