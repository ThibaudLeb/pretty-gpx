
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    fftw3-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    numpy \
    matplotlib \
    gpxpy \
    pycairo \
    pillow \
    reportlab

# Copy the Pretty GPX Python scripts
COPY scripts/ /app/scripts/

# Create a simple API server to accept GPX files and options
COPY api.py /app/

EXPOSE 8080

CMD ["python", "api.py"]
