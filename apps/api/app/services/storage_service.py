"""S3-compatible object storage. Works with MinIO locally and Cloudflare R2 / AWS S3 in production."""

import logging
from contextvars import ContextVar
from functools import lru_cache
from urllib.parse import urlsplit, urlunsplit

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings

log = logging.getLogger(__name__)

# Browser-facing storage base for the current request (set by middleware in main.py).
public_base_var: ContextVar[str | None] = ContextVar("public_base", default=None)


@lru_cache(maxsize=16)
def _client(endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def with_path_prefix(url: str, prefix: str) -> str:
    """Insert a proxy path prefix. The proxy strips it again, so the S3 signature still matches."""
    if not prefix:
        return url
    u = urlsplit(url)
    return urlunsplit((u.scheme, u.netloc, prefix.rstrip("/") + u.path, u.query, u.fragment))


class StorageService:
    def __init__(self) -> None:
        self.bucket = settings.s3_bucket

    @property
    def _internal(self):
        return _client(settings.s3_endpoint)

    def ensure_bucket(self) -> None:
        try:
            self._internal.head_bucket(Bucket=self.bucket)
        except ClientError:
            log.info("Creating bucket %s", self.bucket)
            self._internal.create_bucket(Bucket=self.bucket)

    def ping(self) -> None:
        self._internal.head_bucket(Bucket=self.bucket)

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        self._internal.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def download(self, key: str) -> bytes:
        return self._internal.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def delete(self, *keys: str | None) -> None:
        objects = [{"Key": k} for k in keys if k]
        for i in range(0, len(objects), 1000):
            self._internal.delete_objects(Bucket=self.bucket, Delete={"Objects": objects[i : i + 1000]})

    def delete_prefix(self, prefix: str) -> None:
        paginator = self._internal.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            keys = [obj["Key"] for obj in page.get("Contents", [])]
            if keys:
                self.delete(*keys)

    def get_url(self, key: str, download_name: str | None = None) -> str:
        base = settings.s3_public_url or public_base_var.get() or settings.s3_direct_public_url
        parsed = urlsplit(base)
        endpoint = f"{parsed.scheme}://{parsed.netloc}"
        params = {"Bucket": self.bucket, "Key": key}
        if download_name:
            params["ResponseContentDisposition"] = f'attachment; filename="{download_name}"'
        url = _client(endpoint).generate_presigned_url(
            "get_object", Params=params, ExpiresIn=settings.presigned_url_ttl
        )
        return with_path_prefix(url, parsed.path)


storage = StorageService()


def photo_keys(event_id, photo_id) -> tuple[str, str]:
    base = f"events/{event_id}"
    return f"{base}/original/{photo_id}.jpg", f"{base}/thumbnails/{photo_id}.webp"


def event_prefix(event_id) -> str:
    return f"events/{event_id}/"
