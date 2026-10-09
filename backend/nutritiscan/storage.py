from pathlib import Path

import boto3


class DocumentStorage:
    def __init__(self, settings, cipher):
        self.cipher = cipher
        self.bucket = settings.s3_bucket
        self.root = Path(settings.object_dir)
        self.s3 = (
            boto3.client("s3", endpoint_url=settings.s3_endpoint)
            if self.bucket
            else None
        )

    def put(self, key, data, owner):
        encrypted = self.cipher.seal_bytes(data, owner)
        if self.s3:
            self.s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=encrypted,
                ContentType="application/octet-stream",
            )
        else:
            path = self.root / key
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            path.write_bytes(encrypted)
            path.chmod(0o600)

    def get(self, key, owner):
        data = (
            self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()
            if self.s3
            else (self.root / key).read_bytes()
        )
        return self.cipher.open_bytes(data, owner)

    def delete(self, key):
        if self.s3:
            self.s3.delete_object(Bucket=self.bucket, Key=key)
        else:
            (self.root / key).unlink(missing_ok=True)
