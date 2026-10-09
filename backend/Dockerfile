FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LANGCHAIN_TRACING_V2=false
WORKDIR /service
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY nutritiscan nutritiscan
RUN useradd --create-home --uid 10001 health && mkdir -p /service/.local && chown health:health /service/.local
USER health
EXPOSE 8000
CMD ["uvicorn", "nutritiscan.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
