# Multi-stage build for Node.js + Python OR-Tools
FROM node:22-slim

# Install Python and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY requirements.txt ./

# Install Node.js dependencies
RUN npm install

# Install Python dependencies (OR-Tools) - Override system protection
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start the Render-specific application with CelikHasir endpoints
CMD ["node", "index_render_celik_hasir.js"]