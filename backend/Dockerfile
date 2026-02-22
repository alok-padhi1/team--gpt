FROM python:3.11-slim

WORKDIR /app

# Install system deps for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Create data dir for SQLite
RUN mkdir -p /app/data

EXPOSE 8000

# Use PORT env var for Render compatibility
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
