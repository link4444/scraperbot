FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=8000

# Install system dependencies required for Playwright and Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (chromium only to save space) and its dependencies
RUN playwright install chromium --with-deps

# Copy the rest of the application
COPY . .

# Expose the application port
EXPOSE 8000

# Run the FastAPI application
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
