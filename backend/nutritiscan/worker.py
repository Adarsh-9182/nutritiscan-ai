from .config import Settings
from .jobs import celery, configure_jobs

configure_jobs(Settings.from_env())
app = celery
