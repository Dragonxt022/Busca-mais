FROM node:20-alpine

# Install Playwright dependencies
RUN apk add --no-cache \
    antiword \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl

# Set Playwright to use system chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src
COPY migrations ./migrations

# Create screenshots directory
RUN mkdir -p /app/screenshots

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "src/index.js"]
