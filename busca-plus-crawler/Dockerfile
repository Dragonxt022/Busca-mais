FROM node:20-alpine

# Install Playwright dependencies and postgresql-client for healthcheck
RUN apk add --no-cache \
    antiword \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl \
    postgresql-client

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
COPY seeders ./seeders
COPY .sequelizerc ./

# Create screenshots directory
RUN mkdir -p /app/screenshots

# Copy and set up entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "src/index.js"]
