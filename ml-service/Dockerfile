# TrustTrace ML inference container (works on Hugging Face Spaces Docker SDK, Render, Railway, Fly.io).
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TF_CPP_MIN_LOG_LEVEL=2 PORT=7860
RUN useradd -m -u 1000 app
WORKDIR /app
COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt
# Only the inference artifacts are copied (see .dockerignore). If models/siamese_mobilenetv2.keras is absent,
# set MODEL_DOWNLOAD_URL + MODEL_SHA256 and the service downloads/verifies it on first use.
COPY --chown=app:app app.py ./
COPY --chown=app:app models/ ./models/
USER app
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860}"]

