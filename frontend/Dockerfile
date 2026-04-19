# ─── FRONTEND DOCKERFILE ─────────────────────────────────────────────────
# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (for caching)
COPY package.json package-lock.json* ./
RUN npm install

# Copy project files
COPY . .

# Set environment variables for build
# NOTE: Next.js needs these at build time if they are inlined
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the application
RUN npm run build

# Stage 2: Run
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000

# Copy necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 3000

# Start Next.js server
CMD ["npm", "start"]
