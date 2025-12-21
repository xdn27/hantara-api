# Hantara API Dockerfile
# ElysiaJS API Server with Bun runtime

FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose API port
EXPOSE 3001

# Default: run API server
CMD ["bun", "run", "src/index.ts"]
