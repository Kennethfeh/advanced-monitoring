# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /usr/src/app

# Copy package files first (for better caching)
COPY package*.json ./

# Create non-root user for security and install dependencies
RUN addgroup -g 1001 -S nodejs \
  && adduser -S nodejs -u 1001 \
  && npm ci --only=production

# Copy application code with proper ownership
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port 3000
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["npm", "start"] 
