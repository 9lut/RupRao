from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://photo_user:photo_password@localhost:5432/photo_db"
    redis_url: str = "redis://localhost:6379/0"

    # When served behind Caddy under /api (so Swagger at /api/docs works).
    api_root_path: str = ""

    # --- Admin auth ---
    admin_username: str = "admin"
    admin_password: str = ""
    auth_secret: str = ""
    auth_token_ttl_hours: int = 12

    # --- Object storage (any S3-compatible: MinIO locally, Cloudflare R2 / S3 in production) ---
    s3_endpoint: str = "http://localhost:9000"
    # Base URL the *browser* uses for presigned links. May include a path prefix that a reverse
    # proxy strips (e.g. https://photos.example.com/storage). Empty = derive from the request:
    # {proto}://{host}/storage behind Caddy, or s3_direct_public_url when called directly.
    s3_public_url: str = ""
    s3_direct_public_url: str = "http://localhost:9000"
    s3_access_key: str = "minio"
    s3_secret_key: str = "minio_password"
    s3_bucket: str = "photos"
    s3_region: str = "us-east-1"
    s3_auto_create_bucket: bool = True
    presigned_url_ttl: int = 3600

    # --- Face AI ---
    model_dir: str = "/app/models"
    face_model: str = "buffalo_l"
    face_det_size: int = 640  # selfies
    face_det_size_max: int = 1280  # large event photos get a larger detector input (small faces)
    face_min_det_score: float = 0.5
    face_min_size: int = 20

    # --- Uploads ---
    max_upload_mb: int = 20
    max_image_pixels: int = 50_000_000
    max_files_per_upload: int = 50
    thumbnail_size: int = 720

    # --- Storage ---
    storage_disk_path: str = "/storage-data"  # where the photo volume is mounted, to read disk free space
    storage_min_free_gb: float = 2  # refuse uploads below this, so Postgres never hits a full disk

    # --- Search ---
    search_default_threshold: float = 0.4
    search_max_results: int = 200
    # Face AI runs one inference per CPU core at a time; extra searches wait their turn (fair and
    # faster overall than every request fighting for the CPU) and give up with a 503 after this.
    face_concurrency: int = 0  # 0 = number of CPU cores
    search_queue_timeout: int = 45
    max_zip_photos: int = 100

    # --- Privacy / retention ---
    retention_days_default: int = 90
    cleanup_interval_minutes: int = 60

    # --- Rate limits (per client IP) ---
    # Per IP. At an event, a whole room shares one IP behind the venue Wi-Fi, so these are sized
    # for a crowd; they only stop scripts hammering the server. Logins stay strict.
    rate_search_per_minute: int = 120
    rate_search_per_day: int = 5000
    rate_login_per_minute: int = 5
    rate_access_per_minute: int = 600  # every request to a code-protected event counts
    rate_removal_per_hour: int = 60
    rate_zip_per_hour: int = 300
    rate_visitor_per_minute: int = 1200  # above this, visits simply stop being counted
    rate_public_per_minute: int = 6000  # all attendee API calls; one venue Wi-Fi is one IP, so this is high
    rate_queue_per_minute: int = 120

    # --- Wrong guesses. Only failures count, so normal use never reaches these. ---
    login_failures_per_ip: int = 30  # per hour
    login_failures_per_account: int = 20  # per 15 minutes, from anywhere
    code_failures_per_event: int = 20  # one IP on one event, per 15 minutes (a 4-digit code has 10,000 values)
    token_misses_per_ip: int = 60  # unknown share links, per 10 minutes

    # --- Scan queue ---
    scan_queue_max: int = 1000
    scan_ticket_idle_seconds: int = 30  # browser stopped asking (tab closed, phone locked)
    scan_turn_seconds: int = 60  # time to upload the selfie once at the front
    scan_default_seconds: float = 4  # until real searches give an average

    max_concurrent_zips: int = 4  # each one holds up to 100 originals on disk and in memory
    api_docs: bool = True  # Swagger at /docs; the public server turns it off


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
