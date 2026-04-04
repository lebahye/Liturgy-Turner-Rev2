FROM node:20-slim

# Install system dependencies including ffmpeg for audio conversion
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5001/ || exit 1

# Start command
CMD ["npm", "start"]
